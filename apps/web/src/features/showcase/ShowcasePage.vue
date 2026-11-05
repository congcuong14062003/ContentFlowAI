<script setup lang="ts">
import { ref } from 'vue'; import { useI18n } from 'vue-i18n'; import { toast } from '../../lib/toasts'; import { usePreferences } from '../../app/preferences';
import UiButton from '../../components/ui/UiButton.vue'; import UiInput from '../../components/ui/UiInput.vue'; import UiSelect from '../../components/ui/UiSelect.vue'; import UiMultiSelect from '../../components/ui/UiMultiSelect.vue'; import UiDatePicker from '../../components/ui/UiDatePicker.vue'; import UiDialog from '../../components/ui/UiDialog.vue'; import UiDrawer from '../../components/ui/UiDrawer.vue'; import UiTabs from '../../components/ui/UiTabs.vue'; import UiCard from '../../components/ui/UiCard.vue'; import UiState from '../../components/ui/UiState.vue'; import UiSkeleton from '../../components/ui/UiSkeleton.vue'; import UiDataTable from '../../components/ui/UiDataTable.vue'; import UiPagination from '../../components/ui/UiPagination.vue'; import PageHeader from '../../components/PageHeader.vue';
const { t } = useI18n(); const preferences = usePreferences(); const value = ref(''); const date = ref(''); const selected = ref<string | string[]>('dark'); const multiple = ref<string[]>([]); const dialog = ref(false); const drawer = ref(false); const tab = ref('form'); const page = ref(0);
const components = ['Button', 'Input', 'CustomSelect', 'MultiSelect', 'DatePicker', 'Dialog', 'Drawer', 'Tabs', 'Card', 'DataTable', 'Pagination', 'Toast', 'Skeleton', 'EmptyState', 'ErrorState', 'LoadingState', 'ConfirmDialog'];
</script>
<template>
  <div class="page">
    <PageHeader
      :title="t('showcase.title')"
      :description="t('showcase.intro')"
    >
      <UiButton
        variant="secondary"
        @click="preferences.toggleTheme()"
      >
        {{ t('common.theme') }}
      </UiButton>
    </PageHeader><div class="grid">
      <UiCard>
        <h2>{{ t('showcase.actions') }}</h2><div class="row">
          <UiButton @click="dialog = true">
            {{ t('showcase.dialog') }}
          </UiButton><UiButton
            variant="secondary"
            @click="drawer = true"
          >
            {{ t('showcase.drawer') }}
          </UiButton><UiButton @click="toast(t('showcase.notice'))">
            {{ t('showcase.notify') }}
          </UiButton><UiButton disabled>
            {{ t('common.save') }}
          </UiButton><UiButton loading>
            {{ t('common.loading') }}
          </UiButton>
        </div>
      </UiCard><UiCard class="stack">
        <h2>{{ t('showcase.form') }}</h2><UiInput
          v-model="value"
          :label="t('auth.name')"
        /><UiInput
          :label="t('auth.email')"
          :error="t('errors.VALIDATION_ERROR')"
        /><UiSelect
          v-model="selected"
          :label="t('showcase.select')"
          :options="[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'disabled', label: 'Disabled', disabled: true }]"
        /><UiMultiSelect
          v-model="multiple"
          :label="t('showcase.multi')"
          :options="[{ value: 'vi', label: 'Tiếng Việt' }, { value: 'en', label: 'English' }]"
        /><UiDatePicker
          v-model="date"
          :label="t('showcase.date')"
        />
      </UiCard>
    </div><UiCard style="margin-top: 1.5rem">
      <UiTabs
        v-model="tab"
        :label="t('showcase.layouts')"
        :tabs="[{ value: 'form', label: t('showcase.formLayout') }, { value: 'list', label: t('showcase.list') }, { value: 'editor', label: t('showcase.editor') }]"
      >
        <template #form>
          <div class="grid">
            <UiState kind="empty" /><UiState
              kind="error"
              retry
              @retry="toast(t('showcase.notice'))"
            /><div><UiState kind="loading" /><UiSkeleton /></div>
          </div>
        </template><template #list>
          <UiDataTable
            :caption="t('showcase.title')"
            :columns="[{ key: 'name', label: t('showcase.columns') }, { key: 'state', label: t('showcase.status') }]"
            :rows="components.slice(page * 5, page * 5 + 5).map((name, id) => ({ id, name, state: t('showcase.ready') }))"
          /><UiPagination
            :has-next="page < 3"
            :has-previous="page > 0"
            @next="page++"
            @previous="page--"
          />
        </template><template #editor>
          <div class="grid">
            <UiCard><h2>{{ t('showcase.preview') }}</h2><UiSkeleton :lines="6" /></UiCard><UiCard><p>{{ t('showcase.previewDescription') }}</p></UiCard>
          </div>
        </template>
      </UiTabs>
    </UiCard><UiDialog
      v-model="dialog"
      :title="t('showcase.dialog')"
    >
      <p>{{ t('showcase.previewDescription') }}</p><UiInput :label="t('auth.name')" />
    </UiDialog><UiDrawer
      v-model="drawer"
      :title="t('showcase.drawer')"
    >
      <p>{{ t('showcase.previewDescription') }}</p><UiInput :label="t('auth.name')" />
    </UiDrawer>
  </div>
</template>
