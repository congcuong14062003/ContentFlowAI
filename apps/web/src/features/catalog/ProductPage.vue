<script setup lang="ts">
import { computed, ref, watch } from 'vue'; import { useI18n } from 'vue-i18n'; import { useRouter } from 'vue-router'; import { useQuery } from '@tanstack/vue-query';
import { useCatalogWorkspace, type ProductRecord, type BrandRecord, lines } from './catalog';
import { usePagedQuery } from '../../lib/paged-query'; import { request, json, errorKey } from '../../lib/api'; import { queryClient } from '../../app/query';
import AssetManager from './AssetManager.vue'; import PageHeader from '../../components/PageHeader.vue'; import UiInput from '../../components/ui/UiInput.vue'; import UiTextarea from '../../components/ui/UiTextarea.vue'; import UiButton from '../../components/ui/UiButton.vue'; import UiSelect from '../../components/ui/UiSelect.vue'; import UiMultiSelect from '../../components/ui/UiMultiSelect.vue'; import UiState from '../../components/ui/UiState.vue'; import UiLoadMore from '../../components/ui/UiLoadMore.vue'; import UiConfirmDialog from '../../components/ui/UiConfirmDialog.vue';
const { t } = useI18n(); const router = useRouter(); const { route, workspaceId, base, workspace, canWrite } = useCatalogWorkspace();
const id = computed(() => String(route.params.id ?? '')); const creating = computed(() => !id.value); const editing = ref(false); const busy = ref(false); const error = ref(''); const confirm = ref(false);
const fields = ['features','benefits','audiences','categories','tags'] as const;
const name = ref(''); const description = ref(''); const priceReference = ref(''); const status = ref<string | string[]>('ACTIVE'); const brandIds = ref<string[]>([]);
const lists = ref({ features:'', benefits:'', audiences:'', categories:'', tags:'' });
const query = useQuery({ queryKey: computed(() => ['catalog-product', workspaceId.value, id.value]), queryFn: () => request<ProductRecord>(`${base.value}/products/${id.value}`), enabled: computed(() => !!id.value) });
const brands = usePagedQuery<{ items: BrandRecord[] }>(() => ['catalog-brand-options', workspaceId.value], () => `${base.value}/brands`);
const brandOptions = computed(() => (brands.data.value?.items ?? []).map(b => ({ value: b.id, label: b.name })));
function reset() { const value = query.data.value; name.value = value?.name ?? ''; description.value = value?.description ?? ''; priceReference.value = value?.priceReference ?? ''; status.value = value?.status ?? 'ACTIVE'; brandIds.value = value?.brands.map(b => b.brandId) ?? []; for (const key of fields) lists.value[key] = value?.[key].join('\n') ?? ''; error.value = ''; }
watch(() => query.data.value, reset); watch(id, () => { editing.value = false; reset(); });
async function save() {
  busy.value = true; error.value = '';
  try { const arrays = Object.fromEntries(fields.map(key => [key, lines(lists.value[key])])); const result = await request<ProductRecord>(`${base.value}/products${id.value ? `/${id.value}` : ''}`, { method: creating.value ? 'POST' : 'PATCH', body: json({ name: name.value, description: description.value, priceReference: priceReference.value, status: status.value, brandIds: brandIds.value, ...arrays }) });
    await queryClient.invalidateQueries({ queryKey: ['catalog'] }); editing.value = false; if (creating.value) await router.replace(`/w/${workspaceId.value}/products/${result.id}`); else await query.refetch();
  } catch (failure) { error.value = t(errorKey(failure)); } finally { busy.value = false; }
}
async function remove() { busy.value = true; error.value = ''; try { await request(`${base.value}/products/${id.value}`, { method: 'DELETE' }); await queryClient.invalidateQueries({ queryKey: ['catalog'] }); await router.push(`/w/${workspaceId.value}/products`); } catch (failure) { error.value = t(errorKey(failure)); } finally { busy.value = false; } }
</script>
<template>
  <PageHeader
    :title="creating ? t('catalog.createProduct') : query.data.value?.name || t('catalog.products')"
    :description="t('catalog.productIntro')"
  >
    <RouterLink
      class="button secondary"
      :to="`/w/${workspaceId}/products`"
    >{{ t('common.back') }}</RouterLink><UiButton
      v-if="!creating && !editing && canWrite"
      @click="reset(); editing = true"
    >
      {{ t('catalog.edit') }}
    </UiButton>
  </PageHeader>
  <p
    v-if="error"
    class="field-error"
    role="alert"
  >
    {{ error }}
  </p>
  <UiState
    v-if="workspace.isPending.value || (!creating && query.isPending.value)"
    kind="loading"
  /><UiState
    v-else-if="query.error.value || workspace.error.value"
    kind="error"
    :description="t(errorKey(query.error.value || workspace.error.value))"
    retry
    @retry="workspace.refetch(); query.refetch()"
  />
  <UiState
    v-else-if="creating && !canWrite"
    kind="error"
    :description="t('errors.HTTP_403')"
  />
  <form
    v-else-if="(creating || editing) && canWrite"
    class="card stack"
    @submit.prevent="save"
  >
    <UiInput
      v-model="name"
      :label="t('catalog.name')"
      maxlength="150"
      required
    /><UiTextarea
      v-model="description"
      :label="t('catalog.description')"
      maxlength="10000"
    />
    <UiInput
      v-model="priceReference"
      :label="t('catalog.priceReference')"
      maxlength="200"
    /><UiSelect
      v-model="status"
      :label="t('catalog.status')"
      :options="[{value:'ACTIVE',label:t('catalog.active')},{value:'ARCHIVED',label:t('catalog.archived')}]"
    />
    <UiTextarea
      v-for="key in fields"
      :key="key"
      v-model="lists[key]"
      :label="t(`catalog.${key}`)"
      :hint="t('catalog.lineHint')"
      maxlength="25000"
    />
    <UiState
      v-if="brands.error.value"
      kind="error"
      :description="t(errorKey(brands.error.value))"
      retry
      @retry="brands.refetch()"
    />
    <UiMultiSelect
      v-model="brandIds"
      :label="t('catalog.brands')"
      :options="brandOptions"
      :disabled="brands.isPending.value"
    /><UiLoadMore
      :has-more="brands.hasNextPage.value"
      :busy="brands.isFetchingNextPage.value"
      @next="brands.fetchNextPage()"
    />
    <p class="muted">
      {{ t('catalog.assetsAfterSave') }}
    </p><div class="row">
      <UiButton
        type="submit"
        :loading="busy"
      >
        {{ t('common.save') }}
      </UiButton><UiButton
        v-if="editing"
        variant="secondary"
        :disabled="busy"
        @click="editing = false; reset()"
      >
        {{ t('common.cancel') }}
      </UiButton>
    </div>
  </form>
  <div
    v-else-if="query.data.value"
    class="stack"
  >
    <article class="card stack">
      <p class="eyebrow">
        {{ t(query.data.value.status === 'ACTIVE' ? 'catalog.active' : 'catalog.archived') }}
      </p><p style="white-space:pre-wrap">
        {{ query.data.value.description }}
      </p><dl class="catalog-definition">
        <dt>{{ t('catalog.priceReference') }}</dt><dd>{{ query.data.value.priceReference || '—' }}</dd><template
          v-for="key in fields"
          :key="key"
        >
          <dt>{{ t(`catalog.${key}`) }}</dt><dd>{{ query.data.value[key].join(', ') || '—' }}</dd>
        </template><dt>{{ t('catalog.brands') }}</dt><dd>
          <RouterLink
            v-for="b in query.data.value.brands"
            :key="b.brandId"
            :to="`/w/${workspaceId}/brands/${b.brandId}`"
            style="margin-inline-end:1rem"
          >{{ brandOptions.find(o => o.value === b.brandId)?.label ?? t('catalog.open') }}</RouterLink>
        </dd>
      </dl><UiButton
        v-if="canWrite"
        variant="danger"
        :disabled="busy"
        @click="confirm = true"
      >
        {{ t('catalog.remove') }}
      </UiButton>
    </article>
    <AssetManager
      :id="id"
      :base="base"
      kind="products"
      :assets="query.data.value.assets ?? []"
      :editable="canWrite"
      @changed="query.refetch()"
    />
  </div><UiConfirmDialog
    v-model="confirm"
    :title="t('catalog.remove')"
    :description="t('catalog.confirmDelete')"
    :busy="busy"
    @confirm="remove"
  />
</template>
