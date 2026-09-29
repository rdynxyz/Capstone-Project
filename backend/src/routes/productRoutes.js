const express = require('express');
const { sql, getPool } = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/products
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`SELECT * FROM products WHERE is_active = 1 ORDER BY product_name`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/products/:id/bom  -> daftar komposisi bahan produk
router.get('/:id/bom', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT pm.bom_id, pm.material_id, m.material_name, m.unit, pm.qty_per_unit
        FROM product_materials pm
        JOIN materials m ON m.material_id = pm.material_id
        WHERE pm.product_id = @id
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/products  (owner)
router.post('/', requireRole('owner'), async (req, res) => {
  try {
    const { product_code, product_name, category, selling_price } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('product_code', sql.NVarChar, product_code)
      .input('product_name', sql.NVarChar, product_name)
      .input('category', sql.NVarChar, category)
      .input('selling_price', sql.Decimal(18, 2), selling_price || 0)
      .query(`
        INSERT INTO products (product_code, product_name, category, selling_price)
        OUTPUT INSERTED.*
        VALUES (@product_code, @product_name, @category, @selling_price)
      `);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/products/:id/bom  -> tambah/atur komposisi bahan (BOM)
router.post('/:id/bom', requireRole('owner'), async (req, res) => {
  try {
    const { material_id, qty_per_unit } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('product_id', sql.Int, req.params.id)
      .input('material_id', sql.Int, material_id)
      .input('qty_per_unit', sql.Decimal(18, 4), qty_per_unit)
      .query(`
        INSERT INTO product_materials (product_id, material_id, qty_per_unit)
        OUTPUT INSERTED.*
        VALUES (@product_id, @material_id, @qty_per_unit)
      `);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/products/:id  -> update harga jual (setelah owner lihat HPP)
router.put('/:id', requireRole('owner'), async (req, res) => {
  try {
    const { product_name, category, selling_price } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('product_name', sql.NVarChar, product_name)
      .input('category', sql.NVarChar, category)
      .input('selling_price', sql.Decimal(18, 2), selling_price)
      .query(`
        UPDATE products SET product_name = @product_name, category = @category,
               selling_price = @selling_price, updated_at = SYSDATETIME()
        OUTPUT INSERTED.*
        WHERE product_id = @id
      `);
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/products/:id (hard delete permanen)
router.delete('/:id', requireRole('owner'), async (req, res) => {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  try {
    await tx.begin();
    // hapus child table BOM supaya tidak melanggar foreign key
    await new sql.Request(tx)
      .input('id', sql.Int, req.params.id)
      .query(`DELETE FROM product_materials WHERE product_id = @id`);
    // hapus produknya
    await new sql.Request(tx)
      .input('id', sql.Int, req.params.id)
      .query(`DELETE FROM products WHERE product_id = @id`);
    await tx.commit();
    res.json({ message: 'Produk dihapus permanen dari database' });
  } catch (err) {
    await tx.rollback();
    if (err.number === 547) {
      return res.status(409).json({
        message: 'Produk ini tidak bisa dihapus permanen karena sudah pernah dipakai di Sales Order / Production Order. Data transaksi lama akan rusak kalau produknya dihapus.',
      });
    }
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
