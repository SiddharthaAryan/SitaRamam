import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
export const configured = Object.values(config).every(Boolean);
export const app = configured ? initializeApp(config) : null;
if (app && import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY) {
  initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY), isTokenAutoRefreshEnabled: true });
}
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export function authReady() {
  return new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(auth, async user => {
      stop();
      if (user) return resolve(user);
      try { resolve((await signInAnonymously(auth)).user); } catch (error) { reject(error); }
    }, reject);
  });
}
