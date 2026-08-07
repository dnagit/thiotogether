/**
 * Central permission catalog. Format: `<resource>.<action>`.
 * The seed script creates one row per entry; RBAC middleware and the admin UI
 * both reference these constants, so a typo cannot silently grant/deny access.
 */
export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard.view',

  USERS_VIEW: 'users.view',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_DELETE: 'users.delete',

  ROLES_VIEW: 'roles.view',
  ROLES_MANAGE: 'roles.manage',

  PAGES_VIEW: 'pages.view',
  PAGES_CREATE: 'pages.create',
  PAGES_UPDATE: 'pages.update',
  PAGES_DELETE: 'pages.delete',
  PAGES_PUBLISH: 'pages.publish',

  MENUS_VIEW: 'menus.view',
  MENUS_MANAGE: 'menus.manage',

  FORMS_VIEW: 'forms.view',
  FORMS_MANAGE: 'forms.manage',
  FORM_SUBMISSIONS_VIEW: 'form-submissions.view',
  FORM_SUBMISSIONS_DELETE: 'form-submissions.delete',

  DONATION_PROJECTS_VIEW: 'donation-projects.view',
  DONATION_PROJECTS_MANAGE: 'donation-projects.manage',

  BANK_ACCOUNTS_VIEW: 'bank-accounts.view',
  BANK_ACCOUNTS_MANAGE: 'bank-accounts.manage',

  DONATIONS_VIEW: 'donations.view',
  DONATIONS_VERIFY: 'donations.verify',
  DONATIONS_EXPORT: 'donations.export',
  DONATIONS_DELETE: 'donations.delete',

  MEDIA_VIEW: 'media.view',
  MEDIA_UPLOAD: 'media.upload',
  MEDIA_DELETE: 'media.delete',

  SETTINGS_VIEW: 'settings.view',
  SETTINGS_MANAGE: 'settings.manage',

  GAMES_VIEW: 'games.view',
  GAMES_MANAGE: 'games.manage',
  /// Separate from GAMES_MANAGE: revealing is irreversible and decides real prizes.
  GAMES_REVEAL: 'games.reveal',
  TOKENS_VIEW: 'tokens.view',
  TOKENS_ADJUST: 'tokens.adjust',

  BIRTHDAY_VIEW: 'birthday.view',
  BIRTHDAY_MANAGE: 'birthday.manage',
  /// Separate from MANAGE: approving decides what the public wall shows.
  BIRTHDAY_MODERATE: 'birthday.moderate',

  AUDIT_LOGS_VIEW: 'audit-logs.view',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

/** Default permission sets per role, used by the seeder. SUPER_ADMIN gets everything. */
export const ROLE_PERMISSION_PRESETS: Record<string, Permission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  ADMIN: ALL_PERMISSIONS.filter((p) => !['roles.manage', 'settings.manage'].includes(p)),
  EDITOR: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PAGES_VIEW,
    PERMISSIONS.PAGES_CREATE,
    PERMISSIONS.PAGES_UPDATE,
    PERMISSIONS.MENUS_VIEW,
    PERMISSIONS.FORMS_VIEW,
    PERMISSIONS.FORM_SUBMISSIONS_VIEW,
    PERMISSIONS.DONATION_PROJECTS_VIEW,
    PERMISSIONS.DONATIONS_VIEW,
    PERMISSIONS.MEDIA_VIEW,
    PERMISSIONS.MEDIA_UPLOAD,
    PERMISSIONS.GAMES_VIEW,
    PERMISSIONS.BIRTHDAY_VIEW,
  ],
};
