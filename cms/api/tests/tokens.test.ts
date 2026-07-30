import { beforeEach, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { db, ledgerBalance, makeDonation, makeProject, resetDb } from './helpers/db.js';
import { calculateTokens } from '../src/core/tokens/tokenMath.js';
import { normalizeAccountName, cleanDisplayName, assertValidAccountName } from '../src/core/tokens/accountName.js';
import {
  getBalance,
  grantTokensForDonation,
  resolveAccountIdentity,
  revokeTokensForDonation,
  spendTokens,
} from '../src/core/tokens/tokenService.js';

beforeEach(resetDb);

describe('token maths', () => {
  it('floors each donation independently and never pools remainders', () => {
    // The rule from the brief: 120฿ and 130฿ at 50฿/token give 2 + 2 = 4,
    // NOT floor(250/50) = 5.
    const first = calculateTokens(120, 50);
    const second = calculateTokens(130, 50);

    expect(first.tokens).toBe(2);
    expect(first.remainder.toString()).toBe('20');
    expect(second.tokens).toBe(2);
    expect(second.remainder.toString()).toBe('30');
    expect(first.tokens + second.tokens).toBe(4);

    // The pooled figure a naive implementation would produce.
    expect(calculateTokens(250, 50).tokens).toBe(5);
  });

  it('uses exact decimal arithmetic, not floating point', () => {
    // 0.1 + 0.2 style drift would make this 2 instead of 3.
    expect(calculateTokens('0.3', '0.1').tokens).toBe(3);
    expect(calculateTokens('100.00', '33.33').tokens).toBe(3);
    expect(calculateTokens('100.00', '33.33').remainder.toString()).toBe('0.01');
  });

  it('grants nothing below one token and rejects a non-positive token value', () => {
    expect(calculateTokens(49, 50).tokens).toBe(0);
    expect(calculateTokens(0, 50).tokens).toBe(0);
    expect(() => calculateTokens(100, 0)).toThrow();
  });
});

describe('account name normalization', () => {
  it('folds case, trims, and collapses repeated whitespace to one identity', () => {
    const variants = ['  Somchai   Jaidee ', 'somchai jaidee', 'SOMCHAI JAIDEE', 'Somchai\tJaidee'];
    const normalized = variants.map(normalizeAccountName);
    expect(new Set(normalized).size).toBe(1);
    expect(normalized[0]).toBe('somchai jaidee');
  });

  it('strips zero-width characters that would silently fork an account', () => {
    expect(normalizeAccountName('som​chai')).toBe('somchai');
  });

  it('keeps the original casing for display', () => {
    expect(cleanDisplayName('  Somchai   Jaidee ')).toBe('Somchai Jaidee');
  });

  it('handles Thai names', () => {
    expect(normalizeAccountName('  สมชาย   ใจดี  ')).toBe('สมชาย ใจดี');
  });

  it('enforces the admin-configured pattern', () => {
    expect(() => assertValidAccountName('ab', '^[A-Za-z0-9_]+$')).not.toThrow();
    expect(() => assertValidAccountName('สมชาย', '^[A-Za-z0-9_]+$')).toThrow();
    // A broken admin pattern must not lock everyone out.
    expect(() => assertValidAccountName('anyone', '([unclosed')).not.toThrow();
  });

  it('rejects names that are too short', () => {
    expect(() => assertValidAccountName('a')).toThrow();
  });

  it('routes differently-typed names to the same identity row', async () => {
    const a = await resolveAccountIdentity('  Somchai   Jaidee ');
    const b = await resolveAccountIdentity('somchai jaidee');
    expect(b.id).toBe(a.id);
    // Latest spelling wins for display.
    expect(b.displayName).toBe('somchai jaidee');
  });
});

describe('granting tokens on approval', () => {
  it('mints floor(amount / tokenValue) and records a ledger entry', async () => {
    const project = await makeProject({ tokenValue: new Prisma.Decimal(50) });
    const donation = await makeDonation(project.id, 'Somchai', 120);

    const result = await grantTokensForDonation(donation.id, null);

    expect(result).toMatchObject({ granted: true, tokens: 2 });

    const identity = await db.accountIdentity.findUniqueOrThrow({
      where: { normalizedName: 'somchai' },
    });
    expect(await ledgerBalance(identity.id)).toBe(2);

    const grant = await db.tokenGrant.findUniqueOrThrow({ where: { donationId: donation.id } });
    expect(grant.remainderAmount.toString()).toBe('20');
    // The rate is snapshotted so later repricing cannot change what was earned.
    expect(grant.tokenValueAtGrant.toString()).toBe('50');
  });

  it('is idempotent: approving the same submission twice does not mint twice', async () => {
    const project = await makeProject({ tokenValue: new Prisma.Decimal(50) });
    const donation = await makeDonation(project.id, 'Somchai', 120);

    const first = await grantTokensForDonation(donation.id, null);
    const second = await grantTokensForDonation(donation.id, null);
    const third = await grantTokensForDonation(donation.id, null);

    expect(first.granted).toBe(true);
    expect(second).toMatchObject({ granted: false, reason: 'already_granted' });
    expect(third.granted).toBe(false);

    const identity = await db.accountIdentity.findUniqueOrThrow({
      where: { normalizedName: 'somchai' },
    });
    expect(await ledgerBalance(identity.id)).toBe(2);
    expect(await db.tokenGrant.count({ where: { donationId: donation.id } })).toBe(1);
  });

  it('survives concurrent approvals of the same submission', async () => {
    const project = await makeProject({ tokenValue: new Prisma.Decimal(50) });
    const donation = await makeDonation(project.id, 'Somchai', 500);

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => grantTokensForDonation(donation.id, null)),
    );
    const minted = results.filter(
      (r) => r.status === 'fulfilled' && r.value.granted,
    );

    expect(minted).toHaveLength(1);
    expect(await db.tokenGrant.count({ where: { donationId: donation.id } })).toBe(1);
  });

  it('accumulates tokens per account across separate submissions', async () => {
    const project = await makeProject({ tokenValue: new Prisma.Decimal(50) });
    const first = await makeDonation(project.id, 'Somchai Jaidee', 120);
    const second = await makeDonation(project.id, 'somchai   jaidee', 130);

    await grantTokensForDonation(first.id, null);
    await grantTokensForDonation(second.id, null);

    const identity = await db.accountIdentity.findUniqueOrThrow({
      where: { normalizedName: 'somchai jaidee' },
    });
    const balance = await getBalance(identity.id);
    expect(balance.total).toBe(4);
  });

  it('grants nothing when the project has no token value configured', async () => {
    const project = await makeProject({ tokenValue: null });
    const donation = await makeDonation(project.id, 'Somchai', 500);

    const result = await grantTokensForDonation(donation.id, null);
    expect(result).toMatchObject({ granted: false, reason: 'project_has_no_token_value' });
  });
});

describe('spending tokens', () => {
  async function seedGrants(accountName: string, specs: Array<{ amount: number; projectId: number }>) {
    for (const spec of specs) {
      const donation = await makeDonation(spec.projectId, accountName, spec.amount);
      await grantTokensForDonation(donation.id, null);
    }
    return db.accountIdentity.findUniqueOrThrow({
      where: { normalizedName: normalizeAccountName(accountName) },
    });
  }

  it('refuses to overspend and leaves the balance untouched', async () => {
    const project = await makeProject({ tokenValue: new Prisma.Decimal(50) });
    const identity = await seedGrants('Somchai', [{ amount: 100, projectId: project.id }]);

    await expect(
      db.$transaction((tx) =>
        spendTokens(tx, {
          accountIdentityId: identity.id,
          projectIds: [project.id],
          amount: 3,
          description: 'overspend attempt',
        }),
      ),
    ).rejects.toThrow(/ไม่เพียงพอ/);

    expect((await getBalance(identity.id)).total).toBe(2);
    expect(await ledgerBalance(identity.id)).toBe(2);
  });

  it('never lets a balance go negative under concurrent spends', async () => {
    const project = await makeProject({ tokenValue: new Prisma.Decimal(50) });
    const identity = await seedGrants('Somchai', [{ amount: 150, projectId: project.id }]); // 3 tokens

    // Ten simultaneous single-token spends against a balance of three.
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        db.$transaction((tx) =>
          spendTokens(tx, {
            accountIdentityId: identity.id,
            projectIds: [project.id],
            amount: 1,
            description: 'concurrent spend',
          }),
        ),
      ),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    expect(succeeded).toBe(3);
    expect((await getBalance(identity.id)).total).toBe(0);
    expect(await ledgerBalance(identity.id)).toBe(0);

    const grants = await db.tokenGrant.findMany({ where: { accountIdentityId: identity.id } });
    expect(grants.every((g) => g.tokensRemaining >= 0)).toBe(true);
  });

  it('cannot spend tokens from a project the game does not accept', async () => {
    const allowed = await makeProject({ tokenValue: new Prisma.Decimal(50) });
    const other = await makeProject({ tokenValue: new Prisma.Decimal(50) });
    const identity = await seedGrants('Somchai', [{ amount: 500, projectId: other.id }]);

    // Ten tokens exist, but none of them belong to the allowed project.
    expect((await getBalance(identity.id)).total).toBe(10);
    expect((await getBalance(identity.id, [allowed.id])).total).toBe(0);

    await expect(
      db.$transaction((tx) =>
        spendTokens(tx, {
          accountIdentityId: identity.id,
          projectIds: [allowed.id],
          amount: 1,
          description: 'wrong project',
        }),
      ),
    ).rejects.toThrow(/ไม่เพียงพอ/);
  });

  it('consumes soonest-expiring tokens first, then oldest first', async () => {
    const project = await makeProject({ tokenValue: new Prisma.Decimal(50) });
    const identity = await resolveAccountIdentity('Somchai');

    const mkGrant = async (tokens: number, expiresAt: Date | null, createdAt: Date) => {
      const donation = await makeDonation(project.id, 'Somchai', tokens * 50);
      return db.tokenGrant.create({
        data: {
          accountIdentityId: identity.id,
          projectId: project.id,
          donationId: donation.id,
          tokensGranted: tokens,
          tokensRemaining: tokens,
          tokenValueAtGrant: new Prisma.Decimal(50),
          donationAmount: new Prisma.Decimal(tokens * 50),
          remainderAmount: new Prisma.Decimal(0),
          expiresAt,
          createdAt,
        },
      });
    };

    const never = await mkGrant(1, null, new Date('2026-01-01'));
    const late = await mkGrant(1, new Date('2027-12-01'), new Date('2026-01-02'));
    const soon = await mkGrant(1, new Date('2026-12-01'), new Date('2026-01-03'));

    await db.$transaction((tx) =>
      spendTokens(tx, {
        accountIdentityId: identity.id,
        projectIds: [project.id],
        amount: 2,
        description: 'ordering check',
      }),
    );

    // Expiring soonest goes first, then the later expiry; the never-expiring grant survives.
    expect((await db.tokenGrant.findUniqueOrThrow({ where: { id: soon.id } })).tokensRemaining).toBe(0);
    expect((await db.tokenGrant.findUniqueOrThrow({ where: { id: late.id } })).tokensRemaining).toBe(0);
    expect((await db.tokenGrant.findUniqueOrThrow({ where: { id: never.id } })).tokensRemaining).toBe(1);
  });

  it('ignores already-expired tokens', async () => {
    const project = await makeProject({ tokenValue: new Prisma.Decimal(50), tokenTtlDays: 1 });
    const donation = await makeDonation(project.id, 'Somchai', 100);
    await grantTokensForDonation(donation.id, null);

    const identity = await db.accountIdentity.findUniqueOrThrow({
      where: { normalizedName: 'somchai' },
    });
    await db.tokenGrant.updateMany({
      where: { accountIdentityId: identity.id },
      data: { expiresAt: new Date('2020-01-01') },
    });

    expect((await getBalance(identity.id)).total).toBe(0);
  });
});

describe('un-approving a donation', () => {
  it('revokes the unspent tokens and writes a ledger entry', async () => {
    const project = await makeProject({ tokenValue: new Prisma.Decimal(50) });
    const donation = await makeDonation(project.id, 'Somchai', 200);
    await grantTokensForDonation(donation.id, null);

    const identity = await db.accountIdentity.findUniqueOrThrow({
      where: { normalizedName: 'somchai' },
    });
    expect((await getBalance(identity.id)).total).toBe(4);

    const result = await revokeTokensForDonation(donation.id, null);
    expect(result.revoked).toBe(4);
    expect((await getBalance(identity.id)).total).toBe(0);
    expect(await ledgerBalance(identity.id)).toBe(0);
  });

  it('reports a shortfall instead of going negative when tokens were already spent', async () => {
    const project = await makeProject({ tokenValue: new Prisma.Decimal(50) });
    const donation = await makeDonation(project.id, 'Somchai', 100);
    await grantTokensForDonation(donation.id, null);

    const identity = await db.accountIdentity.findUniqueOrThrow({
      where: { normalizedName: 'somchai' },
    });
    await db.$transaction((tx) =>
      spendTokens(tx, {
        accountIdentityId: identity.id,
        projectIds: [project.id],
        amount: 1,
        description: 'spent before revoke',
      }),
    );

    const result = await revokeTokensForDonation(donation.id, null);
    expect(result).toMatchObject({ revoked: 1, shortfall: 1 });
    expect((await getBalance(identity.id)).total).toBe(0);

    const grants = await db.tokenGrant.findMany({ where: { accountIdentityId: identity.id } });
    expect(grants.every((g) => g.tokensRemaining >= 0)).toBe(true);
  });
});
