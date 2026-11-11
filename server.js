import app from './src/app.js';
import { config, validateConfig } from './src/config/index.js';
import { testConnection, closePool } from './src/config/db.js';

let server;
let shuttingDown = false;

async function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Recibido ${signal}. Cerrando servidor...`);

  // Si el cierre se bloquea (conexiones abiertas), se fuerza la salida.
  setTimeout(() => process.exit(exitCode || 1), 10000).unref();

  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await closePool();
    console.log('Aplicación cerrada correctamente');
    process.exit(exitCode);
  } catch (error) {
    console.error('Error al cerrar la aplicación:', error.message);
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Una promesa rechazada sin capturar no debe tumbar el servidor: se registra.
process.on('unhandledRejection', (reason) => {
  console.error('Promesa rechazada sin manejar:', reason);
});

// Tras una excepción no capturada el estado del proceso no es fiable: se
// registra y se cierra de forma ordenada para que el gestor de procesos
// (pm2, systemd, Docker...) lo reinicie.
process.on('uncaughtException', (error) => {
  console.error('Excepción no capturada:', error);
  shutdown('uncaughtException', 1);
});

async function startServer() {
  try {
    console.log('Iniciando servidor...');
    const warnings = validateConfig();
    warnings.forEach((warning) => console.warn(`[config] ${warning}`));

    await testConnection();

    server = app.listen(config.port, () => {
      console.log(`Servidor corriendo en el puerto ${config.port}`);
    });
  } catch (error) {
    console.error('No se pudo iniciar el servidor:', error.message);
    process.exit(1);
  }
}

startServer();
