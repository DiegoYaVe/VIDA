// Orden y tamaño de página de los listados paginados (tablas del panel).
//
// El cliente manda ?orden=<columna>&dir=asc|desc. La columna NUNCA se pega en
// el SQL tal cual: solo se aceptan las claves del mapa `permitidas`, cuyo valor
// es la expresión SQL fija de esa columna. Cualquier otra cosa usa el orden por
// defecto del listado.

export function ordenSql(query = {}, permitidas, porDefecto, desempate) {
  const col = Object.prototype.hasOwnProperty.call(permitidas, query.orden) ? permitidas[query.orden] : null;
  if (!col) return porDefecto;
  const dir = String(query.dir || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  // El desempate (la llave del registro) mantiene estable la paginación cuando
  // varias filas comparten el mismo valor en la columna ordenada.
  // Si la columna elegida ES la del desempate, no se repite (SQL Server lo rechaza).
  const colDesempate = desempate ? desempate.trim().split(/\s+/)[0] : null;
  return desempate && colDesempate !== col ? `${col} ${dir}, ${desempate}` : `${col} ${dir}`;
}

// Tamaño de página acotado: evita que ?limit=999999 traiga la tabla entera.
// El máximo es alto porque algunos selectores cargan el catálogo completo (500).
export function limiteSeguro(limit, porDefecto = 20, maximo = 1000) {
  const n = parseInt(limit, 10);
  if (!Number.isFinite(n) || n < 1) return porDefecto;
  return Math.min(n, maximo);
}
