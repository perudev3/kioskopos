<script setup>
import { ref, watch, computed } from 'vue';

const props = defineProps({
  total: Number,
  loading: Boolean,
  method: String,

  /* ====== AGREGADO ====== */
  paymentQR: Object
});
const emit = defineEmits(['update:method', 'confirm', 'close']);

// Ref local para poder usar v-model
const localMethod = ref(props.method);

// 🔹 DATOS CLIENTE
const customerName = ref('');
const customerPhone = ref('');
const customerComment = ref('');

// 🔹 Validación simple
const canConfirm = computed(() => {
  if (localMethod.value === 'por_cobrar') {
    return customerName.value.trim().length > 0 && !props.loading;
  }
  return !props.loading;
});

// 🔹 Sincronizar si la prop cambia desde afuera
watch(() => props.method, val => {
  localMethod.value = val;
});

// 🔹 Emitir confirm solo si puede
const handleConfirm = () => {
  if (!canConfirm.value) return;
  emit('confirm', {
    customer_name: customerName.value.trim(),
    customer_phone: customerPhone.value.trim() || null,
    comment: customerComment.value.trim() || null
  });
};
</script>

<template>
  <div class="backdrop">
    <div class="modal">
      <h3 style="color: black;">Total a pagar</h3>
      <h2>S/ {{ total.toFixed(2) }}</h2>

      <select v-model="localMethod" @change="emit('update:method', localMethod)">
        <option value="cash">Efectivo</option>
        <option value="yape">Yape</option>
        <option value="plin">Plin</option>
        <option value="por_cobrar">Por cobrar</option>
      </select>

      <!-- ====== AGREGADO: QR YAPE / PLIN ====== -->
      <div
        v-if="(localMethod === 'yape' || localMethod === 'plin') && paymentQR"
        class="qr-box"
      >
        <p class="qr-title">
          Escanea con {{ localMethod.toUpperCase() }}
        </p>

        <img
          :src="paymentQR.qr_url"
          alt="QR Pago"
          class="qr-img"
        />

        <p class="qr-name">{{ paymentQR.display_name }}</p>
        <p class="qr-phone">{{ paymentQR.phone_number }}</p>
      </div>

      <div v-if="localMethod !== 'por_cobrar'" class="optional-customer-name">
        <input
          type="text"
          placeholder="Nombre del cliente (opcional)"
          v-model="customerName"
        />
      </div>

      <!-- FORMULARIO SOLO SI ES POR COBRAR -->
      <div v-if="localMethod === 'por_cobrar'" class="credit-form">
        <input type="text" placeholder="Nombre del cliente *" v-model="customerName" />
        <input type="tel" placeholder="Teléfono (opcional)" v-model="customerPhone" />
        <textarea rows="2" placeholder="Comentario (opcional)" v-model="customerComment"></textarea>
      </div>

      <div class="buttons">
        <button
          :disabled="!canConfirm"
          class="confirm"
          @click="handleConfirm"
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
  margin-top: 60px;
}
.modal {
  background: white;
  padding: 20px;
  width: 360px;           /* 🔑 antes 320 */
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

/* ====== AGREGADO: ESTILO QR ====== */
.qr-box {
  margin-top: 10px;
  padding: 14px;
  border-radius: 12px;
  border: 2px dashed #6366f1;
  background: #eef2ff;
}

.qr-title {
  font-weight: 700;
  margin-bottom: 6px;
  color: black;
}
.qr-img {
  width: 100%;
  max-width: 260px;       /* 🔑 tamaño real de escaneo */
  height: auto;
  margin: 12px auto;
}

.qr-name {
  font-weight: 600;
  color: black;
}
.qr-phone {
  font-size: 14px;
  color: #555;
}

@media (max-width: 480px) {
  .modal {
    width: 92%;
  }

  .qr-img {
    max-width: 280px;
  }
}


/* 🔑 Permitir scroll dentro del modal */
.modal {
  max-height: 90vh;        /* no se sale de la pantalla */
  overflow-y: auto;        /* habilita scroll vertical */
}

/* Scroll suave en móviles */
.modal {
  -webkit-overflow-scrolling: touch;
}

.optional-customer-name input {
  margin-top: 8px;
  margin-bottom: 12px;
}

</style>
