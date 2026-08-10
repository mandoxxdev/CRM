import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiPlus, FiSearch, FiRefreshCw, FiArrowUp, FiArrowDown, FiCornerUpLeft } from 'react-icons/fi';
import { SkeletonTable } from '../SkeletonLoader';
import ExtratoMaterialModal from './ExtratoMaterialModal';
import { formatLocalizacaoLabel } from '../../utils/localizacaoLabel';
import { useAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';
import './Almoxarifado.css';

// SUCATA e PERDA foram isentos da guarda de vencimento na Task 3 (Etapa 6) justamente para que
// material vencido pudesse ser descartado — mas até a Task 9 nenhum dos dois era selecionável
// aqui, então a regra "vencido não fica preso" era verdadeira da API e falsa da tela. Não inclui
// AJUSTE_NEGATIVO: é tipo interno de ajuste, e o AJUSTE puro já cobre correção de contagem.
const TIPOS_FORM = [
  { value: 'ENTRADA', label: 'Entrada', cls: 'entrada' },
  { value: 'SAIDA', label: 'Saída', cls: 'saida' },
  { value: 'AJUSTE', label: 'Ajuste', cls: 'ajuste' },
  { value: 'DEVOLUCAO', label: 'Devolução', cls: 'devolucao' },
  { value: 'SUCATA', label: 'Sucata', cls: 'saida' },
  { value: 'PERDA', label: 'Perda', cls: 'saida' },
];

// Lista completa para filtro e exibição no livro: inclui ESTORNO, que é gerado pelo
// servidor ao cancelar uma movimentação e não é selecionável ao registrar manualmente.
const TIPOS = [
  ...TIPOS_FORM,
  { value: 'ESTORNO', label: 'Estorno', cls: 'estorno' },
];

// SUCATA e PERDA são saídas para o motor (stockService.tiposSaida): baixam do disponível,
// respeitam controle_lote e o guard de status do lote — mas ficam de fora da guarda de
// vencimento (tiposDescarte), que é exatamente o ponto delas. Precisam dos mesmos campos que
// SAIDA mostra: localização de origem e seleção de lote (nunca texto livre — mesma razão da
// SAIDA: motor não inventa lote numa saída).
const TIPOS_SAIDA_LOTE = ['SAIDA', 'SUCATA', 'PERDA'];

// Fix round 1 (review da Task 9): `elegivel`, que a API devolve por lote, e calculado SO a partir
// do lote (status === 'ATIVO' && (!vencido || vencimento_liberado)) — o servidor nao sabe qual
// tipo de movimento a tela esta montando. Isso e certo para SAIDA (consumo real precisa respeitar
// a guarda de vencimento), mas errado para SUCATA/PERDA: o motor as isenta da guarda de
// vencimento de proposito (stockService.js, tiposDescarte) para que material vencido possa ser
// descartado. Usar `elegivel` cru para os dois travava exatamente o caso que os tornou
// selecionaveis na Task 9 — lote vencido preso, sem lote_id, virando 400 (com controle_lote) ou
// pior, passando sem lote_id e deixando a linha do lote vencido intocada (sem controle_lote).
// Descarte continua respeitando STATUS (BLOQUEADO/REPROVADO nao saem por nenhum caminho sem
// passar pela mudanca de status primeiro) — so a checagem de vencimento e que nao se aplica.
const TIPOS_DESCARTE_LOTE = ['SUCATA', 'PERDA'];
const loteDisponivelParaTipo = (lote, tipo) =>
  TIPOS_DESCARTE_LOTE.includes(tipo) ? lote.status === 'ATIVO' : lote.elegivel;

// Tipos que não podem ser estornados pelo botão do livro (espelha as recusas de
// stockService.cancelarMovimentacao no servidor — a lista aqui é só para não oferecer um botão
// que sempre volta 400):
//  - ESTORNO: estorno de estorno não existe;
//  - RESERVA/LIBERACAO_RESERVA: desfeitas pela tela de Reservas;
//  - QUARENTENA/LIBERACAO_INSPECAO/REPROVACAO_INSPECAO/DECISAO_INSPECAO: o retido pertence ao
//    item do recebimento, então rever uma decisão é pela tela de Inspeções, não pelo livro.
const TIPOS_SEM_ESTORNO = [
  'RESERVA', 'LIBERACAO_RESERVA',
  'QUARENTENA', 'LIBERACAO_INSPECAO', 'REPROVACAO_INSPECAO', 'DECISAO_INSPECAO',
];
const podeEstornar = (m) => !m.cancelado && m.tipo !== 'ESTORNO' && !TIPOS_SEM_ESTORNO.includes(m.tipo);

const MovimentacoesAlmoxarifado = () => {
  const { bloquearSeNaoPode } = useAlmoxPermissoes();
  const location = useLocation();
  const navigate = useNavigate();
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [materiais, setMateriais] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tipoFilter, setTipoFilter] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [centrosCusto, setCentrosCusto] = useState([]);
  const [ordensServico, setOrdensServico] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [localizacoes, setLocalizacoes] = useState([]);
  const [estornoTarget, setEstornoTarget] = useState(null);
  const [estornoMotivo, setEstornoMotivo] = useState('');
  const [estornoSaving, setEstornoSaving] = useState(false);
  const [extratoMaterialId, setExtratoMaterialId] = useState(null);
  const [lotes, setLotes] = useState([]);

  const [form, setForm] = useState({
    material_id: '',
    tipo: 'ENTRADA',
    quantidade: '',
    motivo: '',
    referencia: '',
    observacoes: '',
    os_id: '',
    projeto_id: '',
    centro_custo_id: '',
    localizacao_origem_id: '',
    localizacao_destino_id: '',
    lote: '',
    lote_id: '',
    custo_unitario: '',
    emergencial: false
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadMateriais();
    loadMovimentacoes();
    loadVinculos();
  }, []);

  useEffect(() => {
    if (location.pathname.endsWith('/novo')) {
      setShowModal(true);
    }
    const params = new URLSearchParams(location.search);
    const matId = params.get('material_id');
    if (matId) {
      setForm(f => ({ ...f, material_id: matId }));
      setShowModal(true);
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    const t = setTimeout(loadMovimentacoes, 300);
    return () => clearTimeout(t);
  }, [tipoFilter, dataInicio, dataFim]);

  // Lote só é escolhido (não digitado) numa saída (SAIDA/SUCATA/PERDA) — é onde o motor decide
  // de qual lote consumir, e a lista já vem em ordem FEFO com `elegivel` calculado no servidor.
  useEffect(() => {
    if (!form.material_id || !TIPOS_SAIDA_LOTE.includes(form.tipo)) { setLotes([]); return; }
    let cancelado = false;
    api.get(`/almoxarifado/materiais/${form.material_id}/lotes?com_saldo=1`)
      .then((res) => {
        if (cancelado) return;
        const lista = res.data || [];
        setLotes(lista);
        // FEFO e SUGESTAO: pre-seleciona o primeiro disponivel PARA ESTE TIPO (a API ja devolve em
        // ordem) e deixa o operador trocar. Impor no motor travaria quem tem motivo para pegar
        // outro lote. `form.tipo` aqui e o mesmo valor que disparou este efeito (dependencia do
        // useEffect) — nao muda por baixo entre o disparo e o resolve da promise.
        const sugerido = lista.find((l) => loteDisponivelParaTipo(l, form.tipo));
        setForm((f) => ({ ...f, lote_id: sugerido ? String(sugerido.id) : '' }));
      })
      .catch(() => { if (!cancelado) setLotes([]); });
    return () => { cancelado = true; };
  }, [form.material_id, form.tipo]);

  const loadMateriais = async () => {
    try {
      const res = await api.get('/almoxarifado/materiais');
      setMateriais(res.data);
    } catch { /* silently fail */ }
  };

  const loadVinculos = async () => {
    const [cc, os, proj, locs] = await Promise.all([
      api.get('/almoxarifado/centros-custo').catch(() => ({ data: [] })),
      api.get('/almoxarifado/aux/ordens-servico').catch(() => ({ data: [] })),
      api.get('/projetos').catch(() => ({ data: [] })),
      api.get('/almoxarifado/localizacoes').catch(() => ({ data: [] })),
    ]);
    setCentrosCusto(cc.data || []);
    setOrdensServico(os.data || []);
    setProjetos(proj.data || []);
    setLocalizacoes(locs.data || []);
  };

  const loadMovimentacoes = async () => {
    setLoading(true);
    try {
      const params = { limit: 200 };
      if (tipoFilter) params.tipo = tipoFilter;
      if (dataInicio) params.data_inicio = dataInicio;
      if (dataFim) params.data_fim = dataFim;
      const res = await api.get('/almoxarifado/movimentacoes', { params });
      setMovimentacoes(res.data);
    } catch {
      toast.error('Erro ao carregar movimentações');
    } finally {
      setLoading(false);
    }
  };

  const openModal = () => {
    setForm({
      material_id: '', tipo: 'ENTRADA', quantidade: '', motivo: '', referencia: '', observacoes: '',
      os_id: '', projeto_id: '', centro_custo_id: '', localizacao_origem_id: '', localizacao_destino_id: '',
      lote: '', lote_id: '', custo_unitario: '', emergencial: false
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.material_id || !form.quantidade || parseFloat(form.quantidade) <= 0) {
      toast.error('Selecione o material e informe a quantidade');
      return;
    }
    setSaving(true);
    try {
      // Payload v2: só envia campos preenchidos — ids vazios não viram 0/NaN no body.
      const payload = {
        material_id: Number(form.material_id),
        tipo: form.tipo,
        quantidade: parseFloat(form.quantidade),
      };
      if (form.motivo) {
        payload.motivo = form.motivo;
        payload.justificativa = form.motivo;
      }
      if (form.referencia) payload.referencia = form.referencia;
      if (form.observacoes) payload.observacoes = form.observacoes;
      if (form.os_id) payload.os_id = Number(form.os_id);
      if (form.projeto_id) payload.projeto_id = Number(form.projeto_id);
      if (form.centro_custo_id) payload.centro_custo_id = Number(form.centro_custo_id);
      // Localização/lote só valem para o tipo que os exibe no form — evita que um valor
      // "grudado" de uma seleção anterior (ex.: destino escolhido em ENTRADA, depois
      // trocado para AJUSTE) vaze para um tipo onde o campo nem aparece na tela.
      if (TIPOS_SAIDA_LOTE.includes(form.tipo) && form.localizacao_origem_id) payload.localizacao_origem_id = Number(form.localizacao_origem_id);
      if (form.tipo === 'ENTRADA' && form.localizacao_destino_id) payload.localizacao_destino_id = Number(form.localizacao_destino_id);
      // Entrada: lote nasce aqui, texto livre. Saída (inclusive SUCATA/PERDA): lote é escolhido
      // de um já existente (lote_id), nunca digitado — evita saída registrada contra um lote que
      // não existe.
      if (form.tipo === 'ENTRADA' && form.lote) payload.lote = form.lote;
      if (TIPOS_SAIDA_LOTE.includes(form.tipo) && form.lote_id) payload.lote_id = Number(form.lote_id);
      if (form.tipo === 'ENTRADA' && form.custo_unitario) {
        const custo = parseFloat(form.custo_unitario);
        if (!Number.isNaN(custo) && custo > 0) payload.custo_unitario = custo;
      }
      if (form.tipo === 'SAIDA' && form.emergencial) payload.emergencial = true;

      await api.post('/almoxarifado/movimentacoes/v2', payload);
      toast.success('Movimentação registrada!');
      setShowModal(false);
      if (location.pathname.endsWith('/novo')) {
        navigate('/almoxarifado/movimentacoes', { replace: true });
      }
      loadMovimentacoes();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao registrar movimentação');
    } finally {
      setSaving(false);
    }
  };

  const abrirEstorno = (m) => {
    setEstornoTarget(m);
    setEstornoMotivo('');
  };

  const confirmarEstorno = async () => {
    if (!estornoMotivo.trim()) {
      toast.error('Informe o motivo do estorno');
      return;
    }
    setEstornoSaving(true);
    try {
      await api.post(`/almoxarifado/movimentacoes/${estornoTarget.id}/cancelar`, { motivo: estornoMotivo.trim() });
      toast.success('Movimentação estornada!');
      setEstornoTarget(null);
      loadMovimentacoes();
    } catch (err) {
      // Servidor nega estorno para quem não tem o perfil ajustar_estoque (403) — mostramos
      // a mensagem dele em vez de esconder o botão por perfil (decisão desta etapa).
      toast.error(err.response?.data?.error || 'Erro ao estornar movimentação');
    } finally {
      setEstornoSaving(false);
    }
  };

  const tipoInfo = (tipo) => TIPOS.find(t => t.value === tipo) || { label: tipo, cls: 'ajuste' };

  // Vínculo estruturado da movimentação, na ordem OS > projeto > centro de custo
  // (mesma prioridade da regra de negócio em avaliarRegrasVinculo no servidor).
  const vinculoLabel = (m) => {
    if (m.os_id) return `OS #${m.os_id}`;
    if (m.projeto_id) {
      const p = projetos.find(pr => pr.id === m.projeto_id);
      return p ? p.nome : `Projeto #${m.projeto_id}`;
    }
    if (m.centro_custo_codigo) return m.centro_custo_codigo;
    return null;
  };

  const formatDate = (d) => new Date(d).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const selectedMaterial = materiais.find(m => m.id === parseInt(form.material_id));

  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1>Movimentações de Estoque</h1>
          <p>{movimentacoes.length} registro{movimentacoes.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="almox-header-actions">
          <button className="btn-almox-secondary" onClick={loadMovimentacoes}>
            <FiRefreshCw size={13} /> Atualizar
          </button>
          <button className="btn-almox-primary"
            title="Registra entrada, saída, ajuste ou transferência de estoque (com vínculo de OS/projeto e localização)"
            onClick={(e) => { if (!bloquearSeNaoPode('movimentar', e)) return; openModal(); }}>
            <FiPlus size={14} /> Nova Movimentação
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="almox-filters">
        <select className="almox-select" value={tipoFilter} onChange={e => setTipoFilter(e.target.value)}>
          <option value="">Todos os tipos</option>
          {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" className="almox-input" style={{ width: 'auto' }}
            value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
          <span style={{ color: 'var(--gmp-text-light)', fontSize: '0.8rem' }}>até</span>
          <input type="date" className="almox-input" style={{ width: 'auto' }}
            value={dataFim} onChange={e => setDataFim(e.target.value)} />
        </div>
        {(tipoFilter || dataInicio || dataFim) && (
          <button className="btn-almox-secondary" onClick={() => { setTipoFilter(''); setDataInicio(''); setDataFim(''); }}>
            Limpar
          </button>
        )}
      </div>

      {/* Tabela */}
      <div className="almox-table-container">
        {loading ? <SkeletonTable rows={10} columns={10} /> : movimentacoes.length === 0 ? (
          <div className="almox-empty"><p>Nenhuma movimentação encontrada</p></div>
        ) : (
          <table className="almox-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Material</th>
                <th>Quantidade</th>
                <th>Saldo Anterior</th>
                <th>Saldo Posterior</th>
                <th>Motivo / Referência</th>
                <th>Vínculo</th>
                <th>Usuário</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {movimentacoes.map(m => {
                const t = tipoInfo(m.tipo);
                const vinculo = vinculoLabel(m);
                // O tipo sozinho não diz se o saldo subiu ou desceu: TRANSFERENCIA, BLOQUEIO,
                // DESBLOQUEIO, RESERVA e LIBERACAO_RESERVA não mexem no físico
                // (saldo_posterior === saldo_anterior), e um ESTORNO pode ir em qualquer
                // direção dependendo do que reverte. O sinal/cor/seta vêm do delta real.
                const delta = (m.saldo_posterior ?? 0) - (m.saldo_anterior ?? 0);
                const deltaColor = delta > 0 ? 'var(--gmp-success)' : delta < 0 ? 'var(--gmp-error)' : 'var(--gmp-text-light)';
                const DeltaArrow = delta > 0 ? FiArrowUp : delta < 0 ? FiArrowDown : null;
                return (
                  <tr key={m.id} style={{ opacity: m.cancelado ? 0.55 : 1 }}>
                    <td style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)', whiteSpace: 'nowrap' }}>
                      {formatDate(m.created_at)}
                    </td>
                    <td>
                      <span className={`almox-badge almox-badge-${t.cls}`}>
                        {DeltaArrow ? <DeltaArrow size={10} /> : null}
                        {t.label}
                      </span>
                      {m.cancelado ? (
                        <span className="almox-badge almox-badge-cancelado" style={{ marginLeft: 6, marginTop: 4 }}>
                          ESTORNADA
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <button type="button" className="almox-link-btn" onClick={() => setExtratoMaterialId(m.material_id)}>
                        {m.material_nome}
                      </button>
                      <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>{m.material_codigo}</div>
                    </td>
                    <td>
                      <span style={{
                        fontWeight: 700,
                        color: deltaColor,
                        fontSize: '0.9rem'
                      }}>
                        {delta === 0 ? `${m.quantidade} ${m.unidade}` : `${delta > 0 ? '+' : '−'}${m.quantidade} ${m.unidade}`}
                      </span>
                    </td>
                    <td style={{ color: 'var(--gmp-text-light)' }}>{m.saldo_anterior} {m.unidade}</td>
                    <td style={{ fontWeight: 600 }}>{m.saldo_posterior} {m.unidade}</td>
                    <td>
                      {m.motivo && <div style={{ fontSize: '0.875rem' }}>{m.motivo}</div>}
                      {m.referencia && !vinculo && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>📋 {m.referencia}</div>
                      )}
                    </td>
                    <td>
                      {vinculo && <div style={{ fontSize: '0.8rem' }}>{vinculo}</div>}
                      {m.regularizacao_pendente === 1 && (
                        <span className="almox-badge almox-badge-baixo" style={{ marginTop: 4 }}>
                          PENDENTE REGULARIZAÇÃO
                        </span>
                      )}
                      {!vinculo && m.regularizacao_pendente !== 1 && (
                        <span style={{ color: 'var(--gmp-text-light)' }}>—</span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>{m.usuario_nome}</td>
                    <td>
                      <div className="almox-actions">
                        {podeEstornar(m) ? (
                          <button className="almox-btn-icon danger"
                            title="Cria um lançamento reverso desta movimentação (exige perfil que pode ajustar estoque)"
                            onClick={(e) => { if (!bloquearSeNaoPode('ajustar_estoque', e)) return; abrirEstorno(m); }}>
                            <FiCornerUpLeft />
                          </button>
                        ) : (
                          <span style={{ color: 'var(--gmp-text-light)' }}>—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal nova movimentação */}
      {showModal && (
        <div className="almox-modal-overlay" onClick={() => {
          setShowModal(false);
          if (location.pathname.endsWith('/novo')) navigate('/almoxarifado/movimentacoes', { replace: true });
        }}>
          <div className="almox-modal" onClick={e => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>📦 Registrar Movimentação</h2>
              <button className="almox-modal-close" onClick={() => {
                setShowModal(false);
                if (location.pathname.endsWith('/novo')) navigate('/almoxarifado/movimentacoes', { replace: true });
              }}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="almox-modal-body">
                <div className="almox-form-grid">
                  <div className="almox-field almox-form-full">
                    <label className="almox-label">Material<span className="required">*</span></label>
                    <select className="almox-form-select" value={form.material_id}
                      onChange={e => setForm(f => ({ ...f, material_id: e.target.value }))} required>
                      <option value="">Selecionar material...</option>
                      {materiais.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.codigo} — {m.nome} (Saldo: {m.quantidade_atual} {m.unidade})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Tipo<span className="required">*</span></label>
                    <select className="almox-form-select" value={form.tipo}
                      onChange={e => {
                        const novoTipo = e.target.value;
                        const mostraLote = novoTipo === 'ENTRADA' || TIPOS_SAIDA_LOTE.includes(novoTipo);
                        // Limpa qualquer campo que só aparece para outro tipo — o estado nunca
                        // pode carregar um valor que o usuário não está mais vendo na tela
                        // (senão ele vaza escondido para o payload do tipo atual).
                        setForm(f => ({
                          ...f,
                          tipo: novoTipo,
                          emergencial: novoTipo === 'SAIDA' ? f.emergencial : false,
                          localizacao_destino_id: novoTipo === 'ENTRADA' ? f.localizacao_destino_id : '',
                          custo_unitario: novoTipo === 'ENTRADA' ? f.custo_unitario : '',
                          localizacao_origem_id: TIPOS_SAIDA_LOTE.includes(novoTipo) ? f.localizacao_origem_id : '',
                          lote: mostraLote ? f.lote : '',
                          lote_id: mostraLote ? f.lote_id : ''
                        }));
                      }}>
                      {TIPOS_FORM.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">
                      {form.tipo === 'AJUSTE' ? 'Novo Saldo' : 'Quantidade'}
                      <span className="required">*</span>
                    </label>
                    <input className="almox-input" type="number" min="0" step="1"
                      value={form.quantidade} onChange={e => setForm(f => ({ ...f, quantidade: e.target.value }))}
                      placeholder="0" required />
                    {selectedMaterial && TIPOS_SAIDA_LOTE.includes(form.tipo) && (
                      <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                        Disponível: {(
                          (selectedMaterial.quantidade_atual || 0)
                          - (selectedMaterial.quantidade_reservada || 0)
                          - (selectedMaterial.quantidade_bloqueada || 0)
                          - (selectedMaterial.quantidade_em_inspecao || 0)
                        )} {selectedMaterial.unidade}
                      </small>
                    )}
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">
                      Motivo
                      {(form.tipo === 'SAIDA' || form.tipo === 'AJUSTE' || form.tipo === 'SUCATA' || form.tipo === 'PERDA') && <span className="required">*</span>}
                    </label>
                    <input className="almox-input" value={form.motivo}
                      onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}
                      placeholder="Compra, Uso produção, Retorno, etc."
                      required={form.tipo === 'SAIDA' || form.tipo === 'AJUSTE' || form.tipo === 'SUCATA' || form.tipo === 'PERDA'} />
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Referência (OS / NF)</label>
                    <input className="almox-input" value={form.referencia}
                      onChange={e => setForm(f => ({ ...f, referencia: e.target.value }))}
                      placeholder="OS-0042 / NF 1234" />
                  </div>
                  <div className="almox-field almox-form-full">
                    <label className="almox-label">Observações</label>
                    <textarea className="almox-textarea" rows={2} value={form.observacoes}
                      onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
                  </div>
                </div>

                <div className="almox-section-title">Vínculo</div>
                <div className="almox-form-grid">
                  <div className="almox-field">
                    <label className="almox-label">Ordem de Serviço</label>
                    <select className="almox-form-select" value={form.os_id}
                      onChange={e => setForm(f => ({ ...f, os_id: e.target.value }))}>
                      <option value="">—</option>
                      {ordensServico.map(os => (
                        <option key={os.id} value={os.id}>
                          {os.numero_os}{os.cliente_nome ? ` — ${os.cliente_nome}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Projeto</label>
                    <select className="almox-form-select" value={form.projeto_id}
                      onChange={e => setForm(f => ({ ...f, projeto_id: e.target.value }))}>
                      <option value="">—</option>
                      {projetos.map(p => (
                        <option key={p.id} value={p.id}>{p.nome}</option>
                      ))}
                    </select>
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Centro de custo</label>
                    <select className="almox-form-select" value={form.centro_custo_id}
                      onChange={e => setForm(f => ({ ...f, centro_custo_id: e.target.value }))}>
                      <option value="">—</option>
                      {centrosCusto.map(cc => (
                        <option key={cc.id} value={cc.id}>{cc.codigo} — {cc.nome}</option>
                      ))}
                    </select>
                  </div>

                  {form.tipo === 'ENTRADA' && (
                    <div className="almox-field">
                      <label className="almox-label">Localização de destino</label>
                      <select className="almox-form-select" value={form.localizacao_destino_id}
                        onChange={e => setForm(f => ({ ...f, localizacao_destino_id: e.target.value }))}>
                        <option value="">—</option>
                        {localizacoes.map(l => (
                          <option key={l.id} value={l.id}>
                            {l.endereco_completo || formatLocalizacaoLabel(l, localizacoes)}
                            {l.descricao ? ` — ${l.descricao}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {form.tipo === 'ENTRADA' && (
                    <div className="almox-field">
                      <label className="almox-label">Custo unitário (R$)</label>
                      <input className="almox-input" type="number" min="0" step="0.01" value={form.custo_unitario}
                        onChange={e => setForm(f => ({ ...f, custo_unitario: e.target.value }))}
                        placeholder="0,00" />
                    </div>
                  )}
                  {TIPOS_SAIDA_LOTE.includes(form.tipo) && (
                    <div className="almox-field">
                      <label className="almox-label">Localização de origem</label>
                      <select className="almox-form-select" value={form.localizacao_origem_id}
                        onChange={e => setForm(f => ({ ...f, localizacao_origem_id: e.target.value }))}>
                        <option value="">—</option>
                        {localizacoes.map(l => (
                          <option key={l.id} value={l.id}>
                            {l.endereco_completo || formatLocalizacaoLabel(l, localizacoes)}
                            {l.descricao ? ` — ${l.descricao}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {(form.tipo === 'ENTRADA' || TIPOS_SAIDA_LOTE.includes(form.tipo)) && (
                    <div className="almox-field">
                      <label className="almox-label" htmlFor="mov-lote">Lote</label>
                      {TIPOS_SAIDA_LOTE.includes(form.tipo) ? (
                        <select id="mov-lote" className="almox-input" value={form.lote_id}
                          onChange={e => setForm(f => ({ ...f, lote_id: e.target.value }))}>
                          <option value="">Sem lote</option>
                          {lotes.map(l => {
                            // Vencido-mas-liberado é elegível para uma SAÍDA de consumo (o motor
                            // aceita) — o rótulo precisa dizer por que ele está disponível, senão
                            // o operador estranha ver um lote vencido selecionável.
                            //
                            // Quem decide o `disabled` é `loteDisponivelParaTipo`, não `elegivel`
                            // (o comentário anterior aqui dizia `elegivel` e contradizia a linha
                            // logo abaixo desde o próprio fix round 1 da Task 9): `elegivel` vem do
                            // servidor SEM conhecer o tipo do movimento, e em Sucata/Perda ele
                            // barraria justamente o lote vencido que o descarte existe para tirar
                            // do estoque. Na Saída, `loteDisponivelParaTipo` usa `elegivel`; no
                            // descarte, só o status.
                            const vencidoLiberado = l.vencido && l.vencimento_liberado;
                            return (
                              <option key={l.id} value={l.id} disabled={!loteDisponivelParaTipo(l, form.tipo)}>
                                {l.codigo} — saldo {l.saldo}
                                {l.data_validade ? ` — vence ${l.data_validade}` : ''}
                                {vencidoLiberado ? ' (vencido, liberado)' : l.vencido ? ' (vencido)' : ''}
                                {l.status !== 'ATIVO' ? ` (${l.status.toLowerCase()})` : ''}
                              </option>
                            );
                          })}
                        </select>
                      ) : (
                        <input id="mov-lote" className="almox-input" value={form.lote}
                          onChange={e => setForm(f => ({ ...f, lote: e.target.value }))}
                          placeholder="Opcional" />
                      )}
                    </div>
                  )}

                  {form.tipo === 'SAIDA' && (
                    <div className="almox-field almox-form-full">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.875rem', color: 'var(--gmp-text)' }}>
                        <input type="checkbox" checked={form.emergencial}
                          onChange={e => setForm(f => ({ ...f, emergencial: e.target.checked }))} />
                        Saída emergencial (regularizar depois)
                      </label>
                      {form.emergencial && (
                        <small style={{ color: 'var(--gmp-warning)', fontSize: '0.75rem' }}>
                          Será exigida justificativa; a movimentação ficará pendente de regularização
                        </small>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="almox-modal-footer">
                <button type="button" className="btn-almox-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn-almox-primary" disabled={saving}>
                  {saving ? 'Registrando...' : 'Confirmar Movimentação'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mini-modal de estorno */}
      {estornoTarget && (
        <div className="almox-modal-overlay" onClick={() => !estornoSaving && setEstornoTarget(null)}>
          <div className="almox-modal almox-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>↩️ Estornar Movimentação</h2>
              <button className="almox-modal-close" onClick={() => setEstornoTarget(null)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <div style={{ background: 'var(--gmp-bg)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, border: '1px solid var(--gmp-border)' }}>
                <div style={{ fontWeight: 700, color: 'var(--gmp-text)' }}>{estornoTarget.material_nome}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)', marginTop: 4 }}>
                  {tipoInfo(estornoTarget.tipo).label} de {estornoTarget.quantidade} {estornoTarget.unidade} em {formatDate(estornoTarget.created_at)}
                </div>
              </div>
              <div className="almox-field">
                <label className="almox-label">Motivo do estorno<span className="required">*</span></label>
                <textarea className="almox-textarea" rows={3} value={estornoMotivo}
                  onChange={e => setEstornoMotivo(e.target.value)}
                  placeholder="Explique o motivo do cancelamento desta movimentação" />
              </div>
            </div>
            <div className="almox-modal-footer">
              <button type="button" className="btn-almox-secondary" onClick={() => setEstornoTarget(null)} disabled={estornoSaving}>
                Cancelar
              </button>
              <button type="button" className="btn-almox-danger" onClick={confirmarEstorno} disabled={estornoSaving || !estornoMotivo.trim()}>
                {estornoSaving ? 'Estornando...' : 'Confirmar Estorno'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extrato do material (aberto pelo nome do material no livro) */}
      {extratoMaterialId && (
        <ExtratoMaterialModal materialId={extratoMaterialId} onClose={() => setExtratoMaterialId(null)} />
      )}
    </div>
  );
};

export default MovimentacoesAlmoxarifado;
