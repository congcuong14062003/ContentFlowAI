<script setup lang="ts">
import UiDialog from './UiDialog.vue';
defineProps<{ title: string }>(); const model = defineModel<boolean>({ default: false });
</script>
<template>
  <UiDialog
    v-model="model"
    :title="title"
    drawer
  >
    <slot />
  </UiDialog>
</template>
