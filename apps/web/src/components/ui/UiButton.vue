<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'primary' | 'secondary' | 'danger'; loading?: boolean; type?: 'button' | 'submit' | 'reset'; disabled?: boolean }>(), { variant: 'primary', type: 'button' });
</script>
<template>
  <button
    :type="type"
    class="button"
    :class="variant"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
  >
    <span
      v-if="loading"
      aria-hidden="true"
    >◌</span><slot />
  </button>
</template>
