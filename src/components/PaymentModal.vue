<script setup>
import { ref, watch, computed } from 'vue';

const props = defineProps({
  total: Number,
  loading: Boolean,
  method: String,
});
const emit = defineEmits(['update:method', 'confirm', 'close']);

// Ref local para poder usar v-model
const localMethod = ref(props.method);

// 🔹 DATOS CLIENTE (AGREGADO)
const customerName = ref('');
const customerPhone = ref('');
const customerComment = ref('');

// 🔹 Validación simple (AGREGADO)
const canConfirm = computed(() => {
  if (localMethod.value === 'por_cobrar') {
    return customerName.value.trim().length > 0 && !props.loading;
  }
  return !props.loading;
});

// Sincronizar si la prop cambia desde afuera
watch(
  () => props.method,
  (val) => {
    localMethod.value = val;
  }
);
</script>

<template>
  <div class="backdrop">
    <div class="modal">
      <h3 style="color: black;">Total a pagar</h3>
      <h2>S/ {{ total.toFixed(2) }}</h2>

      <select
        v-model="localMethod"
        @change="emit('update:method', localMethod)"
      >
        <option value="cash">Efectivo</option>
        <option value="card">Tarjeta</option>
        <option value="yape">Yape</option>
        <option value="plin">Plin</option>
        <option value="por_cobrar">Por cobrar</option>
      </select>

      <!-- 🔥 FORMULARIO SOLO SI ES POR COBRAR (AGREGADO) -->
      <div v-if="localMethod === 'por_cobrar'" class="credit-form">
        <input
          type="text"
          placeholder="Nombre del cliente *"
          v-model="customerName"
        />
        <input
          type="tel"
          placeholder="Teléfono (opcional)"
          v-model="customerPhone"
        />
        <textarea
          rows="2"
          placeholder="Comentario (opcional)"
          v-model="customerComment"
        ></textarea>
      </div>

      <div class="buttons">
        <button
          :disabled="!canConfirm"
          class="confirm"
          @click="emit('confirm', {
            customer_name: customerName.value,
            customer_phone: customerPhone.value,
            comment: customerComment.value
          })"
        >
          Confirmar
        </button>
        <button class="cancel" @click="emit('close')">Cancelar</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  justify-content: center;
  align-items: center;
}
.modal {
  background: white;
  padding: 20px;
  width: 320px;
  border-radius: 12px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.modal h2 {
  font-size: 24px;
  color: #111827;
}
select,
input,
textarea {
  padding: 8px;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  width: 100%;
}
.credit-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
textarea {
  resize: none;
}
.buttons {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}
button.confirm {
  flex: 1;
  background: #4f46e5;
  color: white;
  border: none;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
}
button.confirm:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}
button.cancel {
  flex: 1;
  background: #ef4444;
  color: white;
  border: none;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
}
</style>
