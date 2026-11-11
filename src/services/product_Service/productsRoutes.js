import express from 'express';
import { getAllProducts, getProdById } from './productsController';

const router = express.Router();

router.get('/', getAllProducts);
router.get('/:id', getProdById);

export default router;
