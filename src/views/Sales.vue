<script setup>
import { ref, computed, onMounted } from 'vue';
import { supabase } from '../lib/supabase';

import SalesTable from '../components/SalesTable.vue';
import SaleDetailModal from '../components/SaleDetailModal.vue';

const sales = ref([]);
const selectedSale = ref(null);

const fromDate = ref('');
const toDate = ref('');
const user = ref(null);
const loading = ref(false);

/* =========================
   CARGAR VENTAS
========================= */
const loadSales = async () => {
  loading.value = true;

  const { data: auth } = await supabase.auth.getUser();
  user.value = auth.user;

  let query = supabase
    .from('sales')
    .select('*')
    .eq('user_id', user.value.id)
    .order('created_at', { ascending: false });

  if (fromDate.value) query = query.gte('created_at', fromDate.value);
  if (toDate.value) query = query.lte('created_at', toDate.value + 'T23:59:59');

  const { data } = await query;
  sales.value = data || [];

  loading.value = false;
};

onMounted(loadSales);

/* =========================
   TOTALES
========================= */
const totalSales = computed(() => sales.value.length);

const totalAmount = computed(() =>
  sales.value.reduce((sum, s) => sum + Number(s.total), 0)
);

/* =========================
   GANANCIA NETA
========================= */
const totalNetProfit = computed(() =>
  sales.value.reduce((sum, s) => sum + Number(s.net_profit || 0), 0)
);


/* =========================
   PASAR GANANCIA A CAPITAL
========================= */
const showProfitModal = ref(false)
const profitToCapital = ref('')

const transferProfitToCapital = async () => {
  const montoNum = Number(profitToCapital.value)

  if (!montoNum || montoNum <= 0) {
    alert('Ingresa un monto válido')
    return
  }

  if (montoNum > totalNetProfit.value) {
    alert('No puedes transferir más que tu ganancia')
    return
  }

  const { error } = await supabase.from('egresos').insert({
    user_id: user.value.id,
    descripcion: 'Reinversión de ganancia',
    monto: montoNum,
    categoria: 'Capital',
    tipo: 'capital',
    origen: 'ganancia'
  })

  if (error) {
    alert('Error al pasar ganancia a capital')
    return
  }

  profitToCapital.value = ''
  showProfitModal.value = false
}

</script>

<template>
  <div class="reports">
    <h1>📊 Reporte de Ventas</h1>

    <!-- FILTROS -->
    <div class="filters">
      <input type="date" v-model="fromDate" />
      <input type="date" v-model="toDate" />
      <button @click="loadSales">Filtrar</button>
    </div>

    <!-- RESUMEN -->
    <div class="summary">
      <div>Ventas: <strong>{{ totalSales }}</strong></div>
      <div>Total: <strong>S/ {{ totalAmount.toFixed(2) }}</strong></div>
      <div>Ganancia neta: <strong>S/ {{ totalNetProfit.toFixed(2) }}</strong></div>

      <button
        style="margin-left: 8px"
        @click="showProfitModal = true"
      >
        ↪ Pasar a capital
      </button>

    </div>


    <!-- TABLA CON SCROLL -->
    <div class="table-scroll">
      <SalesTable
        :sales="sales"
        :loading="loading"
        @view="selectedSale = $event"
      />
    </div>

    <!-- MODAL -->
    <SaleDetailModal
      v-if="selectedSale"
      :sale="selectedSale"
      @close="selectedSale = null"
    />
  </div>

  <!-- MODAL PASAR GANANCIA A CAPITAL -->
  <div v-if="showProfitModal" class="modal-backdrop">
    <div class="modal">
      <h2>💰 Pasar ganancia a capital</h2>

      <p style="text-align:center;margin-bottom:10px">
        Ganancia disponible: <strong>S/ {{ totalNetProfit.toFixed(2) }}</strong>
      </p>

      <input
        v-model="profitToCapital"
        type="number"
        min="0"
        step="0.01"
        placeholder="Monto a reinvertir"
        style="width:100%;padding:10px;border-radius:8px;border:1px solid #cbd5e1"
      />

      <button class="close-btn" @click="transferProfitToCapital">
        Confirmar
      </button>

      <button
        class="close-btn"
        style="background:#64748b;margin-top:8px"
        @click="showProfitModal = false"
      >
        Cancelar
      </button>
    </div>
  </div>

</template>

<style scoped>
/* =========================
   CONTENEDOR
========================= */
.reports {
  padding: 24px;
  max-width: 1200px;
  margin: auto;
  font-family: 'Segoe UI', sans-serif;
  color: #0f172a;
  background: #f8fafc;
}

/* =========================
   TÍTULO
========================= */
.reports h1 {
  font-size: 26px;
  font-weight: 700;
  margin-bottom: 18px;
  color: #0b3c5d;
}

/* =========================
   FILTROS
========================= */
.filters {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.filters input[type='date'] {
  height: 38px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  font-size: 14px;
}

.filters input[type='date']:focus {
  outline: none;
  border-color: #1fa2c1;
}

.filters button {
  height: 38px;
  padding: 0 16px;
  border-radius: 8px;
  background: #0b3c5d;
  color: white;
  border: none;
  font-weight: 600;
  cursor: pointer;
}

.filters button:hover {
  background: #1fa2c1;
}

/* =========================
   RESUMEN
========================= */
.summary {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.summary div {
  background: white;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  box-shadow: 0 2px 6px rgba(0,0,0,.05);
  border-left: 4px solid #22c55e;
}

/* =========================
   SCROLL DE TABLA
========================= */
.table-scroll {
  background: white;
  border-radius: 12px;
  padding: 12px;
  max-height: 360px;          /* ALTURA FIJA */
  overflow-y: auto;           /* SCROLL INTERNO */
  box-shadow: 0 4px 14px rgba(0,0,0,.08);
}

/* Scroll bonito */
.table-scroll::-webkit-scrollbar {
  width: 8px;
}

.table-scroll::-webkit-scrollbar-thumb {
  background: #1fa2c1;
  border-radius: 6px;
}

.table-scroll::-webkit-scrollbar-track {
  background: #e5e7eb;
}

/* =========================
   MODAL (KioPOS)
========================= */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(11, 60, 93, 0.6);
  backdrop-filter: blur(4px);
  z-index: 1000;
}

.modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  max-width: 480px;
  background: white;
  border-radius: 18px;
  padding: 22px;
  box-shadow: 0 25px 50px rgba(0,0,0,.35);
  z-index: 1001;
}

.modal h2 {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 16px;
  color: #0b3c5d;
  text-align: center;
}

.modal .detail-row {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  font-size: 14px;
  border-bottom: 1px solid #e5e7eb;
}

.modal .detail-row span:last-child {
  font-weight: 600;
  color: #1fa2c1;
}

.modal .close-btn {
  margin-top: 18px;
  width: 100%;
  height: 40px;
  border-radius: 10px;
  background: #ef4444;
  color: white;
  border: none;
  font-weight: 600;
  cursor: pointer;
}

.modal .close-btn:hover {
  background: #dc2626;
}

/* =========================
   RESPONSIVE
========================= */
@media (max-width: 768px) {
  .filters {
    flex-direction: column;
    align-items: stretch;
  }

  .table-scroll {
    max-height: 300px;
  }

  .modal {
    max-width: 92%;
  }
}
</style>
