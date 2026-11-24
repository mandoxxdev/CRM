/**
 * Etapa 261 (D (252) 1, B1615) — o historico de Movimentacoes diz de quais prateleiras a Saida e o Ajuste tiraram as pecas.
 *
 * Desde as Etapas 256/257 o motor grava as linhas que a Saida baixou e as que o Ajuste do total drenou (`ajuste_linhas_drenadas_almoxarifado`),
 * mas so o estorno e a exclusao liam: a Saida automatica que tirou de A e de B aparecia no historico sem prateleira nenhuma.
 * Agora `GET /api/almoxarifado/movimentacoes` devolve `prateleiras: [{ localizacao_id, codigo, quantidade }]` por movimento (RN-261.03), com a
 * parte da posicao padrao no Ajuste do total (RN-261.04), uma consulta por bloco de 500 ids (RN-261.06).
 *
 * Cuidado com teste vazio: cada cenario de "nao tem" (`[]`) vem junto de um movimento que TEM, na mesma resposta.
 *
 * Plano: docs/superpowers/plans/2026-11-23-almoxarifado-etapa261-prateleiras-no-historico-e-estorno-ajuste-de-prateleira.md
 * Executar: cd server && node tests/api/movimentacoesPrateleirasDaSaida.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

const ADMIN = { id: 1, nome: 'Adm 261h', role: 'admin', is_superadmin: 1, email: 'a261h@t.com' };
const API = '/api/almoxarifado';

(async () => {
  console.log('\n=== Etapa 261: o historico diz de quais prateleiras a peca saiu (D (252) 1) ===\n');
  const { app, db } = await createTestApp({ user: { ...ADMIN } });
  const post = (u, b = {}) => request(app).post(u).send(b);
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('aprovacao_automatica', '0'); await cfg('liberacao_valor_ativo', '0');
  const alm = await post(`${API}/almoxarifados`, { codigo: 'ALM261H', nome: 'A261H' });
  const loc = async (codigo) => {
    await post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const A = await loc('A261H'); const B = await loc('B261H');
  let seq = 0;
  const material = async () => {
    const c = `PRS261-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_lote,
      controle_serie, permite_saldo_negativo, localizacao_padrao_id, custo_unitario) VALUES (?,?,'UN',0,1,0,0,0,?,1)`, [c, c, A.id])).lastID;
  };
  const mov = async (m, tipo, q, extra = {}) => {
    const r = await post(`${API}/movimentacoes/v2`, { material_id: m, tipo, quantidade: q, motivo: 'teste 261', justificativa: 'teste 261',
      ...extra });
    assert.strictEqual(r.status, 201, `${tipo} de premissa: ${JSON.stringify(r.body)}`);
    return r.body.id;
  };
  const historico = async (m) => {
    const r = await request(app).get(`${API}/movimentacoes`).query({ material_id: m });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return new Map(r.body.map((x) => [x.id, x]));
  };
  // "A261H 3 · B261H 3" — o que a tela escreve, sem o id
  const texto = (p) => p.map((x) => `${x.padrao ? 'padrao' : (x.codigo || 'sem')} ${x.quantidade}`).join(' · ');

  await test('[RN-261.03] Saida automatica de 6 com A 3 e B 5: o historico diz A 3 · B 3 (antes: sem prateleira nenhuma)', async () => {
    const m = await material();
    const e = await mov(m, 'ENTRADA', 3);
    await mov(m, 'ENTRADA', 5, { localizacao_destino_id: B.id });
    const s = await mov(m, 'SAIDA', 6);
    const h = await historico(m);
    assert.ok(h.get(s).prateleiras, 'a linha da Saida nao tem `prateleiras`');
    assert.strictEqual(texto(h.get(s).prateleiras), 'A261H 3 · B261H 3');
    assert.strictEqual(h.get(s).prateleiras[0].localizacao_id, A.id);
    assert.deepStrictEqual(h.get(e).prateleiras, [], 'a Entrada nao tem baixa');
  });

  await test('[RN-261.03] Saida com a origem escolhida: a prateleira dela', async () => {
    const m = await material();
    await mov(m, 'ENTRADA', 5, { localizacao_destino_id: B.id });
    const s = await mov(m, 'SAIDA', 2, { localizacao_origem_id: B.id });
    assert.strictEqual(texto((await historico(m)).get(s).prateleiras), 'B261H 2');
  });

  await test('[RN-261.04] Ajuste do total que drenou B: B 3 e a posicao padrao 3; o Ajuste so da padrao, sem registro, fica []', async () => {
    const m = await material();
    await mov(m, 'ENTRADA', 3);
    await mov(m, 'ENTRADA', 5, { localizacao_destino_id: B.id });
    const aj = await mov(m, 'AJUSTE', 2); // padrao A 3 -> 0, B 5 -> 2
    const aj2 = await mov(m, 'AJUSTE', 1); // so a padrao? nao: A 0, entao drena B 1
    const h = await historico(m);
    assert.strictEqual(texto(h.get(aj).prateleiras), 'B261H 3 · padrao 3');
    assert.strictEqual(texto(h.get(aj2).prateleiras), 'B261H 1', 'nada saiu da padrao (A ja era 0): sem a parte da padrao');
    const m2 = await material();
    await mov(m2, 'ENTRADA', 5);
    const so = await mov(m2, 'AJUSTE', 2); // A 5 -> 2, nada drenado
    const s2 = await mov(m2, 'SAIDA', 1);
    const h2 = await historico(m2);
    assert.deepStrictEqual(h2.get(so).prateleiras, [], 'o Ajuste que so mexeu na padrao nao tem registro');
    assert.strictEqual(texto(h2.get(s2).prateleiras), 'A261H 1');
  });

  await test('[RN-261.03] lotes diferentes na mesma prateleira somam; linha de saldo apagada sai sem codigo', async () => {
    const m = await material();
    await mov(m, 'ENTRADA', 5);
    const s = await mov(m, 'SAIDA', 4);
    const linhaA = await dbGet(db, 'SELECT id FROM estoque_saldo_almoxarifado WHERE material_id = ? AND localizacao_id = ?', [m, A.id]);
    // um segundo registro na mesma prateleira (outra linha, como um outro lote) e um de uma linha que nao existe mais
    await mov(m, 'ENTRADA', 1, { lote: 'L261H' });
    const outra = (await dbGet(db, `SELECT s.id FROM estoque_saldo_almoxarifado s JOIN lotes_almoxarifado l ON l.id = s.lote_id
      WHERE s.material_id = ? AND s.localizacao_id = ? AND l.codigo = 'L261H'`, [m, A.id])).id;
    await dbRun(db, 'INSERT INTO ajuste_linhas_drenadas_almoxarifado (movimentacao_id, saldo_id, quantidade) VALUES (?,?,?), (?,?,?)',
      [s, outra, 1, s, 999999, 2]);
    const p = (await historico(m)).get(s).prateleiras;
    assert.strictEqual(texto(p), 'A261H 5 · sem 2', JSON.stringify(p));
    assert.ok(linhaA, 'premissa');
    assert.strictEqual(p[1].localizacao_id, null);
  });

  await test('[RN-261.04] a parte da posicao padrao e so do Ajuste: a Saida com registro menor que a quantidade nao inventa "padrao"',
    async () => {
      const m = await material();
      await mov(m, 'ENTRADA', 5);
      const s = await mov(m, 'SAIDA', 4);
      await dbRun(db, 'UPDATE ajuste_linhas_drenadas_almoxarifado SET quantidade = 3 WHERE movimentacao_id = ?', [s]);
      assert.strictEqual(texto((await historico(m)).get(s).prateleiras), 'A261H 3');
    });

  await test('[RN-261.06] mais de 500 movimentos na pagina: o registro do movimento do 2o bloco tambem aparece', async () => {
    const m = await material();
    await mov(m, 'ENTRADA', 5);
    const s = await mov(m, 'SAIDA', 1); // o mais antigo da pagina: vai para o ultimo bloco (ordem decrescente)
    await dbRun(db, `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 1100)
      INSERT INTO movimentacoes_almoxarifado (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, motivo, usuario_id, usuario_nome,
        created_at)
      SELECT ?, 'ENTRADA', 0, 4, 4, 'volume 261', 1, 'x', datetime('now', '+1 day') FROM n`, [m]);
    const r = await request(app).get(`${API}/movimentacoes`).query({ material_id: m });
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.length > 1100, `premissa: ${r.body.length}`);
    const linha = r.body.find((x) => x.id === s);
    assert.strictEqual(texto(linha.prateleiras), 'A261H 1');
    assert.ok(r.body.every((x) => Array.isArray(x.prateleiras)), 'alguma linha sem `prateleiras`');
  });

  await test('[integracao 261] Saida de A e B, Ajuste de B, Ajuste do total: o estorno do Ajuste de B e recusado, o da Saida devolve, e o '
    + 'historico continua dizendo A 3 · B 3', async () => {
    const m = await material();
    await mov(m, 'ENTRADA', 3);
    await mov(m, 'ENTRADA', 5, { localizacao_destino_id: B.id });
    const s = await mov(m, 'SAIDA', 6); // A 0, B 2
    const ajB = await mov(m, 'AJUSTE', 1, { localizacao_destino_id: B.id }); // B 1, total 1
    const ajT = await mov(m, 'AJUSTE', 4); // total 4 (a padrao A sobe)
    const r1 = await post(`${API}/movimentacoes/${ajB}/cancelar`, { motivo: 'teste 261' });
    assert.strictEqual(r1.status, 400, JSON.stringify(r1.body));
    assert.strictEqual(r1.body.error, `Não é possível estornar: há um ajuste deste material feito depois deste (movimentação #${ajT}) `
      + '— a contagem mais recente vale. Estorne primeiro o ajuste mais recente ou faça um novo ajuste.');
    const r2 = await post(`${API}/movimentacoes/${s}/cancelar`, { motivo: 'teste 261' });
    assert.strictEqual(r2.status, 200, JSON.stringify(r2.body));
    const linhas = await dbGet(db, `SELECT SUM(CASE WHEN localizacao_id = ? THEN quantidade END) a, SUM(CASE WHEN localizacao_id = ? THEN
      quantidade END) b FROM estoque_saldo_almoxarifado WHERE material_id = ?`, [A.id, B.id, m]);
    assert.deepStrictEqual([linhas.a, linhas.b], [6, 4], 'o estorno da Saida devolveu a cada prateleira (A 3+3, B 1+3)');
    const h = await historico(m);
    assert.strictEqual(texto(h.get(s).prateleiras), 'A261H 3 · B261H 3');
    assert.ok(h.get(s).cancelado, 'premissa: a Saida esta estornada');
    const estorno = [...h.values()].find((x) => x.tipo === 'ESTORNO');
    assert.deepStrictEqual(estorno.prateleiras, [], 'o estorno nao tem baixa');
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
