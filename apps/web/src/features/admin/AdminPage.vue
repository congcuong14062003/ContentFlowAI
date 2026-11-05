<script setup lang="ts">import { useI18n } from 'vue-i18n'; import { useQuery } from '@tanstack/vue-query'; import { request, errorKey } from '../../lib/api'; import UiCard from '../../components/ui/UiCard.vue'; import UiState from '../../components/ui/UiState.vue'; import PageHeader from '../../components/PageHeader.vue'; const { t } = useI18n(); const query = useQuery({ queryKey: ['admin-access'], queryFn: () => request('/admin/access') });</script>
<template>
  <PageHeader :title="t('account.admin')" /><UiState
    v-if="query.isPending.value"
    kind="loading"
  /><UiState
    v-else-if="query.error.value"
    kind="error"
    :description="t(errorKey(query.error.value))"
  /><UiCard v-else>
    <p>{{ t('account.adminDescription') }}</p>
  </UiCard>
</template>
