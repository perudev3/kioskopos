<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../lib/supabase'
import Swal from 'sweetalert2'

const egresos = ref([])
const descripcion = ref('')
const monto = ref('')
const categoria = ref('')
const loading = ref(false)
const user = ref(null)
const showEgresoModal = ref(false)

// Nuevas variables para calcular el dinero total
const totalVentas = ref(0)
const totalCapital = ref(0)
const gananciaNeta = ref(0)
const fromDate = ref('')
const toDate = ref('')

/* =========================
   CONVERSIÓN DE RANGO A UTC
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
   CARGAR VENTAS
========================= */
const loadVentas = async () => {
  if (!user.value) return

  try {
    let query = supabase
      .from('sales')
      .select('*, sale_items(*, product:product_id(price))')
      .eq('user_id', user.value.id)
      .neq('payment_method', 'por_cobrar')
      .neq('status', 'cancelled')

    // Aplicar filtros de fecha si existen
    if (fromDate.value && toDate.value) {
      const fromRange = getLocalDateRangeUTC(fromDate.value);
      const toRange = getLocalDateRangeUTC(toDate.value);

      query = query
        .gte('created_at', fromRange.from)
        .lte('created_at', toRange.to);
    }

    const { data, error } = await query

    if (error) throw error

    // Calcular total de ventas y ganancia neta
    let total = 0
    let ganancia = 0
    
    ;(data || []).forEach(sale => {
      sale.sale_items?.forEach(item => {
        const qty = Number(item.quantity || 0)
        const salePrice = Number(item.price || 0)
        const basePrice = Number(item.product?.price || 0)
        
        // Total de ventas
        total += salePrice * qty
        
        // Ganancia neta (diferencia entre precio de venta y precio base)
        const profit = (salePrice - basePrice) * qty
        ganancia += profit
      })
    })

    totalVentas.value = Math.round(total * 100) / 100
    gananciaNeta.value = Math.round(ganancia * 100) / 100
  } catch (error) {
    console.error('Error cargando ventas:', error)
  }
}

/* =========================
   CARGAR CAPITAL
========================= */
const loadCapital = async () => {
  if (!user.value) return

  try {
    let query = supabase
      .from('capital')
      .select('monto')
      .eq('user_id', user.value.id)
      .eq('tipo_movimiento', 'ingreso')

    // Aplicar filtros de fecha si existen
    if (fromDate.value && toDate.value) {
      const fromRange = getLocalDateRangeUTC(fromDate.value);
      const toRange = getLocalDateRangeUTC(toDate.value);

      query = query
        .gte('fecha_registro', fromRange.from)
        .lte('fecha_registro', toRange.to);
    }

    const { data, error } = await query

    if (error) throw error

    totalCapital.value = (data || []).reduce((sum, item) => {
      return sum + Number(item.monto || 0)
    }, 0)
  } catch (error) {
    console.error('Error cargando capital:', error)
  }
}

/* =========================
   CARGA DE EGRESOS
========================= */
const loadEgresos = async () => {
  if (!user.value) return

  loading.value = true

  try {
    let query = supabase
      .from('egresos')
      .select('*')
      .eq('user_id', user.value.id)
      .neq('categoria', 'Capital')
      .neq('tipo', 'capital')
      .order('created_at', { ascending: false })

    // Aplicar filtros de fecha si existen
    if (fromDate.value && toDate.value) {
      const fromRange = getLocalDateRangeUTC(fromDate.value);
      const toRange = getLocalDateRangeUTC(toDate.value);

      query = query
        .gte('created_at', fromRange.from)
        .lte('created_at', toRange.to);
    }

    const { data, error } = await query

    if (error) throw error

    egresos.value = data || []
  } catch (error) {
    console.error('Error cargando egresos:', error)
  } finally {
    loading.value = false
  }
}

/* =========================
   CARGAR TODO
========================= */
const loadAllData = async () => {
  await loadVentas()
  await loadCapital()
  await loadEgresos()
}

/* =========================
   RESETEAR FILTROS
========================= */
const resetFilters = () => {
  fromDate.value = ''
  toDate.value = ''
  loadAllData()
}

/* =========================
   TOTAL DE EGRESOS
========================= */
const totalEgresos = computed(() => {
  return egresos.value.reduce((sum, e) => sum + Number(e.monto || 0), 0)
})

/* =========================
   DINERO TOTAL DISPONIBLE
   (Ventas - Ganancia Neta) + Capital
========================= */
const dineroTotal = computed(() => {
  const ventasReales = totalVentas.value - gananciaNeta.value
  return ventasReales + totalCapital.value
})

/* =========================
   DINERO RESTANTE
========================= */
const dineroRestante = computed(() => {
  return dineroTotal.value - totalEgresos.value
})

/* =========================
   PORCENTAJE GASTADO
========================= */
const porcentajeGastado = computed(() => {
  if (dineroTotal.value === 0) return 0
  return Math.round((totalEgresos.value / dineroTotal.value) * 100)
})

/* =========================
   CATEGORÍAS ÚNICAS
========================= */
const categorias = computed(() => {
  const cats = new Set()
  egresos.value.forEach(e => {
    if (e.categoria) cats.add(e.categoria)
  })
  return Array.from(cats)
})

/* =========================
   REGISTRAR EGRESO
========================= */
const saveEgreso = async () => {
  if (!descripcion.value || !monto.value) {
    Swal.fire('Error', 'Descripción y monto son obligatorios', 'error')
    return
  }

  const montoNum = Number(monto.value)
  if (montoNum <= 0) {
    Swal.fire('Error', 'El monto debe ser mayor a cero', 'error')
    return
  }

  // Validar que no exceda el dinero disponible
  if (montoNum > dineroRestante.value) {
    Swal.fire('Error', `No puedes gastar más de lo disponible (S/ ${dineroRestante.value.toFixed(2)})`, 'error')
    return
  }

  const { error } = await supabase.from('egresos').insert({
    user_id: user.value.id,
    descripcion: descripcion.value,
    monto: montoNum,
    categoria: categoria.value || null,
    tipo: 'egreso'
  })

  if (error) {
    Swal.fire('Error', 'No se pudo guardar el egreso', 'error')
    return
  }

  descripcion.value = ''
  monto.value = ''
  categoria.value = ''
  showEgresoModal.value = false

  Swal.fire('Éxito', 'Egreso registrado correctamente', 'success')
  loadAllData()
}

/* =========================
   INIT
========================= */
onMounted(async () => {
  await loadUser()
  await loadAllData()
})
</script>

<template>
  <div class="page">
    <div class="container">
      <h2>Egresos</h2>
      <p class="subtitle">Gastos operativos del negocio</p>

      <!-- Resumen Financiero -->
      <div class="stats-grid">
        <div class="stat-box primary">
          <div class="stat-label">💰 Dinero Total</div>
          <div class="stat-value">S/ {{ dineroTotal.toFixed(2) }}</div>
          <div class="stat-detail">
            (Ventas: S/ {{ totalVentas.toFixed(2) }} - Ganancia: S/ {{ gananciaNeta.toFixed(2) }}) + Capital: S/ {{ totalCapital.toFixed(2) }}
          </div>
        </div>

        <div class="stat-box danger">
          <div class="stat-label">📉 Total Egresos</div>
          <div class="stat-value negative">- S/ {{ totalEgresos.toFixed(2) }}</div>
          <div class="stat-detail">{{ porcentajeGastado }}% del total</div>
        </div>
        
        <div class="stat-box" :class="dineroRestante >= 0 ? 'success' : 'warning'">
          <div class="stat-label">💵 Dinero Disponible</div>
          <div class="stat-value" :class="dineroRestante >= 0 ? 'positive' : 'negative'">
            S/ {{ dineroRestante.toFixed(2) }}
          </div>
          <div class="stat-detail">
            {{ dineroRestante >= 0 ? 'Saldo positivo' : '⚠️ Saldo negativo' }}
          </div>
        </div>
      </div>

      <!-- Botón agregar -->
      <div class="action-card">
        <button @click="showEgresoModal = true" class="add-btn">
          ➕ Agregar Egreso
        </button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="empty">
        Cargando egresos...
      </div>

      <!-- Lista de egresos -->
      <div v-else>
        <div v-if="egresos.length === 0" class="empty">
          No hay egresos registrados
        </div>

        <div v-else class="records-scroll">
          <div v-for="egreso in egresos" :key="egreso.id" class="card">
            <div class="info">
              <div class="total negative">- S/ {{ Number(egreso.monto).toFixed(2) }}</div>
              <div class="description">{{ egreso.descripcion }}</div>
              <div class="category-date">
                <span class="category">{{ egreso.categoria || 'Sin categoría' }}</span>
                <span class="date">{{ new Date(egreso.created_at).toLocaleDateString('es-ES') }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- MODAL EGRESO -->
  <div v-if="showEgresoModal" class="modal-backdrop" @click.self="showEgresoModal = false">
    <div class="modal">
      <h3 class="modal-title">➖ Registrar Egreso</h3>

      <div class="available-balance">
        <span>💵 Disponible:</span>
        <strong>S/ {{ dineroRestante.toFixed(2) }}</strong>
      </div>

      <div class="form-group">
        <label>Descripción</label>
        <input
          v-model="descripcion"
          placeholder="Ej: Pago de luz, Compra de insumos"
          class="form-input"
        />
      </div>

      <div class="form-group">
        <label>Monto</label>
        <input
          v-model="monto"
          type="number"
          min="0"
          step="0.01"
          :max="dineroRestante"
          placeholder="0.00"
          class="form-input"
        />
        <small class="input-hint">Máximo: S/ {{ dineroRestante.toFixed(2) }}</small>
      </div>

      <div class="form-group">
        <label>Categoría (opcional)</label>
        <input
          v-model="categoria"
          placeholder="Ej: Servicios, Mantenimiento"
          class="form-input"
          list="categorias-list"
        />
        <datalist id="categorias-list">
          <option v-for="cat in categorias" :key="cat" :value="cat">{{ cat }}</option>
        </datalist>
      </div>

      <div class="modal-actions">
        <button @click="saveEgreso" class="confirm-btn">
          Guardar
        </button>
        <button @click="showEgresoModal = false" class="cancel-btn">
          Cancelar
        </button>
      </div>
    </div>
  </div>
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

/* FILTROS */
.filters {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.filters input[type='date'] {
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid #cbd5e1;
  font-size: 14px;
  outline: none;
  transition: all 0.2s ease;
}

.filters input[type='date']:focus {
  border-color: #0b3c5d;
  box-shadow: 0 0 0 2px rgba(11,60,93,.15);
}

.filter-btn, .clear-btn {
  padding: 10px 18px;
  border-radius: 12px;
  border: none;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.filter-btn {
  background: #0b3c5d;
  color: white;
}

.filter-btn:hover {
  background: #1fa2c1;
}

.clear-btn {
  background: #f1f5f9;
  color: #475569;
}

.clear-btn:hover {
  background: #e2e8f0;
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
  margin-bottom: 20px;
}

.stat-box {
  background: white;
  padding: 18px;
  border-radius: 18px;
  box-shadow: 0 10px 25px rgba(0,0,0,.08);
  border-left: 4px solid #64748b;
}

.stat-box.primary {
  border-left-color: #0b3c5d;
}

.stat-box.danger {
  border-left-color: #ef4444;
}

.stat-box.success {
  border-left-color: #22c55e;
}

.stat-box.warning {
  border-left-color: #f59e0b;
}

.stat-label {
  font-size: 13px;
  color: #64748b;
  margin-bottom: 6px;
  font-weight: 600;
}

.stat-value {
  font-size: 24px;
  font-weight: 800;
  color: #111827;
  margin-bottom: 4px;
}

.stat-value.negative {
  color: #ef4444;
}

.stat-value.positive {
  color: #22c55e;
}

.stat-detail {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 500;
}

/* Action Card */
.action-card {
  background: white;
  padding: 18px;
  border-radius: 18px;
  margin-bottom: 20px;
  box-shadow: 0 10px 25px rgba(0,0,0,.08);
}

.add-btn {
  width: 100%;
  background: #0b3c5d;
  color: white;
  border: none;
  padding: 12px 16px;
  border-radius: 14px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all .2s ease;
}

.add-btn:hover {
  background: #1fa2c1;
  transform: translateY(-1px);
}

/* Empty State */
.empty {
  background: white;
  padding: 24px;
  border-radius: 16px;
  text-align: center;
  color: #475569;
  box-shadow: 0 8px 20px rgba(0,0,0,.06);
}

/* Records List - CON SCROLL */
.records-scroll {
  max-height: 520px;
  overflow-y: auto;
  padding-right: 6px;
}

.records-scroll::-webkit-scrollbar {
  width: 8px;
}

.records-scroll::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 10px;
}

.records-scroll::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
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
  flex: 1;
}

.total {
  font-size: 20px;
  font-weight: 800;
  color: #111827;
}

.total.negative {
  color: #ef4444;
}

.description {
  font-size: 14px;
  color: #334155;
  font-weight: 500;
}

.category-date {
  display: flex;
  gap: 12px;
  align-items: center;
}

.category {
  font-size: 12px;
  color: #64748b;
  background: #f1f5f9;
  padding: 2px 8px;
  border-radius: 6px;
}

.date {
  font-size: 13px;
  color: #94a3b8;
}

/* Modal */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  backdrop-filter: blur(2px);
}

.modal {
  background: white;
  padding: 24px;
  border-radius: 20px;
  width: 100%;
  max-width: 480px;
  box-shadow: 0 20px 40px rgba(0,0,0,0.2);
}

.modal-title {
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 16px;
}

.available-balance {
  background: #f0f9ff;
  border: 2px solid #0ea5e9;
  padding: 12px;
  border-radius: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  font-size: 15px;
}

.available-balance strong {
  color: #0b3c5d;
  font-size: 18px;
  font-weight: 700;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 6px;
}

.form-input {
  width: 100%;
  padding: 12px 16px;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  font-size: 14px;
  outline: none;
  transition: all .2s ease;
  font-family: inherit;
}

.form-input:focus {
  border-color: #0b3c5d;
  box-shadow: 0 0 0 2px rgba(11,60,93,.15);
}

.input-hint {
  display: block;
  font-size: 12px;
  color: #64748b;
  margin-top: 4px;
}

.modal-actions {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

.confirm-btn {
  flex: 1;
  background: #0b3c5d;
  color: white;
  border: none;
  padding: 12px 16px;
  border-radius: 14px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all .2s ease;
}

.confirm-btn:hover {
  background: #1fa2c1;
}

.cancel-btn {
  flex: 1;
  background: #f1f5f9;
  color: #475569;
  border: none;
  padding: 12px 16px;
  border-radius: 14px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all .2s ease;
}

.cancel-btn:hover {
  background: #e2e8f0;
}

/* Responsive */
@media (max-width: 640px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }

  .filters {
    flex-direction: column;
  }

  .card {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .modal {
    margin: 20px;
    max-width: none;
  }
}
</style>