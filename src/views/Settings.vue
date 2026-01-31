<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '@/supabase'

const methods = [
  { key: 'yape', label: 'Yape', color: '#7b1fa2' },
  { key: 'plin', label: 'Plin', color: '#0d47a1' }
]

const userId = ref(null)
const loading = ref(false)
const message = ref('')

const form = ref({
  yape: { display_name: '', phone_number: '', qr_url: '', file: null },
  plin: { display_name: '', phone_number: '', qr_url: '', file: null }
})

onMounted(async () => {
  const { data } = await supabase.auth.getUser()
  userId.value = data.user.id
  loadQRs()
})

const loadQRs = async () => {
  const { data } = await supabase
    .from('payment_qrs')
    .select('*')
    .eq('user_id', userId.value)

  data?.forEach(qr => {
    form.value[qr.method] = {
      ...form.value[qr.method],
      display_name: qr.display_name,
      phone_number: qr.phone_number,
      qr_url: qr.qr_url
    }
  })
}

const onFileChange = (e, method) => {
  const file = e.target.files[0]

  if (!file) return

  if (!file.type.startsWith('image/')) {
    alert('Solo se permiten imágenes')
    return
  }

  if (file.size > 2 * 1024 * 1024) {
    alert('Máximo 2MB')
    return
  }

  form.value[method].file = file
}


const uploadQR = async (method) => {
  const file = form.value[method].file
  if (!file) return form.value[method].qr_url

  const filePath = `${userId.value}/${method}.png`

  const { error } = await supabase.storage
    .from('payment-qrs')
    .upload(filePath, file, {
      upsert: true,
      contentType: file.type
    })

  if (error) throw error

  const { data } = supabase.storage
    .from('payment-qrs')
    .getPublicUrl(filePath)

  return data.publicUrl
}

const saveQR = async (method) => {
  try {
    loading.value = true
    message.value = ''

    const qr_url = await uploadQR(method)

    await supabase.from('payment_qrs').upsert({
      user_id: userId.value,
      method,
      display_name: form.value[method].display_name,
      phone_number: form.value[method].phone_number,
      qr_url
    })

    form.value[method].qr_url = qr_url
    message.value = `✔ QR de ${method.toUpperCase()} guardado`
  } catch (e) {
    message.value = '❌ Error al guardar el QR'
    console.error(e)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="container">
    <h2>💳 Métodos de pago</h2>
    <p class="subtitle">Configura tus QR oficiales para cobrar</p>

    <div class="grid">
      <div
        v-for="m in methods"
        :key="m.key"
        class="card"
      >
        <div class="card-header" :style="{ borderColor: m.color }">
          <span class="dot" :style="{ background: m.color }"></span>
          <h3>{{ m.label }}</h3>
        </div>

        <label>Nombre a mostrar</label>
        <input v-model="form[m.key].display_name" placeholder="Ej: Bodega San Juan" />

        <label>Número</label>
        <input v-model="form[m.key].phone_number" placeholder="Ej: 987654321" />

        <label>QR oficial</label>
        <input type="file" accept="image/*" @change="e => onFileChange(e, m.key)" />

        <div v-if="form[m.key].qr_url" class="preview">
          <img :src="form[m.key].qr_url" />
        </div>

        <button
          :disabled="loading"
          @click="saveQR(m.key)"
          :style="{ background: m.color }"
        >
          Guardar {{ m.label }}
        </button>
      </div>
    </div>

    <p v-if="message" class="message">{{ message }}</p>
  </div>
</template>

<style scoped>
.container {
  max-width: 900px;
  margin: auto;
  padding: 24px;
}

h2 {
  margin-bottom: 4px;
}

.subtitle {
  color: #666;
  margin-bottom: 24px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
}

.card {
  background: #fff;
  border-radius: 14px;
  padding: 18px;
  box-shadow: 0 10px 25px rgba(0,0,0,.05);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 2px solid;
  padding-bottom: 8px;
  margin-bottom: 14px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

label {
  font-size: 13px;
  color: #555;
}

input {
  width: 100%;
  margin: 6px 0 14px;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid #ddd;
}

.preview {
  display: flex;
  justify-content: center;
  margin-bottom: 14px;
}

.preview img {
  max-width: 140px;
  border-radius: 8px;
  border: 1px dashed #ccc;
  padding: 6px;
}

button {
  width: 100%;
  padding: 12px;
  border-radius: 10px;
  border: none;
  color: #fff;
  font-weight: bold;
  cursor: pointer;
}

button:disabled {
  opacity: .6;
  cursor: not-allowed;
}

.message {
  margin-top: 20px;
  font-weight: 500;
}
</style>
