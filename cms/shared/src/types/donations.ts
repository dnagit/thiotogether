import type { BaseEntity, SeoMeta } from './api';
import type { DonationStatus } from '../constants/enums';

export interface BankAccount extends BaseEntity {
  bankName: string;
  accountName: string;
  accountNumber: string;
  branch?: string | null;
  qrCodeUrl?: string | null;
  isActive: boolean;
}

export interface DonationProject extends BaseEntity, SeoMeta {
  name: string;
  slug: string;
  description: string;
  shortDescription?: string | null;
  coverImage?: string | null;
  bannerImage?: string | null;
  targetAmount: number;
  /** Denormalized sum of VERIFIED donations; recomputed on every status change. */
  currentAmount: number;
  currency: string;
  themeColor?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isActive: boolean;
  sortOrder: number;
  bankAccounts?: BankAccount[];
  stats?: DonationProjectStats;
}

export interface DonationProjectStats {
  targetAmount: number;
  currentAmount: number;
  progressPercent: number;
  remainingAmount: number;
  donorCount: number;
  pendingCount: number;
  verifiedCount: number;
  rejectedCount: number;
}

export interface Donation extends BaseEntity {
  donationCode: string;
  projectId: number;
  project?: Pick<DonationProject, 'id' | 'name' | 'slug' | 'currency'>;
  accountName: string;
  amount: number;
  transferDate: string;
  transferTime: string;
  slipUrl: string;
  remark?: string | null;
  status: DonationStatus;
  verification?: DonationVerification | null;
  verifiedById?: number | null;
  verifiedAt?: string | null;
  rejectReason?: string | null;
}

export interface DonationVerification extends BaseEntity {
  donationId: number;
  provider: string;
  isSlip: boolean;
  confidence: number;
  extractedBankName?: string | null;
  extractedAccountNumber?: string | null;
  extractedAmount?: number | null;
  extractedDate?: string | null;
  extractedTime?: string | null;
  referenceNumber?: string | null;
  qrPayload?: string | null;
  rawResult: Record<string, unknown>;
  amountMatched: boolean;
  dateMatched: boolean;
}

export interface DonationLog extends BaseEntity {
  donationId: number;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  actorId?: number | null;
  note?: string | null;
}

export interface CreateDonationRequest {
  projectId: number;
  accountName: string;
  amount: number;
  transferDate: string;
  transferTime: string;
  remark?: string;
}

export interface DonationDashboard {
  totals: {
    totalDonations: number;
    totalAmount: number;
    pending: number;
    verified: number;
    rejected: number;
    needsReview: number;
  };
  perProject: Array<{ project: Pick<DonationProject, 'id' | 'name' | 'slug' | 'currency'> } & DonationProjectStats>;
}
