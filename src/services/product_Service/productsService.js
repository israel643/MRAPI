import { callProcedure } from '../../config/db.js';

class ProductService {
  // Se conserva la forma de la respuesta original del CALL (contrato con el frontend).
  async findAll() {
    const [rows] = await callProcedure('get_all_products');
    return rows;
  }

  async findById(id) {
    const [rows] = await callProcedure('get_Prod_ByID', [id]);
    return rows[0];
  }
}

export default ProductService;
