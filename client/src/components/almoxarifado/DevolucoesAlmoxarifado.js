import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiCornerUpLeft, FiRefreshCw } from 'react-icons/fi';
import { SkeletonTable } from '../SkeletonLoader';
import { useAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';
import './Almoxarifado.css';

/**
 * Tela de devoluções (Etapa 7, Task 7).
 *
 * `POST /devolucoes` existia desde sempre sem nenhuma tela — só era alcançável por chamada direta
 * à API. O fluxo desta tela é material → saídas daquele material → devolver com herança de lote, e
 * não cabia no formulário genérico de Movimentações (por isso `DEVOLUCAO` saiu de lá na Task 6:
 * registrar ali criava movimentação solta e nenhum registro de devolução).
 *
 * Começar pelo MATERIAL, e não pela requisição, é decisão do design: pela requisição não se
 * alcança saída manual sem requisição, e SAIDA_PRODUCAO/MONTAGEM/ASSISTENCIA existem exatamente
 * para isso.
 *
 * A sugestão condição→destino vive SÓ aqui. O backend aceita qualquer combinação de propósito —
 * uma regra rígida no motor criaria um caso sem saída (material bom que precisa ir para inspeção
 * por outro motivo). A sugestão guia quem está aprendendo sem travar o caso fora da regra.
 */

// A lista que `returnService.MOTIVOS` já exporta no servidor, com rótulo legível.
const MOTIVOS = [
  { value: 'SOBRA_PROJETO', label: 'Sobra de projeto' },
  { value: 'NAO_UTILIZADO', label: 'Não utilizado' },
  { value: 'ITEM_ERRADO', label: 'Item errado' },
  { value: 'DANIFICADO', label: 'Danificado' },
  { value: 'RECUPERAVEL', label: 'Recuperável' },
  { value: 'SUCATA', label: 'Sucata' },
];

const CONDICOES = [
  { value: 'BOA', label: 'Boa', destino: 'ESTOQUE' },
  { value: 'SUSPEITA', label: 'Suspeita', destino: 'QUARENTENA' },
  { value: 'DANIFICADA', label: 'Danificada', destino: 'SUCATA' },
];

const DESTINOS = [
  { value: 'ESTOQUE', label: 'Estoque', cls: 'ok', ajuda: 'Volta ao saldo disponível.' },
  { value: 'QUARENTENA', label: 'Quarentena', cls: 'baixo', ajuda: 'Volta ao saldo, mas bloqueado até a inspeção decidir.' },
  { value: 'SUCATA', label: 'Sucata', cls: 'critico', ajuda: 'Entra e sai: o saldo não muda e o descarte fica no livro.' },
  { value: 'RETRABALHO', label: 'Retrabalho', cls: 'vazio', ajuda: 'Só registra no livro — não altera saldo nenhum.' },
];
const destinoInfo = (d) => DESTINOS.find((x) => x.value === d) || { label: d || '—', cls: 'vazio', ajuda: '' };

// Decisão 10 do design: devolução com série cobre só ESTOQUE e QUARENTENA. Para sucatear peça
// serializada devolvida, o caminho é devolver ao estoque e depois baixar em Movimentações, que
// tem seletor de série. A tela explica isso em vez de deixar o envio falhar no servidor.
const DESTINOS_COM_SERIE = ['ESTOQUE', 'QUARENTENA'];

const FORM_VAZIO = {
  material_id: '', movimentacao_saida_id: '', quantidade: '', motivo: '',
  condicao: '', destino: 'ESTOQUE', observacoes: '', lote_id: '', series: [], seriesTexto: '',
};

const formatData = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');

const DevolucoesAlmoxarifado = () => {
  const { bloquearSeNaoPode } = useAlmoxPermissoes();
  const [devolucoes, setDevolucoes] = useState([]);
  const [materiais, setMateriais] = useState([]);
  const [saidas, setSaidas] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);

  const materialSelecionado = materiais.find((m) => m.id === parseInt(form.material_id, 10));
  const saidaSelecionada = saidas.find((s) => String(s.id) === String(form.movimentacao_saida_id));
  const maxDevolvivel = saidaSelecionada ? saidaSelecionada.saldo_devolvivel : null;
  const loteHerdado = saidaSelecionada && saidaSelecionada.lote_id ? saidaSelecionada : null;
  const precisaSeletorDeLote = materialSelecionado?.controle_lote === 1 && !loteHerdado;
  const aceitaSerie = materialSelecionado?.controle_serie === 1 && DESTINOS_COM_SERIE.includes(form.destino);

  const loadDevolucoes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/almoxarifado/devolucoes');
      setDevolucoes(res.data || []);
    } catch (e) {
      toast.error('Erro ao carregar devoluções');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    api.get('/almoxarifado/materiais').then((res) => setMateriais(res.data || [])).catch(() => setMateriais([]));
    loadDevolucoes();
  }, [loadDevolucoes]);

  // Guarda `cancelado` (molde de LotesAlmoxarifado): trocar de material antes da resposta chegar
  // precisa descartá-la, senão a lista de saídas do material anterior pinta a do atual.
  useEffect(() => {
    if (!form.material_id) { setSaidas([]); return undefined; }
    let cancelado = false;
    api.get(`/almoxarifado/devolucoes/saidas-elegiveis?material_id=${form.material_id}`)
      .then((res) => { if (!cancelado) setSaidas(res.data || []); })
      .catch(() => { if (!cancelado) setSaidas([]); });
    return () => { cancelado = true; };
  }, [form.material_id]);

  useEffect(() => {
    if (!form.material_id) { setLotes([]); return undefined; }
    let cancelado = false;
    api.get(`/almoxarifado/materiais/${form.material_id}/lotes?com_saldo=1`)
      .then((res) => { if (!cancelado) setLotes(res.data || []); })
      .catch(() => { if (!cancelado) setLotes([]); });
    return () => { cancelado = true; };
  }, [form.material_id]);

  const abrirModal = (e) => {
    if (!bloquearSeNaoPode('movimentar', e)) return;
    setForm(FORM_VAZIO);
    setShowModal(true);
  };

  // Condição SUGERE o destino (decisão 6). Trocar a condição repropõe; trocar o destino direto
  // manda — a sugestão nunca desfaz uma escolha explícita, porque quem decide o destino é quem
  // está com a peça na mão.
  const escolherCondicao = (valor) => {
    const sugestao = CONDICOES.find((c) => c.value === valor);
    setForm((f) => ({ ...f, condicao: valor, destino: sugestao ? sugestao.destino : f.destino }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const quantidade = parseFloat(form.quantidade);
    if (!form.material_id || !quantidade || quantidade <= 0) {
      toast.error('Selecione o material e informe a quantidade');
      return;
    }
    if (!form.motivo) { toast.error('Informe o motivo da devolução'); return; }
    // O servidor é a autoridade sobre o limite (validarSaidaOriginal). Esta checagem só evita a
    // ida a ele quando o resultado já é sabido.
    if (maxDevolvivel !== null && quantidade > maxDevolvivel) {
      toast.error(`Esta entrega ainda aceita ${maxDevolvivel} de devolução`);
      return;
    }
    if (precisaSeletorDeLote && !form.lote_id) {
      toast.error('Material com controle por lote: informe de qual lote é a devolução');
      return;
    }
    const seriesFinal = saidaSelecionada
      ? form.series
      : String(form.seriesTexto || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (aceitaSerie && seriesFinal.length !== quantidade) {
      toast.error('Selecione exatamente a quantidade de séries informada');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        material_id: Number(form.material_id),
        quantidade,
        motivo: form.motivo,
        destino: form.destino,
      };
      if (form.condicao) payload.condicao = form.condicao;
      if (form.observacoes) payload.observacoes = form.observacoes;
      if (form.movimentacao_saida_id) payload.movimentacao_saida_id = Number(form.movimentacao_saida_id);
      if (precisaSeletorDeLote && form.lote_id) payload.lote_id = Number(form.lote_id);
      if (aceitaSerie) payload.series = seriesFinal;

      await api.post('/almoxarifado/devolucoes', payload);
      toast.success('Devolução registrada!');
      setShowModal(false);
      loadDevolucoes();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao registrar devolução');
    } finally {
      setSaving(false);
    }
  };

  const rotuloSaida = (s) => {
    const partes = [formatData(s.created_at), s.tipo, `${s.quantidade} un`];
    if (s.requisicao_numero) partes.push(s.requisicao_numero);
    else if (s.os_id) partes.push(`OS ${s.os_id}`);
    if (s.usuario_nome) partes.push(s.usuario_nome);
    if (s.lote) partes.push(`lote ${s.lote}`);
    partes.push(s.saldo_devolvivel > 0 ? `devolvível ${s.saldo_devolvivel}` : 'já devolvido por inteiro');
    return partes.join(' · ');
  };

  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1><FiCornerUpLeft size={20} /> Devoluções</h1>
          <p>Material que voltou do chão de fábrica, ligado à entrega que o originou.</p>
        </div>
        <div className="almox-header-actions">
          <button className="btn-almox-secondary" onClick={loadDevolucoes}>
            <FiRefreshCw size={13} /> Atualizar
          </button>
          <button className="btn-almox-primary" onClick={abrirModal}>Nova Devolução</button>
        </div>
      </div>

      <div className="almox-table-container">
        {loading ? <SkeletonTable rows={6} columns={8} /> : devolucoes.length === 0 ? (
          <div className="almox-empty"><p>Nenhuma devolução registrada</p></div>
        ) : (
          <table className="almox-table">
            <thead>
              <tr>
                <th>Data</th><th>Material</th><th>Qtd</th><th>Motivo</th>
                <th>Condição</th><th>Destino</th><th>Saída de origem</th><th>Responsável</th>
              </tr>
            </thead>
            <tbody>
              {devolucoes.map((d) => {
                const info = destinoInfo(d.destino);
                const motivo = MOTIVOS.find((m) => m.value === d.motivo);
                return (
                  <tr key={d.id}>
                    <td>{formatData(d.created_at)}</td>
                    <td>{d.material_codigo} — {d.material_nome}</td>
                    <td>{d.quantidade}</td>
                    <td>{motivo ? motivo.label : d.motivo}</td>
                    <td>{d.condicao || '—'}</td>
                    <td><span className={`almox-badge almox-badge-${info.cls}`}>{info.label}</span></td>
                    <td>{d.movimentacao_saida_id ? `#${d.movimentacao_saida_id}` : 'avulsa'}</td>
                    <td>{d.responsavel_nome || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="almox-modal-overlay" onClick={() => { if (!saving) setShowModal(false); }}>
          <div className="almox-modal" onClick={(e) => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>Nova devolução</h2>
              <button className="almox-modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="almox-modal-body">
                <div className="almox-form-grid">
                  <div className="almox-field">
                    <label className="almox-label" htmlFor="dev-material">Material<span className="required">*</span></label>
                    <select id="dev-material" className="almox-form-select" value={form.material_id}
                      onChange={(e) => setForm((f) => ({ ...f, material_id: e.target.value, movimentacao_saida_id: '', lote_id: '', series: [] }))}>
                      <option value="">Selecionar material...</option>
                      {materiais.map((m) => <option key={m.id} value={m.id}>{m.codigo} — {m.nome}</option>)}
                    </select>
                  </div>

                  <div className="almox-field almox-form-full">
                    <label className="almox-label" htmlFor="dev-saida">Entrega de origem</label>
                    <select id="dev-saida" className="almox-form-select" value={form.movimentacao_saida_id}
                      onChange={(e) => setForm((f) => ({ ...f, movimentacao_saida_id: e.target.value, series: [] }))}>
                      <option value="">Devolução avulsa (sem entrega registrada)</option>
                      {saidas.map((s) => (
                        <option key={s.id} value={s.id} disabled={s.saldo_devolvivel <= 0}>{rotuloSaida(s)}</option>
                      ))}
                    </select>
                    <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                      Avulsa serve para sobra antiga ou material entregue antes do sistema — sem entrega, não há
                      limite de quantidade nem lote a herdar.
                    </small>
                  </div>

                  <div className="almox-field">
                    <label className="almox-label" htmlFor="dev-quantidade">Quantidade<span className="required">*</span></label>
                    <input id="dev-quantidade" className="almox-input" type="number" min="0" step="1"
                      max={maxDevolvivel !== null ? String(maxDevolvivel) : undefined}
                      value={form.quantidade}
                      onChange={(e) => setForm((f) => ({ ...f, quantidade: e.target.value }))} />
                    {maxDevolvivel !== null && (
                      <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                        Devolvível nesta entrega: {maxDevolvivel} {materialSelecionado?.unidade || ''}
                      </small>
                    )}
                  </div>

                  <div className="almox-field">
                    <label className="almox-label" htmlFor="dev-motivo">Motivo<span className="required">*</span></label>
                    <select id="dev-motivo" className="almox-form-select" value={form.motivo}
                      onChange={(e) => setForm((f) => ({ ...f, motivo: e.target.value }))}>
                      <option value="">Selecionar...</option>
                      {MOTIVOS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>

                  <div className="almox-field">
                    <label className="almox-label" htmlFor="dev-condicao">Condição</label>
                    <select id="dev-condicao" className="almox-form-select" value={form.condicao}
                      onChange={(e) => escolherCondicao(e.target.value)}>
                      <option value="">Não avaliada</option>
                      {CONDICOES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                    <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                      A condição sugere o destino — você pode trocar.
                    </small>
                  </div>

                  <div className="almox-field">
                    <label className="almox-label" htmlFor="dev-destino">Destino<span className="required">*</span></label>
                    <select id="dev-destino" className="almox-form-select" value={form.destino}
                      onChange={(e) => setForm((f) => ({ ...f, destino: e.target.value }))}>
                      {DESTINOS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                    <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                      {destinoInfo(form.destino).ajuda}
                    </small>
                  </div>

                  {loteHerdado && (
                    <div className="almox-field">
                      <label className="almox-label">Lote (herdado da entrega)</label>
                      <div className="almox-badge almox-badge-ok">{loteHerdado.lote || `#${loteHerdado.lote_id}`}</div>
                    </div>
                  )}
                  {precisaSeletorDeLote && (
                    <div className="almox-field">
                      <label className="almox-label" htmlFor="dev-lote">Lote<span className="required">*</span></label>
                      <select id="dev-lote" className="almox-form-select" value={form.lote_id}
                        onChange={(e) => setForm((f) => ({ ...f, lote_id: e.target.value }))}>
                        <option value="">Selecionar lote...</option>
                        {lotes.map((l) => <option key={l.id} value={l.id}>{l.codigo} — saldo {l.saldo}</option>)}
                      </select>
                    </div>
                  )}

                  {aceitaSerie && saidaSelecionada && (
                    <div className="almox-field almox-form-full">
                      <label className="almox-label">Séries devolvidas<span className="required">*</span></label>
                      <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid var(--gmp-border)', borderRadius: 6, padding: 6 }}>
                        {saidaSelecionada.series.map((s) => (
                          <label key={s.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.85rem' }}>
                            <input type="checkbox" value={s.numero} checked={form.series.includes(s.numero)}
                              onChange={(e) => setForm((f) => ({
                                ...f,
                                series: e.target.checked ? [...f.series, s.numero] : f.series.filter((n) => n !== s.numero),
                              }))} />
                            {s.numero}
                          </label>
                        ))}
                        {saidaSelecionada.series.length === 0 && <small>Nenhuma série em aberto nesta entrega.</small>}
                      </div>
                      <small>{form.series.length}/{form.quantidade || 0} série(s) selecionada(s)</small>
                    </div>
                  )}
                  {aceitaSerie && !saidaSelecionada && (
                    <div className="almox-field almox-form-full">
                      <label className="almox-label" htmlFor="dev-series-texto">Números de série (um por linha)<span className="required">*</span></label>
                      <textarea id="dev-series-texto" className="almox-textarea" rows={3} value={form.seriesTexto}
                        onChange={(e) => setForm((f) => ({ ...f, seriesTexto: e.target.value }))} />
                    </div>
                  )}
                  {materialSelecionado?.controle_serie === 1 && !DESTINOS_COM_SERIE.includes(form.destino) && (
                    <div className="almox-field almox-form-full">
                      <small style={{ color: 'var(--gmp-warning)', fontSize: '0.78rem' }}>
                        Peça com número de série não pode ir direto para {destinoInfo(form.destino).label} por aqui.
                        Devolva ao Estoque e registre a baixa na tela Movimentações, que tem seletor de série.
                      </small>
                    </div>
                  )}

                  <div className="almox-field almox-form-full">
                    <label className="almox-label" htmlFor="dev-observacoes">Observações</label>
                    <textarea id="dev-observacoes" className="almox-textarea" rows={2} value={form.observacoes}
                      onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
                  </div>
                </div>
              </div>
              <div className="almox-modal-footer">
                <button type="button" className="btn-almox-secondary" onClick={() => setShowModal(false)} disabled={saving}>Cancelar</button>
                <button type="submit" className="btn-almox-primary" disabled={saving}>
                  {saving ? 'Registrando...' : 'Registrar devolução'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DevolucoesAlmoxarifado;
