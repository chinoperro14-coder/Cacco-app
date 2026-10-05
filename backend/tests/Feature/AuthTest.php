<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Database\Seeders\RolesPermisosSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesPermisosSeeder::class);
    }

    private function crearUsuario(string $rol = 'Colaborador', array $atributos = []): User
    {
        return User::factory()->create([
            'role_id' => Role::where('nombre', $rol)->first()->id,
            'estado' => 'activo',
            ...$atributos,
        ]);
    }

    public function test_login_correcto_devuelve_token_y_permisos(): void
    {
        $user = $this->crearUsuario(atributos: ['password' => 'ClaveSegura123']);

        $respuesta = $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'ClaveSegura123',
        ]);

        $respuesta->assertOk()
            ->assertJsonStructure(['token', 'expira_en', 'usuario' => ['permisos', 'rol']]);

        $this->assertNotNull($user->fresh()->ultimo_acceso);
        $this->assertDatabaseHas('audit_logs', ['accion' => 'login', 'modulo' => 'seguridad', 'user_id' => $user->id]);
    }

    public function test_login_con_credenciales_incorrectas_falla_y_se_audita(): void
    {
        $user = $this->crearUsuario();

        $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'clave-incorrecta',
        ])->assertStatus(401);

        $this->assertSame(1, $user->fresh()->intentos_fallidos);
        $this->assertDatabaseHas('audit_logs', ['accion' => 'login_fallido', 'user_id' => $user->id]);
    }

    public function test_cuenta_se_bloquea_tras_cinco_intentos_fallidos(): void
    {
        $user = $this->crearUsuario();

        foreach (range(1, 5) as $i) {
            $this->postJson('/api/v1/auth/login', [
                'email' => $user->email,
                'password' => 'clave-incorrecta',
            ]);
        }

        $this->assertTrue($user->fresh()->estaBloqueado());

        // Incluso con la clave correcta y desde otra IP (para no chocar con el
        // throttle por IP), la cuenta bloqueada responde 423.
        $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.99'])
            ->postJson('/api/v1/auth/login', [
                'email' => $user->email,
                'password' => 'password',
            ])->assertStatus(423);
    }

    public function test_usuario_inactivo_no_puede_iniciar_sesion(): void
    {
        $user = $this->crearUsuario(atributos: ['estado' => 'inactivo', 'password' => 'ClaveSegura123']);

        $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'ClaveSegura123',
        ])->assertStatus(403);
    }

    public function test_rutas_protegidas_requieren_token(): void
    {
        $this->getJson('/api/v1/dashboard')->assertStatus(401);
    }
}
