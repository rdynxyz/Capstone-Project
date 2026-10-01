<template>
  <div>
    <div class="topbar">
      <h2 style="margin:0">Produk & Komposisi Bahan (BOM)</h2>
      <button class="btn btn-primary" @click="showForm = !showForm">{{ showForm ? 'Tutup' : 'Tambah Produk' }}</button>
    </div>

    <div class="card" v-if="showForm" style="margin-bottom:16px">
      <form @submit.prevent="submit">
        <div class="form-row"><label>Kode Produk</label><input v-model="form.product_code" required /></div>
        <div class="form-row"><label>Nama Produk</label><input v-model="form.product_name" placeholder="ex: Jersey Custom Full Print" required /></div>
        <div class="form-row"><label>Kategori</label><input v-model="form.category" /></div>
        <div class="form-row"><label>Harga Jual (opsional, bisa diisi setelah HPP diketahui)</label><input v-model.number="form.selling_price" type="number" step="100" /></div>
        <button class="btn btn-accent" type="submit">Simpan</button>
      </form>
    </div>

    <div class="card" v-if="!editingProduct && !selectedProduct" style="margin-bottom:16px">
      <table>
        <thead><tr><th>Kode</th><th>Nama Produk</th><th>Kategori</th><th>Stok Jadi</th><th>Harga Jual</th><th></th></tr></thead>
        <tbody>
          <tr v-for="p in products" :key="p.product_id">
            <td>{{ p.product_code }}</td>
            <td>{{ p.product_name }}</td>
            <td>{{ p.category }}</td>
            <td>{{ p.finished_stock }}</td>
            <td>Rp {{ Number(p.selling_price).toLocaleString('id-ID') }}</td>
            <td style="display:flex; gap:6px; justify-content:flex-end;">
              <button class="btn btn-outline" @click="editProduct(p)">Edit</button>
              <button class="btn btn-outline" @click="openBom(p)">Atur BOM</button>
              <button class="btn btn-danger" @click="deleteProduct(p)">Hapus</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="card" v-if="editingProduct" style="margin-bottom:16px">
      <div class="topbar">
        <h3 style="margin:0">Edit Produk: {{ editingProduct.product_name }}</h3>
        <button class="btn btn-outline" @click="editingProduct=null">Kembali</button>
      </div>
      <form @submit.prevent="submitEdit">
        <div class="form-row"><label>Kode Produk</label><input v-model="editForm.product_code" required /></div>
        <div class="form-row"><label>Nama Produk</label><input v-model="editForm.product_name" required /></div>
        <div class="form-row"><label>Kategori</label><input v-model="editForm.category" /></div>
        <div class="form-row"><label>Harga Jual</label><input v-model.number="editForm.selling_price" type="number" step="100" /></div>
        <button class="btn btn-accent" type="submit">Simpan Perubahan</button>
        <button type="button" class="btn btn-outline" @click="editingProduct=null" style="margin-left:8px">Batal</button>
      </form>
    </div>

    <div class="card" v-if="selectedProduct">
      <div class="topbar">
        <h3 style="margin:0">BOM: {{ selectedProduct.product_name }}</h3>
        <button class="btn btn-outline" @click="selectedProduct=null">Kembali</button>
      </div>
      <form @submit.prevent="addBom" style="display:flex; gap:10px; align-items:flex-end; margin-bottom:16px">
        <div class="form-row" style="flex:1">
          <label>Bahan</label>
          <select v-model.number="bomForm.material_id" required>
            <option v-for="m in materials" :key="m.material_id" :value="m.material_id">{{ m.material_name }} ({{ m.unit }})</option>
          </select>
        </div>
        <div class="form-row">
          <label>Qty per 1 pcs produk</label>
          <input v-model.number="bomForm.qty_per_unit" type="number" step="0.001" required />
        </div>
        <div class="form-row">
          <label style="visibility:hidden">Aksi</label>
          <button class="btn btn-primary" type="submit">Tambah</button>
        </div>
      </form>
      <table>
        <thead><tr><th>Bahan</th><th>Qty per Unit</th><th>Satuan</th><th></th></tr></thead>
        <tbody>
          <tr v-for="b in bomList" :key="b.bom_id">
            <td>{{ b.material_name }}</td><td>{{ b.qty_per_unit }}</td><td>{{ b.unit }}</td>
            <td style="display:flex; gap:6px; justify-content:flex-end;">
              <button class="btn btn-danger" @click="deleteBom(b)">Hapus</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive } from 'vue';
import api from '../api/axios';

const products = ref([]);
const materials = ref([]);
const showForm = ref(false);
const selectedProduct = ref(null);
const bomList = ref([]);
const form = reactive({ product_code: '', product_name: '', category: '', selling_price: 0 });
const bomForm = reactive({ material_id: null, qty_per_unit: 0 });

const editingProduct = ref(null);
const editForm = reactive({ product_code: '', product_name: '', category: '', selling_price: 0 });

async function load() {
  const [p, m] = await Promise.all([api.get('/products'), api.get('/materials')]);
  products.value = p.data;
  materials.value = m.data;
}

async function submit() {
  try {
    await api.post('/products', form);
    showForm.value = false;
    Object.assign(form, { product_code: '', product_name: '', category: '', selling_price: 0 });
    load();
  } catch (err) {
    alert('Gagal menyimpan produk: ' + (err.response?.data?.message || err.message));
  }
}

async function deleteProduct(p) {
  if (!confirm(`Hapus permanen produk "${p.product_name}" dari database? Tindakan ini tidak bisa dibatalkan.`)) return;
  try {
    await api.delete(`/products/${p.product_id}`);
    if (selectedProduct.value?.product_id === p.product_id) selectedProduct.value = null;
    load();
  } catch (err) {
    alert(err.response?.data?.message || 'Gagal menghapus produk');
  }
}

function editProduct(p) {
  selectedProduct.value = null;
  editingProduct.value = p;
  Object.assign(editForm, { product_code: p.product_code, product_name: p.product_name, category: p.category, selling_price: p.selling_price });
}

async function submitEdit() {
  await api.put(`/products/${editingProduct.value.product_id}`, editForm);
  editingProduct.value = null;
  load();
}

async function openBom(p) {
  editingProduct.value = null;
  selectedProduct.value = p;
  const { data } = await api.get(`/products/${p.product_id}/bom`);
  bomList.value = data;
}

async function addBom() {
  await api.post(`/products/${selectedProduct.value.product_id}/bom`, bomForm);
  const { data } = await api.get(`/products/${selectedProduct.value.product_id}/bom`);
  bomList.value = data;
  bomForm.material_id = null;
  bomForm.qty_per_unit = 0;
}

onMounted(load);
</script>
