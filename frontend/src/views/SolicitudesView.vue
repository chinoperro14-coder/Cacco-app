<script setup>
import { onMounted, reactive, ref } from 'vue'
import api, { mensajeError } from '../api'
import EstadoChip from '../components/EstadoChip.vue'
import Modal from '../components/Modal.vue'
import Paginacion from '../components/Paginacion.vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()

const TIPOS = ['uso_espacio', 'reunion', 'mantenimiento', 'comunicacion', 'transporte', 'equipamiento']
const PRIORIDADES = ['baja', 'media', 'alta', 'urgente']
const ESTADOS = ['borrador', 'pendiente', 'en_revision', 'aprobada', 'rechazada', 'ejecutada', 'cerrada']
const TRANSICIONES = {
  borrador: ['pendiente'],
  pendiente: ['en_revision', 'aprobada', 'rechazada'],
  en_revision: ['aprobada', 'rechazada'],
  aprobada: ['ejecutada', 'cerrada'],
  rechazada: ['cerrada'],
  ejecutada: ['cerrada'],
  cerrada: [],
}

const pagina = ref({ data: [] })
const filtros = reactive({ estado: '', tipo: '', buscar: '' })
const error = ref('')
const aviso = ref('')

async function cargar(numero = 1) {
  error.value = ''
  try {
    const { data } = await api.get('/solicitudes', { params: { ...filtros, page: numero } })
    pagina.value = data
  } catch (e) {
    error.value = mensajeError(e)
  }
}

// --- Crear/editar ---
const modal = ref(false)
const editando = ref(null)
const form = reactive({ tipo: 'uso_espacio', titulo: '', descripcion: '', prioridad: 'media', estado: 'pendiente' })
const guardando = ref(false)

function abrirNueva() {
  editando.value = null
  Object.assign(form, { tipo: 'uso_espacio', titulo: '', descripcion: '', prioridad: 'media', estado: 'pendiente' })
  modal.value = true
}

function abrirEdicion(solicitud) {
  editando.value = solicitud
  Object.assign(form, {
    tipo: solicitud.tipo, titulo: solicitud.titulo,
    descripcion: solicitud.descripcion, prioridad: solicitud.prioridad,
  })
  modal.value = true
}

async function guardar() {
  guardando.value = true
  error.value = ''
  try {
    if (editando.value) {
      await api.put(`/solicitudes/${editando.value.id}`, form)
      aviso.value = 'Solicitud actualizada.'
    } else {
      const { data } = await api.post('/solicitudes', form)
      aviso.value = `Solicitud ${data.codigo} registrada.`
    }
    modal.value = false
    await cargar(pagina.value.current_page)
  } catch (e) {
    error.value = mensajeError(e)
  } finally {
    guardando.value = false
  }
}

// --- Cambio de estado (flujo de trabajo) ---
const modalEstado = ref(null)
const nuevoEstado = ref('')
const observaciones = ref('')

function abrirCambioEstado(solicitud) {
  modalEstado.value = solicitud
  nuevoEstado.value = ''
  observaciones.value = ''
}

function transicionesDe(solicitud) {
  const posibles = TRANSICIONES[solicitud.estado] ?? []
  if (!auth.puede('solicitudes.gestionar')) {
    // El solicitante solo puede enviar su borrador a trámite.
    return solicitud.estado === 'borrador' ? ['pendiente'] : []
  }
  return posibles
}

async function aplicarEstado() {
  error.value = ''
  try {
    await api.post(`/solicitudes/${modalEstado.value.id}/estado`, {
      estado: nuevoEstado.value,
      observaciones: observaciones.value || null,
    })
    aviso.value = `Solicitud ${modalEstado.value.codigo}: estado actualizado a "${nuevoEstado.value.replaceAll('_', ' ')}".`
    modalEstado.value = null
    await cargar(pagina.value.current_page)
  } catch (e) {
    error.value = mensajeError(e)
  }
}

onMounted(cargar)
</script>

<template>
  <div>
    <div class="encabezado-vista">
      <h1>Gestión de solicitudes</h1>
      <button v-if="auth.puede('solicitudes.crear')" class="btn" @click="abrirNueva">+ Nueva solicitud</button>
    </div>

    <div v-if="aviso" class="alerta alerta-ok" @click="aviso = ''">{{ aviso }}</div>
    <div v-if="error" class="alerta alerta-error" @click="error = ''">{{ error }}</div>

    <div class="filtros">
      <select v-model="filtros.estado" @change="cargar()">
        <option value="">Todos los estados</option>
        <option v-for="e in ESTADOS" :key="e" :value="e">{{ e.replaceAll('_', ' ') }}</option>
      </select>
      <select v-model="filtros.tipo" @change="cargar()">
        <option value="">Todos los tipos</option>
        <option v-for="t in TIPOS" :key="t" :value="t">{{ t.replaceAll('_', ' ') }}</option>
      </select>
      <input v-model="filtros.buscar" type="search" placeholder="Buscar por código o título…" @keyup.enter="cargar()" />
      <button class="btn btn-sec" @click="cargar()">Filtrar</button>
    </div>

    <div class="tabla-envoltura">
      <table>
        <thead>
          <tr><th>Número</th><th>Fecha</th><th>Título</th><th>Tipo</th><th>Solicitante</th><th>Departamento</th><th>Prioridad</th><th>Estado</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="s in pagina.data" :key="s.id">
            <td class="codigo">{{ s.codigo }}</td>
            <td>{{ new Date(s.fecha).toLocaleDateString('es-PA') }}</td>
            <td>{{ s.titulo }}</td>
            <td>{{ s.tipo.replaceAll('_', ' ') }}</td>
            <td>{{ s.solicitante?.name }}</td>
            <td>{{ s.oficina?.sigla ?? s.oficina?.nombre ?? '—' }}</td>
            <td><EstadoChip :estado="s.prioridad" /></td>
            <td><EstadoChip :estado="s.estado" /></td>
            <td style="white-space: nowrap">
              <button
                v-if="['borrador', 'pendiente'].includes(s.estado)"
                class="btn btn-sec btn-mini"
                @click="abrirEdicion(s)"
              >Editar</button>
              <button
                v-if="transicionesDe(s).length"
                class="btn btn-mini"
                style="margin-left: 6px"
                @click="abrirCambioEstado(s)"
              >Tramitar</button>
            </td>
          </tr>
          <tr v-if="!pagina.data.length"><td colspan="9" class="sin-datos">No hay solicitudes registradas.</td></tr>
        </tbody>
      </table>
      <Paginacion :pagina="pagina" @ir="cargar" />
    </div>

    <!-- Modal crear/editar -->
    <Modal v-if="modal" :titulo="editando ? `Editar ${editando.codigo}` : 'Nueva solicitud'" @cerrar="modal = false">
      <form @submit.prevent="guardar">
        <div class="fila-campos">
          <div class="campo">
            <label>Tipo</label>
            <select v-model="form.tipo" required>
              <option v-for="t in TIPOS" :key="t" :value="t">{{ t.replaceAll('_', ' ') }}</option>
            </select>
          </div>
          <div class="campo">
            <label>Prioridad</label>
            <select v-model="form.prioridad">
              <option v-for="p in PRIORIDADES" :key="p" :value="p">{{ p }}</option>
            </select>
          </div>
        </div>
        <div class="campo">
          <label>Título</label>
          <input v-model="form.titulo" required maxlength="255" />
        </div>
        <div class="campo">
          <label>Descripción</label>
          <textarea v-model="form.descripcion" rows="4" required></textarea>
        </div>
        <div v-if="!editando" class="campo">
          <label>Registro</label>
          <select v-model="form.estado">
            <option value="pendiente">Enviar a trámite (genera tarea)</option>
            <option value="borrador">Guardar como borrador</option>
          </select>
        </div>
        <div class="modal-pie">
          <button type="button" class="btn btn-sec" @click="modal = false">Cancelar</button>
          <button type="submit" class="btn" :disabled="guardando">{{ guardando ? 'Guardando…' : 'Guardar' }}</button>
        </div>
      </form>
    </Modal>

    <!-- Modal cambio de estado -->
    <Modal v-if="modalEstado" :titulo="`Tramitar ${modalEstado.codigo}`" @cerrar="modalEstado = null">
      <p style="margin-bottom: 12px">
        Estado actual: <EstadoChip :estado="modalEstado.estado" />
      </p>
      <div class="campo">
        <label>Nuevo estado</label>
        <select v-model="nuevoEstado" required>
          <option value="" disabled>Seleccione…</option>
          <option v-for="e in transicionesDe(modalEstado)" :key="e" :value="e">{{ e.replaceAll('_', ' ') }}</option>
        </select>
      </div>
      <div class="campo">
        <label>Observaciones (motivo)</label>
        <textarea v-model="observaciones" rows="3" placeholder="Justificación de la aprobación, rechazo o cierre…"></textarea>
      </div>
      <div class="modal-pie">
        <button class="btn btn-sec" @click="modalEstado = null">Cancelar</button>
        <button class="btn" :disabled="!nuevoEstado" @click="aplicarEstado">Aplicar</button>
      </div>
    </Modal>
  </div>
</template>
