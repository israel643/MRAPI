const express = require('express');
const productsController = require('./productsController');

const router = express.Router();

router.get('/', productsController.getAllProducts);
router.get('/:id', productsController.getProdById);

//module.exports = router;
//export { router };
export default router;