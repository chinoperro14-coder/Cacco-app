<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { mensajeError } from '../api'
import { useAuthStore } from '../stores/auth'
import logo from '../assets/logo.png'

const auth = useAuthStore()
const router = useRouter()

const email = ref('')
const password = ref('')
const error = ref('')
const enviando = ref(false)

async function entrar() {
  error.value = ''
  enviando.value = true
  try {
    await auth.login(email.value, password.value)
    router.push('/')
  } catch (e) {
    error.value = mensajeError(e)
  } finally {
    enviando.value = false
  }
}
</script>

<template>
  <div class="fondo-login">
    <div class="caja-login">
      <div class="cabecera-login">
        <img :src="logo" alt="CACCO · Centro de Arte y Cultura de Colón" class="sello" />
        <h1>SIGEP-CACCO</h1>
        <p>Sistema Integral de Gestión Pública<br />Centro de Arte y Cultura de Colón</p>
      </div>

      <form @submit.prevent="entrar">
        <div v-if="error" class="alerta alerta-error">{{ error }}</div>

        <div class="campo">
          <label for="email">Correo institucional</label>
          <input id="email" v-model="email" type="email" required autocomplete="username" placeholder="usuario@cacco.gob.pa" />
        </div>

        <div class="campo">
          <label for="password">Contraseña</label>
          <input id="password" v-model="password" type="password" required autocomplete="current-password" placeholder="••••••••••" />
        </div>

        <button class="btn btn-entrar" type="submit" :disabled="enviando">
          {{ enviando ? 'Verificando…' : 'Iniciar sesión' }}
        </button>
      </form>

      <p class="pie-login">Acceso restringido a personal autorizado.<br />Toda actividad queda registrada en la bitácora institucional.</p>
    </div>
  </div>
</template>

<style scoped>
.fondo-login {
  min-height: 100vh; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(155deg, var(--oscuro-900) 0%, #7a2f10 55%, var(--marca) 125%);
  padding: 16px;
}
.caja-login {
  background: var(--blanco); border-radius: 14px; box-shadow: var(--sombra-alta);
  width: 100%; max-width: 400px; padding: 32px;
  border-top: 5px solid var(--marca);
}
.cabecera-login { text-align: center; margin-bottom: 24px; }
.sello { width: 210px; max-width: 80%; margin-bottom: 10px; }
.cabecera-login h1 { margin-bottom: 4px; }
.cabecera-login p { color: var(--gris-500); font-size: 0.85rem; }
.btn-entrar { width: 100%; justify-content: center; padding: 11px; margin-top: 6px; }
.pie-login { margin-top: 20px; text-align: center; font-size: 0.75rem; color: var(--gris-500); }
</style>
