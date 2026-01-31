<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '../lib/supabase'
import html2canvas from 'html2canvas'

const props = defineProps({ sale: Object })
const emit = defineEmits(['close'])

const items = ref([])
const receiptRef = ref(null)

/* =========================
   CARGAR ITEMS
========================= */
onMounted(async () => {
  const { data } = await supabase
    .from('sale_items')
    .select(`
      quantity,
      price,
      subtotal,
      products ( name )
    `)
    .eq('sale_id', props.sale.id)

  items.value = data || []
})

/* =========================
   EXPORTAR BOLETA PNG
========================= */
const exportPNG = async () => {
  if (!receiptRef.value) return

  const canvas = await html2canvas(receiptRef.value, {
    scale: 2,
    backgroundColor: '#ffffff'
  })

  const link = document.createElement('a')
  link.download = `boleta-${props.sale.id}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}
</script>

<template>
  <div class="backdrop">
    <div class="modal">
    <div class="receipt" ref="receiptRef">
      <!-- BOLETA -->
      <div class="receipt" ref="receiptRef">
        <h2>KioPOS</h2>
        <p class="sub">Boleta de venta</p>

        <div class="row">
          <span>Fecha</span>
          <span>{{ new Date(sale.created_at).toLocaleString() }}</span>
        </div>

        <div class="row">
          <span>Método</span>
          <span>{{ sale.payment_method }}</span>
        </div>

        <hr />

        <div
          v-for="(i, idx) in items"
          :key="idx"
          class="item"
        >
          <div class="name">{{ i.products.name }}</div>
          <div class="line">
            {{ i.quantity }} x S/ {{ i.price }}
            <strong>S/ {{ i.subtotal }}</strong>
          </div>
        </div>

        <hr />

        <div class="total">
          TOTAL
          <span>S/ {{ sale.total }}</span>
        </div>

        <p class="thanks">¡Gracias por su compra!</p>
      </div>      
    </div>
    <!-- BOTONES -->
      <button class="btn primary" @click="exportPNG">
        🧾 Descargar boleta
      </button>

      <button class="btn" @click="emit('close')">
        Cerrar
      </button>
    </div>
  </div>
</template>

<style scoped>
/* =========================
   BACKDROP
========================= */
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

/* =========================
   MODAL
========================= */
.modal {
  background: #f8fafc;
  padding: 16px;
  width: 100%;
  max-width: 360px;
  border-radius: 18px;
  box-shadow: 0 25px 50px rgba(0,0,0,.35);
}


/* =========================
   SCROLL PARA BOLETA LARGA
========================= */
.modal {
  max-height: 90vh;
  overflow-y: auto;
}

.receipt {
  max-height: none;
  overflow: visible;
}


/* =========================
   BOLETA
========================= */
.receipt {
  background: white;
  padding: 16px;
  border-radius: 12px;
  font-family: 'Courier New', monospace;
}

.receipt h2 {
  text-align: center;
  margin: 0;
  font-size: 20px;
}

.sub {
  text-align: center;
  font-size: 12px;
  margin-bottom: 12px;
}

.row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-bottom: 4px;
}

hr {
  border: none;
  border-top: 1px dashed #cbd5e1;
  margin: 10px 0;
}

.item {
  font-size: 13px;
  margin-bottom: 6px;
}

.item .name {
  font-weight: 600;
}

.item .line {
  display: flex;
  justify-content: space-between;
}

.total {
  display: flex;
  justify-content: space-between;
  font-weight: 700;
  font-size: 16px;
  margin-top: 8px;
}

.thanks {
  text-align: center;
  font-size: 12px;
  margin-top: 12px;
}

/* =========================
   BOTONES
========================= */
.btn {
  width: 100%;
  height: 42px;
  border-radius: 10px;
  margin-top: 10px;
  border: none;
  font-weight: 600;
  cursor: pointer;
  background: #e5e7eb;
}

.btn.primary {
  background: #0b3c5d !important;
  color: white !important;
}

.btn.primary:hover {
  background: #1fa2c1;
}

/* =========================
   BOLETA (EXPORTABLE)
========================= */
.receipt {
  background: #ffffff !important;
  color: #000000 !important;
  padding: 16px;
  border-radius: 12px;
  font-family: 'Courier New', monospace;
}

/* Fuerza texto negro */
.receipt * {
  color: #000000 !important;
  background: transparent !important;
}

/* Tabla */
.receipt table {
  width: 100%;
  border-collapse: collapse;
}

.receipt th,
.receipt td {
  color: #000000 !important;
  font-size: 13px;
  padding: 6px 4px;
}

/* Total */
.receipt .total {
  font-size: 16px;
  font-weight: bold;
  margin-top: 10px;
  text-align: right;
}

/* Quitar sombras / efectos */
.receipt,
.receipt * {
  box-shadow: none !important;
  text-shadow: none !important;
  filter: none !important;
}

</style>
