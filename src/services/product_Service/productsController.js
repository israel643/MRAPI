// const productsService = require('./productsService');

// exports.getAllProducts = async (req, res, next) => {
//   try {
//     const users = await productsService.findAll();
//     res.json(users);
//   } catch (error) {
//     next(error);
//   }
// };

// exports.getProdById = async (req, res, next) => {
//   try {
//     const user = await productsService.findById(req.params.id);
//     if (user) {
//       res.json(user);
//     } else {
//       res.status(404).json({ message: 'Producto no encontrado' });
//     }
//   } catch (error) {
//     next(error);
//   }
// };

// productsController.js (ejemplo)
import ProductService from './productsService.js';

const productsService = new ProductService();  // Instancia de la clase

export const getAllProducts = async (req, res) => {
  try {
    const products = await productsService.findAll();
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getProdById = async (req, res) => {
  try {
    const product = await productsService.findById(req.params.id);
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
