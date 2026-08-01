import { beforeEach, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { db, ledgerBalance, makeDonation, makeGame, makeProject, resetDb } from './helpers/db.js';
import { grantTokensForDonation, getBalance } from '../src/core/tokens/tokenService.js';
import { normalizeAccountName } from '../src/core/tokens/accountName.js';
import {
  getPublicBoard,
  openGame,
  reserveTile,
  revealGame,
  shuffleGame,
} from '../src/core/game/gameService.js';

beforeEach(resetDb);

/** Give `accountName` exactly `tokens` spendable tokens on `projectId`. */
async function fund(projectId: number, accountName: string, tokens: number) {
  const project = await db.donationProject.findUniqueOrThrow({ where: { id: projectId } });
  const amount = new Prisma.Decimal(project.tokenValue!).times(tokens);
  const donation = await makeDonation(projectId, accountName, amount.toString());
  await grantTokensForDonation(donation.id, null);
  return db.accountIdentity.findUniqueOrThrow({
    where: { normalizedName: normalizeAccountName(accountName) },
  });
}

describe('opening a game', () => {
  it('refuses to open when reward count does not match tile count', async () => {
    const project = await makeProject();
    const game = await makeGame([project.id], { tileCount: 6 });
    await db.reward.deleteMany({ where: { gameId: game.id, sortOrder: { gte: 4 } } });

    await expect(openGame(game.id)).rejects.toThrow(/เท่ากับจำนวนป้าย/);
    expect((await db.game.findUniqueOrThrow({ where: { id: game.id } })).status).toBe('DRAFT');
  });

  it('refuses to open with no donation project attached', async () => {
    const project = await makeProject();
    const game = await makeGame([project.id]);
    await db.gameDonationProject.deleteMany({ where: { gameId: game.id } });

    await expect(openGame(game.id)).rejects.toThrow(/โครงการบริจาค/);
  });

  it('shuffles every reward onto exactly one tile and records a commitment', async () => {
    const project = await makeProject();
    const game = await makeGame([project.id], { tileCount: 6 });

    await openGame(game.id);

    const after = await db.game.findUniqueOrThrow({ where: { id: game.id } });
    expect(after.status).toBe('OPEN');
    expect(after.shuffledAt).not.toBeNull();
    expect(after.commitmentHash).toMatch(/^[0-9a-f]{64}$/);

    const tiles = await db.boardTile.findMany({ where: { gameId: game.id } });
    const rewardIds = tiles.map((t) => t.rewardId);
    expect(rewardIds.every((id) => id !== null)).toBe(true);
    // Bijection: no reward is used twice.
    expect(new Set(rewardIds).size).toBe(6);
  });

  it('leaves no tile unassigned after opening', async () => {
    const project = await makeProject();
    const game = await makeGame([project.id], { tileCount: 5 });
    await openGame(game.id);

    expect(await db.boardTile.count({ where: { gameId: game.id, rewardId: null } })).toBe(0);
  });

  it('refuses to re-shuffle once a reservation exists', async () => {
    const project = await makeProject();
    const game = await makeGame([project.id]);
    await openGame(game.id);
    await fund(project.id, 'Somchai', 1);

    await reserveTile({
      gameSlug: game.slug,
      boardNumber: 1,
      accountName: 'Somchai',
      idempotencyKey: 'key-1',
    });

    await expect(shuffleGame(game.id)).rejects.toThrow(/มีผู้จองแล้ว/);
  });
});

describe('reserving a tile', () => {
  it('spends a token, records the reservation, and reports the remaining balance', async () => {
    const project = await makeProject();
    const game = await makeGame([project.id]);
    await openGame(game.id);
    const identity = await fund(project.id, 'Somchai Jaidee', 3);

    const result = await reserveTile({
      gameSlug: game.slug,
      boardNumber: 4,
      accountName: '  somchai   JAIDEE ',
      idempotencyKey: 'key-1',
    });

    expect(result).toMatchObject({
      boardNumber: 4,
      tokensSpent: 1,
      remainingTokens: 2,
      reservedCount: 1,
      replayed: false,
    });

    const reservation = await db.reservation.findFirstOrThrow({ where: { gameId: game.id } });
    // Snapshot freezes the name as typed, so later renames cannot rewrite history.
    expect(reservation.accountNameSnapshot).toBe('somchai JAIDEE');
    expect(reservation.accountIdentityId).toBe(identity.id);
    expect(await ledgerBalance(identity.id)).toBe(2);
  });

  it('lets only one of many concurrent players take the same tile', async () => {
    const project = await makeProject();
    const game = await makeGame([project.id]);
    await openGame(game.id);

    const players = ['A player', 'B player', 'C player', 'D player', 'E player'];
    for (const p of players) await fund(project.id, p, 1);

    const results = await Promise.allSettled(
      players.map((name, i) =>
        reserveTile({
          gameSlug: game.slug,
          boardNumber: 1,
          accountName: name,
          idempotencyKey: `race-${i}`,
        }),
      ),
    );

    const won = results.filter((r) => r.status === 'fulfilled');
    expect(won).toHaveLength(1);
    expect(await db.reservation.count({ where: { gameId: game.id } })).toBe(1);

    // Everyone who lost keeps their token — no deduction without a tile.
    for (const name of players) {
      const identity = await db.accountIdentity.findUniqueOrThrow({
        where: { normalizedName: normalizeAccountName(name) },
      });
      const balance = (await getBalance(identity.id)).total;
      const hasTile =
        (await db.reservation.count({ where: { accountIdentityId: identity.id } })) > 0;
      expect(balance).toBe(hasTile ? 0 : 1);
    }
  });

  it('does not deduct a token when the tile is already taken', async () => {
    const project = await makeProject();
    const game = await makeGame([project.id]);
    await openGame(game.id);
    await fund(project.id, 'First', 1);
    const second = await fund(project.id, 'Second', 1);

    await reserveTile({ gameSlug: game.slug, boardNumber: 2, accountName: 'First', idempotencyKey: 'k1' });

    await expect(
      reserveTile({ gameSlug: game.slug, boardNumber: 2, accountName: 'Second', idempotencyKey: 'k2' }),
    ).rejects.toThrow(/ถูกจองไปแล้ว/);

    expect((await getBalance(second.id)).total).toBe(1);
    expect(await ledgerBalance(second.id)).toBe(1);
  });

  it('replays an identical request instead of taking a second tile', async () => {
    const project = await makeProject();
    const game = await makeGame([project.id]);
    await openGame(game.id);
    const identity = await fund(project.id, 'Somchai', 5);

    const first = await reserveTile({
      gameSlug: game.slug,
      boardNumber: 3,
      accountName: 'Somchai',
      idempotencyKey: 'same-key',
    });
    const replay = await reserveTile({
      gameSlug: game.slug,
      boardNumber: 3,
      accountName: 'Somchai',
      idempotencyKey: 'same-key',
    });

    expect(replay.reservationId).toBe(first.reservationId);
    expect(replay.replayed).toBe(true);
    expect(await db.reservation.count({ where: { gameId: game.id } })).toBe(1);
    // Exactly one token spent across both calls.
    expect((await getBalance(identity.id)).total).toBe(4);
  });

  it('rejects a player with no tokens for this game', async () => {
    const allowed = await makeProject();
    const other = await makeProject();
    const game = await makeGame([allowed.id]);
    await openGame(game.id);
    await fund(other.id, 'Somchai', 5); // tokens exist, but for the wrong project

    await expect(
      reserveTile({ gameSlug: game.slug, boardNumber: 1, accountName: 'Somchai', idempotencyKey: 'k' }),
    ).rejects.toThrow(/ไม่เพียงพอ/);

    expect(await db.reservation.count({ where: { gameId: game.id } })).toBe(0);
  });

  it('enforces the per-account tile cap', async () => {
    const project = await makeProject();
    const game = await makeGame([project.id], { maxTilesPerAccount: 2 });
    await openGame(game.id);
    await fund(project.id, 'Somchai', 5);

    await reserveTile({ gameSlug: game.slug, boardNumber: 1, accountName: 'Somchai', idempotencyKey: 'a' });
    await reserveTile({ gameSlug: game.slug, boardNumber: 2, accountName: 'Somchai', idempotencyKey: 'b' });

    await expect(
      reserveTile({ gameSlug: game.slug, boardNumber: 3, accountName: 'Somchai', idempotencyKey: 'c' }),
    ).rejects.toThrow(/สูงสุด 2 ป้าย/);
  });

  it('refuses reservations on a game that is not open', async () => {
    const project = await makeProject();
    const game = await makeGame([project.id]);
    await fund(project.id, 'Somchai', 1);

    await expect(
      reserveTile({ gameSlug: game.slug, boardNumber: 1, accountName: 'Somchai', idempotencyKey: 'k' }),
    ).rejects.toThrow(/ยังไม่เปิดให้จอง/);
  });

  it('flips the game to FULL when the last tile is taken', async () => {
    const project = await makeProject();
    const game = await makeGame([project.id], { tileCount: 3 });
    await openGame(game.id);
    await fund(project.id, 'Somchai', 3);

    for (let n = 1; n <= 3; n++) {
      await reserveTile({
        gameSlug: game.slug,
        boardNumber: n,
        accountName: 'Somchai',
        idempotencyKey: `t${n}`,
      });
    }

    expect((await db.game.findUniqueOrThrow({ where: { id: game.id } })).status).toBe('FULL');
  });
});

describe('reward secrecy', () => {
  it('never exposes reward text before reveal', async () => {
    const project = await makeProject();
    const game = await makeGame([project.id], { tileCount: 3 });
    await openGame(game.id);
    await fund(project.id, 'Somchai', 1);
    await reserveTile({ gameSlug: game.slug, boardNumber: 1, accountName: 'Somchai', idempotencyKey: 'k' });

    const board = await getPublicBoard(game.slug);
    expect(board.status).toBe('OPEN');
    expect(board.tiles.every((t) => t.reward === null)).toBe(true);
    // Consolation lines are not prizes, so nothing in the payload carries a label at all.
    expect(JSON.stringify(board)).not.toContain('รางวัลที่');
    expect(board.prizes).toEqual([]);
    // The commitment is withheld too until it can be checked against a result.
    expect(board.commitmentHash).toBeNull();
  });

  it('lists prize lines before the reveal without exposing which tile holds them', async () => {
    const project = await makeProject();
    const game = await makeGame([project.id], { tileCount: 3 });
    // Two identical vouchers and one grand prize.
    await db.reward.updateMany({
      where: { gameId: game.id, sortOrder: { in: [0, 1] } },
      data: { label: 'บัตรกำนัล', isPrize: true },
    });
    await db.reward.updateMany({
      where: { gameId: game.id, sortOrder: 2 },
      data: { label: 'รางวัลใหญ่', isPrize: true },
    });
    await openGame(game.id);
    await shuffleGame(game.id);

    const board = await getPublicBoard(game.slug);
    // Duplicates collapse into one entry carrying the count, in sortOrder.
    expect(board.prizes).toEqual([
      { label: 'บัตรกำนัล', imageUrl: null, count: 2 },
      { label: 'รางวัลใหญ่', imageUrl: null, count: 1 },
    ]);
    // The catalogue is the only reward data present — the assignment stays hidden.
    expect(board.tiles.every((t) => t.reward === null)).toBe(true);
    expect(JSON.stringify(board.tiles)).not.toContain('บัตรกำนัล');
  });

  it('hides reserver names when the game is configured to', async () => {
    const project = await makeProject();
    const game = await makeGame([project.id], { showReserverNames: false });
    await openGame(game.id);
    await fund(project.id, 'Somchai', 1);
    await reserveTile({ gameSlug: game.slug, boardNumber: 1, accountName: 'Somchai', idempotencyKey: 'k' });

    const board = await getPublicBoard(game.slug);
    const taken = board.tiles.find((t) => t.status === 'RESERVED')!;
    expect(taken.reservedBy).toBeNull();
    expect(JSON.stringify(board)).not.toContain('Somchai');
  });

  it('does not serve DRAFT games publicly at all', async () => {
    const project = await makeProject();
    const game = await makeGame([project.id]);
    await expect(getPublicBoard(game.slug)).rejects.toThrow();
  });
});

describe('revealing', () => {
  async function fillBoard(tileCount: number) {
    const project = await makeProject();
    const game = await makeGame([project.id], { tileCount });
    await openGame(game.id);
    await fund(project.id, 'Somchai', tileCount);
    for (let n = 1; n <= tileCount; n++) {
      await reserveTile({
        gameSlug: game.slug,
        boardNumber: n,
        accountName: 'Somchai',
        idempotencyKey: `t${n}`,
      });
    }
    return game;
  }

  it('cannot reveal while tiles remain unclaimed', async () => {
    const project = await makeProject();
    const game = await makeGame([project.id], { tileCount: 3 });
    await openGame(game.id);
    await fund(project.id, 'Somchai', 1);
    await reserveTile({ gameSlug: game.slug, boardNumber: 1, accountName: 'Somchai', idempotencyKey: 'k' });

    await expect(revealGame(game.id, null)).rejects.toThrow(/เหลืออีก 2 ป้าย/);
    // Still open and still accepting reservations — a failed reveal changes nothing.
    expect((await db.game.findUniqueOrThrow({ where: { id: game.id } })).status).toBe('OPEN');
  });

  it('reveals once the board is full and exposes every reward', async () => {
    const game = await fillBoard(3);

    await revealGame(game.id, null);

    const board = await getPublicBoard(game.slug);
    expect(board.status).toBe('REVEALED');
    expect(board.tiles).toHaveLength(3);
    expect(board.tiles.every((t) => t.reward !== null)).toBe(true);
    expect(board.tiles.every((t) => t.reservedBy === 'Somchai')).toBe(true);
    // Every distinct reward appears exactly once.
    expect(new Set(board.tiles.map((t) => t.reward!.label)).size).toBe(3);
    expect(board.commitmentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses to reveal a full board whose tiles have no reward assigned', async () => {
    // Reproduces a real failure: editing the reward list detaches rewards from
    // tiles. If that happened on an already-OPEN game, the board could fill up and
    // be revealed with every prize blank.
    const game = await fillBoard(2);
    await db.boardTile.updateMany({ where: { gameId: game.id }, data: { rewardId: null } });

    await expect(revealGame(game.id, null)).rejects.toThrow(/ยังไม่ได้จับคู่รางวัล/);
    expect((await db.game.findUniqueOrThrow({ where: { id: game.id } })).status).not.toBe('REVEALED');
  });

  it('records a reveal event and refuses a second reveal', async () => {
    const game = await fillBoard(2);
    await revealGame(game.id, null);

    await expect(revealGame(game.id, null)).rejects.toThrow(/เฉลยผลไปแล้ว/);
    expect(await db.revealEvent.count({ where: { gameId: game.id } })).toBe(1);
  });

  it('keeps the assignment stable after reveal', async () => {
    const game = await fillBoard(3);
    const before = await db.boardTile.findMany({
      where: { gameId: game.id },
      orderBy: { boardNumber: 'asc' },
      select: { boardNumber: true, rewardId: true },
    });

    await revealGame(game.id, null);

    const after = await db.boardTile.findMany({
      where: { gameId: game.id },
      orderBy: { boardNumber: 'asc' },
      select: { boardNumber: true, rewardId: true },
    });
    expect(after).toEqual(before);

    // And the game can no longer be re-shuffled.
    await expect(shuffleGame(game.id)).rejects.toThrow();
  });

  it('rejects further reservations after reveal', async () => {
    const project = await makeProject();
    const game = await makeGame([project.id], { tileCount: 1 });
    await openGame(game.id);
    await fund(project.id, 'Somchai', 2);
    await reserveTile({ gameSlug: game.slug, boardNumber: 1, accountName: 'Somchai', idempotencyKey: 'a' });
    await revealGame(game.id, null);

    await expect(
      reserveTile({ gameSlug: game.slug, boardNumber: 1, accountName: 'Somchai', idempotencyKey: 'b' }),
    ).rejects.toThrow();
  });
});
