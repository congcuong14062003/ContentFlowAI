<script setup lang="ts">
import { computed, ref } from 'vue'; import { useI18n } from 'vue-i18n'; import { useRoute, useRouter } from 'vue-router'; 
import { useSession } from '../app/session'; import { usePreferences } from '../app/preferences'; import { queryClient } from '../app/query';
import { errorKey } from '../lib/api'; import { toast } from '../lib/toasts';
import UiButton from '../components/ui/UiButton.vue'; import UiSelect from '../components/ui/UiSelect.vue'; import UiDrawer from '../components/ui/UiDrawer.vue';
import { useQuery } from '@tanstack/vue-query'; import { request } from '../lib/api';
import { useNotificationStream } from '../features/notifications/stream';
import { usePagedQuery } from '../lib/paged-query'; import UiLoadMore from '../components/ui/UiLoadMore.vue';
const { t } = useI18n(); const session = useSession(); const preferences = usePreferences(); const route = useRoute(); const router = useRouter(); const mobile = ref(false); const busy = ref(false);
const noticeCount=useQuery({queryKey:['notifications-count'],queryFn:()=>request<{count:number}>('/notifications/unread-count'),enabled:computed(()=>!!session.user)});
useNotificationStream(computed(()=>session.user?.id));
const workspaces = usePagedQuery<{ items: { role: string; workspace: { id: string; name: string } }[] }>(['workspaces'], '/workspaces', () => !!session.user);
const options = computed(() => (workspaces.data.value?.items ?? []).map((item) => ({ value: item.workspace.id, label: item.workspace.name })));
const activeWorkspace = computed(() => String(route.params.workspaceId ?? route.query.workspaceId ?? ''));
const selected = computed({ get: () => activeWorkspace.value, set: async (value: string | string[]) => { if (typeof value !== 'string') return; await queryClient.cancelQueries(); queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'workspaces' }); await router.push(route.path === '/app/create' ? { path: '/app/create', query: { workspaceId: value } } : `/w/${value}/settings`); } });
const links = computed(() => route.meta.admin ? [{ to: '/admin', label: t('nav.admin') }, { to: '/workspaces', label: t('nav.workspaces') }] : [{ to: activeWorkspace.value ? `/app/create?workspaceId=${activeWorkspace.value}` : '/app/create', label: t('generator.title') }, { to: '/workspaces', label: t('nav.workspaces') }, { to: '/settings', label: t('nav.settings') }, ...(activeWorkspace.value ? [{ to: `/w/${activeWorkspace.value}/campaigns`, label: t('campaign.title') }, { to: `/w/${activeWorkspace.value}/calendar`, label: t('calendar.title') }, { to: `/w/${activeWorkspace.value}/content`, label: t('content.library') }, { to: `/w/${activeWorkspace.value}/media`, label: t('nav.media') }, { to: `/w/${activeWorkspace.value}/brands`, label: t('catalog.brands') }, { to: `/w/${activeWorkspace.value}/products`, label: t('catalog.products') }, { to: `/w/${activeWorkspace.value}/credits`, label: t('credits.title') }, { to: `/w/${activeWorkspace.value}/billing`, label: t('billing.title') }, { to: `/w/${activeWorkspace.value}/support`, label: t('support.title') }, { to: `/w/${activeWorkspace.value}/activity`, label: t('team.activity') }, { to: `/w/${activeWorkspace.value}/settings`, label: t('nav.workspace') }] : []), ...(session.user?.systemRole === 'SUPER_ADMIN' ? [{ to: '/admin', label: t('nav.admin') }] : [])]);
async function logout() { busy.value = true; try { await session.logout(); await router.push('/login'); } catch (error) { toast(t(errorKey(error))); } finally { busy.value = false; } }
</script>
<template>
  <a
    href="#main"
    class="skip"
  >{{ t('common.skip') }}</a>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">
        ✦ ContentFlow <span>AI</span>
      </div><nav
        class="nav"
        :aria-label="t('common.menu')"
      >
        <RouterLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
        >{{ link.label }}</RouterLink>
      </nav><p
        class="muted"
        style="margin-top: 3rem"
      >
        {{ t('brand.secure') }}
      </p>
    </aside>
    <div style="min-width: 0">
      <div class="topbar">
        <div class="row">
          <UiButton
            class="mobile-menu"
            variant="secondary"
            :aria-label="t('common.menu')"
            @click="mobile = true"
          >
            ☰
          </UiButton><nav
            :aria-label="t('common.menu')"
            class="muted"
          >
            {{ t(route.meta.title as string || 'nav.workspaces') }}
          </nav>
        </div><div class="row">
          <RouterLink
            to="/notifications"
            class="control"
          >{{ t('notifications.title') }} ({{ noticeCount.data.value?.count ?? 0 }})</RouterLink>
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
          /><UiButton
            variant="secondary"
            :loading="busy"
            @click="logout"
          >
            {{ t('nav.logout') }}
          </UiButton>
        </div>
      </div>
      <div
        v-if="options.length"
        class="workspace-context"
      >
        <UiSelect
          v-model="selected"
          :label="t('nav.workspaces')"
          :options="options"
        />
        <UiLoadMore
          :has-more="workspaces.hasNextPage.value"
          :busy="workspaces.isFetchingNextPage.value"
          @next="workspaces.fetchNextPage()"
        />
      </div>
      <main
        id="main"
        class="app-main"
      >
        <div class="app-content">
          <RouterView />
        </div>
      </main>
    </div>
  </div>
  <UiDrawer
    v-model="mobile"
    :title="t('common.menu')"
  >
    <nav class="nav">
      <RouterLink
        v-for="link in links"
        :key="link.to"
        :to="link.to"
        @click="mobile = false"
      >{{ link.label }}</RouterLink>
    </nav>
  </UiDrawer>
</template>
