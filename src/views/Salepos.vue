<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import api from '../lib/axios'
import Swal from 'sweetalert2'
import {
  MultiFormatReader,
  BinaryBitmap,
  HybridBinarizer,
  HTMLCanvasElementLuminanceSource,
  DecodeHintType,
  BarcodeFormat
} from '@zxing/library'

import Cart from '../components/Cart.vue'
import PaymentModal from '../components/PaymentModal.vue'

/* =========================================================
   CONFIGURACIÓN
   Endpoint que ya usa tu módulo de Productos para crear uno.
   Ajusta SOLO esta constante si tu ruta es distinta.
========================================================= */
const PRODUCT_CREATE_ENDPOINT = '/products'

const products = ref([])
const cart = ref([])
const showPayment = ref(false)
const paymentMethod = ref('cash')
const user = ref(null)
const loading = ref(false)
const productFilter = ref('')
const searchInput = ref('')
const showProductListFallback = ref(false)
const viewMode = ref('grid') // 'grid' o 'list'
const categoryFilter = ref('all')

/* =========================
   UTILIDADES
========================= */
// Compara códigos numéricos ignorando ceros a la izquierda (UPC-A 12 dígitos vs EAN-13)
const normalizeCode = (code) => {
  const clean = String(code || '').trim().toUpperCase().replace(/\s/g, '')
  return /^\d+$/.test(clean) ? clean.replace(/^0+/, '') : clean
}

const toast = (icon, title, timer = 1200) =>
  Swal.fire({ toast: true, position: 'top-end', icon, title, showConfirmButton: false, timer })

// Índice por código de barras: búsqueda instantánea al escanear
const barcodeMap = computed(() => {
  const map = new Map()
  products.value.forEach(p => {
    if (p.barcode) map.set(normalizeCode(p.barcode), p)
  })
  return map
})

// Búsqueda con retardo corto para no filtrar en cada tecla
let searchTimer = null
watch(searchInput, (val) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { productFilter.value = val }, 180)
})

const openProductFallback = () => {
  stopScanner()
  showProductListFallback.value = true
}

const closeProductFallback = () => {
  showProductListFallback.value = false
  productFilter.value = ''
  searchInput.value = ''
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

  const q = productFilter.value.trim().toLowerCase()
  if (q) {
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.barcode && String(p.barcode).toLowerCase().includes(q))
    )
  }

  return filtered
})

/* =========================
   VENTA POR PESO (kg / gramos)
   El peso se guarda siempre en KILOS (0.25, 0.5, 1, 0.35...)
   para que el backend reciba el mismo formato de siempre.
========================= */
const showWeightSelector = ref(false)
const selectedProductForWeight = ref(null)
const selectedGrams = ref(1000) // fuente de verdad en gramos
const gramsInput = ref(null)

const selectedWeight = computed(() => Number(selectedGrams.value || 0) / 1000)

// Atajos rápidos (se mantienen los de siempre + algunos gramajes comunes)
const weightOptions = [
  { value: 1, label: '1 kg', fraction: '1' },
  { value: 0.5, label: '1/2 kg', fraction: '1/2' },
  { value: 0.25, label: '1/4 kg', fraction: '1/4' }
]
const quickGrams = [50, 100, 150, 200]

const formatWeight = (kg) => {
  const g = Math.round(kg * 1000)
  return g >= 1000 && g % 1000 === 0 ? `${g / 1000} kg` : g >= 1000 ? `${(g / 1000).toFixed(3).replace(/0+$/, '')} kg` : `${g} g`
}

// Precio según gramos ingresados
const calculatedPrice = computed(() => {
  if (!selectedProductForWeight.value) return '0.00'
  const basePrice = Number(selectedProductForWeight.value.sale_price)
  return (basePrice * selectedWeight.value).toFixed(2)
})

const weightInCart = (productId) =>
  cart.value
    .filter(p => p.id === productId && p.is_weight_product)
    .reduce((sum, p) => sum + p.weight * p.quantity, 0)

const setGrams = (g) => { selectedGrams.value = g }

const openWeightSelector = async (product) => {
  selectedProductForWeight.value = product
  selectedGrams.value = 1000
  showWeightSelector.value = true
  await nextTick()
  gramsInput.value?.focus()
  gramsInput.value?.select()
}

const confirmWeightSelection = () => {
  if (!selectedProductForWeight.value) return

  const product = selectedProductForWeight.value
  const grams = Math.round(Number(selectedGrams.value))

  if (!grams || grams <= 0) {
    toast('warning', 'Ingresa los gramos', 1500)
    return
  }

  const kg = grams / 1000
  const stock = Number(product.stock)
  if (weightInCart(product.id) + kg > stock + 1e-9) {
    toast('warning', `Stock insuficiente (${stock} kg disponibles)`, 2000)
    return
  }

  const priceForWeight = parseFloat((Number(product.sale_price) * kg).toFixed(2))
  const weightLabel = formatWeight(kg)

  const existingItem = cart.value.find(
    p => p.id === product.id && p.weight === kg
  )

  if (existingItem) {
    existingItem.quantity++
  } else {
    cart.value.push({
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
      weight: kg,
      is_weight_product: true,
      quantity: 1
    })
  }

  toast('success', `${product.name} (${weightLabel}) añadido - S/ ${priceForWeight.toFixed(2)}`, 1500)

  showWeightSelector.value = false
  selectedProductForWeight.value = null
}

const cancelWeightSelection = () => {
  showWeightSelector.value = false
  selectedProductForWeight.value = null
  selectedGrams.value = 1000
}

/* =========================
   QR DE PAGO
========================= */
const paymentQRs = ref([])
const selectedQR = computed(() => {
  if (paymentMethod.value !== 'yape' && paymentMethod.value !== 'plin') return null
  if (!paymentQRs.value || paymentQRs.value.length === 0) return null

  return paymentQRs.value.find(qr =>
    qr.method.toLowerCase() === paymentMethod.value.toLowerCase() &&
    (qr.active == 1 || qr.active === true)
  ) || null
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
   REGISTRO RÁPIDO DE PRODUCTO (sin salir del POS)
========================= */
const showQuickCreate = ref(false)
const quickSaving = ref(false)
const quickNameInput = ref(null)
const quickForm = reactive({
  name: '',
  barcode: '',
  sale_price: '',
  unit_type: 'UNIT',
  stock: 1,
  category: ''
})

const resetQuickForm = () => {
  quickForm.name = ''
  quickForm.barcode = ''
  quickForm.sale_price = ''
  quickForm.unit_type = 'UNIT'
  quickForm.stock = 1
  quickForm.category = ''
}

const openQuickCreate = async (barcode = '', name = '') => {
  stopScanner()
  showProductListFallback.value = false
  resetQuickForm()
  quickForm.barcode = barcode || ''
  quickForm.name = name || ''
  showQuickCreate.value = true
  await nextTick()
  quickNameInput.value?.focus()
}

const closeQuickCreate = () => {
  showQuickCreate.value = false
  resetQuickForm()
}

// Al cambiar a "kilos" el stock se interpreta en kg
watch(() => quickForm.unit_type, (type) => {
  if (type === 'WEIGHT' && Number(quickForm.stock) <= 1) quickForm.stock = 10
})

const saveQuickProduct = async () => {
  const name = quickForm.name.trim()
  const price = Number(quickForm.sale_price)
  const stock = Number(quickForm.stock)

  if (!name) return toast('warning', 'Escribe el nombre del producto', 1800)
  if (!price || price <= 0) return toast('warning', 'Ingresa un precio válido', 1800)
  if (!stock || stock <= 0) return toast('warning', 'Ingresa el stock', 1800)

  // Si el código ya existe, no se duplica: se agrega el existente
  const code = quickForm.barcode.trim()
  if (code) {
    const existing = barcodeMap.value.get(normalizeCode(code))
    if (existing) {
      closeQuickCreate()
      toast('info', 'Ese código ya existe, se agregó al carrito', 1800)
      addToCart(existing)
      return
    }
  }

  quickSaving.value = true
  try {
    const { data } = await api.post(PRODUCT_CREATE_ENDPOINT, {
      name,
      barcode: code || null,
      sale_price: price,
      unit_type: quickForm.unit_type,
      stock,
      category: quickForm.category.trim() || null
    })

    // Acepta { product: {...} }, { data: {...} } o el objeto directo
    let created = data?.product || data?.data || data
    if (!created || !created.id) {
      // Respaldo: recarga el catálogo y busca el recién creado
      await loadProducts()
      created = (code && barcodeMap.value.get(normalizeCode(code))) ||
        [...products.value].reverse().find(p => p.name === name)
    } else {
      products.value.push(created)
    }

    closeQuickCreate()

    if (created) {
      toast('success', `${name} registrado`, 1200)
      addToCart(created)
    }
  } catch (err) {
    console.error(err)
    Swal.fire({
      icon: 'error',
      title: 'No se pudo registrar',
      text: err?.response?.data?.message || err?.message || 'Error desconocido'
    })
  } finally {
    quickSaving.value = false
  }
}

/* =========================
   SCANNER CÁMARA (OPTIMIZADO)
   - Detector nativo del navegador con ZXing de respaldo
   - Cámara en alta resolución, enfoque continuo y zoom automático
   - Valida checksum y exige lecturas repetidas (sin falsos positivos)
========================= */
const showScanner = ref(false)
let scanning = false

const torchSupported = ref(false)
const torchOn = ref(false)
const zoomSupported = ref(false)
const zoomMin = ref(1)
const zoomMax = ref(1)
const zoomStep = ref(0.1)
const zoomValue = ref(1)

const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'code_128']
const CONFIRM_READS = 2
const READ_WINDOW_MS = 1200

let stream = null
let videoEl = null
let scanTimer = null
let detector = null
let zxingReader = null
let candidate = null
let candidateCount = 0
let candidateAt = 0
const decodeCanvas = document.createElement('canvas')

const isValidGtin = (code) => {
  if (!/^(\d{8}|\d{12,14})$/.test(code)) return false
  const digits = code.split('').map(Number)
  const check = digits.pop()
  let sum = 0
  digits.reverse().forEach((d, i) => {
    sum += d * (i % 2 === 0 ? 3 : 1)
  })
  return (10 - (sum % 10)) % 10 === check
}

const startScanner = async () => {
  showScanner.value = true
  torchOn.value = false
  candidate = null
  candidateCount = 0
  await nextTick()

  const target = document.querySelector('#scanner')
  if (!target) {
    Swal.fire('Error', 'No se pudo iniciar la cámara', 'error')
    return
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    Swal.fire('Error', 'Tu navegador no permite usar la cámara (se requiere HTTPS)', 'error')
    stopScanner()
    return
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 }
      }
    })

    if (!showScanner.value) {
      stream.getTracks().forEach(t => t.stop())
      stream = null
      return
    }

    videoEl = document.createElement('video')
    videoEl.setAttribute('playsinline', 'true')
    videoEl.muted = true
    videoEl.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;'
    target.appendChild(videoEl)
    videoEl.srcObject = stream
    await videoEl.play()

    await setupTrackCapabilities()

    scanning = true

    // 1) Detector nativo (Chrome/Android)
    if ('BarcodeDetector' in window) {
      try {
        const supported = await window.BarcodeDetector.getSupportedFormats()
        const formats = NATIVE_FORMATS.filter(f => supported.includes(f))
        if (formats.length) {
          detector = new window.BarcodeDetector({ formats })
          loopNative()
          return
        }
      } catch (e) {
        /* se usa ZXing */
      }
    }

    // 2) Respaldo ZXing (iOS/Safari, Firefox, etc.)
    const hints = new Map()
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.CODE_128
    ])
    hints.set(DecodeHintType.TRY_HARDER, true)
    zxingReader = new MultiFormatReader()
    zxingReader.setHints(hints)
    loopZxing()
  } catch (err) {
    console.error(err)
    Swal.fire(
      'Error',
      err?.name === 'NotAllowedError'
        ? 'Permiso de cámara denegado. Actívalo en el navegador.'
        : 'No se pudo abrir la cámara',
      'error'
    )
    stopScanner()
  }
}

const setupTrackCapabilities = async () => {
  const track = stream?.getVideoTracks()[0]
  if (!track) return

  const caps = track.getCapabilities ? track.getCapabilities() : {}

  const advanced = []
  if (caps.focusMode?.includes('continuous')) advanced.push({ focusMode: 'continuous' })
  if (caps.exposureMode?.includes('continuous')) advanced.push({ exposureMode: 'continuous' })
  if (advanced.length) {
    await track.applyConstraints({ advanced }).catch(() => {})
  }

  torchSupported.value = !!caps.torch

  if (caps.zoom) {
    zoomSupported.value = true
    zoomMin.value = caps.zoom.min
    zoomMax.value = caps.zoom.max
    zoomStep.value = caps.zoom.step || 0.1
    const initial = Math.min(Math.max(2, caps.zoom.min), caps.zoom.max)
    zoomValue.value = initial
    await track.applyConstraints({ advanced: [{ zoom: initial }] }).catch(() => {})
  } else {
    zoomSupported.value = false
  }
}

const onZoomInput = async () => {
  const track = stream?.getVideoTracks()[0]
  if (!track) return
  await track.applyConstraints({ advanced: [{ zoom: Number(zoomValue.value) }] }).catch(() => {})
}

const toggleTorch = async () => {
  const track = stream?.getVideoTracks()[0]
  if (!track) return
  torchOn.value = !torchOn.value
  await track.applyConstraints({ advanced: [{ torch: torchOn.value }] }).catch(() => {
    torchOn.value = false
  })
}

const loopNative = async () => {
  if (!scanning) return

  try {
    if (videoEl && videoEl.readyState >= 2) {
      const codes = await detector.detect(videoEl)
      if (codes.length) handleRead(codes[0].rawValue)
    }
  } catch (e) {
    /* frame sin código */
  }

  if (scanning) scanTimer = setTimeout(loopNative, 80)
}

const loopZxing = () => {
  if (!scanning) return

  if (videoEl && videoEl.readyState >= 2 && videoEl.videoWidth) {
    const vw = videoEl.videoWidth
    const vh = videoEl.videoHeight
    const cw = Math.round(vw * 0.9)
    const ch = Math.round(vh * 0.5)
    const sx = Math.round((vw - cw) / 2)
    const sy = Math.round((vh - ch) / 2)
    const scale = Math.min(1, 1280 / cw)

    decodeCanvas.width = Math.round(cw * scale)
    decodeCanvas.height = Math.round(ch * scale)
    const ctx = decodeCanvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(videoEl, sx, sy, cw, ch, 0, 0, decodeCanvas.width, decodeCanvas.height)

    try {
      const bitmap = new BinaryBitmap(new HybridBinarizer(new HTMLCanvasElementLuminanceSource(decodeCanvas)))
      const result = zxingReader.decode(bitmap)
      handleRead(result.getText())
    } catch (e) {
      /* frame sin código */
    }
  }

  if (scanning) scanTimer = setTimeout(loopZxing, 90)
}

const handleRead = (raw) => {
  const code = String(raw || '').trim()
  if (!code) return

  if (/^\d+$/.test(code)) {
    if (!isValidGtin(code)) return
  } else if (code.length < 4) {
    return
  }

  const now = Date.now()
  if (code === candidate && now - candidateAt <= READ_WINDOW_MS) {
    candidateCount += 1
  } else {
    candidate = code
    candidateCount = 1
  }
  candidateAt = now

  if (candidateCount >= CONFIRM_READS) {
    candidateCount = 0
    onDetected({ codeResult: { code } })
  }
}

const stopScanner = () => {
  scanning = false
  if (scanTimer) clearTimeout(scanTimer)
  scanTimer = null
  candidate = null
  candidateCount = 0

  if (stream) {
    stream.getTracks().forEach(t => t.stop())
    stream = null
  }
  if (videoEl) {
    videoEl.srcObject = null
    videoEl.remove()
    videoEl = null
  }

  detector = null
  zxingReader = null
  showScanner.value = false
}

const onDetected = (data) => {
  if (!data || !data.codeResult) return
  const rawCode = String(data.codeResult.code || '').trim()
  const product = barcodeMap.value.get(normalizeCode(rawCode))

  if (product) {
    if (navigator.vibrate) navigator.vibrate(80)
    stopScanner()
    addToCart(product)
    return
  }

  // Código leído pero no registrado: abre el registro rápido con el código ya cargado
  if (navigator.vibrate) navigator.vibrate([60, 40, 60])
  toast('info', 'Producto nuevo: complétalo y se agrega al carrito', 1800)
  openQuickCreate(rawCode)
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
onBeforeUnmount(() => {
  clearTimeout(searchTimer)
  stopScanner()
})

/* =========================
   CARRITO
========================= */
const addToCart = (product) => {
  if (product.unit_type === 'WEIGHT') {
    openWeightSelector(product)
    return
  }

  const item = cart.value.find(p => p.id === product.id)
  if (item) {
    if (item.quantity < product.stock) {
      item.quantity++
    } else {
      toast('warning', 'Stock máximo alcanzado', 1200)
      return
    }
  } else {
    cart.value.push({
      ...product,
      quantity: 1,
      price: product.sale_price,
      weight: null
    })
  }

  toast('success', `${product.name} añadido`, 1000)
}

const cancelWeightSelectionAndClose = cancelWeightSelection

const removeFromCart = (id) => { cart.value = cart.value.filter(p => p.id !== id) }

/* =========================
   TOTAL
========================= */
const total = computed(() => cart.value.reduce((sum, p) => sum + p.price * p.quantity, 0))

/* =========================
   GUARDAR VENTA EN LA API
========================= */
const saveSale = async ({ customer_name, customer_phone, comment } = {}) => {
  if (!cart.value.length) return Swal.fire('Carrito vacío', 'Agrega productos', 'warning')
  if (loading.value) return
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
          <button class="btn-products btn-new" @click="openQuickCreate()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Nuevo
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

    <Teleport to="body">
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

        <div id="scanner" class="scanner-view">
          <div class="scan-guide"><div class="scan-line"></div></div>
        </div>

        <div v-if="zoomSupported || torchSupported" class="scanner-controls">
          <div v-if="zoomSupported" class="zoom-control">
            <span>Zoom</span>
            <input
              type="range"
              v-model="zoomValue"
              :min="zoomMin"
              :max="zoomMax"
              :step="zoomStep"
              @input="onZoomInput"
            />
          </div>
          <button v-if="torchSupported" type="button" class="torch-btn" :class="{ on: torchOn }" @click="toggleTorch">
            {{ torchOn ? 'Apagar linterna' : 'Linterna' }}
          </button>
        </div>

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
              v-model="searchInput"
              placeholder="Buscar por nombre o código..."
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
              <img v-if="p.image_url" :src="p.image_url" :alt="p.name" loading="lazy" />
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
              <img v-if="p.image_url" :src="p.image_url" :alt="p.name" loading="lazy" />
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

        <!-- Empty State: permite registrar lo que se buscó -->
        <div v-if="filteredProducts.length === 0" class="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
          </svg>
          <p>No se encontraron productos</p>
          <button class="btn-confirm-weight btn-empty-create" @click="openQuickCreate('', searchInput.trim())">
            + Registrar
            <template v-if="searchInput.trim()">"{{ searchInput.trim() }}"</template>
            <template v-else>nuevo producto</template>
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Registro Rápido -->
    <div v-if="showQuickCreate" class="modal-backdrop" @click.self="closeQuickCreate">
      <form class="modal-weight-selector" @submit.prevent="saveQuickProduct">
        <div class="weight-header">
          <div>
            <h3>Registro rápido</h3>
            <p class="weight-subtitle">Se guarda y se agrega al carrito</p>
          </div>
          <button type="button" @click="closeQuickCreate" class="close-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="weight-content quick-form">
          <label class="field">
            <span>Nombre *</span>
            <input ref="quickNameInput" v-model="quickForm.name" type="text" placeholder="Ej: Arroz extra" autocomplete="off" />
          </label>

          <label class="field">
            <span>Código de barras</span>
            <input v-model="quickForm.barcode" type="text" inputmode="numeric" placeholder="Opcional" autocomplete="off" />
          </label>

          <div class="unit-switch">
            <button type="button" :class="{ active: quickForm.unit_type === 'UNIT' }" @click="quickForm.unit_type = 'UNIT'">
              Por unidad
            </button>
            <button type="button" :class="{ active: quickForm.unit_type === 'WEIGHT' }" @click="quickForm.unit_type = 'WEIGHT'">
              Por kilo
            </button>
          </div>

          <div class="field-row">
            <label class="field">
              <span>Precio {{ quickForm.unit_type === 'WEIGHT' ? 'por kg' : '' }} (S/) *</span>
              <input v-model="quickForm.sale_price" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00" />
            </label>
            <label class="field">
              <span>Stock ({{ quickForm.unit_type === 'WEIGHT' ? 'kg' : 'und' }}) *</span>
              <input v-model="quickForm.stock" type="number" inputmode="decimal" min="0" step="any" />
            </label>
          </div>

          <label class="field">
            <span>Categoría</span>
            <input v-model="quickForm.category" type="text" list="quick-categories" placeholder="Opcional" autocomplete="off" />
            <datalist id="quick-categories">
              <option v-for="c in categories.filter(c => c !== 'all')" :key="c" :value="c" />
            </datalist>
          </label>
        </div>

        <div class="weight-actions">
          <button type="button" class="btn-cancel-weight" @click="closeQuickCreate">Cancelar</button>
          <button type="submit" class="btn-confirm-weight" :disabled="quickSaving">
            {{ quickSaving ? 'Guardando...' : 'Guardar y agregar' }}
          </button>
        </div>
      </form>
    </div>

    <!-- Modal Selector de Peso -->
    <div v-if="showWeightSelector" class="modal-backdrop" @click.self="cancelWeightSelection">
      <form class="modal-weight-selector" @submit.prevent="confirmWeightSelection">
        <div class="weight-header">
          <div>
            <h3>{{ selectedProductForWeight?.name }}</h3>
            <p class="weight-subtitle">Ingresa los gramos o elige un atajo</p>
          </div>
          <button type="button" @click="cancelWeightSelection" class="close-btn">
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

          <!-- Entrada en gramos -->
          <label class="grams-input">
            <span>Cantidad en gramos</span>
            <div class="grams-field">
              <input
                ref="gramsInput"
                v-model.number="selectedGrams"
                type="number"
                inputmode="numeric"
                min="1"
                step="1"
                placeholder="0"
              />
              <em>g</em>
            </div>
            <small v-if="selectedGrams > 0">= {{ formatWeight(selectedWeight) }}</small>
          </label>

          <div class="weight-options">
            <button
              type="button"
              v-for="option in weightOptions"
              :key="option.value"
              @click="setGrams(option.value * 1000)"
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

          <div class="gram-chips">
            <button
              type="button"
              v-for="g in quickGrams"
              :key="g"
              :class="{ active: selectedGrams === g }"
              @click="setGrams(g)"
            >
              {{ g }} g
            </button>
          </div>

          <div class="calculated-price">
            <div class="price-label">Precio a pagar:</div>
            <div class="price-value">S/ {{ calculatedPrice }}</div>
          </div>
        </div>

        <div class="weight-actions">
          <button type="button" class="btn-cancel-weight" @click="cancelWeightSelection">
            Cancelar
          </button>
          <button type="submit" class="btn-confirm-weight">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Agregar al carrito
          </button>
        </div>
      </form>
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
    </Teleport>
  </div>
</template>

<style>
/* Las alertas de SweetAlert2 deben quedar por encima de los modales */
.swal2-container {
  z-index: 20000 !important;
}
</style>

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
  flex-wrap: wrap;
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

.btn-new {
  border-color: #10b981;
  color: #047857;
}

.btn-new:hover {
  border-color: #047857;
  color: #047857;
  background: #ecfdf5;
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
  z-index: 9000;
  padding: 20px;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e2e8f0;
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

/* Recuadro guía y línea de escaneo */
.scan-guide {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 85%;
  aspect-ratio: 2 / 1;
  transform: translate(-50%, -50%);
  border: 3px solid rgba(31, 162, 193, 0.95);
  border-radius: 14px;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.35);
  pointer-events: none;
  z-index: 2;
}

.scan-line {
  position: absolute;
  left: 6%;
  right: 6%;
  height: 2px;
  background: #ef4444;
  box-shadow: 0 0 8px #ef4444;
  animation: scan-move 1.6s ease-in-out infinite;
}

@keyframes scan-move {
  0% { top: 10%; }
  50% { top: 90%; }
  100% { top: 10%; }
}

/* Controles zoom / linterna */
.scanner-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 24px 0;
  flex-wrap: wrap;
}

.zoom-control {
  flex: 1;
  min-width: 180px;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  font-weight: 600;
  color: #334155;
}

.zoom-control input[type="range"] {
  flex: 1;
}

.torch-btn {
  background: #f1f5f9;
  color: #0f172a;
  border: none;
  padding: 10px 16px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.torch-btn.on {
  background: #facc15;
  color: #000;
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
  grid-auto-rows: max-content;
  align-content: start;
  gap: 20px;
  padding: 24px;
  overflow-y: auto;
  flex: 1 1 auto;
  min-height: 0;
  max-height: calc(90vh - 260px);
  -webkit-overflow-scrolling: touch;
}

.product-card {
  display: flex;
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
  flex-shrink: 0;
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
  flex-shrink: 0;
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

.btn-empty-create {
  flex: none;
  padding: 14px 24px;
}

/* Responsive móvil: 2 columnas y tarjetas más compactas */
@media (max-width: 640px) {
  .pos-layout {
    padding: 14px;
  }

  .header-actions {
    width: 100%;
  }

  .header-actions button {
    flex: 1;
    justify-content: center;
    padding: 12px 10px;
    font-size: 14px;
    gap: 8px;
  }

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

/* Modal Selector de Peso / Registro rápido */
.modal-weight-selector {
  background: white;
  width: 100%;
  max-width: 450px;
  max-height: 92vh;
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
  flex-shrink: 0;
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
  overflow-y: auto;
  min-height: 0;
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

/* Entrada de gramos */
.grams-input {
  display: block;
  margin-bottom: 16px;
}

.grams-input > span {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 6px;
}

.grams-field {
  display: flex;
  align-items: center;
  background: #f8fafc;
  border: 2px solid #e2e8f0;
  border-radius: 14px;
  padding: 0 16px;
  transition: all 0.2s ease;
}

.grams-field:focus-within {
  border-color: #0b3c5d;
  background: white;
}

.grams-field input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  outline: none;
  font-size: 28px;
  font-weight: 800;
  color: #0f172a;
  padding: 12px 0;
}

.grams-field em {
  font-style: normal;
  font-size: 20px;
  font-weight: 700;
  color: #64748b;
}

.grams-input small {
  display: block;
  margin-top: 6px;
  font-size: 13px;
  color: #64748b;
}

.weight-options {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 12px;
}

.weight-option {
  background: #f8fafc;
  border: 2px solid #e2e8f0;
  border-radius: 14px;
  padding: 14px 10px;
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

.gram-chips {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 20px;
}

.gram-chips button {
  background: #f1f5f9;
  border: 2px solid transparent;
  border-radius: 10px;
  padding: 10px 0;
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
  cursor: pointer;
  transition: all 0.2s ease;
}

.gram-chips button:hover {
  border-color: #0b3c5d;
}

.gram-chips button.active {
  background: #0b3c5d;
  color: white;
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
  flex-shrink: 0;
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

.btn-confirm-weight:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

/* Formulario de registro rápido */
.quick-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field {
  display: block;
  flex: 1;
  min-width: 0;
}

.field > span {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 6px;
}

.field input {
  width: 100%;
  box-sizing: border-box;
  background: #f8fafc;
  border: 2px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px 14px;
  font-size: 16px; /* 16px evita el zoom automático en iOS */
  color: #0f172a;
  outline: none;
  transition: all 0.2s ease;
}

.field input:focus {
  border-color: #0b3c5d;
  background: white;
}

.field-row {
  display: flex;
  gap: 12px;
}

.unit-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  background: #f1f5f9;
  padding: 5px;
  border-radius: 12px;
}

.unit-switch button {
  background: transparent;
  border: none;
  border-radius: 8px;
  padding: 11px 0;
  font-size: 14px;
  font-weight: 700;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s ease;
}

.unit-switch button.active {
  background: white;
  color: #0b3c5d;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}
</style>
