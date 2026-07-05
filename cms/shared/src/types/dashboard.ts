import type { Donation, DonationProject } from './donations';
import type { Page } from './content';

export interface AuditLog {
  id: number;
  userId?: number | null;
  userName?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  detail?: Record<string, unknown> | null;
  ip?: string | null;
  createdAt: string;
}

export interface DashboardStats {
  totalPages: number;
  totalDonations: number;
  pendingDonations: number;
  totalVisitors: number;
  recentActivities: AuditLog[];
  recentPages: Pick<Page, 'id' | 'title' | 'path' | 'status' | 'updatedAt'>[];
  recentDonations: Pick<
    Donation,
    'id' | 'donationCode' | 'accountName' | 'amount' | 'status' | 'createdAt' | 'project'
  >[];
  activeProjects: Pick<DonationProject, 'id' | 'name' | 'targetAmount' | 'currentAmount'>[];
  systemStatus: SystemStatus;
}

export interface SystemStatus {
  db: 'ok' | 'error';
  storage: 'ok' | 'error';
  uptimeSeconds: number;
  nodeVersion: string;
  memoryUsageMb: number;
}
