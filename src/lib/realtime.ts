import { API_PREFIX, BACKEND, firebaseConfig } from './config';
import { api, fileToDataUrl, getToken } from './api';

/** Subscribe to "something changed" signals. Local: SSE. Firebase: Firestore onSnapshot. */
export function subscribeToChanges(userId: string, onChange: () => void): () => void {
  if (BACKEND === 'firebase') {
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const { initializeApp, getApps } = await import('firebase/app');
      const { getFirestore, collection, query, where, onSnapshot } = await import('firebase/firestore');
      const fbApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
      const db = getFirestore(fbApp);
      if (cancelled) return;
      unsub = onSnapshot(query(collection(db, 'notifications'), where('userId', '==', userId)), () => onChange(), () => onChange());
    })().catch(() => { /* polling fallback still active */ });
    const poll = window.setInterval(onChange, 20000);
    return () => { cancelled = true; unsub?.(); window.clearInterval(poll); };
  }
  let source: EventSource | null = null;
  try {
    source = new EventSource(`${API_PREFIX}/events?token=${encodeURIComponent(getToken())}`);
    source.addEventListener('change', () => onChange());
  } catch { /* polling fallback below */ }
  const poll = window.setInterval(onChange, 20000);
  return () => { source?.close(); window.clearInterval(poll); };
}

/** Upload a file to local disk storage or Firebase Cloud Storage (rules enforce ownership). */
export async function uploadFile(file: File, userId: string, kind: string): Promise<string> {
  if (BACKEND === 'firebase') {
    const { initializeApp, getApps } = await import('firebase/app');
    const { getStorage, ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
    const fbApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    const storage = getStorage(fbApp);
    const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const fileRef = ref(storage, `users/${userId}/${kind}s/${safeName}`);
    await uploadBytes(fileRef, file, { contentType: file.type });
    return getDownloadURL(fileRef);
  }
  const dataUrl = await fileToDataUrl(file);
  const out = await api.post<{ url: string }>('/uploads', { dataUrl, kind });
  return out.url;
}
