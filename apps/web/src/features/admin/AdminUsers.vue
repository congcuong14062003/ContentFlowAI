<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useQuery } from '@tanstack/vue-query';
import { request, json, errorKey } from '../../lib/api';
import { queryClient } from '../../app/query';
import { usePagedQuery } from '../../lib/paged-query';
import PageHeader from '../../components/PageHeader.vue';
import UiButton from '../../components/ui/UiButton.vue';
import UiInput from '../../components/ui/UiInput.vue';
import UiSelect from '../../components/ui/UiSelect.vue';
import UiState from '../../components/ui/UiState.vue';
import UiLoadMore from '../../components/ui/UiLoadMore.vue';
import UiConfirmDialog from '../../components/ui/UiConfirmDialog.vue';
import { useSession } from '../../app/session';

interface User { id: string; email: string; displayName: string; systemRole: string; disabledAt: string | null; emailVerifiedAt: string | null; createdAt: string; _count: { memberships: number } }
interface Detail extends User { memberships: { role: string; workspaceId: string; workspace: { name: string } }[]; subscriptions: { workspaceId: string; status: string; plan: { name: string } }[]; workspaceUsage: { requests: number; credits: string; costMicros: string }; audit: { id: string; action: string; createdAt: string; workspaceId: string | null }[] }
const route = useRoute(); const router = useRouter(); const { t, locale } = useI18n(); const session = useSession();
const search = ref(String(route.query.search ?? '')); const status = ref<string | string[]>('all'); const filter = ref('');
const users = usePagedQuery<{ items: User[] }>(() => ['admin-users', filter.value], () => `/admin/users?${filter.value}`);
const selectedId = ref(''); const detail = useQuery({ queryKey: computed(() => ['admin-user', selectedId.value]), queryFn: () => request<Detail>(`/admin/users/${selectedId.value}`), enabled: computed(() => !!selectedId.value) });
const busy = ref(false); const error = ref(''); const reason = ref(''); const confirmOpen = ref(false);
watch(() => route.query.search, value => { search.value = String(value ?? ''); apply(); });
function apply() { const params = new URLSearchParams(); if (search.value.trim()) params.set('search', search.value.trim()); if (status.value !== 'all' && typeof status.value === 'string') params.set('status', status.value); filter.value = params.toString(); }
apply();
function select(id: string) { selectedId.value = id; reason.value = ''; error.value = ''; }
async function changeStatus() {
  if (!detail.data.value || reason.value.trim().length < 20) return; busy.value = true; error.value = '';
  try { await request(`/admin/users/${selectedId.value}/status`, { method: 'PATCH', body: json({ action: detail.data.value.disabledAt ? 'restore' : 'suspend', reason: reason.value.trim() }) }); confirmOpen.value = false; reason.value = ''; await Promise.all([queryClient.invalidateQueries({ queryKey: ['admin-users'] }), detail.refetch(), queryClient.invalidateQueries({ queryKey: ['admin-overview'] })]); }
  catch (cause) { error.value = t(errorKey(cause)); } finally { busy.value = false; }
}
function globalSearch() { void router.replace({ path: '/admin/users', query: search.value.trim() ? { search: search.value.trim() } : {} }); apply(); }
</script>
<template>
  <div class="page stack">
    <PageHeader :title="t('admin.userList')" />
    <form
      class="card row"
      @submit.prevent="globalSearch"
    >
      <UiInput
        v-model="search"
        :label="t('admin.search')"
        maxlength="100"
      />
      <UiSelect
        v-model="status"
        :label="t('admin.status')"
        :options="[{ value: 'all', label: t('admin.all') }, { value: 'active', label: t('admin.active') }, { value: 'suspended', label: t('admin.suspended') }]"
      />
      <UiButton type="submit">
        {{ t('admin.filter') }}
      </UiButton>
    </form>
    <p
      v-if="error"
      class="field-error"
      role="alert"
    >
      {{ error }}
    </p>
    <div class="admin-users-layout">
      <section
        class="card stack"
        aria-label="Users"
      >
        <UiState
          v-if="users.isPending.value"
          kind="loading"
        />
        <UiState
          v-else-if="users.error.value"
          kind="error"
          :description="t(errorKey(users.error.value))"
          retry
          @retry="users.refetch()"
        />
        <UiState
          v-else-if="!users.data.value?.items.length"
          kind="empty"
          :description="t('admin.noUsers')"
        />
        <div
          v-else
          class="table-wrap"
        >
          <table>
            <thead><tr><th>{{ t('admin.email') }}</th><th>{{ t('admin.status') }}</th><th>{{ t('admin.memberships') }}</th></tr></thead><tbody>
              <tr
                v-for="user in users.data.value.items"
                :key="user.id"
              >
                <td>
                  <button
                    class="admin-text-button"
                    @click="select(user.id)"
                  >
                    {{ user.displayName }}<br><span class="muted">{{ user.email }}</span>
                  </button>
                </td><td>{{ t(user.disabledAt ? 'admin.suspended' : 'admin.active') }}</td><td>{{ user._count.memberships }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <UiLoadMore
          :has-more="users.hasNextPage.value"
          :busy="users.isFetchingNextPage.value"
          @next="users.fetchNextPage()"
        />
      </section>
      <section
        class="card stack"
        aria-labelledby="admin-user-details"
      >
        <h2 id="admin-user-details">
          {{ t('admin.details') }}
        </h2>
        <UiState
          v-if="detail.isPending.value && selectedId"
          kind="loading"
        />
        <UiState
          v-else-if="detail.error.value"
          kind="error"
          :description="t(errorKey(detail.error.value))"
          retry
          @retry="detail.refetch()"
        />
        <template v-else-if="detail.data.value">
          <div>
            <strong>{{ detail.data.value.displayName }}</strong><p class="muted">
              {{ detail.data.value.email }}
            </p><p>{{ t(detail.data.value.emailVerifiedAt ? 'admin.verified' : 'admin.unverified') }} · {{ detail.data.value.systemRole }}</p><p>{{ t('admin.createdAt') }}: {{ new Date(detail.data.value.createdAt).toLocaleString(locale) }}</p>
          </div>
          <div>
            <h3>{{ t('admin.memberships') }}</h3><p
              v-for="membership in detail.data.value.memberships"
              :key="membership.workspaceId"
            >
              {{ membership.workspace.name }} · {{ membership.role }}
            </p>
          </div>
          <div><h3>{{ t('admin.workspaceUsage') }}</h3><p>{{ detail.data.value.workspaceUsage.requests }} {{ t('admin.aiRequests') }} · {{ BigInt(detail.data.value.workspaceUsage.credits).toLocaleString(locale) }} {{ t('admin.creditUsage') }}</p></div>
          <div>
            <h3>{{ t('admin.subscriptions') }}</h3><p
              v-for="subscription in detail.data.value.subscriptions"
              :key="subscription.workspaceId"
            >
              {{ subscription.plan.name }} · {{ subscription.status }}
            </p>
          </div>
          <div>
            <h3>{{ t('admin.audit') }}</h3><p
              v-if="!detail.data.value.audit.length"
              class="muted"
            >
              {{ t('admin.noAudit') }}
            </p><p
              v-for="event in detail.data.value.audit"
              :key="event.id"
            >
              {{ new Date(event.createdAt).toLocaleString(locale) }} · {{ event.action }}
            </p>
          </div>
          <div
            v-if="detail.data.value.systemRole !== 'SUPER_ADMIN' && detail.data.value.id !== session.user?.id"
            class="stack"
          >
            <UiInput
              v-model="reason"
              :label="t('admin.reason')"
              maxlength="500"
              :hint="t('admin.reasonHint')"
            />
            <UiButton
              :variant="detail.data.value.disabledAt ? 'secondary' : 'danger'"
              :disabled="reason.trim().length < 20 || busy"
              @click="confirmOpen = true"
            >
              {{ t(detail.data.value.disabledAt ? 'admin.restore' : 'admin.suspend') }}
            </UiButton>
          </div>
        </template>
        <p
          v-else
          class="muted"
        >
          {{ t('admin.details') }}
        </p>
      </section>
    </div>
    <UiConfirmDialog
      v-model="confirmOpen"
      :title="t('admin.confirmStatus')"
      :description="reason"
      :busy="busy"
      @confirm="changeStatus"
    />
  </div>
</template>
