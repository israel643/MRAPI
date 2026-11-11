import mysql from 'mysql2/promise';
import { config } from './index.js';

const pool = mysql.createPool({
  host: config.database.host,
  port: config.database.port,
  user: config.database.user,
  password: config.database.password,
  database: config.database.name,
  waitForConnections: true,
  connectionLimit: config.database.connectionLimit,
  queueLimit: 0,
  connectTimeout: config.database.connectTimeout,
  // Evita que firewalls/NAT cierren conexiones inactivas del pool.
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
});

/**
 * Ejecuta un procedimiento almacenado con parámetros enlazados (nunca
 * concatenados) y un tiempo máximo de ejecución.
 * Devuelve exactamente lo mismo que pool.query: [resultados, campos].
 */
function callProcedure(name, params = []) {
  const placeholders = params.map(() => '?').join(',');
  return pool.query({
    sql: `CALL ${name}(${placeholders})`,
    values: params,
    timeout: config.database.queryTimeout,
  });
}

async function testConnection() {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.ping();
    console.log('Conexión exitosa a la base de datos');
  } catch (error) {
    // Solo código y mensaje: no se registra la configuración de conexión.
    console.error(`Error al conectar a la base de datos (${error.code || 'sin código'}): ${error.message}`);
    throw error;
  } finally {
    if (connection) connection.release();
  }
}

async function closePool() {
  try {
    await pool.end();
    console.log('Pool de conexiones cerrado correctamente');
  } catch (error) {
    console.error('Error al cerrar el pool de conexiones:', error.message);
    throw error;
  }
}

export { pool, callProcedure, testConnection, closePool };
