<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import api from '../api'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()

const hoy = new Date()
const anio = ref(hoy.getFullYear())
const mes = ref(hoy.getMonth()) // 0-11

const eventos = ref([])
const espacios = ref([])
const oficinas = ref([])
const usuarios = ref([])
const filtros = reactive({ espacio_id: '', oficina_id: '', responsable_id: '' })

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const COLORES = {
  actividad: 'evento-azul',
  reserva: 'evento-verde',
  mantenimiento: 'evento-ambar',
}

function fechaISO(a, m, d) {
  return `${a}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

async function cargar() {
  const desde = fechaISO(anio.value, mes.value, 1)
  const ultimoDia = new Date(anio.value, mes.value + 1, 0).getDate()
  const hasta = fechaISO(anio.value, mes.value, ultimoDia)

  const { data } = await api.get('/calendario', {
    params: {
      desde,
      hasta,
      espacio_id: filtros.espacio_id || undefined,
      oficina_id: filtros.oficina_id || undefined,
      responsable_id: filtros.responsable_id || undefined,
    },
  })
  eventos.value = data.eventos
}

async function cargarCatalogos() {
  const { data } = await api.get('/espacios', { params: { per_page: 100 } })
  espacios.value = data.data
  if (auth.puede('usuarios.ver')) {
    const [of, us] = await Promise.all([
      api.get('/oficinas').catch(() => ({ data: [] })),
      api.get('/usuarios', { params: { per_page: 100 } }),
    ])
    oficinas.value = of.data
    usuarios.value = us.data.data
  }
}

// Cuadrícula del mes: celdas vacías iniciales (semana inicia lunes) + días.
const celdas = computed(() => {
  const primerDia = new Date(anio.value, mes.value, 1).getDay() // 0=domingo
  const vacias = (primerDia + 6) % 7
  const totalDias = new Date(anio.value, mes.value + 1, 0).getDate()

  const lista = Array.from({ length: vacias }, () => null)
  for (let d = 1; d <= totalDias; d++) {
    const fecha = fechaISO(anio.value, mes.value, d)
    lista.push({
      dia: d,
      fecha,
      esHoy: fecha === fechaISO(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()),
      eventos: eventos.value.filter((e) => e.fecha === fecha),
    })
  }
  return lista
})

function mover(delta) {
  const fecha = new Date(anio.value, mes.value + delta, 1)
  anio.value = fecha.getFullYear()
  mes.value = fecha.getMonth()
}

const seleccionado = ref(null)

watch([anio, mes], cargar)

onMounted(() => {
  cargar()
  cargarCatalogos()
})
</script>

<template>
  <div>
    <div class="encabezado-vista">
      <h1>Calendario institucional</h1>
      <div class="navegacion-mes">
        <button class="btn btn-sec btn-mini" @click="mover(-1)">←</button>
        <strong>{{ MESES[mes] }} {{ anio }}</strong>
        <button class="btn btn-sec btn-mini" @click="mover(1)">→</button>
      </div>
    </div>

    <div class="filtros">
      <select v-model="filtros.espacio_id" @change="cargar">
        <option value="">Todos los espacios</option>
        <option v-for="e in espacios" :key="e.id" :value="e.id">{{ e.nombre }}</option>
      </select>
      <select v-if="oficinas.length" v-model="filtros.oficina_id" @change="cargar">
        <option value="">Todas las oficinas</option>
        <option v-for="o in oficinas" :key="o.id" :value="o.id">{{ o.nombre }}</option>
      </select>
      <select v-if="usuarios.length" v-model="filtros.responsable_id" @change="cargar">
        <option value="">Todos los responsables</option>
        <option v-for="u in usuarios" :key="u.id" :value="u.id">{{ u.name }}</option>
      </select>
      <div class="leyenda">
        <span><i class="punto evento-azul"></i> Actividad</span>
        <span><i class="punto evento-verde"></i> Reserva</span>
        <span><i class="punto evento-ambar"></i> Mantenimiento</span>
      </div>
    </div>

    <div class="tarjeta" style="padding: 10px">
      <div class="rejilla-calendario cabecera-dias">
        <div v-for="d in DIAS" :key="d" class="dia-nombre">{{ d }}</div>
      </div>
      <div class="rejilla-calendario">
        <div
          v-for="(celda, i) in celdas"
          :key="i"
          class="celda"
          :class="{ vacia: !celda, hoy: celda?.esHoy }"
        >
          <template v-if="celda">
            <span class="numero-dia">{{ celda.dia }}</span>
            <button
              v-for="ev in celda.eventos.slice(0, 3)"
              :key="ev.id"
              class="evento"
              :class="COLORES[ev.tipo]"
              :title="`${ev.codigo} · ${ev.titulo}`"
              @click="seleccionado = ev"
            >
              {{ ev.hora_inicio }} {{ ev.titulo }}
            </button>
            <span v-if="celda.eventos.length > 3" class="texto-suave" style="font-size: 0.7rem">
              +{{ celda.eventos.length - 3 }} más
            </span>
          </template>
        </div>
      </div>
    </div>

    <!-- Detalle del evento -->
    <div v-if="seleccionado" class="modal-fondo" @click.self="seleccionado = null">
      <div class="modal" style="max-width: 420px">
        <div class="modal-cabecera">
          <h2>{{ seleccionado.titulo }}</h2>
          <button class="btn btn-sec btn-mini" @click="seleccionado = null">✕</button>
        </div>
        <p><span class="codigo">{{ seleccionado.codigo }}</span></p>
        <p style="margin: 8px 0">
          📅 {{ new Date(seleccionado.fecha + 'T00:00').toLocaleDateString('es-PA', { weekday: 'long', day: 'numeric', month: 'long' }) }}<br />
          🕐 {{ seleccionado.hora_inicio }}–{{ seleccionado.hora_fin }}<br />
          🏛️ {{ seleccionado.espacio ?? 'Sin espacio' }}<br />
          👤 {{ seleccionado.responsable ?? '—' }}
          <template v-if="seleccionado.oficina"><br />🏢 {{ seleccionado.oficina }}</template>
        </p>
        <span class="chip chip-azul">{{ seleccionado.tipo }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.navegacion-mes { display: flex; align-items: center; gap: 12px; }
.leyenda { display: flex; gap: 14px; align-items: center; font-size: 0.8rem; color: var(--gris-500); }
.punto { display: inline-block; width: 10px; height: 10px; border-radius: 999px; margin-right: 4px; }

.rejilla-calendario { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.cabecera-dias { margin-bottom: 4px; }
.dia-nombre { text-align: center; font-size: 0.75rem; font-weight: 700; color: var(--gris-500); padding: 4px; }
.celda {
  min-height: 92px; border: 1px solid var(--gris-200); border-radius: 6px;
  padding: 4px; display: flex; flex-direction: column; gap: 3px; overflow: hidden;
}
.celda.vacia { background: var(--gris-50); border-style: dashed; }
.celda.hoy { border-color: var(--azul-600); border-width: 2px; background: var(--azul-100); }
.numero-dia { font-size: 0.78rem; font-weight: 700; color: var(--gris-700); }

.evento {
  border: none; text-align: left; font-size: 0.68rem; padding: 2px 5px; border-radius: 4px;
  cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600;
}
.evento-azul { background: var(--info-suave); color: var(--azul-700); }
.evento-verde { background: var(--verde-suave); color: var(--verde); }
.evento-ambar { background: var(--ambar-suave); color: var(--ambar); }

@media (max-width: 700px) {
  .celda { min-height: 56px; }
  .evento { display: none; }
  .celda:has(.evento)::after { content: '•'; color: var(--azul-600); font-size: 1.1rem; line-height: 0.5; }
}
</style>
