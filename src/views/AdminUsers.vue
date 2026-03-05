<script setup>
import { ref, computed, onMounted } from 'vue';
import { supabase } from '../lib/supabase';
import Swal from 'sweetalert2';

// ── Crear usuario ──
const email    = ref('');
const password = ref('');
const name     = ref('');
const plan     = ref('basico');
const showCreateForm = ref(false);
const loadingCreate  = ref(false);

// ── Tabla ──
const users   = ref([]);
const search  = ref('');
const loading = ref(false);

// ── Modal editar ──
const showEditModal = ref(false);
const editUserData  = ref({ id: '', email: '', name: '', plan: 'basico' });

// ── Modal contraseña ──
const showPasswordModal = ref(false);
const passwordUserId    = ref(null);
const newPassword       = ref('');

// ─────────────────────────────────────────
const PLANS = [
  { id: 'basico',     label: 'Básico',     color: '#64748b', bg: '#f1f5f9', icon: '◈' },
  { id: 'pro',        label: 'Pro',        color: '#4f46e5', bg: '#eef2ff', icon: '⬡' },
  { id: 'comercial', label: 'Comercial', color: '#0369a1', bg: '#e0f2fe', icon: '✦' },
];

const getPlan = (id) => PLANS.find((p) => p.id === id) || PLANS[0];

// ─────────────────────────────────────────
const loadUsers = async () => {
  loading.value = true;
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'kiosk')
    .order('created_at', { ascending: false });
  users.value = data || [];
  loading.value = false;
};

const createUser = async () => {
  if (!email.value || !password.value) {
    Swal.fire('Campos requeridos', 'Email y contraseña son obligatorios.', 'warning');
    return;
  }
  loadingCreate.value = true;

  const { data: authData, error } = await supabase.auth.signUp({
    email: email.value,
    password: password.value,
  });

  if (error) {
    Swal.fire('Error', error.message, 'error');
    loadingCreate.value = false;
    return;
  }

  await supabase.from('profiles').insert({
    id:     authData.user.id,
    email:  email.value,
    name:   name.value,
    role:   'kiosk',
    plan:   plan.value,
    active: true,
  });

  loadingCreate.value = false;
  email.value = '';
  password.value = '';
  name.value = '';
  plan.value = 'basico';
  showCreateForm.value = false;

  Swal.fire({ icon: 'success', title: 'Usuario creado', toast: true,
    position: 'top-end', showConfirmButton: false, timer: 2500 });
  loadUsers();
};

// ── Activar / Desactivar ──
const toggleActive = async (id, value) => {
  await supabase.from('profiles').update({ active: value }).eq('id', id);
  loadUsers();
};

// ── Editar ──
const openEditModal = (u) => {
  editUserData.value = { ...u };
  showEditModal.value = true;
};

const saveEditUser = async () => {
  const { error } = await supabase
    .from('profiles')
    .update({
      email: editUserData.value.email,
      name:  editUserData.value.name,
      plan:  editUserData.value.plan,
    })
    .eq('id', editUserData.value.id);

  if (error) { Swal.fire('Error', error.message, 'error'); return; }

  showEditModal.value = false;
  Swal.fire({ icon: 'success', title: 'Guardado', toast: true,
    position: 'top-end', showConfirmButton: false, timer: 2000 });
  loadUsers();
};

// ── Contraseña ──
const openPasswordModal = (user) => {
  passwordUserId.value = user.id;
  newPassword.value = '';
  showPasswordModal.value = true;
};

const resetPasswordByEmail = async (user) => {
  const res = await Swal.fire({
    title: 'Restablecer contraseña',
    text: `Se enviará un correo a ${user.email}`,
    icon: 'info',
    showCancelButton: true,
    confirmButtonText: 'Enviar correo',
    cancelButtonText: 'Cancelar',
  });
  if (!res.isConfirmed) return;

  const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
    redirectTo: window.location.origin + '/reset-password',
  });

  error
    ? Swal.fire('Error', error.message, 'error')
    : Swal.fire('Correo enviado', 'El usuario recibirá instrucciones.', 'success');
};

// ── Eliminar ──
const deleteUser = async (id) => {
  const res = await Swal.fire({
    title: '¿Eliminar usuario?',
    text: 'Esta acción no se puede deshacer.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar',
  });
  if (!res.isConfirmed) return;

  await supabase.from('profiles').delete().eq('id', id);
  Swal.fire({ icon: 'success', title: 'Eliminado', toast: true,
    position: 'top-end', showConfirmButton: false, timer: 2000 });
  loadUsers();
};

// ── Filtro ──
const filteredUsers = computed(() =>
  users.value.filter(
    (u) =>
      (u.name  || '').toLowerCase().includes(search.value.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(search.value.toLowerCase())
  )
);

// ── Stats ──
const totalUsers  = computed(() => users.value.length);
const activeUsers = computed(() => users.value.filter((u) => u.active).length);
const proUsers    = computed(() => users.value.filter((u) => u.plan === 'pro' || u.plan === 'comercial').length);

onMounted(loadUsers);
</script>

<template>
  <div class="page">

    <!-- ── HEADER ── -->
    <div class="page-header">
      <div class="header-left">
        <div class="logo-badge">K</div>
        <div>
          <h1>Usuarios Kiosko</h1>
          <p class="subtitle">Gestión de accesos y planes</p>
        </div>
      </div>
      <button class="btn-primary" @click="showCreateForm = !showCreateForm">
        {{ showCreateForm ? '✕ Cancelar' : '+ Nuevo usuario' }}
      </button>
    </div>

    <!-- ── STATS ── -->
    <div class="stats-row">
      <div class="stat-card">
        <span class="stat-num">{{ totalUsers }}</span>
        <span class="stat-label">Total usuarios</span>
      </div>
      <div class="stat-card green">
        <span class="stat-num">{{ activeUsers }}</span>
        <span class="stat-label">Activos</span>
      </div>
      <div class="stat-card indigo">
        <span class="stat-num">{{ proUsers }}</span>
        <span class="stat-label">Pro / Comercial</span>
      </div>
    </div>

    <!-- ── FORM CREAR ── -->
    <Transition name="slide">
      <div v-if="showCreateForm" class="card form-card">
        <div class="card-title">Nuevo usuario</div>
        <div class="form-grid">
          <div class="field">
            <label>Email *</label>
            <input v-model="email" type="email" placeholder="correo@ejemplo.com" />
          </div>
          <div class="field">
            <label>Nombre</label>
            <input v-model="name" placeholder="Nombre completo" />
          </div>
          <div class="field">
            <label>Contraseña *</label>
            <input v-model="password" type="password" placeholder="••••••••" />
          </div>
          <div class="field">
            <label>Plan</label>
            <div class="plan-selector">
              <button
                v-for="p in PLANS" :key="p.id"
                class="plan-btn"
                :class="{ active: plan === p.id }"
                :style="plan === p.id ? `background:${p.bg};border-color:${p.color};color:${p.color}` : ''"
                type="button"
                @click="plan = p.id"
              >{{ p.icon }} {{ p.label }}</button>
            </div>
          </div>
        </div>
        <button class="btn-primary full" :disabled="loadingCreate" @click="createUser">
          {{ loadingCreate ? 'Creando…' : 'Crear usuario' }}
        </button>
      </div>
    </Transition>

    <!-- ── BUSCADOR ── -->
    <div class="search-wrap">
      <span class="search-icon">⌕</span>
      <input class="search-input" v-model="search" placeholder="Buscar por nombre o email…" />
    </div>

    <!-- ── TABLA (desktop) ── -->
    <div class="card table-card desktop-table">
      <div v-if="loading" class="empty">Cargando…</div>
      <div v-else-if="filteredUsers.length === 0" class="empty">Sin resultados</div>
      <table v-else>
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Plan</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in filteredUsers" :key="u.id">
            <td>
              <div class="user-cell">
                <div class="avatar">{{ (u.name || u.email || '?')[0].toUpperCase() }}</div>
                <div>
                  <div class="user-name">{{ u.name || '—' }}</div>
                  <div class="user-email">{{ u.email }}</div>
                </div>
              </div>
            </td>
            <td>
              <span class="plan-badge" :style="`background:${getPlan(u.plan).bg};color:${getPlan(u.plan).color}`">
                {{ getPlan(u.plan).icon }} {{ getPlan(u.plan).label }}
              </span>
            </td>
            <td>
              <button class="status-toggle" :class="u.active ? 'status-on' : 'status-off'" @click="toggleActive(u.id, !u.active)">
                <span class="status-dot"></span>
                {{ u.active ? 'Activo' : 'Inactivo' }}
              </button>
            </td>
            <td>
              <div class="actions">
                <button class="btn-action btn-default" @click="openEditModal(u)">✎ Editar</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── CARDS (mobile) ── -->
    <div class="mobile-cards">
      <div v-if="loading" class="empty">Cargando…</div>
      <div v-else-if="filteredUsers.length === 0" class="empty">Sin resultados</div>
      <div v-else class="cards-list">
        <div v-for="u in filteredUsers" :key="u.id" class="user-card">

          <!-- Top: avatar + info + plan -->
          <div class="uc-top">
            <div class="avatar lg">{{ (u.name || u.email || '?')[0].toUpperCase() }}</div>
            <div class="uc-info">
              <div class="user-name">{{ u.name || '—' }}</div>
              <div class="user-email">{{ u.email }}</div>
            </div>
            <span class="plan-badge" :style="`background:${getPlan(u.plan).bg};color:${getPlan(u.plan).color}`">
              {{ getPlan(u.plan).icon }} {{ getPlan(u.plan).label }}
            </span>
          </div>

          <!-- Divider -->
          <div class="uc-divider"></div>

          <!-- Bottom: estado + acciones -->
          <div class="uc-bottom">
            <button class="status-toggle" :class="u.active ? 'status-on' : 'status-off'" @click="toggleActive(u.id, !u.active)">
              <span class="status-dot"></span>
              {{ u.active ? 'Activo' : 'Inactivo' }}
            </button>
            <div class="uc-actions">
              <button class="btn-action btn-default" @click="openEditModal(u)">✎ Editar</button>
            </div>
          </div>

        </div>
      </div>
    </div>

    <!-- ── MODAL EDITAR ── -->
    <Transition name="fade">
      <div v-if="showEditModal" class="modal-backdrop" @click.self="showEditModal = false">
        <div class="modal">
          <div class="modal-header">
            <h3>Editar usuario</h3>
            <button class="modal-close" @click="showEditModal = false">✕</button>
          </div>

          <div class="field">
            <label>Email</label>
            <input v-model="editUserData.email" type="email" />
          </div>
          <div class="field">
            <label>Nombre</label>
            <input v-model="editUserData.name" />
          </div>
          <div class="field">
            <label>Plan</label>
            <div class="plan-selector">
              <button
                v-for="p in PLANS" :key="p.id"
                class="plan-btn"
                :class="{ active: editUserData.plan === p.id }"
                :style="editUserData.plan === p.id ? `background:${p.bg};border-color:${p.color};color:${p.color}` : ''"
                type="button"
                @click="editUserData.plan = p.id"
              >{{ p.icon }} {{ p.label }}</button>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-primary full" @click="saveEditUser">Guardar cambios</button>
            <button class="btn-ghost full" @click="showEditModal = false">Cancelar</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ── MODAL CONTRASEÑA ── -->
    <Transition name="fade">
      <div v-if="showPasswordModal" class="modal-backdrop" @click.self="showPasswordModal = false">
        <div class="modal">
          <div class="modal-header">
            <h3>Cambiar contraseña</h3>
            <button class="modal-close" @click="showPasswordModal = false">✕</button>
          </div>

          <div class="field">
            <label>Nueva contraseña</label>
            <input v-model="newPassword" type="password" placeholder="••••••••" />
          </div>

          <div class="modal-footer">
            <button class="btn-primary full" @click="showPasswordModal = false">Actualizar</button>
            <button class="btn-ghost full" @click="showPasswordModal = false">Cancelar</button>
          </div>
        </div>
      </div>
    </Transition>

  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&display=swap');

*, *::before, *::after { box-sizing: border-box; }

.page {
  padding: 24px 20px;
  background: #f4f6fb;
  min-height: 100vh;
  font-family: 'DM Sans', sans-serif;
  color: #0f172a;
}

/* HEADER */
.page-header {
  display: flex; align-items: center;
  justify-content: space-between;
  flex-wrap: wrap; gap: 12px; margin-bottom: 20px;
}
.header-left { display: flex; align-items: center; gap: 12px; }
.logo-badge {
  width: 42px; height: 42px; border-radius: 12px;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  color: #fff; font-size: 18px; font-weight: 700;
  display: grid; place-items: center;
  box-shadow: 0 4px 12px rgba(79,70,229,.3);
}
h1 { margin: 0; font-size: 20px; font-weight: 700; }
.subtitle { margin: 0; font-size: 12px; color: #94a3b8; }

/* STATS */
.stats-row {
  display: grid; grid-template-columns: repeat(3,1fr);
  gap: 12px; margin-bottom: 18px;
}
.stat-card {
  background: #fff; border-radius: 12px; padding: 14px 16px;
  display: flex; flex-direction: column; gap: 2px;
  box-shadow: 0 1px 4px rgba(0,0,0,.06);
  border-left: 3px solid #e2e8f0;
}
.stat-card.green  { border-left-color: #16a34a; }
.stat-card.indigo { border-left-color: #4f46e5; }
.stat-num   { font-size: 26px; font-weight: 700; }
.stat-label { font-size: 11px; color: #64748b; font-weight: 500; }

/* CARD */
.card { background: #fff; border-radius: 14px; box-shadow: 0 1px 6px rgba(0,0,0,.07); }

/* FORM */
.form-card { padding: 20px; margin-bottom: 16px; border: 1px solid #e2e8f0; }
.card-title {
  font-weight: 700; font-size: 13px; color: #4f46e5;
  margin-bottom: 14px; text-transform: uppercase; letter-spacing: .05em;
}
.form-grid {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 14px; margin-bottom: 16px;
}
@media (max-width: 580px) { .form-grid { grid-template-columns: 1fr; } }

/* FIELDS */
.field { display: flex; flex-direction: column; gap: 5px; }
.field label {
  font-size: 11px; font-weight: 600; color: #64748b;
  text-transform: uppercase; letter-spacing: .04em;
}
.field input {
  padding: 10px 12px; border: 1.5px solid #e2e8f0;
  border-radius: 9px; font-size: 14px; font-family: inherit;
  background: #fafafa; transition: border-color .18s, box-shadow .18s;
}
.field input:focus {
  outline: none; border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99,102,241,.12); background: #fff;
}

/* PLAN SELECTOR */
.plan-selector { display: flex; gap: 8px; flex-wrap: wrap; }
.plan-btn {
  padding: 7px 13px; border: 1.5px solid #e2e8f0;
  border-radius: 8px; background: #fff;
  font-size: 13px; font-weight: 600; color: #64748b;
  cursor: pointer; font-family: inherit; transition: all .15s;
}
.plan-btn:hover { border-color: #a5b4fc; }
.plan-btn.active { font-weight: 700; }

/* BUTTONS */
.btn-primary {
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  color: #fff; border: none; padding: 10px 18px;
  border-radius: 10px; font-size: 14px; font-weight: 600;
  font-family: inherit; cursor: pointer;
  transition: opacity .18s, transform .12s;
  box-shadow: 0 3px 10px rgba(79,70,229,.25);
}
.btn-primary:hover:not(:disabled) { opacity: .9; transform: translateY(-1px); }
.btn-primary:disabled { opacity: .55; cursor: not-allowed; }
.btn-primary.full { width: 100%; padding: 12px; }

.btn-ghost {
  background: #f1f5f9; color: #475569; border: none;
  padding: 12px; border-radius: 10px; font-size: 14px;
  font-weight: 600; font-family: inherit; cursor: pointer; width: 100%;
}
.btn-ghost:hover { background: #e2e8f0; }

/* ACTION BUTTONS */
.btn-action {
  padding: 6px 11px; border: none; border-radius: 7px;
  font-size: 12px; font-weight: 600; font-family: inherit;
  cursor: pointer; white-space: nowrap;
  transition: filter .15s, transform .1s;
}
.btn-action:hover { filter: brightness(.93); transform: scale(1.03); }
.btn-default { background: #e0e7ff; color: #4338ca; }
.btn-success { background: #dcfce7; color: #15803d; }
.btn-warn    { background: #fef3c7; color: #b45309; }
.btn-danger  { background: #fee2e2; color: #dc2626; }

/* SEARCH */
.search-wrap { position: relative; margin-bottom: 14px; }
.search-icon {
  position: absolute; left: 12px; top: 50%;
  transform: translateY(-50%); font-size: 18px;
  color: #94a3b8; pointer-events: none;
}
.search-input {
  width: 100%; padding: 10px 12px 10px 36px;
  border: 1.5px solid #e2e8f0; border-radius: 10px;
  font-size: 14px; font-family: inherit; background: #fff;
  transition: border-color .18s;
}
.search-input:focus {
  outline: none; border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99,102,241,.12);
}

/* TABLE */
.table-card { overflow: hidden; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
thead th {
  background: #f8fafc; padding: 12px 14px; text-align: left;
  font-size: 11px; font-weight: 700;
  text-transform: uppercase; letter-spacing: .06em; color: #64748b;
  border-bottom: 1px solid #f1f5f9;
}
tbody tr { border-bottom: 1px solid #f8fafc; transition: background .1s; }
tbody tr:last-child { border-bottom: none; }
tbody tr:hover { background: #fafbff; }
td { padding: 12px 14px; vertical-align: middle; }

/* USER CELL */
.user-cell { display: flex; align-items: center; gap: 10px; }
.avatar {
  width: 34px; height: 34px; border-radius: 9px; flex-shrink: 0;
  background: linear-gradient(135deg, #e0e7ff, #c7d2fe);
  color: #4f46e5; font-weight: 700; font-size: 14px;
  display: grid; place-items: center;
}
.user-name  { font-weight: 600; }
.user-email { font-size: 12px; color: #94a3b8; }

/* BADGES */
.plan-badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 10px; border-radius: 20px;
  font-size: 12px; font-weight: 700;
}

/* STATUS TOGGLE */
.status-toggle {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 12px; border: none; border-radius: 20px;
  font-size: 12px; font-weight: 600; font-family: inherit;
  cursor: pointer; transition: filter .15s, transform .1s;
}
.status-toggle:hover { filter: brightness(.93); transform: scale(1.04); }
.status-toggle.status-on  { background: #dcfce7; color: #16a34a; }
.status-toggle.status-off { background: #fee2e2; color: #dc2626; }
.status-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }

.actions { display: flex; gap: 6px; flex-wrap: nowrap; align-items: center; }

/* ── RESPONSIVE ── */
.desktop-table { display: block; }
.mobile-cards  { display: none; }

@media (max-width: 680px) {
  .desktop-table { display: none; }
  .mobile-cards  { display: block; }

  .stats-row { grid-template-columns: repeat(3,1fr); gap: 8px; }
  .stat-num  { font-size: 20px; }

  .cards-list { display: flex; flex-direction: column; gap: 10px; }

  .user-card {
    background: #fff;
    border-radius: 14px;
    padding: 14px;
    box-shadow: 0 1px 6px rgba(0,0,0,.07);
    display: flex; flex-direction: column; gap: 10px;
  }

  .uc-top {
    display: flex; align-items: center; gap: 10px;
  }

  .uc-info { flex: 1; min-width: 0; }
  .uc-info .user-name  { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .uc-info .user-email { font-size: 12px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .avatar.lg { width: 40px; height: 40px; border-radius: 11px; font-size: 16px; flex-shrink: 0; }

  .uc-divider { height: 1px; background: #f1f5f9; }

  .uc-bottom {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
  }

  .uc-actions { display: flex; gap: 6px; }
}

.empty { padding: 40px; text-align: center; color: #94a3b8; font-size: 14px; }

/* MODAL */
.modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(15,23,42,.5); backdrop-filter: blur(4px);
  display: flex; justify-content: center; align-items: center; z-index: 1000;
}
.modal {
  background: #fff; padding: 24px; border-radius: 16px;
  width: 100%; max-width: 400px;
  display: flex; flex-direction: column; gap: 14px;
  box-shadow: 0 30px 60px rgba(0,0,0,.2);
}
.modal-header { display: flex; align-items: center; justify-content: space-between; }
.modal-header h3 { margin: 0; font-size: 17px; font-weight: 700; }
.modal-close {
  width: 28px; height: 28px; border: none; border-radius: 7px;
  background: #f1f5f9; color: #64748b; cursor: pointer;
  display: grid; place-items: center; font-size: 13px;
}
.modal-close:hover { background: #e2e8f0; }
.modal-footer { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }

/* TRANSITIONS */
.slide-enter-active, .slide-leave-active { transition: all .25s ease; }
.slide-enter-from, .slide-leave-to { opacity: 0; transform: translateY(-8px); }
.fade-enter-active, .fade-leave-active { transition: opacity .2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>