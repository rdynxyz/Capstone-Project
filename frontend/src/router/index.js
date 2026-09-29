import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../store/auth';

import Login from '../views/Login.vue';
import DashboardLayout from '../layouts/DashboardLayout.vue';
import Dashboard from '../views/Dashboard.vue';
import Materials from '../views/Materials.vue';
import Products from '../views/Products.vue';
import SalesOrders from '../views/SalesOrders.vue';
import ProductionOrders from '../views/ProductionOrders.vue';
import PurchaseRequests from '../views/PurchaseRequests.vue';
import Reports from '../views/Reports.vue';

const routes = [
  { path: '/login', component: Login },
  {
    path: '/',
    component: DashboardLayout,
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/dashboard' },
      { path: 'dashboard', component: Dashboard },
      { path: 'materials', component: Materials },
      { path: 'products', component: Products },
      { path: 'sales-orders', component: SalesOrders },
      { path: 'production-orders', component: ProductionOrders },
      { path: 'purchase-requests', component: PurchaseRequests },
      { path: 'reports', component: Reports },
    ],
  },
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach((to, from, next) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.isLoggedIn) return next('/login');
  next();
});

export default router;
