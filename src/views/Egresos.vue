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
   CARGA DE EGRESOS
========================= */
const loadEgresos = async () => {
  if (!user.value) return

  loading.value = true

  const { data, error } = await supabase
    .from('egresos')
    .select('*')
    .eq('user_id', user.value.id)
    .neq('categoria', 'Capital')
    .neq('tipo', 'capital')
    .order('created_at', { ascending: false })

  if (error) {
    console.error(error)
    loading.value = false
    return
  }

  egresos.value = data || []
  loading.value = false
}

/* =========================
   TOTAL DE EGRESOS
========================= */
const totalEgresos = computed(() => {
  return egresos.value.reduce((sum, e) => sum + Number(e.monto || 0), 0)
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
   EGRESOS POR CATEGORÍA
========================= */
const egresosPorCategoria = computed(() => {
  const grupos = {}
  
  egresos.value.forEach(e => {
    const cat = e.categoria || 'Sin categoría'
    if (!grupos[cat]) {
      grupos[cat] = { total: 0, items: [] }
    }
    grupos[cat].total += Number(e.monto || 0)
    grupos[cat].items.push(e)
  })
  
  return grupos
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
  loadEgresos()
}

/* =========================
   INIT
========================= */
onMounted(async () => {
  await loadUser()
  await loadEgresos()
})
</script>

<template>
  <div class="page">
    <div class="container">
      <h2>Egresos</h2>
      <p class="subtitle">Gastos operativos del negocio</p>

      <!-- Resumen -->
      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-label">Total de Egresos</div>
          <div class="stat-value negative">S/ {{ totalEgresos.toFixed(2) }}</div>
        </div>
        
        <div class="stat-box">
          <div class="stat-label">Registros</div>
          <div class="stat-value">{{ egresos.length }}</div>
        </div>

        <div class="stat-box">
          <div class="stat-label">Categorías</div>
          <div class="stat-value">{{ Object.keys(egresosPorCategoria).length }}</div>
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
          placeholder="0.00"
          class="form-input"
        />
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

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 14px;
  margin-bottom: 20px;
}

.stat-box {
  background: white;
  padding: 18px;
  border-radius: 18px;
  box-shadow: 0 10px 25px rgba(0,0,0,.08);
}

.stat-label {
  font-size: 13px;
  color: #64748b;
  margin-bottom: 6px;
}

.stat-value {
  font-size: 24px;
  font-weight: 800;
  color: #111827;
}

.stat-value.negative {
  color: #ef4444;
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

/* Records List */
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

.delete-btn {
  background: #ef4444;
  color: white;
  border: none;
  padding: 10px 16px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all .2s ease;
}

.delete-btn:hover {
  background: #dc2626;
  transform: translateY(-1px);
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
  margin-bottom: 20px;
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

  .card {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .delete-btn {
    width: 100%;
  }

  .modal {
    margin: 20px;
    max-width: none;
  }
}
</style>