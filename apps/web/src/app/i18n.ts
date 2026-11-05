import { createI18n } from 'vue-i18n'; import vi from '../locales/vi'; import en from '../locales/en';
export const i18n = createI18n({ legacy: false, locale: localStorage.getItem('cf-language') === 'en' ? 'en' : 'vi', fallbackLocale: 'en', messages: { vi, en } });
