<script setup lang="ts">
import { computed, ref, watch } from 'vue'; import { useRoute, useRouter } from 'vue-router'; import { useI18n } from 'vue-i18n'; import { useQuery } from '@tanstack/vue-query';
import { request, json, ApiError, errorKey } from '../../lib/api'; import { usePagedQuery } from '../../lib/paged-query'; import { queryClient } from '../../app/query'; import { useSession } from '../../app/session'; import { toast } from '../../lib/toasts';
import type { CreditBalance } from '../../../../../packages/shared/src/credits'; import type { BrandRecord } from '../../../../../packages/shared/src/catalog';
import { newInput, variationText, type GeneratorInput, type GeneratorTool, type GeneratorQuote, type GeneratorRunRecord, type GeneratedDraftRecord } from './generator';
import GeneratorForm from './GeneratorForm.vue'; import ResultCards from './ResultCards.vue'; import PageHeader from '../../components/PageHeader.vue'; import UiButton from '../../components/ui/UiButton.vue'; import UiSelect from '../../components/ui/UiSelect.vue'; import UiState from '../../components/ui/UiState.vue'; import UiLoadMore from '../../components/ui/UiLoadMore.vue'; import UiDialog from '../../components/ui/UiDialog.vue';
const route = useRoute(); const router = useRouter(); const session = useSession(); const { t, locale } = useI18n();
const workspaceId = computed(() => typeof route.query.workspaceId === 'string' ? route.query.workspaceId : ''); const runId = computed(() => typeof route.query.runId === 'string' ? route.query.runId : '');
const base = computed(() => `/workspaces/${workspaceId.value}/generator`); const enabled = computed(() => !!workspaceId.value);
const workspaces = usePagedQuery<{ items: { workspace: { id: string; name: string } }[] }>(['workspaces'], '/workspaces');
const workspace = useQuery({ queryKey: computed(() => ['generator-workspace', workspaceId.value]), queryFn: () => request<{ role: string }>(`/workspaces/${workspaceId.value}`), enabled });
const canWrite = computed(() => !!workspace.data.value && workspace.data.value.role !== 'VIEWER');
const tools = useQuery({ queryKey: computed(() => ['generator-tools', workspaceId.value]), queryFn: () => request<GeneratorTool[]>(`${base.value}/tools`), enabled });
const brands = usePagedQuery<{ items: BrandRecord[] }>(() => ['catalog-brand-options', workspaceId.value], () => `/workspaces/${workspaceId.value}/brands`, enabled);
const selectedToolId = ref(''); const input = ref<GeneratorInput>(); const quote = ref<GeneratorQuote>(); const busy = ref(false); const error = ref(''); const regenerateOpen = ref(false); const draft = ref<GeneratedDraftRecord>(); const draftOpen = ref(false);
const tool = computed(() => tools.data.value?.find(item => item.id === selectedToolId.value));
const products = usePagedQuery<{ items: { id: string; name: string }[] }>(() => ['generator-products', workspaceId.value, input.value?.brandId], () => `/workspaces/${workspaceId.value}/products?status=ACTIVE&brandId=${input.value?.brandId}`, () => !!workspaceId.value && !!input.value?.brandId);
const balance = useQuery({ queryKey: computed(() => ['credits', workspaceId.value, 'balance']), queryFn: () => request<CreditBalance>(`/workspaces/${workspaceId.value}/credits/balance`), enabled });
const run = useQuery({ queryKey: computed(() => ['generator-run', workspaceId.value, runId.value]), queryFn: () => request<GeneratorRunRecord>(`${base.value}/runs/${runId.value}`), enabled: computed(() => enabled.value && !!runId.value), refetchInterval: query => ['PENDING','RESERVED','RUNNING'].includes(query.state.data?.status ?? '') ? 1500 : false });
const history = usePagedQuery<{ items: { id: string; status: string; createdAt: string; quote: { toolId: string } }[] }>(() => ['generator-history', workspaceId.value], () => `${base.value}/runs`, enabled);
const processing = computed(() => !!runId.value && (!run.data.value || ['PENDING','RESERVED','RUNNING'].includes(run.data.value.status)));
const heldUnknown = computed(() => run.data.value?.status === 'UNKNOWN');
const shownBalance = computed(() => quote.value?.credits ?? run.data.value?.credits ?? balance.data.value);
const pendingKey = computed(() => `cf-generator-pending:${session.user?.id}:${workspaceId.value}`);
const pending = ref<{ quoteId: string; idempotencyKey: string }>();
watch(pendingKey, () => { try { pending.value = JSON.parse(sessionStorage.getItem(pendingKey.value) ?? 'null') ?? undefined; } catch { pending.value = undefined; } }, { immediate: true });
const selectedWorkspace = computed({ get: () => workspaceId.value, set: (value: string | string[]) => { if (typeof value === 'string') void router.push({ path: '/app/create', query: { workspaceId: value } }); } });
const creditedEnough = computed(() => !!quote.value && BigInt(shownBalance.value?.available ?? '0') >= BigInt(quote.value.estimate.worstCredits));
function integer(value: string) { return BigInt(value).toLocaleString(locale.value); }
function message(failure: unknown) { return failure instanceof ApiError && failure.status === 503 ? t('generator.providerUnavailable') : t(errorKey(failure)); }
function initialize() { const first = tools.data.value?.[0]; if (first && !input.value) { selectedToolId.value = first.id; input.value = newInput(first, '', locale.value.startsWith('vi') ? 'vi' : 'en'); } }
watch(() => tools.data.value, initialize);
watch([() => brands.data.value, () => input.value?.brandId], () => {
  if (!input.value) return;
  if (!input.value.brandId && brands.data.value?.items.length) input.value.brandId = (brands.data.value.items.find(b => b.isDefault) ?? brands.data.value.items[0])!.id;
  const brand = brands.data.value?.items.find(b => b.id === input.value?.brandId); if (!brand) return;
  if (!input.value.audience) input.value.audience = brand.guidelines.targetAudiences?.join(', ') ?? '';
  if (!input.value.tone) input.value.tone = brand.guidelines.voice || brand.guidelines.tone?.join(', ') || '';
}, { immediate: true });
watch(workspaceId, () => { input.value = undefined; selectedToolId.value = ''; quote.value = undefined; error.value = ''; draftOpen.value = false; initialize(); });
watch(input, () => { quote.value = undefined; regenerateOpen.value = false; }, { deep: true });
watch(() => run.data.value?.id, () => { if (!run.data.value) return; input.value = JSON.parse(JSON.stringify(run.data.value.input)) as GeneratorInput; selectedToolId.value = run.data.value.toolId; });
watch(() => run.data.value?.status, () => { if (run.data.value) { void queryClient.invalidateQueries({ queryKey: ['credits', workspaceId.value] }); void queryClient.invalidateQueries({ queryKey: ['generator-history', workspaceId.value] }); } });
async function chooseTool(value: GeneratorTool) { selectedToolId.value = value.id; input.value = newInput(value, input.value?.brandId ?? '', locale.value.startsWith('vi') ? 'vi' : 'en'); await router.replace({ path: '/app/create', query: { workspaceId: workspaceId.value } }); }
async function preview(regenerate = false) {
  if (!input.value) return; busy.value = true; error.value = '';
  try { quote.value = await request<GeneratorQuote>(`${base.value}/quotes`, { method: 'POST', body: json(input.value) }); if (regenerate) regenerateOpen.value = true; }
  catch (failure) { error.value = message(failure); } finally { busy.value = false; }
}
async function submit(recover = false) {
  const operation = recover ? pending.value : quote.value ? { quoteId: quote.value.id, idempotencyKey: crypto.randomUUID() } : undefined; if (!operation) return;
  busy.value = true; error.value = ''; pending.value = operation; sessionStorage.setItem(pendingKey.value, json(operation));
  try { const result = await request<GeneratorRunRecord>(`${base.value}/runs`, { method: 'POST', body: json(operation) }); sessionStorage.removeItem(pendingKey.value); pending.value = undefined; regenerateOpen.value = false; quote.value = undefined; await router.replace({ path: '/app/create', query: { workspaceId: workspaceId.value, runId: result.id } }); queryClient.setQueryData(['generator-run', workspaceId.value, result.id], result); await queryClient.invalidateQueries({ queryKey: ['credits', workspaceId.value] }); }
  catch (failure) { error.value = message(failure); if (failure instanceof ApiError && failure.status === 409) error.value = t('generator.quoteChanged'); if (failure instanceof ApiError && [400,403,404,409].includes(failure.status)) { pending.value = undefined; sessionStorage.removeItem(pendingKey.value); } } finally { busy.value = false; }
}
async function resume() { busy.value = true; error.value = ''; try { await request(`${base.value}/runs/${runId.value}/resume`, { method: 'POST' }); await run.refetch(); } catch (failure) { error.value = message(failure); } finally { busy.value = false; } }
async function save(index: number) { busy.value = true; error.value = ''; try { await request(`${base.value}/runs/${runId.value}/drafts`, { method: 'POST', body: json({ variationIndex: index }) }); await run.refetch(); toast(t('generator.saved')); } catch (failure) { error.value = message(failure); } finally { busy.value = false; } }
async function openDraft(id: string) { busy.value = true; error.value = ''; try { draft.value = await request<GeneratedDraftRecord>(`${base.value}/drafts/${id}`); draftOpen.value = true; } catch (failure) { error.value = message(failure); } finally { busy.value = false; } }
</script>
<template>
  <PageHeader
    :title="t('generator.title')"
    :description="t('generator.description')"
  />
  <UiState
    v-if="workspaces.error.value"
    kind="error"
    :description="t(errorKey(workspaces.error.value))"
    retry
    @retry="workspaces.refetch()"
  />
  <section
    v-if="!workspaceId"
    class="card stack"
  >
    <UiSelect
      v-model="selectedWorkspace"
      :label="t('nav.workspaces')"
      :options="(workspaces.data.value?.items ?? []).map(item => ({ value:item.workspace.id,label:item.workspace.name }))"
    /><UiLoadMore
      :has-more="workspaces.hasNextPage.value"
      :busy="workspaces.isFetchingNextPage.value"
      @next="workspaces.fetchNextPage()"
    /><RouterLink
      class="button secondary"
      to="/workspaces"
    >{{ t('workspace.create') }}</RouterLink>
  </section>
  <template v-else>
    <UiState
      v-if="tools.isPending.value || workspace.isPending.value"
      kind="loading"
    />
    <UiState
      v-else-if="tools.error.value || workspace.error.value"
      kind="error"
      :description="t(errorKey(tools.error.value || workspace.error.value))"
      retry
      @retry="tools.refetch(); workspace.refetch()"
    />
    <div
      v-else
      class="stack"
    >
      <div
        v-if="shownBalance"
        class="card row"
        aria-live="polite"
      >
        <strong>{{ t('credits.available') }}: {{ integer(shownBalance.available) }}</strong><span>{{ t('credits.reserved') }}: {{ integer(shownBalance.reserved) }}</span><RouterLink :to="`/w/${workspaceId}/credits`">{{ t('credits.title') }}</RouterLink>
      </div>
      <p
        v-if="!canWrite"
        role="note"
        class="muted"
      >
        {{ t('generator.readOnly') }}
      </p>
      <section
        class="generator-gallery"
        :aria-label="t('generator.tools')"
      >
        <button
          v-for="item in tools.data.value ?? []"
          :key="item.id"
          type="button"
          class="card generator-tool"
          :aria-pressed="item.id === selectedToolId"
          :disabled="processing || busy"
          @click="chooseTool(item)"
        >
          <strong>{{ item.name[locale.startsWith('vi') ? 'vi' : 'en'] }}</strong><span class="muted">{{ item.description[locale.startsWith('vi') ? 'vi' : 'en'] }}</span>
        </button>
      </section>
      <p
        v-if="error"
        role="alert"
        class="field-error"
      >
        {{ error }}
      </p>
      <section
        v-if="pending"
        class="card stack"
      >
        <p>{{ t('generator.pendingHint') }}</p><UiButton
          :loading="busy"
          @click="submit(true)"
        >
          {{ t('generator.recover') }}
        </UiButton>
      </section>
      <UiState
        v-if="brands.isPending.value"
        kind="loading"
      /><UiState
        v-else-if="brands.error.value"
        kind="error"
        :description="t(errorKey(brands.error.value))"
        retry
        @retry="brands.refetch()"
      />
      <section
        v-else-if="!brands.data.value?.items.length"
        class="card stack"
      >
        <p>{{ t('generator.brandRequired') }}</p><RouterLink
          v-if="canWrite"
          class="button"
          :to="`/w/${workspaceId}/brands/new`"
        >{{ t('catalog.createBrand') }}</RouterLink>
      </section>
      <form
        v-else-if="tool && input && canWrite"
        class="card stack"
        @submit.prevent="preview()"
      >
        <GeneratorForm
          v-model="input"
          :tool="tool"
          :brands="brands.data.value.items"
          :products="products.data.value?.items ?? []"
          :disabled="processing || busy || !!pending"
        />
        <UiState
          v-if="products.error.value"
          kind="error"
          :description="t(errorKey(products.error.value))"
          retry
          @retry="products.refetch()"
        />
        <div class="row">
          <UiLoadMore
            :has-more="brands.hasNextPage.value"
            :busy="brands.isFetchingNextPage.value"
            @next="brands.fetchNextPage()"
          /><UiLoadMore
            :has-more="products.hasNextPage.value"
            :busy="products.isFetchingNextPage.value"
            @next="products.fetchNextPage()"
          />
        </div>
        <UiButton
          type="submit"
          variant="secondary"
          :loading="busy"
          :disabled="processing || !!pending || heldUnknown"
        >
          {{ t('generator.preview') }}
        </UiButton>
        <div
          v-if="quote"
          class="stack"
          role="status"
        >
          <strong>{{ t('generator.worstCredits', { amount: integer(quote.estimate.worstCredits) }) }}</strong><p class="muted">
            {{ t('generator.quoteHint') }} {{ new Date(quote.expiresAt).toLocaleTimeString(locale) }}
          </p><p
            v-if="!quote.estimate.environmentEnabled"
            class="field-error"
          >
            {{ t('generator.providerUnavailable') }}
          </p>
          <p
            v-if="!creditedEnough"
            class="field-error"
          >
            {{ t('errors.INSUFFICIENT_CREDITS') }}
          </p><UiButton
            :disabled="!creditedEnough || !quote.estimate.environmentEnabled || processing || !!pending || heldUnknown"
            :loading="busy"
            @click="submit()"
          >
            {{ t('generator.generate') }}
          </UiButton>
        </div>
      </form>
      <UiState
        v-if="runId && run.isPending.value"
        kind="loading"
      /><UiState
        v-else-if="run.error.value"
        kind="error"
        :description="message(run.error.value)"
        retry
        @retry="run.refetch()"
      />
      <section
        v-if="run.data.value"
        class="card stack"
        aria-live="polite"
      >
        <strong>{{ t(`generator.status_${run.data.value.status}`) }}</strong><p v-if="heldUnknown">
          {{ t('credits.unknownHint') }}
        </p><p v-if="run.data.value.status === 'INVALID_OUTPUT'">
          {{ t('generator.invalidRefund') }}
        </p><p v-else-if="run.data.value.status === 'FAILED'">
          {{ t('generator.failureHint') }}
        </p><p v-if="run.data.value.status === 'OUTPUT_UNAVAILABLE'">
          {{ t('generator.outputLost') }}
        </p><p v-if="run.data.value.usage">
          {{ t('generator.charged', { amount: integer(run.data.value.reservation?.refundedAt ? '0' : run.data.value.usage.credits) }) }}
        </p><div class="row">
          <UiButton
            variant="secondary"
            :disabled="busy"
            @click="run.refetch()"
          >
            {{ t('credits.refresh') }}
          </UiButton><UiButton
            v-if="canWrite && run.data.value.canResume"
            :loading="busy"
            @click="resume"
          >
            {{ t('generator.recover') }}
          </UiButton><UiButton
            v-if="canWrite && !processing && !heldUnknown"
            variant="secondary"
            :loading="busy"
            @click="preview(true)"
          >
            {{ t('generator.regenerate') }}
          </UiButton>
        </div>
      </section>
      <ResultCards
        v-if="run.data.value?.status === 'SUCCEEDED'"
        :run="run.data.value"
        :editable="canWrite"
        :busy="busy"
        @save="save"
        @open="openDraft"
      />
      <section class="card stack">
        <h2>{{ t('generator.history') }}</h2><UiState
          v-if="history.isPending.value"
          kind="loading"
        /><UiState
          v-else-if="history.error.value"
          kind="error"
          :description="message(history.error.value)"
          retry
          @retry="history.refetch()"
        /><UiState
          v-else-if="!history.data.value?.items.length"
          kind="empty"
        /><div
          v-else
          class="stack"
        >
          <RouterLink
            v-for="item in history.data.value.items"
            :key="item.id"
            :to="{ path:'/app/create',query:{workspaceId,runId:item.id} }"
          >{{ tools.data.value?.find(toolItem => toolItem.id === item.quote.toolId)?.name[locale.startsWith('vi') ? 'vi' : 'en'] }} · {{ t(`generator.status_${item.status}`) }} · {{ new Date(item.createdAt).toLocaleString(locale) }}</RouterLink>
        </div><UiLoadMore
          :has-more="history.hasNextPage.value"
          :busy="history.isFetchingNextPage.value"
          @next="history.fetchNextPage()"
        />
      </section>
    </div>
  </template>
  <UiDialog
    v-model="regenerateOpen"
    :title="t('generator.regenerate')"
  >
    <div
      v-if="quote"
      class="stack"
    >
      <p>{{ t('generator.worstCredits', { amount: integer(quote.estimate.worstCredits) }) }}</p><p>{{ t('generator.newCharge') }}</p><UiButton
        :loading="busy"
        :disabled="!creditedEnough || !quote.estimate.environmentEnabled"
        @click="submit()"
      >
        {{ t('generator.generate') }}
      </UiButton>
    </div>
  </UiDialog>
  <UiDialog
    v-model="draftOpen"
    :title="t('generator.openDraft')"
  >
    <article
      v-if="draft"
      class="stack"
    >
      <h2>{{ draft.title }}</h2><p class="muted">
        {{ t('generator.draftHint') }}
      </p><p class="generator-copy">
        {{ variationText(draft.body.variation) }}
      </p><UiButton @click="router.push(`/w/${workspaceId}/content/${draft.id}`)">
        {{ t('content.editor') }}
      </UiButton>
    </article>
  </UiDialog>
</template>
