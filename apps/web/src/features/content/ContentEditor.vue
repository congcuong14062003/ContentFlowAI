<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { onBeforeRouteLeave } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useQuery } from '@tanstack/vue-query';
import { EditorContent, useEditor } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { request, json, ApiError } from '../../lib/api';
import { queryClient } from '../../app/query';
import { toast } from '../../lib/toasts';
import PageHeader from '../../components/PageHeader.vue';
import UiButton from '../../components/ui/UiButton.vue';
import UiInput from '../../components/ui/UiInput.vue';
import UiState from '../../components/ui/UiState.vue';
import UiDialog from '../../components/ui/UiDialog.vue';
import { toMarkdown } from './markdown';
import type { GeneratorInput, GeneratorQuote, GeneratorRunRecord } from '../../../../../packages/shared/src/generator';
const route = useRoute(); const router = useRouter(); const { t } = useI18n();
const workspaceId = computed(() => String(route.params.workspaceId)); const id = computed(() => String(route.params.id)); const base = computed(() => `/workspaces/${workspaceId.value}/content/${id.value}`);
interface Content { id: string; title: string; version: number; status: string; body: { editorDoc?: Record<string, unknown>; variation: { mainText: string; hook: string; cta: string; hashtags: string[] }; platform?: string; language?: 'vi' | 'en' }; brandId?: string }
interface Revision { version: number; title: string | null; actorId: string | null; createdAt: string }
const record = useQuery({ queryKey: computed(() => ['content', workspaceId.value, id.value]), queryFn: () => request<Content>(base.value) });
const workspace = useQuery({ queryKey: computed(() => ['workspace-role', workspaceId.value]), queryFn: () => request<{ role: string }>(`/workspaces/${workspaceId.value}`) });
const canWrite = computed(() => workspace.data.value?.role !== 'VIEWER' && record.data.value?.status === 'DRAFT');
const history = useQuery({ queryKey: computed(() => ['content-revisions', workspaceId.value, id.value]), queryFn: () => request<Revision[]>(`${base.value}/revisions`) });
const title = ref(''); const version = ref(0); const state = ref<'ready'|'dirty'|'saving'|'conflict'|'error'>('ready'); const error = ref(''); const historyOpen = ref(false); const previewOpen = ref(false); let timer: ReturnType<typeof setTimeout> | undefined; let loading = false;
type RewriteGoal = 'clarity' | 'shorten' | 'expand' | 'change_tone';
const aiBusy = ref(false); const aiError = ref(''); const aiOpen = ref(false); const aiQuote = ref<GeneratorQuote>(); const aiGoal = ref<RewriteGoal>('clarity'); const aiRun = ref<GeneratorRunRecord>();
const aiOperation = ref<{ quoteId: string; idempotencyKey: string }>();
let selection: { from: number; to: number; text: string; doc: string; version: number } | undefined;
async function prepareAi(goal: RewriteGoal) {
  if (!editor.value || !record.data.value?.brandId || !canWrite.value || state.value !== 'ready') return;
  const { from, to } = editor.value.state.selection; const selected = editor.value.state.doc.textBetween(from, to, '\n');
  if (!selected.trim()) { aiError.value = t('content.selectText'); return; }
  selection = { from, to, text: selected, doc: JSON.stringify(editor.value.getJSON()), version: version.value };
  aiGoal.value = goal; aiError.value = ''; aiBusy.value = true; aiOperation.value = undefined;
  const body = record.data.value.body;
  const input: GeneratorInput = { toolId: 'rewrite', brandId: record.data.value.brandId, productIds: [], audience: 'Audience of the selected content', platform: body.platform || 'facebook', variantPlatforms: [], tone: 'Preserve the original voice', language: body.language || 'vi', objective: goal, variations: 1, verifiedFacts: [], params: { sourceText: selected, rewriteGoal: goal } };
  try { aiQuote.value = await request<GeneratorQuote>(`/workspaces/${workspaceId.value}/generator/quotes`, { method: 'POST', body: json(input) }); aiOpen.value = true; }
  catch (cause) { aiError.value = cause instanceof ApiError ? cause.code : t('common.error'); } finally { aiBusy.value = false; }
}
async function runAi() {
  if (!aiQuote.value || !selection || !editor.value) return;
  aiBusy.value = true; aiError.value = '';
  try {
    const operation = aiOperation.value ?? { quoteId: aiQuote.value.id, idempotencyKey: crypto.randomUUID() }; aiOperation.value = operation;
    let result = await request<GeneratorRunRecord>(`/workspaces/${workspaceId.value}/generator/runs`, { method: 'POST', body: json(operation) });
    aiRun.value = result;
    for (let attempt = 0; attempt < 80 && ['PENDING','RESERVED','RUNNING'].includes(result.status); attempt++) { await new Promise(resolve => setTimeout(resolve, 1000)); result = await request<GeneratorRunRecord>(`/workspaces/${workspaceId.value}/generator/runs/${result.id}`); aiRun.value = result; }
    if (result.status !== 'SUCCEEDED' || !result.result?.variations[0]) { aiError.value = result.errorCode || result.status; return; }
    const validSelection = selection.version === version.value && selection.doc === JSON.stringify(editor.value.getJSON()) && editor.value.state.doc.textBetween(selection.from, selection.to, '\n') === selection.text;
    if (!validSelection) { aiError.value = t('content.aiStale'); return; }
    editor.value.chain().focus().insertContentAt({ from: selection.from, to: selection.to }, result.result.variations[0].mainText).run();
    aiOpen.value = false; aiQuote.value = undefined; aiOperation.value = undefined; await queryClient.invalidateQueries({ queryKey: ['credits', workspaceId.value] });
  } catch (cause) { aiError.value = cause instanceof ApiError ? cause.code : t('common.error'); } finally { aiBusy.value = false; }
}
const editor = useEditor({ extensions: [StarterKit, Placeholder.configure({ placeholder: t('content.placeholder') })], content: '', editable: false, onUpdate: () => dirty() });
function dirty() { if (loading || !version.value || state.value === 'conflict') return; state.value = 'dirty'; if (timer) clearTimeout(timer); timer = setTimeout(() => { void save(); }, 900); }
watch(record.data, value => { if (!value || !editor.value || ['dirty','saving','conflict','error'].includes(state.value)) return; loading = true; title.value = value.title; version.value = value.version; editor.value.commands.setContent(value.body.editorDoc ?? value.body.variation.mainText); state.value = 'ready'; loading = false; }, { immediate: true });
watch(canWrite, value => editor.value?.setEditable(value));
watch(title, () => dirty());
async function save() { if (!editor.value || !version.value || state.value !== 'dirty') return; if (timer) clearTimeout(timer); const current = editor.value.getJSON(); const text = editor.value.getText({ blockSeparator: '\n\n' }); const intendedTitle = title.value; const expectedVersion = version.value; state.value = 'saving';
  try { const saved = await request<Content>(base.value, { method: 'PUT', body: json({ expectedVersion, title: intendedTitle, text, doc: current }) }); version.value = saved.version; await history.refetch(); if (JSON.stringify(editor.value.getJSON()) !== JSON.stringify(current) || title.value !== intendedTitle) dirty(); else state.value = 'ready'; }
  catch (cause) { state.value = cause instanceof ApiError && cause.status === 409 ? 'conflict' : 'error'; error.value = cause instanceof ApiError ? cause.code : t('common.error'); }
}
async function restore(target: number) { if (state.value !== 'ready') return; try { const restored = await request<Content>(`${base.value}/restore`, { method: 'POST', body: json({ expectedVersion: version.value, version: target }) }); queryClient.setQueryData(['content', workspaceId.value, id.value], restored); await history.refetch(); historyOpen.value = false; } catch (cause) { state.value = cause instanceof ApiError && cause.status === 409 ? 'conflict' : 'error'; } }
async function reload() { if (timer) clearTimeout(timer); state.value = 'ready'; await record.refetch(); }
async function copy() { try { await navigator.clipboard.writeText(editor.value?.getText({ blockSeparator: '\n\n' }) ?? ''); toast(t('content.copied')); } catch { toast(t('content.copyFailed')); } }
function exportText() { const value = editor.value?.getText({ blockSeparator: '\n\n' }) ?? ''; const blob = new Blob([value], { type: 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${id.value}.txt`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function exportMarkdown() { const value = editor.value ? toMarkdown(editor.value.getJSON()) : ''; const blob = new Blob([value], { type: 'text/markdown;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${id.value}.md`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
onBeforeUnmount(() => { if (timer) clearTimeout(timer); });
onBeforeRouteLeave(async () => { if (state.value === 'dirty') await save(); return state.value === 'ready'; });
function beforeUnload(event: BeforeUnloadEvent) { if (state.value !== 'ready') event.preventDefault(); }
window.addEventListener('beforeunload', beforeUnload);
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload));
</script>
<template>
  <div class="page stack">
    <PageHeader
      :title="t('content.editor')"
      :description="t('content.editorHint')"
    />
    <UiState
      v-if="record.isPending.value"
      kind="loading"
    />
    <UiState
      v-else-if="record.error.value"
      kind="error"
      :retry="true"
      @retry="record.refetch()"
    />
    <div
      v-if="record.data.value"
      class="content-editor-layout"
    >
      <aside class="card stack">
        <h2>{{ t('content.outline') }}</h2><p class="muted">
          {{ title }}
        </p><p class="muted">
          {{ record.data.value.body.platform || '—' }}
        </p><p class="muted">
          v{{ version }}
        </p><UiButton
          variant="secondary"
          @click="router.push(`/w/${workspaceId}/content`)"
        >
          {{ t('content.library') }}
        </UiButton>
      </aside>
      <main class="card stack">
        <UiInput
          v-model="title"
          :label="t('content.title')"
          :disabled="!canWrite"
        />
        <div class="row">
          <UiButton
            variant="secondary"
            :disabled="!canWrite || !editor?.can().chain().focus().undo().run()"
            @click="editor?.chain().focus().undo().run()"
          >
            {{ t('content.undo') }}
          </UiButton><UiButton
            variant="secondary"
            :disabled="!canWrite || !editor?.can().chain().focus().redo().run()"
            @click="editor?.chain().focus().redo().run()"
          >
            {{ t('content.redo') }}
          </UiButton><UiButton
            variant="secondary"
            :disabled="!canWrite"
            @click="editor?.chain().focus().toggleBold().run()"
          >
            B
          </UiButton><UiButton
            variant="secondary"
            :disabled="!canWrite"
            @click="editor?.chain().focus().toggleBulletList().run()"
          >
            •
          </UiButton>
        </div>
        <EditorContent
          :editor="editor"
          class="content-prose control"
          :aria-label="t('content.body')"
        />
        <p
          role="status"
          class="muted"
        >
          {{ t(`content.state_${state}`) }} · v{{ version }}
        </p><p
          v-if="error"
          role="alert"
        >
          {{ error }}
        </p>
        <div class="row">
          <UiButton
            :disabled="state !== 'dirty'"
            @click="save"
          >
            {{ t('content.save') }}
          </UiButton><UiButton
            variant="secondary"
            @click="historyOpen = true"
          >
            {{ t('content.history') }}
          </UiButton><UiButton
            variant="secondary"
            @click="previewOpen = true"
          >
            {{ t('content.preview') }}
          </UiButton><UiButton
            variant="secondary"
            @click="copy"
          >
            {{ t('content.copy') }}
          </UiButton><UiButton
            variant="secondary"
            @click="exportText"
          >
            {{ t('content.exportText') }}
          </UiButton><UiButton
            variant="secondary"
            @click="exportMarkdown"
          >
            {{ t('content.exportMarkdown') }}
          </UiButton>
        </div>
        <div
          v-if="state === 'conflict'"
          class="card"
          role="alert"
        >
          <p>{{ t('content.conflict') }}</p><UiButton @click="reload">
            {{ t('content.reload') }}
          </UiButton>
        </div>
      </main>
      <aside class="card stack">
        <h2>{{ t('content.assistant') }}</h2><p class="muted">
          {{ t('content.assistantHint') }}
        </p><UiButton
          :disabled="!canWrite || aiBusy || state !== 'ready'"
          @click="prepareAi('clarity')"
        >
          {{ t('content.aiRewrite') }}
        </UiButton>
        <UiButton
          :disabled="!canWrite || aiBusy || state !== 'ready'"
          variant="secondary"
          @click="prepareAi('shorten')"
        >
          {{ t('content.aiShorten') }}
        </UiButton>
        <UiButton
          :disabled="!canWrite || aiBusy || state !== 'ready'"
          variant="secondary"
          @click="prepareAi('expand')"
        >
          {{ t('content.aiExpand') }}
        </UiButton>
        <UiButton
          :disabled="!canWrite || aiBusy || state !== 'ready'"
          variant="secondary"
          @click="prepareAi('change_tone')"
        >
          {{ t('content.aiTone') }}
        </UiButton>
        <p
          v-if="aiError"
          role="alert"
        >
          {{ aiError }}
        </p>
      </aside>
    </div>
    <UiDialog
      v-model="aiOpen"
      :title="t('content.assistant')"
    >
      <div class="stack">
        <p>{{ t('content.aiCharge') }} {{ aiQuote?.estimate.worstCredits }}</p><p>{{ t('content.aiGoal') }}: {{ aiGoal }}</p>
        <UiButton
          :loading="aiBusy"
          :disabled="!aiQuote?.estimate.environmentEnabled || BigInt(aiQuote?.credits.available ?? '0') < BigInt(aiQuote?.estimate.worstCredits ?? '0')"
          @click="runAi"
        >
          {{ t('content.aiConfirm') }}
        </UiButton>
        <p
          v-if="aiRun"
          role="status"
        >
          {{ aiRun.status }}
        </p><p
          v-if="aiError"
          role="alert"
        >
          {{ aiError }}
        </p>
      </div>
    </UiDialog>
    <UiDialog
      v-model="historyOpen"
      :title="t('content.history')"
    >
      <div class="stack">
        <div
          v-for="revision in history.data.value ?? []"
          :key="revision.version"
          class="row"
        >
          <span>v{{ revision.version }} · {{ new Date(revision.createdAt).toLocaleString() }}</span><UiButton
            variant="secondary"
            :disabled="state !== 'ready' || revision.version === version"
            @click="restore(revision.version)"
          >
            {{ t('content.restore') }}
          </UiButton>
        </div>
      </div>
    </UiDialog>
    <UiDialog
      v-model="previewOpen"
      :title="t('content.preview')"
    >
      <article class="stack">
        <h2>{{ title }}</h2><p class="generator-copy">
          {{ editor?.getText({ blockSeparator: '\n\n' }) }}
        </p><p>{{ record.data.value?.body.variation.cta }}</p><p>{{ record.data.value?.body.variation.hashtags.join(' ') }}</p>
      </article>
    </UiDialog>
  </div>
</template>
