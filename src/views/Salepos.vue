<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick , watch } from 'vue'
import { supabase } from '../lib/supabase'
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
const selectedQR = ref(null)
const productFilter = ref('')
const showProductListFallback = ref(false)
const viewMode = ref('grid') // 'grid' o 'list'
const categoryFilter = ref('all')

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

const paymentQRs = ref([])

const loadPaymentQRs = async () => {
  if (!user.value?.id) return

  const { data, error } = await supabase
    .from('payment_qrs')
    .select('*')
    .eq('user_id', user.value.id)
    .eq('active', true)

  if (error) {
    console.error('ERROR QR:', error)
    return
  }

  paymentQRs.value = data || []
}

watch(paymentMethod, (method) => {
  if (method === 'yape' || method === 'plin') {
    selectedQR.value =
      paymentQRs.value.find(qr => qr.method === method) || null
  } else {
    selectedQR.value = null
  }
})

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
   CARGAR PRODUCTOS
========================= */
const loadProducts = async () => {
  const { data: auth } = await supabase.auth.getUser()
  user.value = auth.user

  const { data } = await supabase
    .from('products')
    .select('*')
    .eq('user_id', user.value.id)
    .gt('stock', 0)

  products.value = data || []

  await loadPaymentQRs()
}

onMounted(loadProducts)
onBeforeUnmount(stopScanner)

/* =========================
   CARRITO
========================= */
const addToCart = (product) => {
  const item = cart.value.find(p => p.id === product.id)
  if (item) {
    if (item.quantity < product.stock) item.quantity++
  } else {
    cart.value.push({ 
      ...product, 
      quantity: 1, 
      price: product.sale_price
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

const removeFromCart = (id) => { cart.value = cart.value.filter(p => p.id !== id) }
const increaseQty = (id) => { const item = cart.value.find(p => p.id === id); if (item && item.quantity < item.stock) item.quantity++ }
const decreaseQty = (id) => { const item = cart.value.find(p => p.id === id); if (!item) return; item.quantity--; if (item.quantity <= 0) removeFromCart(id) }

/* =========================
   TOTAL
========================= */
const total = computed(() => cart.value.reduce((sum, p) => sum + p.sale_price * p.quantity, 0))

/* =========================
   GUARDAR VENTA
========================= */
const saveSale = async ({ customer_name, customer_phone, comment } = {}) => {
  if (!cart.value.length) return Swal.fire('Carrito vacío', 'Agrega productos', 'warning')
  loading.value = true
  try {
    const { data: sale, error: saleError } = await supabase.from('sales').insert({
      user_id: user.value.id,
      total: total.value,
      payment_method: paymentMethod.value
    }).select().single()
    if (saleError) throw saleError

    if (paymentMethod.value === 'por_cobrar') {
      if (!customer_name || !customer_name.trim()) {
        Swal.fire('Error', 'Debes ingresar el nombre del cliente', 'warning')
        return
      }

      await supabase.from('clientes_por_cobrar').insert({
        user_id: user.value.id,
        sale_id: sale.id,
        customer_name: customer_name.trim(),
        customer_phone: customer_phone?.trim() || null,
        comment: comment?.trim() || null
      })
    }

    const items = cart.value.map(p => ({ sale_id: sale.id, product_id: p.id, quantity: p.quantity, price: p.sale_price, subtotal: p.sale_price * p.quantity }))
    const { error: itemsError } = await supabase.from('sale_items').insert(items)
    if (itemsError) throw itemsError

    for (const p of cart.value) {
      const { error: stockError } = await supabase.from('products').update({ stock: p.stock - p.quantity }).eq('id', p.id)
      if (stockError) throw stockError
    }

    cart.value = []
    showPayment.value = false
    await loadProducts()
    Swal.fire('Venta registrada', '', 'success')
  } catch (err) {
    console.error('ERROR GENERAL:', err)
    Swal.fire({ icon: 'error', title: 'Error al guardar', html: `<p style="text-align:left;font-size:14px"><b>Mensaje:</b><br>${err?.message || 'Error desconocido'}</p>` })
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
                <span class="detail-price">S/ {{ p.sale_price }}</span>
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
  width: 40px;
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
  width: 44px;
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
  gap: 20px;
  padding: 24px;
  overflow-y: auto;
  max-height: calc(90vh - 260px);
}

.product-card {
  background: white;
  border: 2px solid #e2e8f0;
  border-radius: 16px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s ease;
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
  background: #f8fafc;
  overflow: hidden;
}

.product-image img {
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
  gap: 8px;
}

.price {
  font-size: 20px;
  font-weight: 800;
  color: #0b3c5d;
}

.btn-add-product {
  width: 100%;
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
  max-height: calc(90vh - 260px);
}

.product-row {
  display: flex;
  align-items: center;
  gap: 16px;
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
  transition: all 0.2s ease;
}

.btn-add-row svg {
  width: 24px;
  height: 24px;
  stroke-width: 3;
}

.btn-add-row:hover {
  background: #1e5a7d;
  transform: scale(1.08);
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: #94a3b8;
}

.empty-state svg {
  width: 80px;
  height: 80px;
  margin-bottom: 16px;
  opacity: 0.5;
  stroke-width: 1.5;
}

.empty-state p {
  margin: 0;
  font-size: 16px;
}

/* Scrollbar */
.products-grid::-webkit-scrollbar,
.products-list::-webkit-scrollbar {
  width: 8px;
}

.products-grid::-webkit-scrollbar-thumb,
.products-list::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 10px;
}

.products-grid::-webkit-scrollbar-thumb:hover,
.products-list::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

/* Responsive */
@media (max-width: 768px) {
  .pos-layout {
    padding: 16px;
  }

  .header-content h1 {
    font-size: 24px;
  }

  .header-actions {
    width: 100%;
  }

  .btn-scan,
  .btn-products {
    flex: 1;
    justify-content: center;
  }

  .filters-section {
    flex-direction: column;
  }

  .search-box {
    min-width: 100%;
  }

  .products-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px;
  }

  .modal-scanner,
  .modal-products {
    max-width: 100%;
    max-height: 100vh;
    border-radius: 0;
  }
}
</style>