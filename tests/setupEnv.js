// Variables de entorno para pruebas: nunca se usan secretos reales.
process.env.NODE_ENV = 'test';
process.env.JWT_KEY = process.env.TEST_JWT_KEY || 'test-secret-key-only-for-automated-tests-0123456789';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || '';
if (process.env.TEST_DB_HOST) {
  process.env.DB_HOST = process.env.TEST_DB_HOST;
  process.env.DB_PORT = process.env.TEST_DB_PORT || '3306';
  process.env.DB_USER = process.env.TEST_DB_USER;
  process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD || '';
  process.env.DB_NAME = process.env.TEST_DB_NAME;
}
