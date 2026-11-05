<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { usePagedQuery } from '../../lib/paged-query';
import PageHeader from '../../components/PageHeader.vue';
import UiState from '../../components/ui/UiState.vue';
import UiLoadMore from '../../components/ui/UiLoadMore.vue';
const route = useRoute(); const { t } = useI18n(); const workspaceId = computed(() => String(route.params.workspaceId));
interface Item { id: string; title: string; status: string; version: number; updatedAt: string }
const contents = usePagedQuery<{ items: Item[] }>(() => ['content-library', workspaceId.value], () => `/workspaces/${workspaceId.value}/content`);
</script>
<template>
  <div class="page stack">
    <PageHeader
      :title="t('content.library')"
      :description="t('content.libraryHint')"
    />
    <UiState
      v-if="contents.isPending.value"
      kind="loading"
    />
    <UiState
      v-else-if="contents.error.value"
      kind="error"
      :retry="true"
      @retry="contents.refetch()"
    />
    <UiState
      v-else-if="!contents.data.value?.items.length"
      kind="empty"
    />
    <div
      v-if="contents.data.value?.items.length"
      class="stack"
    >
      <RouterLink
        v-for="item in contents.data.value.items"
        :key="item.id"
        class="card"
        :to="`/w/${workspaceId}/content/${item.id}`"
      >
        <h2>{{ item.title }}</h2><p class="muted">{{ item.status }} · v{{ item.version }} · {{ new Date(item.updatedAt).toLocaleString() }}</p>
      </RouterLink>
      <UiLoadMore
        :has-more="!!contents.hasNextPage.value"
        :busy="contents.isFetchingNextPage.value"
        @next="contents.fetchNextPage()"
      />
    </div>
  </div>
</template>
