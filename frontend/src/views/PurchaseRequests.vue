<template>
  <div>
    <div class="topbar">
      <h2 style="margin:0">Purchase Request</h2>
      <button class="btn btn-primary" @click="showForm = !showForm">{{ showForm ? 'Tutup' : 'Ajukan Pembelian Manual' }}</button>
    </div>

    <div class="card" v-if="showForm" style="margin-bottom:16px">
      <p style="color: var(--muted); font-size: 13px; margin-top:0">
        Buat pengajuan pembelian bahan secara manual (restock preventif), tanpa perlu menunggu ada Production Order yang kekurangan stok.
      </p>
      <form @submit.prevent="submitManual">
        <div v-for="(item, idx) in manualForm" :key="idx" style="display:flex; gap:10px; align-items:flex-end; margin-bottom:10px">
          <div class="form-row" style="flex:1">
            <label>Bahan</label>
            <select v-model.number="item.material_id" required>
              <option v-for="m in materials" :key="m.material_id" :value="m.material_id">{{ m.material_name }} ({{ m.unit }})</option>
            </select>
          </div>
          <div class="form-row">
            <label>Qty yang Diajukan</label>
            <input v-model.number="item.qty_requested" type="number" step="0.01" min="0.01" required />
          </div>
          <button type="button" class="btn btn-outline" @click="manualForm.splice(idx,1)" v-if="manualForm.length>1">Hapus</button>
        </div>
        <button type="button" class="btn btn-outline" @click="manualForm.push({material_id:null, qty_requested:1})">+ Tambah Bahan</button>
        <div style="margin-top:16px">
          <button class="btn btn-accent" type="submit">Ajukan Pembelian</button>
        </div>
      </form>
    </div>

    <div class="card" style="margin-bottom:16px" v-if="!detail && !receiving">
      <table>
        <thead><tr><th>No. PR</th><th>Terkait PO</th><th>Diminta Oleh</th><th>Tanggal</th><th>Status</th><th>Aksi</th></tr></thead>
        <tbody>
          <tr v-for="pr in list" :key="pr.pr_id">
            <td>{{ pr.pr_number }}</td>
            <td>{{ pr.po_number || 'Manual' }}</td>
            <td>{{ pr.requested_by_name }}</td>
            <td>{{ formatDate(pr.requested_at) }}</td>
            <td><span class="badge" :class="statusClass(pr.status)">{{ pr.status }}</span></td>
            <td style="display:flex; gap:6px">
              <button class="btn btn-outline" @click="viewDetail(pr)">Detail</button>
              <button v-if="pr.status==='OPEN'" class="btn btn-outline" @click="markOrdered(pr)">Tandai Dipesan</button>
              <button v-if="pr.status==='OPEN' || pr.status==='ORDERED'" class="btn btn-accent" @click="openReceive(pr)">Terima Barang</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="card" v-if="detail" style="margin-bottom:16px">
      <div class="topbar">
        <h3 style="margin:0">Detail {{ detail.pr_number }}</h3>
        <button class="btn btn-outline" @click="detail=null">Kembali</button>
      </div>
      <table>
        <thead><tr><th>Bahan</th><th>Diminta</th><th>Diterima</th><th>Satuan</th></tr></thead>
        <tbody>
          <tr v-for="i in detail.items" :key="i.pr_item_id">
            <td>{{ i.material_name }}</td><td>{{ i.qty_requested }}</td><td>{{ i.qty_received }}</td><td>{{ i.unit }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="card" v-if="receiving">
      <div class="topbar">
        <h3 style="margin:0">Terima Barang - {{ receiving.pr_number }}</h3>
        <button class="btn btn-outline" @click="receiving=null">Kembali</button>
      </div>
      <form @submit.prevent="submitReceive">
        <div v-for="(item, idx) in receiveForm" :key="idx" style="display:flex; gap:10px; align-items:flex-end; margin-bottom:10px">
          <div class="form-row" style="flex:1"><label>{{ item.material_name }} ({{ item.unit }})</label>
            <div style="color:var(--muted); font-size:12px">Diminta: {{ item.qty_requested }}</div>
          </div>
          <div class="form-row"><label>Qty Diterima</label><input v-model.number="item.qty_received" type="number" step="0.01" required /></div>
          <div class="form-row"><label>Harga per Satuan (Rp)</label><input v-model.number="item.unit_cost" type="number" step="1" required /></div>
        </div>
        <button class="btn btn-accent" type="submit">Simpan Penerimaan</button>
        <button type="button" class="btn btn-outline" @click="receiving=null" style="margin-left:8px">Batal</button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive } from 'vue';
import api from '../api/axios';

const list = ref([]);
const materials = ref([]);
const detail = ref(null);
const receiving = ref(null);
const receiveForm = ref([]);
const showForm = ref(false);
const manualForm = reactive([{ material_id: null, qty_requested: 1 }]);

async function load() {
  const [pr, m] = await Promise.all([api.get('/purchase-requests'), api.get('/materials')]);
  list.value = pr.data;
  materials.value = m.data;
}

async function submitManual() {
  try {
    await api.post('/purchase-requests', { items: manualForm });
    showForm.value = false;
    manualForm.splice(0, manualForm.length, { material_id: null, qty_requested: 1 });
    load();
  } catch (err) {
    alert('Gagal mengajukan pembelian: ' + (err.response?.data?.message || err.message));
  }
}

async function viewDetail(pr) {
  receiving.value = null;
  const { data } = await api.get(`/purchase-requests/${pr.pr_id}`);
  detail.value = data;
}

async function markOrdered(pr) {
  await api.put(`/purchase-requests/${pr.pr_id}/order`);
  load();
}

async function openReceive(pr) {
  detail.value = null;
  receiving.value = pr;
  const { data } = await api.get(`/purchase-requests/${pr.pr_id}`);
  receiveForm.value = data.items.map((i) => ({
    pr_item_id: i.pr_item_id, material_name: i.material_name, unit: i.unit,
    qty_requested: i.qty_requested, qty_received: i.qty_requested, unit_cost: 0,
  }));
}

async function submitReceive() {
  try {
    await api.post(`/purchase-requests/${receiving.value.pr_id}/receive`, {
      items: receiveForm.value.map((i) => ({ pr_item_id: i.pr_item_id, qty_received: i.qty_received, unit_cost: i.unit_cost })),
    });
    receiving.value = null;
    load();
  } catch (err) {
    alert('Gagal menyimpan penerimaan: ' + (err.response?.data?.message || err.message));
  }
}

function formatDate(d) { return d ? new Date(d).toLocaleDateString('id-ID') : '-'; }
function statusClass(status) {
  return { OPEN: 'badge-danger', ORDERED: 'badge-warning', RECEIVED: 'badge-success', CANCELLED: 'badge-muted' }[status] || 'badge-muted';
}

onMounted(load);
</script>