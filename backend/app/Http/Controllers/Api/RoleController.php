<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Permission;
use App\Models\Role;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class RoleController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'roles' => Role::with('permissions:id,clave,modulo,descripcion')
                ->withCount('users')
                ->orderBy('id')
                ->get(),
            'permisos' => Permission::orderBy('modulo')->orderBy('clave')->get(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $datos = $request->validate([
            'nombre' => ['required', 'string', 'max:100', 'unique:roles,nombre'],
            'descripcion' => ['nullable', 'string', 'max:255'],
            'permisos' => ['array'],
            'permisos.*' => ['integer', 'exists:permissions,id'],
        ]);

        $role = Role::create(['nombre' => $datos['nombre'], 'descripcion' => $datos['descripcion'] ?? null]);
        $role->permissions()->sync($datos['permisos'] ?? []);

        return response()->json($role->load('permissions'), 201);
    }

    public function update(Request $request, Role $role): JsonResponse
    {
        $datos = $request->validate([
            'nombre' => ['sometimes', 'string', 'max:100', Rule::unique('roles', 'nombre')->ignore($role->id)],
            'descripcion' => ['nullable', 'string', 'max:255'],
            'permisos' => ['sometimes', 'array'],
            'permisos.*' => ['integer', 'exists:permissions,id'],
        ]);

        $role->update(collect($datos)->only(['nombre', 'descripcion'])->all());

        if (array_key_exists('permisos', $datos)) {
            $anteriores = $role->permissions()->pluck('clave')->all();
            $role->permissions()->sync($datos['permisos']);
            $nuevos = $role->permissions()->pluck('clave')->all();

            Role::registrarAuditoria($role, 'edicion', ['permisos' => $anteriores], ['permisos' => $nuevos]);
        }

        return response()->json($role->load('permissions'));
    }

    public function destroy(Role $role): JsonResponse
    {
        if ($role->es_sistema) {
            return response()->json(['message' => 'Los roles de sistema no pueden eliminarse.'], 422);
        }

        if ($role->users()->exists()) {
            return response()->json(['message' => 'El rol tiene usuarios asignados; reasígnelos antes de eliminarlo.'], 422);
        }

        $role->delete();

        return response()->json(['message' => 'Rol eliminado.']);
    }
}
