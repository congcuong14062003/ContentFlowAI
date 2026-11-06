<script setup lang="ts">
import { computed, ref } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import type { EChartsOption } from 'echarts';
import { request, errorKey } from '../../lib/api';
import { useI18n } from 'vue-i18n';
import AdminChart from './AdminChart.vue';
import PageHeader from '../../components/PageHeader.vue';
import UiState from '../../components/ui/UiState.vue';
type Day={day:string;revenueMinor:number;collectedMinor:number;providerCostMicros:number;credits:number;users:number;contributionMicros:number|null};
type Report={window:{currency:string};totals:Record<string,string|number|null>;charts:{daily:Day[];byPlan:{name:string;value:string}[];byProvider:{provider:string;value:string}[];costDaily:{day:string;category:string;value:string}[];costPerWorkspace:{workspaceId:string;name:string;totalKnownMicros:string}[]}};
const {t}=useI18n();
const today=new Date(); const from=ref(new Date(today.getTime()-30*86400000).toISOString().slice(0,10)); const to=ref(today.toISOString().slice(0,10));
const currency=ref('USD'); const workspaceId=ref(''); const planId=ref(''); const provider=ref('');
const costCategory=ref<'STORAGE'|'INFRASTRUCTURE'>('STORAGE');const costAmount=ref('');const costDate=ref(today.toISOString().slice(0,10));const costSource=ref('');const costNote=ref('');const costWorkspace=ref('');const costMessage=ref('');
const params=computed(()=>new URLSearchParams({from:from.value?`${from.value}T00:00:00.000Z`:'',to:!to.value?'':to.value===new Date().toISOString().slice(0,10)?new Date().toISOString():new Date(Date.parse(`${to.value}T00:00:00.000Z`)+86400000).toISOString(),currency:currency.value,...(workspaceId.value?{workspaceId:workspaceId.value}:{}),...(planId.value?{planId:planId.value}:{}),...(provider.value?{provider:provider.value}:{})}).toString());
const query=useQuery({queryKey:computed(()=>['finance',params.value]),queryFn:()=>request<Report>(`/admin/finance?${params.value}`),enabled:computed(()=>!!from.value&&!!to.value&&from.value<=to.value)});
const metrics: [string,string][]=[['recognizedMinor','Doanh thu ghi nhận (đơn vị nhỏ)'],['collectedMinor','Tiền đã thu (đơn vị nhỏ)'],['mrrMinor','MRR hiện tại (đơn vị nhỏ)'],['activePayingCustomers','Workspace trả phí'],['providerCostMicros','Chi phí AI/provider (µUSD)'],['creditUsage','Credit đã dùng'],['grossContributionMicros','Đóng góp trước chi phí hạ tầng (µUSD)'],['refundsMinor','Hoàn tiền'],['storageCostMicros','Chi phí lưu trữ'],['infrastructureCostMicros','Chi phí hạ tầng'],['fullContributionMicros','Đóng góp đầy đủ']];
const axis={textStyle:{color:'#b0bbd5'},grid:{left:64,right:20,top:30,bottom:55},tooltip:{trigger:'axis' as const},xAxis:{type:'category' as const,axisLabel:{color:'#abb8d6'}},yAxis:{type:'value' as const,axisLabel:{color:'#abb8d6'}}};
function series(rows:Day[],field:keyof Day,type:'line'|'bar'='line'):EChartsOption{return{...axis,xAxis:{...axis.xAxis,data:rows.map(r=>r.day)},series:[{type,data:rows.map(r=>Number(r[field]??0))}]};}
function bars(labels:string[],values:number[]):EChartsOption{return{...axis,xAxis:{...axis.xAxis,data:labels},series:[{type:'bar',data:values}]};}
const charts=computed(()=>{const d=query.data.value?.charts;if(!d)return[];return[
  {title:'Doanh thu ghi nhận',empty:!d.daily.some(x=>x.revenueMinor),options:series(d.daily,'revenueMinor')},
  {title:'Xu hướng chi phí AI',empty:!d.daily.some(x=>x.providerCostMicros),options:series(d.daily,'providerCostMicros')},
  {title:'Chi phí lưu trữ và hạ tầng đã nhập',empty:!d.costDaily.length,options:bars([...new Set(d.costDaily.map(x=>x.day.slice(0,10)))],[...new Set(d.costDaily.map(x=>x.day.slice(0,10)))].map(day=>d.costDaily.filter(x=>x.day.startsWith(day)).reduce((n,x)=>n+Number(x.value),0)))},
  {title:'Doanh thu hóa đơn theo gói',empty:!d.byPlan.length,options:bars(d.byPlan.map(x=>x.name),d.byPlan.map(x=>Number(x.value)))},
  {title:'Chi phí theo provider',empty:!d.byProvider.length,options:{tooltip:{trigger:'item'},series:[{type:'pie',radius:['40%','70%'],data:d.byProvider.map(x=>({name:x.provider,value:Number(x.value)}))}]} as EChartsOption},
  {title:'Đóng góp theo tháng (µUSD)',empty:!d.daily.some(x=>x.contributionMicros!==null),options:bars([...new Set(d.daily.map(x=>x.day.slice(0,7)))],[...new Set(d.daily.map(x=>x.day.slice(0,7)))].map(m=>d.daily.filter(x=>x.day.startsWith(m)).reduce((n,x)=>n+(x.contributionMicros??0),0)))},
  {title:'Người dùng mới và doanh thu',empty:!d.daily.some(x=>x.users||x.revenueMinor),options:{...axis,xAxis:{...axis.xAxis,data:d.daily.map(x=>x.day)},yAxis:[{type:'value',name:'Người dùng'},{type:'value',name:'Doanh thu',position:'right'}],legend:{textStyle:{color:'#b0bbd5'}},series:[{name:'Người dùng',type:'line',data:d.daily.map(x=>x.users)},{name:'Doanh thu',type:'line',yAxisIndex:1,data:d.daily.map(x=>x.revenueMinor)}]} as EChartsOption},
  {title:'Credit đã dùng',empty:!d.daily.some(x=>x.credits),options:series(d.daily,'credits','bar')}
];});
async function exportCsv(){const blob=await request<Blob>(`/admin/finance/export.csv?${params.value}`,{},true,true);const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='finance.csv';a.click();URL.revokeObjectURL(url);}
async function addCost(){costMessage.value='';try{await request('/admin/finance/costs',{method:'POST',body:JSON.stringify({category:costCategory.value,amountMicros:costAmount.value,incurredAt:`${costDate.value}T00:00:00.000Z`,sourceKey:costSource.value,note:costNote.value,...(costWorkspace.value?{workspaceId:costWorkspace.value}:{})}),headers:{'Content-Type':'application/json'}});costAmount.value='';costSource.value='';costNote.value='';costMessage.value='Đã ghi nhận chi phí';await query.refetch();}catch(error){costMessage.value=t(errorKey(error));}}
</script>
<template>
  <div class="page stack">
    <PageHeader
      title="Financial analytics"
      description="Doanh thu ghi nhận, tiền đã thu và MRR có định nghĩa riêng. Dữ liệu thiếu nguồn được ghi rõ."
    />
    <div
      class="card row"
      style="flex-wrap:wrap"
    >
      <label>Từ ngày <input
        v-model="from"
        type="date"
        class="control"
      ></label><label>Đến ngày (gồm) <input
        v-model="to"
        type="date"
        class="control"
      ></label>
      <label>Tiền tệ <input
        v-model="currency"
        class="control"
        maxlength="3"
      ></label><label>Workspace ID <input
        v-model="workspaceId"
        class="control"
      ></label><label>Plan ID <input
        v-model="planId"
        class="control"
      ></label><label>Provider <input
        v-model="provider"
        class="control"
      ></label>
      <button
        class="button"
        :disabled="!query.data.value"
        @click="exportCsv"
      >
        Export CSV
      </button>
    </div>
    <section class="card stack">
      <h2>Nhập chi phí thực tế (µUSD)</h2>
      <p class="muted">
        Mỗi chứng từ chỉ nhập một lần bằng mã nguồn duy nhất. Để trống workspace cho chi phí chung; chi phí chung không phân bổ vào từng workspace.
      </p>
      <div
        class="row"
        style="flex-wrap:wrap"
      >
        <label>Loại <select
          v-model="costCategory"
          class="control"
        ><option value="STORAGE">Lưu trữ</option><option value="INFRASTRUCTURE">Hạ tầng</option></select></label>
        <label>Số tiền µUSD <input
          v-model="costAmount"
          class="control"
          inputmode="numeric"
        ></label>
        <label>Ngày phát sinh <input
          v-model="costDate"
          type="date"
          class="control"
        ></label>
        <label>Mã chứng từ <input
          v-model="costSource"
          class="control"
        ></label>
        <label>Workspace ID (nếu có) <input
          v-model="costWorkspace"
          class="control"
        ></label>
        <label>Ghi chú <input
          v-model="costNote"
          class="control"
        ></label>
        <button
          class="button"
          :disabled="!costAmount||!costSource||!costNote"
          @click="addCost"
        >
          Ghi nhận
        </button>
      </div>
      <p
        v-if="costMessage"
        role="status"
      >
        {{ costMessage }}
      </p>
    </section>
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
        MRR là ảnh chụp hiện tại. Đóng góp trước chi phí hạ tầng chỉ trừ AI provider; đóng góp đầy đủ chỉ tính khi có dữ liệu nhập cho cả lưu trữ và hạ tầng. Credit chưa dùng không được tính là lợi nhuận. Số tiền đã thu trước Phase 12 dùng mốc updatedAt backfill.
      </p>
      <div class="grid admin-metric-grid">
        <article
          v-for="[key,label] in metrics"
          :key="key"
          class="card admin-metric"
        >
          <p class="muted">
            {{ label }}
          </p><strong>{{ query.data.value.totals[key]===null?'Chưa có dữ liệu':query.data.value.totals[key] }}</strong>
        </article>
      </div>
      <div class="grid admin-chart-grid">
        <AdminChart
          v-for="chart in charts"
          :key="chart.title"
          :title="chart.title"
          :options="chart.options"
          :empty="chart.empty"
        />
      </div>
      <section class="card">
        <h2>Chi phí đã biết theo workspace (µUSD)</h2><p
          v-if="!query.data.value.charts.costPerWorkspace.length"
          class="muted"
        >
          Chưa có dữ liệu
        </p><div
          v-for="item in query.data.value.charts.costPerWorkspace"
          :key="item.workspaceId"
          class="row"
        >
          <span>{{ item.name }}</span><strong>{{ item.totalKnownMicros }}</strong>
        </div>
      </section>
    </template>
  </div>
</template>
