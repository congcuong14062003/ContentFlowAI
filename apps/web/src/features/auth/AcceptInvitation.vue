<script setup lang="ts">
import { ref } from 'vue'; import { useRouter } from 'vue-router'; import { useI18n } from 'vue-i18n'; import { useSession } from '../../app/session'; import { pendingInvitation } from './invitation'; import { request, json, errorKey } from '../../lib/api'; import { queryClient } from '../../app/query'; import UiButton from '../../components/ui/UiButton.vue';
const { t } = useI18n(); const session = useSession(); const router = useRouter(); const busy = ref(false); const error = ref('');
const raw = new URLSearchParams(location.hash.slice(1)).get('token'); if (raw) { pendingInvitation.value = raw; history.replaceState(history.state, '', location.pathname); }
async function accept() { busy.value = true; try { const result = await request<{ workspaceId: string }>('/invitations/accept', { method: 'POST', body: json({ token: pendingInvitation.value }) }); pendingInvitation.value = ''; await queryClient.invalidateQueries({ queryKey: ['workspaces'] }); await router.push(`/w/${result.workspaceId}/settings`); } catch (failure) { error.value = t(errorKey(failure)); } finally { busy.value = false; } }
</script>
<template>
  <h1>{{ t('workspace.accept') }}</h1><p class="muted">
    {{ t('workspace.acceptDescription') }}
  </p><p
    v-if="error"
    role="alert"
    class="field-error"
  >
    {{ error }}
  </p><p v-if="!pendingInvitation">
    {{ t('auth.missingToken') }}
  </p><UiButton
    v-else-if="session.user"
    :loading="busy"
    @click="accept"
  >
    {{ t('workspace.accept') }}
  </UiButton><RouterLink
    v-else
    class="button"
    to="/login"
  >{{ t('auth.loginAction') }}</RouterLink>
</template>
