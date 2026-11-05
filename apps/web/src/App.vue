<script setup lang="ts">
import { watch } from 'vue'; import { useI18n } from 'vue-i18n'; import { usePreferences } from './app/preferences'; import { useSession } from './app/session'; import UiToasts from './components/ui/UiToasts.vue';
const preferences = usePreferences(); const session = useSession(); const { locale } = useI18n();
watch(() => preferences.language, (value) => { locale.value = value; }, { immediate: true });
watch(() => session.user?.language, (value) => { if (value === 'vi' || value === 'en') preferences.language = value; }, { immediate: true });
</script>
<template><RouterView :key="$route.name" /><UiToasts /></template>
