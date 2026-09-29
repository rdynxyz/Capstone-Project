USE creative_printing;
GO

/* ===========
   BAHAN BAKU 
   =========== */
INSERT INTO materials (material_code, material_name, category, unit, stock_qty, min_stock, unit_cost) VALUES
('BHN-005', 'Kain Katun Combed 30s', 'kain', 'meter', 40, 15, 38000),
('BHN-006', 'Tinta DTF', 'tinta', 'liter', 8, 3, 180000),
('BHN-007', 'Film DTF', 'packaging', 'meter', 25, 10, 25000),
('BHN-008', 'Powder Perekat DTF', 'lainnya', 'kg', 5, 2, 90000),
('BHN-009', 'Totebag Kanvas Polos', 'lainnya', 'pcs', 60, 20, 12000),
('BHN-010', 'Mug Polos Putih', 'lainnya', 'pcs', 80, 30, 9000),
('BHN-011', 'Kertas Sublim Mug', 'packaging', 'lembar', 100, 40, 1500),
('BHN-012', 'Vinyl Stiker', 'lainnya', 'meter', 30, 10, 22000),
('BHN-013', 'Bahan Flexi Banner', 'lainnya', 'meter', 50, 20, 20000),
('BHN-014', 'Tali Lanyard Polyester', 'lainnya', 'meter', 100, 30, 3000),
('BHN-015', 'Klip/Hook Lanyard', 'lainnya', 'pcs', 200, 50, 1200);
GO

/* =============
    PRODUK JADI
   ============= */
INSERT INTO products (product_code, product_name, category, selling_price) VALUES
('PRD-002', 'Kaos Custom Sablon DTF', 'Kaos', 85000),
('PRD-003', 'Totebag Custom Print', 'Totebag', 45000),
('PRD-004', 'Mug Custom Print', 'Mug', 35000),
('PRD-005', 'Stiker Custom (per lembar A3)', 'Stiker', 15000),
('PRD-006', 'Spanduk/Banner Custom (per meter)', 'Banner', 40000),
('PRD-007', 'Lanyard Custom', 'Lanyard', 12000);
GO

/* ======================
   BOM (Bill of Material)
   ====================== */

-- PRD-002: Kaos Custom Sablon DTF
INSERT INTO product_materials (product_id, material_id, qty_per_unit)
SELECT p.product_id, m.material_id, v.qty
FROM (VALUES
  ('BHN-005', 1.0),   -- kain katun 1 meter per kaos
  ('BHN-006', 0.05),  -- tinta DTF
  ('BHN-007', 0.3),   -- film DTF
  ('BHN-008', 0.02),  -- powder perekat
  ('BHN-004', 1)       -- plastik packaging
) AS v(code, qty)
JOIN materials m ON m.material_code = v.code
CROSS JOIN products p WHERE p.product_code = 'PRD-002';
GO

-- PRD-003: Totebag Custom Print
INSERT INTO product_materials (product_id, material_id, qty_per_unit)
SELECT p.product_id, m.material_id, v.qty
FROM (VALUES
  ('BHN-009', 1),     -- totebag polos
  ('BHN-006', 0.03),  -- tinta DTF
  ('BHN-007', 0.15),  -- film DTF
  ('BHN-004', 1)       -- plastik packaging
) AS v(code, qty)
JOIN materials m ON m.material_code = v.code
CROSS JOIN products p WHERE p.product_code = 'PRD-003';
GO

-- PRD-004: Mug Custom Print
INSERT INTO product_materials (product_id, material_id, qty_per_unit)
SELECT p.product_id, m.material_id, v.qty
FROM (VALUES
  ('BHN-010', 1),     -- mug polos
  ('BHN-011', 1),     -- kertas sublim mug
  ('BHN-002', 0.02),  -- tinta sublim
  ('BHN-004', 1)       -- plastik packaging
) AS v(code, qty)
JOIN materials m ON m.material_code = v.code
CROSS JOIN products p WHERE p.product_code = 'PRD-004';
GO

-- PRD-005: Stiker Custom (per lembar A3)
INSERT INTO product_materials (product_id, material_id, qty_per_unit)
SELECT p.product_id, m.material_id, v.qty
FROM (VALUES
  ('BHN-012', 0.3),   -- vinyl stiker (meter per lembar A3)
  ('BHN-002', 0.01)   -- tinta
) AS v(code, qty)
JOIN materials m ON m.material_code = v.code
CROSS JOIN products p WHERE p.product_code = 'PRD-005';
GO

-- PRD-006: Spanduk/Banner Custom (per meter)
INSERT INTO product_materials (product_id, material_id, qty_per_unit)
SELECT p.product_id, m.material_id, v.qty
FROM (VALUES
  ('BHN-013', 1),     -- bahan flexi banner, 1 meter per unit
  ('BHN-002', 0.03)   -- tinta
) AS v(code, qty)
JOIN materials m ON m.material_code = v.code
CROSS JOIN products p WHERE p.product_code = 'PRD-006';
GO

-- PRD-007: Lanyard Custom
INSERT INTO product_materials (product_id, material_id, qty_per_unit)
SELECT p.product_id, m.material_id, v.qty
FROM (VALUES
  ('BHN-014', 0.9),   -- tali lanyard 90cm per pcs
  ('BHN-015', 1),     -- klip/hook
  ('BHN-002', 0.01)   -- tinta print logo
) AS v(code, qty)
JOIN materials m ON m.material_code = v.code
CROSS JOIN products p WHERE p.product_code = 'PRD-007';
GO

-- Cek hasil
SELECT * FROM materials ORDER BY material_id;
SELECT * FROM products ORDER BY product_id;
SELECT p.product_name, m.material_name, pm.qty_per_unit, m.unit
FROM product_materials pm
JOIN products p ON p.product_id = pm.product_id
JOIN materials m ON m.material_id = pm.material_id
ORDER BY p.product_id;