import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import {
  FiRefreshCw, FiTool, FiPlus, FiUserCheck, FiCornerUpLeft, FiLock, FiUnlock,
  FiSettings, FiCheckCircle, FiAlertTriangle, FiRotateCcw, FiCalendar,
} from 'react-icons/fi';
import { SkeletonTable } from '../SkeletonLoader';
import { useAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';
import { formatLocalizacaoLabel } from '../../utils/localizacaoLabel';
import './Almoxarifado.css';

/**
 * Ferramentas e calibração (Etapa 9b, Task 7).
 *
 * Ate esta etapa, ferramenta (`toolService.js`) so existia por chamada direta a API: sem tela,
 * sem tabelas de manutencao/ocorrencia/calibracao (Task 1), sem maquina de estados no front
 * (Task 2 fez a de tras). Esta tela e a PRIMEIRA superficie visual do patrimonio emprestavel.
 *
 * Precedente OBRIGATORIO: SobrasAlmoxarifado.js — abas com botoes primary/secondary alternando
 * (sem CSS novo), `useAlmoxPermissoes` para o gate de escrita, `almox-modal`/`almox-field` para
 * os formularios, FormData para os dois uploads multipart (foto de ocorrencia, certificado de
 * calibracao — mesmo molde do comprovante de sucateamento).
 *
 * Gate de escrita: UMA acao so, `gerenciar_ferramentas` (design D1) — ao contrario do
 * sucateamento (duas pernas, duas acoes), aqui nao ha por que esconder um botao e mostrar outro
 * por permissao: OU o perfil pode agir sobre ferramentas OU nao pode nada. Por isso as acoes de
 * LINHA (emprestar, devolver, bloquear...) ficam escondidas quando `!pode('gerenciar_ferramentas')`
 * — response ao pedido do brief ("nao ve os botoes de escrita"), no mesmo espirito das pernas de
 * aprovacao do sucateamento (`mostraAprovarAlmox` etc.). O botao "Nova ferramenta" do cabecalho
 * segue o OUTRO padrao do precedente (Gerar retalho / Solicitar sucateamento): fica sempre
 * visivel e o clique e quem barra via `bloquearSeNaoPode` — defesa em profundidade que so este
 * botao exercita (o teste de sabotagem mira aqui: tirar o guard do clique tem de derrubar teste,
 * o que nao aconteceria se a visibilidade sozinha ja escondesse tudo).
 *
 * Acoes por STATUS (toolStateMachine.js, contrato congelado no design): emprestar so em
 * DISPONIVEL; devolver so em EMPRESTADA; bloquear so em DISPONIVEL; desbloquear so em BLOQUEADA;
 * iniciar manutencao em DISPONIVEL ou AVARIADA (RN-07); concluir manutencao so em EM_MANUTENCAO;
 * reencontrar so em PERDIDA. Ocorrencia (avaria/perda) e calibracao nao tem restricao de status
 * documentada no contrato — ficam disponiveis em qualquer status (calibracao so quando a
 * ferramenta EXIGE, campo `exige_calibracao`).
 *
 * "Concluir manutencao" precisa do ID da manutencao ABERTA, que GET /ferramentas nao devolve
 * (so `calibracao_vigente` e `emprestimo_aberto` resumidos, por design). Por isso o clique busca
 * `GET /ferramentas/:id/manutencoes` na hora e acha a que tem `data_fim` nulo — nao ha outra
 * fonte no contrato congelado.
 */

const STATUS_FERRAMENTA = [
  { value: 'DISPONIVEL', label: 'Disponível', cls: 'ok' },
  { value: 'EMPRESTADA', label: 'Emprestada', cls: 'ajuste' },
  { value: 'BLOQUEADA', label: 'Bloqueada', cls: 'critico' },
  { value: 'EM_MANUTENCAO', label: 'Em manutenção', cls: 'baixo' },
  { value: 'AVARIADA', label: 'Avariada', cls: 'critico' },
  { value: 'PERDIDA', label: 'Perdida', cls: 'critico' },
];
const statusInfo = (s) => STATUS_FERRAMENTA.find((x) => x.value === s) || { label: s || '—', cls: 'ajuste' };

const FORM_FERRAMENTA_VAZIO = {
  codigo_patrimonio: '', nome: '', tipo: '', setor_responsavel: '',
  material_id: '', numero_serie: '', localizacao_id: '', exige_calibracao: false, observacoes: '',
};
const FORM_EMPRESTAR_VAZIO = {
  colaborador_nome: '', colaborador_id: '', setor: '', data_prevista_devolucao: '', observacoes: '',
};
const FORM_JUSTIFICATIVA_VAZIO = { justificativa: '' };
const FORM_MANUTENCAO_VAZIO = { descricao: '' };
const FORM_CONCLUIR_MANUTENCAO_VAZIO = { observacoes: '' };
const FORM_OCORRENCIA_VAZIO = {
  tipo: 'AVARIA', descricao: '', responsavel_nome: '', responsavel_colaborador_id: '', foto: null,
};
const FORM_CALIBRACAO_VAZIO = { data_calibracao: '', data_validade: '', observacoes: '', certificado: null };

const TITULO_JUSTIFICATIVA = {
  bloquear: 'Bloquear ferramenta',
  desbloquear: 'Desbloquear ferramenta',
  reencontrar: 'Reencontrar ferramenta',
};
const ROTA_JUSTIFICATIVA = { bloquear: 'bloquear', desbloquear: 'desbloquear', reencontrar: 'reencontrar' };
const SUCESSO_JUSTIFICATIVA = {
  bloquear: 'Ferramenta bloqueada', desbloquear: 'Ferramenta desbloqueada', reencontrar: 'Ferramenta reencontrada',
};

const FerramentasAlmoxarifado = () => {
  const { pode, bloquearSeNaoPode } = useAlmoxPermissoes();
  const podeEscrever = pode('gerenciar_ferramentas');

  const [aba, setAba] = useState('FERRAMENTAS');

  // Ferramentas
  const [ferramentas, setFerramentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroBusca, setFiltroBusca] = useState('');

  // Empréstimos
  const [emprestimos, setEmprestimos] = useState([]);
  const [loadingEmp, setLoadingEmp] = useState(true);
  const [reloadTokenEmp, setReloadTokenEmp] = useState(0);
  const [somenteVencidos, setSomenteVencidos] = useState(false);
  const [filtroColaborador, setFiltroColaborador] = useState('');

  // Calibrações — painel
  const [painel, setPainel] = useState({ vencidas: [], a_vencer: [] });
  const [loadingCal, setLoadingCal] = useState(true);
  const [reloadTokenCal, setReloadTokenCal] = useState(0);

  // Catálogo (material/localização) para o formulário de cadastro — carregado uma vez, mesmo
  // padrão de SobrasAlmoxarifado.
  const [materiais, setMateriais] = useState([]);
  const [localizacoes, setLocalizacoes] = useState([]);

  const [modal, setModal] = useState(null); // { tipo, ferramenta?, manutencaoId? }
  const [form, setForm] = useState(FORM_FERRAMENTA_VAZIO);
  const [formEmprestar, setFormEmprestar] = useState(FORM_EMPRESTAR_VAZIO);
  const [formJustificativa, setFormJustificativa] = useState(FORM_JUSTIFICATIVA_VAZIO);
  const [formManutencao, setFormManutencao] = useState(FORM_MANUTENCAO_VAZIO);
  const [formConcluirManutencao, setFormConcluirManutencao] = useState(FORM_CONCLUIR_MANUTENCAO_VAZIO);
  const [formOcorrencia, setFormOcorrencia] = useState(FORM_OCORRENCIA_VAZIO);
  const [formCalibracao, setFormCalibracao] = useState(FORM_CALIBRACAO_VAZIO);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (aba !== 'FERRAMENTAS') return undefined;
    let cancelado = false;
    setLoading(true);
    const params = {};
    if (filtroStatus) params.status = filtroStatus;
    if (filtroBusca) params.busca = filtroBusca;
    api.get('/almoxarifado/ferramentas', { params })
      .then((r) => { if (!cancelado) setFerramentas(Array.isArray(r.data) ? r.data : []); })
      .catch(() => { if (!cancelado) { setFerramentas([]); toast.error('Não foi possível carregar as ferramentas'); } })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [aba, filtroStatus, filtroBusca, reloadToken]);

  useEffect(() => {
    if (aba !== 'EMPRESTIMOS') return undefined;
    let cancelado = false;
    setLoadingEmp(true);
    const params = {};
    if (somenteVencidos) params.vencidos = 1;
    if (filtroColaborador) params.colaborador = filtroColaborador;
    api.get('/almoxarifado/emprestimos', { params })
      .then((r) => { if (!cancelado) setEmprestimos(Array.isArray(r.data) ? r.data : []); })
      .catch(() => { if (!cancelado) { setEmprestimos([]); toast.error('Não foi possível carregar os empréstimos'); } })
      .finally(() => { if (!cancelado) setLoadingEmp(false); });
    return () => { cancelado = true; };
  }, [aba, somenteVencidos, filtroColaborador, reloadTokenEmp]);

  useEffect(() => {
    if (aba !== 'CALIBRACOES') return undefined;
    let cancelado = false;
    setLoadingCal(true);
    api.get('/almoxarifado/calibracoes/painel')
      .then((r) => {
        if (cancelado) return;
        const dados = r.data && typeof r.data === 'object' ? r.data : {};
        setPainel({ vencidas: Array.isArray(dados.vencidas) ? dados.vencidas : [], a_vencer: Array.isArray(dados.a_vencer) ? dados.a_vencer : [] });
      })
      .catch(() => { if (!cancelado) { setPainel({ vencidas: [], a_vencer: [] }); toast.error('Não foi possível carregar o painel de calibrações'); } })
      .finally(() => { if (!cancelado) setLoadingCal(false); });
    return () => { cancelado = true; };
  }, [aba, reloadTokenCal]);

  useEffect(() => {
    let cancelado = false;
    Promise.all([
      api.get('/almoxarifado/materiais').catch(() => ({ data: [] })),
      api.get('/almoxarifado/localizacoes').catch(() => ({ data: [] })),
    ]).then(([mat, loc]) => {
      if (cancelado) return;
      setMateriais(mat.data || []);
      setLocalizacoes(loc.data || []);
    });
    return () => { cancelado = true; };
  }, []);

  const recarregar = useCallback(() => setReloadToken((t) => t + 1), []);
  const recarregarEmp = useCallback(() => setReloadTokenEmp((t) => t + 1), []);
  const recarregarCal = useCallback(() => setReloadTokenCal((t) => t + 1), []);
  const recarregarAtual = () => {
    if (aba === 'FERRAMENTAS') recarregar();
    else if (aba === 'EMPRESTIMOS') recarregarEmp();
    else recarregarCal();
  };

  // ── Cadastro ────────────────────────────────────────────────────────────────────────────────
  const abrirNova = (evento) => {
    if (!bloquearSeNaoPode('gerenciar_ferramentas', evento)) return;
    setForm(FORM_FERRAMENTA_VAZIO);
    setModal({ tipo: 'nova' });
  };

  const confirmarNova = async () => {
    if (!String(form.codigo_patrimonio || '').trim()) { toast.error('Informe o código de patrimônio'); return; }
    if (!String(form.nome || '').trim()) { toast.error('Informe o nome da ferramenta'); return; }
    const payload = {
      codigo_patrimonio: String(form.codigo_patrimonio).trim(),
      nome: String(form.nome).trim(),
      exige_calibracao: !!form.exige_calibracao,
    };
    if (form.tipo) payload.tipo = String(form.tipo).trim();
    if (form.setor_responsavel) payload.setor_responsavel = String(form.setor_responsavel).trim();
    if (form.material_id) payload.material_id = Number(form.material_id);
    if (form.numero_serie) payload.numero_serie = String(form.numero_serie).trim();
    if (form.localizacao_id) payload.localizacao_id = Number(form.localizacao_id);
    if (form.observacoes) payload.observacoes = String(form.observacoes).trim();

    setSalvando(true);
    try {
      await api.post('/almoxarifado/ferramentas', payload);
      toast.success('Ferramenta cadastrada');
      setModal(null);
      recarregar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao cadastrar a ferramenta');
    } finally { setSalvando(false); }
  };

  // ── Empréstimo / devolução ─────────────────────────────────────────────────────────────────
  const abrirEmprestar = (ferramenta, evento) => {
    if (!bloquearSeNaoPode('gerenciar_ferramentas', evento)) return;
    setFormEmprestar(FORM_EMPRESTAR_VAZIO);
    setModal({ tipo: 'emprestar', ferramenta });
  };

  const confirmarEmprestar = async () => {
    if (!String(formEmprestar.colaborador_nome || '').trim()) { toast.error('Informe o nome do colaborador'); return; }
    const payload = { colaborador_nome: String(formEmprestar.colaborador_nome).trim() };
    if (formEmprestar.colaborador_id) payload.colaborador_id = Number(formEmprestar.colaborador_id);
    if (formEmprestar.setor) payload.setor = String(formEmprestar.setor).trim();
    if (formEmprestar.data_prevista_devolucao) payload.data_prevista_devolucao = formEmprestar.data_prevista_devolucao;
    if (formEmprestar.observacoes) payload.observacoes = String(formEmprestar.observacoes).trim();

    setSalvando(true);
    try {
      await api.post(`/almoxarifado/ferramentas/${modal.ferramenta.id}/emprestar`, payload);
      toast.success('Ferramenta emprestada');
      setModal(null);
      recarregar();
    } catch (err) {
      // Mensagem do backend (RN-01/02/03) ensina o motivo da recusa — nao trocar por texto
      // generico apagaria a instrucao (ex.: calibracao vencida).
      toast.error(err.response?.data?.error || 'Erro ao emprestar a ferramenta');
    } finally { setSalvando(false); }
  };

  const devolverFerramenta = async (ferramenta, evento) => {
    if (!bloquearSeNaoPode('gerenciar_ferramentas', evento)) return;
    if (!ferramenta.emprestimo_aberto?.id) { toast.error('Empréstimo em aberto não encontrado'); return; }
    try {
      await api.post(`/almoxarifado/emprestimos/${ferramenta.emprestimo_aberto.id}/devolver`, {});
      toast.success('Ferramenta devolvida');
      recarregar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao devolver a ferramenta');
    }
  };

  // ── Bloquear / desbloquear / reencontrar (justificativa) ──────────────────────────────────
  const abrirJustificativa = (tipo, ferramenta, evento) => {
    if (!bloquearSeNaoPode('gerenciar_ferramentas', evento)) return;
    setFormJustificativa(FORM_JUSTIFICATIVA_VAZIO);
    setModal({ tipo, ferramenta });
  };

  const confirmarJustificativa = async () => {
    const texto = String(formJustificativa.justificativa || '').trim();
    if (texto.length < 5) { toast.error('Justificativa deve ter pelo menos 5 caracteres'); return; }
    const rota = ROTA_JUSTIFICATIVA[modal.tipo];
    setSalvando(true);
    try {
      await api.post(`/almoxarifado/ferramentas/${modal.ferramenta.id}/${rota}`, { justificativa: texto });
      toast.success(SUCESSO_JUSTIFICATIVA[modal.tipo]);
      setModal(null);
      recarregar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao registrar a ação');
    } finally { setSalvando(false); }
  };

  // ── Manutenção ──────────────────────────────────────────────────────────────────────────────
  const abrirManutencao = (ferramenta, evento) => {
    if (!bloquearSeNaoPode('gerenciar_ferramentas', evento)) return;
    setFormManutencao(FORM_MANUTENCAO_VAZIO);
    setModal({ tipo: 'manutencao', ferramenta });
  };

  const confirmarManutencao = async () => {
    if (!String(formManutencao.descricao || '').trim()) { toast.error('Informe a descrição da manutenção'); return; }
    setSalvando(true);
    try {
      await api.post(`/almoxarifado/ferramentas/${modal.ferramenta.id}/manutencoes`, {
        descricao: String(formManutencao.descricao).trim(),
      });
      toast.success('Manutenção iniciada');
      setModal(null);
      recarregar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao iniciar a manutenção');
    } finally { setSalvando(false); }
  };

  /**
   * GET /ferramentas nao devolve a manutencao aberta (so calibracao_vigente/emprestimo_aberto,
   * contrato congelado) — busca na hora do clique, mesmo espirito de abrir modal com dado extra
   * que ReservasAlmoxarifado.js usa antes de confirmar reserva.
   */
  const abrirConcluirManutencao = async (ferramenta, evento) => {
    if (!bloquearSeNaoPode('gerenciar_ferramentas', evento)) return;
    try {
      const res = await api.get(`/almoxarifado/ferramentas/${ferramenta.id}/manutencoes`);
      const lista = Array.isArray(res.data) ? res.data : [];
      const aberta = lista.find((m) => !m.data_fim);
      if (!aberta) { toast.error('Nenhuma manutenção em aberto encontrada para esta ferramenta'); return; }
      setFormConcluirManutencao(FORM_CONCLUIR_MANUTENCAO_VAZIO);
      setModal({ tipo: 'concluir-manutencao', ferramenta, manutencaoId: aberta.id });
    } catch (err) {
      toast.error('Erro ao buscar a manutenção em aberto');
    }
  };

  const confirmarConcluirManutencao = async () => {
    const payload = {};
    if (formConcluirManutencao.observacoes) payload.observacoes = String(formConcluirManutencao.observacoes).trim();
    setSalvando(true);
    try {
      await api.put(`/almoxarifado/manutencoes/${modal.manutencaoId}/concluir`, payload);
      toast.success('Manutenção concluída');
      setModal(null);
      recarregar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao concluir a manutenção');
    } finally { setSalvando(false); }
  };

  // ── Ocorrência (avaria/perda) ───────────────────────────────────────────────────────────────
  const abrirOcorrencia = (ferramenta, evento) => {
    if (!bloquearSeNaoPode('gerenciar_ferramentas', evento)) return;
    setFormOcorrencia(FORM_OCORRENCIA_VAZIO);
    setModal({ tipo: 'ocorrencia', ferramenta });
  };

  const confirmarOcorrencia = async () => {
    if (!String(formOcorrencia.descricao || '').trim()) { toast.error('Informe a descrição da ocorrência'); return; }
    setSalvando(true);
    try {
      // Multipart (contrato congelado): tipo/descricao/responsavel_nome/responsavel_colaborador_id
      // + arquivo `foto` opcional — mesmo molde do comprovante de sucateamento.
      const fd = new FormData();
      fd.append('tipo', formOcorrencia.tipo);
      fd.append('descricao', String(formOcorrencia.descricao).trim());
      if (formOcorrencia.responsavel_nome) fd.append('responsavel_nome', String(formOcorrencia.responsavel_nome).trim());
      if (formOcorrencia.responsavel_colaborador_id) fd.append('responsavel_colaborador_id', formOcorrencia.responsavel_colaborador_id);
      if (formOcorrencia.foto) fd.append('foto', formOcorrencia.foto);
      await api.post(`/almoxarifado/ferramentas/${modal.ferramenta.id}/ocorrencias`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(formOcorrencia.tipo === 'PERDA' ? 'Perda registrada' : 'Avaria registrada');
      setModal(null);
      recarregar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao registrar a ocorrência');
    } finally { setSalvando(false); }
  };

  // ── Calibração ──────────────────────────────────────────────────────────────────────────────
  const abrirCalibracao = (ferramenta, evento) => {
    if (!bloquearSeNaoPode('gerenciar_ferramentas', evento)) return;
    setFormCalibracao(FORM_CALIBRACAO_VAZIO);
    setModal({ tipo: 'calibracao', ferramenta });
  };

  const confirmarCalibracao = async () => {
    if (!formCalibracao.data_calibracao || !formCalibracao.data_validade) {
      toast.error('Informe as datas de calibração e de validade'); return;
    }
    setSalvando(true);
    try {
      const fd = new FormData();
      fd.append('data_calibracao', formCalibracao.data_calibracao);
      fd.append('data_validade', formCalibracao.data_validade);
      if (formCalibracao.observacoes) fd.append('observacoes', String(formCalibracao.observacoes).trim());
      if (formCalibracao.certificado) fd.append('certificado', formCalibracao.certificado);
      await api.post(`/almoxarifado/ferramentas/${modal.ferramenta.id}/calibracoes`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Calibração registrada');
      setModal(null);
      // A calibracao pode afetar tanto a lista de ferramentas (calibracao_vigente) quanto o
      // painel de vencimento — recarrega os dois, nao so a aba aberta.
      recarregar();
      recarregarCal();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao registrar a calibração');
    } finally { setSalvando(false); }
  };

  const confirmar = () => {
    if (modal?.tipo === 'nova') return confirmarNova();
    if (modal?.tipo === 'emprestar') return confirmarEmprestar();
    if (modal?.tipo === 'bloquear' || modal?.tipo === 'desbloquear' || modal?.tipo === 'reencontrar') return confirmarJustificativa();
    if (modal?.tipo === 'manutencao') return confirmarManutencao();
    if (modal?.tipo === 'concluir-manutencao') return confirmarConcluirManutencao();
    if (modal?.tipo === 'ocorrencia') return confirmarOcorrencia();
    if (modal?.tipo === 'calibracao') return confirmarCalibracao();
    return undefined;
  };

  const rotuloLocalizacao = (l) => `${l.endereco_completo || formatLocalizacaoLabel(l, localizacoes)}${l.descricao ? ` — ${l.descricao}` : ''}`;

  const vencido = (e) => e.status === 'EMPRESTADA' && e.data_prevista_devolucao
    && new Date(e.data_prevista_devolucao) < new Date();

  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1><FiTool size={20} /> Ferramentas</h1>
          <p>
            {aba === 'FERRAMENTAS' && (loading ? 'Carregando...' : `${ferramentas.length} ferramenta(s) · patrimônio emprestável, nao estoque`)}
            {aba === 'EMPRESTIMOS' && (loadingEmp ? 'Carregando...' : `${emprestimos.length} empréstimo(s)`)}
            {aba === 'CALIBRACOES' && (loadingCal ? 'Carregando...' : `${painel.vencidas.length} vencida(s) · ${painel.a_vencer.length} a vencer`)}
          </p>
        </div>
        <div className="almox-header-actions">
          <button className="btn-almox-secondary" onClick={recarregarAtual}>
            <FiRefreshCw size={13} /> Atualizar
          </button>
          {aba === 'FERRAMENTAS' && (
            <button className="btn-almox-primary" onClick={abrirNova}>
              <FiPlus size={13} /> Nova ferramenta
            </button>
          )}
        </div>
      </div>

      {/* Abas — molde de LotesAlmoxarifado.js/SobrasAlmoxarifado.js: botoes primary/secondary
          alternando, sem CSS novo. */}
      <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
        <button className={aba === 'FERRAMENTAS' ? 'btn-almox-primary' : 'btn-almox-secondary'} onClick={() => setAba('FERRAMENTAS')}>Ferramentas</button>
        <button className={aba === 'EMPRESTIMOS' ? 'btn-almox-primary' : 'btn-almox-secondary'} onClick={() => setAba('EMPRESTIMOS')}>Empréstimos</button>
        <button className={aba === 'CALIBRACOES' ? 'btn-almox-primary' : 'btn-almox-secondary'} onClick={() => setAba('CALIBRACOES')}>Calibrações</button>
      </div>

      {aba === 'FERRAMENTAS' && (
        <>
          <div className="almox-filters">
            <select className="almox-select" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
              <option value="">Todos os status</option>
              {STATUS_FERRAMENTA.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <input className="almox-input" style={{ maxWidth: 260 }} placeholder="Buscar por código ou nome"
              value={filtroBusca} onChange={(e) => setFiltroBusca(e.target.value)} />
          </div>

          <div className="almox-table-container">
            {loading ? <SkeletonTable rows={6} columns={7} />
              : ferramentas.length === 0 ? (
                <div className="almox-empty"><p>Nenhuma ferramenta cadastrada</p></div>
              ) : (
                <table className="almox-table almox-ferramenta-lista">
                  <thead>
                    <tr>
                      <th>Código</th><th>Nome</th><th>Status</th><th>Série</th>
                      <th>Localização</th><th>Calibração</th><th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ferramentas.map((f) => {
                      const info = statusInfo(f.status);
                      return (
                        <tr key={f.id}>
                          <td>{f.codigo_patrimonio}</td>
                          <td>
                            {f.nome}
                            {f.emprestimo_aberto?.colaborador_nome && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>
                                com {f.emprestimo_aberto.colaborador_nome}
                              </div>
                            )}
                          </td>
                          <td><span className={`almox-badge almox-badge-${info.cls}`}>{info.label}</span></td>
                          <td>{f.numero_serie || '—'}</td>
                          <td>{f.localizacao_id || '—'}</td>
                          <td>
                            {!f.exige_calibracao ? '—' : (
                              <span className={`almox-badge almox-badge-${f.calibracao_vigente ? 'ok' : 'critico'}`}>
                                {f.calibracao_vigente ? 'Vigente' : 'Vencida/ausente'}
                              </span>
                            )}
                          </td>
                          <td>
                            {podeEscrever && (
                              <div className="almox-actions">
                                {f.status === 'DISPONIVEL' && (
                                  <button className="btn-almox-secondary" onClick={(e) => abrirEmprestar(f, e)}>
                                    <FiUserCheck size={13} /> Emprestar
                                  </button>
                                )}
                                {f.status === 'EMPRESTADA' && (
                                  <button className="btn-almox-secondary" onClick={(e) => devolverFerramenta(f, e)}>
                                    <FiCornerUpLeft size={13} /> Devolver
                                  </button>
                                )}
                                {f.status === 'DISPONIVEL' && (
                                  <button className="btn-almox-secondary" onClick={(e) => abrirJustificativa('bloquear', f, e)}>
                                    <FiLock size={13} /> Bloquear
                                  </button>
                                )}
                                {f.status === 'BLOQUEADA' && (
                                  <button className="btn-almox-secondary" onClick={(e) => abrirJustificativa('desbloquear', f, e)}>
                                    <FiUnlock size={13} /> Desbloquear
                                  </button>
                                )}
                                {(f.status === 'DISPONIVEL' || f.status === 'AVARIADA') && (
                                  <button className="btn-almox-secondary" onClick={(e) => abrirManutencao(f, e)}>
                                    <FiSettings size={13} /> Iniciar manutenção
                                  </button>
                                )}
                                {f.status === 'EM_MANUTENCAO' && (
                                  <button className="btn-almox-secondary" onClick={(e) => abrirConcluirManutencao(f, e)}>
                                    <FiCheckCircle size={13} /> Concluir manutenção
                                  </button>
                                )}
                                {f.status === 'PERDIDA' && (
                                  <button className="btn-almox-secondary" onClick={(e) => abrirJustificativa('reencontrar', f, e)}>
                                    <FiRotateCcw size={13} /> Reencontrar
                                  </button>
                                )}
                                <button className="btn-almox-secondary" onClick={(e) => abrirOcorrencia(f, e)}>
                                  <FiAlertTriangle size={13} /> Ocorrência
                                </button>
                                {!!f.exige_calibracao && (
                                  <button className="btn-almox-secondary" onClick={(e) => abrirCalibracao(f, e)}>
                                    <FiCalendar size={13} /> Calibração
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
          </div>
        </>
      )}

      {aba === 'EMPRESTIMOS' && (
        <>
          <div className="almox-filters">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem', color: 'var(--gmp-text)' }}>
              <input type="checkbox" checked={somenteVencidos} onChange={(e) => setSomenteVencidos(e.target.checked)} />
              Somente vencidos
            </label>
            <input className="almox-input" style={{ maxWidth: 260 }} placeholder="Buscar por colaborador"
              value={filtroColaborador} onChange={(e) => setFiltroColaborador(e.target.value)} />
          </div>

          <div className="almox-table-container">
            {loadingEmp ? <SkeletonTable rows={6} columns={6} />
              : emprestimos.length === 0 ? (
                <div className="almox-empty"><p>Nenhum empréstimo registrado</p></div>
              ) : (
                <table className="almox-table almox-emprestimo-lista">
                  <thead>
                    <tr>
                      <th>Ferramenta</th><th>Colaborador</th><th>Retirada</th>
                      <th>Previsão de devolução</th><th>Status</th><th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emprestimos.map((e) => (
                      <tr key={e.id}>
                        <td>{e.codigo_patrimonio} — {e.ferramenta_nome}</td>
                        <td>{e.colaborador_nome}{e.setor ? ` (${e.setor})` : ''}</td>
                        <td>{e.data_retirada ? String(e.data_retirada).slice(0, 10) : '—'}</td>
                        <td>{e.data_prevista_devolucao ? String(e.data_prevista_devolucao).slice(0, 10) : '—'}</td>
                        <td>
                          <span className={`almox-badge almox-badge-${e.status === 'DEVOLVIDA' ? 'ok' : 'ajuste'}`}>
                            {e.status === 'DEVOLVIDA' ? 'Devolvida' : 'Emprestada'}
                          </span>
                          {vencido(e) && <span className="almox-badge almox-badge-vencida" style={{ marginLeft: 6 }}>Vencido</span>}
                        </td>
                        <td>
                          {podeEscrever && e.status === 'EMPRESTADA' && (
                            <button className="btn-almox-secondary" onClick={(ev) => {
                              if (!bloquearSeNaoPode('gerenciar_ferramentas', ev)) return;
                              api.post(`/almoxarifado/emprestimos/${e.id}/devolver`, {})
                                .then(() => { toast.success('Ferramenta devolvida'); recarregarEmp(); })
                                .catch((err) => toast.error(err.response?.data?.error || 'Erro ao devolver a ferramenta'));
                            }}>
                              <FiCornerUpLeft size={13} /> Devolver
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </div>
        </>
      )}

      {aba === 'CALIBRACOES' && (
        <>
          {loadingCal ? <SkeletonTable rows={6} columns={4} /> : (
            <>
              <div className="almox-section-title">Vencidas</div>
              {painel.vencidas.length === 0 ? (
                <div className="almox-empty"><p>Nenhuma calibração vencida</p></div>
              ) : (
                <div className="almox-table-container">
                  <table className="almox-table almox-calibracao-vencidas">
                    <thead><tr><th>Código</th><th>Ferramenta</th><th>Validade</th><th>Situação</th></tr></thead>
                    <tbody>
                      {painel.vencidas.map((c, i) => (
                        <tr key={c.id ?? c.ferramenta_id ?? i}>
                          <td>{c.codigo_patrimonio || '—'}</td>
                          <td>{c.nome || c.ferramenta_nome || '—'}</td>
                          <td>{c.data_validade ? String(c.data_validade).slice(0, 10) : '—'}</td>
                          <td>
                            <span className="almox-badge almox-badge-vencida">
                              {c.dias_restantes != null ? `Vencida há ${Math.abs(c.dias_restantes)} dia(s)` : 'Vencida'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="almox-section-title" style={{ marginTop: 16 }}>A vencer</div>
              {painel.a_vencer.length === 0 ? (
                <div className="almox-empty"><p>Nenhuma calibração a vencer</p></div>
              ) : (
                <div className="almox-table-container">
                  <table className="almox-table almox-calibracao-a-vencer">
                    <thead><tr><th>Código</th><th>Ferramenta</th><th>Validade</th><th>Dias restantes</th></tr></thead>
                    <tbody>
                      {painel.a_vencer.map((c, i) => (
                        <tr key={c.id ?? c.ferramenta_id ?? i}>
                          <td>{c.codigo_patrimonio || '—'}</td>
                          <td>{c.nome || c.ferramenta_nome || '—'}</td>
                          <td>{c.data_validade ? String(c.data_validade).slice(0, 10) : '—'}</td>
                          <td><span className="almox-badge almox-badge-baixo">{c.dias_restantes ?? '—'} dia(s)</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}

      {modal?.tipo === 'nova' && (
        <div className="almox-modal-overlay" onClick={() => { if (!salvando) setModal(null); }}>
          <div className="almox-modal almox-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>Nova ferramenta</h2>
              <button className="almox-modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <div className="almox-form-grid">
                <div className="almox-field">
                  <label className="almox-label">Código de patrimônio<span className="required">*</span></label>
                  <input className="almox-input" value={form.codigo_patrimonio}
                    onChange={(e) => setForm((f) => ({ ...f, codigo_patrimonio: e.target.value }))} />
                </div>
                <div className="almox-field">
                  <label className="almox-label">Nome<span className="required">*</span></label>
                  <input className="almox-input" value={form.nome}
                    onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
                </div>
                <div className="almox-field">
                  <label className="almox-label">Tipo</label>
                  <input className="almox-input" value={form.tipo}
                    onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))} placeholder="Instrumento de medição" />
                </div>
                <div className="almox-field">
                  <label className="almox-label">Setor responsável</label>
                  <input className="almox-input" value={form.setor_responsavel}
                    onChange={(e) => setForm((f) => ({ ...f, setor_responsavel: e.target.value }))} />
                </div>
                <div className="almox-field">
                  <label className="almox-label">Número de série</label>
                  <input className="almox-input" value={form.numero_serie}
                    onChange={(e) => setForm((f) => ({ ...f, numero_serie: e.target.value }))} />
                </div>
                <div className="almox-field">
                  <label className="almox-label">Material do catálogo (opcional)</label>
                  <select className="almox-form-select" value={form.material_id}
                    onChange={(e) => setForm((f) => ({ ...f, material_id: e.target.value }))}>
                    <option value="">—</option>
                    {materiais.map((m) => <option key={m.id} value={m.id}>{m.codigo} — {m.nome}</option>)}
                  </select>
                </div>
                <div className="almox-field">
                  <label className="almox-label">Localização</label>
                  <select className="almox-form-select" value={form.localizacao_id}
                    onChange={(e) => setForm((f) => ({ ...f, localizacao_id: e.target.value }))}>
                    <option value="">—</option>
                    {localizacoes.map((l) => <option key={l.id} value={l.id}>{rotuloLocalizacao(l)}</option>)}
                  </select>
                </div>
              </div>
              <div className="almox-field almox-form-full">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.875rem', color: 'var(--gmp-text)' }}>
                  <input type="checkbox" checked={form.exige_calibracao}
                    onChange={(e) => setForm((f) => ({ ...f, exige_calibracao: e.target.checked }))} />
                  Exige calibração (instrumento de medição)
                </label>
                <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                  Marcada, o empréstimo recusa sem calibração vigente registrada (RN-03).
                </small>
              </div>
              <div className="almox-field almox-form-full">
                <label className="almox-label">Observações</label>
                <textarea className="almox-textarea" rows={2} value={form.observacoes}
                  onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
              </div>
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setModal(null)} disabled={salvando}>Fechar</button>
              <button className="btn-almox-primary" onClick={confirmar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Cadastrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal?.tipo === 'emprestar' && (
        <div className="almox-modal-overlay" onClick={() => { if (!salvando) setModal(null); }}>
          <div className="almox-modal almox-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>Emprestar ferramenta</h2>
              <button className="almox-modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <p style={{ marginTop: 0 }}><strong>{modal.ferramenta.codigo_patrimonio}</strong> — {modal.ferramenta.nome}</p>
              <div className="almox-field">
                <label className="almox-label">Colaborador<span className="required">*</span></label>
                <input className="almox-input" value={formEmprestar.colaborador_nome}
                  onChange={(e) => setFormEmprestar((f) => ({ ...f, colaborador_nome: e.target.value }))} />
              </div>
              <div className="almox-field">
                <label className="almox-label">Setor</label>
                <input className="almox-input" value={formEmprestar.setor}
                  onChange={(e) => setFormEmprestar((f) => ({ ...f, setor: e.target.value }))} />
              </div>
              <div className="almox-field">
                <label className="almox-label">Data prevista de devolução</label>
                <input className="almox-input" type="date" value={formEmprestar.data_prevista_devolucao}
                  onChange={(e) => setFormEmprestar((f) => ({ ...f, data_prevista_devolucao: e.target.value }))} />
              </div>
              <div className="almox-field">
                <label className="almox-label">Observações</label>
                <textarea className="almox-textarea" rows={2} value={formEmprestar.observacoes}
                  onChange={(e) => setFormEmprestar((f) => ({ ...f, observacoes: e.target.value }))} />
              </div>
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setModal(null)} disabled={salvando}>Fechar</button>
              <button className="btn-almox-primary" onClick={confirmar} disabled={salvando}>
                {salvando ? 'Emprestando...' : 'Emprestar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {(modal?.tipo === 'bloquear' || modal?.tipo === 'desbloquear' || modal?.tipo === 'reencontrar') && (
        <div className="almox-modal-overlay" onClick={() => { if (!salvando) setModal(null); }}>
          <div className="almox-modal almox-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>{TITULO_JUSTIFICATIVA[modal.tipo]}</h2>
              <button className="almox-modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <p style={{ marginTop: 0 }}><strong>{modal.ferramenta.codigo_patrimonio}</strong> — {modal.ferramenta.nome}</p>
              <div className="almox-field">
                <label className="almox-label">Justificativa<span className="required">*</span></label>
                <textarea className="almox-textarea" rows={3} value={formJustificativa.justificativa}
                  onChange={(e) => setFormJustificativa({ justificativa: e.target.value })} />
                <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>Mínimo de 5 caracteres.</small>
              </div>
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setModal(null)} disabled={salvando}>Fechar</button>
              <button className="btn-almox-primary" onClick={confirmar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal?.tipo === 'manutencao' && (
        <div className="almox-modal-overlay" onClick={() => { if (!salvando) setModal(null); }}>
          <div className="almox-modal almox-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>Iniciar manutenção</h2>
              <button className="almox-modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <p style={{ marginTop: 0 }}><strong>{modal.ferramenta.codigo_patrimonio}</strong> — {modal.ferramenta.nome}</p>
              <div className="almox-field">
                <label className="almox-label">Descrição<span className="required">*</span></label>
                <textarea className="almox-textarea" rows={3} value={formManutencao.descricao}
                  onChange={(e) => setFormManutencao({ descricao: e.target.value })} />
              </div>
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setModal(null)} disabled={salvando}>Fechar</button>
              <button className="btn-almox-primary" onClick={confirmar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Iniciar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal?.tipo === 'concluir-manutencao' && (
        <div className="almox-modal-overlay" onClick={() => { if (!salvando) setModal(null); }}>
          <div className="almox-modal almox-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>Concluir manutenção</h2>
              <button className="almox-modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <p style={{ marginTop: 0 }}><strong>{modal.ferramenta.codigo_patrimonio}</strong> — {modal.ferramenta.nome}</p>
              <div className="almox-field">
                <label className="almox-label">Observações</label>
                <textarea className="almox-textarea" rows={3} value={formConcluirManutencao.observacoes}
                  onChange={(e) => setFormConcluirManutencao({ observacoes: e.target.value })} />
              </div>
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setModal(null)} disabled={salvando}>Fechar</button>
              <button className="btn-almox-primary" onClick={confirmar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Concluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal?.tipo === 'ocorrencia' && (
        <div className="almox-modal-overlay" onClick={() => { if (!salvando) setModal(null); }}>
          <div className="almox-modal almox-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>Registrar ocorrência</h2>
              <button className="almox-modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <p style={{ marginTop: 0 }}><strong>{modal.ferramenta.codigo_patrimonio}</strong> — {modal.ferramenta.nome}</p>
              <div className="almox-field">
                <label className="almox-label">Tipo<span className="required">*</span></label>
                <select className="almox-form-select" value={formOcorrencia.tipo}
                  onChange={(e) => setFormOcorrencia((f) => ({ ...f, tipo: e.target.value }))}>
                  <option value="AVARIA">Avaria</option>
                  <option value="PERDA">Perda</option>
                </select>
              </div>
              <div className="almox-field">
                <label className="almox-label">Descrição<span className="required">*</span></label>
                <textarea className="almox-textarea" rows={3} value={formOcorrencia.descricao}
                  onChange={(e) => setFormOcorrencia((f) => ({ ...f, descricao: e.target.value }))} />
              </div>
              <div className="almox-field">
                <label className="almox-label">Responsável</label>
                <input className="almox-input" value={formOcorrencia.responsavel_nome}
                  onChange={(e) => setFormOcorrencia((f) => ({ ...f, responsavel_nome: e.target.value }))} />
              </div>
              <div className="almox-field">
                <label className="almox-label">Foto (opcional)</label>
                <input className="almox-input" type="file" accept="image/*"
                  onChange={(e) => setFormOcorrencia((f) => ({ ...f, foto: e.target.files?.[0] || null }))} />
              </div>
              {modal.ferramenta.status === 'EMPRESTADA' && (
                <p style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>
                  Esta ferramenta está emprestada — registrar avaria ou perda encerra o empréstimo aberto (RN-05).
                </p>
              )}
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setModal(null)} disabled={salvando}>Fechar</button>
              <button className="btn-almox-primary" onClick={confirmar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal?.tipo === 'calibracao' && (
        <div className="almox-modal-overlay" onClick={() => { if (!salvando) setModal(null); }}>
          <div className="almox-modal almox-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>Registrar calibração</h2>
              <button className="almox-modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <p style={{ marginTop: 0 }}><strong>{modal.ferramenta.codigo_patrimonio}</strong> — {modal.ferramenta.nome}</p>
              <div className="almox-field">
                <label className="almox-label">Data da calibração<span className="required">*</span></label>
                <input className="almox-input" type="date" value={formCalibracao.data_calibracao}
                  onChange={(e) => setFormCalibracao((f) => ({ ...f, data_calibracao: e.target.value }))} />
              </div>
              <div className="almox-field">
                <label className="almox-label">Data de validade<span className="required">*</span></label>
                <input className="almox-input" type="date" value={formCalibracao.data_validade}
                  onChange={(e) => setFormCalibracao((f) => ({ ...f, data_validade: e.target.value }))} />
              </div>
              <div className="almox-field">
                <label className="almox-label">Observações</label>
                <textarea className="almox-textarea" rows={2} value={formCalibracao.observacoes}
                  onChange={(e) => setFormCalibracao((f) => ({ ...f, observacoes: e.target.value }))} />
              </div>
              <div className="almox-field">
                <label className="almox-label">Certificado (PDF ou imagem)</label>
                <input className="almox-input" type="file" accept=".pdf,image/*"
                  onChange={(e) => setFormCalibracao((f) => ({ ...f, certificado: e.target.files?.[0] || null }))} />
              </div>
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setModal(null)} disabled={salvando}>Fechar</button>
              <button className="btn-almox-primary" onClick={confirmar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FerramentasAlmoxarifado;
