<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { request, json, errorKey } from '../../lib/api';
import { useI18n } from 'vue-i18n';
type Ticket={id:string;workspaceId:string;subject:string;kind:string;status:string;priority:string;requesterId:string;assigneeId:string|null;createdAt:string;updatedAt:string;messages?:{id:string;authorId:string;body:string;internal:boolean;createdAt:string}[];history?:{id:string;action:string;actorId:string;createdAt:string}[]};
const props=defineProps<{admin:boolean}>();const route=useRoute();const {t}=useI18n();const client=useQueryClient();const workspaceId=computed(()=>String(route.params.workspaceId??''));
const base=computed(()=>props.admin?'/admin/support':`/workspaces/${workspaceId.value}/support`);
const search=ref('');const status=ref('');const priority=ref('');const selected=ref<Ticket|null>(null);const subject=ref('');const body=ref('');const kind=ref<'SUPPORT'|'FEEDBACK'>('SUPPORT');const reply=ref('');const internal=ref(false);const assigneeId=ref('');const busy=ref(false);const message=ref('');
const params=computed(()=>new URLSearchParams({...search.value?{search:search.value}:{},...status.value?{status:status.value}:{},...priority.value?{priority:priority.value}:{}}).toString());
const list=useQuery({queryKey:computed(()=>['support',base.value,params.value]),queryFn:()=>request<Ticket[]>(`${base.value}?${params.value}`)});
const detailPath=(ticket:Ticket)=>props.admin?`${base.value}/${ticket.workspaceId}/${ticket.id}`:`${base.value}/${ticket.id}`;
async function open(ticket:Ticket){selected.value=await request<Ticket>(detailPath(ticket));assigneeId.value=selected.value.assigneeId??'';}
async function mutate(path:string,method:string,payload:unknown){busy.value=true;message.value='';try{await request(path,{method,body:json(payload)});await client.invalidateQueries({queryKey:['support']});if(selected.value)selected.value=await request<Ticket>(detailPath(selected.value));message.value='Đã lưu';}catch(e){message.value=t(errorKey(e));}finally{busy.value=false;}}
async function create(){await mutate(base.value,'POST',{subject:subject.value,body:body.value,kind:kind.value});subject.value='';body.value='';}
async function send(){if(!selected.value)return;await mutate(`${detailPath(selected.value)}/replies`,'POST',{body:reply.value,internal:props.admin&&internal.value});reply.value='';}
async function update(){if(!selected.value)return;await mutate(detailPath(selected.value),'PATCH',{status:selected.value.status,priority:selected.value.priority,...assigneeId.value?{assigneeId:assigneeId.value}:{}});}
</script>
<template>
  <div class="page stack">
    <header>
      <h1>{{ admin?'Quản lý hỗ trợ':'Hỗ trợ & phản hồi' }}</h1><p class="muted">
        {{ admin?'Phân công, trả lời và ghi chú nội bộ.':'Gửi yêu cầu và theo dõi phản hồi của đội hỗ trợ.' }}
      </p>
    </header>
    <p
      v-if="message"
      role="status"
    >
      {{ message }}
    </p>
    <section
      v-if="!admin"
      class="card stack"
    >
      <h2>Tạo yêu cầu</h2><label>Loại <select
        v-model="kind"
        class="control"
      ><option value="SUPPORT">Hỗ trợ</option><option value="FEEDBACK">Góp ý</option></select></label><label>Chủ đề <input
        v-model="subject"
        class="control"
        maxlength="200"
      ></label><label>Nội dung <textarea
        v-model="body"
        class="control"
        rows="4"
        maxlength="10000"
      /></label><button
        class="button"
        :disabled="busy||!subject.trim()||!body.trim()"
        @click="create"
      >
        Gửi
      </button>
    </section>
    <section class="card stack">
      <h2>Danh sách ticket</h2><div
        class="row"
        style="flex-wrap:wrap"
      >
        <input
          v-model="search"
          class="control"
          placeholder="Tìm kiếm"
        ><select
          v-model="status"
          class="control"
        >
          <option value="">
            Mọi trạng thái
          </option><option
            v-for="x in ['OPEN','IN_PROGRESS','WAITING_CUSTOMER','RESOLVED','CLOSED']"
            :key="x"
          >
            {{ x }}
          </option>
        </select><select
          v-model="priority"
          class="control"
        >
          <option value="">
            Mọi mức ưu tiên
          </option><option
            v-for="x in ['LOW','NORMAL','HIGH','URGENT']"
            :key="x"
          >
            {{ x }}
          </option>
        </select>
      </div><p
        v-if="list.isPending.value"
        class="muted"
      >
        Đang tải…
      </p><p
        v-if="list.error.value"
        role="alert"
      >
        {{ t(errorKey(list.error.value)) }}
      </p><p
        v-if="list.data.value&&!list.data.value.length"
        class="muted"
      >
        Chưa có ticket
      </p><button
        v-for="ticket in list.data.value??[]"
        :key="ticket.id"
        class="control"
        style="text-align:left"
        @click="open(ticket)"
      >
        <strong>{{ ticket.subject }}</strong> · {{ ticket.status }} · {{ ticket.priority }} <small v-if="admin">· {{ ticket.workspaceId }}</small>
      </button>
    </section>
    <section
      v-if="selected"
      class="card stack"
    >
      <h2>{{ selected.subject }}</h2><p class="muted">
        {{ selected.kind }} · {{ selected.createdAt }} · {{ selected.workspaceId }}
      </p><div
        v-if="admin"
        class="row"
        style="flex-wrap:wrap"
      >
        <label>Trạng thái <select
          v-model="selected.status"
          class="control"
        ><option
          v-for="x in ['OPEN','IN_PROGRESS','WAITING_CUSTOMER','RESOLVED','CLOSED']"
          :key="x"
        >{{ x }}</option></select></label><label>Ưu tiên <select
          v-model="selected.priority"
          class="control"
        ><option
          v-for="x in ['LOW','NORMAL','HIGH','URGENT']"
          :key="x"
        >{{ x }}</option></select></label><label>Admin ID <input
          v-model="assigneeId"
          class="control"
        ></label><button
          class="button"
          :disabled="busy"
          @click="update"
        >
          Cập nhật
        </button>
      </div><div
        v-for="entry in selected.messages??[]"
        :key="entry.id"
        class="card"
      >
        <small>{{ entry.createdAt }} · {{ entry.authorId }} <strong v-if="entry.internal">· Ghi chú nội bộ</strong></small><p>{{ entry.body }}</p>
      </div><label>{{ admin?'Trả lời / ghi chú':'Trả lời' }} <textarea
        v-model="reply"
        class="control"
        rows="4"
        maxlength="10000"
      /></label><label v-if="admin"><input
        v-model="internal"
        type="checkbox"
      > Ghi chú nội bộ (khách hàng không thấy)</label><button
        class="button"
        :disabled="busy||!reply.trim()"
        @click="send"
      >
        Gửi trả lời
      </button><h3>Lịch sử ticket</h3><p
        v-for="event in selected.history??[]"
        :key="event.id"
        class="muted"
      >
        {{ event.createdAt }} · {{ event.action }} · {{ event.actorId }}
      </p>
    </section>
  </div>
</template>
