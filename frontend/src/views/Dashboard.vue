<template>
  <div class="dash">
    <div class="dash-header">
      <div>
        <h2 style="margin:0">Dashboard</h2>
        <p class="subtitle">Ringkasan stok dan produksi</p>
      </div>
      <div class="today-date">{{ todayLabel }}</div>
    </div>

    
    <!-- stat cards -->
    <div class="stat-row">
      <div class="stat-card stat-dark">
        <div class="stat-title">Pendapatan Pre-Order Hari Ini</div>
        <div class="stat-big">Rp {{ formatRp(data.revenue_today) }}</div>
        <div class="stat-note">Dari Pre-Order yang dibuat hari ini</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Laba Kotor Hari Ini</div>
        <div class="stat-big dark-text">Rp {{ formatRp(data.margin_today) }}</div>
        <div class="stat-note">Selisih harga jual vs HPP</div>
      </div>
      <div class="stat-card stat-dark">
        <div class="stat-title">Nilai Persediaan</div>
        <div class="stat-big dark-text">Rp {{ formatRp(data.inventory_value) }}</div>
        <div class="stat-note">{{ data.material_types || 0 }} jenis bahan &middot; {{ Math.round(data.material_units || 0) }} unit</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Perlu Restock</div>
        <div class="stat-big dark-text">{{ data.low_stock?.length || 0 }}</div>
        <div class="stat-note">Stok sudah menyentuh batas minimum</div>
      </div>
    </div>

    <!-- transaksi terakhir -->
    <div class="panel">
      <div class="panel-title">Pre-Order Terbaru</div>
      <div class="panel-sub">Delapan pencatatan paling baru</div>
      <table class="mini-table">
        <thead><tr><th>Nomor</th><th>Status</th><th>Tanggal</th><th>Customer</th><th>Petugas</th><th style="text-align:right">Nilai</th></tr></thead>
        <tbody>
          <tr v-for="s in data.recent_sales_orders" :key="s.so_number">
            <td>{{ s.so_number }}</td>
            <td><span class="badge" :class="statusClass(s.status)">{{ s.status }}</span></td>
            <td>{{ formatDate(s.order_date) }}</td>
            <td>{{ s.customer_name }}</td>
            <td>{{ s.created_by_name || '-' }}</td>
            <td style="text-align:right">Rp {{ formatRp(s.total_value) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- barang paling laku + stok menipis -->
    <div class="row-2col">
      <div class="panel">
        <div class="panel-title">Produk Paling Laku</div>
        <div class="panel-sub">Jumlah unit dipesan dalam 30 hari</div>
        <div class="chart-box">
          <Bar v-if="topProductsChart.labels.length" :data="topProductsChart" :options="barOptions" />
          <p v-else class="empty-note">Belum ada Pre-Order dalam 30 hari terakhir.</p>
        </div>
      </div>
      <div class="panel">
        <div class="panel-title-row">
          <div>
            <div class="panel-title">Stok Menipis</div>
            <div class="panel-sub">Segera ajukan pembelian</div>
          </div>
        </div>
        <table class="mini-table" v-if="data.low_stock?.length">
          <thead><tr><th>Bahan</th><th>Sisa</th><th>Minimum</th><th></th></tr></thead>
          <tbody>
            <tr v-for="m in data.low_stock" :key="m.material_id">
              <td>
                <div class="cell-main">{{ m.material_name }}</div>
                <div class="cell-sub">{{ m.material_code }}</div>
              </td>
              <td>{{ m.stock_qty }} {{ m.unit }}</td>
              <td>{{ m.min_stock }} {{ m.unit }}</td>
              <td><span class="badge badge-warning">NOK</span></td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty-note">Semua stok bahan aman.</p>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue';
import { Line, Doughnut, Bar } from 'vue-chartjs';
import {
  Chart as ChartJS, Title, Tooltip, Legend, PointElement, LineElement,
  CategoryScale, LinearScale, Filler, ArcElement, BarElement,
} from 'chart.js';
import api from '../api/axios';

ChartJS.register(Title, Tooltip, Legend, PointElement, LineElement, CategoryScale, LinearScale, Filler, ArcElement, BarElement);

const data = reactive({
  revenue_today: 0, margin_today: 0, inventory_value: 0,
  material_types: 0, material_units: 0,
  low_stock: [], stock_by_category: [], top_products: [], recent_sales_orders: [], flow_14d: [],
});

const todayLabel = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

function formatRp(v) { return Number(v || 0).toLocaleString('id-ID'); }
function formatDate(d) { return d ? new Date(d).toLocaleDateString('id-ID') : '-'; }
function statusClass(status) {
  return { NEW: 'badge-muted', IN_PRODUCTION: 'badge-warning', READY: 'badge-success', DELIVERED: 'badge-success', CANCELLED: 'badge-danger' }[status] || 'badge-muted';
}

const flowChart = computed(() => ({
  labels: data.flow_14d.map((d) => d.label),
  datasets: [
    { label: 'Nilai Pre-Order', data: data.flow_14d.map((d) => d.sales_value), borderColor: '#1e3a5f', backgroundColor: 'rgba(30,58,95,0.12)', fill: true, tension: 0.4, pointRadius: 3 },
    { label: 'Nilai Pembelian', data: data.flow_14d.map((d) => d.purchase_value), borderColor: '#d97706', backgroundColor: 'rgba(217,119,6,0.10)', fill: true, tension: 0.4, pointRadius: 3 },
  ],
}));
const flowOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { ticks: { callback: (v) => (v >= 1000 ? v / 1000 + 'rb' : v) } } } };

const categoryColors = ['#1e3a5f', '#d97706', '#16a34a', '#7c3aed', '#0891b2', '#dc2626'];
const categoryChart = computed(() => ({
  labels: data.stock_by_category.map((c) => c.category),
  datasets: [{ data: data.stock_by_category.map((c) => c.jumlah_jenis), backgroundColor: categoryColors, borderWidth: 0 }],
}));
const donutOptions = { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom' } } };

const topProductsChart = computed(() => ({
  labels: data.top_products.map((p) => p.product_name),
  datasets: [{ label: 'Unit dipesan', data: data.top_products.map((p) => p.total_qty), backgroundColor: '#1e3a5f', borderRadius: 4 }],
}));
const barOptions = { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } };

onMounted(async () => {
  const { data: res } = await api.get('/reports/dashboard-detail');
  Object.assign(data, res);
});
</script>

<style scoped>
.dash-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 16px; }
.subtitle { color: var(--muted); font-size: 13px; margin: 2px 0 0; }
.today-date { color: var(--muted); font-size: 13px; }

.stat-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-bottom: 16px; }
.stat-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 16px 18px; }
.stat-dark { background: var(--primary); border-color: var(--primary); }
.stat-dark .stat-title, .stat-dark .stat-note { color: rgba(255,255,255,0.75); }
.stat-dark .stat-big { color: #fff; }
.stat-warning { background: #fef3c7; border-color: #fde68a; }
.stat-title { font-size: 12px; color: var(--muted); margin-bottom: 6px; }
.stat-big { font-size: 24px; font-weight: 700; }
.dark-text { color: var(--text); }
.stat-note { font-size: 11px; color: var(--muted); margin-top: 6px; }

.row-2col { display: grid; grid-template-columns: 1.3fr 1fr; gap: 14px; margin-bottom: 14px; }
@media (max-width: 900px) { .row-2col { grid-template-columns: 1fr; } }

.panel { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 18px; margin-bottom: 14px; }
.panel-title { font-weight: 700; font-size: 15px; }
.panel-sub { font-size: 12px; color: var(--muted); margin-bottom: 14px; }
.panel-title-row { display:flex; justify-content: space-between; align-items:flex-start; }
.empty-note { color: var(--muted); font-size: 13px; }

.mini-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.mini-table th { text-align: left; color: var(--muted); font-weight: 600; padding: 8px 6px; border-bottom: 1px solid var(--border); }
.mini-table td { padding: 10px 6px; border-bottom: 1px solid var(--border); vertical-align: middle; }
.cell-main { font-weight: 600; }
.cell-sub { font-size: 11px; color: var(--muted); }

.chart-box { position: relative; width: 100%; height: 260px; }
</style>