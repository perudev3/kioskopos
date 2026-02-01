<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { Document, Packer, Paragraph, ImageRun, TextRun } from 'docx';
import { supabase } from '../lib/supabase';
import JsBarcode from 'jsbarcode';
import Swal from 'sweetalert2';

onMounted(async () => {
  const { data } = await supabase.from('products').select('*');
  products.value = data || [];
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
      // Canvas final con espacio para el nombre
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      canvas.width = 250;
      canvas.height = 100; // espacio para el nombre + barcode

      // Fondo blanco
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Escribir nombre del producto arriba
      ctx.fillStyle = 'black';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(product.name, canvas.width / 2, 20);

      // Generar el barcode directamente sobre el canvas
      JsBarcode(canvas, product.barcode, {
        format: 'CODE128',
        width: 2,
        height: 60,
        displayValue: true,
        textMargin: 5,
        margin: 0,
      });

      // Convertir a arrayBuffer para docx
      const arrayBuffer = await (await fetch(canvas.toDataURL('image/png'))).arrayBuffer();

      // Agregar al Word
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

  // Crear contenedor HTML para imprimir
  const printWindow = window.open('', '_blank', 'width=800,height=600');
  if (!printWindow) return;

  const html = `
    <html>
      <head>
        <title>Barcodes de Productos</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .product { margin-bottom: 40px; }
          .product-name { font-weight: bold; margin-bottom: 8px; }
          canvas { display: block; margin-top: 5px; }
        </style>
      </head>
      <body>
        ${products.value.map(p => `
          <div class="product">
            <div class="product-name">${p.name}</div>
            <canvas id="barcode-${p.id}"></canvas>
            <div>Código: ${p.barcode}</div>
          </div>
        `).join('')}
      </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();

  // Esperar que se renderice el contenido
  printWindow.onload = () => {
    // Generar todos los barcodes en los canvas
    products.value.forEach(p => {
      if (!p.barcode) return;
      const canvas = printWindow.document.getElementById(`barcode-${p.id}`);
      if (canvas) {
        JsBarcode(canvas, p.barcode, {
          format: 'CODE128',
          width: 2,
          height: 60,
          displayValue: true,
          textMargin: 5,
        });
      }
    });

    // Abrir diálogo de impresión
    printWindow.focus();
    printWindow.print();
  };
};




/* =========================
   FORMULARIO
========================= */
const name = ref('');
const price = ref('');
const sale_price = ref('');
const stock = ref('');
const unit_type = ref('UNIT'); // ✅ NUEVO
const file = ref(null);

const imageFile = ref(null);
const imagePreview = computed(() =>
  imageFile.value ? URL.createObjectURL(imageFile.value) : null
);

const onFileChange = (e) => {
  imageFile.value = e.target.files[0];
  file.value = imageFile.value;
};

/* =========================
   ESTADO GENERAL
========================= */
const products = ref([]);
const showModal = ref(false);
const user = ref(null);
const filterName = ref('');

/* =========================
   EDICIÓN
========================= */
const editingProduct = ref(null);

/* =========================
   CÁLCULO POR PESO / UNIDAD
========================= */
const calculateTotal = (product, quantity) => {
  if (product.unit_type === 'UNIT') {
    return Number(product.sale_price) * Number(quantity);
  }
  return Number(product.sale_price) * Number(quantity);
};

/* =========================
   GUARDAR / ACTUALIZAR
========================= */
const saveProduct = async () => {
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  let productId = editingProduct.value?.id;

  // 🔹 ACTUALIZAR
  if (editingProduct.value) {
    await supabase
      .from('products')
      .update({
        name: name.value,
        price: price.value,
        sale_price: sale_price.value,
        stock: stock.value,
        unit_type: unit_type.value,
      })
      .eq('id', productId);
  }
  // 🔹 CREAR
  else {
    const { data } = await supabase
      .from('products')
      .insert({
        name: name.value,
        price: price.value,
        sale_price: sale_price.value,
        stock: stock.value,
        unit_type: unit_type.value,
        user_id: authUser.id,
        barcode: 'KP-' + Date.now(),
      })
      .select()
      .single();

    productId = data.id;
  }

  // 🔥 SUBIR / ACTUALIZAR IMAGEN
  if (imageFile.value) {
    const imageUrl = await uploadProductImage(imageFile.value, productId);

    await supabase
      .from('products')
      .update({ image_url: imageUrl })
      .eq('id', productId);
  }

  // 🔄 RESET
  name.value = '';
  price.value = '';
  sale_price.value = '';
  stock.value = '';
  unit_type.value = 'UNIT';
  imageFile.value = null;
  editingProduct.value = null;
  showModal.value = false;

  loadProducts();
};

/* =========================
   DESCARGAR BARCODE
========================= */
const downloadBarcode = (product) => {
  const barcodeCanvas = document.createElement('canvas');

  // Generar código de barras en un canvas temporal
  JsBarcode(barcodeCanvas, product.barcode, {
    format: 'CODE128',
    width: 2,
    height: 60,
    displayValue: true,
    textMargin: 5,
  });

  // Canvas final más grande para incluir el nombre
  const finalCanvas = document.createElement('canvas');
  const ctx = finalCanvas.getContext('2d');

  finalCanvas.width = barcodeCanvas.width;
  finalCanvas.height = barcodeCanvas.height + 30; // espacio para el nombre

  // Fondo blanco
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

  // Escribir el nombre del producto arriba
  ctx.fillStyle = 'black';
  ctx.font = '16px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(product.name, finalCanvas.width / 2, 20);

  // Pegar el código de barras debajo del nombre
  ctx.drawImage(barcodeCanvas, 0, 30);

  // Descargar la imagen
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

watch(filteredProducts, async () => {
  await nextTick();

  filteredProducts.value.forEach((p) => {
    if (!p.barcode) return;

    const el = document.getElementById(`barcode-${p.id}`);
    if (el) {
      JsBarcode(el, p.barcode, {
        format: 'CODE128',
        width: 2,
        height: 50,
        displayValue: true,
      });
    }
  });
});


watch(products, async () => {
  await nextTick();

  products.value.forEach((p) => {
    if (!p.barcode) return;

    const el = document.getElementById(`barcode-${p.id}`);
    if (el) {
      JsBarcode(el, p.barcode, {
        format: 'CODE128',
        width: 2,
        height: 50,
        displayValue: true,
      });
    }
  });
});

/* =========================
   CARGAR PRODUCTOS
========================= */
const loadProducts = async () => {
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  user.value = authUser;

  const { data } = await supabase
    .from('products')
    .select('*')
    .eq('user_id', user.value.id)
    .order('created_at', { ascending: false });

  products.value = data || [];

  await nextTick();
  products.value.forEach((p) => {
    if (p.barcode) {
      const el = document.getElementById(`barcode-${p.id}`);
      if (el) {
        JsBarcode(el, p.barcode, {
          format: 'CODE128',
          width: 2,
          height: 50,
          displayValue: true,
        });
      }
    }
  });
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

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', product.id);

  if (error) {
    Swal.fire('Error', 'No se pudo eliminar el producto', 'error');
    console.error(error);
    return;
  }

  Swal.fire('Eliminado', 'Producto eliminado correctamente', 'success');

  loadProducts(); // 🔄 recargar lista
};


const uploadProductImage = async (file, productId) => {
  if (!file) return null;

  const ext = file.name.split('.').pop();
  const filePath = `${productId}.${ext}`;

  const { error } = await supabase.storage
    .from('products')
    .upload(filePath, file, {
      upsert: true,
      contentType: file.type,
    });

  if (error) throw error;

  const { data } = supabase.storage
    .from('products')
    .getPublicUrl(filePath);

  return data.publicUrl;
};



</script>



<template>
  <div class="products-page">
    <div class="header">
      <button class="btn-primary" @click="showModal = true">
        ➕ Agregar
      </button>
      
      <button class="btn-primary" @click="printAllBarcodes">
        🖨️ Imprimir
      </button>
    </div>


    <div class="filter-section">
      <input type="text" v-model="filterName" placeholder="Buscar producto..." />
    </div>

    <div class="product-list-container">
      <div v-if="filteredProducts.length === 0" class="no-products">
        No hay productos registrados
      </div>

      <div class="product-list">
        <div v-for="p in filteredProducts" :key="p.id" class="product-card">
          <div class="img-container">
            <img v-if="p.image_url" :src="p.image_url" />
            <div v-else class="placeholder">Sin imagen</div>
          </div>

          <div class="info">
            <strong>{{ p.name }}</strong>
            <p>Base: S/ {{ p.price }}</p>
            <p>Venta: S/ {{ p.sale_price }}</p>
            <p><strong>Ganancia: S/ {{ getProfit(p) }}</strong></p>
            <small>Stock: {{ p.stock }}</small>
          </div>

          <svg
            v-if="p.barcode"
            :id="`barcode-${p.id}`"
            style="width: 100%"
          ></svg>

          <div class="actions">
            <button class="btn-edit" @click="editProduct(p)">✏️</button>
            <button class="btn-delete" @click="deleteProduct(p)">🗑️</button>
            <button v-if="p.barcode" class="btn-primary" @click="downloadBarcode(p)">
              🖨️
            </button>

          </div>
        </div>
      </div>
    </div>

    <div v-if="showModal" class="modal-backdrop">
      <div class="modal">
        <h2>{{ editingProduct ? 'Editar producto' : 'Registrar producto' }}</h2>

        <input v-model="name" type="text" placeholder="Nombre" />
        <input v-model="price" type="number" placeholder="Precio base" />
        <input v-model="sale_price" type="number" placeholder="Precio venta" />
        <input v-model="stock" type="number" placeholder="Stock" />
        <select v-model="unit_type" class="unit-select">
          <option value="UNIT">Por unidad</option>
          <option value="WEIGHT">Por peso (kilos)</option>
        </select>
        <input
          type="file"
          accept="image/*"
          @change="e => imageFile.value = e.target.files[0]"
        />


        <img v-if="imagePreview" :src="imagePreview" class="preview-img" />

        <button class="btn-primary" @click="saveProduct">Guardar</button>
        <button class="btn-cancel" @click="showModal = false">Cancelar</button>
      </div>
    </div>
  </div>
</template>



<style scoped>
/* ===============================
   KioPOS – Productos (Scroll Correcto)
=============================== */

.products-page {
  height: 100vh;                 /* 🔑 pantalla completa */
  display: flex;
  flex-direction: column;        /* 🔑 layout vertical */
  padding: 20px;
  background: #f3f4f6;
  font-family: 'Segoe UI', sans-serif;
  color: #111827;
  overflow: hidden;              /* 🔑 evita scroll general */
}

/* HEADER ESTÁTICO */
.header {
  display: flex;
  justify-content: space-between; /* 🔑 pone los botones en extremos */
  align-items: center;
  margin-bottom: 16px;
  flex-shrink: 0;
}


/* FILTRO ESTÁTICO */
.filter-section {
  flex-shrink: 0;                /* 🔑 no se mueve */
  margin-bottom: 16px;
}

.filter-section input {
  width: 100%;
  max-width: 360px;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid #d1d5db;
  font-size: 14px;
  outline: none;
}

/* 🔥 ÚNICO ELEMENTO CON SCROLL AJUSTADO */
.product-list-container {
  flex: 1;                       /* ocupa el resto del espacio disponible */
  overflow-y: auto;              /* scroll solo aquí */
  padding-right: 6px;

  /* 🔹 NUEVO: altura máxima menor para móviles */
  max-height: calc(98vh - 199px); /* ajusta según header + filtros + padding */
}

/* OPCIONAL: suavizar scroll */
.product-list-container::-webkit-scrollbar {
  width: 6px;
}

.product-list-container::-webkit-scrollbar-thumb {
  background: rgba(99, 102, 241, 0.5);
  border-radius: 3px;
}

.product-list-container::-webkit-scrollbar-track {
  background: transparent;
}

/* GRID */
.product-list {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}

/* CARD PRODUCTO */
.product-card {
  background: #ffffff;
  border-radius: 14px;
  padding: 14px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* IMAGEN */
.img-container {
  width: 100%;
  height: 140px;
  border-radius: 10px;
  overflow: hidden;
  background: #eef2ff;
  display: flex;
  align-items: center;
  justify-content: center;
}

.img-container img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* INFO */
.info strong {
  font-size: 16px;
  color: #111827;
}

.info small {
  font-size: 13px;
  color: #6b7280;
}

/* ACCIONES */
.actions {
  display: flex;
  gap: 8px;
  margin-top: auto;
}

/* MODAL */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

/* SIN PRODUCTOS */
.no-products {
  text-align: center;
  padding: 30px;
  color: #6b7280;
}

/* RESPONSIVE */
@media (max-width: 480px) {
  .product-list {
    grid-template-columns: 1fr;
  }
}

/* ===============================
   MODAL – REGISTRO / EDICIÓN
=============================== */

.modal {
  background: #ffffff;
  width: 100%;
  max-width: 420px;
  border-radius: 16px;
  padding: 22px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  gap: 14px;
  animation: modalFade 0.25s ease-out;
}

.modal h2 {
  margin: 0 0 10px;
  font-size: 18px;
  font-weight: 600;
  color: #111827;
  text-align: center;
}

/* INPUTS */
.modal input[type="text"],
.modal input[type="number"],
.modal input[type="file"] {
  width: 100%;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid #d1d5db;
  font-size: 14px;
  outline: none;
}

.modal input:focus {
  border-color: #6366f1;
}

/* PREVIEW IMAGEN */
.preview-img {
  width: 100%;
  height: 160px;
  object-fit: cover;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
}

/* BOTONES */
.modal button {
  padding: 10px;
  border-radius: 10px;
  font-size: 14px;
  cursor: pointer;
  border: none;
}

.btn-primary {
  background: #6366f1;
  color: white;
}

.btn-primary:hover {
  background: #4f46e5;
}

.btn-cancel {
  background: #e5e7eb;
  color: #111827;
}

.btn-cancel:hover {
  background: #d1d5db;
}

/* ANIMACIÓN */
@keyframes modalFade {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* ===============================
   SELECT – UNIDAD / PESO
=============================== */

.unit-select {
  width: 100%;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid #d1d5db;
  font-size: 14px;
  background-color: #ffffff;
  color: #111827;
  outline: none;
  cursor: pointer;

  /* quita estilo nativo */
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;

  /* flecha custom */
  background-image: url("data:image/svg+xml,%3Csvg fill='none' stroke='%236366f1' stroke-width='2' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 14px center;
  background-size: 18px;
}

/* hover */
.unit-select:hover {
  border-color: #6366f1;
}

/* focus */
.unit-select:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
}

</style>
