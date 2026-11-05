<script setup lang="ts">
import { computed, ref, watch } from 'vue';
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

interface Policy { enabled: boolean; dailyCapMicros: string; requestsPerMinute: number; maxConcurrent: number }
interface Route { id: string; provider: string; model: string; tasks: string[]; capability: string; priceVersion: string }
interface Health { provider: string; healthy: boolean; checkedAt: string }
interface Record { id: string; workspaceId: string; provider: string; model: string; status: string; errorCode: string | null; createdAt: string; usage: { costMicros: string; credits: string } | null }
const { t, locale } = useI18n();
const policy = useQuery({ queryKey: ['admin-ai-policy'], queryFn: () => request<Policy | null>('/admin/ai/policy') });
const providers = useQuery({ queryKey: ['admin-ai-providers'], queryFn: () => request<{ routes: Route[]; providers: Health[] }>('/admin/ai/providers') });
const enabled = ref<string | string[]>('false'); const cap = ref(''); const rate = ref(''); const concurrent = ref(''); const busy = ref(false); const error = ref(''); const notice = ref(''); const confirmOpen = ref(false);
watch(() => policy.data.value, value => { if (!value) return; enabled.value = String(value.enabled); cap.value = value.dailyCapMicros; rate.value = String(value.requestsPerMinute); concurrent.value = String(value.maxConcurrent); }, { immediate: true });
const valid = computed(() => /^(0|[1-9]\d{0,18})$/.test(cap.value) && /^\d+$/.test(rate.value) && Number(rate.value) >= 1 && Number(rate.value) <= 1000 && /^\d+$/.test(concurrent.value) && Number(concurrent.value) >= 1 && Number(concurrent.value) <= 20);
async function savePolicy() { if (!valid.value) return; busy.value = true; error.value = ''; notice.value = '';
  try { await request('/admin/ai/policy', { method: 'PUT', body: json({ enabled: enabled.value === 'true', dailyCapMicros: cap.value, requestsPerMinute: Number(rate.value), maxConcurrent: Number(concurrent.value) }) }); confirmOpen.value = false; notice.value = t('common.saved'); await Promise.all([policy.refetch(), queryClient.invalidateQueries({ queryKey: ['admin-overview'] })]); }
  catch (cause) { error.value = t(errorKey(cause)); } finally { busy.value = false; }
}
const provider = ref<string | string[]>(''); const status = ref<string | string[]>(''); const applied = ref('');
function filter() { const query = new URLSearchParams(); if (typeof provider.value === 'string' && provider.value) query.set('provider', provider.value); if (typeof status.value === 'string' && status.value) query.set('status', status.value); applied.value = query.toString(); }
const logs = usePagedQuery<{ items: Record[] }>(() => ['admin-ai-usage', applied.value], () => `/admin/ai/usage?${applied.value}`);
const providerOptions = computed(() => [{ value: '', label: t('admin.all') }, ...[...new Set(providers.data.value?.routes.map(route => route.provider) ?? [])].map(value => ({ value, label: value }))]);
</script>
<template>
  <div class="page stack">
    <PageHeader
      :title="t('admin.aiOperations')"
      :description="t('admin.configHint')"
    />
    <p
      v-if="error"
      class="field-error"
      role="alert"
    >
      {{ error }}
    </p><p
      v-if="notice"
      class="muted"
      role="status"
    >
      {{ notice }}
    </p>
    <section class="card stack">
      <h2>{{ t('admin.globalPolicy') }}</h2>
      <UiState
        v-if="policy.isPending.value"
        kind="loading"
      /><UiState
        v-else-if="policy.error.value"
        kind="error"
        :description="t(errorKey(policy.error.value))"
        retry
        @retry="policy.refetch()"
      />
      <template v-else>
        <p
          v-if="!policy.data.value"
          class="muted"
        >
          {{ t('admin.unknown') }}
        </p>
        <div class="grid">
          <UiSelect
            v-model="enabled"
            :label="t('admin.status')"
            :options="[{ value: 'false', label: t('admin.disabled') }, { value: 'true', label: t('admin.enabled') }]"
          /><UiInput
            v-model="cap"
            :label="t('admin.dailyCap')"
            inputmode="numeric"
          /><UiInput
            v-model="rate"
            :label="t('admin.perMinute')"
            inputmode="numeric"
          /><UiInput
            v-model="concurrent"
            :label="t('admin.concurrent')"
            inputmode="numeric"
          />
        </div>
        <UiButton
          :disabled="!valid || busy"
          @click="confirmOpen = true"
        >
          {{ t('admin.savePolicy') }}
        </UiButton>
      </template>
    </section>
    <section class="card stack">
      <h2>{{ t('admin.providerRoutes') }}</h2>
      <UiState
        v-if="providers.isPending.value"
        kind="loading"
      /><UiState
        v-else-if="providers.error.value"
        kind="error"
        :description="t(errorKey(providers.error.value))"
        retry
        @retry="providers.refetch()"
      />
      <template v-else>
        <p
          v-if="!providers.data.value?.routes.length"
          class="muted"
        >
          {{ t('admin.unknown') }}
        </p><div
          v-else
          class="table-wrap"
        >
          <table>
            <thead><tr><th>Provider</th><th>Model</th><th>Tasks</th><th>Price version</th></tr></thead><tbody>
              <tr
                v-for="route in providers.data.value.routes"
                :key="route.id"
              >
                <td>{{ route.provider }}</td><td>{{ route.model }}</td><td>{{ route.tasks.join(', ') }}</td><td>{{ route.priceVersion }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <h3>{{ t('admin.providerHealth') }}</h3><p
          v-for="item in providers.data.value?.providers ?? []"
          :key="item.provider"
        >
          {{ item.provider }} · {{ t(item.healthy ? 'admin.enabled' : 'admin.disabled') }} · {{ new Date(item.checkedAt).toLocaleString(locale) }}
        </p>
      </template>
    </section>
    <section class="card stack">
      <h2>{{ t('admin.requestUsage') }}</h2>
      <div class="row">
        <UiSelect
          v-model="provider"
          label="Provider"
          :options="providerOptions"
        /><UiSelect
          v-model="status"
          :label="t('admin.status')"
          :options="[{ value: '', label: t('admin.all') }, ...['QUEUED','RUNNING','SUCCEEDED','FAILED','UNKNOWN','CANCELLED'].map(value => ({ value, label: value }))]"
        /><UiButton
          variant="secondary"
          @click="filter"
        >
          {{ t('admin.filter') }}
        </UiButton>
      </div>
      <UiState
        v-if="logs.isPending.value"
        kind="loading"
      /><UiState
        v-else-if="logs.error.value"
        kind="error"
        :description="t(errorKey(logs.error.value))"
        retry
        @retry="logs.refetch()"
      /><UiState
        v-else-if="!logs.data.value?.items.length"
        kind="empty"
        :description="t('admin.emptyChart')"
      />
      <div
        v-else
        class="table-wrap"
      >
        <table>
          <thead><tr><th>{{ t('admin.createdAt') }}</th><th>Provider / Model</th><th>{{ t('admin.status') }}</th><th>{{ t('admin.creditUsage') }}</th><th>{{ t('admin.providerCost') }} (µUSD)</th></tr></thead><tbody>
            <tr
              v-for="item in logs.data.value.items"
              :key="item.id"
            >
              <td>{{ new Date(item.createdAt).toLocaleString(locale) }}</td><td>{{ item.provider }} / {{ item.model }}</td><td>{{ item.status }}<span v-if="item.errorCode"> · {{ item.errorCode }}</span></td><td>{{ item.usage ? BigInt(item.usage.credits).toLocaleString(locale) : '—' }}</td><td>{{ item.usage ? BigInt(item.usage.costMicros).toLocaleString(locale) : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <UiLoadMore
        :has-more="logs.hasNextPage.value"
        :busy="logs.isFetchingNextPage.value"
        @next="logs.fetchNextPage()"
      />
    </section>
    <UiConfirmDialog
      v-model="confirmOpen"
      :title="t('admin.globalPolicy')"
      :description="t('admin.policyConfirm')"
      :busy="busy"
      @confirm="savePolicy"
    />
  </div>
</template>
