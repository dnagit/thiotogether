import { PrismaClient, Prisma } from '@prisma/client';

export const db = new PrismaClient();

/**
 * Wipe every table the game/token suites touch. Order matters only for readability —
 * TRUNCATE ... CASCADE handles the FK graph — but restarting identities keeps ids
 * predictable across runs.
 */
export async function resetDb(): Promise<void> {
  await db.$executeRawUnsafe(`
    TRUNCATE TABLE
      token_ledger_entries, reservations, reveal_events, board_tiles, rewards,
      game_donation_projects, games, token_grants, account_identities,
      donation_logs, donation_verifications, donations,
      donation_project_bank_accounts, donation_projects, bank_accounts,
      audit_logs
    RESTART IDENTITY CASCADE
  `);
}

export async function makeProject(overrides: Partial<Prisma.DonationProjectUncheckedCreateInput> = {}) {
  const n = Math.random().toString(36).slice(2, 8);
  return db.donationProject.create({
    data: {
      name: `Project ${n}`,
      slug: `project-${n}`,
      description: 'test project',
      targetAmount: new Prisma.Decimal(100_000),
      tokenValue: new Prisma.Decimal(50),
      ...overrides,
    },
  });
}

let donationSeq = 0;

export async function makeDonation(
  projectId: number,
  accountName: string,
  amount: number | string,
  overrides: Partial<Prisma.DonationUncheckedCreateInput> = {},
) {
  donationSeq += 1;
  return db.donation.create({
    data: {
      donationCode: `DN-T${String(donationSeq).padStart(6, '0')}`,
      projectId,
      accountName,
      amount: new Prisma.Decimal(amount),
      transferDate: new Date('2026-07-01'),
      transferTime: '10:00',
      slipUrl: 'https://example.test/slip.png',
      status: 'PENDING',
      ...overrides,
    },
  });
}

export async function makeGame(
  projectIds: number[],
  overrides: Partial<Prisma.GameUncheckedCreateInput> = {},
) {
  const n = Math.random().toString(36).slice(2, 8);
  const tileCount = (overrides.tileCount as number) ?? 6;

  const game = await db.game.create({
    data: {
      name: `Game ${n}`,
      slug: `game-${n}`,
      tileCount,
      tokensPerTile: 1,
      ...overrides,
    },
  });

  await db.gameDonationProject.createMany({
    data: projectIds.map((projectId) => ({ gameId: game.id, projectId })),
  });
  await db.boardTile.createMany({
    data: Array.from({ length: tileCount }, (_, i) => ({ gameId: game.id, boardNumber: i + 1 })),
  });
  await db.reward.createMany({
    data: Array.from({ length: tileCount }, (_, i) => ({
      gameId: game.id,
      label: `รางวัลที่ ${i + 1}`,
      sortOrder: i,
    })),
  });

  return db.game.findUniqueOrThrow({ where: { id: game.id } });
}

/** Sum of every ledger delta — must always equal the sum of remaining balances. */
export async function ledgerBalance(accountIdentityId: number): Promise<number> {
  const agg = await db.tokenLedgerEntry.aggregate({
    where: { accountIdentityId },
    _sum: { delta: true },
  });
  return agg._sum.delta ?? 0;
}
