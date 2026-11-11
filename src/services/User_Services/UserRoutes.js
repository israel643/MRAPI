const express = require('express');
const userService = require('./UserController');

const router = express.Router();

router.get('/login', userService.login);

router.post('/CreateUser', userService.CreateUserByData);

export default router;