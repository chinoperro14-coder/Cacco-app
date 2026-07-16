<script setup>
import { onMounted, reactive, ref } from 'vue'
import api, { mensajeError } from '../api'
import EstadoChip from '../components/EstadoChip.vue'
import Modal from '../components/Modal.vue'
import Paginacion from '../components/Paginacion.vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()

const pestana = ref('usuarios')
const error = ref('')
const aviso = ref('')

// --- Usuarios ---
const pagina = ref({ data: [] })
const filtros = reactive({ buscar: '', estado: '' })
const oficinas = ref([])
const roles = ref([])
const permisosCatalogo = ref([])

async function cargarUsuarios(numero = 1) {
  const { data } = await api.get('/usuarios', { params: { ...filtros, page: numero } })
  pagina.value = data
}

async function cargarCatalogos() {
  if (auth.puede('usuarios.gestionar')) {
    const { data } = await api.get('/oficinas')
    oficinas.value = data
  }
  if (auth.puede('roles.gestionar')) {
    const { data } = await api.get('/roles')
    roles.value = data.roles
    permisosCatalogo.value = data.permisos
  }
}

const modal = ref(false)
const editando = ref(null)
const guardando = ref(false)
const form = reactive({
  usuario: '', name: '', email: '', password: '', cargo: '',
  oficina_id: '', role_id: '', estado: 'activo',
})

function abrirNuevo() {
  editando.value = null
  Object.assign(form, { usuario: '', name: '', email: '', password: '', cargo: '', oficina_id: '', role_id: '', estado: 'activo' })
  modal.value = true
}

function abrirEdicion(usuario) {
  editando.value = usuario
  Object.assign(form, {
    usuario: usuario.usuario, name: usuario.name, email: usuario.email, password: '',
    cargo: usuario.cargo ?? '', oficina_id: usuario.oficina_id ?? '',
    role_id: usuario.role_id ?? '', estado: usuario.estado,
  })
  modal.value = true
}

async function guardar() {
  guardando.value = true
  error.value = ''
  try {
    const carga = { ...form, oficina_id: form.oficina_id || null }
    if (editando.value && !carga.password) delete carga.password

    if (editando.value) {
      await api.put(`/usuarios/${editando.value.id}`, carga)
      aviso.value = 'Usuario actualizado.'
    } else {
      await api.post('/usuarios', carga)
      aviso.value = 'Usuario creado.'
    }
    modal.value = false
    await cargarUsuarios(pagina.value.current_page)
  } catch (e) {
    error.value = mensajeError(e)
  } finally {
    guardando.value = false
  }
}

async function desactivar(usuario) {
  if (!confirm(`¿Desactivar al usuario ${usuario.name}? Su historial se conserva (baja lógica).`)) return
  error.value = ''
  try {
    await api.delete(`/usuarios/${usuario.id}`)
    aviso.value = 'Usuario desactivado.'
    await cargarUsuarios(pagina.value.current_page)
  } catch (e) {
    error.value = mensajeError(e)
  }
}

// --- Roles y permisos ---
const modalRol = ref(false)
const rolEditando = ref(null)
const rolForm = reactive({ nombre: '', descripcion: '', permisos: [] })

function abrirRol(rol = null) {
  rolEditando.value = rol
  Object.assign(rolForm, {
    nombre: rol?.nombre ?? '',
    descripcion: rol?.descripcion ?? '',
    permisos: rol?.permissions?.map((p) => p.id) ?? [],
  })
  modalRol.value = true
}

async function guardarRol() {
  error.value = ''
  try {
    if (rolEditando.value) {
      await api.put(`/roles/${rolEditando.value.id}`, rolForm)
      aviso.value = 'Rol actualizado.'
    } else {
      await api.post('/roles', rolForm)
      aviso.value = 'Rol creado.'
    }
    modalRol.value = false
    await cargarCatalogos()
  } catch (e) {
    error.value = mensajeError(e)
  }
}

function permisosPorModulo() {
  const grupos = {}
  for (const permiso of permisosCatalogo.value) {
    ;(grupos[permiso.modulo] ??= []).push(permiso)
  }
  return grupos
}

onMounted(() => {
  cargarUsuarios()
  cargarCatalogos()
})
</script>

<template>
  <div>
    <div class="encabezado-vista">
      <h1>Administración de usuarios</h1>
      <button v-if="pestana === 'usuarios' && auth.puede('usuarios.gestionar')" class="btn" @click="abrirNuevo">+ Nuevo usuario</button>
      <button v-if="pestana === 'roles' && auth.puede('roles.gestionar')" class="btn" @click="abrirRol()">+ Nuevo rol</button>
    </div>

    <div v-if="aviso" class="alerta alerta-ok" @click="aviso = ''">{{ aviso }}</div>
    <div v-if="error" class="alerta alerta-error" @click="error = ''">{{ error }}</div>

    <div v-if="auth.puede('roles.gestionar')" class="pestanas">
      <button :class="{ activa: pestana === 'usuarios' }" @click="pestana = 'usuarios'">Usuarios</button>
      <button :class="{ activa: pestana === 'roles' }" @click="pestana = 'roles'">Roles y permisos</button>
    </div>

    <!-- Pestaña usuarios -->
    <template v-if="pestana === 'usuarios'">
      <div class="filtros">
        <input v-model="filtros.buscar" type="search" placeholder="Buscar por nombre, correo o usuario…" @keyup.enter="cargarUsuarios()" />
        <select v-model="filtros.estado" @change="cargarUsuarios()">
          <option value="">Todos los estados</option>
          <option value="activo">Activo</option>
          <option value="inactivo">Inactivo</option>
          <option value="suspendido">Suspendido</option>
        </select>
        <button class="btn btn-sec" @click="cargarUsuarios()">Filtrar</button>
      </div>

      <div class="tabla-envoltura">
        <table>
          <thead>
            <tr><th>Usuario</th><th>Nombre completo</th><th>Correo institucional</th><th>Cargo</th><th>Oficina</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="u in pagina.data" :key="u.id">
              <td class="codigo">{{ u.usuario }}</td>
              <td>{{ u.name }}</td>
              <td>{{ u.email }}</td>
              <td>{{ u.cargo ?? '—' }}</td>
              <td>{{ u.oficina?.sigla ?? '—' }}</td>
              <td>{{ u.role?.nombre ?? '—' }}</td>
              <td><EstadoChip :estado="u.estado" /></td>
              <td class="texto-suave">{{ u.ultimo_acceso ? new Date(u.ultimo_acceso).toLocaleString('es-PA') : 'Nunca' }}</td>
              <td style="white-space: nowrap">
                <template v-if="auth.puede('usuarios.gestionar')">
                  <button class="btn btn-sec btn-mini" @click="abrirEdicion(u)">Editar</button>
                  <button
                    v-if="u.estado !== 'inactivo'"
                    class="btn btn-peligro btn-mini"
                    style="margin-left: 6px"
                    @click="desactivar(u)"
                  >Desactivar</button>
                </template>
              </td>
            </tr>
            <tr v-if="!pagina.data.length"><td colspan="9" class="sin-datos">No hay usuarios.</td></tr>
          </tbody>
        </table>
        <Paginacion :pagina="pagina" @ir="cargarUsuarios" />
      </div>
    </template>

    <!-- Pestaña roles -->
    <template v-else>
      <div class="rejilla-roles">
        <div v-for="rol in roles" :key="rol.id" class="tarjeta">
          <div style="display: flex; justify-content: space-between; align-items: flex-start">
            <h2>{{ rol.nombre }}</h2>
            <span class="chip chip-azul">{{ rol.users_count }} usuarios</span>
          </div>
          <p class="texto-suave" style="margin: 6px 0 10px">{{ rol.descripcion }}</p>
          <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px">
            <span v-for="p in rol.permissions" :key="p.id" class="chip">{{ p.clave }}</span>
          </div>
          <button class="btn btn-sec btn-mini" @click="abrirRol(rol)">Configurar permisos</button>
        </div>
      </div>
    </template>

    <!-- Modal usuario -->
    <Modal v-if="modal" :titulo="editando ? `Editar: ${editando.name}` : 'Nuevo usuario'" @cerrar="modal = false">
      <form @submit.prevent="guardar">
        <div class="fila-campos">
          <div class="campo">
            <label>Usuario</label>
            <input v-model="form.usuario" required maxlength="60" />
          </div>
          <div class="campo">
            <label>Nombre completo</label>
            <input v-model="form.name" required maxlength="255" />
          </div>
        </div>
        <div class="fila-campos">
          <div class="campo">
            <label>Correo institucional</label>
            <input v-model="form.email" type="email" required />
          </div>
          <div class="campo">
            <label>Cargo</label>
            <input v-model="form.cargo" maxlength="255" />
          </div>
        </div>
        <div class="fila-campos">
          <div class="campo">
            <label>Oficina</label>
            <select v-model="form.oficina_id">
              <option value="">Sin oficina</option>
              <option v-for="o in oficinas" :key="o.id" :value="o.id">{{ o.nombre }}</option>
            </select>
          </div>
          <div class="campo">
            <label>Rol</label>
            <select v-model="form.role_id" required>
              <option value="" disabled>Seleccione…</option>
              <option v-for="r in roles" :key="r.id" :value="r.id">{{ r.nombre }}</option>
            </select>
          </div>
          <div class="campo">
            <label>Estado</label>
            <select v-model="form.estado">
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
              <option value="suspendido">Suspendido</option>
            </select>
          </div>
        </div>
        <div class="campo">
          <label>{{ editando ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña' }}</label>
          <input v-model="form.password" type="password" :required="!editando" minlength="10" placeholder="Mínimo 10 caracteres, letras y números" />
        </div>
        <div class="modal-pie">
          <button type="button" class="btn btn-sec" @click="modal = false">Cancelar</button>
          <button type="submit" class="btn" :disabled="guardando">Guardar</button>
        </div>
      </form>
    </Modal>

    <!-- Modal rol -->
    <Modal v-if="modalRol" :titulo="rolEditando ? `Permisos: ${rolEditando.nombre}` : 'Nuevo rol'" @cerrar="modalRol = false">
      <form @submit.prevent="guardarRol">
        <div class="fila-campos">
          <div class="campo">
            <label>Nombre del rol</label>
            <input v-model="rolForm.nombre" required maxlength="100" :disabled="rolEditando?.es_sistema" />
          </div>
          <div class="campo">
            <label>Descripción</label>
            <input v-model="rolForm.descripcion" maxlength="255" />
          </div>
        </div>
        <div v-for="(permisos, modulo) in permisosPorModulo()" :key="modulo" class="campo">
          <label style="text-transform: capitalize">{{ modulo }}</label>
          <div style="display: flex; flex-wrap: wrap; gap: 10px">
            <label
              v-for="p in permisos"
              :key="p.id"
              style="display: flex; align-items: center; gap: 5px; font-weight: 400; margin: 0"
              :title="p.descripcion"
            >
              <input v-model="rolForm.permisos" type="checkbox" :value="p.id" style="width: auto" />
              {{ p.clave }}
            </label>
          </div>
        </div>
        <div class="modal-pie">
          <button type="button" class="btn btn-sec" @click="modalRol = false">Cancelar</button>
          <button type="submit" class="btn">Guardar</button>
        </div>
      </form>
    </Modal>
  </div>
</template>

<style scoped>
.pestanas { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 2px solid var(--gris-200); }
.pestanas button {
  background: none; border: none; padding: 10px 18px; cursor: pointer; font: inherit;
  font-weight: 600; color: var(--gris-500); border-bottom: 2px solid transparent; margin-bottom: -2px;
}
.pestanas button.activa { color: var(--azul-800); border-bottom-color: var(--azul-700); }
.rejilla-roles { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
</style>
