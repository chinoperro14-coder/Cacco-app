<script setup>
import { computed } from 'vue'

const props = defineProps({ estado: { type: String, required: true } })

const CLASES = {
  // positivos
  aprobada: 'chip-verde', ejecutada: 'chip-verde', completada: 'chip-verde',
  realizada: 'chip-verde', disponible: 'chip-verde', activo: 'chip-verde',
  vigente: 'chip-verde', confirmada: 'chip-verde', activa: 'chip-verde',
  // negativos
  rechazada: 'chip-rojo', cancelada: 'chip-rojo', bloqueado: 'chip-rojo',
  suspendido: 'chip-rojo', urgente: 'chip-rojo', obsoleto: 'chip-rojo',
  // atención
  pendiente: 'chip-ambar', en_revision: 'chip-ambar', en_proceso: 'chip-ambar',
  mantenimiento: 'chip-ambar', alta: 'chip-ambar',
  // informativos
  en_curso: 'chip-azul', programada: 'chip-azul', reservado: 'chip-azul', media: 'chip-azul',
}

const clase = computed(() => CLASES[props.estado] ?? '')
const texto = computed(() => props.estado.replaceAll('_', ' '))
</script>

<template>
  <span class="chip" :class="clase">{{ texto }}</span>
</template>
