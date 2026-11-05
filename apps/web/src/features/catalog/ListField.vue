<script setup lang="ts">
import { ref, watch } from 'vue'; import UiTextarea from '../../components/ui/UiTextarea.vue'; import { lines } from './catalog';
defineProps<{ label: string; hint?: string }>(); const model = defineModel<string[]>({ required: true });
const raw = ref(model.value.join('\n'));
watch(model, value => { if (JSON.stringify(value) !== JSON.stringify(lines(raw.value))) raw.value = value.join('\n'); });
function update(value: string) { raw.value = value; model.value = lines(value); }
</script>
<template>
  <UiTextarea
    :model-value="raw"
    :label="label"
    :hint="hint"
    maxlength="50000"
    @update:model-value="update"
  />
</template>
