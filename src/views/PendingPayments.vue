<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '../lib/supabase'
import Swal from 'sweetalert2'

const sales = ref([])
const loading = ref(false)

const loadPendingSales = async () => {
  loading.value = true
  const { data } = await supabase
    .from('sales')
    .select('*')
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

      <div v-for="sale in sales" :key="sale.id" class="card">
        <div class="info">
          <div class="total">S/ {{ sale.total.toFixed(2) }}</div>
          <div class="date">
            {{ new Date(sale.created_at).toLocaleString() }}
          </div>
        </div>

        <button class="pay-btn" @click="collectPayment(sale.id)">
          Cobrar
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Fondo general */
.page {
  min-height: 100vh;
  background: #f4f6f8;
  padding: 24px;
  font-family: 'Inter', system-ui, sans-serif;
}

/* Contenedor */
.container {
  max-width: 760px;
  margin: auto;
}

/* Títulos */
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

/* Estado vacío */
.empty {
  background: white;
  padding: 24px;
  border-radius: 16px;
  text-align: center;
  color: #475569;
  box-shadow: 0 8px 20px rgba(0,0,0,.06);
}

/* Card */
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

/* Info */
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

.date {
  font-size: 13px;
  color: #64748b;
}

/* Botón cobrar */
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
</style>
