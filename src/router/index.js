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
        meta: { title: 'Inicio' },
      },
      {
        path: 'sales',
        component: () => import('../views/Sales.vue'),
        meta: { title: 'Ventas' },
      },
      {
        path: 'products',
        component: () => import('../views/Products.vue'),
        meta: { title: 'Productos' },
      },
      {
        path: 'pos',
        component: () => import('../views/Salepos.vue'),
        meta: { title: 'Punto de Venta' },
      },
      {
        path: 'users',
        component: () => import('../views/AdminUsers.vue'),
        meta: { title: 'Usuarios', admin: true },
      },
      {
        path: 'egresos',
        component: () => import('../views/Egresos.vue'),
        meta: { title: 'Egresos', admin: true },
      },
      {
        path: 'capital',
        component: () => import('../views/Capital.vue'),
        meta: { title: 'Capital', admin: true },
      },
      {
        path: '/reset-password',
        component: () => import('../views/ResetPassword.vue'),
      },     
      {
        path: '/paymend-pending',
        component: () => import('../views/PendingPayments.vue'),
        meta: { title: 'Pagos Pendientes' },
      },    
      {
        path: '/settings',
        component: () => import('../views/Settings.vue'),
        meta: { title: 'Configuraciones' },
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
