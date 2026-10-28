/**
 * Frota Etapa 8 — T2 (integracao): a fiacao inteira da etapa, pela rota (login REAL) e pelo servico, cruzando os cinco galhos.
 *
 *   RN-F8.38  Pela rota: o gestor libera o veiculo (PUT /veiculos uso_funcionarios) -> a Ana (login real) ve a marca e os destinos no
 *             /portal/inicio -> cadastra "Obra Beta" pelo POST /destinos -> saida com destino_id + condutor, SEM origem -> viagem
 *             origem GMP, destino pelo nome, destino_id, condutor -> /portal/inicio.viagem_aberta.condutor_nome -> o gestor ve a
 *             linha em GET /viagens e acha por ?search=Carlos -> a planilha (exportar.xlsx) traz Condutor Carlos (nao Ana) ->
 *             o retorno conclui com km_rodado -> renomear o destino nao muda a viagem -> desativar some do inicio e a saida nova -> 400
 *   RN-F8.39  Pelo servico: createDestino + portalService.registrar (sem HTTP) -> as mesmas gravacoes lidas por SQL; sem condutor -> 400
 *   RN-F8.40  Perfis pela fiacao real: ADMIN_FROTA dado pela tela chega ao pedido seguinte da Ana (ela abre /perfis-usuario e DA perfil ao
 *             Bruno); o sync do nucleo com a lista ATUAL nao desfaz; com a lista VELHA ('[]') mede-se o que acontece com admin_modulos e
 *             com a linha espelho; o gesto inteiro do cadastro de usuario (coluna + sync) desfaz; o gestor tira -> 403 'configurar'
 *   ajuste T-2 cruzado: carro liberado, km menor E sem condutor -> 400 do condutor (nao 409); com condutor e confirmar_km_menor -> 201
 *
 * O que cada galho ja prova sozinho (frotasSaidaCondutor, frotasPerfisAdmin, frotasDestinos, frotasExportacao) nao se repete aqui;
 * integracao e o que cruza galhos e o que so o login real mostra (o stub do harness poe o perfil no header — ponto de atencao 3).
 *
 * Plano: docs/superpowers/plans/2026-10-28-frotas-etapa8-admin-destinos-condutor.md
 * Executar: cd server && node tests/api/frotasEtapa8Integracao.api.test.js
 */
const assert = require('assert');
const XLSX = require('xlsx');
const { createFrotasTestApp, comLoginReal, ADMIN } = require('../helpers/frotasTestApp');
const { dbRun, dbGet, dbAll } = require('../../services/frotas/db');
const portalService = require('../../services/frotas/portalService');
const frotasService = require('../../services/frotas/frotasService');
const { syncModuleAdminProfiles } = require('../../services/systemPermissions');

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

let ctx; let login;
const S = {};
const GESTOR = 1; const ANA = 2; const BRUNO = 4;
const REG = '/api/frotas/portal/registros';
const MSG_CONDUTOR = 'Informe quem vai dirigir (condutor)';
const MSG_DESTINO = 'Destino não encontrado';

const viagemDb = (id) => dbGet(ctx.db, 'SELECT * FROM frotas_viagens WHERE id = ?', [id]);
const kmDe = async (id) => Number((await dbGet(ctx.db, 'SELECT km_atual FROM frotas_veiculos WHERE id = ?', [id])).km_atual) || 0;
const modulosDe = async (id) => (await dbGet(ctx.db, 'SELECT admin_modulos FROM usuarios WHERE id = ?', [id])).admin_modulos;
const espelhoDe = (id) => dbGet(ctx.db, 'SELECT perfil FROM perfil_frota_usuario WHERE usuario_id = ?', [id]);

function binario(res, cb) {
  res.setEncoding('binary');
  let d = '';
  res.on('data', (c) => { d += c; });
  res.on('end', () => cb(null, Buffer.from(d, 'binary')));
}
function planilha(buf) {
  const wb = XLSX.read(buf, { type: 'buffer' });
  return Object.fromEntries(wb.SheetNames.map((n) => [n, XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '' })]));
}

async function cenario() {
  ctx.setUser(ADMIN);
  const m = await ctx.req('post', '/api/frotas/motoristas', { nome: 'Ana Motorista', usuario_id: ANA });
  assert.strictEqual(m.status, 201, JSON.stringify(m.body));
  S.ma = m.body;
  ctx.setUser(null);
  login = await comLoginReal(ctx);
}

// ── RN-F8.38 ───────────────────────────────────────────────────────────────────────────────────
test('RN-F8.38 pela rota (login real): liberar -> inicio -> destino -> saida GMP/condutor -> lista/busca/planilha -> retorno -> renomear/desativar', async () => {
  const gestor = login.como(GESTOR);
  const ana = login.como(ANA);

  // o gestor cria o veiculo comum e o libera pelo PUT (RN-F8.15)
  const cria = await gestor('post', '/api/frotas/veiculos', { placa: 'INT8001', km_atual: 5000 });
  assert.strictEqual(cria.status, 201, JSON.stringify(cria.body));
  assert.strictEqual(cria.body.uso_funcionarios, 0);
  S.v = cria.body;
  const libera = await gestor('put', `/api/frotas/veiculos/${S.v.id}`, { uso_funcionarios: true });
  assert.strictEqual(libera.status, 200, JSON.stringify(libera.body));
  assert.strictEqual(libera.body.uso_funcionarios, 1);

  // a Ana (login real) ve a marca e a lista de destinos (vazia) no inicio (RN-F8.15/32)
  const ini0 = await ana('get', '/api/frotas/portal/inicio');
  assert.strictEqual(ini0.status, 200, JSON.stringify(ini0.body));
  assert.strictEqual(ini0.body.perfil, 'MOTORISTA');
  assert.strictEqual(ini0.body.motorista.id, S.ma.id);
  assert.strictEqual(ini0.body.veiculos.find((x) => x.id === S.v.id).uso_funcionarios, 1, 'a marca ligada pelo PUT chega ao portal');
  assert.deepStrictEqual(ini0.body.destinos, [], 'ainda sem destinos');

  // a Ana cadastra o destino pelo "+ Novo destino" (RN-F8.27: registrar_operacoes)
  const d = await ana('post', '/api/frotas/destinos', { nome: 'Obra Beta' });
  assert.strictEqual(d.status, 201, JSON.stringify(d.body));
  assert.strictEqual(d.body.nome, 'Obra Beta');
  assert.strictEqual(d.body.ativo, 1);
  assert.strictEqual(d.body.criado_por_id, ANA, 'o login real poe a Ana como quem cadastrou');
  S.d = d.body;
  const ini1 = await ana('get', '/api/frotas/portal/inicio');
  assert.deepStrictEqual(ini1.body.destinos, [{ id: S.d.id, nome: 'Obra Beta', endereco: null }]);

  // a saida: destino pelo id, condutor, SEM origem (RN-F8.17/18/31)
  const saida = await ana('post', REG, {
    tipo: 'saida', veiculo_id: S.v.id, km: 5010, data: '2026-10-27', horario: '08:00', destino_id: S.d.id, condutor_nome: 'Carlos', finalidade: 'Visita',
  });
  assert.strictEqual(saida.status, 201, JSON.stringify(saida.body));
  const vg = saida.body.viagem;
  assert.strictEqual(vg.origem, 'GMP');
  assert.strictEqual(vg.destino, 'Obra Beta');
  assert.strictEqual(vg.destino_id, S.d.id);
  assert.strictEqual(vg.condutor_nome, 'Carlos');
  assert.strictEqual(vg.motorista_id, S.ma.id);
  assert.strictEqual(vg.status, 'em_andamento');
  S.vg = vg;

  // RN-F8.21: o inicio da Ana mostra quem esta dirigindo
  const ini2 = await ana('get', '/api/frotas/portal/inicio');
  assert.strictEqual(ini2.body.viagem_aberta.id, vg.id);
  assert.strictEqual(ini2.body.viagem_aberta.condutor_nome, 'Carlos');
  assert.strictEqual(ini2.body.viagem_aberta.destino, 'Obra Beta');

  // o gestor ve a linha com os quatro campos e acha pelo condutor (ajuste 22)
  const lista = await gestor('get', '/api/frotas/viagens');
  assert.strictEqual(lista.status, 200);
  const linha = lista.body.find((x) => x.id === vg.id);
  assert(linha, 'a viagem da Ana esta na lista do gestor');
  assert.deepStrictEqual([linha.origem, linha.destino, linha.destino_id, linha.condutor_nome], ['GMP', 'Obra Beta', S.d.id, 'Carlos']);
  assert.strictEqual(linha.placa, 'INT8001');
  const busca = await gestor('get', '/api/frotas/viagens?search=Carlos');
  assert.strictEqual(busca.status, 200);
  assert.deepStrictEqual(busca.body.map((x) => x.id), [vg.id], 'so a viagem do Carlos');
  const buscaAna = await ana('get', '/api/frotas/viagens?search=Carlos');
  assert.strictEqual(buscaAna.status, 200, 'a motorista ve as proprias viagens');
  assert.deepStrictEqual(buscaAna.body.map((x) => x.id), [vg.id]);

  // a planilha do gestor: Condutor = Carlos (RN-F8.22), nao a motorista
  const x = await gestor('get', '/api/frotas/exportar.xlsx').buffer(true).parse(binario);
  assert.strictEqual(x.status, 200);
  const abaAberta = planilha(x.body)['Viagens e KM'].slice(1).filter((l) => l[1] === 'INT8001');
  assert.strictEqual(abaAberta.length, 1);
  assert.deepStrictEqual(abaAberta[0].slice(0, 9), ['2026-10-27', 'INT8001', 'Carlos', 'Visita', 'GMP', 'Obra Beta', '08:00', '', 5010]);
  assert.strictEqual(abaAberta[0][11], 'Em andamento');

  // o retorno conclui com km_rodado
  const ret = await ana('post', REG, { tipo: 'retorno', km: 5060, data: '2026-10-27', horario: '17:30' });
  assert.strictEqual(ret.status, 201, JSON.stringify(ret.body));
  assert.strictEqual(ret.body.viagem.id, vg.id);
  assert.strictEqual(ret.body.viagem.status, 'concluida');
  assert.strictEqual(Number(ret.body.viagem.km_rodado), 50);
  assert.strictEqual(ret.body.viagem.condutor_nome, 'Carlos', 'o retorno nao apaga o condutor');
  assert.strictEqual(await kmDe(S.v.id), 5060);
  const x2 = await gestor('get', '/api/frotas/exportar.xlsx').buffer(true).parse(binario);
  const abaFechada = planilha(x2.body)['Viagens e KM'].slice(1).filter((l) => l[1] === 'INT8001');
  assert.deepStrictEqual(abaFechada[0].slice(0, 12), ['2026-10-27', 'INT8001', 'Carlos', 'Visita', 'GMP', 'Obra Beta', '08:00', '17:30', 5010, 5060, 50, 'Concluída']);
  assert.strictEqual((await ana('get', '/api/frotas/portal/inicio')).body.viagem_aberta, null);

  // o gestor renomeia: a viagem guarda o nome da hora (RN-F8.31)
  const ren = await gestor('put', `/api/frotas/destinos/${S.d.id}`, { nome: 'Obra Beta II' });
  assert.strictEqual(ren.status, 200, JSON.stringify(ren.body));
  assert.strictEqual(ren.body.nome, 'Obra Beta II');
  assert.strictEqual((await viagemDb(vg.id)).destino, 'Obra Beta');
  assert.strictEqual((await gestor('get', '/api/frotas/viagens')).body.find((v) => v.id === vg.id).destino, 'Obra Beta');
  assert.deepStrictEqual((await ana('get', '/api/frotas/portal/inicio')).body.destinos.map((q) => q.nome), ['Obra Beta II']);

  // o gestor desativa: some do inicio da Ana e a saida nova com o id -> 400 (RN-F8.30/31)
  const del = await gestor('delete', `/api/frotas/destinos/${S.d.id}`);
  assert.strictEqual(del.status, 200, JSON.stringify(del.body));
  assert.deepStrictEqual((await ana('get', '/api/frotas/portal/inicio')).body.destinos, []);
  const fechada = await viagemDb(vg.id);
  assert.strictEqual(fechada.destino, 'Obra Beta');
  assert.strictEqual(fechada.destino_id, S.d.id, 'a referencia fica (historico)');
  const antes = (await dbGet(ctx.db, 'SELECT COUNT(*) n FROM frotas_viagens')).n;
  const nova = await ana('post', REG, { tipo: 'saida', veiculo_id: S.v.id, km: 5070, destino_id: S.d.id, condutor_nome: 'Carlos' });
  assert.strictEqual(nova.status, 400, JSON.stringify(nova.body));
  assert.strictEqual(nova.body.error, MSG_DESTINO);
  assert.strictEqual((await dbGet(ctx.db, 'SELECT COUNT(*) n FROM frotas_viagens')).n, antes, 'nada gravado');
  assert.strictEqual(await kmDe(S.v.id), 5060, 'o km nao subiu');
});

// ── RN-F8.39 ───────────────────────────────────────────────────────────────────────────────────
test('RN-F8.39 pelo servico (sem HTTP): createDestino + registrar com o carro liberado -> as mesmas gravacoes; sem condutor -> 400', async () => {
  const { db } = ctx;
  const anaUser = { id: ANA, nome: 'Ana', role: 'usuario' };
  const v = await frotasService.createVeiculo(db, { placa: 'INT8002', km_atual: 300, uso_funcionarios: true });
  assert.strictEqual(v.uso_funcionarios, 1);
  const dest = await frotasService.createDestino(db, anaUser, { nome: ' Cliente Gama ', endereco: 'Av. G, 1' });
  assert.strictEqual(dest.nome, 'Cliente Gama');
  assert.strictEqual(dest.criado_por_id, ANA);
  const ini = await portalService.inicio(db, anaUser);
  assert.strictEqual(ini.veiculos.find((x) => x.id === v.id).uso_funcionarios, 1);
  assert(ini.destinos.some((q) => q.id === dest.id && q.nome === 'Cliente Gama'));

  // carro liberado sem condutor -> 400 com a mensagem literal; nada gravado
  const antes = (await dbGet(db, 'SELECT COUNT(*) n FROM frotas_viagens')).n;
  await assert.rejects(
    () => portalService.registrar(db, anaUser, { tipo: 'saida', veiculo_id: v.id, km: 301, destino_id: dest.id }),
    (e) => e.status === 400 && e.message === MSG_CONDUTOR,
  );
  assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) n FROM frotas_viagens')).n, antes);

  const { viagem, registro } = await portalService.registrar(db, anaUser, {
    tipo: 'saida', veiculo_id: v.id, km: 301, data: '2026-10-27', horario: '09:00', destino_id: dest.id, condutor_nome: ' Carlos ',
  });
  assert(registro && registro.id);
  const gravada = await viagemDb(viagem.id);
  assert.strictEqual(gravada.origem, 'GMP');
  assert.strictEqual(gravada.destino, 'Cliente Gama');
  assert.strictEqual(gravada.destino_id, dest.id);
  assert.strictEqual(gravada.condutor_nome, 'Carlos');
  assert.strictEqual(gravada.motorista_id, S.ma.id);
  assert.strictEqual(gravada.status, 'em_andamento');
  assert.strictEqual(gravada.km_saida, 301);
  const reg = await dbGet(db, 'SELECT veiculo_id, motorista_id, tipo_registro, km FROM frotas_checklists WHERE id = ?', [registro.id]);
  assert.deepStrictEqual(reg, { veiculo_id: v.id, motorista_id: S.ma.id, tipo_registro: 'saida', km: 301 });
  const aberta = await portalService.inicio(db, anaUser);
  assert.strictEqual(aberta.viagem_aberta.condutor_nome, 'Carlos');

  // a lista do servico (como o gestor) e a busca pelo condutor
  const lista = await frotasService.listViagens(db, { search: 'Carlos' });
  assert(lista.some((x) => x.id === viagem.id && x.destino === 'Cliente Gama' && x.condutor_nome === 'Carlos'));

  const ret = await portalService.registrar(db, anaUser, { tipo: 'retorno', km: 320, data: '2026-10-27', horario: '12:00' });
  assert.strictEqual(ret.viagem.status, 'concluida');
  assert.strictEqual(Number(ret.viagem.km_rodado), 19);
  // renomear/desativar pelo servico nao muda a viagem; a saida nova com o desativado -> 400
  await frotasService.updateDestino(db, dest.id, { nome: 'Cliente Gama II' });
  await frotasService.deleteDestino(db, dest.id);
  assert.strictEqual((await viagemDb(viagem.id)).destino, 'Cliente Gama');
  assert(!(await portalService.inicio(db, anaUser)).destinos.some((q) => q.id === dest.id));
  await assert.rejects(
    () => portalService.registrar(db, anaUser, { tipo: 'saida', veiculo_id: v.id, km: 321, destino_id: dest.id, condutor_nome: 'Carlos' }),
    (e) => e.status === 400 && e.message === MSG_DESTINO,
  );
  S.v2 = v;
});

// ── RN-F8.40 ───────────────────────────────────────────────────────────────────────────────────
test('RN-F8.40 perfis pela fiacao real: ADMIN pela tela da perfil ao Bruno; sync com a lista atual nao desfaz; lista velha medida; o gestor tira', async () => {
  const gestor = login.como(GESTOR);
  const ana = login.como(ANA);
  const bruno = login.como(BRUNO);
  assert.strictEqual((await ana('get', '/api/frotas/perfis-usuario')).status, 403, 'antes: a Ana e MOTORISTA');
  assert.strictEqual((await bruno('get', '/api/frotas/dashboard')).status, 403, 'antes: o Bruno e MOTORISTA');

  // o gestor faz a Ana administradora pela tela
  const da = await gestor('put', `/api/frotas/perfis-usuario/${ANA}`, { perfil: 'ADMIN_FROTA' });
  assert.strictEqual(da.status, 200, JSON.stringify(da.body));
  assert.strictEqual(da.body.origem, 'admin_modulo');
  assert.strictEqual(await modulosDe(ANA), '["frota"]', 'a fonte e admin_modulos (RN-F8.02)');
  assert.strictEqual((await espelhoDe(ANA)).perfil, 'ADMIN_FROTA', 'e a linha espelho');
  const abre = await ana('get', '/api/frotas/perfis-usuario');
  assert.strictEqual(abre.status, 200, `o admin dado pela tela nao chegou ao pedido seguinte: ${JSON.stringify(abre.body)}`);
  assert.strictEqual(abre.body.usuarios.find((u) => u.id === ANA).origem, 'admin_modulo');

  // administradora feita pela tela faz tudo: inclusive dar Consulta ao Bruno
  const daBruno = await ana('put', `/api/frotas/perfis-usuario/${BRUNO}`, { perfil: 'CONSULTA' });
  assert.strictEqual(daBruno.status, 200, JSON.stringify(daBruno.body));
  assert.deepStrictEqual(daBruno.body, { usuario_id: BRUNO, perfil_explicito: 'CONSULTA', perfil_efetivo: 'CONSULTA', origem: 'explicito' });
  assert.strictEqual((await bruno('get', '/api/frotas/dashboard')).status, 200, 'o Bruno ve o painel no pedido seguinte');
  assert.strictEqual((await bruno('get', '/api/frotas/perfis-usuario')).status, 403, 'mas Consulta nao configura');
  // e ela mesma nao se mexe (RN-F8.06), nem no gestor forcado (RN-F8.04)
  assert.strictEqual((await ana('put', `/api/frotas/perfis-usuario/${ANA}`, { perfil: 'CONSULTA' })).status, 409);
  assert.strictEqual((await ana('put', `/api/frotas/perfis-usuario/${GESTOR}`, { perfil: 'CONSULTA' })).status, 409);

  // RN-F8.08 (ajuste 14): o sync do nucleo com a lista ATUAL nao desfaz
  await syncModuleAdminProfiles(ctx.db, ANA, '["frota"]');
  assert.strictEqual(await modulosDe(ANA), '["frota"]');
  assert.strictEqual((await espelhoDe(ANA)).perfil, 'ADMIN_FROTA');
  assert.strictEqual((await ana('get', '/api/frotas/perfis-usuario')).status, 200, 'a lista atual nao desfaz');

  // RN-F8.08 (ajuste 14): o sync SOZINHO com a lista velha ('[]') — o que ele faz de fato: apaga a linha espelho e NAO toca em
  // usuarios.admin_modulos (ele so le a lista que recebe). Como a fonte do perfil e a coluna (finishFrotaProfile), a Ana CONTINUA
  // administradora. O que desfaz e o gesto inteiro do cadastro de usuario (PUT /usuarios/:id, index.js:4104): a coluna e reescrita com
  // a lista velha E o sync roda com ela — simulado logo abaixo. Medido, nao forcado.
  await syncModuleAdminProfiles(ctx.db, ANA, '[]');
  assert.strictEqual(await modulosDe(ANA), '["frota"]', 'o sync sozinho nao mexe na coluna');
  assert.strictEqual(await espelhoDe(ANA), undefined, 'mas apaga a linha espelho');
  assert.strictEqual((await ana('get', '/api/frotas/perfis-usuario')).status, 200, 'so o sync com a lista velha NAO desfaz: a coluna manda');
  // o gesto do cadastro de usuario aberto antes do PUT da tela do Frota: COALESCE(?, admin_modulos) com a lista velha + o sync
  await dbRun(ctx.db, 'UPDATE usuarios SET admin_modulos = COALESCE(?, admin_modulos) WHERE id = ?', ['[]', ANA]);
  await syncModuleAdminProfiles(ctx.db, ANA, '[]');
  assert.strictEqual(await modulosDe(ANA), '[]');
  assert.strictEqual(await espelhoDe(ANA), undefined);
  const sumiu = await ana('get', '/api/frotas/perfis-usuario');
  assert.strictEqual(sumiu.status, 403, `o cadastro de usuario com a lista velha desfaz (B81): ${JSON.stringify(sumiu.body)}`);
  assert.strictEqual((await ana('get', '/api/frotas/portal/inicio')).body.perfil, 'MOTORISTA');
  assert.strictEqual((await espelhoDe(BRUNO)).perfil, 'CONSULTA', 'a linha CONSULTA do Bruno o sync nao toca');

  // o gestor da de novo e depois tira pela tela: 403 'configurar' e 200 no painel
  assert.strictEqual((await gestor('put', `/api/frotas/perfis-usuario/${ANA}`, { perfil: 'ADMIN_FROTA' })).status, 200);
  assert.strictEqual((await ana('get', '/api/frotas/perfis-usuario')).status, 200);
  const tira = await gestor('put', `/api/frotas/perfis-usuario/${ANA}`, { perfil: 'CONSULTA' });
  assert.strictEqual(tira.status, 200, JSON.stringify(tira.body));
  assert.strictEqual(await modulosDe(ANA), '[]');
  assert.strictEqual((await espelhoDe(ANA)).perfil, 'CONSULTA');
  const semConfigurar = await ana('get', '/api/frotas/perfis-usuario');
  assert.strictEqual(semConfigurar.status, 403, JSON.stringify(semConfigurar.body));
  assert.strictEqual(semConfigurar.body.acao, 'configurar');
  assert.strictEqual((await ana('get', '/api/frotas/dashboard')).status, 200, 'Consulta ve o painel');
  assert.strictEqual((await ana('post', REG, { tipo: 'saida', veiculo_id: S.v.id, km: 5070, condutor_nome: 'Carlos' })).status, 403, 'Consulta nao registra');
  // volta a Ana e o Bruno ao padrao para o cenario seguinte
  assert.strictEqual((await gestor('put', `/api/frotas/perfis-usuario/${ANA}`, { perfil: null })).status, 200);
  assert.strictEqual((await gestor('put', `/api/frotas/perfis-usuario/${BRUNO}`, { perfil: null })).status, 200);
  assert.strictEqual((await ana('get', '/api/frotas/portal/inicio')).body.pode_registrar, true);
});

// ── ajuste T-2 cruzado ─────────────────────────────────────────────────────────────────────────
test('ajuste T-2 cruzado (login real): carro liberado, km menor E sem condutor -> 400 do condutor (nao 409); com condutor + confirmar -> 201', async () => {
  const ana = login.como(ANA);
  assert.strictEqual(await kmDe(S.v.id), 5060);
  const antes = (await dbGet(ctx.db, 'SELECT COUNT(*) n FROM frotas_viagens')).n;
  const semCondutor = await ana('post', REG, { tipo: 'saida', veiculo_id: S.v.id, km: 4000 });
  assert.strictEqual(semCondutor.status, 400, JSON.stringify(semCondutor.body));
  assert.strictEqual(semCondutor.body.error, MSG_CONDUTOR);
  assert.notStrictEqual(semCondutor.body.code, 'KM_MENOR_QUE_ATUAL');
  const soKm = await ana('post', REG, { tipo: 'saida', veiculo_id: S.v.id, km: 4000, condutor_nome: 'Carlos' });
  assert.strictEqual(soKm.status, 409, JSON.stringify(soKm.body));
  assert.strictEqual(soKm.body.code, 'KM_MENOR_QUE_ATUAL');
  assert.strictEqual((await dbGet(ctx.db, 'SELECT COUNT(*) n FROM frotas_viagens')).n, antes, 'nada gravado ate aqui');
  const ok = await ana('post', REG, { tipo: 'saida', veiculo_id: S.v.id, km: 4000, condutor_nome: 'Carlos', confirmar_km_menor: true });
  assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
  assert.strictEqual(ok.body.viagem.km_saida, 4000);
  assert.strictEqual(ok.body.viagem.condutor_nome, 'Carlos');
  assert.strictEqual(ok.body.viagem.origem, 'GMP');
  assert.strictEqual((await dbGet(ctx.db, 'SELECT COUNT(*) n FROM frotas_viagens')).n, antes + 1);
  const ret = await ana('post', REG, { tipo: 'retorno', km: 5100 });
  assert.strictEqual(ret.status, 201, JSON.stringify(ret.body));
  assert.strictEqual(ret.body.viagem.status, 'concluida');
});

(async () => {
  ctx = await createFrotasTestApp();
  await cenario();
  console.log('\nFrota Etapa 8 — T2 (integracao pela rota e pelo servico)\n');
  for (const [name, fn] of testes) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
  }
  console.log(`\nResultado: ${passed} passou, ${failed} falhou\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
