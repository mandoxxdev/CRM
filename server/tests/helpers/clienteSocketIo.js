/**
 * Etapa 132 — cliente socket.io MINIMO para os testes do chat, sobre `ws` (dependencia do engine.io do proprio
 * socket.io do servidor: resolvido a partir dele, sem depender do node_modules do client nem do hoisting).
 *
 * Fala so o que o client de verdade (`client/src/services/chatSocket.js`) usa: transporte websocket, namespace `/`,
 * `auth: { token }`. Protocolo EIO 4 / socket.io 5:
 *   '0{...}' aberto  -> manda '40' + JSON(auth)
 *   '40{...}' conectado | '44{message,data}' recusado no middleware (connect_error)
 *   '42[ev, ...args]' evento | '41' desconectado pelo servidor | '2' ping -> '3' pong
 */
const path = require('path');

const WebSocket = require(require.resolve('ws', { paths: [path.dirname(require.resolve('engine.io'))] }));

function conectar(porta, token, { caminho = '/socket.io' } = {}) {
  const c = {
    eventos: [], // [nome, ...args] na ordem de chegada
    conectado: false,
    recusa: null, // { message, data } do '44'
    desconectadoPeloServidor: false,
    fechado: false,
  };
  const ws = new WebSocket(`ws://127.0.0.1:${porta}${caminho}/?EIO=4&transport=websocket`);
  let resolverPronto;
  c.pronto = new Promise((r) => { resolverPronto = r; });
  ws.on('message', (buf) => {
    const s = buf.toString();
    if (s[0] === '0') { ws.send('40' + JSON.stringify(token === undefined ? {} : { token })); return; }
    if (s === '2') { ws.send('3'); return; }
    if (s.startsWith('40')) { c.conectado = true; resolverPronto('conectado'); return; }
    if (s.startsWith('44')) { c.recusa = JSON.parse(s.slice(2)); resolverPronto('recusado'); return; }
    if (s.startsWith('41')) { c.desconectadoPeloServidor = true; c.conectado = false; return; }
    if (s.startsWith('42')) { c.eventos.push(JSON.parse(s.slice(2))); }
  });
  ws.on('close', () => { c.fechado = true; c.conectado = false; resolverPronto('fechado'); });
  ws.on('error', () => { /* o close vem depois */ });
  c.emit = (ev, ...args) => { if (ws.readyState === WebSocket.OPEN) ws.send('42' + JSON.stringify([ev, ...args])); };
  c.fechar = () => { try { ws.close(); } catch (e) { /* ja fechado */ } };
  c.recebeu = (nome) => c.eventos.filter((e) => e[0] === nome);
  return c;
}

/** Espera `pred()` ficar verdadeiro (ou o prazo acabar) — devolve o valor final de `pred()`. */
async function ate(pred, ms = 2000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    if (pred()) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return !!pred();
}

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { conectar, ate, pausa };
