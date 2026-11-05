<script setup lang="ts">
import UiSelect, { type SelectOption } from './UiSelect.vue';
defineProps<{ label: string; options: SelectOption[]; disabled?: boolean }>();
const model = defineModel<string[]>({ default: () => [] });
</script>
<template>
  <UiSelect
    v-model="model"
    :label="label"
    :options="options"
    :disabled="disabled"
    multiple
  />
</template>
