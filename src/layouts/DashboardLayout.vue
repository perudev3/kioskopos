<template>
  <div class="layout">
    <!-- Sidebar -->
    <Sidebar />

    <!-- Contenido principal -->
    <div class="main-content">
      <!-- Topbar fijo con botón toggle y título -->
      <div class="topbar">
        <h1 class="view-title">{{ moduleTitle }}</h1>
      </div>

      <!-- Contenido del módulo scrollable -->
      <div class="module-body">
        <router-view />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import Sidebar from '../components/Sidebar.vue';

const route = useRoute();
const moduleTitle = ref('');

// Ajustar título según la ruta actual
const setModuleTitle = () => {
  switch (route.name) {
    case 'Dashboard':
      moduleTitle.value = 'Dashboard';
      break;
    case 'Users':
      moduleTitle.value = 'Usuarios';
      break;
    case 'POS':
      moduleTitle.value = 'Punto de Venta';
      break;
    default:
      moduleTitle.value = '';
  }
};

// Actualiza el título cada vez que cambie la ruta
watch(() => route.name, setModuleTitle, { immediate: true });
</script>

<style scoped>
.layout {
  display: flex;
  height: 100vh;
}

/* Contenido principal */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden; /* Evita que el contenido se desborde */
}

/* Topbar fijo */
.topbar {
  display: flex;
  align-items: center;
  background: #fff;
  padding: 12px 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  z-index: 10;
  flex-shrink: 0; /* No permite que se reduzca */
}

.toggle-btn {
  font-size: 20px;
  margin-right: 16px;
  background: none;
  border: none;
  cursor: pointer;
}

.view-title {
  font-size: 20px;
  color: #111827;
  margin: 0;
  font-weight: 600;
}

/* Contenido del módulo scrollable */
.module-body {
  flex: 1;
  overflow-y: auto; /* Habilita scroll solo aquí */
  padding: 0px;
  background: #f3f4f6;
}
</style>
