import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const routes = [
  { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { publica: true } },
  { path: '/', name: 'dashboard', component: () => import('../views/DashboardView.vue'), meta: { permiso: 'dashboard.ver' } },
  { path: '/solicitudes', name: 'solicitudes', component: () => import('../views/SolicitudesView.vue'), meta: { permiso: 'solicitudes.ver' } },
  { path: '/actividades', name: 'actividades', component: () => import('../views/ActividadesView.vue'), meta: { permiso: 'actividades.ver' } },
  { path: '/espacios', name: 'espacios', component: () => import('../views/EspaciosView.vue'), meta: { permiso: 'espacios.ver' } },
  { path: '/calendario', name: 'calendario', component: () => import('../views/CalendarioView.vue'), meta: { permiso: 'calendario.ver' } },
  { path: '/tareas', name: 'tareas', component: () => import('../views/TareasView.vue'), meta: { permiso: 'tareas.ver' } },
  { path: '/documentos', name: 'documentos', component: () => import('../views/DocumentosView.vue'), meta: { permiso: 'documentos.ver' } },
  { path: '/usuarios', name: 'usuarios', component: () => import('../views/UsuariosView.vue'), meta: { permiso: 'usuarios.ver' } },
  { path: '/auditoria', name: 'auditoria', component: () => import('../views/AuditoriaView.vue'), meta: { permiso: 'auditoria.ver' } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (!auth.autenticado && sessionStorage.getItem('sigep_token')) {
    await auth.cargarSesion()
  }

  if (to.meta.publica) {
    return auth.autenticado ? '/' : true
  }

  if (!auth.autenticado) return '/login'

  // Solo se visualizan módulos autorizados; si no tiene el permiso,
  // se redirige al primer módulo disponible.
  if (to.meta.permiso && !auth.puede(to.meta.permiso)) {
    const destino = routes.find((r) => r.meta?.permiso && auth.puede(r.meta.permiso))
    return destino ? { name: destino.name } : '/login'
  }

  return true
})

export default router
