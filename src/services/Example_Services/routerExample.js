import express from 'express';
import { exampleController } from './controllerExample';

const router = express.Router();

router.get('/example', exampleController);

export default router;
