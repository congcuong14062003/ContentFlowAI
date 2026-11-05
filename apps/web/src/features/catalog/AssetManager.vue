<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'; import { useI18n } from 'vue-i18n';
import { request, errorKey, json } from '../../lib/api';
import type { CatalogAssetRecord } from './catalog';
import UiButton from '../../components/ui/UiButton.vue';
import UiConfirmDialog from '../../components/ui/UiConfirmDialog.vue';
const props = defineProps<{ base: string; kind: 'brands' | 'products'; id: string; assets: CatalogAssetRecord[]; editable: boolean; logoAssetId?: string | null }>();
const emit = defineEmits<{ changed: [] }>(); const { t } = useI18n();
const urls = ref<Record<string, string>>({}); const busy = ref(false); const error = ref(''); const selected = ref(''); const confirm = ref(false); let generation = 0;
function clearUrls() { for (const url of Object.values(urls.value)) URL.revokeObjectURL(url); urls.value = {}; }
watch(() => [props.base, props.assets] as const, async () => {
  const current = ++generation; clearUrls();
  for (const asset of props.assets) {
    try { const blob = await request<Blob>(`${props.base}/assets/${asset.id}`, {}, true, true); if (generation !== current) return; urls.value[asset.id] = URL.createObjectURL(blob); }
    catch (failure) { if (generation === current) error.value = t(errorKey(failure)); }
  }
}, { immediate: true });
onBeforeUnmount(() => { generation++; clearUrls(); });
async function upload(event: Event) {
  const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5242880) { error.value = t('catalog.imageHint'); input.value = ''; return; }
  busy.value = true; error.value = '';
  try { const form = new FormData(); form.append('file', file); await request(`${props.base}/${props.kind}/${props.id}/assets`, { method: 'POST', body: form }); emit('changed'); }
  catch (failure) { error.value = t(errorKey(failure)); } finally { busy.value = false; input.value = ''; }
}
async function changeLogo(assetId: string | null) {
  busy.value = true; error.value = '';
  try { await request(`${props.base}/brands/${props.id}/logo`, { method: 'PATCH', body: json({ assetId }) }); emit('changed'); }
  catch (failure) { error.value = t(errorKey(failure)); } finally { busy.value = false; }
}
async function remove() {
  busy.value = true; error.value = '';
  try { await request(`${props.base}/assets/${selected.value}`, { method: 'DELETE' }); confirm.value = false; emit('changed'); }
  catch (failure) { error.value = t(errorKey(failure)); } finally { busy.value = false; }
}
</script>
<template>
  <section
    class="card stack"
    :aria-label="t('catalog.assets')"
    :aria-busy="busy"
  >
    <h2>{{ t('catalog.assets') }}</h2><p class="muted">
      {{ t('catalog.imageHint') }}
    </p>
    <label
      v-if="editable"
      class="field"
    >{{ t('catalog.upload') }}<input
      type="file"
      accept="image/png,image/jpeg,image/webp"
      :disabled="busy"
      @change="upload"
    ></label>
    <p
      v-if="error"
      role="alert"
      class="field-error"
    >
      {{ error }}
    </p>
    <p
      v-if="!assets.length"
      class="muted"
    >
      {{ t('catalog.noImages') }}
    </p>
    <div class="grid">
      <figure
        v-for="asset in assets"
        :key="asset.id"
        class="stack"
        style="margin:0; min-width:0"
      >
        <img
          v-if="urls[asset.id]"
          :src="urls[asset.id]"
          :alt="asset.originalName"
          style="width:100%;height:160px;object-fit:contain;border-radius:12px"
        >
        <figcaption style="overflow-wrap:anywhere">
          {{ asset.originalName }} <span v-if="asset.id === logoAssetId"> · {{ t('catalog.logo') }}</span>
        </figcaption>
        <div
          v-if="editable"
          class="row"
        >
          <UiButton
            v-if="kind === 'brands'"
            variant="secondary"
            :disabled="busy"
            @click="changeLogo(asset.id === logoAssetId ? null : asset.id)"
          >
            {{ t(asset.id === logoAssetId ? 'catalog.clearLogo' : 'catalog.useLogo') }}
          </UiButton>
          <UiButton
            variant="danger"
            :disabled="busy"
            @click="selected = asset.id; confirm = true"
          >
            {{ t('catalog.remove') }}
          </UiButton>
        </div>
      </figure>
    </div>
    <UiConfirmDialog
      v-model="confirm"
      :title="t('catalog.remove')"
      :description="t('catalog.confirmDelete')"
      :busy="busy"
      @confirm="remove"
    />
  </section>
</template>
