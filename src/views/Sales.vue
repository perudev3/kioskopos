<script setup>
import html2canvas from 'html2canvas'
import { ref, onMounted, computed } from 'vue';
import { supabase } from '../lib/supabase';
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
    plin: 0
  };

  sales.value.forEach(sale => {
    const method = sale.payment_method?.toLowerCase();
    const saleTotal = sale.sale_items?.reduce((sum, item) => {
      const qty = Number(item.quantity || 0);
      const price = Number(item.price || 0);
      return sum + qty * price;
    }, 0) || 0;

    if (method === 'cash') totals.efectivo += saleTotal;
    else if (method === 'yape') totals.yape += saleTotal;
    else if (method === 'plin') totals.plin += saleTotal;
  });

  // Redondear a 2 decimales
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
  CONVERSION DE RANGO A UTC MANUALMENTE
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
   CARGAR TRANSFERENCIAS PREVIAS
========================= */
const loadTransferredAmounts = async () => {
  if (!user.value) return;

  try {
    // Obtener el rango de fechas actual
    let dateFilter = {};
    
    if (fromDate.value && toDate.value) {
      const fromRange = getLocalDateRangeUTC(fromDate.value);
      const toRange = getLocalDateRangeUTC(toDate.value);
      
      dateFilter = {
        from: fromRange.from,
        to: toRange.to
      };
    }

    // Consultar transferencias en el rango de fechas
    let query = supabase
      .from('transferencias_capital')
      .select('cuenta_origen, monto')
      .eq('user_id', user.value.id);

    if (dateFilter.from && dateFilter.to) {
      query = query
        .gte('created_at', dateFilter.from)
        .lte('created_at', dateFilter.to);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Sumar los montos por cuenta
    const amounts = {
      ganancia_neta: 0,
      ganancia_venta: 0
    };

    (data || []).forEach(transfer => {
      if (transfer.cuenta_origen === 'ganancia_neta') {
        amounts.ganancia_neta += Number(transfer.monto || 0);
      } else if (transfer.cuenta_origen === 'ganancia_venta') {
        amounts.ganancia_venta += Number(transfer.monto || 0);
      }
    });

    transferredAmounts.value = amounts;

  } catch (err) {
    console.error('Error cargando transferencias:', err);
  }
};

/* =========================
   CARGAR VENTAS
========================= */
const loadSales = async () => {
  loading.value = true;

  try {
    // 1️⃣ Obtener usuario autenticado
    const { data: authData, error: authError } =
      await supabase.auth.getUser();

    if (authError) throw authError;

    user.value = authData?.user;

    if (!user.value) {
      alert('Usuario no autenticado');
      sales.value = [];
      totalSales.value = 0;
      return;
    }

    // 2️⃣ Traer ventas con condiciones
    let query = supabase
      .from('sales')
      .select('*, sale_items(*, product:product_id(price))')
      .eq('user_id', user.value.id)
      .neq('payment_method', 'por_cobrar')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false });
    
     // 📅 Filtros corregidos
    if (fromDate.value && toDate.value) {
      const fromRange = getLocalDateRangeUTC(fromDate.value);
      const toRange = getLocalDateRangeUTC(toDate.value);

      query = query
        .gte('created_at', fromRange.from)
        .lte('created_at', toRange.to);
    }

    const { data: salesData, error } = await query;

    if (error) throw error;

    // 3️⃣ Asignar lista
    sales.value = salesData || [];
    totalAmount.value = calculateTotalAmount(sales.value);
    totalNetProfit.value = calculateNetProfit(sales.value);
    totalProfitSale.value = calculateProfitSale(sales.value);

    // 4️⃣ Total de ventas (cantidad)
    totalSales.value = sales.value.length;

    // 5️⃣ Cargar transferencias previas
    await loadTransferredAmounts();

  } catch (err) {
    console.error('Error cargando ventas:', err);
    alert('Error cargando ventas: ' + err.message);

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
    sale.sale_items?.forEach(item => {
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
   GANANCIA VENTA
========================= */
const calculateTotalSalesAmount = (salesList) => {
  let total = 0;

  salesList.forEach(sale => {
    sale.sale_items?.forEach(item => {
      const qty = Number(item.quantity || 0);
      const price = Number(item.price || 0);
      total += price * qty;
    });
  });

  return Math.round(total * 100) / 100;
};

const calculateProfitSale = (salesList) => {
  const totalSales = calculateTotalSalesAmount(salesList);
  const netProfit = calculateNetProfit(salesList);
  const profitSale = totalSales - netProfit;
  return Math.round(profitSale * 100) / 100;
};

/* =========================
   TRANSFERIR GANANCIA A CAPITAL
========================= */
const transferProfitToCapital = async () => {
  const monto = Number(profitToCapital.value);

  // Validaciones
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
    // 1. Registrar en tabla capital
    const { error: capitalError } = await supabase
      .from('capital')
      .insert({
        user_id: user.value.id,
        monto: monto,
        descripcion: `Transferencia desde ${selectedAccount.value === 'ganancia_neta' ? 'Ganancia Neta' : 'Ganancia de Venta'}`,
        tipo_movimiento: 'ingreso',
        fecha_registro: new Date().toISOString()
      });

    if (capitalError) throw capitalError;

    // 2. Registrar la transferencia para el control
    const { error: transferError } = await supabase
      .from('transferencias_capital')
      .insert({
        user_id: user.value.id,
        cuenta_origen: selectedAccount.value,
        monto: monto,
        fecha_rango_desde: fromDate.value || null,
        fecha_rango_hasta: toDate.value || null
      });

    if (transferError) throw transferError;

    // 3. Actualizar el monto transferido localmente
    transferredAmounts.value[selectedAccount.value] += monto;

    // 4. Limpiar y cerrar
    profitToCapital.value = '';
    showProfitModal.value = false;

    Swal.fire(
      'Éxito', 
      `S/ ${monto.toFixed(2)} transferidos a capital desde ${selectedAccount.value === 'ganancia_neta' ? 'Ganancia Neta' : 'Ganancia de Venta'}`, 
      'success'
    );

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

  const { error } = await supabase
    .from('sales')
    .update({ status: 'cancelled' })
    .eq('id', saleId);

  if (error) {
    Swal.fire('Error', 'No se pudo cancelar la venta', 'error');
    return;
  }

  await loadSales();
  Swal.fire('Cancelada', 'Venta cancelada exitosamente', 'success');
};

/* =========================
   TOTAL VENTAS
========================= */
const calculateTotalAmount = (salesList) => {
  let total = 0;

  salesList.forEach(sale => {
    sale.sale_items?.forEach(item => {
      const qty = Number(item.quantity || 0);
      const price = Number(item.price || 0);
      total += price * qty;
    });
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

/* =========================
   CARGAR DATA DE VENTAS
========================= */
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

    <!-- MODAL GANANCIA A CAPITAL MEJORADO -->
    <div v-if="showProfitModal" class="modal-backdrop" @click.self="showProfitModal = false">
      <div class="modal">
        <h2>💰 Pasar ganancia a capital</h2>

        <!-- Selección de cuenta -->
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

        <!-- Información de la cuenta seleccionada -->
        <div class="selected-account-info">
          <p>
            Saldo disponible: 
            <strong>S/ {{ selectedAccountBalance.toFixed(2) }}</strong>
          </p>
        </div>

        <!-- Input de monto -->
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

        <!-- Botones de acción -->
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
/* =========================
   CONTENEDOR
========================= */
.reports { padding:24px; max-width:1200px; margin:auto; font-family:'Segoe UI',sans-serif; color:#0f172a; }

/* TÍTULO */
.reports h1 { font-size:26px; font-weight:700; margin-bottom:18px; color:#0b3c5d; }

/* FILTROS */
.filters { display:flex; gap:10px; align-items:center; margin-bottom:14px; flex-wrap:wrap; }
.filters input[type='date'] { height:38px; padding:0 10px; border-radius:8px; border:1px solid #cbd5e1; font-size:14px; }
.filters input[type='date']:focus { outline:none; border-color:#1fa2c1; }
.filters button { height:38px; padding:0 16px; border-radius:8px; background:#0b3c5d; color:white; border:none; font-weight:600; cursor:pointer; }
.filters button:hover { background:#1fa2c1; }

/* RESUMEN */
.summary { display:flex; gap:12px; margin-bottom:12px; flex-wrap:wrap; }
.summary div { background:white; padding:8px 14px; border-radius:8px; font-size:14px; font-weight:600; box-shadow:0 2px 6px rgba(0,0,0,.05); border-left:4px solid #22c55e; }

/* SCROLL TABLA */
.table-scroll { background:white; border-radius:12px; padding:12px; max-height:360px; overflow-y:auto; box-shadow:0 4px 14px rgba(0,0,0,.08); }
.table-scroll::-webkit-scrollbar { width:8px; }
.table-scroll::-webkit-scrollbar-thumb { background:#1fa2c1; border-radius:6px; }
.table-scroll::-webkit-scrollbar-track { background:#e5e7eb; }

/* MODAL BACKDROP */
.modal-backdrop { 
  position:fixed; 
  inset:0; 
  background:rgba(11,60,93,0.6); 
  backdrop-filter:blur(4px); 
  z-index:1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* MODAL */
.modal { 
  width:100%; 
  max-width:520px; 
  background:white; 
  border-radius:18px; 
  padding:28px; 
  box-shadow:0 25px 50px rgba(0,0,0,.35);
  max-height: 90vh;
  overflow-y: auto;
}

.modal h2 { 
  font-size:22px; 
  font-weight:700; 
  margin-bottom:24px; 
  color:#0b3c5d; 
  text-align:center; 
}

/* SELECCIÓN DE CUENTA */
.account-selection {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
}

.account-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border: 2px solid #e2e8f0;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.account-option:hover {
  border-color: #1fa2c1;
  background: #f8fafc;
}

.account-option.active {
  border-color: #0b3c5d;
  background: #f0f9ff;
}

.account-option input[type="radio"] {
  width: 20px;
  height: 20px;
  cursor: pointer;
}

.account-info {
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.account-name {
  font-weight: 600;
  color: #334155;
  font-size: 15px;
}

.account-balance {
  font-weight: 700;
  color: #0b3c5d;
  font-size: 16px;
}

/* INFO CUENTA SELECCIONADA */
.selected-account-info {
  background: #f1f5f9;
  padding: 14px;
  border-radius: 10px;
  margin-bottom: 20px;
  text-align: center;
}

.selected-account-info p {
  margin: 0;
  font-size: 14px;
  color: #475569;
}

.selected-account-info strong {
  color: #0b3c5d;
  font-size: 18px;
}

/* FORM GROUP */
.form-group {
  margin-bottom: 20px;
  position: relative;
}

.form-group label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 8px;
}

.amount-input {
  width: 100%;
  padding: 12px 80px 12px 16px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  font-size: 16px;
  font-weight: 600;
  outline: none;
  transition: all 0.2s ease;
}

.amount-input:focus {
  border-color: #0b3c5d;
  box-shadow: 0 0 0 2px rgba(11,60,93,.15);
}

.max-btn {
  position: absolute;
  right: 6px;
  top: 36px;
  background: #0b3c5d;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.max-btn:hover {
  background: #1fa2c1;
}

/* MODAL ACTIONS */
.modal-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.confirm-btn {
  width: 100%;
  padding: 14px;
  border-radius: 10px;
  background: #0b3c5d;
  color: white;
  border: none;
  font-weight: 600;
  font-size: 15px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.confirm-btn:hover:not(:disabled) {
  background: #1fa2c1;
}

.confirm-btn:disabled {
  background: #94a3b8;
  cursor: not-allowed;
  opacity: 0.6;
}

.cancel-btn {
  width: 100%;
  padding: 14px;
  border-radius: 10px;
  background: #f1f5f9;
  color: #475569;
  border: none;
  font-weight: 600;
  font-size: 15px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cancel-btn:hover {
  background: #e2e8f0;
}

@media (max-width:768px) { 
  .filters { flex-direction:column; align-items:stretch; } 
  .table-scroll { max-height:300px; } 
  .modal { max-width:92%; padding: 20px; }
}

.summary-compact {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.summary-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.summary-item {
  background: #ffffff;
  padding: 8px 12px;
  border-radius: 8px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.05);
  flex: 1;
  min-width: 120px;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  flex-direction: column;
}

.summary-item .title {
  color: #64748b;
  font-weight: 500;
  margin-bottom: 2px;
  font-size: 12px;
}

.summary-item .value {
  color: #0b3c5d;
  font-weight: 700;
  font-size: 16px;
}

.summary-item small {
  color: #64748b;
  font-size: 11px;
  margin-top: 2px;
}

.summary-separator {
  border: none;
  border-top: 1px solid #e2e8f0; /* color gris suave */
  margin: 6px 0;
}
</style>