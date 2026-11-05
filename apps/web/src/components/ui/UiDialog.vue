<script setup lang="ts">
import { nextTick, ref, useId, watch, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import UiButton from './UiButton.vue';
defineProps<{ title: string; drawer?: boolean }>();
const open = defineModel<boolean>({ default: false }); const element = ref<HTMLDialogElement>(); const id = useId(); const { t } = useI18n();
let previous: HTMLElement | null = null;
function trapFocus(event: KeyboardEvent) {
  if (event.key !== 'Tab') return;
  const items = [...(element.value?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') ?? [])].filter((node) => node.getClientRects().length > 0);
  const first = items[0]; const last = items.at(-1);
  if (!first || !last) { event.preventDefault(); element.value?.focus(); return; }
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
watch(open, async (value) => {
  await nextTick();
  if (value) { previous = document.activeElement as HTMLElement; element.value?.showModal(); }
  else { element.value?.close(); previous?.focus(); }
}, { immediate: true });
onBeforeUnmount(() => { element.value?.close(); previous?.focus(); });
</script>
<template>
  <dialog
    ref="element"
    :aria-labelledby="id"
    :class="{ drawer }"
    @cancel.prevent="open = false"
    @close="open = false"
    @keydown="trapFocus"
    @click="event => { if (event.target === element) { const r = element!.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) open = false; } }"
  >
    <div
      class="row"
      style="justify-content: space-between"
    >
      <h2 :id="id">
        {{ title }}
      </h2><UiButton
        variant="secondary"
        :aria-label="t('common.close')"
        @click="open = false"
      >
        ×
      </UiButton>
    </div>
    <slot />
  </dialog>
</template>
