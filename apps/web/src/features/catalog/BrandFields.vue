<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { BrandKitContext } from './catalog'; import ListField from './ListField.vue';
import UiInput from '../../components/ui/UiInput.vue'; import UiTextarea from '../../components/ui/UiTextarea.vue'; import UiMultiSelect from '../../components/ui/UiMultiSelect.vue';
defineProps<{ step: number }>(); const kit = defineModel<BrandKitContext>({ required: true }); const { t } = useI18n();
const platforms = ['facebook', 'instagram', 'tiktok', 'linkedin', 'youtube', 'x', 'threads', 'website'].map(value => ({ value, label: value }));
</script>
<template>
  <template v-if="step === 0">
    <UiInput
      v-model="kit.industry"
      :label="t('catalog.industry')"
      maxlength="150"
    />
    <UiTextarea
      v-model="kit.businessDescription"
      :label="t('catalog.businessDescription')"
      maxlength="10000"
    />
    <ListField
      v-model="kit.colors"
      :label="t('catalog.colors')"
      :hint="t('catalog.colorHint')"
    />
  </template>
  <template v-if="step === 1">
    <ListField
      v-model="kit.targetAudiences"
      :label="t('catalog.targetAudiences')"
      :hint="t('catalog.lineHint')"
    />
    <UiTextarea
      v-model="kit.voice"
      :label="t('catalog.voice')"
      maxlength="1000"
    />
    <ListField
      v-for="key in (['tone','keywords','forbiddenPhrases'] as const)"
      :key="key"
      v-model="kit[key]"
      :label="t(`catalog.${key}`)"
      :hint="t('catalog.lineHint')"
    />
  </template>
  <template v-if="step === 2">
    <UiTextarea
      v-model="kit.preferredCta"
      :label="t('catalog.preferredCta')"
      maxlength="1000"
    />
    <ListField
      v-model="kit.languages"
      :label="t('catalog.languages')"
      :hint="t('catalog.languageHint')"
    />
    <UiMultiSelect
      v-model="kit.socialPlatforms"
      :label="t('catalog.socialPlatforms')"
      :options="platforms"
    />
    <UiTextarea
      v-model="kit.aiInstructions"
      :label="t('catalog.aiInstructions')"
      maxlength="10000"
    />
  </template>
</template>
