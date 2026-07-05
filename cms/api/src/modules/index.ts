import type { FeatureModule } from '../core/modules.js';
import { authModule } from './auth/index.js';
import { usersModule } from './users/users.module.js';
import { rolesModule } from './roles/roles.module.js';
import { pagesModule } from './pages/index.js';
import { menusModule } from './menus/menus.module.js';
import { formsModule } from './forms/forms.module.js';
import { donationProjectsModule } from './donation-projects/donationProjects.module.js';
import { bankAccountsModule } from './bank-accounts/bankAccounts.module.js';
import { donationsModule } from './donations/index.js';
import { mediaModule } from './media/media.module.js';
import { settingsModule } from './settings/settings.module.js';
import { dashboardModule } from './dashboard/dashboard.module.js';
import { auditLogsModule } from './audit-logs/auditLogs.module.js';
import { publicModule } from './public/public.module.js';

/**
 * Module registry. Adding a feature = create a folder in src/modules/<name>/
 * exporting a FeatureModule, then add exactly one line here. Nothing else in
 * the codebase changes.
 */
export const modules: FeatureModule[] = [
  authModule,
  usersModule,
  rolesModule,
  pagesModule,
  menusModule,
  formsModule,
  donationProjectsModule,
  bankAccountsModule,
  donationsModule,
  mediaModule,
  settingsModule,
  dashboardModule,
  auditLogsModule,
  publicModule,
];
