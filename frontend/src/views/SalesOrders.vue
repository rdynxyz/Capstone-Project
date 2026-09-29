<template>
  <div>
    <div class="topbar">
      <h2 style="margin:0">Pre-Order (Sales Order)</h2>
      <button class="btn btn-primary" @click="showForm = !showForm">{{ showForm ? 'Tutup' : '+ Buat Pre-Order' }}</button>
    </div>

    <div class="card" v-if="showForm" style="margin-bottom:16px">
      <form @submit.prevent="submit">
        <div class="form-row"><label>Nama Customer</label><input v-model="form.customer_name" required /></div>
        <div class="form-row"><label>Kontak Customer</label><input v-model="form.customer_contact" /></div>
        <div class="form-row"><label>Tenggat (Due Date)</label><input v-model="form.due_date" type="date" /></div>

        <h4>Item Pesanan</h4>
        <div v-for="(item, idx) in form.items" :key="idx" style="display:flex; gap:10px; align-items:flex-end; margin-bottom:10px">
          <div class="form-row" style="flex:1">
            <label>Produk</label>
            <select v-model.number="item.product_id" required>
              <option v-for="p in products" :key="p.product_id" :value="p.product_id">{{ p.product_name }}</option>
            </select>
          </div>
          <div class="form-row">
            <label>Qty (pcs)</label>
            <input v-model.number="item.qty_order" type="number" min="1" required />
          </div>
          <button type="button" class="btn btn-outline" @click="form.items.splice(idx,1)" v-if="form.items.length>1">Hapus</button>
        </div>
        <button type="button" class="btn btn-outline" @click="form.items.push({product_id:null, qty_order:1})">+ Tambah Item</button>
        <div style="margin-top:16px">
          <button class="btn btn-accent" type="submit">Buat Pre-Order</button>
        </div>
      </form>
    </div>

    <div class="card" v-if="!detail">
      <table>
        <thead><tr><th>No. SO</th><th>Customer</th><th>Tanggal</th><th>Tenggat</th><th>Status</th><th></th></tr></thead>
        <tbody>
          <tr v-for="s in salesOrders" :key="s.so_id">
            <td>{{ s.so_number }}</td>
            <td>{{ s.customer_name }}</td>
            <td>{{ formatDate(s.order_date) }}</td>
            <td>{{ formatDate(s.due_date) }}</td>
            <td><span class="badge" :class="statusClass(s.status)">{{ s.status }}</span></td>
            <td><button class="btn btn-outline" @click="openDetail(s)">Detail & Harga</button></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="card" v-if="detail">
      <div class="topbar">
        <h3 style="margin:0">{{ detail.so_number }} - {{ detail.customer_name }}</h3>
        <button class="btn btn-outline" @click="detail=null">Kembali ke Daftar</button>
      </div>
      <p style="color: var(--muted); font-size: 13px; margin-top:-6px">
        Tetapkan harga jual per item pesanan ini. Kalau dikosongkan, sistem tetap memakai harga standar produk untuk laporan.
      </p>
      <table>
        <thead><tr><th>Produk</th><th>Qty</th><th>HPP Produksi</th><th>Harga Jual Saat Ini</th><th>Harga Jual Baru</th><th></th></tr></thead>
        <tbody>
          <tr v-for="item in detail.items" :key="item.so_item_id">
            <td>{{ item.product_name }}</td>
            <td>{{ item.qty_order }}</td>
            <td>{{ item.hpp_ref ? 'Rp ' + formatRp(item.hpp_ref) : 'Belum diproduksi' }}</td>
            <td>Rp {{ formatRp(item.unit_price) }}</td>
            <td>
              <input v-model.number="priceForm[item.so_item_id]" type="number" step="100" placeholder="Rp." style="width:130px; height: 34px; padding:6px 8px; border:1px solid var(--border); border-radius:6px" />
            </td>
            <td><button class="btn btn-accent" @click="savePrice(item)">Simpan</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive } from 'vue';
import api from '../api/axios';

const salesOrders = ref([]);
const products = ref([]);
const productionOrders = ref([]);
const showForm = ref(false);
const detail = ref(null);
const priceForm = reactive({});
const form = reactive({ customer_name: '', customer_contact: '', due_date: '', items: [{ product_id: null, qty_order: 1 }] });

async function load() {
  const [so, p] = await Promise.all([api.get('/sales-orders'), api.get('/products')]);
  salesOrders.value = so.data;
  products.value = p.data;
}

async function submit() {
  await api.post('/sales-orders', form);
  showForm.value = false;
  Object.assign(form, { customer_name: '', customer_contact: '', due_date: '', items: [{ product_id: null, qty_order: 1 }] });
  load();
}

async function openDetail(s) {
  const [{ data: soDetail }, { data: poList }] = await Promise.all([
    api.get(`/sales-orders/${s.so_id}`),
    api.get('/production-orders'),
  ]);
  // Cari HPP dari Production Order yang sudah selesai, cocokkan per produk di SO ini
  soDetail.items = soDetail.items.map((item) => {
    const po = poList.find((p) => p.so_id === s.so_id && p.product_id === item.product_id && p.status === 'COMPLETED');
    return { ...item, hpp_ref: po ? po.hpp_per_unit : null };
  });
  detail.value = soDetail;
  Object.keys(priceForm).forEach((k) => delete priceForm[k]);
}

async function savePrice(item) {
  const newPrice = priceForm[item.so_item_id];
  if (!newPrice || newPrice <= 0) {
    alert('Isi dulu harga jual barunya (harus lebih dari 0)');
    return;
  }
  try {
    await api.put(`/sales-orders/items/${item.so_item_id}/price`, {
      unit_price: newPrice,
      hpp_snapshot: item.hpp_ref || 0,
    });
    item.unit_price = newPrice;
    priceForm[item.so_item_id] = null;
  } catch (err) {
    alert('Gagal menyimpan harga: ' + (err.response?.data?.message || err.message));
  }
}

function formatRp(v) { return Number(v || 0).toLocaleString('id-ID'); }
function formatDate(d) { return d ? new Date(d).toLocaleDateString('id-ID') : '-'; }
function statusClass(status) {
  return { NEW: 'badge-muted', IN_PRODUCTION: 'badge-warning', READY: 'badge-success', DELIVERED: 'badge-success', CANCELLED: 'badge-danger' }[status] || 'badge-muted';
}

onMounted(load);
</script>