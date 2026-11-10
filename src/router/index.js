import { createRouter, createWebHistory } from 'vue-router';

import Login from '../views/Login.vue';
import DashboardLayout from '../layouts/DashboardLayout.vue';

const routes = [
  {
    path: '/login',
    name: 'login',
    component: Login,
  },
  {
    path: '/catalogo-kiopos/:storeId',
    component: () => import('../views/CatalogoKioPos.vue'),
    meta: { title: 'catalogo' },
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
        meta: { title: 'Inicio', requiresAuth: true },
      },
      {
        path: 'sales',
        component: () => import('../views/Sales.vue'),
        meta: { title: 'Ventas', requiresAuth: true },
      },
      {
        path: 'products',
        component: () => import('../views/Products.vue'),
        meta: { title: 'Productos', requiresAuth: true },
      },
      {
        path: 'pos',
        component: () => import('../views/Salepos.vue'),
        meta: { title: 'Punto de Venta', requiresAuth: true },
      },
      {
        path: 'users',
        component: () => import('../views/AdminUsers.vue'),
        meta: { title: 'Usuarios', requiresAuth: true },
      },
      {
        path: 'egresos',
        component: () => import('../views/Egresos.vue'),
        meta: { title: 'Egresos', requiresAuth: true },
      },
      {
        path: 'capital',
        component: () => import('../views/Capital.vue'),
        meta: { title: 'Capital', requiresAuth: true },
      },
      {
        path: '/paymend-pending',
        component: () => import('../views/PendingPayments.vue'),
        meta: { title: 'Pagos Pendientes', requiresAuth: true },
      },    
      {
        path: '/settings',
        component: () => import('../views/Settings.vue'),
        meta: { title: 'Configuraciones', requiresAuth: true },
      },                 
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Guard de navegación adaptado a Laravel Passport (LocalStorage)
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('kiopos_token');
  const userStr = localStorage.getItem('kiopos_user');
  const user = userStr ? JSON.parse(userStr) : null;

  const isAuthenticated = !!token;

  // Si la ruta requiere autenticación y no hay token, mandar al login
  if (to.meta.requiresAuth && !isAuthenticated) {
    return next('/login');
  }

  // Si ya está logueado y trata de ir al login, redirigir al inicio o usuarios
  if (to.path === '/login' && isAuthenticated) {
    if (user?.role === 'admin') {
      return next('/users');
    }
    return next('/');
  }

  next();
});

export default router;