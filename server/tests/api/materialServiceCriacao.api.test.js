/**
 * Etapa 8c, Task 1 — a criacao de material sai do handler HTTP e vira servico, e o gerador de
 * codigo passa a aguentar lote.
 *
 * Por que este arquivo existe: a decisao 6 do design manda a tela oferecer um atalho de criar o
 * material resultante da transformacao. Nao havia funcao de criar material — so um INSERT inline
 * no handler (routes/almoxarifado.js:454) — e o gerador de codigo montava o proximo numero com
 * ORDER BY id DESC LIMIT 1, que repete quando se pede N codigos seguidos.
 *
 * O alvo aqui e REFACTOR SEM MUDANCA DE COMPORTAMENTO. Por isso os testes-guarda comparam a linha
 * gravada pela ROTA com a linha gravada pelo SERVICO, campo a campo, em vez de conferir uma lista
 * de campos escolhida a dedo: lista a dedo aprova o refactor que esqueceu a coluna que ninguem
 * lembrou de listar.
 *
 * Executar: cd server && node tests/api/materialServiceCriacao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const materialService = require('../../services/almoxarifado/materialService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
// Perfil EXPLICITO: getPerfilFromUser faz fallback para PRODUCAO, entao "usuario sem perfil" nao e
// "sem acesso" — e chao de fabrica, e o teste passaria pelo motivo errado.
const PRODUCAO = { id: 3, nome: 'Chao de fabrica', email: 'prod@test.com', perfil_almoxarifado: 'PRODUCAO' };
const ENGENHARIA = { id: 4, nome: 'Engenharia', email: 'eng@test.com', perfil_almoxarifado: 'ENGENHARIA' };

/** Colunas que NAO podem ser comparadas entre duas criacoes (mudam por definicao). */
const VOLATEIS = new Set(['id', 'codigo', 'nome', 'created_at', 'updated_at']);

(async () => {
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });

  const familia = await dbRun(db,
    "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('CHP','Chapas',1)");
  const FAM = familia.lastID;
  const subfam = await dbRun(db,
    "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo, parent_id) VALUES ('CHP-INOX','Chapas inox',1,?)",
    [FAM]);
  const SUB = subfam.lastID;
  const inativa = await dbRun(db,
    "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('OLD','Familia morta',0)");
  const FAM_INATIVA = inativa.lastID;

  /** Corpo completo — de proposito com MUITOS campos, para o guarda de refactor ter o que comparar. */
  const corpo = (over = {}) => ({
    codigo: 'X', nome: 'Chapa de teste', familia_id: FAM, subfamilia_id: SUB,
    descricao: 'descricao', categoria: 'Materia-prima', unidade: 'KG',
    quantidade_atual: 0, quantidade_minima: 5, quantidade_maxima: 50,
    custo_unitario: 12.5, fornecedor_principal: 'Fornecedor A', codigo_fornecedor: 'F-1',
    ncm: '7208', especificacoes: 'ASTM A36', observacoes: 'obs',
    descricao_tecnica: 'tecnica', material_critico: 1, controle_lote: 1, controle_certificado: 1,
    fabricante: 'Fab', codigo_fabricante: 'CF-1', peso_unitario: 7.85, dimensoes: '1000x2000',
    material_construtivo: 'Aco', norma: 'A36', marca: 'M', modelo: 'MO', aplicacao: 'estrutura',
    ponto_reposicao: 10, lote_economico: 100, controle_serie: 0, controle_validade: 0,
    controle_corrida: 1, requer_inspecao: 1, requer_foto: 0, classe_abc: 'A',
    unidade_compra: 'KG', fator_conversao_compra: 1, unidade_consumo: 'KG', fator_conversao_consumo: 1,
    ...over,
  });

  // ══ Refactor sem mudanca de comportamento ═══════════════════════════════════════════════════

  await test('createMaterial extraido produz a MESMA linha que a rota, campo a campo', async () => {
    setUser(ADMIN);
    const r = await request(app).post('/api/almoxarifado/materiais')
      .send(corpo({ codigo: 'CMP-ROTA', nome: 'Pela rota' }));
    assert.strictEqual(r.status, 201, `a rota devolveu ${r.status}: ${JSON.stringify(r.body)}`);
    const doServico = await materialService.createMaterial(db, ADMIN,
      corpo({ codigo: 'CMP-SVC', nome: 'Pelo servico' }));

    const a = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE codigo = ?', ['CMP-ROTA']);
    const b = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [doServico.id]);
    const divergentes = Object.keys(a)
      .filter((k) => !VOLATEIS.has(k))
      .filter((k) => String(a[k]) !== String(b[k]))
      .map((k) => `${k}: rota=${a[k]} servico=${b[k]}`);
    assert.deepStrictEqual(divergentes, [],
      `o refactor mudou comportamento nestas colunas:\n  ${divergentes.join('\n  ')}`);
  });

  await test('createMaterial grava a movimentacao de saldo inicial igual a rota', async () => {
    // Efeito colateral que mora DENTRO do handler hoje (routes/almoxarifado.js:459-464) e que um
    // refactor "so mover o INSERT" perde em silencio — o material nasceria com saldo e sem historia.
    setUser(ADMIN);
    await request(app).post('/api/almoxarifado/materiais')
      .send(corpo({ codigo: 'MOV-ROTA', nome: 'Rota com saldo', quantidade_atual: 40 }));
    const doServico = await materialService.createMaterial(db, ADMIN,
      corpo({ codigo: 'MOV-SVC', nome: 'Servico com saldo', quantidade_atual: 40 }));
    const daRota = await dbGet(db, 'SELECT id FROM materiais_almoxarifado WHERE codigo = ?', ['MOV-ROTA']);

    const movs = await dbAll(db,
      'SELECT material_id, tipo, quantidade, saldo_anterior, saldo_posterior, motivo FROM movimentacoes_almoxarifado WHERE material_id IN (?,?) ORDER BY material_id',
      [daRota.id, doServico.id]);
    assert.strictEqual(movs.length, 2, 'o servico nao gravou a movimentacao de saldo inicial');
    assert.strictEqual(movs[0].tipo, movs[1].tipo);
    assert.strictEqual(movs[1].tipo, 'ENTRADA');
    assert.strictEqual(movs[1].quantidade, 40);
    assert.strictEqual(movs[1].saldo_anterior, 0);
    assert.strictEqual(movs[1].saldo_posterior, 40);
    assert.strictEqual(movs[1].motivo, 'Saldo inicial de cadastro');
  });

  await test('[CONTROLE POSITIVO] material com quantidade 0 NAO gera movimentacao', async () => {
    // A metade que falta: "sempre grava movimentacao" passaria no teste acima e sujaria o extrato
    // de todo material cadastrado sem saldo.
    const m = await materialService.createMaterial(db, ADMIN, corpo({ codigo: 'MOV-ZERO', nome: 'Sem saldo', quantidade_atual: 0 }));
    const n = await dbGet(db, 'SELECT COUNT(*) AS n FROM movimentacoes_almoxarifado WHERE material_id = ?', [m.id]);
    assert.strictEqual(n.n, 0);
  });

  await test('createMaterial devolve a linha COM familia_nome e familia_codigo, como a rota', async () => {
    const m = await materialService.createMaterial(db, ADMIN, corpo({ codigo: 'ENR-1', nome: 'Enriquecido' }));
    assert.strictEqual(m.familia_codigo, 'CHP');
    assert.strictEqual(m.familia_nome, 'Chapas');
  });

  await test('createMaterial registra auditoria de CRIACAO', async () => {
    const m = await materialService.createMaterial(db, ADMIN, corpo({ codigo: 'AUD-1', nome: 'Auditado' }));
    // Tabela `auditoria_log_almoxarifado` (schema.js:1314) — o plano da 8c escreveu
    // `auditoria_almoxarifado` neste teste, que nao existe: o dbGet estourava SQLITE_ERROR e o
    // teste falhava por motivo errado, sem provar nada sobre a auditoria.
    const aud = await dbGet(db,
      "SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'material' AND entidade_id = ?", [m.id]);
    assert.ok(aud, 'a criacao pelo servico nao deixou registro de auditoria');
    assert.strictEqual(aud.acao, 'CRIACAO');
  });

  // ══ As recusas que existiam no handler continuam existindo ══════════════════════════════════

  await test('familia inativa e recusada com 400 e a mensagem original', async () => {
    await assert.rejects(
      () => materialService.createMaterial(db, ADMIN, corpo({ codigo: 'INA-1', familia_id: FAM_INATIVA, subfamilia_id: null })),
      (e) => {
        assert.strictEqual(e.status, 400);
        assert.match(e.message, /Família inativa/);
        return true;
      });
  });

  await test('subfamilia de outra familia e recusada com 400', async () => {
    const outra = await dbRun(db,
      "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('OUT','Outra',1)");
    await assert.rejects(
      () => materialService.createMaterial(db, ADMIN, corpo({ codigo: 'SUB-1', familia_id: outra.lastID })),
      (e) => {
        assert.strictEqual(e.status, 400);
        assert.match(e.message, /Subfamília inválida/);
        return true;
      });
  });

  await test('codigo repetido SEM codigo_auto continua dando 400 "Código já existe"', async () => {
    await materialService.createMaterial(db, ADMIN, corpo({ codigo: 'DUP-1', nome: 'Primeiro' }));
    await assert.rejects(
      () => materialService.createMaterial(db, ADMIN, corpo({ codigo: 'DUP-1', nome: 'Segundo' })),
      (e) => {
        assert.strictEqual(e.status, 400);
        assert.strictEqual(e.message, 'Código já existe');
        return true;
      });
  });

  await test('a rota continua respondendo 403 para quem nao tem criar_material', async () => {
    // O gate mora na ROTA (requirePermission('criar_material')), nao no servico: o servico e
    // chamado por caminhos internos que ja passaram pelo gate deles. Mover o gate para dentro
    // quebraria esses caminhos; nao testa-lo deixaria o refactor tirar o gate sem ninguem ver.
    setUser(PRODUCAO);
    const r = await request(app).post('/api/almoxarifado/materiais').send(corpo({ codigo: 'P-403' }));
    assert.strictEqual(r.status, 403);
    const existe = await dbGet(db, 'SELECT id FROM materiais_almoxarifado WHERE codigo = ?', ['P-403']);
    assert.strictEqual(existe, undefined, 'o 403 aconteceu DEPOIS do INSERT');
    setUser(ADMIN);
  });

  await test('[CONTROLE POSITIVO] ENGENHARIA, que tem criar_material, cria pela rota', async () => {
    // Sem isto, "403 sempre" passaria no teste acima. E ENGENHARIA importa: e o perfil que a
    // Task 9 encontra criando o material-peca SEM poder transformar (gates diferentes).
    setUser(ENGENHARIA);
    const r = await request(app).post('/api/almoxarifado/materiais').send(corpo({ codigo: 'ENG-OK' }));
    assert.strictEqual(r.status, 201, `ENGENHARIA levou ${r.status}: ${JSON.stringify(r.body)}`);
    setUser(ADMIN);
  });

  // ══ proximo-codigo em lote ══════════════════════════════════════════════════════════════════

  await test('proximo-codigo usa o MAIOR numero, nao o material de maior id', async () => {
    // O bug real: ORDER BY id DESC LIMIT 1. Cadastrar CHP-010 e depois CHP-002 fazia o gerador
    // olhar CHP-002 (id maior) e propor CHP-003, que ja podia existir.
    const fam = await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('MAX','Max',1)");
    await materialService.createMaterial(db, ADMIN, corpo({ codigo: 'MAX-010', nome: 'Dez', familia_id: fam.lastID, subfamilia_id: null }));
    await materialService.createMaterial(db, ADMIN, corpo({ codigo: 'MAX-002', nome: 'Dois', familia_id: fam.lastID, subfamilia_id: null }));
    assert.strictEqual(await materialService.proximoCodigo(db, fam.lastID), 'MAX-011');
  });

  await test('proximo-codigo em LOTE nao repete: 5 criacoes concorrentes dao 5 codigos distintos', async () => {
    // O caso da 8c: uma chapa vira 5 pecas e a tela cria os 5 materiais. Com o gerador chamado
    // em paralelo, as 5 chamadas devolvem O MESMO numero — por isso `codigo_auto` existe: o
    // codigo vira sugestao e a colisao UNIQUE faz o servico regerar.
    const fam = await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('LOT','Lote',1)");
    const F = fam.lastID;
    const sugestao = await materialService.proximoCodigo(db, F);
    assert.strictEqual(sugestao, 'LOT-001');

    const criados = await Promise.all([1, 2, 3, 4, 5].map((i) => materialService.createMaterial(db, ADMIN,
      corpo({ codigo: sugestao, codigo_auto: 1, nome: `Peca ${i}`, familia_id: F, subfamilia_id: null }))));
    const codigos = criados.map((m) => m.codigo);
    assert.strictEqual(new Set(codigos).size, 5,
      `o lote repetiu codigo: ${codigos.join(', ')}`);
    for (const c of codigos) assert.match(c, /^LOT-\d{3}$/, `codigo fora do padrao: ${c}`);
    const noBanco = await dbGet(db, "SELECT COUNT(*) AS n FROM materiais_almoxarifado WHERE codigo LIKE 'LOT-%'");
    assert.strictEqual(noBanco.n, 5, 'nem todas as 5 pecas foram gravadas');
  });

  await test('GET /proximo-codigo devolve o mesmo numero que materialService.proximoCodigo', async () => {
    // Duas contas dariam uma tela que discorda do servico — o mesmo erro que a 8b evitou
    // calculando `vencida` no SQL em vez de no client.
    //
    // ROT-007 e DEPOIS ROT-003 de proposito (achado da sabotagem S2): com um material so, a rota
    // devolve ROT-008 tanto pelo MAX quanto pelo velho ORDER BY id DESC — o cenario nao sabia
    // distinguir os dois, e a sabotagem que voltava o ORDER BY derrubava so o teste do servico. A
    // rota e o caminho que a TELA usa; ela precisa provar o MAX por conta propria, nao so
    // concordar com o servico (concordar e barato agora que a rota delega para ele).
    const fam = await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('ROT','Rota',1)");
    await materialService.createMaterial(db, ADMIN, corpo({ codigo: 'ROT-007', nome: 'Sete', familia_id: fam.lastID, subfamilia_id: null }));
    await materialService.createMaterial(db, ADMIN, corpo({ codigo: 'ROT-003', nome: 'Tres', familia_id: fam.lastID, subfamilia_id: null }));
    const r = await request(app).get(`/api/almoxarifado/proximo-codigo?familia_id=${fam.lastID}`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.codigo, 'ROT-008', `a ROTA nao usou o MAIOR numero: devolveu ${r.body.codigo}`);
    assert.strictEqual(r.body.codigo, await materialService.proximoCodigo(db, fam.lastID));
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
