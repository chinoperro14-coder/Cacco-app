<script setup>
import { computed, onMounted, ref } from 'vue'
import api from '../api'
import EstadoChip from '../components/EstadoChip.vue'

const datos = ref(null)

onMounted(async () => {
  const { data } = await api.get('/dashboard')
  datos.value = data
})

const indicadores = computed(() => {
  if (!datos.value) return []
  const d = datos.value
  return [
    { titulo: 'Solicitudes activas', valor: d.solicitudes.activas, detalle: `${d.solicitudes.cerradas} cerradas`, icono: '📋' },
    { titulo: 'Actividades programadas', valor: d.actividades.programadas, detalle: `${d.actividades.hoy} hoy`, icono: '🎭' },
    { titulo: 'Espacios ocupados hoy', valor: d.espacios.ocupados_hoy, detalle: `de ${d.espacios.total} espacios`, icono: '🏛️' },
    { titulo: 'Tareas pendientes', valor: d.tareas.pendientes, detalle: `${d.tareas.mias_pendientes} mías · ${d.tareas.vencidas} vencidas`, icono: '✅' },
    { titulo: 'Usuarios activos', valor: d.usuarios.activos, detalle: `${d.usuarios.conectados_hoy} conectados hoy`, icono: '👥' },
  ]
})

// Gráfico de barras simple (sin librerías externas).
function barras(objeto) {
  const entradas = Object.entries(objeto ?? {})
  const maximo = Math.max(1, ...entradas.map(([, v]) => v))
  return entradas.map(([clave, valor]) => ({
    clave: clave.replaceAll('_', ' '),
    valor,
    porcentaje: Math.round((valor / maximo) * 100),
  }))
}
</script>

<template>
  <div>
    <div class="encabezado-vista">
      <h1>Dashboard institucional</h1>
      <span class="texto-suave">{{ new Date().toLocaleDateString('es-PA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) }}</span>
    </div>

    <div v-if="!datos" class="sin-datos">Cargando indicadores…</div>

    <template v-else>
      <div class="rejilla-indicadores">
        <div v-for="ind in indicadores" :key="ind.titulo" class="tarjeta indicador">
          <span class="indicador-icono">{{ ind.icono }}</span>
          <div>
            <div class="indicador-valor">{{ ind.valor }}</div>
            <div class="indicador-titulo">{{ ind.titulo }}</div>
            <div class="texto-suave">{{ ind.detalle }}</div>
          </div>
        </div>
      </div>

      <div class="rejilla-paneles">
        <div class="tarjeta">
          <h2>Solicitudes por estado</h2>
          <div v-for="b in barras(datos.solicitudes.por_estado)" :key="b.clave" class="barra-fila">
            <span class="barra-etiqueta">{{ b.clave }}</span>
            <div class="barra-fondo"><div class="barra" :style="{ width: b.porcentaje + '%' }"></div></div>
            <strong>{{ b.valor }}</strong>
          </div>
          <div v-if="!barras(datos.solicitudes.por_estado).length" class="texto-suave">Sin datos.</div>
        </div>

        <div class="tarjeta">
          <h2>Actividades por tipo</h2>
          <div v-for="b in barras(datos.actividades.por_tipo)" :key="b.clave" class="barra-fila">
            <span class="barra-etiqueta">{{ b.clave }}</span>
            <div class="barra-fondo"><div class="barra barra-secundaria" :style="{ width: b.porcentaje + '%' }"></div></div>
            <strong>{{ b.valor }}</strong>
          </div>
          <div v-if="!barras(datos.actividades.por_tipo).length" class="texto-suave">Sin datos.</div>
        </div>

        <div class="tarjeta panel-ancho">
          <h2>Próximas actividades</h2>
          <div class="tabla-envoltura" style="box-shadow: none">
            <table>
              <thead>
                <tr><th>Código</th><th>Actividad</th><th>Fecha</th><th>Horario</th><th>Espacio</th><th>Responsable</th><th>Estado</th></tr>
              </thead>
              <tbody>
                <tr v-for="a in datos.proximas_actividades" :key="a.id">
                  <td class="codigo">{{ a.codigo }}</td>
                  <td>{{ a.nombre }}</td>
                  <td>{{ new Date(a.fecha).toLocaleDateString('es-PA') }}</td>
                  <td>{{ a.hora_inicio?.slice(0, 5) }}–{{ a.hora_fin?.slice(0, 5) }}</td>
                  <td>{{ a.espacio?.nombre ?? '—' }}</td>
                  <td>{{ a.responsable?.name }}</td>
                  <td><EstadoChip :estado="a.estado" /></td>
                </tr>
                <tr v-if="!datos.proximas_actividades.length">
                  <td colspan="7" class="sin-datos">No hay actividades próximas.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.rejilla-indicadores {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 14px; margin-bottom: 18px;
}
.indicador { display: flex; gap: 12px; align-items: center; }
.indicador-icono { font-size: 1.7rem; }
.indicador-valor { font-size: 1.7rem; font-weight: 800; color: var(--oscuro-800); line-height: 1.1; }
.indicador-titulo { font-weight: 600; font-size: 0.85rem; }

.rejilla-paneles { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.panel-ancho { grid-column: 1 / -1; }

.barra-fila { display: grid; grid-template-columns: 110px 1fr 32px; gap: 10px; align-items: center; margin-top: 10px; }
.barra-etiqueta { font-size: 0.82rem; color: var(--gris-700); text-transform: capitalize; }
.barra-fondo { background: var(--gris-100); border-radius: 999px; height: 12px; overflow: hidden; }
.barra { background: var(--marca); height: 100%; border-radius: 999px; }
.barra-secundaria { background: var(--secundario); }

@media (max-width: 900px) {
  .rejilla-paneles { grid-template-columns: 1fr; }
}
</style>
