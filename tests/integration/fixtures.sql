-- ============================================================================
-- ESQUEMA Y PROCEDIMIENTOS *DE PRUEBA* (stubs)
-- Solo para pruebas de integración en una base de datos desechable.
-- No representan el esquema real de producción (que no está en el repositorio):
-- reproducen el contrato que el código espera de cada procedimiento.
-- NUNCA ejecutar contra una base de datos real.
-- ============================================================================
DROP TABLE IF EXISTS usuarios;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS productos;

CREATE TABLE roles (
  id_rol INT AUTO_INCREMENT PRIMARY KEY,
  nombre_rol VARCHAR(50) NOT NULL
);

CREATE TABLE usuarios (
  id_usuario INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL,
  password VARCHAR(255) NOT NULL,
  estatus VARCHAR(20) NULL,
  fecha_creacion VARCHAR(30) NULL,
  id_rol INT NOT NULL DEFAULT 1,
  UNIQUE KEY uq_usuarios_nombre (nombre),
  UNIQUE KEY uq_usuarios_email (email),
  CONSTRAINT fk_usuarios_rol FOREIGN KEY (id_rol) REFERENCES roles (id_rol)
);

CREATE TABLE productos (
  id_producto INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  precio DECIMAL(10, 2) NOT NULL
);

INSERT INTO roles (nombre_rol) VALUES ('usuario');
INSERT INTO productos (nombre, precio) VALUES ('Producto A', 10.50), ('Producto B', 20.00);

DROP PROCEDURE IF EXISTS validateUserCredentials;
DROP PROCEDURE IF EXISTS CrearUsuario;
DROP PROCEDURE IF EXISTS get_all_products;
DROP PROCEDURE IF EXISTS get_Prod_ByID;

DELIMITER //
CREATE PROCEDURE validateUserCredentials(IN p_username VARCHAR(100))
BEGIN
  SELECT u.id_usuario, u.nombre, u.password, r.nombre_rol
  FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
  WHERE u.nombre = p_username
  LIMIT 1;
END //

CREATE PROCEDURE CrearUsuario(
  IN p_username VARCHAR(100), IN p_password_hash VARCHAR(255), IN p_email VARCHAR(254),
  IN p_estatus VARCHAR(20), IN p_fecha VARCHAR(30))
BEGIN
  IF EXISTS (SELECT 1 FROM usuarios WHERE nombre = p_username) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El usuario ya existe';
  END IF;
  INSERT INTO usuarios (nombre, email, password, estatus, fecha_creacion)
  VALUES (p_username, p_email, p_password_hash, p_estatus, p_fecha);
  SELECT LAST_INSERT_ID() AS id_usuario;
END //

CREATE PROCEDURE get_all_products()
BEGIN
  SELECT id_producto, nombre, precio FROM productos ORDER BY id_producto;
END //

CREATE PROCEDURE get_Prod_ByID(IN p_id INT)
BEGIN
  SELECT id_producto, nombre, precio FROM productos WHERE id_producto = p_id;
END //
DELIMITER ;
