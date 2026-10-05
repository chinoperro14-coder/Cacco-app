<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppLayout from './components/AppLayout.vue'

const route = useRoute()
const esPublica = computed(() => route.meta.publica === true)
</script>

<template>
  <router-view v-if="esPublica" />
  <AppLayout v-else>
    <router-view />
  </AppLayout>
</template>
