<script setup>
defineProps({
  sales: Array,
  loading: Boolean,
});
defineEmits(['view', 'cancel']); // ✅ emitimos view y cancel
</script>

<template>
  <div>
    <div v-if="loading">Cargando ventas...</div>

    <table v-else class="table">
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Total</th>
          <th>Pago</th>
          <th>Estado</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in sales" :key="s.id">
          <td>{{ s.created_at ? new Date(s.created_at).toLocaleString() : 'Sin fecha' }}</td>
          <td class="money">S/ {{ s.total ?? 0 }}</td>
          <td>{{ s.payment_method === 'cash' ? 'Efectivo' : s.payment_method }}</td>
          <td>{{ s.status === 'active' ? 'Activo' : 'Cancelado' }}</td>
          <td style="display:flex; gap:4px;">
            <button @click="$emit('view', s)">Ver</button>
            <button 
              v-if="s.status !== 'cancelled'"
              @click="$emit('cancel', s.id)" 
              style="background:#ef4444;color:white;padding:4px 8px;border:none;border-radius:6px;cursor:pointer"
            >
              Cancelar
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="sales.length === 0">No hay ventas</div>
  </div>
</template>

<style scoped>

th,
td {
  border-bottom: 1px solid #ddd;
  padding: 8px;
}
.money {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
table {
  width: 100%;
  border-collapse: collapse;
}

thead th {
    position: sticky;
    top: -13px;
    background: #f8fafc;
    z-index: 10;
    text-align: left;
    padding: 10px;
    font-weight: 700;
    border-bottom: 2px solid #e5e7eb;
}

</style>
