<script setup>
defineProps({ titulo: { type: String, required: true } })
defineEmits(['cerrar'])
</script>

<template>
  <div class="modal-fondo" @click.self="$emit('cerrar')">
    <div class="modal" role="dialog" :aria-label="titulo">
      <div class="modal-cabecera">
        <h2>{{ titulo }}</h2>
        <button class="btn btn-sec btn-mini" @click="$emit('cerrar')" aria-label="Cerrar">✕</button>
      </div>
      <slot />
    </div>
  </div>
</template>
