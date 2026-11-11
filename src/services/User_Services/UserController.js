import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import UserService from './UserServices';
import { config } from '../../config';
import { badRequest, HttpError } from '../../utils/httpError.js';
import {
  BCRYPT_MAX_BYTES,
  byteLength,
  isEmail,
  isNonEmptyString,
  isSqlPrimitive,
} from '../../utils/validators.js';

const SALT_ROUNDS = 10;
const userService = new UserService();

// Hash ficticio para igualar el tiempo de respuesta cuando el usuario no existe
// y evitar la enumeración de usuarios por tiempo de respuesta.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', SALT_ROUNDS);

const invalidCredentials = () => new HttpError(401, 'Credenciales inválidas');

export const login = async (req, res, next) => {
  const { username, password } = req.body || {};

  try {
    if (!isNonEmptyString(username, 255) || !isNonEmptyString(password, 1024)) {
      throw badRequest('Usuario y contraseña son obligatorios');
    }

    const users = await userService.findByCredentials(username);
    const user = Array.isArray(users) && users.length > 0 ? users[0] : null;

    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH);
      throw invalidCredentials();
    }

    const { id_usuario, nombre, password: storedPassword, nombre_rol } = user;

    if (!id_usuario || !nombre || !storedPassword || !nombre_rol) {
      // Inconsistencia de datos en BD: se registra internamente pero se responde
      // igual que unas credenciales inválidas para no revelar que el usuario existe.
      console.warn(`[login] Datos incompletos para el usuario con id ${id_usuario ?? 'desconocido'}`);
      await bcrypt.compare(password, DUMMY_HASH);
      throw invalidCredentials();
    }

    const isPasswordValid = await bcrypt.compare(password, storedPassword);
    if (!isPasswordValid) {
      throw invalidCredentials();
    }

    const token = jwt.sign(
      { id: id_usuario, username: nombre, role: nombre_rol },
      config.token_key,
      { expiresIn: config.jwtExpiresIn, algorithm: 'HS256' },
    );

    return res.json({ token });
  } catch (error) {
    return next(error);
  }
};

// Crear usuarios
export const CreateUserByData = async (req, res, next) => {
  const { p_username, p_password_hash, email_user, Estatus_User, CreateByDateU } = req.body || {};

  try {
    if (!p_username || !p_password_hash || !email_user) {
      throw badRequest('Todos los campos son obligatorios');
    }

    const errors = [];
    if (!isNonEmptyString(p_username, 100)) {
      errors.push('p_username debe ser un texto de máximo 100 caracteres');
    }
    if (typeof p_password_hash !== 'string' || byteLength(p_password_hash) > BCRYPT_MAX_BYTES) {
      errors.push(`p_password_hash debe ser un texto de máximo ${BCRYPT_MAX_BYTES} bytes`);
    }
    if (!isEmail(email_user)) {
      errors.push('email_user no tiene un formato de correo válido');
    }
    if (!isSqlPrimitive(Estatus_User) || !isSqlPrimitive(CreateByDateU)) {
      errors.push('Estatus_User y CreateByDateU deben ser valores simples');
    }
    if (errors.length > 0) {
      throw badRequest('Datos inválidos', errors);
    }

    const passwordHash = await bcrypt.hash(p_password_hash, SALT_ROUNDS);

    const result = await userService.CreateUser(
      p_username,
      passwordHash,
      email_user,
      Estatus_User,
      CreateByDateU,
    );

    return res.status(201).json({ message: 'Usuario creado exitosamente', result });
  } catch (error) {
    if (error.sqlState === '45000') {
      // Error de negocio lanzado con SIGNAL por el procedimiento (p. ej. usuario ya existe).
      return res.status(400).json({ message: error.message });
    }
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'El usuario o el correo ya existen' });
    }
    return next(error);
  }
};
