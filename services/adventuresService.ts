import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  serverTimestamp
} from 'firebase/firestore';
import { db } from './firebase';
import { UserProfile, UserTier, isDefaultAdmin } from './authService';
import { NarrativeEntry } from '../types';

export interface SavedAdventure {
  id: string;
  userId: string;
  title: string;
  authorName: string;
  startingPrompt: string;
  initialAiGeneration: string;
  narrative: NarrativeEntry[];
  files: Record<string, string>;
  turnCount: number;
  createdAt: string;
  updatedAt: string;
}

export type CommunityShareType = 'full' | 'prompt_only' | 'initial_generation';

export interface CommunityAdventure {
  id: string;
  authorId: string;
  authorName: string;
  authorTier: UserTier;
  title: string;
  shareType: CommunityShareType;
  startingPrompt: string;
  initialAiGeneration: string;
  narrative?: NarrativeEntry[];
  files?: Record<string, string>;
  likesCount: number;
  createdAt: string;
}

const LOCAL_SAVED_ADVENTURES_KEY = 'aifinity_saved_adventures';

export class AdventuresService {
  /**
   * Get list of saved adventures for user
   */
  public static async getSavedAdventures(user: UserProfile | null, guestId: string): Promise<SavedAdventure[]> {
    if (user?.uid) {
      try {
        const userAdventuresRef = collection(db, 'users', user.uid, 'adventures');
        const snap = await getDocs(userAdventuresRef);
        const adventures: SavedAdventure[] = [];
        snap.forEach((d) => {
          adventures.push(d.data() as SavedAdventure);
        });
        // Sort newest first
        adventures.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return adventures;
      } catch (err) {
        console.error('Error fetching user adventures from Firestore, falling back to local:', err);
      }
    }

    // LocalStorage fallback for guests or offline
    try {
      const raw = localStorage.getItem(LOCAL_SAVED_ADVENTURES_KEY);
      if (raw) {
        const parsed: SavedAdventure[] = JSON.parse(raw);
        return parsed.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }
    } catch (e) {}

    return [];
  }

  /**
   * Saves an adventure.
   * Free users are locked to 1 saved adventure slot!
   */
  public static async saveAdventure(
    user: UserProfile | null,
    guestId: string,
    adventure: {
      id?: string;
      title: string;
      startingPrompt: string;
      initialAiGeneration: string;
      narrative: NarrativeEntry[];
      files: Record<string, string>;
    }
  ): Promise<{ success: boolean; adventure?: SavedAdventure; reason?: 'tier_limit' | 'error'; message?: string }> {
    const isSubscriber = user?.tier === 'adventurer' || user?.tier === 'legendary' || user?.tier === 'celestial' || Boolean(user?.canSaveMultipleAdventures) || user?.role === 'admin' || user?.role === 'mod';
    const existingAdventures = await this.getSavedAdventures(user, guestId);

    // Free users can only have 1 saved adventure unless upgraded or granted permission
    const isUpdate = adventure.id && existingAdventures.some(a => a.id === adventure.id);
    if (!isSubscriber && existingAdventures.length >= 1 && !isUpdate) {
      return {
        success: false,
        reason: 'tier_limit',
        message: 'Saving multiple adventures is locked for Free users. Upgrade to Adventurer tier ($4.99/mo) in the Market to save unlimited adventures!'
      };
    }

    const id = adventure.id || 'adv_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
    const authorName = user?.username || localStorage.getItem('aifinity_guest_name') || 'Player (Guest)';
    const now = new Date().toISOString();

    const record: SavedAdventure = {
      id,
      userId: user?.uid || guestId,
      title: adventure.title.trim() || 'Untitled Adventure',
      authorName,
      startingPrompt: adventure.startingPrompt || '',
      initialAiGeneration: adventure.initialAiGeneration || '',
      narrative: adventure.narrative || [],
      files: adventure.files || {},
      turnCount: (adventure.narrative || []).filter(n => n.type === 'user').length,
      createdAt: now,
      updatedAt: now
    };

    // Save to Firestore if user is authenticated
    if (user?.uid) {
      try {
        const docRef = doc(db, 'users', user.uid, 'adventures', id);
        await setDoc(docRef, record);
      } catch (err) {
        console.error('Failed to save adventure to Firestore:', err);
      }
    }

    // Always update local cache
    try {
      const raw = localStorage.getItem(LOCAL_SAVED_ADVENTURES_KEY);
      let list: SavedAdventure[] = raw ? JSON.parse(raw) : [];
      const idx = list.findIndex(a => a.id === id);
      if (idx >= 0) {
        list[idx] = record;
      } else {
        list.unshift(record);
      }
      localStorage.setItem(LOCAL_SAVED_ADVENTURES_KEY, JSON.stringify(list));
    } catch (e) {}

    return { success: true, adventure: record };
  }

  /**
   * Delete a saved adventure
   */
  public static async deleteAdventure(
    user: UserProfile | null,
    guestId: string,
    adventureId: string
  ): Promise<boolean> {
    if (user?.uid) {
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'adventures', adventureId));
      } catch (err) {
        console.error('Error deleting from firestore:', err);
      }
    }

    try {
      const raw = localStorage.getItem(LOCAL_SAVED_ADVENTURES_KEY);
      if (raw) {
        const list: SavedAdventure[] = JSON.parse(raw);
        const filtered = list.filter(a => a.id !== adventureId);
        localStorage.setItem(LOCAL_SAVED_ADVENTURES_KEY, JSON.stringify(filtered));
      }
    } catch (e) {}

    return true;
  }

  /**
   * Post adventure to Community Adventures
   * Locked to $9.99+ monthly subscribers (Adventurer or Legendary tier)
   */
  public static async postToCommunity(
    user: UserProfile | null,
    postData: {
      title: string;
      shareType: CommunityShareType;
      startingPrompt: string;
      initialAiGeneration: string;
      narrative?: NarrativeEntry[];
      files?: Record<string, string>;
    }
  ): Promise<{ success: boolean; reason?: 'subscription_required' | 'not_logged_in' | 'error'; message?: string }> {
    if (!user) {
      return {
        success: false,
        reason: 'not_logged_in',
        message: 'You must be logged into an account to post to Community Adventures.'
      };
    }

    const tier = user.tier || 'free';
    const canPost = tier === 'adventurer' || tier === 'legendary' || tier === 'celestial' || Boolean(user.canPostCommunityAdventures) || user.role === 'admin' || user.role === 'mod';
    if (!canPost) {
      return {
        success: false,
        reason: 'subscription_required',
        message: 'Posting to Community Adventures is an exclusive perk for Adventurer, Legendary, and Celestial monthly members ($4.99/mo+). Upgrade in the Market to share your adventures with the world!'
      };
    }

    try {
      const id = 'comm_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
      const communityDoc: CommunityAdventure = {
        id,
        authorId: user.uid,
        authorName: user.username,
        authorTier: tier,
        title: postData.title.trim(),
        shareType: postData.shareType,
        startingPrompt: postData.startingPrompt,
        initialAiGeneration: postData.initialAiGeneration,
        narrative: postData.shareType === 'full' ? postData.narrative : undefined,
        files: postData.shareType === 'full' ? postData.files : undefined,
        likesCount: 0,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'community_adventures', id), communityDoc);
      return { success: true };
    } catch (err: any) {
      console.error('Error posting to community:', err);
      return { success: false, reason: 'error', message: err.message || 'Failed to post adventure.' };
    }
  }

  /**
   * Fetch public community adventures
   */
  public static async getCommunityAdventures(): Promise<CommunityAdventure[]> {
    try {
      const commRef = collection(db, 'community_adventures');
      const q = query(commRef, orderBy('createdAt', 'desc'), limit(50));
      const snap = await getDocs(q);
      const list: CommunityAdventure[] = [];
      snap.forEach((d) => {
        list.push(d.data() as CommunityAdventure);
      });
      return list;
    } catch (err) {
      console.error('Failed to load community adventures from Firestore:', err);
      return [];
    }
  }

  /**
   * Delete a post from community adventures (Admins, Mods, or original author)
   */
  public static async deleteCommunityAdventure(
    adventureId: string,
    user: UserProfile | null
  ): Promise<{ success: boolean; message?: string }> {
    if (!user) {
      return { success: false, message: 'Authentication required.' };
    }
    const isAdmin = user.role === 'admin' || isDefaultAdmin(user.email, user.username);
    const isMod = user.role === 'mod';

    try {
      const postRef = doc(db, 'community_adventures', adventureId);
      const snap = await getDoc(postRef);
      if (!snap.exists()) {
        return { success: false, message: 'Adventure not found.' };
      }
      const data = snap.data() as CommunityAdventure;
      const isAuthor = data.authorId === user.uid;

      if (!isAdmin && !isMod && !isAuthor) {
        return { success: false, message: 'You do not have permission to delete this community adventure.' };
      }

      await deleteDoc(postRef);
      return { success: true };
    } catch (err: any) {
      console.error('Failed to delete community adventure:', err);
      return { success: false, message: err.message || 'Failed to delete community adventure.' };
    }
  }
}
