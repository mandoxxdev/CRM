import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { SkeletonTable } from '../SkeletonLoader';
import AlmoxPageHeader from './AlmoxPageHeader';
import {
  FiPlus, FiRefreshCw, FiPackage, FiCheck, FiTruck, FiSearch, FiX,
  FiArrowRight, FiFileText, FiDollarSign,
} from 'react-icons/fi';
import './Almoxarifado.css';

const STATUS_INFO = {
  RECEBIDO: { label: 'Recebido — Almoxarifado', cls: 'aberto', etapa: 1 },
  EM_CONFERENCIA: { label: 'Em Conferência', cls: 'ajuste', etapa: 1 },
  CONFERIDO_ALMOX: { label: 'Conferido — Almoxarifado', cls: 'concluido', etapa: 1 },
  EM_COMPRAS: { label: 'Em Compras', cls: 'ajuste', etapa: 2 },
  ENCAMINHADO_FATURAMENTO: { label: 'Encaminhado — Faturamento', cls: 'ajuste', etapa: 3 },
  EM_ENTRADA_NF: { label: 'Entrada de NF', cls: 'ajuste', etapa: 3 },
  PROCESSADO: { label: 'Processado', cls: 'concluido', etapa: 4 },
  APROVADO: { label: 'Aprovado', cls: 'concluido', etapa: 4 },
  REPROVADO: { label: 'Reprovado', cls: 'saida', etapa: 0 },
  PARCIALMENTE_APROVADO: { label: 'Parcial', cls: 'ajuste', etapa: 1 },
  BLOQUEADO: { label: 'Bloqueado', cls: 'saida', etapa: 0 },
};

const FLOW_STEPS = [
  { label: 'Almoxarifado', desc: 'Receber e conferir' },
  { label: 'Compras', desc: 'Procedimentos' },
  { label: 'Faturamento', desc: 'Entrada da NF' },
  { label: 'Processado', desc: 'Estoque + Contas a Pagar' },
];

const EMPTY_FISCAL = {
  nota_fiscal: '', nota_serie: '', data_emissao_nf: '', data_entrada_nf: '',
  cfop_nota: '', cfop_entrada: '', chave_nfe: '',
  fornecedor_nome: '', fornecedor_cnpj: '', pedido_compra_numero: '',
  tipo_recebimento: 'NOTA_FISCAL',
  base_icms: '', valor_icms: '', valor_produtos: '', frete: '', desconto: '',
  outras_despesas: '', valor_ipi: '', valor_total_nota: '',
};

const RecebimentosAlmoxarifado = () => {
  const [recebimentos, setRecebimentos] = useState([]);
  const [materiais, setMateriais] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroEtapa, setFiltroEtapa] = useState('');
  const [detalhe, setDetalhe] = useState(null);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showNovo, setShowNovo] = useState(false);
  const [showFiscal, setShowFiscal] = useState(false);
  const [buscaMat, setBuscaMat] = useState('');
  const [fiscalForm, setFiscalForm] = useState(EMPTY_FISCAL);
  const [form, setForm] = useState({
    tipo_recebimento: 'NOTA_FISCAL',
    pedido_compra_id: '',
    nota_fiscal: '',
    fornecedor_nome: '',
    fornecedor_cnpj: '',
    observacoes: '',
    itens: [],
  });

  const loadRecebimentos = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filtroStatus) params.status = filtroStatus;
      if (filtroEtapa) params.etapa = filtroEtapa;
      const res = await api.get('/almoxarifado/recebimentos', { params });
      setRecebimentos(res.data || []);
    } catch {
      toast.error('Erro ao carregar recebimentos');
    } finally {
      setLoading(false);
    }
  }, [filtroStatus, filtroEtapa]);

  useEffect(() => {
    loadRecebimentos();
    loadMateriais();
    loadAuxiliares();
  }, [loadRecebimentos]);

  const loadMateriais = async () => {
    try {
      const res = await api.get('/almoxarifado/materiais');
      setMateriais(res.data || []);
    } catch { /* ignore */ }
  };

  const loadAuxiliares = async () => {
    try {
      const [pRes, fRes] = await Promise.all([
        api.get('/almoxarifado/recebimentos-aux/pedidos-compra'),
        api.get('/almoxarifado/recebimentos-aux/fornecedores'),
      ]);
      setPedidos(pRes.data || []);
      setFornecedores(fRes.data || []);
    } catch { /* ignore */ }
  };

  const abrirDetalhe = async (id) => {
    setLoadingDetalhe(true);
    try {
      const res = await api.get(`/almoxarifado/recebimentos/${id}`);
      setDetalhe(res.data);
      setFiscalForm({
        ...EMPTY_FISCAL,
        nota_fiscal: res.data.nota_fiscal || '',
        nota_serie: res.data.nota_serie || '',
        data_emissao_nf: res.data.data_emissao_nf?.slice(0, 10) || '',
        data_entrada_nf: res.data.data_entrada_nf?.slice(0, 10) || '',
        cfop_nota: res.data.cfop_nota || '',
        cfop_entrada: res.data.cfop_entrada || '',
        chave_nfe: res.data.chave_nfe || '',
        fornecedor_nome: res.data.fornecedor_nome || '',
        fornecedor_cnpj: res.data.fornecedor_cnpj || '',
        pedido_compra_numero: res.data.pedido_compra_numero || '',
        tipo_recebimento: res.data.tipo_recebimento || 'NOTA_FISCAL',
        base_icms: res.data.base_icms ?? '',
        valor_icms: res.data.valor_icms ?? '',
        valor_produtos: res.data.valor_produtos ?? '',
        frete: res.data.frete ?? '',
        desconto: res.data.desconto ?? '',
        outras_despesas: res.data.outras_despesas ?? '',
        valor_ipi: res.data.valor_ipi ?? '',
        valor_total_nota: res.data.valor_total_nota ?? '',
      });
    } catch {
      toast.error('Erro ao carregar recebimento');
    } finally {
      setLoadingDetalhe(false);
    }
  };

  const workflow = async (acao, msg) => {
    if (!detalhe) return;
    setSaving(true);
    try {
      await api.post(`/almoxarifado/recebimentos/${detalhe.id}/workflow`, { acao });
      toast.success(msg || 'Etapa concluída');
      abrirDetalhe(detalhe.id);
      loadRecebimentos();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro na transição');
    } finally {
      setSaving(false);
    }
  };

  const salvarFiscal = async (e) => {
    e.preventDefault();
    if (!detalhe) return;
    setSaving(true);
    try {
      const itens = (detalhe.itens || []).map((item) => ({
        id: item.id,
        quantidade_recebida: item.quantidade_recebida,
        valor_unitario: item.valor_unitario,
        valor_total: item.valor_total,
        valor_icms: item.valor_icms,
        valor_ipi: item.valor_ipi,
        reducao_icms_percent: item.reducao_icms_percent,
        conferencia_quantidade: item.conferencia_quantidade,
        conferencia_descricao: item.conferencia_descricao,
        lote: item.lote,
        data_validade_lote: item.data_validade_lote,
        data_fabricacao_lote: item.data_fabricacao_lote,
        corrida_lote: item.corrida_lote,
      }));
      await api.put(`/almoxarifado/recebimentos/${detalhe.id}/fiscal`, {
        ...fiscalForm,
        base_icms: parseFloat(fiscalForm.base_icms) || 0,
        valor_icms: parseFloat(fiscalForm.valor_icms) || 0,
        valor_produtos: parseFloat(fiscalForm.valor_produtos) || 0,
        frete: parseFloat(fiscalForm.frete) || 0,
        desconto: parseFloat(fiscalForm.desconto) || 0,
        outras_despesas: parseFloat(fiscalForm.outras_despesas) || 0,
        valor_ipi: parseFloat(fiscalForm.valor_ipi) || 0,
        valor_total_nota: parseFloat(fiscalForm.valor_total_nota) || 0,
        itens,
      });
      toast.success('Dados fiscais salvos');
      setShowFiscal(false);
      abrirDetalhe(detalhe.id);
      loadRecebimentos();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar dados fiscais');
    } finally {
      setSaving(false);
    }
  };

  const processarNota = async () => {
    if (!window.confirm('Processar nota fiscal? Isso dará entrada no estoque e gerará contas a pagar.')) return;
    setSaving(true);
    try {
      const res = await api.post(`/almoxarifado/recebimentos/${detalhe.id}/processar`, {});
      toast.success(res.data.contas_pagar_id
        ? 'Nota processada — estoque atualizado e conta a pagar gerada!'
        : 'Nota processada — estoque atualizado!');
      abrirDetalhe(detalhe.id);
      loadRecebimentos();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao processar nota');
    } finally {
      setSaving(false);
    }
  };

  const adicionarItem = (material) => {
    if (form.itens.find((i) => i.material_id === material.id)) {
      toast.info('Material já incluído');
      return;
    }
    setForm((f) => ({
      ...f,
      itens: [...f.itens, {
        material_id: material.id,
        material_nome: material.nome,
        material_codigo: material.codigo,
        unidade: material.unidade,
        quantidade: 1,
      }],
    }));
    setBuscaMat('');
  };

  const removerItem = (material_id) => {
    setForm((f) => ({ ...f, itens: f.itens.filter((i) => i.material_id !== material_id) }));
  };

  const selecionarPedido = (pedidoId) => {
    const pedido = pedidos.find((p) => String(p.id) === String(pedidoId));
    setForm((f) => ({
      ...f,
      pedido_compra_id: pedidoId,
      tipo_recebimento: 'PEDIDO_COMPRA',
      fornecedor_nome: pedido?.fornecedor_nome || f.fornecedor_nome,
      fornecedor_cnpj: pedido?.fornecedor_cnpj || f.fornecedor_cnpj,
    }));
  };

  const selecionarFornecedor = (fornId) => {
    const f = fornecedores.find((x) => String(x.id) === String(fornId));
    if (f) {
      setForm((prev) => ({
        ...prev,
        fornecedor_nome: f.razao_social || f.nome_fantasia,
        fornecedor_cnpj: f.cnpj || '',
      }));
      setFiscalForm((prev) => ({
        ...prev,
        fornecedor_nome: f.razao_social || f.nome_fantasia,
        fornecedor_cnpj: f.cnpj || '',
      }));
    }
  };

  const handleCriar = async (e) => {
    e.preventDefault();
    if (form.tipo_recebimento === 'NOTA_FISCAL' && form.itens.length === 0) {
      toast.error('Adicione ao menos um material');
      return;
    }
    if (form.tipo_recebimento === 'PEDIDO_COMPRA' && !form.pedido_compra_id) {
      toast.error('Selecione o pedido de compra');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        tipo_recebimento: form.tipo_recebimento,
        pedido_compra_id: form.pedido_compra_id || null,
        nota_fiscal: form.nota_fiscal || null,
        fornecedor_nome: form.fornecedor_nome || null,
        fornecedor_cnpj: form.fornecedor_cnpj || null,
        observacoes: form.observacoes || null,
        itens: form.itens.map((i) => ({
          material_id: i.material_id,
          quantidade: parseFloat(i.quantidade),
          quantidade_esperada: parseFloat(i.quantidade),
          quantidade_recebida: parseFloat(i.quantidade),
        })),
      };
      const res = await api.post('/almoxarifado/recebimentos', payload);
      toast.success(`Recebimento ${res.data.numero} registrado!`);
      setShowNovo(false);
      setForm({
        tipo_recebimento: 'NOTA_FISCAL', pedido_compra_id: '', nota_fiscal: '',
        fornecedor_nome: '', fornecedor_cnpj: '', observacoes: '', itens: [],
      });
      loadRecebimentos();
      abrirDetalhe(res.data.id);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao registrar recebimento');
    } finally {
      setSaving(false);
    }
  };

  const atualizarItemDetalhe = (itemId, campo, valor) => {
    setDetalhe((d) => ({
      ...d,
      itens: d.itens.map((i) => (i.id === itemId ? { ...i, [campo]: valor } : i)),
    }));
  };

  const formatDate = (d) => d
    ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—';

  const formatMoney = (v) => (v != null && v !== '' ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—');

  const materiaisFiltrados = buscaMat.length >= 2
    ? materiais.filter((m) =>
      m.nome.toLowerCase().includes(buscaMat.toLowerCase()) ||
      m.codigo.toLowerCase().includes(buscaMat.toLowerCase())
    ).slice(0, 6)
    : [];

  const currentStep = detalhe
    ? (STATUS_INFO[detalhe.status]?.etapa || 1) - 1
    : 0;

  const renderAcoes = () => {
    if (!detalhe || ['PROCESSADO', 'APROVADO', 'REPROVADO'].includes(detalhe.status)) return null;
    const s = detalhe.status;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
        {s === 'RECEBIDO' && (
          <button type="button" className="btn-almox-primary" style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => workflow('iniciar_conferencia', 'Conferência iniciada')} disabled={saving}>
            <FiCheck size={14} /> Iniciar Conferência (Almoxarifado)
          </button>
        )}
        {s === 'EM_CONFERENCIA' && (
          <button type="button" className="btn-almox-primary" style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => workflow('finalizar_conferencia', 'Conferência finalizada')} disabled={saving}>
            <FiCheck size={14} /> Finalizar Conferência
          </button>
        )}
        {s === 'CONFERIDO_ALMOX' && (
          <button type="button" className="btn-almox-primary" style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => workflow('encaminhar_compras', 'Encaminhado para Compras')} disabled={saving}>
            <FiArrowRight size={14} /> Encaminhar para Compras
          </button>
        )}
        {s === 'EM_COMPRAS' && (
          <button type="button" className="btn-almox-primary" style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => workflow('finalizar_compras', 'Encaminhado para Faturamento')} disabled={saving}>
            <FiArrowRight size={14} /> Encaminhar para Faturamento
          </button>
        )}
        {['ENCAMINHADO_FATURAMENTO', 'EM_ENTRADA_NF'].includes(s) && (
          <>
            <button type="button" className="btn-almox-secondary" style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => setShowFiscal(true)} disabled={saving}>
              <FiFileText size={14} /> Preencher Dados da NF (Faturamento)
            </button>
            <button type="button" className="btn-almox-primary" style={{ width: '100%', justifyContent: 'center' }}
              onClick={processarNota} disabled={saving}>
              <FiDollarSign size={14} /> Processar Nota — Estoque + Contas a Pagar
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="almox-page">
      <AlmoxPageHeader
        title="Recebimento de Nota Fiscal / Material"
        subtitle="Fluxo: Almoxarifado → Compras → Faturamento → Estoque e Contas a Pagar"
        breadcrumbs={[{ label: 'Recebimentos NF' }]}
        flowSteps={FLOW_STEPS}
        currentStep={currentStep}
        actions={
          <>
            <button type="button" className="btn-almox-secondary" onClick={loadRecebimentos}>
              <FiRefreshCw size={13} />
            </button>
            <button type="button" className="btn-almox-primary" onClick={() => setShowNovo(true)}>
              <FiPlus size={14} /> Novo Recebimento
            </button>
          </>
        }
      />

      <div className="almox-hint-banner">
        <FiTruck size={16} />
        <span>
          O almoxarifado recebe e confere o material com a NF/pedido de compra. Compras analisa e encaminha ao
          faturamento, que preenche os dados fiscais e processa a nota (entrada no estoque + contas a pagar).
        </span>
      </div>

      <div className="almox-filters">
        <select className="almox-select" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS_INFO).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select className="almox-select" value={filtroEtapa} onChange={(e) => setFiltroEtapa(e.target.value)}>
          <option value="">Todas as etapas</option>
          <option value="ALMOXARIFADO">Almoxarifado</option>
          <option value="COMPRAS">Compras</option>
          <option value="FATURAMENTO">Faturamento</option>
          <option value="CONCLUIDO">Concluído</option>
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: detalhe ? '1fr 420px' : '1fr', gap: 20 }}>
        <div className="almox-table-container">
          {loading ? <SkeletonTable rows={8} columns={6} /> : recebimentos.length === 0 ? (
            <div className="almox-empty">
              <FiPackage size={40} style={{ opacity: 0.3, display: 'block', margin: '0 auto 12px' }} />
              <p>Nenhum recebimento registrado</p>
              <button type="button" className="btn-almox-primary" style={{ marginTop: 12 }} onClick={() => setShowNovo(true)}>
                Registrar primeiro recebimento
              </button>
            </div>
          ) : (
            <table className="almox-table">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>NF</th>
                  <th>Pedido</th>
                  <th>Fornecedor</th>
                  <th>Status</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {recebimentos.map((r) => {
                  const st = STATUS_INFO[r.status] || { label: r.status, cls: 'ajuste' };
                  return (
                    <tr key={r.id} style={{ cursor: 'pointer', background: detalhe?.id === r.id ? 'rgba(79,172,254,0.06)' : '' }}
                      onClick={() => abrirDetalhe(r.id)}>
                      <td style={{ fontWeight: 700, fontFamily: 'monospace', color: '#4facfe' }}>{r.numero}</td>
                      <td>{r.nota_fiscal || '—'}</td>
                      <td>{r.pedido_compra_numero || '—'}</td>
                      <td>{r.fornecedor_nome || '—'}</td>
                      <td><span className={`almox-badge almox-badge-${st.cls}`}>{st.label}</span></td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>{formatDate(r.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {detalhe && (
          <div className="almox-detail-panel">
            <div className="almox-detail-panel-header">
              <div>
                <div style={{ fontWeight: 700, fontFamily: 'monospace', color: '#4facfe' }}>{detalhe.numero}</div>
                <span className={`almox-badge almox-badge-${STATUS_INFO[detalhe.status]?.cls || 'ajuste'}`}>
                  {STATUS_INFO[detalhe.status]?.label || detalhe.status}
                </span>
              </div>
              <button type="button" className="almox-modal-close" onClick={() => setDetalhe(null)}>✕</button>
            </div>
            {loadingDetalhe ? (
              <div className="almox-loading"><FiRefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /></div>
            ) : (
              <div style={{ padding: 20, maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16, fontSize: '0.85rem' }}>
                  <div><span style={{ color: 'var(--gmp-text-light)', fontSize: '0.7rem' }}>NF</span><br />{detalhe.nota_fiscal || '—'}{detalhe.nota_serie ? ` / ${detalhe.nota_serie}` : ''}</div>
                  <div><span style={{ color: 'var(--gmp-text-light)', fontSize: '0.7rem' }}>Pedido de Compra</span><br />{detalhe.pedido_compra_numero || '—'}</div>
                  <div><span style={{ color: 'var(--gmp-text-light)', fontSize: '0.7rem' }}>Fornecedor</span><br />{detalhe.fornecedor_nome || '—'}</div>
                  <div><span style={{ color: 'var(--gmp-text-light)', fontSize: '0.7rem' }}>CNPJ</span><br />{detalhe.fornecedor_cnpj || '—'}</div>
                  <div><span style={{ color: 'var(--gmp-text-light)', fontSize: '0.7rem' }}>Valor Total NF</span><br />{formatMoney(detalhe.valor_total_nota)}</div>
                  <div><span style={{ color: 'var(--gmp-text-light)', fontSize: '0.7rem' }}>Chave NF-e</span><br /><span style={{ fontSize: '0.7rem', wordBreak: 'break-all' }}>{detalhe.chave_nfe || '—'}</span></div>
                </div>
                {detalhe.observacoes && (
                  <div className="almox-hint-banner" style={{ marginBottom: 16, fontSize: '0.8rem' }}>{detalhe.observacoes}</div>
                )}
                <div style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: 10 }}>
                  Itens ({detalhe.itens?.length || 0})
                </div>
                {(detalhe.itens || []).map((item) => (
                  <div key={item.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--gmp-border)', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>{item.material_nome}</div>
                        <div style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>{item.material_codigo}</div>
                      </div>
                      <div style={{ fontWeight: 700 }}>{item.quantidade_recebida || item.quantidade_esperada} {item.unidade}</div>
                    </div>
                    {['EM_ENTRADA_NF', 'ENCAMINHADO_FATURAMENTO'].includes(detalhe.status) && (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 6 }}>
                          <input className="almox-input" type="number" step="0.01" placeholder="Vlr. unit."
                            value={item.valor_unitario ?? ''} style={{ fontSize: '0.75rem', padding: '4px 6px' }}
                            onChange={(e) => atualizarItemDetalhe(item.id, 'valor_unitario', e.target.value)} />
                          <input className="almox-input" type="number" step="0.01" placeholder="ICMS"
                            value={item.valor_icms ?? ''} style={{ fontSize: '0.75rem', padding: '4px 6px' }}
                            onChange={(e) => atualizarItemDetalhe(item.id, 'valor_icms', e.target.value)} />
                          <input className="almox-input" type="number" step="0.01" placeholder="Red. ICMS %"
                            value={item.reducao_icms_percent ?? ''} style={{ fontSize: '0.75rem', padding: '4px 6px' }}
                            onChange={(e) => atualizarItemDetalhe(item.id, 'reducao_icms_percent', e.target.value)} />
                        </div>
                        {/* Lote nasce aqui — na nota do fornecedor — não na movimentação. Sem estes
                            campos era o único ponto do sistema onde a coluna existia no banco
                            (Task 5) e o motor a lia (Task 6), mas ninguém conseguia preenchê-la.
                            "Fabricação" entrou no review final da Etapa 6: `lotes_almoxarifado.
                            data_fabricacao` existia desde a Task 1 sem NENHUM escritor — este
                            campo é o escritor, e a tela de Lotes é o leitor. */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, marginTop: 6 }}>
                          <input className="almox-input" placeholder="Lote"
                            value={item.lote ?? ''} style={{ fontSize: '0.75rem', padding: '4px 6px' }}
                            onChange={(e) => atualizarItemDetalhe(item.id, 'lote', e.target.value)} />
                          <input className="almox-input" type="date" placeholder="Validade" title="Validade do lote"
                            value={item.data_validade_lote ?? ''} style={{ fontSize: '0.75rem', padding: '4px 6px' }}
                            onChange={(e) => atualizarItemDetalhe(item.id, 'data_validade_lote', e.target.value)} />
                          <input className="almox-input" type="date" placeholder="Fabricação" title="Data de fabricação do lote"
                            value={item.data_fabricacao_lote ?? ''} style={{ fontSize: '0.75rem', padding: '4px 6px' }}
                            onChange={(e) => atualizarItemDetalhe(item.id, 'data_fabricacao_lote', e.target.value)} />
                          <input className="almox-input" placeholder="Corrida"
                            value={item.corrida_lote ?? ''} style={{ fontSize: '0.75rem', padding: '4px 6px' }}
                            onChange={(e) => atualizarItemDetalhe(item.id, 'corrida_lote', e.target.value)} />
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {renderAcoes()}
                {detalhe.contas_pagar_id && (
                  <div className="almox-hint-banner" style={{ marginTop: 12, fontSize: '0.8rem' }}>
                    Conta a pagar #{detalhe.contas_pagar_id} gerada. Verifique em{' '}
                    <Link to="/financeiro/contas-pagar">Contas a Pagar</Link>.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {showNovo && (
        <div className="almox-modal-overlay" onClick={() => setShowNovo(false)}>
          <div className="almox-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="almox-modal-header">
              <h2>📥 Novo Recebimento — Almoxarifado</h2>
              <button type="button" className="almox-modal-close" onClick={() => setShowNovo(false)}>✕</button>
            </div>
            <form onSubmit={handleCriar}>
              <div className="almox-modal-body">
                <div className="almox-field almox-form-full">
                  <label className="almox-label">Forma de recebimento</label>
                  <select className="almox-select" value={form.tipo_recebimento}
                    onChange={(e) => setForm((f) => ({ ...f, tipo_recebimento: e.target.value, pedido_compra_id: '', itens: [] }))}>
                    <option value="NOTA_FISCAL">Somente pela Nota Fiscal</option>
                    <option value="PEDIDO_COMPRA">Por Pedido de Compra</option>
                  </select>
                </div>

                {form.tipo_recebimento === 'PEDIDO_COMPRA' ? (
                  <div className="almox-field almox-form-full">
                    <label className="almox-label">Número do Pedido de Compra</label>
                    <select className="almox-select" required value={form.pedido_compra_id}
                      onChange={(e) => selecionarPedido(e.target.value)}>
                      <option value="">Selecione o pedido...</option>
                      {pedidos.map((p) => (
                        <option key={p.id} value={p.id}>{p.numero} — {p.fornecedor_nome}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="almox-form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <div className="almox-field">
                      <label className="almox-label">Nota Fiscal (nº)</label>
                      <input className="almox-input" value={form.nota_fiscal}
                        onChange={(e) => setForm((f) => ({ ...f, nota_fiscal: e.target.value }))} placeholder="12345" />
                    </div>
                    <div className="almox-field">
                      <label className="almox-label">Fornecedor</label>
                      <select className="almox-select" value="" onChange={(e) => selecionarFornecedor(e.target.value)}>
                        <option value="">Digite ou selecione...</option>
                        {fornecedores.map((f) => (
                          <option key={f.id} value={f.id}>{f.razao_social} — {f.cnpj}</option>
                        ))}
                      </select>
                      <input className="almox-input" style={{ marginTop: 6 }} value={form.fornecedor_nome}
                        onChange={(e) => setForm((prev) => ({ ...prev, fornecedor_nome: e.target.value }))}
                        placeholder="Nome do fornecedor" />
                    </div>
                    <div className="almox-field almox-form-full">
                      <label className="almox-label">CNPJ do Fornecedor</label>
                      <input className="almox-input" value={form.fornecedor_cnpj}
                        onChange={(e) => setForm((f) => ({ ...f, fornecedor_cnpj: e.target.value }))} placeholder="00.000.000/0000-00" />
                    </div>
                  </div>
                )}

                <div className="almox-field almox-form-full">
                  <label className="almox-label">Observações</label>
                  <input className="almox-input" value={form.observacoes}
                    onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
                </div>

                {form.tipo_recebimento === 'NOTA_FISCAL' && (
                  <div style={{ marginTop: 16 }}>
                    <label className="almox-label">Materiais recebidos</label>
                    <div className="almox-search-wrapper" style={{ marginBottom: 8 }}>
                      <FiSearch className="almox-search-icon" />
                      <input className="almox-search-input" placeholder="Buscar material..."
                        value={buscaMat} onChange={(e) => setBuscaMat(e.target.value)} />
                    </div>
                    {materiaisFiltrados.length > 0 && (
                      <div className="almox-search-results">
                        {materiaisFiltrados.map((m) => (
                          <button key={m.id} type="button" className="almox-search-result-item" onClick={() => adicionarItem(m)}>
                            <span>{m.codigo} — {m.nome}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {form.itens.map((item) => (
                      <div key={item.material_id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <div style={{ flex: 1, fontSize: '0.85rem' }}>
                          <strong>{item.material_nome}</strong>
                          <div style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>{item.material_codigo}</div>
                        </div>
                        <input className="almox-count-input" type="number" min="1" step="1" required
                          value={item.quantidade}
                          onChange={(e) => setForm((f) => ({
                            ...f,
                            itens: f.itens.map((i) => i.material_id === item.material_id ? { ...i, quantidade: e.target.value } : i),
                          }))} />
                        <span style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>{item.unidade}</span>
                        <button type="button" className="almox-btn-icon danger" onClick={() => removerItem(item.material_id)}>
                          <FiX />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="almox-modal-footer">
                <button type="button" className="btn-almox-secondary" onClick={() => setShowNovo(false)}>Cancelar</button>
                <button type="submit" className="btn-almox-primary"
                  disabled={saving || (form.tipo_recebimento === 'NOTA_FISCAL' && form.itens.length === 0)}>
                  {saving ? 'Salvando...' : 'Registrar Recebimento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showFiscal && detalhe && (
        <div className="almox-modal-overlay" onClick={() => setShowFiscal(false)}>
          <div className="almox-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="almox-modal-header">
              <h2>📄 Entrada de Nota Fiscal — Faturamento</h2>
              <button type="button" className="almox-modal-close" onClick={() => setShowFiscal(false)}>✕</button>
            </div>
            <form onSubmit={salvarFiscal}>
              <div className="almox-modal-body">
                <div className="almox-form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="almox-field">
                    <label className="almox-label">Número da Nota Fiscal *</label>
                    <input className="almox-input" required value={fiscalForm.nota_fiscal}
                      onChange={(e) => setFiscalForm((f) => ({ ...f, nota_fiscal: e.target.value }))} />
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Série</label>
                    <input className="almox-input" value={fiscalForm.nota_serie}
                      onChange={(e) => setFiscalForm((f) => ({ ...f, nota_serie: e.target.value }))} />
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Data Emissão *</label>
                    <input className="almox-input" type="date" required value={fiscalForm.data_emissao_nf}
                      onChange={(e) => setFiscalForm((f) => ({ ...f, data_emissao_nf: e.target.value }))} />
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Data Entrada *</label>
                    <input className="almox-input" type="date" required value={fiscalForm.data_entrada_nf}
                      onChange={(e) => setFiscalForm((f) => ({ ...f, data_entrada_nf: e.target.value }))} />
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">CFOP da Nota</label>
                    <input className="almox-input" value={fiscalForm.cfop_nota}
                      onChange={(e) => setFiscalForm((f) => ({ ...f, cfop_nota: e.target.value }))} />
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">CFOP da Entrada</label>
                    <input className="almox-input" value={fiscalForm.cfop_entrada}
                      onChange={(e) => setFiscalForm((f) => ({ ...f, cfop_entrada: e.target.value }))} />
                  </div>
                  <div className="almox-field almox-form-full">
                    <label className="almox-label">Chave da Nota Fiscal (NF-e)</label>
                    <input className="almox-input" value={fiscalForm.chave_nfe} maxLength={44}
                      onChange={(e) => setFiscalForm((f) => ({ ...f, chave_nfe: e.target.value }))} />
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">CNPJ Fornecedor</label>
                    <input className="almox-input" value={fiscalForm.fornecedor_cnpj}
                      onChange={(e) => setFiscalForm((f) => ({ ...f, fornecedor_cnpj: e.target.value }))} />
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Pedido de Compra</label>
                    <input className="almox-input" value={fiscalForm.pedido_compra_numero}
                      onChange={(e) => setFiscalForm((f) => ({ ...f, pedido_compra_numero: e.target.value }))} />
                  </div>
                </div>

                <div style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', margin: '16px 0 10px' }}>
                  Dados Fiscais
                </div>
                <div className="almox-form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                  {[
                    ['base_icms', 'Base Cálc. ICMS'],
                    ['valor_icms', 'Valor ICMS'],
                    ['valor_produtos', 'Valor Produtos'],
                    ['frete', 'Frete'],
                    ['desconto', 'Descontos'],
                    ['outras_despesas', 'Outras Despesas'],
                    ['valor_ipi', 'IPI'],
                    ['valor_total_nota', 'Valor Total da Nota *'],
                  ].map(([key, label]) => (
                    <div key={key} className="almox-field">
                      <label className="almox-label">{label}</label>
                      <input className="almox-input" type="number" step="0.01"
                        required={key === 'valor_total_nota'}
                        value={fiscalForm[key]}
                        onChange={(e) => setFiscalForm((f) => ({ ...f, [key]: e.target.value }))} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="almox-modal-footer">
                <button type="button" className="btn-almox-secondary" onClick={() => setShowFiscal(false)}>Cancelar</button>
                <button type="submit" className="btn-almox-primary" disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar Dados Fiscais'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecebimentosAlmoxarifado;
