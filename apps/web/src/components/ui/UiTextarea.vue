<script setup lang="ts">
import { useId } from 'vue';
defineOptions({ inheritAttrs: false });
defineProps<{ label: string; hint?: string; error?: string }>();
const model = defineModel<string>({ default: '' }); const id = useId();
</script>
<template>
  <div class="field">
    <label :for="id">{{ label }}</label>
    <textarea
      :id="id"
      v-model="model"
      class="control"
      rows="4"
      v-bind="$attrs"
      :aria-invalid="!!error"
      :aria-describedby="hint || error ? `${id}-hint` : undefined"
    />
    <span
      v-if="hint || error"
      :id="`${id}-hint`"
      :class="error ? 'field-error' : 'muted'"
    >{{ error || hint }}</span>
  </div>
</template>
