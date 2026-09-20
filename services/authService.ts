import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import { auth, googleProvider, db } from './firebase';

export type UserTier = 'free' | 'adventurer' | 'legendary' | 'celestial';
export type UserRole = 'user' | 'mod' | 'admin';

export interface UserProfile {
  uid: string;
  email: string | null;
  username: string;
  authProvider: 'password' | 'google';
  createdAt: string;
  tier?: UserTier;
  role?: UserRole;
  showGlowingName?: boolean;
  hasInfiniteActions?: boolean;
  canSaveMultipleAdventures?: boolean;
  canPostCommunityAdventures?: boolean;
  actionCredits?: number;
  dailyActionsUsed?: number;
  dailyActionsDate?: string;
  subscriptionExpiresAt?: string | null;
  modActionsGrantedToday?: number;
  modActionsGrantedDate?: string;
}

/**
 * Checks if user is default Admin (Chloe: chloe.a.alba.1@gmail.com or username Chloe)
 */
export function isDefaultAdmin(email?: string | null, username?: string | null): boolean {
  if (email && email.trim().toLowerCase() === 'chloe.a.alba.1@gmail.com') return true;
  if (username && username.trim().toLowerCase() === 'chloe') return true;
  return false;
}

/**
 * Ensures defaults for roles, celestial glowing names, and admin infinite actions
 */
export function enrichUserProfileWithDefaults(profile: UserProfile): UserProfile {
  if (isDefaultAdmin(profile.email, profile.username)) {
    profile.role = 'admin';
    profile.hasInfiniteActions = true;
    profile.canSaveMultipleAdventures = true;
    profile.canPostCommunityAdventures = true;
    if (profile.showGlowingName === undefined) {
      profile.showGlowingName = true;
    }
  } else {
    if (!profile.role) profile.role = 'user';
    if (profile.showGlowingName === undefined && (profile.role === 'admin' || profile.role === 'mod')) {
      profile.showGlowingName = true;
    }
  }
  return profile;
}

export interface GuestProfile {
  guestId: string;
  rawGuestName: string | null; // e.g. "ShadowRunner"
  displayGuestName: string;   // e.g. "ShadowRunner (Guest)" or "Player"
}

// Username format validation: 2-20 characters, only letters and numbers
export function validateUsernameFormat(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Username is required.' };
  }
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 20) {
    return { valid: false, error: 'Username must be between 2 and 20 characters.' };
  }
  if (!/^[a-zA-Z0-9]+$/.test(trimmed)) {
    return { valid: false, error: 'Username can only contain letters and numbers.' };
  }
  return { valid: true };
}

// Generates random unique-style usernames like GoldenTable86, Bird872, HowlingKnight
export function generateRandomUsername(): string {
  const prefixes = [
    'Golden', 'Bird', 'Howling', 'Silver', 'Shadow', 'Mystic', 'Swift', 'Iron',
    'Storm', 'Crimson', 'Azure', 'Solar', 'Lunar', 'Cyber', 'Frost', 'Thunder',
    'Blaze', 'Silent', 'Wild', 'Astral', 'Crystal', 'Night', 'Star', 'Emerald'
  ];
  const nouns = [
    'Table', 'Bird', 'Knight', 'Dragon', 'Falcon', 'Wolf', 'Mage', 'Tiger',
    'Blade', 'Rogue', 'Hunter', 'Viper', 'Ghost', 'Raven', 'Titan', 'Phoenix',
    'Spark', 'Hawk', 'Fox', 'Archer', 'Shield', 'Sentinel', 'Warrior'
  ];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];

  const style = Math.random();
  let result = '';
  if (style < 0.4) {
    // e.g., GoldenTable86
    const num = Math.floor(Math.random() * 90) + 10;
    result = `${prefix}${noun}${num}`;
  } else if (style < 0.7) {
    // e.g., Bird872
    const num = Math.floor(Math.random() * 900) + 100;
    result = `${prefix}${num}`;
  } else {
    // e.g., HowlingKnight
    result = `${prefix}${noun}`;
  }

  if (result.length > 20) {
    result = result.substring(0, 20);
  }
  return result;
}

// Persistent Guest ID generator
export function getOrCreateGuestId(): string {
  let guestId = localStorage.getItem('aifinity_guest_id');
  if (!guestId) {
    guestId = 'guest_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
    localStorage.setItem('aifinity_guest_id', guestId);
  }
  return guestId;
}

// Check if a guest name is active or taken
export async function isGuestNameActive(guestName: string): Promise<boolean> {
  const lower = guestName.trim().toLowerCase();
  try {
    const userDoc = await getDoc(doc(db, 'usernames', lower));
    if (userDoc.exists()) return true;
    const guestDoc = await getDoc(doc(db, 'guest_names', lower));
    return guestDoc.exists();
  } catch (err) {
    return false;
  }
}

export async function reserveGuestName(guestName: string, guestId: string): Promise<boolean> {
  const res = await setGuestName(guestName, null, guestId);
  return res.success;
}

// Check if a registered username is taken
export async function isUsernameTaken(username: string, currentGuestId?: string): Promise<boolean> {
  const lower = username.trim().toLowerCase();
  try {
    // Check in registered usernames
    const userDoc = await getDoc(doc(db, 'usernames', lower));
    if (userDoc.exists()) return true;

    // Check in active guest names
    const guestDoc = await getDoc(doc(db, 'guest_names', lower));
    if (guestDoc.exists()) {
      const data = guestDoc.data();
      const guestId = currentGuestId || localStorage.getItem('aifinity_guest_id') || localStorage.getItem('aimud_guest_id');
      // If this name was reserved by this current guest session, they can transition it to their registered account!
      if (guestId && data?.guestId === guestId) {
        return false;
      }
      return true;
    }

    return false;
  } catch (err) {
    console.warn('Error checking username availability:', err);
    return false;
  }
}

// Check if guest name can be claimed by current guest
export async function isGuestNameAvailable(guestName: string, currentGuestId: string): Promise<boolean> {
  const lower = guestName.trim().toLowerCase();
  try {
    // Check if registered by an account
    const userDoc = await getDoc(doc(db, 'usernames', lower));
    if (userDoc.exists()) return false;

    // Check if claimed by another guest
    const guestDoc = await getDoc(doc(db, 'guest_names', lower));
    if (guestDoc.exists()) {
      const data = guestDoc.data();
      // If claimed by same guest, it is allowed
      if (data?.guestId === currentGuestId) return true;
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Error checking guest name availability:', err);
    return true;
  }
}

// Claim or update guest name
export async function setGuestName(
  newGuestName: string,
  oldGuestName: string | null,
  guestId: string
): Promise<{ success: boolean; error?: string }> {
  const validation = validateUsernameFormat(newGuestName);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const newLower = newGuestName.trim().toLowerCase();
  const available = await isGuestNameAvailable(newGuestName, guestId);
  if (!available) {
    return { success: false, error: 'That name is already taken by another user or guest.' };
  }

  try {
    // Release old name if different
    if (oldGuestName && oldGuestName.trim().toLowerCase() !== newLower) {
      await deleteDoc(doc(db, 'guest_names', oldGuestName.trim().toLowerCase())).catch(() => {});
    }

    // Reserve new name
    await setDoc(doc(db, 'guest_names', newLower), {
      guestId,
      displayName: newGuestName.trim(),
      nameLower: newLower,
      claimedAt: new Date().toISOString()
    });

    localStorage.setItem('aifinity_guest_name', newGuestName.trim());
    return { success: true };
  } catch (err: any) {
    console.error('Failed to claim guest name in Firestore:', err);
    return { success: false, error: err.message || 'Failed to reserve guest name.' };
  }
}

// Clear guest name
export async function clearGuestName(guestName: string | null, guestId: string): Promise<void> {
  if (guestName) {
    try {
      await deleteDoc(doc(db, 'guest_names', guestName.trim().toLowerCase())).catch(() => {});
    } catch (e) {}
  }
  localStorage.removeItem('aifinity_guest_name');
}

// In-memory cache for profiles currently being created or fetched to avoid race conditions
let activeProfileCache: Record<string, UserProfile> = {};

// Register user with email/password
export async function registerWithEmail(
  email: string,
  pass: string,
  username: string
): Promise<{ user?: UserProfile; error?: string }> {
  const validation = validateUsernameFormat(username);
  if (!validation.valid) {
    return { error: validation.error };
  }

  const taken = await isUsernameTaken(username);
  if (taken) {
    return { error: 'Username is already taken. Please choose another.' };
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    const uid = cred.user.uid;
    const lower = username.trim().toLowerCase();
    const cleanEmail = (cred.user.email || email).trim();
    const emailLower = cleanEmail.toLowerCase();

    const profile: UserProfile = enrichUserProfileWithDefaults({
      uid,
      email: cleanEmail,
      username: username.trim(),
      authProvider: 'password',
      createdAt: new Date().toISOString()
    });

    // Populate active cache immediately so auth state listener immediately finds the profile
    activeProfileCache[uid] = profile;

    // Save profile, unique username reservation, and email index in Firestore
    await Promise.all([
      setDoc(doc(db, 'users', uid), profile),
      setDoc(doc(db, 'usernames', lower), {
        uid,
        username: username.trim(),
        createdAt: new Date().toISOString()
      }),
      setDoc(doc(db, 'emails', emailLower), {
        uid,
        email: cleanEmail,
        createdAt: new Date().toISOString()
      })
    ]);

    // Clean up temporary guest claim if any
    try {
      await deleteDoc(doc(db, 'guest_names', lower));
    } catch {
      // Non-blocking
    }

    return { user: profile };
  } catch (err: any) {
    let msg = err.message || 'Registration failed.';
    if (err.code === 'auth/email-already-in-use') {
      msg = 'An account with this email already exists.';
    } else if (err.code === 'auth/weak-password') {
      msg = 'Password should be at least 6 characters.';
    } else if (err.code === 'auth/invalid-email') {
      msg = 'Please enter a valid email address.';
    }
    return { error: msg };
  }
}

// Login with email/password
export async function loginWithEmail(
  email: string,
  pass: string
): Promise<{ user?: UserProfile; error?: string; accountNotFound?: boolean }> {
  try {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      return { error: 'Please enter your email.' };
    }
    if (!pass) {
      return { error: 'Please enter your password.' };
    }

    const emailLower = cleanEmail.toLowerCase();

    // Check if account exists first in Firestore emails or users collection
    let accountExists = false;
    try {
      const emailDoc = await getDoc(doc(db, 'emails', emailLower));
      if (emailDoc.exists()) {
        accountExists = true;
      } else {
        const q1 = query(collection(db, 'users'), where('email', '==', cleanEmail));
        const snap1 = await getDocs(q1);
        if (!snap1.empty) {
          accountExists = true;
        } else {
          const q2 = query(collection(db, 'users'), where('email', '==', emailLower));
          const snap2 = await getDocs(q2);
          if (!snap2.empty) {
            accountExists = true;
          }
        }
      }
    } catch (checkErr) {
      // Proceed to auth attempt if Firestore lookup fails
    }

    try {
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, pass);
      const userDoc = await getDoc(doc(db, 'users', cred.user.uid));
      if (userDoc.exists()) {
        const profile = enrichUserProfileWithDefaults(userDoc.data() as UserProfile);
        activeProfileCache[cred.user.uid] = profile;
        return { user: profile };
      }

      // Fallback if profile document wasn't found in Firestore
      const fallbackProfile: UserProfile = enrichUserProfileWithDefaults({
        uid: cred.user.uid,
        email: cred.user.email,
        username: (cred.user.displayName || cred.user.email?.split('@')[0] || 'Player').replace(/[^a-zA-Z0-9]/g, '').substring(0, 20),
        authProvider: 'password',
        createdAt: new Date().toISOString()
      });
      activeProfileCache[cred.user.uid] = fallbackProfile;
      return { user: fallbackProfile };
    } catch (authErr: any) {
      // If Firebase explicitly reports user-not-found, OR if our lookup showed account does not exist:
      if (
        authErr.code === 'auth/user-not-found' ||
        (!accountExists && (authErr.code === 'auth/invalid-credential' || authErr.code === 'auth/wrong-password'))
      ) {
        return {
          error: "No account found with this email. Please enter your desired username and password to create your account.",
          accountNotFound: true
        };
      }
      if (authErr.code === 'auth/invalid-credential' || authErr.code === 'auth/wrong-password') {
        return { error: 'Invalid password for this account. Please try again.' };
      }
      if (authErr.code === 'auth/too-many-requests') {
        return { error: 'Too many unsuccessful attempts. Please try again later.' };
      }
      return { error: authErr.message || 'Login failed.' };
    }
  } catch (err: any) {
    let msg = err.message || 'Login failed.';
    return { error: msg };
  }
}

// Record payment transaction in Firestore under user document
export async function recordPaymentTransaction(
  uid: string,
  transaction: {
    id: string;
    amount: number;
    itemName: string;
    itemType: 'pack' | 'tier';
    paymentMethod: string;
    status: 'completed' | 'failed';
    createdAt: string;
    recipient?: string;
    notes?: string;
  }
): Promise<void> {
  try {
    const rawId = String(transaction.id || '').trim();
    const safeTxId = (rawId || `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`)
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    await setDoc(doc(db, 'users', uid, 'transactions', safeTxId), {
      ...transaction,
      id: safeTxId,
      userId: uid
    });
  } catch (err) {
    console.error('Failed to log payment transaction in Firestore:', err);
  }
}

// Google Sign-in with Firebase
export async function loginWithGoogle(): Promise<{
  user?: UserProfile;
  needsUsername?: boolean;
  googleUser?: FirebaseUser;
  error?: string;
}> {
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    const uid = cred.user.uid;

    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      const profile = enrichUserProfileWithDefaults(userDoc.data() as UserProfile);
      activeProfileCache[uid] = profile;
      if (isDefaultAdmin(profile.email, profile.username) && (profile.role !== 'admin' || !profile.hasInfiniteActions)) {
        await setDoc(doc(db, 'users', uid), {
          role: 'admin',
          hasInfiniteActions: true,
          canSaveMultipleAdventures: true,
          canPostCommunityAdventures: true,
          showGlowingName: profile.showGlowingName !== undefined ? profile.showGlowingName : true
        }, { merge: true }).catch(() => {});
      }
      return { user: profile };
    }

    // New Google user: always give the user the prompt to manually set their username and password first
    return { needsUsername: true, googleUser: cred.user };
  } catch (err: any) {
    if (err.code === 'auth/popup-closed-by-user') {
      return { error: 'Sign in popup closed.' };
    }
    if (err.code === 'auth/popup-blocked') {
      return { error: 'Popup was blocked by your browser. Please allow popups for https://www.aifinity-rpg.com to complete Google sign-in.' };
    }
    if (err.code === 'auth/unauthorized-domain') {
      return {
        error: 'Google Sign-In authorization for www.aifinity-rpg.com requires domain authorization in the Firebase project settings.'
      };
    }
    return { error: err.message || 'Google sign in failed.' };
  }
}

// Complete Google sign-in after manually setting a unique username and optional password
export async function completeGoogleSignUp(
  googleUser: FirebaseUser,
  username: string,
  optionalPassword?: string
): Promise<{ user?: UserProfile; error?: string }> {
  const validation = validateUsernameFormat(username);
  if (!validation.valid) {
    return { error: validation.error };
  }

  const taken = await isUsernameTaken(username);
  if (taken) {
    return { error: 'Username is already taken. Please choose another.' };
  }

  try {
    const cleanEmail = (googleUser.email || '').trim();
    const emailLower = cleanEmail.toLowerCase();
    const lower = username.trim().toLowerCase();

    const profile: UserProfile = enrichUserProfileWithDefaults({
      uid: googleUser.uid,
      email: googleUser.email,
      username: username.trim(),
      authProvider: 'google',
      createdAt: new Date().toISOString()
    });
    activeProfileCache[googleUser.uid] = profile;

    await Promise.all([
      setDoc(doc(db, 'users', googleUser.uid), profile),
      setDoc(doc(db, 'usernames', lower), {
        uid: googleUser.uid,
        username: username.trim(),
        createdAt: new Date().toISOString()
      }),
      emailLower ? setDoc(doc(db, 'emails', emailLower), {
        uid: googleUser.uid,
        email: cleanEmail,
        createdAt: new Date().toISOString()
      }) : Promise.resolve()
    ]);

    // Optional account password update if the user manually specified a password
    if (optionalPassword && optionalPassword.length >= 6) {
      try {
        const { updatePassword } = await import('firebase/auth');
        await updatePassword(googleUser, optionalPassword);
      } catch (pwErr) {
        console.warn('Could not set optional password on Google user:', pwErr);
      }
    }

    // Clean up temporary guest claim if any
    try {
      await deleteDoc(doc(db, 'guest_names', lower));
    } catch {
      // Non-blocking
    }

    return { user: profile };
  } catch (err: any) {
    return { error: err.message || 'Failed to complete Google account setup.' };
  }
}

// Log out
export async function logOut(): Promise<void> {
  activeProfileCache = {};
  await fbSignOut(auth);
}

// Fetch user profile from Firestore by UID
export async function getUserProfile(uid: string, forceFresh: boolean = false): Promise<UserProfile | null> {
  // Helper to read any cached local purchase state
  const getLocalPurchaseOverrides = (targetUid: string) => {
    try {
      if (typeof window === 'undefined') return null;
      const raw = localStorage.getItem(`aifinity_user_actions_${targetUid}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed;
    } catch {
      return null;
    }
  };

  if (!forceFresh && activeProfileCache[uid]) {
    const cached = enrichUserProfileWithDefaults(activeProfileCache[uid]);
    if (isDefaultAdmin(cached.email, cached.username) && (cached.role !== 'admin' || !cached.hasInfiniteActions)) {
      cached.role = 'admin';
      cached.hasInfiniteActions = true;
      cached.canSaveMultipleAdventures = true;
      cached.canPostCommunityAdventures = true;
    }
    const local = getLocalPurchaseOverrides(uid);
    if (local) {
      if ((local.tier === 'adventurer' || local.tier === 'legendary' || local.tier === 'celestial') && cached.tier !== local.tier) {
        cached.tier = local.tier;
        cached.canSaveMultipleAdventures = true;
        cached.canPostCommunityAdventures = true;
      }
      if (typeof local.actionCredits === 'number' && local.actionCredits > (cached.actionCredits || 0)) {
        cached.actionCredits = local.actionCredits;
      }
    }
    return cached;
  }

  try {
    const snap = await getDoc(doc(db, 'users', uid));
    let profile: UserProfile | null = null;
    if (snap.exists()) {
      profile = enrichUserProfileWithDefaults(snap.data() as UserProfile);
    } else if (activeProfileCache[uid]) {
      profile = enrichUserProfileWithDefaults(activeProfileCache[uid]);
    }

    if (profile) {
      const local = getLocalPurchaseOverrides(uid);
      let needsFirestoreSync = false;
      if (local) {
        if ((local.tier === 'adventurer' || local.tier === 'legendary' || local.tier === 'celestial') && profile.tier !== local.tier) {
          profile.tier = local.tier;
          profile.canSaveMultipleAdventures = true;
          profile.canPostCommunityAdventures = true;
          needsFirestoreSync = true;
        }
        if (typeof local.actionCredits === 'number' && local.actionCredits > (profile.actionCredits || 0)) {
          profile.actionCredits = local.actionCredits;
          needsFirestoreSync = true;
        }
      }

      if (isDefaultAdmin(profile.email, profile.username) && (profile.role !== 'admin' || !profile.hasInfiniteActions)) {
        profile.role = 'admin';
        profile.hasInfiniteActions = true;
        profile.canSaveMultipleAdventures = true;
        profile.canPostCommunityAdventures = true;
        needsFirestoreSync = true;
      }

      activeProfileCache[uid] = profile;

      if (needsFirestoreSync && auth.currentUser?.uid === uid) {
        setDoc(doc(db, 'users', uid), {
          tier: profile.tier,
          actionCredits: profile.actionCredits,
          role: profile.role,
          hasInfiniteActions: profile.hasInfiniteActions,
          canSaveMultipleAdventures: profile.canSaveMultipleAdventures,
          canPostCommunityAdventures: profile.canPostCommunityAdventures,
          showGlowingName: profile.showGlowingName !== undefined ? profile.showGlowingName : true
        }, { merge: true }).catch(() => {});
      }
      return profile;
    }
    return null;
  } catch (e) {
    return activeProfileCache[uid] || null;
  }
}

export function updateCachedProfile(uid: string, updates: Partial<UserProfile>): void {
  if (activeProfileCache[uid]) {
    activeProfileCache[uid] = {
      ...activeProfileCache[uid],
      ...updates
    };
  } else {
    activeProfileCache[uid] = {
      uid,
      email: null,
      username: 'Player',
      authProvider: 'password',
      createdAt: new Date().toISOString(),
      ...updates
    } as UserProfile;
  }
}

// Listen to auth state changes
export function subscribeToAuth(callback: (user: UserProfile | null, loading: boolean) => void) {
  return onAuthStateChanged(auth, async (fbUser) => {
    if (fbUser) {
      let profile = await getUserProfile(fbUser.uid);
      if (!profile) {
        // Retry with delays to allow Firestore writes to settle
        for (let i = 0; i < 3; i++) {
          await new Promise((r) => setTimeout(r, 250 * (i + 1)));
          profile = await getUserProfile(fbUser.uid);
          if (profile) break;
        }
      }
      if (profile) {
        callback(profile, false);
      } else {
        // Construct fallback user profile so user is never reported as null when authenticated
        const fallback: UserProfile = enrichUserProfileWithDefaults({
          uid: fbUser.uid,
          email: fbUser.email,
          username: (fbUser.displayName || fbUser.email?.split('@')[0] || 'Player').replace(/[^a-zA-Z0-9]/g, '').substring(0, 20) || 'Player',
          authProvider: (fbUser.providerData[0]?.providerId === 'google.com' ? 'google' : 'password'),
          createdAt: new Date().toISOString()
        });
        activeProfileCache[fbUser.uid] = fallback;
        callback(fallback, false);
      }
    } else {
      activeProfileCache = {};
      callback(null, false);
    }
  });
}

// Generate unique Guest# between 1-9999 for multiplayer guests who haven't set their name
export function generateUniqueGuestMultiplayerName(existingPlayerNames: string[] = []): string {
  const existingNumbers = new Set<number>();
  for (const name of existingPlayerNames) {
    const match = name.match(/^Guest(\d+)$/i);
    if (match) {
      existingNumbers.add(parseInt(match[1], 10));
    }
  }

  // Find an unused number from 1 to 9999
  let candidate = Math.floor(Math.random() * 9999) + 1;
  let attempts = 0;
  while (existingNumbers.has(candidate) && attempts < 1000) {
    candidate = Math.floor(Math.random() * 9999) + 1;
    attempts++;
  }
  return `Guest${candidate}`;
}

// Update partial user profile in Firestore and sync in-memory cache and localStorage
export async function updateUserProfile(uid: string, updates: Partial<UserProfile>): Promise<void> {
  try {
    updateCachedProfile(uid, updates);

    // Sync to local storage state
    if (typeof window !== 'undefined') {
      try {
        const key = `aifinity_user_actions_${uid}`;
        const raw = localStorage.getItem(key);
        const currentLocal = raw ? JSON.parse(raw) : {};
        if (updates.tier) currentLocal.tier = updates.tier;
        if (typeof updates.actionCredits === 'number') currentLocal.actionCredits = updates.actionCredits;
        localStorage.setItem(key, JSON.stringify(currentLocal));
      } catch (e) {
        // ignore
      }
    }

    const userRef = doc(db, 'users', uid);
    await setDoc(userRef, updates, { merge: true });
  } catch (err) {
    console.error('Failed to update user profile in Firestore:', err);
  }
}
