const express = require('express');
const { sql, getPool } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { createProductionOrderFromSO, checkStockAndCreatePR } = require('../services/productionService');

const router = express.Router();
router.use(authenticate);

function genSONumber() {
  const ts = new Date();
  const stamp = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}`;
  return `SO-${stamp}-${Math.floor(1000 + Math.random() * 9000)}`;
}

// GET /api/sales-orders
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT so.*, u.full_name AS created_by_name
      FROM sales_orders so
      LEFT JOIN users u ON u.user_id = so.created_by
      ORDER BY so.order_date DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/sales-orders/:id  (detail + items)
router.get('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const so = await pool.request().input('id', sql.Int, req.params.id)
      .query(`SELECT * FROM sales_orders WHERE so_id = @id`);
    const items = await pool.request().input('id', sql.Int, req.params.id)
      .query(`
        SELECT soi.*, p.product_name FROM sales_order_items soi
        JOIN products p ON p.product_id = soi.product_id
        WHERE soi.so_id = @id
      `);
    res.json({ ...so.recordset[0], items: items.recordset });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

//  POST /api/sales-orders - Membuat Pre-Order (SO) sekaligus item-nya. Contoh: { customer_name, due_date, items:[{product_id, qty_order}] }
router.post('/', async (req, res) => {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  try {
    const { customer_name, customer_contact, due_date, items } = req.body;
    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'Item pesanan (produk & qty) wajib diisi' });
    }

    await tx.begin();
    const so_number = genSONumber();

    const soResult = await new sql.Request(tx)
      .input('so_number', sql.NVarChar, so_number)
      .input('customer_name', sql.NVarChar, customer_name)
      .input('customer_contact', sql.NVarChar, customer_contact)
      .input('due_date', sql.DateTime2, due_date || null)
      .input('created_by', sql.Int, req.user.user_id)
      .query(`
        INSERT INTO sales_orders (so_number, customer_name, customer_contact, due_date, status, created_by)
        OUTPUT INSERTED.so_id
        VALUES (@so_number, @customer_name, @customer_contact, @due_date, 'NEW', @created_by)
      `);
    const so_id = soResult.recordset[0].so_id;

    const insertedItems = [];
    for (const item of items) {
      const itemResult = await new sql.Request(tx)
        .input('so_id', sql.Int, so_id)
        .input('product_id', sql.Int, item.product_id)
        .input('qty_order', sql.Int, item.qty_order)
        .query(`
          INSERT INTO sales_order_items (so_id, product_id, qty_order)
          OUTPUT INSERTED.*
          VALUES (@so_id, @product_id, @qty_order)
        `);
      insertedItems.push(itemResult.recordset[0]);
    }

    await tx.commit();

    // Di luar transaksi: generate Production Order + Material Requirement + cek stok untuk tiap item
    const productionOrders = [];
    for (const item of insertedItems) {
      const po = await createProductionOrderFromSO({
        so_id,
        product_id: item.product_id,
        qty_plan: item.qty_order,
        created_by: req.user.user_id,
      });
      const stockCheck = await checkStockAndCreatePR({ po_id: po.po_id, requested_by: req.user.user_id });
      productionOrders.push({ ...po, ...stockCheck });
    }

    res.status(201).json({ so_id, so_number, production_orders: productionOrders });
  } catch (err) {
    try { await tx.rollback(); } catch (_) {}
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sales-orders/:id/deliver - Finalisasi: barang diserahkan ke customer.
router.post('/:id/deliver', async (req, res) => {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  try {
    await tx.begin();

    const soCheck = await new sql.Request(tx)
      .input('id', sql.Int, req.params.id)
      .query(`SELECT status FROM sales_orders WHERE so_id = @id`);
    if (soCheck.recordset.length === 0) throw new Error('Pre-Order tidak ditemukan');
    if (soCheck.recordset[0].status === 'DELIVERED') throw new Error('Pre-Order ini sudah pernah diserahkan sebelumnya');
    if (soCheck.recordset[0].status === 'CANCELLED') throw new Error('Pre-Order ini sudah dibatalkan, tidak bisa diserahkan');

    const items = await new sql.Request(tx)
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT soi.product_id, soi.qty_order, p.product_name, p.finished_stock
        FROM sales_order_items soi
        JOIN products p ON p.product_id = soi.product_id
        WHERE soi.so_id = @id
      `);

    for (const item of items.recordset) {
      if (item.finished_stock < item.qty_order) {
        throw new Error(`Stok produk jadi "${item.product_name}" tidak cukup (tersedia ${item.finished_stock}, dibutuhkan ${item.qty_order}). Pastikan produksi sudah selesai.`);
      }
    }

    for (const item of items.recordset) {
      await new sql.Request(tx)
        .input('product_id', sql.Int, item.product_id)
        .input('qty', sql.Int, item.qty_order)
        .query(`UPDATE products SET finished_stock = finished_stock - @qty, updated_at = SYSDATETIME() WHERE product_id = @product_id`);

      await new sql.Request(tx)
        .input('item_id', sql.Int, item.product_id)
        .input('qty', sql.Decimal(18, 3), item.qty_order)
        .input('source_id', sql.Int, req.params.id)
        .input('created_by', sql.Int, req.user.user_id)
        .query(`
          INSERT INTO stock_movements (item_type, item_id, movement_type, source_type, source_id, qty, created_by)
          VALUES ('PRODUCT', @item_id, 'OUT', 'SALES_DELIVERY', @source_id, @qty, @created_by)
        `);
    }

    await new sql.Request(tx)
      .input('id', sql.Int, req.params.id)
      .query(`UPDATE sales_orders SET status = 'DELIVERED' WHERE so_id = @id`);

    await tx.commit();
    res.json({ message: 'Barang berhasil diserahkan, stok produk jadi diperbarui' });
  } catch (err) {
    await tx.rollback();
    res.status(400).json({ message: err.message });
  }
});

// PUT /api/sales-orders/:id/status
router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('status', sql.NVarChar, status)
      .query(`UPDATE sales_orders SET status = @status WHERE so_id = @id`);
    res.json({ message: 'Status SO diperbarui' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/sales-orders/items/:itemId/price  -> owner tetapkan harga PO setelah lihat HPP
router.put('/items/:itemId/price', async (req, res) => {
  try {
    const { unit_price, hpp_snapshot } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, req.params.itemId)
      .input('unit_price', sql.Decimal(18, 2), unit_price)
      .input('hpp_snapshot', sql.Decimal(18, 2), hpp_snapshot || 0)
      .query(`
        UPDATE sales_order_items SET unit_price = @unit_price, hpp_snapshot = @hpp_snapshot
        WHERE so_item_id = @id
      `);
    res.json({ message: 'Harga PO diperbarui' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;