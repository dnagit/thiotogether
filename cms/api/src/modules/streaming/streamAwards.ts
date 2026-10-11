import crypto from 'node:crypto';
import { prisma } from '../../core/database/prisma.js';
import { AppError, ConflictError, NotFoundError } from '../../core/errors/AppError.js';
import type {
  StreamAwardKind,
  StreamAwards,
  StreamClaimStatus,
  StreamRankRow,
  StreamRisingRow,
  StreamStarRow,
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
 * Every winner draws a prize from the round's pool for each award they won — Streaming Star
 * and DJ's Pick is two draws. A DJ's Pick is settled the moment it is drawn, so its draw is
 * open at once; Streaming Star and Rising Streamer still move while proofs are being
 * approved, so theirs wait until the admin closes the round.
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

/** How long the Streaming Star leaderboard runs, winners included (all of them, past this). */
const STAR_BOARD = 100;

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
      starMedal: true,
      risingMedal: true,
      pickMedal: true,
      starRankMedals: true,
      risingRankMedals: true,
    },
  });
  if (!session) throw new NotFoundError('Streaming session');
  const {
    starCount,
    risingCount,
    pickCount,
    starMedal,
    risingMedal,
    pickMedal,
    starRankMedals,
    risingRankMedals,
    ...info
  } = session;

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
  // Everyone else in order below the winners, as a leaderboard; `stars` stays the winners.
  const winners = new Set(stars.map((r) => r.xAccount));
  const starBoard: StreamStarRow[] = [...current.values()]
    .filter((r) => r.streams > 0)
    .sort(byScore)
    .slice(0, Math.max(stars.length, STAR_BOARD))
    .map((r) => ({ ...r, winner: winners.has(r.xAccount) }));

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
    medals: { star: starMedal, rising: risingMedal, pick: pickMedal },
    rankMedals: { star: starRankMedals, rising: risingRankMedals },
    stars,
    starBoard,
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

/**
 * How many draws the awards allow now: one each, a DJ's Pick at once (it is final when
 * drawn), the other two only once the round is closed.
 */
function drawsAllowed(kinds: StreamAwardKind[], isOpen: boolean): number {
  return isOpen ? (kinds.includes('pick') ? 1 : 0) : kinds.length;
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
  const drawn = new Map<string, typeof draws>();
  for (const d of draws) {
    const key = d.xAccount.toLowerCase();
    drawn.set(key, [...(drawn.get(key) ?? []), d]);
  }
  const shown = (list: typeof draws = []) =>
    list.map((d) => ({ id: d.id, createdAt: d.createdAt.toISOString(), address: d.address, prize: d.prize }));
  const winners = winnersFrom(awards);

  const rows: StreamWinner[] = [...winners.entries()].map(([key, w]) => {
    const mine = drawn.get(key) ?? [];
    const allowed = drawsAllowed(w.awards, awards.session.isOpen);
    return {
      ...w,
      remaining: Math.max(0, allowed - mine.length),
      waiting: w.awards.length - allowed,
      draws: shown(mine),
    };
  });
  // Someone who drew and has since dropped out of the awards (a proof un-approved after
  // the draw) still holds a prize; they stay on the list so the admin can see it.
  for (const [key, list] of drawn) {
    if (!winners.has(key)) {
      rows.push({ xAccount: list[0].xAccount, awards: [], remaining: 0, waiting: 0, draws: shown(list) });
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
const ALL_DRAWN = 'สุ่มครบตามสิทธิ์แล้ว';

/** Its own code, so a claim across rounds can move past a round with nothing left. */
const outOfPrizes = () => new AppError(409, 'ของรางวัลรอบนี้หมดแล้ว กรุณาติดต่อแอดมิน', 'OUT_OF_PRIZES');

/**
 * A winner draws a prize from what is left in the round, each remaining piece an equal
 * chance — so a prize with three left is three times as likely as one with a single left.
 * They may draw once per award won; past that it is refused.
 *
 * The round's row is locked for the draw, so two winners drawing at once cannot both take
 * the last of something, nor one winner draw more times than they won.
 */
export async function drawPrize(sessionId: number, xAccount: string, address: string | null = null) {
  const awards = await computeAwards(sessionId);
  const winner = winnersFrom(awards).get(xAccount.toLowerCase());
  if (!winner) throw new AppError(404, `@${xAccount} ไม่ได้รับรางวัลในรอบนี้`, 'NOT_FOUND');
  const allowed = drawsAllowed(winner.awards, awards.session.isOpen);

  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM stream_sessions WHERE id = ${sessionId} AND deleted_at IS NULL FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundError('Streaming session');

    const drawn = await tx.streamDraw.count({
      where: { sessionId, xAccount: { equals: xAccount, mode: 'insensitive' } },
    });
    if (drawn >= allowed) {
      throw new ConflictError(allowed < winner.awards.length ? WAIT_FOR_CLOSE : ALL_DRAWN);
    }

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
      data: { sessionId, xAccount: winner.xAccount, prizeId: prize.id, address },
      include: drawInclude,
    });
    return { draw, awards: winner.awards, remaining: allowed - drawn - 1 };
  });
}

type RoundStanding = {
  session: { id: number; name: string };
  awards: StreamAwardKind[];
  remaining: number;
  waiting: boolean;
};

/**
 * Where the account stands in every round shown on the web, oldest first: what it won in
 * each and how many of those draws it may still make there.
 */
async function standings(xAccount: string): Promise<RoundStanding[]> {
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

  const rows: RoundStanding[] = [];
  for (const s of sessions) {
    const awards = await computeAwards(s.id);
    const winner = winnersFrom(awards).get(xAccount.toLowerCase());
    if (!winner) continue;
    const allowed = drawsAllowed(winner.awards, awards.session.isOpen);
    const drawn = await prisma.streamDraw.count({ where: { sessionId: s.id, xAccount: insensitive } });
    rows.push({
      session: s,
      awards: winner.awards,
      remaining: Math.max(0, allowed - drawn),
      waiting: allowed < winner.awards.length,
    });
  }
  return rows;
}

/** Every prize the account has drawn in the rounds shown on the web, oldest first. */
async function drawnBy(xAccount: string) {
  const draws = await prisma.streamDraw.findMany({
    where: {
      xAccount: { equals: xAccount, mode: 'insensitive' },
      session: { deletedAt: null, isActive: true },
    },
    include: { prize: { select: { name: true, image: true } }, session: { select: { name: true } } },
    orderBy: { id: 'asc' },
  });
  return draws.map((d) => ({ sessionName: d.session.name, prize: d.prize }));
}

/**
 * `POST /public/streaming/claim/check` — before drawing: how many draws the account has left
 * across the rounds shown on the web, and what it has drawn so far.
 */
export async function claimStatus(xAccount: string): Promise<StreamClaimStatus> {
  const [rounds, draws] = await Promise.all([standings(xAccount), drawnBy(xAccount)]);
  if (rounds.length === 0 && draws.length === 0) {
    throw new AppError(404, `@${xAccount} ยังไม่ได้รับรางวัล`, 'NOT_FOUND');
  }
  return {
    xAccount,
    remaining: rounds.reduce((n, r) => n + r.remaining, 0),
    waiting: rounds.some((r) => r.waiting),
    draws,
  };
}

/**
 * `POST /public/streaming/claim` — the account's next draw across the rounds shown on the
 * web: the oldest round where it still has a draw left, skipping a round whose prizes are
 * all gone. `remaining` is what is left across all of them afterwards.
 */
export async function claimFor(xAccount: string, address: string) {
  const rounds = await standings(xAccount);
  let emptyPool = false;
  for (const [i, r] of rounds.entries()) {
    if (r.remaining === 0) continue;
    try {
      const { draw, awards } = await drawPrize(r.session.id, xAccount, address);
      const left = rounds.reduce((n, o, j) => n + (j === i ? r.remaining - 1 : o.remaining), 0);
      return { draw, awards, sessionName: r.session.name, remaining: left };
    } catch (err) {
      // A round with no prizes (left) must not stand in the way of a later one that has some.
      if (err instanceof AppError && err.code === 'OUT_OF_PRIZES') {
        emptyPool = true;
        continue;
      }
      throw err;
    }
  }
  if (emptyPool) throw outOfPrizes();
  if (rounds.some((r) => r.waiting)) throw new ConflictError(WAIT_FOR_CLOSE);
  if (rounds.length) throw new ConflictError(ALL_DRAWN);
  throw new AppError(404, `@${xAccount} ยังไม่ได้รับรางวัล`, 'NOT_FOUND');
}

/**
 * `POST /streaming/prizes/carry-over` — what is left of one round's prizes moves to another:
 * each prize with pieces left lands in the round (added to one of the same name if it has
 * one) and the round it came from keeps only what was drawn of it. Both rounds are locked,
 * so no draw slips in between counting and moving.
 */
export async function carryOverPrizes(fromSessionId: number, toSessionId: number) {
  if (fromSessionId === toSessionId) throw new ConflictError('เลือกรอบอื่นที่จะยกของรางวัลมา');
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM stream_sessions
      WHERE id IN (${fromSessionId}, ${toSessionId}) AND deleted_at IS NULL
      ORDER BY id FOR UPDATE`;
    if (locked.length < 2) throw new NotFoundError('Streaming session');

    const [from, here] = await Promise.all([
      tx.streamPrize.findMany({
        where: { sessionId: fromSessionId },
        include: { _count: { select: { draws: { where: { deletedAt: null } } } } },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }),
      tx.streamPrize.findMany({ where: { sessionId: toSessionId } }),
    ]);
    const byName = new Map(here.map((p) => [p.name.trim().toLowerCase(), p]));

    let moved = 0;
    let kinds = 0;
    for (const p of from) {
      const left = p.quantity - p._count.draws;
      if (left <= 0) continue;
      const same = byName.get(p.name.trim().toLowerCase());
      if (same) {
        await tx.streamPrize.update({ where: { id: same.id }, data: { quantity: { increment: left } } });
      } else {
        const made = await tx.streamPrize.create({
          data: { sessionId: toSessionId, name: p.name, image: p.image, quantity: left, sortOrder: p.sortOrder },
        });
        byName.set(made.name.trim().toLowerCase(), made);
      }
      await tx.streamPrize.update({ where: { id: p.id }, data: { quantity: p._count.draws } });
      moved += left;
      kinds++;
    }
    if (moved === 0) throw new ConflictError('รอบนั้นไม่มีของรางวัลเหลือ');
    return { moved, kinds };
  });
}
