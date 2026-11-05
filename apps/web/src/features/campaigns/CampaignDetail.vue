<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useQuery } from '@tanstack/vue-query';
import { request,json,errorKey } from '../../lib/api';
import { queryClient } from '../../app/query';
import { usePagedQuery } from '../../lib/paged-query';
import PageHeader from '../../components/PageHeader.vue';
import UiInput from '../../components/ui/UiInput.vue';
import UiSelect from '../../components/ui/UiSelect.vue';
import UiButton from '../../components/ui/UiButton.vue';
import UiState from '../../components/ui/UiState.vue';
const route=useRoute();const {t}=useI18n();const w=computed(()=>String(route.params.workspaceId));const id=computed(()=>String(route.params.id));
interface Item {id:string;title:string;status:string;version:number;scheduledAt:string|null}
interface Campaign {id:string;name:string;objective:string;audiences:string[];status:string;version:number;brandId:string|null;startsAt:string|null;endsAt:string|null;contents:Item[];progress:{total:number;published:number}}
const campaign=useQuery({queryKey:computed(()=>['campaign',w.value,id.value]),queryFn:()=>request<Campaign>(`/workspaces/${w.value}/campaigns/${id.value}`)});
const workspace=useQuery({queryKey:computed(()=>['campaign-workspace',w.value]),queryFn:()=>request<{role:string}>(`/workspaces/${w.value}`)});
const canWrite=computed(()=>!!workspace.data.value&&workspace.data.value.role!=='VIEWER');
const name=ref(''),objective=ref(''),audiences=ref(''),status=ref('PLANNED'),busy=ref(false),error=ref(''),contentId=ref('');
const content=usePagedQuery<{items:Item[]}>(()=>['campaign-content-options',w.value],()=>`/workspaces/${w.value}/content`);
watch(campaign.data,value=>{if(!value)return;name.value=value.name;objective.value=value.objective;audiences.value=value.audiences.join('\n');status.value=value.status;},{immediate:true});
async function save(){if(!campaign.data.value)return;busy.value=true;error.value='';try{await request(`/workspaces/${w.value}/campaigns/${id.value}`,{method:'PUT',body:json({name:name.value,objective:objective.value,audiences:audiences.value.split('\n').map(x=>x.trim()).filter(Boolean),status:status.value,brandId:campaign.data.value.brandId??undefined,startsAt:campaign.data.value.startsAt??undefined,endsAt:campaign.data.value.endsAt??undefined,expectedVersion:campaign.data.value.version})});await campaign.refetch();await queryClient.invalidateQueries({queryKey:['campaigns',w.value]});}catch(cause){error.value=t(errorKey(cause));}finally{busy.value=false;}}
async function attach(){const item=content.data.value?.items.find(x=>x.id===contentId.value);if(!item)return;busy.value=true;error.value='';try{await request(`/workspaces/${w.value}/campaigns/${id.value}/contents`,{method:'POST',body:json({contentId:item.id,expectedVersion:item.version})});await campaign.refetch();contentId.value='';}catch(cause){error.value=t(errorKey(cause));}finally{busy.value=false;}}
</script>
<template>
  <div class="page campaign-page stack">
    <div class="campaign-back">
      <RouterLink :to="`/w/${w}/campaigns`">← {{ t('campaign.title') }}</RouterLink>
    </div>
    <PageHeader
      :title="campaign.data.value?.name||t('campaign.title')"
      :description="campaign.data.value?.objective||t('campaign.description')"
    />
    <UiState
      v-if="campaign.isPending.value"
      kind="loading"
    /><UiState
      v-else-if="campaign.error.value"
      kind="error"
      :retry="true"
      @retry="campaign.refetch()"
    />
    <template v-if="campaign.data.value">
      <div class="campaign-detail-grid">
        <form
          class="card stack campaign-form"
          @submit.prevent="save"
        >
          <div class="campaign-section-title">
            <div>
              <p class="eyebrow">
                {{ t('campaign.details') }}
              </p><h2>{{ t('campaign.editDetails') }}</h2>
            </div><span class="campaign-version">v{{ campaign.data.value.version }}</span>
          </div>
          <UiInput
            v-model="name"
            :label="t('campaign.name')"
            :disabled="!canWrite"
            required
          /><UiInput
            v-model="objective"
            :label="t('campaign.objective')"
            :disabled="!canWrite"
          />
          <label class="field">{{ t('campaign.audiences') }}<textarea
            v-model="audiences"
            class="control"
            rows="3"
            :disabled="!canWrite"
          /></label>
          <UiSelect
            v-model="status"
            :label="t('campaign.status')"
            :disabled="!canWrite"
            :options="['PLANNED','ACTIVE','COMPLETED','ARCHIVED'].map(x=>({value:x,label:t(`campaign.state_${x}`)}))"
          />
          <p
            v-if="error"
            role="alert"
          >
            {{ error }}
          </p><UiButton
            v-if="canWrite"
            type="submit"
            :loading="busy"
          >
            {{ t('campaign.save') }}
          </UiButton>
        </form>
        <aside class="card stack campaign-overview">
          <p class="eyebrow">
            {{ t('campaign.overview') }}
          </p>
          <div><span class="muted">{{ t('campaign.status') }}</span><p><strong>{{ t(`campaign.state_${campaign.data.value.status}`) }}</strong></p></div>
          <div>
            <span class="muted">{{ t('campaign.progressLabel') }}</span><p class="campaign-progress-number">
              {{ campaign.data.value.progress.published }} <span>/ {{ campaign.data.value.progress.total }}</span>
            </p><progress
              :value="campaign.data.value.progress.published"
              :max="Math.max(1,campaign.data.value.progress.total)"
            />
          </div>
          <div><span class="muted">{{ t('campaign.period') }}</span><p>{{ campaign.data.value.startsAt || campaign.data.value.endsAt ? `${campaign.data.value.startsAt ? new Date(campaign.data.value.startsAt).toLocaleDateString() : '—'} → ${campaign.data.value.endsAt ? new Date(campaign.data.value.endsAt).toLocaleDateString() : '—'}` : t('campaign.notSet') }}</p></div>
          <div><span class="muted">{{ t('campaign.targetAudiences') }}</span><p>{{ campaign.data.value.audiences.join(', ') || t('campaign.notSet') }}</p></div>
          <RouterLink
            class="button secondary"
            :to="`/w/${w}/calendar`"
          >{{ t('calendar.title') }} →</RouterLink>
        </aside>
      </div>
      <section class="card stack campaign-content">
        <div class="campaign-section-title">
          <div>
            <p class="eyebrow">
              {{ t('campaign.contentLabel') }}
            </p><h2>{{ t('campaign.items') }}</h2>
          </div><span class="campaign-version">{{ campaign.data.value.contents.length }}</span>
        </div>
        <div
          v-if="!campaign.data.value.contents.length"
          class="campaign-empty"
        >
          <UiState
            kind="empty"
            :description="t('campaign.emptyContent')"
          /><RouterLink
            class="button secondary"
            :to="{path:'/app/create',query:{workspaceId:w}}"
          >{{ t('generator.title') }} →</RouterLink>
        </div>
        <div
          v-for="item in campaign.data.value.contents"
          :key="item.id"
          class="campaign-content-row"
        >
          <RouterLink :to="`/w/${w}/content/${item.id}`">{{ item.title }}</RouterLink><span class="campaign-status">{{ item.status }}</span>
        </div>
        <form
          v-if="canWrite"
          class="campaign-attach"
          @submit.prevent="attach"
        >
          <UiSelect
            v-model="contentId"
            :label="t('campaign.attach')"
            :options="(content.data.value?.items??[]).map(x=>({value:x.id,label:x.title}))"
          /><UiButton
            type="submit"
            :loading="busy"
            :disabled="!contentId"
          >
            {{ t('campaign.attach') }}
          </UiButton>
        </form>
      </section>
    </template>
  </div>
</template>
