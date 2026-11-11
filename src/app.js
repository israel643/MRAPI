import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import exampleRoute from './services/Example_Services/routerExample';
import productsRoute from './services/product_Service/productsRoutes';
import loginRoutes from './services/User_Services/UserRoutes.js';
import authJWT from './middleware/authMiddleware.js';
import { globalLimiter } from './middleware/rateLimiters.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { config } from './config/index.js';

const app = express();

if (config.trustProxy > 0) {
  app.set('trust proxy', config.trustProxy);
}

// Cabeceras de seguridad (también desactiva X-Powered-By).
app.use(helmet());

// CORS: si CORS_ORIGINS está definido solo se aceptan esos orígenes; si no, se
// mantiene el comportamiento original (cualquier origen).
app.use(
  cors(
    config.corsOrigins.length > 0
      ? {
          origin(origin, callback) {
            // Peticiones sin cabecera Origin (curl, servidor a servidor) se permiten.
            if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
            return callback(new Error('Origen no permitido por CORS'));
          },
        }
      : undefined,
  ),
);

app.use(globalLimiter);
app.use(express.json({ limit: '100kb' }));

// Routes
// Todo lo que cuelga de /api requiere JWT (incluido /api/products), tal y como
// funcionaba antes: el middleware montado en '/api' se ejecutaba para cualquier
// ruta /api/*.
app.use('/api', authJWT);
app.use('/api', exampleRoute);
app.use('/api/products', productsRoute);

app.use('/user', loginRoutes);

// 404 y manejo centralizado de errores (siempre JSON, sin detalles internos).
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
