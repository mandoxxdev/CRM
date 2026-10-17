/**
 * Etapa 139 — serve as imagens e as fontes da proposta num servidor efêmero, com as MESMAS rotas do index.js
 * (`/api/assets/proposta` e `/api/assets/fonts`, index.js:17509-17510).
 *
 * Por que existe: desde o b8429e2d (22/07/2026) o preview pede o hero, os logos e as fontes por URL
 * (`${baseURL}/api/assets/...`, baseURL = API_URL ou http://localhost:5000). Os testes que abrem o HTML como arquivo
 * dependiam, sem dizer, de um `npm run dev` de pé na porta 5000: sem ele a imagem não carregava e o propostaCapaHero
 * acusava "linha branca" (94,6% da coluna 0) num documento que estava certo. Passe `baseURL` como 5º argumento de
 * gerarHTMLPropostaPremiumV2 e chame `fechar()` no fim.
 *
 * `opcoes.pastaProposta` existe só para o controle positivo (apontar para uma pasta vazia prova que o teste sabe
 * dizer "não carregou").
 */
const path = require('path');
const express = require('express');

const SERVER_DIR = path.join(__dirname, '..', '..');

async function servirAssetsProposta(opcoes = {}) {
  const app = express();
  // O cors do index.js (app.use(cors(...)), global): sem ele a FONTE pedida de outra origem (o HTML do teste é file://)
  // é bloqueada — imagem não precisa de CORS, @font-face precisa. Achado da sabotagem H02 da Fase 5: até aqui o helper
  // servia o hero mas as fontes davam ERR_FAILED, e as medidas continuavam com a fonte de reserva.
  app.use(require('cors')());
  app.use('/api/assets/proposta', express.static(opcoes.pastaProposta || path.join(SERVER_DIR, 'assets', 'proposta')));
  app.use('/api/assets/fonts', express.static(path.join(SERVER_DIR, 'assets', 'fonts')));
  const srv = await new Promise((res, rej) => {
    const s = app.listen(0, '127.0.0.1');
    s.once('listening', () => res(s));
    s.once('error', rej);
  });
  const baseURL = `http://127.0.0.1:${srv.address().port}`;
  const fechar = () => new Promise((res) => srv.close(() => res()));
  return { baseURL, fechar };
}

module.exports = { servirAssetsProposta };
