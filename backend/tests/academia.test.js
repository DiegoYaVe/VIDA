// Tests de la lógica pura del LMS de Academia (sin BD): visibilidad/targeting,
// "fuera de tiempo", % de progreso, calificación de quiz y folio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  puedeVerCurso, estaFueraDeTiempo, diasRestantes,
  porcentajeProgreso, cursoCompleto, calificarQuiz, generarFolio, normalizarTexto,
} from '../src/controllers/academia.logic.js';

const user = (o = {}) => ({ TipoUsuario: 'ADMIN', idUsuario: 7, ...o });

// ── puedeVerCurso ───────────────────────────────────────────────────────────
test('TODOS → cualquiera lo ve', () => {
  assert.equal(puedeVerCurso({ Visibilidad: 'TODOS' }, [], [], user()), true);
});
test('TODOS es el default cuando no hay Visibilidad', () => {
  assert.equal(puedeVerCurso({}, [], [], user()), true);
});
test('ROLES → solo si el rol está asignado', () => {
  assert.equal(puedeVerCurso({ Visibilidad: 'ROLES' }, ['ADMIN'], [], user({ TipoUsuario: 'ADMIN' })), true);
  assert.equal(puedeVerCurso({ Visibilidad: 'ROLES' }, ['CAJERO'], [], user({ TipoUsuario: 'ADMIN' })), false);
});
test('USUARIOS → solo si el usuario está asignado', () => {
  assert.equal(puedeVerCurso({ Visibilidad: 'USUARIOS' }, [], [7, 8], user({ idUsuario: 7 })), true);
  assert.equal(puedeVerCurso({ Visibilidad: 'USUARIOS' }, [], [8, 9], user({ idUsuario: 7 })), false);
});
test('USUARIOS compara ids como string y number indistintamente', () => {
  assert.equal(puedeVerCurso({ Visibilidad: 'USUARIOS' }, [], ['7'], user({ idUsuario: 7 })), true);
});
test('MIXTO → por rol O por usuario', () => {
  assert.equal(puedeVerCurso({ Visibilidad: 'MIXTO' }, ['SUPERVISOR'], [99], user({ TipoUsuario: 'ADMIN', idUsuario: 99 })), true);
  assert.equal(puedeVerCurso({ Visibilidad: 'MIXTO' }, ['SUPERVISOR'], [1, 2], user({ TipoUsuario: 'ADMIN', idUsuario: 99 })), false);
});

// ── estaFueraDeTiempo ───────────────────────────────────────────────────────
const HOY = new Date('2026-09-21T12:00:00');
test('no obligatorio → nunca fuera de tiempo', () => {
  assert.equal(estaFueraDeTiempo({ Obligatorio: false, FechaLimite: '2020-01-01', Completado: false }, HOY), false);
});
test('obligatorio completado → no fuera de tiempo', () => {
  assert.equal(estaFueraDeTiempo({ Obligatorio: true, FechaLimite: '2020-01-01', Completado: true }, HOY), false);
});
test('obligatorio sin fecha límite → no fuera de tiempo', () => {
  assert.equal(estaFueraDeTiempo({ Obligatorio: true, FechaLimite: null, Completado: false }, HOY), false);
});
test('obligatorio vencido sin completar → fuera de tiempo', () => {
  assert.equal(estaFueraDeTiempo({ Obligatorio: true, FechaLimite: '2026-09-20', Completado: false }, HOY), true);
});
test('el día límite cuenta completo (no vence ese mismo día)', () => {
  assert.equal(estaFueraDeTiempo({ Obligatorio: true, FechaLimite: '2026-09-21', Completado: false }, HOY), false);
});
test('fecha futura → aún en tiempo', () => {
  assert.equal(estaFueraDeTiempo({ Obligatorio: true, FechaLimite: '2026-12-31', Completado: false }, HOY), false);
});

// ── diasRestantes ───────────────────────────────────────────────────────────
test('diasRestantes futuro positivo', () => {
  assert.equal(diasRestantes('2026-09-25', HOY), 4);
});
test('diasRestantes pasado negativo', () => {
  assert.equal(diasRestantes('2026-09-19', HOY), -2);
});
test('diasRestantes null si no hay fecha', () => {
  assert.equal(diasRestantes(null, HOY), null);
});

// ── porcentajeProgreso / cursoCompleto ──────────────────────────────────────
test('progreso 0 lecciones → 0%', () => assert.equal(porcentajeProgreso(0, 0), 0));
test('progreso 3 de 4 → 75%', () => assert.equal(porcentajeProgreso(4, 3), 75));
test('progreso clamp a 100 si completadas excede total', () => assert.equal(porcentajeProgreso(4, 10), 100));
test('cursoCompleto requiere al menos una lección', () => {
  assert.equal(cursoCompleto(0, 0), false);
  assert.equal(cursoCompleto(3, 3), true);
  assert.equal(cursoCompleto(3, 2), false);
});

// ── calificarQuiz ───────────────────────────────────────────────────────────
const preguntas = [
  { idPregunta: 1, opcionCorrecta: 10 },
  { idPregunta: 2, opcionCorrecta: 20 },
  { idPregunta: 3, opcionCorrecta: 30 },
];
test('quiz sin preguntas → reprobado 0', () => {
  const r = calificarQuiz([], {}, 70);
  assert.deepEqual(r, { total: 0, correctas: 0, puntaje: 0, aprobado: false });
});
test('quiz todo correcto → 100 aprobado', () => {
  const r = calificarQuiz(preguntas, { 1: 10, 2: 20, 3: 30 }, 70);
  assert.equal(r.puntaje, 100); assert.equal(r.aprobado, true);
});
test('quiz 2 de 3 (67%) reprueba con umbral 70', () => {
  const r = calificarQuiz(preguntas, { 1: 10, 2: 20, 3: 99 }, 70);
  assert.equal(r.correctas, 2); assert.equal(r.puntaje, 67); assert.equal(r.aprobado, false);
});
test('quiz acepta llaves string en respuestas', () => {
  const r = calificarQuiz(preguntas, { '1': '10', '2': '20', '3': '30' }, 70);
  assert.equal(r.aprobado, true);
});
test('quiz umbral 60 aprueba con 67%', () => {
  const r = calificarQuiz(preguntas, { 1: 10, 2: 20, 3: 99 }, 60);
  assert.equal(r.aprobado, true);
});

// ── calificarQuiz: tipos de pregunta ────────────────────────────────────────
test('OPCION_UNICA correcta e incorrecta', () => {
  const preg = [{ idPregunta: 1, tipo: 'OPCION_UNICA', correctasIds: [10] }];
  assert.equal(calificarQuiz(preg, { 1: 10 }, 100).aprobado, true);
  assert.equal(calificarQuiz(preg, { 1: 11 }, 100).aprobado, false);
});
test('VERDADERO_FALSO se comporta como opción única', () => {
  const preg = [{ idPregunta: 1, tipo: 'VERDADERO_FALSO', correctasIds: [99] }];
  assert.equal(calificarQuiz(preg, { 1: 99 }, 100).puntaje, 100);
  assert.equal(calificarQuiz(preg, { 1: 98 }, 100).puntaje, 0);
});
test('OPCION_MULTIPLE exige el conjunto exacto', () => {
  const preg = [{ idPregunta: 1, tipo: 'OPCION_MULTIPLE', correctasIds: [1, 2] }];
  assert.equal(calificarQuiz(preg, { 1: [1, 2] }, 100).aprobado, true);
  assert.equal(calificarQuiz(preg, { 1: [2, 1] }, 100).aprobado, true); // orden no importa
  assert.equal(calificarQuiz(preg, { 1: [1] }, 100).aprobado, false);    // falta una
  assert.equal(calificarQuiz(preg, { 1: [1, 2, 3] }, 100).aprobado, false); // sobra una
  assert.equal(calificarQuiz(preg, { 1: 1 }, 100).aprobado, false);      // no es array
});
test('RESPUESTA_CORTA compara normalizado (acentos/mayúsculas/espacios)', () => {
  const preg = [{ idPregunta: 1, tipo: 'RESPUESTA_CORTA', correctasTextos: ['París', 'paris'] }];
  assert.equal(calificarQuiz(preg, { 1: '  PARIS ' }, 100).aprobado, true);
  assert.equal(calificarQuiz(preg, { 1: 'parís' }, 100).aprobado, true);
  assert.equal(calificarQuiz(preg, { 1: 'londres' }, 100).aprobado, false);
  assert.equal(calificarQuiz(preg, { 1: '' }, 100).aprobado, false);
});
test('quiz mixto puntúa parcial', () => {
  const preg = [
    { idPregunta: 1, tipo: 'OPCION_UNICA', correctasIds: [10] },
    { idPregunta: 2, tipo: 'OPCION_MULTIPLE', correctasIds: [1, 2] },
    { idPregunta: 3, tipo: 'RESPUESTA_CORTA', correctasTextos: ['si'] },
  ];
  const r = calificarQuiz(preg, { 1: 10, 2: [1], 3: 'Sí' }, 60);
  assert.equal(r.correctas, 2); // p1 ok, p2 mal, p3 ok (normaliza sí→si)
  assert.equal(r.puntaje, 67);
  assert.equal(r.aprobado, true);
});
test('formato viejo {opcionCorrecta} sigue funcionando', () => {
  const preg = [{ idPregunta: 1, opcionCorrecta: 5 }];
  assert.equal(calificarQuiz(preg, { 1: 5 }, 100).aprobado, true);
});
test('normalizarTexto quita acentos y colapsa espacios', () => {
  assert.equal(normalizarTexto('  Él  CORRIÓ '), 'el corrio');
});

// ── generarFolio ────────────────────────────────────────────────────────────
test('folio contiene curso y usuario', () => {
  const f = generarFolio(6, 7, 'ABC123');
  assert.equal(f, 'VIDA-A6U7-ABC123');
});
