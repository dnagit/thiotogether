/**
 * Birthday wish wall — the website's half of the contract.
 *
 * Three public endpoints back the two screens:
 *   GET  /public/birthday/:slug          → the event and the gift catalogue the admin uploaded
 *   GET  /public/birthday/:slug/wishes   → approved wishes, newest first
 *   POST /public/birthday/:slug/wishes   → multipart: the form fields plus the balloon photo
 *
 * A missing event is a real 404 and is surfaced as one — the slug is wrong, or the admin
 * has deactivated it. The one thing that *is* papered over is an event whose catalogue is
 * still empty: {@link FALLBACK_GIFTS} keeps the picker usable while an admin is part-way
 * through setting up, where a blank grid would read as a broken page.
 */
import { api, get } from '@/api/client';
import type { BalloonShapeId, PhotoFraming } from '@/components/birthday/balloon';

/** A present the admin uploaded; the visitor picks one to tie under their balloon. */
export interface Gift {
  id: number | string;
  name: string;
  imageUrl: string | null;
}

export interface BirthdayEvent {
  slug: string;
  title: string;
  /** Whose birthday it is — shown in the headline and used for the page title. */
  celebrantName: string | null;
  description: string | null;
  coverImage: string | null;
  themeColor: string | null;
  /** False once the admin closes submissions; the form turns into a read-only notice. */
  isOpen: boolean;
  gifts: Gift[];
}

export interface Wish {
  id: number | string;
  name: string;
  message: string;
  balloonShape: BalloonShapeId;
  balloonColor: string;
  photoUrl: string | null;
  photoFraming: PhotoFraming | null;
  gift: Gift | null;
  createdAt: string | null;
}

export interface WishDraft {
  name: string;
  message: string;
  balloonShape: BalloonShapeId;
  balloonColor: string;
  giftId: number | string | null;
  photo: File | null;
  photoFraming: PhotoFraming;
}

/**
 * Stand-ins for an event whose catalogue is still empty. Their ids are strings, so the
 * server would reject one as a gift id — which is correct: they are placeholders to look
 * at, not choices to submit.
 */
export const FALLBACK_GIFTS: Gift[] = [
  { id: 'cake', name: 'เค้กวันเกิด', imageUrl: null },
  { id: 'flower', name: 'ช่อดอกไม้', imageUrl: null },
  { id: 'teddy', name: 'ตุ๊กตาหมี', imageUrl: null },
  { id: 'box', name: 'กล่องของขวัญ', imageUrl: null },
];

/** True while the catalogue is a placeholder, so the form can hold the submit button. */
export function isPlaceholderGift(id: Gift['id'] | null): boolean {
  return typeof id === 'string';
}

export async function fetchEvent(slug: string): Promise<BirthdayEvent> {
  const event = await get<BirthdayEvent>(`/birthday/${encodeURIComponent(slug)}`);
  return { ...event, gifts: event.gifts?.length ? event.gifts : FALLBACK_GIFTS };
}

export async function fetchWishes(slug: string): Promise<Wish[]> {
  return await get<Wish[]>(`/birthday/${encodeURIComponent(slug)}/wishes`);
}

/**
 * Send a wish. The photo goes up as a file and the framing as plain numbers beside it,
 * so the server stores the original picture and every screen re-derives the crop from
 * the same three values.
 */
export async function submitWish(
  slug: string,
  draft: WishDraft,
): Promise<{ id: number | string; status: string; message: string }> {
  const body = new FormData();
  body.append('name', draft.name.trim());
  body.append('message', draft.message.trim());
  body.append('balloonShape', draft.balloonShape);
  body.append('balloonColor', draft.balloonColor);
  if (draft.giftId !== null) body.append('giftId', String(draft.giftId));
  if (draft.photo) {
    body.append('photo', draft.photo);
    body.append('photoZoom', draft.photoFraming.zoom.toFixed(3));
    body.append('photoX', draft.photoFraming.x.toFixed(2));
    body.append('photoY', draft.photoFraming.y.toFixed(2));
  }

  const { data } = await api.post(
    `/public/birthday/${encodeURIComponent(slug)}/wishes`,
    body,
  );
  return { ...data.data, message: data.message };
}
