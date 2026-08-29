import { createRouter, createWebHistory } from 'vue-router';

declare module 'vue-router' {
  interface RouteMeta {
    /** Chrome to wrap the page in; see `src/layouts`. Absent means the site's own. */
    layout?: 'default' | 'birthday';
    /** Page opens with a full-bleed banner and runs under the transparent site header. */
    underHeader?: boolean;
  }
}

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
      // Declared before the wall so `/birthday/wish` is read as the form rather than as a
      // wall whose slug happens to be "wish". Both take an optional slug, so a site running
      // a single birthday can link to `/birthday` and `/birthday/wish` and never name it.
      path: '/birthday/wish/:slug?',
      name: 'birthday-wish',
      component: () => import('@/views/birthday/BirthdayWishFormView.vue'),
      // A party reached by QR code, not a page of the site: own chrome, see BirthdayLayout.
      meta: { layout: 'birthday' },
    },
    {
      // Also before the wall, and for the same reason as the form above.
      path: '/birthday/cards/:slug?',
      name: 'birthday-cards',
      component: () => import('@/views/birthday/BirthdayCardsView.vue'),
      meta: { layout: 'birthday' },
    },
    {
      path: '/birthday/:slug?',
      name: 'birthday-wall',
      component: () => import('@/views/birthday/BirthdayWallView.vue'),
      meta: { layout: 'birthday' },
    },
    {
      // The list lives in a page built in the CMS — see `ProjectsBlock` — so only the detail
      // needs a route of its own.
      path: '/projects/:slug',
      name: 'project-detail',
      component: () => import('@/views/projects/ProjectDetailView.vue'),
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
