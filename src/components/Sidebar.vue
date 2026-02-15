<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { supabase } from '../lib/supabase';

const router = useRouter();
const route = useRoute();
const open = ref(false);
const role = ref('');

const getUserRole = async () => {
  try {
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.user) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.session.user.id)
      .maybeSingle();

    role.value = profile?.role || 'admin';
  } catch (err) {
    console.error(err);
  }
};

const go = (path) => {
  router.push(path);
  open.value = false;
};

const logout = async () => {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } finally {
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
    !toggleBtn.contains(event.target)
  ) {
    open.value = false;
  }
};

watch(route, () => {
  open.value = false;
});

onMounted(() => {
  getUserRole();
  document.addEventListener('click', handleClickOutside);
});
</script>

<template>
  <!-- SIDEBAR -->
  <aside :class="['sidebar', open ? 'open' : 'closed']">
    <!-- HEADER (logo alineado al toggle) -->
    <div class="sidebar-header">
      <div class="brand-logo">
        <img src="/logo-sin-fondo.png" alt="KioPOS Logo" />
      </div>
    </div>

    <nav class="nav-items">

        <!-- =========================
            GENERAL
        ========================= -->
        <div v-if="role !== 'admin'" class="nav-section">
          <span class="section-title">GENERAL</span>

          <button @click="go('/')" class="btn">
            Inicio
          </button>
        </div>


        <!-- =========================
            VENTAS
        ========================= -->
        <div v-if="role !== 'admin'" class="nav-section">
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


        <!-- =========================
            INVENTARIO
        ========================= -->
        <div v-if="role !== 'admin'" class="nav-section">
          <span class="section-title">INVENTARIO</span>

          <button @click="go('/products')" class="btn">
            Productos
          </button>
        </div>


        <!-- =========================
            FINANZAS
        ========================= -->
        <div v-if="role !== 'admin'" class="nav-section">
          <span class="section-title">FINANZAS</span>

          <button @click="go('/capital')" class="btn">
            Capital
          </button>

          <button @click="go('/egresos')" class="btn">
            Egresos
          </button>
        </div>


        <!-- =========================
            CONFIGURACIÓN
        ========================= -->
        <div v-if="role !== 'admin'" class="nav-section">
          <span class="section-title">SISTEMA</span>

          <button @click="go('/settings')" class="btn">
            Configuración
          </button>
        </div>


        <!-- =========================
            ADMIN
        ========================= -->
        <div v-if="role === 'admin'" class="nav-section">
          <span class="section-title">ADMINISTRACIÓN</span>

          <button @click="go('/users')" class="btn">
            Usuarios
          </button>
        </div>


        <!-- LOGOUT -->
        <button class="btn logout" @click="logout">
          🔒 Cerrar sesión
        </button>

    </nav>

  </aside>

  <!-- BOTÓN TOGGLE -->
  <button class="toggle" @click="open = !open">☰</button>
</template>

<style scoped>
/* SIDEBAR */
.sidebar {
  width: 240px;
  max-width: 80%;
  height: 100vh;
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
  box-shadow: 2px 0 12px rgba(0, 0, 0, 0.25);

  /* 👇 AGREGA ESTO */
  overflow-y: auto;
  overflow-x: hidden;
}


.sidebar.closed {
  transform: translateX(-100%);
}

/* HEADER */
.sidebar-header {
  height: 56px; /* misma altura visual que el toggle */
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
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
}

/* =========================
   SECCIONES
========================= */
.nav-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 18px;
}

/* TÍTULO DE SECCIÓN */
.section-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  color: rgba(255,255,255,0.6);
  padding: 0 6px;
  margin-bottom: 4px;
}


.btn {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  border: none;
  color: #f8fafc;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn:hover {
  background: rgba(255, 255, 255, 0.18);
  transform: translateX(3px);
}

/* LOGOUT */
.logout {
  margin-top: auto;
  background: #ef4444;
  font-weight: 600;
}

.logout:hover {
  background: #dc2626;
}

/* TOGGLE PRO */
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

/* Hover */
.toggle:hover {
  background: #0ea5e9;
  transform: scale(1.05);
}

/* RESPONSIVE */
@media (max-width: 768px) {
  .sidebar {
    width: 200px;
    padding: 18px;
  }

  .brand-logo img {
    max-width: 80px;
    margin-top: 18px;
  }

  .btn {
    font-size: 14px;
    padding: 10px 14px;
  }
}
</style>
