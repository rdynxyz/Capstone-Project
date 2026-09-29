const express = require('express');
const { sql, getPool } = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/reports/dashboard  -> ringkasan untuk dashboard Vue
router.get('/dashboard', async (req, res) => {
  try {
    const pool = await getPool();
    const [soCount, poCount, prOpen, lowStock, finishedStock] = await Promise.all([
      pool.request().query(`SELECT COUNT(*) AS total FROM sales_orders WHERE status NOT IN ('DELIVERED','CANCELLED')`),
      pool.request().query(`SELECT COUNT(*) AS total FROM production_orders WHERE status NOT IN ('COMPLETED','CANCELLED')`),
      pool.request().query(`SELECT COUNT(*) AS total FROM purchase_requests WHERE status = 'OPEN'`),
      pool.request().query(`SELECT COUNT(*) AS total FROM materials WHERE stock_qty < min_stock AND is_active = 1`),
      pool.request().query(`SELECT SUM(finished_stock) AS total FROM products WHERE is_active = 1`),
    ]);
    res.json({
      active_sales_orders: soCount.recordset[0].total,
      active_production_orders: poCount.recordset[0].total,
      open_purchase_requests: prOpen.recordset[0].total,
      low_stock_materials: lowStock.recordset[0].total,
      total_finished_stock: finishedStock.recordset[0].total || 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/reports/stock-movements?item_type=MATERIAL&from=&to=  -> laporan keluar/masuk barang
router.get('/stock-movements', async (req, res) => {
  try {
    const { item_type, from, to } = req.query;
    const pool = await getPool();
    const request = pool.request();
    let where = '1=1';
    if (item_type) {
      request.input('item_type', sql.NVarChar, item_type);
      where += ' AND sm.item_type = @item_type';
    }
    if (from) {
      request.input('from', sql.DateTime2, from);
      where += ' AND sm.created_at >= @from';
    }
    if (to) {
      request.input('to', sql.DateTime2, to);
      where += ' AND sm.created_at <= @to';
    }
    const result = await request.query(`
      SELECT sm.*, u.full_name AS created_by_name,
        CASE WHEN sm.item_type = 'MATERIAL' THEN m.material_name ELSE p.product_name END AS item_name
      FROM stock_movements sm
      LEFT JOIN users u ON u.user_id = sm.created_by
      LEFT JOIN materials m ON sm.item_type = 'MATERIAL' AND m.material_id = sm.item_id
      LEFT JOIN products p ON sm.item_type = 'PRODUCT' AND p.product_id = sm.item_id
      WHERE ${where}
      ORDER BY sm.created_at DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/reports/hpp  -> daftar HPP produksi selesai vs harga jual (margin)
router.get('/hpp', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT pod.po_id, pod.po_number, p.product_name, pod.qty_plan,
             pod.material_cost, pod.labor_cost, pod.overhead_cost, pod.hpp_per_unit,
             p.selling_price, (p.selling_price - pod.hpp_per_unit) AS margin_per_unit
      FROM production_orders pod
      JOIN products p ON p.product_id = pod.product_id
      WHERE pod.status = 'COMPLETED'
      ORDER BY pod.finished_at DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/reports/dashboard-detail
// Kumpulan data lengkap untuk tampilan dashboard bergaya "retail": 
// pendapatan & laba hari ini, nilai persediaan, arus barang 14 hari, 
// sebaran stok per kategori, produk paling laku, stok menipis, transaksi terbaru.
router.get('/dashboard-detail', async (req, res) => {
  try {
    const pool = await getPool();

    const [
      todayRevenue,
      inventoryValue,
      lowStock,
      stockByCategory,
      topProducts,
      recentSO,
      flowRaw,
    ] = await Promise.all([
      // Pendapatan & laba kotor dari Pre-Order yang dibuat HARI INI
      // Fallback: kalau unit_price/hpp_snapshot belum di-set manual per item,
      // pakai harga standar produk & HPP produksi terakhir yang selesai.
      pool.request().query(`
        SELECT
          ISNULL(SUM(x.qty_order * x.effective_price), 0) AS revenue_today,
          ISNULL(SUM(x.qty_order * (x.effective_price - ISNULL(x.effective_hpp,0))), 0) AS margin_today
        FROM (
          SELECT soi.qty_order, so.order_date,
            ISNULL(NULLIF(soi.unit_price,0), p.selling_price) AS effective_price,
            ISNULL(NULLIF(soi.hpp_snapshot,0),
              (SELECT TOP 1 pod.hpp_per_unit FROM production_orders pod
               WHERE pod.so_id = soi.so_id AND pod.product_id = soi.product_id AND pod.status = 'COMPLETED'
               ORDER BY pod.finished_at DESC)
            ) AS effective_hpp
          FROM sales_order_items soi
          JOIN sales_orders so ON so.so_id = soi.so_id
          JOIN products p ON p.product_id = soi.product_id
        ) x
        WHERE CAST(x.order_date AS DATE) = CAST(SYSDATETIME() AS DATE)
      `),
      // Nilai persediaan: bahan baku (stok x harga beli) + produk jadi (stok x harga jual)
      pool.request().query(`
        SELECT
          (SELECT ISNULL(SUM(stock_qty * unit_cost), 0) FROM materials WHERE is_active = 1) AS material_value,
          (SELECT ISNULL(SUM(finished_stock * selling_price), 0) FROM products WHERE is_active = 1) AS product_value,
          (SELECT COUNT(*) FROM materials WHERE is_active = 1) AS material_types,
          (SELECT ISNULL(SUM(stock_qty), 0) FROM materials WHERE is_active = 1) AS material_units
      `),
      pool.request().query(`
        SELECT material_id, material_name, material_code, stock_qty, min_stock, unit
        FROM materials WHERE is_active = 1 AND stock_qty < min_stock
        ORDER BY (stock_qty * 1.0 / NULLIF(min_stock,0)) ASC
      `),
      pool.request().query(`
        SELECT ISNULL(category, 'Lainnya') AS category, COUNT(*) AS jumlah_jenis
        FROM materials WHERE is_active = 1
        GROUP BY category
        ORDER BY jumlah_jenis DESC
      `),
      pool.request().query(`
        SELECT TOP 5 p.product_name, SUM(soi.qty_order) AS total_qty
        FROM sales_order_items soi
        JOIN sales_orders so ON so.so_id = soi.so_id
        JOIN products p ON p.product_id = soi.product_id
        WHERE so.order_date >= DATEADD(DAY, -30, SYSDATETIME())
        GROUP BY p.product_name
        ORDER BY total_qty DESC
      `),
      pool.request().query(`
        SELECT TOP 8 so.so_number, so.customer_name, so.order_date, so.status, u.full_name AS created_by_name,
          (SELECT ISNULL(SUM(soi.qty_order * ISNULL(NULLIF(soi.unit_price,0), p.selling_price)), 0)
           FROM sales_order_items soi JOIN products p ON p.product_id = soi.product_id
           WHERE soi.so_id = so.so_id) AS total_value
        FROM sales_orders so
        LEFT JOIN users u ON u.user_id = so.created_by
        ORDER BY so.order_date DESC
      `),
      // Data mentah 14 hari terakhir: nilai penjualan (SO dibuat) & nilai pembelian (PR diterima) per hari
      pool.request().query(`
        SELECT CAST(so.order_date AS DATE) AS tgl, SUM(soi.qty_order * soi.unit_price) AS nilai
        FROM sales_order_items soi
        JOIN sales_orders so ON so.so_id = soi.so_id
        WHERE so.order_date >= DATEADD(DAY, -13, CAST(SYSDATETIME() AS DATE))
        GROUP BY CAST(so.order_date AS DATE)
      `),
    ]);

    // Data pembelian 14 hari terakhir (query terpisah karena tabel beda)
    const purchaseFlow = await pool.request().query(`
      SELECT CAST(pr.received_at AS DATE) AS tgl, SUM(pri.qty_received * pri.unit_cost) AS nilai
      FROM purchase_request_items pri
      JOIN purchase_requests pr ON pr.pr_id = pri.pr_id
      WHERE pr.status = 'RECEIVED' AND pr.received_at >= DATEADD(DAY, -13, CAST(SYSDATETIME() AS DATE))
      GROUP BY CAST(pr.received_at AS DATE)
    `);

    // Susun array 14 hari berurutan, isi 0 kalau gak ada transaksi
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const sale = flowRaw.recordset.find((r) => new Date(r.tgl).toISOString().slice(0, 10) === key);
      const purchase = purchaseFlow.recordset.find((r) => new Date(r.tgl).toISOString().slice(0, 10) === key);
      days.push({
        date: key,
        label: `${d.getDate()}/${d.getMonth() + 1}`,
        sales_value: sale ? Number(sale.nilai) : 0,
        purchase_value: purchase ? Number(purchase.nilai) : 0,
      });
    }

    const inv = inventoryValue.recordset[0];

    res.json({
      revenue_today: todayRevenue.recordset[0].revenue_today,
      margin_today: todayRevenue.recordset[0].margin_today,
      inventory_value: Number(inv.material_value) + Number(inv.product_value),
      material_types: inv.material_types,
      material_units: inv.material_units,
      low_stock: lowStock.recordset,
      stock_by_category: stockByCategory.recordset,
      top_products: topProducts.recordset,
      recent_sales_orders: recentSO.recordset,
      flow_14d: days,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;