import { createRouter, createWebHistory } from 'vue-router'; import { useSession } from './session';
import AuthLayout from '../layouts/AuthLayout.vue'; import AppShell from '../layouts/AppShell.vue';
import { pendingInvitation } from '../features/auth/invitation';
const AuthPage = () => import('../features/auth/AuthPage.vue');
export const router = createRouter({ history: createWebHistory(), routes: [
  { path: '/', redirect: '/workspaces' },
  { path: '/', component: AuthLayout, children: [
    { path: 'login', name: 'login', component: AuthPage }, { path: 'register', name: 'register', component: AuthPage },
    { path: 'forgot-password', name: 'forgot', component: AuthPage }, { path: 'reset-password', name: 'reset', component: AuthPage },
    { path: 'verify-email', name: 'verify', component: AuthPage }, { path: 'resend-verification', name: 'resend', component: AuthPage },
    { path: 'invitations/accept', component: () => import('../features/auth/AcceptInvitation.vue') }
  ] },
  { path: '/', component: AppShell, meta: { authenticated: true }, children: [
    { path: 'workspaces', component: () => import('../features/workspaces/WorkspacesPage.vue'), meta: { title: 'nav.workspaces' } },
    { path: 'onboarding', redirect: '/workspaces' },
    { path: 'app/create', component: () => import('../features/generator/GeneratorPage.vue'), meta: { title: 'generator.title' } },
    { path: 'w/:workspaceId/credits', component: () => import('../features/credits/CreditsPage.vue'), meta: { title: 'credits.title' } },
    { path: 'w/:workspaceId/brands', component: () => import('../features/catalog/CatalogList.vue'), props: { kind: 'brands' }, meta: { title: 'catalog.brands' } },
    { path: 'w/:workspaceId/brands/new', component: () => import('../features/catalog/BrandPage.vue'), meta: { title: 'catalog.createBrand' } },
    { path: 'w/:workspaceId/brands/:id', component: () => import('../features/catalog/BrandPage.vue'), meta: { title: 'catalog.brands' } },
    { path: 'w/:workspaceId/products', component: () => import('../features/catalog/CatalogList.vue'), props: { kind: 'products' }, meta: { title: 'catalog.products' } },
    { path: 'w/:workspaceId/products/new', component: () => import('../features/catalog/ProductPage.vue'), meta: { title: 'catalog.createProduct' } },
    { path: 'w/:workspaceId/products/:id', component: () => import('../features/catalog/ProductPage.vue'), meta: { title: 'catalog.products' } },
    { path: 'w/:workspaceId/settings', component: () => import('../features/workspaces/WorkspaceSettings.vue'), meta: { title: 'nav.workspace' } },
    { path: 'settings', component: () => import('../features/account/AccountPage.vue'), meta: { title: 'nav.settings' } },
    { path: 'admin', component: () => import('../features/admin/AdminPage.vue'), meta: { title: 'nav.admin', admin: true } }
  ] },
  ...(import.meta.env.DEV ? [{ path: '/dev/components', component: () => import('../features/showcase/ShowcasePage.vue') }] : []),
  { path: '/:pathMatch(.*)*', redirect: '/workspaces' }
] });
router.beforeEach(async (to) => { const session = useSession(); await session.bootstrap(); if (to.meta.authenticated && !session.user) return '/login'; if (to.name === 'login' && session.user) return pendingInvitation.value ? '/invitations/accept' : '/workspaces'; if (to.meta.admin && session.user?.systemRole !== 'SUPER_ADMIN') return '/workspaces'; });
