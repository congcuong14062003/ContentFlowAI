<script setup lang="ts">
import UiInput from './UiInput.vue';
defineProps<{ label: string; min?: string; max?: string; error?: string }>();
const model = defineModel<string>({ default: '' });
</script>
<template>
  <UiInput
    v-model="model"
    type="date"
    :label="label"
    :min="min"
    :max="max"
    :error="error"
  />
</template>
