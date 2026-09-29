const express = require('express');
const { sql, getPool } = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/materials  (semua staff bisa lihat)
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT * FROM materials WHERE is_active = 1 ORDER BY material_name
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/materials/low-stock  (bahan di bawah minimum -> perlu restock)
router.get('/low-stock', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT * FROM materials WHERE is_active = 1 AND stock_qty < min_stock ORDER BY material_name
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/materials  (owner & staff gudang boleh tambah)
router.post('/', async (req, res) => {
  try {
    const { material_code, material_name, category, unit, stock_qty, min_stock, unit_cost } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('material_code', sql.NVarChar, material_code)
      .input('material_name', sql.NVarChar, material_name)
      .input('category', sql.NVarChar, category)
      .input('unit', sql.NVarChar, unit)
      .input('stock_qty', sql.Decimal(18, 3), stock_qty || 0)
      .input('min_stock', sql.Decimal(18, 3), min_stock || 0)
      .input('unit_cost', sql.Decimal(18, 2), unit_cost || 0)
      .query(`
        INSERT INTO materials (material_code, material_name, category, unit, stock_qty, min_stock, unit_cost)
        OUTPUT INSERTED.*
        VALUES (@material_code, @material_name, @category, @unit, @stock_qty, @min_stock, @unit_cost)
      `);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/materials/:id
router.put('/:id', async (req, res) => {
  try {
    const { material_name, category, unit, min_stock, unit_cost } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('material_name', sql.NVarChar, material_name)
      .input('category', sql.NVarChar, category)
      .input('unit', sql.NVarChar, unit)
      .input('min_stock', sql.Decimal(18, 3), min_stock)
      .input('unit_cost', sql.Decimal(18, 2), unit_cost)
      .query(`
        UPDATE materials
        SET material_name = @material_name, category = @category, unit = @unit,
            min_stock = @min_stock, unit_cost = @unit_cost, updated_at = SYSDATETIME()
        OUTPUT INSERTED.*
        WHERE material_id = @id
      `);
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/materials/:id (hard delete permanen, owner only)
router.delete('/:id', requireRole('owner'), async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`DELETE FROM materials WHERE material_id = @id`);
    res.json({ message: 'Bahan dihapus permanen dari database' });
  } catch (err) {
    if (err.number === 547) {
      return res.status(409).json({
        message: 'Bahan ini tidak bisa dihapus karena sudah dipakai di BOM produk atau riwayat produksi/pembelian. Edit datanya saja, atau nonaktifkan lewat database kalau memang sudah tidak dipakai.',
      });
    }
    res.status(500).json({ message: err.message });
  }
});

// POST /api/materials/:id/adjust  (penyesuaian stok manual - opname)
router.post('/:id/adjust', async (req, res) => {
  try {
    const { qty, note } = req.body; // qty bisa +/-
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('qty', sql.Decimal(18, 3), qty)
      .query(`UPDATE materials SET stock_qty = stock_qty + @qty, updated_at = SYSDATETIME() WHERE material_id = @id`);

    await pool.request()
      .input('item_id', sql.Int, req.params.id)
      .input('movement_type', sql.NVarChar, qty >= 0 ? 'IN' : 'OUT')
      .input('qty', sql.Decimal(18, 3), Math.abs(qty))
      .input('note', sql.NVarChar, note || 'Penyesuaian stok')
      .input('created_by', sql.Int, req.user.user_id)
      .query(`
        INSERT INTO stock_movements (item_type, item_id, movement_type, source_type, qty, note, created_by)
        VALUES ('MATERIAL', @item_id, @movement_type, 'ADJUSTMENT', @qty, @note, @created_by)
      `);
    res.json({ message: 'Stok disesuaikan' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;