<script setup>
import { onMounted, reactive, ref } from 'vue'
import api, { mensajeError } from '../api'
import EstadoChip from '../components/EstadoChip.vue'
import Modal from '../components/Modal.vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()

const TIPOS = ['teatro', 'auditorio', 'galeria', 'salon', 'aula', 'patio']
const ESTADOS = ['disponible', 'reservado', 'mantenimiento', 'bloqueado']

const espacios = ref([])
const error = ref('')
const aviso = ref('')

async function cargar() {
  const { data } = await api.get('/espacios', { params: { per_page: 100 } })
  espacios.value = data.data
}

// --- Crear/editar espacio ---
const modal = ref(false)
const editando = ref(null)
const guardando = ref(false)
const form = reactive({ nombre: '', tipo: 'salon', capacidad: 0, descripcion: '', estado: 'disponible' })

function abrirNuevo() {
  editando.value = null
  Object.assign(form, { nombre: '', tipo: 'salon', capacidad: 0, descripcion: '', estado: 'disponible' })
  modal.value = true
}

function abrirEdicion(espacio) {
  editando.value = espacio
  Object.assign(form, {
    nombre: espacio.nombre, tipo: espacio.tipo, capacidad: espacio.capacidad,
    descripcion: espacio.descripcion ?? '', estado: espacio.estado,
  })
  modal.value = true
}

async function guardar() {
  guardando.value = true
  error.value = ''
  try {
    if (editando.value) {
      await api.put(`/espacios/${editando.value.id}`, form)
      aviso.value = 'Espacio actualizado.'
    } else {
      const { data } = await api.post('/espacios', form)
      aviso.value = `Espacio ${data.codigo} registrado.`
    }
    modal.value = false
    await cargar()
  } catch (e) {
    error.value = mensajeError(e)
  } finally {
    guardando.value = false
  }
}

// --- Reserva directa de espacio ---
const modalReserva = ref(null)
const reservaForm = reactive({ fecha: '', hora_inicio: '09:00', hora_fin: '10:00', motivo: '', estado: 'confirmada' })
const disponibilidad = ref(null)

function abrirReserva(espacio) {
  modalReserva.value = espacio
  Object.assign(reservaForm, { fecha: '', hora_inicio: '09:00', hora_fin: '10:00', motivo: '', estado: 'confirmada' })
  disponibilidad.value = null
}

async function verificarDisponibilidad() {
  if (!reservaForm.fecha) return
  const { data } = await api.post('/reservas/disponibilidad', {
    espacio_id: modalReserva.value.id,
    fecha: reservaForm.fecha,
    hora_inicio: reservaForm.hora_inicio,
    hora_fin: reservaForm.hora_fin,
  })
  disponibilidad.value = data
}

async function reservar() {
  error.value = ''
  try {
    const { data } = await api.post('/reservas', { ...reservaForm, espacio_id: modalReserva.value.id })
    aviso.value = `Reserva ${data.codigo} confirmada para ${modalReserva.value.nombre}.`
    modalReserva.value = null
  } catch (e) {
    error.value = mensajeError(e)
  }
}

onMounted(cargar)
</script>

<template>
  <div>
    <div class="encabezado-vista">
      <h1>Gestión de espacios</h1>
      <button v-if="auth.puede('espacios.gestionar')" class="btn" @click="abrirNuevo">+ Nuevo espacio</button>
    </div>

    <div v-if="aviso" class="alerta alerta-ok" @click="aviso = ''">{{ aviso }}</div>
    <div v-if="error" class="alerta alerta-error" @click="error = ''">{{ error }}</div>

    <div class="rejilla-espacios">
      <div v-for="e in espacios" :key="e.id" class="tarjeta espacio">
        <div class="espacio-cabecera">
          <h2>{{ e.nombre }}</h2>
          <EstadoChip :estado="e.estado" />
        </div>
        <p class="codigo">{{ e.codigo }}</p>
        <p class="texto-suave">{{ e.descripcion }}</p>
        <div class="espacio-datos">
          <span>Tipo: <strong>{{ e.tipo }}</strong></span>
          <span>Capacidad: <strong>{{ e.capacidad }}</strong></span>
        </div>
        <div class="espacio-acciones">
          <button
            v-if="auth.puede('reservas.gestionar') && e.estado === 'disponible'"
            class="btn btn-mini"
            @click="abrirReserva(e)"
          >Reservar</button>
          <button v-if="auth.puede('espacios.gestionar')" class="btn btn-sec btn-mini" @click="abrirEdicion(e)">Editar</button>
        </div>
      </div>
      <div v-if="!espacios.length" class="sin-datos" style="grid-column: 1/-1">No hay espacios registrados.</div>
    </div>

    <!-- Modal espacio -->
    <Modal v-if="modal" :titulo="editando ? `Editar ${editando.nombre}` : 'Nuevo espacio'" @cerrar="modal = false">
      <form @submit.prevent="guardar">
        <div class="campo">
          <label>Nombre</label>
          <input v-model="form.nombre" required maxlength="255" />
        </div>
        <div class="fila-campos">
          <div class="campo">
            <label>Tipo</label>
            <select v-model="form.tipo" required>
              <option v-for="t in TIPOS" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>
          <div class="campo">
            <label>Capacidad</label>
            <input v-model.number="form.capacidad" type="number" min="0" required />
          </div>
          <div class="campo">
            <label>Estado</label>
            <select v-model="form.estado">
              <option v-for="e in ESTADOS" :key="e" :value="e">{{ e }}</option>
            </select>
          </div>
        </div>
        <div class="campo">
          <label>Descripción</label>
          <textarea v-model="form.descripcion" rows="3"></textarea>
        </div>
        <div class="modal-pie">
          <button type="button" class="btn btn-sec" @click="modal = false">Cancelar</button>
          <button type="submit" class="btn" :disabled="guardando">Guardar</button>
        </div>
      </form>
    </Modal>

    <!-- Modal reserva -->
    <Modal v-if="modalReserva" :titulo="`Reservar: ${modalReserva.nombre}`" @cerrar="modalReserva = null">
      <form @submit.prevent="reservar">
        <div class="fila-campos">
          <div class="campo">
            <label>Fecha</label>
            <input v-model="reservaForm.fecha" type="date" required @change="verificarDisponibilidad" />
          </div>
          <div class="campo">
            <label>Hora inicio</label>
            <input v-model="reservaForm.hora_inicio" type="time" required @change="verificarDisponibilidad" />
          </div>
          <div class="campo">
            <label>Hora fin</label>
            <input v-model="reservaForm.hora_fin" type="time" required @change="verificarDisponibilidad" />
          </div>
        </div>

        <div v-if="disponibilidad" class="alerta" :class="disponibilidad.disponible ? 'alerta-ok' : 'alerta-error'">
          {{ disponibilidad.disponible ? '✓ Horario disponible.' : disponibilidad.message }}
        </div>

        <div class="campo">
          <label>Motivo</label>
          <input v-model="reservaForm.motivo" required maxlength="255" placeholder="Ej.: Ensayo general del coro" />
        </div>
        <div class="campo">
          <label>Tipo de reserva</label>
          <select v-model="reservaForm.estado">
            <option value="confirmada">Reserva normal</option>
            <option value="mantenimiento">Mantenimiento</option>
          </select>
        </div>
        <div class="modal-pie">
          <button type="button" class="btn btn-sec" @click="modalReserva = null">Cancelar</button>
          <button type="submit" class="btn" :disabled="disponibilidad && !disponibilidad.disponible">Reservar</button>
        </div>
      </form>
    </Modal>
  </div>
</template>

<style scoped>
.rejilla-espacios { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
.espacio-cabecera { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.espacio-datos { display: flex; gap: 16px; margin: 10px 0; font-size: 0.85rem; }
.espacio-acciones { display: flex; gap: 8px; }
</style>
