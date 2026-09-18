import { db, auth } from './firebase';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  username: string;
  createdAt: string;
  isBetaAlpha: boolean;
  plan: string;
  subscriptionExpiresAt: number;
  purchasedActions: number;
  dailyActionsUsed: number;
  lastDailyReset: string;
  
  role?: 'admin' | 'mod' | 'user';
  adminGlowHidden?: boolean;
  grantedActions?: number;
  infiniteActionsGranted?: boolean;
  permanentSavesGranted?: boolean;
  permanentCommunityPostsGranted?: boolean;
  lastModGrantDate?: string;
  modGrantAmountToday?: number;
}

class UserService {
  private profile: UserProfile | null = null;
  private listeners: (() => void)[] = [];
  private unsubscribeSnapshot: (() => void) | null = null;
  private pendingGrants: number = 0;

  public getProfile(): UserProfile | null {
    return this.profile;
  }

  public getPendingGrants(): number {
    return this.pendingGrants;
  }

  public clearPendingGrants() {
    this.pendingGrants = 0;
  }

  public subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach(l => l());
  }

  public async syncProfile(localUsername: string, localPlan: string, localPurchased: number, localUsed: number, localReset: string) {
    if (!auth.currentUser) return;
    
    const uid = auth.currentUser.uid;
    const docRef = doc(db, 'users', uid);
    
    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as UserProfile;
        
        // If there are newly granted actions in firestore that haven't been claimed yet, claim them!
        let newPurchased = localPurchased;
        if (data.grantedActions && data.grantedActions > 0) {
          this.pendingGrants = data.grantedActions;
          newPurchased += data.grantedActions;
        }

        this.profile = data;
        
        // Update firestore with the latest local quota usage and reset grantedActions
        await updateDoc(docRef, {
          username: localUsername,
          plan: localPlan,
          purchasedActions: newPurchased,
          dailyActionsUsed: localUsed,
          lastDailyReset: localReset,
          grantedActions: 0 // consumed
        });
      } else {
        const newProfile: UserProfile = {
          uid,
          email: auth.currentUser.email || '',
          displayName: auth.currentUser.displayName || '',
          username: localUsername,
          createdAt: new Date().toISOString(),
          isBetaAlpha: true,
          plan: localPlan,
          subscriptionExpiresAt: 0,
          purchasedActions: localPurchased,
          dailyActionsUsed: localUsed,
          lastDailyReset: localReset,
          role: auth.currentUser.email === 'chloe.a.alba.1@gmail.com' ? 'admin' : 'user',
          grantedActions: 0,
          infiniteActionsGranted: false,
          permanentSavesGranted: false,
          permanentCommunityPostsGranted: false
        };
        await setDoc(docRef, newProfile);
        this.profile = newProfile;
      }
      this.notify();
      
      if (this.unsubscribeSnapshot) this.unsubscribeSnapshot();
      this.unsubscribeSnapshot = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as UserProfile;
          this.profile = data;
          if (data.grantedActions && data.grantedActions > 0) {
            this.pendingGrants = data.grantedActions;
            // update local storage via quota service when notify happens
          }
          this.notify();
        }
      });
      
    } catch (e) {
      console.error('Failed to sync user profile to Firestore:', e);
    }
  }

  public async toggleAdminGlow(hidden: boolean) {
    if (!auth.currentUser || !this.profile) return;
    const docRef = doc(db, 'users', auth.currentUser.uid);
    await updateDoc(docRef, { adminGlowHidden: hidden });
  }

  public async clearGrantsInFirestore() {
    if (!auth.currentUser || !this.profile) return;
    const docRef = doc(db, 'users', auth.currentUser.uid);
    await updateDoc(docRef, { grantedActions: 0 });
  }

  public async findUserByUsername(username: string): Promise<UserProfile | null> {
    const q = query(collection(db, 'users'), where('username', '==', username));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return snap.docs[0].data() as UserProfile;
  }

  public async adminGrantActions(targetUid: string, amount: number, isInfinite: boolean = false) {
    const docRef = doc(db, 'users', targetUid);
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error("User not found");
    const data = snap.data() as UserProfile;
    
    if (isInfinite) {
      await updateDoc(docRef, { infiniteActionsGranted: true });
    } else {
      await updateDoc(docRef, { grantedActions: (data.grantedActions || 0) + amount });
    }
  }

  public async modGrantActions(targetUid: string, amount: number) {
    const docRef = doc(db, 'users', targetUid);
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error("User not found");
    const data = snap.data() as UserProfile;
    
    const today = new Date().toISOString().split('T')[0];
    let currentAmountToday = 0;
    if (data.lastModGrantDate === today) {
      currentAmountToday = data.modGrantAmountToday || 0;
    }
    
    if (currentAmountToday + amount > 500) {
      throw new Error(`Mods can only grant a max of 500 actions per user per day. They can receive ${500 - currentAmountToday} more today.`);
    }
    
    await updateDoc(docRef, { 
      grantedActions: (data.grantedActions || 0) + amount,
      lastModGrantDate: today,
      modGrantAmountToday: currentAmountToday + amount
    });
  }

  public async adminRevokeInfinite(targetUid: string) {
    const docRef = doc(db, 'users', targetUid);
    await updateDoc(docRef, { infiniteActionsGranted: false });
  }

  public async grantPermanentPerks(targetUid: string, saves: boolean, posts: boolean) {
    const docRef = doc(db, 'users', targetUid);
    await updateDoc(docRef, { 
      permanentSavesGranted: saves,
      permanentCommunityPostsGranted: posts
    });
  }

  public async adminSetRole(targetUid: string, role: 'admin' | 'mod' | 'user') {
    const docRef = doc(db, 'users', targetUid);
    await updateDoc(docRef, { role });
  }
}

export const userService = new UserService();
