<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { Document, Packer, Paragraph, ImageRun } from 'docx';
import api from '../lib/axios';
import JsBarcode from 'jsbarcode';
import Swal from 'sweetalert2';
import {
  MultiFormatReader,
  BinaryBitmap,
  HybridBinarizer,
  HTMLCanvasElementLuminanceSource,
  DecodeHintType,
  BarcodeFormat,
} from '@zxing/library';

onMounted(async () => {
  await loadProducts();
  window.addEventListener('keydown', onWindowKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown);
  stopScanner();
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value);
});

/* =========================
   UTILIDADES
========================= */
const toast = (icon, title) =>
  Swal.fire({
    toast: true,
    position: 'top',
    icon,
    title,
    showConfirmButton: false,
    timer: 2600,
  });

// Usa el formato nativo (EAN13/EAN8/UPC) para códigos de envoltorio y CODE128 para los internos KP-
const renderBarcode = (el, code, options = {}) => {
  const value = String(code);
  const format = /^\d{13}$/.test(value)
    ? 'EAN13'
    : /^\d{8}$/.test(value)
    ? 'EAN8'
    : /^\d{12}$/.test(value)
    ? 'UPC'
    : 'CODE128';

  try {
    JsBarcode(el, value, { format, ...options });
  } catch (e) {
    JsBarcode(el, value, { format: 'CODE128', ...options });
  }
};

const isValidGtin = (code) => {
  if (!/^(\d{8}|\d{12,14})$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop();
  let sum = 0;
  digits.reverse().forEach((d, i) => {
    sum += d * (i % 2 === 0 ? 3 : 1);
  });
  return (10 - (sum % 10)) % 10 === check;
};

const beep = () => {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 1000;
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, 120);
  } catch (e) {
    /* sin audio */
  }
  if (navigator.vibrate) navigator.vibrate(80);
};

/* =========================
   DESCARGA MASIVA DE BARCODES EN WORD
========================= */
const downloadAllBarcodesWord = async () => {
  if (!products.value || products.value.length === 0) {
    Swal.fire('No hay productos', 'Primero debes cargar productos para descargar los barcodes.', 'info');
    return;
  }

  const doc = new Document({
    sections: [{ properties: {}, children: [] }]
  });

  for (const product of products.value) {
    if (!product.barcode) continue;

    try {
      const barcodeCanvas = document.createElement('canvas');
      renderBarcode(barcodeCanvas, product.barcode, {
        width: 2,
        height: 60,
        displayValue: true,
        textMargin: 5,
        margin: 10,
      });

      const finalCanvas = document.createElement('canvas');
      const ctx = finalCanvas.getContext('2d');
      finalCanvas.width = Math.max(barcodeCanvas.width, 250);
      finalCanvas.height = barcodeCanvas.height + 30;

      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

      ctx.fillStyle = 'black';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(product.name, finalCanvas.width / 2, 20, finalCanvas.width - 10);

      ctx.drawImage(barcodeCanvas, (finalCanvas.width - barcodeCanvas.width) / 2, 30);

      const arrayBuffer = await (await fetch(finalCanvas.toDataURL('image/png'))).arrayBuffer();

      doc.sections[0].children.push(
        new Paragraph({
          children: [
            new ImageRun({
              type: 'png',
              data: arrayBuffer,
              transformation: { width: finalCanvas.width, height: finalCanvas.height },
            }),
          ],
          spacing: { after: 400 }
        })
      );

    } catch (error) {
      console.error('Error generando barcode para', product.name, error);
    }
  }

  const blob = await Packer.toBlob(doc);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `Barcodes_Productos.docx`;
  link.click();
};

const printAllBarcodes = async () => {
  if (!products.value || products.value.length === 0) {
    Swal.fire('No hay productos', 'Primero debes cargar productos para imprimir los barcodes.', 'info');
    return;
  }

  const printWindow = window.open('', '_blank', 'width=800,height=600');
  if (!printWindow) return;

  const html = `
    <html>
      <head>
        <title>Códigos de Barras - Productos</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          @page { size: A4; margin: 10mm; }
          body { font-family: Arial, sans-serif; background: white; }
          .page-container { width: 100%; padding: 10mm; }
          .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8mm; page-break-inside: avoid; }
          .barcode-card { border: 2px solid #333; padding: 8mm; background: white; page-break-inside: avoid; display: flex; flex-direction: column; align-items: center; min-height: 120mm; justify-content: space-between; }
          .product-info { width: 100%; text-align: center; margin-bottom: 4mm; }
          .product-name { font-size: 14pt; font-weight: bold; color: #000; margin-bottom: 3mm; word-wrap: break-word; line-height: 1.3; }
          .product-details { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm; width: 100%; margin-top: 3mm; padding: 3mm; background: #f5f5f5; border-radius: 3mm; }
          .detail-item { text-align: left; font-size: 10pt; }
          .detail-label { color: #666; font-size: 9pt; display: block; margin-bottom: 1mm; }
          .detail-value { font-weight: bold; color: #000; font-size: 11pt; }
          .barcode-container { width: 100%; display: flex; justify-content: center; align-items: center; margin: 4mm 0; }
          canvas { max-width: 100%; height: auto; }
          .barcode-code { text-align: center; font-size: 9pt; color: #666; margin-top: 2mm; font-family: 'Courier New', monospace; }
          .page-break { page-break-after: always; }
          @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        </style>
      </head>
      <body>
        <div class="page-container">
          ${generateBarcodePages()}
        </div>
      </body>
    </html>
  `;

  function generateBarcodePages() {
    let htmlContent = '';
    const itemsPerPage = 4;
    
    for (let i = 0; i < products.value.length; i += itemsPerPage) {
      const pageProducts = products.value.slice(i, i + itemsPerPage);
      
      htmlContent += '<div class="grid">';
      
      pageProducts.forEach(p => {
        htmlContent += `
          <div class="barcode-card">
            <div class="product-info">
              <div class="product-name">${p.name}</div>
            </div>
            <div class="barcode-container">
              <canvas id="barcode-${p.id}"></canvas>
            </div>
            <div class="barcode-code">Código: ${p.barcode}</div>
            <div class="product-details">
              <div class="detail-item">
                <span class="detail-label">Precio Base</span>
                <span class="detail-value">S/ ${Number(p.price).toFixed(2)}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Precio Venta</span>
                <span class="detail-value" style="color: #1976d2;">S/ ${Number(p.sale_price).toFixed(2)}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Stock</span>
                <span class="detail-value">${p.stock} ${p.unit_type === 'WEIGHT' ? 'kg' : 'und'}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Ganancia</span>
                <span class="detail-value" style="color: #2e7d32;">S/ ${(Number(p.sale_price) - Number(p.price)).toFixed(2)}</span>
              </div>
            </div>
          </div>
        `;
      });
      
      htmlContent += '</div>';
      
      if (i + itemsPerPage < products.value.length) {
        htmlContent += '<div class="page-break"></div>';
      }
    }
    return htmlContent;
  }

  printWindow.document.write(html);
  printWindow.document.close();

  printWindow.onload = () => {
    products.value.forEach(p => {
      if (!p.barcode) return;
      const canvas = printWindow.document.getElementById(`barcode-${p.id}`);
      if (canvas) {
        renderBarcode(canvas, p.barcode, {
          width: 2,
          height: 70,
          displayValue: false,
          margin: 5,
        });
      }
    });

    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 500);
  };
};

/* =========================
   FORMULARIO Y ESTADO
========================= */
const name = ref('');
const price = ref('');
const sale_price = ref('');
const stock = ref('');
const unit_type = ref('UNIT');
const barcode = ref('');
const originalBarcode = ref(''); // código que tenía el producto al abrir la edición
const file = ref(null);
const imageFile = ref(null);
const remoteImageUrl = ref(null); // imagen que vino del catálogo
const catalogNote = ref('');
const keepScanning = ref(true);
const lookupLoading = ref(false);

const barcodeInput = ref(null);
const priceInput = ref(null);

const products = ref([]);
const showModal = ref(false);
const filterName = ref('');
const viewMode = ref('grid');
const editingProduct = ref(null);

const objectUrl = ref(null);
watch(imageFile, (f) => {
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value);
  objectUrl.value = f ? URL.createObjectURL(f) : null;
});

const barcodeChanged = computed(
  () => !!editingProduct.value && barcode.value.trim() !== '' && barcode.value.trim() !== originalBarcode.value
);

const imagePreview = computed(() => {
  if (objectUrl.value) return objectUrl.value;
  if (remoteImageUrl.value) return remoteImageUrl.value;
  if (editingProduct.value && editingProduct.value.image_url) return editingProduct.value.image_url;
  return null;
});

const onFileChange = (e) => {
  imageFile.value = e.target.files[0] || null;
  file.value = imageFile.value;
  if (imageFile.value) remoteImageUrl.value = null;
};

const resetForm = () => {
  name.value = '';
  price.value = '';
  sale_price.value = '';
  stock.value = '';
  unit_type.value = 'UNIT';
  barcode.value = '';
  originalBarcode.value = '';
  imageFile.value = null;
  file.value = null;
  remoteImageUrl.value = null;
  catalogNote.value = '';
  editingProduct.value = null;
};

const closeModal = () => {
  showModal.value = false;
  resetForm();
};

const openNewProductModal = async () => {
  resetForm();
  showModal.value = true;
  await nextTick();
  barcodeInput.value?.focus();
};

/* =========================
   GUARDAR / ACTUALIZAR EN API
========================= */
const saveProduct = async () => {
  const isEditing = !!editingProduct.value;
  const formData = new FormData();
  
  formData.append('name', name.value);
  formData.append('price', price.value);
  formData.append('sale_price', sale_price.value);
  formData.append('stock', stock.value);
  formData.append('unit_type', unit_type.value);

  if (imageFile.value) {
    formData.append('image', imageFile.value);
  } else if (!isEditing && remoteImageUrl.value) {
    formData.append('image_url', remoteImageUrl.value);
  }

  // Nuevo: siempre que haya código. Edición: solo si se cambió por uno nuevo.
  if (barcode.value && (!isEditing || barcode.value.trim() !== originalBarcode.value)) {
    formData.append('barcode', barcode.value.trim());
  }

  try {
    if (isEditing) {
      await api.post(`/products/${editingProduct.value.id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    } else {
      await api.post('/products', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    }

    closeModal();
    await loadProducts();

    if (!isEditing && keepScanning.value) {
      toast('success', 'Producto registrado. Escanea el siguiente');
      startScanner();
    } else {
      Swal.fire(
        'Éxito',
        isEditing ? 'Producto actualizado' : 'Producto registrado',
        'success'
      );
    }
  } catch (error) {
    console.error('Error guardando producto:', error);
    const errors = error.response?.data?.errors;
    const firstError = errors ? Object.values(errors)[0]?.[0] : null;
    Swal.fire('Error', firstError || error.response?.data?.message || 'No se pudo guardar el producto', 'error');
  }
};

/* =========================
   CONSULTA POR CÓDIGO DE BARRAS
========================= */
const fetchLookup = async (code) => {
  lookupLoading.value = true;
  try {
    const { data } = await api.get(`/products/lookup/${encodeURIComponent(code)}`);
    return data;
  } catch (error) {
    console.error('Error consultando código:', error);
    toast('info', 'No se pudo consultar el catálogo. Completa los datos manualmente');
    return null;
  } finally {
    lookupLoading.value = false;
  }
};

const lookupFromForm = async () => {
  const code = barcode.value.trim();
  if (!code) return;

  const data = await fetchLookup(code);

  // Modo edición: solo se valida que el código nuevo no pertenezca a otro producto
  if (editingProduct.value) {
    if (data?.exists && data.product.id !== editingProduct.value.id) {
      await Swal.fire({
        title: 'Código ya en uso',
        text: `Ese código pertenece a "${data.product.name}".`,
        icon: 'warning',
      });
      barcode.value = originalBarcode.value;
      catalogNote.value = '';
    } else if (data) {
      catalogNote.value =
        code !== originalBarcode.value ? 'Código nuevo disponible. Se actualizará al guardar.' : '';
    }
    return;
  }

  if (data?.exists) {
    const r = await Swal.fire({
      title: 'Producto ya registrado',
      text: `${data.product.name} — Stock actual: ${data.product.stock}`,
      icon: 'info',
      showCancelButton: true,
      confirmButtonText: 'Editar / actualizar stock',
      cancelButtonText: 'Cerrar',
    });

    if (r.isConfirmed) {
      const existing = data.product;
      closeModal();
      editProduct(existing);
    } else {
      barcode.value = '';
    }
    return;
  }

  if (data?.external) {
    if (!name.value) name.value = data.external.name;
    if (!imageFile.value && data.external.image_url) remoteImageUrl.value = data.external.image_url;
    catalogNote.value = 'Datos cargados del catálogo. Completa precio base, precio de venta y stock.';
    await nextTick();
    priceInput.value?.focus();
  } else if (data) {
    catalogNote.value = 'Código no encontrado en el catálogo. Ingresa el nombre y los precios.';
  }
};

// Punto de entrada único: cámara, pistola USB/Bluetooth o campo manual
const handleScannedCode = async (code) => {
  // Si el modal ya está abierto (nuevo o edición) se usa; si no, se abre uno nuevo
  if (!showModal.value) await openNewProductModal();
  barcode.value = String(code).trim();
  await lookupFromForm();
};

/* =========================
   LECTOR POR PISTOLA (teclado) FUERA DE UN INPUT
========================= */
let wedgeBuffer = '';
let wedgeLast = 0;

const onWindowKeydown = (e) => {
  if (showScanner.value || Swal.isVisible()) return;

  const tag = (e.target?.tagName || '').toLowerCase();
  if (['input', 'textarea', 'select'].includes(tag)) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  const now = Date.now();
  if (now - wedgeLast > 60) wedgeBuffer = '';
  wedgeLast = now;

  if (e.key === 'Enter') {
    if (wedgeBuffer.length >= 6) {
      const code = wedgeBuffer;
      wedgeBuffer = '';
      handleScannedCode(code);
    }
    wedgeBuffer = '';
    return;
  }

  if (e.key.length === 1) wedgeBuffer += e.key;
};

/* =========================
   ESCÁNER POR CÁMARA
========================= */
const showScanner = ref(false);
const scannerError = ref('');
const videoEl = ref(null);
const torchSupported = ref(false);
const torchOn = ref(false);
const zoomSupported = ref(false);
const zoomMin = ref(1);
const zoomMax = ref(1);
const zoomStep = ref(0.1);
const zoomValue = ref(1);

const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'code_128'];
const CONFIRM_READS = 2;       // lecturas iguales seguidas para dar el código por bueno
const READ_WINDOW_MS = 1200;   // ventana máxima entre lecturas

let stream = null;
let scanTimer = null;
let stopped = true;
let detector = null;
let zxingReader = null;
let candidate = null;
let candidateCount = 0;
let candidateAt = 0;
const decodeCanvas = document.createElement('canvas');

const startScanner = async () => {
  scannerError.value = '';
  torchOn.value = false;
  candidate = null;
  candidateCount = 0;
  showScanner.value = true;
  await nextTick();

  if (!navigator.mediaDevices?.getUserMedia) {
    scannerError.value = 'Tu navegador no permite usar la cámara. Usa HTTPS o escribe el código manualmente.';
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 },
      },
    });

    const video = videoEl.value;
    video.srcObject = stream;
    video.setAttribute('playsinline', 'true');
    await video.play();

    await setupTrackCapabilities();

    stopped = false;

    // 1) Detector nativo (Chrome/Android): el más rápido y preciso
    if ('BarcodeDetector' in window) {
      try {
        const supported = await window.BarcodeDetector.getSupportedFormats();
        const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
        if (formats.length) {
          detector = new window.BarcodeDetector({ formats });
          loopNative();
          return;
        }
      } catch (e) {
        /* se usa ZXing */
      }
    }

    // 2) Respaldo ZXing (iOS/Safari, Firefox, etc.)
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.CODE_128,
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    zxingReader = new MultiFormatReader();
    zxingReader.setHints(hints);
    loopZxing();
  } catch (error) {
    console.error('Error iniciando cámara:', error);
    scannerError.value =
      error?.name === 'NotAllowedError'
        ? 'Permiso de cámara denegado. Actívalo en el navegador e intenta de nuevo.'
        : 'No se pudo iniciar la cámara.';
  }
};

// Enfoque continuo + zoom inicial para no tener que acercar tanto el celular
const setupTrackCapabilities = async () => {
  const track = stream?.getVideoTracks()[0];
  if (!track) return;

  const caps = track.getCapabilities ? track.getCapabilities() : {};

  const advanced = [];
  if (caps.focusMode?.includes('continuous')) advanced.push({ focusMode: 'continuous' });
  if (caps.exposureMode?.includes('continuous')) advanced.push({ exposureMode: 'continuous' });
  if (advanced.length) {
    await track.applyConstraints({ advanced }).catch(() => {});
  }

  torchSupported.value = !!caps.torch;

  if (caps.zoom) {
    zoomSupported.value = true;
    zoomMin.value = caps.zoom.min;
    zoomMax.value = caps.zoom.max;
    zoomStep.value = caps.zoom.step || 0.1;
    const initial = Math.min(Math.max(2, caps.zoom.min), caps.zoom.max);
    zoomValue.value = initial;
    await track.applyConstraints({ advanced: [{ zoom: initial }] }).catch(() => {});
  } else {
    zoomSupported.value = false;
  }
};

const onZoomInput = async () => {
  const track = stream?.getVideoTracks()[0];
  if (!track) return;
  await track.applyConstraints({ advanced: [{ zoom: Number(zoomValue.value) }] }).catch(() => {});
};

const toggleTorch = async () => {
  const track = stream?.getVideoTracks()[0];
  if (!track) return;
  torchOn.value = !torchOn.value;
  await track.applyConstraints({ advanced: [{ torch: torchOn.value }] }).catch(() => {
    torchOn.value = false;
  });
};

const loopNative = async () => {
  if (stopped) return;
  const video = videoEl.value;

  try {
    if (video && video.readyState >= 2) {
      const codes = await detector.detect(video);
      if (codes.length) handleRead(codes[0].rawValue);
    }
  } catch (e) {
    /* frame sin código */
  }

  if (!stopped) scanTimer = setTimeout(loopNative, 80);
};

const loopZxing = () => {
  if (stopped) return;
  const video = videoEl.value;

  if (video && video.readyState >= 2 && video.videoWidth) {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    // Región central: menos ruido y decodificación más rápida
    const cw = Math.round(vw * 0.9);
    const ch = Math.round(vh * 0.5);
    const sx = Math.round((vw - cw) / 2);
    const sy = Math.round((vh - ch) / 2);
    const scale = Math.min(1, 1280 / cw);

    decodeCanvas.width = Math.round(cw * scale);
    decodeCanvas.height = Math.round(ch * scale);
    const ctx = decodeCanvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, sx, sy, cw, ch, 0, 0, decodeCanvas.width, decodeCanvas.height);

    try {
      const bitmap = new BinaryBitmap(new HybridBinarizer(new HTMLCanvasElementLuminanceSource(decodeCanvas)));
      const result = zxingReader.decode(bitmap);
      handleRead(result.getText());
    } catch (e) {
      /* NotFoundException: frame sin código */
    }
  }

  if (!stopped) scanTimer = setTimeout(loopZxing, 90);
};

// Valida el checksum y exige lecturas repetidas para evitar falsos positivos
const handleRead = (raw) => {
  const code = String(raw || '').trim();
  if (!code) return;

  if (/^\d+$/.test(code)) {
    if (!isValidGtin(code)) return;
  } else if (code.length < 4) {
    return;
  }

  const now = Date.now();
  if (code === candidate && now - candidateAt <= READ_WINDOW_MS) {
    candidateCount += 1;
  } else {
    candidate = code;
    candidateCount = 1;
  }
  candidateAt = now;

  if (candidateCount >= CONFIRM_READS) {
    onScanSuccess(code);
  }
};

const onScanSuccess = async (code) => {
  beep();
  stopScanner();
  await handleScannedCode(code);
};

const stopScanner = () => {
  stopped = true;
  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = null;
  candidate = null;
  candidateCount = 0;

  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  if (videoEl.value) videoEl.value.srcObject = null;

  detector = null;
  zxingReader = null;
  showScanner.value = false;
};

/* =========================
   DESCARGAR BARCODE
========================= */
const downloadBarcode = (product) => {
  const barcodeCanvas = document.createElement('canvas');

  renderBarcode(barcodeCanvas, product.barcode, {
    width: 2,
    height: 60,
    displayValue: true,
    textMargin: 5,
  });

  const finalCanvas = document.createElement('canvas');
  const ctx = finalCanvas.getContext('2d');

  finalCanvas.width = barcodeCanvas.width;
  finalCanvas.height = barcodeCanvas.height + 30;

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

  ctx.fillStyle = 'black';
  ctx.font = '16px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(product.name, finalCanvas.width / 2, 20);

  ctx.drawImage(barcodeCanvas, 0, 30);

  const link = document.createElement('a');
  link.href = finalCanvas.toDataURL('image/png');
  link.download = `${product.barcode}.png`;
  link.click();
};

/* =========================
   GANANCIA
========================= */
const getProfit = (p) => {
  if (!p.sale_price || !p.price) return 0;
  return Math.round((Number(p.sale_price) - Number(p.price)) * 100) / 100;
};

const getProfitPercentage = (p) => {
  if (!p.price || Number(p.price) === 0) return 0;
  return Math.round((getProfit(p) / Number(p.price)) * 100);
};

const editProduct = (product) => {
  resetForm();
  editingProduct.value = product;
  name.value = product.name;
  price.value = product.price;
  sale_price.value = product.sale_price;
  stock.value = product.stock;
  barcode.value = product.barcode || '';
  originalBarcode.value = product.barcode || '';
  unit_type.value = product.unit_type || 'UNIT';
  showModal.value = true;
};

/* =========================
   FILTRO
========================= */
const filteredProducts = computed(() =>
  products.value.filter((p) =>
    p.name.toLowerCase().includes(filterName.value.toLowerCase())
  )
);

const totalProducts = computed(() => products.value.length);

/* =========================
   GENERAR BARCODES
========================= */
const generateBarcodes = async () => {
  await nextTick();
  
  filteredProducts.value.forEach((p) => {
    if (!p.barcode) return;

    const el = document.getElementById(`barcode-${p.id}`);
    if (el) {
      try {
        renderBarcode(el, p.barcode, {
          width: 2,
          height: 50,
          displayValue: true,
        });
      } catch (error) {
        console.error('Error generando barcode:', error);
      }
    }
  });
};

watch(filteredProducts, () => {
  generateBarcodes();
});

watch(viewMode, () => {
  generateBarcodes();
});

/* =========================
   CARGAR PRODUCTOS DESDE API
========================= */
const loadProducts = async () => {
  try {
    const response = await api.get('/products');
    products.value = response.data.products || [];
    await generateBarcodes();
  } catch (error) {
    console.error('Error cargando productos:', error);
  }
};

/* =========================
   ELIMINAR PRODUCTO
========================= */
const deleteProduct = async (product) => {
  const confirm = await Swal.fire({
    title: '¿Eliminar producto?',
    text: `Se eliminará "${product.name}" definitivamente`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#ef4444',
  });

  if (!confirm.isConfirmed) return;

  try {
    await api.delete(`/products/${product.id}`);
    Swal.fire('Eliminado', 'Producto eliminado correctamente', 'success');
    loadProducts();
  } catch (error) {
    Swal.fire('Error', 'No se pudo eliminar el producto', 'error');
  }
};
</script>

<template>
  <div class="page">
    <div class="container">
      <!-- Header -->
      <div class="page-header">
        <div class="header-content">
          <h2>Productos</h2>
          <p class="subtitle">{{ totalProducts }} productos en inventario</p>
        </div>
        <div class="header-actions">
          <button @click="startScanner" class="btn-scan" title="Escanear código de barras">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 7V5a2 2 0 0 1 2-2h2"></path>
              <path d="M17 3h2a2 2 0 0 1 2 2v2"></path>
              <path d="M21 17v2a2 2 0 0 1-2 2h-2"></path>
              <path d="M7 21H5a2 2 0 0 1-2-2v-2"></path>
              <line x1="7" y1="8" x2="7" y2="16"></line>
              <line x1="11" y1="8" x2="11" y2="16"></line>
              <line x1="15" y1="8" x2="15" y2="16"></line>
            </svg>
            <span>Escanear</span>
          </button>
          <button @click="openNewProductModal" class="btn-add">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>Nuevo</span>
          </button>
          <button @click="printAllBarcodes" class="btn-secondary" title="Imprimir todos los códigos de barras">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 6 2 18 2 18 9"></polyline>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
              <rect x="6" y="14" width="12" height="8"></rect>
            </svg>
          </button>
          <button @click="downloadAllBarcodesWord" class="btn-secondary" title="Descargar Word">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
          </button>
        </div>
      </div>

      <!-- Filtros y vista -->
      <div class="toolbar">
        <div class="search-box">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
          </svg>
          <input 
            type="text" 
            v-model="filterName" 
            placeholder="Buscar productos..."
          />
        </div>

        <div class="view-toggles">
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

      <!-- Empty state -->
      <div v-if="filteredProducts.length === 0" class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="1" y="3" width="15" height="13"></rect>
          <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
          <circle cx="5.5" cy="18.5" r="2.5"></circle>
          <circle cx="18.5" cy="18.5" r="2.5"></circle>
        </svg>
        <p>No hay productos registrados</p>
      </div>

      <!-- Grid view -->
      <div v-else-if="viewMode === 'grid'" class="products-grid">
        <div v-for="p in filteredProducts" :key="p.id" class="product-card">
          <div class="product-image">
            <img v-if="p.image_url" :src="p.image_url" :alt="p.name" />
            <div v-else class="image-placeholder">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
            </div>
            <div class="stock-badge" :class="{ low: p.stock < 10 }">
              {{ p.stock }} {{ p.unit_type === 'WEIGHT' ? 'kg' : 'und' }}
            </div>
          </div>

          <div class="product-body">
            <h3 class="product-name">{{ p.name }}</h3>
            
            <div class="product-prices">
              <div class="price-item">
                <span class="price-label">Base</span>
                <span class="price-value">S/ {{ p.price }}</span>
              </div>
              <div class="price-item">
                <span class="price-label">Venta</span>
                <span class="price-value primary">S/ {{ p.sale_price }}</span>
              </div>
            </div>
            <svg v-if="p.barcode" :id="`barcode-${p.id}`" class="barcode"></svg>

            <div class="product-actions">
              <button @click="editProduct(p)" class="action-btn edit" title="Editar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button v-if="p.barcode" @click="downloadBarcode(p)" class="action-btn download" title="Descargar código de barras">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </button>
              <button @click="deleteProduct(p)" class="action-btn delete" title="Eliminar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- List view -->
      <div v-else class="products-list">
        <div v-for="p in filteredProducts" :key="p.id" class="product-row">
          <div class="row-image">
            <img v-if="p.image_url" :src="p.image_url" :alt="p.name" />
            <div v-else class="image-placeholder-small">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
            </div>
          </div>

          <div class="row-content">
            <div class="row-main">
              <h4>{{ p.name }}</h4>
              <div class="row-details">
                <span class="detail-badge">{{ p.stock }} {{ p.unit_type === 'WEIGHT' ? 'kg' : 'und' }}</span>
                <span class="detail-price">Base: S/ {{ p.price }}</span>
                <span class="detail-price">Venta: S/ {{ p.sale_price }}</span>
                <span class="detail-profit">+S/ {{ getProfit(p) }} ({{ getProfitPercentage(p) }}%)</span>
              </div>
              <svg v-if="p.barcode" :id="`barcode-${p.id}`" class="barcode-list"></svg>
            </div>
            
            <div class="row-actions">
              <button @click="editProduct(p)" class="action-btn-small edit">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button v-if="p.barcode" @click="downloadBarcode(p)" class="action-btn-small print">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </button>
              <button @click="deleteProduct(p)" class="action-btn-small delete">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal -->
    <div v-if="showModal" class="modal-backdrop" @click.self="closeModal">
      <div class="modal">
        <div class="modal-header">
          <h3>{{ editingProduct ? 'Editar Producto' : 'Nuevo Producto' }}</h3>
          <button @click="closeModal" class="close-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <form @submit.prevent="saveProduct" class="modal-body">
          <!-- Código de barras: escaneado, escrito o por pistola -->
          <div class="form-group">
            <label>Código de barras</label>
            <div class="barcode-input-row">
              <input
                ref="barcodeInput"
                v-model.trim="barcode"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                placeholder="Escanea o escribe el código y presiona Enter"
                @keydown.enter.prevent="lookupFromForm"
              />
              <button
                type="button"
                class="btn-scan-inline"
                title="Escanear con la cámara"
                @click="startScanner"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 7V5a2 2 0 0 1 2-2h2"></path>
                  <path d="M17 3h2a2 2 0 0 1 2 2v2"></path>
                  <path d="M21 17v2a2 2 0 0 1-2 2h-2"></path>
                  <path d="M7 21H5a2 2 0 0 1-2-2v-2"></path>
                  <line x1="7" y1="8" x2="7" y2="16"></line>
                  <line x1="11" y1="8" x2="11" y2="16"></line>
                  <line x1="15" y1="8" x2="15" y2="16"></line>
                </svg>
              </button>
            </div>
            <small v-if="lookupLoading" class="hint">Buscando producto...</small>
            <small v-else-if="catalogNote" class="hint">{{ catalogNote }}</small>
            <small v-else-if="!editingProduct" class="hint">Si lo dejas vacío, se genera un código interno.</small>
            <small v-else class="hint">Escanea el código nuevo para reemplazar el actual. Si lo dejas vacío, se mantiene el actual.</small>
            <small v-if="barcodeChanged" class="hint warn">Al cambiar el código, las etiquetas impresas con el código anterior dejarán de servir.</small>
          </div>

          <div class="form-group">
            <label>Nombre del producto</label>
            <input v-model="name" type="text" placeholder="Ej: Coca Cola 500ml" required />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Precio base</label>
              <input ref="priceInput" v-model="price" type="number" step="0.01" placeholder="0.00" required />
            </div>
            <div class="form-group">
              <label>Precio venta</label>
              <input v-model="sale_price" type="number" step="0.01" placeholder="0.00" required />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Stock inicial</label>
              <input v-model="stock" type="number" step="0.01" placeholder="0" required />
            </div>
            <div class="form-group">
              <label>Tipo de unidad</label>
              <select v-model="unit_type">
                <option value="UNIT">Por unidad</option>
                <option value="WEIGHT">Por peso (kg)</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label>Imagen del producto</label>
            <div class="file-upload">
              <input 
                type="file" 
                accept="image/*" 
                @change="onFileChange"
                id="file-input"
              />
              <label for="file-input" class="file-label">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                <span>{{ imageFile ? 'Cambiar imagen' : 'Seleccionar imagen' }}</span>
              </label>
            </div>
            <img v-if="imagePreview" :src="imagePreview" class="image-preview" />
          </div>

          <label v-if="!editingProduct" class="keep-scanning">
            <input type="checkbox" v-model="keepScanning" />
            <span>Seguir escaneando al guardar</span>
          </label>

          <div class="modal-actions">
            <button type="submit" class="btn-confirm">
              {{ editingProduct ? 'Actualizar' : 'Guardar' }}
            </button>
            <button type="button" @click="closeModal" class="btn-cancel-modal">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Escáner por cámara -->
    <div v-if="showScanner" class="scanner-overlay">
      <div class="scanner-top">
        <span>Apunta al código de barras</span>
        <button type="button" class="scanner-close" @click="stopScanner" title="Cerrar">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="scanner-video-wrap">
        <video ref="videoEl" muted playsinline></video>
        <div class="scan-frame">
          <div class="scan-line"></div>
        </div>
        <p v-if="scannerError" class="scanner-error">{{ scannerError }}</p>
      </div>

      <div class="scanner-bottom">
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
        <p class="scanner-tip">Mantén el código dentro del recuadro, con buena luz. Se registra solo al leerlo.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  background: #f4f6f8;
  padding: 24px;
  font-family: 'Inter', system-ui, sans-serif;
}

.container {
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 16px;
}

.header-content h2 {
  font-size: 28px;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 4px 0;
}

.subtitle {
  color: #64748b;
  font-size: 14px;
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.btn-add {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #0b3c5d;
  color: white;
  border: none;
  padding: 10px 18px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-add:hover {
  background: #1fa2c1;
  transform: translateY(-1px);
}

.btn-scan {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #1fa2c1;
  color: white;
  border: none;
  padding: 10px 18px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-scan:hover {
  background: #0b3c5d;
  transform: translateY(-1px);
}

.btn-secondary {
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  color: #475569;
  border: 1px solid #e2e8f0;
  padding: 10px 14px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-secondary:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 10px;
  background: white;
  padding: 10px 16px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  flex: 1;
  max-width: 400px;
}

.search-box svg {
  color: #94a3b8;
  flex-shrink: 0;
}

.search-box input {
  border: none;
  outline: none;
  flex: 1;
  font-size: 14px;
  color: #0f172a;
}

.view-toggles {
  display: flex;
  gap: 4px;
  background: white;
  padding: 4px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
}

.view-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: #64748b;
  transition: all 0.2s ease;
}

.view-btn:hover {
  background: #f1f5f9;
}

.view-btn.active {
  background: #0b3c5d;
  color: white;
}

.products-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.product-card {
  background: white;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: all 0.2s ease;
}

.product-card:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  transform: translateY(-2px);
}

.product-image {
  position: relative;
  width: 100%;
  height: 200px;
  background: #f1f5f9;
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

.stock-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  background: #10b981;
  color: white;
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
}

.stock-badge.low {
  background: #ef4444;
}

.product-body {
  padding: 16px;
}

.product-name {
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
  margin: 0 0 12px 0;
  line-height: 1.4;
}

.product-prices {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}

.price-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.price-label {
  font-size: 12px;
  color: #64748b;
}

.price-value {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.price-value.primary {
  color: #0b3c5d;
}

.barcode {
  width: 100%;
  height: auto;
  margin: 12px 0;
}

.barcode-list {
  width: 100%;
  max-width: 200px;
  height: auto;
  margin-top: 8px;
}

.product-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-btn.edit {
  background: #dbeafe;
  color: #1e40af;
}

.action-btn.edit:hover {
  background: #bfdbfe;
}

.action-btn.download {
  background: #e0e7ff;
  color: #4338ca;
}

.action-btn.download:hover {
  background: #c7d2fe;
}

.action-btn.delete {
  background: #fee2e2;
  color: #dc2626;
}

.action-btn.delete:hover {
  background: #fecaca;
}

/* List View */
.products-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.product-row {
  display: flex;
  align-items: center;
  background: white;
  border-radius: 14px;
  padding: 14px 20px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.03);
  gap: 20px;
}

.row-image {
  width: 60px;
  height: 60px;
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

.row-content {
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.row-main h4 {
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
  margin: 0 0 4px 0;
}

.row-details {
  display: flex;
  gap: 16px;
  font-size: 14px;
  color: #64748b;
  flex-wrap: wrap;
}

.detail-badge {
  background: #e2e8f0;
  padding: 2px 8px;
  border-radius: 6px;
  font-weight: 600;
  color: #334155;
}

.detail-price {
  font-weight: 600;
  color: #0f172a;
}

.detail-profit {
  color: #16a34a;
  font-weight: 600;
}

.row-actions {
  display: flex;
  gap: 8px;
}

.action-btn-small {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-btn-small.edit { background: #dbeafe; color: #1e40af; }
.action-btn-small.print { background: #e0e7ff; color: #4338ca; }
.action-btn-small.delete { background: #fee2e2; color: #dc2626; }

/* Modal Styles */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal {
  background: white;
  width: 100%;
  max-width: 500px;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
  max-height: 90vh;
  max-height: 90dvh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.modal-header h3 {
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
}

.close-btn {
  background: #f1f5f9;
  border: none;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #64748b;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.close-btn:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.modal-body {
  padding: 24px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.form-group label {
  font-size: 14px;
  font-weight: 600;
  color: #334155;
}

.form-group input,
.form-group select {
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  font-size: 15px;
  outline: none;
  transition: all 0.2s ease;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.form-group input:focus,
.form-group select:focus {
  border-color: #0b3c5d;
  box-shadow: 0 0 0 3px rgba(11, 60, 93, 0.1);
}

.form-group input[readonly] {
  background: #f1f5f9;
  color: #64748b;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.barcode-input-row {
  display: flex;
  gap: 8px;
}

.btn-scan-inline {
  flex-shrink: 0;
  width: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1fa2c1;
  color: white;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-scan-inline:hover {
  background: #0b3c5d;
}

.hint {
  font-size: 12px;
  color: #64748b;
}

.hint.warn {
  color: #b45309;
}

.keep-scanning {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #334155;
  cursor: pointer;
}

.keep-scanning input {
  width: 18px;
  height: 18px;
}

.file-upload {
  position: relative;
  overflow: hidden;
}

.file-upload input[type="file"] {
  display: none;
}

.file-label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 12px;
  background: #f8fafc;
  border: 2px dashed #cbd5e1;
  border-radius: 10px;
  cursor: pointer;
  color: #475569;
  font-weight: 600;
  transition: all 0.2s ease;
}

.file-label:hover {
  background: #f1f5f9;
  border-color: #0b3c5d;
  color: #0b3c5d;
}

.image-preview {
  width: 100%;
  height: 140px;
  object-fit: cover;
  border-radius: 10px;
  margin-top: 8px;
  border: 1px solid #e2e8f0;
}

.modal-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
}

.btn-confirm {
  background: #0b3c5d;
  color: white;
  border: none;
  padding: 14px;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-confirm:hover {
  background: #1fa2c1;
}

.btn-cancel-modal {
  background: #f1f5f9;
  color: #475569;
  border: none;
  padding: 14px;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-cancel-modal:hover {
  background: #e2e8f0;
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

/* =========================
   ESCÁNER
========================= */
.scanner-overlay {
  position: fixed;
  inset: 0;
  background: #000;
  z-index: 1100;
  display: flex;
  flex-direction: column;
}

.scanner-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  color: white;
  font-size: 15px;
  font-weight: 600;
  background: rgba(0, 0, 0, 0.6);
}

.scanner-close {
  background: rgba(255, 255, 255, 0.15);
  color: white;
  border: none;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.scanner-video-wrap {
  position: relative;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.scanner-video-wrap video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.scan-frame {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 85%;
  max-width: 520px;
  aspect-ratio: 2 / 1;
  transform: translate(-50%, -50%);
  border: 3px solid rgba(31, 162, 193, 0.95);
  border-radius: 16px;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
  pointer-events: none;
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

.scanner-error {
  position: absolute;
  left: 16px;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(220, 38, 38, 0.92);
  color: white;
  padding: 14px;
  border-radius: 12px;
  text-align: center;
  font-size: 14px;
}

.scanner-bottom {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px calc(14px + env(safe-area-inset-bottom));
  background: rgba(0, 0, 0, 0.75);
  color: white;
}

.zoom-control {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
}

.zoom-control input[type="range"] {
  flex: 1;
}

.torch-btn {
  background: rgba(255, 255, 255, 0.15);
  color: white;
  border: none;
  padding: 10px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.torch-btn.on {
  background: #facc15;
  color: #000;
}

.scanner-tip {
  margin: 0;
  font-size: 12px;
  color: #cbd5e1;
  text-align: center;
}

/* =========================
   MODAL RESPONSIVE
========================= */
@media (max-width: 600px) {
  .modal-backdrop {
    padding: 10px;
  }

  .modal {
    max-width: 100%;
    max-height: 95vh;
    max-height: 95dvh;
    border-radius: 16px;
  }

  .modal-header {
    padding: 14px 16px;
  }

  .modal-header h3 {
    font-size: 18px;
  }

  .modal-body {
    padding: 16px;
    gap: 14px;
  }

  .form-row {
    grid-template-columns: 1fr;
    gap: 14px;
  }

  .form-group input,
  .form-group select {
    font-size: 16px;
    padding: 11px 12px;
  }

  .image-preview {
    height: 120px;
  }

  .btn-confirm,
  .btn-cancel-modal {
    padding: 12px;
  }
}

@media (max-width: 380px) {
  .modal-backdrop {
    padding: 6px;
  }

  .modal-header {
    padding: 12px;
  }

  .modal-body {
    padding: 12px;
  }
}
</style>