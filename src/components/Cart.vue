<script setup>
import { computed } from 'vue'
import Swal from 'sweetalert2'

const props = defineProps({
  cart: Array,
  total: Number,
  loading: Boolean
})

const emit = defineEmits(['remove', 'pay', 'update-quantity'])

const handleIncreaseQuantity = (product) => {
  if (product.quantity >= product.stock) {
    Swal.fire({
      icon: 'warning',
      title: 'Stock insuficiente',
      text: `Solo hay ${product.stock} unidades disponibles de ${product.name}`,
      confirmButtonColor: '#0b3c5d'
    })
    return
  }
  emit('update-quantity', product.id, product.quantity + 1)
}

const handleDecreaseQuantity = (product) => {
  emit('update-quantity', product.id, product.quantity - 1)
}

const isAtMaxStock = (product) => {
  return product.quantity >= product.stock
}

const cartCount = computed(() => {
  return props.cart.reduce((sum, p) => sum + p.quantity, 0)
})
</script>

<template>
  <div class="cart-container">
    <!-- Header -->
    <div class="cart-header">
      <div class="header-content">
        <h3>Carrito de Compras</h3>
        <div class="cart-badge" v-if="cart.length > 0">
          {{ cartCount }} {{ cartCount === 1 ? 'producto' : 'productos' }}
        </div>
      </div>
    </div>

    <!-- Items -->
    <div class="cart-items" v-if="cart.length > 0">
      <div v-for="p in cart" :key="`${p.id}-${p.weight || 'normal'}`" class="cart-item">
        <!-- Imagen del producto -->
        <div class="item-image">
          <img v-if="p.image_url" :src="p.image_url" :alt="p.name" />
          <div v-else class="image-placeholder">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
          </div>
        </div>

        <!-- Info del producto -->
        <div class="item-content">
          <div class="item-header">
            <h4 class="item-name">{{ p.displayName || p.name }}</h4>
            <button class="remove-btn" @click="$emit('remove', p.id)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>

          <!-- Badge de peso para productos WEIGHT -->
          <div v-if="p.is_weight_product" class="weight-badge-container">
            <span class="weight-badge">{{ p.weight }}kg</span>
            <span class="base-price-info">Precio base: S/ {{ Number(p.original_price).toFixed(2) }}/kg</span>
          </div>

          <div class="item-details">
            <span class="unit-price">
              S/ {{ Number(p.sale_price).toFixed(2) }} c/u
              <span v-if="p.is_weight_product" class="weight-unit">({{ p.weight }}kg)</span>
            </span>
            <span class="stock-info" :class="{ warning: p.quantity >= p.stock }">
              Stock: {{ p.stock }}
            </span>
          </div>

          <!-- Controles de cantidad -->
          <div class="quantity-section">
            <div class="qty-controls">
              <button
                class="qty-btn decrease"
                @click="handleDecreaseQuantity(p)"
                :disabled="loading"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>

              <div class="qty-display">
                <span class="qty-value">{{ p.quantity }}</span>
              </div>

              <button
                class="qty-btn increase"
                @click="handleIncreaseQuantity(p)"
                :disabled="isAtMaxStock(p) || loading"
                :class="{ 'at-max': isAtMaxStock(p) }"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
            </div>

            <div class="item-subtotal">
              S/ {{ (Number(p.sale_price) * p.quantity).toFixed(2) }}
            </div>
          </div>

          <!-- Warning de stock -->
          <div v-if="isAtMaxStock(p)" class="stock-warning">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            Stock máximo alcanzado
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="empty-cart">
      <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="9" cy="21" r="1"></circle>
        <circle cx="20" cy="21" r="1"></circle>
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
      </svg>
      <p>Tu carrito está vacío</p>
      <span>Agrega productos para comenzar</span>
    </div>

    <!-- Footer -->
    <div class="cart-footer">
      <div class="total-section">
        <div class="total-row">
          <span class="total-label">Subtotal</span>
          <span class="total-value">S/ {{ total.toFixed(2) }}</span>
        </div>
        <div class="total-row main">
          <span class="total-label">Total a pagar</span>
          <span class="total-amount">S/ {{ total.toFixed(2) }}</span>
        </div>
      </div>

      <button
        class="pay-btn"
        :disabled="cart.length === 0 || loading"
        @click="$emit('pay')"
      >
        <svg v-if="!loading" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
          <line x1="1" y1="10" x2="23" y2="10"></line>
        </svg>
        <div v-if="loading" class="spinner"></div>
        <span v-if="loading">Procesando...</span>
        <span v-else>Proceder al pago</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.cart-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: white;
  border-radius: 20px;
  overflow: hidden;
}

/* Header */
.cart-header {
  padding: 20px 24px;
  border-bottom: 2px solid #f1f5f9;
  background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.cart-header h3 {
  font-size: 22px;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
}

.cart-badge {
  background: #0b3c5d;
  color: white;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 700;
}

/* Items Container */
.cart-items {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cart-items::-webkit-scrollbar {
  width: 6px;
}

.cart-items::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 10px;
}

.cart-items::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

/* Cart Item */
.cart-item {
  display: flex;
  gap: 14px;
  background: #f8fafc;
  padding: 16px;
  border-radius: 16px;
  border: 2px solid #e2e8f0;
  transition: all 0.2s ease;
}

.cart-item:hover {
  border-color: #cbd5e1;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

/* Item Image */
.item-image {
  width: 80px;
  height: 80px;
  border-radius: 12px;
  overflow: hidden;
  background: white;
  flex-shrink: 0;
  border: 2px solid #e2e8f0;
}

.item-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #cbd5e1;
  background: #f1f5f9;
}

/* Item Content */
.item-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.item-name {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
  line-height: 1.4;
  flex: 1;
}

.remove-btn {
  width: 60px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fee2e2;
  color: #dc2626;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.remove-btn:hover {
  background: #fecaca;
  transform: scale(1.05);
}

/* Weight Badge Container */
.weight-badge-container {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.weight-badge {
  display: inline-flex;
  align-items: center;
  background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
  color: #1e40af;
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  border: 1px solid #93c5fd;
}

.base-price-info {
  font-size: 11px;
  color: #64748b;
  font-weight: 600;
  background: white;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
}

/* Item Details */
.item-details {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.unit-price {
  font-size: 13px;
  color: #64748b;
  font-weight: 600;
}

.weight-unit {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 700;
  background: #f1f5f9;
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: 4px;
}

.stock-info {
  font-size: 12px;
  color: #64748b;
  background: white;
  padding: 4px 10px;
  border-radius: 6px;
  font-weight: 600;
}

.stock-info.warning {
  background: #fef3c7;
  color: #d97706;
}

/* Quantity Section */
.quantity-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.qty-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  background: white;
  padding: 6px;
  border-radius: 12px;
  border: 2px solid #e2e8f0;
}

.qty-btn {
  width: 55px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0b3c5d;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.qty-btn:hover:not(:disabled) {
  background: #1e5a7d;
  transform: scale(1.05);
}

.qty-btn:disabled {
  background: #e2e8f0;
  color: #94a3b8;
  cursor: not-allowed;
}

.qty-btn.at-max {
  background: #fbbf24;
  cursor: not-allowed;
}

.qty-display {
  min-width: 40px;
  text-align: center;
}

.qty-value {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.item-subtotal {
  font-size: 18px;
  font-weight: 800;
  color: #0b3c5d;
}

/* Stock Warning */
.stock-warning {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #fef3c7;
  color: #d97706;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
}

.stock-warning svg {
  flex-shrink: 0;
}

/* Empty Cart */
.empty-cart {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: #94a3b8;
}

.empty-cart svg {
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-cart p {
  font-size: 18px;
  font-weight: 700;
  color: #64748b;
  margin: 0 0 8px 0;
}

.empty-cart span {
  font-size: 14px;
  color: #94a3b8;
}

/* Footer */
.cart-footer {
  padding: 20px 24px;
  border-top: 2px solid #f1f5f9;
  background: white;
}

.total-section {
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.total-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.total-row.main {
  padding-top: 12px;
  border-top: 2px dashed #e2e8f0;
}

.total-label {
  font-size: 14px;
  color: #64748b;
  font-weight: 600;
}

.total-value {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.total-amount {
  font-size: 24px;
  font-weight: 800;
  color: #0b3c5d;
}

/* Pay Button */
.pay-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: linear-gradient(135deg, #0b3c5d 0%, #1e5a7d 100%);
  color: white;
  border: none;
  padding: 16px;
  border-radius: 14px;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 12px rgba(11, 60, 93, 0.3);
}

.pay-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(11, 60, 93, 0.4);
}

.pay-btn:disabled {
  background: linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%);
  cursor: not-allowed;
  box-shadow: none;
}

.pay-btn svg {
  width: 20px;
  height: 20px;
  stroke-width: 2.5;
}

/* Spinner */
.spinner {
  width: 20px;
  height: 20px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Responsive */
@media (max-width: 640px) {
  .cart-header {
    padding: 16px 20px;
  }

  .cart-header h3 {
    font-size: 18px;
  }

  .cart-items {
    padding: 16px 20px;
  }

  .cart-item {
    flex-direction: column;
  }

  .item-image {
    width: 100%;
    height: 120px;
  }

  .quantity-section {
    flex-direction: column;
    align-items: stretch;
  }

  .qty-controls {
    justify-content: center;
  }

  .item-subtotal {
    text-align: center;
  }

  .cart-footer {
    padding: 16px 20px;
  }
}
</style>