import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { AIEngine } from './services/aiEngine';
import { FileSystem } from './services/fileSystem';
import { NarrativeEntry, UpdateItem } from './types';
import Sidebar from './components/Sidebar';
import { MapPanelHandle } from './components/MapPanel';
import NarrativeWindow from './components/NarrativeWindow';
import InputArea from './components/InputArea';
import Modal from './components/Modal';
import MainMenu from './components/MainMenu';
import { MultiplayerService } from './services/multiplayer';
import { SuggestionGenerator } from './services/suggestionGenerator';
import WelcomePage from './components/WelcomePage';
import AuthModal from './components/AuthModal';
import GuestNameModal from './components/GuestNameModal';
import MarketModal from './components/MarketModal';
import ActionLimitModal from './components/ActionLimitModal';
import GuestWelcomeModal from './components/GuestWelcomeModal';
import AdventuresModal from './components/AdventuresModal';
import CommunityAdventuresModal from './components/CommunityAdventuresModal';
import AccountModal from './components/AccountModal';
import GoldenName from './components/GoldenName';
import {
  UserProfile,
  subscribeToAuth,
  logOut,
  getOrCreateGuestId,
  generateUniqueGuestMultiplayerName
} from './services/authService';
import { ActionLimitService, ActionStatus } from './services/actionLimitService';
import { SavedAdventure, CommunityAdventure } from './services/adventuresService';
import { Compass, User, LogIn, LogOut as LogOutIcon, ShoppingCart, Bookmark, Globe, Zap, Crown } from 'lucide-react';

// Instantiate services outside component to persist across re-renders
const fileSystem = new FileSystem();
const aiEngine = new AIEngine(fileSystem);

/**
 * Extracts a display-ready timestamp from WorldTime.txt content,
 * supporting both the temporal displacement schema and legacy flat timestamps.
 */
function parseActiveWorldTime(rawTime: string | null): string {
  if (!rawTime) return '';
  const activeBlockMatch = rawTime.match(/\[CURRENT ACTIVE TIME\][\s\S]*?Timestamp:\s*([^\n\r]+)/i);
  if (activeBlockMatch && activeBlockMatch[1]) {
    return activeBlockMatch[1].trim();
  }
  const fallbackMatch = rawTime.match(/\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?\s*-\s*[A-Za-z]+\s+\d{1,2},\s*\d{4}/i);
  if (fallbackMatch) {
    return fallbackMatch[0].trim();
  }
  return rawTime.trim().split('\n')[0] || '';
}

function App() {
  const [narrative, setNarrative] = useState<NarrativeEntry[]>(() => {
    try {
      const saved = localStorage.getItem('aimud_narrative');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [files, setFiles] = useState<string[]>([]);
  const [updates, setUpdates] = useState<UpdateItem[]>(() => {
    try {
      const saved = localStorage.getItem('aimud_updates');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [worldTime, setWorldTime] = useState<string>('');
  const [gameOver, setGameOver] = useState(false);
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [autoRecommendationsEnabled, setAutoRecommendationsEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('aimud_autoRecommendationsEnabled');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [syncCount, setSyncCount] = useState(0);

  // Multiplayer state
  const [gameMode, setGameMode] = useState<'singleplayer' | 'multiplayer'>(() => {
    const saved = localStorage.getItem('aimud_gameMode');
    return (saved === 'multiplayer' ? 'multiplayer' : 'singleplayer');
  });
  const [showMultiplayerModal, setShowMultiplayerModal] = useState<'host' | 'join' | null>(null);
  const [multiplayerService, setMultiplayerService] = useState<MultiplayerService | null>(null);
  const [roomState, setRoomState] = useState<any>(null);
  const roomStateRef = useRef<any>(null);
  const [username, setUsername] = useState<string>(() => {
    return localStorage.getItem('aimud_username') || '';
  });
  const processingCountRef = useRef(0);
  const [showCharacterCreation, setShowCharacterCreation] = useState(false);
  const [characterDescription, setCharacterDescription] = useState('');
  const mapPanelRef = useRef<MapPanelHandle>(null);

  // Authentication & Guest state
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [guestId, setGuestId] = useState<string>(() => getOrCreateGuestId());
  const [guestName, setGuestName] = useState<string | null>(() => {
    return localStorage.getItem('aifinity_guest_name');
  });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalInitialTab, setAuthModalInitialTab] = useState<'login' | 'signup'>('signup');
  const [isGuestNameModalOpen, setIsGuestNameModalOpen] = useState(false);

  // Guest welcome prompt state (prompt on first visit unless user set "Don't show again")
  const [isGuestWelcomeOpen, setIsGuestWelcomeOpen] = useState(() => {
    try {
      return localStorage.getItem('aimud_hide_guest_welcome') !== 'true';
    } catch (e) {
      return true;
    }
  });

  // Action Limits & Monetization state
  const [actionStatus, setActionStatus] = useState<ActionStatus>(() => ActionLimitService.getActionStatus(null, guestId));
  const [isMarketOpen, setIsMarketOpen] = useState(false);
  const [marketInitialTab, setMarketInitialTab] = useState<'packs' | 'subscriptions' | 'apikey'>('packs');
  const [isActionLimitModalOpen, setIsActionLimitModalOpen] = useState(false);

  // Adventures & Community state
  const [isAdventuresModalOpen, setIsAdventuresModalOpen] = useState(false);
  const [isCommunityModalOpen, setIsCommunityModalOpen] = useState(false);
  const [adventureToShare, setAdventureToShare] = useState<SavedAdventure | null>(null);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);

  const refreshActionStatus = useCallback(() => {
    setActionStatus(ActionLimitService.getActionStatus(currentUser, guestId));
  }, [currentUser, guestId]);

  // Listen to Firebase Auth state for automatic persistent login
  useEffect(() => {
    const unsubscribe = subscribeToAuth((user) => {
      setCurrentUser(user);
      setActionStatus(ActionLimitService.getActionStatus(user, guestId));
      if (user) {
        setIsGuestWelcomeOpen(false);
        setIsActionLimitModalOpen(false);
      }
    });
    return () => unsubscribe();
  }, [guestId]);

  // Synchronize actionStatus immediately whenever currentUser or guestId changes
  useEffect(() => {
    setActionStatus(ActionLimitService.getActionStatus(currentUser, guestId));
  }, [currentUser, guestId]);

  // Singleplayer naming rule:
  // - If logged in: account's username
  // - If guest with custom name: `${guestName} (Guest)`
  // - If guest without custom name: 'Player'
  const effectiveSingleplayerName = useMemo(() => {
    if (currentUser) return currentUser.username;
    if (guestName) return `${guestName} (Guest)`;
    return 'Player';
  }, [currentUser, guestName]);

  // Multiplayer naming rule:
  // - If logged in: account's username
  // - If guest with custom name: `${guestName} (Guest)`
  // - If guest without custom name: Guest# (1-9999, unique to active players in room)
  const getMultiplayerUsername = useCallback((existingPlayers: any[] = []) => {
    if (currentUser) return currentUser.username;
    if (guestName) return `${guestName} (Guest)`;
    const existingNames = existingPlayers.map((p: any) => p.username || '');
    return generateUniqueGuestMultiplayerName(existingNames);
  }, [currentUser, guestName]);

  // Active game username depending on gameMode
  const activeGameUsername = gameMode === 'multiplayer' ? (username || getMultiplayerUsername(roomState?.players || [])) : effectiveSingleplayerName;

  // Route state for /welcome and /
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      const hash = window.location.hash;
      if (path === '/welcome' || hash === '#/welcome' || hash === '#welcome') {
        return '/welcome';
      }
    }
    return window.location.pathname || '/';
  });

  useEffect(() => {
    const handleLocationChange = () => {
      const path = window.location.pathname;
      const hash = window.location.hash;
      if (path === '/welcome' || hash === '#/welcome' || hash === '#welcome') {
        setCurrentPath('/welcome');
      } else {
        setCurrentPath(path);
      }
    };
    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  const handleEnterGame = () => {
    if (window.location.pathname === '/welcome') {
      window.history.pushState({}, '', '/');
    }
    if (window.location.hash.includes('welcome')) {
      window.location.hash = '';
    }
    setCurrentPath('/');
  };

  const updateProcessing = (delta: number) => {
    processingCountRef.current = Math.max(0, processingCountRef.current + delta);
    setIsProcessing(processingCountRef.current > 0);
  };

  const isHost = roomState?.hostUsername === username;
  const isMyTurnReady = roomState?.players?.find((p: any) => p.username === username)?.isReady;

  // Persist narrative and updates
  useEffect(() => {
    if (gameMode === 'singleplayer') {
      localStorage.setItem('aimud_narrative', JSON.stringify(narrative));
    }
  }, [narrative, gameMode]);

  useEffect(() => {
    if (gameMode === 'singleplayer') {
      localStorage.setItem('aimud_updates', JSON.stringify(updates));
    }
  }, [updates, gameMode]);

  useEffect(() => {
    localStorage.setItem('aimud_autoRecommendationsEnabled', JSON.stringify(autoRecommendationsEnabled));
  }, [autoRecommendationsEnabled]);

  // Sync state with filesystem on mount and updates
  const syncFiles = () => {
    setFiles(fileSystem.list());
    setSyncCount(prev => prev + 1);
    const timeContent = fileSystem.read('WorldTime.txt');
    setWorldTime(parseActiveWorldTime(timeContent));
  };

  const initMultiplayerService = () => {
    const ms = new MultiplayerService(
      fileSystem,
      (state) => {
        setRoomState(state);
        roomStateRef.current = state;
        setNarrative(state.narrative || []);
        setUpdates(state.updates || []);
        setWorldTime(state.worldTime || '');
        setRecommendations(state.recommendations || []);
        syncFiles();

        // Check if we need to show character creation
        const myName = localStorage.getItem('aimud_username');
        const me = state.players?.find((p: any) => p.username?.toLowerCase() === myName?.toLowerCase());
        const myUsername = me?.username?.toLowerCase();

        // Find if any file matches CharacterName-username.txt
        const myCharacterFileExists = Object.keys(state.fileSystemState?.files || {}).some(f => {
          const lowerF = f.toLowerCase();
          return (
            myUsername && (
              lowerF.endsWith(`-${myUsername}.txt`) ||
              lowerF.endsWith(`_${myUsername}.txt`) ||
              lowerF.endsWith(` ${myUsername}.txt`) ||
              lowerF.replace(/\.txt$/, '').trim().endsWith(myUsername)
            )
          );
        });

        if (state.gameState !== 'waiting_for_world' && me && !myCharacterFileExists) {
          setShowCharacterCreation(true);
        } else {
          setShowCharacterCreation(false);
        }
      },
      async (inputs) => {
        // Host executes turn
        updateProcessing(1);
        const combinedInput = Object.entries(inputs)
          .map(([user, action]) => `${user} does: ${action}`)
          .join('\n');

        try {
          const result = await aiEngine.processAction(combinedInput);
          if (result) {
            const formattedPlayersActions = Object.entries(inputs)
              .map(([user, action]) => `[${user}]: ${action}`)
              .join('\n');

            const newNarrative = [
              ...(roomStateRef.current?.narrative || []),
              { id: Date.now().toString() + 'user', text: formattedPlayersActions, type: 'user' as const },
              { id: Date.now().toString() + 'ai', text: result.narrative || '', type: 'ai' as const }
            ];
            const safeUpdates = Array.isArray(result.updates) ? result.updates : [];
            const newUpdates = [...safeUpdates, ...(roomStateRef.current?.updates || [])].slice(0, 50);

            ms.syncState({
              fileSystemState: fileSystem.exportState(),
              narrative: newNarrative,
              updates: newUpdates,
              recommendations: result.recommendations || [],
              gameState: 'playing',
              worldTime: parseActiveWorldTime(fileSystem.read('WorldTime.txt')),
              turnProcessed: true
            });
          }
        } finally {
          updateProcessing(-1);
        }
      },
      async ({ username: newUsername, description }) => {
        // Host creates character for new player
        updateProcessing(1);
        try {
          const prompt = `Create a highly detailed and extensive character file for player "${newUsername}" based on this description: ${description}. The file MUST be named in the format "CharacterName-${newUsername}.txt".\n\nCRITICAL: Check your context. If a character file for player "${newUsername}" (ending in "-${newUsername}.txt") ALREADY EXISTS, you MUST update that specific file and NOT create a new one. Do not create duplicates. Return the character file AND update "CurrentMap.json" to place the new player at the appropriate starting location. DO NOT modify, empty, or delete ANY OTHER existing files (do not use null). Make sure the character file includes Physical Dimensions (Height, Width, Depth), Body Weight, Speed, Max Lift Strength (100% of body weight for average human with 1.0x strength), equipped containers with max space dimensions (e.g. 18x12 inches for backpack), items with detectable weights and dimensions, and total carried weight.`;
          await aiEngine.processAction(prompt);
          ms.syncState({
            fileSystemState: fileSystem.exportState(),
            worldTime: parseActiveWorldTime(fileSystem.read('WorldTime.txt'))
          });
        } finally {
          updateProcessing(-1);
        }
      },
      () => {
        // Kicked
        alert('You have been kicked from the session.');
        if (multiplayerService) {
          multiplayerService.leaveRoom();
          setMultiplayerService(null);
        }
        clearSession();
      },
      () => {
        // Adventure deleted
        alert('The host has deleted the adventure.');
        if (multiplayerService) {
          multiplayerService.leaveRoom();
          setMultiplayerService(null);
        }
        clearSession();
      }
    );
    setMultiplayerService(ms);
    return ms;
  };

  const handleJoinGame = async (roomId: string, joinUsername?: string) => {
    const effectiveJoin = currentUser ? currentUser.username : (joinUsername || getMultiplayerUsername(roomState?.players || []));
    setUsername(effectiveJoin);
    localStorage.setItem('aimud_username', effectiveJoin);
    const ms = initMultiplayerService();
    try {
      await ms.joinRoom(
        roomId,
        effectiveJoin,
        currentUser ? { tier: currentUser.tier, role: currentUser.role, showGlowingName: currentUser.showGlowingName } : undefined
      );
      localStorage.setItem('aimud_roomId', roomId);
      setGameMode('multiplayer');
      setShowMultiplayerModal(null);
    } catch (err: any) {
      alert(err.message || String(err));
    }
  };

  useEffect(() => {
    localStorage.setItem('aimud_gameMode', gameMode);
    if (gameMode === 'singleplayer') {
      syncFiles();
      if (fileSystem.list().length === 0) {
        setNarrative([{
          id: 'init',
          text: 'Welcome to Aifinity. Enter a scenario prompt to begin (e.g., "A cyberpunk detective in Neo-Tokyo")',
          type: 'system'
        }]);
      } else {
        setIsInitialized(true);
        setNarrative(prev => {
          if (prev.length > 0 && prev[prev.length - 1].id.startsWith('resume')) {
            return prev;
          }
          return [...prev, {
            id: 'resume-' + Date.now(),
            text: 'Session Resumed. Check logs for last state.',
            type: 'system'
          }];
        });
      }
    } else if (gameMode === 'multiplayer' && !multiplayerService) {
      // Try to restore multiplayer session
      const savedRoomId = localStorage.getItem('aimud_roomId');
      const savedUsername = currentUser ? currentUser.username : localStorage.getItem('aimud_username');
      if (savedRoomId && savedUsername) {
        handleJoinGame(savedRoomId, savedUsername);
      } else {
        setGameMode('singleplayer');
      }
    }

    if (!isInitialized || (gameMode === 'multiplayer' && roomState?.gameState === 'waiting_for_world')) {
      setRecommendations([]);
    }
  }, [gameMode, isInitialized, roomState?.gameState]);

  const handleHostGame = async (hostUsername?: string) => {
    const effectiveHost = currentUser ? currentUser.username : (hostUsername || getMultiplayerUsername([]));
    setUsername(effectiveHost);
    localStorage.setItem('aimud_username', effectiveHost);
    const ms = initMultiplayerService();
    fileSystem.clear();
    const roomId = await ms.createRoom(
      effectiveHost,
      currentUser ? { tier: currentUser.tier, role: currentUser.role, showGlowingName: currentUser.showGlowingName } : undefined
    );
    localStorage.setItem('aimud_roomId', roomId);
    setGameMode('multiplayer');
    setShowMultiplayerModal(null);
    setNarrative([{
      id: 'init',
      text: `Hosting Room: ${roomId}. Enter world description to start adventure....`,
      type: 'system'
    }]);
  };

  const handleLogout = async () => {
    try {
      await logOut();
      setCurrentUser(null);
      setActionStatus(ActionLimitService.getActionStatus(null, guestId));
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const clearSession = () => {
    fileSystem.clear();
    setNarrative([{
      id: 'init',
      text: 'You left the session. Enter a scenario prompt to begin.',
      type: 'system'
    }]);
    setUpdates([]);
    setRecommendations([]);
    setGameOver(false);
    setIsInitialized(false);
    setExpandedFile(null);
    setShowCharacterCreation(false);
    setRoomState(null);
    syncFiles();
    localStorage.removeItem('aimud_narrative');
    localStorage.removeItem('aimud_updates');
    localStorage.removeItem('aimud_recommendations');
    localStorage.removeItem('aimud_roomId');
    setGameMode('singleplayer');
  };

  const handleLeaveGame = async () => {
    if (multiplayerService) {
      await multiplayerService.leaveRoom();
      setMultiplayerService(null);
    }
    clearSession();
  };

  const handleLoadAdventure = (adv: SavedAdventure) => {
    fileSystem.clear();
    if (adv.files) {
      Object.entries(adv.files).forEach(([k, v]) => fileSystem.write(k, v));
    }
    setNarrative(adv.narrative || []);
    setIsInitialized(true);
    setGameOver(false);
    syncFiles();
    localStorage.setItem('aimud_narrative', JSON.stringify(adv.narrative || []));
    setExpandedFile(null);
  };

  const handlePlayCommunityAdventure = async (adv: CommunityAdventure) => {
    if (adv.shareType === 'full' && adv.files && adv.narrative) {
      fileSystem.clear();
      Object.entries(adv.files).forEach(([k, v]) => fileSystem.write(k, v));
      setNarrative(adv.narrative);
      setIsInitialized(true);
      setGameOver(false);
      syncFiles();
      localStorage.setItem('aimud_narrative', JSON.stringify(adv.narrative));
      setExpandedFile(null);
    } else if (adv.shareType === 'initial_generation' && adv.initialAiGeneration) {
      fileSystem.clear();
      if (adv.files) {
        Object.entries(adv.files).forEach(([k, v]) => fileSystem.write(k, v));
      }
      const initialNarrative: NarrativeEntry[] = [
        { id: Date.now() + '-user', text: adv.startingPrompt, type: 'user' },
        { id: Date.now() + '-ai', text: adv.initialAiGeneration, type: 'ai' }
      ];
      setNarrative(initialNarrative);
      setIsInitialized(true);
      setGameOver(false);
      syncFiles();
      localStorage.setItem('aimud_narrative', JSON.stringify(initialNarrative));
      setExpandedFile(null);
    } else {
      fileSystem.clear();
      syncFiles();
      setIsInitialized(false);
      setGameOver(false);
      setExpandedFile(null);
      await handleAction(adv.startingPrompt);
    }
  };

  const handleAction = async (text: string) => {
    // Action Limit Verification
    const actionRes = await ActionLimitService.consumeAction(currentUser, guestId);
    if (!actionRes.allowed) {
      setIsActionLimitModalOpen(true);
      return;
    }
    refreshActionStatus();

    if (gameMode === 'singleplayer') {
      updateProcessing(1);
      const userActionId = Date.now().toString();
      setNarrative(prev => [...prev, { id: userActionId, text: text, type: 'user' }]);

      try {
        let result;
        if (!isInitialized) {
          result = await aiEngine.initialize(text, effectiveSingleplayerName);
          setIsInitialized(true);
        } else {
          const mapScreenshot = await mapPanelRef.current?.captureScreenshot() || undefined;
          result = await aiEngine.processAction(text, effectiveSingleplayerName, mapScreenshot);
        }

        if (result) {
          if (result.narrative) {
            setNarrative(prev => [...prev, { id: Date.now().toString() + 'ai', text: result.narrative, type: 'ai' }]);
          }
          if (result.updates && Array.isArray(result.updates)) {
            setUpdates(prev => [...result.updates, ...prev].slice(0, 50));
          }
          if (result.recommendations && Array.isArray(result.recommendations)) {
            setRecommendations(result.recommendations);
          } else {
            setRecommendations([]);
          }
          if (result.gameOver && gameMode === 'singleplayer') {
            setGameOver(true);
            setNarrative(prev => [...prev, { id: 'death', text: 'CRITICAL FAILURE: Vital signs zero. Simulation Terminated.', type: 'system' }]);
          }
          syncFiles();
        }
      } finally {
        updateProcessing(-1);
      }
    } else if (gameMode === 'multiplayer' && multiplayerService) {
      if (roomState?.gameState === 'waiting_for_world' && roomState?.hostUsername === username) {
        // Host initializing world
        updateProcessing(1);
        const userActionId = Date.now().toString();
        const newNarrative = [...narrative, { id: userActionId, text: text, type: 'user' as const }];
        setNarrative(newNarrative);

        try {
          const result = await aiEngine.initialize(text);
          if (result) {
            const finalNarrative = [...newNarrative, { id: Date.now().toString() + 'ai', text: result.narrative || '', type: 'ai' as const }];
            if (result.recommendations && Array.isArray(result.recommendations)) {
              setRecommendations(result.recommendations);
            } else {
              setRecommendations([]);
            }
            const safeUpdates = Array.isArray(result.updates) ? result.updates : [];
            multiplayerService.syncState({
              fileSystemState: fileSystem.exportState(),
              narrative: finalNarrative,
              updates: safeUpdates,
              recommendations: result.recommendations || [],
              gameState: 'character_creation',
              worldTime: parseActiveWorldTime(fileSystem.read('WorldTime.txt'))
            });
          }
        } finally {
          updateProcessing(-1);
        }
      } else {
        // Normal action submission
        multiplayerService.submitAction(text);
        setNarrative(prev => [...prev, { id: Date.now().toString(), text: `[Action Submitted: ${text}] Waiting for others...`, type: 'system' }]);
      }
    }
  };

  useEffect(() => {
    if (autoRecommendationsEnabled && !showCharacterCreation) {
      const isSinglePlayerSetup = gameMode === 'singleplayer' && !isInitialized;
      const isMultiplayerSetup = gameMode === 'multiplayer' && roomState?.gameState === 'waiting_for_world' && isHost;

      if ((isSinglePlayerSetup || isMultiplayerSetup) && (recommendations || []).length === 0) {
        if (isSinglePlayerSetup) {
          setRecommendations(SuggestionGenerator.generateSinglePlayer());
        } else {
          setRecommendations(SuggestionGenerator.generateMultiplayer());
        }
      }
    }
  }, [gameMode, isInitialized, roomState?.gameState, isHost, autoRecommendationsEnabled, showCharacterCreation, recommendations?.length || 0]);

  const handleReferenceClick = (ref: string) => {
    const filename = fileSystem.findFileByReference(ref);
    if (filename) {
      setExpandedFile(filename);
    }
  };

  const handleReset = async () => {
    if (gameMode === 'multiplayer' && multiplayerService) {
      await multiplayerService.deleteAdventure();
    } else {
      fileSystem.clear();
      setNarrative([{
        id: 'reset',
        text: 'System Reset Complete. Enter a new scenario.',
        type: 'system'
      }]);
      setUpdates([]);
      setRecommendations([]);
      setGameOver(false);
      setIsInitialized(false);
      setExpandedFile(null);
      syncFiles();
      localStorage.removeItem('aimud_narrative');
      localStorage.removeItem('aimud_updates');
      localStorage.removeItem('aimud_recommendations');
    }
    setIsResetModalOpen(false);
  };

  if (currentPath === '/welcome') {
    return <WelcomePage onEnterGame={handleEnterGame} />;
  }

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-black text-gray-200 overflow-hidden">
      {showMultiplayerModal && (
        <MainMenu
          onHostGame={handleHostGame}
          onJoinGame={handleJoinGame}
          onCancel={() => setShowMultiplayerModal(null)}
          initialMode={showMultiplayerModal}
          defaultUsername={getMultiplayerUsername(roomState?.players || [])}
          currentUser={currentUser}
          guestName={guestName}
          guestId={guestId}
          onOpenMarket={(tab) => {
            setMarketInitialTab(tab || 'packs');
            setIsMarketOpen(true);
          }}
        />
      )}

      {showCharacterCreation && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-50">
          <div className="bg-neutral-900 border border-neutral-700 p-8 rounded-lg shadow-2xl w-96 max-w-full">
            <h2 className="text-xl text-center text-blue-300 mb-4">Create Your Character</h2>

            <div className="mb-4 bg-black/50 p-3 rounded border border-neutral-800 text-xs text-gray-400">
              <span className="font-bold text-gray-300">Adventure Context:</span>
              <p className="mt-1 italic">{roomState?.narrative?.filter((n: any) => n.type === 'user')[0]?.text || 'A new adventure awaits...'}</p>
            </div>

            <p className="text-sm text-gray-400 mb-4">Describe your character's class, appearance, and background.</p>
            <textarea
              value={characterDescription}
              onChange={(e) => setCharacterDescription(e.target.value)}
              className="w-full h-32 bg-black border border-neutral-700 p-2 text-white font-mono mb-4"
              placeholder="e.g., A rogue elf with a mysterious past..."
            />
            <div className="flex gap-2">
              <button
                onClick={handleLeaveGame}
                className="w-1/3 bg-neutral-800 hover:bg-neutral-700 text-gray-300 p-2 rounded font-mono transition-colors"
                title="Leave the multiplayer session"
              >
                Cancel / Leave
              </button>
              <button
                onClick={() => {
                  multiplayerService?.createCharacter(characterDescription);
                  setShowCharacterCreation(false);
                }}
                disabled={!characterDescription}
                className="w-2/3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white p-2 rounded font-mono transition-colors"
              >
                Submit Character
              </button>
            </div>
          </div>
        </div>
      )}

      <Sidebar
        files={files}
        fileSystem={fileSystem}
        updates={updates}
        debugMode={debugMode}
        onToggleDebug={() => setDebugMode(!debugMode)}
        onReset={() => {
          if (gameMode === 'multiplayer' && !isHost) return;
          setIsResetModalOpen(true);
        }}
        expandedFile={expandedFile}
        setExpandedFile={setExpandedFile}
        gameMode={gameMode}
        roomState={roomState}
        username={activeGameUsername}
        onKickPlayer={(user) => {
          if (multiplayerService) {
            const userLower = user.toLowerCase();
            const charFile = fileSystem.list().find(f => f.toLowerCase().endsWith(`-${userLower}.txt`));

            if (charFile) {
              fileSystem.delete(charFile);
            }

            multiplayerService.syncState({
              fileSystemState: fileSystem.exportState(),
              narrative: roomState?.narrative || [],
              updates: roomState?.updates || [],
              gameState: roomState?.gameState || 'playing',
              worldTime: parseActiveWorldTime(fileSystem.read('WorldTime.txt'))
            });
            multiplayerService.kickPlayer(user);
          }
        }}
        onLeaveGame={handleLeaveGame}
        onForceTurn={() => multiplayerService?.forceTurn()}
        onReferenceClick={handleReferenceClick}
        autoRecommendationsEnabled={autoRecommendationsEnabled}
        onToggleAutoRecommendations={() => setAutoRecommendationsEnabled(!autoRecommendationsEnabled)}
        onHostClick={() => setShowMultiplayerModal('host')}
        onJoinClick={() => setShowMultiplayerModal('join')}
        syncCount={syncCount}
        mapPanelRef={mapPanelRef}
        currentUser={currentUser}
        guestName={guestName}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onOpenGuestName={() => setIsGuestNameModalOpen(true)}
        onLogout={handleLogout}
        onNavigateWelcome={() => {
          window.history.pushState({}, '', '/welcome');
          setCurrentPath('/welcome');
        }}
        actionStatus={actionStatus}
        onOpenMarket={(tab) => {
          setMarketInitialTab(tab || 'packs');
          setIsMarketOpen(true);
        }}
        onOpenAccount={() => setIsAccountModalOpen(true)}
        onOpenAdventures={() => setIsAdventuresModalOpen(true)}
        onOpenCommunity={() => setIsCommunityModalOpen(true)}
      />

      <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
        {/* Main Game Top Bar */}
        <div className="bg-neutral-900 border-b border-neutral-800 px-3 py-2 text-xs font-mono shadow-lg z-10 flex justify-between items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Welcome Page Button on Main Game Page */}
            <button
              id="welcome-page-top-btn"
              onClick={() => {
                window.history.pushState({}, '', '/welcome');
                setCurrentPath('/welcome');
              }}
              className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-blue-300 hover:text-white rounded border border-neutral-700 text-[11px] font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Go to Welcome Page"
            >
              <Compass size={13} className="text-blue-400" />
              <span className="font-semibold">Welcome Page</span>
            </button>

            {/* Quick Navigation: Adventures, Community, Market */}
            <button
              id="top-adventures-btn"
              onClick={() => setIsAdventuresModalOpen(true)}
              className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded border border-neutral-700 text-[11px] font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
              title="View and manage saved adventures"
            >
              <Bookmark size={13} className="text-blue-400" />
              <span>Adventures</span>
            </button>

            <button
              id="top-community-btn"
              onClick={() => setIsCommunityModalOpen(true)}
              className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded border border-neutral-700 text-[11px] font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Browse community adventures"
            >
              <Globe size={13} className="text-emerald-400" />
              <span>Community</span>
            </button>

            <button
              id="top-market-btn"
              onClick={() => {
                setMarketInitialTab('packs');
                setIsMarketOpen(true);
              }}
              className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded border border-amber-500/40 text-[11px] font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Aifinity Market: Buy actions, upgrade tier, or connect custom API key"
            >
              <ShoppingCart size={13} className="text-amber-400" />
              <span className="font-bold">Market</span>
              {actionStatus?.isUnlimited ? (
                <span className="text-[10px] bg-amber-500/20 text-amber-200 px-1.5 py-0.2 rounded font-sans flex items-center gap-0.5">
                  <Zap size={9} /> Unlimited
                </span>
              ) : actionStatus?.isGuest ? (
                <span className="text-[10px] bg-amber-950/70 border border-amber-800/60 text-amber-300 px-1.5 py-0.2 rounded font-sans">
                  {actionStatus?.guestActionsRemaining ?? 0}/{actionStatus?.guestActionsTotal ?? 3} Guest Free
                </span>
              ) : (
                <span className="text-[10px] bg-neutral-800 text-emerald-300 px-1.5 py-0.2 rounded font-sans">
                  {actionStatus?.dailyFreeRemaining ?? 0}/{actionStatus?.dailyFreeTotal ?? 20} Free
                  {(actionStatus?.purchasedCredits ?? 0) > 0 && ` +${actionStatus.purchasedCredits}`}
                </span>
              )}
            </button>

            <span className="hidden sm:inline text-neutral-600">|</span>
            <span className="text-blue-400 tracking-widest">{worldTime || "TIME: UNKNOWN"}</span>
          </div>

          <div className="flex items-center gap-2">
            {gameMode === 'multiplayer' && roomState && (
              <span className="text-emerald-400 text-[11px]">
                Room: {roomState.id} | {(roomState.players || []).filter((p: any) => p.status === 'active').length} Players
              </span>
            )}

            {currentUser ? (
              <div className="flex items-center gap-2 bg-neutral-950 px-2.5 py-1 rounded border border-neutral-700 text-[11px]">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <GoldenName
                  name={currentUser.username}
                  role={currentUser.role}
                  showGlowingName={currentUser.showGlowingName}
                  isGolden={currentUser.tier === 'legendary'}
                  className="font-bold text-white"
                />
                <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-semibold ${
                  currentUser.tier === 'legendary'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-0.5'
                    : currentUser.tier === 'adventurer'
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                      : 'bg-neutral-800 text-neutral-400'
                }`}>
                  {currentUser.tier === 'legendary' && <Crown size={9} />}
                  {currentUser.tier || 'free'}
                </span>
                <button
                  id="top-account-btn"
                  onClick={() => setIsAccountModalOpen(true)}
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium border flex items-center gap-1 cursor-pointer transition-colors ${
                    currentUser.role === 'admin'
                      ? 'bg-sky-950/80 hover:bg-sky-900 border-cyan-400/60 text-cyan-300'
                      : currentUser.role === 'mod'
                      ? 'bg-amber-950/80 hover:bg-amber-900 border-amber-400/60 text-amber-300'
                      : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
                  }`}
                  title="Account Settings, Permissions & Profile"
                >
                  <User size={10} />
                  <span>{currentUser.role === 'admin' ? 'Account (Admin)' : currentUser.role === 'mod' ? 'Account (Mod)' : 'Account'}</span>
                </button>
                <button
                  id="top-logout-btn"
                  onClick={handleLogout}
                  className="text-neutral-400 hover:text-red-400 ml-0.5 text-[10px] underline cursor-pointer"
                  title="Log out and return to Guest"
                >
                  Log Out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-1.5 bg-neutral-950 px-2 py-1 rounded border border-neutral-800 text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  <span className="text-amber-300">
                    {guestName ? `${guestName} (Guest)` : 'Player (Guest)'}
                  </span>
                  <button
                    id="top-change-guest-name-btn"
                    onClick={() => setIsGuestNameModalOpen(true)}
                    className="text-neutral-400 hover:text-amber-300 ml-1 text-[10px] underline cursor-pointer"
                    title="Change guest temporary name"
                  >
                    {guestName ? 'Edit' : 'Set Name'}
                  </button>
                </div>
                <button
                  id="top-open-login-btn"
                  onClick={() => setIsAuthModalOpen(true)}
                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <LogIn size={11} />
                  <span>Log In / Sign Up</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <NarrativeWindow
          history={narrative}
          onReferenceClick={handleReferenceClick}
          debugMode={debugMode}
          fileSystem={fileSystem}
          username={activeGameUsername}
        />

        {/* Floating Status Updates */}
        {!gameOver && (updates || []).length > 0 && (
          <div className="absolute bottom-24 right-4 z-20 flex flex-col gap-1 items-end pointer-events-none">
            {(updates || []).slice(0, 5).map((u, i) => (
              <div key={i} className="bg-black/80 border border-neutral-800 px-3 py-1 rounded text-xs font-mono shadow-xl animate-in slide-in-from-right-10 fade-in duration-500">
                <span className={u.value < 0 ? 'text-red-400' : u.value > 0 ? 'text-green-400' : 'text-yellow-400'}>
                  {u.text}
                </span>
              </div>
            ))}
          </div>
        )}

        {gameOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-950/40 backdrop-blur-md z-30 pointer-events-none">
            <div className="bg-black border-4 border-red-600 p-12 rounded-xl text-center shadow-[0_0_100px_rgba(220,38,38,0.7)] transform animate-in zoom-in duration-500">
              <h1 className="text-6xl font-black text-red-600 mb-4 tracking-tighter">TERMINATED</h1>
              <p className="text-xl text-red-400 font-bold mb-6">Vital signs zero. Neural link severed.</p>
              <div className="h-px bg-red-900 w-full mb-6"></div>
              <p className="text-gray-400 text-sm animate-pulse">You died! Reset for a new adventure.</p>
            </div>
          </div>
        )}

        <InputArea
          onSend={handleAction}
          disabled={isProcessing || gameOver || isMyTurnReady || showCharacterCreation || (gameMode === 'multiplayer' && roomState?.gameState !== 'playing' && !(roomState?.gameState === 'waiting_for_world' && isHost))}
          recommendations={(autoRecommendationsEnabled && !showCharacterCreation && (
            (gameMode === 'singleplayer') ||
            (gameMode === 'multiplayer' && (roomState?.gameState === 'playing' || (roomState?.gameState === 'waiting_for_world' && isHost)))
          )) ? recommendations : []}
        />
      </div>

      <Modal
        isOpen={isResetModalOpen}
        onConfirm={handleReset}
        onCancel={() => setIsResetModalOpen(false)}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        initialTab={authModalInitialTab}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={(user) => {
          setCurrentUser(user);
          setActionStatus(ActionLimitService.getActionStatus(user, guestId));
          setIsActionLimitModalOpen(false);
          setIsGuestWelcomeOpen(false);
          setIsAuthModalOpen(false);
        }}
      />

      <GuestWelcomeModal
        isOpen={isGuestWelcomeOpen && !currentUser}
        onClose={() => setIsGuestWelcomeOpen(false)}
        onOpenAuth={(mode) => {
          setIsGuestWelcomeOpen(false);
          setAuthModalInitialTab(mode || 'signup');
          setIsAuthModalOpen(true);
        }}
      />

      <GuestNameModal
        isOpen={isGuestNameModalOpen}
        onClose={() => setIsGuestNameModalOpen(false)}
        guestId={guestId}
        currentGuestName={guestName}
        onNameSaved={(newName) => {
          setGuestName(newName);
        }}
      />

      <MarketModal
        isOpen={isMarketOpen}
        onClose={() => setIsMarketOpen(false)}
        currentUser={currentUser}
        actionStatus={actionStatus}
        initialTab={marketInitialTab}
        onStatusUpdated={refreshActionStatus}
        onOpenAuth={() => {
          setIsMarketOpen(false);
          setAuthModalInitialTab('signup');
          setIsAuthModalOpen(true);
        }}
        guestId={guestId}
      />

      <ActionLimitModal
        isOpen={isActionLimitModalOpen}
        onClose={() => setIsActionLimitModalOpen(false)}
        currentUser={currentUser}
        actionStatus={actionStatus}
        onOpenAuth={(mode) => {
          setIsActionLimitModalOpen(false);
          setAuthModalInitialTab(mode || 'signup');
          setIsAuthModalOpen(true);
        }}
        onOpenMarket={(tab) => {
          setIsActionLimitModalOpen(false);
          setMarketInitialTab(tab || 'packs');
          setIsMarketOpen(true);
        }}
        onApiKeySaved={() => {
          refreshActionStatus();
          setIsActionLimitModalOpen(false);
        }}
      />

      <AdventuresModal
        isOpen={isAdventuresModalOpen}
        onClose={() => setIsAdventuresModalOpen(false)}
        currentUser={currentUser}
        guestId={guestId}
        fileSystem={fileSystem}
        narrative={narrative}
        onLoadAdventure={handleLoadAdventure}
        onOpenCommunityShare={(adventure) => {
          setAdventureToShare(adventure);
          setIsAdventuresModalOpen(false);
          setIsCommunityModalOpen(true);
        }}
        onOpenMarket={() => {
          setIsAdventuresModalOpen(false);
          setMarketInitialTab('subscriptions');
          setIsMarketOpen(true);
        }}
      />

      <CommunityAdventuresModal
        isOpen={isCommunityModalOpen}
        onClose={() => {
          setIsCommunityModalOpen(false);
          setAdventureToShare(null);
        }}
        currentUser={currentUser}
        fileSystem={fileSystem}
        narrative={narrative}
        initialAdventureToShare={adventureToShare}
        onPlayCommunityAdventure={handlePlayCommunityAdventure}
        onOpenMarket={() => {
          setIsCommunityModalOpen(false);
          setMarketInitialTab('subscriptions');
          setIsMarketOpen(true);
        }}
      />

      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        currentUser={currentUser}
        actionStatus={actionStatus}
        onProfileUpdated={(updatedUser) => {
          setCurrentUser(updatedUser);
          setActionStatus(ActionLimitService.getActionStatus(updatedUser, guestId));
        }}
      />
    </div>
  );
}

export default App;
