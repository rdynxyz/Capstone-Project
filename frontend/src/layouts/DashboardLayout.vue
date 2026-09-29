<template>
  <div class="layout">
    <Sidebar />
    <div class="main">
      <div class="topbar">
        <div></div>
        <div style="display:flex; align-items:center; gap:12px">
          <span style="font-size:14px">{{ auth.user?.full_name }} <span class="badge badge-muted">{{ auth.user?.role }}</span></span>
          <button class="btn btn-outline" @click="logout">Keluar</button>
        </div>
      </div>
      <router-view />
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router';
import Sidebar from '../components/Sidebar.vue';
import { useAuthStore } from '../store/auth';

const auth = useAuthStore();
const router = useRouter();

function logout() {
  auth.logout();
  router.push('/login');
}
</script>
