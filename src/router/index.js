import { createRouter, createWebHistory } from 'vue-router';
import { supabase } from '../lib/supabase';

import Login from '../views/Login.vue';
import DashboardLayout from '../layouts/DashboardLayout.vue';

const routes = [
  {
    path: '/login',
    name: 'login',
    component: Login,
  },
  {
    path: '/',
    component: DashboardLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'dashboard',
        component: () => import('../views/Dashboard.vue'),
      },
      {
        path: 'sales',
        component: () => import('../views/Sales.vue'),
      },
      {
        path: 'products',
        component: () => import('../views/Products.vue'),
      },
      {
        path: 'pos',
        component: () => import('../views/Salepos.vue'),
      },
      {
        path: 'users',
        component: () => import('../views/AdminUsers.vue'),
        meta: { admin: true },
      },
      {
        path: 'egresos',
        component: () => import('../views/Egresos.vue'),
        meta: { admin: true },
      },
      {
        path: '/reset-password',
        component: () => import('../views/ResetPassword.vue'),
      },     
      {
        path: '/paymend-pending',
        component: () => import('../views/PendingPayments.vue'),
      },       
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to, from, next) => {
  const { data } = await supabase.auth.getSession();
  const isAuthenticated = !!data.session;

  if (to.meta.requiresAuth && !isAuthenticated) {
    return next('/login');
  }

  if (to.path === '/login' && isAuthenticated) {
    return next('/');
  }

  next();
});

export default router;
