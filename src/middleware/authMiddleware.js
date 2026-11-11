import jwt from 'jsonwebtoken';
import { config } from '../config/index';

const JWT_SECRET = config.token_key;

const authenticateJWT = (req, res, next) => {
  // Verificar si el encabezado Authorization existe
  const authHeader = req.header('Authorization');

  if (!authHeader) {
    return res.status(403).json({ message: 'Acceso denegado. No se proporcionó token.' });
  }

  // Verificar que el token siga el formato "Bearer <token>"
  const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return res.status(403).json({ message: 'Formato de token incorrecto. Se espera "Bearer <token>".' });
  }

  try {
    // Verificar y decodificar el token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Adjuntar los datos del usuario al objeto req
    req.user = decoded;

    // Continuar con la siguiente función
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token inválido o expirado.' });
  }
};

export default authenticateJWT;
