<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'; import { useI18n } from 'vue-i18n'; import { useRoute, useRouter } from 'vue-router';
import { useSession } from '../../app/session'; import { ApiError, errorKey, json, request } from '../../lib/api';
import UiButton from '../../components/ui/UiButton.vue'; import UiInput from '../../components/ui/UiInput.vue';
import { pendingInvitation } from './invitation';
const { t } = useI18n(); const route = useRoute(); const router = useRouter(); const session = useSession();
const email = ref(''); const password = ref(''); const name = ref(''); const error = ref(''); const message = ref(''); const busy = ref(false); const google = ref(false);
const token = ref(new URLSearchParams(location.hash.slice(1)).get('token') ?? '');
if (token.value) history.replaceState(history.state, '', location.pathname + location.search);
const mode = computed(() => String(route.name));
const googleUrl = `${import.meta.env.VITE_API_BASE_URL || '/api/v1'}/auth/google`;
const title = computed(() => ({ login: 'auth.login', register: 'auth.register', forgot: 'auth.forgot', reset: 'auth.reset', verify: 'auth.verify', resend: 'auth.resend' })[mode.value] || 'auth.login');
const action = computed(() => ({ login: 'auth.loginAction', register: 'auth.registerAction', forgot: 'auth.send', reset: 'auth.reset', verify: 'auth.verify', resend: 'auth.send' })[mode.value] || 'common.confirm');
onMounted(async () => { try { google.value = (await request<{ google: boolean }>('/auth/options')).google; } catch { /* Email authentication remains available. */ } });
async function submit() {
  busy.value = true; error.value = ''; message.value = '';
  try {
    if (mode.value === 'login') { await session.login(email.value, password.value); await router.push(pendingInvitation.value ? '/invitations/accept' : '/workspaces'); return; }
    if (mode.value === 'register') await request('/auth/register', { method: 'POST', body: json({ email: email.value, password: password.value, displayName: name.value, language: document.documentElement.lang }) });
    else if (mode.value === 'forgot' || mode.value === 'resend') await request(mode.value === 'forgot' ? '/auth/forgot-password' : '/auth/resend-verification', { method: 'POST', body: json({ email: email.value }) });
    else { if (!token.value) { error.value = t('auth.missingToken'); return; } await request(mode.value === 'reset' ? '/auth/reset-password' : '/auth/verify-email', { method: 'POST', body: json({ token: token.value, ...(mode.value === 'reset' ? { password: password.value } : {}) }) }); }
    message.value = t(mode.value === 'reset' ? 'auth.resetDone' : mode.value === 'verify' ? 'auth.verified' : 'auth.sent');
  } catch (failure) { error.value = t(failure instanceof ApiError && failure.status === 401 && mode.value === 'login' ? 'auth.invalid' : errorKey(failure)); }
  finally { busy.value = false; }
}
</script>
<template>
  <h2 style="font-size: 1.6rem">
    {{ t(title) }}
  </h2>
  <form
    class="stack"
    @submit.prevent="submit"
  >
    <UiInput
      v-if="mode === 'register'"
      v-model="name"
      :label="t('auth.name')"
      autocomplete="name"
      maxlength="100"
      required
    />
    <UiInput
      v-if="!['verify', 'reset'].includes(mode)"
      v-model="email"
      :label="t('auth.email')"
      type="email"
      autocomplete="email"
      maxlength="320"
      required
    />
    <UiInput
      v-if="['login', 'register', 'reset'].includes(mode)"
      v-model="password"
      :label="t('auth.password')"
      type="password"
      :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
      :minlength="mode === 'login' ? 1 : 12"
      maxlength="128"
      :hint="mode !== 'login' ? t('auth.passwordHint') : undefined"
      required
    />
    <p
      v-if="error"
      class="field-error"
      role="alert"
    >
      {{ error }}
    </p><p
      v-if="message"
      role="status"
    >
      {{ message }}
    </p>
    <UiButton
      type="submit"
      :loading="busy"
    >
      {{ t(action) }}
    </UiButton>
    <a
      v-if="google && mode === 'login'"
      class="button secondary"
      :href="googleUrl"
    >{{ t('auth.google') }}</a>
  </form>
  <div
    class="stack"
    style="margin-top: 1.5rem"
  >
    <RouterLink
      v-if="mode === 'login'"
      to="/forgot-password"
    >{{ t('auth.forgot') }}</RouterLink><RouterLink
      v-if="mode === 'login'"
      to="/resend-verification"
    >{{ t('auth.resend') }}</RouterLink><p class="muted">
      {{ t(mode === 'login' ? 'auth.noAccount' : 'auth.haveAccount') }} <RouterLink :to="mode === 'login' ? '/register' : '/login'">{{ t(mode === 'login' ? 'auth.registerAction' : 'auth.loginAction') }}</RouterLink>
    </p>
  </div>
</template>
