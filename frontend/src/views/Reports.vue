<template>
  <div>
    <h2>Laporan</h2>

    <div class="card" style="margin-bottom:16px">
      <h3 style="margin-top:0">HPP vs Harga Jual</h3>
      <table>
        <thead><tr><th>No. PO</th><th>Produk</th><th>Qty</th><th>Biaya Bahan</th><th>HPP/Unit</th><th>Harga Jual</th><th>Margin/Unit</th></tr></thead>
        <tbody>
          <tr v-for="h in hpp" :key="h.po_id">
            <td>{{ h.po_number }}</td>
            <td>{{ h.product_name }}</td>
            <td>{{ h.qty_plan }}</td>
            <td>Rp {{ Number(h.material_cost).toLocaleString('id-ID') }}</td>
            <td>Rp {{ Number(h.hpp_per_unit).toLocaleString('id-ID') }}</td>
            <td>Rp {{ Number(h.selling_price).toLocaleString('id-ID') }}</td>
            <td :style="h.margin_per_unit >= 0 ? 'color: var(--success)' : 'color: var(--danger)'">
              Rp {{ Number(h.margin_per_unit).toLocaleString('id-ID') }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="card">
      <div class="topbar">
        <h3 style="margin:0">Kartu Stok (Keluar/Masuk Barang)</h3>
        <select v-model="filterType" @change="loadMovements">
          <option value="">Semua</option>
          <option value="MATERIAL">Bahan Baku</option>
          <option value="PRODUCT">Produk Jadi</option>
        </select>
      </div>
      <table>
        <thead><tr><th>Tanggal</th><th>Item</th><th>Tipe</th><th>Jenis</th><th>Qty</th><th>Oleh</th></tr></thead>
        <tbody>
          <tr v-for="m in movements" :key="m.movement_id">
            <td>{{ new Date(m.created_at).toLocaleString('id-ID') }}</td>
            <td>{{ m.item_name }}</td>
            <td>{{ m.item_type }}</td>
            <td><span class="badge" :class="m.movement_type==='IN' ? 'badge-success' : 'badge-danger'">{{ m.movement_type }}</span></td>
            <td>{{ m.qty }}</td>
            <td>{{ m.created_by_name || '-' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../api/axios';

const hpp = ref([]);
const movements = ref([]);
const filterType = ref('');

async function loadMovements() {
  const { data } = await api.get('/reports/stock-movements', { params: { item_type: filterType.value || undefined } });
  movements.value = data;
}

onMounted(async () => {
  const { data } = await api.get('/reports/hpp');
  hpp.value = data;
  loadMovements();
});
</script>
