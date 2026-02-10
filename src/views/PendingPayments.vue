<script setup>
import { ref, onMounted, computed } from 'vue'
import { supabase } from '../lib/supabase'
import Swal from 'sweetalert2'
import SaleDetailModal from '../components/SaleDetailModal.vue'

const sales = ref([])
const loading = ref(false)
const selectedSale = ref(null)
const search = ref('')

const filteredSales = computed(() => {
  if (!search.value) return sales.value

  const term = search.value.toLowerCase()

  return sales.value.filter(sale => {
    const customer =
      sale.clientes_por_cobrar?.[0]?.customer_name?.toLowerCase() || ''

    const products = (sale.sale_items || [])
      .map(item => item.products?.name?.toLowerCase() || '')
      .join(' ')

    return customer.includes(term) || products.includes(term)
  })
})

const totalPending = computed(() => {
  return filteredSales.value.reduce((sum, sale) => {
    return sum + (sale.total || 0)
  }, 0)
})



const loadPendingSales = async () => {
  loading.value = true

  const { data } = await supabase
    .from('sales')
    .select(`
      id,
      total,
      created_at,
      payment_method,
      clientes_por_cobrar!inner(customer_name),
      sale_items (
        quantity,
        products (
          name
        )
      )
    `)
    .eq('payment_method', 'por_cobrar')
    .order('created_at', { ascending: false })

  sales.value = data || []
  loading.value = false
}


const collectPayment = async (saleId) => {
  const { value: method } = await Swal.fire({
    title: 'Cobrar venta',
    input: 'select',
    inputOptions: {
      cash: 'Efectivo',
      yape: 'Yape',
      plin: 'Plin'
    },
    inputPlaceholder: 'Selecciona método',
    showCancelButton: true,
    confirmButtonText: 'Confirmar cobro',
    cancelButtonText: 'Cancelar'
  })

  if (!method) return

  await supabase
    .from('sales')
    .update({ payment_method: method })
    .eq('id', saleId)

  Swal.fire('Pago registrado', '', 'success')
  loadPendingSales()
}

onMounted(loadPendingSales)
</script>

<template>
  <div class="page">
    <div class="container">
      <h2>Cobros pendientes</h2>
      <p class="subtitle">Ventas fiadas por cobrar</p>

      <div v-if="loading" class="empty">
        Cargando...
      </div>

      <div v-if="!sales.length && !loading" class="empty">
        No hay cobros pendientes 🎉
      </div>

      <input
        v-model="search"
        type="text"
        placeholder="Buscar por cliente o producto..."
        class="search-input"
      />

      <div class="summary">
        Total pendiente: <span>S/ {{ totalPending.toFixed(2) }}</span>
      </div>

      <div class="sales-scroll">
        <div v-for="sale in filteredSales" :key="sale.id" class="card">
          <div class="info">
            <div class="total">S/ {{ sale.total.toFixed(2) }}</div>
            <div class="customer">
              Cliente: {{ sale.clientes_por_cobrar[0]?.customer_name }}
            </div>
            <div class="date">
              {{ new Date(sale.created_at).toLocaleString() }}
            </div>
          </div>

          <button class="pay-btn" @click="collectPayment(sale.id)">
            Cobrar
          </button>
          <button
            class="receipt-btn"
            @click="selectedSale = sale"
          >
            Boleta
          </button>
        </div>
      </div>


    </div>
  </div>

  <SaleDetailModal
    v-if="selectedSale"
    :sale="selectedSale"
    @close="selectedSale = null"
  />

</template>

<style scoped>
.page {
  min-height: 100vh;
  background: #f4f6f8;
  padding: 24px;
  font-family: 'Inter', system-ui, sans-serif;
}

.container {
  max-width: 760px;
  margin: auto;
}

h2 {
  font-size: 28px;
  font-weight: 800;
  color: #0f172a;
  margin-bottom: 4px;
}

.subtitle {
  color: #475569;
  margin-bottom: 20px;
  font-size: 14px;
}

.empty {
  background: white;
  padding: 24px;
  border-radius: 16px;
  text-align: center;
  color: #475569;
  box-shadow: 0 8px 20px rgba(0,0,0,.06);
}

.card {
  background: white;
  padding: 18px;
  border-radius: 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
  box-shadow: 0 10px 25px rgba(0,0,0,.08);
}

.info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.total {
  font-size: 20px;
  font-weight: 800;
  color: #111827;
}

.customer {
  font-size: 14px;
  color: #334155;
}

.date {
  font-size: 13px;
  color: #64748b;
}

.pay-btn {
  background: #16a34a;
  color: white;
  border: none;
  padding: 10px 16px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all .2s ease;
}

.pay-btn:hover {
  background: #15803d;
  transform: translateY(-1px);
}

.receipt-btn {
    background: #0b3c5d;
    color: white;
    border: none;
    padding: 10px 16px;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all .2s ease;
}

.receipt-btn:hover {
  background: #1fa2c1;
  transform: translateY(-1px);
}

.search-input {
  width: 100%;
  padding: 12px 16px;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  margin-bottom: 18px;
  font-size: 14px;
  outline: none;
  transition: all .2s ease;
}

.search-input:focus {
  border-color: #0b3c5d;
  box-shadow: 0 0 0 2px rgba(11,60,93,.15);
}

/* SUMATORIA */
.summary {
  background: white;
  padding: 14px 18px;
  border-radius: 14px;
  margin-bottom: 14px;
  font-size: 16px;
  font-weight: 600;
  color: #334155;
  box-shadow: 0 8px 20px rgba(0,0,0,.06);
}

.summary span {
  color: #16a34a;
  font-weight: 800;
  font-size: 18px;
  margin-left: 6px;
}

/* SCROLL LISTA */
.sales-scroll {
  max-height: 520px;   /* altura visible */
  overflow-y: auto;
  padding-right: 6px;
}

/* Scroll bonito */
.sales-scroll::-webkit-scrollbar {
  width: 8px;
}

.sales-scroll::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 10px;
}

.sales-scroll::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

</style>
