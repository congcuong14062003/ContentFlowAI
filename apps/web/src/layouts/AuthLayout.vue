<script setup lang="ts">import { useI18n } from 'vue-i18n'; import { usePreferences } from '../app/preferences'; import UiButton from '../components/ui/UiButton.vue'; import UiSelect from '../components/ui/UiSelect.vue'; const { t } = useI18n(); const preferences = usePreferences();</script>
<template>
  <div class="auth-layout">
    <section>
      <div class="brand">
        ✦ ContentFlow <span>AI</span>
      </div><p class="eyebrow">
        {{ t('brand.eyebrow') }}
      </p><h1 style="font-size: clamp(2.5rem, 6vw, 4.5rem)">
        {{ t('brand.tagline') }}
      </h1><p class="muted">
        {{ t('brand.description') }}
      </p><div class="row">
        <UiButton
          variant="secondary"
          :aria-label="t('common.theme')"
          @click="preferences.toggleTheme()"
        >
          {{ preferences.theme === 'dark' ? '☀' : '☾' }}
        </UiButton><UiSelect
          v-model="preferences.language"
          :label="t('common.language')"
          :options="[{ value: 'vi', label: 'Tiếng Việt' }, { value: 'en', label: 'English' }]"
        />
      </div>
    </section><main class="card auth-form">
      <RouterView />
    </main>
  </div>
</template>
