<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useQuery } from '@tanstack/vue-query';
import { usePreferences } from '../app/preferences';
import { useSession } from '../app/session';
import { request, errorKey } from '../lib/api';
import { toast } from '../lib/toasts';
import UiButton from '../components/ui/UiButton.vue';
import UiDrawer from '../components/ui/UiDrawer.vue';
import UiSelect from '../components/ui/UiSelect.vue';

const router = useRouter(); const route = useRoute(); const { t } = useI18n(); const preferences = usePreferences(); const session = useSession();
const mobile = ref(false); const search = ref(''); const busy = ref(false);
const links = computed(() => [{ to: '/admin', label: t('admin.overview') }, { to: '/admin/users', label: t('admin.users') }, { to: '/admin/ai', label: t('admin.aiOperations') }, { to: '/admin/finance', label: t('finance.title') }, { to: '/admin/support', label: t('support.title') }, { to: '/notifications', label: t('notifications.title') }, { to: '/workspaces', label: t('admin.backToApp') }]);
const access = useQuery({ queryKey: ['admin-access'], queryFn: () => request<{ allowed: boolean }>('/admin/access') });
const overview = useQuery({ queryKey: ['admin-overview'], queryFn: () => request<{ totals: { aiRequests: number; errorRate: number } }>('/admin/overview'), enabled: computed(() => access.data.value?.allowed === true) });
function submitSearch() { const value = search.value.trim(); void router.push({ path: '/admin/users', query: value ? { search: value } : {} }); }
async function logout() { busy.value = true; try { await session.logout(); await router.push('/login'); } catch (error) { toast(t(errorKey(error))); } finally { busy.value = false; } }
</script>
<template>
  <a
    href="#admin-main"
    class="skip"
  >{{ t('common.skip') }}</a>
  <div class="shell admin-shell">
    <aside class="sidebar admin-sidebar">
      <div class="brand">
        ✦ ContentFlow <span>Admin</span>
      </div>
      <nav
        class="nav"
        :aria-label="t('admin.navigation')"
      >
        <RouterLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
        >{{ link.label }}</RouterLink>
      </nav>
    </aside>
    <div class="admin-main-frame">
      <header class="topbar admin-topbar">
        <div class="row">
          <UiButton
            class="mobile-menu"
            variant="secondary"
            :aria-label="t('common.menu')"
            @click="mobile = true"
          >
            ☰
          </UiButton>
          <strong>{{ t(String(route.meta.title ?? 'admin.overview')) }}</strong>
        </div>
        <form
          class="row admin-search"
          role="search"
          @submit.prevent="submitSearch"
        >
          <label
            class="sr-only"
            for="admin-global-search"
          >{{ t('admin.search') }}</label>
          <input
            id="admin-global-search"
            v-model="search"
            class="control"
            :placeholder="t('admin.search')"
            maxlength="100"
          >
          <UiButton
            type="submit"
            variant="secondary"
          >
            {{ t('admin.searchAction') }}
          </UiButton>
        </form>
        <div class="row">
          <RouterLink
            v-if="overview.data.value && overview.data.value.totals.errorRate > 0"
            to="/admin/ai"
            class="admin-alert"
          >{{ t('admin.aiAlerts') }}</RouterLink>
          <UiButton
            variant="secondary"
            :aria-label="t('common.theme')"
            @click="preferences.toggleTheme()"
          >
            {{ preferences.theme === 'dark' ? '☀' : '☾' }}
          </UiButton>
          <UiSelect
            v-model="preferences.language"
            :label="t('common.language')"
            :options="[{ value: 'vi', label: 'Tiếng Việt' }, { value: 'en', label: 'English' }]"
          />
          <UiButton
            variant="secondary"
            :loading="busy"
            @click="logout"
          >
            {{ t('nav.logout') }}
          </UiButton>
        </div>
      </header>
      <main
        id="admin-main"
        class="admin-content"
      >
        <p
          v-if="access.error.value"
          class="field-error"
          role="alert"
        >
          {{ t(errorKey(access.error.value)) }}
        </p>
        <RouterView v-else-if="access.data.value?.allowed" />
        <p
          v-else
          class="muted"
          role="status"
        >
          {{ t('common.loading') }}
        </p>
      </main>
    </div>
  </div>
  <UiDrawer
    v-model="mobile"
    :title="t('admin.navigation')"
  >
    <nav
      class="nav"
      :aria-label="t('admin.navigation')"
    >
      <RouterLink
        v-for="link in links"
        :key="link.to"
        :to="link.to"
        @click="mobile = false"
      >{{ link.label }}</RouterLink>
    </nav>
  </UiDrawer>
</template>
