<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { Document, Packer, Paragraph, ImageRun } from 'docx';
import api from '../lib/axios';
import JsBarcode from 'jsbarcode';
import Swal from 'sweetalert2';

onMounted(async () => {
  await loadProducts();
});

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
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      canvas.width = 250;
      canvas.height = 100;

      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = 'black';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(product.name, canvas.width / 2, 20);

      JsBarcode(canvas, product.barcode, {
        format: 'CODE128',
        width: 2,
        height: 60,
        displayValue: true,
        textMargin: 5,
        margin: 0,
      });

      const arrayBuffer = await (await fetch(canvas.toDataURL('image/png'))).arrayBuffer();

      doc.sections[0].children.push(
        new Paragraph({
          children: [new ImageRun({ data: arrayBuffer, transformation: { width: 250, height: 100 } })],
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
        JsBarcode(canvas, p.barcode, {
          format: 'CODE128',
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
const file = ref(null);
const imageFile = ref(null);

const imagePreview = computed(() => {
  if (imageFile.value) return URL.createObjectURL(imageFile.value);
  if (editingProduct.value && editingProduct.value.image_url) return editingProduct.value.image_url;
  return null;
});

const onFileChange = (e) => {
  imageFile.value = e.target.files[0];
  file.value = imageFile.value;
};

const products = ref([]);
const showModal = ref(false);
const filterName = ref('');
const viewMode = ref('grid');
const editingProduct = ref(null);

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
  }

  try {
    if (isEditing) {
      // Usamos POST con _method si fuera necesario, o ruta específica de actualización en Laravel
      await api.post(`/products/${editingProduct.value.id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    } else {
      await api.post('/products', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    }

    name.value = '';
    price.value = '';
    sale_price.value = '';
    stock.value = '';
    unit_type.value = 'UNIT';
    imageFile.value = null;
    editingProduct.value = null;
    showModal.value = false;

    await loadProducts();
    
    Swal.fire(
      'Éxito',
      isEditing ? 'Producto actualizado' : 'Producto registrado',
      'success'
    );
  } catch (error) {
    console.error('Error guardando producto:', error);
    Swal.fire('Error', error.response?.data?.message || 'No se pudo guardar el producto', 'error');
  }
};

/* =========================
   DESCARGAR BARCODE
========================= */
const downloadBarcode = (product) => {
  const barcodeCanvas = document.createElement('canvas');

  JsBarcode(barcodeCanvas, product.barcode, {
    format: 'CODE128',
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
  editingProduct.value = product;
  name.value = product.name;
  price.value = product.price;
  sale_price.value = product.sale_price;
  stock.value = product.stock;
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
        JsBarcode(el, p.barcode, {
          format: 'CODE128',
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
          <button @click="showModal = true" class="btn-add">
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
    <div v-if="showModal" class="modal-backdrop" @click.self="showModal = false; editingProduct = null; imageFile = null">
      <div class="modal">
        <div class="modal-header">
          <h3>{{ editingProduct ? 'Editar Producto' : 'Nuevo Producto' }}</h3>
          <button @click="showModal = false; editingProduct = null; imageFile = null" class="close-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <form @submit.prevent="saveProduct" class="modal-body">
          <div class="form-group">
            <label>Nombre del producto</label>
            <input v-model="name" type="text" placeholder="Ej: Coca Cola 500ml" required />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Precio base</label>
              <input v-model="price" type="number" step="0.01" placeholder="0.00" required />
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

          <div class="modal-actions">
            <button type="submit" class="btn-confirm">
              {{ editingProduct ? 'Actualizar' : 'Guardar' }}
            </button>
            <button type="button" @click="showModal = false; editingProduct = null; imageFile = null" class="btn-cancel-modal">
              Cancelar
            </button>
          </div>
        </form>
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

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
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