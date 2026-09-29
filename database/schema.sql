/* ============================================================
   Database: creative_printing  (SQL Server / SQL Server Express)
   ============================================================ */

IF DB_ID('creative_printing') IS NULL
BEGIN
    CREATE DATABASE creative_printing;
END
GO

USE creative_printing;
GO

/* ---------------------------------------------------------
   1. USERS  (role-based access: owner / staff)
--------------------------------------------------------- */
CREATE TABLE users (
    user_id        INT IDENTITY(1,1) PRIMARY KEY,
    username       NVARCHAR(50)  NOT NULL UNIQUE,
    password_hash  NVARCHAR(255) NOT NULL,
    full_name      NVARCHAR(100) NOT NULL,
    role           NVARCHAR(20)  NOT NULL CHECK (role IN ('owner','staff')),
    is_active      BIT NOT NULL DEFAULT 1,
    created_at     DATETIME2 DEFAULT SYSDATETIME(),
    updated_at     DATETIME2 DEFAULT SYSDATETIME()
);
GO

/* ---------------------------------------------------------
   2. MATERIALS  (stok bahan baku: kain, tinta, benang, plastik, dll)
--------------------------------------------------------- */
CREATE TABLE materials (
    material_id     INT IDENTITY(1,1) PRIMARY KEY,
    material_code   NVARCHAR(30)  NOT NULL UNIQUE,
    material_name   NVARCHAR(100) NOT NULL,
    category        NVARCHAR(50),           -- kain, tinta, benang, packaging, dll
    unit            NVARCHAR(20)  NOT NULL, -- meter, liter, pcs, roll, dll
    stock_qty       DECIMAL(18,3) NOT NULL DEFAULT 0,
    min_stock       DECIMAL(18,3) NOT NULL DEFAULT 0,  -- reorder point
    unit_cost       DECIMAL(18,2) NOT NULL DEFAULT 0,  -- harga rata-rata / terakhir
    is_active       BIT NOT NULL DEFAULT 1,
    created_at      DATETIME2 DEFAULT SYSDATETIME(),
    updated_at      DATETIME2 DEFAULT SYSDATETIME()
);
GO

/* ---------------------------------------------------------
   3. PRODUCTS  (produk jadi)
--------------------------------------------------------- */
CREATE TABLE products (
    product_id      INT IDENTITY(1,1) PRIMARY KEY,
    product_code    NVARCHAR(30)  NOT NULL UNIQUE,
    product_name    NVARCHAR(100) NOT NULL,   -- ex: Jersey Custom Full Print
    category        NVARCHAR(50),
    finished_stock  INT NOT NULL DEFAULT 0,   -- stok produk jadi (ready stock)
    selling_price   DECIMAL(18,2) NOT NULL DEFAULT 0,
    is_active       BIT NOT NULL DEFAULT 1,
    created_at      DATETIME2 DEFAULT SYSDATETIME(),
    updated_at      DATETIME2 DEFAULT SYSDATETIME()
);
GO

/* ---------------------------------------------------------
   3b. PRODUCT_MATERIALS  (BOM / Bill of Material per 1 pcs produk)
--------------------------------------------------------- */
CREATE TABLE product_materials (
    bom_id          INT IDENTITY(1,1) PRIMARY KEY,
    product_id      INT NOT NULL FOREIGN KEY REFERENCES products(product_id),
    material_id     INT NOT NULL FOREIGN KEY REFERENCES materials(material_id),
    qty_per_unit    DECIMAL(18,4) NOT NULL, -- kebutuhan bahan per 1 pcs produk
    CONSTRAINT uq_product_material UNIQUE (product_id, material_id)
);
GO

/* ---------------------------------------------------------
   4. SALES_ORDERS  (Pre-Order / SO dari customer)
--------------------------------------------------------- */
CREATE TABLE sales_orders (
    so_id           INT IDENTITY(1,1) PRIMARY KEY,
    so_number       NVARCHAR(30) NOT NULL UNIQUE,
    customer_name   NVARCHAR(100) NOT NULL,
    customer_contact NVARCHAR(50),
    order_date      DATETIME2 DEFAULT SYSDATETIME(),
    due_date        DATETIME2,
    status          NVARCHAR(20) NOT NULL DEFAULT 'NEW'
                    CHECK (status IN ('NEW','IN_PRODUCTION','READY','DELIVERED','CANCELLED')),
    total_price     DECIMAL(18,2) NOT NULL DEFAULT 0,
    created_by      INT FOREIGN KEY REFERENCES users(user_id),
    created_at      DATETIME2 DEFAULT SYSDATETIME()
);
GO

CREATE TABLE sales_order_items (
    so_item_id      INT IDENTITY(1,1) PRIMARY KEY,
    so_id           INT NOT NULL FOREIGN KEY REFERENCES sales_orders(so_id),
    product_id      INT NOT NULL FOREIGN KEY REFERENCES products(product_id),
    qty_order       INT NOT NULL,          -- contoh: Jersey 12 pcs
    unit_price      DECIMAL(18,2) NOT NULL DEFAULT 0,  -- ditentukan owner setelah HPP dihitung
    hpp_snapshot    DECIMAL(18,2) NOT NULL DEFAULT 0
);
GO

/* ---------------------------------------------------------
   5. PRODUCTION_ORDERS  (dibuat otomatis dari SO)
--------------------------------------------------------- */
CREATE TABLE production_orders (
    po_id           INT IDENTITY(1,1) PRIMARY KEY,
    po_number       NVARCHAR(30) NOT NULL UNIQUE,
    so_id           INT NOT NULL FOREIGN KEY REFERENCES sales_orders(so_id),
    product_id      INT NOT NULL FOREIGN KEY REFERENCES products(product_id),
    qty_plan        INT NOT NULL,
    status          NVARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                    CHECK (status IN ('DRAFT','WAITING_MATERIAL','READY_TO_PRODUCE','IN_PROGRESS','COMPLETED','CANCELLED')),
    material_cost   DECIMAL(18,2) NOT NULL DEFAULT 0, -- total biaya bahan (terisi saat produksi selesai)
    labor_cost      DECIMAL(18,2) NOT NULL DEFAULT 0,
    overhead_cost   DECIMAL(18,2) NOT NULL DEFAULT 0,
    hpp_per_unit    DECIMAL(18,2) NOT NULL DEFAULT 0, -- HPP otomatis = total_cost / qty_plan
    started_at      DATETIME2,
    finished_at     DATETIME2,
    created_by      INT FOREIGN KEY REFERENCES users(user_id),
    created_at      DATETIME2 DEFAULT SYSDATETIME()
);
GO

/* ---------------------------------------------------------
   6. MATERIAL_REQUIREMENTS  (kebutuhan bahan per produksi, hasil explode BOM)
--------------------------------------------------------- */
CREATE TABLE material_requirements (
    mr_id           INT IDENTITY(1,1) PRIMARY KEY,
    po_id           INT NOT NULL FOREIGN KEY REFERENCES production_orders(po_id),
    material_id     INT NOT NULL FOREIGN KEY REFERENCES materials(material_id),
    qty_required    DECIMAL(18,3) NOT NULL,  -- qty_plan x qty_per_unit (BOM)
    qty_available    DECIMAL(18,3) NOT NULL DEFAULT 0, -- stok saat pengecekan
    qty_shortage    DECIMAL(18,3) NOT NULL DEFAULT 0,  -- jika kurang
    qty_used        DECIMAL(18,3) NOT NULL DEFAULT 0,  -- realisasi pemakaian saat produksi
    status          NVARCHAR(20) NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','SUFFICIENT','SHORTAGE','FULFILLED','USED'))
);
GO

/* ---------------------------------------------------------
   7. PURCHASE_REQUESTS  (dibuat otomatis jika stok kurang)
--------------------------------------------------------- */
CREATE TABLE purchase_requests (
    pr_id           INT IDENTITY(1,1) PRIMARY KEY,
    pr_number       NVARCHAR(30) NOT NULL UNIQUE,
    po_id           INT FOREIGN KEY REFERENCES production_orders(po_id), -- sumber kebutuhan (nullable utk restock manual)
    status          NVARCHAR(20) NOT NULL DEFAULT 'OPEN'
                    CHECK (status IN ('OPEN','ORDERED','RECEIVED','CANCELLED')),
    requested_by    INT FOREIGN KEY REFERENCES users(user_id),
    requested_at    DATETIME2 DEFAULT SYSDATETIME(),
    received_at     DATETIME2
);
GO

CREATE TABLE purchase_request_items (
    pr_item_id      INT IDENTITY(1,1) PRIMARY KEY,
    pr_id           INT NOT NULL FOREIGN KEY REFERENCES purchase_requests(pr_id),
    material_id     INT NOT NULL FOREIGN KEY REFERENCES materials(material_id),
    qty_requested   DECIMAL(18,3) NOT NULL,
    qty_received    DECIMAL(18,3) NOT NULL DEFAULT 0,
    unit_cost       DECIMAL(18,2) NOT NULL DEFAULT 0
);
GO

/* ---------------------------------------------------------
   8. STOCK_MOVEMENTS  (kartu stok - log keluar/masuk bahan & produk)
--------------------------------------------------------- */
CREATE TABLE stock_movements (
    movement_id     INT IDENTITY(1,1) PRIMARY KEY,
    item_type       NVARCHAR(20) NOT NULL CHECK (item_type IN ('MATERIAL','PRODUCT')),
    item_id         INT NOT NULL,           -- material_id atau product_id
    movement_type   NVARCHAR(20) NOT NULL CHECK (movement_type IN ('IN','OUT')),
    source_type     NVARCHAR(30) NOT NULL,  -- PURCHASE, PRODUCTION_USAGE, PRODUCTION_OUTPUT, SALES_DELIVERY, ADJUSTMENT
    source_id       INT,                    -- id referensi (pr_id / po_id / so_id)
    qty             DECIMAL(18,3) NOT NULL,
    note            NVARCHAR(255),
    created_by      INT FOREIGN KEY REFERENCES users(user_id),
    created_at      DATETIME2 DEFAULT SYSDATETIME()
);
GO

CREATE INDEX ix_stock_movements_item ON stock_movements(item_type, item_id);
CREATE INDEX ix_mr_po ON material_requirements(po_id);
CREATE INDEX ix_pr_items_pr ON purchase_request_items(pr_id);
GO

/* Seed default owner user (password harus di-hash ulang lewat API saat setup) */
INSERT INTO users (username, password_hash, full_name, role)
VALUES ('owner', '$2a$10$CHANGE_ME_HASH', 'Owner Aryagraphx', 'owner');
GO
