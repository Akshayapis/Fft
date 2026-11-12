/** Runtime configuration. No credentials or Firebase keys are ever hard-coded. */
const env = import.meta.env as Record<string, string | undefined>;

export const API_ORIGIN = (env.VITE_API_BASE_URL || '').replace(/\/$/, '');
export const REQUESTED_BACKEND = env.VITE_BACKEND === 'firebase' ? 'firebase' : 'local';
export const GOOGLE_CLIENT_ID = env.VITE_GOOGLE_CLIENT_ID || '';

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: env.VITE_FIREBASE_APP_ID || '',
};
export const FIREBASE_CONFIGURED = !!(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
export const BACKEND = REQUESTED_BACKEND === 'firebase' && FIREBASE_CONFIGURED ? 'firebase' : 'local';
export const SETUP_REQUIRED = REQUESTED_BACKEND === 'firebase' && !FIREBASE_CONFIGURED;
export const API_PREFIX = `${API_ORIGIN}/api`;
