require("dotenv").config();
const express  = require("express");
const cors     = require("cors");
const path     = require("path");
const fs       = require("fs");
const bcrypt   = require("bcrypt");
const jwt      = require("jsonwebtoken");
const PDFDocument = require("pdfkit");
const mongoose = require("mongoose");

const app        = express();
const JWT_SECRET = process.env.JWT_SECRET || "cacco_secret_2024";
const PORT       = process.env.PORT || 3000;
const MONGO_URI  = process.env.MONGODB_URI?.includes("xxxxx") ? null : process.env.MONGODB_URI;

app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.static(__dirname));

// ════════════════════════
//  MODELOS MONGODB
// ════════════════════════
const DataSchema = new mongoose.Schema({ _id: String, payload: mongoose.Schema.Types.Mixed });
const UserSchema = new mongoose.Schema({
  id:       { type: String, required: true, unique: true },
  email:    { type: String, required: true, unique: true },
  password: { type: String, required: true },
  nivel:    { type: String, required: true }
});
const DataModel = mongoose.models.AppData || mongoose.model("AppData", DataSchema);
const UserModel = mongoose.models.AppUser || mongoose.model("AppUser", UserSchema);

// ════════════════════════
//  HELPERS DE DATOS
// ════════════════════════
// Fallback a archivos locales si no hay MongoDB (desarrollo sin .env)
const DATA_FILE  = path.join(__dirname, "data.json");
const USERS_FILE = path.join(__dirname, "users.json");
function leerJSONLocal(file, def) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
  return def;
}

async function leerData() {
  if (!MONGO_URI) return leerJSONLocal(DATA_FILE, {});
  const doc = await DataModel.findById("main");
  return doc ? doc.payload : {};
}
async function escribirData(data) {
  if (!MONGO_URI) { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); return; }
  await DataModel.findByIdAndUpdate("main", { payload: data }, { upsert: true, new: true });
}
async function leerUsers() {
  if (!MONGO_URI) return leerJSONLocal(USERS_FILE, []);
  return await UserModel.find({}).lean();
}
async function escribirUser(u) {
  if (!MONGO_URI) {
    const arr = leerJSONLocal(USERS_FILE, []);
    const i = arr.findIndex(x => x.id === u.id);
    if (i >= 0) arr[i] = { ...arr[i], ...u }; else arr.push(u);
    fs.writeFileSync(USERS_FILE, JSON.stringify(arr, null, 2)); return;
  }
  await UserModel.findOneAndUpdate({ id: u.id }, u, { upsert: true, new: true });
}
async function eliminarUser(id) {
  if (!MONGO_URI) {
    const arr = leerJSONLocal(USERS_FILE, []).filter(u => u.id !== id);
    fs.writeFileSync(USERS_FILE, JSON.stringify(arr, null, 2)); return;
  }
  await UserModel.deleteOne({ id });
}

// ════════════════════════
//  MIDDLEWARE JWT
// ════════════════════════
function verificarToken(req, res, next) {
  const auth = req.headers["authorization"];
  if (!auth) return res.status(401).json({ error: "Sin token" });
  try {
    req.usuario = jwt.verify(auth.split(" ")[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
}
function soloLider(req, res, next) {
  if (req.usuario?.nivel !== "lider")
    return res.status(403).json({ error: "Solo el Líder puede hacer esto" });
  next();
}

// ════════════════════════
//  RUTA PRINCIPAL
// ════════════════════════
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

// ════════════════════════
//  LOGIN
// ════════════════════════
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email y contraseña requeridos" });
  try {
    const users = await leerUsers();
    const user  = users.find(u => u.email === email.toLowerCase().trim());
    if (!user) return res.status(401).json({ error: "Usuario no encontrado" });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: "Contraseña incorrecta" });
    const token = jwt.sign({ id: user.id, email: user.email, nivel: user.nivel }, JWT_SECRET, { expiresIn: "8h" });
    res.json({ token, userId: user.id });
  } catch (e) { res.status(500).json({ error: "Error interno" }); }
});

// ════════════════════════
//  DATOS COMPARTIDOS
// ════════════════════════
app.get("/api/data", verificarToken, async (req, res) => {
  try { res.json(await leerData()); }
  catch { res.status(500).json({ error: "Error leyendo datos" }); }
});
app.post("/api/data", verificarToken, async (req, res) => {
  try { await escribirData(req.body); res.json({ ok: true }); }
  catch { res.status(500).json({ error: "No se pudo guardar" }); }
});

// ════════════════════════
//  GESTIÓN DE USUARIOS
// ════════════════════════
app.post("/api/users", verificarToken, soloLider, async (req, res) => {
  const { id, email, password, nivel } = req.body;
  if (!id || !email || !nivel)
    return res.status(400).json({ error: "id, email y nivel requeridos" });
  try {
    const users = await leerUsers();
    const existe = users.find(u => u.id === id);
    if (!existe && !password)
      return res.status(400).json({ error: "Contraseña requerida para usuario nuevo" });
    const hashed = password ? await bcrypt.hash(password, 10) : existe?.password;
    await escribirUser({ id, email: email.toLowerCase().trim(), password: hashed, nivel });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "Error guardando usuario" }); }
});

app.delete("/api/users/:id", verificarToken, soloLider, async (req, res) => {
  try { await eliminarUser(req.params.id); res.json({ ok: true }); }
  catch { res.status(500).json({ error: "Error eliminando usuario" }); }
});

app.post("/api/change-password", verificarToken, async (req, res) => {
  const { passwordActual, passwordNueva } = req.body;
  if (!passwordActual || !passwordNueva)
    return res.status(400).json({ error: "Ambas contraseñas requeridas" });
  if (passwordNueva.length < 4)
    return res.status(400).json({ error: "Mínimo 4 caracteres" });
  try {
    const users = await leerUsers();
    const user  = users.find(u => u.id === req.usuario.id);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    const valid = await bcrypt.compare(passwordActual, user.password);
    if (!valid) return res.status(401).json({ error: "Contraseña actual incorrecta" });
    await escribirUser({ ...user, password: await bcrypt.hash(passwordNueva, 10) });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "Error cambiando contraseña" }); }
});

// ════════════════════════
//  GENERADOR DE PDF
// ════════════════════════
const FONT_REG  = path.join(__dirname, 'Calibri.ttf');
const FONT_BOLD = path.join(__dirname, 'Calibrib.ttf');
const FONT_ITAL = path.join(__dirname, 'Calibrii.ttf');
const LOGO_PATH = path.join(__dirname, 'logo.png');
const ICON_PATH = path.join(__dirname, 'icon.png');

const OR = [232, 73, 28];
const BK = [30,  30, 30];
const G1 = [90,  90, 90];
const G2 = [155,155,155];
const VE = [15, 120, 75];
const AZ = [22,  90,165];
const RO = [185, 38, 38];
const AM = [160,110,  0];
const WH = [255,255,255];

const NIVEL_NOM = { lider:'Coordinador/a', editor:'Editor/a', colaborador:'Colaborador/a' };
const cap = s => (s||'').normalize('NFD').replace(/[̀-ͯ]/g,'');

function generarPDF(datos, tipo, generadoPor) {
  const { tareas=[], equipo=[], horasExtra=[] } = datos;
  const ahora   = new Date();
  const hora    = ahora.toLocaleTimeString('es-PA',{hour:'2-digit',minute:'2-digit'});
  const dLarga  = cap(ahora.toLocaleDateString('es-PA',{weekday:'long',year:'numeric',month:'long',day:'numeric'}));
  const tipoLbl = {diario:'Diario',semanal:'Semanal',mensual:'Mensual'}[tipo]||'Diario';

  let periodoSub = dLarga;
  if (tipo==='semanal') {
    const lun=new Date(ahora); lun.setDate(ahora.getDate()-((ahora.getDay()+6)%7));
    const dom=new Date(lun); dom.setDate(lun.getDate()+6);
    const fmt=d=>cap(d.toLocaleDateString('es-PA',{day:'numeric',month:'long'}));
    periodoSub=`Semana del ${fmt(lun)} al ${fmt(dom)} de ${ahora.getFullYear()}`;
  } else if (tipo==='mensual') {
    periodoSub = cap(ahora.toLocaleDateString('es-PA',{month:'long',year:'numeric'}));
  }

  const eg = t => {
    if (!t.secciones) return 'Pendiente';
    const v = Object.values(t.secciones);
    if (v.every(s=>s.estado==='Completada')) return 'Completada';
    if (v.some(s=>s.estado==='En Progreso'||s.estado==='Completada')) return 'En Progreso';
    return 'Pendiente';
  };

  const total = tareas.length;
  const comp  = tareas.filter(t=>eg(t)==='Completada').length;
  const prog  = tareas.filter(t=>eg(t)==='En Progreso').length;
  const pct   = total ? Math.round(comp/total*100) : 0;
  const hoyS  = ahora.toISOString().split('T')[0];
  const venc  = tareas.filter(t=>t.fecha&&t.fecha<hoyS&&eg(t)!=='Completada');
  const hapr  = horasExtra.filter(h=>h.aprobacion==='Aprobado');
  const thrs  = hapr.reduce((s,h)=>s+parseFloat(h.horas||0),0);
  const semCol = pct>=80?VE : pct>=50?AM : RO;
  const semTxt = pct>=80?'VERDE — Rendimiento excelente'
               : pct>=50?'AMARILLO — Rendimiento moderado'
               :'ROJO — Requiere atencion inmediata';

  const W=595.28, H=841.89;
  const ML=52, MR=52, CW=W-ML-MR;
  const FOOTER_Y = H-44;

  const doc = new PDFDocument({size:'A4',margin:0,bufferPages:true,info:{
    Title:`Reporte ${tipoLbl} — CACCO`, Author:generadoPor||'CACCO'
  }});
  doc.registerFont('R', FONT_REG);
  doc.registerFont('B', FONT_BOLD);
  doc.registerFont('I', FONT_ITAL);

  let y = 0;
  const chk = (n=20) => { if (y+n > FOOTER_Y) { doc.addPage(); y = 90; } };

  // Helpers
  const ln = (str, font, size, color, opts={}) => {
    chk(size*1.6+4);
    doc.font(font).fontSize(size).fillColor(color);
    doc.text(str, ML, y, {width:CW, lineBreak:true, ...opts});
    y = doc.y;
  };

  const gap = (n=8) => { y += n; };

  const divider = (col=G2) => {
    chk(10);
    gap(4);
    doc.moveTo(ML,y).lineTo(W-MR,y).lineWidth(0.5).strokeColor(col).stroke();
    gap(8);
  };

  const secTitle = (label) => {
    chk(28);
    gap(6);
    divider(OR);
    doc.font('B').fontSize(8).fillColor(OR).fillOpacity(1);
    doc.text(label.toUpperCase(), ML, y, {characterSpacing:1.5, width:CW});
    y = doc.y + 6;
  };

  // Barra de progreso textual (bloques)
  const pbarText = (pct) => {
    const total = 10;
    const filled = Math.round(pct/100*total);
    const bar = '█'.repeat(filled) + '░'.repeat(total-filled);
    return bar;
  };

  // ════════════════════════════════════════════════════════════════════════════
  //  CABECERA (dibujada en todas las páginas al final con bufferPages)
  // ════════════════════════════════════════════════════════════════════════════
  const drawHeader = (pg) => {
    doc.switchToPage(pg);
    doc.rect(0,0,W,2).fill(OR);

    const logoOk = fs.existsSync(LOGO_PATH);
    const iconOk = fs.existsSync(ICON_PATH);
    if (logoOk) {
      doc.image(LOGO_PATH, ML, 14, {height:28, fit:[150,28]});
    } else if (iconOk) {
      doc.image(ICON_PATH, ML, 10, {width:36,height:36});
      doc.font('B').fontSize(15).fillColor(OR).text('CACCO', ML+44, 18, {lineBreak:false});
    } else {
      doc.font('B').fontSize(16).fillColor(OR).text('CACCO', ML, 16, {lineBreak:false, characterSpacing:2});
    }
    doc.font('R').fontSize(7).fillColor(G2).text('Centro de Arte y Cultura de Colon', ML, 48, {lineBreak:false});

    doc.font('B').fontSize(9).fillColor(OR)
       .text(`REPORTE ${tipoLbl.toUpperCase()} DE COMUNICACIONES`, W-MR, 18,
             {align:'right', width:W-MR-ML, lineBreak:false});
    doc.font('R').fontSize(7.5).fillColor(G1)
       .text(periodoSub, W-MR, 32, {align:'right', width:W-MR-ML, lineBreak:false});
    doc.font('R').fontSize(7).fillColor(G2)
       .text(`Generado: ${hora}  |  Por: ${generadoPor||'—'}`, W-MR, 46,
             {align:'right', width:W-MR-ML, lineBreak:false});

    doc.moveTo(ML,65).lineTo(W-MR,65).lineWidth(1).strokeColor(OR).stroke();
  };

  const drawFooter = (pg, tot) => {
    doc.switchToPage(pg);
    doc.moveTo(ML,FOOTER_Y).lineTo(W-MR,FOOTER_Y).lineWidth(0.5).strokeColor(OR).stroke();
    doc.font('R').fontSize(7).fillColor(G2)
       .text('CACCO — Centro de Arte y Cultura de Colon  |  Uso interno — Equipo de Comunicaciones',
             ML, FOOTER_Y+8, {width:CW-50, lineBreak:false});
    doc.font('B').fontSize(7).fillColor(OR)
       .text(`${pg+1} / ${tot}`, W-MR-40, FOOTER_Y+8, {width:40, align:'right', lineBreak:false});
  };

  // ════════════════════════════════════════════════════════════════════════════
  //  CONTENIDO
  // ════════════════════════════════════════════════════════════════════════════
  y = 80;

  // ─── ESTADO GENERAL ────────────────────────────────────────────────────────
  gap(6);
  // Círculo de color estado
  doc.circle(ML+7, y+7, 6).fill(semCol);
  doc.font('B').fontSize(10).fillColor(semCol);
  doc.text(`ESTADO GENERAL: ${semTxt}`, ML+18, y+2, {width:CW-18, lineBreak:false});
  y += 16;
  const statsLine = `${total} tarea${total!==1?'s':''} en curso  ·  ${comp} completada${comp!==1?'s':''} (${pct}%)  ·  ${venc.length} vencida${venc.length!==1?'s':''}`;
  doc.font('R').fontSize(9).fillColor(G1);
  doc.text(statsLine, ML+18, y, {width:CW-18, lineBreak:false});
  y += 14;

  // ─── AVANCE POR PERSONA ─────────────────────────────────────────────────────
  const miembros = equipo.filter(u=>u.nivel!=='lector');
  const conTareas = miembros.filter(u =>
    tareas.some(t=>t.secciones&&Object.values(t.secciones)
      .some(sv=>(sv.responsables||[]).includes(u.id))));

  if (conTareas.length) {
    secTitle('Avance por Persona');

    conTareas.forEach(u => {
      const lins = [];
      tareas.forEach(t => {
        if (!t.secciones) return;
        Object.entries(t.secciones).forEach(([sec,sv]) => {
          if (!(sv.responsables||[]).includes(u.id)) return;
          lins.push({ sec, titulo: cap(t.titulo), est: sv.estado||'Pendiente' });
        });
      });
      if (!lins.length) return;

      const cc = lins.filter(l=>l.est==='Completada').length;
      const det = [cap(u.seccion||''), NIVEL_NOM[u.nivel]||u.nivel].filter(Boolean).join('  |  ');

      chk(14 + lins.length*14);
      gap(4);

      // Nombre + sección
      doc.font('B').fontSize(10).fillColor(BK);
      doc.text(cap(u.nombre), ML, y, {lineBreak:false, width:280});
      if (det) {
        doc.font('R').fontSize(9).fillColor(G2);
        doc.text(`  |  ${det}`, ML+doc.widthOfString(cap(u.nombre)), y, {lineBreak:false});
      }
      // Completadas a la derecha
      doc.font('B').fontSize(9).fillColor(cc===lins.length?VE:cc>0?AZ:G2);
      doc.text(`${cc}/${lins.length} completadas`, W-MR, y, {width:W-MR-ML, align:'right', lineBreak:false});
      y += 14;

      lins.forEach(l => {
        chk(14);
        const eCol = l.est==='Completada'?VE : l.est==='En Progreso'?AZ : G2;
        const eMrk = l.est==='Completada'?'[OK]' : l.est==='En Progreso'?'[ > ]' : '[   ]';
        doc.font('B').fontSize(8.5).fillColor(eCol);
        doc.text(eMrk, ML+10, y, {lineBreak:false, width:36});
        doc.font('R').fontSize(8.5).fillColor(G1);
        doc.text(`${cap(l.titulo)}`, ML+50, y, {lineBreak:false, width:CW-160});
        doc.font('R').fontSize(8.5).fillColor(G2);
        doc.text('  →', ML+50+doc.widthOfString(cap(l.titulo)), y, {lineBreak:false});
        doc.font('B').fontSize(8.5).fillColor(eCol);
        doc.text(l.est, W-MR, y, {width:W-MR-ML, align:'right', lineBreak:false});
        y += 14;
      });
      gap(4);
    });
  }

  // ─── AVANCE POR SECCIÓN ──────────────────────────────────────────────────────
  secTitle('Avance por Seccion');

  ['Audiovisual','Protocolo','Diseño','Redes Sociales','Medios'].forEach(sec => {
    const tc = tareas.filter(t=>t.secciones?.[sec]);
    if (!tc.length) return;
    const cc = tc.filter(t=>t.secciones[sec].estado==='Completada').length;
    const pp = tc.length ? Math.round(cc/tc.length*100) : 0;
    const pCol = pp>=80?VE : pp>=50?AM : RO;

    chk(16);
    // Nombre de sección
    doc.font('B').fontSize(9.5).fillColor(BK);
    doc.text(cap(sec), ML, y, {lineBreak:false, width:110});
    // Barra
    const barW = 80, filled = Math.round(pp/100*barW);
    doc.rect(ML+118, y+2, barW, 8).fill([228,228,228]);
    if (filled>0) doc.rect(ML+118, y+2, filled, 8).fill(pCol);
    // Texto
    doc.font('B').fontSize(9).fillColor(pCol);
    doc.text(`${cc}/${tc.length}  (${pp}%)`, ML+206, y+1, {lineBreak:false, width:80});
    y += 14;

    // Detalle Redes Sociales
    if (sec==='Redes Sociales') {
      const partes = [];
      const rk=[['instagram','publicaciones','IG pub'],['instagram','reels','reels'],
                ['instagram','historias','hist'],['facebook','publicaciones','FB pub'],
                ['tiktok','videos','TT videos']];
      rk.forEach(([r,c,lbl]) => {
        let tot=0,done=0;
        tc.forEach(t=>{ if(!t.redesSociales)return;
          tot+=t.redesSociales[r]?.[c]||0; done+=t.redesSociales[r]?.[c+'_comp']||0; });
        if (tot) partes.push(`${lbl}: ${done}/${tot}`);
      });
      if (partes.length) {
        chk(12);
        doc.font('I').fontSize(8).fillColor(G2);
        doc.text('   ' + partes.join('  ·  '), ML, y, {width:CW, lineBreak:true});
        y = doc.y + 2;
      }
    }

    // Detalle Medios
    if (sec==='Medios') {
      const partes = [];
      const mk=[['radio','notas','Radio'],['radio','entrevistas','E.Radio'],
                ['tv','notas','TV'],['tv','entrevistas','E.TV'],
                ['prensa','comunicados','Prensa'],['redaccion','articulos','Art']];
      mk.forEach(([m,c,lbl]) => {
        let tot=0,done=0;
        tc.forEach(t=>{ if(!t.mediosData)return;
          tot+=t.mediosData[m]?.[c]||0; done+=t.mediosData[m]?.[c+'_comp']||0; });
        if (tot) partes.push(`${lbl}: ${done}/${tot}`);
      });
      if (partes.length) {
        chk(12);
        doc.font('I').fontSize(8).fillColor(G2);
        doc.text('   ' + partes.join('  ·  '), ML, y, {width:CW, lineBreak:true});
        y = doc.y + 2;
      }
    }

    gap(2);
  });

  // ─── PENDIENTES Y VENCIDAS ────────────────────────────────────────────────────
  if (venc.length) {
    secTitle('Pendientes y Vencidas');
    venc.forEach(t => {
      chk(14);
      const resp = equipo.filter(u=>Object.values(t.secciones||{})
        .some(sv=>(sv.responsables||[]).includes(u.id)))
        .map(u=>cap(u.nombre).split(' ')[0]).join(', ');
      const fechaStr = t.fecha ? `vencio el ${t.fecha}` : '';
      const detalle  = [fechaStr, resp].filter(Boolean).join('  ·  ');
      doc.font('R').fontSize(9).fillColor(RO);
      doc.text(`•  "${cap(t.titulo)}"${detalle?' — '+detalle:''}`, ML+6, y, {width:CW-6, lineBreak:true});
      y = doc.y + 2;
    });
    gap(2);
  }

  // ─── HORAS EXTRAS ─────────────────────────────────────────────────────────────
  if (hapr.length) {
    secTitle('Horas Extras');
    const resumen = {};
    hapr.forEach(h => { resumen[h.miembro]=(resumen[h.miembro]||0)+parseFloat(h.horas||0); });
    Object.entries(resumen).forEach(([nom,hrs]) => {
      chk(14);
      doc.font('R').fontSize(9).fillColor(BK);
      doc.text(`   ${cap(nom)}:`, ML, y, {lineBreak:false, width:230});
      doc.font('B').fontSize(9).fillColor(AZ);
      doc.text(`${hrs.toFixed(1)} hrs`, ML+230, y, {lineBreak:false, width:100});
      y += 14;
    });
    gap(4);
    chk(16);
    doc.moveTo(ML+10, y).lineTo(ML+340, y).lineWidth(0.4).strokeColor(G2).stroke();
    y += 5;
    doc.font('B').fontSize(9.5).fillColor(OR);
    doc.text('   TOTAL:', ML, y, {lineBreak:false, width:230});
    doc.font('B').fontSize(9.5).fillColor(OR);
    doc.text(`${thrs.toFixed(1)} hrs aprobadas`, ML+230, y, {lineBreak:false, width:160});
    y += 16;
  }

  // ─── FIRMA ────────────────────────────────────────────────────────────────────
  chk(50);
  gap(16);
  doc.moveTo(ML, y).lineTo(ML+130, y).lineWidth(0.5).strokeColor(G2).stroke();
  doc.font('R').fontSize(7.5).fillColor(G2).text('Firma del Coordinador/a', ML, y+4, {lineBreak:false});
  doc.moveTo(W-MR-120, y).lineTo(W-MR, y).lineWidth(0.5).strokeColor(G2).stroke();
  doc.font('R').fontSize(7.5).fillColor(G2).text('Fecha', W-MR-60, y+4, {lineBreak:false});

  // ════════════════════════════════════════════════════════════════════════════
  //  CABECERA Y PIE EN TODAS LAS PÁGINAS
  // ════════════════════════════════════════════════════════════════════════════
  const totalPages = doc.bufferedPageRange().count;
  for (let i=0; i<totalPages; i++) {
    drawHeader(i);
    drawFooter(i, totalPages);
  }

  doc.end();
  return doc;
}

app.post("/api/reporte-pdf", verificarToken, (req,res)=>{
  const {tipo='diario',generadoPor}=req.body;
  const datos=leerJSON(DATA_FILE,{});
  const label={diario:'Diario',semanal:'Semanal',mensual:'Mensual'}[tipo]||'Diario';
  const fecha=new Date().toISOString().split('T')[0];
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition',`attachment; filename="CACCO_Reporte_${label}_${fecha}.pdf"`);
  try { generarPDF(datos,tipo,generadoPor).pipe(res); }
  catch(e){ console.error('PDF error:',e); res.status(500).json({error:'Error: '+e.message}); }
});

// ════════════════════════
//  INICIAR SERVIDOR
// ════════════════════════
async function iniciar() {
  if (MONGO_URI) {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Conectado a MongoDB Atlas");
  } else {
    console.log("⚠️  Sin MONGODB_URI — usando archivos locales");
  }
  app.listen(PORT, () => console.log(`✅ Servidor CACCO corriendo en http://localhost:${PORT}`));
}
iniciar().catch(e => { console.error("Error al iniciar:", e); process.exit(1); });
