import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiRefreshCw, FiCheckSquare, FiLock, FiUnlock } from 'react-icons/fi';
import { SkeletonTable } from '../SkeletonLoader';
import { useAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';
import './Almoxarifado.css';

/**
 * Fila de inspeções pendentes + bloqueio/desbloqueio avulso de material (Etapa 5, Task 6).
 *
 * Única tela de frontend da etapa. O backend (Tasks 1-5) já resolveu a quarentena de verdade:
 * material crítico entra retido, aprovar/reprovar passam pelo motor com claim atômico, bloqueio
 * exige justificativa. Sem tela, nada disso é alcançável — repete o erro da feature 07 (reservas):
 * backend correto que ninguém usa porque não existe botão.
 *
 * Duas regras do servidor a UI tenta evitar que o usuário esbarre à toa (não reimplementa a
 * lógica de saldo, só evita a viagem de ida e volta com um erro óbvio):
 * - `quantidade_aprovada + quantidade_reprovada` tem de fechar com `quantidade_retida`. Deixar
 *   passar sem fechar manda a diferença para o limbo: sai da fila (o item foi "decidido") mas
 *   fica presa em `quantidade_em_inspecao` para sempre — a reserva zumbi da Etapa 4 em outra
 *   roupa.
 * - Reprovar sem dizer por quê é decisão que ninguém consegue auditar depois. O servidor aceita
 *   `observacoes` vazio (não é obrigatório lá), mas a UI exige quando há reprovado: é o único
 *   registro de por que aquele material foi barrado, e sem ele o "SUBSTITUICAO"/"DEVOLVER" que
 *   a feature 12 vai processar não tem contexto nenhum.
 *
 * Decisão de UX: "quantidade aprovada" nasce = retido e "reprovada" nasce = 0 — aprovar o lote
 * inteiro é o caso comum (recebimento sem defeito). Os dois campos continuam editáveis e a
 * validação de fechamento vale igual, então o inspetor não perde nada ajustando para uma
 * reprovação parcial ou total.
 *
 * `useAlmoxPermissoes`/`bloquearSeNaoPode` seguem o padrão do módulo: botão sempre visível,
 * toast no clique se não pode. O gate real é do servidor (requirePermission) — aqui é só para
 * não abrir formulário que vai morrer em 403.
 */

const ENCAMINHAMENTOS = [
  { value: 'DEVOLVER', label: 'Devolver ao fornecedor' },
  { value: 'ANALISE_ENGENHARIA', label: 'Análise da Engenharia' },
  { value: 'SUBSTITUICAO', label: 'Substituição' },
];

const FLAGS_INSPECAO = [
  { key: 'divergencia_quantidade', label: 'Divergência de quantidade' },
  { key: 'divergencia_dimensional', label: 'Divergência dimensional' },
  { key: 'certificado_ausente', label: 'Certificado ausente' },
  { key: 'dano_fisico', label: 'Dano físico' },
  { key: 'material_incorreto', label: 'Material incorreto' },
];

const FORM_DECISAO_VAZIO = {
  quantidade_aprovada: '', quantidade_reprovada: '', encaminhamento: '', observacoes: '',
  divergencia_quantidade: false, divergencia_dimensional: false, certificado_ausente: false,
  dano_fisico: false, material_incorreto: false,
};

const formatDataHora = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');

// `data_entrada` vem de `recebimentos_material_almoxarifado.created_at`, sempre timestamp
// completo (não a data "meio-dia local" que outras telas do módulo usam para campos DATE puro).
const diasEmEspera = (d) => {
  if (!d) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000));
};

const InspecoesAlmoxarifado = () => {
  const { bloquearSeNaoPode } = useAlmoxPermissoes();

  const [pendentes, setPendentes] = useState([]);
  const [materiais, setMateriais] = useState([]);
  const [loading, setLoading] = useState(true);
  const [materialFilter, setMaterialFilter] = useState('');

  const [decisaoTarget, setDecisaoTarget] = useState(null);
  const [decisaoForm, setDecisaoForm] = useState(FORM_DECISAO_VAZIO);
  const [saving, setSaving] = useState(false);

  const [ajusteTarget, setAjusteTarget] = useState(null); // { tipo: 'BLOQUEAR' | 'DESBLOQUEAR' }
  const [ajusteForm, setAjusteForm] = useState({ material_id: '', quantidade: '', justificativa: '' });
  const [ajusteSaving, setAjusteSaving] = useState(false);

  const loadPendentes = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (materialFilter) params.material_id = materialFilter;
      const res = await api.get('/almoxarifado/inspecoes/pendentes', { params });
      setPendentes(res.data || []);
    } catch {
      toast.error('Erro ao carregar inspeções pendentes');
    } finally {
      setLoading(false);
    }
  }, [materialFilter]);

  const loadMateriais = useCallback(async () => {
    // `/estoque`, não `/materiais`: é quem já traz `quantidade_bloqueada` — o filtro e o modal
    // de bloqueio/desbloqueio precisam do material, não recalculam nada aqui.
    const res = await api.get('/almoxarifado/estoque').catch(() => ({ data: [] }));
    setMateriais(res.data || []);
  }, []);

  useEffect(() => { loadPendentes(); }, [loadPendentes]);
  useEffect(() => { loadMateriais(); }, [loadMateriais]);

  const abrirDecisao = (row) => {
    setDecisaoTarget(row);
    setDecisaoForm({
      ...FORM_DECISAO_VAZIO,
      // Caso comum: aprovar o lote inteiro. Ver nota de UX no cabeçalho do arquivo.
      quantidade_aprovada: String(row.quantidade_retida),
      quantidade_reprovada: '0',
    });
  };

  const reprovadaNum = parseFloat(decisaoForm.quantidade_reprovada) || 0;

  const submitDecisao = async () => {
    const retido = Number(decisaoTarget.quantidade_retida);
    const aprovada = parseFloat(decisaoForm.quantidade_aprovada) || 0;
    const reprovada = parseFloat(decisaoForm.quantidade_reprovada) || 0;

    // Mesmo epsilon do servidor (inspectionService.js): quantidade é REAL, e igualdade estrita
    // travaria aprovação parcial válida de material fracionado com um erro de ponto flutuante.
    if (Math.abs((aprovada + reprovada) - retido) > 1e-6) {
      toast.error(`Aprovado + reprovado (${aprovada + reprovada}) precisa fechar com o retido (${retido})`);
      return;
    }
    if (reprovada > 0 && !decisaoForm.observacoes.trim()) {
      toast.error('Informe uma observação explicando a reprovação');
      return;
    }
    setSaving(true);
    try {
      const payload = { quantidade_aprovada: aprovada, quantidade_reprovada: reprovada };
      if (decisaoForm.observacoes.trim()) payload.observacoes = decisaoForm.observacoes.trim();
      if (reprovada > 0 && decisaoForm.encaminhamento) payload.encaminhamento = decisaoForm.encaminhamento;
      FLAGS_INSPECAO.forEach(({ key }) => { if (decisaoForm[key]) payload[key] = true; });

      await api.post(`/almoxarifado/recebimentos/itens/${decisaoTarget.item_id}/inspecionar`, payload);
      toast.success('Inspeção registrada!');
      setDecisaoTarget(null);
      loadPendentes();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao registrar inspeção');
    } finally {
      setSaving(false);
    }
  };

  const abrirAjuste = (tipo) => {
    setAjusteTarget({ tipo });
    setAjusteForm({ material_id: '', quantidade: '', justificativa: '' });
  };

  const confirmarAjuste = async () => {
    const materialId = ajusteForm.material_id;
    const quantidade = parseFloat(ajusteForm.quantidade);
    if (!materialId || !(quantidade > 0)) {
      toast.error('Selecione o material e informe uma quantidade maior que zero');
      return;
    }
    if (!ajusteForm.justificativa.trim()) {
      toast.error('Justificativa é obrigatória');
      return;
    }
    setAjusteSaving(true);
    try {
      const endpoint = ajusteTarget.tipo === 'BLOQUEAR' ? 'bloquear' : 'desbloquear';
      await api.post(`/almoxarifado/materiais/${materialId}/${endpoint}`, {
        quantidade, justificativa: ajusteForm.justificativa.trim(),
      });
      toast.success(ajusteTarget.tipo === 'BLOQUEAR' ? 'Material bloqueado!' : 'Material desbloqueado!');
      setAjusteTarget(null);
      loadMateriais();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao ajustar o bloqueio do material');
    } finally {
      setAjusteSaving(false);
    }
  };

  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1>Inspeções Pendentes</h1>
          <p>{pendentes.length} inspeç{pendentes.length !== 1 ? 'ões' : 'ão'} pendente{pendentes.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="almox-header-actions">
          <button className="btn-almox-secondary" onClick={loadPendentes}>
            <FiRefreshCw size={13} /> Atualizar
          </button>
          <button className="btn-almox-secondary"
            title="Bloqueia material fora do fluxo de inspeção — ex.: avaria encontrada na prateleira"
            onClick={(e) => { if (!bloquearSeNaoPode('ajustar_estoque', e)) return; abrirAjuste('BLOQUEAR'); }}>
            <FiLock size={13} /> Bloquear Material
          </button>
          <button className="btn-almox-secondary"
            title="Devolve ao disponível uma quantidade bloqueada anteriormente"
            onClick={(e) => { if (!bloquearSeNaoPode('ajustar_estoque', e)) return; abrirAjuste('DESBLOQUEAR'); }}>
            <FiUnlock size={13} /> Desbloquear Material
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="almox-filters">
        <select className="almox-select" value={materialFilter} onChange={(e) => setMaterialFilter(e.target.value)}>
          <option value="">Todos os materiais</option>
          {materiais.map((m) => <option key={m.id} value={m.id}>{m.codigo} — {m.nome}</option>)}
        </select>
        {materialFilter && (
          <button className="btn-almox-secondary" onClick={() => setMaterialFilter('')}>Limpar</button>
        )}
      </div>

      {/* Tabela */}
      <div className="almox-table-container">
        {loading ? <SkeletonTable rows={8} columns={5} /> : pendentes.length === 0 ? (
          <div className="almox-empty"><p>Nenhuma inspeção pendente</p></div>
        ) : (
          <table className="almox-table">
            <thead>
              <tr>
                <th>Material</th>
                <th>Retido</th>
                <th>Recebimento</th>
                <th>Entrada</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {pendentes.map((p) => {
                const dias = diasEmEspera(p.data_entrada);
                return (
                  <tr key={p.item_id}>
                    <td>
                      <div>{p.material_nome}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>{p.material_codigo}</div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontWeight: 700 }}>
                      {p.quantidade_retida} {p.material_unidade}
                    </td>
                    <td>
                      <div>{p.recebimento_numero || `#${p.recebimento_id}`}</div>
                      {p.nota_fiscal && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>NF {p.nota_fiscal}</div>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>
                      <div>{formatDataHora(p.data_entrada)}</div>
                      {dias !== null && <div>{dias === 0 ? 'hoje' : `há ${dias} dia${dias !== 1 ? 's' : ''}`}</div>}
                    </td>
                    <td>
                      <div className="almox-actions">
                        <button className="almox-btn-icon" title="Decidir inspeção (aprovar/reprovar)"
                          onClick={(e) => { if (!bloquearSeNaoPode('inspecionar', e)) return; abrirDecisao(p); }}>
                          <FiCheckSquare />
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

      {/* Modal — decidir inspeção */}
      {decisaoTarget && (
        <div className="almox-modal-overlay" onClick={() => { if (!saving) setDecisaoTarget(null); }}>
          <div className="almox-modal" onClick={(e) => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>Decidir Inspeção</h2>
              <button className="almox-modal-close" onClick={() => setDecisaoTarget(null)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <p style={{ marginTop: 0 }}>
                <strong>{decisaoTarget.material_nome}</strong> ({decisaoTarget.material_codigo}) — retido{' '}
                <strong>{decisaoTarget.quantidade_retida} {decisaoTarget.material_unidade}</strong>
                <br />
                <span style={{ fontSize: '0.82rem', color: 'var(--gmp-text-light)' }}>
                  Recebimento {decisaoTarget.recebimento_numero || `#${decisaoTarget.recebimento_id}`}
                  {decisaoTarget.nota_fiscal ? ` · NF ${decisaoTarget.nota_fiscal}` : ''}
                </span>
              </p>
              <div className="almox-form-grid">
                <div className="almox-field">
                  <label className="almox-label">Quantidade aprovada</label>
                  <input className="almox-input" type="number" min="0" step="any"
                    value={decisaoForm.quantidade_aprovada}
                    onChange={(e) => setDecisaoForm((f) => ({ ...f, quantidade_aprovada: e.target.value }))} />
                </div>
                <div className="almox-field">
                  <label className="almox-label">Quantidade reprovada</label>
                  <input className="almox-input" type="number" min="0" step="any"
                    value={decisaoForm.quantidade_reprovada}
                    onChange={(e) => setDecisaoForm((f) => ({ ...f, quantidade_reprovada: e.target.value }))} />
                </div>
                {reprovadaNum > 0 && (
                  <div className="almox-field">
                    <label className="almox-label">Encaminhamento</label>
                    <select className="almox-form-select" value={decisaoForm.encaminhamento}
                      onChange={(e) => setDecisaoForm((f) => ({ ...f, encaminhamento: e.target.value }))}>
                      <option value="">—</option>
                      {ENCAMINHAMENTOS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                )}
                <div className="almox-field almox-form-full">
                  <label className="almox-label">
                    Observações{reprovadaNum > 0 && <span className="required">*</span>}
                  </label>
                  <textarea className="almox-input" rows={2} value={decisaoForm.observacoes}
                    placeholder={reprovadaNum > 0 ? 'Por que este material foi reprovado?' : 'Opcional'}
                    onChange={(e) => setDecisaoForm((f) => ({ ...f, observacoes: e.target.value }))} />
                </div>
                <div className="almox-field almox-form-full">
                  <label className="almox-label">Problemas identificados</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
                    {FLAGS_INSPECAO.map(({ key, label }) => (
                      <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400, fontSize: '0.85rem' }}>
                        <input type="checkbox" checked={decisaoForm[key]}
                          onChange={(e) => setDecisaoForm((f) => ({ ...f, [key]: e.target.checked }))} />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setDecisaoTarget(null)}>Cancelar</button>
              <button className="btn-almox-primary" disabled={saving} onClick={submitDecisao}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — bloqueio/desbloqueio avulso */}
      {ajusteTarget && (
        <div className="almox-modal-overlay" onClick={() => { if (!ajusteSaving) setAjusteTarget(null); }}>
          <div className="almox-modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>{ajusteTarget.tipo === 'BLOQUEAR' ? 'Bloquear material' : 'Desbloquear material'}</h2>
              <button className="almox-modal-close" onClick={() => setAjusteTarget(null)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <p style={{ marginTop: 0, fontSize: '0.82rem', color: 'var(--gmp-text-light)' }}>
                {ajusteTarget.tipo === 'BLOQUEAR'
                  ? 'Tira material do disponível sem passar por inspeção ou requisição — ex.: avaria encontrada na prateleira.'
                  : 'Devolve ao disponível uma quantidade bloqueada anteriormente.'}
              </p>
              <div className="almox-field">
                <label className="almox-label">Material<span className="required">*</span></label>
                <select className="almox-form-select" value={ajusteForm.material_id}
                  onChange={(e) => setAjusteForm((f) => ({ ...f, material_id: e.target.value }))}>
                  <option value="">Selecionar material...</option>
                  {materiais.map((m) => <option key={m.id} value={m.id}>{m.codigo} — {m.nome}</option>)}
                </select>
              </div>
              <div className="almox-field">
                <label className="almox-label">Quantidade<span className="required">*</span></label>
                <input className="almox-input" type="number" min="0" step="any"
                  value={ajusteForm.quantidade}
                  onChange={(e) => setAjusteForm((f) => ({ ...f, quantidade: e.target.value }))} />
              </div>
              <div className="almox-field">
                <label className="almox-label">Justificativa<span className="required">*</span></label>
                <textarea className="almox-input" rows={2} value={ajusteForm.justificativa}
                  placeholder={ajusteTarget.tipo === 'BLOQUEAR' ? 'Por que este material está sendo bloqueado?' : 'Por que este material está sendo desbloqueado?'}
                  onChange={(e) => setAjusteForm((f) => ({ ...f, justificativa: e.target.value }))} />
              </div>
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setAjusteTarget(null)}>Cancelar</button>
              <button className="btn-almox-primary" disabled={ajusteSaving} onClick={confirmarAjuste}>
                {ajusteSaving ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InspecoesAlmoxarifado;
