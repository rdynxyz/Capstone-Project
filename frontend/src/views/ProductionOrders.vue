<template>
  <div>
    <h2>Production Orders</h2>

    <div class="card" style="margin-bottom:16px">
      <table>
        <thead>
          <tr>
            <th>No. PO</th><th>No. SO</th><th>Customer</th><th>Produk</th><th>Qty</th>
            <th>Status</th><th>HPP/Unit</th><th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="po in productionOrders" :key="po.po_id">
            <td>{{ po.po_number }}</td>
            <td>{{ po.so_number }}</td>
            <td>{{ po.customer_name }}</td>
            <td>{{ po.product_name }}</td>
            <td>{{ po.qty_plan }}</td>
            <td><span class="badge" :class="statusClass(po.status)">{{ po.status }}</span></td>
            <td>{{ po.hpp_per_unit > 0 ? 'Rp ' + Number(po.hpp_per_unit).toLocaleString('id-ID') : '-' }}</td>
            <td style="display:flex; gap:6px; flex-wrap:wrap">
              <button class="btn btn-outline" @click="viewDetail(po)">Detail</button>
              <button v-if="po.status==='WAITING_MATERIAL'" class="btn btn-outline" @click="recheck(po)">Cek Ulang Stok</button>
              <button v-if="po.status==='READY_TO_PRODUCE'" class="btn btn-primary" @click="start(po)">Mulai Produksi</button>
              <button v-if="po.status==='IN_PROGRESS'" class="btn btn-accent" @click="openComplete(po)">Selesaikan & Hitung HPP</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Detail Material Requirement -->
    <div class="card" v-if="detail" style="margin-bottom:16px">
      <h3 style="margin-top:0">Material Requirement - {{ detail.po_number }}</h3>
      <table>
        <thead><tr><th>Bahan</th><th>Dibutuhkan</th><th>Tersedia</th><th>Kurang</th><th>Status</th></tr></thead>
        <tbody>
          <tr v-for="mr in detail.material_requirements" :key="mr.mr_id">
            <td>{{ mr.material_name }}</td>
            <td>{{ mr.qty_required }} {{ mr.unit }}</td>
            <td>{{ mr.qty_available }} {{ mr.unit }}</td>
            <td>{{ mr.qty_shortage }} {{ mr.unit }}</td>
            <td><span class="badge" :class="mrStatusClass(mr.status)">{{ mr.status }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Form selesaikan produksi -->
    <div class="card" v-if="completingPO">
      <h3 style="margin-top:0">Selesaikan Produksi - {{ completingPO.po_number }}</h3>
      <form @submit.prevent="submitComplete">
        <div class="form-row"><label>Biaya Tenaga Kerja (Rp)</label><input v-model.number="completeForm.labor_cost" type="number" /></div>
        <div class="form-row"><label>Biaya Overhead (Rp)</label><input v-model.number="completeForm.overhead_cost" type="number" /></div>
        <button class="btn btn-accent" type="submit">Selesaikan & Hitung HPP</button>
        <button type="button" class="btn btn-outline" @click="completingPO=null" style="margin-left:8px">Batal</button>
      </form>
      <p v-if="hppResult" style="color: var(--success); font-weight:600">
        HPP per unit: Rp {{ Number(hppResult.hpp_per_unit).toLocaleString('id-ID') }}
        (Total biaya: Rp {{ Number(hppResult.total_cost).toLocaleString('id-ID') }})
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive } from 'vue';
import api from '../api/axios';

const productionOrders = ref([]);
const detail = ref(null);
const completingPO = ref(null);
const completeForm = reactive({ labor_cost: 0, overhead_cost: 0 });
const hppResult = ref(null);

async function load() {
  const { data } = await api.get('/production-orders');
  productionOrders.value = data;
}

async function viewDetail(po) {
  const { data } = await api.get(`/production-orders/${po.po_id}`);
  detail.value = data;
}

async function recheck(po) {
  await api.post(`/production-orders/${po.po_id}/check-stock`);
  load();
}

async function start(po) {
  await api.post(`/production-orders/${po.po_id}/start`);
  load();
}

function openComplete(po) {
  completingPO.value = po;
  hppResult.value = null;
  completeForm.labor_cost = 0;
  completeForm.overhead_cost = 0;
}

async function submitComplete() {
  const { data } = await api.post(`/production-orders/${completingPO.value.po_id}/complete`, completeForm);
  hppResult.value = data;
  load();
}

function statusClass(status) {
  return {
    DRAFT: 'badge-muted', WAITING_MATERIAL: 'badge-danger', READY_TO_PRODUCE: 'badge-warning',
    IN_PROGRESS: 'badge-warning', COMPLETED: 'badge-success', CANCELLED: 'badge-danger',
  }[status] || 'badge-muted';
}
function mrStatusClass(status) {
  return { PENDING: 'badge-muted', SUFFICIENT: 'badge-success', SHORTAGE: 'badge-danger', FULFILLED: 'badge-success', USED: 'badge-muted' }[status] || 'badge-muted';
}

onMounted(load);
</script>
