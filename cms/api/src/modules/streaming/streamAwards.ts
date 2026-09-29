import crypto from 'node:crypto';
import { prisma } from '../../core/database/prisma.js';
import { AppError, ConflictError, NotFoundError } from '../../core/errors/AppError.js';
import type {
  StreamAwardKind,
  StreamAwards,
  StreamRankRow,
  StreamRisingRow,
  StreamWinner,
} from '@cms/shared';

/**
 * The awards for one round, shared by the admin and the website.
 *
 * The idea is a game rather than a measure of who is the best fan, so there are several
 * ways to win and only one of them rewards the biggest number:
 *  - Streaming Star:  the highest totals.
 *  - Rising Streamer: the biggest rise over the round before — open to anyone who streamed
 *                     more than last time, however little they started from. Someone new
 *                     counts as rising from 0 — and so does everyone in the very first
 *                     round, which has nothing before it: there it is this round's totals.
 *                     Its winners (one by default) are the top
 *                     by rise, a tied rise going to the bigger total this round; the rest
 *                     of the list is a leaderboard.
 *
 * Each award has its own number of winners, set on the round.
 *  - DJ's Pick:       pure luck. A DJ draws a fan from everyone with an approved proof.
 *
 * Every winner draws one prize from the round's pool — one per account per round, however
 * many awards they won. A DJ's Pick is settled the moment it is drawn, so it may draw at
 * once; Streaming Star and Rising Streamer still move while proofs are being approved, so
 * theirs wait until the admin closes the round.
 *
 * Only APPROVED proofs count. An account's proofs add up, and "@Name" and "name" are the
 * same account.
 */

/** Each account's approved total, keyed by its lower-cased name. */
async function totals(sessionId: number): Promise<Map<string, StreamRankRow>> {
  const proofs = await prisma.streamProof.findMany({
    where: { sessionId, status: 'APPROVED' },
    select: { xAccount: true, streams: true },
    orderBy: { id: 'asc' },
  });
  const byAccount = new Map<string, StreamRankRow>();
  for (const p of proofs) {
    const key = p.xAccount.toLowerCase();
    const row = byAccount.get(key);
    if (row) row.streams += p.streams ?? 0;
    // The first spelling the account used is the one shown.
    else byAccount.set(key, { xAccount: p.xAccount, streams: p.streams ?? 0 });
  }
  return byAccount;
}

/**
 * The first `top` rows by `score`, and anyone tied with the last of them — two fans on the
 * same number both deserve the award, and which of them made the cut would otherwise come
 * down to spelling.
 */
function topWithTies<T>(rows: T[], score: (row: T) => number, top: number): T[] {
  if (rows.length <= top) return rows;
  const cutoff = score(rows[top - 1]);
  return rows.filter((r, i) => i < top || score(r) === cutoff);
}

/** The round Rising Streamer compares against: the one that started just before. */
async function previousSession(session: { id: number; startsAt: Date }) {
  return prisma.streamSession.findFirst({
    where: { startsAt: { lt: session.startsAt }, id: { not: session.id } },
    orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
    select: { id: true, name: true },
  });
}

/** How long the Rising Streamer leaderboard runs, winners included. */
const RISING_BOARD = 5;

export async function computeAwards(sessionId: number): Promise<StreamAwards> {
  const session = await prisma.streamSession.findFirst({
    where: { id: sessionId },
    select: {
      id: true,
      name: true,
      description: true,
      startsAt: true,
      endsAt: true,
      isOpen: true,
      starCount: true,
      risingCount: true,
      pickCount: true,
    },
  });
  if (!session) throw new NotFoundError('Streaming session');
  const { starCount, risingCount, pickCount, ...info } = session;

  const [current, previous, picks, draws] = await Promise.all([
    totals(session.id),
    previousSession(session),
    prisma.streamPick.findMany({
      where: { sessionId: session.id },
      select: { id: true, xAccount: true, dj: { select: { name: true, image: true } } },
      orderBy: { id: 'asc' },
    }),
    prisma.streamDraw.findMany({
      where: { sessionId: session.id },
      select: { xAccount: true, prize: { select: { name: true, image: true } } },
      orderBy: { id: 'asc' },
    }),
  ]);

  const byScore = (a: StreamRankRow, b: StreamRankRow) =>
    b.streams - a.streams || a.xAccount.localeCompare(b.xAccount);
  const stars = topWithTies(
    [...current.values()].filter((r) => r.streams > 0).sort(byScore),
    (r) => r.streams,
    starCount,
  );

  // Newcomers rise from 0; with no round before this one, everyone does.
  const before = previous ? await totals(previous.id) : new Map<string, StreamRankRow>();
  const all = [...current.entries()]
    .map(([key, row]) => {
      const prev = before.get(key)?.streams ?? 0;
      return { ...row, previous: prev, gain: row.streams - prev, winner: false };
    })
    .filter((r) => r.gain > 0)
    .sort((a, b) => b.gain - a.gain || b.streams - a.streams || a.xAccount.localeCompare(b.xAccount));
  // The winners: the first `risingCount`, and anyone level with the last of them on both.
  const cutoff = all[Math.min(risingCount, all.length) - 1];
  all.forEach((r, i) => {
    r.winner = i < risingCount || (r.gain === cutoff?.gain && r.streams === cutoff?.streams);
  });
  // A few more below the winners, as a leaderboard to chase.
  const rising: StreamRisingRow[] = topWithTies(all, (r) => r.gain, Math.max(risingCount, RISING_BOARD));

  return {
    session: {
      ...info,
      startsAt: info.startsAt.toISOString(),
      endsAt: info.endsAt.toISOString(),
    },
    previous,
    starCount,
    risingCount,
    pickCount,
    stars,
    rising,
    picks,
    draws,
    participants: [...current.values()].filter((r) => r.streams > 0).length,
  };
}

type Winner = { xAccount: string; awards: StreamAwardKind[] };

/** Whoever won anything in the round, keyed by lower-cased account, with what they won. */
function winnersFrom(awards: StreamAwards): Map<string, Winner> {
  const winners = new Map<string, Winner>();
  const add = (xAccount: string, kind: StreamAwardKind) => {
    const key = xAccount.toLowerCase();
    const w = winners.get(key) ?? { xAccount, awards: [] };
    if (!w.awards.includes(kind)) w.awards.push(kind);
    winners.set(key, w);
  };
  for (const r of awards.stars) add(r.xAccount, 'star');
  for (const r of awards.rising) if (r.winner) add(r.xAccount, 'rising');
  for (const p of awards.picks) add(p.xAccount, 'pick');
  return winners;
}

/** A DJ's Pick is final when drawn; the other two only once the round is closed. */
function mayDraw(kinds: StreamAwardKind[], isOpen: boolean): boolean {
  return kinds.includes('pick') || (!isOpen && kinds.length > 0);
}

export const drawInclude = { prize: { select: { id: true, name: true, image: true } } } as const;

/** `GET /streaming/sessions/:id/winners` — for the admin's draw table. */
export async function listWinners(sessionId: number): Promise<StreamWinner[]> {
  const awards = await computeAwards(sessionId);
  const draws = await prisma.streamDraw.findMany({
    where: { sessionId },
    include: drawInclude,
    orderBy: { id: 'asc' },
  });
  const drawn = new Map(draws.map((d) => [d.xAccount.toLowerCase(), d]));
  const winners = winnersFrom(awards);

  const rows: StreamWinner[] = [...winners.entries()].map(([key, w]) => {
    const d = drawn.get(key);
    return {
      ...w,
      canDraw: mayDraw(w.awards, awards.session.isOpen),
      draw: d ? { id: d.id, createdAt: d.createdAt.toISOString(), prize: d.prize } : null,
    };
  });
  // Someone who drew and has since dropped out of the awards (a proof un-approved after
  // the draw) still holds a prize; they stay on the list so the admin can see it.
  for (const [key, d] of drawn) {
    if (!winners.has(key)) {
      rows.push({
        xAccount: d.xAccount,
        awards: [],
        canDraw: false,
        draw: { id: d.id, createdAt: d.createdAt.toISOString(), prize: d.prize },
      });
    }
  }
  return rows;
}

/** DJ's Pick has a set number of winners per round. */
export async function assertPickRoom(session: { id: number; pickCount: number }): Promise<void> {
  const picked = await prisma.streamPick.count({ where: { sessionId: session.id } });
  if (picked >= session.pickCount) {
    throw new ConflictError(`DJ's Pick รอบนี้ครบ ${session.pickCount} คนแล้ว`);
  }
}

export const pickInclude = { dj: { select: { id: true, name: true, image: true } } } as const;

/**
 * The DJ draws a lucky fan from everyone with approved streams this round who has not
 * already been picked in it — the same chance whatever their number.
 *
 * Fans who have won nothing yet come first: a Streaming Star or Rising Streamer winner is
 * drawn only once everyone else has been. While the round is open those two are the
 * standings at the moment of the draw.
 */
export async function drawWinner(sessionId: number, djId: number | null) {
  const session = await prisma.streamSession.findFirst({ where: { id: sessionId } });
  if (!session) throw new NotFoundError('Streaming session');
  await assertPickRoom(session);

  const [current, picked, awards] = await Promise.all([
    totals(sessionId),
    prisma.streamPick.findMany({ where: { sessionId }, select: { xAccount: true } }),
    computeAwards(sessionId),
  ]);
  const taken = new Set(picked.map((p) => p.xAccount.toLowerCase()));
  const won = new Set(
    [...awards.stars, ...awards.rising.filter((r) => r.winner)].map((r) => r.xAccount.toLowerCase()),
  );
  const open = [...current.entries()].filter(([key, row]) => row.streams > 0 && !taken.has(key));
  const emptyHanded = open.filter(([key]) => !won.has(key));
  const pool = (emptyHanded.length ? emptyHanded : open).map(([, row]) => row.xAccount);
  if (pool.length === 0) {
    throw new ConflictError(
      current.size === 0
        ? 'ยังไม่มีใครมีหลักฐานที่อนุมัติแล้วในรอบนี้'
        : 'ทุกคนในรอบนี้ถูกสุ่มไปแล้ว',
    );
  }

  return prisma.streamPick.create({
    data: { sessionId, djId, xAccount: pool[crypto.randomInt(pool.length)] },
    include: pickInclude,
  });
}

const WAIT_FOR_CLOSE = 'รอบนี้ยังไม่ปิด รอประกาศผลก่อนแล้วค่อยมาสุ่มนะคะ';

/** Its own code, so a claim across rounds can move past a round with nothing left. */
const outOfPrizes = () => new AppError(409, 'ของรางวัลรอบนี้หมดแล้ว กรุณาติดต่อแอดมิน', 'OUT_OF_PRIZES');

/**
 * A winner draws their prize from what is left in the round, each remaining piece an equal
 * chance — so a prize with three left is three times as likely as one with a single left.
 *
 * The round's row is locked for the draw, so two winners drawing at once cannot both take
 * the last of something, nor one winner draw twice. Drawing again returns the first draw.
 */
export async function drawPrize(sessionId: number, xAccount: string) {
  const awards = await computeAwards(sessionId);
  const winner = winnersFrom(awards).get(xAccount.toLowerCase());

  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM stream_sessions WHERE id = ${sessionId} AND deleted_at IS NULL FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundError('Streaming session');

    const existing = await tx.streamDraw.findFirst({
      where: { sessionId, xAccount: { equals: xAccount, mode: 'insensitive' } },
      include: drawInclude,
    });
    if (existing) return { draw: existing, awards: winner?.awards ?? [] };

    if (!winner) throw new AppError(404, `@${xAccount} ไม่ได้รับรางวัลในรอบนี้`, 'NOT_FOUND');
    if (!mayDraw(winner.awards, awards.session.isOpen)) throw new ConflictError(WAIT_FOR_CLOSE);

    const prizes = await tx.streamPrize.findMany({
      where: { sessionId },
      select: { id: true, quantity: true, _count: { select: { draws: { where: { deletedAt: null } } } } },
    });
    const left = prizes
      .map((p) => ({ id: p.id, left: p.quantity - p._count.draws }))
      .filter((p) => p.left > 0);
    const total = left.reduce((n, p) => n + p.left, 0);
    if (total === 0) throw outOfPrizes();

    let roll = crypto.randomInt(total);
    const prize = left.find((p) => (roll -= p.left) < 0)!;

    const draw = await tx.streamDraw.create({
      data: { sessionId, xAccount: winner.xAccount, prizeId: prize.id },
      include: drawInclude,
    });
    return { draw, awards: winner.awards };
  });
}

/**
 * `POST /public/streaming/claim` — the account's next draw across the rounds shown on the
 * web: the oldest round where it won and has yet to draw. Failing that, its latest draw, so
 * a winner who comes back sees what they got rather than an error.
 */
export async function claimFor(xAccount: string) {
  const insensitive = { equals: xAccount, mode: 'insensitive' as const };
  const sessions = await prisma.streamSession.findMany({
    where: {
      isActive: true,
      OR: [
        { proofs: { some: { deletedAt: null, status: 'APPROVED', xAccount: insensitive } } },
        { picks: { some: { deletedAt: null, xAccount: insensitive } } },
      ],
    },
    select: { id: true, name: true },
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
  });

  let waiting = false;
  let emptyPool = false;
  for (const s of sessions) {
    const already = await prisma.streamDraw.findFirst({ where: { sessionId: s.id, xAccount: insensitive } });
    if (already) continue;
    const awards = await computeAwards(s.id);
    const winner = winnersFrom(awards).get(xAccount.toLowerCase());
    if (!winner) continue;
    if (!mayDraw(winner.awards, awards.session.isOpen)) {
      waiting = true;
      continue;
    }
    try {
      const { draw, awards: kinds } = await drawPrize(s.id, xAccount);
      return { draw, awards: kinds, sessionName: s.name };
    } catch (err) {
      // A round with no prizes (left) must not stand in the way of a later one that has some.
      if (err instanceof AppError && err.code === 'OUT_OF_PRIZES') {
        emptyPool = true;
        continue;
      }
      throw err;
    }
  }
  // A win still waiting on its round to close says so, rather than showing an older prize.
  if (waiting) throw new ConflictError(WAIT_FOR_CLOSE);

  const last = await prisma.streamDraw.findFirst({
    where: { xAccount: insensitive, session: { deletedAt: null, isActive: true } },
    include: { ...drawInclude, session: { select: { id: true, name: true } } },
    orderBy: { id: 'desc' },
  });
  if (last) {
    const winner = winnersFrom(await computeAwards(last.session.id)).get(xAccount.toLowerCase());
    return { draw: last, awards: winner?.awards ?? [], sessionName: last.session.name };
  }
  if (emptyPool) throw outOfPrizes();
  throw new AppError(404, `@${xAccount} ยังไม่ได้รับรางวัล`, 'NOT_FOUND');
}
