import rateLimit from 'express-rate-limit';

const message = (text) => ({ message: text });

// Límite general para toda la API (protección básica ante abuso).
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: message('Demasiadas peticiones. Intente de nuevo más tarde.'),
});

// Protección contra fuerza bruta en el login: solo cuentan los intentos fallidos.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: message('Demasiados intentos de inicio de sesión. Intente de nuevo en 15 minutos.'),
});

// Limita la creación masiva de cuentas desde una misma IP.
export const createUserLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: message('Demasiadas solicitudes de creación de usuarios. Intente más tarde.'),
});
