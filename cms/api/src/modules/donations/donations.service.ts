import { Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma.js';
import { BaseRepository } from '../../core/base/BaseRepository.js';
import { BaseService } from '../../core/base/BaseService.js';
import { BadRequestError, NotFoundError } from '../../core/errors/AppError.js';
import { getStorage } from '../../core/storage/index.js';
import { getOcrProvider, parseSlipText } from '../../core/ocr/index.js';
import { safeFileName } from '../../core/middleware/upload.js';
import { config } from '../../core/config/index.js';
import { logger } from '../../core/logger.js';
import { ProjectService } from '../donation-projects/donationProjects.module.js';
import { grantTokensForDonation, revokeTokensForDonation } from '../../core/tokens/tokenService.js';
import { DonationStatus, randomCode, progressPercent } from '@cms/shared';

/** Statuses that entitle a donor to game tokens. */
const APPROVED_STATUSES: string[] = [DonationStatus.VERIFIED, DonationStatus.AUTO_VERIFIED];
/** Statuses that take that entitlement away again. */
const REVOKING_STATUSES: string[] = [
  DonationStatus.REJECTED,
  DonationStatus.CANCELLED,
  DonationStatus.NEEDS_REVIEW,
  DonationStatus.PENDING,
];

const donationInclude = {
  project: { select: { id: true, name: true, slug: true, currency: true } },
  verification: true,
};

class DonationRepository extends BaseRepository<any> {
  protected modelName = 'donation';
  protected searchFields = ['donationCode', 'accountName', 'nickname'];
  protected filterableFields = ['projectId', 'status'];
  protected sortableFields = ['id', 'amount', 'transferDate', 'createdAt', 'status'];
  protected defaultInclude = donationInclude;
}

export class DonationService extends BaseService<any> {
  protected repository = new DonationRepository();
  protected resourceName = 'Donation';

  /**
   * Public flow: store the slip, create the donation as PENDING, then run OCR
   * asynchronously — the donor gets an instant response while verification
   * happens in the background.
   */
  async submit(
    input: {
      projectId: number;
      nickname: string;
      accountName: string;
      contactInfo: string;
      amount: number;
      transferDate: string;
      transferTime: string;
      remark?: string;
    },
    slip: { buffer: Buffer; mimetype: string; originalname: string },
  ): Promise<any> {
    const project = await prisma.donationProject.findFirst({
      where: { id: input.projectId, isActive: true },
    });
    if (!project) throw new BadRequestError('Donation project not found or inactive');
    if (project.endDate && new Date(project.endDate) < new Date()) {
      throw new BadRequestError('This campaign has ended');
    }

    const storage = getStorage();
    const key = `slips/${new Date().toISOString().slice(0, 7)}/${safeFileName(slip.originalname)}`;
    const stored = await storage.put(slip.buffer, key, slip.mimetype);

    const donation = await prisma.donation.create({
      data: {
        donationCode: await this.uniqueCode(),
        projectId: input.projectId,
        nickname: input.nickname,
        accountName: input.accountName,
        contactInfo: input.contactInfo,
        amount: input.amount,
        transferDate: new Date(input.transferDate),
        transferTime: input.transferTime,
        slipUrl: stored.url,
        remark: input.remark,
        status: DonationStatus.PENDING,
        logs: { create: { action: 'submitted', toStatus: DonationStatus.PENDING } },
      },
      include: donationInclude,
    });

    // Fire-and-forget OCR — never blocks or fails the donor's request.
    this.runOcr(donation.id, slip.buffer, slip.mimetype).catch((err) =>
      logger.error({ err, donationId: donation.id }, 'OCR pipeline failed'),
    );

    return donation;
  }

  /** OCR pipeline: recognize → parse → compare with user input → set status. */
  async runOcr(donationId: number, image: Buffer, mimeType: string): Promise<void> {
    const provider = getOcrProvider();
    const donation = await prisma.donation.findFirst({ where: { id: donationId } });
    if (!donation) return;

    if (!provider) {
      await this.transition(donationId, DonationStatus.NEEDS_REVIEW, null, 'OCR disabled');
      return;
    }

    let status: string = DonationStatus.NEEDS_REVIEW;
    let note = 'OCR completed — needs manual review';
    try {
      const result = await provider.recognize(image, mimeType);
      const slip = parseSlipText(result.text);

      const amountMatched =
        slip.amount !== undefined && Math.abs(slip.amount - Number(donation.amount)) < 0.01;
      const dateMatched =
        slip.date !== undefined &&
        slip.date === donation.transferDate.toISOString().slice(0, 10);

      await prisma.donationVerification.upsert({
        where: { donationId },
        create: {
          donationId,
          provider: provider.name,
          isSlip: slip.isSlip,
          confidence: result.confidence,
          extractedBankName: slip.bankName,
          extractedAccountNumber: slip.accountNumber,
          extractedAmount: slip.amount,
          extractedDate: slip.date,
          extractedTime: slip.time,
          referenceNumber: slip.referenceNumber,
          qrPayload: slip.qrPayload,
          rawResult: { text: result.text.slice(0, 8000), ...result.raw } as any,
          amountMatched,
          dateMatched,
        },
        update: {},
      });

      const confident =
        slip.isSlip && result.confidence >= config.OCR_AUTO_VERIFY_CONFIDENCE && amountMatched;
      if (confident) {
        status = DonationStatus.AUTO_VERIFIED;
        note = `Auto-verified (confidence ${(result.confidence * 100).toFixed(0)}%, amount matched)`;
      } else if (!slip.isSlip) {
        note = 'Image does not look like a transfer slip';
      } else if (!amountMatched) {
        note = 'Extracted amount does not match the declared amount';
      } else {
        note = `Confidence ${(result.confidence * 100).toFixed(0)}% below threshold`;
      }
    } catch (err) {
      note = `OCR error: ${(err as Error).message}`;
      logger.warn({ err, donationId }, 'OCR recognition failed');
    }

    await this.transition(donationId, status as DonationStatus, null, note);
  }

  /** Admin: approve a donation (from any reviewable status). */
  async verify(id: number, actorId: number, note?: string): Promise<any> {
    return this.changeStatus(id, DonationStatus.VERIFIED, actorId, note ?? 'Manually verified');
  }

  /** Admin: reject with a reason. */
  async reject(id: number, actorId: number, reason: string): Promise<any> {
    const donation = await this.changeStatus(id, DonationStatus.REJECTED, actorId, reason);
    await prisma.donation.update({ where: { id }, data: { rejectReason: reason } });
    return donation;
  }

  private async changeStatus(
    id: number,
    to: DonationStatus,
    actorId: number,
    note?: string,
  ): Promise<any> {
    const donation = await this.getById(id);
    const terminal: string[] = [DonationStatus.VERIFIED, DonationStatus.REJECTED];
    if (terminal.includes(donation.status) && donation.status !== to) {
      throw new BadRequestError(`Donation is already ${donation.status.toLowerCase()}`);
    }
    await this.transition(id, to, actorId, note);
    return this.getById(id);
  }

  /** Atomic status transition + log + project amount recompute. */
  private async transition(
    id: number,
    to: DonationStatus,
    actorId: number | null,
    note?: string,
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const current = await tx.donation.findFirst({ where: { id } });
      if (!current) throw new NotFoundError('Donation');
      await tx.donation.update({
        where: { id },
        data: {
          status: to,
          ...(to === DonationStatus.VERIFIED
            ? { verifiedById: actorId, verifiedAt: new Date() }
            : {}),
        },
      });
      await tx.donationLog.create({
        data: { donationId: id, action: 'status-change', fromStatus: current.status, toStatus: to, actorId, note },
      });
      await ProjectService.recomputeAmount(current.projectId, tx);

      // Game tokens follow approval state. Both calls are idempotent, so repeated
      // transitions to the same status never mint or revoke twice.
      //
      // The cast bridges a Prisma typing gap only: a transaction client obtained
      // from an *extended* client is structurally a superset of TransactionClient
      // but not assignable to it. Runtime behaviour is identical.
      const txc = tx as unknown as Prisma.TransactionClient;
      if (APPROVED_STATUSES.includes(to)) {
        await grantTokensForDonation(id, actorId, txc);
      } else if (REVOKING_STATUSES.includes(to) && APPROVED_STATUSES.includes(current.status)) {
        await revokeTokensForDonation(id, actorId, txc);
      }
    });
  }

  /** Aggregate dashboard: overall totals + per-project breakdown. */
  async dashboard(): Promise<any> {
    const [grouped, projects] = await Promise.all([
      prisma.donation.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      prisma.donationProject.findMany({
        select: { id: true, name: true, slug: true, currency: true, targetAmount: true },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);
    const byStatus = Object.fromEntries(grouped.map((g) => [g.status, g]));
    const count = (s: string) => byStatus[s]?._count._all ?? 0;

    const perProject = [];
    for (const project of projects) {
      const [pg, donors] = await Promise.all([
        prisma.donation.groupBy({
          by: ['status'],
          where: { projectId: project.id, deletedAt: null },
          _count: { _all: true },
          _sum: { amount: true },
        }),
        prisma.donation.findMany({
          where: { projectId: project.id, status: 'VERIFIED', deletedAt: null },
          select: { accountName: true },
          distinct: ['accountName'],
        }),
      ]);
      const ps = Object.fromEntries(pg.map((g) => [g.status, g]));
      const current = Number(ps.VERIFIED?._sum.amount ?? 0);
      const target = Number(project.targetAmount);
      perProject.push({
        project,
        targetAmount: target,
        currentAmount: current,
        progressPercent: progressPercent(current, target),
        remainingAmount: Math.max(0, target - current),
        donorCount: donors.length,
        pendingCount:
          (ps.PENDING?._count._all ?? 0) +
          (ps.AUTO_VERIFIED?._count._all ?? 0) +
          (ps.NEEDS_REVIEW?._count._all ?? 0),
        verifiedCount: ps.VERIFIED?._count._all ?? 0,
        rejectedCount: ps.REJECTED?._count._all ?? 0,
      });
    }

    return {
      totals: {
        totalDonations: grouped.reduce((sum, g) => sum + g._count._all, 0),
        totalAmount: Number(byStatus.VERIFIED?._sum.amount ?? 0),
        pending: count('PENDING') + count('AUTO_VERIFIED'),
        verified: count('VERIFIED'),
        rejected: count('REJECTED'),
        needsReview: count('NEEDS_REVIEW'),
      },
      perProject,
    };
  }

  async getLogs(donationId: number): Promise<any[]> {
    await this.getById(donationId);
    return prisma.donationLog.findMany({
      where: { donationId },
      include: { actor: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Rows for CSV/Excel export honoring the current filters. */
  async exportRows(query: any): Promise<any[]> {
    const { items } = await this.repository.findAll({ ...query, skip: 0, take: 10_000 });
    return items.map((d: any) => ({
      code: d.donationCode,
      project: d.project?.name,
      nickname: d.nickname ?? '',
      accountName: d.accountName,
      contactInfo: d.contactInfo ?? '',
      amount: Number(d.amount),
      currency: d.project?.currency ?? 'THB',
      transferDate: d.transferDate?.toISOString().slice(0, 10),
      transferTime: d.transferTime,
      status: d.status,
      remark: d.remark ?? '',
      createdAt: d.createdAt.toISOString(),
    }));
  }

  /** Public: donor-facing status lookup by code (no auth, no PII beyond what they submitted). */
  async publicStatus(code: string): Promise<any> {
    const donation = await prisma.donation.findFirst({
      where: { donationCode: code },
      include: { project: { select: { name: true, slug: true, currency: true } } },
    });
    if (!donation) throw new NotFoundError('Donation');
    return {
      donationCode: donation.donationCode,
      projectName: donation.project.name,
      amount: Number(donation.amount),
      currency: donation.project.currency,
      status: donation.status,
      createdAt: donation.createdAt,
    };
  }

  private async uniqueCode(): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const code = randomCode('DN');
      const exists = await prisma.donation.findFirst({ where: { donationCode: code } });
      if (!exists) return code;
    }
    return `DN-${Date.now().toString(36).toUpperCase()}`;
  }
}

export const donationService = new DonationService();
