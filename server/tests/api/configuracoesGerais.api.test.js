/**
 * Amarração entre a aba "Configurações Gerais" e o servidor.
 *
 * O DEFEITO QUE ORIGINOU ESTE ARQUIVO: a tela declarava a chave
 * `permitir_saida_saldo_negativo` e o motor de estoque lia `permite_saldo_negativo_global`
 * (stockService, guarda de saída). Não havia tradução entre as duas. O administrador ligava
 * "Permitir Saída com Saldo Negativo", recebia "Configurações salvas!" e continuava tomando
 * recusa por saldo insuficiente. Seis das oito chaves da tela estavam nessa situação — ou com
 * nome divergente, ou sem existir do lado do servidor.
 *
 * POR QUE O TESTE MORA AQUI, NO SERVIDOR, E LÊ O ARQUIVO DO CLIENTE.
 * A amarração que faltava cruza a fronteira cliente↔servidor, então um teste de um lado só não
 * pega nada: no servidor, comparar `getConfig` com o seed é o servidor conferindo consigo mesmo;
 * no cliente, comparar CAMPOS com uma lista escrita à mão no próprio teste é a mesma mentira um
 * nível acima. Este lado é o único que consegue provar o elo inteiro — ele lê a lista REAL da
 * tela do disco e, contra um banco que passou pelo `initSchema` DE VERDADE, exige que cada
 * chave (1) exista como linha semeada e (2) tenha um leitor de verdade no código do servidor.
 * O cliente não tem banco nem `initSchema` para conferir contra.
 *
 * ANTI-TESTE-VAZIO: se o arquivo da tela sumir, se o bloco `const CAMPOS = [` mudar de forma ou
 * se a varredura por leitores não achar arquivo nenhum, o teste FALHA em vez de passar com zero
 * iterações — os laços abaixo nunca são a única asserção.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const TELA = path.join(__dirname, '..', '..', '..', 'client', 'src', 'components',
  'almoxarifado', 'ConfiguracoesAlmoxarifado.js');

/** Extrai a lista `CAMPOS` da aba Configurações Gerais: [{ chave, label }]. */
function lerCamposDaTela() {
  const src = fs.readFileSync(TELA, 'utf8');
  const bloco = src.match(/const CAMPOS = \[([\s\S]*?)\n {2}\];/);
  if (!bloco) {
    throw new Error(`bloco "const CAMPOS = [" não encontrado em ${TELA} — se a tela foi `
      + 'reestruturada, ajuste este parser; NÃO deixe o teste passar sem conferir nada');
  }
  const campos = [];
  const re = /\{\s*chave:\s*'([^']+)'\s*,\s*label:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(bloco[1])) !== null) campos.push({ chave: m[1], label: m[2] });
  return campos;
}

/** Todos os .js de rotas e serviços do servidor, exceto o seed e os próprios testes. */
function fontesDoServidor() {
  const raizes = [path.join(__dirname, '..', '..', 'routes'), path.join(__dirname, '..', '..', 'services')];
  const arquivos = [];
  const anda = (dir) => {
    for (const nome of fs.readdirSync(dir)) {
      const p = path.join(dir, nome);
      if (fs.statSync(p).isDirectory()) anda(p);
      else if (nome.endsWith('.js') && nome !== 'schema.js') arquivos.push(p);
    }
  };
  raizes.forEach(anda);
  return arquivos;
}

(async () => {
  // canConfigureAlmox NAO aceita role 'admin' sozinho — as rotas de configuracao exigem
  // perfil ADMINISTRADOR do modulo (ou superadmin). Sem isso o PUT volta 403 e os testes
  // de contrato passariam "verdes" sem nunca ter escrito nada.
  const { app, db, close } = await createTestApp({
    user: { id: 1, nome: 'Admin Almox', role: 'admin', perfil_almoxarifado: 'ADMINISTRADOR' },
  });

  const campos = lerCamposDaTela();
  const fontes = fontesDoServidor();

  // ── Guardas anti-teste-vazio: as duas varreduras precisam ter achado alguma coisa ──
  await test('[guarda] a varredura achou os campos da tela e as fontes do servidor', async () => {
    assert.ok(campos.length >= 1, 'nenhum campo lido de CAMPOS — parser quebrado, não tela vazia');
    assert.ok(fontes.length >= 20, `varredura do servidor achou só ${fontes.length} arquivos — caminho errado`);
    // Controle positivo do scanner: uma chave que o servidor comprovadamente lê tem de ser
    // encontrada, e uma chave inventada NÃO. Sem isto, "achei leitor para tudo" não prova nada.
    const temLeitor = (chave) => fontes.some(f => fs.readFileSync(f, 'utf8').includes(`'${chave}'`));
    assert.ok(temLeitor('permite_saldo_negativo_global'), 'scanner não acha chave que o motor lê');
    assert.ok(!temLeitor('chave_que_nunca_existiu_zzz'), 'scanner acha chave inexistente — está mentindo');
  });

  await test('toda chave da tela está SEMEADA em configuracoes_almoxarifado', async () => {
    for (const { chave, label } of campos) {
      const row = await dbGet(db, 'SELECT valor FROM configuracoes_almoxarifado WHERE chave = ?', [chave]);
      assert.ok(row, `"${label}" usa a chave '${chave}', que o schema.js não semeia — `
        + 'o formulário grava numa chave que não existe e a opção não faz nada');
    }
  });

  await test('toda chave da tela tem LEITOR de verdade no servidor', async () => {
    for (const { chave, label } of campos) {
      const leitores = fontes.filter(f => fs.readFileSync(f, 'utf8').includes(`'${chave}'`));
      assert.ok(leitores.length >= 1, `"${label}" usa a chave '${chave}', que nenhuma rota nem `
        + 'serviço lê — o administrador liga a opção e nada muda');
    }
  });

  await test('o controle de saldo negativo aponta para a chave que o MOTOR lê', async () => {
    const campo = campos.find(c => /saldo negativo/i.test(c.label));
    assert.ok(campo, 'a tela deixou de oferecer o controle de saldo negativo');
    assert.strictEqual(campo.chave, 'permite_saldo_negativo_global',
      'chave do controle divergiu da que stockService.registrarMovimentacao consulta');
  });

  // ── Contrato do endpoint: forma que a tela consome / envia ──

  await test('GET /configuracoes devolve MAPA { chave: { valor } }, não array', async () => {
    const res = await request(app).get('/api/almoxarifado/configuracoes');
    assert.strictEqual(res.status, 200);
    assert.ok(!Array.isArray(res.body), 'virou array — o loadConfigs da tela lê Object.entries');
    for (const { chave } of campos) {
      assert.ok(res.body[chave], `GET não devolveu a chave '${chave}'`);
      assert.ok(Object.prototype.hasOwnProperty.call(res.body[chave], 'valor'),
        `GET devolveu '${chave}' sem a propriedade 'valor'`);
    }
  });

  await test('PUT /configuracoes aceita corpo achatado { chave: valor } e persiste', async () => {
    const res = await request(app).put('/api/almoxarifado/configuracoes')
      .send({ permite_saldo_negativo_global: '1' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const row = await dbGet(db, "SELECT valor FROM configuracoes_almoxarifado WHERE chave = 'permite_saldo_negativo_global'");
    assert.strictEqual(row.valor, '1');
    const get = await request(app).get('/api/almoxarifado/configuracoes');
    assert.strictEqual(get.body.permite_saldo_negativo_global.valor, '1');
  });

  await test('PUT com chave desconhecida é 400 e NÃO cria linha órfã', async () => {
    const res = await request(app).put('/api/almoxarifado/configuracoes')
      .send({ permitir_saida_saldo_negativo: '1' });
    assert.strictEqual(res.status, 400, `chave inventada foi aceita: ${JSON.stringify(res.body)}`);
    const row = await dbGet(db, "SELECT valor FROM configuracoes_almoxarifado WHERE chave = 'permitir_saida_saldo_negativo'");
    assert.strictEqual(row, undefined, 'chave inventada virou linha no banco');
  });

  await test('PUT com envelope antigo { configuracoes: [...] } é 400, não grava lixo', async () => {
    const res = await request(app).put('/api/almoxarifado/configuracoes')
      .send({ configuracoes: [{ chave: 'permite_saldo_negativo_global', valor: '1' }] });
    assert.strictEqual(res.status, 400, 'envelope antigo aceito de novo');
    const row = await dbGet(db, "SELECT valor FROM configuracoes_almoxarifado WHERE chave = 'configuracoes'");
    assert.strictEqual(row, undefined, "gravou a linha lixo de chave 'configuracoes'");
  });

  await test('PUT rejeita uma chave desconhecida sem aplicar as boas do mesmo corpo', async () => {
    await request(app).put('/api/almoxarifado/configuracoes').send({ aprovacao_automatica: '0' });
    const res = await request(app).put('/api/almoxarifado/configuracoes')
      .send({ aprovacao_automatica: '1', chave_inventada_zzz: 'x' });
    assert.strictEqual(res.status, 400);
    const row = await dbGet(db, "SELECT valor FROM configuracoes_almoxarifado WHERE chave = 'aprovacao_automatica'");
    assert.strictEqual(row.valor, '0', 'aplicou parte do corpo antes de rejeitar o resto');
  });

  // ── Revisao final da Etapa 11 (achado 4, medido): as chaves reposicao_* sao dias — o motor
  // (purchaseService.lerConfigNumero) cai no default em silencio para qualquer valor que nao
  // seja numero finito > 0. Sem validacao na rota, '0'/''/'-7' salvavam com 200 e o
  // administrador achava que tinha mudado a janela sem nada mudar. ──

  await test('PUT reposicao_janela_consumo_dias "0" e recusado (400 literal), nao grava', async () => {
    const antes = await dbGet(db, "SELECT valor FROM configuracoes_almoxarifado WHERE chave = 'reposicao_janela_consumo_dias'");
    const res = await request(app).put('/api/almoxarifado/configuracoes')
      .send({ reposicao_janela_consumo_dias: '0' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'Configuração "reposicao_janela_consumo_dias" deve ser um número de dias maior que zero');
    const depois = await dbGet(db, "SELECT valor FROM configuracoes_almoxarifado WHERE chave = 'reposicao_janela_consumo_dias'");
    assert.strictEqual(depois.valor, antes.valor, 'valor rejeitado nao pode ter sido gravado');
  });

  await test('PUT reposicao_dias_sem_consumo "" e "-7" tambem sao recusados (400 literal)', async () => {
    let res = await request(app).put('/api/almoxarifado/configuracoes').send({ reposicao_dias_sem_consumo: '' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'Configuração "reposicao_dias_sem_consumo" deve ser um número de dias maior que zero');

    res = await request(app).put('/api/almoxarifado/configuracoes').send({ reposicao_dias_sem_consumo: '-7' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'Configuração "reposicao_dias_sem_consumo" deve ser um número de dias maior que zero');
  });

  await test('PUT reposicao_janela_consumo_dias "30" persiste E o motor de sugestao reflete de verdade (round-trip)', async () => {
    const put = await request(app).put('/api/almoxarifado/configuracoes')
      .send({ reposicao_janela_consumo_dias: '30' });
    assert.strictEqual(put.status, 200, JSON.stringify(put.body));

    const sug = await request(app).get('/api/almoxarifado/reposicao/sugestoes');
    assert.strictEqual(sug.status, 200, JSON.stringify(sug.body));
    assert.strictEqual(sug.body.janela_dias, 30, JSON.stringify(sug.body.janela_dias));

    // devolve o default para nao vazar estado para as outras suites de reposicao
    const volta = await request(app).put('/api/almoxarifado/configuracoes')
      .send({ reposicao_janela_consumo_dias: '90' });
    assert.strictEqual(volta.status, 200, JSON.stringify(volta.body));
  });

  // ── A opção, ligada, tem de FAZER o que promete ──

  const material = async (qtd) => {
    const r = await dbRun(db,
      `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo)
       VALUES (?,?,'UN',?,1)`,
      [`CFG-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, 'Material config', qtd]);
    return r.lastID;
  };

  await test('config DESLIGADA: saída acima do saldo é recusada e o saldo não muda', async () => {
    // O 200 do PUT é asserção, não formalidade: se ele voltasse 403 este teste continuaria
    // verde pelo valor padrão do seed, sem nunca ter exercitado a rota.
    const put = await request(app).put('/api/almoxarifado/configuracoes')
      .send({ permite_saldo_negativo_global: '0' });
    assert.strictEqual(put.status, 200, JSON.stringify(put.body));
    const mat = await material(5);
    const res = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 20, motivo: 'teste config' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, 5, 'recusou mas mexeu no saldo');
  });

  await test('config LIGADA pela rota: a MESMA saída passa e o saldo fica negativo', async () => {
    const put = await request(app).put('/api/almoxarifado/configuracoes')
      .send({ permite_saldo_negativo_global: '1' });
    assert.strictEqual(put.status, 200, JSON.stringify(put.body));
    const mat = await material(5);
    const res = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 20, motivo: 'teste config' });
    assert.strictEqual(res.status, 201, `motor não honrou a config: ${JSON.stringify(res.body)}`);
    const m = await dbGet(db, 'SELECT quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [mat]);
    assert.strictEqual(m.quantidade_atual, -15, 'saída aceita mas saldo não foi debitado');
  });

  await test('desligar de novo pela rota volta a recusar (não fica ligado para sempre)', async () => {
    const put = await request(app).put('/api/almoxarifado/configuracoes')
      .send({ permite_saldo_negativo_global: '0' });
    assert.strictEqual(put.status, 200, JSON.stringify(put.body));
    const mat = await material(5);
    const res = await request(app).post('/api/almoxarifado/movimentacoes')
      .send({ material_id: mat, tipo: 'SAIDA', quantidade: 20, motivo: 'teste config' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
