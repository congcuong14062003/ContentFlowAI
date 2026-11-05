<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQuery } from '@tanstack/vue-query';
import type { EChartsOption } from 'echarts';
import { request, errorKey } from '../../lib/api';
import PageHeader from '../../components/PageHeader.vue';
import UiState from '../../components/ui/UiState.vue';
import AdminChart from './AdminChart.vue';

interface Daily { day: string; count: string }
interface Usage { day: string; requests: string; cost: string; credits: string }
interface Overview { window: { from: string; to: string }; totals: Record<string, number | string>; queue: { reachable: boolean; waiting: number; active: number; failed: number }; charts: { userGrowth: Daily[]; subscriptionTrend: Daily[]; usageTrend: Usage[]; plans: { planId: string; _count: { id: number }; plan?: { name: string } }[]; providerBreakdown: { provider: string; requests: string; cost: string }[]; generationTrend: { day: string; status: string; count: string }[] } }
const { t, locale } = useI18n(); const query = useQuery({ queryKey: ['admin-overview'], queryFn: () => request<Overview>('/admin/overview') });
const metricKeys = ['totalUsers', 'activeUsers', 'newUsers', 'paidCustomers', 'subscriptions', 'generatedContents', 'aiRequests', 'creditUsage', 'providerCostMicros', 'storageUsageBytes', 'errorRate'] as const;
const labels: Record<string, string> = { providerCostMicros: 'providerCost', storageUsageBytes: 'storageUsage' };
function metric(key: string, value: number | string) { if (key === 'errorRate') return `${new Intl.NumberFormat(locale.value, { style: 'percent', maximumFractionDigits: 1 }).format(Number(value))}`; return BigInt(value).toLocaleString(locale.value); }
const axis = { axisLine: { lineStyle: { color: '#8594b5' } }, axisLabel: { color: '#abb8d6' } };
const style = { textStyle: { color: '#b0bbd5' }, grid: { left: 54, right: 20, top: 24, bottom: 52 }, tooltip: { trigger: 'axis' as const }, xAxis: { ...axis, type: 'category' as const }, yAxis: { ...axis, type: 'value' as const } };
function line(rows: Daily[], color: string): EChartsOption { return { ...style, xAxis: { ...style.xAxis, data: rows.map(row => row.day.slice(0, 10)) }, series: [{ type: 'line', smooth: true, showSymbol: true, symbolSize: 9, areaStyle: { opacity: .12 }, itemStyle: { color }, data: rows.map(row => Number(row.count)) }] }; }
function usage(field: 'requests' | 'cost' | 'credits', type: 'line' | 'bar'): EChartsOption { const rows = query.data.value?.charts.usageTrend ?? []; return { ...style, xAxis: { ...style.xAxis, data: rows.map(row => row.day.slice(0, 10)) }, series: [{ type, itemStyle: { color: '#b7a6ff' }, data: rows.map(row => Number(row[field])) }] }; }
const chartCards = computed(() => { const data = query.data.value?.charts; if (!data) return []; return [
  { title: t('admin.userGrowth'), empty: !data.userGrowth.length, options: line(data.userGrowth, '#b7a6ff') },
  { title: t('admin.subscriptionTrend'), empty: !data.subscriptionTrend.length, options: line(data.subscriptionTrend, '#85e5c6') },
  { title: t('admin.aiCostTrend'), empty: !data.usageTrend.length, options: usage('cost', 'line') },
  { title: t('admin.requestUsage'), empty: !data.usageTrend.length, options: usage('requests', 'bar') },
  { title: t('admin.creditConsumption'), empty: !data.usageTrend.length, options: usage('credits', 'bar') },
  { title: t('admin.plansDistribution'), empty: !data.plans.length, options: { textStyle: { color: '#b0bbd5' }, tooltip: { trigger: 'item' }, series: [{ type: 'pie', radius: ['42%', '72%'], data: data.plans.map(row => ({ name: row.plan?.name ?? row.planId, value: row._count.id })) }] } as EChartsOption },
  { title: t('admin.providerBreakdown'), empty: !data.providerBreakdown.length, options: { ...style, xAxis: { ...style.xAxis, data: data.providerBreakdown.map(row => row.provider) }, series: [{ type: 'bar', data: data.providerBreakdown.map(row => Number(row.requests)) }] } as EChartsOption },
  { title: t('admin.generationTrend'), empty: !data.generationTrend.length, options: { ...style, xAxis: { ...style.xAxis, data: [...new Set(data.generationTrend.map(row => row.day.slice(0, 10)))] }, legend: { textStyle: { color: '#b0bbd5' } }, series: [...new Set(data.generationTrend.map(row => row.status))].map(status => ({ name: status, type: 'bar', stack: 'total', data: [...new Set(data.generationTrend.map(row => row.day.slice(0, 10)))].map(day => Number(data.generationTrend.find(row => row.day.startsWith(day) && row.status === status)?.count ?? 0)) })) } as EChartsOption }
]; });
</script>
<template>
  <div class="page stack">
    <PageHeader
      :title="t('admin.overview')"
      :description="t('admin.dashboardIntro')"
    />
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
    <template v-else-if="query.data.value">
      <p class="muted">
        {{ t('admin.windowHint') }}
      </p>
      <div class="grid admin-metric-grid">
        <article
          v-for="key in metricKeys"
          :key="key"
          class="card admin-metric"
        >
          <p class="muted">
            {{ t(`admin.${labels[key] ?? key}`) }}
          </p><strong>{{ metric(key, query.data.value.totals[key] ?? 0) }}</strong><span
            v-if="key === 'providerCostMicros'"
            class="muted"
          >µUSD</span>
        </article>
        <article class="card admin-metric">
          <p class="muted">
            {{ t('admin.queueHealth') }}
          </p><strong>{{ t(query.data.value.queue.reachable ? 'admin.queueReady' : 'admin.queueUnavailable') }}</strong><span
            v-if="query.data.value.queue.reachable"
            class="muted"
          >{{ t('admin.queueWaiting') }} {{ query.data.value.queue.waiting }} · {{ t('admin.queueActive') }} {{ query.data.value.queue.active }} · {{ t('admin.queueFailed') }} {{ query.data.value.queue.failed }}</span>
        </article>
      </div>
      <div class="grid admin-chart-grid">
        <AdminChart
          v-for="card in chartCards"
          :key="card.title"
          :title="card.title"
          :options="card.options"
          :empty="card.empty"
        />
      </div>
    </template>
  </div>
</template>
