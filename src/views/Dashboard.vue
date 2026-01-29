<template>
  <div class="dashboard-page" >
    <h1 class="dashboard-title">Dashboard</h1>

    <!-- Tarjetas estadísticas -->
    <div class="dashboard-grid">
      <StatCard
        title="Resultado financiero (S/)"
        :value="totalProfit"
        color="success"
      />

      <StatCard
        title="Total egresos registrados (S/)"
        :value="totalExpenses"
        color="danger"
      />

      <StatCard
        title="Ventas hoy (S/)"
        :value="salesToday"
      />

      <StatCard
        title="Resultado hoy (S/)"
        :value="profitToday"
        color="success"
      />

      <StatCard
        title="Ganancia real acumulada (S/)"
        :value="realTotalProfit.toFixed(2)"
        color="success"
      />

      <StatCard
        title="Productos bajos en stock"
        :value="lowStockProducts.length"
      />
    </div>

    <p style="font-size:13px;color:#6b7280;margin-bottom:16px">
      ℹ️ El resultado financiero considera solo ventas y egresos operativos.
      El capital invertido no se considera pérdida.
    </p>

    <!-- Gráficos -->
    <div class="charts-grid">
      <div class="chart-card">
        <h2>Ventas últimos 7 días</h2>
        <canvas id="salesChart"></canvas>
      </div>
      <div class="chart-card">
        <h2>Ganancias últimos 7 días</h2>
        <canvas id="profitChart"></canvas>
      </div>
    </div>

    <!-- Últimas ventas -->
    <div class="table-card">
      <h2>Últimas ventas</h2>

      <div class="table-wrapper">
        <table class="responsive-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Cliente</th>
              <th>Total (S/)</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="sale in paginatedSales" :key="sale.id">
              <td>{{ sale.id }}</td>
              <td>{{ sale.customer }}</td>
              <td>{{ sale.total }}</td>
              <td>{{ sale.date }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pagination" v-if="recentSales.length">
        <button class="page-btn" :disabled="currentPage === 1" @click="currentPage--">⏮</button>
        <span class="page-info">{{ currentPage }} / {{ totalPages }}</span>
        <button class="page-btn" :disabled="currentPage === totalPages" @click="currentPage++">⏭</button>
      </div>

      <p v-else class="empty-msg">No hay ventas registradas</p>
    </div>

    <div class="table-card" v-if="lowStockProducts.length">
      <h2>Productos a renovar stock</h2>
      <div class="table-wrapper">
        <table class="responsive-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Stock</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in lowStockProducts" :key="p.id">
              <td>{{ p.name }}</td>
              <td>{{ p.stock }}</td>
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

/* =========================
   HELPERS
========================= */
const normalizeProfit = (value) => (value < 0 ? 0 : value);

/* =========================
   ESTADOS
========================= */
const salesToday = ref('0.00');
const profitToday = ref('0.00');
const totalProfit = ref('0.00');
const totalExpenses = ref('0.00');
const realProfitTotal = ref(0);

const recentSales = ref([]);
const lowStockProducts = ref([]);
const salesLast7Days = ref([]);
const profitLast7Days = ref([]);

/* =========================
   PAGINACIÓN
========================= */
const currentPage = ref(1);
const perPage = 5;

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
   DASHBOARD
========================= */
const loadDashboard = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const today = new Date().toISOString().split('T')[0];

  const { data: sales = [] } = await supabase
    .from('sales')
    .select('*')
    .eq('user_id', user.id);

  const { data: egresos = [] } = await supabase
    .from('egresos')
    .select('*')
    .eq('user_id', user.id);

  /* =========================
     EGRESOS REALES (SIN CAPITAL)
  ========================= */
  const realExpenses = egresos.filter(e => e.tipo === 'egreso');

  /* =========================
     HOY
  ========================= */
  const todaySales = sales.filter(s => s.created_at.startsWith(today));
  const todayExpenses = realExpenses.filter(e => e.created_at.startsWith(today));

  const salesSumToday = todaySales.reduce((a, b) => a + Number(b.total), 0);
  const expensesSumToday = todayExpenses.reduce((a, b) => a + Number(b.monto), 0);

  salesToday.value = salesSumToday.toFixed(2);
  profitToday.value = normalizeProfit(
    salesSumToday - expensesSumToday
  ).toFixed(2);

  /* =========================
     TOTALES
  ========================= */
  const totalSales = sales.reduce((a, b) => a + Number(b.total), 0);
  const totalRealExpenses = realExpenses.reduce((a, b) => a + Number(b.monto), 0);

  totalExpenses.value = totalRealExpenses.toFixed(2);
  totalProfit.value = normalizeProfit(
    totalSales - totalRealExpenses
  ).toFixed(2);

  /* =========================
     GANANCIA REAL (SOLO UTILIDAD)
  ========================= */
  realProfitTotal.value = sales.reduce((sum, s) => {
    const base = Number(s.base_price || 0);
    const total = Number(s.total || 0);
    const profit = total - base;
    return sum + (profit > 0 ? profit : 0);
  }, 0);

  /* =========================
     ÚLTIMAS VENTAS
  ========================= */
  recentSales.value = sales.slice(0, 10).map(s => ({
    id: s.id,
    customer: s.user_id,
    total: Number(s.total).toFixed(2),
    date: new Date(s.created_at).toISOString().split('T')[0],
  }));

  const { data: products = [] } = await supabase.from('products').select('*');
  lowStockProducts.value = products.filter(p => p.stock <= 5);

  /* =========================
     GRÁFICOS
  ========================= */
  salesLast7Days.value = [];
  profitLast7Days.value = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const day = d.toISOString().split('T')[0];

    const daySales = sales.filter(s => s.created_at.startsWith(day));
    const dayExpenses = realExpenses.filter(e => e.created_at.startsWith(day));

    const sTotal = daySales.reduce((a, b) => a + Number(b.total), 0);
    const eTotal = dayExpenses.reduce((a, b) => a + Number(b.monto), 0);

    salesLast7Days.value.push(sTotal);
    profitLast7Days.value.push(normalizeProfit(sTotal - eTotal));
  }

  initCharts();
};

/* =========================
   CHARTS
========================= */
const initCharts = () => {
  new Chart(document.getElementById('salesChart'), {
    type: 'line',
    data: {
      labels: Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d.toISOString().split('T')[0];
      }),
      datasets: [{
        label: 'Ventas S/',
        data: salesLast7Days.value,
        borderColor: '#4f46e5',
        backgroundColor: 'rgba(79,70,229,0.2)',
        tension: 0.3,
      }],
    },
  });

  new Chart(document.getElementById('profitChart'), {
    type: 'bar',
    data: {
      labels: Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d.toISOString().split('T')[0];
      }),
      datasets: [{
        label: 'Ganancias S/',
        data: profitLast7Days.value,
        backgroundColor: '#16a34a',
      }],
    },
  });
};

/* =========================
   COMPUTED
========================= */
const realTotalProfit = computed(() => realProfitTotal.value);

onMounted(loadDashboard);
</script>


<style scoped>
.dashboard-page {
  max-width: 1200px;
  margin: auto;
  padding: 20px;
  color: #111827;
}

.dashboard-title {
  font-size: 28px;
  margin-bottom: 20px;
  color: #4f46e5;
}

/* =========================
   GRID PRINCIPAL
========================= */
.dashboard-grid,
.charts-grid {
  display: grid;
  gap: 16px;
  margin-bottom: 20px;
}

.dashboard-grid {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.charts-grid {
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
}

/* =========================
   ESTILO TIPO SUMMARY (APLICADO A StatCard)
========================= */
.dashboard-grid > * {
  background: #f9fafb;
  padding: 14px 18px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  text-align: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  border-left: 4px solid #4f46e5;
}

.dashboard-grid > *:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 14px rgba(79, 70, 229, 0.15);
}

/* =========================
   TARJETAS Y TABLAS
========================= */
.chart-card,
.table-card {
  background: #ffffff;
  padding: 16px;
  border-radius: 12px;
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.06);
  margin-bottom: 20px;
}

.chart-card h2,
.table-card h2 {
  font-size: 18px;
  margin-bottom: 12px;
  color: #4338ca;
}

/* =========================
   TABLAS
========================= */
.table-wrapper {
  overflow-x: auto;
}

.responsive-table {
  width: 100%;
  border-collapse: collapse;
}

.responsive-table th,
.responsive-table td {
  padding: 12px 8px;
  border-bottom: 1px solid #e5e7eb;
  font-size: 14px;
}

.responsive-table th {
  background: #f3f4f6;
  font-weight: 600;
  color: #374151;
}

/* =========================
   PAGINACIÓN
========================= */
.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
}

.page-btn {
  background: #4f46e5;
  color: white;
  border: none;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: background 0.2s;
}

.page-btn:hover {
  background: #4338ca;
}

.page-btn:disabled {
  background: #c7d2fe;
  cursor: not-allowed;
}

.page-info {
  font-weight: 600;
  color: #374151;
}

.empty-msg {
  text-align: center;
  margin-top: 12px;
  color: #6b7280;
}

/* =========================
   RESPONSIVE
========================= */
@media (max-width: 768px) {
  .dashboard-grid,
  .charts-grid {
    grid-template-columns: 1fr;
  }
}
</style>

