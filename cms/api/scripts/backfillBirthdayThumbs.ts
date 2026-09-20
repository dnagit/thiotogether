/**
 * One-off backfill: a wall thumbnail for every birthday wish photo uploaded before
 * `photo_thumb_url` existed.
 *
 *   npm run birthday:thumbs -w api
 *   npm run birthday:thumbs -w api -- --slug=birthday   # one event only
 *   npm run birthday:thumbs -w api -- --force           # redo rows that already have one
 *
 * Safe to re-run and safe to interrupt: each wish is committed as it is done, and rows that
 * already have a thumbnail are skipped unless `--force` says otherwise.
 *
 * It runs *after* the deploy, not instead of part of it — the column has to exist and the
 * generated client has to know about it:
 *
 *   npm run prisma:generate      # from cms/, not `npx prisma` — see the README
 *   npm run prisma:deploy
 *   npm run build                # the API reads and writes the column too
 *   npm run birthday:thumbs -w api
 *
 * Skipping the first step is the one failure that does not look like itself: the migration
 * has applied, the database has the column, and Prisma still answers `Unknown argument
 * \`photoThumbUrl\`` — because the client in `node_modules` was generated from the old
 * schema and is what actually builds the query.
 *
 * The original is fetched over its own public URL rather than read out of storage, because
 * {@link StorageProvider} only writes — and going through the URL means the same script
 * works whether the files sit on disk or in S3. That does mean APP_URL has to be reachable
 * from wherever this runs.
 */
import { PrismaClient } from '@prisma/client';
import { makePhotoThumb } from '../src/modules/public-birthday/photoThumb.js';

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const force = args.includes('--force');
const slug = args.find((a) => a.startsWith('--slug='))?.slice('--slug='.length);

/**
 * The storage key the file was written under, recovered from its URL.
 *
 * Both drivers put the key at the end of the path behind a fixed prefix — `/uploads/` for
 * local, the bucket root for S3 — and the wish keys all start `birthday/`, so that is the
 * marker to cut at. A URL that does not contain it is left alone rather than guessed at.
 */
function keyFromUrl(url: string): string | null {
  const { pathname } = new URL(url);
  const at = pathname.indexOf('birthday/');
  return at < 0 ? null : decodeURIComponent(pathname.slice(at));
}

async function main(): Promise<void> {
  const wishes = await prisma.birthdayWish.findMany({
    where: {
      photoUrl: { not: null },
      ...(force ? {} : { photoThumbUrl: null }),
      ...(slug ? { event: { slug } } : {}),
    },
    select: { id: true, photoUrl: true },
    orderBy: { id: 'asc' },
  });

  console.log(`🎈 ${wishes.length} wish photo(s) to size down`);
  let done = 0;
  let failed = 0;

  for (const wish of wishes) {
    const url = wish.photoUrl!;
    try {
      const key = keyFromUrl(url);
      if (!key) throw new Error(`cannot derive a storage key from ${url}`);

      const response = await fetch(url);
      if (!response.ok) throw new Error(`GET ${url} → ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());

      const thumbUrl = await makePhotoThumb(buffer, key);
      if (!thumbUrl) throw new Error('sharp could not read the image');

      await prisma.birthdayWish.update({
        where: { id: wish.id },
        data: { photoThumbUrl: thumbUrl },
      });
      done++;
      if (done % 20 === 0) console.log(`   …${done}/${wishes.length}`);
    } catch (err) {
      // Reported and skipped, never fatal: one unreadable upload must not stop the other
      // two hundred, and a wish left without a thumbnail still shows its original.
      failed++;
      console.warn(`   ✗ wish ${wish.id}: ${(err as Error).message}`);
    }
  }

  console.log(`✅ ${done} done${failed ? `, ${failed} skipped` : ''}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
