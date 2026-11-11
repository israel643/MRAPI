import app from './src/app.js';
import { config } from './src/config/index.js';
import { testConnection, closePool } from './src/db.js';

async function startServer() {
  try {
    await testConnection();
    
    app.listen(config.port, () => {
      console.log(`Servidor corriendo en el puerto ${config.port}`);
    });

    process.on('SIGINT', async () => {
      try {
        await closePool();
        console.log('Aplicación cerrada correctamente');
        process.exit(0);
      } catch (error) {
        console.error('Error al cerrar la aplicación:', error);
        process.exit(1);
      }
    });

  } catch (error) {
    console.error('No se pudo iniciar el servidor:', error);
    process.exit(1);
  }
}

startServer();