<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../lib/supabase'

const egresos = ref([])
const ventas = ref([])

const descripcion = ref('')
const monto = ref('')
const categoria = ref('')

const loading = ref(false)
const user = ref(null)
const capitalMonto = ref('')

const totalVentas = ref(0)
const totalGanancia = ref(0)
const totalCostoProductos = ref(0)

const showEgresoModal = ref(false)
const showCapitalModal = ref(false)

/* =========================
   USER
========================= */
const loadUser = async () => {
  const { data, error } = await supabase.auth.getUser()

  if (error) {
    console.error(error)
    return
  }

  user.value = data?.user
}

/* =========================
   LOAD GENERAL
========================= */
const loadData = async () => {
  loading.value = true

  await loadUser()
  await loadVentas()
  await loadEgresos()

  loading.value = false
}

/* =========================
   CARGA VENTAS
========================= */
const loadVentas = async () => {
  if (!user.value) return

  const { data, error } = await supabase
    .from('sales')
    .select(`
      *,
      sale_items(
        quantity,
        price,
        product:product_id(price)
      )
    `)
    .eq('user_id', user.value.id)
    .neq('payment_method', 'por_cobrar')
    .neq('status', 'cancelled')

  if (error) {
    console.error('Error ventas:', error)
    return
  }

  ventas.value = data || []

  // 🔥 MISMO CALCULO QUE DASHBOARD
  let total = 0

  ventas.value.forEach(sale => {
    let totalProfitSale = 0

    if (sale.sale_items && sale.sale_items.length) {
      sale.sale_items.forEach(item => {
        const qty = Number(item.quantity || 0)
        const price = Number(item.price || 0)
        const base = Number(item.product?.price || 0)

        totalProfitSale += (price * qty) - ((price - base) * qty)
      })
    }

    total += totalProfitSale
  })

  totalGanancia.value = Math.round(total * 100) / 100
}


/* =========================
   CALCULO GANANCIA REAL
========================= */
const calculateNetProfit = (salesList) => {
  let netProfit = 0

  salesList.forEach(sale => {
    sale.sale_items?.forEach(item => {
      const qty = Number(item.quantity || 0)
      const salePrice = Number(item.price || 0)
      const basePrice = Number(item.product?.price || 0)

      const profit = (salePrice - basePrice) * qty
      netProfit += profit
    })
  })

  return Math.round(netProfit * 100) / 100
}

/* =====================================================
   🔹 CAPITAL VENTAS (GANANCIA)
===================================================== */
const capitalVentas = computed(() => {
  return Number(totalGanancia.value || 0)
})


/* =====================================================
   🔹 CAPITAL (egresos categoria = capital)
===================================================== */
const totalCapital = computed(() => {
  return egresos.value
    .filter(e =>
      (e.categoria || '').toLowerCase() === 'capital' ||
      (e.tipo || '').toLowerCase() === 'capital'
    )
    .reduce((sum, e) => sum + Number(e.monto || 0), 0)
})


/* =====================================================
   🔹 EGRESOS OPERATIVOS (restan)
===================================================== */
const totalEgresos = computed(() => {
  return egresos.value
    .filter(e =>
      (e.categoria || '').toLowerCase() !== 'capital' &&
      (e.tipo || '').toLowerCase() !== 'capital'
    )
    .reduce((sum, e) => sum + Number(e.monto || 0), 0)
})

/* =====================================================
   🔹 CAPITAL DISPONIBLE (TU FORMULA)
   Ganancia ventas - egresos + capital
===================================================== */
const capitalDisponible = computed(() => {
  return (
    Number(totalGanancia.value || 0) -
    Number(totalEgresos.value || 0) +
    Number(totalCapital.value || 0)
  )
})

/* =========================
   REGISTRAR EGRESO
========================= */
const saveEgreso = async () => {
  if (!descripcion.value || !monto.value) {
    alert('Descripción y monto son obligatorios')
    return
  }

  const montoNum = Number(monto.value)
  if (montoNum <= 0) {
    alert('El monto debe ser mayor a cero')
    return
  }

  if (montoNum > capitalDisponible.value) {
    alert('No puedes registrar un egreso mayor al capital disponible')
    return
  }

  const { error } = await supabase.from('egresos').insert({
    user_id: user.value.id,
    descripcion: descripcion.value,
    monto: montoNum,
    categoria: categoria.value || null
  })

  if (error) {
    alert('Error al guardar el egreso')
    return
  }

  descripcion.value = ''
  monto.value = ''
  categoria.value = ''

  loadData()
}

/* =========================
   REGISTRAR CAPITAL
========================= */
const saveCapital = async () => {
  if (!capitalMonto.value) {
    alert('Ingresa un monto de capital')
    return
  }

  const montoNum = Number(capitalMonto.value)
  if (montoNum <= 0) {
    alert('El capital debe ser mayor a cero')
    return
  }

  const { error } = await supabase.from('egresos').insert({
    user_id: user.value.id,
    descripcion: 'Capital inicial / inversión',
    monto: montoNum,
    categoria: 'Capital',
    tipo: 'capital'
  })

  if (error) {
    alert('Error al registrar capital')
    return
  }

  capitalMonto.value = ''
  loadData()
}

/* =========================
   CARGA DE EGRESOS
========================= */
const loadEgresos = async () => {
  if (!user.value) return

  const { data, error } = await supabase
    .from('egresos')
    .select('*')
    .eq('user_id', user.value.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error(error)
    return
  }

  egresos.value = data || []
}

/* =========================
   INIT
========================= */
onMounted(loadData)
</script>



<template>
  <div class="egresos-page">
    <h1>💸 Egresos del Capital</h1>

    <!-- RESUMEN -->
    <div class="summary">

      <div class="egreso">
        Egresos
        <strong>- S/ {{ totalEgresos.toFixed(2) }}</strong>
      </div>

      <div class="capital">
        Capital ventas
        <strong>
          S/  {{Number(capitalDisponible || 0).toFixed(2)}}
        </strong>
      </div>

    </div>

    <!-- ACCIONES -->
    <div class="card">
      <button @click="showCapitalModal = true">
        ➕ Agregar capital
      </button>

      <button @click="showEgresoModal = true">
        ➖ Agregar egreso
      </button>
    </div>


    <!-- MODAL CAPITAL -->
    <div v-if="showCapitalModal" class="modal-backdrop">
      <div class="modal">
        <h3>➕ Registrar capital</h3>

        <input
          v-model="capitalMonto"
          type="number"
          min="0"
          step="0.01"
          placeholder="Capital a ingresar"
        />

        <div class="modal-actions">
          <button @click="saveCapital(); showCapitalModal = false">
            Guardar
          </button>
          <button class="cancel" @click="showCapitalModal = false">
            Cancelar
          </button>
        </div>
      </div>
    </div>


    <!-- FORMULARIO -->
   <!-- MODAL EGRESO -->
    <div v-if="showEgresoModal" class="modal-backdrop">
      <div class="modal">
        <h3>➖ Registrar egreso</h3>

        <input
          v-model="descripcion"
          placeholder="Descripción del gasto"
        />
        <input
          v-model="monto"
          type="number"
          min="0"
          step="0.01"
          placeholder="Monto"
        />
        <input
          v-model="categoria"
          placeholder="Categoría (opcional)"
        />

        <div class="modal-actions">
          <button @click="saveEgreso(); showEgresoModal = false">
            Guardar
          </button>
          <button class="cancel" @click="showEgresoModal = false">
            Cancelar
          </button>
        </div>
      </div>
    </div>

    <!-- LISTA -->
    <div
        v-for="e in egresos"
        :key="e.id"
        class="egreso-item"
    >
      <div>
        <strong>{{ e.descripcion }}</strong>
        <small>{{ e.categoria || 'Sin categoría' }}</small>
      </div>

      <!-- SI ES CAPITAL -->
      <span
        v-if="
          (String(e?.categoria || '').toLowerCase() === 'capital') ||
          (String(e?.tipo || '').toLowerCase() === 'capital')
        "
        class="monto capital"
      >
        + S/ {{ Number(e?.monto || 0).toFixed(2) }}
      </span>

      <span v-else class="monto egreso">
        - S/ {{ Number(e?.monto || 0).toFixed(2) }}
      </span>
    </div>

  </div>
</template>

<style scoped>
.egresos-page {
  display: flex;
  flex-direction: column;
  max-width: 900px;
  margin: auto;
  padding: 20px;
  font-family: 'Segoe UI', sans-serif;
  color: #111827;
  height: 100vh; /* Ocupa toda la pantalla */
  box-sizing: border-box;
}

h1 {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 16px;
  color: #4f46e5;
}

/* ================================
   RESUMEN: CARDS COMPACTOS Y FLEXIBLES
================================ */
.summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); /* min más pequeño para compactar */
  gap: 12px;
  margin-bottom: 16px;
}

.summary div {
  background: #f9fafb;
  padding: 10px 14px; /* un poco más compacto */
  border-radius: 10px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.05);
  display: flex;
  flex-direction: column;
  align-items: flex-start; /* textos alineados a la izquierda */
  justify-content: center;
}

.summary strong {
  display: block;
  font-size: 16px; /* más pequeño que antes */
  margin-top: 2px;
}

.summary .egreso strong { color: #dc2626; }
.summary .capital strong { color: #16a34a; }
.summary div span {
  font-size: 14px;
}

/* ================================
   BOTONES DE ACCIONES COMPACTOS
================================ */
.card {
  background: #ffffff;
  padding: 12px 14px;        /* más compacto */
  border-radius: 12px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); /* se ajustan al espacio disponible */
  gap: 10px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  margin-bottom: 16px;
}

.card button {
  background: #4f46e5;
  color: white;
  border: none;
  padding: 10px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  width: 100%;              /* ocupa toda la columna que le toque */
  transition: all 0.2s ease;
}

.card button:hover {
  background: #4338ca;
}

/* ================================
   LISTA DE EGRESOS / MOVIMIENTOS
================================ */
.list-container {
  max-height: 34vh;          /* subimos la altura para ver más registros */
  overflow-y: auto;           /* scroll vertical si hay muchos registros */
  margin-top: 16px;
  padding-right: 4px;         /* evita que el scroll tape contenido */
}

/* Scroll más visible y moderno */
.list-container::-webkit-scrollbar {
  width: 6px;
}

.list-container::-webkit-scrollbar-thumb {
  background: rgba(79, 70, 229, 0.5);
  border-radius: 3px;
}

.list-container::-webkit-scrollbar-track {
  background: #f3f4f6;
  border-radius: 3px;
}

.egreso-item {
  background: #ffffff;
  padding: 12px 16px;
  border-radius: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}

.egreso-item small {
  display: block;
  color: #6b7280;
  font-size: 12px;
}

.monto {
  font-weight: 700;
  color: #dc2626;
}

.empty {
  text-align: center;
  padding: 30px;
  color: #6b7280;
}

/* ================================
   MODALES
================================ */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.modal {
  background: #ffffff;
  padding: 20px;
  border-radius: 14px;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.2);
}

.modal h3 {
  margin-bottom: 12px;
  font-weight: 700;
  color: #4f46e5;
}

.modal input {
  width: 100%;
  margin-bottom: 10px;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid #d1d5db;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.modal-actions .cancel {
  background: #e5e7eb;
  color: #111827;
}

.monto.egreso {
  font-weight: 700;
  color: #dc2626;
}

.monto.capital {
  font-weight: 700;
  color: #16a34a;
}


</style>
