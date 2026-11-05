import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import { useInfiniteQuery } from '@tanstack/vue-query';
import { request } from './api';

export function usePagedQuery<T extends { items: unknown[]; nextCursor?: string | null }>(key: MaybeRefOrGetter<readonly unknown[]>, path: MaybeRefOrGetter<string>, enabled: MaybeRefOrGetter<boolean> = true) {
  const query = useInfiniteQuery({
    queryKey: computed(() => toValue(key)), enabled: computed(() => toValue(enabled)),
    initialPageParam: '',
    queryFn: ({ pageParam }) => request<T>(`${toValue(path)}${toValue(path).includes('?') ? '&' : '?'}limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`),
    getNextPageParam: (page) => page.nextCursor || undefined
  });
  const data = computed(() => query.data.value ? { ...query.data.value.pages[0], items: query.data.value.pages.flatMap((page) => page.items) } as T : undefined);
  return { ...query, data };
}
