import mysql from 'mysql2/promise';
import { config } from './index.js';

const pool = mysql.createPool({
  host: config.database.host,
  user: config.database.user,
  password: config.database.password,
  database: config.database.name,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('Conexión exitosa a la base de datos');
    connection.release();
  } catch (error) {
    console.error('Error al conectar a la base de datos:', error);
    throw error;
  }
}

function handleDisconnect() {
  pool.on('error', (err) => {
    console.error('Error de conexión a la base de datos:', err);
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
      console.log('Conexión perdida. Reconectando...');
    } else {
      throw err;
    }
  });
}

async function closePool() {
  try {
    await pool.end();
    console.log('Pool de conexiones cerrado correctamente');
  } catch (error) {
    console.error('Error al cerrar el pool de conexiones:', error);
    throw error;
  }
}

export { pool, testConnection, closePool };