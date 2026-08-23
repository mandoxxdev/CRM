import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiPlus, FiRefreshCw, FiCheckCircle, FiXCircle, FiEye, FiClipboard } from 'react-icons/fi';
import { SkeletonTable } from '../SkeletonLoader';
import { prefixarAlmoxarifado } from '../../utils/localizacaoLabel';
import { useAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';
import './Almoxarifado.css';

const CATEGORIAS = [
  '', 'CONSUMÍVEL', 'FERRAMENTA', 'EPI', 'ELÉTRICO', 'HIDRÁULICO',
  'MECÂNICO', 'INSUMO', 'EMBALAGEM', 'ESCRITÓRIO', 'LIMPEZA', 'OUTROS'
];

// Fallback final do servidor (routes/almoxarifado.js, toleranciaEfetiva) quando a config nem
// existe — usado só se a leitura de /almoxarifado/configuracoes falhar ou a chave não estiver
// setada. Achado da revisão da Task 3: o placeholder ORIGINAL usava sempre este valor fixo,
// alegando que não existia endpoint de leitura — falso, GET /almoxarifado/configuracoes já
// existe e já é consumido por ConfiguracoesAlmoxarifado.js. Corrigido para ler a config real.
const TOLERANCIA_DEFAULT_PLACEHOLDER = '2';

const formatMoeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const ConferenciaEstoque = () => {
  const { bloquearSeNaoPode } = useAlmoxPermissoes();
  const [conferencias, setConferencias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [criarCategoria, setCriarCategoria] = useState('');
  const [criarObs, setCriarObs] = useState('');
  const [criarModoCego, setCriarModoCego] = useState(false);
  const [criarTolerancia, setCriarTolerancia] = useState('');
  const [creating, setCreating] = useState(false);
  const [toleranciaPlaceholder, setToleranciaPlaceholder] = useState(TOLERANCIA_DEFAULT_PLACEHOLDER);

  const [confAberta, setConfAberta] = useState(null);
  const [loadingConf, setLoadingConf] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [contagens, setContagens] = useState({});
  const [aplicarAjustes, setAplicarAjustes] = useState(true);
  const [showConcluirModal, setShowConcluirModal] = useState(false);
  const [justificativaAjuste, setJustificativaAjuste] = useState('');

  useEffect(() => {
    loadConferencias();
    loadToleranciaConfigurada();
  }, []);

  // GET /almoxarifado/configuracoes devolve um MAPA { chave: { valor, descricao, id } } (mesmo
  // contrato que ConfiguracoesAlmoxarifado.js já consome) — a chave que importa aqui é
  // tolerancia_inventario_percentual (routes/almoxarifado.js, toleranciaEfetiva). Falha silenciosa
  // de propósito: se a leitura falhar, o placeholder cai para o fallback fixo — o valor REAL que
  // vale sempre é o que o backend calcula na criação, o placeholder é só uma dica visual.
  const loadToleranciaConfigurada = async () => {
    try {
      const res = await api.get('/almoxarifado/configuracoes');
      const info = res.data?.tolerancia_inventario_percentual;
      const valor = info && typeof info === 'object' ? info.valor : info;
      if (valor !== undefined && valor !== null && valor !== '' && Number.isFinite(parseFloat(valor))) {
        setToleranciaPlaceholder(String(parseFloat(valor)));
      }
    } catch { /* mantém o fallback TOLERANCIA_DEFAULT_PLACEHOLDER */ }
  };

  const loadConferencias = async () => {
    setLoading(true);
    try {
      const res = await api.get('/almoxarifado/conferencias');
      setConferencias(res.data);
    } catch {
      toast.error('Erro ao carregar conferências');
    } finally {
      setLoading(false);
    }
  };

  const handleCriar = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      // RN-01: tolerancia_percentual so vai no payload quando o usuario preencheu algo — vazio
      // significa "deixa o servidor decidir o default" (config ou 2), nunca "manda 0" por engano.
      const res = await api.post('/almoxarifado/conferencias', {
        observacoes: criarObs,
        categoria: criarCategoria || undefined,
        modo_cego: criarModoCego,
        tolerancia_percentual: criarTolerancia !== '' ? parseFloat(criarTolerancia) : undefined
      });
      toast.success(`Conferência ${res.data.numero} criada com ${res.data.totalItens} itens`);
      setShowCreateModal(false);
      setCriarObs('');
      setCriarCategoria('');
      setCriarModoCego(false);
      setCriarTolerancia('');
      loadConferencias();
      abrirConferencia(res.data.id);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao criar conferência');
    } finally {
      setCreating(false);
    }
  };

  const abrirConferencia = async (id) => {
    setLoadingConf(true);
    try {
      const res = await api.get(`/almoxarifado/conferencias/${id}`);
      setConfAberta(res.data);
      const initContagens = {};
      res.data.itens.forEach(item => {
        initContagens[item.id] = item.quantidade_contada !== null ? String(item.quantidade_contada) : '';
      });
      setContagens(initContagens);
    } catch {
      toast.error('Erro ao abrir conferência');
    } finally {
      setLoadingConf(false);
    }
  };

  const handleSalvarContagem = async (itemId) => {
    const val = contagens[itemId];
    if (val === '' || val === undefined) return;
    try {
      await api.put(`/almoxarifado/conferencias/${confAberta.id}/item/${itemId}`, {
        quantidade_contada: parseFloat(val)
      });
    } catch {
      toast.error('Erro ao salvar contagem');
    }
  };

  const handleConcluir = async () => {
    setSalvando(true);
    try {
      const payload = { aplicar_ajustes: aplicarAjustes };
      // RN-06b: justificativa_ajuste so faz sentido (e so e exigida pelo servidor) quando
      // aplicar_ajustes vai true — sem ajuste, nao manda o campo.
      if (aplicarAjustes) payload.justificativa_ajuste = justificativaAjuste;
      const res = await api.put(`/almoxarifado/conferencias/${confAberta.id}/concluir`, payload);
      // D8: impactoFinanceiro e a soma dos valores ABSOLUTOS por item ajustado (nao um
      // liquido/saldo) — so mostra quando teve ajuste de verdade aplicado.
      const mensagem = res.data.ajustesAplicados > 0
        ? `Conferência concluída! Ajustes aplicados: ${res.data.ajustesAplicados} — impacto financeiro: ${formatMoeda(res.data.impactoFinanceiro)}`
        : `Conferência concluída! ${res.data.ajustesAplicados} ajustes aplicados.`;
      toast.success(mensagem);
      setShowConcluirModal(false);
      setJustificativaAjuste('');
      setConfAberta(null);
      loadConferencias();
    } catch (err) {
      // RN-07: 403 (material de cliente sem ajustar_material_cliente) e 400 (recontagem RN-05 ou
      // retencao RN-06) sao dois motivos DISTINTOS, com mensagens e prioridade diferentes no
      // servidor — tratados aqui em ramos separados, nunca um catch generico que ignora qual foi
      // o motivo. Em ambos, a mensagem do servidor chega INTEIRA ao toast (lista completa de
      // itens, nunca so a primeira linha) — nunca reescrita nem cortada aqui.
      const status = err.response?.status;
      const mensagemServidor = err.response?.data?.error;
      if (status === 403) {
        toast.error(mensagemServidor || 'Ajuste bloqueado por permissão em material de cliente');
      } else if (status === 400) {
        toast.error(mensagemServidor || 'Erro ao concluir conferência');
      } else {
        toast.error(mensagemServidor || 'Erro ao concluir conferência');
      }
    } finally {
      setSalvando(false);
    }
  };

  const handleCancelar = async (id, numero) => {
    if (!window.confirm(`Cancelar conferência ${numero}?`)) return;
    try {
      await api.put(`/almoxarifado/conferencias/${id}/cancelar`);
      toast.success('Conferência cancelada');
      loadConferencias();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao cancelar conferência');
    }
  };

  const divergenciaItem = (item) => {
    if (contagens[item.id] === '' || contagens[item.id] === undefined) return null;
    // RN-02: contagem cega para quem nao tem ajustar_estoque — o GET omite quantidade_sistema.
    // Sem o dado do servidor a coluna cliente-side nao tem contra o que comparar; nao ha fórmula
    // local nenhuma que reconstrua o que o servidor decidiu esconder de propósito.
    if (item.quantidade_sistema === undefined || item.quantidade_sistema === null) return null;
    return parseFloat(contagens[item.id]) - item.quantidade_sistema;
  };

  const totalDivergencias = () => {
    if (!confAberta) return 0;
    return confAberta.itens.filter(item => {
      const d = divergenciaItem(item);
      return d !== null && d !== 0;
    }).length;
  };

  const itensContados = () => {
    if (!confAberta) return 0;
    return confAberta.itens.filter(item => contagens[item.id] !== '' && contagens[item.id] !== undefined).length;
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

  // ── Tela de contagem aberta ──
  if (confAberta) {
    return (
      <div className="almox-page">
        <div className="almox-header">
          <div>
            <h1>Conferência {confAberta.numero}</h1>
            <p>
              {itensContados()} / {confAberta.itens.length} itens contados ·
              <span style={{ color: totalDivergencias() > 0 ? 'var(--gmp-warning)' : 'var(--gmp-success)', marginLeft: 6 }}>
                {totalDivergencias()} divergência{totalDivergencias() !== 1 ? 's' : ''}
              </span>
            </p>
          </div>
          <div className="almox-header-actions">
            <button className="btn-almox-secondary" onClick={() => setConfAberta(null)}>
              ← Voltar à lista
            </button>
            {confAberta.status === 'ABERTO' && (
              <button
                className="btn-almox-primary"
                onClick={(e) => {
                  // com ajuste a rota exige TAMBEM ajustar_estoque (o /concluir grava saldo)
                  if (!bloquearSeNaoPode('inventario', e)) return;
                  if (aplicarAjustes && !bloquearSeNaoPode('ajustar_estoque', e)) return;
                  setJustificativaAjuste('');
                  setShowConcluirModal(true);
                }}
                disabled={salvando}
                title={aplicarAjustes
                  ? 'Fecha a contagem E grava as divergências no saldo dos materiais (exige perfil que pode ajustar estoque)'
                  : 'Fecha a contagem sem alterar saldo nenhum — as divergências ficam apenas registradas'}
              >
                <FiCheckCircle size={14} /> {salvando ? 'Concluindo...' : 'Concluir Conferência'}
              </button>
            )}
          </div>
        </div>

        {confAberta.status === 'ABERTO' && (
          <div style={{ background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.875rem', color: 'var(--gmp-text)' }}>
              <input type="checkbox" checked={aplicarAjustes} onChange={e => setAplicarAjustes(e.target.checked)} />
              Aplicar ajustes automáticos ao concluir (saldos com divergência serão corrigidos)
            </label>
          </div>
        )}

        <div className="almox-table-container">
          {loadingConf ? <SkeletonTable rows={8} columns={5} /> : (
            <table className="almox-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Material</th>
                  <th>Localização</th>
                  <th>Qtd. Sistema</th>
                  <th>Qtd. Contada</th>
                  <th>Divergência</th>
                  <th>Recontagem</th>
                </tr>
              </thead>
              <tbody>
                {confAberta.itens.map(item => {
                  const diverg = divergenciaItem(item);
                  // RN-02: campo omitido pelo servidor (contagem cega, ABERTO, sem ajustar_estoque).
                  const temQtdSistema = item.quantidade_sistema !== undefined && item.quantidade_sistema !== null;
                  return (
                    <tr key={item.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>{item.material_codigo}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{item.material_nome}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>{item.unidade}</div>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>
                        {prefixarAlmoxarifado(item.localizacao, item.almoxarifado_codigo) || '—'}
                      </td>
                      <td style={{ fontWeight: 600 }}>{temQtdSistema ? `${item.quantidade_sistema} ${item.unidade}` : '—'}</td>
                      <td>
                        {confAberta.status === 'ABERTO' ? (
                          <input
                            className="almox-count-input"
                            type="number"
                            min="0"
                            step="1"
                            value={contagens[item.id] || ''}
                            onChange={e => setContagens(c => ({ ...c, [item.id]: e.target.value }))}
                            onBlur={() => handleSalvarContagem(item.id)}
                            placeholder="—"
                          />
                        ) : (
                          <span>{item.quantidade_contada !== null ? `${item.quantidade_contada} ${item.unidade}` : '—'}</span>
                        )}
                      </td>
                      <td>
                        {diverg !== null ? (
                          <span className={`almox-count-divergencia ${diverg < 0 ? 'neg' : diverg > 0 ? 'pos' : 'zero'}`}>
                            {diverg > 0 ? '+' : ''}{diverg.toFixed(2)}
                          </span>
                        ) : <span style={{ color: 'var(--gmp-text-light)' }}>—</span>}
                      </td>
                      <td>
                        {/* RN-02/RN-05: recontagem_necessaria sempre vem calculado do servidor —
                            a tela so exibe, nunca reaplica a fórmula de tolerância aqui. */}
                        {item.recontagem_necessaria ? (
                          <span className="almox-badge almox-badge-baixo">Recontagem necessária</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal concluir */}
        {showConcluirModal && (
          <div className="almox-modal-overlay" onClick={() => setShowConcluirModal(false)}>
            <div className="almox-modal almox-modal-sm" onClick={e => e.stopPropagation()}>
              <div className="almox-modal-header">
                <h2>Concluir Conferência {confAberta.numero}</h2>
                <button className="almox-modal-close" onClick={() => setShowConcluirModal(false)}>✕</button>
              </div>
              <div className="almox-modal-body">
                <p>
                  {aplicarAjustes
                    ? 'Os saldos serão ajustados automaticamente conforme a contagem, passando pelo motor de estoque (movimentação AJUSTE_INVENTARIO).'
                    : 'A contagem será encerrada sem alterar nenhum saldo — as divergências ficam apenas registradas.'}
                </p>
                {aplicarAjustes && (
                  <div className="almox-field" style={{ marginTop: 16 }}>
                    <label className="almox-label">Justificativa do ajuste *</label>
                    <textarea
                      className="almox-textarea"
                      rows={3}
                      value={justificativaAjuste}
                      onChange={e => setJustificativaAjuste(e.target.value)}
                      placeholder="Motivo da divergência e do ajuste aplicado (mínimo 5 caracteres)"
                    />
                  </div>
                )}
              </div>
              <div className="almox-modal-footer">
                <button type="button" className="btn-almox-secondary" onClick={() => setShowConcluirModal(false)}>Cancelar</button>
                <button
                  type="button"
                  className="btn-almox-primary"
                  disabled={salvando || (aplicarAjustes && justificativaAjuste.trim().length < 5)}
                  onClick={handleConcluir}
                >
                  {salvando ? 'Concluindo...' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Lista de conferências ──
  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1>Conferências de Estoque</h1>
          <p>Inventários e contagens físicas</p>
        </div>
        <div className="almox-header-actions">
          <button className="btn-almox-secondary" onClick={loadConferencias}>
            <FiRefreshCw size={13} /> Atualizar
          </button>
          <button
            className="btn-almox-primary"
            onClick={(e) => { if (!bloquearSeNaoPode('inventario', e)) return; setShowCreateModal(true); }}
            title="Abre uma contagem de inventário: congela o saldo atual de cada material para você conferir com o físico"
          >
            <FiPlus size={14} /> Nova Conferência
          </button>
        </div>
      </div>

      <div className="almox-table-container">
        {loading ? <SkeletonTable rows={6} columns={6} /> : conferencias.length === 0 ? (
          <div className="almox-empty">
            <FiClipboard size={48} style={{ opacity: 0.3, display: 'block', margin: '0 auto 12px' }} />
            <p>Nenhuma conferência de estoque encontrada</p>
          </div>
        ) : (
          <table className="almox-table">
            <thead>
              <tr>
                <th>Número</th>
                <th>Status</th>
                <th>Responsável</th>
                <th>Data Início</th>
                <th>Data Fim</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {conferencias.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{c.numero}</td>
                  <td>
                    <span className={`almox-badge almox-badge-${c.status.toLowerCase()}`}>{c.status}</span>
                  </td>
                  <td style={{ fontSize: '0.875rem' }}>{c.responsavel_nome}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>{formatDate(c.data_inicio)}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>{formatDate(c.data_fim)}</td>
                  <td>
                    <div className="almox-actions">
                      <button className="almox-btn-icon primary" title="Abrir" onClick={() => abrirConferencia(c.id)}>
                        <FiEye />
                      </button>
                      {c.status === 'ABERTO' && (
                        <button className="almox-btn-icon danger" title="Cancela esta contagem sem alterar saldo nenhum"
                          onClick={(e) => { if (!bloquearSeNaoPode('inventario', e)) return; handleCancelar(c.id, c.numero); }}>
                          <FiXCircle />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal criar */}
      {showCreateModal && (
        <div className="almox-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="almox-modal almox-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>📋 Nova Conferência de Estoque</h2>
              <button className="almox-modal-close" onClick={() => setShowCreateModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCriar}>
              <div className="almox-modal-body">
                <div className="almox-field" style={{ marginBottom: 16 }}>
                  <label className="almox-label">Filtrar por Categoria (opcional)</label>
                  <select className="almox-form-select" value={criarCategoria} onChange={e => setCriarCategoria(e.target.value)}>
                    <option value="">Todos os materiais</option>
                    {CATEGORIAS.filter(Boolean).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="almox-field">
                  <label className="almox-label">Observações</label>
                  <textarea className="almox-textarea" rows={3} value={criarObs}
                    onChange={e => setCriarObs(e.target.value)}
                    placeholder="Motivo, período, responsáveis..." />
                </div>
                <div className="almox-field" style={{ marginTop: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.875rem', color: 'var(--gmp-text)' }}>
                    <input type="checkbox" checked={criarModoCego} onChange={e => setCriarModoCego(e.target.checked)} />
                    Contagem cega (esconde o saldo do sistema de quem só conta, até homologar)
                  </label>
                </div>
                <div className="almox-field" style={{ marginTop: 16 }}>
                  <label className="almox-label">Tolerância (%)</label>
                  <input
                    className="almox-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={criarTolerancia}
                    onChange={e => setCriarTolerancia(e.target.value)}
                    placeholder={`${toleranciaPlaceholder} (padrão, se deixar em branco)`}
                  />
                </div>
                <div style={{ background: 'rgba(79,172,254,0.06)', border: '1px solid rgba(79,172,254,0.2)', borderRadius: 8, padding: '12px 16px', marginTop: 16, fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>
                  Todos os materiais{criarCategoria ? ` da categoria "${criarCategoria}"` : ''} serão incluídos na conferência com seus saldos atuais.
                </div>
              </div>
              <div className="almox-modal-footer">
                <button type="button" className="btn-almox-secondary" onClick={() => setShowCreateModal(false)}>Cancelar</button>
                <button type="submit" className="btn-almox-primary" disabled={creating}>
                  {creating ? 'Criando...' : 'Criar Conferência'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConferenciaEstoque;
