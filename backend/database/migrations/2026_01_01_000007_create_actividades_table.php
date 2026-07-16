<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('actividades', function (Blueprint $table) {
            $table->id();
            $table->string('codigo', 20)->unique(); // ACT-2026-0001
            $table->string('nombre');
            $table->string('tipo', 30)->index();    // curso|festival|exposicion|reunion|taller|programa
            $table->foreignId('responsable_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('oficina_id')->nullable()->constrained('oficinas')->nullOnDelete();
            $table->foreignId('espacio_id')->nullable()->constrained('espacios')->nullOnDelete();
            $table->date('fecha');
            $table->time('hora_inicio');
            $table->time('hora_fin');
            $table->text('descripcion')->nullable();
            $table->string('estado', 20)->default('programada')->index(); // programada|en_curso|realizada|cancelada
            $table->timestamps();
            $table->softDeletes();

            $table->index(['fecha', 'espacio_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('actividades');
    }
};
