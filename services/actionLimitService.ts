import { UserProfile, UserTier, UserRole, isDefaultAdmin, updateUserProfile } from './authService';

export interface ActionPack {
  id: string;
  name: string;
  actions: number;
  price: number;
  pricePerTurn?: string;
  badge?: string;
  description: string;
}

export interface SubscriptionTier {
  id: UserTier;
  name: string;
  price: number;
  billingPeriod: string;
  features: string[];
  badge?: string;
  highlight?: boolean;
}

export const ACTION_PACKS: ActionPack[] = [
  {
    id: 'pack_pouch_50',
    name: 'Pouch Pack',
    actions: 50,
    price: 0.99,
    description: 'Quick top-up for a thrilling side quest'
  },
  {
    id: 'pack_bag_100',
    name: 'Bag Pack',
    actions: 100,
    price: 1.99,
    description: 'Great for an extended gaming session'
  },
  {
    id: 'pack_chest_250',
    name: 'Chest Pack',
    actions: 250,
    price: 4.99,
    description: 'Deep world exploration with rich encounters'
  },
  {
    id: 'pack_treasure_500',
    name: 'Treasure Pack',
    actions: 500,
    price: 9.99,
    description: 'Huge supply for serious RPG campaign builders'
  },
  {
    id: 'pack_royal_800',
    name: 'Royal Pack',
    actions: 800,
    price: 14.99,
    badge: 'Best Value 🔥',
    description: 'Maximum power and top tier pack'
  }
];

export const SUBSCRIPTION_TIERS: SubscriptionTier[] = [
  {
    id: 'free',
    name: 'Free Tier',
    price: 0,
    billingPeriod: 'forever',
    features: [
      '10 Free daily actions (+10 Beta bonus = 20 total daily actions!)',
      'Single active adventure save slot',
      'Browse Community Adventures',
      'Standard username styling'
    ]
  },
  {
    id: 'adventurer',
    name: '📜 Adventurer Tier',
    price: 4.99,
    billingPeriod: 'month',
    badge: 'Popular',
    highlight: true,
    features: [
      '10 Free daily actions + 300 monthly bonus actions',
      'Permanent access to saving multiple adventures in Adventures page',
      'Permanent access to posting adventures in Community Adventures',
      'Choose between Full Story, Starting Prompt, or AI Initial World Generation sharing'
    ]
  },
  {
    id: 'legendary',
    name: '🌌 Legendary Tier',
    price: 9.99,
    billingPeriod: 'month',
    badge: 'Great Value',
    highlight: true,
    features: [
      '10 Free daily actions + 600 monthly bonus actions',
      '✨ Golden Name in chat, sidebar, multiplayer & community posts',
      'Permanent access to saving multiple adventures in Adventures page',
      'Permanent access to posting in Community Adventures',
      'Priority generation processing'
    ]
  },
  {
    id: 'celestial',
    name: '✨ Celestial Tier',
    price: 14.99,
    billingPeriod: 'month',
    badge: 'Unlimited 🔥',
    highlight: true,
    features: [
      'UNLIMITED actions (play infinitely with zero action caps)',
      '🌌 Celestial Name (glowing cosmic neon styling like Admin)',
      'Permanent access to saving multiple adventures in Adventures page',
      'Permanent access to posting in Community Adventures',
      'Instant VIP priority generation'
    ]
  }
];

export interface ActionStatus {
  tier: UserTier;
  role?: UserRole;
  hasCustomApiKey: boolean;
  isUnlimited: boolean;
  hasInfiniteActions?: boolean;
  canPerformAction: boolean;
  dailyFreeTotal: number;
  dailyFreeUsed: number;
  dailyFreeRemaining: number;
  purchasedCredits: number;
  totalAvailableActions: number;
  isBetaPhase: boolean;
  canSaveMultipleAdventures: boolean;
  canPostCommunityAdventures: boolean;
  isGuest: boolean;
  guestActionsTotal: number;
  guestActionsUsed: number;
  guestActionsRemaining: number;
}

export class ActionLimitService {
  // Guests receive a strictly permanent initial trial limit of 3 actions total
  public static readonly GUEST_ACTION_LIMIT = 3;

  // Registered players receive 10 base + 10 beta bonus = 20 free actions every day
  public static readonly BASE_DAILY_FREE = 10;
  public static readonly BETA_DAILY_BONUS = 10;
  public static readonly TOTAL_DAILY_FREE = ActionLimitService.BASE_DAILY_FREE + ActionLimitService.BETA_DAILY_BONUS; // 20

  private static getTodayDateString(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /**
   * Scope storage key strictly to user account UID or unique guest ID
   * This guarantees accounts and guests never share action counts or subscription states.
   */
  private static getStorageKey(user: UserProfile | null, guestId?: string): string {
    if (user && user.uid) {
      return `aifinity_user_actions_${user.uid}`;
    }
    const safeGuestId = guestId || localStorage.getItem('aifinity_guest_id') || localStorage.getItem('aimud_guest_id') || 'guest_default';
    return `aifinity_guest_actions_${safeGuestId}`;
  }

  private static getLocalState(user: UserProfile | null, guestId?: string): {
    tier: UserTier;
    actionCredits: number;
    dailyActionsUsed: number;
    dailyActionsDate: string;
  } {
    // Clear any obsolete shared legacy state that caused cross-user contamination
    try {
      localStorage.removeItem('aifinity_action_state');
    } catch (e) {}

    const today = this.getTodayDateString();
    const key = this.getStorageKey(user, guestId);

    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          // If this is a guest: DO NOT RESET ACTIONS ON DATE CHANGE.
          // Guest limit of 3 actions is permanently saved for each guest.
          if (!user) {
            const guestUsed = typeof parsed.dailyActionsUsed === 'number' ? parsed.dailyActionsUsed : 0;
            return {
              tier: 'free',
              actionCredits: 0,
              dailyActionsUsed: guestUsed,
              dailyActionsDate: parsed.dailyActionsDate || today
            };
          }

          // Registered accounts: reset daily counter when date changes
          if (parsed.dailyActionsDate !== today) {
            parsed.dailyActionsDate = today;
            parsed.dailyActionsUsed = 0;
            localStorage.setItem(key, JSON.stringify(parsed));
          }

          return {
            tier: (parsed.tier === 'adventurer' || parsed.tier === 'legendary' || parsed.tier === 'celestial') ? parsed.tier : 'free',
            actionCredits: typeof parsed.actionCredits === 'number' ? parsed.actionCredits : 0,
            dailyActionsUsed: typeof parsed.dailyActionsUsed === 'number' ? parsed.dailyActionsUsed : 0,
            dailyActionsDate: parsed.dailyActionsDate || today
          };
        }
      }
    } catch (e) {}

    const defaultState = {
      tier: 'free' as UserTier,
      actionCredits: 0,
      dailyActionsUsed: 0,
      dailyActionsDate: today
    };
    try {
      localStorage.setItem(key, JSON.stringify(defaultState));
    } catch (e) {}
    return defaultState;
  }

  private static saveLocalState(
    user: UserProfile | null,
    guestId: string | undefined,
    state: {
      tier: UserTier;
      actionCredits: number;
      dailyActionsUsed: number;
      dailyActionsDate: string;
    }
  ) {
    const key = this.getStorageKey(user, guestId);
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch (e) {}
  }

  /**
   * Check whether user has entered their own Gemini API key
   */
  public static hasCustomApiKey(): boolean {
    const key = localStorage.getItem('aimud_apikey');
    return !!(key && key.trim().length > 10);
  }

  /**
   * Get the current real-time action status scoped to this account or guest
   */
  public static getActionStatus(user: UserProfile | null, guestId?: string): ActionStatus {
    const today = this.getTodayDateString();
    const hasCustomKey = this.hasCustomApiKey();
    const local = this.getLocalState(user, guestId);

    // If user is a guest: strict permanent 3 action trial
    if (!user) {
      const guestUsed = typeof local.dailyActionsUsed === 'number' ? local.dailyActionsUsed : 0;
      const guestLimit = this.GUEST_ACTION_LIMIT; // 3
      const guestRemaining = Math.max(0, guestLimit - guestUsed);
      const isUnlimited = hasCustomKey;
      const totalAvailable = isUnlimited ? 999999 : guestRemaining;
      const canPerformAction = isUnlimited || totalAvailable > 0;

      return {
        tier: 'free',
        hasCustomApiKey: hasCustomKey,
        isUnlimited,
        canPerformAction,
        dailyFreeTotal: guestLimit,
        dailyFreeUsed: guestUsed,
        dailyFreeRemaining: guestRemaining,
        purchasedCredits: 0,
        totalAvailableActions: totalAvailable,
        isBetaPhase: true,
        canSaveMultipleAdventures: false,
        canPostCommunityAdventures: false,
        isGuest: true,
        guestActionsTotal: guestLimit,
        guestActionsUsed: guestUsed,
        guestActionsRemaining: guestRemaining
      };
    }

    // Authenticated user: profile in Firestore and local state are unified
    let tier: UserTier = 'free';
    if (user.tier === 'adventurer' || user.tier === 'legendary' || user.tier === 'celestial') {
      // Check subscription expiry if present
      if (user.subscriptionExpiresAt) {
        const expires = new Date(user.subscriptionExpiresAt).getTime();
        if (expires > Date.now()) {
          tier = user.tier;
        }
      } else {
        tier = user.tier;
      }
    } else if (local.tier === 'adventurer' || local.tier === 'legendary' || local.tier === 'celestial') {
      tier = local.tier;
    }

    const purchasedCredits = Math.max(
      typeof user.actionCredits === 'number' ? user.actionCredits : 0,
      typeof local.actionCredits === 'number' ? local.actionCredits : 0
    );

    // Reset daily if date changed
    let dailyUsed = 0;
    if (user.dailyActionsDate === today && typeof user.dailyActionsUsed === 'number') {
      dailyUsed = user.dailyActionsUsed;
    } else if (local.dailyActionsDate === today && typeof local.dailyActionsUsed === 'number') {
      dailyUsed = local.dailyActionsUsed;
    }

    const isAdmin = user.role === 'admin' || isDefaultAdmin(user.email, user.username);
    const isMod = user.role === 'mod';
    const hasInfinite = Boolean(user.hasInfiniteActions || isAdmin);

    const dailyFreeTotal = this.TOTAL_DAILY_FREE; // 20 actions in beta phase
    const dailyFreeRemaining = Math.max(0, dailyFreeTotal - dailyUsed);
    const isUnlimited = hasCustomKey || hasInfinite || tier === 'celestial';
    const totalAvailable = isUnlimited ? 999999 : (dailyFreeRemaining + purchasedCredits);
    const canPerformAction = isUnlimited || totalAvailable > 0;

    const canSaveMultiple = Boolean(user.canSaveMultipleAdventures || isAdmin || isMod || tier === 'adventurer' || tier === 'legendary' || tier === 'celestial');
    const canPostCommunity = Boolean(user.canPostCommunityAdventures || isAdmin || isMod || tier === 'adventurer' || tier === 'legendary' || tier === 'celestial');

    return {
      tier,
      role: isAdmin ? 'admin' : isMod ? 'mod' : (user.role || 'user'),
      hasCustomApiKey: hasCustomKey,
      isUnlimited,
      hasInfiniteActions: hasInfinite,
      canPerformAction,
      dailyFreeTotal,
      dailyFreeUsed: dailyUsed,
      dailyFreeRemaining,
      purchasedCredits,
      totalAvailableActions: totalAvailable,
      isBetaPhase: true,
      canSaveMultipleAdventures: canSaveMultiple,
      canPostCommunityAdventures: canPostCommunity,
      isGuest: false,
      guestActionsTotal: this.GUEST_ACTION_LIMIT,
      guestActionsUsed: 0,
      guestActionsRemaining: 0
    };
  }

  /**
   * Consumes one action turn. Returns whether action was allowed.
   */
  public static async consumeAction(user: UserProfile | null, guestId?: string): Promise<{
    allowed: boolean;
    remaining: number;
    usedCredit: boolean;
    reason?: 'limit_reached';
  }> {
    const status = this.getActionStatus(user, guestId);

    if (status.isUnlimited) {
      return { allowed: true, remaining: Infinity, usedCredit: false };
    }

    if (!status.canPerformAction) {
      return { allowed: false, remaining: 0, usedCredit: false, reason: 'limit_reached' };
    }

    const today = this.getTodayDateString();

    // Guest action consumption (permanent lifetime trial of 3 actions)
    if (!user) {
      const currentGuestUsed = status.guestActionsUsed;
      if (currentGuestUsed >= this.GUEST_ACTION_LIMIT) {
        return { allowed: false, remaining: 0, usedCredit: false, reason: 'limit_reached' };
      }
      const newGuestUsed = currentGuestUsed + 1;
      this.saveLocalState(null, guestId, {
        tier: 'free',
        actionCredits: 0,
        dailyActionsUsed: newGuestUsed,
        dailyActionsDate: today
      });
      const remaining = Math.max(0, this.GUEST_ACTION_LIMIT - newGuestUsed);
      return {
        allowed: true,
        remaining,
        usedCredit: false
      };
    }

    // Registered player action consumption
    let newDailyUsed = status.dailyFreeUsed;
    let newCredits = status.purchasedCredits;
    let usedCredit = false;

    if (status.dailyFreeRemaining > 0) {
      newDailyUsed += 1;
    } else if (newCredits > 0) {
      newCredits -= 1;
      usedCredit = true;
    } else {
      return { allowed: false, remaining: 0, usedCredit: false, reason: 'limit_reached' };
    }

    // Save state strictly scoped to this user
    this.saveLocalState(user, guestId, {
      tier: status.tier,
      actionCredits: newCredits,
      dailyActionsUsed: newDailyUsed,
      dailyActionsDate: today
    });

    // If logged in, update Firestore profile and memory
    if (user?.uid) {
      user.dailyActionsUsed = newDailyUsed;
      user.dailyActionsDate = today;
      user.actionCredits = newCredits;
      await updateUserProfile(user.uid, {
        dailyActionsUsed: newDailyUsed,
        dailyActionsDate: today,
        actionCredits: newCredits
      });
    }

    const remainingDaily = Math.max(0, this.TOTAL_DAILY_FREE - newDailyUsed);
    const remainingTotal = remainingDaily + newCredits;

    return {
      allowed: true,
      remaining: remainingTotal,
      usedCredit
    };
  }

  /**
   * Grants purchased action credits (e.g. after Google Pay / Card checkout)
   * Guests cannot buy credits; user must be logged in.
   */
  public static async addPurchasedCredits(
    user: UserProfile | null,
    amount: number,
    guestId?: string
  ): Promise<UserProfile> {
    if (!user || !user.uid) {
      throw new Error('Guests cannot buy action packs. Please log in or sign up first.');
    }

    const status = this.getActionStatus(user, guestId);
    const newCredits = status.purchasedCredits + amount;
    const today = this.getTodayDateString();

    user.actionCredits = newCredits;

    this.saveLocalState(user, guestId, {
      tier: status.tier,
      actionCredits: newCredits,
      dailyActionsUsed: status.dailyFreeUsed,
      dailyActionsDate: today
    });

    await updateUserProfile(user.uid, {
      actionCredits: newCredits
    });

    return user;
  }

  /**
   * Helper to credit action packs by UID directly (e.g. from Stripe redirect)
   */
  public static async addPurchasedCreditsByUid(
    uid: string,
    amount: number
  ): Promise<UserProfile | null> {
    let profile = await getUserProfile(uid, true);
    if (!profile) {
      profile = {
        uid,
        email: null,
        username: 'Player',
        role: 'user',
        tier: 'free',
        actionCredits: 0,
        authProvider: 'password',
        createdAt: new Date().toISOString()
      } as UserProfile;
    }
    const updated = await this.addPurchasedCredits(profile, amount);
    return updated;
  }

  /**
   * Activates monthly subscription (Adventurer, Legendary, or Celestial)
   * Guests cannot buy subscriptions; user must be logged in.
   */
  public static async activateSubscription(
    user: UserProfile | null,
    tier: UserTier,
    guestId?: string,
    subscriptionDetails?: {
      subscriptionId?: string;
      customerId?: string;
      periodEnd?: string;
      status?: string;
      cancelAtPeriodEnd?: boolean;
    }
  ): Promise<UserProfile> {
    if (!user || !user.uid) {
      throw new Error('Guests cannot buy subscriptions. Please log in or sign up first.');
    }

    const status = this.getActionStatus(user, guestId);
    const today = this.getTodayDateString();

    // Bonus actions per tier: Adventurer = 300, Legendary = 600, Celestial = unlimited actions (+1000 buffer)
    let bonusActions = 0;
    if (tier === 'adventurer') {
      bonusActions = 300;
    } else if (tier === 'legendary') {
      bonusActions = 600;
    } else if (tier === 'celestial') {
      bonusActions = 1000;
    }
    const currentCredits = typeof user.actionCredits === 'number' ? user.actionCredits : status.purchasedCredits;
    const newCredits = currentCredits + bonusActions;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    const expiresStr = subscriptionDetails?.periodEnd || expiresAt.toISOString();

    user.tier = tier;
    user.actionCredits = newCredits;
    user.subscriptionExpiresAt = expiresStr;
    user.stripeSubscriptionId = subscriptionDetails?.subscriptionId || user.stripeSubscriptionId || null;
    user.stripeCustomerId = subscriptionDetails?.customerId || user.stripeCustomerId || null;
    user.subscriptionStatus = (subscriptionDetails?.status as any) || 'active';
    user.subscriptionPeriodEnd = expiresStr;
    user.subscriptionCancelAtPeriodEnd = subscriptionDetails?.cancelAtPeriodEnd || false;
    user.canSaveMultipleAdventures = true;
    user.canPostCommunityAdventures = true;
    if (tier === 'legendary' || tier === 'celestial') {
      if (user.showGlowingName === undefined) {
        user.showGlowingName = true;
      }
    }

    this.saveLocalState(user, guestId, {
      tier,
      actionCredits: newCredits,
      dailyActionsUsed: status.dailyFreeUsed,
      dailyActionsDate: today
    });

    await updateUserProfile(user.uid, {
      tier,
      actionCredits: newCredits,
      subscriptionExpiresAt: expiresStr,
      stripeSubscriptionId: user.stripeSubscriptionId,
      stripeCustomerId: user.stripeCustomerId,
      subscriptionStatus: 'active',
      subscriptionPeriodEnd: expiresStr,
      subscriptionCancelAtPeriodEnd: user.subscriptionCancelAtPeriodEnd,
      canSaveMultipleAdventures: true,
      canPostCommunityAdventures: true,
      ...(tier === 'legendary' || tier === 'celestial' ? { showGlowingName: true } : {})
    });

    return user;
  }

  /**
   * Atomically applies both action packs and subscription tier upgrades to a user's account
   * ensuring that action packs are never overwritten by subscriptions and vice versa.
   */
  public static async applyRestoredPurchases(
    user: UserProfile | null,
    addedCredits: number,
    newTier: UserTier | null,
    guestId?: string,
    minActionCreditsFloor?: number
  ): Promise<UserProfile> {
    if (!user || !user.uid) {
      throw new Error('User must be logged in to restore purchases.');
    }

    const status = this.getActionStatus(user, guestId);
    const today = this.getTodayDateString();

    const tierRank: Record<string, number> = {
      free: 0,
      adventurer: 1,
      legendary: 2,
      celestial: 3
    };

    let resolvedTier: UserTier = user.tier || status.tier || 'free';
    if (newTier && (tierRank[newTier] || 0) > (tierRank[resolvedTier] || 0)) {
      resolvedTier = newTier;
    }

    let expiresStr = user.subscriptionExpiresAt;

    // If subscription is being restored/activated
    let tierBonusActions = 0;
    if (newTier && resolvedTier === newTier) {
      if (!expiresStr || new Date(expiresStr).getTime() < Date.now()) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);
        expiresStr = expiresAt.toISOString();
      }
      if (newTier === 'adventurer') {
        tierBonusActions = 300;
      } else if (newTier === 'legendary') {
        tierBonusActions = 600;
      } else if (newTier === 'celestial') {
        tierBonusActions = 1000;
      }
    }

    const currentCredits = typeof user.actionCredits === 'number' ? user.actionCredits : status.purchasedCredits;
    // Total credits = existing + packs + subscription bonuses
    let finalCredits = currentCredits + addedCredits + (newTier && user.tier !== newTier ? tierBonusActions : 0);

    // If a minimum floor of total purchased credits was provided, ensure credits never drop below it
    if (typeof minActionCreditsFloor === 'number' && finalCredits < minActionCreditsFloor) {
      finalCredits = minActionCreditsFloor;
    }

    user.tier = resolvedTier;
    user.actionCredits = finalCredits;
    user.subscriptionExpiresAt = expiresStr;
    user.canSaveMultipleAdventures = true;
    user.canPostCommunityAdventures = true;
    if (resolvedTier === 'legendary' || resolvedTier === 'celestial') {
      user.showGlowingName = true;
    }

    this.saveLocalState(user, guestId, {
      tier: resolvedTier,
      actionCredits: finalCredits,
      dailyActionsUsed: status.dailyFreeUsed,
      dailyActionsDate: today
    });

    await updateUserProfile(user.uid, {
      tier: resolvedTier,
      actionCredits: finalCredits,
      subscriptionExpiresAt: expiresStr || null as any,
      canSaveMultipleAdventures: true,
      canPostCommunityAdventures: true,
      ...(resolvedTier === 'legendary' || resolvedTier === 'celestial' ? { showGlowingName: true } : {})
    });

    return user;
  }

  /**
   * Helper to activate subscription by UID directly (e.g. from Stripe redirect)
   */
  public static async activateSubscriptionByUid(
    uid: string,
    tier: UserTier
  ): Promise<UserProfile | null> {
    let profile = await getUserProfile(uid, true);
    if (!profile) {
      profile = {
        uid,
        email: null,
        username: 'Player',
        role: 'user',
        tier: 'free',
        actionCredits: 0,
        authProvider: 'password',
        createdAt: new Date().toISOString()
      } as UserProfile;
    }
    const updated = await this.activateSubscription(profile, tier);
    return updated;
  }

  /**
   * Cancels user's active subscription and reverts to 'free' tier
   */
  public static async cancelSubscription(
    user: UserProfile | null,
    guestId?: string
  ): Promise<UserProfile> {
    if (!user || !user.uid) {
      throw new Error('Must be logged in to cancel subscription.');
    }

    const today = this.getTodayDateString();
    const status = this.getActionStatus(user, guestId);
    const isAdminOrMod = user.role === 'admin' || user.role === 'mod';

    user.tier = 'free';
    user.subscriptionExpiresAt = undefined;
    user.stripeSubscriptionId = null;
    user.subscriptionStatus = 'canceled';
    user.subscriptionPeriodEnd = null;
    if (!isAdminOrMod) {
      user.canSaveMultipleAdventures = false;
      user.canPostCommunityAdventures = false;
      user.showGlowingName = false;
    }

    this.saveLocalState(user, guestId, {
      tier: 'free',
      actionCredits: user.actionCredits || 0,
      dailyActionsUsed: status.dailyFreeUsed,
      dailyActionsDate: today
    });

    await updateUserProfile(user.uid, {
      tier: 'free',
      subscriptionExpiresAt: null as any,
      stripeSubscriptionId: null as any,
      subscriptionStatus: 'canceled',
      subscriptionPeriodEnd: null as any,
      ...(!isAdminOrMod ? {
        canSaveMultipleAdventures: false,
        canPostCommunityAdventures: false,
        showGlowingName: false
      } : {})
    });

    return user;
  }

  /**
   * Automatically synchronizes user profile with real-time Stripe subscription status
   * Attaches subscription strictly to this account, auto-updating active tiers without breaking single-payment upgrades
   */
  public static async syncSubscriptionState(
    user: UserProfile | null,
    activeSub: {
      id: string;
      tierId: UserTier;
      status: string;
      periodEnd: string;
      cancelAtPeriodEnd?: boolean;
      customerId?: string;
    } | null,
    guestId?: string
  ): Promise<UserProfile> {
    if (!user || !user.uid) return user as any;

    const isAdminOrMod = user.role === 'admin' || user.role === 'mod';
    const today = this.getTodayDateString();
    const status = this.getActionStatus(user, guestId);

    if (activeSub && (activeSub.status === 'active' || activeSub.status === 'trialing')) {
      user.tier = activeSub.tierId;
      user.stripeSubscriptionId = activeSub.id;
      user.stripeCustomerId = activeSub.customerId || user.stripeCustomerId || null;
      user.subscriptionStatus = 'active';
      user.subscriptionExpiresAt = activeSub.periodEnd;
      user.subscriptionPeriodEnd = activeSub.periodEnd;
      user.subscriptionCancelAtPeriodEnd = activeSub.cancelAtPeriodEnd || false;
      user.canSaveMultipleAdventures = true;
      user.canPostCommunityAdventures = true;
      if (activeSub.tierId === 'legendary' || activeSub.tierId === 'celestial') {
        user.showGlowingName = true;
      }

      this.saveLocalState(user, guestId, {
        tier: activeSub.tierId,
        actionCredits: user.actionCredits || 0,
        dailyActionsUsed: status.dailyFreeUsed,
        dailyActionsDate: today
      });

      await updateUserProfile(user.uid, {
        tier: activeSub.tierId,
        stripeSubscriptionId: activeSub.id,
        stripeCustomerId: user.stripeCustomerId,
        subscriptionStatus: 'active',
        subscriptionExpiresAt: activeSub.periodEnd,
        subscriptionPeriodEnd: activeSub.periodEnd,
        subscriptionCancelAtPeriodEnd: activeSub.cancelAtPeriodEnd || false,
        canSaveMultipleAdventures: true,
        canPostCommunityAdventures: true,
        ...(activeSub.tierId === 'legendary' || activeSub.tierId === 'celestial' ? { showGlowingName: true } : {})
      });
    } else if (
      !activeSub &&
      (user.subscriptionStatus === 'canceled' || user.stripeSubscriptionId || (user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt).getTime() < Date.now())) &&
      !isAdminOrMod
    ) {
      // Downgrade to Free if the subscription was canceled or no active Stripe subscription exists
      user.tier = 'free';
      user.subscriptionStatus = 'canceled';
      user.subscriptionExpiresAt = undefined;
      user.stripeSubscriptionId = null;
      user.subscriptionPeriodEnd = null;
      user.canSaveMultipleAdventures = false;
      user.canPostCommunityAdventures = false;
      user.showGlowingName = false;

      this.saveLocalState(user, guestId, {
        tier: 'free',
        actionCredits: user.actionCredits || 0,
        dailyActionsUsed: status.dailyFreeUsed,
        dailyActionsDate: today
      });

      await updateUserProfile(user.uid, {
        tier: 'free',
        subscriptionStatus: 'canceled',
        subscriptionExpiresAt: null as any,
        stripeSubscriptionId: null as any,
        subscriptionPeriodEnd: null as any,
        canSaveMultipleAdventures: false,
        canPostCommunityAdventures: false,
        showGlowingName: false
      });
    }

    return user;
  }
}

export default ActionLimitService;
