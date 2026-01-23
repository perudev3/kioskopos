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
import { supabase } from '../lib/supabase';
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
    const { data: authData, error: loginError } =
      await supabase.auth.signInWithPassword({
        email: email.value,
        password: password.value,
      });

    if (loginError) {
      error.value = loginError.message;
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('active, role')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (profileError) {
      console.error(profileError);
      error.value = 'Error al verificar el perfil';
      return;
    }

    if (profile?.role === 'kiosk') {
      if (!profile) {
        await supabase.auth.signOut();
        error.value =
          'Usuario kiosko no registrado correctamente. Contacta al administrador.';
        return;
      }
      if (!profile.active) {
        await supabase.auth.signOut();
        error.value =
          'Tu usuario kiosko está inactivo. Contacta al administrador por pagos pendientes.';
        return;
      }
    }

    router.push('/');
  } catch (err) {
    console.error(err);
    error.value = 'Error inesperado, revisa la consola';
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
/* Página completa */
.login-page {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background: linear-gradient(135deg, #0b3c5d, #1fa2c1);
  padding: 20px;
  box-sizing: border-box;
}

/* Tarjeta */
.login-card {
  background: #ffffff;
  border-radius: 24px;
  padding: 40px 30px;
  width: 100%;
  max-width: 380px;
  box-shadow: 0 18px 35px rgba(0, 0, 0, 0.25);
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 25px;
  box-sizing: border-box;
}

/* Logo */
.logo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.logo img {
  max-width: 90px;
  height: auto;
  object-fit: contain;
}

.logo h1 {
  font-size: 26px;
  font-weight: 700;
  color: #0b3c5d;
}

/* Form */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Inputs */
.input-group {
  display: flex;
  flex-direction: column;
  text-align: left;
}

.input-group label {
  font-weight: 600;
  margin-bottom: 6px;
  color: #0f172a;
  font-size: 14px;
}

.input-group input {
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid #cbd5e1;
  outline: none;
  font-size: 15px;
  transition: all 0.25s ease-in-out;
}

.input-group input:focus {
  border-color: #1fa2c1;
  box-shadow: 0 0 0 3px rgba(31, 162, 193, 0.25);
}

/* Botón */
button {
  padding: 14px 0;
  border-radius: 12px;
  border: none;
  background: #22c55e;
  color: #ffffff;
  font-weight: 600;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.25s ease-in-out;
  box-shadow: 0 8px 16px rgba(34, 197, 94, 0.35);
}

button:hover {
  background: #16a34a;
  box-shadow: 0 10px 20px rgba(34, 197, 94, 0.45);
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Error */
.error-msg {
  color: #dc2626;
  font-weight: 500;
  font-size: 14px;
}

/* Responsive */
@media (max-width: 480px) {
  .login-card {
    padding: 30px 20px;
    max-width: 320px;
  }

  .logo img {
    max-width: 50%;
    margin-bottom: -50px;
  }

  button {
    font-size: 15px;
    padding: 12px 0;
  }
}
</style>
