<script setup lang="ts">
import { computed, ref, watch } from 'vue'; import { useI18n } from 'vue-i18n'; import { useRouter } from 'vue-router'; import { useQuery } from '@tanstack/vue-query';
import { emptyBrandKit, useCatalogWorkspace, type BrandRecord } from './catalog';
import { request, json, errorKey } from '../../lib/api'; import { queryClient } from '../../app/query';
import BrandFields from './BrandFields.vue'; import AssetManager from './AssetManager.vue';
import PageHeader from '../../components/PageHeader.vue'; import UiInput from '../../components/ui/UiInput.vue'; import UiButton from '../../components/ui/UiButton.vue'; import UiState from '../../components/ui/UiState.vue'; import UiConfirmDialog from '../../components/ui/UiConfirmDialog.vue';
const { t } = useI18n(); const router = useRouter(); const { route, base, workspaceId, workspace, canWrite, canManage } = useCatalogWorkspace();
const id = computed(() => String(route.params.id ?? '')); const creating = computed(() => !id.value); const editing = ref(false);
const name = ref(''); const kit = ref(emptyBrandKit()); const step = ref(0); const busy = ref(false); const error = ref(''); const confirm = ref(false); const heading = ref<HTMLElement>();
const query = useQuery({ queryKey: computed(() => ['catalog-brand', workspaceId.value, id.value]), queryFn: () => request<BrandRecord>(`${base.value}/brands/${id.value}`), enabled: computed(() => !!id.value) });
function reset() { name.value = query.data.value?.name ?? ''; kit.value = { ...emptyBrandKit(), ...JSON.parse(JSON.stringify(query.data.value?.guidelines ?? {})) }; step.value = 0; error.value = ''; }
watch(() => query.data.value, reset); watch(id, () => { editing.value = false; reset(); });
const form = computed(() => creating.value || editing.value);
const sections = computed(() => [t('catalog.basics'), t('catalog.audienceVoice'), t('catalog.channels'), t('catalog.review')]);
async function changed() { await Promise.all([query.refetch(), queryClient.invalidateQueries({ queryKey: ['catalog'] }), queryClient.invalidateQueries({ queryKey: ['catalog-allowance'] }), queryClient.invalidateQueries({ queryKey: ['catalog-brand-options'] })]); }
function next() {
  error.value = '';
  if (step.value === 0 && kit.value.colors.length > 12) { error.value = t('catalog.colorLimit'); return; }
  if (step.value === 0 && (!name.value.trim() || kit.value.colors.some(color => !/^#[a-f0-9]{6}$/i.test(color)))) { error.value = t('catalog.invalidBasics'); return; }
  if (step.value === 2 && (!kit.value.languages.length || kit.value.languages.some(lang => !/^[a-z]{2,3}(-[A-Z]{2})?$/.test(lang)))) { error.value = t('catalog.languageHint'); return; }
  step.value++; requestAnimationFrame(() => heading.value?.focus());
}
async function save() {
  busy.value = true; error.value = '';
  try { const record = await request<BrandRecord>(`${base.value}/brands${id.value ? `/${id.value}` : ''}`, { method: creating.value ? 'POST' : 'PATCH', body: json({ name: name.value, guidelines: kit.value }) });
    await queryClient.invalidateQueries({ queryKey: ['catalog'] }); await queryClient.invalidateQueries({ queryKey: ['catalog-allowance'] }); await queryClient.invalidateQueries({ queryKey: ['catalog-brand-options'] });
    editing.value = false; if (creating.value) await router.replace(`/w/${workspaceId.value}/brands/${record.id}`); else await query.refetch();
  } catch (failure) { error.value = t(errorKey(failure)); } finally { busy.value = false; }
}
async function makeDefault() { busy.value = true; error.value = ''; try { await request(`${base.value}/brands/${id.value}/default`, { method: 'POST' }); await changed(); } catch (failure) { error.value = t(errorKey(failure)); } finally { busy.value = false; } }
async function remove() { busy.value = true; error.value = ''; try { await request(`${base.value}/brands/${id.value}`, { method: 'DELETE' }); await queryClient.invalidateQueries({ queryKey: ['catalog'] }); await queryClient.invalidateQueries({ queryKey: ['catalog-allowance'] }); await queryClient.invalidateQueries({ queryKey: ['catalog-brand-options'] }); await router.push(`/w/${workspaceId.value}/brands`); } catch (failure) { error.value = t(errorKey(failure)); } finally { busy.value = false; } }
const detailFields = ['industry','businessDescription','colors','targetAudiences','voice','tone','keywords','forbiddenPhrases','preferredCta','languages','socialPlatforms','aiInstructions'] as const;
</script>
<template>
  <PageHeader
    :title="creating ? t('catalog.createBrand') : query.data.value?.name || t('catalog.brands')"
    :description="t('catalog.brandIntro')"
  >
    <RouterLink
      class="button secondary"
      :to="`/w/${workspaceId}/brands`"
    >{{ t('common.back') }}</RouterLink>
    <UiButton
      v-if="!form && canWrite"
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
  />
  <UiState
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
    v-else-if="form && canWrite"
    class="card stack"
    @submit.prevent="step < 3 ? next() : save()"
  >
    <p class="eyebrow">
      {{ t('catalog.step', { current: step + 1, total: 4 }) }}
    </p><h2
      ref="heading"
      tabindex="-1"
    >
      {{ sections[step] }}
    </h2>
    <UiInput
      v-if="step === 0"
      v-model="name"
      :label="t('catalog.name')"
      maxlength="100"
      required
    />
    <BrandFields
      v-model="kit"
      :step="step"
    />
    <div
      v-if="step === 3"
      class="stack"
    >
      <h3>{{ name }}</h3><dl class="catalog-definition">
        <template
          v-for="key in detailFields"
          :key="key"
        >
          <dt>{{ t(`catalog.${key}`) }}</dt><dd>{{ Array.isArray(kit[key]) ? (kit[key] as string[]).join(', ') : kit[key] || '—' }}</dd>
        </template>
      </dl><p class="muted">
        {{ t('catalog.assetsAfterSave') }}
      </p>
    </div>
    <div class="row">
      <UiButton
        v-if="step > 0"
        variant="secondary"
        :disabled="busy"
        @click="step--"
      >
        {{ t('common.previous') }}
      </UiButton><UiButton
        type="submit"
        :loading="busy"
      >
        {{ t(step < 3 ? 'common.next' : 'common.save') }}
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
      <p
        v-if="query.data.value.isDefault"
        class="eyebrow"
      >
        {{ t('catalog.default') }}
      </p>
      <dl class="catalog-definition">
        <template
          v-for="key in detailFields"
          :key="key"
        >
          <dt>{{ t(`catalog.${key}`) }}</dt><dd>{{ Array.isArray(query.data.value.guidelines[key]) ? (query.data.value.guidelines[key] as string[]).join(', ') : query.data.value.guidelines[key] || '—' }}</dd>
        </template>
      </dl>
      <div
        v-if="canManage"
        class="row"
      >
        <UiButton
          v-if="!query.data.value.isDefault"
          variant="secondary"
          :loading="busy"
          @click="makeDefault"
        >
          {{ t('catalog.makeDefault') }}
        </UiButton><UiButton
          variant="danger"
          :disabled="busy"
          @click="confirm = true"
        >
          {{ t('catalog.remove') }}
        </UiButton>
      </div>
    </article>
    <AssetManager
      :id="id"
      :base="base"
      kind="brands"
      :assets="query.data.value.assets ?? []"
      :logo-asset-id="query.data.value.logoAssetId"
      :editable="canWrite"
      @changed="changed"
    />
  </div>
  <UiConfirmDialog
    v-model="confirm"
    :title="t('catalog.remove')"
    :description="t('catalog.confirmDelete')"
    :busy="busy"
    @confirm="remove"
  />
</template>
