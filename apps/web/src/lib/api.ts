export class ApiError extends Error { constructor(readonly code: string, readonly status: number, readonly details?: unknown) { super(code); } }
const base = import.meta.env.VITE_API_BASE_URL || '/api/v1';
let accessToken = ''; let refreshInFlight: Promise<{ accessToken: string; user: User }> | undefined;
let latestSession: { accessToken: string; user: User } | undefined;
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('contentflow-session') : undefined;
export interface User { id: string; email: string; displayName: string; language: string; systemRole: 'USER' | 'SUPER_ADMIN'; emailVerifiedAt: string | null }
export function clearAccessToken() { accessToken = ''; latestSession = undefined; }
export function setAccessToken(value: string) { accessToken = value; }
if (channel) channel.onmessage = (event: MessageEvent) => {
  if (event.data?.type === 'signed-out') { clearAccessToken(); window.dispatchEvent(new Event('cf-session-expired')); }
  if (event.data?.type === 'session' && /^[A-Za-z0-9_-]{43}$/.test(event.data.session?.accessToken ?? '') && event.data.session?.user?.id) {
    latestSession = event.data.session; accessToken = latestSession!.accessToken;
    window.dispatchEvent(new CustomEvent('cf-session-updated', { detail: latestSession!.user }));
  }
};
export async function sessionOperation<T>(action: () => Promise<T>): Promise<T> {
  if (navigator.locks) return await navigator.locks.request('contentflow-session-cookie', action);
  return await action();
}
export function publishSession(session: { accessToken: string; user: User }) { latestSession = session; setAccessToken(session.accessToken); channel?.postMessage({ type: 'session', session }); }
export function publishSignOut() { clearAccessToken(); channel?.postMessage({ type: 'signed-out' }); }
export async function request<T>(path: string, options: RequestInit = {}, retry = true, binary = false): Promise<T> {
  let response: Response;
  const sentToken = accessToken;
  try { response = await fetch(`${base}${path}`, { ...options, credentials: 'include', headers: { ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...options.headers }, signal: options.signal ?? AbortSignal.timeout(15000) }); }
  catch { throw new ApiError('NETWORK_ERROR', 0); }
  if (response.status === 401 && retry && !path.startsWith('/auth/')) {
    if (accessToken && accessToken !== sentToken) return request(path, options, false, binary);
    try { await refreshSession(); } catch { clearAccessToken(); window.dispatchEvent(new Event('cf-session-expired')); throw new ApiError('HTTP_401', 401); }
    return request(path, options, false, binary);
  }
  if (binary && response.ok) return await response.blob() as T;
  const body = await response.json().catch(() => ({})) as { data?: T; error?: { code: string; message: string; details?: unknown } };
  if (!response.ok) throw new ApiError(body.error?.message === 'EMAIL_UNVERIFIED' ? 'EMAIL_UNVERIFIED' : body.error?.code || `HTTP_${response.status}`, response.status, body.error?.details);
  return body.data as T;
}
export function refreshSession() {
  const previousToken = accessToken;
  if (!refreshInFlight) refreshInFlight = sessionOperation(async () => {
    if (latestSession && accessToken !== previousToken) return latestSession;
    const result = await request<{ accessToken: string; user: User }>('/auth/refresh', { method: 'POST' }, false);
    publishSession(result); return result;
  }).finally(() => { refreshInFlight = undefined; });
  return refreshInFlight;
}
export const json = (body: unknown) => JSON.stringify(body);
export async function notificationStream(signal: AbortSignal, onEvent: (name: string) => void) {
  let response=await fetch(`${base}/notifications/stream`,{credentials:'include',headers:{Authorization:`Bearer ${accessToken}`},signal});
  if(response.status===401){await refreshSession();response=await fetch(`${base}/notifications/stream`,{credentials:'include',headers:{Authorization:`Bearer ${accessToken}`},signal});}
  if(!response.ok||!response.body)throw new ApiError(`HTTP_${response.status}`,response.status);
  const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';let eventName='';
  try{while(!signal.aborted){const chunk=await reader.read();if(chunk.done)break;buffer+=decoder.decode(chunk.value,{stream:true});let cut=buffer.indexOf('\n');while(cut!==-1){const line=buffer.slice(0,cut).replace(/\r$/,'');buffer=buffer.slice(cut+1);if(line.startsWith('event: '))eventName=line.slice(7);else if(!line&&eventName){onEvent(eventName);eventName='';}cut=buffer.indexOf('\n');}}}finally{reader.releaseLock();}
}
export function errorKey(error: unknown) { return error instanceof ApiError ? error.code === 'EMAIL_UNVERIFIED' ? 'auth.unverified' : `errors.${error.code}` : 'common.error'; }
