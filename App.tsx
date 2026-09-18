import React, { useState, useEffect, useRef } from 'react';
import { AIEngine } from './services/aiEngine';
import { FileSystem } from './services/fileSystem';
import { NarrativeEntry, UpdateItem } from './types';
import Sidebar from './components/Sidebar';
import { MapPanelHandle } from './components/MapPanel';
import NarrativeWindow from './components/NarrativeWindow';
import InputArea from './components/InputArea';
import Modal from './components/Modal';
import MainMenu from './components/MainMenu';
import WelcomePage from './components/WelcomePage';
import AuthModal from './components/AuthModal';
import PricingModal from './components/PricingModal';
import SavedAdventuresModal from './components/SavedAdventuresModal';
import CommunityAdventures from './components/CommunityAdventures';
import { MultiplayerService } from './services/multiplayer';
import { SuggestionGenerator } from './services/suggestionGenerator';
import { authService, AuthSession } from './services/authService';
import { actionQuotaService, ActionQuotaState, SavedAdventure } from './services/actionQuotaService';
import { User, Zap, Bookmark, Share2, Crown } from 'lucide-react';

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
    const saved = localStorage.getItem('aimud_narrative');
    return saved ? JSON.parse(saved) : [];
  });
  const [files, setFiles] = useState<string[]>([]);
  const [updates, setUpdates] = useState<UpdateItem[]>(() => {
    const saved = localStorage.getItem('aimud_updates');
    return saved ? JSON.parse(saved) : [];
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
  const [initialAIGeneration, setInitialAIGeneration] = useState<string>(() => {
    return localStorage.getItem('aimud_initial_generation') || '';
  });
  const [syncCount, setSyncCount] = useState(0);

  // Pricing, Quota & Adventures Modals state
  const [quotaState, setQuotaState] = useState<ActionQuotaState>(() => actionQuotaService.getQuotaState());
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const [pricingInitialTab, setPricingInitialTab] = useState<'pricing' | 'apiKey' | 'subscriptions'>('pricing');
  const [highlightActionExhausted, setHighlightActionExhausted] = useState(false);
  const [isSavedAdventuresModalOpen, setIsSavedAdventuresModalOpen] = useState(false);

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

  // Authentication & Guest State
  const [authSession, setAuthSession] = useState<AuthSession>(() => authService.getSession());
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<'login' | 'signup' | 'guest'>('login');

  useEffect(() => {
    const unsubAuth = authService.subscribe(() => {
      setAuthSession(authService.getSession());
    });
    const unsubQuota = actionQuotaService.subscribe(() => {
      setQuotaState(actionQuotaService.getQuotaState());
    });
    return () => {
      unsubAuth();
      unsubQuota();
    };
  }, []);

  // Compute name resolution for singleplayer and multiplayer
  const onlineGuestNames = roomState?.players?.map((p: any) => p.username) || [];
  const singleplayerName = authService.getSingleplayerName();
  const multiplayerName = authService.getMultiplayerName(onlineGuestNames);
  const effectiveUsername = gameMode === 'singleplayer' ? singleplayerName : (username || multiplayerName);

  const processingCountRef = useRef(0);
  const [showCharacterCreation, setShowCharacterCreation] = useState(false);
  const [characterDescription, setCharacterDescription] = useState('');
  const mapPanelRef = useRef<MapPanelHandle>(null);

  const updateProcessing = (delta: number) => {
    processingCountRef.current = Math.max(0, processingCountRef.current + delta);
    setIsProcessing(processingCountRef.current > 0);
  };

  // Route / Welcome page state ('game' | 'welcome' | 'community')
  const [currentRoute, setCurrentRoute] = useState<'game' | 'welcome' | 'community'>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      if (path === '/welcome' || hash === '#/welcome' || path.startsWith('/welcome')) {
        return 'welcome';
      }
      if (path === '/community' || hash === '#/community' || path.startsWith('/community')) {
        return 'community';
      }
    }
    return 'game';
  });

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      if (path === '/welcome' || hash === '#/welcome' || path.startsWith('/welcome')) {
        setCurrentRoute('welcome');
      } else if (path === '/community' || hash === '#/community' || path.startsWith('/community')) {
        setCurrentRoute('community');
      } else {
        setCurrentRoute('game');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (route: 'game' | 'welcome' | 'community') => {
    if (route === 'welcome') {
      window.history.pushState(null, '', '/welcome');
      setCurrentRoute('welcome');
    } else if (route === 'community') {
      window.history.pushState(null, '', '/community');
      setCurrentRoute('community');
    } else {
      window.history.pushState(null, '', '/');
      setCurrentRoute('game');
    }
  };

  const handleEnterFromWelcome = (scenarioPrompt?: string) => {
    navigateTo('game');
    if (scenarioPrompt) {
      setTimeout(() => {
        handleAction(scenarioPrompt);
      }, 100);
    }
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
        if (state.recommendations && Array.isArray(state.recommendations)) {
          setRecommendations(state.recommendations);
        }
        syncFiles();

        const myUsername = (localStorage.getItem('aimud_username') || effectiveUsername).toLowerCase();
        const me = state.players?.find((p: any) => p.username.toLowerCase() === myUsername);
        const myCharacterFileExists = fileSystem.list().some(f => {
          const lowerF = f.toLowerCase();
          return (
            lowerF.endsWith('.txt') &&
            (
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
          const result = await aiEngine.createCharacter(newUsername, description);
          if (result) {
            const newNarrative = [
              ...(roomStateRef.current?.narrative || []),
              { id: Date.now().toString(), text: `[Character Created]: ${newUsername} enters the world.\n${result.narrative || ''}`, type: 'system' as const }
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
      (kickedUser) => {
        const currentMyUser = localStorage.getItem('aimud_username') || effectiveUsername;
        if (kickedUser.toLowerCase() === currentMyUser.toLowerCase()) {
          alert('You have been removed from the session by the host.');
          handleLeaveGame();
        }
      }
    );
    setMultiplayerService(ms);
    return ms;
  };

  useEffect(() => {
    syncFiles();

    // Check if there was an active multiplayer session in localStorage
    const savedRoomId = localStorage.getItem('aimud_roomId');
    const savedGameMode = localStorage.getItem('aimud_gameMode');
    const savedUsername = localStorage.getItem('aimud_username');

    if (savedGameMode === 'multiplayer' && savedRoomId && savedUsername) {
      const ms = initMultiplayerService();
      ms.reconnect(savedRoomId, savedUsername).catch(err => {
        console.error("Failed to auto-reconnect to room", err);
        clearSession();
      });
    } else {
      const hasFiles = fileSystem.list().length > 0;
      if (hasFiles) {
        setIsInitialized(true);
      }
    }
  }, []);

  const clearSession = () => {
    localStorage.removeItem('aimud_roomId');
    localStorage.removeItem('aimud_gameMode');
    localStorage.removeItem('aimud_username');
    setGameMode('singleplayer');
    setRoomState(null);
    setUsername('');
    const hasFiles = fileSystem.list().length > 0;
    setIsInitialized(hasFiles);
    syncFiles();
  };

  const handleHostGame = async (user: string) => {
    const ms = initMultiplayerService();
    try {
      const actualUser = user || effectiveUsername;
      setUsername(actualUser);
      localStorage.setItem('aimud_username', actualUser);
      localStorage.setItem('aimud_gameMode', 'multiplayer');

      const room = await ms.hostRoom(actualUser);
      localStorage.setItem('aimud_roomId', room.id);
      setGameMode('multiplayer');
      setShowMultiplayerModal(null);
      setIsInitialized(false);
      fileSystem.clear();
      setNarrative([{
        id: 'host_init',
        text: `Room created! Code: ${room.id}. Enter an opening scenario prompt to initialize the world for all players.`,
        type: 'system'
      }]);
      syncFiles();
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Failed to host multiplayer room");
    }
  };

  const handleJoinGame = async (roomId: string, user: string) => {
    const ms = initMultiplayerService();
    try {
      const actualUser = user || effectiveUsername;
      setUsername(actualUser);
      localStorage.setItem('aimud_username', actualUser);
      localStorage.setItem('aimud_gameMode', 'multiplayer');

      await ms.joinRoom(roomId, actualUser);
      localStorage.setItem('aimud_roomId', roomId);
      setGameMode('multiplayer');
      setShowMultiplayerModal(null);
      setIsInitialized(true);
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Failed to join multiplayer room");
    }
  };

  const handleLeaveGame = async () => {
    if (multiplayerService) {
      await multiplayerService.leaveRoom();
      setMultiplayerService(null);
    }
    clearSession();
  };

  const handleAction = async (text: string) => {
    // 1. Quota Verification & Consumption
    const quotaCheck = actionQuotaService.canPerformAction();
    if (!quotaCheck.allowed) {
      setHighlightActionExhausted(true);
      setPricingInitialTab('pricing');
      setIsPricingModalOpen(true);
      setNarrative(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          text: quotaCheck.reason === 'guest_limit_reached'
            ? `[GUEST TRIAL LIMIT]: You have used all 3 free guest actions! Create a free account or log in to get 20 daily free actions (+10 Beta Tester Bonus), or play with your personal Gemini API key.`
            : `[SYSTEM QUOTA LIMIT]: You have reached your daily free action limit. You can continue playing by entering your free Gemini API key, purchasing an action pack, or subscribing to an Adventurer/Legendary Pass.`,
          type: 'system'
        }
      ]);
      return;
    }

    // Consume 1 action
    const consumed = actionQuotaService.consumeAction();
    if (!consumed) {
      setHighlightActionExhausted(true);
      setIsPricingModalOpen(true);
      return;
    }

    if (gameMode === 'singleplayer') {
      updateProcessing(1);
      const userActionId = Date.now().toString();
      setNarrative(prev => [...prev, { id: userActionId, text: text, type: 'user' }]);

      try {
        let result;
        if (!isInitialized) {
          result = await aiEngine.initialize(text, singleplayerName);
          setIsInitialized(true);
          if (result?.narrative) {
            setInitialAIGeneration(result.narrative);
            localStorage.setItem('aimud_initial_generation', result.narrative);
          }
        } else {
          const mapScreenshot = await mapPanelRef.current?.captureScreenshot() || undefined;
          result = await aiEngine.processAction(text, singleplayerName, mapScreenshot);
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

      if ((isSinglePlayerSetup || isMultiplayerSetup) && recommendations.length === 0) {
        if (isSinglePlayerSetup) {
          setRecommendations(SuggestionGenerator.generateSinglePlayer());
        } else {
          setRecommendations(SuggestionGenerator.generateMultiplayer());
        }
      }
    }
  }, [gameMode, isInitialized, roomState?.gameState, isHost, autoRecommendationsEnabled, showCharacterCreation, recommendations.length]);

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
      localStorage.removeItem('aimud_initial_generation');
      setInitialAIGeneration('');
    }
    setIsResetModalOpen(false);
  };

  // Saved adventure helper
  const handleSaveCurrentAdventure = () => {
    const userPrompt = narrative.find(n => n.type === 'user')?.text || '';
    const title = userPrompt.slice(0, 60) || 'Unnamed Adventure';
    const firstAi = initialAIGeneration || narrative.find(n => n.type === 'ai')?.text || '';
    const adv: SavedAdventure = {
      id: 'adv_' + Date.now(),
      title,
      savedAt: Date.now(),
      scenarioPrompt: userPrompt || 'An epic adventure in Aifinity.',
      fileSystemState: fileSystem.exportState(),
      narrative: narrative,
      updates: updates,
      initialGeneration: firstAi,
      worldTime: worldTime || parseActiveWorldTime(fileSystem.read('WorldTime.txt')) || 'Unknown'
    };

    const res = actionQuotaService.saveCurrentAdventure(adv);
    if (!res.success) {
      alert(res.error);
      setIsPricingModalOpen(true);
      setPricingInitialTab('subscriptions');
    } else {
      alert(`Adventure "${title}" saved successfully!`);
      setIsSavedAdventuresModalOpen(false);
    }
  };

  const handleLoadSavedAdventure = (adv: SavedAdventure) => {
    if (adv.fileSystemState) {
      fileSystem.importState(adv.fileSystemState);
    }
    if (adv.narrative) {
      setNarrative(adv.narrative);
    }
    if (adv.initialGeneration) {
      setInitialAIGeneration(adv.initialGeneration);
      localStorage.setItem('aimud_initial_generation', adv.initialGeneration);
    }
    syncFiles();
    setIsInitialized(true);
    setIsSavedAdventuresModalOpen(false);
    navigateTo('game');
  };

  const handleLoadFromCommunity = (prompt: string, fullState?: any) => {
    if (fullState && fullState.fileSystemState) {
      fileSystem.importState(fullState.fileSystemState);
      if (fullState.narrative) {
        setNarrative(fullState.narrative);
      }
      syncFiles();
      setIsInitialized(true);
    } else {
      handleReset();
      setTimeout(() => {
        handleAction(prompt);
      }, 150);
    }
    navigateTo('game');
  };

  // Remaining free actions calculation (guest: max 3 or less; registered: dailyAllowance)
  const remainingFreeActions = quotaState.isGuest
    ? Math.max(0, 3 - quotaState.guestActionsUsed)
    : Math.max(0, quotaState.dailyAllowance - quotaState.dailyUsed);

  // Router view
  if (currentRoute === 'welcome') {
    return (
      <>
        <WelcomePage
          onEnterGame={handleEnterFromWelcome}
          onOpenAuth={(tab) => {
            setAuthModalTab(tab || 'login');
            setIsAuthModalOpen(true);
          }}
          onOpenPricing={() => {
            setPricingInitialTab('pricing');
            setIsPricingModalOpen(true);
          }}
          onOpenCommunity={() => navigateTo('community')}
        />
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          initialTab={authModalTab}
          onResetData={() => {
            setIsAuthModalOpen(false);
            setIsResetModalOpen(true);
          }}
        />
        <PricingModal
          isOpen={isPricingModalOpen}
          onClose={() => {
            setIsPricingModalOpen(false);
            setHighlightActionExhausted(false);
          }}
          initialTab={pricingInitialTab}
          highlightActionExhausted={highlightActionExhausted}
        />
      </>
    );
  }

  if (currentRoute === 'community') {
    const currentAdventureSnapshot: SavedAdventure | null = narrative.length > 0 ? {
      id: 'current_active_adv',
      title: narrative.find(n => n.type === 'user')?.text?.slice(0, 60) || 'Current Adventure',
      savedAt: Date.now(),
      scenarioPrompt: narrative.find(n => n.type === 'user')?.text || 'Current Active Adventure',
      fileSystemState: fileSystem.exportState(),
      narrative: narrative,
      updates: updates,
      initialGeneration: initialAIGeneration || narrative.find(n => n.type === 'ai')?.text || '',
      worldTime: worldTime || parseActiveWorldTime(fileSystem.read('WorldTime.txt')) || 'Unknown'
    } : null;

    return (
      <>
        <CommunityAdventures
          onLoadAdventure={handleLoadFromCommunity}
          onOpenPricing={() => {
            setPricingInitialTab('subscriptions');
            setIsPricingModalOpen(true);
          }}
          onBackToGame={() => navigateTo('game')}
          currentAdventure={currentAdventureSnapshot}
        />
        <PricingModal
          isOpen={isPricingModalOpen}
          onClose={() => {
            setIsPricingModalOpen(false);
            setHighlightActionExhausted(false);
          }}
          initialTab={pricingInitialTab}
          highlightActionExhausted={highlightActionExhausted}
        />
      </>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-black text-gray-200 overflow-hidden">
      {showMultiplayerModal && (
        <MainMenu
          onHostGame={handleHostGame}
          onJoinGame={handleJoinGame}
          onCancel={() => setShowMultiplayerModal(null)}
          initialMode={showMultiplayerModal}
          onOpenAuth={(tab) => {
            setAuthModalTab(tab || 'login');
            setIsAuthModalOpen(true);
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
        username={effectiveUsername}
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
        onOpenWelcome={() => navigateTo('welcome')}
        onOpenAuth={(tab) => {
          setAuthModalTab(tab || 'login');
          setIsAuthModalOpen(true);
        }}
        onOpenPricing={() => {
          setPricingInitialTab('pricing');
          setIsPricingModalOpen(true);
        }}
        onOpenSavedAdventures={() => setIsSavedAdventuresModalOpen(true)}
        onOpenCommunity={() => navigateTo('community')}
      />

      <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
        <div className="bg-neutral-900 border-b border-neutral-800 px-3 py-1.5 text-xs font-mono shadow-lg z-10 flex justify-between items-center">
          <div className="flex items-center gap-3">
            {/* Quick Account Profile Button */}
            <button
              onClick={() => {
                setAuthModalTab('login');
                setIsAuthModalOpen(true);
              }}
              className="text-[11px] font-mono flex items-center gap-1.5 px-2 py-0.5 rounded bg-neutral-950 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 transition-colors"
              title="Manage Account / Guest Name"
            >
              <User size={12} className={quotaState.monthlyPlan === 'infinite' ? 'text-amber-400 fill-amber-400/30' : authSession.type === 'registered' ? 'text-emerald-400' : 'text-amber-400'} />
              <span className={`max-w-[110px] truncate ${quotaState.monthlyPlan === 'infinite' ? 'text-amber-300 font-bold drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]' : ''}`}>
                {effectiveUsername}
              </span>
            </button>

            {/* Quick Quota Pill */}
            <button
              onClick={() => {
                setPricingInitialTab('pricing');
                setIsPricingModalOpen(true);
              }}
              className="text-[11px] font-mono flex items-center gap-1.5 px-2 py-0.5 rounded bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 transition-colors"
              title="View Action Quotas & Aifinity Market"
            >
              <Zap size={12} className={remainingFreeActions > 0 ? "text-amber-400" : "text-red-400"} />
              <span className="hidden sm:inline text-neutral-400">Actions:</span>
              <span className={remainingFreeActions > 0 ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                {quotaState.hasCustomKey ? 'Custom API Key' : quotaState.monthlyPlan === 'infinite' ? '∞ Infinite' : quotaState.isGuest ? `${remainingFreeActions}/3 (Guest)` : `${remainingFreeActions}/${quotaState.dailyAllowance}`}
              </span>
              {quotaState.purchasedBalance > 0 && !quotaState.hasCustomKey && quotaState.monthlyPlan !== 'infinite' && (
                <span className="text-blue-400 text-[10px]">+{quotaState.purchasedBalance}</span>
              )}
            </button>

            <span className="text-neutral-700 hidden md:inline">|</span>
            <span className="text-blue-400 tracking-widest hidden md:inline">{worldTime || "TIME: UNKNOWN"}</span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setIsSavedAdventuresModalOpen(true)}
              className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-neutral-950 hover:bg-neutral-800 text-emerald-300 border border-neutral-800 transition-colors"
              title="Saved Adventures"
            >
              <Bookmark size={12} className="text-emerald-400" />
              <span className="hidden sm:inline">Adventures</span>
            </button>

            <button
              onClick={() => navigateTo('community')}
              className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-neutral-950 hover:bg-neutral-800 text-purple-300 border border-neutral-800 transition-colors"
              title="Community Adventures"
            >
              <Share2 size={12} className="text-purple-400" />
              <span className="hidden sm:inline">Community</span>
            </button>

            {gameMode === 'multiplayer' && roomState && (
              <span className="text-emerald-400 text-[11px]">Room: {roomState.id}</span>
            )}
          </div>
        </div>

        <NarrativeWindow
          history={narrative}
          onReferenceClick={handleReferenceClick}
          debugMode={debugMode}
          fileSystem={fileSystem}
          username={effectiveUsername}
        />

        {/* Floating Status Updates */}
        {!gameOver && updates.length > 0 && (
          <div className="absolute bottom-24 right-4 z-20 flex flex-col gap-1 items-end pointer-events-none">
            {updates.slice(0, 5).map((u, i) => (
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
          remainingActions={remainingFreeActions}
          totalAllowance={quotaState.dailyAllowance}
          purchasedActions={quotaState.purchasedBalance}
          hasCustomKey={quotaState.hasCustomKey}
          isInfinite={quotaState.monthlyPlan === 'infinite'}
          onOpenPricing={() => {
            setPricingInitialTab('pricing');
            setIsPricingModalOpen(true);
          }}
        />
      </div>

      <Modal
        isOpen={isResetModalOpen}
        onConfirm={handleReset}
        onCancel={() => setIsResetModalOpen(false)}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        initialTab={authModalTab}
        onResetData={() => {
          setIsAuthModalOpen(false);
          setIsResetModalOpen(true);
        }}
      />

      <PricingModal
        isOpen={isPricingModalOpen}
        onClose={() => {
          setIsPricingModalOpen(false);
          setHighlightActionExhausted(false);
        }}
        initialTab={pricingInitialTab}
        highlightActionExhausted={highlightActionExhausted}
        onOpenAuth={(tab) => {
          setAuthModalTab(tab || 'signup');
          setIsAuthModalOpen(true);
        }}
      />

      <SavedAdventuresModal
        isOpen={isSavedAdventuresModalOpen}
        onClose={() => setIsSavedAdventuresModalOpen(false)}
        onLoadAdventure={handleLoadSavedAdventure}
        onSaveCurrent={handleSaveCurrentAdventure}
        onOpenPricing={() => {
          setPricingInitialTab('subscriptions');
          setIsPricingModalOpen(true);
        }}
        onOpenCommunity={() => {
          setIsSavedAdventuresModalOpen(false);
          navigateTo('community');
        }}
        hasCurrentActiveAdventure={narrative.length > 0}
      />
    </div>
  );
}

export default App;
