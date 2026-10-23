/**
 * Etapa 187, T4 — integracao: a baixada que nao calibra nem edita e a restricao da manutencao, pela ROTA (o gesto ate o fim) e
 * pelo SERVICO, e a fixture real que o client consome.
 *
 * - Pela rota: restricao -> GET (ALMOXARIFE e PRODUCAO) -> emprestar 201 -> devolver -> GET ainda restrita -> manutencao OK ->
 *   GET null -> INSERVIVEL + BAIXA -> editar 400 e calibrar 400 (certificado apagado) -> painel sem ela -> Reverter baixa -> editar
 *   200 e calibrar 201 -> painel com ela em a_vencer (M1: validade = hoje + 10).
 * - [RN-187.05g] (emenda I4): COM_RESTRICAO + BAIXA -> BAIXADA com restricao -> Reverter baixa -> DISPONIVEL com a mesma restricao.
 * - Pelo servico: listarFerramentas(db) x o corpo da rota do ALMOXARIFE; atualizar/calibrar a baixada rejeitam com 400 e a frase.
 * - Fixture do client (molde I3 da 183 / T3 da 184): client/src/components/almoxarifado/__fixtures__/ferramentasRestricao.rota.json.
 *   SEMPRE a fixture = a resposta real (chaves, tipos, JSON identico). Os instantes gravados por CURRENT_TIMESTAMP (data_inicio e
 *   data_fim da manutencao, created_at e updated_at da ferramenta) sao fixados por UPDATE DEPOIS dos gestos pela rota — sao a unica
 *   parte que muda a cada execucao e nao sao o assunto da fixture. Com CRM_GRAVAR_FIXTURE=1 so regrava.
 *
 * Plano: docs/superpowers/plans/2026-10-22-almoxarifado-etapa187-ferramenta-baixada-e-restricao-da-manutencao.md
 * Executar: cd server && node tests/api/toolBaixadaERestricaoIntegracao.api.test.js
 * Regravar: cd server && CRM_GRAVAR_FIXTURE=1 node tests/api/toolBaixadaERestricaoIntegracao.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { emprestarComTermo } = require('../helpers/termoFerramenta');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const toolService = require('../../services/almoxarifado/toolService');
const diaLocal = require('../../services/diaLocal');

const FIXTURE = path.join(__dirname, '..', '..', '..', 'client', 'src', 'components', 'almoxarifado', '__fixtures__',
  'ferramentasRestricao.rota.json');
const GRAVAR = process.env.CRM_GRAVAR_FIXTURE === '1';

const ALMOXARIFE = { id: 3, nome: 'Almox', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };
const PRODUCAO = { id: 5, nome: 'Prod', role: 'user', email: 'prod@test.com' };
const API = '/api/almoxarifado';
const FRASE_CAL = 'Ferramenta baixada não pode ser calibrada (Torquímetro 187)';
const FRASE_EDI = 'Ferramenta baixada não pode ser editada (Torquímetro 187)';
const LEVE = { condicao: 'COM_RESTRICAO', destino: 'USO', observacoes: 'Só para serviço leve' };

let passed = 0; let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) {
    failed++; console.error(`  ✗ ${name}: ${String(e && e.message).replace(/\s*\n\s*/g, ' ').slice(0, 900)}`);
  }
}

const novaFerramenta = async (db, codigo, nome = 'Torquímetro 187') => (await dbRun(db, `INSERT INTO ferramentas_almoxarifado
  (codigo_patrimonio, nome, tipo, status, exige_calibracao) VALUES (?, ?, 'Instrumento', 'DISPONIVEL', 1)`, [codigo, nome])).lastID;

/** Abre e conclui a manutencao pela rota; confere o 200 e o status de chegada. Devolve o id da manutencao. */
async function manutencao(app, fid, corpo, statusEsperado) {
  const m = await request(app).post(`${API}/ferramentas/${fid}/manutencoes`).send({ descricao: 'Revisao' });
  assert.strictEqual(m.status, 201, `abrir manutencao: ${m.status} ${JSON.stringify(m.body)}`);
  const c = await request(app).put(`${API}/manutencoes/${m.body.id}/concluir`).send(corpo);
  assert.strictEqual(c.status, 200, `concluir: ${c.status} ${JSON.stringify(c.body)}`);
  assert.deepStrictEqual(c.body, { success: true, status: statusEsperado });
  return m.body.id;
}

async function esperada(db, mid) {
  const m = await dbGet(db, 'SELECT id, observacoes, data_fim FROM manutencoes_ferramenta_almoxarifado WHERE id = ?', [mid]);
  return { manutencao_id: m.id, observacoes: m.observacoes, data_fim: m.data_fim };
}

/** GET /ferramentas como `user` (volta ao ALMOXARIFE); devolve o item da ferramenta e o corpo inteiro. */
async function item(app, setUser, user, fid) {
  setUser(user);
  const r = await request(app).get(`${API}/ferramentas`);
  setUser(ALMOXARIFE);
  assert.strictEqual(r.status, 200, `GET /ferramentas: ${r.status}`);
  const f = r.body.find((x) => x.id === fid);
  assert.ok(f, `ferramenta ${fid} fora da lista`);
  return { f, corpo: r.body };
}

const calibrar = (app, fid, cal, val) => request(app).post(`${API}/ferramentas/${fid}/calibracoes`)
  .field('data_calibracao', cal).field('data_validade', val)
  .attach('certificado', Buffer.from('%PDF-1.4'), 'cert.pdf');

(async () => {
  await test('[pela rota] restricao -> emprestar -> devolver -> OK limpa -> baixa recusa editar/calibrar -> reverter volta tudo', async () => {
    const { app, db, close, setUser, uploadsAlmoxDir } = await createTestApp({ user: ALMOXARIFE });
    const hoje = diaLocal.hojeLocalISO();
    const fid = await novaFerramenta(db, 'FER-187');

    // calibracao inicial curta (hoje + 5): o emprestimo exige vigente, e o painel depois do reverter le a MAIOR validade (M1)
    const c0 = await calibrar(app, fid, hoje, diaLocal.somarDiasISO(hoje, 5));
    assert.strictEqual(c0.status, 201, `calibracao inicial: ${c0.status} ${JSON.stringify(c0.body)}`);

    // 1) conclui "Em uso com restricao" + volta ao uso
    const mid = await manutencao(app, fid, LEVE, 'DISPONIVEL');
    const restr = await esperada(db, mid);
    assert.ok(restr.data_fim, 'premissa: data_fim gravado');
    let { f } = await item(app, setUser, ALMOXARIFE, fid);
    assert.strictEqual(f.status, 'DISPONIVEL');
    assert.deepStrictEqual(f.restricao, restr);
    ({ f } = await item(app, setUser, PRODUCAO, fid));
    assert.deepStrictEqual(f.restricao, restr);
    assert.deepStrictEqual(Object.keys(f.restricao).sort(), ['data_fim', 'manutencao_id', 'observacoes']);

    // 2) empresta (a restricao avisa, nao bloqueia) e devolve
    const emp = await emprestarComTermo(app, db, fid, { colaborador_nome: 'Ana Restrita' });
    assert.strictEqual(emp.status, 201, `emprestar: ${emp.status} ${JSON.stringify(emp.body)}`);
    ({ f } = await item(app, setUser, ALMOXARIFE, fid));
    assert.strictEqual(f.status, 'EMPRESTADA');
    assert.deepStrictEqual(f.restricao, restr);
    const dev = await request(app).post(`${API}/emprestimos/${emp.body.id}/devolver`).send({});
    assert.strictEqual(dev.status, 200, `devolver: ${dev.status} ${JSON.stringify(dev.body)}`);
    ({ f } = await item(app, setUser, ALMOXARIFE, fid));
    assert.strictEqual(f.status, 'DISPONIVEL');
    assert.deepStrictEqual(f.restricao, restr);

    // 3) nova manutencao "Em condicoes de uso" -> a restricao sai
    await manutencao(app, fid, { condicao: 'OK', destino: 'USO' }, 'DISPONIVEL');
    ({ f } = await item(app, setUser, ALMOXARIFE, fid));
    assert.strictEqual(f.restricao, null);

    // 4) Inservivel + baixa -> editar 400 e calibrar 400 (certificado apagado); painel sem ela
    await manutencao(app, fid, { condicao: 'INSERVIVEL', destino: 'BAIXA', observacoes: 'Motor queimado' }, 'BAIXADA');
    ({ f } = await item(app, setUser, ALMOXARIFE, fid));
    assert.strictEqual(f.status, 'BAIXADA');
    assert.strictEqual(f.restricao, null);
    const e1 = await request(app).put(`${API}/ferramentas/${fid}`).send({ nome: 'Novo nome' });
    assert.strictEqual(e1.status, 400, `editar baixada: ${e1.status} ${JSON.stringify(e1.body)}`);
    assert.strictEqual(e1.body.error, FRASE_EDI);
    const arquivos = fs.readdirSync(uploadsAlmoxDir).length;
    const c1 = await calibrar(app, fid, hoje, diaLocal.somarDiasISO(hoje, 10));
    assert.strictEqual(c1.status, 400, `calibrar baixada: ${c1.status} ${JSON.stringify(c1.body)}`);
    assert.strictEqual(c1.body.error, FRASE_CAL);
    assert.strictEqual(fs.readdirSync(uploadsAlmoxDir).length, arquivos, 'certificado ficou orfao');
    let painel = await request(app).get(`${API}/calibracoes/painel`).expect(200);
    assert.ok(![...painel.body.vencidas, ...painel.body.a_vencer].some((p) => p.id === fid), 'a baixada apareceu no painel');

    // 5) Reverter baixa -> editar 200 e calibrar 201 -> painel com ela em a_vencer, 10 dias
    await request(app).post(`${API}/ferramentas/${fid}/reverter-baixa`).send({ justificativa: 'baixa errada' }).expect(200);
    const e2 = await request(app).put(`${API}/ferramentas/${fid}`).send({ nome: 'Torquímetro 187 revisado' });
    assert.strictEqual(e2.status, 200, `editar depois de reverter: ${e2.status} ${JSON.stringify(e2.body)}`);
    assert.deepStrictEqual(e2.body, { id: fid });
    const c2 = await calibrar(app, fid, hoje, diaLocal.somarDiasISO(hoje, 10));
    assert.strictEqual(c2.status, 201, `calibrar depois de reverter: ${c2.status} ${JSON.stringify(c2.body)}`);
    painel = await request(app).get(`${API}/calibracoes/painel`).expect(200);
    const p = painel.body.a_vencer.find((x) => x.id === fid);
    assert.ok(p, `a revertida nao voltou ao painel: ${JSON.stringify(painel.body)}`);
    assert.strictEqual(p.dias_restantes, 10);
    assert.strictEqual(p.nome, 'Torquímetro 187 revisado');
    ({ f } = await item(app, setUser, ALMOXARIFE, fid));
    assert.strictEqual(f.restricao, null, 'Inservivel + baixa + reverter volta SEM selo (B1244)');
    await close();
  });

  await test('[RN-187.05g] COM_RESTRICAO + BAIXA pela rota -> BAIXADA com restricao -> Reverter baixa -> a mesma restricao (I4)', async () => {
    const { app, db, close, setUser } = await createTestApp({ user: ALMOXARIFE });
    const fid = await novaFerramenta(db, 'FER-187-B');
    const mid = await manutencao(app, fid, { condicao: 'COM_RESTRICAO', destino: 'BAIXA', observacoes: 'Só para serviço leve' }, 'BAIXADA');
    let { f } = await item(app, setUser, ALMOXARIFE, fid);
    assert.strictEqual(f.status, 'BAIXADA');
    assert.deepStrictEqual(f.restricao, await esperada(db, mid));
    await request(app).post(`${API}/ferramentas/${fid}/reverter-baixa`).send({ justificativa: 'baixa errada' }).expect(200);
    ({ f } = await item(app, setUser, ALMOXARIFE, fid));
    assert.strictEqual(f.status, 'DISPONIVEL');
    assert.deepStrictEqual(f.restricao, await esperada(db, mid));
    await close();
  });

  await test('[pelo servico] listarFerramentas = corpo da rota do ALMOXARIFE; atualizar/calibrar a baixada rejeitam 400 com a frase', async () => {
    const { app, db, close, setUser } = await createTestApp({ user: ALMOXARIFE });
    const fid = await novaFerramenta(db, 'FER-187-S');
    await manutencao(app, fid, LEVE, 'DISPONIVEL');
    const doServico = (await toolService.listarFerramentas(db)).find((x) => x.id === fid);
    const { f } = await item(app, setUser, ALMOXARIFE, fid);
    assert.ok(doServico.restricao, 'premissa: o servico traz a restricao');
    assert.strictEqual(JSON.stringify(f), JSON.stringify(doServico));

    const fb = await novaFerramenta(db, 'FER-187-SB');
    await manutencao(app, fb, { condicao: 'INSERVIVEL', destino: 'BAIXA', observacoes: 'Motor queimado' }, 'BAIXADA');
    await assert.rejects(toolService.atualizarFerramenta(db, ALMOXARIFE, fb, { nome: 'x' }),
      (e) => e.status === 400 && e.message === FRASE_EDI);
    await assert.rejects(toolService.registrarCalibracao(db, ALMOXARIFE, fb, { data_calibracao: '2026-01-01', data_validade: '2030-01-01' }, null),
      (e) => e.status === 400 && e.message === FRASE_CAL);
    await close();
  });

  await test('[fixture] a restrita vista pelo PRODUCAO e a baixada com restricao vista pelo ALMOXARIFE = a fixture do client', async () => {
    const { app, db, close, setUser } = await createTestApp({ user: ALMOXARIFE });
    const fr = await novaFerramenta(db, 'FER-187-R', 'Torquímetro restrito');
    const fb = await novaFerramenta(db, 'FER-187-X', 'Torquímetro baixado');
    await manutencao(app, fr, LEVE, 'DISPONIVEL');
    await manutencao(app, fb, { condicao: 'COM_RESTRICAO', destino: 'BAIXA', observacoes: 'Só para serviço leve' }, 'BAIXADA');
    // os instantes de CURRENT_TIMESTAMP, fixados depois dos gestos (o resto vem dos gestos pela rota)
    await dbRun(db, "UPDATE manutencoes_ferramenta_almoxarifado SET data_inicio = '2026-10-22 09:00:00', data_fim = '2026-10-22 10:00:00'");
    await dbRun(db, "UPDATE ferramentas_almoxarifado SET created_at = '2026-10-22 08:00:00', updated_at = '2026-10-22 10:00:00'");

    const real = {
      restritaVistaPeloProducao: (await item(app, setUser, PRODUCAO, fr)).f,
      baixadaComRestricaoVistaPeloAlmoxarife: (await item(app, setUser, ALMOXARIFE, fb)).f,
    };
    assert.strictEqual(real.restritaVistaPeloProducao.status, 'DISPONIVEL');
    assert.notStrictEqual(real.restritaVistaPeloProducao.restricao, null, 'premissa: a restrita tem restricao');
    assert.strictEqual(real.baixadaComRestricaoVistaPeloAlmoxarife.status, 'BAIXADA');
    // I4: sem isto, o Jest "a baixada sem selo" passaria vazio (uma baixada sem restricao nao tem selo de qualquer jeito)
    assert.notStrictEqual(real.baixadaComRestricaoVistaPeloAlmoxarife.restricao, null, 'premissa: a baixada tem restricao anterior');

    if (GRAVAR) {
      fs.writeFileSync(FIXTURE, `${JSON.stringify(real, null, 2)}\n`);
      console.log(`  (fixture regravada: ${FIXTURE})`);
    }
    assert.ok(fs.existsSync(FIXTURE), `fixture ausente: ${FIXTURE} (gere com CRM_GRAVAR_FIXTURE=1)`);
    const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    for (const k of Object.keys(real)) {
      assert.deepStrictEqual(Object.keys(fixture[k] || {}), Object.keys(real[k]), `${k}: chaves da fixture != da resposta real (regrave)`);
      for (const c of Object.keys(real[k])) {
        assert.strictEqual(typeof fixture[k][c], typeof real[k][c], `${k}.${c}: tipo da fixture != da resposta real`);
      }
      assert.strictEqual(JSON.stringify(fixture[k]), JSON.stringify(real[k]), `${k}: fixture != resposta real (regrave)`);
    }
    await close();
  });

  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})();
