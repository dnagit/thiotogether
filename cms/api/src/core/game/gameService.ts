import { createHash, randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { rawPrisma } from '../database/prisma.js';
import { BadRequestError, ConflictError, NotFoundError } from '../errors/AppError.js';
import { resolveAccountIdentity, spendTokens } from '../tokens/tokenService.js';
import { assertValidAccountName } from '../tokens/accountName.js';

type Tx = Prisma.TransactionClient;

/**
 * Board-game rules. The security-critical property of this module is that reward
 * text never leaves the server before the game is REVEALED — every read path here
 * that a player can reach selects tile fields explicitly and omits `reward`.
 */

/** Cryptographically secure Fisher–Yates. `Math.random` is unacceptable here. */
function secureShuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Commitment to the tile→reward assignment, stored at shuffle time so the result
 * can be proven unchanged afterwards.
 */
function commitmentFor(pairs: Array<{ boardNumber: number; rewardId: number }>): string {
  const canonical = [...pairs]
    .sort((a, b) => a.boardNumber - b.boardNumber)
    .map((p) => `${p.boardNumber}:${p.rewardId}`)
    .join('|');
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Assign every reward to exactly one tile. Refuses once any reservation exists —
 * re-rolling a game people have already played would rewrite their outcomes.
 */
export async function shuffleGame(gameId: number, client: Tx = rawPrisma): Promise<string> {
  const game = await client.game.findUnique({
    where: { id: gameId },
    include: { rewards: { where: { deletedAt: null } }, tiles: true, _count: { select: { reservations: true } } },
  });
  if (!game) throw new NotFoundError('Game');

  if (game._count.reservations > 0) {
    throw new ConflictError('เกมนี้มีผู้จองแล้ว ไม่สามารถสุ่มรางวัลใหม่ได้');
  }
  if (game.status === 'REVEALED') {
    throw new ConflictError('เกมนี้เฉลยแล้ว ไม่สามารถสุ่มใหม่ได้');
  }
  if (game.rewards.length !== game.tileCount) {
    throw new BadRequestError(
      `จำนวนรางวัล (${game.rewards.length}) ต้องเท่ากับจำนวนป้าย (${game.tileCount})`,
    );
  }
  if (game.tiles.length !== game.tileCount) {
    throw new BadRequestError('จำนวนป้ายในระบบไม่ตรงกับที่ตั้งค่าไว้');
  }

  const shuffled = secureShuffle(game.rewards.map((r) => r.id));
  const tiles = [...game.tiles].sort((a, b) => a.boardNumber - b.boardNumber);

  // Clear first: `board_tiles.reward_id` is globally unique, so reassigning without
  // detaching would collide with the previous round's assignment.
  await client.boardTile.updateMany({ where: { gameId }, data: { rewardId: null } });

  const pairs: Array<{ boardNumber: number; rewardId: number }> = [];
  for (let i = 0; i < tiles.length; i++) {
    await client.boardTile.update({ where: { id: tiles[i].id }, data: { rewardId: shuffled[i] } });
    pairs.push({ boardNumber: tiles[i].boardNumber, rewardId: shuffled[i] });
  }

  const hash = commitmentFor(pairs);
  await client.game.update({
    where: { id: gameId },
    data: { shuffledAt: new Date(), commitmentHash: hash },
  });
  return hash;
}

/** Publish a game: validates prerequisites, shuffles if needed, flips to OPEN. */
export async function openGame(gameId: number, client: Tx = rawPrisma) {
  const game = await client.game.findUnique({
    where: { id: gameId },
    include: { rewards: { where: { deletedAt: null } }, projects: true },
  });
  if (!game) throw new NotFoundError('Game');
  if (game.status === 'REVEALED') throw new ConflictError('เกมนี้เฉลยแล้ว');

  if (game.rewards.length !== game.tileCount) {
    throw new BadRequestError(
      `เปิดเกมไม่ได้: มีข้อความรางวัล ${game.rewards.length} รายการ แต่ต้องมี ${game.tileCount} รายการ เท่ากับจำนวนป้าย`,
    );
  }
  if (game.projects.length === 0) {
    throw new BadRequestError('เปิดเกมไม่ได้: ต้องเลือกโครงการบริจาคที่ใช้ token กับเกมนี้ได้อย่างน้อย 1 โครงการ');
  }

  if (!game.shuffledAt) await shuffleGame(gameId, client);

  return client.game.update({ where: { id: gameId }, data: { status: 'OPEN' } });
}

export interface ReserveInput {
  gameSlug: string;
  boardNumber: number;
  accountName: string;
  idempotencyKey: string;
}

export interface ReserveOutcome {
  reservationId: number;
  boardNumber: number;
  tokensSpent: number;
  remainingTokens: number;
  reservedCount: number;
  tileCount: number;
  gameStatus: string;
  /** True when this call replayed an earlier identical request instead of taking a new tile. */
  replayed: boolean;
}

/**
 * Claim one tile. Everything — the uniqueness check, the reservation row, the token
 * deduction and the ledger entries — happens in a single transaction, so a failure
 * at any point leaves both the board and the balance untouched.
 *
 * Concurrency is settled by the database, not by application checks: two players
 * racing for the same tile both attempt the insert and the loser hits the unique
 * constraint on `reservations.tile_id`.
 */
export async function reserveTile(
  input: ReserveInput,
  accountNamePattern?: string | null,
): Promise<ReserveOutcome> {
  const displayName = assertValidAccountName(input.accountName, accountNamePattern);

  return rawPrisma.$transaction(
    async (tx) => {
      const game = await tx.game.findUnique({
        where: { slug: input.gameSlug },
        include: { projects: true },
      });
      if (!game || game.deletedAt) throw new NotFoundError('Game');

      const identity = await resolveAccountIdentity(displayName, tx);

      // Replay guard: the same key always yields the same reservation, so a
      // double-click or a retried request can never consume a second tile.
      const prior = await tx.reservation.findUnique({
        where: { gameId_idempotencyKey: { gameId: game.id, idempotencyKey: input.idempotencyKey } },
        include: { tile: { select: { boardNumber: true } } },
      });
      if (prior) {
        const [reservedCount, balance] = await Promise.all([
          tx.reservation.count({ where: { gameId: game.id } }),
          sumSpendable(tx, identity.id, game.projects.map((p) => p.projectId)),
        ]);
        return {
          reservationId: prior.id,
          boardNumber: prior.tile.boardNumber,
          tokensSpent: prior.tokensSpent,
          remainingTokens: balance,
          reservedCount,
          tileCount: game.tileCount,
          gameStatus: game.status,
          replayed: true,
        };
      }

      if (game.status !== 'OPEN') {
        throw new ConflictError(
          game.status === 'REVEALED'
            ? 'เกมนี้เฉลยผลแล้ว'
            : game.status === 'FULL'
              ? 'ป้ายทั้งหมดถูกจองครบแล้ว'
              : 'เกมนี้ยังไม่เปิดให้จอง',
        );
      }
      const now = new Date();
      if (game.opensAt && game.opensAt > now) throw new ConflictError('ยังไม่ถึงเวลาเปิดจอง');
      if (game.closesAt && game.closesAt < now) throw new ConflictError('ปิดรับจองแล้ว');

      if (game.maxTilesPerAccount !== null) {
        const mine = await tx.reservation.count({
          where: { gameId: game.id, accountIdentityId: identity.id },
        });
        if (mine >= game.maxTilesPerAccount) {
          throw new ConflictError(
            `บัญชีนี้จองครบสูงสุด ${game.maxTilesPerAccount} ป้ายแล้ว`,
          );
        }
      }

      const tile = await tx.boardTile.findUnique({
        where: { gameId_boardNumber: { gameId: game.id, boardNumber: input.boardNumber } },
      });
      if (!tile) throw new NotFoundError('ป้ายหมายเลขนี้');

      const projectIds = game.projects.map((p) => p.projectId);

      // Insert first: if the tile is gone we fail here, before touching any tokens.
      let reservation;
      try {
        reservation = await tx.reservation.create({
          data: {
            gameId: game.id,
            tileId: tile.id,
            accountIdentityId: identity.id,
            accountNameSnapshot: displayName,
            tokensSpent: game.tokensPerTile,
            idempotencyKey: input.idempotencyKey,
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new ConflictError('ป้ายนี้ถูกจองไปแล้ว กรุณาเลือกป้ายอื่น');
        }
        throw err;
      }

      await spendTokens(tx, {
        accountIdentityId: identity.id,
        projectIds,
        amount: game.tokensPerTile,
        reservationId: reservation.id,
        description: `จองป้ายหมายเลข ${input.boardNumber} เกม ${game.name}`,
      });

      const reservedCount = await tx.reservation.count({ where: { gameId: game.id } });
      let gameStatus: string = game.status;
      if (reservedCount >= game.tileCount) {
        await tx.game.update({ where: { id: game.id }, data: { status: 'FULL' } });
        gameStatus = 'FULL';
      }

      return {
        reservationId: reservation.id,
        boardNumber: input.boardNumber,
        tokensSpent: game.tokensPerTile,
        remainingTokens: await sumSpendable(tx, identity.id, projectIds),
        reservedCount,
        tileCount: game.tileCount,
        gameStatus,
        replayed: false,
      };
    },
    // Serializable would also be correct, but the unique constraints already make
    // the race safe and this avoids spurious retries under load.
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15_000 },
  );
}

async function sumSpendable(tx: Tx, accountIdentityId: number, projectIds: number[]): Promise<number> {
  const agg = await tx.tokenGrant.aggregate({
    where: {
      accountIdentityId,
      projectId: { in: projectIds },
      tokensRemaining: { gt: 0 },
      deletedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    _sum: { tokensRemaining: true },
  });
  return agg._sum.tokensRemaining ?? 0;
}

/** Flip a full game to REVEALED. Refuses while any tile is unclaimed. */
export async function revealGame(gameId: number, actorId: number | null) {
  return rawPrisma.$transaction(async (tx) => {
    const game = await tx.game.findUnique({
      where: { id: gameId },
      include: { _count: { select: { reservations: true } } },
    });
    if (!game) throw new NotFoundError('Game');
    if (game.status === 'REVEALED') throw new ConflictError('เกมนี้เฉลยผลไปแล้ว');

    const remaining = game.tileCount - game._count.reservations;
    if (remaining > 0) {
      throw new ConflictError(`ยังเฉลยไม่ได้ เหลืออีก ${remaining} ป้ายที่ยังไม่ถูกจอง`);
    }

    // Last line of defence. Editing rewards detaches them from tiles, so a game
    // whose rewards were changed after opening can reach a full board with nothing
    // assigned. Revealing that would show every player an empty prize.
    const unassigned = await tx.boardTile.count({ where: { gameId, rewardId: null } });
    if (unassigned > 0) {
      throw new ConflictError(
        `ยังเฉลยไม่ได้: มี ${unassigned} ป้ายที่ยังไม่ได้จับคู่รางวัล กรุณากดสุ่มจับคู่รางวัลก่อน`,
      );
    }

    await tx.revealEvent.create({
      data: {
        gameId,
        revealedById: actorId,
        tileCount: game.tileCount,
        commitmentHash: game.commitmentHash,
      },
    });

    return tx.game.update({
      where: { id: gameId },
      data: { status: 'REVEALED', revealedAt: new Date() },
    });
  });
}

/**
 * Board state for players. Reward fields are included **only** once the game is
 * REVEALED — this function is the single source of what a player may see.
 */
export async function getPublicBoard(slug: string) {
  const game = await rawPrisma.game.findFirst({
    where: { slug, deletedAt: null, status: { not: 'DRAFT' } },
    include: {
      projects: { include: { project: { select: { id: true, name: true, slug: true, tokenValue: true } } } },
      tiles: {
        orderBy: { boardNumber: 'asc' },
        include: {
          reservation: { select: { accountNameSnapshot: true, createdAt: true } },
          reward: { select: { label: true, imageUrl: true, isPrize: true } },
        },
      },
      /**
       * The prize catalogue — what players can win, shown before the reveal.
       *
       * Read straight off the game in `sortOrder`, never through `tiles`: the reward→tile
       * assignment lives on BoardTile, so an order that never touches it cannot leak which
       * tile holds what. Consolation lines are excluded, matching the winners board.
       */
      rewards: {
        where: { isPrize: true, deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: { label: true, imageUrl: true },
      },
    },
  });
  if (!game) throw new NotFoundError('Game');

  const revealed = game.status === 'REVEALED';

  // Identical prize lines are one entry with a count — a board with ten of the same
  // voucher should read "×10", not ten repeated rows.
  const prizes = new Map<string, { label: string; imageUrl: string | null; count: number }>();
  for (const r of game.rewards) {
    const key = `${r.label} ${r.imageUrl ?? ''}`;
    const row = prizes.get(key) ?? { label: r.label, imageUrl: r.imageUrl, count: 0 };
    row.count += 1;
    prizes.set(key, row);
  }

  return {
    id: game.id,
    name: game.name,
    slug: game.slug,
    description: game.description,
    coverImage: game.coverImage,
    status: game.status,
    tileCount: game.tileCount,
    tileFrontImage: game.tileFrontImage,
    tokensPerTile: game.tokensPerTile,
    themeColor: game.themeColor,
    maxTilesPerAccount: game.maxTilesPerAccount,
    showReserverNames: game.showReserverNames,
    opensAt: game.opensAt,
    closesAt: game.closesAt,
    revealedAt: game.revealedAt,
    commitmentHash: revealed ? game.commitmentHash : null,
    reservedCount: game.tiles.filter((t) => t.reservation).length,
    projects: game.projects.map((p) => p.project),
    /** What this game gives away, available at every stage — it says nothing about where. */
    prizes: [...prizes.values()],
    tiles: game.tiles.map((tile) => ({
      boardNumber: tile.boardNumber,
      frontImage: tile.frontImage ?? game.tileFrontImage,
      status: tile.reservation ? (revealed ? 'REVEALED' : 'RESERVED') : 'AVAILABLE',
      // Names are withheld until reveal when the game is configured to hide them.
      reservedBy: tile.reservation
        ? game.showReserverNames || revealed
          ? tile.reservation.accountNameSnapshot
          : null
        : null,
      // The whole point of the pre-reveal contract: no reward data crosses the wire.
      reward:
        revealed && tile.reward
          ? { label: tile.reward.label, imageUrl: tile.reward.imageUrl, isPrize: tile.reward.isPrize }
          : null,
    })),
    /**
     * Winners board: prize lines that ended up on a reserved tile, in board order. Empty until the
     * reveal for the same reason the tile rewards are — it would leak the assignment.
     */
    winners: revealed
      ? game.tiles
          .filter((t) => t.reward?.isPrize && t.reservation)
          .map((t) => ({
            boardNumber: t.boardNumber,
            label: t.reward!.label,
            imageUrl: t.reward!.imageUrl,
            winner: t.reservation!.accountNameSnapshot,
          }))
      : [],
  };
}
