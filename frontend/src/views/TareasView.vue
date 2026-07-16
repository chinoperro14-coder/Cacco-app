<script setup>
import { onMounted, reactive, ref } from 'vue'
import api, { mensajeError } from '../api'
import EstadoChip from '../components/EstadoChip.vue'
import Modal from '../components/Modal.vue'
import Paginacion from '../components/Paginacion.vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()

const ESTADOS = ['pendiente', 'en_proceso', 'completada', 'cancelada']
const PRIORIDADES = ['baja', 'media', 'alta', 'urgente']

const pagina = ref({ data: [] })
const filtros = reactive({ estado: '', todas: false })
const usuarios = ref([])
const error = ref('')
const aviso = ref('')

async function cargar(numero = 1) {
  const { data } = await api.get('/tareas', {
    params: { estado: filtros.estado || undefined, todas: filtros.todas ? 1 : undefined, page: numero },
  })
  pagina.value = data
}

async function cambiarEstado(tarea, estado) {
  error.value = ''
  try {
    await api.put(`/tareas/${tarea.id}`, { estado })
    aviso.value = `Tarea ${tarea.codigo} → ${estado.replaceAll('_', ' ')}.`
    await cargar(pagina.value.current_page)
  } catch (e) {
    error.value = mensajeError(e)
  }
}

// --- Asignar nueva tarea (solo con permiso de gestión) ---
const modal = ref(false)
const guardando = ref(false)
const form = reactive({ titulo: '', descripcion: '', responsable_id: '', fecha_limite: '', prioridad: 'media' })

async function abrirNueva() {
  if (!usuarios.value.length && auth.puede('usuarios.ver')) {
    const { data } = await api.get('/usuarios', { params: { per_page: 100, estado: 'activo' } })
    usuarios.value = data.data
  }
  Object.assign(form, { titulo: '', descripcion: '', responsable_id: '', fecha_limite: '', prioridad: 'media' })
  modal.value = true
}

async function guardar() {
  guardando.value = true
  error.value = ''
  try {
    const { data } = await api.post('/tareas', { ...form, fecha_limite: form.fecha_limite || null })
    aviso.value = `Tarea ${data.codigo} asignada.`
    modal.value = false
    await cargar()
  } catch (e) {
    error.value = mensajeError(e)
  } finally {
    guardando.value = false
  }
}

function vencida(tarea) {
  return tarea.fecha_limite
    && ['pendiente', 'en_proceso'].includes(tarea.estado)
    && new Date(tarea.fecha_limite) < new Date(new Date().toDateString())
}

onMounted(cargar)
</script>

<template>
  <div>
    <div class="encabezado-vista">
      <h1>Bandeja de tareas</h1>
      <button v-if="auth.puede('tareas.gestionar')" class="btn" @click="abrirNueva">+ Asignar tarea</button>
    </div>

    <div v-if="aviso" class="alerta alerta-ok" @click="aviso = ''">{{ aviso }}</div>
    <div v-if="error" class="alerta alerta-error" @click="error = ''">{{ error }}</div>

    <div class="filtros">
      <select v-model="filtros.estado" @change="cargar()">
        <option value="">Todos los estados</option>
        <option v-for="e in ESTADOS" :key="e" :value="e">{{ e.replaceAll('_', ' ') }}</option>
      </select>
      <label v-if="auth.puede('tareas.gestionar')" style="display: flex; align-items: center; gap: 6px; width: auto">
        <input v-model="filtros.todas" type="checkbox" style="width: auto" @change="cargar()" />
        Ver todas las bandejas
      </label>
    </div>

    <div class="tabla-envoltura">
      <table>
        <thead>
          <tr><th>Código</th><th>Tarea</th><th>Origen</th><th>Responsable</th><th>Fecha límite</th><th>Prioridad</th><th>Estado</th><th>Acciones</th></tr>
        </thead>
        <tbody>
          <tr v-for="t in pagina.data" :key="t.id">
            <td class="codigo">{{ t.codigo }}</td>
            <td>
              {{ t.titulo }}
              <div v-if="t.descripcion" class="texto-suave">{{ t.descripcion.slice(0, 90) }}{{ t.descripcion.length > 90 ? '…' : '' }}</div>
            </td>
            <td><span v-if="t.origen" class="codigo">{{ t.origen.codigo }}</span><span v-else class="texto-suave">manual</span></td>
            <td>{{ t.responsable?.name ?? '—' }}</td>
            <td :style="vencida(t) ? 'color: var(--rojo); font-weight: 700' : ''">
              {{ t.fecha_limite ? new Date(t.fecha_limite).toLocaleDateString('es-PA') : '—' }}
              <span v-if="vencida(t)"> ⚠</span>
            </td>
            <td><EstadoChip :estado="t.prioridad" /></td>
            <td><EstadoChip :estado="t.estado" /></td>
            <td style="white-space: nowrap">
              <button v-if="t.estado === 'pendiente'" class="btn btn-mini" @click="cambiarEstado(t, 'en_proceso')">Iniciar</button>
              <button v-if="t.estado === 'en_proceso'" class="btn btn-mini" @click="cambiarEstado(t, 'completada')">Completar</button>
              <button
                v-if="['pendiente', 'en_proceso'].includes(t.estado)"
                class="btn btn-sec btn-mini"
                style="margin-left: 6px"
                @click="cambiarEstado(t, 'cancelada')"
              >Cancelar</button>
            </td>
          </tr>
          <tr v-if="!pagina.data.length"><td colspan="8" class="sin-datos">Su bandeja está vacía. 🎉</td></tr>
        </tbody>
      </table>
      <Paginacion :pagina="pagina" @ir="cargar" />
    </div>

    <Modal v-if="modal" titulo="Asignar nueva tarea" @cerrar="modal = false">
      <form @submit.prevent="guardar">
        <div class="campo">
          <label>Título</label>
          <input v-model="form.titulo" required maxlength="255" />
        </div>
        <div class="campo">
          <label>Descripción</label>
          <textarea v-model="form.descripcion" rows="3"></textarea>
        </div>
        <div class="fila-campos">
          <div class="campo">
            <label>Responsable</label>
            <select v-model="form.responsable_id" required>
              <option value="" disabled>Seleccione…</option>
              <option v-for="u in usuarios" :key="u.id" :value="u.id">{{ u.name }}</option>
            </select>
          </div>
          <div class="campo">
            <label>Fecha límite</label>
            <input v-model="form.fecha_limite" type="date" />
          </div>
          <div class="campo">
            <label>Prioridad</label>
            <select v-model="form.prioridad">
              <option v-for="p in PRIORIDADES" :key="p" :value="p">{{ p }}</option>
            </select>
          </div>
        </div>
        <div class="modal-pie">
          <button type="button" class="btn btn-sec" @click="modal = false">Cancelar</button>
          <button type="submit" class="btn" :disabled="guardando">Asignar</button>
        </div>
      </form>
    </Modal>
  </div>
</template>
