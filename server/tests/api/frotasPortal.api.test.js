/**
 * Frotas Etapa 1 — T4: as rotas do portal do motorista (/api/frotas/portal/*).
 *
 *   RN-F1.13  sem motorista ligado ao usuario, as gravacoes do portal -> 409 MOTORISTA_NAO_VINCULADO
 *   RN-F1.01  validacoes do corpo (tipo, km, data, horario, combustivel, itens, avarias, veiculo) — mensagens literais do contrato
 *   RN-F1.04  saida grava o registro e abre a viagem em_andamento (data_saida AAAA-MM-DDTHH:MM — F2-15); B8 consome a aprovada
 *   RN-F1.05  uma viagem em andamento por veiculo e por motorista (inclusive em paralelo)
 *   F2-14     saida com veiculo em manutencao -> 409 (inspecao passa)
 *   RN-F1.06/07  retorno fecha a viagem do motorista; km menor que a saida -> 400
 *   RN-F1.08  o km_atual do veiculo sobe
 *   RN-F1.09  inspecao grava so o registro
 *   RN-F1.02  situacao no registro do portal
 *   RN-F1.10  registro com PENDENCIA vira alerta "alto" por 7 dias
 *   F2-11     /portal/inicio: perfil, pode_registrar, pode_gerir; veiculos com em_uso e status
 *   F2-12     abastecimento do portal: mensagens e o motorista do vinculo
 *   meus-registros: so os do motorista, mais novos primeiro, com placa
 *
 * Plano: docs/superpowers/plans/2026-10-23-frotas-etapa1-portal-do-motorista.md
 * Executar: cd server && node tests/api/frotasPortal.api.test.js
 */
const assert = require('assert');
const { createFrotasTestApp, ADMIN, MOTORISTA, CONSULTA, MOTORISTA2 } = require('../helpers/frotasTestApp');
const { hojeLocalISO } = require('../../services/diaLocal');
const { dbRun } = require('../../services/frotas/db');

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

const SEM_VINCULO = { id: 99, nome: 'Sem vinculo', role: 'usuario' };
const MSG_VINCULO = 'Seu usuário não está ligado a um motorista. Peça ao gestor da frota para fazer o vínculo.';
const CHAVES = ['pneus_estepe', 'farois_lanternas', 'setas_luz_freio', 'parabrisa_vidros', 'espelhos_retrovisores',
  'limpadores_agua', 'oleo_motor', 'arrefecimento', 'freios', 'buzina_cintos', 'documentos_equipamentos', 'carroceria_carga'];
const todosOk = () => Object.fromEntries(CHAVES.map((k) => [k, 'OK']));
const somaDias = (dia, n) => { const [a, m, d] = dia.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10); };

let ctx;
const S = {};

async function como(user, metodo, url, corpo) {
  ctx.setUser(user);
  return ctx.req(metodo, url, corpo);
}
const registrar = (user, corpo) => como(user, 'post', '/api/frotas/portal/registros', corpo);

async function cenario() {
  const v = async (placa, extra = {}) => (await como(ADMIN, 'post', '/api/frotas/veiculos', { placa, ...extra })).body;
  S.v1 = await v('POR0001', { km_atual: 1000, modelo: 'Strada', marca: 'Fiat' });
  S.v2 = await v('POR0002', { km_atual: 500 });
  S.v3 = await v('POR0003', { status: 'manutencao' });
  S.v4 = await v('POR0004');
  await como(ADMIN, 'delete', `/api/frotas/veiculos/${S.v4.id}`);
  S.v5 = await v('POR0005', { status: 'vendido' });
  S.v6 = await v('POR0006', { km_atual: 100 });
  S.v7 = await v('POR0007', { km_atual: 100 });
  S.ma = (await como(ADMIN, 'post', '/api/frotas/motoristas', { nome: 'Ana Motorista', usuario_id: 2, cnh_validade: '2027-01-01' })).body;
  S.mb = (await como(ADMIN, 'post', '/api/frotas/motoristas', { nome: 'Bruno Motorista', usuario_id: 4 })).body;
  S.mc = (await como(ADMIN, 'post', '/api/frotas/motoristas', { nome: 'Gestor Motorista', usuario_id: 1 })).body;
  assert(S.ma.id && S.mb.id && S.mc.id);
}

// ── RN-F1.13 ────────────────────────────────────────────────────────────────────────────────
test('RN-F1.13 sem vinculo: POST /portal/registros e /portal/abastecimentos -> 409 MOTORISTA_NAO_VINCULADO', async () => {
  const a = await registrar(SEM_VINCULO, { tipo: 'inspecao', veiculo_id: S.v1.id, km: 1000 });
  assert.strictEqual(a.status, 409);
  assert.strictEqual(a.body.error, MSG_VINCULO);
  assert.strictEqual(a.body.code, 'MOTORISTA_NAO_VINCULADO');
  const b = await como(SEM_VINCULO, 'post', '/api/frotas/portal/abastecimentos', { veiculo_id: S.v1.id, km: 1000, litros: 10, valor_total: 50 });
  assert.strictEqual(b.status, 409);
  assert.strictEqual(b.body.code, 'MOTORISTA_NAO_VINCULADO');
  const c = await registrar(CONSULTA, { tipo: 'inspecao', veiculo_id: S.v1.id, km: 1000 });
  assert.strictEqual(c.status, 403, 'CONSULTA nao registra');
});

// ── F2-11: /portal/inicio ───────────────────────────────────────────────────────────────────
test('F2-11 GET /portal/inicio: motorista, veiculos ativos com status/em_uso, listas, perfil e permissoes', async () => {
  const r = await como(MOTORISTA, 'get', '/api/frotas/portal/inicio');
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.motorista, { id: S.ma.id, nome: 'Ana Motorista', cnh_validade: '2027-01-01' });
  assert.strictEqual(r.body.viagem_aberta, null);
  const placas = r.body.veiculos.map((v) => v.placa);
  assert(placas.includes('POR0001') && placas.includes('POR0003'), 'ativo e em manutencao aparecem');
  assert(!placas.includes('POR0004') && !placas.includes('POR0005'), 'excluido e vendido nao');
  const v1 = r.body.veiculos.find((v) => v.placa === 'POR0001');
  assert.deepStrictEqual(Object.keys(v1).sort(), ['em_uso', 'horimetro_atual', 'id', 'km_atual', 'marca', 'modelo', 'placa', 'status', 'tipo_medicao'] /* + horimetro_atual: Etapa 3, RN-F3.09 */.sort());
  assert.strictEqual(v1.em_uso, false);
  assert.strictEqual(r.body.veiculos.find((v) => v.placa === 'POR0003').status, 'manutencao');
  assert.strictEqual(r.body.itens.length, 12);
  assert.deepStrictEqual(r.body.itens[0], { chave: 'pneus_estepe', rotulo: 'Pneus e estepe' });
  assert.deepStrictEqual(r.body.vistas, ['lateral_esquerda', 'lateral_direita', 'superior', 'frente', 'traseira']);
  assert.deepStrictEqual(r.body.tipos_avaria, ['R', 'A', 'T', 'Q', 'O']);
  assert.deepStrictEqual(r.body.niveis_combustivel, ['vazio', '1/4', '1/2', '3/4', 'cheio']);
  assert.strictEqual(r.body.perfil, 'MOTORISTA');
  assert.strictEqual(r.body.pode_registrar, true);
  assert.strictEqual(r.body.pode_gerir, false);
  const s = await como(SEM_VINCULO, 'get', '/api/frotas/portal/inicio');
  assert.strictEqual(s.status, 200);
  assert.strictEqual(s.body.motorista, null);
  const c = await como(CONSULTA, 'get', '/api/frotas/portal/inicio');
  assert.strictEqual(c.body.pode_registrar, false);
  assert.strictEqual(c.body.perfil, 'CONSULTA');
  const a = await como(ADMIN, 'get', '/api/frotas/portal/inicio');
  assert.strictEqual(a.body.pode_gerir, true);
});

// ── RN-F1.01: validacoes ────────────────────────────────────────────────────────────────────
test('RN-F1.01 validacoes do POST /portal/registros com as mensagens literais', async () => {
  const base = { tipo: 'inspecao', veiculo_id: S.v1.id, km: 1000 };
  const casos = [
    [{ ...base, tipo: 'passeio' }, 400, 'Tipo deve ser saida, retorno ou inspecao'],
    [{ ...base, km: undefined }, 400, 'Informe o KM atual'],
    [{ ...base, km: -1 }, 400, 'Informe o KM atual'],
    [{ ...base, km: 'abc' }, 400, 'Informe o KM atual'],
    [{ ...base, veiculo_id: undefined }, 400, 'Escolha o veículo'],
    [{ ...base, tipo: 'saida', veiculo_id: undefined }, 400, 'Escolha o veículo'],
    [{ ...base, veiculo_id: 9999 }, 404, 'Veículo não encontrado'],
    [{ ...base, veiculo_id: S.v4.id }, 404, 'Veículo não encontrado'],
    [{ ...base, veiculo_id: S.v5.id }, 404, 'Veículo não encontrado'],
    [{ ...base, itens: { pneus_estepe: 'talvez' } }, 400, 'Item de checklist inválido: pneus_estepe'],
    [{ ...base, itens: { buzina: 'OK' } }, 400, 'Item de checklist inválido: buzina'],
    [{ ...base, avarias: [{ vista: 'teto', tipo: 'R' }] }, 400, 'Avaria inválida'],
    [{ ...base, avarias: [{ vista: 'frente', tipo: 'X' }] }, 400, 'Avaria inválida'],
    [{ ...base, avarias: 'risco' }, 400, 'Avaria inválida'],
    [{ ...base, nivel_combustivel: 'meio' }, 400, 'Nível de combustível inválido'],
    [{ ...base, data: '23/10/2026' }, 400, 'Data inválida'],
    [{ ...base, data: '2026-02-30' }, 400, 'Data inválida'],
    [{ ...base, horario: '25:00' }, 400, 'Horário inválido'],
    [{ ...base, horario: '7h30' }, 400, 'Horário inválido'],
  ];
  for (const [corpo, st, msg] of casos) {
    const r = await registrar(MOTORISTA, corpo);
    assert.strictEqual(r.status, st, `${JSON.stringify(corpo)} -> ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, msg);
  }
  const lista = await como(ADMIN, 'get', '/api/frotas/checklists');
  assert.strictEqual(lista.body.length, 0, 'nenhuma recusa gravou registro');
});

// ── RN-F1.04 / 05 / 08 / F2-15 ──────────────────────────────────────────────────────────────
test('RN-F1.04 saida grava o registro e abre a viagem em andamento; RN-F1.08 sobe o km do veiculo', async () => {
  const r = await registrar(MOTORISTA, {
    tipo: 'saida', veiculo_id: S.v1.id, km: 1050, data: '2026-10-23', horario: '07:30', nivel_combustivel: '3/4',
    itens: todosOk(), avarias: [], origem: 'GMP', destino: 'Cliente X', finalidade: 'Entrega', observacoes: 'ok',
  });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  const { registro, viagem } = r.body;
  assert.strictEqual(registro.tipo_registro, 'saida');
  assert.strictEqual(registro.status_geral, 'OK');
  assert.strictEqual(registro.aprovado, 1);
  assert.strictEqual(registro.km, 1050);
  assert.strictEqual(registro.horario, '07:30');
  assert.strictEqual(registro.nivel_combustivel, '3/4');
  assert.strictEqual(registro.data_checklist, '2026-10-23');
  assert.strictEqual(registro.motorista_id, S.ma.id);
  assert.deepStrictEqual(registro.itens, todosOk());
  assert.deepStrictEqual(registro.avarias, []);
  assert.strictEqual(registro.viagem_id, viagem.id);
  assert.strictEqual(viagem.status, 'em_andamento');
  assert.strictEqual(viagem.km_saida, 1050);
  assert.strictEqual(viagem.data_saida, '2026-10-23T07:30', 'F2-15');
  assert.strictEqual(viagem.motorista_id, S.ma.id);
  assert.strictEqual(viagem.veiculo_id, S.v1.id);
  assert.strictEqual(viagem.origem, 'GMP');
  assert.strictEqual(viagem.destino, 'Cliente X');
  assert.strictEqual(viagem.finalidade, 'Entrega');
  S.viagemAna = viagem;
  const veic = await como(ADMIN, 'get', `/api/frotas/veiculos/${S.v1.id}`);
  assert.strictEqual(veic.body.km_atual, 1050);
  const ini = await como(MOTORISTA, 'get', '/api/frotas/portal/inicio');
  assert.deepStrictEqual(ini.body.viagem_aberta, {
    id: viagem.id, veiculo_id: S.v1.id, placa: 'POR0001', km_saida: 1050, data_saida: '2026-10-23T07:30', destino: 'Cliente X',
    horimetro_saida: null, tipo_medicao: 'km', // Etapa 3 (RN-F3.09): aditivo
  });
  assert.strictEqual(ini.body.veiculos.find((v) => v.id === S.v1.id).em_uso, true);
});

test('RN-F1.05 segunda saida do mesmo veiculo (outro motorista) ou do mesmo motorista (outro veiculo) -> 409', async () => {
  const a = await registrar(MOTORISTA2, { tipo: 'saida', veiculo_id: S.v1.id, km: 1100 });
  assert.strictEqual(a.status, 409);
  assert.strictEqual(a.body.error, 'Este veículo já está em uso (saída sem retorno).');
  const b = await registrar(MOTORISTA, { tipo: 'saida', veiculo_id: S.v2.id, km: 600 });
  assert.strictEqual(b.status, 409);
  assert.strictEqual(b.body.error, 'Você já tem uma saída sem retorno. Registre o retorno primeiro.');
});

test('F2-14 saida com veiculo em manutencao -> 409; inspecao do mesmo veiculo passa', async () => {
  const a = await registrar(MOTORISTA2, { tipo: 'saida', veiculo_id: S.v3.id, km: 10 });
  assert.strictEqual(a.status, 409);
  assert.strictEqual(a.body.error, 'Veículo em manutenção. Fale com o gestor da frota.');
  const b = await registrar(MOTORISTA2, { tipo: 'inspecao', veiculo_id: S.v3.id, km: 10, itens: todosOk() });
  assert.strictEqual(b.status, 201);
});

// ── RN-F1.06 / 07 ───────────────────────────────────────────────────────────────────────────
test('RN-F1.07 retorno com km menor que a saida -> 400 literal; a viagem continua aberta', async () => {
  const r = await registrar(MOTORISTA, { tipo: 'retorno', km: 1000 });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.body.error, 'KM do retorno (1000) menor que o KM da saída (1050). Confira o hodômetro.');
  const ini = await como(MOTORISTA, 'get', '/api/frotas/portal/inicio');
  assert.strictEqual(ini.body.viagem_aberta.id, S.viagemAna.id);
});

test('RN-F1.06 retorno fecha a viagem do motorista (veiculo_id do corpo ignorado) e grava o registro com o mesmo viagem_id', async () => {
  const r = await registrar(MOTORISTA, {
    tipo: 'retorno', veiculo_id: S.v2.id, km: 1200, data: '2026-10-23', horario: '17:45', itens: todosOk(), nivel_combustivel: '1/4',
  });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  const { registro, viagem } = r.body;
  assert.strictEqual(registro.tipo_registro, 'retorno');
  assert.strictEqual(registro.veiculo_id, S.v1.id, 'o veiculo e o da viagem');
  assert.strictEqual(registro.viagem_id, S.viagemAna.id);
  assert.strictEqual(viagem.id, S.viagemAna.id);
  assert.strictEqual(viagem.status, 'concluida');
  assert.strictEqual(viagem.km_retorno, 1200);
  assert.strictEqual(viagem.km_rodado, 150);
  assert.strictEqual(viagem.data_retorno, '2026-10-23T17:45');
  assert.strictEqual((await como(ADMIN, 'get', `/api/frotas/veiculos/${S.v1.id}`)).body.km_atual, 1200, 'RN-F1.08');
  const de = await registrar(MOTORISTA, { tipo: 'retorno', km: 1300 });
  assert.strictEqual(de.status, 409);
  assert.strictEqual(de.body.error, 'Você não tem saída aberta para registrar o retorno.');
  const ini = await como(MOTORISTA, 'get', '/api/frotas/portal/inicio');
  assert.strictEqual(ini.body.viagem_aberta, null);
  assert.strictEqual(ini.body.veiculos.find((v) => v.id === S.v1.id).em_uso, false);
});

// ── RN-F1.09 / RN-F1.02 / padroes ───────────────────────────────────────────────────────────
test('RN-F1.09 inspecao grava so o registro (sem viagem); data e horario padrao = agora em Brasilia', async () => {
  const r = await registrar(MOTORISTA, { tipo: 'inspecao', veiculo_id: S.v2.id, km: 550, itens: todosOk() });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.viagem, null);
  assert.strictEqual(r.body.registro.viagem_id, null);
  assert.strictEqual(r.body.registro.tipo_registro, 'inspecao');
  assert.strictEqual(r.body.registro.data_checklist, hojeLocalISO());
  assert(/^([01]\d|2[0-3]):[0-5]\d$/.test(r.body.registro.horario), r.body.registro.horario);
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const agora = fmt.format(new Date());
  const minutos = (h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  assert(Math.abs(minutos(agora) - minutos(r.body.registro.horario)) <= 1 || minutos(agora) < 2, `hora de Brasilia: ${agora} x ${r.body.registro.horario}`);
  const viagens = await como(ADMIN, 'get', '/api/frotas/viagens');
  assert.strictEqual(viagens.body.filter((v) => v.veiculo_id === S.v2.id).length, 0);
});

test('RN-F1.02 pelo portal: 11 itens = INCOMPLETO; FALHA = PENDENCIA com o legado 0; avaria = PENDENCIA', async () => {
  const onze = todosOk(); delete onze.freios;
  const a = await registrar(MOTORISTA, { tipo: 'inspecao', veiculo_id: S.v2.id, km: 560, itens: onze });
  assert.strictEqual(a.body.registro.status_geral, 'INCOMPLETO');
  assert.strictEqual(a.body.registro.aprovado, 0);
  const b = await registrar(MOTORISTA, { tipo: 'inspecao', veiculo_id: S.v2.id, km: 560, itens: { ...todosOk(), pneus_estepe: 'FALHA' } });
  assert.strictEqual(b.body.registro.status_geral, 'PENDENCIA');
  assert.strictEqual(b.body.registro.pneus_ok, 0, 'legado pneus_ok <- pneus_estepe');
  assert.strictEqual(b.body.registro.oleo_ok, 1);
  const c = await registrar(MOTORISTA, {
    tipo: 'inspecao', veiculo_id: S.v2.id, km: 560, itens: todosOk(), avarias: [{ vista: 'frente', tipo: 'R', descricao: 'risco no para-choque' }],
  });
  assert.strictEqual(c.body.registro.status_geral, 'PENDENCIA');
  assert.deepStrictEqual(c.body.registro.avarias, [{ vista: 'frente', tipo: 'R', descricao: 'risco no para-choque' }]);
  S.pendenciaId = c.body.registro.id;
});

// ── RN-F1.10 ────────────────────────────────────────────────────────────────────────────────
test('RN-F1.10 registro com PENDENCIA vira alerta "alto" (tipo checklist); o de 8 dias atras nao', async () => {
  const velho = await registrar(MOTORISTA, {
    tipo: 'inspecao', veiculo_id: S.v2.id, km: 560, data: somaDias(hojeLocalISO(), -8), itens: { ...todosOk(), freios: 'FALHA' },
  });
  assert.strictEqual(velho.status, 201);
  const limite = await registrar(MOTORISTA, {
    tipo: 'inspecao', veiculo_id: S.v2.id, km: 560, data: somaDias(hojeLocalISO(), -7), itens: { ...todosOk(), freios: 'FALHA' },
  });
  const r = await como(ADMIN, 'get', '/api/frotas/alertas');
  assert.strictEqual(r.status, 200);
  const doChecklist = r.body.filter((a) => a.tipo === 'checklist');
  const ids = doChecklist.map((a) => a.referencia_id);
  assert(ids.includes(S.pendenciaId), 'a de hoje');
  assert(ids.includes(limite.body.registro.id), 'a de 7 dias atras ainda conta');
  assert(!ids.includes(velho.body.registro.id), 'a de 8 dias nao');
  const a = doChecklist.find((x) => x.referencia_id === S.pendenciaId);
  assert.strictEqual(a.severidade, 'alto');
  assert.strictEqual(a.veiculo_id, S.v2.id);
  assert(a.titulo.includes('POR0002'), a.titulo);
  ctx.limparCacheDashboard();
  const d = await como(ADMIN, 'get', '/api/frotas/dashboard');
  assert(d.body.alertas.some((x) => x.tipo === 'checklist'), 'o painel mostra o alerta');
});

// ── B8 ──────────────────────────────────────────────────────────────────────────────────────
test('RN-F1.04 (B8, F2-10) saida consome a viagem aprovada do mesmo veiculo e motorista', async () => {
  const sol = await como(ADMIN, 'post', '/api/frotas/viagens', { veiculo_id: S.v2.id, motorista_id: S.mb.id, destino: 'Obra', finalidade: 'Visita' });
  await como(ADMIN, 'post', `/api/frotas/viagens/${sol.body.id}/aprovar`);
  const r = await registrar(MOTORISTA2, { tipo: 'saida', veiculo_id: S.v2.id, km: 600, data: '2026-10-23', horario: '08:00', itens: todosOk() });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  assert.strictEqual(r.body.viagem.id, sol.body.id, 'a mesma viagem');
  assert.strictEqual(r.body.viagem.status, 'em_andamento');
  assert.strictEqual(r.body.viagem.km_saida, 600);
  assert.strictEqual(r.body.viagem.destino, 'Obra', 'o destino aprovado fica quando a saida nao manda outro');
  assert.strictEqual(r.body.viagem.data_saida, '2026-10-23T08:00');
  const todas = (await como(ADMIN, 'get', '/api/frotas/viagens')).body.filter((v) => v.veiculo_id === S.v2.id);
  assert.strictEqual(todas.length, 1, 'nao criou outra');
  const fecha = await registrar(MOTORISTA2, { tipo: 'retorno', km: 650 });
  assert.strictEqual(fecha.status, 201);
});

// Fase5-7: antes, o `setUser` global fazia as duas requisicoes do Promise.all rodarem como o ULTIMO usuario (o teste nunca viu
// dois motoristas) e o retorno final era engolido. Agora o harness leva o usuario na propria requisicao.
const motoristaDe = (user) => (user === MOTORISTA ? S.ma.id : S.mb.id);
async function fecharViagem(user, km) {
  const r = await registrar(user, { tipo: 'retorno', km });
  assert.strictEqual(r.status, 201, `retorno de ${user.nome}: ${JSON.stringify(r.body)}`);
}

test('Fase5-7 (RN-F1.05) duas pessoas, veiculos diferentes, em paralelo: as duas saidas passam, cada uma com o seu motorista', async () => {
  const [a, b] = await Promise.all([
    registrar(MOTORISTA, { tipo: 'saida', veiculo_id: S.v6.id, km: 110 }),
    registrar(MOTORISTA2, { tipo: 'saida', veiculo_id: S.v7.id, km: 110 }),
  ]);
  assert.strictEqual(a.status, 201, `Ana: ${JSON.stringify(a.body)}`);
  assert.strictEqual(b.status, 201, `Bruno: ${JSON.stringify(b.body)}`);
  assert.strictEqual(a.body.viagem.motorista_id, S.ma.id);
  assert.strictEqual(b.body.viagem.motorista_id, S.mb.id);
  await fecharViagem(MOTORISTA, 115);
  await fecharViagem(MOTORISTA2, 115);
});

test('Fase5-7 (RN-F1.05) duas pessoas no mesmo veiculo ao mesmo tempo: uma passa (com o motorista dela), a outra 409 veiculo em uso', async () => {
  const pedidos = [MOTORISTA, MOTORISTA2];
  const rs = await Promise.all(pedidos.map((u) => registrar(u, { tipo: 'saida', veiculo_id: S.v6.id, km: 120 })));
  assert.deepStrictEqual(rs.map((r) => r.status).sort(), [201, 409], JSON.stringify(rs.map((r) => r.body)));
  const i = rs.findIndex((r) => r.status === 201);
  assert.strictEqual(rs[i].body.viagem.motorista_id, motoristaDe(pedidos[i]), 'a viagem e de quem pediu');
  assert.strictEqual(rs[1 - i].body.error, 'Este veículo já está em uso (saída sem retorno).');
  const abertas = (await como(ADMIN, 'get', '/api/frotas/viagens')).body.filter((v) => v.veiculo_id === S.v6.id && v.status === 'em_andamento');
  assert.strictEqual(abertas.length, 1);
  await fecharViagem(pedidos[i], 125);
});

test('Fase5-7 (RN-F1.05) a mesma pessoa em dois veiculos ao mesmo tempo: uma passa, a outra 409 saida sem retorno', async () => {
  const rs = await Promise.all([S.v6, S.v7].map((v) => registrar(MOTORISTA2, { tipo: 'saida', veiculo_id: v.id, km: 130 })));
  assert.deepStrictEqual(rs.map((r) => r.status).sort(), [201, 409], JSON.stringify(rs.map((r) => r.body)));
  const ok = rs.find((r) => r.status === 201);
  assert.strictEqual(ok.body.viagem.motorista_id, S.mb.id);
  assert.strictEqual(rs.find((r) => r.status === 409).body.error, 'Você já tem uma saída sem retorno. Registre o retorno primeiro.');
  await fecharViagem(MOTORISTA2, 135);
  const abertas = (await como(ADMIN, 'get', '/api/frotas/viagens')).body.filter((v) => v.status === 'em_andamento'
    && (v.veiculo_id === S.v6.id || v.veiculo_id === S.v7.id));
  assert.strictEqual(abertas.length, 0, 'nenhuma viagem ficou aberta');
});

test('RN-F1.13 o gestor com motorista ligado usa o portal; sem vinculo a mesma 409', async () => {
  const r = await registrar(ADMIN, { tipo: 'inspecao', veiculo_id: S.v7.id, km: 100, confirmar_km_menor: true }); // Etapa 3: a regua do km (RN-F3.01) nao e o assunto aqui
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.registro.motorista_id, S.mc.id);
  await dbRun(ctx.db, 'UPDATE frotas_motoristas SET usuario_id = NULL WHERE id = ?', [S.mc.id]);
  const s = await registrar(ADMIN, { tipo: 'inspecao', veiculo_id: S.v7.id, km: 100 });
  assert.strictEqual(s.status, 409);
  assert.strictEqual(s.body.code, 'MOTORISTA_NAO_VINCULADO');
});

// ── /portal/abastecimentos (F2-12) ──────────────────────────────────────────────────────────
test('F2-12 POST /portal/abastecimentos: mensagens literais', async () => {
  const base = { veiculo_id: S.v7.id, km: 200, litros: 10, valor_total: 60 };
  const casos = [
    [{ ...base, veiculo_id: undefined }, 400, 'Veículo, litros e data são obrigatórios'],
    [{ ...base, km: undefined }, 400, 'Informe o KM atual'],
    [{ ...base, km: -5 }, 400, 'Informe o KM atual'],
    [{ ...base, litros: 0 }, 400, 'Informe os litros'],
    [{ ...base, litros: undefined }, 400, 'Informe os litros'],
    [{ ...base, valor_total: -1 }, 400, 'Valor inválido'],
    [{ ...base, data: '2026/10/23' }, 400, 'Data inválida'],
    [{ ...base, veiculo_id: 9999 }, 404, 'Veículo não encontrado'],
    [{ ...base, veiculo_id: S.v4.id }, 404, 'Veículo não encontrado'],
  ];
  for (const [corpo, st, msg] of casos) {
    const r = await como(MOTORISTA, 'post', '/api/frotas/portal/abastecimentos', corpo);
    assert.strictEqual(r.status, st, `${JSON.stringify(corpo)} -> ${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, msg);
  }
});

test('F2-12 / RN-F1.11 abastecimento do portal: motorista do vinculo, data padrao hoje, km/L do anterior em km', async () => {
  const a = await como(MOTORISTA, 'post', '/api/frotas/portal/abastecimentos', {
    veiculo_id: S.v7.id, km: 1000, litros: 40, valor_total: 240, motorista_id: S.mb.id, posto: 'Posto A',
  });
  assert.strictEqual(a.status, 201, JSON.stringify(a.body));
  assert.strictEqual(a.body.motorista_id, S.ma.id);
  assert.strictEqual(a.body.data_abastecimento, hojeLocalISO());
  assert.strictEqual(a.body.km_abastecimento, 1000);
  assert.strictEqual(a.body.valor_litro, 6);
  const b = await como(MOTORISTA, 'post', '/api/frotas/portal/abastecimentos', {
    veiculo_id: S.v7.id, km: 1400, litros: 40, valor_total: 240, data: '2026-10-22',
  });
  assert.strictEqual(b.status, 201);
  assert.strictEqual(b.body.km_desde_anterior, 400);
  assert.strictEqual(b.body.consumo_medio, 10);
  S.abAna = b.body;
});

// ── meus-registros ──────────────────────────────────────────────────────────────────────────
test('GET /portal/meus-registros: so os do motorista, mais novos primeiro, com placa; limite; sem vinculo vazio', async () => {
  const r = await como(MOTORISTA, 'get', '/api/frotas/portal/meus-registros');
  assert.strictEqual(r.status, 200);
  assert(r.body.registros.length >= 5);
  assert(r.body.registros.every((x) => x.motorista_id === S.ma.id));
  assert(r.body.registros.every((x) => typeof x.placa === 'string'));
  assert(r.body.registros.every((x) => x.itens === null || typeof x.itens === 'object'));
  const chaves = r.body.registros.map((x) => `${x.data_checklist} ${x.horario} ${String(x.id).padStart(6, '0')}`);
  assert.deepStrictEqual(chaves, [...chaves].sort().reverse(), 'mais novos primeiro');
  assert.strictEqual(r.body.abastecimentos.length, 2);
  assert(r.body.abastecimentos.every((x) => x.motorista_id === S.ma.id && x.placa === 'POR0007'));
  const lim = await como(MOTORISTA, 'get', '/api/frotas/portal/meus-registros?limite=1');
  assert.strictEqual(lim.body.registros.length, 1);
  assert.strictEqual(lim.body.abastecimentos.length, 1);
  const bruno = await como(MOTORISTA2, 'get', '/api/frotas/portal/meus-registros');
  assert(bruno.body.registros.every((x) => x.motorista_id === S.mb.id));
  assert.strictEqual(bruno.body.abastecimentos.length, 0);
  const sem = await como(SEM_VINCULO, 'get', '/api/frotas/portal/meus-registros');
  assert.deepStrictEqual(sem.body, { registros: [], abastecimentos: [] });
});

(async () => {
  ctx = await createFrotasTestApp();
  await cenario();
  console.log('\nFrotas Etapa 1 — T4 (portal do motorista)\n');
  for (const [name, fn] of testes) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
  }
  console.log(`\nResultado: ${passed} passou, ${failed} falhou\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
