<template>
  <div>
    <div class="topbar">
      <h2 style="margin:0">Bahan Baku</h2>
      <button class="btn btn-primary" @click="showForm = !showForm">{{ showForm ? 'Tutup' : 'Tambah Bahan Baru' }}</button>
    </div>

    <div class="card" v-if="showForm" style="margin-bottom:16px">
      <form @submit.prevent="submit">
        <div class="form-row"><label>Kode Bahan</label><input v-model="form.material_code" required /></div>
        <div class="form-row"><label>Nama Bahan</label><input v-model="form.material_name" required /></div>
        <div class="form-row"><label>Kategori</label><input v-model="form.category" placeholder="kain / tinta / benang / packaging" /></div>
        <div class="form-row"><label>Satuan</label><input v-model="form.unit" placeholder="meter / liter / pcs" required /></div>
        <div class="form-row"><label>Stok Awal</label><input v-model.number="form.stock_qty" type="number" step="0.01" /></div>
        <div class="form-row"><label>Stok Minimum</label><input v-model.number="form.min_stock" type="number" step="0.01" /></div>
        <div class="form-row"><label>Harga per Satuan</label><input v-model.number="form.unit_cost" type="number" step="0.01" /></div>
        <button class="btn btn-accent" type="submit">Simpan</button>
      </form>
    </div>

    <div class="card" v-if="editingMaterial" style="margin-bottom:16px">
      <div class="topbar">
        <h3 style="margin:0">Edit Bahan: {{ editingMaterial.material_name }}</h3>
        <button class="btn btn-outline" @click="editingMaterial=null">Kembali</button>
      </div>
      <form @submit.prevent="submitEdit">
        <div class="form-row"><label>Nama Bahan</label><input v-model="editForm.material_name" required /></div>
        <div class="form-row"><label>Kategori</label><input v-model="editForm.category" /></div>
        <div class="form-row"><label>Satuan</label><input v-model="editForm.unit" required /></div>
        <div class="form-row"><label>Stok Minimum</label><input v-model.number="editForm.min_stock" type="number" step="0.01" /></div>
        <div class="form-row"><label>Harga per Satuan</label><input v-model.number="editForm.unit_cost" type="number" step="0.01" /></div>
        <button class="btn btn-accent" type="submit">Simpan Perubahan</button>
        <button type="button" class="btn btn-outline" @click="editingMaterial=null" style="margin-left:8px">Batal</button>
      </form>
    </div>

    <div class="card" v-if="!editingMaterial">
      <table>
        <thead>
          <tr><th>Kode</th><th>Nama</th><th>Kategori</th><th>Stok</th><th>Min</th><th>Satuan</th><th>Harga</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="m in materials" :key="m.material_id">
            <td>{{ m.material_code }}</td>
            <td>{{ m.material_name }}</td>
            <td>{{ m.category }}</td>
            <td>{{ m.stock_qty }}</td>
            <td>{{ m.min_stock }}</td>
            <td>{{ m.unit }}</td>
            <td>Rp {{ Number(m.unit_cost).toLocaleString('id-ID') }}</td>
            <td>
              <span v-if="m.stock_qty < m.min_stock" class="badge badge-danger">NOK</span>
              <span v-else class="badge badge-success">OK</span>
            </td>
            <td style="display:flex; gap:6px; justify-content:flex-end;">
              <button class="btn btn-outline" @click="editMaterial(m)">Edit</button>
              <!-- <button class="btn btn-outline" @click="addMaterial(m)">Tambah</button> -->
              <button class="btn btn-danger" @click="deleteMaterial(m)">Hapus</button>
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

const materials = ref([]);
const showForm = ref(false);
const form = reactive({ material_code: '', material_name: '', category: '', unit: '', stock_qty: 0, min_stock: 0, unit_cost: 0 });

const editingMaterial = ref(null);
const editForm = reactive({ material_name: '', category: '', unit: '', min_stock: 0, unit_cost: 0 });

async function load() {
  const { data } = await api.get('/materials');
  materials.value = data;
}

async function submit() {
  try {
    await api.post('/materials', form);
    showForm.value = false;
    Object.assign(form, { material_code: '', material_name: '', category: '', unit: '', stock_qty: 0, min_stock: 0, unit_cost: 0 });
    load();
  } catch (err) {
    alert('Gagal menyimpan bahan: ' + (err.response?.data?.message || err.message));
  }
}

function editMaterial(m) {
  editingMaterial.value = m;
  Object.assign(editForm, { material_name: m.material_name, category: m.category, unit: m.unit, min_stock: m.min_stock, unit_cost: m.unit_cost });
}

async function submitEdit() {
  try {
    await api.put(`/materials/${editingMaterial.value.material_id}`, editForm);
    editingMaterial.value = null;
    load();
  } catch (err) {
    alert('Gagal menyimpan perubahan: ' + (err.response?.data?.message || err.message));
  }
}

async function deleteMaterial(m) {
  if (!confirm(`Hapus permanen bahan "${m.material_name}" dari database? Tindakan ini tidak bisa dibatalkan.`)) return;
  try {
    await api.delete(`/materials/${m.material_id}`);
    load();
  } catch (err) {
    alert(err.response?.data?.message || 'Gagal menghapus bahan');
  }
}

onMounted(load);
</script>