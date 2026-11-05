<script setup lang="ts">
import { useI18n } from 'vue-i18n'; import UiButton from './UiButton.vue';
withDefaults(defineProps<{ kind: 'empty' | 'error' | 'loading'; title?: string; description?: string; retry?: boolean }>(), { title: '', description: '', retry: false }); defineEmits<{ retry: [] }>(); const { t } = useI18n();
</script>
<template>
  <div
    class="state"
    :role="kind === 'error' ? 'alert' : 'status'"
    :aria-busy="kind === 'loading'"
  >
    <h2>{{ title || t(`common.${kind}`) }}</h2><p
      v-if="description"
      class="muted"
    >
      {{ description }}
    </p><UiButton
      v-if="retry"
      variant="secondary"
      @click="$emit('retry')"
    >
      {{ t('common.retry') }}
    </UiButton>
  </div>
</template>
