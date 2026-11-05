<script setup lang="ts">
import { computed, ref, watch } from 'vue'; import { useRoute } from 'vue-router'; import { useI18n } from 'vue-i18n'; import { useQuery } from '@tanstack/vue-query';
import { errorKey, json, request } from '../../lib/api'; import { toast } from '../../lib/toasts'; import { queryClient } from '../../app/query';
import { usePagedQuery } from '../../lib/paged-query'; import UiLoadMore from '../../components/ui/UiLoadMore.vue';
import PageHeader from '../../components/PageHeader.vue'; import UiButton from '../../components/ui/UiButton.vue'; import UiInput from '../../components/ui/UiInput.vue'; import UiSelect from '../../components/ui/UiSelect.vue'; import UiCard from '../../components/ui/UiCard.vue'; import UiState from '../../components/ui/UiState.vue'; import UiTabs from '../../components/ui/UiTabs.vue'; import UiConfirmDialog from '../../components/ui/UiConfirmDialog.vue'; import MemberRow from './MemberRow.vue';
const { t } = useI18n(); const route = useRoute(); const id = computed(() => String(route.params.workspaceId)); const path = computed(() => `/workspaces/${id.value}`); const tab = ref('members'); const name = ref(''); const email = ref(''); const role = ref<string | string[]>('VIEWER'); const busy = ref(false); const error = ref(''); const confirm = ref(false); const target = ref<{ kind: 'members' | 'invitations'; id: string }>();
const workspace = useQuery({ queryKey: computed(() => ['workspace', id.value]), queryFn: () => request<{ id: string; name: string; role: string }>(path.value) });
const manager = computed(() => ['OWNER', 'ADMIN'].includes(workspace.data.value?.role ?? ''));
const members = usePagedQuery<{ items: { userId: string; role: string; user: { displayName: string; email: string } }[] }>(() => ['members', id.value], () => `${path.value}/members`, () => !!workspace.data.value);
interface Invitation { id: string; email: string; role: string; expiresAt: string; acceptedAt: string | null; revokedAt: string | null }
const invitations = usePagedQuery<{ items: Invitation[] }>(() => ['invitations', id.value], () => `${path.value}/invitations`, manager);
watch(() => workspace.data.value, (value) => { name.value = value?.name ?? ''; role.value = 'VIEWER'; error.value = ''; confirm.value = false; }, { immediate: true });
async function mutate(suffix: string, method: string, body?: unknown) { busy.value = true; error.value = ''; try { await request(`${path.value}${suffix}`, { method, ...(body ? { body: json(body) } : {}) }); await Promise.all([queryClient.invalidateQueries({ queryKey: ['workspace', id.value] }), queryClient.invalidateQueries({ queryKey: ['members', id.value] }), queryClient.invalidateQueries({ queryKey: ['invitations', id.value] }), queryClient.invalidateQueries({ queryKey: ['workspaces'] })]); toast(t('common.saved')); confirm.value = false; } catch (failure) { error.value = t(errorKey(failure)); } finally { busy.value = false; } }
function ask(kind: 'members' | 'invitations', memberId: string) { target.value = { kind, id: memberId }; confirm.value = true; }
function status(item: Invitation) { return item.acceptedAt ? 'accepted' : item.revokedAt ? 'revoked' : new Date(item.expiresAt) <= new Date() ? 'expired' : 'pending'; }
</script>
<template>
  <PageHeader
    :title="workspace.data.value?.name || t('workspace.settings')"
    :description="t('workspace.membersHint')"
  />
  <p
    v-if="error"
    class="field-error"
    role="alert"
  >
    {{ error }}
  </p>
  <UiState
    v-if="workspace.isPending.value"
    kind="loading"
  /><UiState
    v-else-if="workspace.error.value"
    kind="error"
    :description="t(errorKey(workspace.error.value))"
    retry
    @retry="workspace.refetch()"
  />
  <div
    v-else
    class="stack"
  >
    <UiCard>
      <form
        v-if="manager"
        class="row"
        @submit.prevent="mutate('', 'PATCH', { name })"
      >
        <UiInput
          v-model="name"
          :label="t('workspace.name')"
          maxlength="100"
          required
        /><UiButton
          type="submit"
          :loading="busy"
        >
          {{ t('common.save') }}
        </UiButton>
      </form><p v-else>
        {{ t('workspace.access') }}: {{ t(`roles.${workspace.data.value?.role}`) }}
      </p>
    </UiCard>
    <UiCard>
      <UiTabs
        v-model="tab"
        :label="t('workspace.settings')"
        :tabs="[{ value: 'members', label: t('workspace.members') }, ...(manager ? [{ value: 'invitations', label: t('workspace.invitations') }] : [])]"
      >
        <template #members>
          <UiState
            v-if="members.isPending.value"
            kind="loading"
          /><UiState
            v-else-if="members.error.value"
            kind="error"
            :description="t(errorKey(members.error.value))"
            retry
            @retry="members.refetch()"
          /><div
            v-else
            class="stack"
          >
            <MemberRow
              v-for="member in members.data.value?.items"
              :key="member.userId"
              :member="member"
              :actor-role="workspace.data.value?.role || 'VIEWER'"
              :busy="busy"
              @change="(userId, next) => mutate(`/members/${userId}`, 'PATCH', { role: next })"
              @remove="userId => ask('members', userId)"
            />
          </div>
        
          <UiLoadMore
    
            :has-more="members.hasNextPage.value"
            :busy="members.isFetchingNextPage.value"
            @next="members.fetchNextPage()"
          />
        </template>
        <template #invitations>
          <form
            class="stack"
            style="margin-bottom: 2rem"
            @submit.prevent="mutate('/invitations', 'POST', { email, role })"
          >
            <h2>{{ t('workspace.invite') }}</h2><UiInput
              v-model="email"
              type="email"
              :label="t('workspace.email')"
              maxlength="320"
              required
            /><UiSelect
              v-model="role"
              :label="t('workspace.role')"
              :options="(workspace.data.value?.role === 'OWNER' ? ['ADMIN', 'EDITOR', 'VIEWER'] : ['EDITOR', 'VIEWER']).map(value => ({ value, label: t(`roles.${value}`) }))"
            /><UiButton
              type="submit"
              :loading="busy"
            >
              {{ t('workspace.send') }}
            </UiButton>
          </form><UiState
            v-if="invitations.isPending.value"
            kind="loading"
          /><UiState
            v-else-if="invitations.error.value"
            kind="error"
            :description="t(errorKey(invitations.error.value))"
            retry
            @retry="invitations.refetch()"
          /><UiState
            v-else-if="!invitations.data.value?.items.length"
            kind="empty"
          /><div
            v-else
            class="stack"
          >
            <div
              v-for="item in invitations.data.value.items"
              :key="item.id"
              class="row"
              style="justify-content: space-between"
            >
              <span>{{ item.email }} · {{ t(`roles.${item.role}`) }} · {{ t(`workspace.${status(item)}`) }}</span><UiButton
                v-if="status(item) === 'pending'"
                variant="secondary"
                :disabled="busy"
                @click="ask('invitations', item.id)"
              >
                {{ t('common.revoke') }}
              </UiButton>
            </div>
          </div>
        
          <UiLoadMore
    
            :has-more="invitations.hasNextPage.value"
            :busy="invitations.isFetchingNextPage.value"
            @next="invitations.fetchNextPage()"
          />
        </template>
      </UiTabs>
    </UiCard>
  </div>
  <UiConfirmDialog
    v-model="confirm"
    :title="t(target?.kind === 'members' ? 'workspace.confirmRemove' : 'workspace.confirmRevoke')"
    :description="t('workspace.dangerDescription')"
    :busy="busy"
    @confirm="target && mutate(`/${target.kind}/${target.id}`, 'DELETE')"
  />
</template>
