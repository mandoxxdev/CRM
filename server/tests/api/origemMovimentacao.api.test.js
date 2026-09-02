/**
 * Etapa 25, Task 3 — a movimentacao registra DE ONDE VEIO (RN-04 e RN-05).
 *
 * ── A armadilha que este arquivo existe para guardar ─────────────────────────────────────────
 * `trust proxy` NAO esta configurado neste servidor (a unica ocorrencia do termo no repositorio
 * e um comentario dizendo isso). Atras do nginx, `req.ip` vale `127.0.0.1` para TODO mundo:
 * gravar `req.ip` cru encheria a trilha de PRODUCAO com o IP do proxy enquanto o teste local,
 * que fala direto com o express, passa verde. E o modo de falha silenciosa que esta base ja
 * pagou caro. Por isso o helper guarda DOIS campos — `ip` (o cliente, tirado do primeiro item do
 * `x-forwarded-for` quando ele existe) e `ip_proxy` (o `req.ip`, quando difere) — e por isso o
 * cenario de peso e o do `x-forwarded-for` com VARIOS enderecos.
 *
 * ── A forma: `req.user.origem`, nao `req` repassado ──────────────────────────────────────────
 * O plano original mandava "repassar o `req`" ate a auditoria. O `req` NAO chega la:
 * `registrarMovimentacao(db, user, params, opcoes)` nao o recebe, e dos 28 call sites de
 * producao 23 nascem DENTRO de servicos que tambem nao tem `req`. O objeto universal e o `user`:
 * as rotas do modulo chamam sempre `Service.x(db, req.user, ...)`. Entao a origem e anexada a
 * `req.user` num middleware do modulo e lida como `user.origem` dentro do motor.
 *
 * ONDE o middleware entra (a primeira forma tentada FALHOU, e este arquivo foi quem mostrou):
 * pendurar a origem num `app.use('/api/almoxarifado', ..., anexarOrigem)` NAO funciona — esse
 * middleware roda antes dos middlewares de ROTA, e cada rota da `extended` declara `auth` de
 * novo; `authenticateToken` faz `req.user = user` e substitui o objeto, levando o `origem`
 * junto. Os 11 cenarios de unidade ficavam VERDES e os 4 de integracao vermelhos. A origem e
 * pendurada envolvendo o proprio `authenticateToken` no registrador do modulo.
 *
 * O cenario "[servico]" abaixo e o que SEPARA esta forma da descartada (`opcoes.origem`, o 4o
 * parametro): pela forma descartada, so as 5 rotas que chamam o motor direto passariam origem, e
 * os 23 movimentos originados dentro de servico gravariam `null` — metade da feature, em
 * silencio, com todos os testes de rota verdes. A devolucao movimenta de dentro do
 * `returnService`; se ela gravar origem, a forma alcanca os 28.
 *
 * ── RN-05: dado INERTE, e NENHUM `try/catch` novo ───────────────────────────────────────────
 * A RN dizia "no mesmo `try/catch` da auditoria, padrao do modulo" — e esse `try/catch` NAO
 * EXISTE: das 60 chamadas de `registrarAuditoria` em `services/almoxarifado/`, 59 estao sem
 * `try`, incluindo a da movimentacao. Criar um aqui mudaria a semantica congelada da auditoria
 * de movimentacao, coisa que esta etapa nao decidiu. A regua real e outra: a origem e montada
 * FORA (no middleware) e chega como objeto pronto, sem `req.get` nem Express dentro do servico —
 * nao ha o que falhar no ponto da escrita. Os cenarios de `req` malformado e de `req.get` que
 * LANCA guardam essa promessa na porta de entrada, que e onde ela pode ser cumprida.
 *
 * Executar: cd server && node tests/api/origemMovimentacao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');
const { origemRequisicao, camposDeOrigem, LIMITE_USER_AGENT } = require('../../services/almoxarifado/origemRequisicao');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

// `is_superadmin` (nao so `role: 'admin'`): satisfaz `getPerfilFromUser` -> ADMINISTRADOR, que e
// o perfil com `movimentar`, `ajustar_estoque` e `configurar` — este ultimo e o gate da rota de
// leitura da trilha.
const ADMIN = { id: 42, nome: 'Admin Origem', role: 'admin', is_superadmin: 1, email: 'origem@test.com' };

const CLIENTE_IP = '203.0.113.77';
const PROXY_1 = '10.10.0.1';
const PROXY_2 = '172.16.0.9';
const XFF_CADEIA = `${CLIENTE_IP}, ${PROXY_1}, ${PROXY_2}`;
const UA = 'Mozilla/5.0 (X11; Linux x86_64) NavegadorDoAlmoxarifado/1.0';

// `req` de mentira, no formato que o Express entrega: `get` case-insensitive sobre `headers`.
function reqFake({ ip = '127.0.0.1', headers = {} } = {}) {
  const baixo = {};
  for (const [k, v] of Object.entries(headers)) baixo[k.toLowerCase()] = v;
  return { ip, headers: baixo, get(nome) { return baixo[String(nome).toLowerCase()]; } };
}

(async () => {
  const { app, db, close } = await createTestApp({ user: { ...ADMIN } });

  let seq = 0;
  async function novoMaterial(qtd = 0) {
    seq += 1;
    const r = await dbRun(db,
      `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo)
       VALUES (?,?,'UN',?,1)`, [`ORIG-${seq}`, `Material origem ${seq}`, qtd]);
    return r.lastID;
  }

  // A LEITURA e sempre pela tela-contrato (C1 da Etapa 22), nunca por SELECT na tabela: e o
  // campo derivado `alteracoes` que a tela mostra, e e nele que `ip`/`user_agent` precisam
  // aparecer. Um SELECT no `dados_novos` cru provaria a escrita e nao a leitura.
  const lerTrilha = (query) => request(app)
    .get('/api/almoxarifado/auditoria')
    .query({ entidade: 'movimentacao', limite: 1000, ...query });

  const campo = (item, nome) => (item.alteracoes || []).find((a) => a.campo === nome);
  const valor = (item, nome) => { const c = campo(item, nome); return c ? c.para : undefined; };

  async function itemDaTrilha(entidadeId) {
    const res = await lerTrilha({});
    assert.strictEqual(res.status, 200, `a trilha nao respondeu: ${JSON.stringify(res.body)}`);
    // Guarda anti-teste-vazio: antes de afirmar o que TEM na linha, prove que ha linha.
    assert.ok(Array.isArray(res.body.itens) && res.body.itens.length > 0,
      'a trilha de movimentacao voltou VAZIA — o cenario nao esta provando nada');
    const item = res.body.itens.find((i) => Number(i.entidade_id) === Number(entidadeId));
    assert.ok(item, `movimentacao ${entidadeId} nao aparece na trilha (${res.body.itens.length} itens lidos)`);
    return item;
  }

  // ══════════════════ Step 1 — o helper puro (a regua do x-forwarded-for) ══════════════════

  await test('[helper] x-forwarded-for com UM ip: `ip` e o cliente e `ip_proxy` e o req.ip', async () => {
    const o = origemRequisicao(reqFake({ ip: PROXY_1, headers: { 'x-forwarded-for': CLIENTE_IP, 'user-agent': UA } }));
    assert.strictEqual(o.ip, CLIENTE_IP,
      `\`ip\` deveria ser o CLIENTE (${CLIENTE_IP}) e veio '${o.ip}'`);
    assert.strictEqual(o.ip_proxy, PROXY_1,
      `\`ip_proxy\` deveria guardar o req.ip (${PROXY_1}) e veio '${o.ip_proxy}'`);
    assert.strictEqual(o.user_agent, UA);
  });

  await test('[helper] x-forwarded-for com VARIOS ips: o PRIMEIRO e o cliente, nunca o proxy', async () => {
    // Guarda anti-teste-vazio: o cenario so prova algo se a cadeia tiver mais de um endereco.
    assert.ok(XFF_CADEIA.split(',').length > 1, `a cadeia de teste tem um endereco so: ${XFF_CADEIA}`);
    const req = reqFake({ ip: PROXY_2, headers: { 'x-forwarded-for': XFF_CADEIA, 'user-agent': UA } });
    const o = origemRequisicao(req);
    // ESTA e a assercao que o controle positivo derruba: devolver `req.ip` cru (que atras do
    // nginx e o proxy, e em producao e sempre 127.0.0.1) faz a trilha inteira apontar para a
    // maquina errada, com todos os outros cenarios verdes.
    assert.strictEqual(o.ip, CLIENTE_IP,
      `\`ip\` deveria ser o CLIENTE (${CLIENTE_IP}), o PRIMEIRO da cadeia '${XFF_CADEIA}', e veio '${o.ip}'`
      + ` — gravar isso encheria a trilha de producao com o IP do PROXY`);
    assert.notStrictEqual(o.ip, PROXY_1, `\`ip\` veio com o primeiro PROXY da cadeia (${PROXY_1})`);
    assert.notStrictEqual(o.ip, req.ip, `\`ip\` veio com o req.ip cru (${req.ip}), que atras do nginx e o proxy`);
    assert.strictEqual(o.ip_proxy, PROXY_2, `\`ip_proxy\` deveria ser o req.ip (${PROXY_2}) e veio '${o.ip_proxy}'`);
  });

  await test('[helper] sem x-forwarded-for: cai no req.ip e `ip_proxy` fica null', async () => {
    const o = origemRequisicao(reqFake({ ip: '198.51.100.5', headers: { 'user-agent': UA } }));
    assert.strictEqual(o.ip, '198.51.100.5');
    assert.strictEqual(o.ip_proxy, null,
      `sem proxy os dois campos sao o mesmo endereco; \`ip_proxy\` tem de ser null e veio '${o.ip_proxy}'`);
  });

  await test('[helper] x-forwarded-for IGUAL ao req.ip nao duplica o endereco em `ip_proxy`', async () => {
    const o = origemRequisicao(reqFake({ ip: CLIENTE_IP, headers: { 'x-forwarded-for': CLIENTE_IP } }));
    assert.strictEqual(o.ip, CLIENTE_IP);
    assert.strictEqual(o.ip_proxy, null, `os dois lados sao ${CLIENTE_IP}; \`ip_proxy\` veio '${o.ip_proxy}'`);
  });

  await test('[helper] user-agent ausente vira null sem levar o `ip` junto', async () => {
    const o = origemRequisicao(reqFake({ ip: '198.51.100.5', headers: { 'x-forwarded-for': CLIENTE_IP } }));
    assert.strictEqual(o.user_agent, null, `user_agent deveria ser null e veio '${o.user_agent}'`);
    assert.strictEqual(o.ip, CLIENTE_IP, 'o ip foi perdido junto com o user-agent ausente');
  });

  await test('[helper] user-agent gigante e TRUNCADO no limite declarado', async () => {
    // O limite e AFIRMADO por numero, nao so lido da constante: se alguem trocar 255 por 4000, a
    // trilha ganha campo de kilobytes por linha e este cenario tem de reprovar.
    assert.strictEqual(LIMITE_USER_AGENT, 255,
      `o limite do user_agent mudou para ${LIMITE_USER_AGENT} — decida de proposito, nao por acidente`);
    const gigante = `NavegadorGigante/${'A'.repeat(5000)}`;
    const o = origemRequisicao(reqFake({ headers: { 'user-agent': gigante } }));
    assert.strictEqual(o.user_agent.length, LIMITE_USER_AGENT,
      `o user_agent nao foi truncado: ${o.user_agent.length} caracteres`);
    assert.ok(gigante.startsWith(o.user_agent), 'o truncamento nao preservou o inicio do user-agent');
  });

  await test('[helper] req MALFORMADO (sem get, sem headers) nao lanca — devolve campos nulos', async () => {
    for (const ruim of [undefined, null, {}, 'nao sou um req', 42, { get: null, headers: null }]) {
      let o;
      assert.doesNotThrow(() => { o = origemRequisicao(ruim); },
        `origemRequisicao(${JSON.stringify(ruim)}) lancou — a origem tem de ser dado INERTE (RN-05)`);
      assert.deepStrictEqual(o, { ip: null, ip_proxy: null, user_agent: null },
        `req malformado devolveu ${JSON.stringify(o)}`);
    }
  });

  await test('[helper] req.get que LANCA nao derruba o helper (RN-05 na porta de entrada)', async () => {
    const explosivo = {
      ip: '198.51.100.5',
      get() { throw new Error('cabecalho explodiu'); },
    };
    let o;
    assert.doesNotThrow(() => { o = origemRequisicao(explosivo); }, 'o helper propagou a excecao do req.get');
    // O que sobrou de bom continua sendo aproveitado: perder o user-agent nao pode custar o ip.
    assert.strictEqual(o.ip, '198.51.100.5', `o ip foi perdido junto com o cabecalho que explodiu: '${o.ip}'`);
    assert.strictEqual(o.user_agent, null);
  });

  // ══════════════════ Step 1b — `camposDeOrigem`: o que vai para a trilha ══════════════════

  await test('[campos] user sem origem nao acrescenta chave nenhuma (degrada limpo)', async () => {
    // Os testes desta base constroem `user` literal (`{ id, nome, role }`) e os jobs de fundo
    // tambem. `user.origem` vira undefined e a trilha tem de ficar EXATAMENTE como era.
    assert.deepStrictEqual(camposDeOrigem(undefined), {});
    assert.deepStrictEqual(camposDeOrigem({ id: 1, nome: 'Sem Origem' }), {});
    assert.deepStrictEqual(camposDeOrigem({ id: 1, origem: 'lixo' }), {});
    assert.deepStrictEqual(camposDeOrigem({ id: 1, origem: null }), {});
  });

  await test('[campos] origem so com nulos nao polui a trilha com campos vazios', async () => {
    assert.deepStrictEqual(camposDeOrigem({ id: 1, origem: { ip: null, ip_proxy: null, user_agent: null } }), {},
      'campo nulo virou linha `de: null / para: null` na tela de auditoria');
  });

  await test('[campos] origem completa vira as chaves da trilha; `ip_proxy` nulo fica de fora', async () => {
    assert.deepStrictEqual(
      camposDeOrigem({ id: 1, origem: { ip: CLIENTE_IP, ip_proxy: PROXY_1, user_agent: UA } }),
      { ip: CLIENTE_IP, ip_proxy: PROXY_1, user_agent: UA });
    assert.deepStrictEqual(
      camposDeOrigem({ id: 1, origem: { ip: CLIENTE_IP, ip_proxy: null, user_agent: UA } }),
      { ip: CLIENTE_IP, user_agent: UA });
  });

  // ══════════════════ Step 3 — integracao: rota real, leitura pela tela ══════════════════

  await test('[rota] movimentacao por rota real grava `ip` e `user_agent` na trilha', async () => {
    const mat = await novoMaterial(0);
    const mov = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .set('x-forwarded-for', XFF_CADEIA)
      .set('user-agent', UA)
      .send({ material_id: mat, tipo: 'ENTRADA_MANUAL', quantidade: 10, justificativa: 'carga com origem' });
    assert.strictEqual(mov.status, 201, `ENTRADA_MANUAL: ${JSON.stringify(mov.body)}`);

    const item = await itemDaTrilha(mov.body.id);
    assert.strictEqual(valor(item, 'ip'), CLIENTE_IP,
      `a trilha gravou '${valor(item, 'ip')}' como \`ip\` — deveria ser o cliente ${CLIENTE_IP}`);
    assert.strictEqual(valor(item, 'user_agent'), UA,
      `a trilha gravou '${valor(item, 'user_agent')}' como \`user_agent\``);

    // COMPOSICAO, nunca total fixo (o plano da Etapa 23 errou exatamente assim): o que importa e
    // que os campos ANTIGOS continuaram e os NOVOS chegaram. Um `length === 6` quebraria na
    // proxima etapa que acrescentar um campo ao `dados_novos`, sem nenhum bug existir.
    const nomes = new Set((item.alteracoes || []).map((a) => a.campo));
    for (const esperado of ['material_id', 'tipo', 'quantidade', 'saldo_posterior', 'ip', 'user_agent']) {
      assert.ok(nomes.has(esperado),
        `\`${esperado}\` sumiu de \`alteracoes\` — campos presentes: ${[...nomes].join(', ')}`);
    }
    assert.strictEqual(valor(item, 'tipo'), 'ENTRADA_MANUAL', 'o campo antigo `tipo` foi corrompido pela mudanca');
    assert.strictEqual(Number(valor(item, 'quantidade')), 10, 'o campo antigo `quantidade` foi corrompido pela mudanca');
  });

  await test('[rota] sem x-forwarded-for a trilha guarda o req.ip e NAO inventa `ip_proxy`', async () => {
    const mat = await novoMaterial(0);
    const mov = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .set('user-agent', UA)
      .send({ material_id: mat, tipo: 'ENTRADA_MANUAL', quantidade: 3, justificativa: 'carga sem proxy' });
    assert.strictEqual(mov.status, 201, JSON.stringify(mov.body));

    const item = await itemDaTrilha(mov.body.id);
    const ip = valor(item, 'ip');
    assert.ok(typeof ip === 'string' && ip.length > 0,
      `sem proxy o \`ip\` tem de ser o endereco direto da conexao e veio '${ip}'`);
    assert.strictEqual(campo(item, 'ip_proxy'), undefined,
      `sem proxy nao ha \`ip_proxy\` a gravar, e a trilha trouxe '${valor(item, 'ip_proxy')}'`);
  });

  await test('[SERVICO] devolucao movimenta de DENTRO do returnService e grava origem igual', async () => {
    // Este cenario e o que separa a forma escolhida (`req.user.origem`) da descartada
    // (`opcoes.origem`): pela descartada ele ficaria VERMELHO enquanto os dois cenarios de rota
    // acima ficariam verdes — 23 dos 28 call sites gravando null, em silencio.
    const mat = await novoMaterial(0);
    const carga = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA_MANUAL', quantidade: 50, justificativa: 'carga para devolver' });
    assert.strictEqual(carga.status, 201, JSON.stringify(carga.body));
    const saida = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 20, justificativa: 'entrega para devolver depois' });
    assert.strictEqual(saida.status, 201, JSON.stringify(saida.body));

    const dev = await request(app).post('/api/almoxarifado/devolucoes')
      .set('x-forwarded-for', XFF_CADEIA)
      .set('user-agent', UA)
      .send({ material_id: mat, quantidade: 5, motivo: 'SOBRA_PROJETO', destino: 'ESTOQUE', movimentacao_saida_id: saida.body.id });
    assert.strictEqual(dev.status, 201, `devolucao: ${JSON.stringify(dev.body)}`);

    // A rota de devolucao nao devolve o id da movimentacao (ela e criada la dentro), entao o
    // movimento e localizado pelo livro — que e justamente o ponto: ninguem passou `req` por ali.
    const linha = await dbGet(db,
      `SELECT id FROM movimentacoes_almoxarifado
        WHERE material_id = ? AND tipo = 'ENTRADA_DEVOLUCAO' ORDER BY id DESC LIMIT 1`, [mat]);
    assert.ok(linha, 'a devolucao nao gerou ENTRADA_DEVOLUCAO no livro — o cenario nao prova nada');

    const item = await itemDaTrilha(linha.id);
    assert.strictEqual(item.acao, 'ENTRADA_DEVOLUCAO');
    assert.strictEqual(valor(item, 'ip'), CLIENTE_IP,
      `movimento nascido DENTRO do returnService gravou '${valor(item, 'ip')}' como \`ip\``
      + ' — e o sintoma de origem que so alcanca as 5 rotas que chamam o motor direto');
    assert.strictEqual(valor(item, 'user_agent'), UA,
      `movimento nascido dentro do servico ficou sem \`user_agent\`: '${valor(item, 'user_agent')}'`);
  });

  await test('[rota] o CANCELAMENTO tambem diz de onde veio', async () => {
    const mat = await novoMaterial(0);
    const mov = await request(app).post('/api/almoxarifado/movimentacoes/v2')
      .send({ material_id: mat, tipo: 'ENTRADA_MANUAL', quantidade: 7, justificativa: 'entrada a cancelar' });
    assert.strictEqual(mov.status, 201, JSON.stringify(mov.body));

    const cancel = await request(app).post(`/api/almoxarifado/movimentacoes/${mov.body.id}/cancelar`)
      .set('x-forwarded-for', XFF_CADEIA)
      .set('user-agent', UA)
      .send({ motivo: 'lancamento errado, estornando' });
    assert.strictEqual(cancel.status, 200, `cancelamento: ${JSON.stringify(cancel.body)}`);

    const res = await lerTrilha({ acao: 'CANCELAMENTO' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const item = (res.body.itens || []).find((i) => Number(i.entidade_id) === Number(mov.body.id));
    assert.ok(item, `o CANCELAMENTO de ${mov.body.id} nao aparece na trilha`);
    assert.strictEqual(valor(item, 'ip'), CLIENTE_IP,
      `o cancelamento — o ato que mais se quer rastrear — gravou '${valor(item, 'ip')}' como \`ip\``);
    assert.strictEqual(valor(item, 'user_agent'), UA);
    assert.ok((item.alteracoes || []).some((a) => a.campo === 'estorno_id'),
      'o campo antigo `estorno_id` sumiu do CANCELAMENTO');
  });

  await test('[degradacao] chamada DIRETA ao servico, com user literal, nao lanca e nao inventa origem', async () => {
    // Job de fundo e teste unitario constroem `user` na mao. `user.origem` e undefined e a
    // trilha tem de continuar exatamente como era — nada de `ip: null` poluindo a tela.
    const mat = await novoMaterial(0);
    let r;
    await assert.doesNotReject(async () => {
      r = await stockService.registrarMovimentacao(db, { id: 9, nome: 'Job Sem Req' }, {
        material_id: mat, tipo: 'ENTRADA_MANUAL', quantidade: 2, justificativa: 'job sem req',
      });
    }, 'user sem `origem` derrubou a movimentacao');

    const item = await itemDaTrilha(r.id);
    assert.strictEqual(campo(item, 'ip'), undefined,
      `sem req a trilha inventou \`ip\` = '${valor(item, 'ip')}'`);
    assert.strictEqual(campo(item, 'user_agent'), undefined,
      `sem req a trilha inventou \`user_agent\` = '${valor(item, 'user_agent')}'`);
    assert.strictEqual(Number(valor(item, 'quantidade')), 2, 'a linha antiga da trilha se perdeu');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
