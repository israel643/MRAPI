import express from 'express';
import { login, CreateUserByData } from './UserController';
import { loginLimiter, createUserLimiter } from '../../middleware/rateLimiters.js';

const router = express.Router();

// POST es el método correcto para enviar credenciales (los navegadores no envían
// cuerpo en peticiones GET). Se conserva GET por compatibilidad con clientes
// existentes; se recomienda migrar el frontend a POST.
router.post('/login', loginLimiter, login);
router.get('/login', loginLimiter, login);

router.post('/CreateUser', createUserLimiter, CreateUserByData);

export default router;
