USE creative_printing;
GO

-- Contoh bahan baku
INSERT INTO materials (material_code, material_name, category, unit, stock_qty, min_stock, unit_cost) VALUES
('BHN-001', 'Kain Dry-Fit', 'kain', 'meter', 50, 20, 45000),
('BHN-002', 'Tinta Sublim', 'tinta', 'liter', 10, 5, 150000),
('BHN-003', 'Benang Jahit', 'benang', 'roll', 30, 10, 8000),
('BHN-004', 'Plastik Packaging', 'packaging', 'pcs', 200, 50, 1000);
GO

-- Contoh produk jadi
INSERT INTO products (product_code, product_name, category, selling_price) VALUES
('PRD-001', 'Jersey Custom Full Print', 'Jersey', 150000);
GO

-- BOM untuk Jersey Custom Full Print (per 1 pcs)
INSERT INTO product_materials (product_id, material_id, qty_per_unit)
SELECT p.product_id, m.material_id, v.qty
FROM (VALUES ('BHN-001', 1.2), ('BHN-002', 0.15), ('BHN-003', 1), ('BHN-004', 1)) AS v(code, qty)
JOIN materials m ON m.material_code = v.code
CROSS JOIN products p WHERE p.product_code = 'PRD-001';
GO
