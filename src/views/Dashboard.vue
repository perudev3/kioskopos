<template>
  <div class="dashboard-page">
    <!-- LOADING OVERLAY -->
    <div v-if="isLoading" class="loading-overlay">
      <img src="/logo-sin-fondo.png" alt="Cargando" class="loading-logo" />
    </div>

    <!-- BIENVENIDA -->
    <div class="welcome-card" v-if="user">
      <img src="/logo-sin-fondo.png" alt="Logo" class="welcome-logo" />
      <div class="welcome-text">
        <span class="welcome-small">Bienvenido 👋</span>
        <h1 class="welcome-title">{{ profile.name }}!</h1>
      </div>
    </div>

    <!-- RESUMEN FINANCIERO PRINCIPAL -->
    <div class="main-stats">
      <div class="main-stat-card danger">
        <div class="stat-icon">📉</div>
        <div class="stat-content">
          <div class="stat-label">Total Egresos</div>
          <div class="stat-value negative">S/ {{ formatMoney(totalEgresos) }}</div>
          <div class="stat-detail">{{ porcentajeGastado }}% del capital</div>
        </div>
      </div>

      <div class="main-stat-card" :class="capitalDisponible >= 0 ? 'success' : 'warning'">
        <div class="stat-icon">💵</div>
        <div class="stat-content">
          <div class="stat-label">Capital Disponible</div>
          <div class="stat-value" :class="capitalDisponible >= 0 ? 'positive' : 'negative'">
            S/ {{ formatMoney(capitalDisponible) }}
          </div>
          <div class="stat-detail">
            {{ capitalDisponible >= 0 ? 'Saldo positivo' : '⚠️ Déficit' }}
          </div>
        </div>
      </div>
    </div>

    <!-- ESTADÍSTICAS SECUNDARIAS -->
    <div class="dashboard-grid">
      <StatCard title="💸 Total Ventas" :value="formatMoney(totalVentas)" color="primary" />
      <StatCard title="✨ Ganancia Neta" :value="formatMoney(gananciaNeta)" color="success" />
      <StatCard title="🏦 Capital Registrado" :value="formatMoney(capitalRegistrado)" color="info" />
      <StatCard title="📦 Stock Bajo" :value="lowStockProducts.length" color="warning" />
      <StatCard title="🛒 Ventas Hoy" :value="ventasHoy" color="primary" />
      <StatCard title="💰 Ganancia Hoy" :value="formatMoney(gananciaHoy)" color="success" />
    </div>

    <!-- NOTA INFORMATIVA -->
    <div class="info-banner">
      <span class="info-icon">ℹ️</span>
      <p>
        <strong>Nota :</strong> Sus totales se verán reflejados según los registros
        alcanzados en el sistema.
      </p>
    </div>

    <!-- GRÁFICOS -->
    <div class="charts-grid">
      <div class="chart-card">
        <div class="chart-header">
          <h2>📈 Ventas últimos 7 días</h2>
          <span class="chart-total">Total: S/ {{ formatMoney(totalVentasUltimos7Dias) }}</span>
        </div>
        <canvas id="salesChart"></canvas>
      </div>

      <div class="chart-card">
        <div class="chart-header">
          <h2>💚 Ganancias últimos 7 días</h2>
          <span class="chart-total">Total: S/ {{ formatMoney(totalGananciasUltimos7Dias) }}</span>
        </div>
        <canvas id="profitChart"></canvas>
      </div>
    </div>

    <!-- ÚLTIMAS VENTAS -->
    <div class="table-card">
      <h2>° Últimas ventas</h2>

      <template v-if="recentSales.length">
        <div class="table-wrapper">
          <table class="responsive-table">
            <thead>
              <tr>
                <th>Total (S/)</th>
                <th>Ganancia (S/)</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="sale in paginatedSales" :key="sale.id">
                <td class="amount-cell">S/ {{ sale.total }}</td>
                <td class="profit-cell">S/ {{ sale.profit }}</td>
                <td>{{ sale.date }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="pagination" v-if="recentSales.length > perPage">
          <button class="page-btn" :disabled="currentPage === 1" @click="currentPage--">⏮</button>
          <span class="page-info">{{ currentPage }} / {{ totalPages }}</span>
          <button class="page-btn" :disabled="currentPage === totalPages" @click="currentPage++">⏭</button>
        </div>
      </template>

      <div v-else class="empty-state">
        <span class="empty-icon">📭</span>
        <p>No hay ventas registradas</p>
      </div>
    </div>

    <!-- PRODUCTOS BAJO STOCK -->
    <div class="table-card alert-card-critical" v-if="lowStockProducts.length">
      <div class="alert-header">
        <h2>⚠️ ¡Alerta! Productos con stock crítico</h2>
        <button @click="goToProducts" class="alert-action-btn">
          📦 Ir a Productos
        </button>
      </div>

      <div class="critical-message">
        <span class="critical-icon">🚨</span>
        <p>Tienes <strong>{{ lowStockProducts.length }}</strong> producto(s) que necesitan reposición urgente</p>
      </div>

      <div class="table-wrapper">
        <table class="responsive-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Stock Actual</th>
              <th>Estado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in lowStockProducts" :key="p.id">
              <td>{{ p.name }}</td>
              <td><span class="stock-badge" :class="getStockClass(p.stock)">{{ p.stock }}</span></td>
              <td><span class="status-badge danger">Crítico</span></td>
              <td>
                <button class="restock-btn" @click="openRestock(p)">
                  ➕ Reponer
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- MODAL REPONER STOCK -->
    <Teleport to="body">
      <div v-if="showRestock" class="modal-backdrop" @click.self="closeRestock">
        <form class="restock-modal" @submit.prevent="saveRestock">
          <div class="restock-header">
            <div>
              <h3>Reponer stock</h3>
              <p class="restock-product">{{ restockProduct?.name }}</p>
            </div>
            <button type="button" class="restock-close" @click="closeRestock">✕</button>
          </div>

          <div class="restock-body">
            <div class="current-stock">
              <span>Stock actual</span>
              <strong>{{ restockProduct?.stock }}</strong>
            </div>

            <div class="mode-switch">
              <button type="button" :class="{ active: restockMode === 'add' }" @click="restockMode = 'add'">
                Sumar al stock
              </button>
              <button type="button" :class="{ active: restockMode === 'set' }" @click="restockMode = 'set'">
                Establecer stock
              </button>
            </div>

            <label class="restock-field">
              <span>{{ restockMode === 'add' ? 'Cantidad a agregar' : 'Nuevo stock total' }}</span>
              <input
                ref="restockInput"
                v-model.number="restockQty"
                type="number"
                inputmode="decimal"
                min="0"
                step="any"
                placeholder="0"
              />
            </label>

            <div class="qty-chips" v-if="restockMode === 'add'">
              <button type="button" v-for="n in quickAdds" :key="n" @click="addQuick(n)">
                +{{ n }}
              </button>
            </div>

            <div class="new-stock-preview" :class="{ invalid: !restockValid }">
              <span>Stock resultante</span>
              <strong>{{ restockValid ? newStock : '—' }}</strong>
            </div>
          </div>

          <div class="restock-actions">
            <button type="button" class="btn-cancel" @click="closeRestock">Cancelar</button>
            <button type="submit" class="btn-save" :disabled="!restockValid || restockSaving">
              {{ restockSaving ? 'Guardando...' : 'Actualizar stock' }}
            </button>
          </div>
        </form>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch, nextTick } from 'vue';
import StatCard from '../components/StatCard.vue';
import api from '../lib/axios';
import Swal from 'sweetalert2';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

/* =========================================================
   CONFIGURACIÓN
   Misma ruta que usa tu vista Productos para actualizar.
   Ajusta SOLO esto si tu endpoint o método es distinto.
========================================================= */
const STOCK_UPDATE_URL = (id) => `/products/${id}`;
const STOCK_UPDATE_METHOD = 'put'; // 'put' o 'patch'

const isLoading = ref(true);
const profile = ref({ name: '' });
const user = ref(null);

// Filtros de fecha
const fromDate = ref('');
const toDate = ref('');

// Estados financieros
const totalVentas = ref(0);
const gananciaNeta = ref(0);
const capitalRegistrado = ref(0);
const totalEgresos = ref(0);

const ventasHoy = ref(0);
const gananciaHoy = ref(0);

const recentSales = ref([]);
const lowStockProducts = ref([]);
const salesLast7Days = ref([]);
const profitLast7Days = ref([]);

let salesChart = null;
let profitChart = null;

/* =========================
   COMPUTED
========================= */
const gananciaVenta = computed(() => totalVentas.value - gananciaNeta.value);
const capitalTotal = computed(() => gananciaVenta.value + capitalRegistrado.value);
const capitalDisponible = computed(() => capitalTotal.value - totalEgresos.value);

const porcentajeGastado = computed(() => {
  if (capitalTotal.value === 0) return 0;
  return Math.round((totalEgresos.value / capitalTotal.value) * 100);
});

const totalVentasUltimos7Dias = computed(() =>
  salesLast7Days.value.reduce((sum, val) => sum + val, 0)
);

const totalGananciasUltimos7Dias = computed(() =>
  profitLast7Days.value.reduce((sum, val) => sum + val, 0)
);

/* =========================
   PAGINACIÓN
========================= */
const currentPage = ref(1);
const perPage = 10;

const totalPages = computed(() =>
  Math.max(1, Math.ceil(recentSales.value.length / perPage))
);

const paginatedSales = computed(() => {
  const start = (currentPage.value - 1) * perPage;
  return recentSales.value.slice(start, start + perPage);
});

watch(recentSales, () => {
  currentPage.value = 1;
});

/* =========================
   REPOSICIÓN RÁPIDA DE STOCK
========================= */
const showRestock = ref(false);
const restockProduct = ref(null);
const restockMode = ref('add'); // 'add' = sumar, 'set' = establecer
const restockQty = ref(null);
const restockSaving = ref(false);
const restockInput = ref(null);
const quickAdds = [5, 10, 20, 50];

const round3 = (n) => Math.round(n * 1000) / 1000;

const newStock = computed(() => {
  const current = Number(restockProduct.value?.stock || 0);
  const qty = Number(restockQty.value || 0);
  return restockMode.value === 'add' ? round3(current + qty) : round3(qty);
});

const restockValid = computed(() => {
  const qty = Number(restockQty.value);
  if (restockQty.value === null || restockQty.value === '' || isNaN(qty)) return false;
  if (restockMode.value === 'add') return qty > 0;
  return qty >= 0;
});

const toast = (icon, title, timer = 1800) =>
  Swal.fire({ toast: true, position: 'top-end', icon, title, showConfirmButton: false, timer });

const openRestock = async (product) => {
  restockProduct.value = product;
  restockMode.value = 'add';
  restockQty.value = null;
  showRestock.value = true;
  await nextTick();
  restockInput.value?.focus();
};

const closeRestock = () => {
  if (restockSaving.value) return;
  showRestock.value = false;
  restockProduct.value = null;
  restockQty.value = null;
};

const addQuick = (n) => {
  restockQty.value = round3(Number(restockQty.value || 0) + n);
};

// Al cambiar de modo se limpia la cantidad para evitar errores
watch(restockMode, () => {
  restockQty.value = null;
  nextTick(() => restockInput.value?.focus());
});

const saveRestock = async () => {
  if (!restockValid.value || restockSaving.value || !restockProduct.value) return;

  const product = restockProduct.value;
  const stockToSave = newStock.value;

  restockSaving.value = true;
  try {
    await api[STOCK_UPDATE_METHOD](STOCK_UPDATE_URL(product.id), { stock: stockToSave });

    // Actualiza al instante en pantalla
    const item = lowStockProducts.value.find(p => p.id === product.id);
    if (item) item.stock = stockToSave;

    showRestock.value = false;
    restockProduct.value = null;
    restockQty.value = null;
    toast('success', `${product.name}: stock actualizado a ${stockToSave}`);

    // Refresca en segundo plano para que el producto salga de la alerta si ya no es crítico
    await loadDashboard({ silent: true });
  } catch (err) {
    console.error('Error actualizando stock:', err);
    Swal.fire({
      icon: 'error',
      title: 'No se pudo actualizar',
      text: err?.response?.data?.message || err?.message || 'Error desconocido'
    });
  } finally {
    restockSaving.value = false;
  }
};

/* =========================
   CARGAR DASHBOARD DESDE LA API
========================= */
const loadDashboard = async ({ silent = false } = {}) => {
  try {
    if (!silent) isLoading.value = true;

    const response = await api.get('/dashboard', {
      params: {
        from: fromDate.value,
        to: toDate.value
      }
    });

    const data = response.data;

    user.value = data.user;
    profile.value = data.profile;
    totalVentas.value = data.totalVentas;
    gananciaNeta.value = data.gananciaNeta;
    capitalRegistrado.value = data.capitalRegistrado;
    totalEgresos.value = data.totalEgresos;
    ventasHoy.value = data.ventasHoy;
    gananciaHoy.value = data.gananciaHoy;
    recentSales.value = data.recentSales;
    lowStockProducts.value = data.lowStockProducts;
    salesLast7Days.value = data.salesLast7Days;
    profitLast7Days.value = data.profitLast7Days;

    await nextTick();
    initCharts();
  } catch (error) {
    console.error('Error cargando dashboard desde la API:', error);
  } finally {
    if (!silent) isLoading.value = false;
  }
};

const goToProducts = () => {
  window.location.href = '/products';
};

/* =========================
   CHARTS
========================= */
const initCharts = () => {
  const salesCanvas = document.getElementById('salesChart');
  const profitCanvas = document.getElementById('profitChart');
  if (!salesCanvas || !profitCanvas) return;

  const labels = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  });

  if (salesChart) salesChart.destroy();
  if (profitChart) profitChart.destroy();

  salesChart = new Chart(salesCanvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Ventas S/',
        data: salesLast7Days.value,
        borderColor: '#0b3c5d',
        backgroundColor: 'rgba(11,60,93,0.1)',
        tension: 0.4,
        fill: true,
        borderWidth: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
    }
  });

  profitChart = new Chart(profitCanvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Ganancias S/',
        data: profitLast7Days.value,
        backgroundColor: '#22c55e',
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
    }
  });
};

/* =========================
   HELPERS
========================= */
const formatMoney = (value) => parseFloat(value || 0).toFixed(2);

const getStockClass = (stock) => {
  if (stock === 0) return 'critical';
  if (stock <= 3) return 'low';
  return 'medium';
};

onMounted(() => loadDashboard());
</script>

<style scoped>
.dashboard-page {
  max-width: 1400px;
  margin: auto;
  padding: 24px;
  color: #0f172a;
  min-height: 100vh;
  background: #f8fafc;
}

/* =========================
   BIENVENIDA
========================= */
.welcome-card {
  display: flex;
  align-items: center;
  gap: 16px;
  background: linear-gradient(135deg, #ffffff, #f0f9ff);
  border-radius: 16px;
  padding: 20px 24px;
  margin-bottom: 24px;
  box-shadow: 0 4px 14px rgba(11,60,93,0.1);
  border-left: 4px solid #0b3c5d;
}

.welcome-logo {
  width: 60px;
  height: 60px;
  object-fit: contain;
  border-radius: 12px;
  background: white;
  padding: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.welcome-text {
  display: flex;
  flex-direction: column;
}

.welcome-small {
  font-size: 14px;
  color: #64748b;
  font-weight: 500;
}

.welcome-title {
  font-size: 24px;
  font-weight: 800;
  color: #0b3c5d;
  line-height: 1.2;
  margin: 0;
}

/* =========================
   ESTADÍSTICAS PRINCIPALES
========================= */
.main-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  margin-bottom: 24px;
}

.main-stat-card {
  background: white;
  padding: 24px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 4px 14px rgba(0,0,0,0.08);
  border-left: 4px solid #64748b;
  transition: transform 0.2s ease;
}

.main-stat-card:hover {
  transform: translateY(-2px);
}

.main-stat-card.primary { border-left-color: #0b3c5d; }
.main-stat-card.danger { border-left-color: #ef4444; }
.main-stat-card.success { border-left-color: #22c55e; }
.main-stat-card.warning { border-left-color: #f59e0b; }

.stat-icon {
  font-size: 40px;
  line-height: 1;
}

.stat-content {
  flex: 1;
}

.stat-label {
  font-size: 13px;
  color: #64748b;
  font-weight: 600;
  margin-bottom: 6px;
}

.stat-value {
  font-size: 28px;
  font-weight: 800;
  color: #0f172a;
  margin-bottom: 4px;
}

.stat-value.negative { color: #ef4444; }
.stat-value.positive { color: #22c55e; }

.stat-detail {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 500;
}

/* =========================
   GRID SECUNDARIO
========================= */
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

/* =========================
   INFO BANNER
========================= */
.info-banner {
  background: #f0f9ff;
  border: 2px solid #0ea5e9;
  border-radius: 12px;
  padding: 14px 18px;
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}

.info-icon {
  font-size: 24px;
  line-height: 1;
}

.info-banner p {
  margin: 0;
  font-size: 13px;
  color: #0c4a6e;
  line-height: 1.5;
}

/* =========================
   GRÁFICOS
========================= */
.charts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  gap: 20px;
  margin-bottom: 24px;
}

.chart-card {
  background: white;
  padding: 20px;
  border-radius: 16px;
  box-shadow: 0 4px 14px rgba(0,0,0,0.08);
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.chart-card h2 {
  font-size: 16px;
  font-weight: 700;
  color: #0b3c5d;
  margin: 0;
}

.chart-total {
  font-size: 14px;
  font-weight: 600;
  color: #22c55e;
}

.chart-card canvas {
  width: 100% !important;
  height: 280px !important;
}

/* =========================
   TABLAS
========================= */
.table-card {
  background: white;
  padding: 20px;
  border-radius: 16px;
  box-shadow: 0 4px 14px rgba(0,0,0,0.08);
  margin-bottom: 24px;
}

.table-card h2 {
  font-size: 18px;
  font-weight: 700;
  color: #0b3c5d;
  margin-bottom: 16px;
}

.table-wrapper {
  overflow-x: auto;
}

.responsive-table {
  width: 100%;
  border-collapse: collapse;
}

.responsive-table th,
.responsive-table td {
  padding: 14px 12px;
  border-bottom: 1px solid #e2e8f0;
  font-size: 14px;
  text-align: left;
}

.responsive-table th {
  background: #f8fafc;
  font-weight: 700;
  color: #475569;
}

.responsive-table tbody tr:hover {
  background: #f8fafc;
}

.amount-cell {
  font-weight: 700;
  color: #0b3c5d;
}

.profit-cell {
  font-weight: 700;
  color: #22c55e;
}

.stock-badge {
  padding: 4px 10px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 13px;
}

.stock-badge.critical { background: #fee2e2; color: #991b1b; }
.stock-badge.low { background: #fed7aa; color: #9a3412; }
.stock-badge.medium { background: #fef3c7; color: #92400e; }

.status-badge {
  padding: 4px 10px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 13px;
}

.status-badge.danger {
  background: #fee2e2;
  color: #991b1b;
}

/* Botón reponer */
.restock-btn {
  background: #0b3c5d;
  color: white;
  border: none;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.restock-btn:hover {
  background: #1e5a7d;
  transform: translateY(-1px);
}

/* =========================
   PAGINACIÓN
========================= */
.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}

.page-btn {
  background: #0b3c5d;
  color: white;
  border: none;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: background 0.2s;
}

.page-btn:hover { background: #1fa2c1; }
.page-btn:disabled { background: #cbd5e1; cursor: not-allowed; }

.page-info {
  font-weight: 700;
  color: #0f172a;
  font-size: 14px;
}

/* =========================
   ESTADO VACÍO
========================= */
.empty-state {
  text-align: center;
  padding: 40px 20px;
}

.empty-icon {
  font-size: 48px;
  display: block;
  margin-bottom: 12px;
}

.empty-state p {
  color: #64748b;
  font-size: 14px;
  margin: 0;
}

/* =========================
   LOADING
========================= */
.loading-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15,23,42,0.6);
  backdrop-filter: blur(8px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.loading-logo {
  width: 100px;
  height: 100px;
  object-fit: contain;
  animation: pulse 1.5s ease-in-out infinite;
  filter: drop-shadow(0 8px 20px rgba(0,0,0,0.4));
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 0.8; }
  50% { transform: scale(1.1); opacity: 1; }
}

/* =========================
   ALERTA CRÍTICA DE STOCK
========================= */
.table-card.alert-card-critical {
  border: 3px solid #ef4444;
  background: linear-gradient(135deg, #fff5f5, #ffffff);
  box-shadow: 0 8px 20px rgba(239, 68, 68, 0.2);
  animation: pulse-border 2s ease-in-out infinite;
}

@keyframes pulse-border {
  0%, 100% {
    border-color: #ef4444;
    box-shadow: 0 8px 20px rgba(239, 68, 68, 0.2);
  }
  50% {
    border-color: #dc2626;
    box-shadow: 0 8px 24px rgba(239, 68, 68, 0.35);
  }
}

.alert-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
}

.alert-header h2 {
  font-size: 18px;
  font-weight: 700;
  color: #dc2626;
  margin: 0;
}

.alert-action-btn {
  background: #ef4444;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 8px;
}

.alert-action-btn:hover {
  background: #dc2626;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
}

.critical-message {
  background: #fee2e2;
  border: 2px solid #fca5a5;
  border-radius: 12px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.critical-icon {
  font-size: 24px;
  line-height: 1;
  animation: shake 0.5s ease-in-out infinite;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  75% { transform: translateX(5px); }
}

.critical-message p {
  margin: 0;
  font-size: 14px;
  color: #991b1b;
  font-weight: 600;
}

.critical-message strong {
  color: #7f1d1d;
  font-size: 16px;
}

/* =========================
   MODAL REPONER STOCK
========================= */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9000;
  padding: 20px;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.restock-modal {
  background: white;
  width: 100%;
  max-width: 420px;
  max-height: 92vh;
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
}

.restock-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 20px 24px;
  border-bottom: 1px solid #e2e8f0;
}

.restock-header h3 {
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 4px 0;
}

.restock-product {
  font-size: 14px;
  color: #64748b;
  margin: 0;
}

.restock-close {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  background: #f1f5f9;
  border: none;
  border-radius: 10px;
  font-size: 16px;
  color: #64748b;
  cursor: pointer;
}

.restock-close:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.restock-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

.current-stock,
.new-stock-preview {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f8fafc;
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 14px;
  color: #64748b;
}

.current-stock strong {
  font-size: 18px;
  color: #991b1b;
}

.new-stock-preview {
  background: #ecfdf5;
  border: 2px solid #a7f3d0;
  color: #047857;
}

.new-stock-preview strong {
  font-size: 22px;
  color: #047857;
}

.new-stock-preview.invalid {
  background: #f8fafc;
  border-color: #e2e8f0;
  color: #94a3b8;
}

.new-stock-preview.invalid strong {
  color: #94a3b8;
}

.mode-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  background: #f1f5f9;
  padding: 5px;
  border-radius: 12px;
}

.mode-switch button {
  background: transparent;
  border: none;
  border-radius: 8px;
  padding: 11px 0;
  font-size: 14px;
  font-weight: 700;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mode-switch button.active {
  background: white;
  color: #0b3c5d;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.restock-field span {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 6px;
}

.restock-field input {
  width: 100%;
  box-sizing: border-box;
  background: #f8fafc;
  border: 2px solid #e2e8f0;
  border-radius: 14px;
  padding: 12px 16px;
  font-size: 24px; /* evita el zoom automático en iOS */
  font-weight: 800;
  color: #0f172a;
  outline: none;
  transition: all 0.2s ease;
}

.restock-field input:focus {
  border-color: #0b3c5d;
  background: white;
}

.qty-chips {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.qty-chips button {
  background: #f1f5f9;
  border: 2px solid transparent;
  border-radius: 10px;
  padding: 10px 0;
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
  cursor: pointer;
  transition: all 0.2s ease;
}

.qty-chips button:hover {
  border-color: #0b3c5d;
}

.restock-actions {
  padding: 20px 24px;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  display: flex;
  gap: 12px;
}

.btn-cancel {
  flex: 1;
  background: white;
  color: #64748b;
  border: 2px solid #e2e8f0;
  padding: 14px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.btn-cancel:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.btn-save {
  flex: 1;
  background: #0b3c5d;
  color: white;
  border: none;
  padding: 14px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-save:hover:not(:disabled) {
  background: #1e5a7d;
  transform: translateY(-1px);
}

.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* =========================
   RESPONSIVE
========================= */
@media (max-width: 768px) {
  .dashboard-page {
    padding: 16px;
  }

  .main-stats,
  .charts-grid {
    grid-template-columns: 1fr;
  }

  .dashboard-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .stat-value {
    font-size: 24px;
  }

  .chart-card canvas {
    height: 220px !important;
  }

  .alert-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .alert-action-btn {
    width: 100%;
    justify-content: center;
  }
}
</style>
