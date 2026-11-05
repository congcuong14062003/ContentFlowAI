<script setup lang="ts">
import { useI18n } from 'vue-i18n'; import UiButton from './UiButton.vue';
defineProps<{ hasNext: boolean; hasPrevious: boolean; busy?: boolean }>(); defineEmits<{ next: []; previous: [] }>(); const { t } = useI18n();
</script>
<template>
  <nav
    :aria-label="t('common.pagination')"
    class="row"
  >
    <UiButton
      variant="secondary"
      :disabled="!hasPrevious || busy"
      @click="$emit('previous')"
    >
      {{ t('common.previous') }}
    </UiButton><UiButton
      variant="secondary"
      :disabled="!hasNext || busy"
      @click="$emit('next')"
    >
      {{ t('common.next') }}
    </UiButton>
  </nav>
</template>
