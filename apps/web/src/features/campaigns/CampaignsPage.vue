<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { request, json, errorKey } from '../../lib/api';
import { usePagedQuery } from '../../lib/paged-query';
import { queryClient } from '../../app/query';
import PageHeader from '../../components/PageHeader.vue';
import UiButton from '../../components/ui/UiButton.vue';
import UiInput from '../../components/ui/UiInput.vue';
import UiSelect from '../../components/ui/UiSelect.vue';
import UiState from '../../components/ui/UiState.vue';
import UiLoadMore from '../../components/ui/UiLoadMore.vue';
import type { BrandRecord } from '../../../../../packages/shared/src/catalog';
const route=useRoute(); const router=useRouter(); const {t}=useI18n(); const w=computed(()=>String(route.params.workspaceId));
interface Campaign { id:string; name:string; objective:string; status:string; version:number; brandId:string|null; startsAt:string|null; endsAt:string|null; _count:{contents:number} }
const campaigns=usePagedQuery<{items:Campaign[]}>(()=>['campaigns',w.value],()=>`/workspaces/${w.value}/campaigns`);
const brands=usePagedQuery<{items:BrandRecord[]}>(()=>['campaign-brands',w.value],()=>`/workspaces/${w.value}/brands`);
const workspace=usePagedQuery<{items:{role:string;workspace:{id:string}}[]}>(['workspaces'],'/workspaces');
const role=computed(()=>workspace.data.value?.items.find(item=>item.workspace.id===w.value)?.role);
const canWrite=computed(()=>!!role.value&&role.value!=='VIEWER');
const name=ref(''),objective=ref(''),audiences=ref(''),brandId=ref(''),startsAt=ref(''),endsAt=ref(''),busy=ref(false),error=ref('');
function asUtc(value:string){return value?`${value}T00:00:00Z`:undefined;}
async function create(){busy.value=true;error.value='';try{const campaign=await request<Campaign>(`/workspaces/${w.value}/campaigns`,{method:'POST',body:json({name:name.value,objective:objective.value,audiences:audiences.value.split('\n').map(x=>x.trim()).filter(Boolean),brandId:brandId.value||undefined,startsAt:asUtc(startsAt.value),endsAt:asUtc(endsAt.value),status:'PLANNED'})});await queryClient.invalidateQueries({queryKey:['campaigns',w.value]});await router.push(`/w/${w.value}/campaigns/${campaign.id}`);}catch(cause){error.value=t(errorKey(cause));}finally{busy.value=false;}}
</script>
<template>
  <div class="page campaign-page stack">
    <PageHeader
      :title="t('campaign.title')"
      :description="t('campaign.description')"
    />
    <div class="campaign-index-grid">
      <section
        class="stack"
        :aria-label="t('campaign.title')"
      >
        <UiState
          v-if="campaigns.isPending.value"
          kind="loading"
        />
        <UiState
          v-else-if="campaigns.error.value"
          kind="error"
          :retry="true"
          @retry="campaigns.refetch()"
        />
        <UiState
          v-else-if="!campaigns.data.value?.items.length"
          kind="empty"
          :description="t('campaign.emptyCampaigns')"
        />
        <RouterLink
          v-for="campaign in campaigns.data.value?.items??[]"
          :key="campaign.id"
          class="card campaign-list-item"
          :to="`/w/${w}/campaigns/${campaign.id}`"
        >
          <div class="campaign-section-title"><h2>{{ campaign.name }}</h2><span class="campaign-version">{{ t(`campaign.state_${campaign.status}`) }}</span></div>
          <p class="muted">{{ campaign.objective || t('campaign.noObjective') }}</p>
          <span class="campaign-item-count">{{ campaign._count.contents }} {{ t('campaign.items') }} <span aria-hidden="true">→</span></span>
        </RouterLink>
        <UiLoadMore
          :has-more="!!campaigns.hasNextPage.value"
          :busy="campaigns.isFetchingNextPage.value"
          @next="campaigns.fetchNextPage()"
        />
      </section>
      <form
        v-if="canWrite"
        class="card stack campaign-form campaign-create"
        @submit.prevent="create"
      >
        <div>
          <p class="eyebrow">
            {{ t('campaign.details') }}
          </p><h2>{{ t('campaign.new') }}</h2>
        </div><UiInput
          v-model="name"
          :label="t('campaign.name')"
          required
          maxlength="150"
        /><UiInput
          v-model="objective"
          :label="t('campaign.objective')"
          maxlength="2000"
        />
        <label class="field">{{ t('campaign.audiences') }}<textarea
          v-model="audiences"
          class="control"
          rows="3"
          maxlength="2000"
        /></label>
        <UiSelect
          v-model="brandId"
          :label="t('campaign.brand')"
          :options="[{value:'',label:t('campaign.noBrand')},...(brands.data.value?.items??[]).map(item=>({value:item.id,label:item.name}))]"
        />
        <div class="row">
          <UiInput
            v-model="startsAt"
            :label="t('campaign.startUtc')"
            type="date"
          /><UiInput
            v-model="endsAt"
            :label="t('campaign.endUtc')"
            type="date"
          />
        </div>
        <p
          v-if="error"
          role="alert"
        >
          {{ error }}
        </p><UiButton
          type="submit"
          :loading="busy"
        >
          {{ t('campaign.create') }}
        </UiButton>
      </form>
    </div>
  </div>
</template>
