<script setup>
defineProps({
  cart: Array,
  total: Number,
})
defineEmits(['remove', 'pay', 'update-quantity'])
</script>

<template>
  <div class="cart">
    <h3>Carrito</h3>

    <div class="cart-items">
      <div v-for="p in cart" :key="p.id" class="item">

        <div class="info">
          <span>{{ p.name }}</span>

          <div class="qty-control">
            <button
              class="qty-btn"
              @click="$emit('update-quantity', p.id, p.quantity - 1)"
            >
              −
            </button>

            <label>{{ p.quantity }}</label>

            <button
              class="qty-btn"
              @click="$emit('update-quantity', p.id, p.quantity + 1)"
            >
              +
            </button>
          </div>
        </div>

        <span class="price">
          S/ {{ (p.price * p.quantity).toFixed(2) }}
        </span>

        <button class="remove" @click="$emit('remove', p.id)">✖</button>
      </div>
    </div>

    <hr />
    <strong>Total: S/ {{ total.toFixed(2) }}</strong>

    <button class="pay" :disabled="cart.length === 0" @click="$emit('pay')">
      COBRAR
    </button>
  </div>
</template>


<style scoped>
.cart {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 12px;
  color: black;
}

.cart-items {
  overflow-y: auto;
  flex-grow: 1;
  margin-bottom: 12px;
}

.item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  gap: 8px;
}

.info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.name {
  font-weight: 600;
}

/* CONTROL DE CANTIDAD */
.qty-control {
  display: flex;
  align-items: center;
  gap: 8px;
}

.qty-btn {
  width: 41px;
    height: 36px;
    border-radius: 20px;
    border: none;
    background: #2563eb;
    color: white;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
}

.qty-btn:disabled {
  background: #c7d2fe;
  cursor: not-allowed;
}

.qty-value {
  min-width: 24px;
  text-align: center;
  font-weight: 700;
  font-size: 15px;
}

.subtotal {
  font-weight: 600;
}

.remove {
  background: transparent;
  border: none;
  font-size: 16px;
  cursor: pointer;
}

.pay {
  width: 100%;
  margin-top: 10px;
  padding: 10px;
  background: #4f46e5;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 700;
}

.pay:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

.total {
  margin-top: 6px;
  font-size: 16px;
}
</style>
