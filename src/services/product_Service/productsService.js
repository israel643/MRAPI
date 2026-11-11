import { pool } from '../../config/db.js';

class ProductService {
  async findAll() {
    const [rows] = await pool.query('CALL get_all_products()');
    return rows;
  }

  async findById(id) {
    const [rows] = await pool.query('CALL get_Prod_ByID(?)', [id]);
    return rows[0];
  }
}

export default ProductService;
