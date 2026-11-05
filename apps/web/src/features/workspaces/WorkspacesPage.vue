<script setup lang="ts">
import { ref } from 'vue'; import { useI18n } from 'vue-i18n'; import { useRouter } from 'vue-router';
import { usePagedQuery } from '../../lib/paged-query'; import UiLoadMore from '../../components/ui/UiLoadMore.vue';
import { errorKey, json, request } from '../../lib/api'; import { queryClient } from '../../app/query';
import PageHeader from '../../components/PageHeader.vue'; import UiButton from '../../components/ui/UiButton.vue'; import UiInput from '../../components/ui/UiInput.vue'; import UiDialog from '../../components/ui/UiDialog.vue'; import UiCard from '../../components/ui/UiCard.vue'; import UiState from '../../components/ui/UiState.vue';
const { t } = useI18n(); const router = useRouter(); const open = ref(false); const name = ref(''); const busy = ref(false); const error = ref('');
const query = usePagedQuery<{ items: { role: string; workspace: { id: string; name: string } }[] }>(['workspaces'], '/workspaces');
async function create() { busy.value = true; error.value = ''; try { const workspace = await request<{ id: string }>('/workspaces', { method: 'POST', body: json({ name: name.value }) }); await queryClient.invalidateQueries({ queryKey: ['workspaces'] }); open.value = false; await router.push(`/w/${workspace.id}/settings`); } catch (failure) { error.value = t(errorKey(failure)); } finally { busy.value = false; } }
</script>
<template>
  <PageHeader
    :title="t('workspace.title')"
    :description="t('workspace.intro')"
  >
    <UiButton @click="open = true">
      ＋ {{ t('workspace.create') }}
    </UiButton>
  </PageHeader><UiState
    v-if="query.isPending.value"
    kind="loading"
  /><UiState
    v-else-if="query.error.value"
    kind="error"
    :description="t(errorKey(query.error.value))"
    retry
    @retry="query.refetch()"
  /><UiState
    v-else-if="!query.data.value?.items.length"
    kind="empty"
    :title="t('workspace.empty')"
    :description="t('workspace.emptyDescription')"
  /><div
    v-else
    class="grid"
  >
    <UiCard
      v-for="item in query.data.value.items"
      :key="item.workspace.id"
    >
      <p class="eyebrow">
        {{ t(`roles.${item.role}`) }}
      </p><h2>{{ item.workspace.name }}</h2><RouterLink
        class="button secondary"
        :to="`/w/${item.workspace.id}/settings`"
      >{{ t('workspace.open') }} ↗</RouterLink>
    </UiCard>
  </div>
  <UiLoadMore
    :has-more="query.hasNextPage.value"
    :busy="query.isFetchingNextPage.value"
    @next="query.fetchNextPage()"
  />
  <UiDialog
    v-model="open"
    :title="t('workspace.create')"
  >
    <form
      class="stack"
      @submit.prevent="create"
    >
      <UiInput
        v-model="name"
        :label="t('workspace.name')"
        maxlength="100"
        required
      /><p
        v-if="error"
        role="alert"
        class="field-error"
      >
        {{ error }}
      </p><UiButton
        type="submit"
        :loading="busy"
      >
        {{ t('workspace.create') }}
      </UiButton>
    </form>
  </UiDialog>
</template>
