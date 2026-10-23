/**
 * Frotas Etapa 1 (RN-F1.18) — exportacao no formato da planilha "Controle de Frota GMP" que o escritorio usa hoje
 * (specs/modulo-frotas/00-processo-atual). Seis abas, na ordem da planilha. O periodo (data_inicio/data_fim, opcionais) filtra
 * Viagens (data_saida), Checklist, Abastecimentos e Manutencoes; Cadastro e Documentos saem inteiros.
 *
 * Datas saem como texto 'AAAA-MM-DD' (o que o banco guarda) — B11 em docs/frotas/novidades-por-etapa.md.
 */
const XLSX = require('xlsx');
const { dbAll } = require('./db');
const { hojeLocalISO } = require('../diaLocal');
const { ITENS_CHECKLIST, LEGADO_DE_ITEM, situacaoDoRegistro } = require('./schema');
const { diasAte, registroComItens } = require('./frotasService');

const SITUACAO_VEICULO = { ativo: 'Ativo', manutencao: 'Em manutenção', inativo: 'Inativo', vendido: 'Vendido' };
const STATUS_VIAGEM = {
  solicitada: 'Solicitada', aprovada: 'Aprovada', em_andamento: 'Em andamento', concluida: 'Concluída', cancelada: 'Cancelada',
};
const STATUS_MANUTENCAO = { agendada: 'Planejada', em_andamento: 'Em andamento', concluida: 'Concluída' };
const TIPO_MANUTENCAO = { preventiva: 'Preventiva', corretiva: 'Corretiva' };
const TIPO_REGISTRO = { saida: 'Saída', retorno: 'Retorno', inspecao: 'Inspeção' };
const RESPOSTA = { OK: 'Conforme', FALHA: 'Não conforme', NA: 'N/A' };
const SITUACAO_REGISTRO = { OK: 'OK', PENDENCIA: 'PENDÊNCIA', INCOMPLETO: 'INCOMPLETO' };
const VISTA = {
  lateral_esquerda: 'Lateral esquerda', lateral_direita: 'Lateral direita', superior: 'Superior', frente: 'Frente', traseira: 'Traseira',
};
const TIPO_AVARIA = { R: 'risco', A: 'amassado', T: 'trinca', Q: 'quebrado', O: 'outro' };

const vazio = (v) => (v === null || v === undefined ? '' : v);
const dia = (v) => (v ? String(v).slice(0, 10) : '');
/** 'HH:MM' de um 'AAAA-MM-DDTHH:MM' (ou com espaco); '' se so tiver o dia. */
const hora = (v) => {
  const m = /^\d{4}-\d{2}-\d{2}[T ](\d{2}:\d{2})/.exec(String(v || ''));
  return m ? m[1] : '';
};

/** Filtro de periodo sobre uma coluna so de data (ou que comeca por AAAA-MM-DD). */
function filtroPeriodo(coluna, { data_inicio: inicio, data_fim: fim } = {}) {
  const partes = [];
  const params = [];
  if (inicio) { partes.push(`substr(${coluna}, 1, 10) >= ?`); params.push(String(inicio).slice(0, 10)); }
  if (fim) { partes.push(`substr(${coluna}, 1, 10) <= ?`); params.push(String(fim).slice(0, 10)); }
  return { sql: partes.length ? ` AND ${partes.join(' AND ')}` : '', params };
}

async function abaCadastro(db, hoje) {
  const veiculos = await dbAll(db, `SELECT v.*, t.nome AS tipo_nome, m.nome AS motorista_nome FROM frotas_veiculos v
    LEFT JOIN frotas_tipos_veiculo t ON t.id = v.tipo_id
    LEFT JOIN frotas_motoristas m ON m.id = v.motorista_id
    WHERE v.ativo = 1 ORDER BY v.placa`);
  const manut = await dbAll(db, 'SELECT veiculo_id, proxima_revisao_km, proxima_revisao_data FROM frotas_manutencoes');
  const linhas = [['Placa', 'Tipo', 'Marca', 'Modelo', 'Ano', 'KM Atual', 'Responsável', 'Próxima Revisão KM', 'Próxima Revisão Data', 'Situação']];
  for (const v of veiculos) {
    const doVeiculo = manut.filter((m) => m.veiculo_id === v.id);
    // F2-18: a menor revisao ainda por vir — km acima do atual, data de hoje em diante
    const kms = doVeiculo.map((m) => m.proxima_revisao_km).filter((k) => k != null && Number(k) > Number(v.km_atual || 0)).map(Number);
    const datas = doVeiculo.map((m) => m.proxima_revisao_data).filter((d) => d && dia(d) >= hoje).map(dia).sort();
    linhas.push([
      v.placa, vazio(v.tipo_nome || v.tipo_texto), vazio(v.marca), vazio(v.modelo), vazio(v.ano), vazio(v.km_atual),
      vazio(v.motorista_nome || v.setor_responsavel), kms.length ? Math.min(...kms) : '', datas[0] || '',
      SITUACAO_VEICULO[v.status] || vazio(v.status),
    ]);
  }
  return linhas;
}

async function abaViagens(db, periodo) {
  const f = filtroPeriodo('vi.data_saida', periodo);
  const rows = await dbAll(db, `SELECT vi.*, v.placa, m.nome AS motorista_nome FROM frotas_viagens vi
    JOIN frotas_veiculos v ON v.id = vi.veiculo_id
    LEFT JOIN frotas_motoristas m ON m.id = vi.motorista_id
    WHERE 1=1${f.sql} ORDER BY vi.data_saida, vi.id`, f.params);
  const linhas = [['Data', 'Veículo', 'Condutor', 'Finalidade', 'Origem', 'Destino', 'Saída', 'Retorno', 'KM Inicial', 'KM Final', 'KM Percorrido', 'Status', 'Observações']];
  for (const r of rows) {
    // Saida: a hora (o dia esta em Data). Retorno: a hora se for no mesmo dia; senao dia e hora.
    const retornoMesmoDia = r.data_retorno && dia(r.data_retorno) === dia(r.data_saida);
    const retorno = !r.data_retorno ? '' : retornoMesmoDia && hora(r.data_retorno) ? hora(r.data_retorno)
      : String(r.data_retorno).replace('T', ' ');
    const kmRodado = r.km_rodado != null ? r.km_rodado
      : (r.km_saida != null && r.km_retorno != null ? Number(r.km_retorno) - Number(r.km_saida) : '');
    linhas.push([
      dia(r.data_saida) || dia(r.created_at), r.placa, vazio(r.motorista_nome), vazio(r.finalidade), vazio(r.origem), vazio(r.destino),
      hora(r.data_saida), retorno, vazio(r.km_saida), vazio(r.km_retorno), kmRodado, STATUS_VIAGEM[r.status] || vazio(r.status),
      vazio(r.observacoes),
    ]);
  }
  return linhas;
}

function textoAvarias(avarias) {
  if (!Array.isArray(avarias) || !avarias.length) return '';
  return avarias.map((a) => `${VISTA[a.vista] || a.vista}: ${TIPO_AVARIA[a.tipo] || a.tipo}${a.descricao ? ` — ${a.descricao}` : ''}`).join('; ');
}

async function abaChecklist(db, periodo) {
  const f = filtroPeriodo('c.data_checklist', periodo);
  const rows = await dbAll(db, `SELECT c.*, v.placa, m.nome AS motorista_nome FROM frotas_checklists c
    JOIN frotas_veiculos v ON v.id = c.veiculo_id
    LEFT JOIN frotas_motoristas m ON m.id = c.motorista_id
    WHERE 1=1${f.sql} ORDER BY c.data_checklist, c.horario, c.id`, f.params);
  const linhas = [['Data', 'Horário', 'Tipo', 'Veículo', 'Condutor', 'KM', 'Combustível', ...ITENS_CHECKLIST.map((i) => i.rotulo), 'Avarias', 'Status Geral', 'Observações']];
  const itemDoLegado = Object.fromEntries(Object.entries(LEGADO_DE_ITEM).map(([legado, chave]) => [chave, legado]));
  for (const row of rows) {
    const c = registroComItens(row);
    const respostas = ITENS_CHECKLIST.map((i) => {
      if (c.itens) return RESPOSTA[c.itens[i.chave]] || '';
      // registro da tela antiga: os 5 itens que tem par nos 7 *_ok
      const legado = itemDoLegado[i.chave];
      if (!legado || c[legado] == null) return '';
      return Number(c[legado]) === 0 ? 'Não conforme' : 'Conforme';
    });
    // F2-6: a mesma regua — a gravada, ou (linha anterior a Etapa 1) a calculada dos 7 *_ok
    const situacao = c.status_geral || situacaoDoRegistro(c.itens ? { itens: c.itens, avarias: c.avarias } : { legados: c, avarias: c.avarias });
    linhas.push([
      dia(c.data_checklist), vazio(c.horario), TIPO_REGISTRO[c.tipo_registro] || 'Inspeção', c.placa, vazio(c.motorista_nome),
      vazio(c.km), vazio(c.nivel_combustivel), ...respostas, textoAvarias(c.avarias), SITUACAO_REGISTRO[situacao] || situacao,
      vazio(c.observacoes),
    ]);
  }
  return linhas;
}

async function abaAbastecimentos(db, periodo) {
  const f = filtroPeriodo('a.data_abastecimento', periodo);
  const rows = await dbAll(db, `SELECT a.*, v.placa, m.nome AS motorista_nome FROM frotas_abastecimentos a
    JOIN frotas_veiculos v ON v.id = a.veiculo_id
    LEFT JOIN frotas_motoristas m ON m.id = a.motorista_id
    WHERE 1=1${f.sql} ORDER BY a.data_abastecimento, a.id`, f.params);
  const linhas = [['Data', 'Veículo', 'Condutor', 'KM', 'Litros', 'Valor Total R$', 'Preço por Litro', 'KM desde Abastec. Anterior', 'Consumo km/L', 'Posto', 'Observações']];
  for (const a of rows) {
    const preco = a.valor_litro != null && Number(a.valor_litro) > 0 ? Math.round(Number(a.valor_litro) * 1000) / 1000
      : (Number(a.litros) > 0 ? Math.round((Number(a.valor_total) / Number(a.litros)) * 1000) / 1000 : '');
    linhas.push([
      dia(a.data_abastecimento), a.placa, vazio(a.motorista_nome), vazio(a.km_abastecimento), vazio(a.litros), vazio(a.valor_total),
      preco, vazio(a.km_desde_anterior), vazio(a.consumo_medio), vazio(a.posto), vazio(a.observacoes),
    ]);
  }
  return linhas;
}

async function abaManutencoes(db, periodo) {
  const f = filtroPeriodo('mt.data_manutencao', periodo);
  const rows = await dbAll(db, `SELECT mt.*, v.placa FROM frotas_manutencoes mt
    JOIN frotas_veiculos v ON v.id = mt.veiculo_id
    WHERE 1=1${f.sql} ORDER BY mt.data_manutencao, mt.id`, f.params);
  const linhas = [['Data', 'Veículo', 'Tipo', 'Serviço', 'Fornecedor', 'KM Serviço', 'Custo R$', 'Próxima Revisão KM', 'Próxima Revisão Data', 'Status', 'Observações']];
  for (const m of rows) {
    linhas.push([
      dia(m.data_manutencao), m.placa, TIPO_MANUTENCAO[m.tipo] || vazio(m.tipo), vazio(m.descricao), vazio(m.oficina),
      vazio(m.km_manutencao), vazio(m.custo), vazio(m.proxima_revisao_km), dia(m.proxima_revisao_data),
      STATUS_MANUTENCAO[m.status] || vazio(m.status), vazio(m.observacoes),
    ]);
  }
  return linhas;
}

async function abaDocumentos(db, hoje) {
  const rows = await dbAll(db, `SELECT d.*, v.placa FROM frotas_documentos d
    JOIN frotas_veiculos v ON v.id = d.veiculo_id
    WHERE v.ativo = 1 AND d.status = 'ativo' ORDER BY v.placa, d.data_vencimento, d.id`); // Fase5-2: a regua do alerta (renovado nao e VENCIDO)
  const linhas = [['Veículo', 'Documento', 'Vencimento', 'Dias até Vencer', 'Status', 'Observações']];
  for (const d of rows) {
    const dias = diasAte(d.data_vencimento, hoje);
    const status = dias == null ? '' : dias < 0 ? 'VENCIDO' : dias <= 30 ? 'ATENÇÃO' : 'EM DIA';
    const nome = `${String(d.tipo || '').toUpperCase()}${d.descricao ? ` — ${d.descricao}` : ''}`;
    linhas.push([d.placa, nome, dia(d.data_vencimento), dias == null ? '' : dias, status, vazio(d.observacoes)]);
  }
  return linhas;
}

/** Monta o .xlsx e devolve `{ buffer, nomeArquivo }`. */
async function exportarPlanilha(db, periodo = {}) {
  const hoje = hojeLocalISO();
  const livro = XLSX.utils.book_new();
  const abas = [
    ['Cadastro Frota', await abaCadastro(db, hoje)],
    ['Viagens e KM', await abaViagens(db, periodo)],
    ['Checklist', await abaChecklist(db, periodo)],
    ['Abastecimentos', await abaAbastecimentos(db, periodo)],
    ['Manutenções', await abaManutencoes(db, periodo)],
    ['Documentos', await abaDocumentos(db, hoje)],
  ];
  for (const [nome, linhas] of abas) {
    XLSX.utils.book_append_sheet(livro, XLSX.utils.aoa_to_sheet(linhas), nome);
  }
  const buffer = XLSX.write(livro, { type: 'buffer', bookType: 'xlsx' });
  return { buffer, nomeArquivo: `controle-de-frota-${hoje}.xlsx` };
}

module.exports = { exportarPlanilha };
