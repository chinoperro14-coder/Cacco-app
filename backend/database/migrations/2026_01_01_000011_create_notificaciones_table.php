<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notificaciones', function (Blueprint $table) {
            $table->id();
            $table->foreignId('usuario_id')->constrained('users')->cascadeOnDelete();
            $table->string('tipo', 40);           // tarea_asignada|solicitud_aprobada|reserva_rechazada|documento_actualizado|...
            $table->string('titulo');
            $table->text('mensaje')->nullable();
            // Enlace al recurso relacionado (para navegar desde la campana).
            $table->string('recurso_tipo', 40)->nullable();
            $table->unsignedBigInteger('recurso_id')->nullable();
            $table->timestamp('leida_en')->nullable();
            $table->timestamps();

            $table->index(['usuario_id', 'leida_en']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notificaciones');
    }
};
