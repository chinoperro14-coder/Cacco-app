<?php

use App\Http\Controllers\Api\ActividadController;
use App\Http\Controllers\Api\AuditoriaController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BusquedaController;
use App\Http\Controllers\Api\CalendarioController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DocumentoController;
use App\Http\Controllers\Api\EspacioController;
use App\Http\Controllers\Api\NotificacionController;
use App\Http\Controllers\Api\OficinaController;
use App\Http\Controllers\Api\ReservaController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\SolicitudController;
use App\Http\Controllers\Api\TareaController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API SIGEP-CACCO v1
|--------------------------------------------------------------------------
| Toda ruta protegida valida: token Sanctum válido (auth:sanctum) y permiso
| RBAC en backend (middleware "permiso"). El throttle de login mitiga
| ataques de fuerza bruta a nivel de IP.
*/

Route::prefix('v1')->group(function () {
    // Autenticación (throttle: 5 intentos por minuto por IP)
    Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:5,1');

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('auth/logout', [AuthController::class, 'logout']);
        Route::post('auth/renovar', [AuthController::class, 'renovar']);
        Route::get('auth/me', [AuthController::class, 'me']);

        // Dashboard, calendario, búsqueda y notificaciones (todo usuario autenticado)
        Route::get('dashboard', [DashboardController::class, 'index'])->middleware('permiso:dashboard.ver');
        Route::get('calendario', [CalendarioController::class, 'index'])->middleware('permiso:calendario.ver');
        Route::get('buscar', [BusquedaController::class, 'index']);
        Route::get('notificaciones', [NotificacionController::class, 'index']);
        Route::post('notificaciones/leidas', [NotificacionController::class, 'marcarTodasLeidas']);
        Route::post('notificaciones/{id}/leida', [NotificacionController::class, 'marcarLeida']);

        // Administración de usuarios, roles y oficinas
        Route::middleware('permiso:usuarios.ver')->group(function () {
            Route::get('usuarios', [UserController::class, 'index']);
            Route::get('usuarios/{user}', [UserController::class, 'show']);
        });
        Route::middleware('permiso:usuarios.gestionar')->group(function () {
            Route::post('usuarios', [UserController::class, 'store']);
            Route::put('usuarios/{user}', [UserController::class, 'update']);
            Route::delete('usuarios/{user}', [UserController::class, 'destroy']);
            Route::apiResource('oficinas', OficinaController::class)->except(['show']);
        });
        Route::middleware('permiso:roles.gestionar')->group(function () {
            Route::get('roles', [RoleController::class, 'index']);
            Route::post('roles', [RoleController::class, 'store']);
            Route::put('roles/{role}', [RoleController::class, 'update']);
            Route::delete('roles/{role}', [RoleController::class, 'destroy']);
        });

        // Solicitudes
        Route::middleware('permiso:solicitudes.ver')->group(function () {
            Route::get('solicitudes', [SolicitudController::class, 'index']);
            Route::get('solicitudes/{solicitud}', [SolicitudController::class, 'show']);
        });
        Route::middleware('permiso:solicitudes.crear')->group(function () {
            Route::post('solicitudes', [SolicitudController::class, 'store']);
            Route::put('solicitudes/{solicitud}', [SolicitudController::class, 'update']);
            Route::delete('solicitudes/{solicitud}', [SolicitudController::class, 'destroy']);
            // La transición valida internamente permiso de gestión cuando corresponde.
            Route::post('solicitudes/{solicitud}/estado', [SolicitudController::class, 'cambiarEstado']);
        });

        // Actividades
        Route::middleware('permiso:actividades.ver')->group(function () {
            Route::get('actividades', [ActividadController::class, 'index']);
            Route::get('actividades/{actividad}', [ActividadController::class, 'show']);
        });
        Route::middleware('permiso:actividades.gestionar')->group(function () {
            Route::post('actividades', [ActividadController::class, 'store']);
            Route::put('actividades/{actividad}', [ActividadController::class, 'update']);
            Route::delete('actividades/{actividad}', [ActividadController::class, 'destroy']);
        });

        // Espacios
        Route::middleware('permiso:espacios.ver')->group(function () {
            Route::get('espacios', [EspacioController::class, 'index']);
            Route::get('espacios/{espacio}', [EspacioController::class, 'show']);
        });
        Route::middleware('permiso:espacios.gestionar')->group(function () {
            Route::post('espacios', [EspacioController::class, 'store']);
            Route::put('espacios/{espacio}', [EspacioController::class, 'update']);
            Route::delete('espacios/{espacio}', [EspacioController::class, 'destroy']);
        });

        // Reservas (control de doble reserva en ReservaService)
        Route::middleware('permiso:reservas.ver')->group(function () {
            Route::get('reservas', [ReservaController::class, 'index']);
            Route::post('reservas/disponibilidad', [ReservaController::class, 'disponibilidad']);
        });
        Route::middleware('permiso:reservas.gestionar')->group(function () {
            Route::post('reservas', [ReservaController::class, 'store']);
            Route::put('reservas/{reserva}', [ReservaController::class, 'update']);
            Route::delete('reservas/{reserva}', [ReservaController::class, 'destroy']);
        });

        // Bandeja de tareas
        Route::middleware('permiso:tareas.ver')->group(function () {
            Route::get('tareas', [TareaController::class, 'index']);
            Route::get('tareas/{tarea}', [TareaController::class, 'show']);
            Route::put('tareas/{tarea}', [TareaController::class, 'update']);
        });
        Route::middleware('permiso:tareas.gestionar')->group(function () {
            Route::post('tareas', [TareaController::class, 'store']);
            Route::delete('tareas/{tarea}', [TareaController::class, 'destroy']);
        });

        // Gestión documental
        Route::middleware('permiso:documentos.ver')->group(function () {
            Route::get('documentos', [DocumentoController::class, 'index']);
            Route::get('documentos/{documento}', [DocumentoController::class, 'show']);
            Route::get('documentos/{documento}/versiones/{version}/descargar', [DocumentoController::class, 'descargar']);
        });
        Route::middleware('permiso:documentos.gestionar')->group(function () {
            Route::post('documentos', [DocumentoController::class, 'store']);
            Route::put('documentos/{documento}', [DocumentoController::class, 'update']);
            Route::post('documentos/{documento}/versiones', [DocumentoController::class, 'nuevaVersion']);
            Route::delete('documentos/{documento}', [DocumentoController::class, 'destroy']);
        });

        // Auditoría y trazabilidad
        Route::middleware('permiso:auditoria.ver')->group(function () {
            Route::get('auditoria', [AuditoriaController::class, 'index']);
            Route::get('auditoria/historial', [AuditoriaController::class, 'historial']);
        });
    });
});
