import { ref } from 'vue';
export const toasts = ref<{ id: number; message: string }[]>([]);
let sequence = 0;
export function toast(message: string) { toasts.value.push({ id: ++sequence, message }); }
export function dismissToast(id: number) { toasts.value = toasts.value.filter((item) => item.id !== id); }
