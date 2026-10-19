// Nombres de las personas del equipo. Horas, permisos, tareas y demás registros guardan el nombre como texto,
// así que al renombrar a alguien se cambia en todos lados. Lo usan el servidor (reglas.js) y el tablero (se publica en /nombres.js).
(function (raiz) {
  const NOMBRE_MAX = 80;
  // Campos donde los registros guardan el nombre de una persona del equipo
  const CAMPOS_NOMBRE = ["miembro", "registradoPor", "aprobadoPor", "anuladoPor", "creadaPor", "creadoPor", "completadoPor", "noCumplidaPor",
    "subidoPor", "publicadoPor", "responsableNombre", "anotadoPor", "archivadoPor", "enviadoPor", "editadoPor", "usuario", "por", "jefe"];
  // Para comparar: sin mayúsculas ni espacios
  const normNombre = n => String(n ?? "").replace(/\s+/g, "").toLowerCase();

  // Aviso si el nombre no sirve (vacío, muy largo, con < > " ' o ya usado por otra persona del equipo); si sirve, null
  function errorNombre(nombre, equipo, id) {
    const n = String(nombre ?? "").trim();
    if (!n) return "Escribe el nombre.";
    if (n.length > NOMBRE_MAX) return `El nombre no puede pasar de ${NOMBRE_MAX} caracteres.`;
    if (/[<>"']/.test(n)) return "El nombre no puede llevar los signos < > \" '.";
    const otro = (equipo || []).find(p => p && p.id !== id && normNombre(p.nombre) === normNombre(n));
    return otro ? `Ya hay otra persona llamada ${otro.nombre}.` : null;
  }

  // Cambia el nombre viejo por el nuevo en todos los registros (la lista del equipo no se toca). cambios: [{id, viejo, nuevo}]
  function renombrar(datos, cambios) {
    cambios = (cambios || []).filter(c => c && c.viejo && c.nuevo && c.viejo !== c.nuevo);
    if (!datos || !cambios.length) return datos;
    const porViejo = new Map(cambios.map(c => [c.viejo, c.nuevo])), porId = new Map(cambios.filter(c => c.id).map(c => [c.id, c.nuevo]));
    const ver = o => {
      if (Array.isArray(o)) return o.forEach(ver);
      if (!o || typeof o !== "object") return;
      if (porId.has(o.userId) && typeof o.nombre === "string") o.nombre = porId.get(o.userId);   // asignaciones de Audiovisual
      for (const k of Object.keys(o)) {
        if (CAMPOS_NOMBRE.includes(k) && typeof o[k] === "string" && porViejo.has(o[k])) o[k] = porViejo.get(o[k]);
        else if (o[k] && typeof o[k] === "object") ver(o[k]);
      }
    };
    Object.keys(datos).forEach(k => { if (k !== "equipo" && k !== "config") ver(datos[k]); });
    return datos;
  }

  const api = { NOMBRE_MAX, CAMPOS_NOMBRE, normNombre, errorNombre, renombrar };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else raiz.CaccoNombres = api;
})(this);
