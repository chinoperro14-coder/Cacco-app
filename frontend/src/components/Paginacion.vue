<script setup>
defineProps({ pagina: { type: Object, required: true } })
defineEmits(['ir'])
</script>

<template>
  <div v-if="pagina.last_page > 1" class="paginacion">
    <span class="texto-suave">{{ pagina.from }}–{{ pagina.to }} de {{ pagina.total }}</span>
    <button class="btn btn-sec btn-mini" :disabled="pagina.current_page <= 1" @click="$emit('ir', pagina.current_page - 1)">← Anterior</button>
    <button class="btn btn-sec btn-mini" :disabled="pagina.current_page >= pagina.last_page" @click="$emit('ir', pagina.current_page + 1)">Siguiente →</button>
  </div>
</template>
