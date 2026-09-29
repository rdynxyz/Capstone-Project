<template>
  <div class="login-wrapper">
    <div class="card login-card">
      <h2 style="margin-top:0; color: var(--primary); text-align: center;">Aryagraphx.ID</h2>
      <p style="color: var(--muted); font-size: 13px; margin-top:-8px; text-align: center;">Inventory Control</p>
      <form @submit.prevent="handleLogin">
        <div class="form-row">
          <label>Username</label>
          <input v-model="username" required />
        </div>
        <div class="form-row">
          <label>Password</label>
          <input v-model="password" type="password" required />
        </div>
        <p v-if="error" style="color: var(--danger); font-size: 13px">{{ error }}</p>
        <button class="btn btn-primary" style="width:100%" :disabled="loading">
          {{ loading ? 'Memproses...' : 'Masuk' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../store/auth';

const username = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);
const router = useRouter();
const auth = useAuthStore();

async function handleLogin() {
  error.value = '';
  loading.value = true;
  try {
    await auth.login(username.value, password.value);
    router.push('/dashboard');
  } catch (err) {
    error.value = err.response?.data?.message || 'Gagal login';
  } finally {
    loading.value = false;
  }
}
</script>
