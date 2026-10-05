<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\Solicitud;
use App\Models\User;
use Database\Seeders\RolesPermisosSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SolicitudFlujoTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesPermisosSeeder::class);
    }

    private function usuario(string $rol): User
    {
        return User::factory()->create([
            'role_id' => Role::where('nombre', $rol)->first()->id,
            'estado' => 'activo',
        ]);
    }

    public function test_solicitud_pendiente_genera_tarea_y_auditoria(): void
    {
        $colaborador = $this->usuario('Colaborador');
        Sanctum::actingAs($colaborador);

        $respuesta = $this->postJson('/api/v1/solicitudes', [
            'tipo' => 'mantenimiento',
            'titulo' => 'Reparar luminarias del teatro',
            'descripcion' => 'Tres luminarias del escenario no encienden.',
            'prioridad' => 'alta',
        ]);

        $respuesta->assertCreated();
        $codigo = $respuesta->json('codigo');
        $this->assertMatchesRegularExpression('/^SOL-\d{4}-\d{4}$/', $codigo);

        // La solicitud genera automáticamente una tarea asociada.
        $this->assertDatabaseHas('tareas', [
            'origen_type' => 'solicitud',
            'origen_id' => $respuesta->json('id'),
        ]);

        // Y su creación queda en la bitácora.
        $this->assertDatabaseHas('audit_logs', [
            'modulo' => 'solicitudes',
            'accion' => 'creacion',
            'user_id' => $colaborador->id,
        ]);
    }

    public function test_aprobacion_notifica_al_solicitante_y_se_audita(): void
    {
        $colaborador = $this->usuario('Colaborador');
        Sanctum::actingAs($colaborador);

        $id = $this->postJson('/api/v1/solicitudes', [
            'tipo' => 'reunion',
            'titulo' => 'Reunión con artistas locales',
            'descripcion' => 'Coordinación del festival.',
        ])->json('id');

        $director = $this->usuario('Director');
        Sanctum::actingAs($director);

        $this->postJson("/api/v1/solicitudes/{$id}/estado", [
            'estado' => 'aprobada',
            'observaciones' => 'Aprobada para la fecha propuesta.',
        ])->assertOk();

        $this->assertDatabaseHas('notificaciones', [
            'usuario_id' => $colaborador->id,
            'tipo' => 'solicitud_aprobada',
        ]);

        $this->assertDatabaseHas('audit_logs', [
            'modulo' => 'solicitudes',
            'accion' => 'aprobacion',
            'user_id' => $director->id,
        ]);
    }

    public function test_transiciones_de_estado_invalidas_se_rechazan(): void
    {
        Sanctum::actingAs($this->usuario('Director'));

        $solicitud = Solicitud::create([
            'codigo' => 'SOL-2026-9999',
            'fecha' => now()->toDateString(),
            'solicitante_id' => auth()->id(),
            'tipo' => 'reunion',
            'titulo' => 'Prueba',
            'descripcion' => 'Prueba',
            'estado' => 'cerrada',
        ]);

        $this->postJson("/api/v1/solicitudes/{$solicitud->id}/estado", ['estado' => 'aprobada'])
            ->assertStatus(422);
    }

    public function test_colaborador_solo_ve_sus_solicitudes(): void
    {
        $otro = $this->usuario('Colaborador');
        Sanctum::actingAs($otro);
        $ajena = $this->postJson('/api/v1/solicitudes', [
            'tipo' => 'transporte',
            'titulo' => 'Solicitud ajena',
            'descripcion' => 'De otro usuario.',
        ])->json('id');

        Sanctum::actingAs($this->usuario('Colaborador'));

        $this->getJson('/api/v1/solicitudes')->assertOk()->assertJsonPath('total', 0);
        $this->getJson("/api/v1/solicitudes/{$ajena}")->assertStatus(403);
    }
}
