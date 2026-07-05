import { z } from 'zod';
import { Router } from 'express';
import { prisma } from '../../core/database/prisma.js';
import { authenticate } from '../../core/middleware/authenticate.js';
import { authorize } from '../../core/middleware/authorize.js';
import { validate } from '../../core/middleware/validate.js';
import { audit } from '../../core/middleware/audit.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { ok } from '../../core/base/BaseController.js';
import { PERMISSIONS } from '@cms/shared';
import type { FeatureModule } from '../../core/modules.js';

const upsertSchema = z.object({
  settings: z.array(
    z.object({
      key: z.string().min(1).max(120),
      value: z.unknown(),
      group: z.string().max(60).default('general'),
    }),
  ),
});

/** Read all settings as a flat key→value map (optionally one group). */
export async function getSettingsMap(group?: string): Promise<Record<string, unknown>> {
  const rows = await prisma.setting.findMany({ where: group ? { group } : {} });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

const router = Router();
router.use(authenticate, audit('settings'));

router.get(
  '/',
  authorize(PERMISSIONS.SETTINGS_VIEW),
  asyncHandler(async (req, res) => {
    const group = typeof req.query.group === 'string' ? req.query.group : undefined;
    ok(res, await getSettingsMap(group));
  }),
);

router.put(
  '/',
  authorize(PERMISSIONS.SETTINGS_MANAGE),
  validate({ body: upsertSchema }),
  asyncHandler(async (req, res) => {
    const entries = req.body.settings as Array<{ key: string; value: unknown; group: string }>;
    await prisma.$transaction(
      entries.map((s) =>
        prisma.setting.upsert({
          where: { key: s.key },
          create: { key: s.key, value: s.value as any, group: s.group },
          update: { value: s.value as any, group: s.group },
        }),
      ),
    );
    ok(res, await getSettingsMap(), 'Settings saved');
  }),
);

export const settingsModule: FeatureModule = { name: 'settings', basePath: '/settings', router };
