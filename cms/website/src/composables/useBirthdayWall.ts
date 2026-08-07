/**
 * Loads a birthday event and its wishes, and keeps them fresh.
 *
 * Shared by the standalone wall page and the CMS block, which differ only in the chrome
 * around the balloons. Polling is what makes the wall work as a party screen: a wish sent
 * from a phone shows up on the projector without anyone touching it.
 */
import { onBeforeUnmount, ref } from 'vue';
import { fetchEvent, fetchWishes, type BirthdayEvent, type Wish } from '@/api/birthday';

export function useBirthdayWall(
  slug: string,
  options: { pollMs?: number; paused?: () => boolean } = {},
) {
  const event = ref<BirthdayEvent | null>(null);
  const wishes = ref<Wish[]>([]);
  const loading = ref(true);
  const loadError = ref<string | null>(null);
  /** Distinguishes "no such birthday" from "the request failed" — different screens. */
  const notFound = ref(false);

  async function reload(): Promise<void> {
    // Settled rather than `all`: a wish list that fails to load should not also cost the
    // visitor the heading and the link to the form.
    const [eventResult, wishResult] = await Promise.allSettled([fetchEvent(slug), fetchWishes(slug)]);

    if (eventResult.status === 'fulfilled') {
      event.value = eventResult.value;
      notFound.value = false;
    } else if (loading.value) {
      const status = (eventResult.reason as any)?.response?.status;
      notFound.value = status === 404;
      loadError.value = notFound.value
        ? 'ไม่พบงานวันเกิดนี้ อาจถูกปิดไปแล้วหรือลิงก์ไม่ถูกต้อง'
        : 'โหลดคำอวยพรไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
    }

    if (wishResult.status === 'fulfilled') {
      wishes.value = wishResult.value;
      if (!notFound.value) loadError.value = null;
    } else if (loading.value && !loadError.value) {
      // Only the first attempt reports a failure. A dropped poll leaves the balloons already
      // on screen alone rather than replacing a live wall with an error.
      loadError.value = 'โหลดคำอวยพรไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
    }
    loading.value = false;
  }

  void reload();

  const pollMs = options.pollMs ?? 30_000;
  if (pollMs > 0) {
    const timer = window.setInterval(() => {
      // A hidden tab is a projector on a screensaver or a phone in a pocket — no reason to
      // keep asking, and the next visible tick catches up anyway.
      if (document.visibilityState !== 'visible') return;
      if (options.paused?.() || notFound.value) return;
      void reload();
    }, pollMs);
    onBeforeUnmount(() => window.clearInterval(timer));
  }

  return { event, wishes, loading, loadError, notFound, reload };
}
