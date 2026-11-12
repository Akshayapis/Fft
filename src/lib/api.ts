import { API_PREFIX } from './config';

let token = '';
try { token = localStorage.getItem('nexus_token') || sessionStorage.getItem('nexus_token') || ''; } catch { /* SSR-safe */ }
export const getToken = () => token;
export function setToken(value: string, remember = true) {
  token = value;
  try {
    localStorage.removeItem('nexus_token'); sessionStorage.removeItem('nexus_token');
    if (value) (remember ? localStorage : sessionStorage).setItem('nexus_token', value);
  } catch { /* storage blocked */ }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

type Options = { method?: string; body?: any; signal?: AbortSignal };
export async function request<T = any>(path: string, { method = 'GET', body, signal }: Options = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_PREFIX}${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      credentials: 'omit',
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e;
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
  }
  let data: any = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    const message = data?.error || `Request failed (${res.status})`;
    if (res.status === 401 && !path.startsWith('/auth/')) {
      setToken('');
      window.dispatchEvent(new CustomEvent('nexus:unauthorized'));
    }
    throw new ApiError(message, res.status);
  }
  return data as T;
}

export const api = {
  get: <T = any>(p: string) => request<T>(p),
  post: <T = any>(p: string, body?: any) => request<T>(p, { method: 'POST', body: body ?? {} }),
  patch: <T = any>(p: string, body?: any) => request<T>(p, { method: 'PATCH', body: body ?? {} }),
  put: <T = any>(p: string, body?: any) => request<T>(p, { method: 'PUT', body: body ?? {} }),
  del: <T = any>(p: string, body?: any) => request<T>(p, { method: 'DELETE', body }),
};

export async function fileToDataUrl(file: File): Promise<string> {
  if (file.size > 3 * 1024 * 1024) throw new ApiError('File is too large (max 3 MB).', 400);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ApiError('Could not read that file.', 400));
    reader.readAsDataURL(file);
  });
}
