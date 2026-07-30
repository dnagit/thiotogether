import { Prisma, PrismaClient } from '@prisma/client';
import { config } from '../config/index.js';

/**
 * Models that actually carry a `deleted_at` column, read off the datamodel so it
 * stays in sync with schema.prisma. Pure join tables (role_permissions,
 * donation_project_bank_accounts) have no such column, and rewriting their reads
 * and deletes below would fail with "Unknown argument `deletedAt`" — so they pass
 * through untouched and delete for real, which is what a join row should do.
 */
const softDeletable = new Set(
  Prisma.dmmf.datamodel.models
    .filter((model) => model.fields.some((field) => field.name === 'deletedAt'))
    .map((model) => model.name),
);

/**
 * Prisma client singleton with a soft-delete extension:
 * every `delete`/`deleteMany` on soft-deletable models becomes an update of
 * `deleted_at`, and reads through the extended client filter deleted rows out.
 * Repositories that truly need hard deletes use `prisma.$transaction` with raw
 * model access via `hardDelete()` helpers.
 */
const base = new PrismaClient({
  // Tests deliberately provoke constraint violations to prove the guards work;
  // logging each one buries the actual results.
  log: config.NODE_ENV === 'test' ? [] : config.isDev ? ['warn', 'error'] : ['error'],
});

export const prisma = base.$extends({
  query: {
    $allModels: {
      async delete({ model, args, query }) {
        if (!softDeletable.has(model)) return query(args);
        return (base as any)[uncap(model)].update({
          where: args.where,
          data: { deletedAt: new Date() },
        });
      },
      async deleteMany({ model, args, query }) {
        if (!softDeletable.has(model)) return query(args);
        return (base as any)[uncap(model)].updateMany({
          where: args?.where ?? {},
          data: { deletedAt: new Date() },
        });
      },
      async findMany({ model, args, query }) {
        if (softDeletable.has(model)) args.where = { deletedAt: null, ...args.where };
        return query(args);
      },
      async findFirst({ model, args, query }) {
        if (softDeletable.has(model)) args.where = { deletedAt: null, ...args.where };
        return query(args);
      },
      async count({ model, args, query }) {
        if (softDeletable.has(model)) args.where = { deletedAt: null, ...args.where };
        return query(args);
      },
    },
  },
});

function uncap(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** Raw client for migrations/seeding/hard deletes where soft-delete must be bypassed. */
export const rawPrisma = base;

export type PrismaTx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
