<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('espacios', function (Blueprint $table) {
            $table->id();
            $table->string('codigo', 20)->unique(); // ESP-2026-0001
            $table->string('nombre')->unique();
            $table->string('tipo', 30)->index();    // teatro, auditorio, galeria, salon, aula, patio
            $table->unsignedInteger('capacidad')->default(0);
            $table->text('descripcion')->nullable();
            $table->string('estado', 20)->default('disponible')->index(); // disponible|reservado|mantenimiento|bloqueado
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('espacios');
    }
};
