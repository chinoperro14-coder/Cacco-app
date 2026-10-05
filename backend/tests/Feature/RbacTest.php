<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Database\Seeders\RolesPermisosSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RbacTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesPermisosSeeder::class);
    }

    private function actuarComo(string $rol): User
    {
        $user = User::factory()->create([
            'role_id' => Role::where('nombre', $rol)->first()->id,
            'estado' => 'activo',
        ]);

        Sanctum::actingAs($user);

        return $user;
    }

    public function test_rol_consulta_no_puede_crear_registros(): void
    {
        $this->actuarComo('Consulta');

        $this->postJson('/api/v1/usuarios', [])->assertStatus(403);
        $this->postJson('/api/v1/solicitudes', [])->assertStatus(403);
        $this->postJson('/api/v1/reservas', [])->assertStatus(403);
        $this->postJson('/api/v1/espacios', [])->assertStatus(403);
    }

    public function test_rol_consulta_puede_leer_modulos_autorizados(): void
    {
        $this->actuarComo('Consulta');

        $this->getJson('/api/v1/dashboard')->assertOk();
        $this->getJson('/api/v1/espacios')->assertOk();
        $this->getJson('/api/v1/tareas')->assertOk();
    }

    public function test_colaborador_no_accede_a_administracion_de_usuarios(): void
    {
        $this->actuarComo('Colaborador');

        $this->getJson('/api/v1/usuarios')->assertStatus(403);
        $this->getJson('/api/v1/auditoria')->assertStatus(403);
    }

    public function test_administrador_accede_a_todos_los_modulos(): void
    {
        $this->actuarComo('Administrador General');

        $this->getJson('/api/v1/usuarios')->assertOk();
        $this->getJson('/api/v1/roles')->assertOk();
        $this->getJson('/api/v1/auditoria')->assertOk();
    }

    public function test_usuario_suspendido_pierde_acceso_aunque_tenga_token(): void
    {
        $user = $this->actuarComo('Administrador General');
        $user->update(['estado' => 'suspendido']);

        $this->getJson('/api/v1/usuarios')->assertStatus(403);
    }
}
