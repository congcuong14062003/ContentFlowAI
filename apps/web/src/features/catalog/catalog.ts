import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useQuery } from '@tanstack/vue-query';
import { request } from '../../lib/api';
export type { BrandRecord, ProductRecord, BrandKitContext, CatalogAssetRecord } from '../../../../../packages/shared/src/catalog';
export { emptyBrandKit } from '../../../../../packages/shared/src/catalog';
export const lines = (text: string) => text.split('\n').map(s => s.trim()).filter(Boolean);
export function useCatalogWorkspace() {
  const route = useRoute(); const workspaceId = computed(() => String(route.params.workspaceId));
  const base = computed(() => `/workspaces/${workspaceId.value}`);
  const workspace = useQuery({ queryKey: computed(() => ['catalog-workspace', workspaceId.value]), queryFn: () => request<{ role: string; name: string }>(base.value) });
  const canWrite = computed(() => !!workspace.data.value && workspace.data.value.role !== 'VIEWER');
  const canManage = computed(() => ['OWNER', 'ADMIN'].includes(workspace.data.value?.role ?? ''));
  return { route, workspaceId, base, workspace, canWrite, canManage };
}
