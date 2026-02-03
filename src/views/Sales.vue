<script setup>
import html2canvas from 'html2canvas'
import { ref, onMounted } from 'vue';
import { supabase } from '../lib/supabase';

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
   CARGAR VENTAS
========================= */
const loadSales = async () => {
  loading.value = true;
  try {
    // 1️⃣ Obtener usuario
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    user.value = authData?.user;

    if (!user.value) {
      alert('Usuario no autenticado');
      sales.value = [];
      loading.value = false;
      return;
    }

    // 2️⃣ Obtener resumen general
    const { data: summary, error: summaryError } = await supabase
      .rpc('get_sales_summary', { p_user_id: user.value.id });

    if (summaryError) throw summaryError;

    const resume = summary?.[0] || {
      total_sales: 0,
      total_amount: 0,
      total_net_profit: 0,
      total_profit_sale: 0
    };

    totalSales.value = resume.total_sales;
    totalAmount.value = Number(resume.total_amount || 0);
    totalNetProfit.value = Number(resume.total_net_profit || 0);
    totalProfitSale.value = Number(resume.total_profit_sale || 0);

    // 3️⃣ Traer ventas
    let { data: salesData, error } = await supabase
      .from('sales')
      .select('*, sale_items(*, product:product_id(price))')
      .eq('user_id', user.value.id)
      .neq('payment_method', 'por_cobrar')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Filtrar por fechas usando UTC
    if (fromDate.value) {
      salesData = salesData.filter(sale => {
        const saleUTC = new Date(sale.created_at);
        const saleDayUTC = saleUTC.getUTCFullYear() + '-' +
                          String(saleUTC.getUTCMonth() + 1).padStart(2, '0') + '-' +
                          String(saleUTC.getUTCDate()).padStart(2, '0');
        return saleDayUTC >= fromDate.value;
      });
    }

    if (toDate.value) {
      salesData = salesData.filter(sale => {
        const saleUTC = new Date(sale.created_at);
        const saleDayUTC = saleUTC.getUTCFullYear() + '-' +
                          String(saleUTC.getUTCMonth() + 1).padStart(2, '0') + '-' +
                          String(saleUTC.getUTCDate()).padStart(2, '0');
        return saleDayUTC <= toDate.value;
      });
    }


    // 5️⃣ Calcular totales y ganancias solo sobre las ventas filtradas
    let totalAmountCalc = 0;
    let totalNetProfitCalc = 0;
    let totalProfitSaleCalc = 0;

    salesData.forEach(sale => {
      let net_profit = 0;
      let profit_sale = 0;

      if (sale.sale_items) {
        sale.sale_items.forEach(item => {
          const qty = Number(item.quantity || 0);
          const price = Number(item.price || 0);
          const base = Number(item.product?.price || 0);
          const subtotal = price * qty;
          const net = (price - base) * qty;
          const remaining = subtotal - net;
          net_profit += net;
          profit_sale += remaining;
        });
      }

      sale.net_profit = Math.round(net_profit * 100) / 100;
      sale.profit_sale = Math.round(profit_sale * 100) / 100;
      sale.total = Math.round(
        (sale.sale_items?.reduce((acc, i) => acc + Number(i.price) * Number(i.quantity), 0) || 0) * 100
      ) / 100;

      totalAmountCalc += sale.total;
      totalNetProfitCalc += sale.net_profit;
      totalProfitSaleCalc += sale.profit_sale;
    });

    sales.value = salesData;
    totalSales.value = salesData.length;
    totalAmount.value = totalAmountCalc;
    totalNetProfit.value = totalNetProfitCalc;
    totalProfitSale.value = totalProfitSaleCalc;

  } catch (err) {
    console.error('Error cargando ventas:', err);
    alert('Error cargando ventas: ' + err.message);
    sales.value = [];
    totalSales.value = 0;
    totalAmount.value = 0;
    totalNetProfit.value = 0;
    totalProfitSale.value = 0;
  } finally {
    loading.value = false;
  }
};


onMounted(loadSales);

/* =========================
   GANANCIA A CAPITAL
========================= */
const transferProfitToCapital = async () => {
  const montoNum = Number(profitToCapital.value);
  if (!montoNum || montoNum <= 0) return alert('Ingresa un monto válido');
  if (montoNum > totalNetProfit.value) return alert('No puedes transferir más que tu ganancia');

  const { error } = await supabase.from('egresos').insert({
    user_id: user.value.id,
    descripcion: 'Reinversión de ganancia',
    monto: montoNum,
    categoria: 'Capital',
    tipo: 'capital',
    origen: 'ganancia'
  });

  if (error) return alert('Error al pasar ganancia a capital');

  profitToCapital.value = '';
  showProfitModal.value = false;
};

/* =========================
   CANCELAR VENTA
========================= */
const cancelSale = async (saleId) => {
  const confirmCancel = confirm('¿Deseas cancelar esta venta? Esto no se puede deshacer.');
  if (!confirmCancel) return;

  const { error } = await supabase
    .from('sales')
    .update({ status: 'cancelled' })
    .eq('id', saleId);

  if (error) return alert('No se pudo cancelar la venta: ' + error.message);

  await loadSales();
  alert('Venta cancelada exitosamente.');
};
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
      <div>Ganancia venta: <strong>S/ {{ totalProfitSale.toFixed(2) }}</strong></div>
      <button style="margin-left: 8px" @click="showProfitModal = true">
        ↪ Pasar a capital
      </button>
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
        <button class="close-btn" @click="transferProfitToCapital">Confirmar</button>
        <button class="close-btn" style="background:#64748b;margin-top:8px" @click="showProfitModal = false">Cancelar</button>
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
/* MODAL */
.modal-backdrop { position:fixed; inset:0; background:rgba(11,60,93,0.6); backdrop-filter:blur(4px); z-index:1000; }
.modal { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:100%; max-width:480px; background:white; border-radius:18px; padding:22px; box-shadow:0 25px 50px rgba(0,0,0,.35); z-index:1001; }
.modal h2 { font-size:20px; font-weight:700; margin-bottom:16px; color:#0b3c5d; text-align:center; }
.modal .close-btn { margin-top:18px; width:100%; height:40px; border-radius:10px; background:#ef4444; color:white; border:none; font-weight:600; cursor:pointer; }
.modal .close-btn:hover { background:#dc2626; }
@media (max-width:768px) { .filters { flex-direction:column; align-items:stretch; } .table-scroll { max-height:300px; } .modal { max-width:92%; } }
</style>
