<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tareas', function (Blueprint $table) {
            $table->id();
            $table->string('codigo', 20)->unique(); // TAR-2026-0001
            $table->string('titulo');
            $table->text('descripcion')->nullable();
            $table->foreignId('responsable_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('creador_id')->constrained('users')->restrictOnDelete();
            // Origen polimórfico: solicitud o actividad que generó la tarea.
            $table->nullableMorphs('origen');
            $table->date('fecha_limite')->nullable();
            $table->string('prioridad', 15)->default('media')->index();
            $table->string('estado', 20)->default('pendiente')->index(); // pendiente|en_proceso|completada|cancelada
            $table->timestamp('completada_en')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['responsable_id', 'estado']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tareas');
    }
};
