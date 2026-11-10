<script>
import api from '../lib/axios';
import Swal from 'sweetalert2';

export default {
  name: 'CapitalComponent',
  data() {
    return {
      formData: {
        monto: null,
        descripcion: ''
      },
      movimientos: [],
      isLoading: false,
      loadingMovimientos: false,
      showModal: false,
      // Datos financieros
      totalVentas: 0,
      gananciaNeta: 0,
      totalEgresos: 0,
      fromDate: '',
      toDate: ''
    }
  },
  computed: {
    capitalRegistrado() {
      return this.movimientos.reduce((total, m) => {
        return total + parseFloat(m.monto || 0);
      }, 0);
    },
    gananciaVenta() {
      return this.totalVentas - this.gananciaNeta;
    },
    capitalTotal() {
      return this.capitalRegistrado + this.gananciaVenta;
    },
    capitalDisponible() {
      return this.capitalTotal - this.totalEgresos;
    },
    porcentajeGastado() {
      if (this.capitalTotal === 0) return 0;
      return Math.round((this.totalEgresos / this.capitalTotal) * 100);
    }
  },
  async mounted() {
    await this.loadAllData();
  },
  methods: {
    async loadAllData() {
      this.loadingMovimientos = true;
      try {
        const response = await api.get('/capital', {
          params: {
            from: this.fromDate || null,
            to: this.toDate || null
          }
        });

        const data = response.data;
        this.totalVentas = data.totalVentas || 0;
        this.gananciaNeta = data.gananciaNeta || 0;
        this.totalEgresos = data.totalEgresos || 0;
        this.movimientos = data.movimientos || [];

      } catch (error) {
        console.error('Error al cargar datos de capital:', error);
        Swal.fire('Error', 'No se pudieron cargar los registros', 'error');
      } finally {
        this.loadingMovimientos = false;
      }
    },

    resetFilters() {
      this.fromDate = '';
      this.toDate = '';
      this.loadAllData();
    },

    async submitCapital() {
      this.isLoading = true;
      try {
        await api.post('/capital', {
          monto: this.formData.monto,
          descripcion: this.formData.descripcion
        });

        await this.loadAllData();
        this.resetForm();
        this.showModal = false;
        
        Swal.fire('Éxito', 'Capital registrado correctamente', 'success');
      } catch (error) {
        console.error('Error al registrar capital:', error);
        Swal.fire('Error', error.response?.data?.message || 'No se pudo registrar el capital', 'error');
      } finally {
        this.isLoading = false;
      }
    },

    resetForm() {
      this.formData = {
        monto: null,
        descripcion: ''
      };
    },

    formatMoney(amount) {
      return parseFloat(amount || 0).toFixed(2);
    },

    formatDate(dateString) {
      return new Date(dateString).toLocaleString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  }
}
</script>

<template>
  <div class="page">
    <div class="container">
      <h2>Capital</h2>
      <p class="subtitle">Gestión de capital del negocio</p>

      <!-- Resumen -->
      <div class="stats-grid">
        <div class="stat-box" :class="capitalDisponible >= 0 ? 'success' : 'warning'">
          <div class="stat-label">💵 Capital Disponible</div>
          <div class="stat-value" :class="capitalDisponible >= 0 ? 'positive' : 'negative'">
            S/ {{ formatMoney(capitalDisponible) }}
          </div>
          <div class="stat-detail">
            {{ capitalDisponible >= 0 ? 'Saldo positivo' : '⚠️ Saldo negativo' }}
          </div>
        </div>
      </div>

      <!-- Botón agregar -->
      <div class="action-card">
        <button @click="showModal = true" class="add-btn">
          ➕ Agregar Capital
        </button>
      </div>

      <!-- Loading -->
      <div v-if="loadingMovimientos" class="empty">
        Cargando registros...
      </div>

      <!-- Lista de registros -->
      <div v-else>
        <div v-if="movimientos.length === 0" class="empty">
          No hay registros de capital
        </div>

        <div v-else class="records-scroll">
          <div v-for="movimiento in movimientos" :key="movimiento.id" class="card">
            <div class="info">
              <div class="total">S/ {{ formatMoney(movimiento.monto) }}</div>
              <div class="description">{{ movimiento.descripcion || 'Sin descripción' }}</div>
              <div class="date">{{ formatDate(movimiento.fecha_registro) }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- MODAL CAPITAL -->
  <div v-if="showModal" class="modal-backdrop" @click.self="showModal = false">
    <div class="modal">
      <h3 class="modal-title">➕ Registrar Capital</h3>

      <form @submit.prevent="submitCapital">
        <div class="form-group">
          <label for="monto">Monto</label>
          <input 
            type="number" 
            id="monto" 
            v-model.number="formData.monto" 
            step="0.01" 
            min="0.01"
            placeholder="0.00"
            required
            class="form-input"
          />
        </div>

        <div class="form-group">
          <label for="descripcion">Descripción</label>
          <textarea 
            id="descripcion" 
            v-model="formData.descripcion" 
            rows="3"
            placeholder="Describe el origen o destino del capital..."
            required
            class="form-input"
          ></textarea>
        </div>

        <div class="modal-actions">
          <button type="submit" class="confirm-btn" :disabled="isLoading">
            <span v-if="!isLoading">Guardar</span>
            <span v-else>Guardando...</span>
          </button>
          <button type="button" @click="showModal = false; resetForm()" class="cancel-btn">
            Cancelar
          </button>
        </div>
      </form>
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

.stat-box.success { border-left-color: #22c55e; }
.stat-box.warning { border-left-color: #f59e0b; }

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

.stat-value.negative { color: #ef4444; }
.stat-value.positive { color: #22c55e; }

.stat-detail {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 500;
}

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

.empty {
  background: white;
  padding: 24px;
  border-radius: 16px;
  text-align: center;
  color: #475569;
  box-shadow: 0 8px 20px rgba(0,0,0,.06);
}

.records-scroll {
  max-height: 520px;
  overflow-y: auto;
  padding-right: 6px;
}

.records-scroll::-webkit-scrollbar { width: 8px; }
.records-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
.records-scroll::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

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

.description {
  font-size: 14px;
  color: #334155;
}

.date {
  font-size: 13px;
  color: #64748b;
}

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

textarea.form-input {
  resize: vertical;
  min-height: 80px;
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

.confirm-btn:hover:not(:disabled) { background: #1fa2c1; }
.confirm-btn:disabled { opacity: 0.6; cursor: not-allowed; }

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

.cancel-btn:hover { background: #e2e8f0; }

@media (max-width: 640px) {
  .stats-grid { grid-template-columns: 1fr; }
  .card { flex-direction: column; align-items: flex-start; gap: 12px; }
  .modal { margin: 20px; max-width: none; }
}
</style>