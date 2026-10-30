/**
 * Etapa 192 (Compras), Task F1 — fornecedor com CPF e textos livres em maiusculas. RN-192.01 a RN-192.06.
 * Executar: cd server && node tests/api/comprasFornecedorCpfMaiusculas.api.test.js
 *
 * A porta VIVA de gravacao do fornecedor e `routes/compras/fornecedores.js` (registrada antes de
 * `routes/compras.js`, no index.js e no harness: o POST/PUT/GET inline de la nunca responde). O modal
 * F2 do pedido e da cotacao (FornecedorModal -> FornecedorFicha) e a tela do grupo homologado
 * (FornecedoresDoGrupo) gravam por ela — entao provar a rota cobre os tres gestos.
 *
 * O documento do pedido imprime o SNAPSHOT do fornecedor (RN-39.04): o CPF entra no snapshot
 * (`snap_fornecedor_cpf`), senao o pedido de um fornecedor so com CPF sairia sem documento fiscal.
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/compras/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 192, nome: 'Admin E192', role: 'admin' };
const CPF_INVALIDO = 'CPF inválido. Verifique os dígitos.';
const CPF_E_CNPJ = 'Preencha o CPF ou o CNPJ, não os dois.';

(async () => {
  console.log('\n═══ Etapa 192 — fornecedor: CPF e maiusculas (API) ═══\n');
  const { app, db, close } = await createTestApp({ user: ADMIN });

  const postF = (body) => request(app).post('/api/compras/fornecedores').send(body);
  const putF = (id, body) => request(app).put(`/api/compras/fornecedores/${id}`).send(body);
  const linha = (id) => dbGet(db, 'SELECT * FROM fornecedores WHERE id = ?', [id]);

  console.log('RN-192.01/02 — CPF validado pelos digitos e gravado com mascara');
  let idCpf = null;
  await test('POST com CPF so digitos -> 201, grava 529.982.247-25 e cnpj NULL', async () => {
    const r = await postF({ razao_social: 'Joao Pessoa Fisica', cpf: '52998224725' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    idCpf = r.body.id;
    const l = await linha(idCpf);
    assert.strictEqual(l.cpf, '529.982.247-25');
    assert.strictEqual(l.cnpj, null);
  });

  await test('POST com CPF mascarado tambem passa e grava igual', async () => {
    const r = await postF({ razao_social: 'Outra PF', cpf: '111.444.777-35' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual((await linha(r.body.id)).cpf, '111.444.777-35');
  });

  for (const ruim of ['52998224724', '111.111.111-11', '123', 'abc', '529982247250']) {
    // eslint-disable-next-line no-await-in-loop
    await test(`POST com CPF "${ruim}" -> 400 "${CPF_INVALIDO}" e nada gravado`, async () => {
      const antes = (await dbGet(db, 'SELECT COUNT(*) AS n FROM fornecedores')).n;
      const r = await postF({ razao_social: 'CPF Ruim', cpf: ruim });
      assert.strictEqual(r.status, 400, JSON.stringify(r.body));
      assert.strictEqual(r.body.error, CPF_INVALIDO);
      assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) AS n FROM fornecedores')).n, antes);
    });
  }

  await test('POST com cpf "" ou so espacos grava NULL (campo vazio nao e CPF invalido)', async () => {
    const r = await postF({ razao_social: 'Sem documento', cpf: '   ', cnpj: '' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const l = await linha(r.body.id);
    assert.strictEqual(l.cpf, null);
    assert.strictEqual(l.cnpj, null);
  });

  console.log('\nRN-192.03 — CPF e CNPJ juntos');
  await test(`POST com CPF e CNPJ -> 400 "${CPF_E_CNPJ}"`, async () => {
    const r = await postF({ razao_social: 'Os Dois', cpf: '529.982.247-25', cnpj: '54.984.382/0001-64' });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, CPF_E_CNPJ);
  });

  await test('PUT so com cnpj num fornecedor que ja tem CPF (cpf ausente) -> 400 dos dois; nada muda', async () => {
    const r = await putF(idCpf, { razao_social: 'Joao Pessoa Fisica', cnpj: '54.984.382/0001-64' });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, CPF_E_CNPJ);
    const l = await linha(idCpf);
    assert.strictEqual(l.cnpj, null);
    assert.strictEqual(l.cpf, '529.982.247-25');
  });

  await test('PUT trocando CPF por CNPJ no mesmo corpo (cpf "" + cnpj) -> 200, CPF limpo', async () => {
    const f = (await postF({ razao_social: 'Troca', cpf: '11144477735' })).body.id;
    const r = await putF(f, { razao_social: 'Troca', cpf: '', cnpj: '54.984.382/0001-64' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const l = await linha(f);
    assert.strictEqual(l.cpf, null);
    assert.strictEqual(l.cnpj, '54.984.382/0001-64');
  });

  await test('PUT cpf num fornecedor com CNPJ gravado (cnpj ausente) -> 400 dos dois', async () => {
    const f = (await postF({ razao_social: 'Tem CNPJ', cnpj: '54.984.382/0001-64' })).body.id;
    const r = await putF(f, { razao_social: 'Tem CNPJ', cpf: '529.982.247-25' });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, CPF_E_CNPJ);
  });

  await test('PUT com CPF invalido -> 400 "CPF inválido..."; o gravado continua', async () => {
    const r = await putF(idCpf, { razao_social: 'Joao Pessoa Fisica', cpf: '529.982.247-24' });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, CPF_INVALIDO);
    assert.strictEqual((await linha(idCpf)).cpf, '529.982.247-25');
  });

  await test('PUT sem a chave cpf (corpo do modal do grupo) nao mexe no CPF', async () => {
    const r = await putF(idCpf, { razao_social: 'Joao Pessoa Fisica', cnpj: '', email: 'x@y.com' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(idCpf)).cpf, '529.982.247-25');
  });

  await test('PUT com cpf num fornecedor que nao existe -> 404', async () => {
    const r = await putF(999999, { razao_social: 'Nada', cpf: '529.982.247-25' });
    assert.strictEqual(r.status, 404, JSON.stringify(r.body));
  });

  console.log('\nRN-192.04 — CPF na leitura e na busca');
  await test('GET /:id e a lista trazem cpf', async () => {
    const um = await request(app).get(`/api/compras/fornecedores/${idCpf}`);
    assert.strictEqual(um.body.cpf, '529.982.247-25');
    const lista = await request(app).get('/api/compras/fornecedores');
    assert.strictEqual(lista.body.find((f) => f.id === idCpf).cpf, '529.982.247-25');
  });

  await test('busca acha pelo CPF mascarado e so pelos digitos', async () => {
    const m = await request(app).get('/api/compras/fornecedores?search=529.982');
    assert.deepStrictEqual(m.body.map((f) => f.id), [idCpf]);
    const d = await request(app).get('/api/compras/fornecedores?search=52998224725');
    assert.deepStrictEqual(d.body.map((f) => f.id), [idCpf]);
  });

  console.log('\nRN-192.05 — textos livres em maiusculas (servidor)');
  let idMai = null;
  await test('POST grava os 7 textos livres em maiusculas com acento; email/telefones/cep/cnpj intactos', async () => {
    const r = await postF({
      razao_social: 'são joão peças ltda',
      nome_fantasia: 'Peças do João',
      cnpj: '54.984.382/0001-64',
      inscricao_estadual: 'isento',
      contato: 'Conceição',
      email: 'Vendas@Pecas.com.br',
      telefone: '(11) 4177-2311',
      telefone_vendedor: '(11) 98765-4321',
      endereco: 'rua ação, 10 - centro',
      cidade: 'são bernardo do campo',
      estado: 'sp',
      cep: '09614-000',
    });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(r.body.razao_social, 'SÃO JOÃO PEÇAS LTDA', 'a resposta devolve o que gravou');
    assert.strictEqual(r.body.nome_fantasia, 'PEÇAS DO JOÃO');
    idMai = r.body.id;
    const l = await linha(idMai);
    assert.strictEqual(l.razao_social, 'SÃO JOÃO PEÇAS LTDA');
    assert.strictEqual(l.nome_fantasia, 'PEÇAS DO JOÃO');
    assert.strictEqual(l.inscricao_estadual, 'ISENTO');
    assert.strictEqual(l.contato, 'CONCEIÇÃO');
    assert.strictEqual(l.endereco, 'RUA AÇÃO, 10 - CENTRO');
    assert.strictEqual(l.cidade, 'SÃO BERNARDO DO CAMPO');
    assert.strictEqual(l.estado, 'SP');
    assert.strictEqual(l.email, 'Vendas@Pecas.com.br');
    assert.strictEqual(l.telefone, '(11) 4177-2311');
    assert.strictEqual(l.telefone_vendedor, '(11) 98765-4321');
    assert.strictEqual(l.cep, '09614-000');
    assert.strictEqual(l.cnpj, '54.984.382/0001-64');
  });

  await test('PUT tambem grava em maiusculas', async () => {
    const r = await putF(idMai, { razao_social: 'nova razão', contato: 'maria', cidade: 'diadema', estado: 'sp' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const l = await linha(idMai);
    assert.strictEqual(l.razao_social, 'NOVA RAZÃO');
    assert.strictEqual(l.contato, 'MARIA');
    assert.strictEqual(l.cidade, 'DIADEMA');
    assert.strictEqual(l.estado, 'SP');
    assert.strictEqual(l.email, 'Vendas@Pecas.com.br', 'chave ausente nao mexe');
  });

  await test('busca com o termo minusculo e acentuado acha o gravado em maiusculas', async () => {
    const r = await request(app).get('/api/compras/fornecedores?search=nova razão');
    assert.deepStrictEqual(r.body.map((f) => f.id), [idMai]);
  });

  console.log('\nRN-192.06 — os ja cadastrados nao sao convertidos; passam ao salvar de novo');
  await test('fornecedor legado minusculo continua minusculo ate ser salvo; salvo, vira maiusculo', async () => {
    const leg = (await dbRun(db, "INSERT INTO fornecedores (razao_social, cidade, status) VALUES ('legado ltda', 'santo andré', 'ativo')")).lastID;
    const g = await request(app).get(`/api/compras/fornecedores/${leg}`);
    assert.strictEqual(g.body.razao_social, 'legado ltda', 'a leitura nao converte');
    const r = await putF(leg, { razao_social: 'legado ltda', cidade: 'santo andré' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const l = await linha(leg);
    assert.strictEqual(l.razao_social, 'LEGADO LTDA');
    assert.strictEqual(l.cidade, 'SANTO ANDRÉ');
  });

  console.log('\nRN-192.04 — documento do pedido com o CPF do fornecedor (snapshot)');
  await test('pedido de fornecedor so com CPF: documento mostra "CPF" com o numero e nao a linha de CNPJ', async () => {
    const mat = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, custo_medio, ativo)
      VALUES ('E192-1', 'Material E192', 'PC', 0, 0, 1)`)).lastID;
    const p = await request(app).post('/api/compras/pedidos').send({
      fornecedor_id: idCpf, data_pedido: '2026-10-30',
      itens: [{ material_id: mat, quantidade: 1, valor_unitario: 10 }],
    });
    assert.strictEqual(p.status, 201, JSON.stringify(p.body));
    const snap = await dbGet(db, 'SELECT snap_fornecedor_cpf, snap_fornecedor_cnpj FROM pedidos_compra WHERE id = ?', [p.body.id]);
    assert.strictEqual(snap.snap_fornecedor_cpf, '529.982.247-25');
    assert.strictEqual(snap.snap_fornecedor_cnpj, null);
    const leitura = await request(app).get(`/api/compras/pedidos/${p.body.id}`);
    assert.strictEqual(leitura.body.fornecedor.cpf, '529.982.247-25');

    // O snapshot congela: trocar o CPF do cadastro depois nao muda o papel.
    await dbRun(db, "UPDATE fornecedores SET cpf = '111.444.777-35' WHERE id = ?", [idCpf]);
    const html = (await request(app).get(`/api/compras/pedidos/${p.body.id}/documento`)).text;
    await dbRun(db, "UPDATE fornecedores SET cpf = '529.982.247-25' WHERE id = ?", [idCpf]);
    const bloco = html.slice(html.indexOf('Dados do fornecedor'));
    assert.ok(/<th>CPF<\/th><td>529\.982\.247-25<\/td>/.test(bloco), 'linha CPF no bloco do fornecedor: ' + bloco.slice(0, 600));
    assert.ok(!/<th>CNPJ<\/th>/.test(bloco.slice(0, bloco.indexOf('</table>'))), 'sem a linha CNPJ do fornecedor');
  });

  await test('pedido de fornecedor com CNPJ continua com a linha CNPJ', async () => {
    const f = (await postF({ razao_social: 'Com CNPJ Doc', cnpj: '54.984.382/0001-64' })).body.id;
    const mat = (await dbGet(db, "SELECT id FROM materiais_almoxarifado WHERE codigo = 'E192-1'")).id;
    const p = await request(app).post('/api/compras/pedidos').send({
      fornecedor_id: f, data_pedido: '2026-10-30', itens: [{ material_id: mat, quantidade: 1, valor_unitario: 10 }],
    });
    assert.strictEqual(p.status, 201, JSON.stringify(p.body));
    const html = (await request(app).get(`/api/compras/pedidos/${p.body.id}/documento`)).text;
    const bloco = html.slice(html.indexOf('Dados do fornecedor'));
    assert.ok(/<th>CNPJ<\/th><td>54\.984\.382\/0001-64<\/td>/.test(bloco));
    assert.ok(!/<th>CPF<\/th>/.test(bloco.slice(0, bloco.indexOf('</table>'))));
  });

  console.log('\nImportacao de pedidos — o fornecedor gravado em maiusculas / so com CPF continua achavel');
  await test('planilha com a razao minuscula acentuada acha o fornecedor gravado em maiusculas', async () => {
    const svc = require('../../services/compras/pedidoCompraService');
    const f = (await postF({ razao_social: 'aços são paulo' })).body.id;
    const achado = await svc.resolverFornecedorDaLinha(db, { fornecedor: 'aços são paulo' });
    assert.ok(achado, 'nao achou pela razao minuscula');
    assert.strictEqual(achado.id, f);
  });

  await test('planilha com o CPF (so digitos) na coluna do fornecedor acha o fornecedor so com CPF', async () => {
    const svc = require('../../services/compras/pedidoCompraService');
    const achado = await svc.resolverFornecedorDaLinha(db, { cnpj: '52998224725' });
    assert.ok(achado, 'nao achou pelo CPF');
    assert.strictEqual(achado.id, idCpf);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('Erro fatal:', e);
  process.exit(1);
});
