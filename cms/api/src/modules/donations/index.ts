import { z } from 'zod';
import { Router } from 'express';
import ExcelJS from 'exceljs';
import { BaseController, ok } from '../../core/base/BaseController.js';
import { donationService, DonationService } from './donations.service.js';
import { authenticate } from '../../core/middleware/authenticate.js';
import { authorize } from '../../core/middleware/authorize.js';
import { validate } from '../../core/middleware/validate.js';
import { audit } from '../../core/middleware/audit.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { parseListQuery } from '../../core/utils/pagination.js';
import { PERMISSIONS } from '@cms/shared';
import type { FeatureModule } from '../../core/modules.js';

const verifySchema = z.object({ note: z.string().max(500).optional() });
const rejectSchema = z.object({ reason: z.string().min(1).max(500) });

class DonationController extends BaseController<any> {
  protected service: DonationService = donationService;
}
const controller = new DonationController();

const router = Router();
router.use(authenticate, audit('donations'));

router.get('/', authorize(PERMISSIONS.DONATIONS_VIEW), asyncHandler(controller.list));
router.get(
  '/dashboard',
  authorize(PERMISSIONS.DONATIONS_VIEW),
  asyncHandler(async (_req, res) => ok(res, await donationService.dashboard())),
);

router.get(
  '/export',
  authorize(PERMISSIONS.DONATIONS_EXPORT),
  asyncHandler(async (req, res) => {
    const format = req.query.format === 'csv' ? 'csv' : 'xlsx';
    const rows = await donationService.exportRows(parseListQuery(req));

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Donations');
    sheet.columns = [
      { header: 'Code', key: 'code', width: 14 },
      { header: 'Project', key: 'project', width: 30 },
      { header: 'Account Name', key: 'accountName', width: 25 },
      { header: 'Amount', key: 'amount', width: 12 },
      { header: 'Currency', key: 'currency', width: 10 },
      { header: 'Transfer Date', key: 'transferDate', width: 14 },
      { header: 'Transfer Time', key: 'transferTime', width: 12 },
      { header: 'Status', key: 'status', width: 16 },
      { header: 'Remark', key: 'remark', width: 30 },
      { header: 'Submitted At', key: 'createdAt', width: 22 },
    ];
    sheet.addRows(rows);
    sheet.getRow(1).font = { bold: true };

    const stamp = new Date().toISOString().slice(0, 10);
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="donations-${stamp}.csv"`);
      await workbook.csv.write(res);
    } else {
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', `attachment; filename="donations-${stamp}.xlsx"`);
      await workbook.xlsx.write(res);
    }
    res.end();
  }),
);

router.get('/:id(\\d+)', authorize(PERMISSIONS.DONATIONS_VIEW), asyncHandler(controller.getById));

router.get(
  '/:id(\\d+)/logs',
  authorize(PERMISSIONS.DONATIONS_VIEW),
  asyncHandler(async (req, res) => ok(res, await donationService.getLogs(Number(req.params.id)))),
);

router.post(
  '/:id(\\d+)/verify',
  authorize(PERMISSIONS.DONATIONS_VERIFY),
  validate({ body: verifySchema }),
  asyncHandler(async (req, res) =>
    ok(res, await donationService.verify(Number(req.params.id), Number(req.auth!.sub), req.body.note), 'Verified'),
  ),
);

router.post(
  '/:id(\\d+)/reject',
  authorize(PERMISSIONS.DONATIONS_VERIFY),
  validate({ body: rejectSchema }),
  asyncHandler(async (req, res) =>
    ok(res, await donationService.reject(Number(req.params.id), Number(req.auth!.sub), req.body.reason), 'Rejected'),
  ),
);

router.delete('/:id(\\d+)', authorize(PERMISSIONS.DONATIONS_DELETE), asyncHandler(controller.remove));

export const donationsModule: FeatureModule = { name: 'donations', basePath: '/donations', router };
