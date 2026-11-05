<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useQuery } from '@tanstack/vue-query';
import { queryClient } from '../../app/query';
import { usePagedQuery } from '../../lib/paged-query';
import { errorKey, json, request } from '../../lib/api';
import PageHeader from '../../components/PageHeader.vue';
import UiButton from '../../components/ui/UiButton.vue';
import UiInput from '../../components/ui/UiInput.vue';
import UiSelect from '../../components/ui/UiSelect.vue';
import UiState from '../../components/ui/UiState.vue';
import UiDialog from '../../components/ui/UiDialog.vue';
import UiConfirmDialog from '../../components/ui/UiConfirmDialog.vue';
import UiLoadMore from '../../components/ui/UiLoadMore.vue';

interface Asset { id: string; folderId: string | null; originalName: string; mimeType: string; size: number; width: number; height: number; tags: string[]; source: string; status: string; createdAt: string }
interface Folder { id: string; name: string }
interface Usage { usedBytes: string; limitBytes: string; assetCount: number }
const route = useRoute(); const { t, locale } = useI18n();
const workspaceId = computed(() => String(route.params.workspaceId)); const base = computed(() => `/workspaces/${workspaceId.value}/media`);
const role = useQuery({ queryKey: computed(() => ['media-role', workspaceId.value]), queryFn: () => request<{ role: string }>(`/workspaces/${workspaceId.value}`) });
const canWrite = computed(() => !!role.data.value && role.data.value.role !== 'VIEWER');
const folders = useQuery({ queryKey: computed(() => ['media-folders', workspaceId.value]), queryFn: () => request<Folder[]>(`${base.value}/folders`) });
const usage = useQuery({ queryKey: computed(() => ['media-usage', workspaceId.value]), queryFn: () => request<Usage>(`${base.value}/usage`) });
const search = ref(''); const tag = ref(''); const folder = ref<string | string[]>(''); const applied = ref('');
const folderOptions = computed(() => [{ value: '', label: t('media.allFolders') }, ...(folders.data.value ?? []).map(item => ({ value: item.id, label: item.name }))]);
const moveOptions = computed(() => [{ value: '', label: t('media.rootFolder') }, ...(folders.data.value ?? []).map(item => ({ value: item.id, label: item.name }))]);
function apply() { const query = new URLSearchParams(); if (search.value.trim()) query.set('search', search.value.trim()); if (tag.value.trim()) query.set('tag', tag.value.trim()); if (typeof folder.value === 'string' && folder.value) query.set('folderId', folder.value); applied.value = query.toString(); }
const assets = usePagedQuery<{ items: Asset[] }>(() => ['media', workspaceId.value, applied.value], () => `${base.value}?${applied.value}`);
const urls = ref<Record<string, string>>({}); let imageGeneration = 0;
function clearUrls() { Object.values(urls.value).forEach(URL.revokeObjectURL); urls.value = {}; }
watch(() => assets.data.value?.items, async items => {
  const current = ++imageGeneration; clearUrls();
  for (const item of items?.filter(asset => asset.status === 'READY') ?? []) {
    try { const blob = await request<Blob>(`${base.value}/${item.id}/thumbnail`, {}, true, true); if (current !== imageGeneration) return; urls.value[item.id] = URL.createObjectURL(blob); }
    catch { /* the card remains accessible with its file name */ }
  }
}, { immediate: true });
onBeforeUnmount(() => { imageGeneration++; clearUrls(); });
const folderName = ref(''); const busy = ref(false); const error = ref(''); const selected = ref<Asset>(); const editOpen = ref(false); const removeOpen = ref(false); const removeFolderOpen = ref(false);
const tagsDraft = ref(''); const folderDraft = ref<string | string[]>('');
const quotaPercent = computed(() => { const limit = BigInt(usage.data.value?.limitBytes ?? '0'); return limit ? Number(BigInt(usage.data.value?.usedBytes ?? '0') * 100n / limit) : 0; });
function size(value: number | string) { const bytes = Number(value); const divisor = bytes < 1048576 ? 1024 : 1048576; return `${new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(bytes / divisor)} ${bytes < 1048576 ? 'KB' : 'MB'}`; }
async function refresh() { await Promise.all([queryClient.invalidateQueries({ queryKey: ['media', workspaceId.value] }), usage.refetch(), folders.refetch()]); }
async function upload(event: Event) {
  const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5242880 || file.size === 0) { error.value = t('media.invalidImage'); input.value = ''; return; }
  busy.value = true; error.value = '';
  try { const body = new FormData(); body.append('file', file); const suffix = typeof folder.value === 'string' && folder.value ? `?folderId=${folder.value}` : ''; await request(`${base.value}${suffix}`, { method: 'POST', body }); await refresh(); }
  catch (cause) { error.value = t(errorKey(cause)); } finally { busy.value = false; input.value = ''; }
}
async function createFolder() {
  if (!folderName.value.trim()) return; busy.value = true; error.value = '';
  try { await request(`${base.value}/folders`, { method: 'POST', body: json({ name: folderName.value.trim() }) }); folderName.value = ''; await folders.refetch(); }
  catch (cause) { error.value = t(errorKey(cause)); } finally { busy.value = false; }
}
async function deleteFolder() {
  if (typeof folder.value !== 'string' || !folder.value) return; busy.value = true; error.value = '';
  try { await request(`${base.value}/folders/${folder.value}`, { method: 'DELETE' }); folder.value = ''; apply(); removeFolderOpen.value = false; await refresh(); }
  catch (cause) { error.value = t(errorKey(cause)); } finally { busy.value = false; }
}
function edit(item: Asset) { selected.value = item; tagsDraft.value = item.tags.join(', '); folderDraft.value = item.folderId ?? ''; editOpen.value = true; }
async function saveMeta() {
  if (!selected.value) return; busy.value = true; error.value = '';
  try { await request(`${base.value}/${selected.value.id}`, { method: 'PATCH', body: json({ folderId: folderDraft.value || null, tags: tagsDraft.value.split(',').map(value => value.trim()).filter(Boolean) }) }); editOpen.value = false; await refresh(); }
  catch (cause) { error.value = t(errorKey(cause)); } finally { busy.value = false; }
}
async function download(item: Asset) {
  try { const blob = await request<Blob>(`${base.value}/${item.id}/file?download=1`, {}, true, true); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = item.originalName; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  catch (cause) { error.value = t(errorKey(cause)); }
}
async function remove() {
  if (!selected.value) return; busy.value = true; error.value = '';
  try { await request(`${base.value}/${selected.value.id}`, { method: 'DELETE' }); removeOpen.value = false; await refresh(); }
  catch (cause) { error.value = t(errorKey(cause)); } finally { busy.value = false; }
}
</script>

<template>
  <div class="page stack">
    <PageHeader
      :title="t('media.title')"
      :description="t('media.intro')"
    />
    <p
      v-if="error"
      class="field-error"
      role="alert"
    >
      {{ error }}
    </p>
    <div class="media-summary">
      <section
        class="card stack"
        :aria-label="t('media.storage')"
      >
        <div
          class="row"
          style="justify-content:space-between"
        >
          <h2>{{ t('media.storage') }}</h2><span v-if="usage.data.value">{{ size(usage.data.value.usedBytes) }} / {{ size(usage.data.value.limitBytes) }}</span>
        </div>
        <progress
          v-if="usage.data.value"
          :value="quotaPercent"
          max="100"
          style="width:100%;accent-color:var(--primary)"
          :aria-label="t('media.storage')"
        />
        <UiState
          v-if="usage.error.value"
          kind="error"
          retry
          @retry="usage.refetch()"
        />
        <p
          v-if="usage.data.value"
          class="muted"
        >
          {{ t('media.count', { count: usage.data.value.assetCount }) }}
        </p>
      </section>
      <section
        v-if="canWrite"
        class="card stack"
        :aria-label="t('media.manage')"
      >
        <h2>{{ t('media.manage') }}</h2>
        <p class="muted">
          {{ t('media.uploadHint') }}
        </p>
        <label class="button secondary media-upload">{{ t('media.upload') }}<input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          :disabled="busy"
          class="media-file-input"
          @change="upload"
        ></label>
        <form
          class="row"
          @submit.prevent="createFolder"
        >
          <UiInput
            v-model="folderName"
            :label="t('media.folderName')"
            maxlength="100"
          />
          <UiButton
            type="submit"
            :disabled="busy || !folderName.trim()"
          >
            {{ t('media.createFolder') }}
          </UiButton>
        </form>
      </section>
    </div>
    <form
      class="card stack"
      @submit.prevent="apply"
    >
      <div class="catalog-filter-grid">
        <UiInput
          v-model="search"
          :label="t('media.search')"
          maxlength="150"
        />
        <UiInput
          v-model="tag"
          :label="t('media.tag')"
          maxlength="50"
        />
        <UiSelect
          v-model="folder"
          :label="t('media.folder')"
          :options="folderOptions"
        />
      </div>
      <div class="row">
        <UiButton
          type="submit"
          variant="secondary"
        >
          {{ t('media.filter') }}
        </UiButton><UiButton
          v-if="canWrite && folder"
          variant="danger"
          @click="removeFolderOpen = true"
        >
          {{ t('media.deleteFolder') }}
        </UiButton>
      </div>
    </form>
    <UiState
      v-if="assets.isPending.value"
      kind="loading"
    />
    <UiState
      v-else-if="assets.error.value"
      kind="error"
      retry
      @retry="assets.refetch()"
    />
    <UiState
      v-else-if="!assets.data.value?.items.length"
      kind="empty"
      :description="t('media.empty')"
    />
    <div
      v-else
      class="grid media-grid"
    >
      <article
        v-for="item in assets.data.value.items"
        :key="item.id"
        class="card stack"
      >
        <img
          v-if="urls[item.id]"
          :src="urls[item.id]"
          :alt="item.originalName"
          class="media-thumb"
        >
        <div
          v-else
          class="media-thumb muted"
          role="img"
          :aria-label="item.originalName"
        >
          {{ t(item.status === 'DELETING' ? 'media.pendingDelete' : 'media.loadingPreview') }}
        </div>
        <h2>{{ item.originalName }}</h2>
        <p class="muted">
          {{ item.width }} × {{ item.height }} · {{ size(item.size) }} · {{ item.mimeType }}
        </p>
        <p
          v-if="item.tags.length"
          class="muted"
        >
          {{ item.tags.join(', ') }}
        </p>
        <div class="row">
          <UiButton
            v-if="item.status === 'READY'"
            variant="secondary"
            @click="download(item)"
          >
            {{ t('media.download') }}
          </UiButton><UiButton
            v-if="canWrite && item.status === 'READY'"
            variant="secondary"
            @click="edit(item)"
          >
            {{ t('media.edit') }}
          </UiButton><UiButton
            v-if="canWrite"
            variant="danger"
            @click="selected = item; removeOpen = true"
          >
            {{ t(item.status === 'DELETING' ? 'media.retryDelete' : 'media.delete') }}
          </UiButton>
        </div>
      </article>
    </div>
    <UiLoadMore
      :has-more="assets.hasNextPage.value"
      :busy="assets.isFetchingNextPage.value"
      @next="assets.fetchNextPage()"
    />
    <UiDialog
      v-model="editOpen"
      :title="t('media.edit')"
    >
      <form
        class="stack"
        @submit.prevent="saveMeta"
      >
        <UiSelect
          v-model="folderDraft"
          :label="t('media.folder')"
          :options="moveOptions"
        /><UiInput
          v-model="tagsDraft"
          :label="t('media.tags')"
          :hint="t('media.tagsHint')"
        /><UiButton
          type="submit"
          :loading="busy"
        >
          {{ t('common.save') }}
        </UiButton>
      </form>
    </UiDialog>
    <UiConfirmDialog
      v-model="removeOpen"
      :title="t('media.delete')"
      :description="t(selected?.status === 'DELETING' ? 'media.retryDeleteConfirm' : 'media.deleteConfirm')"
      @confirm="remove"
    />
    <UiConfirmDialog
      v-model="removeFolderOpen"
      :title="t('media.deleteFolder')"
      :description="t('media.deleteFolderConfirm')"
      @confirm="deleteFolder"
    />
  </div>
</template>
