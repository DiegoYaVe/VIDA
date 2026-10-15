// Entrada para IIS (iisnode, producción en SmarterASP).
// iisnode carga el archivo de entrada con require(), y el backend es un módulo
// ES con await de nivel superior (src/app.js): require() no puede cargarlo.
// Este archivo CommonJS lo carga con import(), que sí puede.
import('./src/app.js').catch((err) => {
  console.error('No se pudo iniciar el backend:', err);
  process.exit(1);
});
