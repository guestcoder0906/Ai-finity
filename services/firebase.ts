import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase App singleton
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.setCustomParameters({
  prompt: 'select_account'
});

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || undefined);

/**
 * Trigger Firebase Google Auth popup window
 */
export async function signInWithGooglePopup() {
  try {
    const result = await signInWithPopup(auth, googleAuthProvider);
    return {
      success: true,
      user: result.user
    };
  } catch (error: any) {
    console.error('Firebase Google Sign-In error:', error);
    return {
      success: false,
      error: error?.message || 'Google sign-in was cancelled or failed.'
    };
  }
}

export async function signOutFirebase() {
  try {
    await signOut(auth);
  } catch (e) {
    console.warn('Firebase sign-out error:', e);
  }
}
