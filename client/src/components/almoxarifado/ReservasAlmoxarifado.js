import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiPlus, FiRefreshCw, FiUnlock, FiShuffle, FiClock } from 'react-icons/fi';
import { SkeletonTable } from '../SkeletonLoader';
import ExtratoMaterialModal from './ExtratoMaterialModal';
import { useAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';
import './Almoxarifado.css';

/**
 * Tela de reservas (feature 07, Etapa 4 — Task 4 do plano).
 *
 * Reservar é segurar saldo: `quantidade_reservada` sobe no material e sai do disponível.
 * O que a tela precisa deixar óbvio, e por quê:
 *
 * - `saldo` (quantidade − utilizada), não só `quantidade`. Reserva parcialmente consumida é o
 *   caso NORMAL depois que a entrega de requisição passou a baixar contra a reserva. Mostrar
 *   só a quantidade original faria uma reserva já consumida pela metade parecer que ainda
 *   segura o dobro do que segura.
 * - `origem`. Reserva REQUISICAO tem dono — a requisição que a criou na aprovação. Liberar à
 *   mão devolve o saldo ao bolo geral e a entrega daquela requisição volta a disputar estoque
 *   com todo mundo, que é exatamente a corrida que a Etapa 4 fechou. Daí o aviso no modal.
 * - EXPIRADA ≠ LIBERADA. Ambas devolveram o saldo, mas a primeira venceu sozinha (job) e a
 *   segunda alguém soltou. Cores diferentes de propósito: expiração em massa é sintoma de
 *   prazo mal configurado, e some se as duas virarem a mesma coisa na tela.
 *
 * Permissões seguem o padrão do módulo: botão sempre visível, `bloquearSeNaoPode` no clique.
 * O gate real é do servidor (requirePermission) — aqui é só para não abrir formulário que vai
 * morrer em 403.
 */

const STATUS = [
  { value: 'ATIVA', label: 'Ativa', cls: 'aberto' },
  { value: 'CONSUMIDA', label: 'Consumida', cls: 'concluido' },
  { value: 'LIBERADA', label: 'Liberada', cls: 'cancelado' },
  { value: 'EXPIRADA', label: 'Expirada', cls: 'critico' },
];

const statusInfo = (s) => STATUS.find((x) => x.value === s) || { label: s || '—', cls: 'ajuste' };

const FORM_VAZIO = {
  material_id: '', quantidade: '', projeto_id: '', os_id: '', os_referencia: '',
  cliente_id: '', equipamento: '', submontagem: '', data_necessidade: '', expira_em: '',
  observacoes: '',
};

const hoje = () => new Date().toISOString().slice(0, 10);

const ReservasAlmoxarifado = () => {
  const { pode, bloquearSeNaoPode } = useAlmoxPermissoes();

  const [reservas, setReservas] = useState([]);
  const [materiais, setMateriais] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [ordensServico, setOrdensServico] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState('ATIVA');
  const [materialFilter, setMaterialFilter] = useState('');
  const [projetoFilter, setProjetoFilter] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);
  const [saving, setSaving] = useState(false);

  const [liberarTarget, setLiberarTarget] = useState(null);
  const [liberarQtd, setLiberarQtd] = useState('');
  const [liberarMotivo, setLiberarMotivo] = useState('');

  const [transferirTarget, setTransferirTarget] = useState(null);
  const [transferirDestino, setTransferirDestino] = useState({ projeto_id: '', os_id: '', os_referencia: '', cliente_id: '', motivo: '' });

  const [acaoSaving, setAcaoSaving] = useState(false);
  const [extratoMaterialId, setExtratoMaterialId] = useState(null);

  const loadReservas = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (materialFilter) params.material_id = materialFilter;
      if (projetoFilter) params.projeto_id = projetoFilter;
      const res = await api.get('/almoxarifado/reservas', { params });
      setReservas(res.data || []);
    } catch {
      toast.error('Erro ao carregar reservas');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, materialFilter, projetoFilter]);

  useEffect(() => {
    (async () => {
      // `/estoque` e não `/materiais`: só ele traz `quantidade_disponivel` calculado pelo
      // servidor (físico − reservado − bloqueado − em inspeção). `/materiais` devolve o
      // físico, e mostrar físico como "disponível" numa tela de RESERVA é o pior lugar
      // possível para esse erro — ofereceria 100 quando 80 já estão reservados. Recalcular a
      // fórmula aqui criaria uma segunda fonte de verdade que divergiria na primeira mudança.
      const [mat, proj, os, cli] = await Promise.all([
        api.get('/almoxarifado/estoque').catch(() => ({ data: [] })),
        api.get('/projetos').catch(() => ({ data: [] })),
        api.get('/almoxarifado/aux/ordens-servico').catch(() => ({ data: [] })),
        api.get('/clientes').catch(() => ({ data: [] })),
      ]);
      setMateriais(mat.data || []);
      setProjetos(proj.data || []);
      setOrdensServico(os.data || []);
      setClientes(cli.data || []);
    })();
  }, []);

  useEffect(() => { loadReservas(); }, [loadReservas]);

  const nomeProjeto = (id) => projetos.find((p) => p.id === id)?.nome || (id ? `Projeto #${id}` : null);
  const nomeCliente = (id) => clientes.find((c) => c.id === id)?.nome || (id ? `Cliente #${id}` : null);

  // Destino da reserva na ordem OS > projeto > cliente, a mesma prioridade que o resto do
  // módulo usa para vínculo (ver vinculoLabel em MovimentacoesAlmoxarifado).
  const destinoLabel = (r) => {
    if (r.os_id) return `OS #${r.os_id}`;
    if (r.os_referencia) return `OS ${r.os_referencia}`;
    if (r.projeto_id) return nomeProjeto(r.projeto_id);
    if (r.cliente_id) return nomeCliente(r.cliente_id);
    return null;
  };

  const formatData = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : null);

  const abrirForm = () => { setForm(FORM_VAZIO); setShowForm(true); };

  const submitReserva = async (e) => {
    e.preventDefault();
    const qtd = parseFloat(form.quantidade);
    if (!form.material_id || !(qtd > 0)) {
      toast.error('Selecione o material e informe uma quantidade maior que zero');
      return;
    }
    setSaving(true);
    try {
      // Só envia o que foi preenchido: id vazio viraria 0/NaN no body e o servidor gravaria
      // um vínculo que não existe.
      const payload = { material_id: Number(form.material_id), quantidade: qtd };
      ['projeto_id', 'os_id', 'cliente_id'].forEach((k) => { if (form[k]) payload[k] = Number(form[k]); });
      ['os_referencia', 'equipamento', 'submontagem', 'observacoes', 'data_necessidade', 'expira_em']
        .forEach((k) => { if (form[k]) payload[k] = form[k]; });

      await api.post('/almoxarifado/reservas', payload);
      toast.success('Reserva criada!');
      setShowForm(false);
      loadReservas();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao criar reserva');
    } finally {
      setSaving(false);
    }
  };

  const abrirLiberar = (r) => {
    setLiberarTarget(r);
    setLiberarQtd('');          // vazio = libera o saldo inteiro
    setLiberarMotivo('');
  };

  const confirmarLiberar = async () => {
    if (!liberarMotivo.trim()) {
      toast.error('Informe o motivo da liberação');
      return;
    }
    const saldo = Number(liberarTarget.saldo ?? 0);
    const parcial = liberarQtd === '' ? null : parseFloat(liberarQtd);
    if (parcial !== null && !(parcial > 0 && parcial <= saldo)) {
      toast.error(`Quantidade deve ficar entre 0 e ${saldo}`);
      return;
    }
    setAcaoSaving(true);
    try {
      const body = { motivo: liberarMotivo.trim() };
      if (parcial !== null) body.quantidade = parcial;
      await api.post(`/almoxarifado/reservas/${liberarTarget.id}/liberar`, body);
      toast.success(parcial !== null ? 'Parte da reserva liberada!' : 'Reserva liberada!');
      setLiberarTarget(null);
      loadReservas();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao liberar reserva');
    } finally {
      setAcaoSaving(false);
    }
  };

  const abrirTransferir = (r) => {
    setTransferirTarget(r);
    setTransferirDestino({
      projeto_id: r.projeto_id || '', os_id: r.os_id || '',
      os_referencia: r.os_referencia || '', cliente_id: r.cliente_id || '', motivo: '',
    });
  };

  const confirmarTransferir = async () => {
    const d = transferirDestino;
    if (!d.projeto_id && !d.os_id && !d.os_referencia && !d.cliente_id) {
      toast.error('Informe ao menos um destino: projeto, OS ou cliente');
      return;
    }
    setAcaoSaving(true);
    try {
      // Manda os quatro campos sempre: o servidor trata `undefined` como "manter" e string
      // vazia como "limpar". Enviar só o preenchido deixaria o dono antigo grudado — trocar
      // de projeto para OS manteria o projeto anterior junto.
      const body = {
        projeto_id: d.projeto_id ? Number(d.projeto_id) : '',
        os_id: d.os_id ? Number(d.os_id) : '',
        os_referencia: d.os_referencia || '',
        cliente_id: d.cliente_id ? Number(d.cliente_id) : '',
      };
      if (d.motivo.trim()) body.motivo = d.motivo.trim();
      await api.put(`/almoxarifado/reservas/${transferirTarget.id}/transferir`, body);
      toast.success('Reserva transferida!');
      setTransferirTarget(null);
      loadReservas();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao transferir reserva');
    } finally {
      setAcaoSaving(false);
    }
  };

  // Job de expiração. Fica aqui porque é a única tela que mostra o efeito dele; o gate é
  // `configurar` (só ADMINISTRADOR), o mesmo do servidor.
  const processarExpiracao = async () => {
    setAcaoSaving(true);
    try {
      const res = await api.post('/almoxarifado/reservas/processar-expiracao', {});
      const n = res.data?.processadas ?? 0;
      const erros = res.data?.erros?.length ?? 0;
      toast.success(n > 0 ? `${n} reserva(s) expirada(s) e devolvida(s) ao disponível` : 'Nenhuma reserva vencida');
      // O job não aborta o lote quando uma reserva falha — se a tela engolisse `erros`, o
      // saldo preso por ela ficaria invisível justamente para quem rodou o job.
      if (erros > 0) toast.warn(`${erros} reserva(s) não puderam ser expiradas — ver log do servidor`);
      loadReservas();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao processar expiração');
    } finally {
      setAcaoSaving(false);
    }
  };

  const materialSelecionado = materiais.find((m) => m.id === parseInt(form.material_id, 10));
  const filtroAtivo = statusFilter !== 'ATIVA' || materialFilter || projetoFilter;

  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1>Reservas de Estoque</h1>
          <p>{reservas.length} reserva{reservas.length !== 1 ? 's' : ''}{statusFilter ? ` · ${statusInfo(statusFilter).label.toLowerCase()}` : ''}</p>
        </div>
        <div className="almox-header-actions">
          <button className="btn-almox-secondary" onClick={loadReservas}>
            <FiRefreshCw size={13} /> Atualizar
          </button>
          {pode('configurar') && (
            <button className="btn-almox-secondary" disabled={acaoSaving}
              title="Libera as reservas cujo prazo venceu, devolvendo o saldo ao disponível"
              onClick={processarExpiracao}>
              <FiClock size={13} /> Processar expiração
            </button>
          )}
          <button className="btn-almox-primary"
            title="Segura saldo de um material para um projeto/OS — sai do disponível sem sair do estoque físico"
            onClick={(e) => { if (!bloquearSeNaoPode('reservar', e)) return; abrirForm(); }}>
            <FiPlus size={14} /> Nova Reserva
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="almox-filters">
        <select className="almox-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Todos os status</option>
          {STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select className="almox-select" value={materialFilter} onChange={(e) => setMaterialFilter(e.target.value)}>
          <option value="">Todos os materiais</option>
          {materiais.map((m) => <option key={m.id} value={m.id}>{m.codigo} — {m.nome}</option>)}
        </select>
        <select className="almox-select" value={projetoFilter} onChange={(e) => setProjetoFilter(e.target.value)}>
          <option value="">Todos os projetos</option>
          {projetos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        {filtroAtivo && (
          <button className="btn-almox-secondary"
            onClick={() => { setStatusFilter('ATIVA'); setMaterialFilter(''); setProjetoFilter(''); }}>
            Limpar
          </button>
        )}
      </div>

      {/* Tabela */}
      <div className="almox-table-container">
        {loading ? <SkeletonTable rows={8} columns={8} /> : reservas.length === 0 ? (
          <div className="almox-empty"><p>Nenhuma reserva encontrada</p></div>
        ) : (
          <table className="almox-table">
            <thead>
              <tr>
                <th>Material</th>
                <th>Reservado</th>
                <th>Consumido</th>
                <th>Saldo</th>
                <th>Status</th>
                <th>Origem / Destino</th>
                <th>Solicitante</th>
                <th>Prazos</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {reservas.map((r) => {
                const s = statusInfo(r.status);
                const destino = destinoLabel(r);
                const un = r.material_unidade || '';
                const saldo = Number(r.saldo ?? 0);
                const usada = Number(r.quantidade_utilizada || 0);
                const ativa = r.status === 'ATIVA';
                const daRequisicao = r.origem === 'REQUISICAO';
                // Vencida só importa enquanto a reserva ainda segura saldo: depois de
                // CONSUMIDA/LIBERADA a data virou histórico e o job não age mais sobre ela.
                const vencida = ativa && r.expira_em && String(r.expira_em).slice(0, 10) < hoje();
                return (
                  <tr key={r.id}>
                    <td>
                      <button type="button" className="almox-link-btn" onClick={() => setExtratoMaterialId(r.material_id)}>
                        {r.material_nome}
                      </button>
                      <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>{r.material_codigo}</div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.quantidade} {un}</td>
                    <td style={{ whiteSpace: 'nowrap', color: usada > 0 ? 'var(--gmp-text)' : 'var(--gmp-text-light)' }}>
                      {usada} {un}
                    </td>
                    <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{saldo} {un}</td>
                    <td>
                      <span className={`almox-badge almox-badge-${s.cls}`}>{s.label}</span>
                      {vencida && (
                        <span className="almox-badge almox-badge-baixo" style={{ marginLeft: 6, marginTop: 4 }}>
                          VENCIDA
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`almox-badge almox-badge-${daRequisicao ? 'ajuste' : 'vazio'}`}>
                        {daRequisicao ? `REQ #${r.requisicao_id ?? '—'}` : 'MANUAL'}
                      </span>
                      <div style={{ fontSize: '0.8rem', marginTop: 4 }}>
                        {destino || <span style={{ color: 'var(--gmp-text-light)' }}>—</span>}
                      </div>
                      {(r.equipamento || r.submontagem) && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>
                          {[r.equipamento, r.submontagem].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>{r.solicitante_nome || '—'}</td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--gmp-text-light)', whiteSpace: 'nowrap' }}>
                      {r.data_necessidade && <div>Necessidade: {formatData(r.data_necessidade)}</div>}
                      {r.expira_em
                        ? <div style={{ color: vencida ? 'var(--gmp-error)' : undefined }}>Expira: {formatData(r.expira_em)}</div>
                        : <div>Sem prazo</div>}
                      {r.status === 'LIBERADA' && r.motivo_liberacao && (
                        <div title={r.motivo_liberacao} style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          Motivo: {r.motivo_liberacao}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="almox-actions">
                        {ativa && saldo > 0 ? (
                          <>
                            <button className="almox-btn-icon" title="Liberar (devolve o saldo ao disponível)"
                              onClick={(e) => { if (!bloquearSeNaoPode('reservar', e)) return; abrirLiberar(r); }}>
                              <FiUnlock />
                            </button>
                            <button className="almox-btn-icon" title="Transferir para outro projeto/OS (não move saldo)"
                              onClick={(e) => { if (!bloquearSeNaoPode('reservar_outra_os', e)) return; abrirTransferir(r); }}>
                              <FiShuffle />
                            </button>
                          </>
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

      {/* Modal — nova reserva */}
      {showForm && (
        <div className="almox-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="almox-modal" onClick={(e) => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>🔒 Nova Reserva</h2>
              <button className="almox-modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <form onSubmit={submitReserva}>
              <div className="almox-modal-body">
                <div className="almox-form-grid">
                  <div className="almox-field almox-form-full">
                    <label className="almox-label">Material<span className="required">*</span></label>
                    <select className="almox-form-select" value={form.material_id} required
                      onChange={(e) => setForm((f) => ({ ...f, material_id: e.target.value }))}>
                      <option value="">Selecionar material...</option>
                      {materiais.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.codigo} — {m.nome} (Disponível: {m.quantidade_disponivel} {m.unidade})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Quantidade<span className="required">*</span></label>
                    <input className="almox-input" type="number" min="0" step="any" required
                      value={form.quantidade}
                      onChange={(e) => setForm((f) => ({ ...f, quantidade: e.target.value }))} />
                    {materialSelecionado && (
                      <small style={{ color: 'var(--gmp-text-light)' }}>
                        Disponível: {materialSelecionado.quantidade_disponivel} {materialSelecionado.unidade}
                      </small>
                    )}
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Projeto</label>
                    <select className="almox-form-select" value={form.projeto_id}
                      onChange={(e) => setForm((f) => ({ ...f, projeto_id: e.target.value }))}>
                      <option value="">—</option>
                      {projetos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Ordem de Serviço</label>
                    <select className="almox-form-select" value={form.os_id}
                      onChange={(e) => setForm((f) => ({ ...f, os_id: e.target.value }))}>
                      <option value="">—</option>
                      {ordensServico.map((o) => (
                        <option key={o.id} value={o.id}>{o.numero || o.codigo || `OS #${o.id}`}</option>
                      ))}
                    </select>
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Cliente</label>
                    <select className="almox-form-select" value={form.cliente_id}
                      onChange={(e) => setForm((f) => ({ ...f, cliente_id: e.target.value }))}>
                      <option value="">—</option>
                      {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Equipamento</label>
                    <input className="almox-input" value={form.equipamento}
                      onChange={(e) => setForm((f) => ({ ...f, equipamento: e.target.value }))} />
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Submontagem</label>
                    <input className="almox-input" value={form.submontagem}
                      onChange={(e) => setForm((f) => ({ ...f, submontagem: e.target.value }))} />
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Data de necessidade</label>
                    <input className="almox-input" type="date" value={form.data_necessidade}
                      onChange={(e) => setForm((f) => ({ ...f, data_necessidade: e.target.value }))} />
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Expira em</label>
                    <input className="almox-input" type="date" value={form.expira_em}
                      onChange={(e) => setForm((f) => ({ ...f, expira_em: e.target.value }))} />
                    <small style={{ color: 'var(--gmp-text-light)' }}>
                      Em branco: usa a configuração de validade, se houver; sem ela a reserva não expira.
                    </small>
                  </div>
                  <div className="almox-field almox-form-full">
                    <label className="almox-label">Observações</label>
                    <textarea className="almox-input" rows={2} value={form.observacoes}
                      onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
                  </div>
                </div>
              </div>
              <div className="almox-modal-footer">
                <button type="button" className="btn-almox-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
                <button type="submit" className="btn-almox-primary" disabled={saving}>
                  {saving ? 'Reservando...' : 'Reservar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal — liberar */}
      {liberarTarget && (
        <div className="almox-modal-overlay" onClick={() => setLiberarTarget(null)}>
          <div className="almox-modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>Liberar reserva</h2>
              <button className="almox-modal-close" onClick={() => setLiberarTarget(null)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <p style={{ marginTop: 0 }}>
                <strong>{liberarTarget.material_nome}</strong> — saldo reservado{' '}
                <strong>{liberarTarget.saldo} {liberarTarget.material_unidade}</strong>
              </p>
              {liberarTarget.origem === 'REQUISICAO' && (
                <div className="almox-badge almox-badge-baixo" style={{ display: 'block', padding: '8px 10px', marginBottom: 12, lineHeight: 1.4 }}>
                  Esta reserva pertence à requisição #{liberarTarget.requisicao_id ?? '—'}. Liberar
                  devolve o saldo ao disponível geral e a entrega dessa requisição volta a disputar
                  estoque com as demais.
                </div>
              )}
              <div className="almox-field">
                <label className="almox-label">Quantidade a liberar</label>
                <input className="almox-input" type="number" min="0" step="any"
                  placeholder={`Tudo (${liberarTarget.saldo})`}
                  value={liberarQtd} onChange={(e) => setLiberarQtd(e.target.value)} />
                <small style={{ color: 'var(--gmp-text-light)' }}>Em branco libera o saldo inteiro.</small>
              </div>
              <div className="almox-field">
                <label className="almox-label">Motivo<span className="required">*</span></label>
                <textarea className="almox-input" rows={2} value={liberarMotivo}
                  onChange={(e) => setLiberarMotivo(e.target.value)}
                  placeholder="Por que esta reserva está sendo liberada?" />
              </div>
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setLiberarTarget(null)}>Cancelar</button>
              <button className="btn-almox-primary" disabled={acaoSaving} onClick={confirmarLiberar}>
                {acaoSaving ? 'Liberando...' : 'Liberar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — transferir */}
      {transferirTarget && (
        <div className="almox-modal-overlay" onClick={() => setTransferirTarget(null)}>
          <div className="almox-modal" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>Transferir reserva</h2>
              <button className="almox-modal-close" onClick={() => setTransferirTarget(null)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <p style={{ marginTop: 0 }}>
                <strong>{transferirTarget.material_nome}</strong> — {transferirTarget.saldo} {transferirTarget.material_unidade}
                {' '}atualmente em <strong>{destinoLabel(transferirTarget) || 'sem destino'}</strong>.
              </p>
              <p style={{ fontSize: '0.82rem', color: 'var(--gmp-text-light)', marginTop: 0 }}>
                Troca o dono da reserva. Nenhum saldo se move — o material continua reservado,
                só passa a responder por outro projeto/OS.
              </p>
              <div className="almox-form-grid">
                <div className="almox-field">
                  <label className="almox-label">Projeto</label>
                  <select className="almox-form-select" value={transferirDestino.projeto_id}
                    onChange={(e) => setTransferirDestino((d) => ({ ...d, projeto_id: e.target.value }))}>
                    <option value="">—</option>
                    {projetos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </div>
                <div className="almox-field">
                  <label className="almox-label">Ordem de Serviço</label>
                  <select className="almox-form-select" value={transferirDestino.os_id}
                    onChange={(e) => setTransferirDestino((d) => ({ ...d, os_id: e.target.value }))}>
                    <option value="">—</option>
                    {ordensServico.map((o) => (
                      <option key={o.id} value={o.id}>{o.numero || o.codigo || `OS #${o.id}`}</option>
                    ))}
                  </select>
                </div>
                <div className="almox-field">
                  <label className="almox-label">Referência de OS (texto)</label>
                  <input className="almox-input" value={transferirDestino.os_referencia}
                    onChange={(e) => setTransferirDestino((d) => ({ ...d, os_referencia: e.target.value }))} />
                </div>
                <div className="almox-field">
                  <label className="almox-label">Cliente</label>
                  <select className="almox-form-select" value={transferirDestino.cliente_id}
                    onChange={(e) => setTransferirDestino((d) => ({ ...d, cliente_id: e.target.value }))}>
                    <option value="">—</option>
                    {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <div className="almox-field almox-form-full">
                  <label className="almox-label">Motivo</label>
                  <input className="almox-input" value={transferirDestino.motivo}
                    onChange={(e) => setTransferirDestino((d) => ({ ...d, motivo: e.target.value }))}
                    placeholder="Fica registrado na auditoria da reserva" />
                </div>
              </div>
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setTransferirTarget(null)}>Cancelar</button>
              <button className="btn-almox-primary" disabled={acaoSaving} onClick={confirmarTransferir}>
                {acaoSaving ? 'Transferindo...' : 'Transferir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {extratoMaterialId && (
        <ExtratoMaterialModal materialId={extratoMaterialId} onClose={() => setExtratoMaterialId(null)} />
      )}
    </div>
  );
};

export default ReservasAlmoxarifado;
