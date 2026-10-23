/**
 * Configurações de entidades CRUD do módulo Frotas
 */

import { hojeLocalISO } from '../../utils/dataLocal';

// Etapa 164 (RN-164.06, B1048): as datas padrao dos formularios sao o dia LOCAL (antes o toISOString, o dia UTC: das 21h, amanha)
const TIPO_REGISTRO = { saida: 'Saída', retorno: 'Retorno', inspecao: 'Inspeção' };
const SITUACOES = {
  OK: { rotulo: 'OK', classe: 'ok' },
  PENDENCIA: { rotulo: 'PENDÊNCIA', classe: 'pendencia' },
  INCOMPLETO: { rotulo: 'INCOMPLETO', classe: 'incompleto' },
};
export function situacaoDoChecklist(r) {
  if (SITUACOES[r?.status_geral]) return SITUACOES[r.status_geral];
  return r?.aprovado ? SITUACOES.OK : SITUACOES.PENDENCIA;
}

// Frota Etapa 2 (RN-F2.09): texto literal do plano (docs/superpowers/plans/2026-10-23-frotas-etapa2-perfis-pela-tela.md).
export const AVISO_USUARIO_CONSULTA = 'Este usuário está com o perfil Consulta no Frota: ele vê o painel, mas não consegue registrar '
  + 'no portal. Para ele registrar, mude o perfil em Frota → Perfis de acesso.';

/** Frota Etapa 3 (RN-F3.11): leitura de horas da maquina por horimetro aparece como horas ("125 h"). */
export const horas = (n) => `${Number(n).toLocaleString('pt-BR')} h`;

const fmtBrl = (v) =>new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export const ENTITY_CONFIGS = {
  veiculos: {
    endpoint: 'veiculos',
    title: 'Veículos',
    subtitle: 'Cadastro de automóveis, caminhões, empilhadeiras e veículos da frota GMP',
    breadcrumb: 'Veículos',
    newLabel: 'Novo Veículo',
    searchPlaceholder: 'Buscar por placa, modelo, marca...',
    columns: [
      { key: 'placa', label: 'Placa', bold: true },
      { key: 'marca', label: 'Marca' },
      { key: 'modelo', label: 'Modelo' },
      { key: 'tipo_nome', label: 'Tipo', format: (r) => r.tipo_nome || r.tipo_texto || '-' },
      { key: 'setor_responsavel', label: 'Setor' },
      { key: 'motorista_nome', label: 'Condutor' },
      { key: 'km_atual', label: 'KM/Horímetro', format: (r) => {
        if (r.tipo_medicao === 'horimetro') {
          return r.horimetro_atual != null ? `${Number(r.horimetro_atual).toLocaleString('pt-BR')} h` : '-';
        }
        return r.km_atual != null ? `${Number(r.km_atual).toLocaleString('pt-BR')} km` : '-';
      }},
      { key: 'status', label: 'Status', badge: true },
    ],
    filters: [
      { key: 'status', label: 'Status', options: [
        { value: '', label: 'Todos' },
        { value: 'ativo', label: 'Ativo' },
        { value: 'manutencao', label: 'Manutenção' },
        { value: 'inativo', label: 'Inativo' },
        { value: 'vendido', label: 'Vendido' },
      ]},
    ],
    getDefaultForm: (meta) => ({
      placa: '', modelo: '', marca: '', ano: '', tipo_id: '', status: 'ativo',
      km_atual: 0, horimetro_atual: 0, tipo_medicao: 'km', consumo_medio_esperado: '',
      combustivel: 'diesel', setor_responsavel: '', centro_custo: '', motorista_id: '',
      cor: '', chassi: '', renavam: '', observacoes: '',
    }),
    formFields: (meta, form, setForm) => [
      { key: 'placa', label: 'Placa / Identificação *', required: true },
      { key: 'marca', label: 'Marca' },
      { key: 'modelo', label: 'Modelo' },
      { key: 'ano', label: 'Ano', type: 'number' },
      { key: 'tipo_id', label: 'Tipo', type: 'select', options: (meta?.tipos || []).map((t) => ({ value: t.id, label: t.nome })) },
      { key: 'status', label: 'Status', type: 'select', options: (meta?.statusVeiculo || []).map((s) => ({ value: s, label: s })) },
      { key: 'tipo_medicao', label: 'Medição', type: 'select', options: (meta?.tiposMedicao || ['km', 'horimetro']).map((m) => ({ value: m, label: m === 'horimetro' ? 'Horímetro' : 'Quilometragem' })) },
      { key: 'combustivel', label: 'Combustível', type: 'select', options: (meta?.combustiveis || []).map((c) => ({ value: c, label: c })) },
      { key: 'km_atual', label: 'KM Atual', type: 'number' },
      { key: 'horimetro_atual', label: 'Horímetro Atual', type: 'number' },
      { key: 'consumo_medio_esperado', label: 'Consumo esperado (km/L)', type: 'number' },
      { key: 'motorista_id', label: 'Condutor responsável', type: 'select', options: [{ value: '', label: '—' }, ...(meta?.motoristas || []).map((m) => ({ value: m.id, label: m.nome }))] },
      { key: 'setor_responsavel', label: 'Setor', type: 'select', options: (meta?.setores || []).map((s) => ({ value: s, label: s })) },
      { key: 'centro_custo', label: 'Centro de custo', type: 'select', options: (meta?.centrosCusto || []).map((c) => ({ value: c, label: c })) },
      { key: 'cor', label: 'Cor' },
      { key: 'chassi', label: 'Chassi' },
      { key: 'renavam', label: 'RENAVAM' },
      { key: 'observacoes', label: 'Observações', type: 'textarea', full: true },
    ],
  },

  motoristas: {
    endpoint: 'motoristas',
    title: 'Motoristas / Condutores',
    subtitle: 'Cadastro de condutores com CNH e validade',
    breadcrumb: 'Motoristas',
    newLabel: 'Novo Motorista',
    searchPlaceholder: 'Buscar por nome, CPF, CNH...',
    // Campos que o formulário genérico do FrotasEntityPage trata como telefone: máscara a cada
    // tecla ao digitar e formatação do valor vindo do banco ao abrir a edição. Declarado aqui
    // (e não no formFields) porque o formFields de outras entidades depende de `form`, que não
    // existe ainda na hora de carregar o registro.
    camposTelefone: ['telefone'],
    columns: [
      { key: 'nome', label: 'Nome', bold: true },
      { key: 'cnh_numero', label: 'CNH' },
      { key: 'cnh_categoria', label: 'Categoria' },
      { key: 'cnh_validade', label: 'Validade CNH' },
      { key: 'setor', label: 'Setor' },
      { key: 'telefone', label: 'Telefone' },
      { key: 'status', label: 'Status', badge: true },
    ],
    filters: [
      { key: 'status', label: 'Status', options: [
        { value: '', label: 'Todos' },
        { value: 'ativo', label: 'Ativo' },
        { value: 'inativo', label: 'Inativo' },
      ]},
    ],
    getDefaultForm: () => ({
      nome: '', cpf: '', cnh_numero: '', cnh_categoria: '', cnh_validade: '',
      telefone: '', email: '', setor: '', status: 'ativo', usuario_id: '', observacoes: '',
    }),
    // Frota Etapa 1 (T7, RN-F1.12): o usuario do sistema que entra no portal do motorista como este motorista.
    needsUsuariosVinculaveis: true,
    formFields: (meta, form, setForm, veiculos, motoristas, aux = {}) => [
      { key: 'nome', label: 'Nome *', required: true },
      { key: 'cpf', label: 'CPF' },
      { key: 'cnh_numero', label: 'Nº CNH' },
      { key: 'cnh_categoria', label: 'Categoria CNH', type: 'select', options: ['A','B','C','D','E','AB','AC','AD','AE'].map((c) => ({ value: c, label: c })) },
      { key: 'cnh_validade', label: 'Validade CNH', type: 'date' },
      { key: 'telefone', label: 'Telefone' },
      { key: 'email', label: 'E-mail', type: 'email' },
      { key: 'setor', label: 'Setor', type: 'select', options: (meta?.setores || []).map((s) => ({ value: s, label: s })) },
      { key: 'status', label: 'Status', type: 'select', options: [{ value: 'ativo', label: 'Ativo' }, { value: 'inativo', label: 'Inativo' }] },
      {
        key: 'usuario_id',
        label: 'Usuário de acesso (portal do motorista)',
        type: 'select',
        // "— nenhum —" tem value '', que o handleSave troca por null: e assim que se desfaz o vinculo (F2-4).
        placeholder: '— nenhum —',
        // Fase5-10: o usuario DESATIVADO que segue ligado vem do servidor com `ativo: false` — aparece so no form do motorista
        // que o tem (rotulado), senao o select mostrava "— nenhum —" com o id guardado e todo salvar dava 400.
        options: (aux.usuarios || [])
          .filter((u) => u.ativo !== false || String(u.id) === String(form?.usuario_id ?? ''))
          .map((u) => {
            const outro = u.motorista && u.motorista.id !== aux.editing?.id;
            const email = u.email ? ` (${u.email})` : '';
            const inativo = u.ativo === false ? ' (inativo)' : '';
            return { value: u.id, label: `${u.nome}${email}${outro ? ` (ligado a ${u.motorista.nome})` : ''}${inativo}` };
          }),
        // Frota Etapa 2 (RN-F2.09): usuario com perfil Consulta no Frota ve o painel mas nao registra no portal. O aviso sai do
        // form.usuario_id, entao aparece ao abrir um motorista ja ligado e ao trocar. Nao bloqueia.
        aviso: (aux.usuarios || []).some((u) => String(u.id) === String(form?.usuario_id ?? '') && u.perfil_frota === 'CONSULTA')
          ? AVISO_USUARIO_CONSULTA
          : null,
      },
      { key: 'observacoes', label: 'Observações', type: 'textarea', full: true },
    ],
  },

  manutencoes: {
    endpoint: 'manutencoes',
    title: 'Manutenções',
    subtitle: 'Preventivas e corretivas — oficina, custos e próxima revisão',
    breadcrumb: 'Manutenções',
    newLabel: 'Nova Manutenção',
    searchPlaceholder: 'Buscar por descrição, oficina, placa...',
    columns: [
      { key: 'data_manutencao', label: 'Data' },
      { key: 'placa', label: 'Placa', bold: true },
      { key: 'tipo', label: 'Tipo', badge: true },
      { key: 'descricao', label: 'Descrição' },
      { key: 'oficina', label: 'Oficina' },
      { key: 'custo', label: 'Custo', format: (r) => fmtBrl(r.custo) },
      { key: 'proxima_revisao_data', label: 'Próx. Revisão' },
    ],
    filters: [
      { key: 'tipo', label: 'Tipo', options: [
        { value: '', label: 'Todos' },
        { value: 'preventiva', label: 'Preventiva' },
        { value: 'corretiva', label: 'Corretiva' },
      ]},
    ],
    needsVeiculos: true,
    getDefaultForm: () => ({
      veiculo_id: '', tipo: 'preventiva', descricao: '', oficina: '', custo: 0,
      km_manutencao: '', data_manutencao: hojeLocalISO(),
      proxima_revisao_km: '', proxima_revisao_data: '', status: 'concluida', requisicao_almox_id: '', observacoes: '',
    }),
    formFields: (meta, form, setForm, veiculos) => [
      { key: 'veiculo_id', label: 'Veículo *', type: 'select', required: true, options: (veiculos || []).map((v) => ({ value: v.id, label: `${v.placa} — ${v.modelo || v.marca || ''}` })) },
      { key: 'tipo', label: 'Tipo', type: 'select', options: (meta?.tiposManutencao || []).map((t) => ({ value: t, label: t })) },
      { key: 'data_manutencao', label: 'Data', type: 'date' },
      { key: 'descricao', label: 'Descrição *', required: true, full: true },
      { key: 'oficina', label: 'Oficina' },
      { key: 'custo', label: 'Custo (R$)', type: 'number' },
      { key: 'km_manutencao', label: 'KM na manutenção', type: 'number' },
      { key: 'proxima_revisao_km', label: 'Próxima revisão (KM)', type: 'number' },
      { key: 'proxima_revisao_data', label: 'Próxima revisão (data)', type: 'date' },
      { key: 'status', label: 'Status', type: 'select', options: ['agendada','em_andamento','concluida'].map((s) => ({ value: s, label: s.replace('_', ' ') })) },
      { key: 'pecas_descricao', label: 'Peças utilizadas', type: 'textarea', full: true },
      { key: 'requisicao_almox_id', label: 'Nº requisição almoxarifado (opcional)', type: 'number' },
      { key: 'observacoes', label: 'Observações', type: 'textarea', full: true },
    ],
  },

  abastecimentos: {
    endpoint: 'abastecimentos',
    title: 'Abastecimentos',
    subtitle: 'Registro de combustível, consumo e custos',
    breadcrumb: 'Abastecimentos',
    newLabel: 'Novo Abastecimento',
    searchPlaceholder: 'Buscar por placa, posto...',
    columns: [
      { key: 'data_abastecimento', label: 'Data' },
      { key: 'placa', label: 'Placa', bold: true },
      { key: 'litros', label: 'Litros', format: (r) => `${r.litros} L` },
      { key: 'valor_total', label: 'Valor', format: (r) => fmtBrl(r.valor_total) },
      { key: 'consumo_medio', label: 'Km/L', format: (r) => (r.consumo_medio != null ? r.consumo_medio : '-') },
      { key: 'posto', label: 'Posto' },
      { key: 'km_abastecimento', label: 'KM', format: (r) => (r.horimetro_abastecimento != null ? horas(r.horimetro_abastecimento)
        : (r.km_abastecimento != null ? r.km_abastecimento : '-')) },
    ],
    needsVeiculos: true,
    needsMotoristas: true,
    getDefaultForm: () => ({
      veiculo_id: '', motorista_id: '', data_abastecimento: hojeLocalISO(),
      litros: '', valor_total: '', posto: '', km_abastecimento: '', horimetro_abastecimento: '', combustivel_tipo: 'diesel', observacoes: '',
    }),
    formFields: (meta, form, setForm, veiculos, motoristas) => [
      { key: 'veiculo_id', label: 'Veículo *', type: 'select', required: true, options: (veiculos || []).map((v) => ({ value: v.id, label: v.placa })) },
      { key: 'motorista_id', label: 'Motorista', type: 'select', options: [{ value: '', label: '—' }, ...(motoristas || []).map((m) => ({ value: m.id, label: m.nome }))] },
      { key: 'data_abastecimento', label: 'Data *', type: 'date', required: true },
      { key: 'litros', label: 'Litros *', type: 'number', required: true },
      { key: 'valor_total', label: 'Valor total (R$)', type: 'number' },
      { key: 'km_abastecimento', label: 'KM no abastecimento', type: 'number' },
      { key: 'horimetro_abastecimento', label: 'Horímetro no abastecimento (máquina)', type: 'number' },
      { key: 'combustivel_tipo', label: 'Combustível', type: 'select', options: (meta?.combustiveis || []).map((c) => ({ value: c, label: c })) },
      { key: 'posto', label: 'Posto' },
      { key: 'observacoes', label: 'Observações', type: 'textarea', full: true },
    ],
  },

  multas: {
    endpoint: 'multas',
    title: 'Multas e Infrações',
    subtitle: 'Controle de multas, pontos e pagamentos',
    breadcrumb: 'Multas',
    newLabel: 'Nova Multa',
    searchPlaceholder: 'Buscar por placa, descrição...',
    columns: [
      { key: 'data_infracao', label: 'Data' },
      { key: 'placa', label: 'Placa', bold: true },
      { key: 'descricao', label: 'Infração' },
      { key: 'valor', label: 'Valor', format: (r) => fmtBrl(r.valor) },
      { key: 'pontos', label: 'Pontos' },
      { key: 'status_pagamento', label: 'Pagamento', badge: true },
      { key: 'data_vencimento', label: 'Vencimento' },
    ],
    filters: [
      { key: 'status_pagamento', label: 'Status', options: [
        { value: '', label: 'Todos' },
        { value: 'pendente', label: 'Pendente' },
        { value: 'pago', label: 'Pago' },
        { value: 'contestado', label: 'Contestado' },
      ]},
    ],
    needsVeiculos: true,
    needsMotoristas: true,
    getDefaultForm: () => ({
      veiculo_id: '', motorista_id: '', data_infracao: '', descricao: '', valor: 0, pontos: 0,
      status_pagamento: 'pendente', data_vencimento: '', numero_auto: '', observacoes: '',
    }),
    formFields: (meta, form, setForm, veiculos, motoristas) => [
      { key: 'veiculo_id', label: 'Veículo *', type: 'select', required: true, options: (veiculos || []).map((v) => ({ value: v.id, label: v.placa })) },
      { key: 'motorista_id', label: 'Motorista', type: 'select', options: [{ value: '', label: '—' }, ...(motoristas || []).map((m) => ({ value: m.id, label: m.nome }))] },
      { key: 'data_infracao', label: 'Data da infração', type: 'date' },
      { key: 'descricao', label: 'Descrição', full: true },
      { key: 'valor', label: 'Valor (R$)', type: 'number' },
      { key: 'pontos', label: 'Pontos', type: 'number' },
      { key: 'status_pagamento', label: 'Status', type: 'select', options: ['pendente','pago','contestado'].map((s) => ({ value: s, label: s })) },
      { key: 'data_vencimento', label: 'Vencimento', type: 'date' },
      { key: 'numero_auto', label: 'Nº auto de infração' },
      { key: 'observacoes', label: 'Observações', type: 'textarea', full: true },
    ],
  },

  documentos: {
    endpoint: 'documentos',
    title: 'Seguros e Documentos',
    subtitle: 'IPVA, licenciamento, seguro e CRLV com alertas de vencimento',
    breadcrumb: 'Documentos',
    newLabel: 'Novo Documento',
    searchPlaceholder: 'Buscar por placa, descrição...',
    columns: [
      { key: 'placa', label: 'Placa', bold: true },
      { key: 'tipo', label: 'Tipo', badge: true },
      { key: 'descricao', label: 'Descrição' },
      { key: 'numero_documento', label: 'Nº Documento' },
      { key: 'data_vencimento', label: 'Vencimento' },
      { key: 'valor', label: 'Valor', format: (r) => fmtBrl(r.valor) },
      { key: 'status', label: 'Status', badge: true },
    ],
    needsVeiculos: true,
    getDefaultForm: () => ({
      veiculo_id: '', tipo: 'seguro', descricao: '', numero_documento: '', seguradora: '',
      valor: 0, data_emissao: '', data_vencimento: '', alerta_dias_antes: 30, status: 'ativo', observacoes: '',
    }),
    formFields: (meta, form, setForm, veiculos) => [
      { key: 'veiculo_id', label: 'Veículo *', type: 'select', required: true, options: (veiculos || []).map((v) => ({ value: v.id, label: v.placa })) },
      { key: 'tipo', label: 'Tipo *', type: 'select', options: (meta?.tiposDocumento || []).map((t) => ({ value: t, label: t.toUpperCase() })) },
      { key: 'descricao', label: 'Descrição' },
      { key: 'numero_documento', label: 'Nº do documento / apólice' },
      { key: 'seguradora', label: 'Seguradora' },
      { key: 'valor', label: 'Valor (R$)', type: 'number' },
      { key: 'data_emissao', label: 'Data emissão', type: 'date' },
      { key: 'data_vencimento', label: 'Data vencimento', type: 'date' },
      { key: 'alerta_dias_antes', label: 'Alertar (dias antes)', type: 'number' },
      { key: 'status', label: 'Status', type: 'select', options: ['ativo','vencido','renovado'].map((s) => ({ value: s, label: s })) },
      { key: 'observacoes', label: 'Observações', type: 'textarea', full: true },
    ],
  },

  viagens: {
    endpoint: 'viagens',
    title: 'Viagens / Utilização',
    subtitle: 'Saída, retorno, km rodado e aprovação de uso',
    breadcrumb: 'Viagens',
    newLabel: 'Nova Viagem',
    searchPlaceholder: 'Buscar por destino, placa...',
    columns: [
      { key: 'data_saida', label: 'Saída' },
      { key: 'placa', label: 'Placa', bold: true },
      { key: 'motorista_nome', label: 'Motorista' },
      { key: 'origem', label: 'Origem' },
      { key: 'destino', label: 'Destino' },
      { key: 'finalidade', label: 'Finalidade' },
      { key: 'km_rodado', label: 'KM rodado', format: (r) => {
        if (r.km_rodado != null) return r.km_rodado;
        if (r.horimetro_saida != null && r.horimetro_retorno != null) return horas(Number(r.horimetro_retorno) - Number(r.horimetro_saida));
        return '-';
      } },
      { key: 'status', label: 'Status', badge: true },
    ],
    filters: [
      { key: 'status', label: 'Status', options: [
        { value: '', label: 'Todos' },
        { value: 'solicitada', label: 'Solicitada' },
        { value: 'aprovada', label: 'Aprovada' },
        { value: 'em_andamento', label: 'Em andamento' },
        { value: 'concluida', label: 'Concluída' },
      ]},
    ],
    needsVeiculos: true,
    needsMotoristas: true,
    extraActions: true,
    getDefaultForm: () => ({
      veiculo_id: '', motorista_id: '', data_saida: '', data_retorno: '',
      km_saida: '', km_retorno: '', horimetro_saida: '', horimetro_retorno: '', origem: '', destino: '', finalidade: '', setor: '',
      status: 'solicitada', observacoes: '',
    }),
    formFields: (meta, form, setForm, veiculos, motoristas) => [
      { key: 'veiculo_id', label: 'Veículo *', type: 'select', required: true, options: (veiculos || []).map((v) => ({ value: v.id, label: v.placa })) },
      { key: 'motorista_id', label: 'Motorista', type: 'select', options: [{ value: '', label: '—' }, ...(motoristas || []).map((m) => ({ value: m.id, label: m.nome }))] },
      { key: 'data_saida', label: 'Data/hora saída', type: 'datetime-local' },
      { key: 'data_retorno', label: 'Data/hora retorno', type: 'datetime-local' },
      { key: 'km_saida', label: 'KM saída', type: 'number' },
      { key: 'km_retorno', label: 'KM retorno', type: 'number' },
      { key: 'horimetro_saida', label: 'Horímetro saída (máquina)', type: 'number' },
      { key: 'horimetro_retorno', label: 'Horímetro retorno (máquina)', type: 'number' },
      { key: 'origem', label: 'Origem' },
      { key: 'destino', label: 'Destino' },
      { key: 'finalidade', label: 'Finalidade' },
      { key: 'setor', label: 'Setor', type: 'select', options: (meta?.setores || []).map((s) => ({ value: s, label: s })) },
      { key: 'status', label: 'Status', type: 'select', options: (meta?.statusViagem || []).map((s) => ({ value: s, label: s.replace('_', ' ') })) },
      { key: 'observacoes', label: 'Observações', type: 'textarea', full: true },
    ],
  },

  checklists: {
    endpoint: 'checklists',
    title: 'Checklist Diário',
    subtitle: 'Inspeção de segurança: pneus, óleo, luzes, freios e EPIs',
    breadcrumb: 'Checklist',
    newLabel: 'Novo Checklist',
    searchPlaceholder: 'Buscar por placa...',
    readOnlyEdit: true,
    columns: [
      { key: 'data_checklist', label: 'Data' },
      { key: 'placa', label: 'Placa', bold: true },
      { key: 'tipo_registro', label: 'Tipo', format: (r) => TIPO_REGISTRO[r.tipo_registro] || '-' },
      { key: 'motorista_nome', label: 'Motorista' },
      { key: 'km', label: 'KM', format: (r) => (r.horimetro != null ? horas(r.horimetro)
        : (r.km != null ? Number(r.km).toLocaleString('pt-BR') : '-')) },
      // Frota Etapa 1 (T7, RN-F1.02/03): as 3 situacoes da planilha. Linha anterior a etapa (sem status_geral) cai no
      // `aprovado` antigo, que so sabia sim/nao.
      { key: 'status_geral', label: 'Situação', render: (r) => {
        const s = situacaoDoChecklist(r);
        return <span className={`frotas-badge frotas-badge-situacao-${s.classe}`}>{s.rotulo}</span>;
      } },
      { key: 'observacoes', label: 'Observações' },
    ],
    needsVeiculos: true,
    needsMotoristas: true,
    getDefaultForm: () => ({
      veiculo_id: '', motorista_id: '', data_checklist: hojeLocalISO(),
      pneus_ok: 1, oleo_ok: 1, luzes_ok: 1, freios_ok: 1, extintor_ok: 1, documentos_ok: 1, limpeza_ok: 1,
      observacoes: '',
    }),
    formFields: (meta, form, setForm, veiculos, motoristas) => [
      { key: 'veiculo_id', label: 'Veículo *', type: 'select', required: true, options: (veiculos || []).map((v) => ({ value: v.id, label: v.placa })) },
      { key: 'motorista_id', label: 'Motorista', type: 'select', options: [{ value: '', label: '—' }, ...(motoristas || []).map((m) => ({ value: m.id, label: m.nome }))] },
      { key: 'data_checklist', label: 'Data *', type: 'date', required: true },
      { key: '_checks', label: 'Itens verificados', type: 'checks', items: [
        { key: 'pneus_ok', label: 'Pneus' },
        { key: 'oleo_ok', label: 'Óleo' },
        { key: 'luzes_ok', label: 'Luzes' },
        { key: 'freios_ok', label: 'Freios' },
        { key: 'extintor_ok', label: 'Extintor' },
        { key: 'documentos_ok', label: 'Documentos' },
        { key: 'limpeza_ok', label: 'Limpeza' },
      ]},
      { key: 'observacoes', label: 'Observações / não conformidades', type: 'textarea', full: true },
    ],
  },
};
