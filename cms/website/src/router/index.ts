import { createRouter, createWebHistory } from 'vue-router';

/**
 * Dynamic routing: only the donation flow, 404 and 500 are hardcoded.
 * Everything else is resolved from the CMS through the catch-all route —
 * creating a page in the admin instantly creates its URL here.
 */
export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior(to) {
    if (to.hash) return { el: to.hash, behavior: 'smooth' };
    return { top: 0 };
  },
  routes: [
    {
      path: '/donation',
      name: 'donation-list',
      component: () => import('@/views/donation/DonationListView.vue'),
    },
    {
      path: '/donation/:slug',
      name: 'donation-project',
      component: () => import('@/views/donation/DonationProjectView.vue'),
      // Opens with a full-bleed banner, so the page starts at the very top and the header floats over it.
      meta: { underHeader: true },
    },
    {
      path: '/donation/status/:code',
      name: 'donation-status',
      component: () => import('@/views/donation/DonationStatusView.vue'),
    },
    {
      path: '/games',
      name: 'games',
      component: () => import('@/views/game/GamesListView.vue'),
    },
    {
      path: '/game/:slug',
      name: 'game-play',
      component: () => import('@/views/game/GamePlayView.vue'),
    },
    {
      path: '/game/:slug/results',
      name: 'game-results',
      component: () => import('@/views/game/GameResultsView.vue'),
    },
    {
      path: '/tokens',
      name: 'token-check',
      component: () => import('@/views/game/TokenCheckView.vue'),
    },
    {
      path: '/terms',
      name: 'terms',
      component: () => import('@/views/legal/TermsView.vue'),
    },
    {
      path: '/privacy',
      name: 'privacy',
      component: () => import('@/views/legal/PrivacyView.vue'),
    },
    {
      path: '/500',
      name: 'server-error',
      component: () => import('@/views/errors/ServerErrorView.vue'),
    },
    {
      path: '/404',
      name: 'not-found',
      component: () => import('@/views/errors/NotFoundView.vue'),
    },
    {
      // Catch-all: every CMS page, at any depth.
      path: '/:path(.*)*',
      name: 'dynamic-page',
      component: () => import('@/views/DynamicPageView.vue'),
    },
  ],
});
