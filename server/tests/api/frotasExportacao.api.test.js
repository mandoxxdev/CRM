/**
 * Frotas Etapa 1 — T5: GET /api/frotas/exportar.xlsx no formato da planilha "Controle de Frota GMP".
 *
 *   RN-F1.18  abas Cadastro Frota, Viagens e KM, Checklist, Abastecimentos, Manutencoes, Documentos — cabecalhos e linhas;
 *             perfil `relatorios`; periodo opcional filtra Viagens (data_saida), Checklist, Abastecimentos e Manutencoes;
 *             Cadastro e Documentos saem inteiros
 *   F2-18     Proxima Revisao KM = menor proxima_revisao_km > km_atual; Data = menor proxima_revisao_data >= hoje
 *   F2-6      Status Geral do Checklist sai da mesma regua (situacaoDoRegistro / status_geral)
 *
 * Plano: docs/superpowers/plans/2026-10-23-frotas-etapa1-portal-do-motorista.md
 * Executar: cd server && node tests/api/frotasExportacao.api.test.js
 */
const assert = require('assert');
const XLSX = require('xlsx');
const { createFrotasTestApp, ADMIN, MOTORISTA, CONSULTA } = require('../helpers/frotasTestApp');
const { hojeLocalISO } = require('../../services/diaLocal');

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

const CHAVES = ['pneus_estepe', 'farois_lanternas', 'setas_luz_freio', 'parabrisa_vidros', 'espelhos_retrovisores',
  'limpadores_agua', 'oleo_motor', 'arrefecimento', 'freios', 'buzina_cintos', 'documentos_equipamentos', 'carroceria_carga'];
const ROTULOS = ['Pneus e estepe', 'Faróis / lanternas', 'Setas / luz de freio', 'Parabrisa / vidros', 'Espelhos / retrovisores',
  'Limpadores / água', 'Óleo do motor / vazamentos', 'Arrefecimento / nível', 'Freios / freio de estacionamento', 'Buzina / cintos',
  'Documentos / equipamentos', 'Carroceria / amarração da carga'];
const todosOk = () => Object.fromEntries(CHAVES.map((k) => [k, 'OK']));
const somaDias = (dia, n) => { const [a, m, d] = dia.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10); };
const HOJE = hojeLocalISO();

let ctx;
const S = {};

async function como(user, metodo, url, corpo) {
  ctx.setUser(user);
  return ctx.req(metodo, url, corpo);
}

function binario(res, cb) {
  res.setEncoding('binary');
  let d = '';
  res.on('data', (c) => { d += c; });
  res.on('end', () => cb(null, Buffer.from(d, 'binary')));
}

async function exportar(user, qs = '') {
  ctx.setUser(user);
  const r = await ctx.req('get', `/api/frotas/exportar.xlsx${qs}`).buffer(true).parse(binario);
  return r;
}

function abas(buf) {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const out = {};
  for (const n of wb.SheetNames) out[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '' });
  return { nomes: wb.SheetNames, out };
}

async function cenario() {
  S.v1 = (await como(ADMIN, 'post', '/api/frotas/veiculos', {
    placa: 'EXP0001', marca: 'Fiat', modelo: 'Strada', ano: 2022, km_atual: 1000, tipo_texto: 'Caminhonete', status: 'ativo',
  })).body;
  S.v2 = (await como(ADMIN, 'post', '/api/frotas/veiculos', { placa: 'EXP0002', km_atual: 50000, status: 'manutencao' })).body;
  S.v3 = (await como(ADMIN, 'post', '/api/frotas/veiculos', { placa: 'EXP0003' })).body;
  await como(ADMIN, 'delete', `/api/frotas/veiculos/${S.v3.id}`);
  S.ma = (await como(ADMIN, 'post', '/api/frotas/motoristas', { nome: 'Ana Motorista', usuario_id: 2 })).body;
  await como(ADMIN, 'put', `/api/frotas/veiculos/${S.v1.id}`, { motorista_id: S.ma.id });

  // manutencoes: proxima revisao
  await como(ADMIN, 'post', '/api/frotas/manutencoes', {
    veiculo_id: S.v1.id, descricao: 'Revisao 10 mil', oficina: 'Oficina X', custo: 350.5, km_manutencao: 900,
    data_manutencao: '2026-09-10', proxima_revisao_km: 900, proxima_revisao_data: somaDias(HOJE, -5), status: 'concluida', tipo: 'preventiva',
  });
  await como(ADMIN, 'post', '/api/frotas/manutencoes', {
    veiculo_id: S.v1.id, descricao: 'Troca de pastilhas', oficina: 'Oficina Y', custo: 200, data_manutencao: '2026-10-15',
    proxima_revisao_km: 20000, proxima_revisao_data: somaDias(HOJE, 60), status: 'agendada', tipo: 'corretiva',
  });
  await como(ADMIN, 'post', '/api/frotas/manutencoes', {
    veiculo_id: S.v1.id, descricao: 'Alinhamento', data_manutencao: '2026-10-16',
    proxima_revisao_km: 15000, proxima_revisao_data: somaDias(HOJE, 90), status: 'em_andamento',
  });
  // em_andamento pos o v1 em manutencao; volta para ativo
  await como(ADMIN, 'put', `/api/frotas/veiculos/${S.v1.id}`, { status: 'ativo' });

  // viagem pelo portal (saida e retorno) e uma antiga pelo gestor
  await como(MOTORISTA, 'post', '/api/frotas/portal/registros', {
    tipo: 'saida', veiculo_id: S.v1.id, km: 1000, data: '2026-10-20', horario: '07:00', nivel_combustivel: '1/2',
    itens: { ...todosOk(), freios: 'FALHA', buzina_cintos: 'NA' }, avarias: [{ vista: 'frente', tipo: 'R', descricao: 'para-choque' }, { vista: 'traseira', tipo: 'A' }],
    origem: 'GMP', destino: 'Cliente', finalidade: 'Entrega', observacoes: 'freio puxando',
  });
  await como(MOTORISTA, 'post', '/api/frotas/portal/registros', { tipo: 'retorno', km: 1120, data: '2026-10-20', horario: '18:10', itens: todosOk() });
  await como(ADMIN, 'post', '/api/frotas/viagens', {
    veiculo_id: S.v2.id, data_saida: '2026-08-01T08:00', km_saida: 100, km_retorno: 200, status: 'concluida', destino: 'Antiga',
  });
  // checklist antigo (sem itens)
  await como(ADMIN, 'post', '/api/frotas/checklists', {
    veiculo_id: S.v2.id, data_checklist: '2026-08-02', pneus_ok: 1, oleo_ok: 0, luzes_ok: 1, freios_ok: 1, extintor_ok: 1, documentos_ok: 1, limpeza_ok: 1,
  });
  // abastecimentos
  await como(MOTORISTA, 'post', '/api/frotas/portal/abastecimentos', { veiculo_id: S.v1.id, km: 1000, litros: 40, valor_total: 240, data: '2026-10-19', posto: 'Posto A',
    confirmar_km_menor: true }); // Etapa 3 (RN-F3.02, B35): retroativo abaixo do atual (1120) pede a confirmacao
  await como(MOTORISTA, 'post', '/api/frotas/portal/abastecimentos', { veiculo_id: S.v1.id, km: 1400, litros: 40, valor_total: 260, data: '2026-10-21', posto: 'Posto B' });
  // documentos
  await como(ADMIN, 'post', '/api/frotas/documentos', { veiculo_id: S.v1.id, tipo: 'ipva', data_vencimento: somaDias(HOJE, -3), observacoes: 'pagar' });
  await como(ADMIN, 'post', '/api/frotas/documentos', { veiculo_id: S.v1.id, tipo: 'seguro', descricao: 'Porto', data_vencimento: somaDias(HOJE, 30) });
  await como(ADMIN, 'post', '/api/frotas/documentos', { veiculo_id: S.v2.id, tipo: 'licenciamento', data_vencimento: somaDias(HOJE, 31) });
}

test('RN-F1.18 perfil relatorios: MOTORISTA 403; CONSULTA e ADMIN 200 com o nome e o tipo do arquivo', async () => {
  const m = await como(MOTORISTA, 'get', '/api/frotas/exportar.xlsx');
  assert.strictEqual(m.status, 403);
  const c = await exportar(CONSULTA);
  assert.strictEqual(c.status, 200);
  const r = await exportar(ADMIN);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.headers['content-disposition'], `attachment; filename="controle-de-frota-${HOJE}.xlsx"`);
  assert(/spreadsheetml/.test(r.headers['content-type']), r.headers['content-type']);
  assert(Buffer.isBuffer(r.body) && r.body.length > 1000);
  S.planilha = abas(r.body);
});

// Frota Etapa 4 (RN-F4.10): a setima aba, Multas, entra no FIM — as seis da planilha da empresa nao mudam de lugar
test('RN-F1.18 as seis abas na ordem da planilha (e Multas no fim, RN-F4.10)', async () => {
  assert.deepStrictEqual(S.planilha.nomes, ['Cadastro Frota', 'Viagens e KM', 'Checklist', 'Abastecimentos', 'Manutenções', 'Documentos', 'Multas']);
});

test('RN-F1.18 (F2-18) Cadastro Frota: cabecalho, veiculos ativos e proxima revisao (menor pendente)', async () => {
  const [cab, ...linhas] = S.planilha.out['Cadastro Frota'];
  assert.deepStrictEqual(cab, ['Placa', 'Tipo', 'Marca', 'Modelo', 'Ano', 'KM Atual', 'Responsável', 'Próxima Revisão KM', 'Próxima Revisão Data', 'Situação', 'Horímetro Atual']); // + Horimetro Atual no fim: Etapa 3 (RN-F3.11); o resto igual
  assert.deepStrictEqual(linhas.map((l) => l[0]), ['EXP0001', 'EXP0002'], 'o excluido fica fora');
  const v1 = linhas[0];
  assert.deepStrictEqual(v1, ['EXP0001', 'Caminhonete', 'Fiat', 'Strada', 2022, 1400, 'Ana Motorista', 15000, somaDias(HOJE, 60), 'Ativo', '']);
  assert.strictEqual(linhas[1][9], 'Em manutenção');
  assert.strictEqual(linhas[1][7], '', 'sem revisao pendente');
});

test('RN-F1.18 Viagens e KM: cabecalho e linhas (portal e gestor)', async () => {
  const [cab, ...linhas] = S.planilha.out['Viagens e KM'];
  assert.deepStrictEqual(cab, ['Data', 'Veículo', 'Condutor', 'Finalidade', 'Origem', 'Destino', 'Saída', 'Retorno', 'KM Inicial', 'KM Final', 'KM Percorrido', 'Status', 'Observações', 'Horímetro Inicial', 'Horímetro Final']); // Etapa 3 (RN-F3.11)
  assert.strictEqual(linhas.length, 2);
  const p = linhas.find((l) => l[1] === 'EXP0001');
  assert.deepStrictEqual(p, ['2026-10-20', 'EXP0001', 'Ana Motorista', 'Entrega', 'GMP', 'Cliente', '07:00', '18:10', 1000, 1120, 120, 'Concluída', 'freio puxando', '', '']);
  const g = linhas.find((l) => l[1] === 'EXP0002');
  assert.strictEqual(g[0], '2026-08-01');
  assert.strictEqual(g[10], 100);
});

test('RN-F1.18 (F2-6) Checklist: 12 itens Conforme/Nao conforme/N/A, avarias em texto, Status Geral', async () => {
  const [cab, ...linhas] = S.planilha.out.Checklist;
  assert.deepStrictEqual(cab, ['Data', 'Horário', 'Tipo', 'Veículo', 'Condutor', 'KM', 'Combustível', ...ROTULOS, 'Avarias', 'Status Geral', 'Observações', 'Horímetro',
    'Pendência tratada em', 'Tratada por', 'O que foi feito']); // Etapa 3 (RN-F3.11); Frota Etapa 6 (RN-F6.05): as tres no fim
  assert.strictEqual(linhas.length, 3);
  const saida = linhas.find((l) => l[2] === 'Saída');
  assert.deepStrictEqual(saida.slice(0, 7), ['2026-10-20', '07:00', 'Saída', 'EXP0001', 'Ana Motorista', 1000, '1/2']);
  const itens = saida.slice(7, 19);
  assert.strictEqual(itens[0], 'Conforme');
  assert.strictEqual(itens[8], 'Não conforme', 'freios FALHA');
  assert.strictEqual(itens[9], 'N/A', 'buzina NA');
  assert.strictEqual(saida[19], 'Frente: risco — para-choque; Traseira: amassado');
  assert.strictEqual(saida[20], 'PENDÊNCIA');
  assert.strictEqual(saida[21], 'freio puxando');
  const retorno = linhas.find((l) => l[2] === 'Retorno');
  assert.strictEqual(retorno[19], '');
  assert.strictEqual(retorno[20], 'OK');
  const antigo = linhas.find((l) => l[3] === 'EXP0002');
  assert.strictEqual(antigo[2], 'Inspeção');
  assert.strictEqual(antigo[7], 'Conforme', 'pneus_ok = 1 -> Pneus e estepe');
  assert.strictEqual(antigo[13], 'Não conforme', 'oleo_ok = 0 -> Oleo do motor');
  assert.strictEqual(antigo[9], '', 'item que a tela antiga nao tem fica vazio');
  assert.strictEqual(antigo[20], 'PENDÊNCIA');
});

test('RN-F1.18 Abastecimentos: preco por litro, km desde o anterior e km/L', async () => {
  const [cab, ...linhas] = S.planilha.out.Abastecimentos;
  assert.deepStrictEqual(cab, ['Data', 'Veículo', 'Condutor', 'KM', 'Litros', 'Valor Total R$', 'Preço por Litro', 'KM desde Abastec. Anterior', 'Consumo km/L', 'Posto', 'Observações', 'Horímetro',
    'Horas desde Abastec. Anterior', 'Consumo L/h']); // Etapa 3 (RN-F3.11); Etapa 4 (RN-F4.11): colunas no fim
  assert.strictEqual(linhas.length, 2);
  const b = linhas.find((l) => l[9] === 'Posto B');
  assert.deepStrictEqual(b, ['2026-10-21', 'EXP0001', 'Ana Motorista', 1400, 40, 260, 6.5, 400, 10, 'Posto B', '', '', '', '']);
  const a = linhas.find((l) => l[9] === 'Posto A');
  assert.strictEqual(a[7], '');
  assert.strictEqual(a[8], '');
});

test('RN-F1.18 Manutencoes: tipo, fornecedor e status no vocabulario da planilha', async () => {
  const [cab, ...linhas] = S.planilha.out['Manutenções'];
  assert.deepStrictEqual(cab, ['Data', 'Veículo', 'Tipo', 'Serviço', 'Fornecedor', 'KM Serviço', 'Custo R$', 'Próxima Revisão KM', 'Próxima Revisão Data', 'Status', 'Observações']);
  assert.strictEqual(linhas.length, 3);
  const r = linhas.find((l) => l[3] === 'Revisao 10 mil');
  assert.deepStrictEqual(r, ['2026-09-10', 'EXP0001', 'Preventiva', 'Revisao 10 mil', 'Oficina X', 900, 350.5, 900, somaDias(HOJE, -5), 'Concluída', '']);
  assert.strictEqual(linhas.find((l) => l[3] === 'Troca de pastilhas')[9], 'Planejada');
  assert.strictEqual(linhas.find((l) => l[3] === 'Troca de pastilhas')[2], 'Corretiva');
  assert.strictEqual(linhas.find((l) => l[3] === 'Alinhamento')[9], 'Em andamento');
});

test('RN-F1.18 Documentos: dias ate vencer e VENCIDO / ATENCAO (<= 30) / EM DIA', async () => {
  const [cab, ...linhas] = S.planilha.out.Documentos;
  assert.deepStrictEqual(cab, ['Veículo', 'Documento', 'Vencimento', 'Dias até Vencer', 'Status', 'Observações']);
  assert.strictEqual(linhas.length, 3);
  const ipva = linhas.find((l) => l[1] === 'IPVA');
  assert.deepStrictEqual(ipva, ['EXP0001', 'IPVA', somaDias(HOJE, -3), -3, 'VENCIDO', 'pagar']);
  const seguro = linhas.find((l) => l[1].startsWith('SEGURO'));
  assert.strictEqual(seguro[1], 'SEGURO — Porto');
  assert.strictEqual(seguro[3], 30);
  assert.strictEqual(seguro[4], 'ATENÇÃO');
  assert.strictEqual(linhas.find((l) => l[1] === 'LICENCIAMENTO')[4], 'EM DIA');
});

test('RN-F1.18 periodo filtra Viagens, Checklist, Abastecimentos e Manutencoes; Cadastro e Documentos inteiros', async () => {
  const r = await exportar(ADMIN, '?data_inicio=2026-10-01&data_fim=2026-10-20');
  assert.strictEqual(r.status, 200);
  const { out } = abas(r.body);
  const n = (aba) => out[aba].length - 1;
  assert.strictEqual(n('Viagens e KM'), 1, 'so a de 20/10 (a de agosto fica fora)');
  assert.strictEqual(n('Checklist'), 2, 'saida e retorno de 20/10');
  assert.strictEqual(n('Abastecimentos'), 1, 'so o de 19/10 (o de 21/10 fica fora)');
  assert.strictEqual(n('Manutenções'), 2, '15/10 e 16/10 (a de setembro fica fora)');
  assert.strictEqual(n('Cadastro Frota'), 2);
  assert.strictEqual(n('Documentos'), 3);
  const so = await exportar(ADMIN, '?data_inicio=2026-10-21');
  assert.strictEqual(abas(so.body).out.Abastecimentos.length - 1, 1, 'so o inicio tambem filtra');
});

(async () => {
  ctx = await createFrotasTestApp();
  await cenario();
  console.log('\nFrotas Etapa 1 — T5 (exportacao no formato da planilha)\n');
  for (const [name, fn] of testes) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
  }
  console.log(`\nResultado: ${passed} passou, ${failed} falhou\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
