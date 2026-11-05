<script setup lang="ts">
import { computed, ref, watch } from 'vue'; import { useI18n } from 'vue-i18n';
import type { GeneratorInput, GeneratorTool } from './generator';
import UiInput from '../../components/ui/UiInput.vue'; import UiTextarea from '../../components/ui/UiTextarea.vue'; import UiSelect from '../../components/ui/UiSelect.vue'; import UiMultiSelect from '../../components/ui/UiMultiSelect.vue';
defineProps<{ tool: GeneratorTool; brands: { id: string; name: string }[]; products: { id: string; name: string }[]; disabled: boolean }>();
const model = defineModel<GeneratorInput>({ required: true }); const { t, locale } = useI18n();
const brand = computed({ get: () => model.value.brandId, set: (value: string | string[]) => { if (typeof value === 'string' && value !== model.value.brandId) { model.value.brandId = value; model.value.productIds = []; } } });
const platform = computed({ get: () => model.value.platform, set: (value: string | string[]) => { if (typeof value === 'string') model.value.platform = value; } });
const language = computed({ get: () => model.value.language, set: (value: string | string[]) => { if (value === 'vi' || value === 'en') model.value.language = value; } });
const rawFacts = ref(model.value.verifiedFacts.join('\n')); const lines = (value: string) => value.split('\n').map(line => line.trim()).filter(Boolean);
watch(() => model.value.verifiedFacts, value => { if (JSON.stringify(value) !== JSON.stringify(lines(rawFacts.value))) rawFacts.value = value.join('\n'); });
function facts(value: string) { rawFacts.value = value; model.value.verifiedFacts = lines(value); }
function param(key: string, value: unknown, numeric = false) {
  if (numeric && typeof value === 'number') model.value.params[key] = value;
  else if (typeof value === 'string') model.value.params[key] = numeric ? Number(value) : value;
}
const options = (values: string[]) => values.map(value => ({ value, label: t(`generator.option_${value}`) }));
</script>
<template>
  <fieldset
    class="stack generator-fields"
    :disabled="disabled"
  >
    <legend>{{ tool.name[locale.startsWith('vi') ? 'vi' : 'en'] }}</legend>
    <div class="grid">
      <UiSelect
        v-model="brand"
        :label="t('catalog.brands')"
        :options="brands.map(b => ({ value: b.id, label: b.name }))"
        :disabled="disabled"
      />
      <UiMultiSelect
        v-model="model.productIds"
        :label="t('catalog.products')"
        :options="products.map(p => ({ value: p.id, label: p.name }))"
        :disabled="disabled"
      />
    </div>
    <p
      v-if="tool.id === 'product_description'"
      class="muted"
    >
      {{ t('generator.productRequired') }}
    </p>
    <template
      v-for="field in tool.fields"
      :key="`${tool.id}-${field.key}`"
    >
      <UiTextarea
        v-if="field.type === 'textarea'"
        :model-value="String(model.params[field.key] ?? '')"
        :label="field.label[locale.startsWith('vi') ? 'vi' : 'en']"
        :maxlength="field.maxLength"
        :required="field.required"
        @update:model-value="param(field.key, $event)"
      />
      <UiSelect
        v-else-if="field.type === 'select'"
        :model-value="String(model.params[field.key] ?? '')"
        :label="field.label[locale.startsWith('vi') ? 'vi' : 'en']"
        :options="options(field.options ?? [])"
        :disabled="disabled"
        @update:model-value="param(field.key, $event)"
      />
      <UiInput
        v-else
        :model-value="String(model.params[field.key] ?? '')"
        :type="field.type"
        :label="field.label[locale.startsWith('vi') ? 'vi' : 'en']"
        :required="field.required"
        :maxlength="field.maxLength"
        :min="field.min"
        :max="field.max"
        step="1"
        @update:model-value="param(field.key, $event, field.type === 'number')"
      />
    </template>
    <div class="grid">
      <UiInput
        v-model="model.audience"
        :label="t('catalog.targetAudiences')"
        maxlength="1000"
        required
      /><UiInput
        v-model="model.tone"
        :label="t('catalog.tone')"
        maxlength="200"
        required
      />
    </div>
    <UiTextarea
      v-model="model.objective"
      :label="t('generator.objective')"
      maxlength="1000"
      required
    />
    <div class="grid">
      <UiSelect
        v-model="platform"
        :label="t('generator.platform')"
        :options="options(tool.platforms)"
        :disabled="disabled"
      /><UiSelect
        v-model="language"
        :label="t('common.language')"
        :options="[{ value:'vi',label:'Tiếng Việt' },{ value:'en',label:'English' }]"
        :disabled="disabled"
      /><UiInput
        :model-value="String(model.variations)"
        type="number"
        :label="t('generator.variations')"
        min="1"
        :max="tool.maxVariations"
        step="1"
        required
        @update:model-value="model.variations = Number($event)"
      />
    </div>
    <UiMultiSelect
      v-model="model.variantPlatforms"
      :label="t('generator.variantPlatforms')"
      :options="options(['facebook','instagram','tiktok','linkedin','youtube','website','email'].filter(p => p !== model.platform))"
      :disabled="disabled"
    />
    <UiTextarea
      :model-value="rawFacts"
      :label="t('generator.verifiedFacts')"
      :hint="t('generator.factsHint')"
      maxlength="20000"
      @update:model-value="facts"
    />
  </fieldset>
</template>
