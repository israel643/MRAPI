import dotenv from 'dotenv';
dotenv.config();

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

// Lista de orígenes permitidos separada por comas. Vacío => se permite cualquier
// origen (comportamiento original, se avisa al arrancar).
const parseOrigins = (value) =>
  (value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3000,
  database: {
    host: process.env.DB_HOST,
    port: toInt(process.env.DB_PORT, 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    name: process.env.DB_NAME,
    connectionLimit: toInt(process.env.DB_POOL_LIMIT, 10),
    connectTimeout: toInt(process.env.DB_CONNECT_TIMEOUT_MS, 10000),
    queryTimeout: toInt(process.env.DB_QUERY_TIMEOUT_MS, 15000),
  },
  token_key: process.env.JWT_KEY,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS),
  // Número de proxies inversos de confianza (necesario para que el rate limit
  // vea la IP real del cliente detrás de Nginx, un balanceador, etc.).
  trustProxy: toInt(process.env.TRUST_PROXY, 0),
};

/**
 * Comprueba que las variables obligatorias existan. Se invoca al arrancar el
 * servidor para fallar de inmediato con un mensaje claro en lugar de fallar en
 * la primera petición (p. ej. jwt.sign sin secreto).
 * Nunca imprime los valores, solo los nombres.
 */
export function validateConfig() {
  const required = {
    DB_HOST: config.database.host,
    DB_USER: config.database.user,
    DB_NAME: config.database.name,
    JWT_KEY: config.token_key,
  };
  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Faltan variables de entorno obligatorias: ${missing.join(', ')}`);
  }

  const warnings = [];
  if (config.token_key.length < 32) {
    warnings.push('JWT_KEY tiene menos de 32 caracteres; use un secreto largo y aleatorio.');
  }
  if (config.corsOrigins.length === 0) {
    warnings.push('CORS_ORIGINS no está definido; se aceptan peticiones de cualquier origen.');
  }
  return warnings;
}
