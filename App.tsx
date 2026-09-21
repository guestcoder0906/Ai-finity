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
import UndoModal from './components/UndoModal';
import { HistoryService } from './services/historyService';
import GoldenName from './components/GoldenName';
import { LoadingScreen } from './components/LoadingScreen';
import { ReceiptModal } from './components/ReceiptModal';
import { PurchaseNotificationBanner } from './components/PurchaseNotificationBanner';
import { LiveStatusUpdates } from './components/LiveStatusUpdates';
import { auth, db } from './services/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  UserProfile,
  subscribeToAuth,
  logOut,
  getOrCreateGuestId,
  generateUniqueGuestMultiplayerName,
  recordPaymentTransaction,
  PaymentTransactionRecord,
  getLocalTransactions,
  getUserTransactions,
  getUserProfile,
  enrichUserProfileWithDefaults
} from './services/authService';
import { syncUserPurchasesFromStripe } from './services/stripeCheckoutService';
import { ActionLimitService, ActionStatus } from './services/actionLimitService';
import { SavedAdventure, CommunityAdventure } from './services/adventuresService';
import {
  Compass,
  User,
  LogIn,
  LogOut as LogOutIcon,
  ShoppingCart,
  Bookmark,
  Globe,
  Zap,
  Crown,
  Menu,
  ChevronDown as ChevronDownIcon,
  ChevronUp as ChevronUpIcon,
  FileText,
  Map as MapIcon,
  Receipt as ReceiptIcon,
  CheckCircle2,
  Sparkles,
  PanelLeftOpen,
  PanelLeftClose,
  RotateCcw
} from 'lucide-react';

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
  const [isUndoModalOpen, setIsUndoModalOpen] = useState(false);
  const [undoCount, setUndoCount] = useState<number>(() => HistoryService.getCount());
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

  // App initialization & full loading gate
  const [isAppFullyLoaded, setIsAppFullyLoaded] = useState<boolean>(false);
  const [authInitialized, setAuthInitialized] = useState<boolean>(false);

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
  const [isMobileTopMenuOpen, setIsMobileTopMenuOpen] = useState(false);
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);
  const [mobilePanelTab, setMobilePanelTab] = useState<'files' | 'map'>('files');
  // Sidebar minimizable & expandable (minimized by default)
  const [isSidebarMinimized, setIsSidebarMinimized] = useState<boolean>(true);

  const [stripeReturnMessage, setStripeReturnMessage] = useState<{
    type: 'success' | 'info' | 'error';
    text: string;
  } | null>(null);
  const [verifiedReceiptTransaction, setVerifiedReceiptTransaction] = useState<PaymentTransactionRecord | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  // Dynamically keep app height strictly bounded to mobile visual viewport (handles address bar and virtual keyboard)
  useEffect(() => {
    const updateAppHeight = () => {
      const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      document.documentElement.style.setProperty('--app-height', `${h}px`);
    };
    updateAppHeight();
    window.addEventListener('resize', updateAppHeight);
    window.addEventListener('orientationchange', updateAppHeight);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateAppHeight);
      window.visualViewport.addEventListener('scroll', updateAppHeight);
    }
    return () => {
      window.removeEventListener('resize', updateAppHeight);
      window.removeEventListener('orientationchange', updateAppHeight);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateAppHeight);
        window.visualViewport.removeEventListener('scroll', updateAppHeight);
      }
    };
  }, []);

  const refreshActionStatus = useCallback(() => {
    setActionStatus(ActionLimitService.getActionStatus(currentUser, guestId));
  }, [currentUser, guestId]);

  const isSyncingPurchasesRef = useRef(false);
  const notifiedPurchaseIdsRef = useRef<Set<string>>(new Set());
  const lastPurchaseToastTimeRef = useRef<number>(0);

  // Unified automatic purchase sync engine:
  // Strictly attributes completed purchases ONLY to the exact account that bought them.
  // Automatically detects completed payments via tab focus, visibilitychange, fast polling,
  // and Firestore real-time snapshots — completely eliminating the need for website code rebuilds.
  const syncUserPurchases = useCallback(async (
    targetUser?: UserProfile | null
  ) => {
    const user = targetUser || currentUser;
    if (!user || !user.uid || isSyncingPurchasesRef.current) return;
    isSyncingPurchasesRef.current = true;

    try {
      const syncRes = await syncUserPurchasesFromStripe(
        user.uid,
        user.email || undefined,
        user.username || undefined
      );

      if (syncRes.success) {
        // 1. Sync real-time active monthly subscription if present
        if (syncRes.activeSubscription !== undefined) {
          const syncedSubUser = await ActionLimitService.syncSubscriptionState(
            user,
            syncRes.activeSubscription as any,
            guestId
          );
          if (syncedSubUser) {
            user.tier = syncedSubUser.tier;
            user.stripeSubscriptionId = syncedSubUser.stripeSubscriptionId;
            user.subscriptionExpiresAt = syncedSubUser.subscriptionExpiresAt;
            setCurrentUser({ ...syncedSubUser });
            setActionStatus(ActionLimitService.getActionStatus(syncedSubUser, guestId));
          }
        }

        // 2. Cross-reference all completed purchases attached to this account
        if (syncRes.purchases && syncRes.purchases.length > 0) {
          // Collect known transactions from localStorage
          const localTx = getLocalTransactions(user.uid);
          const knownIds = new Set<string>();
          localTx.forEach((t) => {
            if (t?.id) {
              knownIds.add(t.id);
              knownIds.add(String(t.id).replace(/[^a-zA-Z0-9_-]/g, '_'));
            }
          });

          // Also load persistently notified IDs from localStorage to avoid spamming after page reload
          try {
            const rawNotified = localStorage.getItem(`aifinity_notified_purchases_${user.uid}`);
            if (rawNotified) {
              const parsed = JSON.parse(rawNotified);
              if (Array.isArray(parsed)) {
                parsed.forEach((id: string) => {
                  knownIds.add(id);
                  notifiedPurchaseIdsRef.current.add(id);
                });
              }
            }
          } catch (e) {}

          // Cross-reference Firestore transactions
          try {
            const firestoreTx = await getUserTransactions(user.uid);
            firestoreTx.forEach((t) => {
              if (t?.id) {
                knownIds.add(t.id);
                knownIds.add(String(t.id).replace(/[^a-zA-Z0-9_-]/g, '_'));
              }
            });
          } catch (e) {
            // ignore
          }

          // Include in-memory notified IDs to prevent any duplicate toast notifications
          notifiedPurchaseIdsRef.current.forEach((id) => knownIds.add(id));

          let totalNewCredits = 0;
          let newlyFoundPurchases = false;
          let latestReceipt: PaymentTransactionRecord | null = null;

          const tierRank: Record<string, number> = {
            free: 0,
            adventurer: 1,
            legendary: 2,
            celestial: 3
          };

          let bestPurchasedTier: 'adventurer' | 'legendary' | 'celestial' | null = null;

          for (const p of syncRes.purchases) {
            if (p.itemType === 'tier' && p.itemId) {
              const rank = tierRank[p.itemId] || 0;
              const currentBestRank = bestPurchasedTier ? tierRank[bestPurchasedTier] : 0;
              if (rank > currentBestRank) {
                bestPurchasedTier = p.itemId as any;
              }
            }

            const safeId = String(p.id).replace(/[^a-zA-Z0-9_-]/g, '_');
            const isAlreadyKnown =
              knownIds.has(p.id) ||
              knownIds.has(safeId) ||
              notifiedPurchaseIdsRef.current.has(p.id) ||
              notifiedPurchaseIdsRef.current.has(safeId);

            if (!isAlreadyKnown) {
              newlyFoundPurchases = true;
              knownIds.add(p.id);
              knownIds.add(safeId);
              notifiedPurchaseIdsRef.current.add(p.id);
              notifiedPurchaseIdsRef.current.add(safeId);

              if (p.itemType === 'pack' && p.actionDelta > 0) {
                totalNewCredits += p.actionDelta;
              }

              const tx: PaymentTransactionRecord = {
                id: p.id,
                amount: p.amount,
                itemName: p.itemName,
                itemType: p.itemType,
                paymentMethod: p.paymentMethod || 'Stripe Checkout',
                status: 'completed',
                createdAt: p.createdAt,
                customerName: p.customerName || p.username || user.username || 'Adventurer',
                email: p.email || user.email || undefined,
                attachedUsername: p.username || user.username || 'Adventurer',
                recipient: p.username || user.username || user.email || 'Adventurer',
                notes: p.itemType === 'pack' ? `Restored ${p.actionDelta} actions` : `Activated ${p.itemName}`,
                actionDelta: p.actionDelta,
                newTier: p.itemType === 'tier' ? p.itemId : undefined,
                userId: p.userId || user.uid
              };

              await recordPaymentTransaction(user.uid, tx);
              latestReceipt = tx;
            }
          }

          // Persist all known IDs to localStorage so notifications never spam
          try {
            const allKnown = Array.from(knownIds);
            localStorage.setItem(`aifinity_notified_purchases_${user.uid}`, JSON.stringify(allKnown.slice(-100)));
          } catch (e) {}

          const currentTierRank = tierRank[user.tier || 'free'] || 0;
          const bestRank = bestPurchasedTier ? (tierRank[bestPurchasedTier] || 0) : 0;
          const needsTierUpgrade = Boolean(bestPurchasedTier && bestRank > currentTierRank);

          if ((newlyFoundPurchases && totalNewCredits > 0) || needsTierUpgrade) {
            const targetTier = needsTierUpgrade ? bestPurchasedTier : (bestPurchasedTier || undefined);
            const updated = await ActionLimitService.applyRestoredPurchases(
              user,
              totalNewCredits,
              targetTier as any,
              guestId
            );
            setCurrentUser({ ...updated });
            setActionStatus(ActionLimitService.getActionStatus(updated, guestId));

            // Only show toast and receipt modal if there was genuinely a NEW purchase and we haven't shown one in the last 15s
            const now = Date.now();
            if (newlyFoundPurchases && now - lastPurchaseToastTimeRef.current > 15000) {
              lastPurchaseToastTimeRef.current = now;
              if (latestReceipt) {
                setVerifiedReceiptTransaction(latestReceipt);
                setIsReceiptModalOpen(true);
              }

              setStripeReturnMessage({
                type: 'success',
                text: `🎉 Membership & Purchases Applied! ${user.username}'s account is now ${updated.tier.toUpperCase()} tier${updated.actionCredits ? ` with ${updated.actionCredits} action credits` : ''}.`
              });
            }

            // Cross-tab broadcast
            try {
              localStorage.setItem(
                'aifinity_payment_sync_event',
                JSON.stringify({ uid: user.uid, time: Date.now() })
              );
            } catch (e) {}
          }

          // Clear active checkout markers so background polling stops immediately once verified
          try {
            sessionStorage.removeItem('aifinity_active_stripe_checkout');
            localStorage.removeItem('aifinity_active_stripe_checkout');
            if (newlyFoundPurchases) {
              sessionStorage.removeItem('aifinity_pending_checkout');
              localStorage.removeItem('aifinity_pending_checkout');
            }
          } catch (e) {}
        }
      }
    } catch (syncErr) {
      console.warn('Auto sync purchases failed:', syncErr);
    } finally {
      isSyncingPurchasesRef.current = false;
    }
  }, [currentUser, guestId]);

  // Real-time Firestore user profile listener
  // Automatically syncs whenever actions, credits, or tier change in the database
  useEffect(() => {
    if (!currentUser?.uid) return;
    const uid = currentUser.uid;
    const userDocRef = doc(db, 'users', uid);

    const unsub = onSnapshot(
      userDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as UserProfile;
          const enriched = enrichUserProfileWithDefaults(data);
          setCurrentUser((prev) => {
            if (!prev || prev.uid !== uid) return prev;
            if (
              prev.actionCredits !== enriched.actionCredits ||
              prev.tier !== enriched.tier ||
              prev.dailyActionsUsed !== enriched.dailyActionsUsed ||
              prev.role !== enriched.role ||
              prev.hasInfiniteActions !== enriched.hasInfiniteActions
            ) {
              setActionStatus(ActionLimitService.getActionStatus(enriched, guestId));
              return { ...prev, ...enriched };
            }
            return prev;
          });
        }
      },
      (error) => {
        console.warn('Firestore user profile onSnapshot error:', error);
      }
    );

    return () => unsub();
  }, [currentUser?.uid, guestId]);

  // Immediate sync on tab return or window focus (e.g. after customer pays in Stripe tab)
  useEffect(() => {
    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible' && currentUser?.uid) {
        syncUserPurchases(currentUser);
      }
    };
    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);
    return () => {
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
    };
  }, [currentUser, syncUserPurchases]);

  // Automatic high-frequency poller for active checkout + regular background heartbeat
  useEffect(() => {
    if (!currentUser?.uid) return;

    // Fast polling (every 3s) when a Stripe checkout was initiated recently
    const fastInterval = setInterval(() => {
      try {
        const raw =
          sessionStorage.getItem('aifinity_active_stripe_checkout') ||
          localStorage.getItem('aifinity_active_stripe_checkout');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Date.now() - (parsed.startedAt || 0) < 2 * 60 * 1000) {
            syncUserPurchases(currentUser);
          } else {
            sessionStorage.removeItem('aifinity_active_stripe_checkout');
            localStorage.removeItem('aifinity_active_stripe_checkout');
          }
        }
      } catch (e) {}
    }, 3000);

    // Regular background heartbeat every 60s while logged in (passive sync)
    const heartbeatInterval = setInterval(() => {
      syncUserPurchases(currentUser);
    }, 60000);

    return () => {
      clearInterval(fastInterval);
      clearInterval(heartbeatInterval);
    };
  }, [currentUser, syncUserPurchases]);

  // Listen to Firebase Auth state for automatic persistent login and purchase fulfillment
  useEffect(() => {
    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === 'aifinity_payment_sync_event' || e.key === 'aifinity_user_actions') {
        refreshActionStatus();
        if (currentUser?.uid) {
          getUserProfile(currentUser.uid, true).then((freshProfile) => {
            if (freshProfile) {
              setCurrentUser({ ...freshProfile });
              setActionStatus(ActionLimitService.getActionStatus(freshProfile, guestId));
            }
          });
        }
      }
    };
    window.addEventListener('storage', handleStorageEvent);

    const unsubscribe = subscribeToAuth(async (user) => {
      setCurrentUser(user);
      setActionStatus(ActionLimitService.getActionStatus(user, guestId));
      if (user) {
        setIsGuestWelcomeOpen(false);
        setIsActionLimitModalOpen(false);

        // Immediately auto-sync Stripe purchases for this specific logged-in user
        await syncUserPurchases(user);
      }
      setAuthInitialized(true);
    });
    return () => {
      window.removeEventListener('storage', handleStorageEvent);
      unsubscribe();
    };
  }, [guestId, syncUserPurchases]);

  // Mark full load completion once initial session and auth have settled
  useEffect(() => {
    if (authInitialized) {
      const timer = setTimeout(() => {
        setIsAppFullyLoaded(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [authInitialized]);

  // Fallback timer to ensure loading screen dismisses even under slow/offline connections
  useEffect(() => {
    const fallbackTimer = setTimeout(() => {
      setIsAppFullyLoaded(true);
    }, 2500);
    return () => clearTimeout(fallbackTimer);
  }, []);

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

  // Robust Welcome page route detector
  const isWelcomeRouteActive = (): boolean => {
    if (typeof window === 'undefined') return false;
    const path = (window.location.pathname || '').toLowerCase().replace(/\/+$/, '');
    const hash = (window.location.hash || '').toLowerCase();
    
    // Direct path or subpath check (e.g. /welcome, /welcome/)
    if (path === '/welcome' || path.endsWith('/welcome')) {
      return true;
    }
    // Hash routing check (e.g. #/welcome, #welcome)
    if (hash === '#/welcome' || hash === '#welcome' || hash.includes('welcome')) {
      return true;
    }
    // Query param redirect check from static 404 handlers
    try {
      const search = new URLSearchParams(window.location.search || '');
      const param = search.get('route') || search.get('p') || search.get('page') || search.get('redirect');
      if (param && param.toLowerCase().includes('welcome')) {
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  };

  // Route state for /welcome and /
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      if (isWelcomeRouteActive()) {
        return '/welcome';
      }
      return window.location.pathname || '/';
    }
    return '/';
  });

  // Catch returns from Stripe Checkout sessions
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('stripe_session_id');
    const stripeStatusParam = urlParams.get('stripe_status');

    if (sessionId) {
      try {
        const cleanPath = window.location.pathname || '/';
        window.history.replaceState({}, '', cleanPath);
      } catch (e) {
        console.warn('History replaceState skipped:', e);
      }

      fetch(`/api/stripe/verify-checkout-session?sessionId=${encodeURIComponent(sessionId)}`)
        .then(res => res.json())
        .then(async (data) => {
          if (data.paid || data.status === 'complete' || data.payment_status === 'paid') {
            // Retrieve pending checkout details saved in sessionStorage or localStorage
            let pending: any = null;
            try {
              const rawPending =
                sessionStorage.getItem('aifinity_pending_checkout') ||
                localStorage.getItem('aifinity_pending_checkout');
              if (rawPending) pending = JSON.parse(rawPending);
            } catch (e) {
              console.warn('Could not parse pending checkout:', e);
            }

            const meta = data.metadata || {};
            const itemName = meta.itemName || pending?.itemName || 'Action Pack Purchase';
            const itemType = (meta.itemType || pending?.itemType || 'pack') as 'pack' | 'tier';
            const actionDelta = parseInt(meta.actionDelta, 10) || parseInt(pending?.actionDelta, 10) || 0;
            const itemId = meta.itemId || pending?.itemId || '';
            const amount = typeof data.amount === 'number' && data.amount > 0 ? data.amount : (pending?.amount || 0);

            // Resolve target user ID
            const targetUid =
              meta.userId ||
              pending?.userId ||
              auth.currentUser?.uid ||
              currentUser?.uid ||
              localStorage.getItem('aifinity_last_checkout_user') ||
              '';

            // Allow brief delay if auth is settling on fresh page redirect
            if (targetUid && !auth.currentUser) {
              for (let i = 0; i < 6; i++) {
                if (auth.currentUser) break;
                await new Promise((r) => setTimeout(r, 300));
              }
            }

            const txUsername = meta.username || pending?.username || currentUser?.username || '';
            const txRecord: PaymentTransactionRecord = {
              id: sessionId,
              amount,
              itemName,
              itemType,
              paymentMethod: 'Stripe Checkout',
              status: 'completed',
              createdAt: new Date().toISOString(),
              customerName: data.customerName || (data.customerEmail ? data.customerEmail.split('@')[0] : (currentUser?.username || 'Customer')),
              email: data.customerEmail || currentUser?.email || undefined,
              attachedUsername: txUsername || currentUser?.username || 'Adventurer',
              recipient: txUsername || currentUser?.username || currentUser?.email || 'Adventurer',
              notes: itemType === 'pack' ? `Added ${actionDelta} actions` : `Activated ${itemName}`,
              actionDelta: actionDelta > 0 ? actionDelta : undefined,
              newTier: itemType === 'tier' ? (itemId || itemName) : undefined,
              userId: targetUid || undefined
            };

            if (targetUid) {
              let updatedUser: UserProfile | null = null;
              if (itemType === 'pack' && actionDelta > 0) {
                updatedUser = await ActionLimitService.addPurchasedCreditsByUid(targetUid, actionDelta);
              } else if (itemType === 'tier') {
                const targetTier = (itemId || 'adventurer') as any;
                updatedUser = await ActionLimitService.activateSubscriptionByUid(targetUid, targetTier);
              }

              if (updatedUser) {
                setCurrentUser({ ...updatedUser });
                setActionStatus(ActionLimitService.getActionStatus(updatedUser, guestId));
              } else {
                refreshActionStatus();
              }

              await recordPaymentTransaction(targetUid, txRecord);

              // Broadcast update event to all other open tabs
              try {
                localStorage.setItem(
                  'aifinity_payment_sync_event',
                  JSON.stringify({ uid: targetUid, time: Date.now() })
                );
              } catch (e) {}
            } else {
              refreshActionStatus();
            }

            // Immediately display verified receipt
            setVerifiedReceiptTransaction(txRecord);
            setIsReceiptModalOpen(true);
            setStripeReturnMessage({
              type: 'success',
              text: `🎉 Stripe Payment Verified! Purchase of ${itemName} ($${(Number(amount) || 0).toFixed(2)}) has been credited to your account.`
            });

            try {
              sessionStorage.removeItem('aifinity_pending_checkout');
              localStorage.removeItem('aifinity_pending_checkout');
            } catch (e) {}
          }
        })
        .catch(err => {
          console.error('Failed to verify Stripe checkout session:', err);
        });
    } else if (stripeStatusParam === 'cancelled') {
      try {
        const cleanPath = window.location.pathname || '/';
        window.history.replaceState({}, '', cleanPath);
      } catch (e) {
        console.warn('History replaceState skipped:', e);
      }
      setStripeReturnMessage({
        type: 'info',
        text: 'Stripe Checkout was cancelled.'
      });
    }
  }, [guestId, refreshActionStatus, currentUser?.uid]);

  useEffect(() => {
    const handleLocationChange = () => {
      if (isWelcomeRouteActive()) {
        setCurrentPath('/welcome');
      } else {
        setCurrentPath(window.location.pathname || '/');
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
    if (typeof window !== 'undefined') {
      if (isWelcomeRouteActive()) {
        window.history.pushState({}, '', '/');
        if (window.location.hash.includes('welcome')) {
          window.location.hash = '';
        }
      }
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

        // Record turn snapshot before host executes turn
        HistoryService.pushSnapshot({
          id: Date.now().toString(),
          timestamp: Date.now(),
          turnNumber: HistoryService.getCount() + 1,
          userAction: combinedInput,
          narrative: [...(roomStateRef.current?.narrative || [])],
          updates: [...(roomStateRef.current?.updates || [])],
          recommendations: [...(roomStateRef.current?.recommendations || [])],
          fileSystemState: fileSystem.exportState(),
          worldTime: parseActiveWorldTime(fileSystem.read('WorldTime.txt')),
          gameOver: false
        });
        setUndoCount(HistoryService.getCount());

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

    // Synchronize state when host reverts or undos a turn
    ms.setOnUndoTurn((snapshotData) => {
      if (snapshotData.fileSystemState) {
        fileSystem.importState(snapshotData.fileSystemState);
        syncFiles();
      }
      if (snapshotData.narrative) {
        setNarrative(snapshotData.narrative);
      }
      if (snapshotData.updates) {
        setUpdates(snapshotData.updates);
      }
      if (snapshotData.recommendations) {
        setRecommendations(snapshotData.recommendations);
      }
      if (snapshotData.worldTime) {
        setWorldTime(snapshotData.worldTime);
      }
    });

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
    HistoryService.clearHistory();
    setUndoCount(0);
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
    HistoryService.clearHistory();
    setUndoCount(0);
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
      // Auto save previous turn snapshot before this action executes
      if (isInitialized) {
        HistoryService.pushSnapshot({
          id: Date.now().toString(),
          timestamp: Date.now(),
          turnNumber: HistoryService.getCount() + 1,
          userAction: text,
          narrative: [...narrative],
          updates: [...updates],
          recommendations: [...recommendations],
          fileSystemState: fileSystem.exportState(),
          worldTime: worldTime,
          gameOver: gameOver
        });
        setUndoCount(HistoryService.getCount());
      }

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
      setMobilePanelTab('files');
      setIsMobilePanelOpen(true);
    }
  };

  const handleReset = async () => {
    HistoryService.clearHistory();
    setUndoCount(0);
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

  const handleUndoConfirm = async () => {
    if (gameMode === 'multiplayer') {
      if (!isHost || !multiplayerService) {
        setIsUndoModalOpen(false);
        return;
      }
      const snapshot = HistoryService.popSnapshot();
      if (!snapshot) {
        setIsUndoModalOpen(false);
        return;
      }

      fileSystem.importState(snapshot.fileSystemState);
      syncFiles();

      const restoredNarrative: NarrativeEntry[] = [
        ...snapshot.narrative,
        {
          id: Date.now().toString() + 'system',
          text: `[SYSTEM: The host has reverted the adventure to Turn #${snapshot.turnNumber || 1}]`,
          type: 'system' as const
        }
      ];

      setNarrative(restoredNarrative);
      setUpdates(snapshot.updates || []);
      setRecommendations(snapshot.recommendations || []);
      setGameOver(Boolean(snapshot.gameOver));
      if (snapshot.worldTime) setWorldTime(snapshot.worldTime);

      await multiplayerService.undoTurn({
        fileSystemState: snapshot.fileSystemState,
        narrative: restoredNarrative,
        updates: snapshot.updates || [],
        recommendations: snapshot.recommendations || [],
        worldTime: snapshot.worldTime || '',
        turnNumber: snapshot.turnNumber
      });

      setUndoCount(HistoryService.getCount());
      setIsUndoModalOpen(false);
      return;
    }

    // Singleplayer undo
    const snapshot = HistoryService.popSnapshot();
    if (!snapshot) {
      setIsUndoModalOpen(false);
      return;
    }

    fileSystem.importState(snapshot.fileSystemState);
    syncFiles();

    setNarrative(snapshot.narrative);
    setUpdates(snapshot.updates || []);
    setRecommendations(snapshot.recommendations || []);
    setGameOver(Boolean(snapshot.gameOver));
    if (snapshot.worldTime) setWorldTime(snapshot.worldTime);

    localStorage.setItem('aimud_narrative', JSON.stringify(snapshot.narrative));
    localStorage.setItem('aimud_updates', JSON.stringify(snapshot.updates || []));
    localStorage.setItem('aimud_recommendations', JSON.stringify(snapshot.recommendations || []));

    setUndoCount(HistoryService.getCount());
    setIsUndoModalOpen(false);
  };

  // While application systems, auth, and state are initializing, display the loading screen
  if (!isAppFullyLoaded) {
    return <LoadingScreen statusText="INITIALIZING AIFINITY" />;
  }

  if (currentPath === '/welcome') {
    return (
      <>
        <WelcomePage onEnterGame={handleEnterGame} />
        {/* Floating Verified Receipt Banner on Welcome Page */}
        <PurchaseNotificationBanner
          message={stripeReturnMessage}
          onDismiss={() => setStripeReturnMessage(null)}
          verifiedReceipt={verifiedReceiptTransaction}
          onOpenReceipt={() => setIsReceiptModalOpen(true)}
          onOpenOrderHistory={() => {
            setMarketInitialTab('receipts');
            setIsMarketOpen(true);
          }}
        />
        <ReceiptModal
          isOpen={isReceiptModalOpen}
          onClose={() => setIsReceiptModalOpen(false)}
          transaction={verifiedReceiptTransaction}
          currentUser={currentUser}
        />
      </>
    );
  }

  return (
    <div
      className="flex flex-col md:flex-row w-full bg-black text-gray-200 overflow-hidden relative"
      style={{ height: 'var(--app-height, 100dvh)', maxHeight: 'var(--app-height, 100dvh)' }}
    >
      {/* Stripe Return Notification Banner */}
      <PurchaseNotificationBanner
        message={stripeReturnMessage}
        onDismiss={() => setStripeReturnMessage(null)}
        verifiedReceipt={verifiedReceiptTransaction}
        onOpenReceipt={() => setIsReceiptModalOpen(true)}
        onOpenOrderHistory={() => {
          setMarketInitialTab('receipts');
          setIsMarketOpen(true);
        }}
      />
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
        onUndo={() => {
          if (gameMode === 'multiplayer' && !isHost) return;
          setIsUndoModalOpen(true);
        }}
        undoCount={undoCount}
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
        isMobileOpen={isMobilePanelOpen}
        onCloseMobile={() => setIsMobilePanelOpen(false)}
        mobileTab={mobilePanelTab}
        onSetMobileTab={setMobilePanelTab}
        isMinimized={isSidebarMinimized}
        onToggleMinimize={() => setIsSidebarMinimized(prev => !prev)}
      />

      <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
        {/* Main Game Top Bar */}
        <div className="bg-neutral-900 border-b border-neutral-800 text-xs font-mono shadow-lg z-20 flex flex-col">
          {/* Desktop Top Bar (hidden on small mobile, visible md+) */}
          <div className="hidden md:flex px-3 py-2 justify-between items-center gap-2 flex-wrap text-[11px] md:text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Desktop Sidebar Expand/Collapse Toggle Button */}
              <button
                id="desktop-sidebar-toggle-btn"
                onClick={() => setIsSidebarMinimized(prev => !prev)}
                className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded border border-neutral-700 text-[11px] font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
                title={isSidebarMinimized ? "Expand Sidebar (World Files & Map)" : "Minimize Sidebar"}
              >
                {isSidebarMinimized ? (
                  <>
                    <PanelLeftOpen size={13} className="text-blue-400" />
                    <span className="text-neutral-300">Sidebar</span>
                  </>
                ) : (
                  <>
                    <PanelLeftClose size={13} className="text-neutral-400" />
                    <span className="text-neutral-400">Minimize</span>
                  </>
                )}
              </button>

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
                {actionStatus?.isAlphaPhase ? (
                  <span className="text-[10px] bg-amber-500/20 text-amber-200 border border-amber-500/40 px-1.5 py-0.2 rounded font-sans flex items-center gap-1 font-bold">
                    <Zap size={9} className="text-amber-400" /> Alpha: Unlimited
                  </span>
                ) : actionStatus?.isUnlimited ? (
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

              {/* Undo Turn Button with Confirmation */}
              <button
                id="top-undo-turn-btn"
                onClick={() => {
                  if (gameMode === 'multiplayer' && !isHost) return;
                  setIsUndoModalOpen(true);
                }}
                disabled={isProcessing || undoCount === 0 || (gameMode === 'multiplayer' && !isHost)}
                className={`px-2.5 py-1 rounded border text-[11px] font-mono flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isProcessing || undoCount === 0 || (gameMode === 'multiplayer' && !isHost)
                    ? 'opacity-40 bg-neutral-900 border-neutral-800 text-neutral-500 cursor-not-allowed'
                    : 'bg-neutral-800 hover:bg-neutral-700 text-amber-300 hover:text-amber-200 border-neutral-700'
                }`}
                title={
                  gameMode === 'multiplayer' && !isHost
                    ? "Only the host can undo a turn in multiplayer"
                    : undoCount === 0
                    ? "No previous turns to undo"
                    : `Revert to previous turn (${undoCount} available)`
                }
              >
                <RotateCcw size={13} className={undoCount > 0 ? "text-amber-400" : "text-neutral-500"} />
                <span>Undo Turn{undoCount > 0 ? ` (${undoCount})` : ''}</span>
              </button>

              <span className="text-neutral-600">|</span>
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
                    tier={currentUser.tier}
                    showGlowingName={currentUser.showGlowingName}
                    isGolden={currentUser.tier === 'legendary'}
                    className="font-bold text-white"
                  />
                  <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-semibold ${
                    currentUser.tier === 'celestial'
                      ? 'bg-gradient-to-r from-sky-950 to-purple-950 text-cyan-200 border border-cyan-400/60 shadow-[0_0_8px_rgba(56,189,248,0.4)] flex items-center gap-0.5'
                      : currentUser.tier === 'legendary'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-0.5'
                      : currentUser.tier === 'adventurer'
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                        : 'bg-neutral-800 text-neutral-400'
                  }`}>
                    {currentUser.tier === 'celestial' && <Sparkles size={9} className="text-cyan-300 animate-pulse" />}
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

          {/* Mobile Top Bar (Single compact line on < md) */}
          <div className="flex md:hidden px-2.5 py-1.5 justify-between items-center gap-1 text-[10px] sm:text-[10.5px]">
            <div className="flex items-center gap-1 min-w-0">
              <button
                onClick={() => {
                  setMobilePanelTab('files');
                  setIsMobilePanelOpen(true);
                }}
                className="px-2 py-0.5 rounded bg-blue-950/80 active:bg-blue-900 border border-blue-800/80 text-blue-300 font-semibold flex items-center gap-1 shrink-0 transition-colors active:scale-95"
                title="Open World Files & Character Sheet"
              >
                <FileText size={11} className="text-blue-400" />
                <span>Files ({files.length})</span>
              </button>
              <button
                onClick={() => {
                  setMobilePanelTab('map');
                  setIsMobilePanelOpen(true);
                }}
                className="px-2 py-0.5 rounded bg-emerald-950/80 active:bg-emerald-900 border border-emerald-800/80 text-emerald-300 font-semibold flex items-center gap-1 shrink-0 transition-colors active:scale-95"
                title="Open Map"
              >
                <MapIcon size={11} className="text-emerald-400" />
                <span>Map</span>
              </button>
              <span className="text-blue-400 font-semibold tracking-wide truncate max-w-[70px] sm:max-w-[120px]" title={worldTime}>
                {worldTime || "TIME"}
              </span>
              {gameMode === 'multiplayer' && roomState && (
                <span className="text-emerald-400 text-[9px] bg-emerald-950/70 border border-emerald-800/60 px-1 py-0.2 rounded truncate">
                  {roomState.id}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {/* Compact Market / Actions status */}
              <button
                onClick={() => {
                  setMarketInitialTab('packs');
                  setIsMarketOpen(true);
                }}
                className="px-2 py-0.5 bg-amber-500/10 active:bg-amber-500/20 text-amber-300 rounded border border-amber-500/40 text-[10px] flex items-center gap-1"
                title="Aifinity Market"
              >
                <Zap size={10} className="text-amber-400" />
                {actionStatus?.isUnlimited ? (
                  <span className="font-bold">Unlimited</span>
                ) : actionStatus?.isGuest ? (
                  <span>{actionStatus?.guestActionsRemaining ?? 0}/{actionStatus?.guestActionsTotal ?? 3}</span>
                ) : (
                  <span>{actionStatus?.dailyFreeRemaining ?? 0}/{actionStatus?.dailyFreeTotal ?? 20}</span>
                )}
              </button>

              {/* Mobile Undo Button */}
              <button
                id="mobile-undo-btn"
                onClick={() => {
                  if (gameMode === 'multiplayer' && !isHost) return;
                  setIsUndoModalOpen(true);
                }}
                disabled={isProcessing || undoCount === 0 || (gameMode === 'multiplayer' && !isHost)}
                className={`px-2 py-0.5 rounded border text-[10px] flex items-center gap-1 transition-colors ${
                  isProcessing || undoCount === 0 || (gameMode === 'multiplayer' && !isHost)
                    ? 'opacity-40 bg-neutral-900 border-neutral-800 text-neutral-500'
                    : 'bg-neutral-800 text-amber-300 border-neutral-700 active:bg-neutral-700'
                }`}
                title="Undo Turn"
              >
                <RotateCcw size={10} className={undoCount > 0 ? "text-amber-400" : "text-neutral-500"} />
                <span>Undo{undoCount > 0 ? ` (${undoCount})` : ''}</span>
              </button>

              {/* Expandable Menu Toggle */}
              <button
                onClick={() => setIsMobileTopMenuOpen(!isMobileTopMenuOpen)}
                className={`px-2 py-0.5 rounded border text-[10.5px] font-mono flex items-center gap-1 transition-colors ${
                  isMobileTopMenuOpen
                    ? 'bg-blue-900/60 border-blue-700 text-blue-200'
                    : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
                }`}
                title="Navigation & Account Menu"
              >
                <Menu size={11} />
                <span>{isMobileTopMenuOpen ? 'Close' : 'Menu'}</span>
                {isMobileTopMenuOpen ? <ChevronUpIcon size={11} /> : <ChevronDownIcon size={11} />}
              </button>
            </div>
          </div>

          {/* Expandable Mobile Navigation Drawer */}
          {isMobileTopMenuOpen && (
            <div className="md:hidden bg-neutral-950 border-t border-neutral-800 p-2 text-[10.5px] flex flex-col gap-2 animate-in slide-in-from-top-2 duration-150 shadow-2xl">
              {/* Quick Navigation Buttons */}
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => {
                    setIsMobileTopMenuOpen(false);
                    window.history.pushState({}, '', '/welcome');
                    setCurrentPath('/welcome');
                  }}
                  className="p-1.5 bg-neutral-900 hover:bg-neutral-800 text-blue-300 rounded border border-neutral-800 flex items-center justify-center gap-1 transition-colors"
                >
                  <Compass size={12} className="text-blue-400" />
                  <span>Welcome</span>
                </button>

                <button
                  onClick={() => {
                    setIsMobileTopMenuOpen(false);
                    setIsAdventuresModalOpen(true);
                  }}
                  className="p-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 rounded border border-neutral-800 flex items-center justify-center gap-1 transition-colors"
                >
                  <Bookmark size={12} className="text-blue-400" />
                  <span>Adventures</span>
                </button>

                <button
                  onClick={() => {
                    setIsMobileTopMenuOpen(false);
                    setIsCommunityModalOpen(true);
                  }}
                  className="p-1.5 bg-neutral-900 hover:bg-neutral-800 text-emerald-300 rounded border border-neutral-800 flex items-center justify-center gap-1 transition-colors"
                >
                  <Globe size={12} className="text-emerald-400" />
                  <span>Community</span>
                </button>
              </div>

              {/* World Files and Map Links in Mobile Menu */}
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => {
                    setIsMobileTopMenuOpen(false);
                    setMobilePanelTab('files');
                    setIsMobilePanelOpen(true);
                  }}
                  className="p-1.5 bg-neutral-900 hover:bg-neutral-800 text-blue-300 rounded border border-neutral-800 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <FileText size={12} className="text-blue-400" />
                  <span>Files & Character</span>
                </button>
                <button
                  onClick={() => {
                    setIsMobileTopMenuOpen(false);
                    setMobilePanelTab('map');
                    setIsMobilePanelOpen(true);
                  }}
                  className="p-1.5 bg-neutral-900 hover:bg-neutral-800 text-emerald-300 rounded border border-neutral-800 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <MapIcon size={12} className="text-emerald-400" />
                  <span>Interactive Map</span>
                </button>
              </div>

              {/* Undo Turn Action in Mobile Drawer */}
              <button
                onClick={() => {
                  setIsMobileTopMenuOpen(false);
                  if (gameMode === 'multiplayer' && !isHost) return;
                  setIsUndoModalOpen(true);
                }}
                disabled={isProcessing || undoCount === 0 || (gameMode === 'multiplayer' && !isHost)}
                className={`p-1.5 rounded border text-[11px] font-mono flex items-center justify-center gap-1.5 transition-colors ${
                  isProcessing || undoCount === 0 || (gameMode === 'multiplayer' && !isHost)
                    ? 'opacity-40 bg-neutral-900 border-neutral-800 text-neutral-500 cursor-not-allowed'
                    : 'bg-neutral-900 hover:bg-neutral-800 text-amber-300 border-neutral-800'
                }`}
              >
                <RotateCcw size={12} className={undoCount > 0 ? "text-amber-400" : "text-neutral-500"} />
                <span>Undo Turn{undoCount > 0 ? ` (${undoCount} available)` : ''}</span>
              </button>

              {/* User / Account Section in Mobile Menu */}
              <div className="bg-neutral-900/80 p-2 rounded border border-neutral-800 flex items-center justify-between gap-2">
                {currentUser ? (
                  <>
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
                      <GoldenName
                        name={currentUser.username}
                        role={currentUser.role}
                        tier={currentUser.tier}
                        showGlowingName={currentUser.showGlowingName}
                        isGolden={currentUser.tier === 'legendary'}
                        className="font-bold text-white text-[11px] truncate"
                      />
                      <span className={`text-[9px] px-1 py-0.2 rounded uppercase ${
                        currentUser.tier === 'celestial'
                          ? 'bg-gradient-to-r from-sky-950 to-purple-950 text-cyan-200 border border-cyan-400/60'
                          : currentUser.tier === 'legendary'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : currentUser.tier === 'adventurer'
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                          : 'bg-neutral-800 text-neutral-400'
                      }`}>
                        {currentUser.tier || 'free'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => {
                          setIsMobileTopMenuOpen(false);
                          setIsAccountModalOpen(true);
                        }}
                        className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded border border-neutral-700 text-[10px] flex items-center gap-1"
                      >
                        <User size={10} />
                        <span>Account</span>
                      </button>
                      <button
                        onClick={() => {
                          setIsMobileTopMenuOpen(false);
                          handleLogout();
                        }}
                        className="px-1.5 py-1 text-red-400 hover:text-red-300 text-[10px] underline"
                      >
                        Log Out
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5 truncate text-[10.5px]">
                      <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0"></span>
                      <span className="text-amber-300 truncate">
                        {guestName ? `${guestName} (Guest)` : 'Guest Player'}
                      </span>
                      <button
                        onClick={() => {
                          setIsMobileTopMenuOpen(false);
                          setIsGuestNameModalOpen(true);
                        }}
                        className="text-neutral-400 hover:text-amber-300 text-[9.5px] underline ml-1"
                      >
                        Edit
                      </button>
                    </div>

                    <button
                      onClick={() => {
                        setIsMobileTopMenuOpen(false);
                        setIsAuthModalOpen(true);
                      }}
                      className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[10.5px] font-semibold flex items-center gap-1 shrink-0"
                    >
                      <LogIn size={11} />
                      <span>Log In</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <NarrativeWindow
          history={narrative}
          onReferenceClick={handleReferenceClick}
          debugMode={debugMode}
          fileSystem={fileSystem}
          username={activeGameUsername}
        />

        {/* Floating Status Updates */}
        <LiveStatusUpdates updates={updates} gameOver={gameOver} />

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

      <UndoModal
        isOpen={isUndoModalOpen}
        onConfirm={handleUndoConfirm}
        onCancel={() => setIsUndoModalOpen(false)}
        previousSnapshot={HistoryService.peekSnapshot()}
        isMultiplayer={gameMode === 'multiplayer'}
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
        onProfileUpdated={(updated) => {
          setCurrentUser({ ...updated });
          setActionStatus(ActionLimitService.getActionStatus(updated, guestId));
        }}
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
        onStatusUpdated={() => {
          if (currentUser) {
            setActionStatus(ActionLimitService.getActionStatus(currentUser, guestId));
          }
        }}
      />

      {/* Official Digital Tax Invoice & Receipt Modal */}
      <ReceiptModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        transaction={verifiedReceiptTransaction}
        currentUser={currentUser}
      />
    </div>
  );
}

export default App;
