// src/db/idUnico.js
// Las altas que toman su id con MAX()+1 fuera de una transacción pueden chocar
// si dos peticiones llegan a la vez (la PK lo impide: error 2627). Para altas
// de UNA sola sentencia, reintentar con un id nuevo es seguro.
export async function conIdUnico(fn, intentos = 5) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (![2627, 2601].includes(err?.number) || i >= intentos) throw err;
    }
  }
}
