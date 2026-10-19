/**
 * Etapa 152 (Fase 5 r3 A1/A6) — preload (`node -r despejaCamadasDoExpress.js index.js`) que despeja as camadas do Express DE VERDADE.
 *
 * A regua do fonte (reguaDoFonteDoServidor.js) le texto: um registro com receptor apelidado, `app[verbo]`, `app.get.call`, o verbo
 * `search`, um arquivo sem extensao ou em tests/, um caminho com padrao (`custos-viagen(s)`) escapam dela e a rota nasce viva sem portao.
 * Aqui se le o que o Express montou: depois do `listen`, para cada amostra de `CAMADAS_AMOSTRAS` (JSON `[[metodo, caminho], ...]`), as
 * camadas que o despacho percorreria (middlewares e a rota que atende, com a cadeia de handlers), e TODAS as rotas cujo caminho casa
 * alguma amostra (em qualquer verbo). Escreve em `CAMADAS_SAIDA` (JSON). O portao das propostas se reconhece pelo `modulosDoPortao`
 * que `services/portaoDasPropostas.js` pendura na funcao.
 *
 * Simula o despacho do Express 4 (Layer.match, Route._handles_method, routers montados) — nao chama handler nenhum.
 */
const fs = require('fs');
const http = require('http');

const SAIDA = process.env.CAMADAS_SAIDA;
const AMOSTRAS = JSON.parse(process.env.CAMADAS_AMOSTRAS || '[]');

const nomeDe = (fn) => {
  if (!fn) return '<sem handler>';
  if (fn.modulosDoPortao) return `portao:${[].concat(fn.modulosDoPortao).join('|')}${fn.caminhoDoPortao ? '+configuracoes' : ''}`;
  return fn.name || '<anonima>';
};

function despachar(router, metodo, caminho, prefixo) {
  const out = [];
  for (const layer of router.stack) {
    let casa = false;
    try { casa = layer.match(caminho); } catch (e) { casa = false; }
    if (!casa) continue;
    if (layer.route) {
      if (!layer.route._handles_method(metodo)) continue;
      const m = metodo.toLowerCase();
      const handles = layer.route.stack.filter((l) => !l.method || l.method === m || (m === 'head' && l.method === 'get')).map((l) => nomeDe(l.handle));
      out.push({ tipo: 'rota', caminho: prefixo + String(layer.route.path), handles });
      return { out, atendida: true };
    }
    if (layer.handle && Array.isArray(layer.handle.stack)) {
      const sub = caminho.slice(layer.path.length) || '/';
      out.push({ tipo: 'router', nome: nomeDe(layer.handle), em: layer.path });
      const r = despachar(layer.handle, metodo, sub, prefixo + layer.path);
      out.push(...r.out);
      if (r.atendida) return { out, atendida: true };
      continue;
    }
    out.push({ tipo: 'mw', nome: nomeDe(layer.handle) });
  }
  return { out, atendida: false };
}

function rotasQueCasam(router, caminhos, prefixo, acc) {
  for (const layer of router.stack) {
    if (layer.route) {
      for (const c of caminhos) {
        let casa = false;
        try { casa = layer.match(c); } catch (e) { casa = false; }
        if (casa) {
          const metodos = Object.keys(layer.route.methods).sort().join(',');
          acc.add(`${metodos} ${prefixo}${String(layer.route.path)}`);
        }
      }
    } else if (layer.handle && Array.isArray(layer.handle.stack)) {
      for (const c of caminhos) {
        let casa = false;
        try { casa = layer.match(c); } catch (e) { casa = false; }
        if (casa) rotasQueCasam(layer.handle, [c.slice(layer.path.length) || '/'], prefixo + layer.path, acc);
      }
    }
  }
  return acc;
}

function despejar(app) {
  const router = app._router;
  if (!router || !SAIDA) return;
  const caminhos = [...new Set(AMOSTRAS.map(([, c]) => c))];
  const res = {
    params: Object.keys(router.params || {}),
    despacho: AMOSTRAS.map(([metodo, caminho]) => ({ metodo, caminho, ...despachar(router, metodo, caminho, '') })),
    rotas: [...rotasQueCasam(router, caminhos, '', new Set())].sort(),
  };
  fs.writeFileSync(SAIDA, JSON.stringify(res, null, 1));
}

const listenOriginal = http.Server.prototype.listen;
http.Server.prototype.listen = function listenComDespejo(...args) {
  const app = this.listeners('request')[0];
  if (app && typeof app === 'function') {
    const vez = () => { try { despejar(app); } catch (e) { fs.writeFileSync(SAIDA, JSON.stringify({ erro: String(e && e.stack) })); } };
    setImmediate(vez);
    for (const ms of [2000, 6000]) setTimeout(vez, ms).unref();
  }
  return listenOriginal.apply(this, args);
};
