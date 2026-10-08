/**
 * Resolve um asset do client (logo etc.) no disco: primeiro `client/build` (producao — o CRA copia
 * o `public/` para dentro do `build/` no `npm run build`, e a imagem Docker so leva o `build/`),
 * depois `client/public` (dev local sem build). Para cada base, tenta os nomes em ordem.
 * Devolve o caminho absoluto do primeiro que existir, ou null.
 *
 * Extraido do `server/index.js` na Etapa 87 (fix-round da revisao): o PDF da OS lia o logo SO de
 * `client/public` — que nao existe na imagem de producao —, caia no fallback por URL e o Chromium
 * buscava o logo pela rede DENTRO da fila. Agora o PDF da OS e a rota `/Logo_MY.jpg` usam este
 * mesmo resolvedor; `raizClient` e parametro para o teste usar pastas temporarias.
 */
const fs = require('fs');
const path = require('path');

function resolverAssetDoClient(raizClient, ...nomes) {
  const bases = [path.join(raizClient, 'build'), path.join(raizClient, 'public')];
  for (const base of bases) {
    for (const nome of nomes) {
      const candidato = path.join(base, nome);
      if (fs.existsSync(candidato)) return candidato;
    }
  }
  return null;
}

module.exports = { resolverAssetDoClient };
