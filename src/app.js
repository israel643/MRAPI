import express from 'express';
import exampleRoute from './services/Example_Services/routerExample';
import productsRoute from './services/product_Service/productsRoutes';
import loginRoutes from './services/User_Services/UserRoutes.js';
import bodyParser from 'body-parser';
import cors from 'cors';
import authJWT from './middleware/authMiddleware.js';


const app = express();
app.use(cors());
// Middlewares
app.use(express.json());

app.use(bodyParser.json());
// Routes
app.use('/api', authJWT, exampleRoute);

app.use('/api/products', productsRoute)

app.use('/user', loginRoutes)

// Error middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Algo salió mal!');
});

export default app;
