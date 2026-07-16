<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()

// Menú lateral: solo se muestran los módulos autorizados para el usuario.
const MENU = [
  { nombre: 'Dashboard', ruta: '/', icono: '📊', permiso: 'dashboard.ver' },
  { nombre: 'Solicitudes', ruta: '/solicitudes', icono: '📋', permiso: 'solicitudes.ver' },
  { nombre: 'Actividades', ruta: '/actividades', icono: '🎭', permiso: 'actividades.ver' },
  { nombre: 'Espacios', ruta: '/espacios', icono: '🏛️', permiso: 'espacios.ver' },
  { nombre: 'Calendario', ruta: '/calendario', icono: '📅', permiso: 'calendario.ver' },
  { nombre: 'Mis Tareas', ruta: '/tareas', icono: '✅', permiso: 'tareas.ver' },
  { nombre: 'Documentos', ruta: '/documentos', icono: '📁', permiso: 'documentos.ver' },
  { nombre: 'Usuarios', ruta: '/usuarios', icono: '👥', permiso: 'usuarios.ver' },
  { nombre: 'Auditoría', ruta: '/auditoria', icono: '🔍', permiso: 'auditoria.ver' },
]

const menuVisible = computed(() => MENU.filter((m) => auth.puede(m.permiso)))
const menuAbierto = ref(false)

// --- Notificaciones (campana con contador de pendientes) ---
const noLeidas = ref(0)
const notificaciones = ref([])
const panelNotificaciones = ref(false)
let temporizador = null

async function cargarNotificaciones() {
  if (!auth.autenticado) return
  try {
    const { data } = await api.get('/notificaciones')
    noLeidas.value = data.no_leidas
    notificaciones.value = data.notificaciones
  } catch {
    /* silencioso: la campana no debe romper la navegación */
  }
}

async function marcarTodas() {
  await api.post('/notificaciones/leidas')
  await cargarNotificaciones()
}

// --- Búsqueda global ---
const busqueda = ref('')
const resultados = ref(null)
const buscando = ref(false)
let debounce = null

function alEscribir() {
  clearTimeout(debounce)
  if (busqueda.value.trim().length < 2) {
    resultados.value = null
    return
  }
  debounce = setTimeout(async () => {
    buscando.value = true
    try {
      const { data } = await api.get('/buscar', { params: { q: busqueda.value.trim() } })
      resultados.value = data
    } finally {
      buscando.value = false
    }
  }, 300)
}

const RUTA_POR_GRUPO = {
  solicitudes: '/solicitudes', actividades: '/actividades', espacios: '/espacios',
  documentos: '/documentos', tareas: '/tareas',
}

function irAResultado(grupo) {
  resultados.value = null
  busqueda.value = ''
  router.push(RUTA_POR_GRUPO[grupo] ?? '/')
}

async function cerrarSesion() {
  await auth.logout()
  router.push('/login')
}

onMounted(() => {
  cargarNotificaciones()
  temporizador = setInterval(cargarNotificaciones, 30000)
})
onBeforeUnmount(() => clearInterval(temporizador))
</script>

<template>
  <div class="disposicion">
    <!-- Menú lateral -->
    <aside class="lateral" :class="{ abierto: menuAbierto }">
      <div class="marca">
        <div class="marca-logo">CACCO</div>
        <div class="marca-texto">
          <strong>SIGEP-CACCO</strong>
          <span>Gestión Pública</span>
        </div>
      </div>
      <nav>
        <router-link
          v-for="item in menuVisible"
          :key="item.ruta"
          :to="item.ruta"
          class="enlace-menu"
          @click="menuAbierto = false"
        >
          <span class="icono">{{ item.icono }}</span> {{ item.nombre }}
        </router-link>
      </nav>
      <div class="lateral-pie">
        Centro de Arte y Cultura de Colón<br />v1.0 · MVP
      </div>
    </aside>

    <div class="principal">
      <!-- Barra superior -->
      <header class="superior">
        <button class="hamburguesa" @click="menuAbierto = !menuAbierto" aria-label="Menú">☰</button>

        <div class="buscador">
          <input
            v-model="busqueda"
            type="search"
            placeholder="Búsqueda global: código o título…"
            @input="alEscribir"
            @blur="resultados = null"
          />
          <div v-if="resultados" class="resultados">
            <template v-for="(items, grupo) in resultados" :key="grupo">
              <div v-if="items.length" class="grupo-resultado">
                <div class="grupo-titulo">{{ grupo }}</div>
                <button v-for="item in items" :key="item.id" class="item-resultado" @mousedown="irAResultado(grupo)">
                  <span class="codigo">{{ item.codigo }}</span>
                  {{ item.titulo || item.nombre }}
                </button>
              </div>
            </template>
            <div v-if="Object.values(resultados).every((i) => !i.length)" class="grupo-resultado texto-suave" style="padding: 10px 14px">
              Sin resultados
            </div>
          </div>
        </div>

        <!-- Campana de notificaciones -->
        <div class="campana-envoltura">
          <button class="campana" @click="panelNotificaciones = !panelNotificaciones" aria-label="Notificaciones">
            🔔
            <span v-if="noLeidas" class="contador">{{ noLeidas > 99 ? '99+' : noLeidas }}</span>
          </button>
          <div v-if="panelNotificaciones" class="panel-notificaciones">
            <div class="panel-cabecera">
              <strong>Notificaciones</strong>
              <button v-if="noLeidas" class="btn btn-sec btn-mini" @click="marcarTodas">Marcar leídas</button>
            </div>
            <div v-if="!notificaciones.length" class="sin-datos">Sin notificaciones</div>
            <div
              v-for="n in notificaciones"
              :key="n.id"
              class="notificacion"
              :class="{ 'no-leida': !n.leida_en }"
            >
              <strong>{{ n.titulo }}</strong>
              <p>{{ n.mensaje }}</p>
              <span class="texto-suave">{{ new Date(n.created_at).toLocaleString('es-PA') }}</span>
            </div>
          </div>
        </div>

        <!-- Usuario -->
        <div class="usuario-caja">
          <div class="usuario-datos">
            <strong>{{ auth.usuario?.name }}</strong>
            <span>{{ auth.usuario?.rol?.nombre }}</span>
          </div>
          <button class="btn btn-sec btn-mini" @click="cerrarSesion">Salir</button>
        </div>
      </header>

      <main class="contenido" @click="panelNotificaciones = false">
        <slot />
      </main>
    </div>
  </div>
</template>

<style scoped>
.disposicion { display: flex; min-height: 100vh; }

.lateral {
  width: 240px; background: var(--azul-900); color: #cbd8e4;
  display: flex; flex-direction: column; flex-shrink: 0;
}
.marca { display: flex; align-items: center; gap: 10px; padding: 18px 16px; border-bottom: 1px solid rgba(255,255,255,0.12); }
.marca-logo {
  background: var(--dorado); color: var(--azul-900); font-weight: 800; font-size: 0.7rem;
  border-radius: 8px; padding: 8px 6px; letter-spacing: 0.05em;
}
.marca-texto { display: flex; flex-direction: column; line-height: 1.25; }
.marca-texto strong { color: #fff; font-size: 0.95rem; }
.marca-texto span { font-size: 0.72rem; opacity: 0.75; }

nav { flex: 1; padding: 12px 8px; }
.enlace-menu {
  display: flex; align-items: center; gap: 10px; color: #cbd8e4;
  padding: 10px 12px; border-radius: 8px; margin-bottom: 2px; font-size: 0.92rem;
}
.enlace-menu:hover { background: rgba(255,255,255,0.08); color: #fff; }
.enlace-menu.router-link-exact-active { background: var(--azul-700); color: #fff; font-weight: 600; }
.icono { width: 22px; text-align: center; }
.lateral-pie { padding: 14px 16px; font-size: 0.7rem; opacity: 0.6; border-top: 1px solid rgba(255,255,255,0.12); }

.principal { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.superior {
  background: var(--blanco); box-shadow: var(--sombra); padding: 10px 20px;
  display: flex; align-items: center; gap: 16px; position: sticky; top: 0; z-index: 50;
}
.hamburguesa { display: none; background: none; border: none; font-size: 1.3rem; cursor: pointer; }

.buscador { position: relative; flex: 1; max-width: 480px; }
.resultados {
  position: absolute; top: 110%; left: 0; right: 0; background: var(--blanco);
  border-radius: var(--radio); box-shadow: var(--sombra-alta); overflow: hidden; z-index: 60;
}
.grupo-titulo {
  padding: 6px 14px; font-size: 0.7rem; text-transform: uppercase;
  color: var(--gris-500); background: var(--gris-50); font-weight: 700;
}
.item-resultado {
  display: flex; gap: 10px; width: 100%; text-align: left; padding: 8px 14px;
  background: none; border: none; cursor: pointer; font: inherit;
}
.item-resultado:hover { background: var(--azul-100); }

.campana-envoltura { position: relative; }
.campana { background: none; border: none; font-size: 1.25rem; cursor: pointer; position: relative; }
.contador {
  position: absolute; top: -6px; right: -8px; background: var(--rojo); color: #fff;
  font-size: 0.65rem; font-weight: 700; border-radius: 999px; padding: 1px 5px;
}
.panel-notificaciones {
  position: absolute; right: 0; top: 130%; width: 340px; max-height: 420px; overflow-y: auto;
  background: var(--blanco); border-radius: var(--radio); box-shadow: var(--sombra-alta); z-index: 60;
}
.panel-cabecera { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border-bottom: 1px solid var(--gris-200); }
.notificacion { padding: 10px 14px; border-bottom: 1px solid var(--gris-100); font-size: 0.85rem; }
.notificacion.no-leida { background: var(--azul-100); }
.notificacion p { margin: 2px 0; color: var(--gris-700); }

.usuario-caja { display: flex; align-items: center; gap: 12px; }
.usuario-datos { display: flex; flex-direction: column; line-height: 1.2; text-align: right; }
.usuario-datos strong { font-size: 0.85rem; }
.usuario-datos span { font-size: 0.72rem; color: var(--gris-500); }

.contenido { padding: 22px; flex: 1; }

@media (max-width: 900px) {
  .lateral {
    position: fixed; inset: 0 auto 0 0; z-index: 90; transform: translateX(-100%);
    transition: transform 0.2s;
  }
  .lateral.abierto { transform: translateX(0); }
  .hamburguesa { display: block; }
  .usuario-datos { display: none; }
  .contenido { padding: 14px; }
}
</style>
