// Validaciones simples y reutilizables para los datos de entrada.

export const isNonEmptyString = (value, maxLength = 255) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;

// mysql2 (pool.query) expande objetos y arrays al formatear los "?", por lo que
// solo se aceptan valores primitivos para los parámetros que van a SQL.
export const isSqlPrimitive = (value) =>
  value === undefined ||
  value === null ||
  typeof value === 'string' ||
  typeof value === 'boolean' ||
  (typeof value === 'number' && Number.isFinite(value));

// Validación de formato básica (no pretende cubrir todo el RFC 5322).
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (value) =>
  typeof value === 'string' && value.length <= 254 && EMAIL_REGEX.test(value);

// bcrypt solo utiliza los primeros 72 bytes de la contraseña.
export const BCRYPT_MAX_BYTES = 72;
export const byteLength = (value) => Buffer.byteLength(value, 'utf8');
