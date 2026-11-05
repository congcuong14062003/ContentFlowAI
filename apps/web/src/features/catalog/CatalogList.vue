<script setup lang="ts">
import { computed, ref, watch } from 'vue'; import { useI18n } from 'vue-i18n'; import { useQuery } from '@tanstack/vue-query';
import { useCatalogWorkspace, type BrandRecord, type ProductRecord } from './catalog';
import { usePagedQuery } from '../../lib/paged-query'; import { request, errorKey } from '../../lib/api';
import PageHeader from '../../components/PageHeader.vue'; import UiInput from '../../components/ui/UiInput.vue'; import UiSelect from '../../components/ui/UiSelect.vue'; import UiButton from '../../components/ui/UiButton.vue'; import UiState from '../../components/ui/UiState.vue'; import UiLoadMore from '../../components/ui/UiLoadMore.vue';
const props = defineProps<{ kind: 'brands' | 'products' }>(); const { t } = useI18n(); const { base, workspaceId, canWrite } = useCatalogWorkspace();
const search = ref(''); const status = ref<string | string[]>(''); const category = ref(''); const tag = ref(''); const brand = ref<string | string[]>(''); const applied = ref('');
watch(() => props.kind, () => { search.value = ''; status.value = ''; category.value = ''; tag.value = ''; brand.value = ''; applied.value = ''; });
function filter() { const params = new URLSearchParams(); for (const [key, value] of Object.entries({ search: search.value.trim(), status: status.value, category: category.value.trim(), tag: tag.value.trim(), brandId: brand.value })) if (typeof value === 'string' && value) params.set(key, value); applied.value = params.toString(); }
const query = usePagedQuery<{ items: (BrandRecord | ProductRecord)[] }>(() => ['catalog', workspaceId.value, props.kind, applied.value], () => `${base.value}/${props.kind}?${applied.value}`);
const brands = usePagedQuery<{ items: BrandRecord[] }>(() => ['catalog-brand-options', workspaceId.value], () => `${base.value}/brands`, () => props.kind === 'products');
const allowance = useQuery({ queryKey: computed(() => ['catalog-allowance', workspaceId.value]), queryFn: () => request<{ brandLimit: number; brandsUsed: number }>(`${base.value}/catalog-entitlement`) });
const options = computed(() => [{ value: '', label: t('catalog.allBrands') }, ...(brands.data.value?.items ?? []).map(b => ({ value: b.id, label: b.name }))]);
</script>
<template>
  <PageHeader
    :title="t(`catalog.${kind}`)"
    :description="t('catalog.intro')"
  >
    <RouterLink
      v-if="canWrite && (kind === 'products' || allowance.data.value && allowance.data.value.brandsUsed < allowance.data.value.brandLimit)"
      class="button"
      :to="`/w/${workspaceId}/${kind}/new`"
    >＋ {{ t('catalog.create') }}</RouterLink>
  </PageHeader>
  <p
    v-if="kind === 'brands' && allowance.data.value"
    class="muted"
  >
    {{ t('catalog.allowance', { used: allowance.data.value.brandsUsed, limit: allowance.data.value.brandLimit }) }}
  </p>
  <form
    class="card stack"
    @submit.prevent="filter"
  >
    <div class="grid">
      <UiInput
        v-model="search"
        :label="t('catalog.search')"
        maxlength="150"
      />
      <template v-if="kind === 'products'">
        <UiSelect
          v-model="status"
          :label="t('catalog.status')"
          :options="[{ value:'',label:t('catalog.all') },{ value:'ACTIVE',label:t('catalog.active') },{ value:'ARCHIVED',label:t('catalog.archived') }]"
        />
        <UiSelect
          v-model="brand"
          :label="t('catalog.brands')"
          :options="options"
        />
        <UiInput
          v-model="category"
          :label="t('catalog.category')"
          maxlength="100"
        /><UiInput
          v-model="tag"
          :label="t('catalog.tag')"
          maxlength="100"
        />
      </template>
    </div><UiLoadMore
      v-if="kind === 'products'"
      :has-more="brands.hasNextPage.value"
      :busy="brands.isFetchingNextPage.value"
      @next="brands.fetchNextPage()"
    />
    <UiButton
      type="submit"
      variant="secondary"
    >
      {{ t('catalog.filter') }}
    </UiButton>
  </form>
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
    v-else-if="!query.data.value?.items.length"
    kind="empty"
    :description="t('catalog.empty')"
  />
  <div
    v-else
    class="grid"
    style="margin-top:1.5rem"
  >
    <article
      v-for="item in query.data.value.items"
      :key="item.id"
      class="card stack"
    >
      <p class="eyebrow">
        {{ t(`catalog.${kind}`) }} <span v-if="'isDefault' in item && item.isDefault"> · {{ t('catalog.default') }}</span><span v-if="'status' in item"> · {{ t(item.status === 'ACTIVE' ? 'catalog.active' : 'catalog.archived') }}</span>
      </p>
      <h2 style="overflow-wrap:anywhere">
        {{ item.name }}
      </h2>
      <p class="muted catalog-excerpt">
        {{ 'description' in item ? item.description : item.guidelines.businessDescription }}
      </p>
      <RouterLink
        class="button secondary"
        :to="`/w/${workspaceId}/${kind}/${item.id}`"
      >{{ t('catalog.open') }} ↗</RouterLink>
    </article>
  </div>
  <UiLoadMore
    :has-more="query.hasNextPage.value"
    :busy="query.isFetchingNextPage.value"
    @next="query.fetchNextPage()"
  />
</template>
