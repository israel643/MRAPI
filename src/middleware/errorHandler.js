import { HttpError } from '../utils/httpError.js';

// Errores de mysql2 que indican que la base de datos no está disponible.
const DB_UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'PROTOCOL_CONNECTION_LOST',
  'PROTOCOL_SEQUENCE_TIMEOUT',
  'ER_CON_COUNT_ERROR',
  'POOL_CLOSED',
]);

export const notFoundHandler = (req, res) => {
  res.status(404).json({ message: 'Recurso no encontrado' });
};

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof HttpError) {
    const body = { message: err.message };
    if (err.details) body.errors = err.details;
    return res.status(err.status).json(body);
  }

  // Errores generados por express.json() (JSON mal formado, cuerpo muy grande...).
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'El cuerpo de la petición no es un JSON válido' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ message: 'El cuerpo de la petición es demasiado grande' });
  }
  if (err.message === 'Origen no permitido por CORS') {
    return res.status(403).json({ message: 'Origen no permitido' });
  }

  if (DB_UNAVAILABLE_CODES.has(err.code)) {
    console.error(`[db] Servicio no disponible (${err.code}) en ${req.method} ${req.path}`);
    return res.status(503).json({ message: 'Servicio temporalmente no disponible' });
  }

  // Error inesperado: se registra internamente sin exponer detalles al cliente.
  console.error(`[error] ${req.method} ${req.path}:`, err);
  return res.status(500).json({ message: 'Error interno del servidor' });
};
