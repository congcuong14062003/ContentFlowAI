import { defineStore } from 'pinia'; import { ref, watch } from 'vue';
export const usePreferences = defineStore('preferences', () => {
  const stored = localStorage.getItem('cf-theme');
  const theme = ref(stored === 'light' || stored === 'dark' ? stored : window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  const language = ref(localStorage.getItem('cf-language') === 'en' ? 'en' : 'vi');
  watch(theme, (value) => { document.documentElement.dataset.theme = value; localStorage.setItem('cf-theme', value); }, { immediate: true });
  watch(language, (value) => { document.documentElement.lang = value; localStorage.setItem('cf-language', value); }, { immediate: true });
  function toggleTheme() { theme.value = theme.value === 'dark' ? 'light' : 'dark'; }
  return { theme, language, toggleTheme };
});
