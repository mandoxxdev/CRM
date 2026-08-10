import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiRefreshCw, FiSliders, FiUnlock, FiUpload } from 'react-icons/fi';
import { SkeletonTable } from '../SkeletonLoader';
import { useAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';
import './Almoxarifado.css';

/**
 * Tela de lotes (Etapa 6 — Task 9, nasceu do review da Task 8).
 *
 * A Etapa 6 entregou o motor inteiro do ciclo de vida do lote — status, vencimento, certificado —
 * mas só por API. Três rotas ficaram sem consumidor: `PUT /lotes/:id/status`,
 * `PUT /lotes/:id/liberar-vencimento` e `POST /lotes/:id/certificado`. O caso que torna isso
 * urgente: com `controle_certificado` ligado no material, o lote nasce BLOQUEADO e só o POST de
 * certificado o libera. Sem esta tela, ligar a flag inutilizava o material pela interface — só
 * um desenvolvedor destravava, por API direta.
 *
 * Escolher o material primeiro, depois listar os lotes dele (o GET é por material) — mesma
 * forma de filtro que Reservas/Inspeções já usam.
 *
 * `vencido` é SEMPRE derivado de `data_validade` no servidor (lotService.isVencido). A liberação
 * de vencimento NÃO apaga esse fato — só registra que alguém assumiu a responsabilidade de usar
 * um lote vencido, com justificativa auditada. Por isso um lote pode estar `vencido: true` e
 * `vencimento_liberado: true` ao mesmo tempo, e a tela precisa mostrar os dois estados como
 * coisas DIFERENTES (badge e cor diferentes) — tratar como a mesma coisa esconderia por que um
 * lote vencido sai para consumo e outro não.
 *
 * Lote não elegível (bloqueado, reprovado, vencido sem liberação) continua na lista — o servidor
 * já manda em ordem FEFO com os não elegíveis no fim, e esconder faria o operador procurar um
 * lote que o sistema decidiu não mostrar. A tela NÃO reordena o que a API devolveu.
 */

const STATUS_LOTE = [
  { value: 'ATIVO', label: 'Ativo', cls: 'ok' },
  { value: 'BLOQUEADO', label: 'Bloqueado', cls: 'baixo' },
  { value: 'REPROVADO', label: 'Reprovado', cls: 'critico' },
];

const statusInfo = (s) => STATUS_LOTE.find((x) => x.value === s) || { label: s || '—', cls: 'vazio' };

// Sugestão ao abrir o modal: ATIVO<->BLOQUEADO alterna (ações mais comuns), REPROVADO sugere
// reativar. O operador troca livremente — isto só evita que "Confirmar" fique habilitado com o
// próprio status atual selecionado por acidente.
const proximoStatusSugerido = (atual) => (atual === 'ATIVO' ? 'BLOQUEADO' : 'ATIVO');

// `status_motivo` é texto livre gravado por receiptService ao criar o lote sem certificado
// ('Certificado do fornecedor nao anexado') — é o único sinal que a tela tem de que ESTE
// bloqueio é por falta de certificado (ver lotService.liberarBloqueioPorCertificado no servidor,
// que casa a mesma substring no WHERE).
const bloqueadoPorCertificado = (l) => l.status === 'BLOQUEADO' && /certificado/i.test(l.status_motivo || '');

const formatData = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : null);

const LotesAlmoxarifado = () => {
  const { bloquearSeNaoPode } = useAlmoxPermissoes();

  const [materiais, setMateriais] = useState([]);
  const [materialId, setMaterialId] = useState('');
  const [lotes, setLotes] = useState([]);
  const [loading, setLoading] = useState(false);

  const [statusTarget, setStatusTarget] = useState(null);
  const [statusForm, setStatusForm] = useState({ status: '', justificativa: '' });
  const [statusSaving, setStatusSaving] = useState(false);

  const [vencimentoTarget, setVencimentoTarget] = useState(null);
  const [vencimentoJustificativa, setVencimentoJustificativa] = useState('');
  const [vencimentoSaving, setVencimentoSaving] = useState(false);

  const [certificadoTarget, setCertificadoTarget] = useState(null);
  const [certificadoArquivo, setCertificadoArquivo] = useState(null);
  const [certificadoSaving, setCertificadoSaving] = useState(false);

  useEffect(() => {
    api.get('/almoxarifado/materiais')
      .then((res) => setMateriais(res.data || []))
      .catch(() => setMateriais([]));
  }, []);

  // `reloadToken` é o gatilho de "recarregar de novo com o mesmo materialId" (botão Atualizar e
  // depois de cada ação bem-sucedida) — `materialId` sozinho não muda quando o operador clica
  // Atualizar no mesmo material, então não dispararia o efeito.
  const [reloadToken, setReloadToken] = useState(0);
  const loadLotes = useCallback(() => setReloadToken((t) => t + 1), []);

  // Fix round 1 (review da Task 9): troca rápida de material podia deixar a resposta de um GET
  // anterior (ainda em voo) sobrescrever a lista depois que o operador já tinha escolhido outro
  // material — mesmo problema que o `useEffect` de lotes de `MovimentacoesAlmoxarifado.js` já
  // resolve com a flag `cancelado`. Aqui a guarda também cobre o próprio "Atualizar": clicar duas
  // vezes rápido não deixa a primeira resposta pisar na segunda.
  useEffect(() => {
    if (!materialId) { setLotes([]); return undefined; }
    let cancelado = false;
    setLoading(true);
    api.get(`/almoxarifado/materiais/${materialId}/lotes`)
      .then((res) => { if (!cancelado) setLotes(res.data || []); })
      .catch(() => { if (!cancelado) toast.error('Erro ao carregar lotes do material'); })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [materialId, reloadToken]);

  const materialSelecionado = materiais.find((m) => m.id === parseInt(materialId, 10));

  const abrirStatus = (l) => {
    setStatusTarget(l);
    setStatusForm({ status: proximoStatusSugerido(l.status), justificativa: '' });
  };

  const confirmarStatus = async () => {
    setStatusSaving(true);
    try {
      await api.put(`/almoxarifado/lotes/${statusTarget.id}/status`, {
        status: statusForm.status,
        justificativa: statusForm.justificativa.trim(),
      });
      toast.success('Status do lote atualizado!');
      setStatusTarget(null);
      loadLotes();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao mudar status do lote');
    } finally {
      setStatusSaving(false);
    }
  };

  const abrirVencimento = (l) => {
    setVencimentoTarget(l);
    setVencimentoJustificativa('');
  };

  const confirmarVencimento = async () => {
    setVencimentoSaving(true);
    try {
      await api.put(`/almoxarifado/lotes/${vencimentoTarget.id}/liberar-vencimento`, {
        justificativa: vencimentoJustificativa.trim(),
      });
      toast.success('Vencimento liberado para consumo!');
      setVencimentoTarget(null);
      loadLotes();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao liberar vencimento do lote');
    } finally {
      setVencimentoSaving(false);
    }
  };

  const abrirCertificado = (l) => {
    setCertificadoTarget(l);
    setCertificadoArquivo(null);
  };

  const confirmarCertificado = async () => {
    if (!certificadoArquivo) return;
    setCertificadoSaving(true);
    try {
      const fd = new FormData();
      fd.append('certificado', certificadoArquivo);
      await api.post(`/almoxarifado/lotes/${certificadoTarget.id}/certificado`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Certificado anexado!');
      setCertificadoTarget(null);
      loadLotes();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao anexar certificado');
    } finally {
      setCertificadoSaving(false);
    }
  };

  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1>Lotes</h1>
          <p>
            {materialSelecionado
              ? `${lotes.length} lote${lotes.length !== 1 ? 's' : ''} de ${materialSelecionado.nome}`
              : 'Selecione um material para ver os lotes'}
          </p>
        </div>
        <div className="almox-header-actions">
          <button className="btn-almox-secondary" disabled={!materialId} onClick={loadLotes}>
            <FiRefreshCw size={13} /> Atualizar
          </button>
        </div>
      </div>

      {/* Filtro — escolher o material primeiro, o GET de lotes é por material */}
      <div className="almox-filters">
        <select className="almox-select" value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
          <option value="">Selecionar material...</option>
          {materiais.map((m) => <option key={m.id} value={m.id}>{m.codigo} — {m.nome}</option>)}
        </select>
      </div>

      {/* Tabela */}
      <div className="almox-table-container">
        {!materialId ? (
          <div className="almox-empty"><p>Selecione um material para ver os lotes</p></div>
        ) : loading ? <SkeletonTable rows={6} columns={8} /> : lotes.length === 0 ? (
          <div className="almox-empty"><p>Nenhum lote cadastrado para este material</p></div>
        ) : (
          <table className="almox-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Status</th>
                <th>Validade</th>
                <th>Corrida</th>
                <th>Fornecedor</th>
                <th>NF</th>
                <th>Saldo</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {lotes.map((l) => {
                const s = statusInfo(l.status);
                const vencidoLiberado = l.vencido && l.vencimento_liberado;
                return (
                  <tr key={l.id}>
                    <td>{l.codigo}</td>
                    <td>
                      <span className={`almox-badge almox-badge-${s.cls}`}>{s.label}</span>
                      {bloqueadoPorCertificado(l) && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--gmp-warning)', marginTop: 4, maxWidth: 160 }}>
                          Bloqueado por falta de certificado
                        </div>
                      )}
                      {/* Fix round 1: sem isto o operador só descobria se já havia certificado
                          anexado depois de abrir o modal de anexar — a linha da tabela não dizia
                          nada sobre `certificado_arquivo`, que o servidor já devolve no SELECT. */}
                      {l.certificado_arquivo && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--gmp-success)', marginTop: 4 }}>
                          Certificado anexado
                          {l.certificado_em ? ` em ${new Date(l.certificado_em).toLocaleDateString('pt-BR')}` : ''}
                        </div>
                      )}
                    </td>
                    <td>
                      {l.data_validade ? (
                        <>
                          <div style={{ whiteSpace: 'nowrap', color: l.vencido ? 'var(--gmp-error)' : undefined }}>
                            {formatData(l.data_validade)}
                          </div>
                          {l.vencido && (
                            <span
                              className={`almox-badge almox-badge-${vencidoLiberado ? 'ajuste' : 'critico'}`}
                              style={{ marginTop: 4 }}
                            >
                              {vencidoLiberado ? 'VENCIDO (liberado)' : 'VENCIDO'}
                            </span>
                          )}
                          {vencidoLiberado && (
                            <div
                              style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)', marginTop: 4, maxWidth: 200 }}
                              title={l.vencimento_liberado_motivo || ''}
                            >
                              Liberado por usuário #{l.vencimento_liberado_por ?? '—'}
                              {l.vencimento_liberado_motivo ? ` — ${l.vencimento_liberado_motivo}` : ''}
                            </div>
                          )}
                        </>
                      ) : <span style={{ color: 'var(--gmp-text-light)' }}>—</span>}
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>{l.corrida || '—'}</td>
                    <td style={{ fontSize: '0.85rem' }}>{l.fornecedor_nome || '—'}</td>
                    <td style={{ fontSize: '0.85rem' }}>{l.nota_fiscal || '—'}</td>
                    <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {l.saldo} {materialSelecionado?.unidade || ''}
                    </td>
                    <td>
                      <div className="almox-actions">
                        <button className="almox-btn-icon" title="Mudar status (bloquear/reprovar/reativar)"
                          onClick={(e) => { if (!bloquearSeNaoPode('inspecionar', e)) return; abrirStatus(l); }}>
                          <FiSliders />
                        </button>
                        {l.vencido && (
                          <button className="almox-btn-icon" title="Liberar vencimento para consumo"
                            onClick={(e) => { if (!bloquearSeNaoPode('inspecionar', e)) return; abrirVencimento(l); }}>
                            <FiUnlock />
                          </button>
                        )}
                        <button className="almox-btn-icon" title="Anexar certificado do fornecedor"
                          onClick={(e) => { if (!bloquearSeNaoPode('receber_material', e)) return; abrirCertificado(l); }}>
                          <FiUpload />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal — mudar status */}
      {statusTarget && (
        <div className="almox-modal-overlay" onClick={() => { if (!statusSaving) setStatusTarget(null); }}>
          <div className="almox-modal almox-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>Mudar status do lote</h2>
              <button className="almox-modal-close" onClick={() => setStatusTarget(null)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <p style={{ marginTop: 0 }}>
                Lote <strong>{statusTarget.codigo}</strong> — status atual{' '}
                <span className={`almox-badge almox-badge-${statusInfo(statusTarget.status).cls}`}>
                  {statusInfo(statusTarget.status).label}
                </span>
              </p>
              <div className="almox-field">
                <label className="almox-label">Novo status<span className="required">*</span></label>
                <select className="almox-form-select" value={statusForm.status}
                  onChange={(e) => setStatusForm((f) => ({ ...f, status: e.target.value }))}>
                  {STATUS_LOTE.map((st) => <option key={st.value} value={st.value}>{st.label}</option>)}
                </select>
              </div>
              <div className="almox-field">
                <label className="almox-label">Justificativa<span className="required">*</span></label>
                <textarea className="almox-input" rows={2} value={statusForm.justificativa}
                  placeholder="Por que o status deste lote está mudando?"
                  onChange={(e) => setStatusForm((f) => ({ ...f, justificativa: e.target.value }))} />
              </div>
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setStatusTarget(null)}>Cancelar</button>
              <button className="btn-almox-primary" disabled={statusSaving || !statusForm.justificativa.trim()}
                onClick={confirmarStatus}>
                {statusSaving ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — liberar vencimento */}
      {vencimentoTarget && (
        <div className="almox-modal-overlay" onClick={() => { if (!vencimentoSaving) setVencimentoTarget(null); }}>
          <div className="almox-modal almox-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>Liberar vencimento</h2>
              <button className="almox-modal-close" onClick={() => setVencimentoTarget(null)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <p style={{ marginTop: 0 }}>
                <strong>{vencimentoTarget.codigo}</strong> venceu em{' '}
                <strong>{formatData(vencimentoTarget.data_validade)}</strong>.
              </p>
              <div className="almox-badge almox-badge-baixo" style={{ display: 'block', padding: '8px 10px', marginBottom: 12, lineHeight: 1.4 }}>
                Isto não "desvence" o lote — ele continua vencido. Só passa a ser aceito numa saída
                de consumo, com a justificativa registrada na auditoria.
              </div>
              <div className="almox-field">
                <label className="almox-label">Justificativa<span className="required">*</span></label>
                <textarea className="almox-input" rows={2} value={vencimentoJustificativa}
                  placeholder="Por que este lote vencido pode ser usado?"
                  onChange={(e) => setVencimentoJustificativa(e.target.value)} />
              </div>
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setVencimentoTarget(null)}>Cancelar</button>
              <button className="btn-almox-primary" disabled={vencimentoSaving || !vencimentoJustificativa.trim()}
                onClick={confirmarVencimento}>
                {vencimentoSaving ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — anexar certificado */}
      {certificadoTarget && (
        <div className="almox-modal-overlay" onClick={() => { if (!certificadoSaving) setCertificadoTarget(null); }}>
          <div className="almox-modal almox-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>Anexar certificado</h2>
              <button className="almox-modal-close" onClick={() => setCertificadoTarget(null)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <p style={{ marginTop: 0 }}>
                Lote <strong>{certificadoTarget.codigo}</strong>
                {certificadoTarget.fornecedor_nome ? ` — ${certificadoTarget.fornecedor_nome}` : ''}
              </p>
              {bloqueadoPorCertificado(certificadoTarget) && (
                <div className="almox-badge almox-badge-baixo" style={{ display: 'block', padding: '8px 10px', marginBottom: 12, lineHeight: 1.4 }}>
                  Este lote está BLOQUEADO por falta de certificado. Anexar o certificado do
                  fornecedor libera o lote automaticamente.
                </div>
              )}
              <div className="almox-field">
                <label className="almox-label" htmlFor="lote-certificado-arquivo">
                  Arquivo (PDF ou imagem)<span className="required">*</span>
                </label>
                <input id="lote-certificado-arquivo" className="almox-input" type="file" accept=".pdf,image/*"
                  onChange={(e) => setCertificadoArquivo(e.target.files?.[0] || null)} />
              </div>
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setCertificadoTarget(null)}>Cancelar</button>
              <button className="btn-almox-primary" disabled={certificadoSaving || !certificadoArquivo}
                onClick={confirmarCertificado}>
                {certificadoSaving ? 'Enviando...' : 'Anexar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LotesAlmoxarifado;
