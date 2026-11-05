<script setup lang="ts">withDefaults(defineProps<{ lines?: number }>(), { lines: 3 });</script>
<template>
  <div
    class="stack"
    aria-hidden="true"
  >
    <div
      v-for="n in lines"
      :key="n"
      class="skeleton"
    />
  </div>
</template>
