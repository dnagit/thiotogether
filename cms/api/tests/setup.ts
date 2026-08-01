import 'dotenv/config';

/**
 * Tests run against a real PostgreSQL database — the guarantees under test
 * (unique constraints, row locks, transaction rollback) do not exist in a mock.
 *
 * Point TEST_DATABASE_URL at a throwaway database; it is truncated between suites.
 *
 * The suite TRUNCATEs every table it touches, so it must never be able to reach the
 * development database. Falling back to DATABASE_URL when TEST_DATABASE_URL is unset
 * would do exactly that, silently — refusing to start is the only safe default.
 */
if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    'TEST_DATABASE_URL is not set. The test suite truncates every table it touches, so it ' +
      'refuses to run rather than fall back to DATABASE_URL. Point it at a throwaway database, ' +
      'e.g. TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:54322/cms_test?schema=public"',
  );
}
if (process.env.TEST_DATABASE_URL === process.env.DATABASE_URL) {
  throw new Error(
    'TEST_DATABASE_URL points at the same database as DATABASE_URL. Refusing to truncate the ' +
      'development database — use a separate one.',
  );
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

if (!process.env.JWT_ACCESS_SECRET) {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-long-enough-32';
}
if (!process.env.JWT_REFRESH_SECRET) {
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-32';
}
process.env.NODE_ENV = 'test';
process.env.OCR_PROVIDER = 'none';
