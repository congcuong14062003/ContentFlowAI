<script setup lang="ts">import { useI18n } from 'vue-i18n'; import { toasts, dismissToast } from '../../lib/toasts'; import UiButton from './UiButton.vue'; const { t } = useI18n();</script>
<template>
  <div
    class="toasts"
    aria-live="polite"
  >
    <div
      v-for="item in toasts"
      :key="item.id"
      class="toast"
    >
      <span>{{ item.message }}</span><UiButton
        variant="secondary"
        :aria-label="t('common.close')"
        @click="dismissToast(item.id)"
      >
        ×
      </UiButton>
    </div>
  </div>
</template>
