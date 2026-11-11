// src/services/UserService.js
import { pool } from '../../config/db.js';

class UserService {

  async findByCredentials(usernameInput) {
    const [rows] = await pool.query('CALL validateUserCredentials(?)', [usernameInput]);
    return rows[0]; // Retorna la información del usuario o un mensaje de error
  }

  async CreateUser(p_username, p_password_hash, email_user, Estatus_User, CreateByDateU){
    const [rows] = await pool.query('CALL CrearUsuario(?,?,?,?,?)', [p_username, p_password_hash, email_user, Estatus_User, CreateByDateU]);
    return rows[0];
  }
  
}

export default UserService;
