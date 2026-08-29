import type { RouteRecordRaw } from 'vue-router';
import type { Permission } from '@cms/shared';
import { PERMISSIONS } from '@cms/shared';

/**
 * Admin feature module descriptor. Each feature contributes routes and a
 * sidebar entry. Adding a module = one entry here + a views folder;
 * layout, router and sidebar pick it up automatically.
 */
export interface AdminModule {
  name: string;
  menu?: {
    label: string;
    icon: string; // Element Plus icon component name
    order: number;
    permission?: Permission;
  };
  routes: RouteRecordRaw[];
}

export const adminModules: AdminModule[] = [
  {
    name: 'dashboard',
    menu: { label: 'Dashboard', icon: 'Odometer', order: 0, permission: PERMISSIONS.DASHBOARD_VIEW },
    routes: [
      {
        path: '',
        name: 'dashboard',
        component: () => import('@/views/dashboard/DashboardView.vue'),
        meta: { title: 'Dashboard', permission: PERMISSIONS.DASHBOARD_VIEW },
      },
    ],
  },
  {
    name: 'pages',
    menu: { label: 'Pages', icon: 'Document', order: 1, permission: PERMISSIONS.PAGES_VIEW },
    routes: [
      {
        path: 'pages',
        name: 'pages',
        component: () => import('@/views/pages/PagesListView.vue'),
        meta: { title: 'Pages', permission: PERMISSIONS.PAGES_VIEW },
      },
      {
        path: 'pages/:id/edit',
        name: 'page-edit',
        component: () => import('@/views/pages/PageEditView.vue'),
        meta: { title: 'Edit Page', permission: PERMISSIONS.PAGES_UPDATE },
      },
      {
        path: 'pages/new',
        name: 'page-new',
        component: () => import('@/views/pages/PageEditView.vue'),
        meta: { title: 'New Page', permission: PERMISSIONS.PAGES_CREATE },
      },
      {
        path: 'pages/:id/builder',
        name: 'page-builder',
        component: () => import('@/views/pages/PageBuilderView.vue'),
        meta: { title: 'Page Builder', permission: PERMISSIONS.PAGES_UPDATE },
      },
    ],
  },
  {
    name: 'menus',
    menu: { label: 'Menus', icon: 'Menu', order: 2, permission: PERMISSIONS.MENUS_VIEW },
    routes: [
      {
        path: 'menus',
        name: 'menus',
        component: () => import('@/views/menus/MenusView.vue'),
        meta: { title: 'Menus', permission: PERMISSIONS.MENUS_VIEW },
      },
    ],
  },
  {
    name: 'forms',
    menu: { label: 'Forms', icon: 'Tickets', order: 3, permission: PERMISSIONS.FORMS_VIEW },
    routes: [
      {
        path: 'forms',
        name: 'forms',
        component: () => import('@/views/forms/FormsListView.vue'),
        meta: { title: 'Forms', permission: PERMISSIONS.FORMS_VIEW },
      },
      {
        path: 'forms/:id/builder',
        name: 'form-builder',
        component: () => import('@/views/forms/FormBuilderView.vue'),
        meta: { title: 'Form Builder', permission: PERMISSIONS.FORMS_MANAGE },
      },
      {
        path: 'forms/:id/submissions',
        name: 'form-submissions',
        component: () => import('@/views/forms/FormSubmissionsView.vue'),
        meta: { title: 'Submissions', permission: PERMISSIONS.FORM_SUBMISSIONS_VIEW },
      },
    ],
  },
  {
    name: 'donation-projects',
    menu: { label: 'Donation Projects', icon: 'Present', order: 4, permission: PERMISSIONS.DONATION_PROJECTS_VIEW },
    routes: [
      {
        path: 'donation-projects',
        name: 'donation-projects',
        component: () => import('@/views/donation-projects/ProjectsListView.vue'),
        meta: { title: 'Donation Projects', permission: PERMISSIONS.DONATION_PROJECTS_VIEW },
      },
    ],
  },
  {
    name: 'donations',
    menu: { label: 'Donations', icon: 'Money', order: 5, permission: PERMISSIONS.DONATIONS_VIEW },
    routes: [
      {
        path: 'donations',
        name: 'donations',
        component: () => import('@/views/donations/DonationsListView.vue'),
        meta: { title: 'Donations', permission: PERMISSIONS.DONATIONS_VIEW },
      },
      {
        path: 'donations/dashboard',
        name: 'donations-dashboard',
        component: () => import('@/views/donations/DonationDashboardView.vue'),
        meta: { title: 'Donation Dashboard', permission: PERMISSIONS.DONATIONS_VIEW },
      },
    ],
  },
  {
    name: 'games',
    menu: { label: 'เกมเปิดแผ่นป้าย', icon: 'Grid', order: 7, permission: PERMISSIONS.GAMES_VIEW },
    routes: [
      {
        path: 'games',
        name: 'games',
        component: () => import('@/views/games/GamesListView.vue'),
        meta: { title: 'Games', permission: PERMISSIONS.GAMES_VIEW },
      },
      {
        path: 'games/:id/edit',
        name: 'game-edit',
        component: () => import('@/views/games/GameEditView.vue'),
        meta: { title: 'Edit Game', permission: PERMISSIONS.GAMES_MANAGE },
      },
      {
        path: 'games/:id/results',
        name: 'game-results',
        component: () => import('@/views/games/GameResultsView.vue'),
        meta: { title: 'Game Results', permission: PERMISSIONS.GAMES_VIEW },
      },
    ],
  },
  {
    name: 'projects',
    menu: { label: 'โปรเจกต์', icon: 'Picture', order: 7.4, permission: PERMISSIONS.PROJECTS_VIEW },
    routes: [
      {
        path: 'projects',
        name: 'projects',
        component: () => import('@/views/projects/ProjectsListView.vue'),
        meta: { title: 'โปรเจกต์', permission: PERMISSIONS.PROJECTS_VIEW },
      },
      {
        path: 'projects/:id/edit',
        name: 'project-edit',
        component: () => import('@/views/projects/ProjectEditView.vue'),
        meta: { title: 'ตั้งค่าโปรเจกต์', permission: PERMISSIONS.PROJECTS_MANAGE },
      },
    ],
  },
  {
    name: 'birthday',
    menu: { label: 'อวยพรวันเกิด', icon: 'Sunny', order: 7.5, permission: PERMISSIONS.BIRTHDAY_VIEW },
    routes: [
      {
        path: 'birthday',
        name: 'birthday',
        component: () => import('@/views/birthday/BirthdayListView.vue'),
        meta: { title: 'อวยพรวันเกิด', permission: PERMISSIONS.BIRTHDAY_VIEW },
      },
      {
        path: 'birthday/:id/edit',
        name: 'birthday-edit',
        component: () => import('@/views/birthday/BirthdayEditView.vue'),
        meta: { title: 'ตั้งค่างานวันเกิด', permission: PERMISSIONS.BIRTHDAY_MANAGE },
      },
      {
        path: 'birthday/:id/wishes',
        name: 'birthday-wishes',
        component: () => import('@/views/birthday/BirthdayWishesView.vue'),
        meta: { title: 'คำอวยพร', permission: PERMISSIONS.BIRTHDAY_VIEW },
      },
    ],
  },
  {
    name: 'tokens',
    menu: { label: 'Token', icon: 'Coin', order: 8, permission: PERMISSIONS.TOKENS_VIEW },
    routes: [
      {
        path: 'tokens/accounts',
        name: 'token-accounts',
        component: () => import('@/views/tokens/TokenAccountsView.vue'),
        meta: { title: 'Token Accounts', permission: PERMISSIONS.TOKENS_VIEW },
      },
      {
        path: 'tokens/ledger',
        name: 'token-ledger',
        component: () => import('@/views/tokens/TokenLedgerView.vue'),
        meta: { title: 'Token Ledger', permission: PERMISSIONS.TOKENS_VIEW },
      },
    ],
  },
  {
    name: 'bank-accounts',
    menu: { label: 'Bank Accounts', icon: 'CreditCard', order: 6, permission: PERMISSIONS.BANK_ACCOUNTS_VIEW },
    routes: [
      {
        path: 'bank-accounts',
        name: 'bank-accounts',
        component: () => import('@/views/bank-accounts/BankAccountsView.vue'),
        meta: { title: 'Bank Accounts', permission: PERMISSIONS.BANK_ACCOUNTS_VIEW },
      },
    ],
  },
  {
    name: 'media',
    menu: { label: 'Media Library', icon: 'PictureFilled', order: 9, permission: PERMISSIONS.MEDIA_VIEW },
    routes: [
      {
        path: 'media',
        name: 'media',
        component: () => import('@/views/media/MediaLibraryView.vue'),
        meta: { title: 'Media Library', permission: PERMISSIONS.MEDIA_VIEW },
      },
    ],
  },
  {
    name: 'users',
    menu: { label: 'Users', icon: 'User', order: 10, permission: PERMISSIONS.USERS_VIEW },
    routes: [
      {
        path: 'users',
        name: 'users',
        component: () => import('@/views/users/UsersView.vue'),
        meta: { title: 'Users', permission: PERMISSIONS.USERS_VIEW },
      },
      {
        path: 'roles',
        name: 'roles',
        component: () => import('@/views/users/RolesView.vue'),
        meta: { title: 'Roles & Permissions', permission: PERMISSIONS.ROLES_VIEW },
      },
    ],
  },
  {
    name: 'settings',
    menu: { label: 'Settings', icon: 'Setting', order: 11, permission: PERMISSIONS.SETTINGS_VIEW },
    routes: [
      {
        path: 'settings',
        name: 'settings',
        component: () => import('@/views/settings/SettingsView.vue'),
        meta: { title: 'Settings', permission: PERMISSIONS.SETTINGS_VIEW },
      },
    ],
  },
  {
    name: 'audit-logs',
    menu: { label: 'Audit Logs', icon: 'List', order: 12, permission: PERMISSIONS.AUDIT_LOGS_VIEW },
    routes: [
      {
        path: 'audit-logs',
        name: 'audit-logs',
        component: () => import('@/views/audit-logs/AuditLogsView.vue'),
        meta: { title: 'Audit Logs', permission: PERMISSIONS.AUDIT_LOGS_VIEW },
      },
    ],
  },
];
