import { createApp } from 'vue';
import App from './App.vue';
import { createPinia } from 'pinia'; import { VueQueryPlugin } from '@tanstack/vue-query';
import { router } from './app/router'; import { i18n } from './app/i18n'; import { queryClient } from './app/query'; import { useSession } from './app/session';
import './styles/tokens.css';
const app = createApp(App); app.use(createPinia()); app.use(i18n); app.use(VueQueryPlugin, { queryClient }); app.use(router);
window.addEventListener('cf-session-expired', () => { useSession().clear(); void router.replace('/login'); });
window.addEventListener('cf-session-updated', (event) => { const user = (event as CustomEvent).detail; const session = useSession(); const switched = session.user && session.user.id !== user.id; session.user = user; if (switched) { queryClient.clear(); void router.replace('/workspaces'); } });
void router.isReady().then(() => app.mount('#app'));
