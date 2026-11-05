<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { init, use, type EChartsType } from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';
import { useI18n } from 'vue-i18n';
const props = defineProps<{ title: string; options: EChartsOption; empty: boolean }>();
use([BarChart, LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);
const { t } = useI18n(); const element = ref<HTMLElement>(); let chart: EChartsType | undefined; let observer: ResizeObserver | undefined;
onMounted(() => { if (!element.value) return; chart = init(element.value, undefined, { renderer: 'canvas' }); chart.setOption(props.options); observer = new ResizeObserver(() => chart?.resize()); observer.observe(element.value); });
watch(() => props.options, value => chart?.setOption(value, true));
onBeforeUnmount(() => { observer?.disconnect(); chart?.dispose(); });
</script>
<template>
  <section
    class="card admin-chart-card"
    :class="{ 'has-chart': !empty }"
  >
    <h2>{{ title }}</h2>
    <p
      v-if="empty"
      class="muted"
    >
      {{ t('admin.emptyChart') }}
    </p>
    <div
      v-else
      ref="element"
      class="admin-chart"
      role="img"
      :aria-label="title"
    />
  </section>
</template>
