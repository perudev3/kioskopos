<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
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
      target: target,
      constraints: {
        facingMode: 'environment'
      }
    },
    decoder: {
      readers: ['code_128_reader', 'ean_reader', 'ean_8_reader']
    }
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
  if (scanning) {
    Quagga.stop()
    scanning = false
  }
  showScanner.value = false
}


const onDetected = (data) => {
  const scannedCode = data.codeResult.code
    .trim()
    .toUpperCase()
    .replace(/\s/g, '')

  const product = products.value.find(p =>
    p.barcode
      ?.trim()
      .toUpperCase()
      .replace(/\s/g, '') === scannedCode
  )

  if (product) {
    addToCart(product)
    stopScanner()

    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: `Producto agregado: ${product.name}`,
      showConfirmButton: false,
      timer: 1000
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
    cart.value.push({ ...product, quantity: 1 })
  }

  Swal.fire({
    toast: true,
    position: 'top-end',
    icon: 'success',
    title: `${product.name} añadido`,
    showConfirmButton: false,
    timer: 900
  })
}

const removeFromCart = (id) => {
  cart.value = cart.value.filter(p => p.id !== id)
}

const increaseQty = (id) => {
  const item = cart.value.find(p => p.id === id)
  if (item && item.quantity < item.stock) item.quantity++
}

const decreaseQty = (id) => {
  const item = cart.value.find(p => p.id === id)
  if (!item) return
  item.quantity--
  if (item.quantity <= 0) removeFromCart(id)
}

/* =========================
   TOTAL (USA PRECIO VENTA)
========================= */
const total = computed(() =>
  cart.value.reduce(
    (sum, p) => sum + p.sale_price * p.quantity,
    0
  )
)

/* =========================
   GUARDAR VENTA
========================= */
const saveSale = async (creditCustomer = null) => {
  if (!cart.value.length) {
    return Swal.fire('Carrito vacío', 'Agrega productos', 'warning')
  }

  loading.value = true

  try {
    const { data: sale } = await supabase
      .from('sales')
      .insert({
        user_id: user.value.id,
        total: total.value,
        payment_method: paymentMethod.value
      })
      .select()
      .single()

    if (paymentMethod.value === 'por_cobrar' && creditCustomer) {
        const { error } = await supabase
          .from('clientes_por_cobrar')
          .insert({
            user_id: user.value.id,
            sale_id: sale.id,
            customer_name: creditCustomer.customer_name,
            customer_phone: creditCustomer.customer_phone,
            comment: creditCustomer.comment,
            total: total.value
          })

        if (error) {
          console.error('ERROR clientes_por_cobrar:', error)
          Swal.fire(
            'Error crédito',
            error.message,
            'error'
          )
          throw error
        }
    }



    const items = cart.value.map(p => ({
      sale_id: sale.id,
      product_id: p.id,
      quantity: p.quantity,
      price: p.sale_price,
      subtotal: p.sale_price * p.quantity
    }))

    await supabase.from('sale_items').insert(items)

    for (const p of cart.value) {
      await supabase
        .from('products')
        .update({ stock: p.stock - p.quantity })
        .eq('id', p.id)
    }

    cart.value = []
    showPayment.value = false
    loadProducts()

    Swal.fire('Venta registrada', '', 'success')
  } catch {
    Swal.fire('Error', 'No se pudo guardar la venta', 'error')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="pos-layout">

    <div class="cart-wrapper">

      <div class="pos-header">
        <div>
          <h2>Punto de Venta</h2>
          <p class="subtitle">Escanea productos con la cámara</p>
        </div>

        <button class="btn-primary" @click="startScanner">
          📷 Escanear producto
        </button>
      </div>

      <Cart
        :cart="cart"
        :total="total"
        :loading="loading"
        @remove="removeFromCart"
        @update-quantity="updateQuantity"
        @pay="showPayment = true"
      />

    </div>

    <!-- 🔥 SCANNER CÁMARA -->
    <div v-if="showScanner" class="modal-backdrop">
      <div class="modal scanner">
        <div id="scanner" class="scanner-view"></div>

        <button class="btn-cancel" @click="stopScanner">
          Cancelar
        </button>
      </div>
    </div>

    <PaymentModal
      v-if="showPayment"
      :total="total"
      v-model:method="paymentMethod"
      :loading="loading"
      @confirm="saveSale($event)"
      @close="showPayment = false"
    />
  </div>
</template>




<style scoped>

/* ===============================
   SCANNER RESPONSIVE
=============================== */

/* Modal específico del scanner */
.modal.scanner {
  background: #ffffff;
  width: 95%;
  max-width: 520px;
  border-radius: 20px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: 0 25px 50px rgba(0,0,0,.25);
}

/* Contenedor de cámara */
.scanner-view {
  width: 100%;
  aspect-ratio: 4 / 3;          /* 🔑 mantiene proporción */
  max-height: 70vh;             /* 🔑 no se sale en móviles */
  border-radius: 16px;
  overflow: hidden;
  background: black;
  position: relative;
}

/* Video de Quagga */
.scanner-view video,
.scanner-view canvas {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover;            /* 🔑 adapta cámara a pantalla */
}

/* Botón cancelar */
.modal.scanner .btn-cancel {
  width: 100%;
  padding: 12px;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 600;
}

/* 📱 MÓVILES */
@media (max-width: 480px) {
  .modal.scanner {
    width: 100%;
    height: 100vh;
    max-width: none;
    border-radius: 0;
    justify-content: center;
  }

  .scanner-view {
    aspect-ratio: auto;
    height: 70vh;
  }
}

/* 📲 TABLETS */
@media (min-width: 481px) and (max-width: 1024px) {
  .modal.scanner {
    max-width: 700px;
  }

  .scanner-view {
    aspect-ratio: 16 / 9;
  }
}


.pos-layout {
  min-height: 100vh;
  background: #f4f6f8;
  padding: 24px;
  font-family: 'Inter', system-ui, sans-serif;
}

/* CONTENEDOR PRINCIPAL */
.cart-wrapper {
  background: #ffffff;
  border-radius: 20px;
  padding: 20px;
  max-width: 1100px;
  margin: auto;
  box-shadow: 0 10px 25px rgba(0,0,0,.06);
}

/* HEADER */
.pos-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 22px;
  padding-bottom: 14px;
  border-bottom: 1px solid #e5e7eb;
}

.pos-header h2 {
  font-size: 28px;
  font-weight: 800;
  color: #0f172a; /* MÁS CONTRASTE */
  letter-spacing: -0.3px;
}

/* SUBTÍTULO */
.subtitle {
  font-size: 15px;
  color: #334155; /* ANTES MUY CLARO */
  margin-top: 6px;
  font-weight: 500;
}


/* BOTÓN PRINCIPAL */
.btn-primary {
  background: #2563eb;
  color: white;
  border: none;
  padding: 12px 18px;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all .2s ease;
}

.btn-primary:hover {
  background: #1e40af;
  transform: translateY(-1px);
}

/* MODAL BACKDROP */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(17,24,39,.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 50;
}

/* MODAL */
.modal.large {
  background: #ffffff;
  width: 92%;
  max-width: 980px;
  border-radius: 22px;
  padding: 22px;
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  box-shadow: 0 30px 60px rgba(0,0,0,.25);
}

/* MODAL HEADER */
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.modal-header h3 {
  font-size: 22px;
  font-weight: 700;
  color: #111827;
}

.modal-header button {
  background: transparent;
  border: none;
  font-size: 22px;
  cursor: pointer;
  color: #6b7280;
}

/* BUSCADOR */
.filter-input {
  width: 100%;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid #e5e7eb;
  font-size: 15px;
  margin-bottom: 16px;
}

.filter-input:focus {
  outline: none;
  border-color: #2563eb;
}

/* GRID PRODUCTOS */
.product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 18px;
  overflow-y: auto;
  padding-bottom: 8px;
}

/* CARD PRODUCTO */
.product-card {
  background: #ffffff;
  border-radius: 18px;
  padding: 14px;
  text-align: center;
  box-shadow: 0 8px 18px rgba(0,0,0,.06);
  display: flex;
  flex-direction: column;
}

.product-card:hover {
  transform: translateY(-2px);
}

/* IMAGEN */
.img-container {
  height: 120px;
  border-radius: 14px;
  background: #f1f5f9;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.img-container img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 14px;
}

/* TEXTOS */
.name {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
  margin-bottom: 4px;
}

.price {
  font-size: 15px;
  font-weight: 700;
  color: #2563eb;
}

.stock {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 10px;
}

/* BOTÓN AÑADIR */
.btn-add {
  margin-top: auto;
  background: #16a34a;
  color: white;
  border: none;
  padding: 10px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.btn-add:hover {
  background: #15803d;
}

.subtitle {
  font-size: 14px;
  color: #6b7280;
  margin-top: 4px;
}


</style>
