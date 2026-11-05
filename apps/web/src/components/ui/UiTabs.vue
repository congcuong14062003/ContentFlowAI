<script setup lang="ts">
import { useId } from 'vue';
const props = defineProps<{ tabs: { value: string; label: string }[]; label: string }>();
const model = defineModel<string>({ required: true }); const id = useId();
function key(event: KeyboardEvent, index: number) {
  let target: number;
  if (event.key === 'ArrowRight') target = (index + 1) % props.tabs.length;
  else if (event.key === 'ArrowLeft') target = (index - 1 + props.tabs.length) % props.tabs.length;
  else if (event.key === 'Home') target = 0;
  else if (event.key === 'End') target = props.tabs.length - 1;
  else return;
  event.preventDefault(); model.value = props.tabs[target]!.value;
  document.getElementById(`${id}-${target}`)?.focus();
}
</script>
<template>
  <div>
    <div
      role="tablist"
      :aria-label="label"
      class="tabs"
    >
      <button
        v-for="(tab, index) in tabs"
        :id="`${id}-${index}`"
        :key="tab.value"
        type="button"
        role="tab"
        :aria-selected="model === tab.value"
        :aria-controls="`${id}-panel-${tab.value}`"
        :tabindex="model === tab.value ? 0 : -1"
        @click="model = tab.value"
        @keydown="key($event, index)"
      >
        {{ tab.label }}
      </button>
    </div><section
      :id="`${id}-panel-${model}`"
      role="tabpanel"
      :aria-labelledby="`${id}-${tabs.findIndex(tab => tab.value === model)}`"
      tabindex="0"
    >
      <slot :name="model" />
    </section>
  </div>
</template>
