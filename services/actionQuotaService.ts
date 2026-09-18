/**
 * Pricing, Quotas, and Action Management Service - Aifinity Market
 * 
 * Rules:
 * - Each unique registered account has its own unique actions left data stored under its username.
 * - All registered accounts are Beta/Alpha testers by default:
 *   [Free tier] 10 Free daily actions (20 actions during Beta/Alpha phase!)
 *   Resets daily at midnight local time. Does not stack.
 * - Guest users receive 3 free lifetime actions (saved in localStorage, does not reset on reload or daily).
 * - When a user logs out, their active quota data immediately reverts back to their saved guest version (which is max 3 or less).
 * - Guests cannot purchase action packs or subscriptions until they log in / create an account.
 * - If free limit is exhausted, players can also play with their own Gemini API key (unlimited actions).
 * - Aifinity Market Packs:
 *   - $2.99 Pouch Pack (20 actions) ➔ 15¢ per turn
 *   - $4.99 Bag Pack (50 actions) ➔ 10¢ per turn
 *   - $9.99 Chest Pack (150 actions) ➔ 6¢ per turn
 *   - $14.99 Treasure Pack (300 actions) ➔ 5¢ per turn
 *   - $19.99 Royal Pack (500 actions) ➔ 4¢ per turn! (Best Value 🔥)
 * - Subscriptions:
 *   - [📜 Adventurer Tier] $9.99/mo ➔ 10 Free daily actions + 200 monthly actions + Get permanent access to saving multiple adventures and sharing adventures in Community adventures!
 *   - [🌌 Legendary Tier] $19.99/mo ➔ UNLIMITED actions + Golden name
 */

import { authService } from './authService';
import { userService, UserProfile } from './userService';

export interface ActionQuotaState {
  isBetaAlpha: boolean;
  dailyAllowance: number; // 20 for beta/alpha (10 base + 10 beta), 10 for standard
  dailyUsed: number;
  purchasedBalance: number; // Stored bought actions
  monthlyPlan: 'none' | 'adventurer' | 'infinite'; // 'adventurer' ($9.99/mo) or 'infinite' ($19.99/mo Legendary)
  monthlyRenewsAt?: number;
  hasCustomKey: boolean;
  lastResetDate: string; // YYYY-MM-DD
  isGuest: boolean;
  guestActionsUsed: number;
  guestAllowance: number; // 3 lifetime actions
  profile?: import('./userService').UserProfile | null;
}

export interface UserQuotaRecord {
  username: string;
  dailyAllowance: number;
  dailyUsed: number;
  purchasedBalance: number;
  monthlyPlan: 'none' | 'adventurer' | 'infinite';
  monthlyRenewsAt?: number;
  lastResetDate: string;
  isBetaAlpha: boolean;
}

export interface PricingTier {
  id: string;
  name: string;
  price: string;
  actionsText: string;
  actionsAmount: number;
  rateText?: string;
  isPopular?: boolean;
  isBestDeal?: boolean;
  type: 'pack' | 'subscription';
  perks: string[];
}

export const ACTION_PACKS: PricingTier[] = [
  {
    id: 'pack_20',
    name: 'Pouch Pack',
    price: '$2.99',
    actionsText: '20 actions',
    actionsAmount: 20,
    rateText: '15¢ per turn',
    type: 'pack',
    perks: ['20 actions added to your balance', '15¢ per turn', 'Never expires', 'Stacks with daily actions']
  },
  {
    id: 'pack_50',
    name: 'Bag Pack',
    price: '$4.99',
    actionsText: '50 actions',
    actionsAmount: 50,
    rateText: '10¢ per turn',
    type: 'pack',
    perks: ['50 actions added to your balance', '10¢ per turn', 'Never expires', 'Stacks with daily actions']
  },
  {
    id: 'pack_150',
    name: 'Chest Pack',
    price: '$9.99',
    actionsText: '150 actions',
    actionsAmount: 150,
    rateText: '6¢ per turn',
    type: 'pack',
    perks: ['150 actions added to your balance', '6¢ per turn', 'Never expires', 'Great for extended campaigns']
  },
  {
    id: 'pack_300',
    name: 'Treasure Pack',
    price: '$14.99',
    actionsText: '300 actions',
    actionsAmount: 300,
    rateText: '5¢ per turn',
    type: 'pack',
    perks: ['300 actions added to your balance', '5¢ per turn', 'Never expires', 'Deep campaign runner']
  },
  {
    id: 'pack_500',
    name: 'Royal Pack',
    price: '$19.99',
    actionsText: '500 actions',
    actionsAmount: 500,
    rateText: '4¢ per turn! (Best Value 🔥)',
    isBestDeal: true,
    type: 'pack',
    perks: ['500 actions added to your balance', '4¢ per turn! (Best Value 🔥)', 'Never expires', 'Lowest cost per action']
  }
];

export const MONTHLY_SUBSCRIPTIONS: PricingTier[] = [
  {
    id: 'sub_adventurer',
    name: '📜 Adventurer Tier',
    price: '$9.99 / mo',
    actionsText: '10 Free daily + 200 monthly',
    actionsAmount: 200,
    rateText: '10 Free daily actions + 200 monthly actions',
    isPopular: true,
    type: 'subscription',
    perks: [
      '10 Free daily actions + 200 monthly actions',
      'Permanent access to saving multiple adventures',
      'Sharing adventures in Community adventures!'
    ]
  },
  {
    id: 'sub_infinite',
    name: '🌌 Legendary Tier',
    price: '$19.99 / mo',
    actionsText: 'UNLIMITED actions + Golden name',
    actionsAmount: 999999,
    rateText: 'UNLIMITED actions + Golden name',
    type: 'subscription',
    perks: [
      'UNLIMITED actions (rate limits apply)',
      'Golden name styling in singleplayer & multiplayer',
      'Permanent access to saving multiple adventures',
      'Sharing adventures in Community adventures!',
      'Priority AI generation latency'
    ]
  }
];

const STORAGE_KEY_USER_QUOTA_PREFIX = 'aifinity_quota_user_';
const STORAGE_KEY_GUEST_ACTIONS_USED = 'aifinity_guest_actions_used';
const STORAGE_KEY_RESET_ZERO_APPLIED = 'aifinity_actions_reset_to_zero_v4';
export const GUEST_ACTION_LIMIT = 3;

/**
 * Master Beta Phase variable.
 * All accounts and new accounts are beta users as long as IS_BETA_PHASE is true (giving 20 daily free actions instead of 10).
 * Once this variable is changed to false in code, the beta phase ends and standard 10 free daily actions apply!
 */
export const IS_BETA_PHASE: boolean = true;

export interface SavedAdventure {
  id: string;
  title: string;
  savedAt: number;
  scenarioPrompt: string;
  fileSystemState: any;
  narrative: any[];
  updates: any[];
  initialGeneration?: string;
  worldTime?: string;
}

class ActionQuotaService {
  private state: ActionQuotaState;
  private listeners: Array<() => void> = [];

  constructor() {
    this.state = this.loadCurrentContextState();
    this.checkAndResetDaily();

    // Check one-time reset of all user actions to 0 requested by user
    if (typeof window !== 'undefined' && !localStorage.getItem(STORAGE_KEY_RESET_ZERO_APPLIED)) {
      this.resetAllActionsToZero();
      localStorage.setItem(STORAGE_KEY_RESET_ZERO_APPLIED, 'true');
    }

    // Re-evaluate quota whenever auth session changes (e.g. logging in / out / switching users)
    if (typeof window !== 'undefined') {
      authService.subscribe(() => {
        this.syncWithAuth();
      });
      userService.subscribe(() => {
        const pending = userService.getPendingGrants();
        if (pending > 0) {
           this.state.purchasedBalance += pending;
           this.saveCurrentContextState();
           userService.clearPendingGrants();
           userService.clearGrantsInFirestore();
        }
        // Update local state with latest role/plan privileges
        this.state.profile = userService.getProfile();
        this.notify();
      });
    }
  }

  private getTodayString(): string {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getUserStorageKey(username: string): string {
    return `${STORAGE_KEY_USER_QUOTA_PREFIX}${username.trim().toLowerCase()}`;
  }

  public getGuestActionsUsed(): number {
    if (typeof window === 'undefined') return 0;
    const raw = localStorage.getItem(STORAGE_KEY_GUEST_ACTIONS_USED);
    const parsed = parseInt(raw || '0', 10);
    return isNaN(parsed) ? 0 : Math.min(GUEST_ACTION_LIMIT, Math.max(0, parsed));
  }

  private setGuestActionsUsed(val: number) {
    if (typeof window === 'undefined') return;
    const clamped = Math.min(GUEST_ACTION_LIMIT, Math.max(0, val));
    localStorage.setItem(STORAGE_KEY_GUEST_ACTIONS_USED, clamped.toString());
  }

  /**
   * Load unique quota record for a specific registered user
   */
  public loadUserQuotaRecord(username: string): UserQuotaRecord {
    const key = this.getUserStorageKey(username);
    const today = this.getTodayString();
    const expectedAllowance = IS_BETA_PHASE ? 20 : 10;

    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed: UserQuotaRecord = JSON.parse(raw);
          let modified = false;

          // Always ensure beta status and allowance align with the master IS_BETA_PHASE variable
          if (parsed.isBetaAlpha !== IS_BETA_PHASE) {
            parsed.isBetaAlpha = IS_BETA_PHASE;
            parsed.dailyAllowance = expectedAllowance;
            modified = true;
          }

          // Check daily reset (doesn't stack)
          if (parsed.lastResetDate !== today) {
            parsed.dailyUsed = 0;
            parsed.lastResetDate = today;
            parsed.dailyAllowance = expectedAllowance;
            modified = true;
          }

          if (modified) {
            localStorage.setItem(key, JSON.stringify(parsed));
          }
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Error loading user quota record:', e);
    }

    // Default record for a new unique account
    const newRecord: UserQuotaRecord = {
      username: username.toLowerCase(),
      dailyAllowance: expectedAllowance,
      dailyUsed: 0,
      purchasedBalance: 0,
      monthlyPlan: 'none',
      lastResetDate: today,
      isBetaAlpha: IS_BETA_PHASE
    };

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(key, JSON.stringify(newRecord));
      } catch (e) {}
    }

    return newRecord;
  }

  /**
   * Saves unique quota record for a specific registered user
   */
  public saveUserQuotaRecord(username: string, record: Partial<UserQuotaRecord>) {
    if (typeof window === 'undefined') return;
    const existing = this.loadUserQuotaRecord(username);
    const updated: UserQuotaRecord = { ...existing, ...record };
    try {
      localStorage.setItem(this.getUserStorageKey(username), JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save user quota record:', e);
    }
  }

  /**
   * Load state for the CURRENT active session:
   * - If registered user is logged in: loads their unique user quota record.
   * - If guest (or user logged out): loads saved guest version (max 3 or less).
   */
  private loadCurrentContextState(): ActionQuotaState {
    const today = this.getTodayString();
    const hasCustomKey = typeof window !== 'undefined' ? !!localStorage.getItem('aimud_apikey') : false;

    const session = authService.getSession();
    const isGuest = session.type !== 'registered' || !session.username;
    const guestUsed = this.getGuestActionsUsed();

    if (isGuest) {
      // Guest context: strictly bounded to guest actions (max 3 actions or less)
      return {
        isBetaAlpha: IS_BETA_PHASE,
        dailyAllowance: 0,
        dailyUsed: 0,
        purchasedBalance: 0,
        monthlyPlan: 'none',
        hasCustomKey,
        lastResetDate: today,
        isGuest: true,
        guestActionsUsed: guestUsed,
        guestAllowance: GUEST_ACTION_LIMIT
      };
    }

    // Registered user context: load that specific user's unique actions data
    const userRecord = this.loadUserQuotaRecord(session.username);

    return {
      isBetaAlpha: IS_BETA_PHASE,
      dailyAllowance: userRecord.dailyAllowance,
      dailyUsed: userRecord.dailyUsed,
      purchasedBalance: userRecord.purchasedBalance,
      monthlyPlan: userRecord.monthlyPlan,
      monthlyRenewsAt: userRecord.monthlyRenewsAt,
      hasCustomKey,
      lastResetDate: userRecord.lastResetDate,
      isGuest: false,
      guestActionsUsed: guestUsed,
      guestAllowance: GUEST_ACTION_LIMIT
    };
  }

  private saveCurrentContextState() {
    if (typeof window === 'undefined') return;
    const session = authService.getSession();

    if (session.type === 'registered' && session.username) {
      // Save specifically to this unique user's storage
      this.saveUserQuotaRecord(session.username, {
        dailyAllowance: this.state.dailyAllowance,
        dailyUsed: this.state.dailyUsed,
        purchasedBalance: this.state.purchasedBalance,
        monthlyPlan: this.state.monthlyPlan,
        monthlyRenewsAt: this.state.monthlyRenewsAt,
        lastResetDate: this.state.lastResetDate,
        isBetaAlpha: this.state.isBetaAlpha
      });
    } else {
      // Save guest quota
      this.setGuestActionsUsed(this.state.guestActionsUsed);
    }

    this.notify();
  }

  public checkAndResetDaily() {
    const today = this.getTodayString();
    const session = authService.getSession();
    const expectedAllowance = IS_BETA_PHASE ? 20 : 10;

    if (session.type === 'registered' && session.username) {
      if (
        this.state.lastResetDate !== today ||
        this.state.dailyAllowance !== expectedAllowance ||
        this.state.isBetaAlpha !== IS_BETA_PHASE
      ) {
        if (this.state.lastResetDate !== today) {
          this.state.dailyUsed = 0;
          this.state.lastResetDate = today;
        }
        this.state.isBetaAlpha = IS_BETA_PHASE;
        this.state.dailyAllowance = expectedAllowance;
        this.saveCurrentContextState();
      }
    }
  }

  /**
   * Resets all user actions to 0 right now:
   * - Guest actions left: set to 0 (guestActionsUsed = 3).
   * - All registered user accounts' actions left: set to 0 (dailyUsed = dailyAllowance, purchasedBalance = 0).
   * - Current active state: set actions left to 0.
   */
  public resetAllActionsToZero() {
    const today = this.getTodayString();

    // 1. Reset guest actions: 0 actions left (used = GUEST_ACTION_LIMIT = 3)
    this.setGuestActionsUsed(GUEST_ACTION_LIMIT);

    // 2. Reset every registered account's actions left to 0
    if (typeof window !== 'undefined') {
      const accounts = authService.getAccounts();
      for (const acc of accounts) {
        const key = this.getUserStorageKey(acc.username);
        const record = this.loadUserQuotaRecord(acc.username);
        record.dailyUsed = record.dailyAllowance; // all used up -> 0 remaining
        record.purchasedBalance = 0;
        record.lastResetDate = today;
        try {
          localStorage.setItem(key, JSON.stringify(record));
        } catch (e) {
          console.error('Failed to reset user actions for', acc.username, e);
        }
      }

      // Also clean up any legacy global quota keys
      try {
        localStorage.removeItem('aifinity_quota_state');
      } catch (e) {}
    }

    // 3. Update current active state
    this.state.guestActionsUsed = GUEST_ACTION_LIMIT;
    this.state.dailyUsed = this.state.dailyAllowance;
    this.state.purchasedBalance = 0;
    this.saveCurrentContextState();
    this.notify();
  }

  /**
   * Syncs with authentication changes:
   * When user logs in -> loads their unique account data.
   * When user logs out -> immediately reverts to the saved guest version (max 3 or less).
   */
  public syncWithAuth() {
    this.state = this.loadCurrentContextState();
    this.checkAndResetDaily();
    
    // Attempt to sync with firestore
    const session = authService.getSession();
    if (session.type === 'registered' && session.username) {
      userService.syncProfile(
        session.username,
        this.state.monthlyPlan,
        this.state.purchasedBalance,
        this.state.dailyUsed,
        this.state.lastResetDate
      ).then(() => {
        this.notify();
      });
    } else {
      this.notify();
    }
  }

  public getQuotaState(): ActionQuotaState {
    this.checkAndResetDaily();
    const hasCustomKey = typeof window !== 'undefined' ? !!localStorage.getItem('aimud_apikey') : false;
    this.state.hasCustomKey = hasCustomKey;
    return { ...this.state };
  }

  /**
   * Check if player has Golden Name perk (Legendary Tier: $19.99/mo)
   */
  public isGoldenName(): boolean {
    if (this.state.profile?.role === 'admin' && !this.state.profile?.adminGlowHidden) return true;
    if (this.state.profile?.role === 'mod' && !this.state.profile?.adminGlowHidden) return true;
    return this.state.monthlyPlan === 'infinite' || this.state.profile?.infiniteActionsGranted === true;
  }

  /**
   * Check if player has an available action to perform right now
   */
  public canPerformAction(): {
    allowed: boolean;
    reason?: 'ok' | 'out_of_actions' | 'guest_limit_reached';
    source?: 'custom_key' | 'infinite_plan' | 'guest_free' | 'free_daily' | 'purchased';
    remainingFree: number;
    remainingPurchased: number;
    isGuest: boolean;
  } {
    this.checkAndResetDaily();
    const hasKey = typeof window !== 'undefined' ? !!localStorage.getItem('aimud_apikey') : false;
    const session = authService.getSession();
    const isGuest = session.type !== 'registered' || !session.username;

    if (hasKey) {
      return {
        allowed: true,
        source: 'custom_key',
        remainingFree: isGuest ? Math.max(0, GUEST_ACTION_LIMIT - this.getGuestActionsUsed()) : Math.max(0, this.state.dailyAllowance - this.state.dailyUsed),
        remainingPurchased: this.state.purchasedBalance,
        isGuest
      };
    }

    if (this.state.monthlyPlan === 'infinite' || this.state.profile?.infiniteActionsGranted) {
      return {
        allowed: true,
        source: 'infinite_plan',
        remainingFree: this.state.dailyAllowance,
        remainingPurchased: this.state.purchasedBalance,
        isGuest
      };
    }

    // Guest user quota check (max 3 actions total)
    if (isGuest) {
      const guestUsed = this.getGuestActionsUsed();
      const remainingGuest = Math.max(0, GUEST_ACTION_LIMIT - guestUsed);
      if (remainingGuest > 0) {
        return {
          allowed: true,
          source: 'guest_free',
          remainingFree: remainingGuest,
          remainingPurchased: 0,
          isGuest: true
        };
      }

      return {
        allowed: false,
        reason: 'guest_limit_reached',
        remainingFree: 0,
        remainingPurchased: 0,
        isGuest: true
      };
    }

    // Registered account quota check (20 daily during Beta/Alpha, resets daily, doesn't stack)
    const remainingDaily = Math.max(0, this.state.dailyAllowance - this.state.dailyUsed);
    if (remainingDaily > 0) {
      return {
        allowed: true,
        source: 'free_daily',
        remainingFree: remainingDaily,
        remainingPurchased: this.state.purchasedBalance,
        isGuest: false
      };
    }

    if (this.state.purchasedBalance > 0) {
      return {
        allowed: true,
        source: 'purchased',
        remainingFree: 0,
        remainingPurchased: this.state.purchasedBalance,
        isGuest: false
      };
    }

    return {
      allowed: false,
      reason: 'out_of_actions',
      remainingFree: 0,
      remainingPurchased: 0,
      isGuest: false
    };
  }

  /**
   * Consume an action when player generates a turn.
   */
  public consumeAction(): boolean {
    this.checkAndResetDaily();
    const hasKey = typeof window !== 'undefined' ? !!localStorage.getItem('aimud_apikey') : false;
    if (hasKey) {
      return true; // Using their own personal API key
    }

    if (this.state.monthlyPlan === 'infinite' || this.state.profile?.infiniteActionsGranted) {
      return true;
    }

    const session = authService.getSession();
    const isGuest = session.type !== 'registered' || !session.username;

    if (isGuest) {
      const guestUsed = this.getGuestActionsUsed();
      if (guestUsed < GUEST_ACTION_LIMIT) {
        const nextUsed = guestUsed + 1;
        this.setGuestActionsUsed(nextUsed);
        this.state.guestActionsUsed = nextUsed;
        this.notify();
        return true;
      }
      return false;
    }

    // Registered account
    const remainingDaily = this.state.dailyAllowance - this.state.dailyUsed;
    if (remainingDaily > 0) {
      this.state.dailyUsed += 1;
      this.saveCurrentContextState();
      return true;
    }

    if (this.state.purchasedBalance > 0) {
      this.state.purchasedBalance -= 1;
      this.saveCurrentContextState();
      return true;
    }

    return false;
  }

  /**
   * Check if user can make purchases.
   * Guests are NOT allowed to buy anything until they've logged in.
   */
  public canPurchase(): { allowed: boolean; reason?: string } {
    if (!authService.isLoggedIn()) {
      return {
        allowed: false,
        reason: 'Guest players cannot make purchases. Please create a free account or log in first so your actions and passes are permanently saved to your profile.'
      };
    }
    return { allowed: true };
  }

  /**
   * Add purchased actions from a pack
   */
  public addPurchasedActions(amount: number) {
    this.state.purchasedBalance = (this.state.purchasedBalance || 0) + amount;
    this.saveCurrentContextState();
  }

  /**
   * Activate a monthly subscription ($9.99 Adventurer or $19.99 Legendary)
   */
  public activateSubscription(plan: 'adventurer' | 'infinite') {
    this.state.monthlyPlan = plan;
    this.state.monthlyRenewsAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    if (plan === 'adventurer') {
      this.state.purchasedBalance = (this.state.purchasedBalance || 0) + 200;
    }
    this.saveCurrentContextState();
  }

  /**
   * Toggle beta/alpha user status
   */
  public setBetaAlphaUser(isBeta: boolean) {
    this.state.isBetaAlpha = isBeta;
    this.state.dailyAllowance = isBeta ? 20 : 10;
    if (typeof window !== 'undefined') {
      localStorage.setItem('aifinity_is_beta_user', isBeta ? 'true' : 'false');
    }
    this.saveCurrentContextState();
  }

  /**
   * Check if user is eligible to save MULTIPLE adventures.
   * Free users are locked to 1 active adventure slot;
   * $9.99+ monthly subscribers get permanent access to multiple adventures!
   */
  public canSaveMultipleAdventures(): boolean {
    return this.state.monthlyPlan === 'adventurer' || this.state.monthlyPlan === 'infinite';
  }

  /**
   * Check if user is a paid subscriber with unlimited community posting & saved adventure perks
   */
  public isCommunityUnlimited(): boolean {
    return this.state.monthlyPlan === 'adventurer' || this.state.monthlyPlan === 'infinite' || this.state.profile?.permanentCommunityPostsGranted === true || this.state.profile?.role === 'admin' || this.state.profile?.role === 'mod';
  }

  /**
   * Check if user can post to Community Adventures.
   * Free users: can post their current adventure (max 1 posted adventure active in the community).
   * Adventurer ($9.99/mo) and Legendary ($19.99/mo) subscribers: unlimited community posts from current or saved adventures.
   */
  public canPostToCommunity(userActivePostCount: number = 0, source: 'current' | 'saved' = 'current'): boolean {
    if (this.isCommunityUnlimited()) {
      return true;
    }
    // Free users can only post from 'current', and up to max 1 active post
    if (source === 'saved') {
      return false;
    }
    return userActivePostCount < 1;
  }

  /**
   * Check detailed post eligibility for rich UI feedback
   */
  public checkPostEligibility(userActivePostCount: number = 0, source: 'current' | 'saved' = 'current'): {
    allowed: boolean;
    reason?: string;
    isSubscriber: boolean;
    maxPosts: number;
  } {
    const isSub = this.isCommunityUnlimited();
    if (isSub) {
      return { allowed: true, isSubscriber: true, maxPosts: Infinity };
    }

    if (source === 'saved') {
      return {
        allowed: false,
        reason: 'Sharing saved adventures to the community is an exclusive perk of the Adventurer Tier ($9.99/mo). Free players can post their current active adventure!',
        isSubscriber: false,
        maxPosts: 1
      };
    }

    if (userActivePostCount >= 1) {
      return {
        allowed: false,
        reason: 'Free players can have 1 active adventure in Community Adventures. You can take down your existing posted adventure to share this one, or upgrade to Adventurer ($9.99/mo) for unlimited community posts!',
        isSubscriber: false,
        maxPosts: 1
      };
    }

    return { allowed: true, isSubscriber: false, maxPosts: 1 };
  }

  private getSavedAdventuresStorageKey(): string {
    const session = authService.getSession();
    if (session.type === 'registered' && session.username) {
      return `aifinity_saved_adv_${session.username.trim().toLowerCase()}`;
    }
    return 'aifinity_saved_adv_guest';
  }

  /**
   * Get all saved adventures for the active user account or guest session.
   */
  public getSavedAdventures(): SavedAdventure[] {
    if (typeof window === 'undefined') return [];
    const key = this.getSavedAdventuresStorageKey();
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Error loading saved adventures:', e);
    }
    return [];
  }

  /**
   * Save an adventure to local storage.
   * Free users are locked to 1 active adventure slot;
   * $9.99+ monthly subscribers get permanent access to saving multiple adventures!
   */
  public saveCurrentAdventure(adv: SavedAdventure): { success: boolean; error?: string } {
    if (typeof window === 'undefined') {
      return { success: false, error: 'Cannot save adventure in non-browser context' };
    }

    const currentSaves = this.getSavedAdventures();
    const canSaveMultiple = this.canSaveMultipleAdventures();

    // Check if updating an existing adventure
    const existingIndex = currentSaves.findIndex(s => s.id === adv.id);
    if (existingIndex !== -1) {
      currentSaves[existingIndex] = adv;
      const key = this.getSavedAdventuresStorageKey();
      localStorage.setItem(key, JSON.stringify(currentSaves));
      this.notify();
      return { success: true };
    }

    // If saving a new adventure and free user already has 1 or more saved
    if (currentSaves.length >= 1 && !canSaveMultiple) {
      return {
        success: false,
        error: 'Saving multiple adventures is locked for free users! Upgrade to the Adventurer Pass ($9.99/mo) or Infinite plan to unlock permanent multi-adventure saves.'
      };
    }

    currentSaves.unshift(adv);
    const key = this.getSavedAdventuresStorageKey();
    localStorage.setItem(key, JSON.stringify(currentSaves));
    this.notify();
    return { success: true };
  }

  /**
   * Delete a saved adventure by id
   */
  public deleteSavedAdventure(id: string): void {
    if (typeof window === 'undefined') return;
    const currentSaves = this.getSavedAdventures();
    const filtered = currentSaves.filter(s => s.id !== id);
    const key = this.getSavedAdventuresStorageKey();
    localStorage.setItem(key, JSON.stringify(filtered));
    this.notify();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach(l => {
      try {
        l();
      } catch (e) {
        console.error('Error notifying quota listener:', e);
      }
    });
  }
}

export const actionQuotaService = new ActionQuotaService();
