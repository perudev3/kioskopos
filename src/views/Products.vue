<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import { supabase } from '../lib/supabase';
import JsBarcode from 'jsbarcode'; // ✅ AGREGADO

/* =========================
   FORMULARIO (NO TOCADO)
========================= */
const name = ref('');
const price = ref('');
const stock = ref('');
const file = ref(null);

const imageFile = ref(null);
const imagePreview = computed(() =>
  imageFile.value ? URL.createObjectURL(imageFile.value) : null
);

const onFileChange = (e) => {
  imageFile.value = e.target.files[0];
  file.value = imageFile.value;
};

const uploadImage = async () => {
  if (!imageFile.value) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const fileName = `${user.id}/product-${Date.now()}-${imageFile.value.name}`;

  const { error } = await supabase.storage
    .from('products')
    .upload(fileName, imageFile.value, {
      upsert: true,
      contentType: imageFile.value.type,
    });

  if (error) {
    console.error('Error subiendo imagen:', error);
    return null;
  }

  const { data } = supabase.storage.from('products').getPublicUrl(fileName);
  return data.publicUrl;
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
   UTIL BARCODE (AGREGADO)
========================= */
const generateBarcodeValue = () => {
  return 'KP-' + Date.now(); // único y simple
};

const downloadBarcode = (barcode) => {
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, barcode, {
    format: 'CODE128',
    width: 2,
    height: 80,
  });

  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = `${barcode}.png`;
  link.click();
};

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
   GUARDAR / ACTUALIZAR
========================= */
const saveProduct = async () => {
  let image_url = editingProduct.value ? editingProduct.value.image_url : null;

  const uploaded = await uploadImage();
  if (uploaded) image_url = uploaded;

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (editingProduct.value) {
    await supabase
      .from('products')
      .update({
        name: name.value,
        price: price.value,
        stock: stock.value,
        image_url,
      })
      .eq('id', editingProduct.value.id);
  } else {
    await supabase.from('products').insert({
      name: name.value,
      price: price.value,
      stock: stock.value,
      image_url,
      user_id: authUser.id,
      barcode: generateBarcodeValue(), // ✅ AGREGADO
    });
  }

  name.value = '';
  price.value = '';
  stock.value = '';
  imageFile.value = null;
  file.value = null;
  editingProduct.value = null;

  showModal.value = false;
  loadProducts();
};

const editProduct = (product) => {
  editingProduct.value = product;
  name.value = product.name;
  price.value = product.price;
  stock.value = product.stock;
  imageFile.value = null;
  showModal.value = true;
};

const deleteProduct = async (product) => {
  if (!confirm('¿Eliminar producto?')) return;
  await supabase.from('products').delete().eq('id', product.id);
  loadProducts();
};

const filteredProducts = computed(() =>
  products.value.filter((p) =>
    p.name.toLowerCase().includes(filterName.value.toLowerCase())
  )
);


const renderBarcodes = () => {
  setTimeout(() => {
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
  }, 0);
};


onMounted(loadProducts);
</script>

<template>
  <div class="products-page">
    <div class="header">
      <h1>📦 Mis Productos</h1>
      <button class="btn-primary" @click="showModal = true">
        ➕ Agregar
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
            <p>Precio: S/ {{ p.price }}</p>
            <small>Stock: {{ p.stock }}</small>
          </div>

          <!-- ✅ BARCODE -->
          <svg
            v-if="p.barcode"
            :id="`barcode-${p.id}`"
            style="width: 100%"
          ></svg>

          

          <div class="actions">
            <button class="btn-edit" @click="editProduct(p)">✏️</button>
            <button class="btn-delete" @click="deleteProduct(p)">🗑️</button>
            <button v-if="p.barcode" class="btn-primary" @click="downloadBarcode(p.barcode)"> 🖨️ </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showModal" class="modal-backdrop">
      <div class="modal">
        <h2>{{ editingProduct ? 'Editar producto' : 'Registrar producto' }}</h2>

        <input v-model="name" type="text" placeholder="Nombre" />
        <input v-model="price" type="number" placeholder="Precio" />
        <input v-model="stock" type="number" placeholder="Stock" />
        <input type="file" accept="image/*" @change="onFileChange" />

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
  flex-shrink: 0;                /* 🔑 no se mueve */
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
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

/* 🔥 ÚNICO ELEMENTO CON SCROLL */
.product-list-container {
  flex: 1;                       /* 🔑 ocupa el resto */
  overflow-y: auto;              /* 🔑 SOLO AQUÍ SCROLL */
  padding-right: 6px;
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


</style>
