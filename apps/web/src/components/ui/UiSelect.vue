<script setup lang="ts">
import { computed, ref, useId } from 'vue';
export interface SelectOption { value: string; label: string; disabled?: boolean }
const props = defineProps<{ label: string; options: SelectOption[]; multiple?: boolean; disabled?: boolean; placeholder?: string }>();
const model = defineModel<string | string[]>({ default: '' });
const id = useId(); const open = ref(false); const active = ref(0); const trigger = ref<HTMLButtonElement>();
const selected = (value: string) => Array.isArray(model.value) ? model.value.includes(value) : model.value === value;
const display = computed(() => props.options.filter((o) => selected(o.value)).map((o) => o.label).join(', ') || props.placeholder || '—');
function choose(index: number) {
  const option = props.options[index]; if (!option || option.disabled) return;
  if (props.multiple) { const values = Array.isArray(model.value) ? model.value : []; model.value = selected(option.value) ? values.filter((v) => v !== option.value) : [...values, option.value]; }
  else { model.value = option.value; open.value = false; }
}
function move(delta: number) {
  for (let step = 0; step < props.options.length; step++) { active.value = (active.value + delta + props.options.length) % props.options.length; if (!props.options[active.value]?.disabled) break; }
}
function key(event: KeyboardEvent) {
  if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape'].includes(event.key)) event.preventDefault();
  if (event.key === 'Escape') { open.value = false; return; }
  if (event.key === 'Tab') { open.value = false; return; }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { if (!open.value) { open.value = true; active.value = props.options.findIndex((o) => !o.disabled); } else move(event.key === 'ArrowDown' ? 1 : -1); }
  else if (event.key === 'Home') { active.value = props.options.findIndex((o) => !o.disabled); open.value = true; }
  else if (event.key === 'End') { active.value = props.options.length; move(-1); open.value = true; }
  else if (event.key === 'Enter' || event.key === ' ') { if (open.value) choose(active.value); else open.value = true; }
  else if (event.key.length === 1) { const index = props.options.findIndex((o) => !o.disabled && o.label.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase())); if (index >= 0) { active.value = index; open.value = true; } }
}
</script>
<template>
  <div
    class="field select"
    @focusout="event => { if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) open = false; }"
  >
    <label
      :id="`${id}-label`"
      @click="trigger?.focus()"
    >{{ label }}</label>
    <button
      :id="id"
      ref="trigger"
      type="button"
      role="combobox"
      class="control select-trigger"
      :disabled="disabled"
      :aria-labelledby="`${id}-label`"
      :aria-expanded="open"
      :aria-controls="`${id}-list`"
      :aria-activedescendant="open ? `${id}-${active}` : undefined"
      aria-haspopup="listbox"
      @click="open = !open"
      @keydown="key"
    >
      {{ display }}<span aria-hidden="true">⌄</span>
    </button>
    <ul
      v-if="open"
      :id="`${id}-list`"
      role="listbox"
      class="options"
      :aria-labelledby="`${id}-label`"
      :aria-multiselectable="multiple || undefined"
    >
      <li
        v-for="(option, index) in options"
        :id="`${id}-${index}`"
        :key="option.value"
        role="option"
        class="option"
        :class="{ active: active === index }"
        :aria-selected="selected(option.value)"
        :aria-disabled="option.disabled || undefined"
        @mousedown.prevent
        @click="choose(index)"
        @pointermove="active = index"
      >
        {{ selected(option.value) ? '✓ ' : '' }}{{ option.label }}
      </li>
    </ul>
  </div>
</template>
