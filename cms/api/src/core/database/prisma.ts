import { PrismaClient } from '@prisma/client';
import { config } from '../config/index.js';

/**
 * Prisma client singleton with a soft-delete extension:
 * every `delete`/`deleteMany` on soft-deletable models becomes an update of
 * `deleted_at`, and reads through the extended client filter deleted rows out.
 * Repositories that truly need hard deletes use `prisma.$transaction` with raw
 * model access via `hardDelete()` helpers.
 */
const base = new PrismaClient({
  log: config.isDev ? ['warn', 'error'] : ['error'],
});

export const prisma = base.$extends({
  query: {
    $allModels: {
      async delete({ model, args, query: _query }) {
        return (base as any)[uncap(model)].update({
          where: args.where,
          data: { deletedAt: new Date() },
        });
      },
      async deleteMany({ model, args }) {
        return (base as any)[uncap(model)].updateMany({
          where: args?.where ?? {},
          data: { deletedAt: new Date() },
        });
      },
      async findMany({ args, query }) {
        args.where = { deletedAt: null, ...args.where };
        return query(args);
      },
      async findFirst({ args, query }) {
        args.where = { deletedAt: null, ...args.where };
        return query(args);
      },
      async count({ args, query }) {
        args.where = { deletedAt: null, ...args.where };
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
