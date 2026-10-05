<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    /** Intentos fallidos permitidos antes del bloqueo temporal. */
    private const MAX_INTENTOS = 5;

    /** Minutos de bloqueo tras exceder los intentos. */
    private const MINUTOS_BLOQUEO = 15;

    /**
     * Inicio de sesión. Protegido además por throttle en la ruta
     * (mitigación de fuerza bruta a nivel de IP).
     */
    public function login(Request $request): JsonResponse
    {
        $credenciales = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        /** @var User|null $user */
        $user = User::where('email', $credenciales['email'])->first();

        if ($user !== null && $user->estaBloqueado()) {
            AuditLog::registrar('login_bloqueado', 'seguridad', $user, userId: $user->id);

            return response()->json([
                'message' => 'Cuenta bloqueada temporalmente por intentos fallidos. Intente nuevamente en unos minutos.',
            ], 423);
        }

        if ($user === null || ! Hash::check($credenciales['password'], $user->password)) {
            $this->registrarIntentoFallido($user);

            return response()->json(['message' => 'Credenciales incorrectas.'], 401);
        }

        if ($user->estado !== 'activo') {
            AuditLog::registrar('login_rechazado', 'seguridad', $user, detalle: 'Usuario inactivo o suspendido', userId: $user->id);

            return response()->json(['message' => 'Su cuenta no se encuentra activa. Contacte al administrador.'], 403);
        }

        // Acceso correcto: se reinician los contadores y se emite un token con expiración.
        $user->forceFill([
            'intentos_fallidos' => 0,
            'bloqueado_hasta' => null,
            'ultimo_acceso' => now(),
        ])->saveQuietly();

        $token = $user->createToken('sigep-cacco', ['*'], now()->addMinutes(config('sanctum.expiration') ?? 480));

        AuditLog::registrar('login', 'seguridad', $user, userId: $user->id);

        return response()->json([
            'token' => $token->plainTextToken,
            'expira_en' => $token->accessToken->expires_at,
            'usuario' => $this->perfil($user),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        AuditLog::registrar('logout', 'seguridad', $request->user());
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Sesión cerrada correctamente.']);
    }

    /** Renovación de token: emite uno nuevo y revoca el actual. */
    public function renovar(Request $request): JsonResponse
    {
        $user = $request->user();
        $request->user()->currentAccessToken()->delete();

        $token = $user->createToken('sigep-cacco', ['*'], now()->addMinutes(config('sanctum.expiration') ?? 480));

        AuditLog::registrar('renovacion_token', 'seguridad', $user);

        return response()->json([
            'token' => $token->plainTextToken,
            'expira_en' => $token->accessToken->expires_at,
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['usuario' => $this->perfil($request->user())]);
    }

    private function perfil(User $user): array
    {
        $user->load(['role.permissions', 'oficina']);

        return [
            'id' => $user->id,
            'usuario' => $user->usuario,
            'name' => $user->name,
            'email' => $user->email,
            'cargo' => $user->cargo,
            'oficina' => $user->oficina?->only(['id', 'nombre', 'sigla']),
            'rol' => $user->role?->only(['id', 'nombre']),
            'permisos' => $user->clavesPermisos(),
            'ultimo_acceso' => $user->ultimo_acceso,
        ];
    }

    private function registrarIntentoFallido(?User $user): void
    {
        if ($user === null) {
            AuditLog::registrar('login_fallido', 'seguridad', detalle: 'Correo no registrado');

            return;
        }

        $intentos = $user->intentos_fallidos + 1;

        $user->forceFill([
            'intentos_fallidos' => $intentos,
            'bloqueado_hasta' => $intentos >= self::MAX_INTENTOS
                ? now()->addMinutes(self::MINUTOS_BLOQUEO)
                : $user->bloqueado_hasta,
        ])->saveQuietly();

        AuditLog::registrar(
            $intentos >= self::MAX_INTENTOS ? 'cuenta_bloqueada' : 'login_fallido',
            'seguridad',
            $user,
            detalle: "Intento fallido #{$intentos}",
            userId: $user->id,
        );
    }
}
