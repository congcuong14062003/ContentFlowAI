<script setup lang="ts">
import { computed } from 'vue'; import { useI18n } from 'vue-i18n';
import { usePagedQuery } from '../../lib/paged-query'; import { errorKey } from '../../lib/api';
import type { AiUsageRecord, CreditGrantRecord, CreditLedgerRecord } from '../../../../../packages/shared/src/credits';
import UiDataTable from '../../components/ui/UiDataTable.vue'; import UiState from '../../components/ui/UiState.vue'; import UiLoadMore from '../../components/ui/UiLoadMore.vue';
const props = defineProps<{ workspaceId: string; kind: 'ledger' | 'grants' | 'usage' }>(); const { t, locale } = useI18n();
const query = usePagedQuery<{ items: (AiUsageRecord | CreditGrantRecord | CreditLedgerRecord)[] }>(() => ['credits', props.workspaceId, props.kind], () => `/workspaces/${props.workspaceId}/${props.kind === 'usage' ? 'ai/usage' : `credits/${props.kind}`}`);
function integer(value: string) { return BigInt(value).toLocaleString(locale.value); }
function date(value: string | null) { return value ? new Date(value).toLocaleString(locale.value) : '—'; }
const columns = computed(() => props.kind === 'ledger' ? ['createdAt','kind','amount','reservedDelta','reference'] : props.kind === 'grants' ? ['source','amount','remaining','reserved','expiresAt','reference'] : ['createdAt','model','status','held','charged','cost']);
const columnLabels = computed(() => columns.value.map(key => ({ key, label: t(`credits.${key}`) })));
const rows = computed(() => query.data.value?.items.map(item => {
  if ('reservedDelta' in item) return { ...item, kind: t(`credits.kind${item.kind}`), amount: integer(item.amount), reservedDelta: integer(item.reservedDelta), createdAt: date(item.createdAt) };
  if ('remaining' in item) return { ...item, source: t(`credits.source${item.source}`), amount: integer(item.amount), remaining: integer(item.remaining), reserved: integer(item.reserved), expiresAt: date(item.expiresAt) };
  return { id: item.id, createdAt: date(item.createdAt), model: `${item.provider} / ${item.model}`, status: t(`credits.status${item.status}`), held: item.reservation?.status === 'HELD' ? integer(item.reservation.amount) : '0', charged: item.usage ? integer(item.usage.credits) : '—', cost: item.usage ? `${integer(item.usage.costMicros)} µUSD` : '—' };
}) ?? []);
</script>
<template>
  <UiState
    v-if="query.isPending.value"
    kind="loading"
  />
  <UiState
    v-else-if="query.error.value"
    kind="error"
    :description="t(errorKey(query.error.value))"
    retry
    @retry="query.refetch()"
  />
  <UiState
    v-else-if="!rows.length"
    kind="empty"
    :description="t('credits.empty')"
  />
  <UiDataTable
    v-else
    :columns="columnLabels"
    :rows="rows"
    :caption="t(`credits.${kind}`)"
  />
  <UiLoadMore
    :has-more="query.hasNextPage.value"
    :busy="query.isFetchingNextPage.value"
    @next="query.fetchNextPage()"
  />
</template>
