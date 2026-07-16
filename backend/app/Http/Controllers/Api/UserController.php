<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class UserController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $usuarios = User::query()
            ->with(['oficina:id,nombre,sigla', 'role:id,nombre'])
            ->when($request->filled('buscar'), function ($q) use ($request) {
                $texto = '%'.$request->string('buscar').'%';
                $q->where(fn ($w) => $w
                    ->where('name', 'ilike', $texto)
                    ->orWhere('email', 'ilike', $texto)
                    ->orWhere('usuario', 'ilike', $texto));
            })
            ->when($request->filled('estado'), fn ($q) => $q->where('estado', $request->string('estado')))
            ->when($request->filled('oficina_id'), fn ($q) => $q->where('oficina_id', $request->integer('oficina_id')))
            ->orderBy('name')
            ->paginate($request->integer('per_page', 15));

        return response()->json($usuarios);
    }

    public function store(Request $request): JsonResponse
    {
        $datos = $request->validate([
            'usuario' => ['required', 'string', 'max:60', 'unique:users,usuario'],
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', Password::min(10)->letters()->numbers()],
            'cargo' => ['nullable', 'string', 'max:255'],
            'oficina_id' => ['nullable', 'exists:oficinas,id'],
            'role_id' => ['required', 'exists:roles,id'],
            'estado' => ['sometimes', Rule::in(User::ESTADOS)],
        ]);

        $usuario = User::create($datos);

        return response()->json($usuario->load(['oficina', 'role']), 201);
    }

    public function show(User $user): JsonResponse
    {
        return response()->json($user->load(['oficina', 'role.permissions']));
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $datos = $request->validate([
            'usuario' => ['sometimes', 'string', 'max:60', Rule::unique('users', 'usuario')->ignore($user->id)],
            'name' => ['sometimes', 'string', 'max:255'],
            'email' => ['sometimes', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'password' => ['sometimes', 'nullable', Password::min(10)->letters()->numbers()],
            'cargo' => ['nullable', 'string', 'max:255'],
            'oficina_id' => ['nullable', 'exists:oficinas,id'],
            'role_id' => ['sometimes', 'exists:roles,id'],
            'estado' => ['sometimes', Rule::in(User::ESTADOS)],
        ]);

        if (array_key_exists('password', $datos) && blank($datos['password'])) {
            unset($datos['password']);
        }

        $user->update($datos);

        return response()->json($user->load(['oficina', 'role']));
    }

    /** Baja lógica (soft delete): el registro nunca se elimina físicamente. */
    public function destroy(Request $request, User $user): JsonResponse
    {
        if ($user->id === $request->user()->id) {
            return response()->json(['message' => 'No puede eliminar su propio usuario.'], 422);
        }

        $user->update(['estado' => 'inactivo']);
        $user->tokens()->delete();
        $user->delete();

        return response()->json(['message' => 'Usuario desactivado correctamente.']);
    }
}
