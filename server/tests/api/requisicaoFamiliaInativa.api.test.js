/**
 * Etapa 124 (C231, B801) — a recusa da requisicao com material inativo manda reativar a familia (ou a subfamilia) ANTES do
 * material quando ela tambem esta inativa (RN-10..RN-15 do plano da Etapa 124).
 *
 * Antes: a recusa da 114 dizia so "Reative o material em Materiais → Inativos (...)", e o Reativar do material recusava
 * ("Família inativa — não é possível vincular novos itens" / "Subfamília inválida para a família selecionada") — a
 * mensagem mandava fazer o que o sistema recusa.
 *
 * As literais por extenso (contrato congelado no plano), nao importadas do servico. O estado "inativo depois de criada" e
 * montado direto no banco, como na 114 (Fase 2, M3: com reserva a rota nao inativa).
 *
 * Executar: cd server && node tests/api/requisicaoFamiliaInativa.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const materialInativo = require('../../services/almoxarifado/requisicaoMaterialInativo');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 600)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const ADM = { id: 4, nome: 'Adm Perfil', role: 'user', email: 'adm@test.com', perfil_almoxarifado: 'ADMINISTRADOR' };
const ALMOX = { id: 3, nome: 'Almox Teste', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };

const QUEM = '(Administrador, Almoxarife ou Engenharia)';
const REATIVE = `Reative o material em Materiais → Inativos ${QUEM}`;
const REATIVE_F = (quais) => `Reative ${quais} em Configurações → Famílias (Administrador do almoxarifado) e depois o material `
  + `em Materiais → Inativos ${QUEM}`;
const E1 = (numero, codigos, reative) => `A requisição ${numero} tem material inativo: ${codigos}. ${reative} ou rejeite a requisição.`;
const E1V = (numero, codigos, reative) => `A requisição ${numero} tem material inativo: ${codigos}. ${reative} `
  + 'ou reprove a liberação por valor.';
const E2 = (numero, codigos, reative) => `O rascunho ${numero} tem material inativo: ${codigos}. ${reative} `
  + 'ou cancele o rascunho e faça outro sem ele.';
const E3 = (nome, reative) => `${nome}: material inativo não pode ser separado. ${reative} ou separe os outros itens com 0 neste.`;
const PORTAO = 'Acesso restrito — administrador do Almoxarifado ou Super Administrador';

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  const as = async (u, fn) => { setUser(u); try { return await fn(); } finally { setUser(SUPER); } };
  const cfg = (chave, valor) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?, ?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);
  await cfg('aprovacao_automatica', '0');
  let seqF = 0;
  const familia = async (parent = null) => {
    seqF += 1;
    const nome = `Fam C231 ${seqF}`;
    const id = (await dbRun(db, 'INSERT INTO familias_material_almoxarifado (codigo, nome, parent_id, ativo) VALUES (?, ?, ?, 1)',
      [`C231-${seqF}`, nome, parent])).lastID;
    return { id, nome };
  };
  const inativarFam = (...fs) => Promise.all(fs.map((f) => dbRun(db, 'UPDATE familias_material_almoxarifado SET ativo = 0 WHERE id = ?', [f.id])));
  /** Raiz R com a subfamilia S, ativas. */
  const par = async () => { const R = await familia(); const S = await familia(R.id); return { R, S }; };
  let seq = 0;
  async function material(fam = null, sub = null) {
    seq += 1;
    const codigo = `M231-${seq}`;
    const nome = `Peca C231 ${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo, familia_id, subfamilia_id)
      VALUES (?, ?, 'PC', 0, 0, 1, 1, ?, ?)`, [codigo, nome, fam ? fam.id : null, sub ? sub.id : null])).lastID;
    return { id, codigo, nome };
  }
  const inativarMat = (m) => dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = 0 WHERE id = ?', [m.id]);
  const criar = async (itens, extra = {}) => {
    const r = await request(app).post('/api/almoxarifado/requisicoes')
      .send({ os_referencia: 'OS-C231', itens: itens.map(([m, q]) => ({ material_id: m.id, quantidade: q })), ...extra });
    assert.strictEqual(r.status, 201, `criar: ${JSON.stringify(r.body)}`);
    return r.body;
  };
  const aprovar = (R, u = ADM) => as(u, () => request(app).put(`/api/almoxarifado/requisicoes/${R}/aprovar`).send({}));
  const lerReq = (R) => dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [R]);
  const reservasDe = (R) => dbAll(db, "SELECT * FROM reservas_material_almoxarifado WHERE requisicao_id = ? AND status = 'ATIVA'", [R]);
  /** Pendente com o material inativado (e o que mais o cenario inativar) depois de criada. */
  const pendenteCom = async (itens) => criar(itens);

  console.log('\nRN-10 — o /aprovar nomeia a familia, a subfamilia ou as duas');

  await test('[RN-10] familia inativa -> 400 com "a família de <cod>", continua PENDENTE, nada reservado', async () => {
    const { R, S } = await par();
    const m = await material(R, S);
    const r0 = await pendenteCom([[m, 2]]);
    await inativarMat(m);
    await dbRun(db, 'UPDATE familias_material_almoxarifado SET ativo = 0 WHERE id = ?', [R.id]);
    const r = await aprovar(r0.id);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1(r0.numero, m.codigo, REATIVE_F(`a família de ${m.codigo}`)));
    assert.strictEqual((await lerReq(r0.id)).status, 'PENDENTE');
    assert.strictEqual((await reservasDe(r0.id)).length, 0);
  });

  await test('[RN-10] so a subfamilia inativa (raiz ativa) -> "a subfamília de <cod>"', async () => {
    const { R, S } = await par();
    const m = await material(R, S);
    const r0 = await pendenteCom([[m, 2]]);
    await inativarMat(m);
    await inativarFam(S);
    const r = await aprovar(r0.id);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1(r0.numero, m.codigo, REATIVE_F(`a subfamília de ${m.codigo}`)));
  });

  await test('[RN-10] as duas inativas -> "a família e a subfamília de <cod>"', async () => {
    const { R, S } = await par();
    const m = await material(R, S);
    const r0 = await pendenteCom([[m, 2]]);
    await inativarMat(m);
    await inativarFam(R, S);
    const r = await aprovar(r0.id);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1(r0.numero, m.codigo, REATIVE_F(`a família e a subfamília de ${m.codigo}`)));
  });

  await test('[RN-10] ativo NULL na familia conta como inativa (a leitura do Reativar: ativo !== 1)', async () => {
    const { R } = await par();
    const m = await material(R);
    const r0 = await pendenteCom([[m, 1]]);
    await inativarMat(m);
    await dbRun(db, 'UPDATE familias_material_almoxarifado SET ativo = NULL WHERE id = ?', [R.id]);
    const r = await aprovar(r0.id);
    assert.strictEqual(r.body.error, E1(r0.numero, m.codigo, REATIVE_F(`a família de ${m.codigo}`)));
  });

  await test('[RN-10b] misto: M1 familia inativa, M2 so o material, M3 subfamilia, M4 as duas, M1 repetido -> os grupos', async () => {
    const a = await par(); const b = await par(); const c = await par(); const d = await par();
    const m1 = await material(a.R, a.S); const m2 = await material(b.R, b.S);
    const m3 = await material(c.R, c.S); const m4 = await material(d.R, d.S);
    const ativo = await material(b.R);
    const r0 = await pendenteCom([[m1, 1], [m2, 1], [ativo, 1], [m3, 1], [m1, 1], [m4, 1]]);
    for (const m of [m1, m2, m3, m4]) await inativarMat(m);
    await inativarFam(a.R, c.S, d.R, d.S);
    const r = await aprovar(r0.id);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1(r0.numero, [m1, m2, m3, m4].map((m) => m.codigo).join(', '),
      REATIVE_F(`a família de ${m1.codigo} e a subfamília de ${m3.codigo} e a família e a subfamília de ${m4.codigo}`)));
  });

  await test('[RN-10b] dois na mesma familia inativa -> "a família de M1, M2"', async () => {
    const { R } = await par();
    const m1 = await material(R); const m2 = await material(R);
    const r0 = await pendenteCom([[m1, 1], [m2, 1]]);
    await inativarMat(m1); await inativarMat(m2); await inativarFam(R);
    const r = await aprovar(r0.id);
    assert.strictEqual(r.body.error, E1(r0.numero, `${m1.codigo}, ${m2.codigo}`, REATIVE_F(`a família de ${m1.codigo}, ${m2.codigo}`)));
  });

  console.log('\nRN-14 — as guardas: sem familia inativa, a literal da 114 byte a byte');

  await test('[RN-14] familia ativa -> a literal de hoje', async () => {
    const { R, S } = await par();
    const m = await material(R, S);
    const r0 = await pendenteCom([[m, 1]]);
    await inativarMat(m);
    const r = await aprovar(r0.id);
    assert.strictEqual(r.body.error, E1(r0.numero, m.codigo, REATIVE));
  });

  await test('[RN-14] material ATIVO em familia inativa nao entra (aprova); o inativo de familia ativa -> a de hoje', async () => {
    const { R } = await par(); const b = await par();
    const ativo = await material(R);
    const r1 = await pendenteCom([[ativo, 1]]);
    await inativarFam(R);
    const ok = await aprovar(r1.id);
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
    const m = await material(b.R);
    const r0 = await pendenteCom([[ativo, 1], [m, 1]]);
    await inativarMat(m);
    const r = await aprovar(r0.id);
    assert.strictEqual(r.body.error, E1(r0.numero, m.codigo, REATIVE));
  });

  await test('[RN-14] o item ja entregue nao conta tambem na familia: entregue (familia inativa) + pendente (ativa) -> a de hoje', async () => {
    const a = await par(); const b = await par();
    const entregue = await material(a.R); const pendente = await material(b.R);
    const r0 = await pendenteCom([[entregue, 1], [pendente, 1]]);
    await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET quantidade_entregue = 1 WHERE requisicao_id = ? AND material_id = ?',
      [r0.id, entregue.id]);
    await inativarMat(entregue); await inativarMat(pendente); await inativarFam(a.R);
    const r = await aprovar(r0.id);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1(r0.numero, pendente.codigo, REATIVE));
  });

  await test('[RN-14b] legado: uma RAIZ (inativa) gravada no subfamilia_id nao vira "a subfamília de" -> a literal de hoje', async () => {
    const a = await par(); const b = await par();
    const m = await material(a.R, b.R);
    const r0 = await pendenteCom([[m, 1]]);
    await inativarMat(m); await inativarFam(b.R);
    const r = await aprovar(r0.id);
    assert.strictEqual(r.body.error, E1(r0.numero, m.codigo, REATIVE));
  });

  await test('[RN-14] familia que nao existe -> a literal de hoje', async () => {
    const m = await material();
    await dbRun(db, 'UPDATE materiais_almoxarifado SET familia_id = 99999 WHERE id = ?', [m.id]);
    const r0 = await pendenteCom([[m, 1]]);
    await inativarMat(m);
    const r = await aprovar(r0.id);
    assert.strictEqual(r.body.error, E1(r0.numero, m.codigo, REATIVE));
  });

  await test('[RN-14b] legado: a subfamilia (inativa) gravada no familia_id -> a literal de hoje; materiais = os codigos', async () => {
    const { S } = await par();
    const m = await material(S, null);
    const r0 = await pendenteCom([[m, 1]]);
    await inativarMat(m);
    await inativarFam(S);
    const r = await aprovar(r0.id);
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1(r0.numero, m.codigo, REATIVE));
    // M1 da Fase 2: o erro do servico continua com `materiais` = string[]
    const e = materialInativo.erroAprovar({ numero: 'X' }, 1, ['A1'], { familias: [['a família', ['A1']]] });
    assert.deepStrictEqual(e.materiais, ['A1']);
    assert.strictEqual(e.code, 'MATERIAL_INATIVO');
  });

  console.log('\nRN-11 — o /aprovar-valor');
  await cfg('liberacao_valor_ativo', '1');
  await cfg('liberacao_valor_limite', '1');
  await cfg('liberacao_valor_aprovadores', JSON.stringify([ADM.id]));

  await test('[RN-11] acima da alcada, material e familia inativados -> a variante do valor com a familia', async () => {
    const { R, S } = await par();
    const m = await material(R, S);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 5, custo_unitario = 10 WHERE id = ?', [m.id]);
    const r0 = await criar([[m, 2]]);
    assert.strictEqual(r0.status, 'AGUARDANDO_APROVACAO_VALOR', 'premissa: a alcada segurou');
    await inativarMat(m); await inativarFam(R);
    const r = await as(ADM, () => request(app).put(`/api/almoxarifado/requisicoes/${r0.id}/aprovar-valor`).send({}));
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1V(r0.numero, m.codigo, REATIVE_F(`a família de ${m.codigo}`)));
    assert.strictEqual((await lerReq(r0.id)).status, 'AGUARDANDO_APROVACAO_VALOR');
  });
  await cfg('liberacao_valor_ativo', '0');

  console.log('\nRN-12 — o envio do rascunho');

  await test('[RN-12] rascunho, material e subfamilia inativados -> E2 com "a subfamília de"; continua RASCUNHO', async () => {
    const { R, S } = await par();
    const m = await material(R, S);
    const r0 = await criar([[m, 1]], { salvar_rascunho: true });
    assert.strictEqual(r0.status, 'RASCUNHO');
    await inativarMat(m); await inativarFam(S);
    const r = await request(app).post(`/api/almoxarifado/requisicoes/${r0.id}/enviar`).send({});
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E2(r0.numero, m.codigo, REATIVE_F(`a subfamília de ${m.codigo}`)));
    assert.strictEqual((await lerReq(r0.id)).status, 'RASCUNHO');
  });

  await test('[RN-12] rascunho com familia ativa -> a E2 de hoje', async () => {
    const { R } = await par();
    const m = await material(R);
    const r0 = await criar([[m, 1]], { salvar_rascunho: true });
    await inativarMat(m);
    const r = await request(app).post(`/api/almoxarifado/requisicoes/${r0.id}/enviar`).send({});
    assert.strictEqual(r.body.error, E2(r0.numero, m.codigo, REATIVE));
  });

  console.log('\nRN-13 — a separacao');

  const aprovada = async (m, q) => {
    const r0 = await criar([[m, q]]);
    const ap = await aprovar(r0.id);
    assert.strictEqual(ap.status, 200, JSON.stringify(ap.body));
    return r0;
  };
  const separar = async (R, q) => {
    const [item] = await dbAll(db, 'SELECT * FROM itens_requisicao_almoxarifado WHERE requisicao_id = ? ORDER BY id', [R]);
    return as(ALMOX, () => request(app).put(`/api/almoxarifado/requisicoes/${R}/separar`)
      .send({ itens_separados: [{ item_id: item.id, quantidade_separada: q }] }));
  };
  for (const [rotulo, inativar] of [
    ['a família do material', (p) => inativarFam(p.R)],
    ['a subfamília do material', (p) => inativarFam(p.S)],
    ['a família e a subfamília do material', (p) => inativarFam(p.R, p.S)],
  ]) {
    // eslint-disable-next-line no-await-in-loop
    await test(`[RN-13] aprovada, depois material e familia inativados (escrita direta) -> E3 com "${rotulo}"`, async () => {
      const p = await par();
      const m = await material(p.R, p.S);
      const r0 = await aprovada(m, 2);
      await dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = 0, quantidade_atual = 5 WHERE id = ?', [m.id]);
      await inativar(p);
      const r = await separar(r0.id, 2);
      assert.strictEqual(r.status, 400, JSON.stringify(r.body));
      assert.strictEqual(r.body.error, E3(m.nome, REATIVE_F(rotulo)));
    });
  }

  await test('[RN-13] familia ativa -> a E3 de hoje', async () => {
    const p = await par();
    const m = await material(p.R, p.S);
    const r0 = await aprovada(m, 2);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET ativo = 0, quantidade_atual = 5 WHERE id = ?', [m.id]);
    const r = await separar(r0.id, 2);
    assert.strictEqual(r.body.error, E3(m.nome, REATIVE));
  });

  console.log('\nRN-15 — seguir a frase ate o fim funciona, com os corpos que a tela manda');

  await test('[RN-15] familia e subfamilia inativas: Almoxarife 403 na familia; Adm reativa R, S; Almoxarife reativa; aprova', async () => {
    const p = await par();
    const m = await material(p.R, p.S);
    const r0 = await pendenteCom([[m, 1]]);
    await inativarMat(m); await inativarFam(p.R, p.S);
    let r = await aprovar(r0.id);
    assert.strictEqual(r.body.error, E1(r0.numero, m.codigo, REATIVE_F(`a família e a subfamília de ${m.codigo}`)));
    // a ordem que a frase diz: sem a familia, o Reativar do material recusa
    r = await as(ALMOX, () => request(app).put(`/api/almoxarifado/materiais/${m.id}`).send({ ativo: 1 }));
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Família inativa — não é possível vincular novos itens');
    // quem: o Almoxarife nao reativa familia
    r = await as(ALMOX, () => request(app).put(`/api/almoxarifado/familias/${p.R.id}`).send({ nome: p.R.nome, ativo: 1 }));
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, PORTAO);
    // o Administrador do almoxarifado reativa, com o corpo do Reativar da aba (Fase 2, I1)
    for (const f of [p.R, p.S]) {
      // eslint-disable-next-line no-await-in-loop
      r = await as(ADM, () => request(app).put(`/api/almoxarifado/familias/${f.id}`).send({ nome: f.nome, ativo: 1 }));
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    }
    // o corpo do Reativar da tela de Materiais (Fase 2, I3)
    r = await as(ALMOX, () => request(app).put(`/api/almoxarifado/materiais/${m.id}`).send({ ativo: 1 }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    r = await aprovar(r0.id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  });

  await test('[RN-15] so a subfamilia: reativa S (Adm), o material (Almoxarife), aprova', async () => {
    const p = await par();
    const m = await material(p.R, p.S);
    const r0 = await pendenteCom([[m, 1]]);
    await inativarMat(m); await inativarFam(p.S);
    let r = await as(ALMOX, () => request(app).put(`/api/almoxarifado/materiais/${m.id}`).send({ ativo: 1 }));
    assert.strictEqual(r.body.error, 'Subfamília inválida para a família selecionada');
    r = await as(ADM, () => request(app).put(`/api/almoxarifado/familias/${p.S.id}`).send({ nome: p.S.nome, ativo: 1 }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    r = await as(ALMOX, () => request(app).put(`/api/almoxarifado/materiais/${m.id}`).send({ ativo: 1 }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    r = await aprovar(r0.id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
