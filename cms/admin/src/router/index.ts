import { createRouter, createWebHistory } from 'vue-router';
import { adminModules } from '@/modules/registry';
import type { Permission } from '@cms/shared';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/auth/LoginView.vue'),
      meta: { public: true, title: 'Login' },
    },
    {
      path: '/forgot-password',
      name: 'forgot-password',
      component: () => import('@/views/auth/ForgotPasswordView.vue'),
      meta: { public: true, title: 'Forgot Password' },
    },
    {
      path: '/reset-password',
      name: 'reset-password',
      component: () => import('@/views/auth/ResetPasswordView.vue'),
      meta: { public: true, title: 'Reset Password' },
    },
    {
      path: '/',
      component: () => import('@/layout/AdminLayout.vue'),
      // Feature module routes are children of the layout — registered from the
      // module registry, never edited by hand here.
      children: [
        ...adminModules.flatMap((m) => m.routes),
        {
          path: 'profile',
          name: 'profile',
          component: () => import('@/views/profile/ProfileView.vue'),
          meta: { title: 'My Profile' },
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
      meta: { public: true, title: 'Not Found' },
    },
  ],
});

router.beforeEach(async (to) => {
  const { useAuthStore } = await import('@/stores/auth');
  const auth = useAuthStore();
  await auth.init();

  if (to.meta.public) return true;
  if (!auth.isAuthenticated) return { name: 'login', query: { redirect: to.fullPath } };

  const permission = to.meta.permission as Permission | undefined;
  if (permission && !auth.can(permission)) return { name: 'dashboard' };
  return true;
});

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title as string} · CMS Admin` : 'CMS Admin';
});
