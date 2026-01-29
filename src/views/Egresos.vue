<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../lib/supabase'

/* =========================
   ESTADO
========================= */
const egresos = ref([])
const ventas = ref([])

const descripcion = ref('')
const monto = ref('')
const categoria = ref('')

const loading = ref(false)
const user = ref(null)

/* =========================
   CARGAR DATOS
========================= */
const loadData = async () => {
  loading.value = true

  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth?.user) {
    loading.value = false
    return
  }

  user.value = auth.user

  /* ---- VENTAS ---- */
  const { data: ventasData, error: ventasError } = await supabase
    .from('sales')
    .select('total')
    .eq('user_id', user.value.id)

  if (!ventasError) {
    ventas.value = ventasData || []
  }

  /* ---- EGRESOS ---- */
  const { data: egresosData, error: egresosError } = await supabase
    .from('egresos')
    .select('*')
    .eq('user_id', user.value.id)
    .order('created_at', { ascending: false })

  if (!egresosError) {
    egresos.value = egresosData || []
  }

  loading.value = false
}

onMounted(loadData)

/* =========================
   CÁLCULOS
========================= */
const totalVentas = computed(() =>
  ventas.value.reduce((sum, v) => sum + Number(v.total || 0), 0)
)

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
   CAPITAL
========================= */
const capitalMonto = ref('')

const totalCapital = computed(() =>
  egresos.value
    .filter(e => e.tipo === 'capital')
    .reduce((sum, e) => sum + Number(e.monto || 0), 0)
)

/* =========================
   AJUSTE DE CÁLCULOS
========================= */
const totalEgresos = computed(() =>
  egresos.value
    .filter(e => e.tipo === 'egreso')
    .reduce((sum, e) => sum + Number(e.monto || 0), 0)
)

const capitalDisponible = computed(() =>
  totalCapital.value + totalVentas.value - totalEgresos.value
)

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
   MODALES
========================= */
const showEgresoModal = ref(false)
const showCapitalModal = ref(false)

</script>

<template>
  <div class="egresos-page">
    <h1>💸 Egresos del Capital</h1>

    <!-- RESUMEN -->
    <div class="summary">
      <div>
        Ventas
        <strong>S/ {{ totalVentas.toFixed(2) }}</strong>
      </div>

      <div class="egreso">
        Egresos
        <strong>- S/ {{ totalEgresos.toFixed(2) }}</strong>
      </div>

      <div class="capital">
        Capital disponible
        <strong>S/ {{ capitalDisponible.toFixed(2) }}</strong>
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
    <div class="list-container">
      <div v-if="egresos.length === 0" class="empty">
        No hay egresos registrados
      </div>

      <div
        v-for="e in egresos"
        :key="e.id"
        class="egreso-item"
      >
        <div>
          <strong>{{ e.descripcion }}</strong>
          <small>{{ e.categoria || 'Sin categoría' }}</small>
        </div>
        <span class="monto">
          - S/ {{ Number(e.monto).toFixed(2) }}
        </span>
      </div>
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

</style>
