import axios from 'axios'

// Cliente HTTP central. El token Sanctum viaja como Bearer y se guarda en
// sessionStorage (se descarta al cerrar el navegador, mitigando robo de sesión).
const api = axios.create({
  baseURL: '/api/v1',
  headers: { Accept: 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('sigep_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Sesión expirada o token revocado: se fuerza el reingreso.
    if (
      error.response?.status === 401
      && !error.config.url.includes('auth/login')
      && window.location.pathname !== '/login'
    ) {
      sessionStorage.removeItem('sigep_token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)

/** Extrae un mensaje legible de un error de la API (validación o general). */
export function mensajeError(error) {
  const datos = error.response?.data
  if (datos?.errors) return Object.values(datos.errors).flat()[0]
  return datos?.message || 'Ocurrió un error inesperado. Intente nuevamente.'
}

export default api
