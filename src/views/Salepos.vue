<script setup>
import html2canvas from 'html2canvas'
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import api from '../lib/axios'
import Swal from 'sweetalert2'
import Quagga from 'quagga'

import Cart from '../components/Cart.vue'
import PaymentModal from '../components/PaymentModal.vue'

const products = ref([])
const cart = ref([])
const showPayment = ref(false)
const paymentMethod = ref('cash')
const user = ref(null)
const loading = ref(false)
const productFilter = ref('')
const showProductListFallback = ref(false)
const viewMode = ref('grid') // 'grid' o 'list'
const categoryFilter = ref('all')

// Nuevo: Modal de selección de peso
const showWeightSelector = ref(false)
const selectedProductForWeight = ref(null)
const selectedWeight = ref(1) // 1 = 1kg, 0.5 = 1/2kg, 0.25 = 1/4kg

const openProductFallback = () => {
  stopScanner()
  showProductListFallback.value = true
}

const closeProductFallback = () => {
  showProductListFallback.value = false
  productFilter.value = ''
  categoryFilter.value = 'all'
}

const categories = computed(() => {
  const cats = new Set()
  products.value.forEach(p => {
    if (p.category) cats.add(p.category)
  })
  return ['all', ...Array.from(cats)]
})

const filteredProducts = computed(() => {
  let filtered = products.value

  if (categoryFilter.value !== 'all') {
    filtered = filtered.filter(p => p.category === categoryFilter.value)
  }

  if (productFilter.value) {
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(productFilter.value.toLowerCase())
    )
  }

  return filtered
})

// Opciones de peso
const weightOptions = [
  { value: 1, label: '1 kg', fraction: '1' },
  { value: 0.5, label: '1/2 kg', fraction: '1/2' },
  { value: 0.25, label: '1/4 kg', fraction: '1/4' }
]

// Calcular precio según peso seleccionado
const calculatedPrice = computed(() => {
  if (!selectedProductForWeight.value) return 0
  const basePrice = Number(selectedProductForWeight.value.sale_price)
  const weight = Number(selectedWeight.value)
  const calculated = basePrice * weight
  return calculated.toFixed(2)
})

// 1. Mantienes tu declaración de variables
const paymentQRs = ref([])
// 2. BORRAS el watch completo y lo cambias por esto:
const selectedQR = computed(() => {
  if (paymentMethod.value !== 'yape' && paymentMethod.value !== 'plin') {
    return null;
  }
  
  if (!paymentQRs.value || paymentQRs.value.length === 0) {
    return null;
  }

  // Ahora sí, como paymentQRs.value es un array, .find() buscará sin problemas
  return paymentQRs.value.find(qr => 
    qr.method.toLowerCase() === paymentMethod.value.toLowerCase() && 
    (qr.active == 1 || qr.active === true)
  ) || null;
});

const updateQuantity = (id, newQty) => {
  const item = cart.value.find(p => p.id === id)
  if (!item) return
  if (newQty <= 0) {
    cart.value = cart.value.filter(p => p.id !== id)
    return
  }
  if (newQty > item.stock) return
  item.quantity = newQty
}

/* =========================
   SCANNER CÁMARA
========================= */
const showScanner = ref(false)
let scanning = false

const startScanner = async () => {
  showScanner.value = true
  await nextTick()
  const target = document.querySelector('#scanner')
  if (!target) {
    Swal.fire('Error', 'No se pudo iniciar la cámara', 'error')
    return
  }

  Quagga.init({
    inputStream: {
      name: 'Live',
      type: 'LiveStream',
      target,
      constraints: { facingMode: 'environment' }
    },
    locator: {
      patchSize: 'medium',
      halfSample: true
    },
    numOfWorkers: navigator.hardwareConcurrency || 4,
    frequency: 10,
    decoder: {
      readers: ['code_128_reader', 'ean_reader'],
      multiple: false
    },
    locate: true
  }, (err) => {
    if (err) {
      console.error(err)
      Swal.fire('Error', 'No se pudo abrir la cámara', 'error')
      return
    }
    Quagga.start()
    scanning = true
  })

  Quagga.offDetected()
  Quagga.onDetected(onDetected)
}

const stopScanner = () => {
  if (scanning) Quagga.stop()
  scanning = false
  showScanner.value = false
}

const onDetected = (data) => {
  if (!data || !data.codeResult) return
  let scannedCode = data.codeResult.code.trim().toUpperCase().replace(/\s/g, '')

  const product = products.value.find(p =>
    p.barcode?.trim().toUpperCase().replace(/\s/g, '') === scannedCode
  )

  if (product) {
    addToCart(product)
    stopScanner()
    Swal.fire({ 
      toast: true, 
      position: 'top-end', 
      icon: 'success', 
      title: `${product.name} agregado`, 
      showConfirmButton: false, 
      timer: 1500 
    })
  }
}

/* =========================
   CARGAR PRODUCTOS DESDE LA API
========================= */
const loadProducts = async () => {
  try {
    const userStr = localStorage.getItem('kiopos_user')
    user.value = userStr ? JSON.parse(userStr) : null

    const response = await api.get('/pos/data')
    products.value = response.data.products || []
    paymentQRs.value = response.data.paymentQrs || []

  } catch (error) {
    console.error('Error cargando datos del POS:', error)
  }
}

onMounted(loadProducts)
onBeforeUnmount(stopScanner)

/* =========================
   CARRITO - CON PESO
========================= */
const addToCart = (product) => {
  if (product.unit_type === 'WEIGHT') {
    selectedProductForWeight.value = product
    selectedWeight.value = 1
    showWeightSelector.value = true
    return
  }

  const item = cart.value.find(p => p.id === product.id)
  if (item) {
    if (item.quantity < product.stock) item.quantity++
  } else {
    cart.value.push({ 
      ...product, 
      quantity: 1, 
      price: product.sale_price,
      weight: null 
    })
  }

  Swal.fire({
    toast: true,
    position: 'top-end',
    icon: 'success',
    title: `${product.name} añadido`,
    showConfirmButton: false,
    timer: 1000
  })
}

const confirmWeightSelection = () => {
  if (!selectedProductForWeight.value) return

  const product = selectedProductForWeight.value
  const priceForWeight = parseFloat(calculatedPrice.value)
  const weightLabel = weightOptions.find(w => w.value === selectedWeight.value)?.label

  const existingItem = cart.value.find(
    p => p.id === product.id && p.weight === selectedWeight.value
  )

  if (existingItem) {
    existingItem.quantity++
  } else {
    const newItem = {
      id: product.id,
      name: product.name,
      displayName: `${product.name} (${weightLabel})`,
      image_url: product.image_url,
      barcode: product.barcode,
      category: product.category,
      unit_type: product.unit_type,
      user_id: product.user_id,
      stock: product.stock,
      sale_price: priceForWeight,
      price: priceForWeight,
      original_price: product.sale_price,
      weight: selectedWeight.value,
      is_weight_product: true,
      quantity: 1
    }
    
    cart.value.push(newItem)
  }

  Swal.fire({
    toast: true,
    position: 'top-end',
    icon: 'success',
    title: `${product.name} (${weightLabel}) añadido - S/ ${priceForWeight}`,
    showConfirmButton: false,
    timer: 1500
  })

  showWeightSelector.value = false
  selectedProductForWeight.value = null
}

const cancelWeightSelection = () => {
  showWeightSelector.value = false
  selectedProductForWeight.value = null
  selectedWeight.value = 1
}

const removeFromCart = (id) => { cart.value = cart.value.filter(p => p.id !== id) }
const increaseQty = (id) => { const item = cart.value.find(p => p.id === id); if (item && item.quantity < item.stock) item.quantity++ }
const decreaseQty = (id) => { const item = cart.value.find(p => p.id === id); if (!item) return; item.quantity--; if (item.quantity <= 0) removeFromCart(id) }

/* =========================
   TOTAL
========================= */
const total = computed(() => cart.value.reduce((sum, p) => sum + p.price * p.quantity, 0))

/* =========================
   GUARDAR VENTA EN LA API
========================= */
const saveSale = async ({ customer_name, customer_phone, comment } = {}) => {
  if (!cart.value.length) return Swal.fire('Carrito vacío', 'Agrega productos', 'warning')
  loading.value = true

  try {
    const itemsPayload = cart.value.map(p => ({
      product_id: p.id,
      quantity: p.quantity,
      price: p.price,
      weight: p.weight || null
    }))

    await api.post('/pos/sales', {
      total: total.value,
      payment_method: paymentMethod.value,
      items: itemsPayload,
      customer_name: customer_name || null,
      customer_phone: customer_phone || null,
      comment: comment || null
    })

    cart.value = []
    showPayment.value = false
    await loadProducts()
    Swal.fire('Venta registrada', '', 'success')

  } catch (err) {
    console.error('ERROR GENERAL:', err)
    Swal.fire({ 
      icon: 'error', 
      title: 'Error al guardar', 
      html: `<p style="text-align:left;font-size:14px"><b>Mensaje:</b><br>${err?.response?.data?.message || err?.message || 'Error desconocido'}</p>` 
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="pos-layout">
    <div class="pos-container">
      <!-- Header Principal -->
      <div class="pos-header">
        <div class="header-content">
          <h1>Punto de Venta</h1>
          <p class="subtitle">{{ products.length }} productos disponibles</p>
        </div>
        <div class="header-actions">
          <button class="btn-scan" @click="startScanner">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
              <circle cx="12" cy="13" r="4"></circle>
            </svg>
            Escanear
          </button>
          <button class="btn-products" @click="openProductFallback">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="8" y1="6" x2="21" y2="6"></line>
              <line x1="8" y1="12" x2="21" y2="12"></line>
              <line x1="8" y1="18" x2="21" y2="18"></line>
              <line x1="3" y1="6" x2="3.01" y2="6"></line>
              <line x1="3" y1="12" x2="3.01" y2="12"></line>
              <line x1="3" y1="18" x2="3.01" y2="18"></line>
            </svg>
            Productos
          </button>
        </div>
      </div>

      <!-- Carrito -->
      <div class="cart-section">
        <Cart
          :cart="cart"
          :total="total"
          :loading="loading"
          @remove="removeFromCart"
          @update-quantity="updateQuantity"
          @pay="showPayment = true"
        />
      </div>
    </div>

    <!-- Modal Scanner -->
    <div v-if="showScanner" class="modal-backdrop" @click.self="stopScanner">
      <div class="modal-scanner">
        <div class="scanner-header">
          <h3>Escanea el código de barras</h3>
          <button @click="stopScanner" class="close-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div id="scanner" class="scanner-view"></div>

        <div class="scanner-actions">
          <button class="btn-secondary-action" @click="openProductFallback">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.35-4.35"></path>
            </svg>
            Buscar productos
          </button>
          <button class="btn-cancel-action" @click="stopScanner">
            Cancelar
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Productos -->
    <div v-if="showProductListFallback" class="modal-backdrop" @click.self="closeProductFallback">
      <div class="modal-products">
        <div class="modal-products-header">
          <div>
            <h3>Selecciona productos</h3>
            <p class="modal-subtitle">{{ filteredProducts.length }} productos encontrados</p>
          </div>
          <button @click="closeProductFallback" class="close-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <!-- Filtros -->
        <div class="filters-section">
          <div class="search-box">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.35-4.35"></path>
            </svg>
            <input
              type="text"
              v-model="productFilter"
              placeholder="Buscar productos..."
            />
          </div>

          <div class="view-controls">
            <button 
              @click="viewMode = 'grid'" 
              :class="{ active: viewMode === 'grid' }"
              class="view-btn"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
              </svg>
            </button>
            <button 
              @click="viewMode = 'list'" 
              :class="{ active: viewMode === 'list' }"
              class="view-btn"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="8" y1="6" x2="21" y2="6"></line>
                <line x1="8" y1="12" x2="21" y2="12"></line>
                <line x1="8" y1="18" x2="21" y2="18"></line>
                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                <line x1="3" y1="18" x2="3.01" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>

        <!-- Lista Productos Grid -->
        <div v-if="viewMode === 'grid'" class="products-grid">
          <div
            v-for="p in filteredProducts"
            :key="p.id"
            class="product-card"
            @click="addToCart(p)"
          >
            <div class="product-image">
              <img v-if="p.image_url" :src="p.image_url" :alt="p.name" />
              <div v-else class="image-placeholder">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                  <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
              </div>
              <div class="stock-badge" :class="{ low: p.stock < 10 }">
                {{ p.stock }} {{ p.unit_type === 'WEIGHT' ? 'kg' : 'und' }}
              </div>
            </div>
            <div class="product-info">
              <h4>{{ p.name }}</h4>
              <div class="product-price">
                <span class="price">S/ {{ p.sale_price }}</span>
                <span v-if="p.unit_type === 'WEIGHT'" class="price-unit">/kg</span>
              </div>
            </div>
            <button class="btn-add-product">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Agregar
            </button>
          </div>
        </div>

        <!-- Lista Productos List -->
        <div v-else class="products-list">
          <div
            v-for="p in filteredProducts"
            :key="p.id"
            class="product-row"
            @click="addToCart(p)"
          >
            <div class="row-image">
              <img v-if="p.image_url" :src="p.image_url" :alt="p.name" />
              <div v-else class="image-placeholder-small">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                </svg>
              </div>
            </div>
            <div class="row-content">
              <h4>{{ p.name }}</h4>
              <div class="row-details">
                <span class="detail-price">
                  S/ {{ p.sale_price }}
                  <span v-if="p.unit_type === 'WEIGHT'" class="unit-suffix">/kg</span>
                </span>
                <span class="detail-stock">Stock: {{ p.stock }}</span>
              </div>
            </div>
            <button class="btn-add-row">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
          </div>
        </div>

        <!-- Empty State -->
        <div v-if="filteredProducts.length === 0" class="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
          </svg>
          <p>No se encontraron productos</p>
        </div>
      </div>
    </div>

    <!-- Modal Selector de Peso -->
    <div v-if="showWeightSelector" class="modal-backdrop" @click.self="cancelWeightSelection">
      <div class="modal-weight-selector">
        <div class="weight-header">
          <div>
            <h3>{{ selectedProductForWeight?.name }}</h3>
            <p class="weight-subtitle">Selecciona la cantidad de kilos</p>
          </div>
          <button @click="cancelWeightSelection" class="close-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="weight-content">
          <div class="base-price-info">
            <span class="label">Precio por kilo:</span>
            <span class="value">S/ {{ selectedProductForWeight?.sale_price }}</span>
          </div>

          <div class="weight-options">
            <button
              v-for="option in weightOptions"
              :key="option.value"
              @click="selectedWeight = option.value"
              :class="{ active: selectedWeight === option.value }"
              class="weight-option"
            >
              <div class="option-label">{{ option.label }}</div>
              <div class="option-fraction">{{ option.fraction }} kg</div>
              <div class="option-price">
                S/ {{ (selectedProductForWeight?.sale_price * option.value).toFixed(2) }}
              </div>
            </button>
          </div>

          <div class="calculated-price">
            <div class="price-label">Precio a pagar:</div>
            <div class="price-value">S/ {{ calculatedPrice }}</div>
          </div>
        </div>

        <div class="weight-actions">
          <button class="btn-cancel-weight" @click="cancelWeightSelection">
            Cancelar
          </button>
          <button class="btn-confirm-weight" @click="confirmWeightSelection">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Agregar al carrito
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Pago -->
    <PaymentModal
      v-if="showPayment"
      :total="total"
      :paymentQR="selectedQR"
      v-model:method="paymentMethod"
      :loading="loading"
      @confirm="saveSale($event)"
      @close="showPayment = false"
    />
  </div>
</template>

<style scoped>
.pos-layout {
  min-height: 100vh;
  background: linear-gradient(135deg, #f5f7fa 0%, #e8ecf1 100%);
  padding: 24px;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.pos-container {
  max-width: 1400px;
  margin: 0 auto;
}

/* Header */
.pos-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 16px;
}

.header-content h1 {
  font-size: 32px;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 6px 0;
  letter-spacing: -0.5px;
}

.subtitle {
  font-size: 15px;
  color: #64748b;
  margin: 0;
  font-weight: 500;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.btn-scan {
  display: flex;
  align-items: center;
  gap: 12px;
  background: linear-gradient(135deg, #0b3c5d 0%, #1e5a7d 100%);
  color: white;
  border: none;
  padding: 14px 28px;
  border-radius: 14px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 12px rgba(11, 60, 93, 0.3);
}

.btn-scan svg {
  width: 24px;
  height: 24px;
  stroke-width: 2.5;
}

.btn-scan:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(11, 60, 93, 0.4);
}

.btn-scan:active {
  transform: translateY(0);
}

.btn-products {
  display: flex;
  align-items: center;
  gap: 12px;
  background: white;
  color: #0f172a;
  border: 2px solid #e2e8f0;
  padding: 14px 28px;
  border-radius: 14px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-products svg {
  width: 24px;
  height: 24px;
  stroke-width: 2.5;
}

.btn-products:hover {
  border-color: #0b3c5d;
  color: #0b3c5d;
  background: #f8fafc;
  transform: translateY(-1px);
}

.btn-products:active {
  transform: translateY(0);
}

/* Cart Section */
.cart-section {
  background: white;
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
}

/* Modal Backdrop */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 20px;
}

/* Modal Scanner */
.modal-scanner {
  background: white;
  width: 100%;
  max-width: 600px;
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3);
}

.scanner-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #e2e8f0;
}

.scanner-header h3 {
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
}

.close-btn {
  width: 60px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f1f5f9;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  color: #64748b;
  transition: all 0.2s ease;
}

.close-btn svg {
  width: 22px;
  height: 22px;
  stroke-width: 2.5;
}

.close-btn:hover {
  background: #e2e8f0;
  color: #0f172a;
  transform: scale(1.05);
}

.scanner-view {
  width: 100%;
  aspect-ratio: 4 / 3;
  max-height: 400px;
  background: #000;
  position: relative;
  overflow: hidden;
}

.scanner-view video,
.scanner-view canvas {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover;
}

.scanner-actions {
  padding: 20px 24px;
  display: flex;
  gap: 12px;
}

.btn-secondary-action {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: #f1f5f9;
  color: #0f172a;
  border: none;
  padding: 16px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-secondary-action svg {
  width: 22px;
  height: 22px;
  stroke-width: 2.5;
}

.btn-secondary-action:hover {
  background: #e2e8f0;
  transform: translateY(-1px);
}

.btn-cancel-action {
  flex: 1;
  background: #ef4444;
  color: white;
  border: none;
  padding: 16px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-cancel-action:hover {
  background: #dc2626;
  transform: translateY(-1px);
}

/* Modal Productos */
.modal-products {
  background: white;
  width: 100%;
  max-width: 1200px;
  max-height: 90vh;
  border-radius: 24px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3);
}

.modal-products-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 24px;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.modal-products-header h3 {
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 4px 0;
}

.modal-subtitle {
  font-size: 14px;
  color: #64748b;
  margin: 0;
}

/* Filtros */
.filters-section {
  padding: 20px 24px;
  display: flex;
  gap: 16px;
  border-bottom: 1px solid #e2e8f0;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.search-box {
  flex: 1;
  min-width: 250px;
  display: flex;
  align-items: center;
  gap: 12px;
  background: #f8fafc;
  padding: 14px 18px;
  border-radius: 12px;
  border: 2px solid #e2e8f0;
  transition: all 0.2s ease;
}

.search-box:focus-within {
  border-color: #0b3c5d;
  background: white;
}

.search-box svg {
  width: 22px;
  height: 22px;
  color: #94a3b8;
  flex-shrink: 0;
  stroke-width: 2.5;
}

.search-box input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 15px;
  color: #0f172a;
}

.view-controls {
  display: flex;
  gap: 8px;
  background: #f1f5f9;
  padding: 6px;
  border-radius: 12px;
}

.view-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 44px;
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  color: #64748b;
  transition: all 0.2s ease;
}

.view-btn svg {
  width: 22px;
  height: 22px;
  stroke-width: 2.5;
}

.view-btn:hover {
  background: rgba(255, 255, 255, 0.5);
}

.view-btn.active {
  background: white;
  color: #0b3c5d;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* Grid Productos */
.products-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  grid-auto-rows: max-content;   /* FIX: evita que las filas se colapsen a 0 */
  align-content: start;          /* FIX: las filas no se estiran ni se encogen */
  gap: 20px;
  padding: 24px;
  overflow-y: auto;
  flex: 1 1 auto;                /* FIX: ocupa el espacio disponible del modal */
  min-height: 0;                 /* FIX: permite el scroll interno dentro del flex */
  max-height: calc(90vh - 260px);
  -webkit-overflow-scrolling: touch;
}

.product-card {
  display: flex;                 /* FIX: estructura vertical estable */
  flex-direction: column;
  background: white;
  border: 2px solid #e2e8f0;
  border-radius: 16px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s ease;
  min-width: 0;
}

.product-card:hover {
  border-color: #0b3c5d;
  transform: translateY(-4px);
  box-shadow: 0 12px 24px rgba(11, 60, 93, 0.15);
}

.product-image {
  position: relative;
  width: 100%;
  height: 160px;
  flex-shrink: 0;                /* FIX: la imagen nunca se encoge */
  background: #f8fafc;
  overflow: hidden;
}

.product-image img {
  display: block;
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
}

.image-placeholder svg {
  width: 48px;
  height: 48px;
  stroke-width: 2;
}

.stock-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  background: #10b981;
  color: white;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
}

.stock-badge.low {
  background: #ef4444;
}

.product-info {
  padding: 16px;
  flex: 1 1 auto;
}

.product-info h4 {
  font-size: 15px;
  font-weight: 600;
  color: #0f172a;
  margin: 0 0 8px 0;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.product-price {
  display: flex;
  align-items: center;
  gap: 4px;
}

.price {
  font-size: 20px;
  font-weight: 800;
  color: #0b3c5d;
}

.price-unit {
  font-size: 14px;
  font-weight: 600;
  color: #64748b;
}

.btn-add-product {
  width: 100%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: #0b3c5d;
  color: white;
  border: none;
  padding: 14px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-add-product svg {
  width: 20px;
  height: 20px;
  stroke-width: 3;
}

.btn-add-product:hover {
  background: #1e5a7d;
  transform: translateY(-1px);
}

/* List View */
.products-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 24px;
  overflow-y: auto;
  flex: 1 1 auto;
  min-height: 0;
  max-height: calc(90vh - 260px);
  -webkit-overflow-scrolling: touch;
}

.product-row {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;                /* FIX: las filas no se aplastan */
  background: white;
  border: 2px solid #e2e8f0;
  padding: 16px;
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.product-row:hover {
  border-color: #0b3c5d;
  background: #f8fafc;
  transform: translateX(4px);
}

.row-image {
  width: 70px;
  height: 70px;
  border-radius: 10px;
  overflow: hidden;
  background: #f1f5f9;
  flex-shrink: 0;
}

.row-image img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-placeholder-small {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #cbd5e1;
}

.image-placeholder-small svg {
  width: 32px;
  height: 32px;
  stroke-width: 2;
}

.row-content {
  flex: 1;
  min-width: 0;
}

.row-content h4 {
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
  margin: 0 0 6px 0;
}

.row-details {
  display: flex;
  gap: 16px;
  align-items: center;
}

.detail-price {
  font-size: 18px;
  font-weight: 700;
  color: #0b3c5d;
}

.unit-suffix {
  font-size: 14px;
  font-weight: 600;
  color: #64748b;
}

.detail-stock {
  font-size: 14px;
  color: #64748b;
  background: #f1f5f9;
  padding: 4px 10px;
  border-radius: 6px;
}

.btn-add-row {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0b3c5d;
  color: white;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.2s;
}

.btn-add-row:hover {
  background: #1e5a7d;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: #94a3b8;
  gap: 16px;
}

.empty-state p {
  font-size: 16px;
  font-weight: 500;
  margin: 0;
}

/* Responsive móvil: 2 columnas y tarjetas más compactas */
@media (max-width: 640px) {
  .products-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    padding: 16px;
  }

  .product-image {
    height: 120px;
  }

  .product-info {
    padding: 12px;
  }

  .product-info h4 {
    font-size: 14px;
  }

  .price {
    font-size: 17px;
  }

  .btn-add-product {
    padding: 12px;
    font-size: 14px;
  }

  .products-list {
    padding: 16px;
  }
}

/* Modal Selector de Peso */
.modal-weight-selector {
  background: white;
  width: 100%;
  max-width: 450px;
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
}

.weight-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 20px 24px;
  border-bottom: 1px solid #e2e8f0;
}

.weight-header h3 {
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 4px 0;
}

.weight-subtitle {
  font-size: 14px;
  color: #64748b;
  margin: 0;
}

.weight-content {
  padding: 24px;
}

.base-price-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f8fafc;
  padding: 12px 16px;
  border-radius: 12px;
  margin-bottom: 20px;
}

.base-price-info .label {
  font-size: 14px;
  color: #64748b;
  font-weight: 500;
}

.base-price-info .value {
  font-size: 16px;
  color: #0f172a;
  font-weight: 700;
}

.weight-options {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 24px;
}

.weight-option {
  background: #f8fafc;
  border: 2px solid #e2e8f0;
  border-radius: 14px;
  padding: 16px 12px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.weight-option:hover {
  border-color: #0b3c5d;
  background: #f0f9ff;
}

.weight-option.active {
  border-color: #0b3c5d;
  background: #0b3c5d;
  color: white;
}

.weight-option.active .option-label,
.weight-option.active .option-fraction,
.weight-option.active .option-price {
  color: white;
}

.option-label {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 4px;
}

.option-fraction {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 8px;
}

.option-price {
  font-size: 14px;
  font-weight: 700;
  color: #0b3c5d;
}

.calculated-price {
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  border: 2px solid #bae6fd;
  border-radius: 14px;
  padding: 16px;
  text-align: center;
}

.price-label {
  font-size: 13px;
  font-weight: 600;
  color: #0369a1;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.price-value {
  font-size: 28px;
  font-weight: 800;
  color: #0c4a6e;
}

.weight-actions {
  padding: 20px 24px;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  display: flex;
  gap: 12px;
}

.btn-cancel-weight {
  flex: 1;
  background: white;
  color: #64748b;
  border: 2px solid #e2e8f0;
  padding: 14px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-cancel-weight:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.btn-confirm-weight {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: #0b3c5d;
  color: white;
  border: none;
  padding: 14px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-confirm-weight svg {
  stroke-width: 2.5;
}

.btn-confirm-weight:hover {
  background: #1e5a7d;
  transform: translateY(-1px);
}
</style>
