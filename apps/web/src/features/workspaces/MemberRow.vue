<script setup lang="ts">
import { useI18n } from 'vue-i18n'; import UiButton from '../../components/ui/UiButton.vue'; import UiSelect from '../../components/ui/UiSelect.vue';
defineProps<{ member: { userId: string; role: string; user: { displayName: string; email: string } }; actorRole: string; busy: boolean }>();
defineEmits<{ change: [id: string, role: string]; remove: [id: string] }>(); const { t } = useI18n();
</script>
<template>
  <div
    class="card row"
    style="justify-content: space-between; box-shadow: none"
  >
    <div>
      <strong>{{ member.user.displayName }}</strong><div class="muted">
        {{ member.user.email }}
      </div>
    </div><div class="row">
      <template v-if="actorRole === 'OWNER' && member.role !== 'OWNER' || actorRole === 'ADMIN' && !['OWNER', 'ADMIN'].includes(member.role)">
        <UiSelect
          :model-value="member.role"
          :label="t('workspace.role')"
          :disabled="busy"
          :options="(actorRole === 'OWNER' ? ['ADMIN', 'EDITOR', 'VIEWER'] : ['EDITOR', 'VIEWER']).map(value => ({ value, label: t(`roles.${value}`) }))"
          @update:model-value="value => $emit('change', member.userId, String(value))"
        /><UiButton
          variant="secondary"
          :disabled="busy"
          @click="$emit('remove', member.userId)"
        >
          {{ t('common.remove') }}
        </UiButton>
      </template><span
        v-else
        class="muted"
      >{{ t(`roles.${member.role}`) }}</span>
    </div>
  </div>
</template>
