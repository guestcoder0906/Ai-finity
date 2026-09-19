import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Dynamically use current host as authDomain when running on the custom domain (e.g. www.aifinity-rpg.com)
// This utilizes the /__/auth reverse proxy for seamless same-domain OAuth authentication
const getEffectiveFirebaseConfig = () => {
  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    const hostname = window.location.hostname;
    if (hostname.includes('aifinity-rpg.com')) {
      return {
        ...firebaseConfig,
        authDomain: window.location.host
      };
    }
  }
  return firebaseConfig;
};

const effectiveConfig = getEffectiveFirebaseConfig();

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(effectiveConfig) : getApp();

// Authentication
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Ensure Google auth prompts account selection
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// Firestore instance targeting the configured database ID
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || undefined);

export default app;
