<script setup lang="ts">
import { useI18n } from 'vue-i18n'; import UiButton from './UiButton.vue';
defineProps<{ hasMore: boolean; busy: boolean }>(); defineEmits<{ next: [] }>(); const { t } = useI18n();
</script>
<template>
  <UiButton
    v-if="hasMore"
    variant="secondary"
    :loading="busy"
    @click="$emit('next')"
  >
    {{ t('common.next') }}
  </UiButton>
</template>
