// Formulario de pedidos de otras áreas (página pública /pedido).
// Convierte un pedido en un borrador de tarea. Lo usa el servidor (app.js) y también la página de prueba,
// por eso no depende de Node ni del navegador.
(function (raiz) {
  const AREAS = ["Dirección", "Programación", "Educación", "Administración", "Otra"];
  const SERVICIOS = {
    cobertura: { lbl: "Cobertura de fotos y video", secs: ["Audiovisual"] },
    diseno:    { lbl: "Diseño de una pieza (afiche, arte, invitación)", secs: ["Diseño"] },
    difusion:  { lbl: "Difusión en redes sociales", secs: ["Redes Sociales"] },
    prensa:    { lbl: "Prensa, radio o TV", secs: ["Medios"] },
    protocolo: { lbl: "Protocolo (maestro de ceremonia, logística)", secs: ["Protocolo"] },
  };

  // Lo que llega del formulario público se muestra luego dentro del dashboard: se quitan los caracteres
  // que permitirían inyectar HTML o cortar atributos, y se limita el largo de cada campo.
  function limpiar(v, max, multilinea) {
    let s = String(v == null ? "" : v)
      .replace(/\r\n?/g, "\n")
      .replace(multilinea ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, " ")
      .replace(/</g, "‹").replace(/>/g, "›").replace(/"/g, "”").replace(/'/g, "’").replace(/`/g, "’")
      .replace(/\s*&\s*/g, " y ").replace(/\\/g, "/");
    s = multilinea ? s.split("\n").map(l => l.replace(/\s+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim()
                   : s.replace(/\s+/g, " ").trim();
    return s.slice(0, max);
  }
  const esFecha = f => /^\d{4}-\d{2}-\d{2}$/.test(f) && !isNaN(new Date(f + "T12:00:00Z"));
  const esHora = h => /^([01]\d|2[0-3]):[0-5]\d$/.test(h);
  const fechaLarga = f => {
    const M = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const [a, m, d] = f.split("-").map(Number); return `${d} de ${M[m - 1]} de ${a}`;
  };

  // body: lo que envió el formulario. ctx: {hoy:'AAAA-MM-DD', id:()=>string, folio:'P-0001'}
  // Devuelve {error} o {tarea, registro}
  function pedidoATarea(body, ctx) {
    const b = body && typeof body === "object" ? body : {};
    if (b.web) return { error: "No se pudo enviar el pedido." };              // campo trampa para robots
    const area = AREAS.includes(b.area) ? b.area : null;
    const areaOtra = limpiar(b.areaOtra, 60);
    const nombre = limpiar(b.nombre, 80), contacto = limpiar(b.contacto, 120);
    const titulo = limpiar(b.actividad, 140), lugar = limpiar(b.lugar, 120);
    const descripcion = limpiar(b.descripcion, 1500, true);
    const servicios = (Array.isArray(b.servicios) ? b.servicios : []).filter(k => SERVICIOS[k]);
    const fecha = String(b.fecha || ""), hora = String(b.hora || ""), horaFin = String(b.horaFin || "");
    const entrega = String(b.entrega || "");
    if (!area) return { error: "Elige el área que hace el pedido." };
    if (area === "Otra" && !areaOtra) return { error: "Escribe el nombre de tu área." };
    if (!nombre) return { error: "Escribe tu nombre." };
    if (!contacto) return { error: "Escribe un teléfono o correo para contactarte." };
    if (!titulo) return { error: "Escribe el nombre de la actividad." };
    if (!servicios.length) return { error: "Marca al menos una cosa que necesitas." };
    if (!esFecha(fecha)) return { error: "Elige la fecha de la actividad." };
    if (fecha < ctx.hoy) return { error: "La fecha de la actividad ya pasó." };
    if (hora && !esHora(hora)) return { error: "La hora de inicio no es válida." };
    if (horaFin && !esHora(horaFin)) return { error: "La hora de fin no es válida." };
    if (entrega && (!esFecha(entrega) || entrega < ctx.hoy)) return { error: "La fecha de entrega del diseño no es válida." };

    const nomArea = area === "Otra" ? areaOtra : area;
    const secciones = {};
    servicios.forEach(k => SERVICIOS[k].secs.forEach(s => {
      secciones[s] = { responsables: [], estado: "Pendiente", completadoPor: null, completadoEn: null, fecha: null, hora: null };
    }));
    if (secciones["Diseño"] && entrega) secciones["Diseño"].fecha = entrega;
    const notas = [
      `📨 Pedido ${ctx.folio} de ${nomArea}, recibido el ${fechaLarga(ctx.hoy)} por el formulario de pedidos.`,
      `👤 Lo pide: ${nombre} · ${contacto}`,
      `🧰 Necesita: ${servicios.map(k => SERVICIOS[k].lbl).join("; ")}.`,
      entrega ? `🎨 Diseño para el ${fechaLarga(entrega)}.` : "",
      descripcion ? `\n${descripcion}` : "",
    ].filter(Boolean).join("\n");
    const pedido = { folio: ctx.folio, area: nomArea, solicitante: nombre, contacto, servicios, recibido: ctx.hoy };
    const tarea = {
      id: ctx.id(), titulo, borrador: true, etiquetas: [], prioridad: "Media", fecha, hora, horaFin, lugar, notas,
      recurrencia: "ninguna", secciones, entregables: [], creadaEn: ctx.hoy, creadaPor: "Formulario de pedidos", creadoPorId: "pedidos", pedido,
    };
    // El registro de pedidos no se borra al descartar el borrador: sirve para medir cuánto pide cada área
    const registro = { id: tarea.id, folio: ctx.folio, area: nomArea, titulo, fecha, servicios, recibido: ctx.hoy, solicitante: nombre };
    return { tarea, registro };
  }
  const siguienteFolio = registros => "P-" + String((registros || []).length + 1).padStart(4, "0");

  const api = { AREAS, SERVICIOS, limpiar, pedidoATarea, siguienteFolio };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else raiz.CaccoPedidos = api;
})(this);
