<script setup lang="ts">
import { computed, ref } from 'vue'; import { useRoute } from 'vue-router'; import { useI18n } from 'vue-i18n'; import { useQuery } from '@tanstack/vue-query';
import type { CreditBalance } from '../../../../../packages/shared/src/credits';
import { request, errorKey } from '../../lib/api'; import { queryClient } from '../../app/query';
import PageHeader from '../../components/PageHeader.vue'; import UiButton from '../../components/ui/UiButton.vue'; import UiState from '../../components/ui/UiState.vue'; import UiTabs from '../../components/ui/UiTabs.vue'; import CreditHistory from './CreditHistory.vue';
const route = useRoute(); const { t, locale } = useI18n(); const workspaceId = computed(() => String(route.params.workspaceId)); const active = ref('ledger');
const balance = useQuery({ queryKey: computed(() => ['credits', workspaceId.value, 'balance']), queryFn: () => request<CreditBalance>(`/workspaces/${workspaceId.value}/credits/balance`) });
const tabs = computed(() => ['ledger','grants','usage'].map(value => ({ value, label: t(`credits.${value}`) })));
const busy = ref(false); async function refresh() { busy.value = true; try { await queryClient.invalidateQueries({ queryKey: ['credits', workspaceId.value] }); } finally { busy.value = false; } }
function integer(value: string) { return BigInt(value).toLocaleString(locale.value); }
</script>
<template>
  <PageHeader
    :title="t('credits.title')"
    :description="t('credits.description')"
  >
    <UiButton
      variant="secondary"
      :loading="busy"
      @click="refresh"
    >
      {{ t('credits.refresh') }}
    </UiButton>
  </PageHeader>
  <UiState
    v-if="balance.isPending.value"
    kind="loading"
  />
  <UiState
    v-else-if="balance.error.value"
    kind="error"
    :description="t(errorKey(balance.error.value))"
    retry
    @retry="balance.refetch()"
  />
  <div
    v-else-if="balance.data.value"
    class="stack"
  >
    <div class="grid">
      <article
        v-for="key in (['available','reserved','balance'] as const)"
        :key="key"
        class="card"
      >
        <p class="muted">
          {{ t(`credits.${key}`) }}
        </p><p style="font-size:2rem;overflow-wrap:anywhere">
          {{ integer(balance.data.value[key]) }}
        </p><span class="muted">{{ t('credits.atoms') }}</span>
      </article>
    </div>
    <p
      v-if="balance.data.value.nextExpiry"
      class="muted"
    >
      {{ t('credits.nextExpiry') }}: {{ new Date(balance.data.value.nextExpiry).toLocaleString(locale) }}
    </p>
    <p class="muted">
      {{ t('credits.unknownHint') }}
    </p>
    <div class="card">
      <UiTabs
        v-model="active"
        :tabs="tabs"
        :label="t('credits.title')"
      >
        <template
          v-for="kind in (['ledger','grants','usage'] as const)"
          :key="kind"
          #[kind]
        >
          <CreditHistory
            :workspace-id="workspaceId"
            :kind="kind"
          />
        </template>
      </UiTabs>
    </div>
  </div>
</template>
