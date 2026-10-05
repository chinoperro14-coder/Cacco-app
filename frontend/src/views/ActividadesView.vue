<script setup>
import { onMounted, reactive, ref } from 'vue'
import api, { mensajeError } from '../api'
import EstadoChip from '../components/EstadoChip.vue'
import Modal from '../components/Modal.vue'
import Paginacion from '../components/Paginacion.vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()

const TIPOS = ['curso', 'festival', 'exposicion', 'reunion', 'taller', 'programa']
const ESTADOS = ['programada', 'en_curso', 'realizada', 'cancelada']

const pagina = ref({ data: [] })
const filtros = reactive({ estado: '', tipo: '', buscar: '' })
const espacios = ref([])
const usuarios = ref([])
const error = ref('')
const aviso = ref('')

async function cargar(numero = 1) {
  const { data } = await api.get('/actividades', { params: { ...filtros, page: numero } })
  pagina.value = data
}

async function cargarCatalogos() {
  const { data } = await api.get('/espacios', { params: { per_page: 100 } })
  espacios.value = data.data
  if (auth.puede('usuarios.ver')) {
    const respuesta = await api.get('/usuarios', { params: { per_page: 100, estado: 'activo' } })
    usuarios.value = respuesta.data.data
  }
}

// --- Crear/editar ---
const modal = ref(false)
const editando = ref(null)
const guardando = ref(false)
const form = reactive({
  nombre: '', tipo: 'taller', espacio_id: '', responsable_id: '',
  fecha: '', hora_inicio: '09:00', hora_fin: '10:00', descripcion: '', estado: 'programada',
})

function abrirNueva() {
  editando.value = null
  Object.assign(form, {
    nombre: '', tipo: 'taller', espacio_id: '', responsable_id: '',
    fecha: '', hora_inicio: '09:00', hora_fin: '10:00', descripcion: '', estado: 'programada',
  })
  modal.value = true
}

function abrirEdicion(actividad) {
  editando.value = actividad
  Object.assign(form, {
    nombre: actividad.nombre,
    tipo: actividad.tipo,
    espacio_id: actividad.espacio_id ?? '',
    responsable_id: actividad.responsable_id ?? '',
    fecha: actividad.fecha?.slice(0, 10),
    hora_inicio: actividad.hora_inicio?.slice(0, 5),
    hora_fin: actividad.hora_fin?.slice(0, 5),
    descripcion: actividad.descripcion ?? '',
    estado: actividad.estado,
  })
  modal.value = true
}

async function guardar() {
  guardando.value = true
  error.value = ''
  try {
    const carga = {
      ...form,
      espacio_id: form.espacio_id || null,
      responsable_id: form.responsable_id || null,
    }
    if (editando.value) {
      await api.put(`/actividades/${editando.value.id}`, carga)
      aviso.value = 'Actividad actualizada.'
    } else {
      const { data } = await api.post('/actividades', carga)
      aviso.value = `Actividad ${data.codigo} programada.`
    }
    modal.value = false
    await cargar(pagina.value.current_page)
  } catch (e) {
    // Incluye el mensaje de conflicto del control de doble reserva.
    error.value = mensajeError(e)
  } finally {
    guardando.value = false
  }
}

onMounted(() => {
  cargar()
  cargarCatalogos()
})
</script>

<template>
  <div>
    <div class="encabezado-vista">
      <h1>Gestión de actividades</h1>
      <button v-if="auth.puede('actividades.gestionar')" class="btn" @click="abrirNueva">+ Nueva actividad</button>
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
        <option v-for="t in TIPOS" :key="t" :value="t">{{ t }}</option>
      </select>
      <input v-model="filtros.buscar" type="search" placeholder="Buscar…" @keyup.enter="cargar()" />
      <button class="btn btn-sec" @click="cargar()">Filtrar</button>
    </div>

    <div class="tabla-envoltura">
      <table>
        <thead>
          <tr><th>Código</th><th>Nombre</th><th>Tipo</th><th>Fecha</th><th>Horario</th><th>Espacio</th><th>Responsable</th><th>Estado</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="a in pagina.data" :key="a.id">
            <td class="codigo">{{ a.codigo }}</td>
            <td>{{ a.nombre }}</td>
            <td>{{ a.tipo }}</td>
            <td>{{ new Date(a.fecha).toLocaleDateString('es-PA') }}</td>
            <td>{{ a.hora_inicio?.slice(0, 5) }}–{{ a.hora_fin?.slice(0, 5) }}</td>
            <td>{{ a.espacio?.nombre ?? '—' }}</td>
            <td>{{ a.responsable?.name }}</td>
            <td><EstadoChip :estado="a.estado" /></td>
            <td>
              <button v-if="auth.puede('actividades.gestionar')" class="btn btn-sec btn-mini" @click="abrirEdicion(a)">Editar</button>
            </td>
          </tr>
          <tr v-if="!pagina.data.length"><td colspan="9" class="sin-datos">No hay actividades registradas.</td></tr>
        </tbody>
      </table>
      <Paginacion :pagina="pagina" @ir="cargar" />
    </div>

    <Modal v-if="modal" :titulo="editando ? `Editar ${editando.codigo}` : 'Nueva actividad'" @cerrar="modal = false">
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
            <label>Espacio (reserva automática)</label>
            <select v-model="form.espacio_id">
              <option value="">Sin espacio</option>
              <option v-for="e in espacios" :key="e.id" :value="e.id">{{ e.nombre }} ({{ e.capacidad }} pers.)</option>
            </select>
          </div>
        </div>
        <div class="fila-campos">
          <div class="campo">
            <label>Fecha</label>
            <input v-model="form.fecha" type="date" required />
          </div>
          <div class="campo">
            <label>Hora inicio</label>
            <input v-model="form.hora_inicio" type="time" required />
          </div>
          <div class="campo">
            <label>Hora fin</label>
            <input v-model="form.hora_fin" type="time" required />
          </div>
        </div>
        <div class="fila-campos">
          <div v-if="usuarios.length" class="campo">
            <label>Responsable</label>
            <select v-model="form.responsable_id">
              <option value="">Yo</option>
              <option v-for="u in usuarios" :key="u.id" :value="u.id">{{ u.name }}</option>
            </select>
          </div>
          <div v-if="editando" class="campo">
            <label>Estado</label>
            <select v-model="form.estado">
              <option v-for="e in ESTADOS" :key="e" :value="e">{{ e.replaceAll('_', ' ') }}</option>
            </select>
          </div>
        </div>
        <div class="campo">
          <label>Descripción</label>
          <textarea v-model="form.descripcion" rows="3"></textarea>
        </div>
        <div class="modal-pie">
          <button type="button" class="btn btn-sec" @click="modal = false">Cancelar</button>
          <button type="submit" class="btn" :disabled="guardando">{{ guardando ? 'Guardando…' : 'Guardar' }}</button>
        </div>
      </form>
    </Modal>
  </div>
</template>
