import { db } from './firebase';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
  query,
  orderBy,
  limit
} from 'firebase/firestore';

export interface CommunityAdventureRecord {
  id: string;
  title: string;
  authorUid?: string;
  authorName: string;
  shareType: 'full_adventure' | 'starting_prompt_only' | 'initial_ai_generation';
  startingPrompt: string;
  initialGeneration?: string;
  fullNarrativeText?: string;
  createdAt: number;
  likes: number;
  tags?: string;
  description?: string;
  isNsfw?: boolean;
}

const LOCAL_STORAGE_COMMUNITY_FALLBACK = 'aifinity_community_adventures_cache';
const LOCAL_STORAGE_MY_POSTS = 'aifinity_my_posted_adventures_ids';

export const communityService = {
  /**
   * Post an adventure to the community page
   */
  async postAdventure(adventure: Omit<CommunityAdventureRecord, 'id' | 'createdAt' | 'likes'>): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      const id = 'adv_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
      const record: CommunityAdventureRecord = {
        ...adventure,
        id,
        createdAt: Date.now(),
        likes: 0
      };

      // 1. Try writing to Firestore
      try {
        const colRef = collection(db, 'community_adventures');
        await setDoc(doc(colRef, id), record);
      } catch (fsErr) {
        console.warn('Firestore write notice (falling back to local community cache if offline):', fsErr);
      }

      // 2. Also keep in shared local cache
      const cached = this.getLocalCache();
      cached.unshift(record);
      localStorage.setItem(LOCAL_STORAGE_COMMUNITY_FALLBACK, JSON.stringify(cached.slice(0, 50)));

      // 3. Track in user's posted adventure list
      this.trackUserPost(id);

      return { success: true, id };
    } catch (err: any) {
      console.error('Failed to post adventure:', err);
      return { success: false, error: err.message || 'Failed to publish adventure.' };
    }
  },

  /**
   * Take down (delete) an adventure from the community
   */
  
  async updateAdventure(id: string, updates: Partial<CommunityAdventureRecord>): Promise<{ success: boolean; error?: string }> {
    try {
      try {
        const docRef = doc(db, 'community_adventures', id);
        
        await updateDoc(docRef, updates);
      } catch (fsErr) {
        console.warn('Firestore update notice (falling back to local cache):', fsErr);
      }

      const cached = this.getLocalCache();
      const updated = cached.map(adv => adv.id === id ? { ...adv, ...updates } : adv);
      localStorage.setItem(LOCAL_STORAGE_COMMUNITY_FALLBACK, JSON.stringify(updated));

      return { success: true };
    } catch (err: any) {
      console.error('Failed to update adventure:', err);
      return { success: false, error: err.message || 'Failed to update adventure.' };
    }
  },

  async deleteAdventure(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. Delete from Firestore
      try {
        const docRef = doc(db, 'community_adventures', id);
        await deleteDoc(docRef);
      } catch (fsErr) {
        console.warn('Firestore delete notice (falling back to local cache):', fsErr);
      }

      // 2. Remove from local community cache
      const cached = this.getLocalCache();
      const updated = cached.filter(adv => adv.id !== id);
      localStorage.setItem(LOCAL_STORAGE_COMMUNITY_FALLBACK, JSON.stringify(updated));

      // 3. Untrack from user's posted adventure IDs
      this.untrackUserPost(id);

      return { success: true };
    } catch (err: any) {
      console.error('Failed to delete adventure:', err);
      return { success: false, error: err.message || 'Failed to take down adventure.' };
    }
  },

  /**
   * Track adventure ID posted by this client
   */
  trackUserPost(id: string) {
    try {
      const current = this.getMyPostedIds();
      if (!current.includes(id)) {
        current.unshift(id);
        localStorage.setItem(LOCAL_STORAGE_MY_POSTS, JSON.stringify(current));
      }
    } catch (e) {
      console.warn('Error saving posted ID:', e);
    }
  },

  /**
   * Untrack adventure ID
   */
  untrackUserPost(id: string) {
    try {
      const current = this.getMyPostedIds().filter(x => x !== id);
      localStorage.setItem(LOCAL_STORAGE_MY_POSTS, JSON.stringify(current));
    } catch (e) {
      console.warn('Error untracking posted ID:', e);
    }
  },

  /**
   * Get all IDs of adventures posted by this client
   */
  getMyPostedIds(): string[] {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_MY_POSTS);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return [];
  },

  /**
   * Verify if a specific adventure belongs to the current user
   */
  isUserAuthor(
    adventure: CommunityAdventureRecord,
    currentAuthorName: string,
    currentAuthorUid?: string
  ): boolean {
    const myIds = this.getMyPostedIds();
    if (myIds.includes(adventure.id)) return true;

    if (currentAuthorUid && adventure.authorUid && adventure.authorUid === currentAuthorUid) {
      return true;
    }

    if (
      currentAuthorName &&
      adventure.authorName &&
      adventure.authorName.trim().toLowerCase() === currentAuthorName.trim().toLowerCase()
    ) {
      return true;
    }

    return false;
  },

  /**
   * Get all active posts in the community that belong to the current user
   */
  getUserActivePosts(
    adventures: CommunityAdventureRecord[],
    currentAuthorName: string,
    currentAuthorUid?: string
  ): CommunityAdventureRecord[] {
    return adventures.filter(adv => this.isUserAuthor(adv, currentAuthorName, currentAuthorUid));
  },

  /**
   * Fetch recent community adventures
   */
  async getAdventures(): Promise<CommunityAdventureRecord[]> {
    try {
      const colRef = collection(db, 'community_adventures');
      const q = query(colRef, orderBy('createdAt', 'desc'), limit(30));
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        const list: CommunityAdventureRecord[] = [];
        snap.forEach(docSnap => {
          list.push(docSnap.data() as CommunityAdventureRecord);
        });
        localStorage.setItem(LOCAL_STORAGE_COMMUNITY_FALLBACK, JSON.stringify(list));
        return list;
      } else {
        localStorage.setItem(LOCAL_STORAGE_COMMUNITY_FALLBACK, JSON.stringify([]));
        return [];
      }
    } catch (e) {
      console.warn('Could not read from Firestore, using local cache:', e);
    }

    return this.getLocalCache();
  },

  getLocalCache(): CommunityAdventureRecord[] {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_COMMUNITY_FALLBACK);
      if (raw) return JSON.parse(raw);
    } catch (e) { }

    // No default seed adventures anymore
    return [];
  }
};
