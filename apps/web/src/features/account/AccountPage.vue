<script setup lang="ts">
import { ref } from 'vue'; import { useI18n } from 'vue-i18n'; import { useRouter } from 'vue-router'; import { useSession } from '../../app/session'; import { usePreferences } from '../../app/preferences'; import { queryClient } from '../../app/query'; import { request, json, errorKey, type User } from '../../lib/api'; import { toast } from '../../lib/toasts';
import PageHeader from '../../components/PageHeader.vue'; import UiButton from '../../components/ui/UiButton.vue'; import UiInput from '../../components/ui/UiInput.vue'; import UiSelect from '../../components/ui/UiSelect.vue'; import UiCard from '../../components/ui/UiCard.vue'; import UiState from '../../components/ui/UiState.vue'; import UiConfirmDialog from '../../components/ui/UiConfirmDialog.vue';
import { usePagedQuery } from '../../lib/paged-query'; import UiLoadMore from '../../components/ui/UiLoadMore.vue';
const { t, locale } = useI18n(); const session = useSession(); const preferences = usePreferences(); const router = useRouter(); const name = ref(session.user?.displayName ?? ''); const language = ref<string | string[]>(session.user?.language ?? 'vi'); const currentPassword = ref(''); const password = ref(''); const busy = ref(false); const error = ref(''); const revokeId = ref(''); const confirm = ref(false);
const sessions = usePagedQuery<{ currentSessionId: string; items: { id: string; userAgent: string | null; createdAt: string; expiresAt: string }[] }>(['sessions'], '/users/me/sessions');
async function execute(fn: () => Promise<void>) { busy.value = true; error.value = ''; try { await fn(); } catch (failure) { error.value = t(errorKey(failure)); } finally { busy.value = false; } }
async function save() { await execute(async () => { session.user = await request<User>('/users/me', { method: 'PATCH', body: json({ displayName: name.value, language: language.value }) }); preferences.language = String(language.value); toast(t('common.saved')); }); }
async function changePassword() { await execute(async () => { await request('/users/me/password', { method: 'POST', body: json({ currentPassword: currentPassword.value, password: password.value }) }); currentPassword.value = ''; password.value = ''; session.clear(); toast(t('account.passwordChanged')); await router.push('/login'); }); }
async function revoke() { await execute(async () => { await request(`/users/me/sessions/${revokeId.value}`, { method: 'DELETE' }); confirm.value = false; if (revokeId.value === sessions.data.value?.currentSessionId) { session.clear(); await router.push('/login'); } else await queryClient.invalidateQueries({ queryKey: ['sessions'] }); }); }
</script>
<template>
  <PageHeader :title="t('account.title')" /><p
    v-if="error"
    class="field-error"
    role="alert"
  >
    {{ error }}
  </p><div class="grid">
    <UiCard>
      <h2>{{ t('account.profile') }}</h2><form
        class="stack"
        @submit.prevent="save"
      >
        <UiInput
          v-model="name"
          :label="t('auth.name')"
          autocomplete="name"
          maxlength="100"
          required
        /><p class="muted">
          {{ session.user?.email }}
        </p><UiSelect
          v-model="language"
          :label="t('common.language')"
          :options="[{ value: 'vi', label: 'Tiếng Việt' }, { value: 'en', label: 'English' }]"
        /><UiButton
          type="submit"
          :loading="busy"
        >
          {{ t('common.save') }}
        </UiButton>
      </form>
    </UiCard><UiCard>
      <h2>{{ t('auth.changePassword') }}</h2><form
        class="stack"
        @submit.prevent="changePassword"
      >
        <UiInput
          v-model="currentPassword"
          :label="t('auth.currentPassword')"
          type="password"
          autocomplete="current-password"
          maxlength="128"
          required
        /><UiInput
          v-model="password"
          :label="t('auth.newPassword')"
          type="password"
          autocomplete="new-password"
          minlength="12"
          maxlength="128"
          :hint="t('auth.passwordHint')"
          required
        /><UiButton
          type="submit"
          :loading="busy"
        >
          {{ t('auth.changePassword') }}
        </UiButton>
      </form>
    </UiCard>
  </div><UiCard style="margin-top: 1.5rem">
    <h2>{{ t('account.sessions') }}</h2><p class="muted">
      {{ t('account.sessionsHint') }}
    </p><UiState
      v-if="sessions.isPending.value"
      kind="loading"
    /><UiState
      v-else-if="sessions.error.value"
      kind="error"
      retry
      @retry="sessions.refetch()"
    /><div
      v-else
      class="stack"
    >
      <div
        v-for="item in sessions.data.value?.items"
        :key="item.id"
        class="row"
        style="justify-content: space-between"
      >
        <div>
          <span>{{ item.userAgent || '—' }}</span><p class="muted">
            {{ new Date(item.createdAt).toLocaleString(locale) }} <span v-if="item.id === sessions.data.value?.currentSessionId">· {{ t('common.current') }}</span>
          </p>
        </div><UiButton
          variant="secondary"
          :disabled="busy"
          @click="revokeId = item.id; confirm = true"
        >
          {{ t('common.revoke') }}
        </UiButton>
      </div>
    </div>
  
    <UiLoadMore
      :has-more="sessions.hasNextPage.value"
      :busy="sessions.isFetchingNextPage.value"
      @next="sessions.fetchNextPage()"
    />
  </UiCard><UiConfirmDialog
    v-model="confirm"
    :title="t('common.revoke')"
    :description="t('account.sessionsHint')"
    :busy="busy"
    @confirm="revoke"
  />
</template>
