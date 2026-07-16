<script setup>
import { onMounted, reactive, ref } from 'vue'
import api, { mensajeError } from '../api'
import EstadoChip from '../components/EstadoChip.vue'
import Modal from '../components/Modal.vue'
import Paginacion from '../components/Paginacion.vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()

const TIPOS = ['carta', 'memo', 'circular', 'acta', 'contrato', 'invitacion']
const ESTADOS = ['borrador', 'vigente', 'obsoleto', 'archivado']

const pagina = ref({ data: [] })
const filtros = reactive({ tipo: '', estado: '', buscar: '' })
const error = ref('')
const aviso = ref('')

async function cargar(numero = 1) {
  const { data } = await api.get('/documentos', { params: { ...filtros, page: numero } })
  pagina.value = data
}

// --- Nuevo documento ---
const modal = ref(false)
const guardando = ref(false)
const form = reactive({ titulo: '', tipo: 'carta', fecha: '', descripcion: '' })
const archivo = ref(null)

function abrirNuevo() {
  Object.assign(form, { titulo: '', tipo: 'carta', fecha: new Date().toISOString().slice(0, 10), descripcion: '' })
  archivo.value = null
  modal.value = true
}

async function guardar() {
  if (!archivo.value) {
    error.value = 'Debe adjuntar el archivo PDF del documento.'
    return
  }
  guardando.value = true
  error.value = ''
  try {
    const datos = new FormData()
    Object.entries(form).forEach(([clave, valor]) => datos.append(clave, valor ?? ''))
    datos.append('archivo', archivo.value)

    const { data } = await api.post('/documentos', datos)
    aviso.value = `Documento ${data.codigo} registrado (versión 1).`
    modal.value = false
    await cargar()
  } catch (e) {
    error.value = mensajeError(e)
  } finally {
    guardando.value = false
  }
}

// --- Detalle y versiones ---
const detalle = ref(null)
const archivoNuevaVersion = ref(null)
const notasVersion = ref('')

async function verDetalle(documento) {
  const { data } = await api.get(`/documentos/${documento.id}`)
  detalle.value = data
  archivoNuevaVersion.value = null
  notasVersion.value = ''
}

async function subirVersion() {
  if (!archivoNuevaVersion.value) return
  error.value = ''
  try {
    const datos = new FormData()
    datos.append('archivo', archivoNuevaVersion.value)
    datos.append('notas', notasVersion.value)
    const { data } = await api.post(`/documentos/${detalle.value.id}/versiones`, datos)
    detalle.value = data
    aviso.value = `Versión ${data.version_actual} registrada. El historial se conserva completo.`
    await cargar(pagina.value.current_page)
  } catch (e) {
    error.value = mensajeError(e)
  }
}

async function descargar(version) {
  const respuesta = await api.get(
    `/documentos/${detalle.value.id}/versiones/${version.version}/descargar`,
    { responseType: 'blob' },
  )
  const url = URL.createObjectURL(respuesta.data)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = version.nombre_original
  enlace.click()
  URL.revokeObjectURL(url)
}

onMounted(cargar)
</script>

<template>
  <div>
    <div class="encabezado-vista">
      <h1>Gestión documental</h1>
      <button v-if="auth.puede('documentos.gestionar')" class="btn" @click="abrirNuevo">+ Registrar documento</button>
    </div>

    <div v-if="aviso" class="alerta alerta-ok" @click="aviso = ''">{{ aviso }}</div>
    <div v-if="error" class="alerta alerta-error" @click="error = ''">{{ error }}</div>

    <div class="filtros">
      <select v-model="filtros.tipo" @change="cargar()">
        <option value="">Todos los tipos</option>
        <option v-for="t in TIPOS" :key="t" :value="t">{{ t }}</option>
      </select>
      <select v-model="filtros.estado" @change="cargar()">
        <option value="">Todos los estados</option>
        <option v-for="e in ESTADOS" :key="e" :value="e">{{ e }}</option>
      </select>
      <input v-model="filtros.buscar" type="search" placeholder="Buscar por código o título…" @keyup.enter="cargar()" />
      <button class="btn btn-sec" @click="cargar()">Filtrar</button>
    </div>

    <div class="tabla-envoltura">
      <table>
        <thead>
          <tr><th>Código</th><th>Título</th><th>Tipo</th><th>Fecha</th><th>Autor</th><th>Versión</th><th>Estado</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="d in pagina.data" :key="d.id">
            <td class="codigo">{{ d.codigo }}</td>
            <td>{{ d.titulo }}</td>
            <td>{{ d.tipo }}</td>
            <td>{{ new Date(d.fecha).toLocaleDateString('es-PA') }}</td>
            <td>{{ d.autor?.name }}</td>
            <td>v{{ d.version_actual }}</td>
            <td><EstadoChip :estado="d.estado" /></td>
            <td><button class="btn btn-sec btn-mini" @click="verDetalle(d)">Ver / Versiones</button></td>
          </tr>
          <tr v-if="!pagina.data.length"><td colspan="8" class="sin-datos">No hay documentos registrados.</td></tr>
        </tbody>
      </table>
      <Paginacion :pagina="pagina" @ir="cargar" />
    </div>

    <!-- Modal nuevo documento -->
    <Modal v-if="modal" titulo="Registrar documento" @cerrar="modal = false">
      <form @submit.prevent="guardar">
        <div class="campo">
          <label>Título</label>
          <input v-model="form.titulo" required maxlength="255" />
        </div>
        <div class="fila-campos">
          <div class="campo">
            <label>Tipo documental</label>
            <select v-model="form.tipo" required>
              <option v-for="t in TIPOS" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>
          <div class="campo">
            <label>Fecha del documento</label>
            <input v-model="form.fecha" type="date" required />
          </div>
        </div>
        <div class="campo">
          <label>Descripción</label>
          <textarea v-model="form.descripcion" rows="2"></textarea>
        </div>
        <div class="campo">
          <label>Archivo PDF (máx. 20 MB)</label>
          <input type="file" accept="application/pdf" required @change="archivo = $event.target.files[0]" />
        </div>
        <div class="modal-pie">
          <button type="button" class="btn btn-sec" @click="modal = false">Cancelar</button>
          <button type="submit" class="btn" :disabled="guardando">{{ guardando ? 'Subiendo…' : 'Registrar' }}</button>
        </div>
      </form>
    </Modal>

    <!-- Modal detalle/versiones -->
    <Modal v-if="detalle" :titulo="`${detalle.codigo} · ${detalle.titulo}`" @cerrar="detalle = null">
      <p class="texto-suave" style="margin-bottom: 10px">
        {{ detalle.tipo }} · {{ new Date(detalle.fecha).toLocaleDateString('es-PA') }} ·
        Autor: {{ detalle.autor?.name }} · <EstadoChip :estado="detalle.estado" />
      </p>
      <p v-if="detalle.descripcion" style="margin-bottom: 12px">{{ detalle.descripcion }}</p>

      <h2 style="margin-bottom: 8px">Historial de versiones</h2>
      <div class="tabla-envoltura" style="box-shadow: none; border: 1px solid var(--gris-200)">
        <table>
          <thead><tr><th>Versión</th><th>Archivo</th><th>Subido por</th><th>Fecha</th><th>Notas</th><th></th></tr></thead>
          <tbody>
            <tr v-for="v in detalle.versiones" :key="v.id">
              <td><strong>v{{ v.version }}</strong><span v-if="v.version === detalle.version_actual" class="chip chip-verde" style="margin-left: 6px">actual</span></td>
              <td>{{ v.nombre_original }}</td>
              <td>{{ v.autor?.name }}</td>
              <td>{{ new Date(v.created_at).toLocaleDateString('es-PA') }}</td>
              <td class="texto-suave">{{ v.notas ?? '—' }}</td>
              <td><button class="btn btn-sec btn-mini" @click="descargar(v)">Descargar</button></td>
            </tr>
          </tbody>
        </table>
      </div>

      <template v-if="auth.puede('documentos.gestionar')">
        <h2 style="margin: 14px 0 8px">Subir nueva versión</h2>
        <div class="fila-campos">
          <div class="campo">
            <label>Archivo PDF</label>
            <input type="file" accept="application/pdf" @change="archivoNuevaVersion = $event.target.files[0]" />
          </div>
          <div class="campo">
            <label>Notas del cambio</label>
            <input v-model="notasVersion" maxlength="500" placeholder="Qué cambió en esta versión…" />
          </div>
        </div>
        <button class="btn" :disabled="!archivoNuevaVersion" @click="subirVersion">Subir versión {{ detalle.version_actual + 1 }}</button>
      </template>
    </Modal>
  </div>
</template>
