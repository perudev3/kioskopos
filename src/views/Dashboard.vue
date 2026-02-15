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
          <div class="stat-value negative">- S/ {{ formatMoney(totalEgresos) }}</div>
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
      <StatCard
        title="💸 Total Ventas"
        :value="formatMoney(totalVentas)"
        color="primary"
      />
      
      <StatCard
        title="✨ Ganancia Neta"
        :value="formatMoney(gananciaNeta)"
        color="success"
      />

      <StatCard
        title="🏦 Capital Registrado"
        :value="formatMoney(capitalRegistrado)"
        color="info"
      />

      <StatCard
        title="📦 Stock Bajo"
        :value="lowStockProducts.length"
        color="warning"
      />

      <StatCard
        title="🛒 Ventas Hoy"
        :value="ventasHoy"
        color="primary"
      />

      <StatCard
        title="💰 Ganancia Hoy"
        :value="formatMoney(gananciaHoy)"
        color="success"
      />
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

      <div class="table-wrapper" v-if="recentSales.length">
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

      <div v-else class="empty-state">
        <span class="empty-icon">📭</span>
        <p>No hay ventas registradas</p>
      </div>
    </div>

    <!-- PRODUCTOS BAJO STOCK -->
    <div class="table-card alert-card" v-if="lowStockProducts.length">
      <h2>⚠️ Productos a renovar stock</h2>
      <div class="table-wrapper">
        <table class="responsive-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Stock Actual</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in lowStockProducts" :key="p.id">
              <td>{{ p.name }}</td>
              <td><span class="stock-badge" :class="getStockClass(p.stock)">{{ p.stock }}</span></td>
              <td><span class="status-badge danger">Crítico</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import StatCard from '../components/StatCard.vue';
import { supabase } from '../lib/supabase';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

const isLoading = ref(true);
const profile = ref(null);
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
   CONVERSIÓN DE RANGO A UTC
========================= */
const getLocalDateRangeUTC = (date) => {
  const start = new Date(date + 'T00:00:00');
  const end = new Date(date + 'T23:59:59');
  return {
    from: start.toISOString(),
    to: end.toISOString()
  };
};

/* =========================
   COMPUTED
========================= */
const gananciaVenta = computed(() => {
  return totalVentas.value - gananciaNeta.value;
});

const capitalTotal = computed(() => {
  return gananciaVenta.value + capitalRegistrado.value;
});

const capitalDisponible = computed(() => {
  return capitalTotal.value - totalEgresos.value;
});

const porcentajeGastado = computed(() => {
  if (capitalTotal.value === 0) return 0;
  return Math.round((totalEgresos.value / capitalTotal.value) * 100);
});

const totalVentasUltimos7Dias = computed(() => {
  return salesLast7Days.value.reduce((sum, val) => sum + val, 0);
});

const totalGananciasUltimos7Dias = computed(() => {
  return profitLast7Days.value.reduce((sum, val) => sum + val, 0);
});

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
   CARGAR DASHBOARD
========================= */
const loadDashboard = async () => {
  try {
    isLoading.value = true;

    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    user.value = authUser;

    // Cargar perfil
    const { data: profileData } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', authUser.id)
      .single();
    
    if (profileData) profile.value = profileData;

    // Query de ventas
    let salesQuery = supabase
      .from('sales')
      .select('*, sale_items(*, product:product_id(price))')
      .eq('user_id', authUser.id)
      .neq('payment_method', 'por_cobrar')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false });

    if (fromDate.value && toDate.value) {
      const fromRange = getLocalDateRangeUTC(fromDate.value);
      const toRange = getLocalDateRangeUTC(toDate.value);
      salesQuery = salesQuery
        .gte('created_at', fromRange.from)
        .lte('created_at', toRange.to);
    }

    const { data: sales = [] } = await salesQuery;

    // Query de capital
    let capitalQuery = supabase
      .from('capital')
      .select('monto')
      .eq('user_id', authUser.id)
      .eq('tipo_movimiento', 'ingreso');

    if (fromDate.value && toDate.value) {
      const fromRange = getLocalDateRangeUTC(fromDate.value);
      const toRange = getLocalDateRangeUTC(toDate.value);
      capitalQuery = capitalQuery
        .gte('fecha_registro', fromRange.from)
        .lte('fecha_registro', toRange.to);
    }

    const { data: capital = [] } = await capitalQuery;

    // Query de egresos
    let egresosQuery = supabase
      .from('egresos')
      .select('monto, created_at')
      .eq('user_id', authUser.id)
      .neq('categoria', 'Capital')
      .neq('tipo', 'capital');

    if (fromDate.value && toDate.value) {
      const fromRange = getLocalDateRangeUTC(fromDate.value);
      const toRange = getLocalDateRangeUTC(toDate.value);
      egresosQuery = egresosQuery
        .gte('created_at', fromRange.from)
        .lte('created_at', toRange.to);
    }

    const { data: egresos = [] } = await egresosQuery;

    /* =========================
       CALCULAR TOTALES
    ========================= */
    // Total de ventas y ganancia neta
    let totalVentasSum = 0;
    let gananciaNetaSum = 0;

    sales.forEach(sale => {
      sale.sale_items?.forEach(item => {
        const qty = Number(item.quantity || 0);
        const salePrice = Number(item.price || 0);
        const basePrice = Number(item.product?.price || 0);
        
        totalVentasSum += salePrice * qty;
        gananciaNetaSum += (salePrice - basePrice) * qty;
      });
    });

    totalVentas.value = totalVentasSum;
    gananciaNeta.value = gananciaNetaSum;

    // Capital registrado
    capitalRegistrado.value = capital.reduce((sum, c) => sum + Number(c.monto || 0), 0);

    // Total egresos
    totalEgresos.value = egresos.reduce((sum, e) => sum + Number(e.monto || 0), 0);

    /* =========================
       HOY
    ========================= */
    const today = new Date().toISOString().split('T')[0];
    const todaySales = sales.filter(s => s.created_at.startsWith(today));

    let ventasHoySum = 0;
    let gananciaHoySum = 0;

    todaySales.forEach(sale => {
      sale.sale_items?.forEach(item => {
        const qty = Number(item.quantity || 0);
        const salePrice = Number(item.price || 0);
        const basePrice = Number(item.product?.price || 0);
        
        ventasHoySum += salePrice * qty;
        gananciaHoySum += (salePrice - basePrice) * qty;
      });
    });

    ventasHoy.value = todaySales.length;
    gananciaHoy.value = gananciaHoySum;

    /* =========================
       ÚLTIMAS VENTAS
    ========================= */
    recentSales.value = sales.slice(0, 50).map(s => {
      let saleProfit = 0;
      s.sale_items?.forEach(item => {
        const qty = Number(item.quantity || 0);
        const salePrice = Number(item.price || 0);
        const basePrice = Number(item.product?.price || 0);
        saleProfit += (salePrice - basePrice) * qty;
      });

      return {
        id: s.id,
        customer: s.customer_name || 'Cliente',
        total: Number(s.total).toFixed(2),
        profit: saleProfit.toFixed(2),
        date: new Date(s.created_at).toLocaleDateString('es-ES')
      };
    });

    /* =========================
       PRODUCTOS BAJO STOCK
    ========================= */
    const { data: products = [] } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', authUser.id);
    
    lowStockProducts.value = products.filter(p => p.stock <= 5);

    /* =========================
       GRÁFICOS ÚLTIMOS 7 DÍAS
    ========================= */
    salesLast7Days.value = [];
    profitLast7Days.value = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const day = d.toISOString().split('T')[0];

      const daySales = sales.filter(s => s.created_at.startsWith(day));

      let dayVentasSum = 0;
      let dayGananciaSum = 0;

      daySales.forEach(sale => {
        sale.sale_items?.forEach(item => {
          const qty = Number(item.quantity || 0);
          const salePrice = Number(item.price || 0);
          const basePrice = Number(item.product?.price || 0);
          
          dayVentasSum += salePrice * qty;
          dayGananciaSum += (salePrice - basePrice) * qty;
        });
      });

      salesLast7Days.value.push(dayVentasSum);
      profitLast7Days.value.push(dayGananciaSum);
    }

    initCharts();

  } catch (error) {
    console.error('Error cargando dashboard:', error);
  } finally {
    isLoading.value = false;
  }
};

/* =========================
   RESETEAR FILTROS
========================= */
const resetFilters = () => {
  fromDate.value = '';
  toDate.value = '';
  loadDashboard();
};

/* =========================
   CHARTS
========================= */
const initCharts = () => {
  const labels = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  });

  // Destruir gráficos anteriores
  if (salesChart) salesChart.destroy();
  if (profitChart) profitChart.destroy();

  // Gráfico de ventas
  salesChart = new Chart(document.getElementById('salesChart'), {
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
      plugins: {
        legend: { display: false }
      }
    }
  });

  // Gráfico de ganancias
  profitChart = new Chart(document.getElementById('profitChart'), {
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
      plugins: {
        legend: { display: false }
      }
    }
  });
};

/* =========================
   HELPERS
========================= */
const formatMoney = (value) => {
  return parseFloat(value || 0).toFixed(2);
};

const getStockClass = (stock) => {
  if (stock === 0) return 'critical';
  if (stock <= 3) return 'low';
  return 'medium';
};

onMounted(loadDashboard);
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
   FILTROS
========================= */
.filters-card {
  background: white;
  padding: 16px 20px;
  border-radius: 16px;
  margin-bottom: 24px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}

.filters-content {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.date-input {
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  font-size: 14px;
  outline: none;
  transition: all 0.2s ease;
}

.date-input:focus {
  border-color: #0b3c5d;
  box-shadow: 0 0 0 2px rgba(11,60,93,0.1);
}

.filter-btn,
.clear-btn {
  padding: 10px 18px;
  border-radius: 10px;
  border: none;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.filter-btn {
  background: #0b3c5d;
  color: white;
}

.filter-btn:hover {
  background: #1fa2c1;
}

.clear-btn {
  background: #f1f5f9;
  color: #475569;
}

.clear-btn:hover {
  background: #e2e8f0;
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

.main-stat-card.primary {
  border-left-color: #0b3c5d;
}

.main-stat-card.danger {
  border-left-color: #ef4444;
}

.main-stat-card.success {
  border-left-color: #22c55e;
}

.main-stat-card.warning {
  border-left-color: #f59e0b;
}

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

.stat-value.negative {
  color: #ef4444;
}

.stat-value.positive {
  color: #22c55e;
}

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

.table-card.alert-card {
  border: 2px solid #f59e0b;
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

.badge {
  background: #e0f2fe;
  color: #0c4a6e;
  padding: 4px 10px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 13px;
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

.stock-badge.critical {
  background: #fee2e2;
  color: #991b1b;
}

.stock-badge.low {
  background: #fed7aa;
  color: #9a3412;
}

.stock-badge.medium {
  background: #fef3c7;
  color: #92400e;
}

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

.page-btn:hover {
  background: #1fa2c1;
}

.page-btn:disabled {
  background: #cbd5e1;
  cursor: not-allowed;
}

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
  0%, 100% {
    transform: scale(1);
    opacity: 0.8;
  }
  50% {
    transform: scale(1.1);
    opacity: 1;
  }
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

  /* 👇 AQUÍ EL CAMBIO */
  .dashboard-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .filters-content {
    flex-direction: column;
  }

  .date-input,
  .filter-btn,
  .clear-btn {
    width: 100%;
  }

  .stat-value {
    font-size: 24px;
  }

  .chart-card canvas {
    height: 220px !important;
  }
}

</style>