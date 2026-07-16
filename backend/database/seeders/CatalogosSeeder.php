<?php

namespace Database\Seeders;

use App\Models\Espacio;
use App\Models\Oficina;
use App\Support\GeneradorCodigo;
use Illuminate\Database\Seeder;

class CatalogosSeeder extends Seeder
{
    public function run(): void
    {
        $oficinas = [
            ['nombre' => 'Dirección General', 'sigla' => 'DG'],
            ['nombre' => 'Administración y Finanzas', 'sigla' => 'ADM'],
            ['nombre' => 'Gestión Cultural', 'sigla' => 'GC'],
            ['nombre' => 'Comunicaciones', 'sigla' => 'COM'],
            ['nombre' => 'Desarrollo Social', 'sigla' => 'DS'],
            ['nombre' => 'Mantenimiento y Servicios', 'sigla' => 'MS'],
        ];

        foreach ($oficinas as $oficina) {
            Oficina::updateOrCreate(['nombre' => $oficina['nombre']], $oficina);
        }

        $espacios = [
            ['nombre' => 'Teatro Principal', 'tipo' => 'teatro', 'capacidad' => 450, 'descripcion' => 'Teatro principal con escenario, camerinos y sistema de sonido.'],
            ['nombre' => 'Auditorio', 'tipo' => 'auditorio', 'capacidad' => 180, 'descripcion' => 'Auditorio para conferencias y presentaciones.'],
            ['nombre' => 'Galería de Arte', 'tipo' => 'galeria', 'capacidad' => 80, 'descripcion' => 'Galería para exposiciones temporales y permanentes.'],
            ['nombre' => 'Salón Multiusos 1', 'tipo' => 'salon', 'capacidad' => 60, 'descripcion' => 'Salón para reuniones y talleres.'],
            ['nombre' => 'Salón Multiusos 2', 'tipo' => 'salon', 'capacidad' => 40, 'descripcion' => 'Salón secundario para actividades pequeñas.'],
            ['nombre' => 'Aula de Música', 'tipo' => 'aula', 'capacidad' => 25, 'descripcion' => 'Aula equipada para clases de música.'],
            ['nombre' => 'Aula de Danza', 'tipo' => 'aula', 'capacidad' => 30, 'descripcion' => 'Aula con espejos y piso especial para danza.'],
            ['nombre' => 'Patio Central', 'tipo' => 'patio', 'capacidad' => 300, 'descripcion' => 'Patio al aire libre para festivales y ferias.'],
        ];

        foreach ($espacios as $espacio) {
            Espacio::firstOrCreate(
                ['nombre' => $espacio['nombre']],
                [...$espacio, 'codigo' => GeneradorCodigo::siguiente('ESP')],
            );
        }
    }
}
