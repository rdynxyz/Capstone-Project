<template>
  <aside class="sidebar">
    <div class="brand">Aryagraphx.ID</div>
    <nav>
      <router-link to="/dashboard" active-class="active">Dashboard</router-link>
      <router-link to="/sales-orders" active-class="active">Pre-Order (SO)</router-link>
      <router-link to="/production-orders" active-class="active">Produksi</router-link>
      <router-link to="/materials" active-class="active">Bahan Baku</router-link>
      <router-link to="/products" active-class="active">Produk & BOM</router-link>
      <router-link to="/purchase-requests" active-class="active">Purchase Request</router-link>
      <router-link to="/reports" active-class="active">Laporan</router-link>
    </nav>
  </aside>
</template>
