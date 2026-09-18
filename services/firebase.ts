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
    const code = error?.code || '';
    const message = error?.message || '';
    const isUnauthorizedDomain = code === 'auth/unauthorized-domain' || message.includes('auth/unauthorized-domain');

    if (isUnauthorizedDomain) {
      const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'www.aifinity-rpg.com';
      const projectId = firebaseConfig.projectId || 'gen-lang-client-0320558179';
      const consoleSettingsUrl = `https://console.firebase.google.com/project/${projectId}/authentication/settings`;

      return {
        success: false,
        isUnauthorizedDomain: true,
        unauthorizedHost: currentHost,
        consoleSettingsUrl,
        error: `Firebase Auth Error (auth/unauthorized-domain): The domain "${currentHost}" is not authorized for Google Sign-In. You can authorize it by adding "www.aifinity-rpg.com" and "aifinity-rpg.com" in Firebase Console > Authentication > Settings > Authorized domains.`
      };
    }

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
