import jwt from "jsonwebtoken";
import UserService from "./UserServices";
import { config } from "../../config";
const bcrypt = require('bcrypt');

const JWT_SECRET = config.token_key;
const userService = new UserService();

export const login = async (req, res) => {
  const { username, password } = req.body;

  try {
      // Llamar al servicio para obtener la información del usuario
      const users = await userService.findByCredentials(username);

      // Verificar si no se encontró el usuario
      if (!users || users.length === 0) {
          return res.status(401).json({ message: "Credenciales inválidas" });
      }

      // Extraer el primer elemento del array
      const user = users[0];

      const { id_usuario, nombre, password: storedPassword, nombre_rol } = user;

      if (!id_usuario || !nombre || !storedPassword || !nombre_rol) {
          return res.status(400).json({ message: "Datos del usuario incompletos" });
      }

      // Comparar la contraseña ingresada con la almacenada en la base de datos
      const isPasswordValid = await bcrypt.compare(password, storedPassword);
      if (!isPasswordValid) {
          return res.status(401).json({ message: "Credenciales inválidas" });
      }

      // Generar el token JWT con los datos del usuario
      const token = jwt.sign(
          { id: id_usuario, username: nombre, role: nombre_rol },
          JWT_SECRET,
          { expiresIn: "1h" }
      );

      return res.json({ token });
  } catch (error) {
      console.error("Error en el servidor:", error);
      return res.status(500).json({ message: "Error en el servidor" });
  }
};


// Crear usuarios

export const CreateUserByData = async (req, res) => {
  const {p_username, p_password_hash, email_user, Estatus_User, CreateByDateU} = req.body;

  try{
    if (!p_username || !p_password_hash || !email_user ) {
      return res.status(400).json({ message: 'Todos los campos son obligatorios' });
    }
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(p_password_hash, saltRounds);
  
    const result = await userService.CreateUser(p_username, passwordHash, email_user, Estatus_User, CreateByDateU);
  
    // Responder con éxito si se creó el usuario
    res.status(201).json({ message: 'Usuario creado exitosamente', result });

  } catch (error){
    if (error.sqlState === '45000') {
      // Error lanzado por el procedimiento almacenado (usuario ya existe)
      res.status(400).json({ message: error.message });
    } else {
      console.error(error);
      res.status(500).json({ message: 'Error al crear el usuario' });
    }
  }
}
