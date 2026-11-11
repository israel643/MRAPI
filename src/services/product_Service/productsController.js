import ProductService from './productsService.js';
import { badRequest } from '../../utils/httpError.js';

const productsService = new ProductService();

export const getAllProducts = async (req, res, next) => {
  try {
    const products = await productsService.findAll();
    res.json(products);
  } catch (error) {
    next(error);
  }
};

export const getProdById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id || id.length > 64) {
      throw badRequest('Identificador de producto inválido');
    }
    const product = await productsService.findById(id);
    res.json(product);
  } catch (error) {
    next(error);
  }
};
