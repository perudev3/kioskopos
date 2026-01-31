<script setup>
import { ref, computed, onMounted } from 'vue';
import { supabase } from '../lib/supabase';
import Swal from 'sweetalert2';

const email = ref('');
const password = ref('');
const name = ref('');
const users = ref([]);
const search = ref('');
const showPasswordModal = ref(false);
const passwordUserId = ref(null);
const newPassword = ref('');


const showEditModal = ref(false);
const editUserData = ref({ id: '', email: '', name: '' });

const loadUsers = async () => {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'kiosk')
    .order('created_at', { ascending: false });

  users.value = data || [];
};

const createUser = async () => {
  if (!email.value || !password.value) return;

  const { data: authData } = await supabase.auth.signUp({
    email: email.value,
    password: password.value,
  });

  await supabase.from('profiles').insert({
    id: authData.user.id,
    email: email.value,
    name: name.value,
    role: 'kiosk',
    active: true,
  });

  email.value = '';
  password.value = '';
  name.value = '';
  loadUsers();
};

const toggleActive = async (id, value) => {
  await supabase.from('profiles').update({ active: value }).eq('id', id);
  loadUsers();
};

const openEditModal = (u) => {
  editUserData.value = { ...u };
  showEditModal.value = true;
};

const saveEditUser = async () => {
  await supabase
    .from('profiles')
    .update({
      email: editUserData.value.email,
      name: editUserData.value.name,
    })
    .eq('id', editUserData.value.id);

  showEditModal.value = false;
  loadUsers();
};

const deleteUser = async (id) => {
  const res = await Swal.fire({
    title: '¿Eliminar usuario?',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
  });

  if (!res.isConfirmed) return;

  await supabase.from('profiles').delete().eq('id', id);
  loadUsers();
};

const filteredUsers = computed(() =>
  users.value.filter(
    (u) =>
      (u.name || '').toLowerCase().includes(search.value.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(search.value.toLowerCase())
  )
);

const openPasswordModal = (user) => {
  passwordUserId.value = user.id;
  newPassword.value = '';
  showPasswordModal.value = true;
};

const resetPasswordByEmail = async (user) => {
  const res = await Swal.fire({
    title: 'Restablecer contraseña',
    text: `Se enviará un correo a ${user.email}`,
    showCancelButton: true,
    confirmButtonText: 'Enviar',
  })

  if (!res.isConfirmed) return

  const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
    redirectTo: window.location.origin + '/reset-password',
  })

  if (error) {
    Swal.fire('Error', error.message, 'error')
  } else {
    Swal.fire(
      'Correo enviado',
      'El usuario podrá cambiar su contraseña desde el correo',
      'success'
    )
  }
};


onMounted(loadUsers);
</script>

<template>
  <div class="users-page">
    <h1>Usuarios Kiosko</h1>

    <!-- Crear usuario -->
    <div class="form-card">
      <input v-model="email" type="email" placeholder="Email" />
      <input v-model="password" type="password" placeholder="Contraseña" />
      <input v-model="name" placeholder="Nombre" />
      <button @click="createUser">Crear usuario</button>
    </div>

    <!-- Buscar -->
    <input
      class="search"
      v-model="search"
      placeholder="Buscar por nombre o email"
    />

    <!-- Tabla -->
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Email</th>
            <th>Estado</th>
            <th style="width: 180px">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in filteredUsers" :key="u.id">
            <td>{{ u.name || '-' }}</td>
            <td>{{ u.email }}</td>
            <td>
              <span :class="u.active ? 'active' : 'inactive'">
                {{ u.active ? 'Activo' : 'Inactivo' }}
              </span>
            </td>
            <td class="actions">
              <button @click="toggleActive(u.id, !u.active)">
                {{ u.active ? 'Desactivar' : 'Activar' }}
              </button>
              <button @click="openEditModal(u)">Editar</button>
              <button class="danger" @click="deleteUser(u.id)">Eliminar</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal -->
    <div v-if="showEditModal" class="modal-backdrop">
      <div class="modal">
        <h3>Editar usuario</h3>
        <input v-model="editUserData.email" />
        <input v-model="editUserData.name" />
        <div class="modal-actions">
          <button @click="saveEditUser">Guardar</button>
          <button @click="showEditModal = false">Cancelar</button>
        </div>
      </div>
    </div>

    <div v-if="showPasswordModal" class="modal-backdrop">
  <div class="modal">
    <h3>Cambiar contraseña</h3>

    <input
      type="password"
      v-model="newPassword"
      placeholder="Nueva contraseña"
    />

    <div class="modal-actions">
      <button @click="updatePassword">Actualizar</button>
      <button @click="showPasswordModal = false">Cancelar</button>
    </div>
  </div>
</div>

  </div>
</template>

<style scoped>
/* COLORES KioPOS */
.users-page {
  padding: 16px;
  background: #f4f6fb;
  color: #111827;
  font-family: system-ui, sans-serif;
}

h1 {
  color: #4f46e5;
}

/* FORM */
.form-card {
  background: #fff;
  padding: 16px;
  border-radius: 10px;
  display: grid;
  gap: 10px;
  margin-bottom: 12px;
}

.form-card input {
  padding: 10px;
  border: 1px solid #c7d2fe;
  border-radius: 8px;
}

.form-card button {
  background: #4f46e5;
  color: #fff;
  border: none;
  padding: 10px;
  border-radius: 8px;
  font-weight: 600;
}

/* SEARCH */
.search {
  width: 100%;
  padding: 10px;
  margin-bottom: 10px;
  border-radius: 8px;
  border: 1px solid #c7d2fe;
}

/* TABLE */
.table-wrapper {
  max-height: 60vh;
  overflow-y: auto;
  background: white;
  border-radius: 10px;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

thead {
  background: #eef2ff;
}

th,
td {
  padding: 10px;
  border-bottom: 1px solid #e5e7eb;
  text-align: left;
}

.active {
  color: #16a34a;
  font-weight: 600;
}

.inactive {
  color: #dc2626;
  font-weight: 600;
}

/* ACTIONS */
.actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.actions button {
  padding: 6px 10px;
  border: none;
  border-radius: 8px;
  background: #e0e7ff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.actions button:hover {
  background: #c7d2fe;
}

.actions .danger {
  background: #fecaca;
}

/* MODAL */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  justify-content: center;
  align-items: center;
}

.modal {
  background: #fff;
  padding: 20px;
  border-radius: 12px;
  width: 300px;
  display: grid;
  gap: 10px;
}

.table-wrapper {
  max-height: 65vh;
  overflow-y: auto;
  background: white;
  border-radius: 14px;
  box-shadow: 0 8px 20px rgba(0,0,0,.08);
}

table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}

thead th {
  position: sticky;
  top: 0;
  background: #eef2ff;
  z-index: 2;
}

tbody tr:hover {
  background: #f8fafc;
}

td:first-child,
th:first-child {
  padding-left: 16px;
}

td:last-child,
th:last-child {
  padding-right: 16px;
}

/* ===== MODAL PRO ===== */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(4px);
  z-index: 1000;
}

.modal {
  background: #ffffff;
  padding: 22px;
  border-radius: 16px;
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 25px 50px rgba(0,0,0,.35);
  animation: modalFade 0.25s ease;
}

.modal h3 {
  margin: 0 0 10px;
  font-size: 18px;
  font-weight: 700;
  color: #4f46e5;
  text-align: center;
}

.modal input {
  padding: 12px;
  border-radius: 10px;
  border: 1px solid #c7d2fe;
  font-size: 14px;
}

.modal input:focus {
  outline: none;
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99,102,241,.25);
}

.modal-actions {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}

.modal-actions button {
  flex: 1;
  padding: 10px;
  border-radius: 10px;
  border: none;
  font-weight: 600;
  cursor: pointer;
}

.modal-actions button:first-child {
  background: #4f46e5;
  color: white;
}

.modal-actions button:first-child:hover {
  background: #4338ca;
}

.modal-actions button:last-child {
  background: #e5e7eb;
}

.modal-actions button:last-child:hover {
  background: #d1d5db;
}

/* Animación */
@keyframes modalFade {
  from {
    opacity: 0;
    transform: scale(.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

</style>
