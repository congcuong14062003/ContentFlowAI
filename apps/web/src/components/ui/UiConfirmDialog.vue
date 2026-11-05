<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import UiDialog from './UiDialog.vue'; import UiButton from './UiButton.vue';
defineProps<{ title: string; description: string; busy?: boolean }>();
const open = defineModel<boolean>({ default: false }); defineEmits<{ confirm: [] }>(); const { t } = useI18n();
</script>
<template>
  <UiDialog
    v-model="open"
    :title="title"
  >
    <p>{{ description }}</p><div class="row">
      <UiButton
        variant="secondary"
        :disabled="busy"
        @click="open = false"
      >
        {{ t('common.cancel') }}
      </UiButton><UiButton
        variant="danger"
        :loading="busy"
        @click="$emit('confirm')"
      >
        {{ t('common.confirm') }}
      </UiButton>
    </div>
  </UiDialog>
</template>
