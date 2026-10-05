import { defineStore } from 'pinia'
import api from '../api'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    usuario: null,
    cargando: false,
  }),

  getters: {
    autenticado: (state) => state.usuario !== null,
    permisos: (state) => state.usuario?.permisos ?? [],
  },

  actions: {
    /**
     * El menú y los botones se construyen con esta verificación, pero la
     * autorización real siempre ocurre en el backend.
     */
    puede(permiso) {
      return this.permisos.includes(permiso)
    },

    async login(email, password) {
      const { data } = await api.post('/auth/login', { email, password })
      sessionStorage.setItem('sigep_token', data.token)
      this.usuario = data.usuario
    },

    async cargarSesion() {
      if (!sessionStorage.getItem('sigep_token')) return
      this.cargando = true
      try {
        const { data } = await api.get('/auth/me')
        this.usuario = data.usuario
      } catch {
        sessionStorage.removeItem('sigep_token')
      } finally {
        this.cargando = false
      }
    },

    async logout() {
      try {
        await api.post('/auth/logout')
      } finally {
        sessionStorage.removeItem('sigep_token')
        this.usuario = null
      }
    },
  },
})
