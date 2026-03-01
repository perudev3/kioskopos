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
        <div class="live-badge">
          <span class="live-dot"></span>
          Abierto ahora
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
          :style="{ animationDelay: i * 0.05 + 's' }"
        >
          <!-- image -->
          <div class="product-img-wrap">
            <img
              v-if="p.image_url"
              :src="getImageUrl(p.image_url)"
              :alt="p.name"
              class="product-img"
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
              <span class="stock-lbl">Stock : {{ p.stock }} uds.</span>
            </div>

            <div class="product-footer">
              <div class="price-block">
                <div class="price-main">Precio : {{ fmt(p.sale_price) }}</div>
              </div>

              <div class="footer-right">
                <div class="avail-row">
                  <span class="status-dot" :class="stockStatus(p).dot"></span>
                  <span class="avail-txt">
                    {{ p.stock === 0 ? 'Agotado' : p.stock < 2 ? 'Poco stock' : 'Disponible' }}
                  </span>
                </div>
                <!--
                <button
                  class="btn-add"
                  :disabled="p.stock === 0"
                  @click="addToCart(p.id)"
                >
                  {{ p.stock === 0 ? 'Agotado' : 'Agregar +' }}
                </button>-->
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
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { supabase } from '../lib/supabase';

const route = useRoute();
const products = ref([]);
const searchQuery = ref('');
const addedIds = ref([]);

// store info
const storeName = ref('Mi Kiosco');
const storeTagline = ref('Todo lo que necesitas');

// stock
const stockStatus = (p) => {
  if (!p) return { cls: '', dot: '', label: '' };
  if (p.stock === 0) return { cls: 'out', dot: 'r', label: 'Agotado' };
  if (p.stock < 2) return { cls: 'low', dot: 'y', label: 'Poco stock' };
  return { cls: 'in', dot: 'g', label: 'Disponible' };
};

// badges
const badgeLabel = (b) => {
  const map = { hot: '🔥 Nuevo', new: '🆕 Nuevo', sale: '💰 Oferta' };
  return map[b] || b;
};

// stock meter
const meterPct = (p) => Math.min(Math.round((p.stock / 10) * 100), 100);
const meterColor = (p) => {
  const pct = p.stock / 10;
  if (pct === 0) return '#e83c3c';
  if (pct < 0.2) return '#f7971c';
  return '#1abc6b';
};

// moneda
const fmt = (num) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(num);

// cargar productos
const loadCatalogProducts = async (storeId) => {
  if (!storeId) return;
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('user_id', storeId)
    .order('created_at', { ascending: false });
  if (error) console.error('Error cargando productos:', error);
  products.value = data ?? [];
  console.log('Productos cargados:', data);
};

const loadStoreProfile = async (storeId) => {
  if (!storeId) return;

  const { data, error } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', storeId)
    .single();

  if (error) {
    console.error('Error cargando perfil:', error);
    return;
  }

  if (data) {
    storeName.value = data.name;
  }
};

// obtener URL de imagen
const getImageUrl = (fileName) => {
  if (!fileName) return '';
  return `${fileName}`;
};

// carrito
const addToCart = (id) => {
  if (!addedIds.value.includes(id)) addedIds.value.push(id);
};

// productos filtrados por búsqueda
const filteredProducts = computed(() => {
  if (!searchQuery.value) return products.value;
  return products.value.filter(p =>
    p.name.toLowerCase().includes(searchQuery.value.toLowerCase())
  );
});

onMounted(async () => {
  const storeId = route.params.storeId;
  await loadStoreProfile(storeId);
  await loadCatalogProducts(storeId);
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

  /* FONDO BLANCO */
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

/* decorative blobs (sutiles en fondo blanco) */
.blob { position: fixed; border-radius: 50%; filter: blur(100px); pointer-events: none; z-index: 0; }
.b1 { width:500px;height:500px;top:-120px;left:-100px;background:rgba(41,182,232,0.08); }
.b2 { width:420px;height:420px;bottom:-80px;right:-80px;background:rgba(26,188,107,0.07); }
.b3 { width:280px;height:280px;top:45%;left:60%;background:rgba(247,151,28,0.06); }

/* ── HEADER ── */
.hdr {
  position: relative; z-index: 10;
  max-width: 1300px; margin: 0 auto;
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

.store-meta { display:flex;flex-wrap:wrap;gap:.6rem;margin-top:1rem;animation:fdDown .6s .25s ease both; }
.meta-pill {
  display:flex;align-items:center;gap:.35rem;
  background:var(--bg2); border:1px solid var(--border);
  color:var(--muted); font-size:.78rem;
  padding:.35em .85em; border-radius:999px;
}

/* ── STATS ── */
.stats-banner {
  position:relative;z-index:5;
  display:grid; grid-template-columns:repeat(4,1fr);
  gap:1px; background:var(--border);
  border-top:1px solid var(--border); border-bottom:1px solid var(--border);
  margin:1.6rem auto 0; max-width:1300px;
  animation:fdDown .6s .35s ease both;
}
.stat-cell { background:var(--card); text-align:center; padding:1.1rem .5rem; transition:background var(--speed); }
.stat-cell:hover { background:var(--bg2); }
.sv { font-family:'Syne',sans-serif; font-size:1.85rem; font-weight:800; line-height:1; }
.sl { font-size:.7rem; text-transform:uppercase; letter-spacing:.09em; color:var(--muted); margin-top:.3rem; }

.filter-pill {
  background:var(--bg2); border:1px solid var(--border);
  color:var(--muted); font-size:.79rem; font-weight:600;
  padding:.38em .95em; border-radius:999px;
  cursor:pointer; transition:all var(--speed); white-space:nowrap;
}
.filter-pill:hover { border-color:var(--sky); color:var(--sky); }
.filter-pill.active {
  background:linear-gradient(135deg,var(--navy2),var(--sky2));
  border-color:transparent; color:#fff;
  box-shadow:0 2px 14px rgba(41,182,232,.3);
}
.search-wrap { margin-left:auto; position:relative; flex-shrink:0; }
.search-input {
  background:var(--bg2); border:1px solid var(--border);
  color:var(--text); font-size:.82rem;
  padding:.43em 1em .43em 2.1em; border-radius:999px;
  outline:none; width:190px; transition:border-color .2s,width .3s;
}
.search-input:focus { border-color:var(--sky); width:230px; }
.search-input::placeholder { color:var(--muted); }
.search-icon { position:absolute;left:.65em;top:50%;transform:translateY(-50%);color:var(--muted);pointer-events:none;font-size:.82rem; }

/* ── CATALOG ── */
.catalog-section { position:relative;z-index:5; max-width:1300px; margin:0 auto; padding:2rem 1.5rem 5rem; }
.section-label {
  font-family:'Syne',sans-serif; font-size:1.12rem; font-weight:700;
  color:var(--navy); margin-bottom:1.2rem;
  display:flex; align-items:center; gap:.65rem;
}
.section-label::after { content:''; flex:1; height:1px; background:linear-gradient(90deg,var(--border),transparent); }
.lbl-dot { width:10px;height:10px;border-radius:50%;background:linear-gradient(135deg,var(--green),var(--sky));flex-shrink:0; }
.catalog-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(255px,1fr)); gap:1.2rem; }

/* ── PRODUCT CARD ── */
.product-card {
  background:var(--card);
  border:1px solid var(--border);
  border-radius:var(--radius);
  overflow:hidden; display:flex; flex-direction:column;
  cursor:pointer; position:relative;
  transition:transform .25s, box-shadow .25s, border-color .25s;
  animation:fdUp .5s ease both;
  box-shadow: var(--shadow);
}
.product-card:hover {
  transform:translateY(-7px);
  box-shadow:0 24px 55px rgba(15,43,91,.15), 0 0 0 1px rgba(41,182,232,.35);
  border-color:rgba(41,182,232,.4);
}

/* img */
.product-img-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1; /* imagen cuadrada, cambia a 4/3 o 16/9 si quieres otra proporción */
  background: var(--bg2);
  overflow: hidden;
  flex-shrink: 0;
  border-radius: var(--radius);
}

.product-img {
  width: 100%;
  height: 100%;
  object-fit: cover; /* cubre todo el contenedor, mantiene proporción */
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
.product-body { padding:1rem 1.1rem 1.1rem; display:flex; flex-direction:column; gap:.42rem; flex:1; }
.product-cat   { font-size:.69rem;text-transform:uppercase;letter-spacing:.12em;font-weight:700;color:var(--sky2); }
.product-name  { font-family:'Syne',sans-serif;font-size:1rem;font-weight:700;line-height:1.25;color:var(--navy); }
.product-desc  { font-size:.77rem;color:var(--muted);line-height:1.55;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden; }
.stock-row     { display:flex;align-items:center;justify-content:space-between;gap:.6rem;margin-top:.1rem; }
.stock-lbl     { font-size:17px;color:var(--muted);white-space:nowrap;flex-shrink:0; }
.stock-meter   { flex:1;height:5px;background:rgba(15,43,91,.08);border-radius:99px;overflow:hidden; }
.stock-meter-fill { height:100%;border-radius:99px;transition:width .6s ease; }
.product-footer { margin-top:auto;padding-top:.75rem;display:flex;align-items:center;justify-content:space-between;gap:.5rem;border-top:1px solid var(--border); }
.price-block   { display:flex;flex-direction:column;gap:.04rem; }
.price-main    { font-family:'Syne',sans-serif;font-size:1.45rem;font-weight:800;color:var(--orange);line-height:1; }
.price-old     { font-size:.73rem;color:var(--muted);text-decoration:line-through; }
.price-save    { font-size:.66rem;font-weight:700;color:var(--green);background:rgba(26,188,107,.1);padding:.1em .42em;border-radius:4px;margin-top:.12rem;display:inline-block; }
.footer-right  { display:flex;flex-direction:column;align-items:flex-end;gap:.38rem; }
.avail-row     { display:flex;align-items:center;gap:.32rem;font-size:.73rem;color:var(--muted); }
.status-dot    { width:8px;height:8px;border-radius:50%; }
.status-dot.g  { background:var(--green);box-shadow:0 0 5px var(--green); }
.status-dot.y  { background:var(--orange);box-shadow:0 0 5px var(--orange); }
.status-dot.r  { background:var(--red);box-shadow:0 0 5px var(--red); }
.btn-add {
  background:linear-gradient(135deg,var(--navy2),var(--sky2));
  color:#fff; border:none; border-radius:10px;
  padding:.5em .95em; font-size:.79rem; font-weight:700;
  cursor:pointer; transition:transform .15s,box-shadow .15s;
  white-space:nowrap; box-shadow:0 2px 10px rgba(41,182,232,.25);
}
.btn-add:hover    { transform:scale(1.06);box-shadow:0 4px 18px rgba(41,182,232,.4); }
.btn-add.ok       { background:linear-gradient(135deg,var(--green2),var(--green)); }
.btn-add:disabled { background:#d0dcea;color:#9aacc4;cursor:not-allowed;transform:none;box-shadow:none; }

/* empty */
.empty-state  { text-align:center;padding:4rem 1rem;color:var(--muted); }
.empty-icon   { font-size:3rem;margin-bottom:.5rem; }

/* footer */
.store-footer { position:relative;z-index:5;border-top:1px solid var(--border);padding:1.8rem 1.5rem;text-align:center; }
.footer-logo-row { display:flex;align-items:center;justify-content:center;margin-bottom:.6rem; }
.footer-logo { height:34px;border-radius:8px; }
.footer-copy { font-size:.77rem;color:var(--muted); }
.footer-copy strong { color:var(--sky2); }
.footer-rainbow { display:flex;height:3px;border-radius:99px;overflow:hidden;max-width:260px;margin:.7rem auto 0; }
.footer-rainbow span:nth-child(1){flex:1;background:var(--green);}
.footer-rainbow span:nth-child(2){flex:1;background:var(--sky);}
.footer-rainbow span:nth-child(3){flex:1;background:var(--orange);}
.footer-rainbow span:nth-child(4){flex:1;background:var(--yellow);}
.footer-rainbow span:nth-child(5){flex:1;background:var(--red);}

/* animations */
@keyframes fdDown { from{opacity:0;transform:translateY(-16px);} to{opacity:1;transform:translateY(0);} }
@keyframes fdUp   { from{opacity:0;transform:translateY(20px);}  to{opacity:1;transform:translateY(0);} }

/* responsive */
@media(max-width:700px) {
  .catalog-grid { grid-template-columns:1fr 1fr; gap:.85rem; }
  .stats-banner  { grid-template-columns:repeat(2,1fr); }
  .product-name  { font-size:.88rem; }
  .price-main    { font-size:1.18rem; }
  .product-body  { padding:.75rem; }
  .hdr-top       { flex-direction:column; align-items:flex-start; }
  .logo-img      { height:42px; }
}
@media(max-width:420px) { .catalog-grid { grid-template-columns:1fr; } }
</style>