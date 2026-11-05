<script setup lang="ts">
import { useId } from 'vue';
defineOptions({ inheritAttrs: false });
defineProps<{ label: string; error?: string; type?: string; hint?: string }>();
const model = defineModel<string>({ default: '' });
const id = useId();
</script>
<template>
  <div class="field">
    <label :for="id">{{ label }}</label>
    <input
      :id="id"
      v-model="model"
      v-bind="$attrs"
      :type="type || 'text'"
      class="control"
      :aria-invalid="!!error"
      :aria-describedby="error || hint ? `${id}-message` : undefined"
    >
    <span
      v-if="error || hint"
      :id="`${id}-message`"
      :class="error ? 'field-error' : 'muted'"
    >{{ error || hint }}</span>
  </div>
</template>
