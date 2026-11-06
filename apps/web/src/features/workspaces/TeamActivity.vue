<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { usePagedQuery } from '../../lib/paged-query';
import { useI18n } from 'vue-i18n';
import { errorKey } from '../../lib/api';
import UiLoadMore from '../../components/ui/UiLoadMore.vue';
const route=useRoute();const {t}=useI18n();const workspaceId=computed(()=>String(route.params.workspaceId));const action=ref('');
const activity=usePagedQuery<{items:{id:string;actorId:string|null;action:string;entityType:string;entityId:string|null;createdAt:string}[];nextCursor:string|null}>(()=>['team-activity',workspaceId.value,action.value],()=>`/workspaces/${workspaceId.value}/activity${action.value?`?action=${encodeURIComponent(action.value)}`:''}`);
</script>
<template>
  <div class="page stack">
    <header>
      <h1>Hoạt động nhóm</h1><p class="muted">
        Nhật ký thao tác được ghi ở máy chủ theo workspace.
      </p>
    </header><label>Lọc loại hoạt động <input
      v-model="action"
      class="control"
      placeholder="content., invitation., membership."
    ></label><p
      v-if="activity.isPending.value"
      class="muted"
    >
      Đang tải…
    </p><p
      v-if="activity.error.value"
      role="alert"
    >
      {{ t(errorKey(activity.error.value)) }}
    </p><p
      v-if="activity.data.value&&!activity.data.value.items.length"
      class="muted"
    >
      Chưa có hoạt động
    </p><div
      v-for="item in activity.data.value?.items??[]"
      :key="item.id"
      class="card"
    >
      <strong>{{ item.action }}</strong><p class="muted">
        {{ new Date(item.createdAt).toLocaleString() }} · {{ item.actorId??'system' }} · {{ item.entityType }} · {{ item.entityId??'—' }}
      </p>
    </div><UiLoadMore
      :has-more="activity.hasNextPage.value"
      :busy="activity.isFetchingNextPage.value"
      @next="activity.fetchNextPage()"
    />
  </div>
</template>
