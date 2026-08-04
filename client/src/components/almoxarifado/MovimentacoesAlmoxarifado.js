import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiPlus, FiSearch, FiRefreshCw, FiArrowUp, FiArrowDown, FiCornerUpLeft } from 'react-icons/fi';
import { SkeletonTable } from '../SkeletonLoader';
import ExtratoMaterialModal from './ExtratoMaterialModal';
import './Almoxarifado.css';

const TIPOS_FORM = [
  { value: 'ENTRADA', label: 'Entrada', cls: 'entrada' },
  { value: 'SAIDA', label: 'Saída', cls: 'saida' },
  { value: 'AJUSTE', label: 'Ajuste', cls: 'ajuste' },
  { value: 'DEVOLUCAO', label: 'Devolução', cls: 'devolucao' },
];

// Lista completa para filtro e exibição no livro: inclui ESTORNO, que é gerado pelo
// servidor ao cancelar uma movimentação e não é selecionável ao registrar manualmente.
const TIPOS = [
  ...TIPOS_FORM,
  { value: 'ESTORNO', label: 'Estorno', cls: 'estorno' },
];

// Tipos que não podem ser estornados pelo botão do livro: já são estorno, ou são
// reserva/liberação de reserva (desfeitas pela própria tela de reservas, não pelo
// cancelamento de movimentação — ver stockService.cancelarMovimentacao no servidor).
const podeEstornar = (m) => !m.cancelado && m.tipo !== 'ESTORNO' && !['RESERVA', 'LIBERACAO_RESERVA'].includes(m.tipo);

const MovimentacoesAlmoxarifado = () => {
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
      lote: '', custo_unitario: '', emergencial: false
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
      if (form.tipo === 'SAIDA' && form.localizacao_origem_id) payload.localizacao_origem_id = Number(form.localizacao_origem_id);
      if (form.tipo === 'ENTRADA' && form.localizacao_destino_id) payload.localizacao_destino_id = Number(form.localizacao_destino_id);
      if ((form.tipo === 'ENTRADA' || form.tipo === 'SAIDA') && form.lote) payload.lote = form.lote;
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
          <button className="btn-almox-primary" onClick={openModal}>
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
                return (
                  <tr key={m.id} style={{ opacity: m.cancelado ? 0.55 : 1 }}>
                    <td style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)', whiteSpace: 'nowrap' }}>
                      {formatDate(m.created_at)}
                    </td>
                    <td>
                      <span className={`almox-badge almox-badge-${t.cls}`}>
                        {m.tipo === 'ENTRADA' || m.tipo === 'DEVOLUCAO' ? <FiArrowUp size={10} /> : <FiArrowDown size={10} />}
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
                        color: m.tipo === 'SAIDA' ? 'var(--gmp-error)' : 'var(--gmp-success)',
                        fontSize: '0.9rem'
                      }}>
                        {m.tipo === 'SAIDA' ? '-' : '+'}{m.quantidade} {m.unidade}
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
                          <button className="almox-btn-icon danger" title="Estornar movimentação" onClick={() => abrirEstorno(m)}>
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
                        const mostraLote = novoTipo === 'ENTRADA' || novoTipo === 'SAIDA';
                        // Limpa qualquer campo que só aparece para outro tipo — o estado nunca
                        // pode carregar um valor que o usuário não está mais vendo na tela
                        // (senão ele vaza escondido para o payload do tipo atual).
                        setForm(f => ({
                          ...f,
                          tipo: novoTipo,
                          emergencial: novoTipo === 'SAIDA' ? f.emergencial : false,
                          localizacao_destino_id: novoTipo === 'ENTRADA' ? f.localizacao_destino_id : '',
                          custo_unitario: novoTipo === 'ENTRADA' ? f.custo_unitario : '',
                          localizacao_origem_id: novoTipo === 'SAIDA' ? f.localizacao_origem_id : '',
                          lote: mostraLote ? f.lote : ''
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
                    {selectedMaterial && form.tipo === 'SAIDA' && (
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
                      {(form.tipo === 'SAIDA' || form.tipo === 'AJUSTE') && <span className="required">*</span>}
                    </label>
                    <input className="almox-input" value={form.motivo}
                      onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}
                      placeholder="Compra, Uso produção, Retorno, etc."
                      required={form.tipo === 'SAIDA' || form.tipo === 'AJUSTE'} />
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
                          <option key={l.id} value={l.id}>{l.codigo}{l.descricao ? ` — ${l.descricao}` : ''}</option>
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
                  {form.tipo === 'SAIDA' && (
                    <div className="almox-field">
                      <label className="almox-label">Localização de origem</label>
                      <select className="almox-form-select" value={form.localizacao_origem_id}
                        onChange={e => setForm(f => ({ ...f, localizacao_origem_id: e.target.value }))}>
                        <option value="">—</option>
                        {localizacoes.map(l => (
                          <option key={l.id} value={l.id}>{l.codigo}{l.descricao ? ` — ${l.descricao}` : ''}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {(form.tipo === 'ENTRADA' || form.tipo === 'SAIDA') && (
                    <div className="almox-field">
                      <label className="almox-label">Lote</label>
                      <input className="almox-input" value={form.lote}
                        onChange={e => setForm(f => ({ ...f, lote: e.target.value }))}
                        placeholder="Opcional" />
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
