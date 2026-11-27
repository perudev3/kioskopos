<template>
  <div class="kiopos-catalog">

    <!-- ══ BLOBS BG ══ -->
    <div class="blob b1"></div>
    <div class="blob b2"></div>
    <div class="blob b3"></div>

    <!-- ══ HEADER ══ -->
    <header class="hdr">
      <div class="hdr-top">
        <div class="logo-box">
          <img src="/logo-sin-fondo.png" alt="KioPOS" class="logo-img" />
        </div>
        <div class="store-info">
          <div class="powered">Catálogo Virtual</div>
          <h1 class="store-name">{{ storeName }}</h1>
          <p class="store-tagline">{{ storeTagline }}</p>
        </div>

        <div class="header-actions">
          <div class="live-badge">
            <span class="live-dot"></span>
            Abierto ahora
          </div>

          <!-- ── Botón Compartir Catálogo (solo visible para el dueño dentro de la app) ── -->
          <button v-if="isOwner" class="share-catalog-btn" @click="shareCatalog" title="Compartir catálogo">
            <span>🔗</span> Compartir Catálogo
          </button>
        </div>

        <!-- ── Input de búsqueda ── -->
        <div class="search-wrap">
          <input
            type="text"
            class="search-input"
            placeholder="Buscar producto..."
            v-model="searchQuery"
          />
          <i class="search-icon">🔍</i>
        </div>
      </div>

      <div class="rainbow-stripe">
        <span v-for="n in 5" :key="n"></span>
      </div>
    </header>

    <!-- ══ CATALOG ══ -->
    <section class="catalog-section">
      <div class="section-label">
        <span class="lbl-dot"></span>
        <span>{{ activeFilter === 'all' ? 'Todos los productos' : activeFilter }}</span>
      </div>

      <div class="catalog-grid" v-if="filteredProducts.length > 0">
        <div
          class="product-card"
          v-for="(p, i) in filteredProducts"
          :key="p.id"
          :style="{ animationDelay: Math.min(i, 12) * 0.05 + 's' }"
        >
          <!-- image -->
          <div class="product-img-wrap">
            <img
              v-if="p.image_url"
              :src="getImageUrl(p.image_url)"
              :alt="p.name"
              class="product-img"
              loading="lazy"
            />
            <div v-else class="img-placeholder">{{ p.emoji || '📦' }}</div>

            <div class="badge-top">
              <span
                v-for="b in p.badges || []"
                :key="b"
                class="badge-pill"
                :class="b"
              >{{ badgeLabel(b) }}</span>
            </div>

            <div class="stock-corner" :class="stockStatus(p).cls">
              {{ stockStatus(p).label }}
            </div>
          </div>

          <!-- body -->
          <div class="product-body">
            <div class="product-name">{{ p.name }}</div>

            <div class="stock-row">
              <span class="stock-lbl">Stock : {{ stockText(p) }}</span>
            </div>

            <div class="product-footer">
              <div class="price-block">
                <div class="price-main">
                  Precio : {{ fmt(p.sale_price) }}<span v-if="isWeight(p)" class="per-kg"> /kg</span>
                </div>
              </div>

              <div class="footer-right">
                <div class="avail-row">
                  <span class="status-dot" :class="stockStatus(p).dot"></span>
                  <span class="avail-txt">
                    {{ Number(p.stock) === 0 ? 'Agotado' : Number(p.stock) < 2 ? 'Poco stock' : 'Disponible' }}
                  </span>
                </div>
              </div>
            </div>

            <!-- ── PEDIDO: agregar / cantidad ── -->
            <div class="order-row">
              <button
                v-if="!qtyOf(p)"
                class="add-btn"
                :disabled="Number(p.stock) <= 0"
                @click="addToCart(p)"
              >
                {{ Number(p.stock) <= 0 ? 'Agotado' : '🛒 Agregar al pedido' }}
              </button>

              <div v-else class="stepper">
                <button type="button" class="step-btn" @click="changeQty(p, -1)" aria-label="Quitar">−</button>
                <div class="step-qty">
                  <strong>{{ fmtQty(p, qtyOf(p)) }}</strong>
                  <small>{{ fmt(lineTotal(p)) }}</small>
                </div>
                <button type="button" class="step-btn" @click="changeQty(p, 1)" aria-label="Agregar">+</button>
              </div>
            </div>
          </div>

          <div class="card-stripe">
            <span v-for="n in 4" :key="n"></span>
          </div>
        </div>
      </div>

      <div class="empty-state" v-else>
        <div class="empty-icon">🔍</div>
        <p>No encontramos productos con ese criterio.</p>
      </div>
    </section>

    <!-- ══ BOTÓN FLOTANTE DEL PEDIDO ══ -->
    <button v-if="cartLines.length && !showCart" class="cart-fab" @click="openCart">
      <span class="fab-left">
        <span class="fab-icon">🛒</span>
        <span class="fab-count">{{ cartLines.length }}</span>
      </span>
      <span class="fab-text">Ver mi pedido</span>
      <span class="fab-total">{{ fmt(cartTotal) }}</span>
    </button>

    <!-- ══ PANEL DEL PEDIDO ══ -->
    <div v-if="showCart" class="sheet-backdrop" @click.self="showCart = false">
      <div class="sheet">
        <div class="sheet-head">
          <div>
            <h3>🛒 Mi pedido</h3>
            <p>{{ cartLines.length }} producto(s) · se enviará por WhatsApp a {{ storeName }}</p>
          </div>
          <button class="sheet-close" @click="showCart = false" aria-label="Cerrar">✕</button>
        </div>

        <div class="sheet-body">
          <div v-if="!cartLines.length" class="sheet-empty">
            Tu pedido está vacío. Agrega productos del catálogo.
          </div>

          <div v-for="l in cartLines" :key="l.p.id" class="line">
            <div class="line-img">
              <img v-if="l.p.image_url" :src="getImageUrl(l.p.image_url)" :alt="l.p.name" />
              <span v-else>{{ l.p.emoji || '📦' }}</span>
            </div>

            <div class="line-info">
              <div class="line-name">{{ l.p.name }}</div>
              <div class="line-price">
                {{ fmt(l.p.sale_price) }}<span v-if="isWeight(l.p)"> /kg</span>
              </div>

              <div class="line-controls">
                <button class="step-btn sm" @click="changeQty(l.p, -1)">−</button>

                <!-- Productos por kilo: se escribe en gramos -->
                <div v-if="isWeight(l.p)" class="grams-box">
                  <input
                    type="number"
                    inputmode="numeric"
                    min="1"
                    step="50"
                    :value="Math.round(l.qty * 1000)"
                    @change="setGrams(l.p, $event.target.value)"
                  />
                  <span>g</span>
                </div>
                <span v-else class="unit-qty">{{ l.qty }} und</span>

                <button class="step-btn sm" @click="changeQty(l.p, 1)">+</button>
              </div>
            </div>

            <div class="line-right">
              <div class="line-total">{{ fmt(l.total) }}</div>
              <button class="line-del" @click="removeItem(l.p)" aria-label="Eliminar">🗑</button>
            </div>
          </div>

          <template v-if="cartLines.length">
            <label class="f-field">
              <span>Tu nombre</span>
              <input v-model="customerName" type="text" placeholder="Ej: María Pérez" autocomplete="name" />
            </label>

            <label class="f-field">
              <span>Nota para la bodega (opcional)</span>
              <textarea v-model="orderNote" rows="2" placeholder="Ej: Paso a recoger a las 6 pm / entregar en…"></textarea>
            </label>
          </template>
        </div>

        <div class="sheet-foot" v-if="cartLines.length">
          <div class="total-row">
            <span>Total estimado</span>
            <strong>{{ fmt(cartTotal) }}</strong>
          </div>
          <div class="foot-actions">
            <button class="btn-clear" @click="clearCart">Vaciar</button>
            <button class="btn-wa" @click="sendOrder">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20.5 3.5A11.8 11.8 0 0 0 12 0a11.9 11.9 0 0 0-10.2 17.9L0 24l6.3-1.7A11.9 11.9 0 0 0 12 24a11.9 11.9 0 0 0 8.5-20.5zM12 21.8a9.8 9.8 0 0 1-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A9.8 9.8 0 1 1 12 21.8zm5.4-7.3c-.3-.1-1.7-.8-2-.9s-.5-.1-.7.1-.8.9-1 1.1-.4.2-.6.1a8 8 0 0 1-4-3.5c-.3-.5.3-.5.9-1.6a.6.6 0 0 0 0-.5l-.9-2.1c-.2-.5-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.9.4 3.7 3.7 0 0 0-1.1 2.7 6.4 6.4 0 0 0 1.4 3.4 14.7 14.7 0 0 0 5.6 4.9c2.1.9 2.9 1 3.9.8a3.3 3.3 0 0 0 2.2-1.6 2.7 2.7 0 0 0 .2-1.6c-.1-.1-.3-.2-.6-.3z"/>
              </svg>
              Enviar pedido por WhatsApp
            </button>
          </div>
          <p class="foot-hint">Se abrirá WhatsApp con tu pedido listo. Solo presiona enviar.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import api from '../lib/axios';
import Swal from 'sweetalert2';

/* =========================================================
   CONFIGURACIÓN
   El número de WhatsApp de la bodega se toma del perfil de la tienda
   (/catalog/{id}/profile). Si tu API aún no lo devuelve, escribe aquí
   el número como respaldo, con código de país. Ej: '51987654321'
========================================================= */
const STORE_WHATSAPP_FALLBACK = '';

const route = useRoute();
const products = ref([]);
const searchQuery = ref('');

// store info
const storeName = ref('Mi Kiosco');
const storeTagline = ref('Todo lo que necesitas');
const storePhone = ref('');
const activeFilter = ref('all');

// El botón de compartir solo se ve si el dueño está logueado Y entró desde
// dentro de la app. Si la página se abre directo desde un link (cliente),
// no hay "página anterior" en el historial de Vue Router y el botón se oculta.
const openedFromLink = !window.history.state?.back;

const isOwner = computed(() => {
  if (openedFromLink) return false;
  try {
    const token = localStorage.getItem('kiopos_token');
    const user = JSON.parse(localStorage.getItem('kiopos_user') || 'null');
    return !!token && !!user && String(user.id) === String(route.params.storeId);
  } catch (e) {
    return false;
  }
});

/* =========================
   HELPERS DE PRODUCTO
========================= */
const isWeight = (p) => String(p?.unit_type || '').toUpperCase() === 'WEIGHT';
const round3 = (n) => Math.round(n * 1000) / 1000;

// stock
const stockStatus = (p) => {
  if (!p) return { cls: '', dot: '', label: '' };
  if (Number(p.stock) === 0) return { cls: 'out', dot: 'r', label: 'Agotado' };
  if (Number(p.stock) < 2) return { cls: 'low', dot: 'y', label: 'Poco stock' };
  return { cls: 'in', dot: 'g', label: 'Disponible' };
};

const stockText = (p) => (isWeight(p) ? `${round3(Number(p.stock))} kg` : `${p.stock} uds.`);

// badges
const badgeLabel = (b) => {
  const map = { hot: '🔥 Nuevo', new: '🆕 Nuevo', sale: '💰 Oferta' };
  return map[b] || b;
};

// moneda
const fmt = (num) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(num) || 0);

// cantidad con su unidad (unidades o kg/g)
const fmtQty = (p, q) => {
  if (!isWeight(p)) return `${q} und`;
  return q < 1 ? `${Math.round(q * 1000)} g` : `${round3(q)} kg`;
};

// obtener URL de imagen
const getImageUrl = (fileName) => {
  if (!fileName) return '';
  return `${fileName}`;
};

/* =========================
   CARGAR DATOS
========================= */
const loadCatalogProducts = async (storeId) => {
  if (!storeId) return;
  try {
    const response = await api.get(`/catalog/${storeId}/products`);
    products.value = response.data.products ?? [];
  } catch (error) {
    console.error('Error cargando productos:', error);
  }
};

const loadStoreProfile = async (storeId) => {
  if (!storeId) return;

  try {
    const response = await api.get(`/catalog/${storeId}/profile`);
    const d = response.data || {};
    if (d.name) storeName.value = d.name;

    // acepta distintos nombres de campo para el teléfono
    storePhone.value = String(
      d.whatsapp ?? d.phone ?? d.telefono ?? d.celular ?? d.cellphone ?? d.mobile ?? ''
    );
  } catch (error) {
    console.error('Error cargando perfil:', error);
  }
};

/* =========================
   BÚSQUEDA
========================= */
const filteredProducts = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return products.value;
  return products.value.filter(p => String(p.name || '').toLowerCase().includes(q));
});

/* =========================
   CARRITO DE PEDIDO
   cart = { [productId]: cantidad }  (unidades, o kilos si es por peso)
========================= */
const cart = ref({});
const showCart = ref(false);
const customerName = ref('');
const orderNote = ref('');

const cartKey = () => `kiopos_catalog_cart_${route.params.storeId}`;

const saveCart = () => {
  try {
    localStorage.setItem(
      cartKey(),
      JSON.stringify({ cart: cart.value, name: customerName.value, note: orderNote.value })
    );
  } catch (e) { /* sin almacenamiento disponible */ }
};

const restoreCart = () => {
  try {
    const raw = localStorage.getItem(cartKey());
    if (!raw) return;
    const saved = JSON.parse(raw);
    const valid = {};
    // solo se recuperan productos que aún existen y tienen stock
    Object.entries(saved.cart || {}).forEach(([id, qty]) => {
      const p = products.value.find(x => String(x.id) === String(id));
      if (p && Number(p.stock) > 0 && Number(qty) > 0) {
        valid[p.id] = Math.min(Number(qty), Number(p.stock));
      }
    });
    cart.value = valid;
    customerName.value = saved.name || '';
    orderNote.value = saved.note || '';
  } catch (e) { /* datos dañados: se ignoran */ }
};

watch([cart, customerName, orderNote], saveCart, { deep: true });

const qtyOf = (p) => cart.value[p.id] || 0;
const stepOf = (p) => (isWeight(p) ? 0.25 : 1);
const lineTotal = (p) => Number(p.sale_price) * qtyOf(p);

const setQty = (p, q) => {
  const stock = Number(p.stock);
  let value = round3(q);

  if (value > stock) {
    value = stock;
    Swal.fire({
      toast: true, position: 'top-end', icon: 'info',
      title: `Solo hay ${stockText(p)} disponibles`,
      showConfirmButton: false, timer: 1600
    });
  }

  const next = { ...cart.value };
  if (value <= 0) delete next[p.id];
  else next[p.id] = value;
  cart.value = next;
};

const addToCart = (p) => {
  if (Number(p.stock) <= 0) return;
  setQty(p, stepOf(p));
};

const changeQty = (p, dir) => setQty(p, qtyOf(p) + dir * stepOf(p));

// Productos por kilo: el cliente escribe los gramos
const setGrams = (p, grams) => {
  const g = Number(grams);
  if (!g || g <= 0) return setQty(p, 0);
  setQty(p, g / 1000);
};

const removeItem = (p) => setQty(p, 0);

const clearCart = async () => {
  const r = await Swal.fire({
    title: '¿Vaciar el pedido?',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Sí, vaciar',
    cancelButtonText: 'Cancelar'
  });
  if (!r.isConfirmed) return;
  cart.value = {};
  orderNote.value = '';
  showCart.value = false;
};

const cartLines = computed(() =>
  products.value
    .filter(p => cart.value[p.id])
    .map(p => ({ p, qty: cart.value[p.id], total: Number(p.sale_price) * cart.value[p.id] }))
);

const cartTotal = computed(() => cartLines.value.reduce((s, l) => s + l.total, 0));

const openCart = () => { showCart.value = true; };

// bloquea el scroll del fondo mientras el panel está abierto
watch(showCart, (open) => {
  document.body.style.overflow = open ? 'hidden' : '';
});
onBeforeUnmount(() => { document.body.style.overflow = ''; });

/* =========================
   ENVIAR PEDIDO POR WHATSAPP
========================= */
const normalizePhone = (raw) => {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 9) digits = '51' + digits; // celular de Perú sin código de país
  return digits;
};

const buildOrderMessage = () => {
  const now = new Date().toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });

  const lines = cartLines.value.map((l, i) => {
    const unit = isWeight(l.p) ? `${fmt(l.p.sale_price)}/kg` : fmt(l.p.sale_price);
    return `${i + 1}. ${l.p.name}\n    ${fmtQty(l.p, l.qty)} × ${unit} = ${fmt(l.total)}`;
  });

  const parts = [
    `🛒 *PEDIDO DE COMPRA*`,
    `🏪 ${storeName.value}`,
    `📅 ${now}`,
    customerName.value.trim() ? `👤 Cliente: ${customerName.value.trim()}` : null,
    '',
    ...lines,
    '',
    `💰 *TOTAL: ${fmt(cartTotal.value)}*`,
    orderNote.value.trim() ? `\n📝 Nota: ${orderNote.value.trim()}` : null,
    '',
    `_Pedido enviado desde el catálogo virtual_`
  ];

  return parts.filter(x => x !== null).join('\n');
};

const sendOrder = () => {
  if (!cartLines.value.length) return;

  if (!customerName.value.trim()) {
    Swal.fire({
      toast: true, position: 'top-end', icon: 'warning',
      title: 'Escribe tu nombre para el pedido',
      showConfirmButton: false, timer: 1800
    });
    return;
  }

  const phone = normalizePhone(storePhone.value || STORE_WHATSAPP_FALLBACK);
  if (phone.length < 8) {
    Swal.fire({
      icon: 'error',
      title: 'No se pudo enviar',
      text: 'Esta bodega aún no tiene un número de WhatsApp configurado.'
    });
    return;
  }

  const url = `https://wa.me/${phone}?text=${encodeURIComponent(buildOrderMessage())}`;
  const win = window.open(url, '_blank');
  if (!win) window.location.href = url; // si el navegador bloquea la ventana nueva
};

// ── Función para compartir / copiar link del catálogo ──
const shareCatalog = async () => {
  const catalogUrl = window.location.href;

  // Si el navegador soporta Web Share API (ideal para móviles / WhatsApp directo)
  if (navigator.share) {
    try {
      await navigator.share({
        title: storeName.value,
        text: `¡Mira nuestro catálogo virtual en ${storeName.value}! 🛒`,
        url: catalogUrl,
      });
      return;
    } catch (err) {
      // Si el usuario cancela, no hacemos nada
      if (err.name !== 'AbortError') console.error('Error al compartir:', err);
    }
  }

  // Fallback: Copiar al portapapeles y mostrar aviso con SweetAlert2
  try {
    await navigator.clipboard.writeText(catalogUrl);
    Swal.fire({
      icon: 'success',
      title: '¡Link copiado!',
      text: 'El enlace del catálogo se ha copiado al portapapeles. ¡Compártelo con tus clientes!',
      timer: 2500,
      showConfirmButton: false,
    });
  } catch (err) {
    console.error('Error al copiar al portapapeles:', err);
    alert('Copia este enlace: ' + catalogUrl);
  }
};

onMounted(async () => {
  const storeId = route.params.storeId;
  await Promise.all([loadStoreProfile(storeId), loadCatalogProducts(storeId)]);
  restoreCart();
});
</script>

<style scoped>
/* ═══════════════════════════════════
   KIOPOS BRAND PALETTE — del logo
═══════════════════════════════════ */
.kiopos-catalog {
  --green:  #1abc6b;
  --green2: #0ea558;
  --navy:   #0f2b5b;
  --navy2:  #1a3a7a;
  --sky:    #29b6e8;
  --sky2:   #0d9fd6;
  --orange: #f7971c;
  --yellow: #f7d000;
  --red:    #e83c3c;

  --bg:     #ffffff;
  --bg2:    #f4f7fc;
  --card:   #ffffff;
  --card2:  #eef4fc;
  --border: rgba(15,43,91,0.1);
  --text:   #0f2b5b;
  --muted:  #6b84aa;
  --shadow: 0 4px 20px rgba(15,43,91,0.1);

  --radius: 18px;
  --speed:  0.28s;

  font-family: 'DM Sans', 'Segoe UI', system-ui, sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  position: relative;
  overflow-x: hidden;
}

/* decorative blobs */
.blob { position: fixed; border-radius: 50%; filter: blur(100px); pointer-events: none; z-index: 0; }
.b1 { width:500px;height:500px;top:-120px;left:-100px;background:rgba(41,182,232,0.08); }
.b2 { width:420px;height:420px;bottom:-80px;right:-80px;background:rgba(26,188,107,0.07); }
.b3 { width:280px;height:280px;top:45%;left:60%;background:rgba(247,151,28,0.06); }

/* ── HEADER ── */
.hdr {
  position: relative; z-index: 10;
  max-width: 1100px; margin: 0 auto;
  padding: 2.2rem 1.5rem 0;
}
.hdr-top {
  display: flex; align-items: center; gap: 1.3rem; flex-wrap: wrap;
  animation: fdDown .6s ease both;
}
.logo-box {
  background: #f0f6ff;
  border: 1px solid rgba(41,182,232,0.2);
  border-radius: 14px;
  padding: .5rem .9rem;
  display: flex; align-items: center;
  box-shadow: 0 4px 16px rgba(15,43,91,.12);
  flex-shrink: 0;
}
.logo-img { height: 50px; width: auto; display: block; }
.store-info { flex: 1; min-width: 180px; }
.powered { font-size:.7rem; text-transform:uppercase; letter-spacing:.14em; color:var(--sky); font-weight:700; margin-bottom:.2rem; }
.store-name { font-family:'Syne',sans-serif; font-size:clamp(1.7rem,4vw,2.7rem); font-weight:800; line-height:1.1; color:var(--navy); }
.store-tagline { color:var(--muted); font-size:.88rem; margin-top:.2rem; }
.live-badge {
  display:flex; align-items:center; gap:.5rem;
  background:rgba(26,188,107,.08); border:1px solid rgba(26,188,107,.3);
  color:var(--green); font-size:.76rem; font-weight:700;
  padding:.42em 1em; border-radius:999px; letter-spacing:.04em;
}
.live-dot { width:8px;height:8px;border-radius:50%;background:var(--green);animation:pg 1.4s ease-in-out infinite; }
@keyframes pg { 0%,100%{box-shadow:0 0 0 0 rgba(26,188,107,.6);} 50%{box-shadow:0 0 0 7px rgba(26,188,107,0);} }

/* rainbow stripe */
.rainbow-stripe { display:flex;height:5px;border-radius:99px;overflow:hidden;margin-top:1.3rem;animation:fdDown .6s .15s ease both; }
.rainbow-stripe span:nth-child(1){flex:1;background:var(--green);}
.rainbow-stripe span:nth-child(2){flex:1;background:var(--sky);}
.rainbow-stripe span:nth-child(3){flex:1;background:var(--orange);}
.rainbow-stripe span:nth-child(4){flex:1;background:var(--yellow);}
.rainbow-stripe span:nth-child(5){flex:1;background:var(--red);}

/* search — barra destacada a todo el ancho */
.search-wrap {
  flex: 1 1 100%;
  width: 100%;
  margin-left: 0;
  margin-top: .3rem;
  position: relative;
}
.search-input {
  display: block;
  width: 100%;
  box-sizing: border-box;
  height: 56px;
  padding: 0 1.3rem 0 3.4rem;
  font-family: inherit;
  font-size: 1rem;
  font-weight: 500;
  color: var(--navy);
  background: #ffffff;
  border: 2px solid var(--sky);
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(41,182,232,.2);
  outline: none;
  -webkit-appearance: none;
  appearance: none;
  transition: border-color .2s, box-shadow .2s, transform .2s;
}
.search-input:hover { box-shadow: 0 10px 28px rgba(41,182,232,.28); }
.search-input:focus {
  border-color: var(--sky2);
  box-shadow: 0 0 0 5px rgba(41,182,232,.22), 0 10px 28px rgba(41,182,232,.28);
  transform: translateY(-1px);
}
.search-input::placeholder { color: var(--muted); font-weight: 500; }
.search-icon {
  position: absolute;
  left: 1.15rem;
  top: 50%;
  transform: translateY(-50%);
  font-style: normal;
  font-size: 1.3rem;
  line-height: 1;
  pointer-events: none;
}

/* ── CATALOG ── */
.catalog-section {
  position: relative; z-index: 5;
  max-width: 1100px;
  margin: 0 auto;
  padding: 2rem 1.5rem 7rem;
}
.section-label {
  font-family:'Syne',sans-serif; font-size:1.12rem; font-weight:700;
  color:var(--navy); margin-bottom:1.2rem;
  display:flex; align-items:center; gap:.65rem;
}
.section-label::after { content:''; flex:1; height:1px; background:linear-gradient(90deg,var(--border),transparent); }
.lbl-dot { width:10px;height:10px;border-radius:50%;background:linear-gradient(135deg,var(--green),var(--sky));flex-shrink:0; }

/* ── GRID: 2 columnas fijas ── */
.catalog-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

/* En pantallas grandes, centramos con ancho máximo */
@media (min-width: 900px) {
  .catalog-grid {
    grid-template-columns: repeat(2, minmax(0, 500px));
    justify-content: center;
  }
}

/* ── PRODUCT CARD ── */
.product-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden; display: flex; flex-direction: column;
  position: relative;
  transition: transform .25s, box-shadow .25s, border-color .25s;
  animation: fdUp .5s ease both;
  box-shadow: var(--shadow);
}
.product-card:hover {
  transform: translateY(-7px);
  box-shadow: 0 24px 55px rgba(15,43,91,.15), 0 0 0 1px rgba(41,182,232,.35);
  border-color: rgba(41,182,232,.4);
}

/* imagen 4:3, más pequeña y rápida */
.product-img-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  background: var(--bg2);
  overflow: hidden;
  flex-shrink: 0;
  border-radius: var(--radius) var(--radius) 0 0;
}
.product-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.img-placeholder {
  position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  font-size:3.2rem;
  background:linear-gradient(145deg,#eef4fc,#dceeff);
}

/* badges */
.badge-top { position:absolute;top:.7rem;left:.7rem;display:flex;flex-direction:column;gap:.28rem;z-index:2; }
.badge-pill { font-size:.67rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;padding:.2em .62em;border-radius:999px;white-space:nowrap; }
.badge-pill.hot  { background:linear-gradient(90deg,#e83c3c,#f7971c);color:#fff; }
.badge-pill.new  { background:linear-gradient(90deg,#1abc6b,#29b6e8);color:#fff; }
.badge-pill.sale { background:linear-gradient(90deg,#f7d000,#f7971c);color:#0f2b5b; }
.stock-corner { position:absolute;top:.7rem;right:.7rem;z-index:2;font-size:.67rem;font-weight:700;padding:.2em .62em;border-radius:8px;backdrop-filter:blur(6px);letter-spacing:.04em; }
.stock-corner.in  { background:rgba(26,188,107,.88);color:#fff; }
.stock-corner.low { background:rgba(247,151,28,.95);color:#fff; }
.stock-corner.out { background:rgba(232,60,60,.88);color:#fff; }

/* card rainbow stripe */
.card-stripe { height:3px;width:100%;flex-shrink:0;display:flex; }
.card-stripe span:nth-child(1){flex:1;background:var(--green);}
.card-stripe span:nth-child(2){flex:1;background:var(--sky);}
.card-stripe span:nth-child(3){flex:1;background:var(--orange);}
.card-stripe span:nth-child(4){flex:1;background:var(--yellow);}

/* body */
.product-body {
  padding: .85rem 1rem 1rem;
  display: flex; flex-direction: column;
  gap: .38rem; flex: 1;
}
.product-name  { font-family:'Syne',sans-serif;font-size:.93rem;font-weight:700;line-height:1.25;color:var(--navy); }
.stock-row     { display:flex;align-items:center;justify-content:space-between;gap:.6rem;margin-top:.1rem; }
.stock-lbl     { font-size:.8rem;color:var(--muted);white-space:nowrap;flex-shrink:0; }
.product-footer { margin-top:auto;padding-top:.75rem;display:flex;align-items:center;justify-content:space-between;gap:.5rem;border-top:1px solid var(--border); }
.price-block   { display:flex;flex-direction:column;gap:.04rem; }
.price-main    { font-family:'Syne',sans-serif;font-size:1.25rem;font-weight:800;color:var(--orange);line-height:1; }
.per-kg        { font-size:.7em;font-weight:700;color:var(--muted); }
.footer-right  { display:flex;flex-direction:column;align-items:flex-end;gap:.38rem; }
.avail-row     { display:flex;align-items:center;gap:.32rem;font-size:.73rem;color:var(--muted); }
.avail-txt     { font-size:.73rem; }
.status-dot    { width:8px;height:8px;border-radius:50%; }
.status-dot.g  { background:var(--green);box-shadow:0 0 5px var(--green); }
.status-dot.y  { background:var(--orange);box-shadow:0 0 5px var(--orange); }
.status-dot.r  { background:var(--red);box-shadow:0 0 5px var(--red); }

/* empty */
.empty-state  { text-align:center;padding:4rem 1rem;color:var(--muted); }
.empty-icon   { font-size:3rem;margin-bottom:.5rem; }

/* animations */
@keyframes fdDown { from{opacity:0;transform:translateY(-16px);} to{opacity:1;transform:translateY(0);} }
@keyframes fdUp   { from{opacity:0;transform:translateY(20px);}  to{opacity:1;transform:translateY(0);} }

/* ── RESPONSIVE ── */
@media (max-width: 700px) {
  .catalog-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: .7rem;
  }
  .product-name  { font-size: .85rem; }
  .price-main    { font-size: 1.1rem; }
  .product-body  { padding: .7rem .8rem .8rem; }
  .hdr-top       { flex-direction: column; align-items: flex-start; }
  .logo-img      { height: 42px; }
}

@media (max-width: 420px) {
  .catalog-grid {
    grid-template-columns: repeat(2, 1fr); /* mantiene 2 cols, no colapsa a 1 */
    gap: .5rem;
  }
  .product-body  { padding: .55rem .6rem .65rem; }
  .product-name  { font-size: .78rem; }
  .price-main    { font-size: .98rem; }
  .stock-lbl     { font-size: .72rem; }
  .avail-txt     { font-size: .68rem; }
  .stock-corner  { font-size: .6rem; padding: .15em .5em; }
}

/* Alinea el botón de compartir en la cabecera */
.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.share-catalog-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, #6366f1, #4f46e5);
  color: #fff;
  border: none;
  padding: 8px 14px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.25);
  transition: all 0.2s ease;
}

.share-catalog-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(99, 102, 241, 0.35);
}

/* ═══════════════════════════════════
   PEDIDO: botón agregar / cantidad
═══════════════════════════════════ */
.order-row { margin-top: .55rem; }

.add-btn {
  width: 100%;
  border: none;
  border-radius: 12px;
  padding: .7rem .5rem;
  font-family: inherit;
  font-size: .85rem;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, var(--green), var(--green2));
  box-shadow: 0 4px 12px rgba(26,188,107,.3);
  cursor: pointer;
  transition: transform .15s, box-shadow .15s;
}
.add-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(26,188,107,.4); }
.add-btn:active:not(:disabled) { transform: translateY(0); }
.add-btn:disabled { background: #cbd5e1; box-shadow: none; cursor: not-allowed; }

.stepper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: .4rem;
  background: var(--card2);
  border: 2px solid var(--green);
  border-radius: 12px;
  padding: .25rem;
}
.step-btn {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border: none;
  border-radius: 10px;
  background: var(--green);
  color: #fff;
  font-size: 1.4rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  transition: transform .15s, background .15s;
}
.step-btn:hover { background: var(--green2); }
.step-btn:active { transform: scale(.94); }
.step-btn.sm { width: 34px; height: 34px; font-size: 1.2rem; }
.step-qty {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.15;
  min-width: 0;
}
.step-qty strong { font-size: .95rem; color: var(--navy); }
.step-qty small { font-size: .72rem; color: var(--muted); font-weight: 600; }

/* ═══════════════════════════════════
   BOTÓN FLOTANTE
═══════════════════════════════════ */
.cart-fab {
  position: fixed;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  z-index: 90;
  width: calc(100% - 28px);
  max-width: 520px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: .8rem;
  padding: .85rem 1.1rem;
  border: none;
  border-radius: 16px;
  background: linear-gradient(135deg, var(--navy), var(--navy2));
  color: #fff;
  font-family: inherit;
  cursor: pointer;
  box-shadow: 0 12px 32px rgba(15,43,91,.4);
  animation: fdUp .35s ease both;
}
.fab-left { position: relative; display: inline-flex; }
.fab-icon { font-size: 1.5rem; line-height: 1; }
.fab-count {
  position: absolute;
  top: -8px;
  right: -12px;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--orange);
  color: #fff;
  font-size: .72rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
}
.fab-text { flex: 1; text-align: left; margin-left: .6rem; font-weight: 700; font-size: .95rem; }
.fab-total { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 1.05rem; }

/* ═══════════════════════════════════
   PANEL DEL PEDIDO
═══════════════════════════════════ */
.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(15,23,42,.65);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.sheet {
  width: 100%;
  max-width: 560px;
  max-height: 92vh;
  background: #fff;
  border-radius: 24px 24px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: slideUp .3s ease both;
  box-shadow: 0 -10px 40px rgba(0,0,0,.25);
}
@keyframes slideUp { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

@media (min-width: 700px) {
  .sheet-backdrop { align-items: center; }
  .sheet { border-radius: 24px; max-height: 88vh; }
}

.sheet-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.1rem 1.3rem;
  border-bottom: 1px solid var(--border);
}
.sheet-head h3 { margin: 0 0 .15rem; font-family: 'Syne', sans-serif; font-size: 1.25rem; color: var(--navy); }
.sheet-head p { margin: 0; font-size: .8rem; color: var(--muted); }
.sheet-close {
  width: 38px; height: 38px; flex-shrink: 0;
  border: none; border-radius: 10px;
  background: #f1f5f9; color: #64748b;
  font-size: 1rem; cursor: pointer;
}
.sheet-close:hover { background: #e2e8f0; color: var(--navy); }

.sheet-body {
  padding: 1rem 1.3rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: .8rem;
  min-height: 0;
}
.sheet-empty { text-align: center; color: var(--muted); padding: 2rem 0; }

.line {
  display: flex;
  gap: .8rem;
  align-items: flex-start;
  padding-bottom: .8rem;
  border-bottom: 1px dashed var(--border);
}
.line-img {
  width: 58px; height: 58px; flex-shrink: 0;
  border-radius: 12px; overflow: hidden;
  background: var(--bg2);
  display: flex; align-items: center; justify-content: center;
  font-size: 1.8rem;
}
.line-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.line-info { flex: 1; min-width: 0; }
.line-name { font-weight: 700; font-size: .92rem; color: var(--navy); line-height: 1.25; }
.line-price { font-size: .78rem; color: var(--muted); margin: .1rem 0 .45rem; }
.line-controls { display: flex; align-items: center; gap: .45rem; }
.unit-qty { min-width: 56px; text-align: center; font-weight: 700; color: var(--navy); font-size: .9rem; }

.grams-box {
  display: flex; align-items: center; gap: .25rem;
  background: #f8fafc; border: 2px solid #e2e8f0;
  border-radius: 10px; padding: 0 .6rem;
}
.grams-box:focus-within { border-color: var(--sky); background: #fff; }
.grams-box input {
  width: 64px; border: none; outline: none; background: transparent;
  font-family: inherit; font-size: 16px; /* evita el zoom en iOS */
  font-weight: 700; color: var(--navy);
  padding: .4rem 0; text-align: right;
  -moz-appearance: textfield;
}
.grams-box input::-webkit-outer-spin-button,
.grams-box input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.grams-box span { font-weight: 700; color: var(--muted); font-size: .85rem; }

.line-right { display: flex; flex-direction: column; align-items: flex-end; gap: .4rem; }
.line-total { font-family: 'Syne', sans-serif; font-weight: 800; color: var(--orange); font-size: .98rem; white-space: nowrap; }
.line-del { border: none; background: transparent; font-size: 1.05rem; cursor: pointer; opacity: .6; }
.line-del:hover { opacity: 1; }

.f-field { display: block; }
.f-field > span { display: block; font-size: .8rem; font-weight: 700; color: #334155; margin-bottom: .3rem; }
.f-field input,
.f-field textarea {
  width: 100%;
  box-sizing: border-box;
  font-family: inherit;
  font-size: 16px; /* evita el zoom en iOS */
  color: var(--navy);
  background: #f8fafc;
  border: 2px solid #e2e8f0;
  border-radius: 12px;
  padding: .7rem .85rem;
  outline: none;
  resize: vertical;
  transition: border-color .2s, background .2s;
}
.f-field input:focus,
.f-field textarea:focus { border-color: var(--sky); background: #fff; }

.sheet-foot {
  padding: 1rem 1.3rem 1.2rem;
  background: #f8fafc;
  border-top: 1px solid var(--border);
}
.total-row {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: .8rem; color: var(--muted); font-weight: 600;
}
.total-row strong { font-family: 'Syne', sans-serif; font-size: 1.5rem; color: var(--navy); }
.foot-actions { display: flex; gap: .6rem; }
.btn-clear {
  flex: 0 0 auto;
  background: #fff; color: #64748b;
  border: 2px solid #e2e8f0; border-radius: 12px;
  padding: .85rem 1rem;
  font-family: inherit; font-weight: 700; cursor: pointer;
}
.btn-clear:hover { background: #f1f5f9; color: var(--navy); }
.btn-wa {
  flex: 1;
  display: flex; align-items: center; justify-content: center; gap: .55rem;
  background: #25d366; color: #fff;
  border: none; border-radius: 12px;
  padding: .85rem 1rem;
  font-family: inherit; font-size: .95rem; font-weight: 800;
  cursor: pointer;
  box-shadow: 0 6px 16px rgba(37,211,102,.4);
  transition: transform .15s, background .15s;
}
.btn-wa:hover { background: #1ebe5b; transform: translateY(-1px); }
.btn-wa:active { transform: translateY(0); }
.foot-hint { margin: .6rem 0 0; text-align: center; font-size: .74rem; color: var(--muted); }
</style>
