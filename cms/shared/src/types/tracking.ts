/** A batch of parcels, as the admin sees one. */
export interface TrackingProject {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  /** How many tracking numbers it holds. */
  _count?: { entries: number };
}

/** One parcel: an X account (without the "@") and its tracking number. */
export interface TrackingEntry {
  id: number;
  projectId: number;
  xAccount: string;
  trackingNo: string;
  createdAt: string;
  updatedAt: string;
}

/** `POST /tracking/entries/bulk` — how many rows went in. */
export interface TrackingBulkResult {
  created: number;
}

/**
 * `POST /public/tracking/lookup` — an account's tracking numbers, grouped by project, in the
 * projects' own order. Empty `projects` means nothing was found.
 */
export interface PublicTrackingLookup {
  xAccount: string;
  projects: Array<{
    id: number;
    name: string;
    description: string | null;
    trackingNos: string[];
  }>;
}

/**
 * `GET /public/tracking/list?projectId=` — every account and number, by project, for a block
 * set to show the whole list rather than only a lookup.
 */
export interface PublicTrackingList {
  projects: Array<{
    id: number;
    name: string;
    description: string | null;
    entries: Array<{ xAccount: string; trackingNo: string }>;
  }>;
}
