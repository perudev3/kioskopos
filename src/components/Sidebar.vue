
<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import api from '../lib/axios';

const router = useRouter();
const route = useRoute();
const open = ref(false);
const role = ref('');
const plan = ref('');
const userId = ref(null);

const getUserData = () => {
  try {
    const userStr = localStorage.getItem('kiopos_user');
    if (userStr) {
      const user = JSON.parse(userStr);
      console.log(user.role);
      userId.value = user.id;
      role.value = user.role || 'kiosk';
      plan.value = user.plan || 'basico';
    }
  } catch (err) {
    console.error('Error al obtener datos del usuario:', err);
  }
};

const go = (path) => {
  router.push(path);
  open.value = false;
};

const logout = async () => {
  try {
    await api.post('/logout');
  } catch (err) {
    console.error('Error al cerrar sesión en la API:', err);
  } finally {
    localStorage.removeItem('kiopos_token');
    localStorage.removeItem('kiopos_user');
    router.push('/login');
    open.value = false;
  }
};

const handleClickOutside = (event) => {
  const sidebar = document.querySelector('.sidebar');
  const toggleBtn = document.querySelector('.toggle');

  if (
    sidebar &&
    !sidebar.contains(event.target) &&
    toggleBtn &&
    !toggleBtn.contains(event.target)
  ) {
    open.value = false;
  }
};

watch(route, () => {
  open.value = false;
});

onMounted(() => {
  getUserData();
  document.addEventListener('click', handleClickOutside);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<template>
  <!-- SIDEBAR -->
  <aside :class="['sidebar', open ? 'open' : 'closed']">

    <!-- HEADER -->
    <div class="sidebar-header">
      <div class="brand-logo">
        <img src="/logo-sin-fondo.png" alt="KioPOS Logo" />
      </div>
    </div>

    <!-- CONTENIDO DEL MENÚ -->
    <nav class="nav-items">

      <!-- DASHBOARD -->
      <div v-if="role == 'kiosk'" class="nav-section">
        <span class="section-title">DASHBOARD</span>

        <button @click="go('/')" class="btn">
          Inicio
        </button>
      </div>

      <!-- VENTAS -->
      <div v-if="role == 'kiosk'" class="nav-section">
        <span class="section-title">VENTAS</span>

        <button @click="go('/pos')" class="btn">
          POS
        </button>

        <button @click="go('/sales')" class="btn">
          Ventas
        </button>

        <button @click="go('/paymend-pending')" class="btn">
          Cobros
        </button>
      </div>

      <!-- INVENTARIO -->
      <div v-if="role == 'kiosk'" class="nav-section">
        <span class="section-title">INVENTARIO</span>

        <button @click="go('/products')" class="btn">
          Productos
        </button>
      </div>

      <!-- FINANZAS -->
      <div v-if="role == 'kiosk'" class="nav-section">
        <span class="section-title">FINANZAS</span>

        <button @click="go('/capital')" class="btn">
          Capital
        </button>

        <button @click="go('/egresos')" class="btn">
          Egresos
        </button>
      </div>

      <!-- CONFIGURACIÓN -->
      <div v-if="role == 'kiosk'" class="nav-section">
        <span class="section-title">SISTEMA</span>

        <button @click="go('/settings')" class="btn">
          Configuración
        </button>
      </div>

      <!-- CATÁLOGO -->
      <div v-if="role == 'kiosk' && plan === 'pro'" class="nav-section">
        <span class="section-title">CATÁLOGO</span>

        <button
          class="btn"
          :disabled="!userId"
          @click="go(`/catalogo-kiopos/${userId}`)"
        >
          {{ userId ? 'Generar Catálogo' : 'Cargando...' }}
        </button>
      </div>

      <!-- ADMIN -->
      <div v-if="role === 'admin'" class="nav-section">
        <span class="section-title">ADMINISTRACIÓN</span>

        <button @click="go('/users')" class="btn">
          Usuarios
        </button>
      </div>

    </nav>

    <!-- CERRAR SESIÓN: ZONA FIJA INFERIOR -->
    <div class="sidebar-footer">
      <button class="btn logout" @click="logout">
        <span>🔒</span>
        <span>Cerrar sesión</span>
      </button>
    </div>

  </aside>

  <!-- BOTÓN TOGGLE -->
  <button class="toggle" @click="open = !open">
    ☰
  </button>
</template>

<style scoped>
/* SIDEBAR */
.sidebar {
  width: 240px;
  max-width: 80%;
  height: 100vh;
  height: 100dvh;
  box-sizing: border-box;

  background: linear-gradient(180deg, #0b3c5d, #1f5f8b);
  color: #fff;

  position: fixed;
  top: 0;
  left: 0;

  transition: transform 0.3s ease-in-out;
  z-index: 1000;

  display: flex;
  flex-direction: column;

  padding: 20px;
  padding-bottom: max(12px, env(safe-area-inset-bottom));

  box-shadow: 2px 0 12px rgba(0, 0, 0, 0.25);

  overflow: hidden;
}

.sidebar.closed {
  transform: translateX(-100%);
}

/* HEADER */
.sidebar-header {
  height: 56px;
  min-height: 56px;

  display: flex;
  align-items: center;
  justify-content: center;

  margin-bottom: 20px;
  flex-shrink: 0;
}

/* LOGO */
.brand-logo {
  padding: 6px 10px;
  border-radius: 10px;
}

.brand-logo img {
  max-width: 90px;
  height: auto;
  object-fit: contain;
}

/* NAV */
.nav-items {
  display: flex;
  flex-direction: column;
  gap: 12px;

  flex: 1;
  min-height: 0;

  overflow-y: auto;
  overflow-x: hidden;

  padding-bottom: 12px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.35) transparent;
}

.nav-items::-webkit-scrollbar {
  width: 5px;
}

.nav-items::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.35);
  border-radius: 10px;
}

/* SECCIONES */
.nav-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 18px;
  flex-shrink: 0;
}

/* TÍTULO */
.section-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  color: rgba(255,255,255,0.6);
  padding: 0 6px;
  margin-bottom: 4px;
}

/* BOTONES */
.btn {
  display: flex;
  align-items: center;
  gap: 8px;

  width: 100%;
  box-sizing: border-box;

  padding: 12px 16px;

  background: rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  border: none;

  color: #f8fafc;
  font-size: 15px;
  font-weight: 500;

  cursor: pointer;
  transition: all 0.2s ease;

  text-align: left;
  flex-shrink: 0;
}

.btn:hover {
  background: rgba(255, 255, 255, 0.18);
  transform: translateX(3px);
}

/* FOOTER: SIEMPRE VISIBLE */
.sidebar-footer {
  flex-shrink: 0;
  width: 100%;

  padding-top: 12px;
  margin-top: auto;
}

/* LOGOUT */
.logout {
  min-height: 48px;
  justify-content: center;

  background: #ef4444;
  font-weight: 600;
}

.logout:hover {
  background: #dc2626;
}

/* TOGGLE */
.toggle {
  position: fixed;
  top: 8px;
  left: 14px;
  z-index: 1100;

  background: #1fa2c1;
  color: #fff;

  border: none;
  width: 42px;
  height: 42px;

  font-size: 20px;
  border-radius: 12px;
  cursor: pointer;

  display: flex;
  align-items: center;
  justify-content: center;

  box-shadow: 0 4px 12px rgba(0,0,0,0.25);
  backdrop-filter: blur(6px);

  transition: all 0.25s ease;
}

.toggle:hover {
  background: #0ea5e9;
  transform: scale(1.05);
}

/* RESPONSIVE */
@media (max-width: 768px) {
  .sidebar {
    width: 200px;
    max-width: 85%;
    padding: 18px;
    padding-bottom: max(12px, env(safe-area-inset-bottom));
  }

  .brand-logo img {
    max-width: 80px;
    margin-top: 18px;
  }

  .btn {
    font-size: 14px;
    padding: 10px 14px;
  }

  .logout {
    min-height: 46px;
  }
}

/* PANTALLAS MUY BAJAS */
@media (max-height: 500px) {
  .sidebar {
    padding-top: 10px;
  }

  .sidebar-header {
    height: 40px;
    min-height: 40px;
    margin-bottom: 10px;
  }

  .brand-logo img {
    max-width: 65px;
    margin-top: 0;
  }

  .nav-section {
    margin-bottom: 10px;
  }

  .nav-items {
    gap: 6px;
  }

  .sidebar-footer {
    padding-top: 8px;
  }
}
</style>
