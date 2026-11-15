<template>
  <div class="login-page">
    <div class="login-card">
      <!-- Logo arriba -->
      <div class="logo">
        <img src="/logo-sin-fondo.png" alt="KioPOS Logo" />
      </div>

      <form @submit.prevent="login" class="login-form">
        <div class="input-group">
          <label>Correo electrónico</label>
          <input
            type="email"
            v-model="email"
            placeholder="Correo electrónico"
            required
          />
        </div>

        <div class="input-group">
          <label>Contraseña</label>
          <input
            type="password"
            v-model="password"
            placeholder="Contraseña"
            required
          />
        </div>

        <button type="submit" :disabled="loading">
          {{ loading ? 'Ingresando...' : 'Entrar' }}
        </button>

        <p v-if="error" class="error-msg">{{ error }}</p>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import api from '../lib/axios';
import { useRouter } from 'vue-router';

const email = ref('');
const password = ref('');
const loading = ref(false);
const error = ref(null);

const router = useRouter();

const login = async () => {
  loading.value = true;
  error.value = null;

  try {
    // Petición a tu API Laravel con Passport
    const response = await api.post('/login', {
      email: email.value,
      password: password.value,
    });

    // Dentro de tu función login en Login.vue:
    const { token, user } = response.data;

    // Guardar token y usuario en localStorage
    localStorage.setItem('kiopos_token', token);
    localStorage.setItem('kiopos_user', JSON.stringify(user));

    // Validación de usuario activo y reglas de Kiosko
    if (user.role === 'kiosk') {
      if (!user.active) {
        localStorage.removeItem('kiopos_token');
        error.value =
          'Tu usuario kiosko está inactivo. Contacta al administrador por pagos pendientes.';
        return;
      }
    }

    // Redirección según rol (idéntico al flujo anterior)
    if (user.role === 'admin') {
      router.push('/users');
    } else {
      router.push('/');
    }

  } catch (err) {
    console.error(err);
    if (err.response && err.response.data && err.response.data.message) {
      error.value = err.response.data.message;
    } else {
      error.value = 'Credenciales incorrectas o error de conexión';
    }
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
/* ---------- Página completa ---------- */
.login-page {
  position: relative;
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 24px 20px;
  box-sizing: border-box;
  overflow: hidden;
  background-color: #0b3c5d;
  background-image: linear-gradient(145deg, #072a43 0%, #0b3c5d 50%, #11708f 100%);
  font-family: 'Inter', 'Segoe UI', Roboto, system-ui, -apple-system, sans-serif;
}

/* Círculos decorativos de fondo */
.login-page::before,
.login-page::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}

.login-page::before {
  width: 420px;
  height: 420px;
  top: -140px;
  right: -120px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.login-page::after {
  width: 320px;
  height: 320px;
  bottom: -120px;
  left: -100px;
  background: rgba(31, 162, 193, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

/* ---------- Tarjeta ---------- */
.login-card {
  position: relative;
  z-index: 1;
  background: #ffffff;
  border-radius: 28px;
  padding: 44px 34px 36px;
  width: 100%;
  max-width: 400px;
  box-shadow:
    0 30px 60px rgba(3, 20, 34, 0.45),
    0 0 0 1px rgba(255, 255, 255, 0.35);
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 26px;
  box-sizing: border-box;
  overflow: hidden;
}

/* Franja de color superior */
.login-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 6px;
  background: linear-gradient(90deg, #1fa2c1, #22c55e, #f59e0b);
}

/* ---------- Logo ---------- */
.logo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.logo img {
  width: 120px;
  max-width: 100%;
  height: auto;
  object-fit: contain;
  filter: drop-shadow(0 10px 14px rgba(11, 60, 93, 0.2));
}

.logo h1 {
  font-size: 26px;
  font-weight: 800;
  color: #0b3c5d;
  letter-spacing: -0.5px;
}

/* ---------- Formulario ---------- */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* ---------- Inputs ---------- */
.input-group {
  display: flex;
  flex-direction: column;
  text-align: left;
}

.input-group label {
  font-weight: 600;
  margin-bottom: 7px;
  color: #334155;
  font-size: 13px;
  letter-spacing: 0.3px;
  transition: color 0.2s ease;
}

.input-group:focus-within label {
  color: #0b3c5d;
}

.input-group input {
  width: 100%;
  box-sizing: border-box;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1.5px solid #dbe4ee;
  background: #f5f8fb;
  color: #0f172a;
  outline: none;
  font-size: 16px;
  font-family: inherit;
  transition: all 0.25s ease-in-out;
}

.input-group input::placeholder {
  color: #94a3b8;
}

.input-group input:hover {
  border-color: #b6c6d8;
}

.input-group input:focus {
  background: #ffffff;
  border-color: #1fa2c1;
  box-shadow: 0 0 0 4px rgba(31, 162, 193, 0.2);
}

/* Autocompletado del navegador */
.input-group input:-webkit-autofill {
  -webkit-box-shadow: 0 0 0 40px #eef6fb inset;
  -webkit-text-fill-color: #0f172a;
}

/* ---------- Botón ---------- */
button {
  position: relative;
  margin-top: 6px;
  padding: 15px 0;
  border-radius: 14px;
  border: none;
  background: linear-gradient(135deg, #22c55e, #16a34a);
  color: #ffffff;
  font-weight: 700;
  font-size: 16px;
  font-family: inherit;
  letter-spacing: 0.4px;
  cursor: pointer;
  transition: all 0.25s ease-in-out;
  box-shadow: 0 10px 20px rgba(34, 197, 94, 0.35);
}

button:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 26px rgba(34, 197, 94, 0.45);
}

button:active {
  transform: translateY(0);
  box-shadow: 0 6px 12px rgba(34, 197, 94, 0.35);
}

button:focus-visible {
  outline: 3px solid rgba(31, 162, 193, 0.5);
  outline-offset: 3px;
}

button:disabled {
  opacity: 0.75;
  cursor: not-allowed;
  transform: none;
  box-shadow: 0 6px 12px rgba(34, 197, 94, 0.25);
}

/* ---------- Error ---------- */
.error-msg {
  margin: 0;
  padding: 12px 14px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-left: 4px solid #dc2626;
  border-radius: 12px;
  color: #b91c1c;
  font-weight: 500;
  font-size: 14px;
  line-height: 1.4;
  text-align: left;
}

/* ---------- Responsive ---------- */
@media (max-width: 480px) {
  .login-page {
    padding: 16px;
  }

  .login-card {
    padding: 36px 22px 28px;
    max-width: 360px;
    border-radius: 24px;
    gap: 22px;
  }

  .logo img {
    width: 100px;
    max-width: 100%;
  }

  button {
    font-size: 16px;
    padding: 14px 0;
  }
}
</style>
