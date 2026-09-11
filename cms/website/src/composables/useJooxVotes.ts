import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useDocumentVisibility, useNow } from '@vueuse/core';
import { jooxVoteDay, jooxVoteResetAt } from '@cms/shared';
import {
  addJooxVote,
  clickJooxVote,
  deleteJooxVote,
  listJooxVotes,
  markJooxVoteDone,
  messageOf,
  statusOf,
  type JooxVoteAccount,
} from '@/api/jooxVotes';

/**
 * The shared JOOX voting checklist: one list on the server that everybody on the page sees
 * and edits. The server owns the counts and the 23:00 Thai-time reset (see the API module);
 * this keeps a copy on screen and keeps it fresh.
 *
 * Fresh means: polled while the page is visible, fetched again the moment a phone comes back
 * to it — typically from the JOOX app, after voting — and again when 23:00 passes, so the
 * list turns over without anyone reloading.
 */

const POLL_MS = 30_000;

export function useJooxVotes() {
  const accounts = ref<JooxVoteAccount[]>([]);
  const loading = ref(true);
  const loadError = ref<string | null>(null);

  // Ticks often enough for the countdown to stay right to the minute.
  const now = useNow({ interval: 15_000 });
  const today = computed(() => jooxVoteDay(now.value));
  const msUntilReset = computed(() => jooxVoteResetAt(now.value).getTime() - now.value.getTime());

  /*
   * A poll that set off before a tap and lands after it would put the old count back on
   * screen. Every write bumps `writes`; a list that started under an older number, or while
   * a write is still out, is dropped — the next poll brings the settled figures.
   */
  let writes = 0;
  let inFlight = 0;

  async function refresh(): Promise<void> {
    const startedAt = writes;
    try {
      const list = await listJooxVotes();
      if (startedAt === writes && inFlight === 0) accounts.value = list;
      loadError.value = null;
    } catch {
      // Only the first load reports it: a dropped poll leaves the list on screen alone.
      if (loading.value) loadError.value = 'โหลดรายการไม่สำเร็จ กรุณาลองใหม่';
    } finally {
      loading.value = false;
    }
  }

  async function write<T>(run: () => Promise<T>): Promise<T> {
    writes += 1;
    inFlight += 1;
    try {
      return await run();
    } finally {
      inFlight -= 1;
    }
  }

  function put(row: JooxVoteAccount): void {
    const i = accounts.value.findIndex((a) => a.id === row.id);
    if (i === -1) accounts.value = [...accounts.value, row];
    else accounts.value.splice(i, 1, row);
  }

  function drop(id: number): void {
    accounts.value = accounts.value.filter((a) => a.id !== id);
  }

  /** Returns the error to show, or null when the account was added. */
  async function add(accountName: string, link: string): Promise<string | null> {
    try {
      put(await write(() => addJooxVote(accountName, link)));
      return null;
    } catch (err) {
      return messageOf(err, 'เพิ่มบัญชีไม่สำเร็จ กรุณาลองใหม่');
    }
  }

  /**
   * One on screen straight away — the tap has already opened the vote link and there is no
   * waiting for the network — then the server's own figure once it answers, which also
   * folds in taps from other phones.
   */
  async function countClick(id: number): Promise<string | null> {
    const row = accounts.value.find((a) => a.id === id);
    if (row) put({ ...row, clicks: row.clicks + 1 });
    try {
      put(await write(() => clickJooxVote(id)));
      return null;
    } catch (err) {
      return failed(err, id, 'บันทึกการกดไม่สำเร็จ');
    }
  }

  async function markDone(id: number): Promise<string | null> {
    try {
      put(await write(() => markJooxVoteDone(id)));
      return null;
    } catch (err) {
      return failed(err, id, 'บันทึกไม่สำเร็จ กรุณาลองใหม่');
    }
  }

  async function remove(id: number): Promise<string | null> {
    try {
      await write(() => deleteJooxVote(id));
      drop(id);
      return null;
    } catch (err) {
      // Already gone is what was asked for.
      if (statusOf(err) === 404) {
        drop(id);
        return null;
      }
      return messageOf(err, 'ลบไม่สำเร็จ กรุณาลองใหม่');
    }
  }

  /** A write that did not land: take the server's list as it is, and say why. */
  function failed(err: unknown, id: number, fallback: string): string {
    if (statusOf(err) === 404) drop(id);
    void refresh();
    return messageOf(err, fallback);
  }

  void refresh();

  // The same rule as the birthday wall: a hidden tab stops asking, and catches up on return.
  const visibility = useDocumentVisibility();
  const timer = window.setInterval(() => {
    if (visibility.value === 'visible') void refresh();
  }, POLL_MS);
  onBeforeUnmount(() => window.clearInterval(timer));
  watch(visibility, (v) => {
    if (v === 'visible') void refresh();
  });
  // 23:00 has passed: the server is already reporting zeros, so fetch them.
  watch(today, () => void refresh());

  return {
    accounts,
    loading,
    loadError,
    msUntilReset,
    refresh,
    add,
    countClick,
    markDone,
    remove,
  };
}
