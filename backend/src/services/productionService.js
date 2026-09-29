const { sql, getPool } = require('../config/db');

/* Util: generate nomor dokumen sederhana (PO-20260925-0001, dll) */
function genNumber(prefix) {
  const ts = new Date();
  const stamp = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(
    ts.getDate()
  ).padStart(2, '0')}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${stamp}-${rand}`;
}

/**
 * STEP 1-2: Dari Sales Order (Pre-Order) -> buat Production Order
 * lalu otomatis explode BOM produk menjadi Material Requirement.
 */
async function createProductionOrderFromSO({ so_id, product_id, qty_plan, created_by }) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const poNumber = genNumber('PO');

    const poResult = await new sql.Request(tx)
      .input('po_number', sql.NVarChar, poNumber)
      .input('so_id', sql.Int, so_id)
      .input('product_id', sql.Int, product_id)
      .input('qty_plan', sql.Int, qty_plan)
      .input('created_by', sql.Int, created_by)
      .query(`
        INSERT INTO production_orders (po_number, so_id, product_id, qty_plan, status, created_by)
        OUTPUT INSERTED.po_id
        VALUES (@po_number, @so_id, @product_id, @qty_plan, 'DRAFT', @created_by)
      `);
    const po_id = poResult.recordset[0].po_id;

    // Ambil BOM produk
    const bom = await new sql.Request(tx)
      .input('product_id', sql.Int, product_id)
      .query(`SELECT material_id, qty_per_unit FROM product_materials WHERE product_id = @product_id`);

    if (bom.recordset.length === 0) {
      throw new Error('Produk belum memiliki BOM (Bill of Material). Tambahkan komposisi bahan terlebih dahulu.');
    }

    // Explode BOM -> Material Requirement (qty_required = qty_plan x qty_per_unit)
    for (const row of bom.recordset) {
      const qtyRequired = qty_plan * row.qty_per_unit;
      await new sql.Request(tx)
        .input('po_id', sql.Int, po_id)
        .input('material_id', sql.Int, row.material_id)
        .input('qty_required', sql.Decimal(18, 3), qtyRequired)
        .query(`
          INSERT INTO material_requirements (po_id, material_id, qty_required, status)
          VALUES (@po_id, @material_id, @qty_required, 'PENDING')
        `);
    }

    await tx.commit();
    return { po_id, po_number: poNumber };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

/**
 * STEP 3: Cek stok untuk semua Material Requirement suatu Production Order.
 * - Jika semua cukup -> status PO jadi READY_TO_PRODUCE
 * - Jika ada yang kurang -> status PO jadi WAITING_MATERIAL, dan Purchase Request otomatis dibuat.
 */
async function checkStockAndCreatePR({ po_id, requested_by }) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const mrList = await new sql.Request(tx)
      .input('po_id', sql.Int, po_id)
      .query(`
        SELECT mr.mr_id, mr.material_id, mr.qty_required, m.stock_qty, m.material_name
        FROM material_requirements mr
        JOIN materials m ON m.material_id = mr.material_id
        WHERE mr.po_id = @po_id
      `);

    let hasShortage = false;
    const shortages = [];

    for (const row of mrList.recordset) {
      const shortage = Math.max(0, row.qty_required - row.stock_qty);
      const status = shortage > 0 ? 'SHORTAGE' : 'SUFFICIENT';
      if (shortage > 0) {
        hasShortage = true;
        shortages.push({ material_id: row.material_id, qty_shortage: shortage });
      }
      await new sql.Request(tx)
        .input('mr_id', sql.Int, row.mr_id)
        .input('qty_available', sql.Decimal(18, 3), row.stock_qty)
        .input('qty_shortage', sql.Decimal(18, 3), shortage)
        .input('status', sql.NVarChar, status)
        .query(`
          UPDATE material_requirements
          SET qty_available = @qty_available, qty_shortage = @qty_shortage, status = @status
          WHERE mr_id = @mr_id
        `);
    }

    let pr_number = null;

    if (hasShortage) {
      // Buat Purchase Request otomatis
      pr_number = genNumber('PR');
      const prResult = await new sql.Request(tx)
        .input('pr_number', sql.NVarChar, pr_number)
        .input('po_id', sql.Int, po_id)
        .input('requested_by', sql.Int, requested_by)
        .query(`
          INSERT INTO purchase_requests (pr_number, po_id, status, requested_by)
          OUTPUT INSERTED.pr_id
          VALUES (@pr_number, @po_id, 'OPEN', @requested_by)
        `);
      const pr_id = prResult.recordset[0].pr_id;

      for (const s of shortages) {
        await new sql.Request(tx)
          .input('pr_id', sql.Int, pr_id)
          .input('material_id', sql.Int, s.material_id)
          .input('qty_requested', sql.Decimal(18, 3), s.qty_shortage)
          .query(`
            INSERT INTO purchase_request_items (pr_id, material_id, qty_requested)
            VALUES (@pr_id, @material_id, @qty_requested)
          `);
      }

      await new sql.Request(tx)
        .input('po_id', sql.Int, po_id)
        .query(`UPDATE production_orders SET status = 'WAITING_MATERIAL' WHERE po_id = @po_id`);
    } else {
      await new sql.Request(tx)
        .input('po_id', sql.Int, po_id)
        .query(`UPDATE production_orders SET status = 'READY_TO_PRODUCE' WHERE po_id = @po_id`);
    }

    await tx.commit();
    return { hasShortage, pr_number };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

/**
 * Setelah Purchase Request diterima (barang datang dari pemasok):
 * update stok material + tandai MR terkait sebagai FULFILLED, lalu PO kembali dicek stoknya.
 */
async function receivePurchaseRequest({ pr_id, items, received_by }) {
  // items: [{ pr_item_id, qty_received, unit_cost }]
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    let po_id = null;

    for (const item of items) {
      const prItem = await new sql.Request(tx)
        .input('pr_item_id', sql.Int, item.pr_item_id)
        .query(`SELECT material_id FROM purchase_request_items WHERE pr_item_id = @pr_item_id`);
      const material_id = prItem.recordset[0].material_id;

      await new sql.Request(tx)
        .input('pr_item_id', sql.Int, item.pr_item_id)
        .input('qty_received', sql.Decimal(18, 3), item.qty_received)
        .input('unit_cost', sql.Decimal(18, 2), item.unit_cost)
        .query(`
          UPDATE purchase_request_items
          SET qty_received = @qty_received, unit_cost = @unit_cost
          WHERE pr_item_id = @pr_item_id
        `);

      // Update stok bahan (masuk)
      await new sql.Request(tx)
        .input('material_id', sql.Int, material_id)
        .input('qty', sql.Decimal(18, 3), item.qty_received)
        .input('unit_cost', sql.Decimal(18, 2), item.unit_cost)
        .query(`
          UPDATE materials
          SET stock_qty = stock_qty + @qty, unit_cost = @unit_cost, updated_at = SYSDATETIME()
          WHERE material_id = @material_id
        `);

      // Catat kartu stok
      await new sql.Request(tx)
        .input('item_id', sql.Int, material_id)
        .input('qty', sql.Decimal(18, 3), item.qty_received)
        .input('source_id', sql.Int, pr_id)
        .input('created_by', sql.Int, received_by)
        .query(`
          INSERT INTO stock_movements (item_type, item_id, movement_type, source_type, source_id, qty, created_by)
          VALUES ('MATERIAL', @item_id, 'IN', 'PURCHASE', @source_id, @qty, @created_by)
        `);
    }

    const pr = await new sql.Request(tx)
      .input('pr_id', sql.Int, pr_id)
      .query(`SELECT po_id FROM purchase_requests WHERE pr_id = @pr_id`);
    po_id = pr.recordset[0].po_id;

    await new sql.Request(tx)
      .input('pr_id', sql.Int, pr_id)
      .query(`UPDATE purchase_requests SET status = 'RECEIVED', received_at = SYSDATETIME() WHERE pr_id = @pr_id`);

    await tx.commit();

    // Re-check stok untuk PO terkait (di luar transaksi karena memakai transaksi sendiri)
    if (po_id) {
      await checkStockAndCreatePR({ po_id, requested_by: received_by });
    }

    return { po_id };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

/**
 * STEP 4: Eksekusi produksi.
 * - Kurangi stok bahan sesuai qty_required (qty_used) pada material_requirements.
 * - Tambah stok produk jadi (finished_stock) sejumlah qty_plan.
 * - Hitung HPP otomatis = (material_cost + labor_cost + overhead_cost) / qty_plan.
 */
async function completeProduction({ po_id, labor_cost = 0, overhead_cost = 0, completed_by }) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const poRes = await new sql.Request(tx)
      .input('po_id', sql.Int, po_id)
      .query(`SELECT product_id, qty_plan, status FROM production_orders WHERE po_id = @po_id`);
    const po = poRes.recordset[0];
    if (!po) throw new Error('Production Order tidak ditemukan');
    if (po.status !== 'READY_TO_PRODUCE' && po.status !== 'IN_PROGRESS') {
      throw new Error(`Production Order berstatus '${po.status}', belum siap diproduksi (stok belum cukup).`);
    }

    const mrList = await new sql.Request(tx)
      .input('po_id', sql.Int, po_id)
      .query(`
        SELECT mr.mr_id, mr.material_id, mr.qty_required, m.stock_qty, m.unit_cost
        FROM material_requirements mr
        JOIN materials m ON m.material_id = mr.material_id
        WHERE mr.po_id = @po_id
      `);

    let materialCost = 0;

    for (const row of mrList.recordset) {
      if (row.stock_qty < row.qty_required) {
        throw new Error(`Stok bahan tidak mencukupi saat eksekusi produksi (material_id ${row.material_id}).`);
      }
      materialCost += row.qty_required * row.unit_cost;

      // Kurangi stok bahan
      await new sql.Request(tx)
        .input('material_id', sql.Int, row.material_id)
        .input('qty', sql.Decimal(18, 3), row.qty_required)
        .query(`
          UPDATE materials SET stock_qty = stock_qty - @qty, updated_at = SYSDATETIME()
          WHERE material_id = @material_id
        `);

      await new sql.Request(tx)
        .input('mr_id', sql.Int, row.mr_id)
        .input('qty_used', sql.Decimal(18, 3), row.qty_required)
        .query(`
          UPDATE material_requirements SET qty_used = @qty_used, status = 'USED' WHERE mr_id = @mr_id
        `);

      await new sql.Request(tx)
        .input('item_id', sql.Int, row.material_id)
        .input('qty', sql.Decimal(18, 3), row.qty_required)
        .input('source_id', sql.Int, po_id)
        .input('created_by', sql.Int, completed_by)
        .query(`
          INSERT INTO stock_movements (item_type, item_id, movement_type, source_type, source_id, qty, created_by)
          VALUES ('MATERIAL', @item_id, 'OUT', 'PRODUCTION_USAGE', @source_id, @qty, @created_by)
        `);
    }

    const totalCost = materialCost + Number(labor_cost) + Number(overhead_cost);
    const hppPerUnit = po.qty_plan > 0 ? totalCost / po.qty_plan : 0;

    // Tambah stok produk jadi
    await new sql.Request(tx)
      .input('product_id', sql.Int, po.product_id)
      .input('qty', sql.Int, po.qty_plan)
      .query(`
        UPDATE products SET finished_stock = finished_stock + @qty, updated_at = SYSDATETIME()
        WHERE product_id = @product_id
      `);

    await new sql.Request(tx)
      .input('item_id', sql.Int, po.product_id)
      .input('qty', sql.Decimal(18, 3), po.qty_plan)
      .input('source_id', sql.Int, po_id)
      .input('created_by', sql.Int, completed_by)
      .query(`
        INSERT INTO stock_movements (item_type, item_id, movement_type, source_type, source_id, qty, created_by)
        VALUES ('PRODUCT', @item_id, 'IN', 'PRODUCTION_OUTPUT', @source_id, @qty, @created_by)
      `);

    await new sql.Request(tx)
      .input('po_id', sql.Int, po_id)
      .input('material_cost', sql.Decimal(18, 2), materialCost)
      .input('labor_cost', sql.Decimal(18, 2), labor_cost)
      .input('overhead_cost', sql.Decimal(18, 2), overhead_cost)
      .input('hpp_per_unit', sql.Decimal(18, 2), hppPerUnit)
      .query(`
        UPDATE production_orders
        SET status = 'COMPLETED', material_cost = @material_cost, labor_cost = @labor_cost,
            overhead_cost = @overhead_cost, hpp_per_unit = @hpp_per_unit, finished_at = SYSDATETIME()
        WHERE po_id = @po_id
      `);

    await tx.commit();
    return { hpp_per_unit: hppPerUnit, material_cost: materialCost, total_cost: totalCost };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

module.exports = {
  createProductionOrderFromSO,
  checkStockAndCreatePR,
  receivePurchaseRequest,
  completeProduction,
};
