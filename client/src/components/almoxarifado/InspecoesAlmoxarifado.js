import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiRefreshCw, FiCheckSquare, FiLock, FiUnlock } from 'react-icons/fi';
import { SkeletonTable } from '../SkeletonLoader';
import { useAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';
import HistoricoInspecoes from './HistoricoInspecoes';
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

/*
 * Etapa 29 — faixa de tolerância exibida no modal.
 *
 * A tela SÓ SOMA para mostrar a faixa; a comparação (conforme/não conforme) é do servidor, que
 * tem o epsilon e a régua congelada no ato (Etapa 27). Os desvios do plano são COM SINAL:
 * `inf = nominal + desvio_inferior`, `sup = nominal + desvio_superior`. Um plano unilateral
 * (+0.005/+0.021) tem a faixa inteira ACIMA do nominal — `nominal − |inf|` mostraria 9.995 e o
 * operador mediria contra uma faixa que não existe.
 *
 * A formatação usa o número de casas do próprio plano (o maior entre nominal e desvios), senão
 * `12.3 + 0.1` vira `12.399999999999999` na tela.
 */
const casasDecimais = (v) => {
  const s = String(v ?? '');
  const ponto = s.indexOf('.');
  return ponto < 0 ? 0 : s.length - ponto - 1;
};

const faixaDoPlano = (p) => {
  const nominal = Number(p.valor_nominal);
  const casas = Math.max(
    casasDecimais(p.valor_nominal), casasDecimais(p.desvio_inferior), casasDecimais(p.desvio_superior));
  const inf = (nominal + Number(p.desvio_inferior)).toFixed(casas);
  const sup = (nominal + Number(p.desvio_superior)).toFixed(casas);
  return `[${inf} ; ${sup}]`;
};

const TEXTO_DIVERGENCIA_DERIVADA = 'Derivada das medidas ao salvar — fora da tolerância liga sozinha';
const TEXTO_AJUDA_MEDIDAS = 'Com medidas preenchidas, a divergência dimensional é calculada só pelas '
  + 'características do plano. Divergência em algo que o plano não mede vai em Observações.';

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
  // Etapa 29 (C4): 'pendentes' (a fila de sempre) | 'historico' (HistoricoInspecoes). A aba
  // Histórico entra NO LUGAR da tabela de pendentes, nunca junto — os testes desta tela
  // selecionam `.almox-table tbody tr` sem discriminar, e duas tabelas quebrariam o índice.
  const [aba, setAba] = useState('pendentes');

  const [decisaoTarget, setDecisaoTarget] = useState(null);
  const [decisaoForm, setDecisaoForm] = useState(FORM_DECISAO_VAZIO);
  const [saving, setSaving] = useState(false);

  // Etapa 29 — plano do material do modal aberto, instrumentos e o que foi digitado por
  // característica: `{ [plano_id]: { valor, ferramenta_id } }`. `valor` fica STRING até o
  // servidor: parseFloat transformaria '12,4' em 12 em silêncio (Global Constraint 5).
  const [planoMedidas, setPlanoMedidas] = useState([]);
  const [ferramentas, setFerramentas] = useState([]);
  const [medidas, setMedidas] = useState({});
  // Cada abertura do modal invalida a carga anterior: fechar o item A e abrir o B antes de o
  // plano de A chegar não pode deixar o plano de A dentro do modal de B.
  const aberturaRef = useRef(0);

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

  const carregarPlanoDoModal = async (materialId, abertura) => {
    let plano;
    try {
      const res = await api.get('/almoxarifado/planos-inspecao', { params: { material_id: materialId } });
      plano = res.data || [];
    } catch {
      // RN-08: falha de rede NÃO vira "material sem plano" em silêncio — o inspetor decidiria
      // sem medir achando que não havia o que medir.
      toast.warn('Não foi possível carregar o plano de inspeção');
      return;
    }
    if (abertura !== aberturaRef.current) return;
    setPlanoMedidas(plano);
    if (plano.length === 0) return;
    // Instrumentos só interessam se há o que medir (D4).
    try {
      const fer = await api.get('/almoxarifado/ferramentas');
      if (abertura === aberturaRef.current) setFerramentas(fer.data || []);
    } catch {
      toast.warn('Não foi possível carregar os instrumentos');
    }
  };

  const abrirDecisao = (row) => {
    aberturaRef.current += 1;
    setDecisaoTarget(row);
    setDecisaoForm({
      ...FORM_DECISAO_VAZIO,
      // Caso comum: aprovar o lote inteiro. Ver nota de UX no cabeçalho do arquivo.
      quantidade_aprovada: String(row.quantidade_retida),
      quantidade_reprovada: '0',
    });
    setPlanoMedidas([]);
    setFerramentas([]);
    setMedidas({});
    carregarPlanoDoModal(row.material_id, aberturaRef.current);
  };

  const setMedida = (planoId, patch) => setMedidas((m) => ({
    ...m, [planoId]: { valor: '', ferramenta_id: '', ...m[planoId], ...patch },
  }));

  // Só a linha com valor preenchido conta (D3): instrumento escolhido sem valor é ignorado.
  const linhasMedidasPreenchidas = () => planoMedidas
    .map((p) => ({ plano: p, m: medidas[p.id] }))
    .filter(({ m }) => m && m.valor.trim() !== '')
    .map(({ plano, m }) => {
      const linha = { plano_id: plano.id, valor_medido: m.valor };
      if (m.ferramenta_id) linha.ferramenta_id = Number(m.ferramenta_id);
      return linha;
    });

  // B60/RN-02: com qualquer medida preenchida, a divergência dimensional é do servidor.
  const temMedidas = linhasMedidasPreenchidas().length > 0;

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
      const linhasMedidas = linhasMedidasPreenchidas();
      FLAGS_INSPECAO.forEach(({ key }) => {
        // Com medidas, a flag manual de divergência dimensional NÃO vai: o servidor deriva das
        // medidas, e mandar `true` junto ligaria a divergência mesmo com tudo dentro da faixa.
        if (linhasMedidas.length > 0 && key === 'divergencia_dimensional') return;
        if (decisaoForm[key]) payload[key] = true;
      });
      // A chave só entra se houver linha (achado 12): `medidas: []` é outra coisa para o servidor.
      if (linhasMedidas.length > 0) payload.medidas = linhasMedidas;

      const res = await api.post(`/almoxarifado/recebimentos/itens/${decisaoTarget.item_id}/inspecionar`, payload);
      const registradas = res.data?.medidas_registradas;
      if (registradas > 0) {
        // RN-07: o resultado da régua vem do servidor — a tela não pré-calcula (D2).
        toast.success(`Inspeção registrada! Divergência dimensional: ${res.data.divergencia_dimensional ? 'sim' : 'não'} `
          + `(${registradas} medida${registradas !== 1 ? 's' : ''})`);
      } else {
        toast.success('Inspeção registrada!');
      }
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
          <h1>Inspeções</h1>
          <p>
            {aba === 'historico'
              ? 'Inspeções decididas e as medidas registradas em cada uma'
              : `${pendentes.length} inspeç${pendentes.length !== 1 ? 'ões' : 'ão'} pendente${pendentes.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="almox-header-actions">
          {aba === 'pendentes' && (
            <button className="btn-almox-secondary" onClick={loadPendentes}>
              <FiRefreshCw size={13} /> Atualizar
            </button>
          )}
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

      {/* Abas — molde de LotesAlmoxarifado.js/FerramentasAlmoxarifado.js: botões primary/secondary
          alternando, sem CSS novo. O filtro de material abaixo vale para as duas. */}
      <div className="almox-abas" style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
        <button className={aba === 'pendentes' ? 'btn-almox-primary' : 'btn-almox-secondary'} onClick={() => setAba('pendentes')}>Pendentes</button>
        <button className={aba === 'historico' ? 'btn-almox-primary' : 'btn-almox-secondary'} onClick={() => setAba('historico')}>Histórico</button>
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

      {/* Aba Histórico — no lugar da tabela de pendentes (C4). */}
      {aba === 'historico' && <HistoricoInspecoes materialFilter={materialFilter} />}

      {/* Tabela — Pendentes */}
      {aba === 'pendentes' && (
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
      )}

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
                    {FLAGS_INSPECAO.map(({ key, label }) => {
                      // RN-02: `checked={false}` de propósito, não o estado — o estado fica
                      // guardado para a caixa voltar como estava se o inspetor limpar as medidas.
                      const derivada = key === 'divergencia_dimensional' && temMedidas;
                      return (
                        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400, fontSize: '0.85rem' }}>
                          <input type="checkbox" checked={derivada ? false : decisaoForm[key]} disabled={derivada}
                            onChange={(e) => setDecisaoForm((f) => ({ ...f, [key]: e.target.checked }))} />
                          {label}
                          {derivada && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>
                              — {TEXTO_DIVERGENCIA_DERIVADA}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
                {planoMedidas.length > 0 && (
                  <div className="almox-field almox-form-full almox-medidas-plano">
                    <label className="almox-label">Medidas do plano</label>
                    {planoMedidas.map((p) => {
                      const m = medidas[p.id] || { valor: '', ferramenta_id: '' };
                      return (
                        <div key={p.id} className="almox-medida-linha"
                          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', marginBottom: 8 }}>
                          <label style={{ gridColumn: '1 / -1', fontWeight: 400, fontSize: '0.85rem' }}>
                            {p.caracteristica} ({p.unidade}) — nominal {p.valor_nominal} · faixa {faixaDoPlano(p)}
                          </label>
                          <input className="almox-input" type="text" inputMode="decimal"
                            placeholder="ex.: 12.40 (ponto decimal)" value={m.valor}
                            onChange={(e) => setMedida(p.id, { valor: e.target.value })} />
                          <select className="almox-form-select" value={m.ferramenta_id}
                            onChange={(e) => setMedida(p.id, { ferramenta_id: e.target.value })}>
                            <option value="">— sem instrumento —</option>
                            {ferramentas.map((f) => {
                              // D4: vencida aparece, mas desabilitada — o servidor recusaria de
                              // qualquer jeito; `null` (não exige calibração) aparece normal.
                              const vencida = f.calibracao_vigente === false;
                              return (
                                <option key={f.id} value={f.id} disabled={vencida}>
                                  {f.nome}{f.codigo_patrimonio ? ` (${f.codigo_patrimonio})` : ''}{vencida ? ' (calibração vencida)' : ''}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      );
                    })}
                    <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--gmp-text-light)' }}>
                      {TEXTO_AJUDA_MEDIDAS}
                    </p>
                  </div>
                )}
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
