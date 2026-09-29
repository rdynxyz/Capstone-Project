require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./src/routes/authRoutes');
const materialRoutes = require('./src/routes/materialRoutes');
const productRoutes = require('./src/routes/productRoutes');
const salesOrderRoutes = require('./src/routes/salesOrderRoutes');
const productionOrderRoutes = require('./src/routes/productionOrderRoutes');
const purchaseRequestRoutes = require('./src/routes/purchaseRequestRoutes');
const reportRoutes = require('./src/routes/reportRoutes');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.json({ message: 'Aryagraphx Inventory Control API aktif' }));

app.use('/api/auth', authRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sales-orders', salesOrderRoutes);
app.use('/api/production-orders', productionOrderRoutes);
app.use('/api/purchase-requests', purchaseRequestRoutes);
app.use('/api/reports', reportRoutes);

// Handler error umum
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Terjadi kesalahan pada server', detail: err.message });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server berjalan di http://localhost:${PORT}`));
