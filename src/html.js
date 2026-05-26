const fs = require('fs');
const path = require('path');

/**
 * Carga el HTML del panel React.
 *
 * En el bundle final, esbuild convierte `require('../dist/web/index.html')` en
 * un string gracias al loader `.html = text`. El fallback permite ejecutar el
 * proyecto sin bundle despues de `pnpm run build:web`.
 */
function loadIndexHtml() {
  try {
    return require('../dist/web/index.html');
  } catch (error) {
    return fs.readFileSync(path.join(process.cwd(), 'dist', 'web', 'index.html'), 'utf8');
  }
}

module.exports = { loadIndexHtml };
