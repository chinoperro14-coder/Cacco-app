<?php

namespace Tests\Feature;

use App\Models\Espacio;
use App\Models\Role;
use App\Models\User;
use App\Support\GeneradorCodigo;
use Database\Seeders\RolesPermisosSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReservaTest extends TestCase
{
    use RefreshDatabase;

    private Espacio $espacio;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesPermisosSeeder::class);

        Sanctum::actingAs(User::factory()->create([
            'role_id' => Role::where('nombre', 'Jefe de Oficina')->first()->id,
            'estado' => 'activo',
        ]));

        $this->espacio = Espacio::create([
            'codigo' => GeneradorCodigo::siguiente('ESP'),
            'nombre' => 'Salón de Pruebas',
            'tipo' => 'salon',
            'capacidad' => 30,
        ]);
    }

    private function datosReserva(array $extra = []): array
    {
        return [
            'espacio_id' => $this->espacio->id,
            'fecha' => now()->addDays(5)->toDateString(),
            'hora_inicio' => '10:00',
            'hora_fin' => '12:00',
            'motivo' => 'Reunión de prueba',
            ...$extra,
        ];
    }

    public function test_reserva_valida_se_crea_con_codigo_institucional(): void
    {
        $respuesta = $this->postJson('/api/v1/reservas', $this->datosReserva());

        $respuesta->assertCreated();
        $this->assertMatchesRegularExpression('/^RES-\d{4}-\d{4}$/', $respuesta->json('codigo'));
    }

    public function test_no_permite_doble_reserva_con_horario_superpuesto(): void
    {
        $this->postJson('/api/v1/reservas', $this->datosReserva())->assertCreated();

        // Solapamientos: contenido, cruce por inicio, cruce por fin, envolvente.
        foreach ([['10:30', '11:30'], ['09:00', '10:30'], ['11:30', '13:00'], ['09:00', '13:00']] as [$inicio, $fin]) {
            $this->postJson('/api/v1/reservas', $this->datosReserva([
                'hora_inicio' => $inicio,
                'hora_fin' => $fin,
            ]))->assertStatus(422);
        }
    }

    public function test_permite_reservas_consecutivas_sin_superposicion(): void
    {
        $this->postJson('/api/v1/reservas', $this->datosReserva())->assertCreated();

        // Mismo espacio, mismo día, horario contiguo (12:00 en adelante): permitido.
        $this->postJson('/api/v1/reservas', $this->datosReserva([
            'hora_inicio' => '12:00',
            'hora_fin' => '14:00',
        ]))->assertCreated();

        // Mismo horario en otro día: permitido.
        $this->postJson('/api/v1/reservas', $this->datosReserva([
            'fecha' => now()->addDays(6)->toDateString(),
        ]))->assertCreated();
    }

    public function test_reserva_cancelada_libera_el_horario(): void
    {
        $creada = $this->postJson('/api/v1/reservas', $this->datosReserva())->assertCreated();

        $this->putJson("/api/v1/reservas/{$creada->json('id')}", ['estado' => 'cancelada'])->assertOk();

        $this->postJson('/api/v1/reservas', $this->datosReserva())->assertCreated();
    }

    public function test_consulta_de_disponibilidad_informa_conflicto(): void
    {
        $this->postJson('/api/v1/reservas', $this->datosReserva())->assertCreated();

        $respuesta = $this->postJson('/api/v1/reservas/disponibilidad', $this->datosReserva());

        $respuesta->assertOk()->assertJsonPath('disponible', false);
        $this->assertStringContainsString('ya está reservado', $respuesta->json('message'));
    }
}
