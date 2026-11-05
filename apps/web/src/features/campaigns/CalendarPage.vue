<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useQuery } from '@tanstack/vue-query';
import { request, json, errorKey } from '../../lib/api';
import UiSelect from '../../components/ui/UiSelect.vue';
import UiInput from '../../components/ui/UiInput.vue';
import UiButton from '../../components/ui/UiButton.vue';
import UiState from '../../components/ui/UiState.vue';
import PageHeader from '../../components/PageHeader.vue';
const route=useRoute();const {t}=useI18n();const w=computed(()=>String(route.params.workspaceId));
type Item={id:string;title:string;status:string;version:number;scheduledAt:string;brandId:string|null};
const view=ref('month');const anchor=ref(new Date().toISOString().slice(0,10));const error=ref('');const busy=ref('');const reschedule=ref<Record<string,string>>({});
const range=computed(()=>{const date=new Date(`${anchor.value}T00:00:00Z`);if(Number.isNaN(date.getTime()))return null;let start=new Date(date),end=new Date(date);if(view.value==='month'){start=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),1));end=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1));}else if(view.value==='week'){start.setUTCDate(start.getUTCDate()-start.getUTCDay());end=new Date(start);end.setUTCDate(end.getUTCDate()+7);}else{end.setUTCDate(end.getUTCDate()+(view.value==='list'?30:1));}return {from:start.toISOString(),to:end.toISOString()};});
const calendar=useQuery({queryKey:computed(()=>['calendar',w.value,view.value,anchor.value]),queryFn:()=>request<{timezone:string;items:Item[]}>(`/workspaces/${w.value}/calendar?from=${encodeURIComponent(range.value!.from)}&to=${encodeURIComponent(range.value!.to)}`),enabled:computed(()=>!!range.value)});
const workspace=useQuery({queryKey:computed(()=>['calendar-workspace',w.value]),queryFn:()=>request<{role:string}>(`/workspaces/${w.value}`)});
const canWrite=computed(()=>!!workspace.data.value&&workspace.data.value.role!=='VIEWER');
function display(value:string){return new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short',timeZone:calendar.data.value?.timezone||'UTC'}).format(new Date(value));}
async function move(item:Item){if(!reschedule.value[item.id])return;busy.value=item.id;error.value='';try{await request(`/workspaces/${w.value}/content/${item.id}/schedule`,{method:'PATCH',body:json({expectedVersion:item.version,scheduledAt:`${reschedule.value[item.id]}:00Z`})});await calendar.refetch();}catch(cause){error.value=t(errorKey(cause));}finally{busy.value='';}}
async function publish(item:Item){busy.value=item.id;error.value='';try{await request(`/workspaces/${w.value}/content/${item.id}/workflow`,{method:'PATCH',body:json({expectedVersion:item.version,status:'PUBLISHED'})});await calendar.refetch();}catch(cause){error.value=t(errorKey(cause));}finally{busy.value='';}}
</script>
<template>
  <div class="page stack">
    <PageHeader
      :title="t('calendar.title')"
      :description="t('calendar.description')"
    />
    <div class="card row">
      <UiSelect
        v-model="view"
        :label="t('calendar.view')"
        :options="['month','week','day','list'].map(x=>({value:x,label:t(`calendar.${x}`)}))"
      /><UiInput
        v-model="anchor"
        type="date"
        :label="t('calendar.anchor')"
      />
    </div>
    <p class="muted">
      {{ t('calendar.timezone') }}: {{ calendar.data.value?.timezone||'—' }}
    </p><UiState
      v-if="calendar.isPending.value"
      kind="loading"
    /><UiState
      v-else-if="calendar.error.value"
      kind="error"
      :retry="true"
      @retry="calendar.refetch()"
    /><UiState
      v-else-if="!calendar.data.value?.items.length"
      kind="empty"
    />
    <p
      v-if="error"
      role="alert"
    >
      {{ error }}
    </p>
    <div
      v-for="item in calendar.data.value?.items??[]"
      :key="item.id"
      class="card stack"
    >
      <div class="row">
        <RouterLink :to="`/w/${w}/content/${item.id}`"><strong>{{ item.title }}</strong></RouterLink><span>{{ item.status }}</span>
      </div><p>{{ display(item.scheduledAt) }}</p>
      <div
        v-if="canWrite&&item.status==='SCHEDULED'"
        class="row"
      >
        <UiInput
          v-model="reschedule[item.id]"
          type="datetime-local"
          :label="t('calendar.newUtc')"
        /><UiButton
          variant="secondary"
          :loading="busy===item.id"
          :disabled="!reschedule[item.id]"
          @click="move(item)"
        >
          {{ t('calendar.move') }}
        </UiButton><UiButton
          :loading="busy===item.id"
          @click="publish(item)"
        >
          {{ t('calendar.manualPublish') }}
        </UiButton>
      </div>
    </div>
  </div>
</template>
