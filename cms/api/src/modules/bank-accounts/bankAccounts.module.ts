import { z } from 'zod';
import { Router } from 'express';
import { BaseRepository } from '../../core/base/BaseRepository.js';
import { BaseService } from '../../core/base/BaseService.js';
import { BaseController } from '../../core/base/BaseController.js';
import { crudRouter } from '../../core/base/crudRouter.js';
import { PERMISSIONS } from '@cms/shared';
import type { FeatureModule } from '../../core/modules.js';

export const bankAccountSchema = z.object({
  bankName: z.string().min(1).max(120),
  accountName: z.string().min(1).max(150),
  accountNumber: z.string().min(4).max(40),
  branch: z.string().max(120).nullish(),
  qrCodeUrl: z.string().max(500).nullish(),
  isActive: z.boolean().default(true),
});

class BankAccountRepository extends BaseRepository<any> {
  protected modelName = 'bankAccount';
  protected searchFields = ['bankName', 'accountName', 'accountNumber'];
  protected filterableFields = ['isActive', 'bankName'];
}

class BankAccountService extends BaseService<any> {
  protected repository = new BankAccountRepository();
  protected resourceName = 'Bank account';
}

class BankAccountController extends BaseController<any> {
  protected service = new BankAccountService();
}

const router: Router = crudRouter({
  controller: new BankAccountController(),
  resource: 'bank-accounts',
  permissions: {
    view: PERMISSIONS.BANK_ACCOUNTS_VIEW,
    create: PERMISSIONS.BANK_ACCOUNTS_MANAGE,
    update: PERMISSIONS.BANK_ACCOUNTS_MANAGE,
    delete: PERMISSIONS.BANK_ACCOUNTS_MANAGE,
  },
  createSchema: bankAccountSchema,
  updateSchema: bankAccountSchema.partial(),
});

export const bankAccountsModule: FeatureModule = {
  name: 'bank-accounts',
  basePath: '/bank-accounts',
  router,
};
