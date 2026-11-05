import { defineStore } from 'pinia'; import { ref } from 'vue';
import { clearAccessToken, json, refreshSession, request, publishSession, publishSignOut, sessionOperation, type User } from '../lib/api';
import { queryClient } from './query';
export const useSession = defineStore('session', () => {
  const user = ref<User | null>(null); let boot: Promise<void> | undefined;
  function clear() { clearAccessToken(); user.value = null; queryClient.clear(); }
  function bootstrap() { return boot ??= refreshSession().then((result) => { user.value = result.user; }).catch(() => { clear(); }); }
  async function login(email: string, password: string) { await sessionOperation(async () => { const result = await request<{ user: User; accessToken: string }>('/auth/login', { method: 'POST', body: json({ email, password }) }); publishSession(result); user.value = result.user; queryClient.clear(); }); }
  async function logout() { await sessionOperation(async () => { await request('/auth/logout', { method: 'POST' }); publishSignOut(); clear(); }); }
  return { user, bootstrap, login, logout, clear };
});
