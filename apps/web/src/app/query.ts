import { QueryClient } from '@tanstack/vue-query';
export const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30000, refetchOnWindowFocus: false }, mutations: { retry: false } } });
