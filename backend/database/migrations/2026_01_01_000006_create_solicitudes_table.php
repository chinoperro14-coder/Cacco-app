<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('solicitudes', function (Blueprint $table) {
            $table->id();
            $table->string('codigo', 20)->unique(); // SOL-2026-0001
            $table->date('fecha');
            $table->foreignId('solicitante_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('oficina_id')->nullable()->constrained('oficinas')->nullOnDelete();
            $table->string('tipo', 30)->index();      // uso_espacio|reunion|mantenimiento|comunicacion|transporte|equipamiento
            $table->string('titulo');
            $table->text('descripcion');
            $table->string('prioridad', 15)->default('media')->index(); // baja|media|alta|urgente
            $table->string('estado', 20)->default('borrador')->index(); // borrador|pendiente|en_revision|aprobada|rechazada|ejecutada|cerrada
            $table->foreignId('revisor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('observaciones')->nullable(); // motivo de aprobación/rechazo
            $table->timestamps();
            $table->softDeletes();

            $table->index(['estado', 'prioridad']);
            $table->index('fecha');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('solicitudes');
    }
};
