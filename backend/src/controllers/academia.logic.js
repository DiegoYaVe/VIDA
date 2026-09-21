// src/controllers/academia.logic.js
// Lógica PURA del LMS de Academia (sin BD): visibilidad/targeting, "fuera de
// tiempo", % de progreso y calificación de quiz. Importable por el controller
// y por los tests (backend/tests/academia.test.js) sin abrir conexión.

// ── Visibilidad / targeting ─────────────────────────────────────────────────
// Decide si `user` puede ver un curso según su Visibilidad y las asignaciones.
//   Visibilidad: 'TODOS'    → todos lo ven
//                'ROLES'    → solo roles asignados
//                'USUARIOS' → solo usuarios asignados
//                'MIXTO'    → roles asignados O usuarios asignados
// `rolesAsignados` = array de strings (TipoUsuario); `usuariosAsignados` = array
// de ids (number|string). `user` = { TipoUsuario, idUsuario }.
// Parsea una fecha a Date LOCAL. Una cadena 'YYYY-MM-DD' se interpreta en la
// zona local (no UTC), para que "días restantes" y "fuera de tiempo" no se
// corran un día en zonas con offset negativo (ej. Venezuela UTC-4).
export function parseFechaLocal(v) {
  if (v == null) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = String(v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function puedeVerCurso(curso, rolesAsignados, usuariosAsignados, user) {
  const vis = (curso?.Visibilidad || 'TODOS').toUpperCase();
  const roles = (rolesAsignados || []).map(r => String(r).toUpperCase());
  const usuarios = (usuariosAsignados || []).map(u => String(u));
  const enRoles = roles.includes(String(user?.TipoUsuario || '').toUpperCase());
  const enUsuarios = usuarios.includes(String(user?.idUsuario));

  switch (vis) {
    case 'ROLES':    return enRoles;
    case 'USUARIOS': return enUsuarios;
    case 'MIXTO':    return enRoles || enUsuarios;
    case 'TODOS':
    default:         return true;
  }
}

// ── Fuera de tiempo ─────────────────────────────────────────────────────────
// Un curso obligatorio está "fuera de tiempo" si tiene fecha límite, esa fecha
// ya pasó y el usuario NO lo ha completado. Cursos no obligatorios o sin fecha
// límite nunca están fuera de tiempo. `ahora` inyectable para tests.
export function estaFueraDeTiempo({ Obligatorio, FechaLimite, Completado }, ahora = new Date()) {
  if (!Obligatorio) return false;
  if (Completado) return false;
  if (!FechaLimite) return false;
  const limite = parseFechaLocal(FechaLimite);
  if (!limite) return false;
  // El día límite cuenta completo: vencido a partir del día siguiente.
  const finDelDia = new Date(limite.getFullYear(), limite.getMonth(), limite.getDate(), 23, 59, 59, 999);
  return ahora.getTime() > finDelDia.getTime();
}

// Días restantes hasta la fecha límite (negativo si ya venció). null si no aplica.
export function diasRestantes(FechaLimite, ahora = new Date()) {
  if (!FechaLimite) return null;
  const limite = parseFechaLocal(FechaLimite);
  if (!limite) return null;
  const MS_DIA = 86400000;
  const a = Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const b = Date.UTC(limite.getFullYear(), limite.getMonth(), limite.getDate());
  return Math.round((b - a) / MS_DIA);
}

// ── Progreso ────────────────────────────────────────────────────────────────
// % entero 0..100. Sin lecciones → 0. Clamp a [0,100].
export function porcentajeProgreso(totalLecciones, completadas) {
  const t = Number(totalLecciones) || 0;
  if (t <= 0) return 0;
  const c = Math.max(0, Math.min(Number(completadas) || 0, t));
  return Math.round((c / t) * 100);
}

// Un curso está completo cuando tiene al menos una lección y todas están hechas.
export function cursoCompleto(totalLecciones, completadas) {
  const t = Number(totalLecciones) || 0;
  return t > 0 && (Number(completadas) || 0) >= t;
}

// ── Quiz ────────────────────────────────────────────────────────────────────
// Normaliza texto para comparar respuestas cortas: sin acentos, minúsculas,
// sin espacios de más.
export function normalizarTexto(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toLowerCase().replace(/\s+/g, ' ');
}

// ¿La respuesta `a` a la pregunta `p` (de tipo `tipo`) es correcta?
//   correctasIds    = ids de opciones correctas
//   correctasTextos = textos aceptados (respuesta corta)
// Compat: si `p.opcionCorrecta` existe (formato viejo), es OPCION_UNICA.
function respuestaCorrecta(p, a) {
  const tipo = p.tipo || (p.opcionCorrecta != null ? 'OPCION_UNICA' : 'OPCION_UNICA');
  const correctasIds = (p.correctasIds || (p.opcionCorrecta != null ? [p.opcionCorrecta] : [])).map(String);
  const correctasTextos = p.correctasTextos || [];
  switch (tipo) {
    case 'RESPUESTA_CORTA':
      return typeof a === 'string' && a.trim() !== '' && correctasTextos.some(t => normalizarTexto(t) === normalizarTexto(a));
    case 'OPCION_MULTIPLE': {
      if (!Array.isArray(a)) return false;
      const elegidas = [...new Set(a.map(String))];
      if (elegidas.length !== correctasIds.length) return false;
      return elegidas.every(id => correctasIds.includes(id));
    }
    case 'OPCION_UNICA':
    case 'VERDADERO_FALSO':
    default:
      return a != null && !Array.isArray(a) && correctasIds.includes(String(a));
  }
}

// Califica un intento. `preguntas` = [{ idPregunta, tipo, correctasIds[],
// correctasTextos[] }] (o el formato viejo { idPregunta, opcionCorrecta }).
// `respuestas` = { [idPregunta]: idOpcion | [ids] | texto }. Devuelve
// { total, correctas, puntaje (0..100), aprobado }. `minAprob` = % para aprobar.
export function calificarQuiz(preguntas, respuestas, minAprob = 70) {
  const lista = Array.isArray(preguntas) ? preguntas : [];
  const total = lista.length;
  if (total === 0) return { total: 0, correctas: 0, puntaje: 0, aprobado: false };
  const resp = respuestas || {};
  let correctas = 0;
  for (const p of lista) {
    const a = resp[p.idPregunta] ?? resp[String(p.idPregunta)];
    if (respuestaCorrecta(p, a)) correctas++;
  }
  const puntaje = Math.round((correctas / total) * 100);
  return { total, correctas, puntaje, aprobado: puntaje >= (Number(minAprob) || 0) };
}

// ── Folio de constancia ─────────────────────────────────────────────────────
// Folio legible y determinista-ish para diplomas. Formato: VIDA-<curso>-<user>-<rand>
export function generarFolio(idCurso, idUsuario, rand = null) {
  const r = rand || Math.random().toString(36).slice(2, 8).toUpperCase();
  return `VIDA-A${idCurso}U${idUsuario}-${r}`;
}
