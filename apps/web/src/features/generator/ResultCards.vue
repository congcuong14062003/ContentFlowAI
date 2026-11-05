<script setup lang="ts">
import { ref } from 'vue'; import { useI18n } from 'vue-i18n'; import type { GeneratorRunRecord } from './generator'; import { variationText } from './generator';
import { toast } from '../../lib/toasts'; import UiButton from '../../components/ui/UiButton.vue';
defineProps<{ run: GeneratorRunRecord; editable: boolean; busy: boolean }>(); const emit = defineEmits<{ save: [index: number]; open: [id: string] }>(); const { t } = useI18n(); const copyBusy = ref(false);
async function copy(index: number, run: GeneratorRunRecord) { const value = run.result?.variations[index]; if (!value) return; copyBusy.value = true; try { await navigator.clipboard.writeText(variationText(value)); toast(t('generator.copied')); } catch { toast(t('generator.copyFailed')); } finally { copyBusy.value = false; } }
</script>
<template>
  <section
    v-if="run.result"
    class="stack"
    :aria-label="t('generator.results')"
  >
    <ul
      v-if="run.result.warnings.length"
      class="card"
      role="note"
    >
      <li
        v-for="warning in run.result.warnings"
        :key="warning"
      >
        {{ warning }}
      </li>
    </ul>
    <article
      v-for="(variation, index) in run.result.variations"
      :key="index"
      class="card stack"
    >
      <p class="eyebrow">
        {{ t('generator.variation', { number: index + 1 }) }}
      </p><h2>{{ variation.title }}</h2><p><strong>{{ variation.hook }}</strong></p><p class="generator-copy">
        {{ variation.mainText }}
      </p><p>{{ variation.cta }}</p><p class="muted">
        {{ variation.hashtags.join(' ') }}
      </p>
      <details><summary>{{ t('generator.visualConcept') }}</summary><p>{{ variation.visualConcept }}</p></details>
      <dl
        v-if="variation.email"
        class="catalog-definition"
      >
        <dt>{{ t('generator.subject') }}</dt><dd>{{ variation.email.subject }}</dd><dt>{{ t('generator.preheader') }}</dt><dd>{{ variation.email.preheader }}</dd>
      </dl>
      <div v-if="variation.seo">
        <h3>{{ variation.seo.metaTitle }}</h3><p>{{ variation.seo.metaDescription }}</p><ol>
          <li
            v-for="line in variation.seo.outline"
            :key="line"
          >
            {{ line }}
          </li>
        </ol>
      </div>
      <ol v-if="variation.items">
        <li
          v-for="item in variation.items"
          :key="item.text"
        >
          <strong>{{ item.text }}</strong><p>{{ item.angle }}</p>
        </li>
      </ol>
      <div
        v-for="scene in variation.scenes ?? []"
        :key="scene.start"
      >
        <h3>{{ scene.start }}–{{ scene.end }}s</h3><p>{{ scene.spokenText }}</p><p class="muted">
          {{ scene.visual }}
        </p>
      </div>
      <ol v-if="variation.planEntries">
        <li
          v-for="entry in variation.planEntries"
          :key="entry.day"
        >
          <h3>{{ t('generator.day', { number: entry.day }) }} · {{ t(`generator.option_${entry.platform}`) }}</h3><p>{{ entry.topic }}</p><p class="muted">
            {{ entry.objective }} · {{ entry.format }}
          </p><p>{{ entry.cta }}</p>
        </li>
      </ol>
      <details
        v-for="variant in variation.platformVariants"
        :key="variant.platform"
      >
        <summary>{{ t(`generator.option_${variant.platform}`) }}</summary><h3>{{ variant.title }}</h3><p>{{ variant.hook }}</p><p class="generator-copy">
          {{ variant.mainText }}
        </p><p>{{ variant.cta }}</p><p>{{ variant.hashtags.join(' ') }}</p>
      </details>
      <div class="row">
        <UiButton
          variant="secondary"
          :disabled="copyBusy"
          @click="copy(index, run)"
        >
          {{ t('generator.copy') }}
        </UiButton><UiButton
          v-if="run.drafts.find(d => d.variationIndex === index)"
          variant="secondary"
          :disabled="busy"
          @click="emit('open', run.drafts.find(d => d.variationIndex === index)!.contentId)"
        >
          {{ t('generator.openDraft') }}
        </UiButton><UiButton
          v-else-if="editable"
          :loading="busy"
          @click="emit('save', index)"
        >
          {{ t('generator.save') }}
        </UiButton>
      </div>
    </article>
  </section>
</template>
