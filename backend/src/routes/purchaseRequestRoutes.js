const express = require('express');
const { sql, getPool } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { receivePurchaseRequest } = require('../services/productionService');

const router = express.Router();
router.use(authenticate);

function genPRNumber() {
  const ts = new Date();
  const stamp = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}`;
  return `PR-${stamp}-${Math.floor(1000 + Math.random() * 9000)}`;
}

// POST /api/purchase-requests * Ajukan pembelian manual (restock preventif), TIDAK terikat Production Order.
router.post('/', async (req, res) => {
  const { items } = req.body;
  if (!items || items.length === 0) {
    return res.status(400).json({ message: 'Pilih minimal 1 bahan untuk diajukan pembeliannya' });
  }

  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  try {
    await tx.begin();
    const pr_number = genPRNumber();

    const prResult = await new sql.Request(tx)
      .input('pr_number', sql.NVarChar, pr_number)
      .input('requested_by', sql.Int, req.user.user_id)
      .query(`
        INSERT INTO purchase_requests (pr_number, po_id, status, requested_by)
        OUTPUT INSERTED.pr_id
        VALUES (@pr_number, NULL, 'OPEN', @requested_by)
      `);
    const pr_id = prResult.recordset[0].pr_id;

    for (const item of items) {
      await new sql.Request(tx)
        .input('pr_id', sql.Int, pr_id)
        .input('material_id', sql.Int, item.material_id)
        .input('qty_requested', sql.Decimal(18, 3), item.qty_requested)
        .query(`
          INSERT INTO purchase_request_items (pr_id, material_id, qty_requested)
          VALUES (@pr_id, @material_id, @qty_requested)
        `);
    }

    await tx.commit();
    res.status(201).json({ pr_id, pr_number });
  } catch (err) {
    await tx.rollback();
    res.status(500).json({ message: err.message });
  }
});

// GET /api/purchase-requests
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT pr.*, pod.po_number, u.full_name AS requested_by_name
      FROM purchase_requests pr
      LEFT JOIN production_orders pod ON pod.po_id = pr.po_id
      LEFT JOIN users u ON u.user_id = pr.requested_by
      ORDER BY pr.requested_at DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/purchase-requests/:id  (detail + items)
router.get('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const pr = await pool.request().input('id', sql.Int, req.params.id)
      .query(`SELECT * FROM purchase_requests WHERE pr_id = @id`);
    const items = await pool.request().input('id', sql.Int, req.params.id)
      .query(`
        SELECT pri.*, m.material_name, m.unit FROM purchase_request_items pri
        JOIN materials m ON m.material_id = pri.material_id
        WHERE pri.pr_id = @id
      `);
    res.json({ ...pr.recordset[0], items: items.recordset });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/purchase-requests/:id/order  -> tandai sudah dipesan ke supplier
router.put('/:id/order', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, req.params.id)
      .query(`UPDATE purchase_requests SET status = 'ORDERED' WHERE pr_id = @id`);
    res.json({ message: 'Purchase Request ditandai sudah dipesan' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/purchase-requests/:id/receive * Barang dari pemasok datang -> update stok bahan, lalu re-check stok Production Order terkait.
router.post('/:id/receive', async (req, res) => {
  try {
    const { items } = req.body;
    const result = await receivePurchaseRequest({
      pr_id: req.params.id,
      items,
      received_by: req.user.user_id,
    });
    res.json({ message: 'Barang diterima & stok diperbarui', ...result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;