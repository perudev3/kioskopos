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
          <td>S/ {{ s.total ?? 0 }}</td>
          <td>{{ s.payment_method }}</td>
          <td>{{ s.status || 'activo' }}</td>
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
.table {
  width: 100%;
  border-collapse: collapse;
}
th,
td {
  border-bottom: 1px solid #ddd;
  padding: 8px;
}
</style>
