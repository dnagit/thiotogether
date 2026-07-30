import 'dotenv/config';

/**
 * Tests run against a real PostgreSQL database — the guarantees under test
 * (unique constraints, row locks, transaction rollback) do not exist in a mock.
 *
 * Point TEST_DATABASE_URL at a throwaway database; it is truncated between suites.
 */
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

if (!process.env.JWT_ACCESS_SECRET) {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-long-enough-32';
}
if (!process.env.JWT_REFRESH_SECRET) {
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-32';
}
process.env.NODE_ENV = 'test';
process.env.OCR_PROVIDER = 'none';
