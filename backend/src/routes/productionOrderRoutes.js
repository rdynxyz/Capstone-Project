const express = require('express');
const { sql, getPool } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { checkStockAndCreatePR, completeProduction } = require('../services/productionService');

const router = express.Router();
router.use(authenticate);

// GET /api/production-orders
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT pod.*, p.product_name, so.so_number, so.customer_name
      FROM production_orders pod
      JOIN products p ON p.product_id = pod.product_id
      JOIN sales_orders so ON so.so_id = pod.so_id
      ORDER BY pod.created_at DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/production-orders/:id  (detail + material requirement)
router.get('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const po = await pool.request().input('id', sql.Int, req.params.id)
      .query(`
        SELECT pod.*, p.product_name FROM production_orders pod
        JOIN products p ON p.product_id = pod.product_id
        WHERE pod.po_id = @id
      `);
    const mr = await pool.request().input('id', sql.Int, req.params.id)
      .query(`
        SELECT mr.*, m.material_name, m.unit FROM material_requirements mr
        JOIN materials m ON m.material_id = mr.material_id
        WHERE mr.po_id = @id
      `);
    res.json({ ...po.recordset[0], material_requirements: mr.recordset });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/production-orders/:id/check-stock  -> jalankan ulang pengecekan stok
router.post('/:id/check-stock', async (req, res) => {
  try {
    const result = await checkStockAndCreatePR({ po_id: req.params.id, requested_by: req.user.user_id });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/production-orders/:id/start  -> mulai produksi (status IN_PROGRESS)
router.post('/:id/start', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, req.params.id).query(`
      UPDATE production_orders SET status = 'IN_PROGRESS', started_at = SYSDATETIME()
      WHERE po_id = @id AND status = 'READY_TO_PRODUCE'
    `);
    res.json({ message: 'Produksi dimulai' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/production-orders/:id/complete
// body: { labor_cost, overhead_cost } -> hitung HPP otomatis & update stok
router.post('/:id/complete', async (req, res) => {
  try {
    const { labor_cost, overhead_cost } = req.body;
    const result = await completeProduction({
      po_id: req.params.id,
      labor_cost: labor_cost || 0,
      overhead_cost: overhead_cost || 0,
      completed_by: req.user.user_id,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
