<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Validación de permisos en backend (RBAC). Uso: ->middleware('permiso:solicitudes.crear').
 * Ninguna autorización depende del frontend.
 */
class CheckPermission
{
    public function handle(Request $request, Closure $next, string $permiso): Response
    {
        $user = $request->user();

        if ($user === null || $user->estado !== 'activo' || ! $user->tienePermiso($permiso)) {
            return response()->json([
                'message' => 'No tiene permisos para realizar esta acción.',
            ], 403);
        }

        return $next($request);
    }
}
