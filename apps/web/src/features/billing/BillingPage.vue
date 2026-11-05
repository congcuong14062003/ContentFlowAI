<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useQuery } from '@tanstack/vue-query';
import { request, json, errorKey } from '../../lib/api';
import { queryClient } from '../../app/query';
import PageHeader from '../../components/PageHeader.vue';
import UiButton from '../../components/ui/UiButton.vue';
import UiState from '../../components/ui/UiState.vue';
import UiConfirmDialog from '../../components/ui/UiConfirmDialog.vue';

interface Plan { id: string; code: string; name: string; tier: string; cadence: string; priceMinor: string; currency: string; memberLimit: number; brandLimit: number; storageLimitBytes: string; periodCredits: string; features: string[] }
interface Payment { id: string; status: string; provider: string }
interface Invoice { id: string; amountMinor: string; currency: string; status: string; createdAt: string; payment?: Payment; plan: Pick<Plan, 'name' | 'tier' | 'cadence'> }
interface Subscription { id: string; status: string; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; plan: Plan; invoices: { payment: Payment | null }[] }
const route = useRoute(); const { t, locale } = useI18n(); const workspaceId = computed(() => String(route.params.workspaceId)); const base = computed(() => `/workspaces/${workspaceId.value}/billing`);
const plans = useQuery({ queryKey: ['billing-plans'], queryFn: () => request<Plan[]>('/billing/plans') });
const current = useQuery({ queryKey: computed(() => ['billing-current', workspaceId.value]), queryFn: () => request<Subscription | null>(`${base.value}/subscription`) });
const invoices = useQuery({ queryKey: computed(() => ['billing-invoices', workspaceId.value]), queryFn: () => request<{ items: Invoice[] }>(`${base.value}/invoices?limit=20`) });
const role = useQuery({ queryKey: computed(() => ['billing-role', workspaceId.value]), queryFn: () => request<{ role: string }>(`/workspaces/${workspaceId.value}`) });
const owner = computed(() => role.data.value?.role === 'OWNER'); const busy = ref(false); const error = ref(''); const notice = ref(''); const cancelOpen = ref(false);
function formatMoney(minor: string, currency: string) {
  const digits = new Intl.NumberFormat(locale.value, { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const divisor = 10n ** BigInt(digits); const amount = BigInt(minor);
  const whole = (amount / divisor).toLocaleString(locale.value);
  const separator = new Intl.NumberFormat(locale.value, { minimumFractionDigits: 1 }).formatToParts(1.1).find(part => part.type === 'decimal')?.value ?? '.';
  return `${currency} ${whole}${digits ? separator + (amount % divisor).toString().padStart(digits, '0') : ''}`;
}
const number = (value: string | number) => BigInt(value).toLocaleString(locale.value);
async function refresh() { await Promise.all([queryClient.invalidateQueries({ queryKey: ['billing-current', workspaceId.value] }), queryClient.invalidateQueries({ queryKey: ['billing-invoices', workspaceId.value] }), queryClient.invalidateQueries({ queryKey: ['credits', workspaceId.value] })]); }
async function subscribe(plan: Plan) {
  busy.value = true; error.value = ''; notice.value = '';
  try { await request(`${base.value}/subscriptions`, { method: 'POST', body: json({ planId: plan.id, idempotencyKey: crypto.randomUUID() }) }); notice.value = t(plan.tier === 'FREE' ? 'billing.activeRequest' : 'billing.pendingRequest'); await refresh(); }
  catch (cause) { error.value = t(errorKey(cause)); } finally { busy.value = false; }
}
async function cancel() {
  const subscription = current.data.value; if (!subscription) return; busy.value = true; error.value = '';
  try { await request(`${base.value}/subscriptions/${subscription.id}/cancel`, { method: 'POST', body: json({ atPeriodEnd: true }) }); cancelOpen.value = false; await refresh(); }
  catch (cause) { error.value = t(errorKey(cause)); } finally { busy.value = false; }
}
</script>
<template>
  <div class="page stack">
    <PageHeader
      :title="t('billing.title')"
      :description="t('billing.intro')"
    />
    <p
      v-if="error"
      class="field-error"
      role="alert"
    >
      {{ error }}
    </p>
    <p
      v-if="notice"
      class="muted"
      role="status"
    >
      {{ notice }}
    </p>
    <UiState
      v-if="plans.isPending.value || current.isPending.value || role.isPending.value"
      kind="loading"
    />
    <UiState
      v-else-if="plans.error.value || current.error.value || role.error.value"
      kind="error"
      :description="t(errorKey(plans.error.value || current.error.value || role.error.value))"
      retry
      @retry="plans.refetch(); current.refetch(); role.refetch()"
    />
    <template v-else>
      <section
        class="card stack"
        aria-labelledby="current-plan-title"
      >
        <h2 id="current-plan-title">
          {{ t('billing.current') }}
        </h2>
        <p v-if="!current.data.value">
          {{ t('billing.noSubscription') }}
        </p>
        <template v-else>
          <div class="row">
            <strong>{{ current.data.value.plan.name }}</strong><span class="muted">{{ t('billing.state') }}: {{ current.data.value.status }}</span>
          </div>
          <p
            v-if="current.data.value.currentPeriodEnd"
            class="muted"
          >
            {{ t('billing.period') }}: {{ new Date(current.data.value.currentPeriodEnd).toLocaleDateString(locale) }}
          </p>
          <p
            v-if="current.data.value.status === 'INCOMPLETE'"
            role="status"
          >
            {{ t('billing.pending') }}
          </p>
          <UiButton
            v-if="owner && ['ACTIVE', 'INCOMPLETE'].includes(current.data.value.status) && !current.data.value.cancelAtPeriodEnd"
            variant="secondary"
            :disabled="busy"
            @click="cancelOpen = true"
          >
            {{ t(current.data.value.status === 'INCOMPLETE' ? 'billing.cancelRequest' : 'billing.cancel') }}
          </UiButton>
        </template>
      </section>
      <section
        class="stack"
        aria-labelledby="available-plans-title"
      >
        <h2 id="available-plans-title">
          {{ t('billing.plans') }}
        </h2>
        <p
          v-if="!owner"
          class="muted"
        >
          {{ t('billing.ownerOnly') }}
        </p>
        <div class="grid billing-plan-grid">
          <article
            v-for="plan in plans.data.value ?? []"
            :key="plan.id"
            class="card stack"
          >
            <h3>{{ plan.name }}</h3><p>{{ formatMoney(plan.priceMinor, plan.currency) }} / {{ t(plan.cadence === 'YEARLY' ? 'billing.yearly' : 'billing.monthly') }}</p>
            <p class="muted">
              {{ t('billing.credits') }}: {{ number(plan.periodCredits) }} · {{ t('billing.brands') }}: {{ plan.brandLimit }} · {{ t('billing.members') }}: {{ plan.memberLimit }}
            </p>
            <p class="muted">
              {{ t('billing.storage') }}: {{ number(plan.storageLimitBytes) }} B
            </p>
            <UiButton
              v-if="owner && !current.data.value"
              :disabled="busy"
              :loading="busy"
              @click="subscribe(plan)"
            >
              {{ t(plan.tier === 'FREE' ? 'billing.free' : 'billing.request') }}
            </UiButton>
          </article>
        </div>
        <p
          v-if="current.data.value"
          class="muted"
        >
          {{ t('billing.openSubscription') }}
        </p>
      </section>
      <section
        class="card stack"
        aria-labelledby="billing-invoices-title"
      >
        <h2 id="billing-invoices-title">
          {{ t('billing.invoices') }}
        </h2>
        <UiState
          v-if="invoices.isPending.value"
          kind="loading"
        />
        <UiState
          v-else-if="invoices.error.value"
          kind="error"
          :description="t(errorKey(invoices.error.value))"
          retry
          @retry="invoices.refetch()"
        />
        <p
          v-else-if="!invoices.data.value?.items.length"
          class="muted"
        >
          {{ t('billing.emptyInvoices') }}
        </p>
        <div
          v-else
          class="stack"
        >
          <article
            v-for="invoice in invoices.data.value.items"
            :key="invoice.id"
            class="row billing-invoice"
          >
            <span>{{ invoice.plan.name }} · {{ new Date(invoice.createdAt).toLocaleDateString(locale) }}</span>
            <strong>{{ formatMoney(invoice.amountMinor, invoice.currency) }}</strong><span>{{ invoice.status }}</span>
          </article>
        </div>
      </section>
    </template>
    <UiConfirmDialog
      v-model="cancelOpen"
      :title="t(current.data.value?.status === 'INCOMPLETE' ? 'billing.cancelRequest' : 'billing.cancel')"
      :description="t(current.data.value?.status === 'INCOMPLETE' ? 'billing.cancelRequestConfirm' : 'billing.cancelConfirm')"
      :busy="busy"
      @confirm="cancel"
    />
  </div>
</template>
