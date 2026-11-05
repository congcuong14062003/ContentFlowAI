<script setup lang="ts">defineProps<{ title: string; description?: string }>();</script>
<template>
  <header style="margin-bottom: 2rem">
    <p class="eyebrow">
      ContentFlow AI
    </p><div
      class="row"
      style="justify-content: space-between"
    >
      <div>
        <h1>{{ title }}</h1><p
          v-if="description"
          class="muted"
        >
          {{ description }}
        </p>
      </div><slot />
    </div>
  </header>
</template>
