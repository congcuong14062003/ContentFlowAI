<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { usePagedQuery } from '../../lib/paged-query';
import { request, json, errorKey } from '../../lib/api';
import { queryClient } from '../../app/query';
import { useSession } from '../../app/session';
import { useI18n } from 'vue-i18n';
import UiLoadMore from '../../components/ui/UiLoadMore.vue';
const props=defineProps<{workspaceId:string;contentId:string;version:number;status:string;ownerId:string|null;assigneeId:string|null;reviewerId:string|null;role:string}>();const emit=defineEmits<{updated:[]}>();
const {t}=useI18n();const session=useSession();const base=computed(()=>`/workspaces/${props.workspaceId}/content/${props.contentId}`);
const manager=computed(()=>['OWNER','ADMIN'].includes(props.role));const canComment=computed(()=>props.role!=='VIEWER');const canReview=computed(()=>manager.value&&props.status==='IN_REVIEW'&&props.reviewerId===session.user?.id);
const members=usePagedQuery<{items:{userId:string;role:string;user:{displayName:string;email:string}}[];nextCursor:string|null}>(()=>['members',props.workspaceId],()=>`/workspaces/${props.workspaceId}/members`);
const comments=usePagedQuery<{items:{id:string;authorId:string;body:string;mentions:string[];createdAt:string}[];nextCursor:string|null}>(()=>['comments',props.workspaceId,props.contentId],()=>`${base.value}/comments`);
const activity=usePagedQuery<{items:{id:string;action:string;actorId:string;createdAt:string;metadata:Record<string,unknown>}[];nextCursor:string|null}>(()=>['activity',props.workspaceId,props.contentId],()=>`${base.value}/activity`);
const assigned=ref('');const owned=ref('');const reviewer=ref('');const reason=ref('');const comment=ref('');const mention=ref('');const busy=ref(false);const error=ref('');
watch(()=>[props.assigneeId,props.ownerId] as const,([a,o])=>{assigned.value=a??'';owned.value=o??'';},{immediate:true});
async function mutate(path:string,method:string,payload:unknown){busy.value=true;error.value='';try{await request(path,{method,body:json(payload)});await Promise.all([queryClient.invalidateQueries({queryKey:['comments',props.workspaceId,props.contentId]}),queryClient.invalidateQueries({queryKey:['activity',props.workspaceId,props.contentId]})]);emit('updated');return true;}catch(cause){error.value=t(errorKey(cause));return false;}finally{busy.value=false;}}
async function assign(){if(assigned.value)await mutate(`${base.value}/assignment`,'PATCH',{expectedVersion:props.version,assigneeId:assigned.value,...(owned.value?{ownerId:owned.value}:{})});}
async function sendComment(){if(await mutate(`${base.value}/comments`,'POST',{body:comment.value,mentions:mention.value?[mention.value]:[]})){comment.value='';mention.value='';}}
async function transition(status:string){if(await mutate(`${base.value}/workflow`,'PATCH',{expectedVersion:props.version,status,...(status==='IN_REVIEW'?{reviewerId:reviewer.value}:{}),...(status==='REJECTED'?{reason:reason.value}:{})})){reason.value='';}}
</script>
<template>
  <section class="card stack">
    <h2>Cộng tác nội dung</h2><p
      v-if="error"
      role="alert"
    >
      {{ error }}
    </p><p class="muted">
      Chủ sở hữu: {{ ownerId??'—' }} · Người thực hiện: {{ assigneeId??'—' }} · Người duyệt: {{ reviewerId??'—' }}
    </p>
    <div
      v-if="manager"
      class="stack"
    >
      <h3>Phân công</h3><label>Người thực hiện <select
        v-model="assigned"
        class="control"
      ><option value="">Chọn thành viên</option><option
        v-for="member in members.data.value?.items??[]"
        :key="member.userId"
        :value="member.userId"
      >{{ member.user.displayName }} · {{ member.role }}</option></select></label><label>Chủ sở hữu <select
        v-model="owned"
        class="control"
      ><option value="">Giữ nguyên</option><option
        v-for="member in members.data.value?.items??[]"
        :key="member.userId"
        :value="member.userId"
      >{{ member.user.displayName }}</option></select></label><button
        class="button"
        :disabled="busy||!assigned"
        @click="assign"
      >
        Lưu phân công
      </button><UiLoadMore
        :has-more="members.hasNextPage.value"
        :busy="members.isFetchingNextPage.value"
        @next="members.fetchNextPage()"
      />
    </div>
    <div
      v-if="canComment&&status==='DRAFT'"
      class="stack"
    >
      <h3>Yêu cầu duyệt</h3><select
        v-model="reviewer"
        class="control"
      >
        <option value="">
          Chọn người duyệt
        </option><option
          v-for="member in members.data.value?.items.filter(x=>['OWNER','ADMIN'].includes(x.role)&&x.userId!==session.user?.id)??[]"
          :key="member.userId"
          :value="member.userId"
        >
          {{ member.user.displayName }}
        </option>
      </select><button
        class="button"
        :disabled="busy||!reviewer"
        @click="transition('IN_REVIEW')"
      >
        Gửi duyệt
      </button>
    </div>
    <div
      v-if="canReview"
      class="stack"
    >
      <h3>Quyết định duyệt</h3><div class="row">
        <button
          class="button"
          :disabled="busy"
          @click="transition('APPROVED')"
        >
          Duyệt
        </button><button
          class="button"
          :disabled="busy||!reason.trim()"
          @click="transition('REJECTED')"
        >
          Từ chối
        </button>
      </div><label>Lý do từ chối <textarea
        v-model="reason"
        class="control"
        maxlength="1000"
      /></label>
    </div>
    <h3>Bình luận</h3><p
      v-if="!comments.data.value?.items.length"
      class="muted"
    >
      Chưa có bình luận
    </p><div
      v-for="item in comments.data.value?.items??[]"
      :key="item.id"
      class="card"
    >
      <small>{{ item.authorId }} · {{ new Date(item.createdAt).toLocaleString() }}</small><p>{{ item.body }}</p>
    </div><UiLoadMore
      :has-more="comments.hasNextPage.value"
      :busy="comments.isFetchingNextPage.value"
      @next="comments.fetchNextPage()"
    /><div
      v-if="canComment"
      class="stack"
    >
      <textarea
        v-model="comment"
        class="control"
        rows="3"
        maxlength="5000"
      /><label>Nhắc tới thành viên <select
        v-model="mention"
        class="control"
      ><option value="">Không nhắc tới</option><option
        v-for="member in members.data.value?.items??[]"
        :key="member.userId"
        :value="member.userId"
      >{{ member.user.displayName }}</option></select></label><button
        class="button"
        :disabled="busy||!comment.trim()"
        @click="sendComment"
      >
        Gửi bình luận
      </button>
    </div>
    <h3>Lịch sử hoạt động</h3><p
      v-if="!activity.data.value?.items.length"
      class="muted"
    >
      Chưa có hoạt động
    </p><p
      v-for="item in activity.data.value?.items??[]"
      :key="item.id"
      class="muted"
    >
      {{ new Date(item.createdAt).toLocaleString() }} · {{ item.action }} · {{ item.actorId }}
    </p><UiLoadMore
      :has-more="activity.hasNextPage.value"
      :busy="activity.isFetchingNextPage.value"
      @next="activity.fetchNextPage()"
    />
  </section>
</template>
