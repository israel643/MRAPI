import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

const authenticateJWT = (req, res, next) => {
  const authHeader = req.header('Authorization');

  // Se mantiene 403 para compatibilidad con el frontend actual.
  if (!authHeader) {
    return res.status(403).json({ message: 'Acceso denegado. No se proporcionó token.' });
  }

  // Formato esperado: "Bearer <token>"
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(403).json({ message: 'Formato de token incorrecto. Se espera "Bearer <token>".' });
  }

  try {
    // Se fija el algoritmo para impedir ataques de confusión de algoritmo.
    req.user = jwt.verify(token, config.token_key, { algorithms: ['HS256'] });
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Token inválido o expirado.' });
  }
};

export default authenticateJWT;
