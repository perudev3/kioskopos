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
    inputStream: { name: 'Live', type: 'LiveStream', target, constraints: { facingMode: 'environment' } },
    decoder: { readers: ['code_128_reader', 'ean_reader', 'ean_8_reader'] }
  }, (err) => {
    if (err) { console.error(err); Swal.fire('Error', 'No se pudo abrir la cámara', 'error'); return }
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
  const scannedCode = data.codeResult.code.trim().toUpperCase().replace(/\s/g, '')
  const product = products.value.find(p => p.barcode?.trim().toUpperCase().replace(/\s/g, '') === scannedCode)
  if (product) {
    addToCart(product)
    stopScanner()
    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: `Producto agregado: ${product.name}`, showConfirmButton: false, timer: 1000 })
  }
}

/* =========================
   CARGAR PRODUCTOS
========================= */
const loadProducts = async () => {
  const { data: auth } = await supabase.auth.getUser()
  user.value = auth.user
  const { data } = await supabase.from('products').select('*').eq('user_id', user.value.id).gt('stock', 0)
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
  Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: `${product.name} añadido`, showConfirmButton: false, timer: 900 })
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
    <div class="cart-wrapper">
      <div class="pos-header">
        <div>
          <h2>Punto de Venta</h2>
          <p class="subtitle">Escanea productos con la cámara</p>
        </div>
        <button class="btn-primary" @click="startScanner">📷 Escanear producto</button>
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

    <div v-if="showScanner" class="modal-backdrop">
      <div class="modal scanner">
        <div id="scanner" class="scanner-view"></div>
        <button class="btn-cancel" @click="stopScanner">Cancelar</button>
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
