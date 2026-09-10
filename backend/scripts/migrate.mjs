// backend/scripts/migrate.mjs
// Migrador de esquema para VIDA/VenezPOS (SQL Server).
//
// Resuelve la deuda técnica #4 del HANDOFF: hasta ahora no había registro de
// qué migración se aplicó a qué base, de ahí que no se supiera el estado de
// producción (y el incidente MySQL-vs-SQL-Server). Este runner lleva una tabla
// de control VIDA_SCHEMA_MIGRATIONS y aplica SOLO las migraciones pendientes,
// en orden, respetando los separadores `GO`.
//
// Uso (desde backend/):
//   node scripts/migrate.mjs status              → qué se aplicó y qué falta
//   node scripts/migrate.mjs up                  → aplica las pendientes
//   node scripts/migrate.mjs up --dry-run        → muestra qué correría, sin tocar la BD
//   node scripts/migrate.mjs baseline            → marca TODAS las actuales como aplicadas
//   node scripts/migrate.mjs baseline --to=29    → marca 01..29 como aplicadas (sin ejecutar)
//
// `baseline` es para ADOPTAR el migrador en una base que YA tiene migraciones
// aplicadas (QA / producción): las registra como "aplicadas" sin ejecutarlas.
// Verifica antes que esas migraciones realmente estén en esa base.
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import dotenv from 'dotenv';
import sql from 'mssql';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_DIR = resolve(__dirname, '../../sql');
dotenv.config({ path: resolve(__dirname, '../.env') });

const TABLE = 'VIDA_SCHEMA_MIGRATIONS';

const dbCfg = {
  server:   process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port:     parseInt(process.env.DB_PORT) || 1433,
  options:  { encrypt: true, trustServerCertificate: true, enableArithAbort: true },
  connectionTimeout: 60000,
  requestTimeout: 300000,
};

// ── Utilidades ────────────────────────────────────────────────────────────
const numPrefix = (name) => {
  const m = name.match(/^(\d+)/);
  return m ? parseInt(m[1]) : Number.MAX_SAFE_INTEGER;
};

function listarArchivos() {
  return readdirSync(SQL_DIR)
    .filter((f) => /^\d+.*\.sql$/i.test(f))
    .sort((a, b) => numPrefix(a) - numPrefix(b) || a.localeCompare(b));
}

const checksum = (contenido) =>
  createHash('sha256').update(contenido.replace(/\r\n/g, '\n'), 'utf8').digest('hex');

// Divide un script en batches por `GO` en su propia línea (como SSMS).
const partirBatches = (raw) =>
  raw.split(/^\s*GO\s*$/im).map((s) => s.trim()).filter(Boolean);

async function ensureTable(pool) {
  await pool.request().batch(`
    IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name='${TABLE}' AND type='U')
    CREATE TABLE ${TABLE} (
      Filename    VARCHAR(200) NOT NULL,
      Version     INT          NULL,
      Checksum    VARCHAR(64)  NULL,
      Baseline    BIT          NOT NULL DEFAULT 0,
      DurationMs  INT          NULL,
      AppliedAt   DATETIME     NOT NULL DEFAULT GETDATE(),
      AppliedBy   VARCHAR(60)  NULL,
      CONSTRAINT PK_${TABLE} PRIMARY KEY (Filename)
    );`);
}

async function getAplicadas(pool) {
  const r = await pool.request().query(`SELECT Filename, Checksum, Baseline, AppliedAt FROM ${TABLE}`);
  const map = new Map();
  for (const row of r.recordset) map.set(row.Filename, row);
  return map;
}

async function registrar(pool, { filename, version, sum, baseline, durationMs }) {
  await pool.request()
    .input('Filename', sql.VarChar(200), filename)
    .input('Version',  sql.Int, version)
    .input('Checksum', sql.VarChar(64), sum)
    .input('Baseline', sql.Bit, baseline ? 1 : 0)
    .input('DurationMs', sql.Int, durationMs ?? null)
    .input('AppliedBy', sql.VarChar(60), process.env.USERNAME || process.env.USER || 'migrate')
    .query(`INSERT INTO ${TABLE} (Filename, Version, Checksum, Baseline, DurationMs, AppliedBy)
            VALUES (@Filename, @Version, @Checksum, @Baseline, @DurationMs, @AppliedBy)`);
}

// ── Comandos ────────────────────────────────────────────────────────────────
async function cmdStatus(pool) {
  await ensureTable(pool);
  const aplicadas = await getAplicadas(pool);
  const archivos = listarArchivos();
  let pendientes = 0, drift = 0;

  console.log(`\n  Migraciones en ${SQL_DIR}\n`);
  for (const f of archivos) {
    const sum = checksum(readFileSync(join(SQL_DIR, f), 'utf8'));
    const row = aplicadas.get(f);
    if (!row) {
      pendientes++;
      console.log(`   ⏳ PENDIENTE   ${f}`);
    } else if (row.Baseline) {
      console.log(`   📌 baseline    ${f}`);
    } else if (row.Checksum && row.Checksum !== sum) {
      drift++;
      console.log(`   ⚠️  CAMBIADA    ${f}  (el archivo cambió después de aplicarse)`);
    } else {
      console.log(`   ✅ aplicada    ${f}`);
    }
  }
  // Migraciones registradas que ya no están en disco
  for (const f of aplicadas.keys())
    if (!archivos.includes(f)) console.log(`   ❓ huérfana    ${f}  (registrada pero el archivo no existe)`);

  console.log(`\n  ${archivos.length} archivo(s) · ${pendientes} pendiente(s)${drift ? ` · ${drift} con checksum distinto` : ''}\n`);
  return pendientes;
}

async function cmdUp(pool, { dryRun }) {
  await ensureTable(pool);
  const aplicadas = await getAplicadas(pool);
  const archivos = listarArchivos().filter((f) => !aplicadas.has(f));

  if (archivos.length === 0) { console.log('\n  ✅ Todo al día — no hay migraciones pendientes.\n'); return; }
  console.log(`\n  ${archivos.length} migración(es) pendiente(s)${dryRun ? ' (DRY-RUN, no se ejecuta nada)' : ''}:\n`);

  if (dryRun) { for (const f of archivos) console.log(`   • ${f}`); console.log(''); return; }

  for (const f of archivos) {
    const raw = readFileSync(join(SQL_DIR, f), 'utf8');
    const sum = checksum(raw);

    const batches = partirBatches(raw);
    const t0 = Date.now();
    process.stdout.write(`   ▶ ${f} … `);
    try {
      for (const b of batches) await pool.request().batch(b);
      const dur = Date.now() - t0;
      await registrar(pool, { filename: f, version: numPrefix(f), sum, baseline: false, durationMs: dur });
      console.log(`OK (${dur} ms, ${batches.length} batch)`);
    } catch (e) {
      console.log('FALLÓ');
      console.error(`\n  ❌ Error en ${f}: ${e.message}`);
      console.error('  Se detiene la migración. Corrige y vuelve a correr `up` (esta NO quedó registrada).\n');
      process.exitCode = 1;
      return;
    }
  }
  console.log('\n  ✅ Migraciones aplicadas.\n');
}

async function cmdBaseline(pool, { to }) {
  await ensureTable(pool);
  const aplicadas = await getAplicadas(pool);
  let archivos = listarArchivos();
  if (to != null) archivos = archivos.filter((f) => numPrefix(f) <= to);

  const nuevas = archivos.filter((f) => !aplicadas.has(f));
  if (nuevas.length === 0) { console.log('\n  Nada que marcar: todas ya están registradas.\n'); return; }

  console.log(`\n  Marcando ${nuevas.length} migración(es) como YA APLICADAS (baseline, sin ejecutar):\n`);
  for (const f of nuevas) {
    const sum = checksum(readFileSync(join(SQL_DIR, f), 'utf8'));
    await registrar(pool, { filename: f, version: numPrefix(f), sum, baseline: true });
    console.log(`   📌 ${f}`);
  }
  console.log('\n  ✅ Baseline registrado. A partir de aquí `up` solo aplica lo nuevo.\n');
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const cmd = args.find((a) => !a.startsWith('-')) || 'status';
  const dryRun = args.includes('--dry-run');
  const toArg = args.find((a) => a.startsWith('--to='));
  const to = toArg ? parseInt(toArg.split('=')[1]) : null;

  if (!dbCfg.server || !dbCfg.database) {
    console.error('❌ Falta configurar la BD en backend/.env (DB_SERVER, DB_DATABASE, …).');
    process.exit(1);
  }

  const pool = await sql.connect(dbCfg);
  try {
    console.log(`\n  BD: ${dbCfg.database} @ ${dbCfg.server}`);
    if (cmd === 'status')        await cmdStatus(pool);
    else if (cmd === 'up')       await cmdUp(pool, { dryRun });
    else if (cmd === 'baseline') await cmdBaseline(pool, { to });
    else { console.error(`Comando desconocido: ${cmd}. Usa: status | up | baseline`); process.exitCode = 1; }
  } finally {
    await pool.close();
  }
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
