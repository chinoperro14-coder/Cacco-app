<script setup>
import { onMounted, reactive, ref } from 'vue'
import api from '../api'
import Paginacion from '../components/Paginacion.vue'

const MODULOS = ['seguridad', 'usuarios', 'roles', 'oficinas', 'solicitudes', 'actividades', 'espacios', 'reservas', 'tareas', 'documentos']
const ACCIONES = ['creacion', 'edicion', 'eliminacion', 'aprobacion', 'rechazo', 'asignacion', 'cierre', 'cambio_estado', 'login', 'logout', 'login_fallido', 'cuenta_bloqueada']

const pagina = ref({ data: [] })
const filtros = reactive({ modulo: '', accion: '', desde: '', hasta: '' })
const detalle = ref(null)

async function cargar(numero = 1) {
  const { data } = await api.get('/auditoria', {
    params: {
      modulo: filtros.modulo || undefined,
      accion: filtros.accion || undefined,
      desde: filtros.desde || undefined,
      hasta: filtros.hasta || undefined,
      page: numero,
    },
  })
  pagina.value = data
}

onMounted(cargar)
</script>

<template>
  <div>
    <div class="encabezado-vista">
      <h1>Bitácora de auditoría</h1>
      <span class="texto-suave">Toda acción del sistema queda registrada y es trazable.</span>
    </div>

    <div class="filtros">
      <select v-model="filtros.modulo" @change="cargar()">
        <option value="">Todos los módulos</option>
        <option v-for="m in MODULOS" :key="m" :value="m">{{ m }}</option>
      </select>
      <select v-model="filtros.accion" @change="cargar()">
        <option value="">Todas las acciones</option>
        <option v-for="a in ACCIONES" :key="a" :value="a">{{ a.replaceAll('_', ' ') }}</option>
      </select>
      <input v-model="filtros.desde" type="date" @change="cargar()" />
      <input v-model="filtros.hasta" type="date" @change="cargar()" />
      <button class="btn btn-sec" @click="cargar()">Filtrar</button>
    </div>

    <div class="tabla-envoltura">
      <table>
        <thead>
          <tr><th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Módulo</th><th>Registro</th><th>IP</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="r in pagina.data" :key="r.id">
            <td style="white-space: nowrap">{{ new Date(r.created_at).toLocaleString('es-PA') }}</td>
            <td>{{ r.user?.name ?? 'Sistema' }}</td>
            <td><span class="chip">{{ r.accion.replaceAll('_', ' ') }}</span></td>
            <td>{{ r.modulo }}</td>
            <td class="texto-suave">{{ r.auditable_type ? `${r.auditable_type} #${r.auditable_id}` : '—' }}</td>
            <td class="codigo">{{ r.ip ?? '—' }}</td>
            <td>
              <button
                v-if="r.valores_anteriores || r.valores_nuevos || r.detalle"
                class="btn btn-sec btn-mini"
                @click="detalle = r"
              >Detalle</button>
            </td>
          </tr>
          <tr v-if="!pagina.data.length"><td colspan="7" class="sin-datos">Sin registros para los filtros seleccionados.</td></tr>
        </tbody>
      </table>
      <Paginacion :pagina="pagina" @ir="cargar" />
    </div>

    <!-- Detalle: valores anteriores/nuevos -->
    <div v-if="detalle" class="modal-fondo" @click.self="detalle = null">
      <div class="modal">
        <div class="modal-cabecera">
          <h2>Detalle del registro #{{ detalle.id }}</h2>
          <button class="btn btn-sec btn-mini" @click="detalle = null">✕</button>
        </div>
        <p v-if="detalle.detalle" style="margin-bottom: 10px">{{ detalle.detalle }}</p>
        <div class="comparacion">
          <div v-if="detalle.valores_anteriores">
            <h2>Valor anterior</h2>
            <pre>{{ JSON.stringify(detalle.valores_anteriores, null, 2) }}</pre>
          </div>
          <div v-if="detalle.valores_nuevos">
            <h2>Valor nuevo</h2>
            <pre>{{ JSON.stringify(detalle.valores_nuevos, null, 2) }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.comparacion { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.comparacion pre {
  background: var(--gris-50); border: 1px solid var(--gris-200); border-radius: var(--radio);
  padding: 10px; font-size: 0.75rem; overflow-x: auto; max-height: 320px;
}
@media (max-width: 700px) { .comparacion { grid-template-columns: 1fr; } }
</style>
