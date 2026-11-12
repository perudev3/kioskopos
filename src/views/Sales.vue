<script setup>
import html2canvas from 'html2canvas'
import { ref, onMounted, computed } from 'vue';
import api from '../lib/axios';
import Swal from 'sweetalert2';

import SalesTable from '../components/SalesTable.vue';
import SaleDetailModal from '../components/SaleDetailModal.vue';

const sales = ref([]);
const selectedSale = ref(null);
const receiptRef = ref(null);

const totalSales = ref(0);
const totalAmount = ref(0);
const totalNetProfit = ref(0);
const totalProfitSale = ref(0);

const fromDate = ref('');
const toDate = ref('');
const user = ref(null);
const loading = ref(false);
const showProfitModal = ref(false);
const profitToCapital = ref('');
const selectedAccount = ref('ganancia_neta'); // 'ganancia_neta' o 'ganancia_venta'

// Registro de montos ya transferidos a capital
const transferredAmounts = ref({
  ganancia_neta: 0,
  ganancia_venta: 0
});

/* =========================
   MONTOS DISPONIBLES (descontando lo ya transferido)
========================= */
const availableNetProfit = computed(() => {
  return Math.max(0, totalNetProfit.value - transferredAmounts.value.ganancia_neta);
});

const availableProfitSale = computed(() => {
  return Math.max(0, totalProfitSale.value - transferredAmounts.value.ganancia_venta);
});

const selectedAccountBalance = computed(() => {
  return selectedAccount.value === 'ganancia_neta' 
    ? availableNetProfit.value 
    : availableProfitSale.value;
});

/* =========================
   MÉTODOS DE PAGO (Conteo y Totales)
========================= */
const salesByPaymentMethod = computed(() => {
  const counts = {
    efectivo: 0,
    yape: 0,
    plin: 0
  };

  sales.value.forEach(sale => {
    const method = sale.payment_method?.toLowerCase();
    if (method === 'cash') counts.efectivo += 1;
    else if (method === 'yape') counts.yape += 1;
    else if (method === 'plin') counts.plin += 1;
  });

  return counts;
});

const totalAmountByPaymentMethod = computed(() => {
  const totals = {
    efectivo: 0,
    yape: 0,
    plin: 0,
    por_cobrar: 0
  };

  sales.value.forEach(sale => {
    const method = sale.payment_method?.trim().toLowerCase();
    const saleTotal = Number(sale.total || 0); // 🔑 Usamos directamente el total de la venta

    if (method === 'cash' || method === 'efectivo') totals.efectivo += saleTotal;
    else if (method === 'yape') totals.yape += saleTotal;
    else if (method === 'plin') totals.plin += saleTotal;
    else if (method === 'por_cobrar') totals.por_cobrar += saleTotal;
  });

  totals.efectivo = Math.round(totals.efectivo * 100) / 100;
  totals.yape = Math.round(totals.yape * 100) / 100;
  totals.plin = Math.round(totals.plin * 100) / 100;

  return totals;
});

/* =========================
   EXPORTAR BOLETA
========================= */
const exportBoleta = async (sale) => {
  if (!receiptRef.value) return

  const canvas = await html2canvas(receiptRef.value, {
    scale: 2,
    backgroundColor: '#ffffff'
  })

  const link = document.createElement('a')
  link.download = `boleta-${sale.id}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

/* =========================
   CARGAR VENTAS DESDE LA API
========================= */
const loadSales = async () => {
  loading.value = true;

  try {
    // Obtener usuario autenticado desde el localStorage (guardado en el login)
    const userStr = localStorage.getItem('kiopos_user');
    user.value = userStr ? JSON.parse(userStr) : null;

    if (!user.value) {
      alert('Usuario no autenticado');
      sales.value = [];
      totalSales.value = 0;
      return;
    }

    const response = await api.get('/sales-reports', {
      params: {
        from: fromDate.value,
        to: toDate.value
      }
    });

    const data = response.data;

    sales.value = data.sales || [];
    transferredAmounts.value = data.transferredAmounts || { ganancia_neta: 0, ganancia_venta: 0 };

    totalAmount.value = calculateTotalAmount(sales.value);
    totalNetProfit.value = calculateNetProfit(sales.value);
    totalProfitSale.value = calculateProfitSale(sales.value);
    totalSales.value = sales.value.length;

  } catch (err) {
    console.error('Error cargando ventas:', err);
    alert('Error cargando ventas: ' + (err.response?.data?.message || err.message));

    sales.value = [];
    totalSales.value = 0;

  } finally {
    loading.value = false;
  }
};

/* =========================
   GANANCIA NETA
========================= */
const calculateNetProfit = (salesList) => {
  let netProfit = 0;

  salesList.forEach(sale => {
    sale.items?.forEach(item => {
      const qty = Number(item.quantity || 0);
      const salePrice = Number(item.price || 0);
      const basePrice = Number(item.product?.price || 0);
      const profit = (salePrice - basePrice) * qty;
      netProfit += profit;
    });
  });

  return Math.round(netProfit * 100) / 100;
};

/* =========================
   TOTAL VENTAS MONTO
========================= */
const calculateTotalSalesAmount = (salesList) => {
  let total = 0;

  salesList.forEach(sale => {
    // 🔑 Cambiado de sale_items a items
    sale.items?.forEach(item => {
      const qty = Number(item.quantity || 0);
      const price = Number(item.price || 0);
      total += price * qty;
    });
  });

  return Math.round(total * 100) / 100;
};

const calculateProfitSale = (salesList) => {
  const totalSalesVal = calculateTotalSalesAmount(salesList);
  const netProfit = calculateNetProfit(salesList);
  const profitSale = totalSalesVal - netProfit;
  return Math.round(profitSale * 100) / 100;
};

/* =========================
   TRANSFERIR GANANCIA A CAPITAL
========================= */
const transferProfitToCapital = async () => {
  const monto = Number(profitToCapital.value);

  if (!monto || monto <= 0) {
    Swal.fire('Error', 'Ingresa un monto válido mayor a 0', 'error');
    return;
  }

  const disponible = selectedAccountBalance.value;

  if (monto > disponible) {
    Swal.fire(
      'Error', 
      `El monto excede el saldo disponible de S/ ${disponible.toFixed(2)}`, 
      'error'
    );
    return;
  }

  try {
    await api.post('/sales-reports/transfer', {
      monto: monto,
      cuenta_origen: selectedAccount.value,
      fecha_rango_desde: fromDate.value || null,
      fecha_rango_hasta: toDate.value || null
    });

    transferredAmounts.value[selectedAccount.value] += monto;

    profitToCapital.value = '';
    showProfitModal.value = false;

    Swal.fire(
      'Éxito', 
      `S/ ${monto.toFixed(2)} transferidos a capital desde ${selectedAccount.value === 'ganancia_neta' ? 'Ganancia Neta' : 'Ganancia de Venta'}`, 
      'success'
    );

    loadSales();

  } catch (error) {
    console.error('Error transfiriendo a capital:', error);
    Swal.fire('Error', 'No se pudo completar la transferencia', 'error');
  }
};

/* =========================
   CANCELAR VENTA
========================= */
const cancelSale = async (saleId) => {
  const result = await Swal.fire({
    title: '¿Cancelar venta?',
    text: 'Esta acción no se puede deshacer',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Sí, cancelar',
    cancelButtonText: 'No',
    confirmButtonColor: '#ef4444'
  });

  if (!result.isConfirmed) return;

  try {
    await api.patch(`/sales-reports/${saleId}/cancel`);
    await loadSales();
    Swal.fire('Cancelada', 'Venta cancelada exitosamente', 'success');
  } catch (error) {
    Swal.fire('Error', 'No se pudo cancelar la venta', 'error');
  }
};

/* =========================
   TOTAL VENTAS GENERAL
========================= */
const calculateTotalAmount = (salesList) => {
  let total = 0;
  salesList.forEach(sale => {
    total += Number(sale.total || 0);
  });
  return Math.round(total * 100) / 100;
};

/* =========================
   RESETEAR FILTROS
========================= */
const resetFilters = () => {
  fromDate.value = '';
  toDate.value = '';
  loadSales();
};

onMounted(loadSales);
</script>

<template>
  <div class="reports">
    <h1>Reporte de Ventas</h1>

    <!-- FILTROS -->
    <div class="filters">
      <input type="date" v-model="fromDate" />
      <input type="date" v-model="toDate" />

      <button @click="loadSales">
        Filtrar
      </button>

      <button @click="resetFilters">
        Limpiar
      </button>

      <button @click="showProfitModal = true" class="transfer-btn">
        Pasar ganancia a capital
      </button>
    </div>

    <!-- RESUMEN -->
    <div class="summary-compact">
      <div class="summary-row">
        <div class="summary-item">
          <span class="title">Ventas:</span>
          <span class="value">{{ totalSales }}</span>
        </div>
        <div class="summary-item">
          <span class="title">Total:</span>
          <span class="value">S/ {{ totalAmount.toFixed(2) }}</span>
        </div>
      </div>

      <hr class="summary-separator" />

      <div class="summary-row">
        <div class="summary-item">
          <span class="title">Ganancia Neta:</span>
          <span class="value">S/ {{ totalNetProfit.toFixed(2) }}</span>
          <small v-if="transferredAmounts.ganancia_neta > 0">
            Disponible: S/ {{ availableNetProfit.toFixed(2) }}
          </small>
        </div>
        <div class="summary-item">
          <span class="title">Ganancia Venta:</span>
          <span class="value">S/ {{ totalProfitSale.toFixed(2) }}</span>
          <small v-if="transferredAmounts.ganancia_venta > 0">
            Disponible: S/ {{ availableProfitSale.toFixed(2) }}
          </small>
        </div>
      </div>

      <hr class="summary-separator" />

      <div class="summary-row">
        <div class="summary-item">
          <span class="title">Efectivo:</span>
          <span class="value">S/ {{ totalAmountByPaymentMethod.efectivo.toFixed(2) }}</span>
        </div>
        <div class="summary-item">
          <span class="title">Yape:</span>
          <span class="value">S/ {{ totalAmountByPaymentMethod.yape.toFixed(2) }}</span>
        </div>
        <div class="summary-item">
          <span class="title">Plin:</span>
          <span class="value">S/ {{ totalAmountByPaymentMethod.plin.toFixed(2) }}</span>
        </div>
      </div>
    </div>

    <!-- TABLA -->
    <div class="table-scroll">
      <SalesTable
        :sales="sales"
        :loading="loading"
        @view="selectedSale = $event"
        @cancel="cancelSale"
      />
    </div>

    <!-- MODAL DETALLE -->
    <SaleDetailModal
      v-if="selectedSale"
      :sale="selectedSale"
      @close="selectedSale = null"
    />

    <!-- MODAL GANANCIA A CAPITAL -->
    <div v-if="showProfitModal" class="modal-backdrop" @click.self="showProfitModal = false">
      <div class="modal">
        <h2>💰 Pasar ganancia a capital</h2>

        <div class="account-selection">
          <label class="account-option" :class="{ active: selectedAccount === 'ganancia_neta' }">
            <input 
              type="radio" 
              v-model="selectedAccount" 
              value="ganancia_neta"
            />
            <div class="account-info">
              <span class="account-name">Ganancia Neta</span>
              <span class="account-balance">S/ {{ availableNetProfit.toFixed(2) }}</span>
            </div>
          </label>

          <label class="account-option" :class="{ active: selectedAccount === 'ganancia_venta' }">
            <input 
              type="radio" 
              v-model="selectedAccount" 
              value="ganancia_venta"
            />
            <div class="account-info">
              <span class="account-name">Ganancia de Venta</span>
              <span class="account-balance">S/ {{ availableProfitSale.toFixed(2) }}</span>
            </div>
          </label>
        </div>

        <div class="selected-account-info">
          <p>
            Saldo disponible: 
            <strong>S/ {{ selectedAccountBalance.toFixed(2) }}</strong>
          </p>
        </div>

        <div class="form-group">
          <label>Monto a transferir</label>
          <input
            v-model="profitToCapital"
            type="number"
            min="0"
            step="0.01"
            :max="selectedAccountBalance"
            placeholder="0.00"
            class="amount-input"
          />
          <button 
            type="button" 
            @click="profitToCapital = selectedAccountBalance.toFixed(2)"
            class="max-btn"
          >
            Usar todo
          </button>
        </div>

        <div class="modal-actions">
          <button 
            @click="transferProfitToCapital" 
            class="confirm-btn"
            :disabled="!profitToCapital || Number(profitToCapital) <= 0"
          >
            Confirmar transferencia
          </button>
          <button 
            @click="showProfitModal = false; profitToCapital = ''" 
            class="cancel-btn"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reports { padding:24px; max-width:1200px; margin:auto; font-family:'Segoe UI',sans-serif; color:#0f172a; }
.reports h1 { font-size:26px; font-weight:700; margin-bottom:18px; color:#0b3c5d; }
.filters { display:flex; gap:10px; align-items:center; margin-bottom:14px; flex-wrap:wrap; }
.filters input[type='date'] { height:38px; padding:0 10px; border-radius:8px; border:1px solid #cbd5e1; font-size:14px; }
.filters input[type='date']:focus { outline:none; border-color:#1fa2c1; }
.filters button { height:38px; padding:0 16px; border-radius:8px; background:#0b3c5d; color:white; border:none; font-weight:600; cursor:pointer; }
.filters button:hover { background:#1fa2c1; }
.transfer-btn { background: #22c55e !important; }
.transfer-btn:hover { background: #16a34a !important; }
.table-scroll { background:white; border-radius:12px; padding:12px; max-height:360px; overflow-y:auto; box-shadow:0 4px 14px rgba(0,0,0,.08); }
.modal-backdrop { position:fixed; inset:0; background:rgba(11,60,93,0.6); backdrop-filter:blur(4px); z-index:1000; display:flex; align-items:center; justify-content:center; }
.modal { width:100%; max-width:520px; background:white; border-radius:18px; padding:28px; box-shadow:0 25px 50px rgba(0,0,0,.35); max-height:90vh; overflow-y:auto; }
.modal h2 { font-size:22px; font-weight:700; margin-bottom:24px; color:#0b3c5d; text-align:center; }
.account-selection { display:flex; flex-direction:column; gap:12px; margin-bottom:20px; }
.account-option { display:flex; align-items:center; gap:12px; padding:16px; border:2px solid #e2e8f0; border-radius:12px; cursor:pointer; transition:all 0.2s ease; }
.account-option:hover { border-color:#1fa2c1; background:#f8fafc; }
.account-option.active { border-color:#0b3c5d; background:#f0f9ff; }
.account-option input[type="radio"] { width:20px; height:20px; cursor:pointer; }
.account-info { flex:1; display:flex; justify-content:space-between; align-items:center; }
.account-name { font-weight:600; color:#334155; font-size:15px; }
.account-balance { font-weight:700; color:#0b3c5d; font-size:16px; }
.selected-account-info { background:#f1f5f9; padding:14px; border-radius:10px; margin-bottom:20px; text-align:center; }
.selected-account-info p { margin:0; font-size:14px; color:#475569; }
.selected-account-info strong { color:#0b3c5d; font-size:18px; }
.form-group { margin-bottom:20px; position:relative; }
.form-group label { display:block; font-size:14px; font-weight:600; color:#334155; margin-bottom:8px; }
.amount-input { width:100%; padding:12px 80px 12px 16px; border-radius:10px; border:1px solid #cbd5e1; font-size:16px; font-weight:600; outline:none; transition:all 0.2s ease; }
.amount-input:focus { border-color:#0b3c5d; box-shadow:0 0 0 2px rgba(11,60,93,.15); }
.max-btn { position:absolute; right:6px; top:36px; background:#0b3c5d; color:white; border:none; padding:6px 12px; border-radius:6px; font-size:13px; font-weight:600; cursor:pointer; transition:all 0.2s ease; }
.max-btn:hover { background:#1fa2c1; }
.modal-actions { display:flex; flex-direction:column; gap:10px; }
.confirm-btn { width:100%; padding:14px; border-radius:10px; background:#0b3c5d; color:white; border:none; font-weight:600; font-size:15px; cursor:pointer; transition:all 0.2s ease; }
.confirm-btn:hover:not(:disabled) { background:#1fa2c1; }
.confirm-btn:disabled { background:#94a3b8; cursor:not-allowed; opacity:0.6; }
.cancel-btn { width:100%; padding:14px; border-radius:10px; background:#f1f5f9; color:#475569; border:none; font-weight:600; font-size:15px; cursor:pointer; transition:all 0.2s ease; }
.cancel-btn:hover { background:#e2e8f0; }
.summary-compact { display:flex; flex-direction:column; gap:8px; margin-bottom:12px; }
.summary-row { display:flex; gap:16px; flex-wrap:wrap; }
.summary-item { background:#ffffff; padding:8px 12px; border-radius:8px; box-shadow:0 2px 6px rgba(0,0,0,0.05); flex:1; min-width:120px; font-size:14px; font-weight:600; display:flex; flex-direction:column; }
.summary-item .title { color:#64748b; font-weight:500; margin-bottom:2px; font-size:12px; }
.summary-item .value { color:#0b3c5d; font-weight:700; font-size:16px; }
.summary-item small { color:#64748b; font-size:11px; margin-top:2px; }
.summary-separator { border:none; border-top:1px solid #e2e8f0; margin:6px 0; }
@media (max-width:768px) { 
  .filters { flex-direction:column; align-items:stretch; } 
  .table-scroll { max-height:300px; } 
  .modal { max-width:92%; padding:20px; }
}
</style>