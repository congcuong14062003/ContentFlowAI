<script setup lang="ts">
import { computed, ref } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { useRouter } from 'vue-router';
import { usePagedQuery } from '../../lib/paged-query';
import { request, json, errorKey } from '../../lib/api';
import { queryClient } from '../../app/query';
import { useI18n } from 'vue-i18n';
import UiLoadMore from '../../components/ui/UiLoadMore.vue';
type Notice={id:string;workspaceId:string|null;eventType:string;title:string;body:string;url:string;readAt:string|null;archivedAt:string|null;createdAt:string};
const {t}=useI18n();const router=useRouter();const filter=ref<'all'|'unread'|'archived'>('all');const busy=ref(false);const error=ref('');
const items=usePagedQuery<{items:Notice[];nextCursor:string|null}>(()=>['notifications',filter.value],()=>`/notifications?filter=${filter.value}`);
const count=useQuery({queryKey:['notifications-count'],queryFn:()=>request<{count:number}>('/notifications/unread-count')});
const preferences=useQuery({queryKey:['notification-preferences'],queryFn:()=>request<{emailEnabled:boolean;mutedTypes:string[];lowCreditThreshold:string|null}>('/notifications/preferences')});
const email=ref(false);const muted=ref<string[]>([]);const lowCredit=ref('');
const events=['TEAM_INVITATION','CONTENT_REVIEW_REQUESTED','CONTENT_APPROVED','CONTENT_REJECTED','COMMENT_MENTION','CREDIT_LOW','PAYMENT_FAILED','SUBSCRIPTION_EXPIRING','SCHEDULED_REMINDER','PUBLISHING_ERROR','SUPPORT_REPLY','CONTENT_ASSIGNED'];
const ready=computed(()=>preferences.data.value!==undefined);
async function changed(path:string,method:string,body?:unknown){busy.value=true;error.value='';try{await request(path,{method,...body?{body:json(body)}:{}});await Promise.all([queryClient.invalidateQueries({queryKey:['notifications']}),queryClient.invalidateQueries({queryKey:['notifications-count']})]);}catch(cause){error.value=t(errorKey(cause));}finally{busy.value=false;}}
async function open(item:Notice){if(!item.readAt)await changed(`/notifications/${item.id}/read`,'PATCH');if(item.url.startsWith('/')&&!item.url.startsWith('//'))await router.push(item.url);}
async function savePreferences(){await changed('/notifications/preferences','PATCH',{emailEnabled:email.value,mutedTypes:muted.value,...(lowCredit.value?{lowCreditThreshold:lowCredit.value}:{})});await preferences.refetch();}
function toggle(value:string){muted.value=muted.value.includes(value)?muted.value.filter(x=>x!==value):[...muted.value,value];}
import { watch } from 'vue';watch(preferences.data,value=>{if(value){email.value=value.emailEnabled;muted.value=[...value.mutedTypes];lowCredit.value=value.lowCreditThreshold??'';}},{immediate:true});
</script>
<template>
  <div class="page stack">
    <header>
      <h1>Thông báo</h1><p class="muted">
        {{ count.data.value?.count ?? 0 }} chưa đọc · Kết nối realtime sẽ đồng bộ lại từ dữ liệu lưu bền khi nối lại.
      </p>
    </header>
    <p
      v-if="error"
      role="alert"
    >
      {{ error }}
    </p>
    <div
      class="row"
      style="flex-wrap:wrap"
    >
      <label>Lọc <select
        v-model="filter"
        class="control"
      ><option value="all">Tất cả</option><option value="unread">Chưa đọc</option><option value="archived">Đã lưu trữ</option></select></label><button
        class="button"
        :disabled="busy"
        @click="changed('/notifications/read-all','POST')"
      >
        Đánh dấu tất cả đã đọc
      </button>
    </div>
    <p
      v-if="items.isPending.value"
      class="muted"
    >
      Đang tải…
    </p><p
      v-if="items.error.value"
      role="alert"
    >
      {{ t(errorKey(items.error.value)) }}
    </p>
    <p
      v-if="items.data.value&&!items.data.value.items.length"
      class="muted"
    >
      Chưa có thông báo
    </p>
    <article
      v-for="item in items.data.value?.items??[]"
      :key="item.id"
      class="card stack"
    >
      <div class="row">
        <strong>{{ item.title }}</strong><small>{{ new Date(item.createdAt).toLocaleString() }}</small><span v-if="!item.readAt">●</span>
      </div><p>{{ item.body }}</p><div
        class="row"
        style="flex-wrap:wrap"
      >
        <button
          class="button"
          @click="open(item)"
        >
          Mở
        </button><button
          class="button"
          @click="changed(`/notifications/${item.id}/${item.readAt?'unread':'read'}`,'PATCH')"
        >
          {{ item.readAt?'Chưa đọc':'Đã đọc' }}
        </button><button
          class="button"
          @click="changed(`/notifications/${item.id}/${item.archivedAt?'restore':'archive'}`,'PATCH')"
        >
          {{ item.archivedAt?'Khôi phục':'Lưu trữ' }}
        </button><button
          class="button"
          @click="changed(`/notifications/${item.id}/delete`,'PATCH')"
        >
          Xóa
        </button>
      </div>
    </article>
    <UiLoadMore
      :has-more="items.hasNextPage.value"
      :busy="items.isFetchingNextPage.value"
      @next="items.fetchNextPage()"
    />
    <section
      v-if="ready"
      class="card stack"
    >
      <h2>Cài đặt thông báo</h2><label><input
        v-model="email"
        type="checkbox"
      > Gửi email dự phòng khi máy chủ đã cấu hình SMTP</label><p class="muted">
        Ngưỡng credit thấp được đo bằng credit atom. Để trống để tắt cảnh báo.
      </p><label>Ngưỡng credit thấp <input
        v-model="lowCredit"
        class="control"
        inputmode="numeric"
      ></label><p class="muted">
        Tắt các loại sự kiện không muốn nhận:
      </p><div class="grid">
        <label
          v-for="event in events"
          :key="event"
        ><input
          :checked="muted.includes(event)"
          type="checkbox"
          @change="toggle(event)"
        > {{ event }}</label>
      </div><button
        class="button"
        :disabled="busy"
        @click="savePreferences"
      >
        Lưu cài đặt
      </button>
    </section>
  </div>
</template>
