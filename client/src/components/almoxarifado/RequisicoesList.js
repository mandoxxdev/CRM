import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import { resolveMaterialPhotoUrl } from '../../utils/resolveMaterialPhotoUrl';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import { canDeleteAlmoxRequisicao } from '../../utils/systemPermissions';
import { prefixarAlmoxarifado } from '../../utils/localizacaoLabel';
import { SkeletonTable } from '../SkeletonLoader';
import AlmoxPageHeader, { REQUISICAO_FLOW, getRequisicaoStepIndex } from './AlmoxPageHeader';
import { useRequisicoesMaterialContext } from './RequisicoesMaterialContext';
import { TIPO_REQUISICAO_LABELS } from './requisicaoLabels';
import { useAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';
import AssinaturaCanvas from './AssinaturaCanvas';
import {
  FiPlus, FiRefreshCw, FiEye, FiCheck, FiX, FiPackage,
  FiAlertTriangle, FiClock, FiTruck, FiCheckCircle, FiFilter, FiMap, FiTrash2, FiDollarSign,
  FiSend, FiArchive, FiShoppingCart, FiUserCheck, FiBox, FiEdit3, FiCopy, FiCheckSquare
} from 'react-icons/fi';
import './Almoxarifado.css';

const STATUS_INFO = {
  RASCUNHO:              { label: 'Rascunho',              cls: 'almox-badge-zerado',    icon: FiEdit3 },
  PENDENTE:              { label: 'Pendente',              cls: 'almox-badge-aberto',    icon: FiClock },
  AGUARDANDO_APROVACAO_VALOR: { label: 'Aguard. Aprov. Valor', cls: 'almox-badge-baixo', icon: FiDollarSign },
  APROVADO:              { label: 'Aprovado',              cls: 'almox-badge-ok',        icon: FiCheck },
  AGUARDANDO_ESTOQUE:    { label: 'Aguard. Estoque',        cls: 'almox-badge-critico',  icon: FiAlertTriangle },
  AGUARDANDO_COMPRA:     { label: 'Aguard. Compra',         cls: 'almox-badge-devolucao', icon: FiShoppingCart },
  // Etapa 4: aprovação com saldo cai num destes dois em vez de APROVADO (máquina de estados,
  // requisitionStateMachine.js) — são o estado normal de requisição aprovada, não exceção.
  PARCIALMENTE_RESERVADA: { label: 'Parcialmente Reservada', cls: 'almox-badge-baixo',   icon: FiBox },
  TOTALMENTE_RESERVADA:  { label: 'Totalmente Reservada',   cls: 'almox-badge-ok',       icon: FiCheckSquare },
  EM_SEPARACAO:          { label: 'Em Separação',          cls: 'almox-badge-ajuste',    icon: FiPackage },
  PRONTA_PARA_RETIRADA:  { label: 'Pronta p/ Retirada',     cls: 'almox-badge-entrada',  icon: FiBox },
  PARCIALMENTE_ATENDIDA: { label: 'Parcialmente Atendida', cls: 'almox-badge-baixo',     icon: FiTruck },
  ENTREGUE:              { label: 'Entregue',              cls: 'almox-badge-concluido', icon: FiCheckCircle },
  ENCERRADA:             { label: 'Encerrada',             cls: 'almox-badge-cancelado', icon: FiArchive },
  REJEITADO:             { label: 'Rejeitado',             cls: 'almox-badge-saida',     icon: FiX },
  CANCELADO:             { label: 'Cancelado',             cls: 'almox-badge-cancelado', icon: FiX },
};

const getEntregue = (item) => Number(item.quantidade_entregue ?? item.quantidade_atendida) || 0;
const getSeparado = (item) => Number(item.quantidade_separada) || 0;
const getPendente = (item) => Math.max(0, Number(item.quantidade_solicitada) - getEntregue(item));
const maxQtdSeparacao = (item) => Math.min(
  Math.max(0, Number(item.quantidade_solicitada) - getSeparado(item)),
  Number(item.saldo_atual) || 0
);
const maxQtdEntrega = (item) => {
  if (item.quantidade_entregavel != null) {
    return Math.max(0, Number(item.quantidade_entregavel) || 0);
  }
  const entregue = getEntregue(item);
  const separadoDisponivel = Math.max(0, getSeparado(item) - entregue);
  const pendente = getPendente(item);
  const estoque = Number(item.saldo_atual) || 0;
  if (pendente <= 0) return 0;
  if (entregue > 0 && separadoDisponivel < pendente) {
    return Math.min(pendente, estoque);
  }
  return Math.min(pendente, separadoDisponivel, estoque);
};
const temEntregavel = (itens) => (itens || []).some((i) => maxQtdEntrega(i) > 0);
const totalPendente = (itens) => (itens || []).reduce((s, i) => s + getPendente(i), 0);
const temPendenteComEstoque = (itens) => temEntregavel(itens);

const URGENCIA_INFO = {
  NORMAL:  { label: 'Normal',   cor: 'var(--gmp-text-light)' },
  URGENTE: { label: 'Urgente',  cor: 'var(--gmp-warning)' },
  CRITICO: { label: 'Crítico',  cor: 'var(--gmp-error)' },
};

const formatMoeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const RequisicoesList = () => {
  const { pode, bloquearSeNaoPode } = useAlmoxPermissoes();
  const { user } = useAuth();
  const navigate = useNavigate();
  const ctx = useRequisicoesMaterialContext();
  const warehouseMode = !!ctx.warehouseMode;
  const apiPrefix = warehouseMode ? '/almoxarifado/requisicoes' : '/requisicoes-material';
  const novaPath = warehouseMode
    ? '/almoxarifado/requisicoes/nova'
    : `${ctx.basePath}/requisicoes-material/nova`;
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = canDeleteAlmoxRequisicao(user);

  const [requisicoes, setRequisicoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState(searchParams.get('status') || '');
  const [filtroTipo, setFiltroTipo] = useState(searchParams.get('tipo') || '');
  const [filtroAprovacoesValor, setFiltroAprovacoesValor] = useState(
    searchParams.get('aprovacoes_valor') === '1'
  );
  const [souAprovadorValor, setSouAprovadorValor] = useState(false);
  const [filtroMinha, setFiltroMinha] = useState(
    warehouseMode ? searchParams.get('minha') === '1' : true
  );
  const [selectedId, setSelectedId] = useState(() => {
    const id = searchParams.get('id');
    return id ? parseInt(id, 10) || null : null;
  });
  const [detalhe, setDetalhe] = useState(null);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);
  const loadedDetalheIdRef = useRef(null);
  const detalheFetchSeqRef = useRef(0);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const [showRejeitar, setShowRejeitar] = useState(false);
  const [showRejeitarValor, setShowRejeitarValor] = useState(false);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');
  const [motivoRejeicaoValor, setMotivoRejeicaoValor] = useState('');
  const [showEntregar, setShowEntregar] = useState(false);
  const [showSeparar, setShowSeparar] = useState(false);
  const [showExcluir, setShowExcluir] = useState(false);
  const [excluirTarget, setExcluirTarget] = useState(null);
  const [justificativaExclusao, setJustificativaExclusao] = useState('');
  const [showEncerrar, setShowEncerrar] = useState(false);
  const [motivoEncerramento, setMotivoEncerramento] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [quantidadesEntrega, setQuantidadesEntrega] = useState({});
  const [quantidadesSeparacao, setQuantidadesSeparacao] = useState({});
  const [entregaAposSeparar, setEntregaAposSeparar] = useState(false);
  const [saving, setSaving] = useState(false);
  // Etapa 15: etapa opcional de assinatura do recebedor. Guarda reqId + numero (e não o
  // detalhe) porque a entrega total fecha o painel de detalhe antes de a assinatura abrir.
  const [assinaturaPos, setAssinaturaPos] = useState(null); // { reqId, numero } | null
  const [assinaturaNome, setAssinaturaNome] = useState('');
  const [enviandoAssinatura, setEnviandoAssinatura] = useState(false);

  const buildSearchParams = useCallback((id) => {
    const params = {};
    if (filtroAprovacoesValor) {
      params.aprovacoes_valor = '1';
      params.status = 'AGUARDANDO_APROVACAO_VALOR';
    } else if (filtroStatus) {
      params.status = filtroStatus;
    }
    if (filtroMinha) params.minha = '1';
    if (filtroTipo) params.tipo = filtroTipo;
    if (id) params.id = String(id);
    return params;
  }, [filtroStatus, filtroMinha, filtroAprovacoesValor, filtroTipo]);

  const syncSearchParams = useCallback((id) => {
    const params = buildSearchParams(id);
    const next = new URLSearchParams(params).toString();
    if (next !== searchParams.toString()) {
      setSearchParams(params, { replace: true });
    }
  }, [buildSearchParams, searchParams, setSearchParams]);

  useEffect(() => {
    loadRequisicoes();
  }, [filtroStatus, filtroMinha, filtroAprovacoesValor]);

  useEffect(() => {
    if (warehouseMode) {
      api.get('/almoxarifado/configuracoes/liberacao-valor')
        .then((res) => setSouAprovadorValor(!!res.data?.souAprovador))
        .catch(() => setSouAprovadorValor(false));
    }
  }, [warehouseMode]);

  // Deep-link / browser back-forward: open panel when ?id= changes externally
  useEffect(() => {
    const urlId = searchParams.get('id');
    if (!urlId) {
      if (loadedDetalheIdRef.current != null) {
        setSelectedId(null);
        setDetalhe(null);
        loadedDetalheIdRef.current = null;
      }
      return;
    }
    const numId = parseInt(urlId, 10);
    if (!numId) return;
    abrirDetalhe(numId, { fromUrl: true, force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Sync filter params in URL, preserving open requisition id
  useEffect(() => {
    syncSearchParams(selectedIdRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroStatus, filtroMinha, filtroAprovacoesValor, filtroTipo]);

  const aplicarDetalhe = useCallback((data, id) => {
    setDetalhe(data);
    loadedDetalheIdRef.current = id;
    const qtdsEntrega = {};
    const qtdsSeparacao = {};
    (data.itens || []).forEach((i) => {
      qtdsEntrega[i.id] = maxQtdEntrega(i);
      qtdsSeparacao[i.id] = maxQtdSeparacao(i);
    });
    setQuantidadesEntrega(qtdsEntrega);
    setQuantidadesSeparacao(qtdsSeparacao);
  }, []);

  const loadRequisicoes = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filtroAprovacoesValor) {
        params.aprovacoes_valor = '1';
        params.status = 'AGUARDANDO_APROVACAO_VALOR';
      } else if (filtroStatus) {
        params.status = filtroStatus;
      }
      if (warehouseMode) {
        if (filtroMinha) params.minha = '1';
      } else {
        params.minha = filtroMinha ? '1' : undefined;
        if (!filtroMinha && ctx.setor) params.setor = ctx.setor;
      }
      const res = await api.get(apiPrefix, { params });
      setRequisicoes(res.data);
    } catch {
      toast.error('Erro ao carregar requisições');
    } finally {
      setLoading(false);
    }
  };

  const abrirDetalhe = useCallback(async (id, { fromUrl = false, force = true } = {}) => {
    if (!id) return null;
    if (!force && loadedDetalheIdRef.current === id) return null;

    const fetchSeq = ++detalheFetchSeqRef.current;
    setSelectedId(id);
    setLoadingDetalhe(true);
    if (loadedDetalheIdRef.current !== id) {
      setDetalhe(null);
    }

    try {
      const res = await api.get(`${apiPrefix}/${id}`, {
        params: { _t: Date.now() },
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      });
      if (fetchSeq !== detalheFetchSeqRef.current) return null;

      aplicarDetalhe(res.data, id);
      if (!fromUrl) syncSearchParams(id);
      return res.data;
    } catch {
      if (fetchSeq !== detalheFetchSeqRef.current) return null;
      toast.error('Erro ao carregar detalhe');
      setSelectedId(null);
      setDetalhe(null);
      loadedDetalheIdRef.current = null;
      if (!fromUrl) syncSearchParams(null);
      return null;
    } finally {
      if (fetchSeq === detalheFetchSeqRef.current) {
        setLoadingDetalhe(false);
      }
    }
  }, [apiPrefix, aplicarDetalhe, syncSearchParams]);

  const refreshAll = useCallback(async () => {
    await loadRequisicoes();
    const id = selectedIdRef.current;
    if (id) await abrirDetalhe(id, { force: true });
  }, [abrirDetalhe]);

  useEffect(() => {
    if (!warehouseMode || !selectedId) return undefined;

    const refetchDetalhe = () => {
      if (document.visibilityState === 'visible') {
        abrirDetalhe(selectedIdRef.current, { force: true });
      }
    };

    window.addEventListener('focus', refetchDetalhe);
    document.addEventListener('visibilitychange', refetchDetalhe);
    return () => {
      window.removeEventListener('focus', refetchDetalhe);
      document.removeEventListener('visibilitychange', refetchDetalhe);
    };
  }, [warehouseMode, selectedId, abrirDetalhe]);

  const fecharDetalhe = () => {
    setSelectedId(null);
    setDetalhe(null);
    loadedDetalheIdRef.current = null;
    syncSearchParams(null);
  };

  const handleAprovar = async (id, iniciarSeparacao = false) => {
    setSaving(true);
    try {
      await api.put(`/almoxarifado/requisicoes/${id}/aprovar`);
      if (iniciarSeparacao) {
        await abrirDetalhe(id, { force: true });
        setShowSeparar(true);
        toast.success('Requisição aprovada! Informe as quantidades a separar.');
      } else {
        toast.success('Requisição aprovada! Inicie a separação quando estiver pronto.');
        await abrirDetalhe(id, { force: true });
      }
      await loadRequisicoes();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao aprovar');
    } finally {
      setSaving(false);
    }
  };

  const handleRejeitar = async () => {
    setSaving(true);
    try {
      await api.put(`/almoxarifado/requisicoes/${detalhe.id}/rejeitar`, { motivo: motivoRejeicao });
      toast.success('Requisição rejeitada');
      setShowRejeitar(false);
      fecharDetalhe();
      loadRequisicoes();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao rejeitar');
    } finally {
      setSaving(false);
    }
  };

  const handleAprovarValor = async () => {
    setSaving(true);
    try {
      await api.put(`/almoxarifado/requisicoes/${detalhe.id}/aprovar-valor`);
      toast.success('Liberação por valor aprovada! O almoxarifado pode prosseguir.');
      await abrirDetalhe(detalhe.id, { force: true });
      await loadRequisicoes();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao aprovar liberação');
    } finally {
      setSaving(false);
    }
  };

  const handleRejeitarValor = async () => {
    setSaving(true);
    try {
      await api.put(`/almoxarifado/requisicoes/${detalhe.id}/rejeitar-valor`, { motivo: motivoRejeicaoValor });
      toast.success('Liberação por valor reprovada');
      setShowRejeitarValor(false);
      fecharDetalhe();
      loadRequisicoes();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao reprovar');
    } finally {
      setSaving(false);
    }
  };

  const abrirModalSeparacao = () => {
    if (!detalhe) return;
    const qtds = {};
    detalhe.itens.forEach((i) => { qtds[i.id] = maxQtdSeparacao(i); });
    setQuantidadesSeparacao(qtds);
    setShowSeparar(true);
  };

  const handleSeparacao = async () => {
    if (!detalhe) return;
    setSaving(true);
    try {
      const itens_separados = detalhe.itens
        .map((i) => ({
          item_id: i.id,
          quantidade_separada: parseFloat(quantidadesSeparacao[i.id] || 0),
        }))
        .filter((i) => i.quantidade_separada > 0);

      await api.put(`/almoxarifado/requisicoes/${detalhe.id}/separacao`, { itens_separados });
      toast.success('Separação registrada!');
      setShowSeparar(false);
      const abrirEntrega = entregaAposSeparar;
      setEntregaAposSeparar(false);
      const updated = await abrirDetalhe(detalhe.id, { force: true });
      await loadRequisicoes();
      if (abrirEntrega && updated) abrirModalEntrega(updated);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao separar');
    } finally {
      setSaving(false);
    }
  };

  const montarItensEntrega = (fonte, qtdMap = quantidadesEntrega) => {
    if (!fonte?.itens) return [];
    return fonte.itens
      .map((i) => ({
        item_id: Number(i.id),
        quantidade_atendida: parseFloat(qtdMap[i.id] ?? qtdMap[String(i.id)] ?? 0) || 0,
      }))
      .filter((i) => i.item_id && i.quantidade_atendida > 0);
  };

  const entregarItens = async (itens_atendidos, reqId = detalhe?.id) => {
    if (!reqId) {
      toast.error('Requisição não carregada');
      return;
    }
    if (!itens_atendidos?.length) {
      console.error('[RequisicoesList] entregarItens: nenhuma quantidade informada', { reqId, detalhe });
      toast.error('Informe ao menos uma quantidade maior que zero para entregar');
      return;
    }
    setSaving(true);
    try {
      const res = await api.put(`/almoxarifado/requisicoes/${reqId}/entregar`, { itens_atendidos });
      setShowEntregar(false);
      const numeroEntregue = detalhe?.numero || '';
      if (res.data?.parcial) {
        toast.success('Entrega parcial registrada. Saldo pendente permanece em aberto.');
        await abrirDetalhe(reqId, { force: true });
      } else {
        toast.success('Requisição entregue por completo! Estoque baixado.');
        fecharDetalhe();
      }
      // Etapa 15 (RN-02): a entrega já está registrada — a assinatura é etapa POSTERIOR e
      // opcional ("Pular" fecha sem POST). Nunca condiciona o sucesso da entrega.
      setAssinaturaNome('');
      setAssinaturaPos({ reqId, numero: numeroEntregue });
      await loadRequisicoes();
    } catch (err) {
      console.error('[RequisicoesList] Erro ao entregar requisição', err?.response?.data || err);
      toast.error(err.response?.data?.error || 'Erro ao entregar');
    } finally {
      setSaving(false);
    }
  };

  // Etapa 15 — POST multipart do contrato C1 (recebedor_nome + arquivo `assinatura`).
  // RN-02: falha aqui NÃO desfaz a entrega — a entrega é fato físico já registrado; a
  // assinatura é documentação dele. Erro vira toast e a etapa continua aberta para tentar
  // de novo (ou Pular).
  const enviarAssinatura = async (blob) => {
    if (!assinaturaPos || enviandoAssinatura) return;
    const nome = assinaturaNome.trim();
    if (!nome) {
      toast.error('Informe o nome de quem recebeu o material');
      return;
    }
    setEnviandoAssinatura(true);
    try {
      const fd = new FormData();
      fd.append('recebedor_nome', nome);
      fd.append('assinatura', blob, 'assinatura.png');
      await api.post(`/almoxarifado/requisicoes/${assinaturaPos.reqId}/assinatura-entrega`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Assinatura do recebedor registrada!');
      const reqId = assinaturaPos.reqId;
      setAssinaturaPos(null);
      setAssinaturaNome('');
      if (selectedIdRef.current === reqId) await abrirDetalhe(reqId, { force: true });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao registrar assinatura');
    } finally {
      setEnviandoAssinatura(false);
    }
  };

  const abrirColherAssinatura = (fonte) => {
    setAssinaturaNome('');
    setAssinaturaPos({ reqId: fonte.id, numero: fonte.numero });
  };

  const abrirModalEntrega = (fonte = detalhe) => {
    if (!fonte) {
      toast.error('Requisição não carregada');
      return;
    }
    const qtds = {};
    fonte.itens.forEach((i) => {
      const qtd = maxQtdEntrega(i);
      if (qtd > 0) qtds[i.id] = qtd;
    });
    if (Object.keys(qtds).length === 0) {
      console.error('[RequisicoesList] abrirModalEntrega: nenhum item entregável', fonte);
      toast.error('Nenhum item disponível para entrega. Verifique separação e estoque.');
      return;
    }
    setQuantidadesEntrega(qtds);
    setShowEntregar(true);
  };

  const handleConfirmarEntrega = async ({ direto = false } = {}) => {
    if (!detalhe) {
      toast.error('Requisição não carregada');
      return;
    }
    const qtds = {};
    detalhe.itens.forEach((i) => {
      const qtd = maxQtdEntrega(i);
      if (qtd > 0) qtds[i.id] = qtd;
    });
    const itens_atendidos = montarItensEntrega(detalhe, qtds);
    if (!itens_atendidos.length) {
      console.error('[RequisicoesList] handleConfirmarEntrega: nenhum item entregável', {
        reqId: detalhe.id,
        itens: detalhe.itens.map((i) => ({
          id: i.id,
          solicitado: i.quantidade_solicitada,
          separado: getSeparado(i),
          entregue: getEntregue(i),
          saldo: i.saldo_atual,
          max: maxQtdEntrega(i),
        })),
      });
      toast.error('Nenhum item disponível para entrega. Separe os materiais ou aguarde reposição de estoque.');
      return;
    }
    setQuantidadesEntrega(qtds);
    if (direto) {
      await entregarItens(itens_atendidos);
    } else {
      setShowEntregar(true);
    }
  };

  const handleCompletarEntrega = () => {
    if (!detalhe) return;
    if (temEntregavel(detalhe.itens)) {
      abrirModalEntrega();
      return;
    }
    const precisaSeparar = detalhe.itens.some((i) => maxQtdSeparacao(i) > 0 && getPendente(i) > 0);
    if (precisaSeparar) {
      setEntregaAposSeparar(true);
      abrirModalSeparacao();
    } else {
      toast.error('Aguardando reposição de estoque para itens pendentes.');
    }
  };

  const handleEntregar = async () => {
    const itens_atendidos = montarItensEntrega(detalhe);
    await entregarItens(itens_atendidos);
  };

  const handleCancelar = async (id) => {
    if (!window.confirm('Cancelar esta requisição?')) return;
    try {
      const url = warehouseMode
        ? `/almoxarifado/requisicoes/${id}/cancelar`
        : `/requisicoes-material/${id}/cancelar`;
      await api.put(url);
      toast.success('Requisição cancelada');
      fecharDetalhe();
      loadRequisicoes();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao cancelar');
    }
  };

  const handleExcluir = async () => {
    const targetId = excluirTarget?.id;
    if (!targetId || !justificativaExclusao.trim()) {
      toast.error('Informe a justificativa da exclusão');
      return;
    }
    setSaving(true);
    try {
      const deleteUrl = warehouseMode
        ? `/almoxarifado/requisicoes/${targetId}`
        : `/requisicoes-material/${targetId}`;
      const res = await api.delete(deleteUrl, {
        data: { justificativa: justificativaExclusao.trim() },
      });
      const estornados = res.data?.estornos?.length || 0;
      toast.success(estornados > 0
        ? `Requisição excluída. Estoque estornado em ${estornados} item(ns).`
        : 'Requisição excluída.');
      setShowExcluir(false);
      setExcluirTarget(null);
      setJustificativaExclusao('');
      if (selectedId === targetId) fecharDetalhe();
      loadRequisicoes();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao excluir requisição');
    } finally {
      setSaving(false);
    }
  };

  const abrirExcluirModal = (requisicao, { temEntregue = false } = {}) => {
    setExcluirTarget({
      id: requisicao.id,
      numero: requisicao.numero,
      temEntregue,
    });
    setJustificativaExclusao('');
    setShowExcluir(true);
  };

  // Ações do ciclo completo (Task 6) — todas exclusivas de /almoxarifado/requisicoes;
  // /requisicoes-material não tem essas rotas, por isso os botões só aparecem em
  // warehouseMode (ver JSX abaixo).
  const closeConfirmDialog = () => setConfirmDialog(null);

  const handleEnviar = async (id) => {
    setSaving(true);
    try {
      await api.post(`/almoxarifado/requisicoes/${id}/enviar`);
      toast.success('Requisição enviada para aprovação!');
      closeConfirmDialog();
      await abrirDetalhe(id, { force: true });
      await loadRequisicoes();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao enviar requisição');
    } finally {
      setSaving(false);
    }
  };

  const handleLiberarRetirada = async (id) => {
    setSaving(true);
    try {
      await api.put(`/almoxarifado/requisicoes/${id}/liberar-retirada`);
      toast.success('Requisição liberada para retirada!');
      closeConfirmDialog();
      await abrirDetalhe(id, { force: true });
      await loadRequisicoes();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao liberar retirada');
    } finally {
      setSaving(false);
    }
  };

  // Etapa 28 (C3/C6): segunda conferência da separação. Sem corpo — quem confere é o
  // usuário logado, e o backend recusa (403) quem aparece em qualquer rodada de separação.
  const handleConferirSeparacao = async (id) => {
    setSaving(true);
    try {
      await api.put(`/almoxarifado/requisicoes/${id}/conferir-separacao`);
      toast.success('Separação conferida!');
      await abrirDetalhe(id, { force: true });
      await loadRequisicoes();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao conferir separação');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmarRecebimento = async (id) => {
    setSaving(true);
    try {
      await api.put(`/almoxarifado/requisicoes/${id}/confirmar-recebimento`);
      toast.success('Recebimento confirmado!');
      closeConfirmDialog();
      await abrirDetalhe(id, { force: true });
      await loadRequisicoes();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao confirmar recebimento');
    } finally {
      setSaving(false);
    }
  };

  const handleEncerrar = async () => {
    if (!detalhe) return;
    setSaving(true);
    try {
      await api.put(`/almoxarifado/requisicoes/${detalhe.id}/encerrar`, {
        motivo: motivoEncerramento.trim() || undefined,
      });
      toast.success('Requisição encerrada!');
      setShowEncerrar(false);
      setMotivoEncerramento('');
      await abrirDetalhe(detalhe.id, { force: true });
      await loadRequisicoes();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao encerrar requisição');
    } finally {
      setSaving(false);
    }
  };

  const handleCopiar = async (id) => {
    setSaving(true);
    try {
      const res = await api.post(`/almoxarifado/requisicoes/${id}/copiar`);
      toast.success(`Rascunho ${res.data.numero} criado a partir desta requisição!`);
      closeConfirmDialog();
      await loadRequisicoes();
      await abrirDetalhe(res.data.id, { force: true });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao copiar requisição');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

  // Etapa 28 (C6). `separacoes`/`conferencia`/`conferencia_obrigatoria` só vêm do
  // GET /almoxarifado/requisicoes/:id — no modo não-warehouse (/requisicoes-material/:id)
  // não existem, por isso os defaults: sem eles, a tela se comporta como antes.
  const separacoes = detalhe?.separacoes || [];
  const euSeparei = !!user?.id && separacoes.some((s) => Number(s.usuario_id) === Number(user.id));
  const conferenciaPendente = !!detalhe?.conferencia_obrigatoria && !detalhe?.conferencia;
  const TITLE_CONFERENCIA_PENDENTE = 'Esta requisição tem material crítico separado e precisa da segunda conferência antes de sair';

  const StatusBadge = ({ status }) => {
    const info = STATUS_INFO[status] || { label: status, cls: 'almox-badge-ajuste', icon: FiClock };
    const Icon = info.icon;
    return <span className={`almox-badge ${info.cls}`}><Icon size={10} />{info.label}</span>;
  };

  const UrgenciaBadge = ({ urgencia }) => {
    const info = URGENCIA_INFO[urgencia] || URGENCIA_INFO.NORMAL;
    if (urgencia === 'NORMAL') return null;
    return (
      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: info.cor, display: 'flex', alignItems: 'center', gap: 3 }}>
        <FiAlertTriangle size={10} />{info.label}
      </span>
    );
  };

  // Filtro por tipo é só local (GET /almoxarifado/requisicoes não tem query param
  // tipo_requisicao no server) — filtra o array já carregado, sem round-trip.
  const requisicoesExibidas = filtroTipo
    ? requisicoes.filter((r) => r.tipo_requisicao === filtroTipo)
    : requisicoes;

  return (
    <div className="almox-page">
      <AlmoxPageHeader
        title={warehouseMode ? 'Requisições de Material' : 'Minhas Requisições de Material'}
        subtitle={warehouseMode
          ? `${requisicoesExibidas.length} requisição${requisicoesExibidas.length !== 1 ? 'ões' : ''}`
          : `Setor: ${ctx.setor} · ${requisicoesExibidas.length} registro${requisicoesExibidas.length !== 1 ? 's' : ''}`}
        breadcrumbs={[{ label: warehouseMode ? 'Requisições' : 'Minhas Requisições' }]}
        flowSteps={warehouseMode ? REQUISICAO_FLOW : undefined}
        currentStep={warehouseMode && detalhe ? getRequisicaoStepIndex(detalhe.status) : undefined}
        actions={
          <>
            <button className="btn-almox-secondary" onClick={refreshAll} title="Atualizar lista e detalhe">
              <FiRefreshCw size={13} />
            </button>
            <button className="btn-almox-primary" onClick={() => navigate(novaPath)}>
              <FiPlus size={14} /> Nova Requisição
            </button>
          </>
        }
      />

      {/* Filtros */}
      <div className="almox-filters">
        {warehouseMode && (souAprovadorValor || isAdmin) && (
          <button
            className={filtroAprovacoesValor ? 'btn-almox-primary' : 'btn-almox-secondary'}
            onClick={() => {
              setFiltroAprovacoesValor((v) => !v);
              if (!filtroAprovacoesValor) setFiltroStatus('');
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <FiDollarSign size={13} /> Aprovações de valor
          </button>
        )}
        <select className="almox-select" value={filtroStatus} disabled={filtroAprovacoesValor}
          onChange={e => { setFiltroStatus(e.target.value); setFiltroAprovacoesValor(false); }}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS_INFO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="almox-select" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="">Todos os tipos</option>
          {Object.entries(TIPO_REQUISICAO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.875rem', color: 'var(--gmp-text)' }}>
          <input type="checkbox" checked={filtroMinha} onChange={e => setFiltroMinha(e.target.checked)} />
          {warehouseMode ? 'Apenas minhas' : 'Somente minhas solicitações'}
        </label>
        {(filtroStatus || filtroMinha || filtroAprovacoesValor || filtroTipo) && (
          <button className="btn-almox-secondary" onClick={() => { setFiltroStatus(''); setFiltroMinha(false); setFiltroAprovacoesValor(false); setFiltroTipo(''); }}>
            <FiFilter size={13} /> Limpar
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedId ? '1fr 420px' : '1fr', gap: 20 }}>
        {/* Tabela */}
        <div className="almox-table-container">
          {loading ? <SkeletonTable rows={8} columns={6} /> : requisicoesExibidas.length === 0 ? (
            <div className="almox-empty"><p>Nenhuma requisição encontrada</p></div>
          ) : (
            <table className="almox-table">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Solicitante</th>
                  <th>Tipo</th>
                  <th>Urgência</th>
                  <th>OS / Ref.</th>
                  <th>Itens</th>
                  {warehouseMode && <th>Valor</th>}
                  <th>Status</th>
                  <th>Data</th>
                  {isAdmin && <th style={{ width: 56 }}>Ações</th>}
                </tr>
              </thead>
              <tbody>
                {requisicoesExibidas.map(r => (
                  <tr key={r.id} style={{ cursor: 'pointer', background: selectedId === r.id ? 'rgba(79,172,254,0.06)' : '' }}
                    onClick={() => abrirDetalhe(r.id, { force: true })}>
                    <td>
                      <div style={{ fontWeight: 700, fontFamily: 'monospace', color: '#4facfe' }}>{r.numero}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{r.solicitante_nome}</div>
                      {r.departamento && <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>{r.departamento}</div>}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>{TIPO_REQUISICAO_LABELS[r.tipo_requisicao] || r.tipo_requisicao || '—'}</td>
                    <td><UrgenciaBadge urgencia={r.urgencia} /></td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>{r.os_referencia || '—'}</td>
                    <td style={{ fontWeight: 700 }}>{r.total_itens}</td>
                    {warehouseMode && (
                      <td style={{ fontSize: '0.8rem', fontWeight: 600, color: r.requer_aprovacao_valor ? 'var(--gmp-warning)' : 'var(--gmp-text)' }}>
                        {formatMoeda(r.valor_total)}
                      </td>
                    )}
                    <td><StatusBadge status={r.status} /></td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)', whiteSpace: 'nowrap' }}>{formatDate(r.created_at)}</td>
                    {isAdmin && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="btn-almox-danger"
                          title="Excluir requisição"
                          style={{ padding: '4px 8px', minWidth: 0 }}
                          onClick={() => abrirExcluirModal(r)}
                        >
                          <FiTrash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Painel de detalhe */}
        {selectedId && (
          <div style={{ background: 'var(--gmp-surface)', border: '1px solid var(--gmp-border)', borderRadius: 12, overflow: 'hidden', height: 'fit-content', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--gmp-border)', background: 'var(--gmp-bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, zIndex: 2 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: '#4facfe', fontFamily: 'monospace' }}>{detalhe?.numero || '...'}</div>
                {detalhe && <StatusBadge status={detalhe.status} />}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                {detalhe && (
                  <button
                    type="button"
                    className="btn-almox-secondary"
                    title="Atualizar detalhe e saldos"
                    style={{ padding: '4px 8px', minWidth: 0 }}
                    onClick={() => abrirDetalhe(detalhe.id, { force: true })}
                    disabled={loadingDetalhe}
                  >
                    <FiRefreshCw size={14} style={loadingDetalhe ? { animation: 'spin 1s linear infinite' } : undefined} />
                  </button>
                )}
                <button className="almox-modal-close" onClick={fecharDetalhe}>✕</button>
              </div>
            </div>

            {loadingDetalhe || !detalhe ? (
              <div className="almox-loading"><FiRefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Carregando...</div>
            ) : (
              <div style={{ padding: 20 }}>
                {/* Info */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                  {[
                    ['Solicitante', detalhe.solicitante_nome],
                    ['Tipo', TIPO_REQUISICAO_LABELS[detalhe.tipo_requisicao] || detalhe.tipo_requisicao || '—'],
                    ['Departamento', detalhe.departamento || '—'],
                    ['OS / Referência', detalhe.os_referencia || '—'],
                    ['Urgência', URGENCIA_INFO[detalhe.urgencia]?.label || detalhe.urgencia],
                    ['Data', formatDate(detalhe.created_at)],
                    ...(detalhe.valor_total != null ? [['Valor Total', formatMoeda(detalhe.valor_total)]] : []),
                    ['Aprovador', detalhe.aprovador_nome || '—'],
                    ...(detalhe.aprovador_valor_nome ? [['Aprov. Valor', detalhe.aprovador_valor_nome]] : []),
                  ].map(([k, v]) => (
                    <div key={k}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--gmp-text-light)', textTransform: 'uppercase', fontWeight: 600 }}>{k}</div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--gmp-text)', fontWeight: 500 }}>{v}</div>
                    </div>
                  ))}
                </div>
                {detalhe.observacoes && (
                  <div style={{ background: 'var(--gmp-bg)', border: '1px solid var(--gmp-border)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem', color: 'var(--gmp-text-light)' }}>
                    💬 {detalhe.observacoes}
                  </div>
                )}
                {detalhe.rejeicao_motivo && (
                  <div style={{ background: 'rgba(229,25,58,0.06)', border: '1px solid rgba(229,25,58,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem', color: 'var(--gmp-error)' }}>
                    ❌ Motivo: {detalhe.rejeicao_motivo}
                  </div>
                )}
                {detalhe.recebimento_confirmado_em && (
                  <div style={{ background: 'rgba(26,163,74,0.08)', border: '1px solid rgba(26,163,74,0.25)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem', color: 'var(--gmp-success)' }}>
                    <FiUserCheck size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                    Recebimento confirmado pelo solicitante em {formatDate(detalhe.recebimento_confirmado_em)}
                  </div>
                )}
                {detalhe.status === 'AGUARDANDO_APROVACAO_VALOR' && (
                  <div style={{ background: 'rgba(229,152,0,0.08)', border: '1px solid rgba(229,152,0,0.25)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem', color: 'var(--gmp-warning)' }}>
                    <FiDollarSign size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                    Valor total de <strong>{formatMoeda(detalhe.valor_total)}</strong> excede o limite de liberação automática.
                    Aguardando aprovação de alto valor.
                  </div>
                )}

                {/* Itens */}
                <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--gmp-text)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                  Itens ({detalhe.itens.length})
                </div>
                {detalhe.itens.map(item => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--gmp-border)' }}>
                    {item.foto ? (
                      <img src={resolveMaterialPhotoUrl(item.foto)} alt={item.material_nome} className="almox-foto-thumb" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    ) : (
                      <div className="almox-foto-placeholder"><FiPackage size={16} /></div>
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {item.tipo_icone && <span>{item.tipo_icone}</span>}
                        {item.material_nome}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>
                        {item.material_codigo} · Saldo: {item.saldo_atual} {item.unidade}
                        {item.localizacao && (
                          <span> · 📍 {prefixarAlmoxarifado(item.localizacao, item.almoxarifado_codigo)}</span>
                        )}
                      </div>
                      {item.localizacao_padrao_id && (
                        <Link to={`/almoxarifado/mapa?loc=${item.localizacao_padrao_id}`}
                          style={{ fontSize: '0.7rem', color: '#4facfe', display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 2 }}
                          onClick={e => e.stopPropagation()}>
                          <FiMap size={10} /> Ver no mapa
                        </Link>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', minWidth: 130 }}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--gmp-text-light)', lineHeight: 1.5 }}>
                        <div>Solicitado: <strong>{item.quantidade_solicitada}</strong></div>
                        <div>Separado: <strong>{getSeparado(item)}</strong></div>
                        <div>Entregue: <strong style={{ color: getEntregue(item) > 0 ? 'var(--gmp-success)' : 'inherit' }}>{getEntregue(item)}</strong></div>
                        {getPendente(item) > 0 && (
                          <div style={{ color: 'var(--gmp-warning)' }}>Pendente: <strong>{getPendente(item)}</strong></div>
                        )}
                      </div>
                      {getPendente(item) > 0 && Number(item.saldo_atual) < getPendente(item) && maxQtdEntrega(item) > 0 && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--gmp-warning)', marginTop: 4 }}>
                          ⚠ Saldo insuficiente para quantidade total — entrega parcial disponível
                        </div>
                      )}
                      {getPendente(item) > 0 && maxQtdEntrega(item) <= 0 && getEntregue(item) > 0 && Number(item.saldo_atual) < getPendente(item) && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--gmp-error)', marginTop: 4 }}>⚠ Sem estoque para entrega</div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Rodadas de separação e segunda conferência (Etapa 28, C6) — leitura junto
                    da requisição, sem gate novo, no mesmo molde das assinaturas de entrega. */}
                {warehouseMode && (separacoes.length > 0 || detalhe.conferencia) && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--gmp-text)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                      Separação{separacoes.length > 0 ? ` (${separacoes.length})` : ''}
                    </div>
                    {separacoes.map((s) => (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--gmp-border)', fontSize: '0.82rem' }}>
                        <FiPackage size={12} style={{ color: 'var(--gmp-text-light)', flexShrink: 0 }} />
                        <span style={{ fontWeight: 600 }}>{s.usuario_nome || `Usuário #${s.usuario_id}`}</span>
                        <span style={{ color: 'var(--gmp-text-light)' }}>
                          · {formatDate(s.created_at)} · {Number(s.itens_tocados) || 0} {Number(s.itens_tocados) === 1 ? 'item' : 'itens'}
                        </span>
                      </div>
                    ))}
                    {detalhe.conferencia && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', fontSize: '0.82rem', color: 'var(--gmp-success, #2e7d32)' }}>
                        <FiCheckCircle size={13} style={{ flexShrink: 0 }} />
                        <span>
                          Conferida por <strong>{detalhe.conferencia.usuario_nome}</strong> em {formatDate(detalhe.conferencia.em)}
                        </span>
                      </div>
                    )}
                    {conferenciaPendente && (
                      <div className="almox-hint-banner" style={{ marginTop: 8, fontSize: '0.78rem', borderColor: 'var(--gmp-warning)' }}>
                        Há material crítico separado — outra pessoa do almoxarifado precisa conferir antes de liberar ou entregar.
                      </div>
                    )}
                  </div>
                )}

                {/* Assinaturas de entrega (Etapa 15, C2) — leitura junto da requisição,
                    sem gate novo: quem vê a requisição vê as assinaturas dela. */}
                {(detalhe.assinaturas_entrega || []).length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--gmp-text)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                      Assinaturas de Entrega ({detalhe.assinaturas_entrega.length})
                    </div>
                    {detalhe.assinaturas_entrega.map((a) => (
                      <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--gmp-border)' }}>
                        <a href={resolveMaterialPhotoUrl(a.arquivo_url)} target="_blank" rel="noreferrer" title="Abrir assinatura em tamanho real">
                          <img
                            src={resolveMaterialPhotoUrl(a.arquivo_url)}
                            alt={`Assinatura de ${a.recebedor_nome}`}
                            style={{ width: 72, height: 36, objectFit: 'contain', background: '#fff', border: '1px solid var(--gmp-border)', borderRadius: 6, display: 'block' }}
                          />
                        </a>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{a.recebedor_nome}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--gmp-text-light)' }}>
                            {formatDate(a.criado_em)}{a.criado_por_nome ? ` · colhida por ${a.criado_por_nome}` : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Ações — aprovação de valor */}
                {warehouseMode && detalhe.status === 'AGUARDANDO_APROVACAO_VALOR' && (souAprovadorValor || isAdmin) && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
                    <button className="btn-almox-primary" style={{ flex: 1, justifyContent: 'center', minWidth: 140 }}
                      onClick={handleAprovarValor} disabled={saving}>
                      <FiCheck size={14} /> Aprovar Liberação
                    </button>
                    <button className="btn-almox-danger" style={{ flex: 1, justifyContent: 'center', minWidth: 100 }}
                      onClick={() => setShowRejeitarValor(true)}>
                      <FiX size={14} /> Reprovar
                    </button>
                  </div>
                )}
                {warehouseMode && detalhe.status === 'AGUARDANDO_APROVACAO_VALOR' && !souAprovadorValor && !isAdmin && (
                  <div className="almox-hint-banner" style={{ marginTop: 20, fontSize: '0.8rem' }}>
                    Esta requisição aguarda aprovação de um aprovador de alto valor configurado.
                  </div>
                )}

                {/* Ação — rascunho: só sai do rascunho quando o solicitante (ou admin) envia */}
                {warehouseMode && detalhe.status === 'RASCUNHO' && (
                  <div style={{ marginTop: 20 }}>
                    <div className="almox-hint-banner" style={{ marginBottom: 12, fontSize: '0.8rem' }}>
                      Rascunho — a requisição só entra no fluxo de aprovação (e-mails, avaliação de valor) depois de enviada.
                    </div>
                    {(detalhe.solicitante_id === user?.id || isAdmin) && (
                      <button className="btn-almox-primary" style={{ width: '100%', justifyContent: 'center' }}
                        onClick={() => setConfirmDialog({
                          title: 'Enviar Requisição',
                          message: `Enviar a requisição ${detalhe.numero} para aprovação? Ela sai do rascunho e entra no fluxo normal.`,
                          confirmLabel: 'Enviar',
                          onConfirm: () => handleEnviar(detalhe.id),
                        })}
                        disabled={saving}>
                        <FiSend size={14} /> Enviar Requisição
                      </button>
                    )}
                  </div>
                )}

                {/* Ações — somente almoxarifado (aprovação/separação/entrega) */}
                {warehouseMode && detalhe.status === 'PENDENTE' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
                    <button className="btn-almox-primary" style={{ flex: 1, justifyContent: 'center', minWidth: 140 }}
                      onClick={(e) => { if (!bloquearSeNaoPode('aprovar_requisicao', e)) return; handleAprovar(detalhe.id, true); }} disabled={saving}
                      title="Aprova a requisição e já abre a separação dos materiais">
                      <FiCheck size={14} /> Aprovar e Separar
                    </button>
                    <button className="btn-almox-secondary" style={{ flex: 1, justifyContent: 'center', minWidth: 120 }}
                      onClick={(e) => { if (!bloquearSeNaoPode('aprovar_requisicao', e)) return; handleAprovar(detalhe.id, false); }} disabled={saving}
                      title="Aprova a requisição sem iniciar a separação agora">
                      <FiCheck size={14} /> Só Aprovar
                    </button>
                    <button className="btn-almox-danger" style={{ flex: 1, justifyContent: 'center', minWidth: 100 }}
                      onClick={(e) => {
                        // espelha a regra do backend: rejeitar a PRÓPRIA é desistência e
                        // qualquer solicitante pode; rejeitar a de outro exige o perfil.
                        const propria = detalhe.solicitante_id === user?.id;
                        if (!propria && !bloquearSeNaoPode('aprovar_requisicao', e)) return;
                        setShowRejeitar(true);
                      }}
                      title="Recusa a requisição — exige um motivo, que fica registrado para o solicitante">
                      <FiX size={14} /> Rejeitar
                    </button>
                  </div>
                )}
                {warehouseMode && ['APROVADO', 'AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA', 'PARCIALMENTE_RESERVADA', 'TOTALMENTE_RESERVADA'].includes(detalhe.status) && (
                  <div style={{ marginTop: 20 }}>
                    <div className="almox-hint-banner" style={{ marginBottom: 12, fontSize: '0.8rem' }}>
                      {detalhe.status === 'AGUARDANDO_ESTOQUE' && 'Sem saldo disponível no momento — inicie a separação assim que o estoque for reposto.'}
                      {detalhe.status === 'AGUARDANDO_COMPRA' && 'Sem saldo disponível — há uma solicitação de compra em andamento para os materiais desta requisição.'}
                      {detalhe.status === 'APROVADO' && 'Próximo passo: separe os materiais (máximo disponível em estoque) e confirme a entrega.'}
                      {detalhe.status === 'PARCIALMENTE_RESERVADA' && 'Parte dos itens não tinha saldo e ficou sem reserva — separe o que está reservado e acompanhe a reposição do restante.'}
                      {detalhe.status === 'TOTALMENTE_RESERVADA' && 'Todo o saldo desta requisição está reservado — inicie a separação.'}
                    </div>
                    <button className="btn-almox-primary" style={{ width: '100%', justifyContent: 'center' }}
                      onClick={(e) => { if (!bloquearSeNaoPode('separar_emitir', e)) return; abrirModalSeparacao(); }} disabled={saving}
                      title="Registra quanto de cada item foi separado fisicamente, limitado ao saldo disponível">
                      <FiPackage size={14} /> Iniciar Separação
                    </button>
                  </div>
                )}
                {warehouseMode && detalhe.status === 'EM_SEPARACAO' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
                    <button className="btn-almox-secondary" style={{ width: '100%', justifyContent: 'center' }}
                      onClick={(e) => { if (!bloquearSeNaoPode('separar_emitir', e)) return; abrirModalSeparacao(); }}
                      title="Corrige as quantidades já registradas na separação">
                      <FiPackage size={14} /> Ajustar Separação
                    </button>
                    {/* Etapa 28: segunda conferência — quem separou não confere (o backend
                        dá 403 de qualquer jeito; aqui o botão já nasce desabilitado). */}
                    {!detalhe.conferencia && detalhe.itens.some((i) => getSeparado(i) > 0) && (
                      <button className="btn-almox-secondary" style={{ width: '100%', justifyContent: 'center' }}
                        onClick={(e) => { if (!bloquearSeNaoPode('conferir_separacao', e)) return; handleConferirSeparacao(detalhe.id); }}
                        disabled={saving || euSeparei}
                        title={euSeparei
                          ? 'Você separou esta requisição — a segunda conferência precisa ser feita por outra pessoa'
                          : 'Confere fisicamente o que foi separado; obrigatória quando há material crítico'}>
                        <FiUserCheck size={14} /> Conferir separação
                      </button>
                    )}
                    {detalhe.itens.some((i) => getSeparado(i) > 0) && (
                      <button className="btn-almox-secondary" style={{ width: '100%', justifyContent: 'center' }}
                        onClick={(e) => {
                          if (!bloquearSeNaoPode('separar_emitir', e)) return;
                          setConfirmDialog({
                            title: 'Liberar para Retirada',
                            message: `Liberar a requisição ${detalhe.numero} para retirada? O solicitante poderá buscar os itens já separados.`,
                            confirmLabel: 'Liberar',
                            onConfirm: () => handleLiberarRetirada(detalhe.id),
                          });
                        }}
                        disabled={saving || conferenciaPendente}
                        title={conferenciaPendente ? TITLE_CONFERENCIA_PENDENTE : 'Marca a requisição como pronta para o solicitante buscar os itens já separados'}>
                        <FiCheckSquare size={14} /> Liberar para Retirada
                      </button>
                    )}
                    {temEntregavel(detalhe.itens) ? (
                      <button className="btn-almox-primary" style={{ width: '100%', justifyContent: 'center' }}
                        onClick={(e) => { if (!bloquearSeNaoPode('separar_emitir', e)) return; handleConfirmarEntrega({ direto: true }); }}
                        disabled={saving || conferenciaPendente}
                        title={conferenciaPendente ? TITLE_CONFERENCIA_PENDENTE : 'Entrega os itens separados e dá baixa no estoque — a movimentação fica registrada no livro'}>
                        <FiTruck size={14} /> {saving ? 'Confirmando...' : 'Confirmar Entrega e Baixar Estoque'}
                      </button>
                    ) : (
                      <div style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)', textAlign: 'center', padding: '8px 0' }}>
                        Nenhuma quantidade separada disponível para entrega no momento.
                      </div>
                    )}
                  </div>
                )}
                {warehouseMode && detalhe.status === 'PRONTA_PARA_RETIRADA' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
                    <div className="almox-hint-banner" style={{ fontSize: '0.8rem' }}>
                      Pronta para retirada — aguardando o solicitante buscar o material separado.
                    </div>
                    {temEntregavel(detalhe.itens) ? (
                      <button className="btn-almox-primary" style={{ width: '100%', justifyContent: 'center' }}
                        onClick={(e) => { if (!bloquearSeNaoPode('separar_emitir', e)) return; handleConfirmarEntrega({ direto: true }); }}
                        disabled={saving || conferenciaPendente}
                        title={conferenciaPendente ? TITLE_CONFERENCIA_PENDENTE : 'Entrega os itens separados e dá baixa no estoque — a movimentação fica registrada no livro'}>
                        <FiTruck size={14} /> {saving ? 'Confirmando...' : 'Confirmar Entrega e Baixar Estoque'}
                      </button>
                    ) : (
                      <div style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)', textAlign: 'center', padding: '8px 0' }}>
                        Nenhuma quantidade separada disponível para entrega no momento.
                      </div>
                    )}
                  </div>
                )}
                {warehouseMode && detalhe.status === 'PARCIALMENTE_ATENDIDA' && (() => {
                  const pendentes = totalPendente(detalhe.itens);
                  const podeEntregar = temPendenteComEstoque(detalhe.itens);
                  return (
                    <div style={{ marginTop: 20 }}>
                      <div className="almox-hint-banner" style={{ marginBottom: 12, fontSize: '0.8rem', borderColor: 'var(--gmp-warning)' }}>
                        {podeEntregar
                          ? `Atendimento parcial — ${pendentes} unidade${pendentes !== 1 ? 's' : ''} pendente${pendentes !== 1 ? 's' : ''} pronta${pendentes !== 1 ? 's' : ''} para entrega.`
                          : 'Atendimento parcial — itens pendentes aguardam reposição de estoque.'}
                      </div>
                      {podeEntregar ? (
                        <button className="btn-almox-primary" style={{ width: '100%', justifyContent: 'center' }}
                          onClick={handleCompletarEntrega} disabled={saving}>
                          <FiTruck size={14} /> Completar Entrega ({pendentes} pendente{pendentes !== 1 ? 's' : ''})
                        </button>
                      ) : (
                        <div style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)', textAlign: 'center', padding: '8px 0' }}>
                          Aguardando reposição de estoque para itens pendentes.
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Encerramento — a partir de ENTREGUE/PARCIALMENTE_ATENDIDA (design: "cancela
                    saldos pendentes, nenhuma entrega futura"). */}
                {warehouseMode && ['ENTREGUE', 'PARCIALMENTE_ATENDIDA'].includes(detalhe.status) && (
                  <button className="btn-almox-secondary" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
                    onClick={() => { setMotivoEncerramento(''); setShowEncerrar(true); }} disabled={saving}>
                    <FiArchive size={14} /> Encerrar Requisição
                  </button>
                )}

                {/* Assinatura avulsa (Etapa 15) — a entrega pode já ter acontecido sem
                    assinatura (RN-02); só nos status entregues (RN-03) e para quem entrega
                    (separar_emitir, RN-05 — mesmo perfil que colhe no fluxo da entrega). */}
                {warehouseMode
                  && ['ENTREGUE', 'PARCIALMENTE_ATENDIDA', 'ENCERRADA'].includes(detalhe.status)
                  && pode('separar_emitir') && (
                  <button className="btn-almox-secondary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                    onClick={() => abrirColherAssinatura(detalhe)} disabled={saving}>
                    ＋ Assinatura de entrega
                  </button>
                )}

                {/* Confirmação de recebimento — só o solicitante, não é status (design). */}
                {warehouseMode
                  && ['ENTREGUE', 'PARCIALMENTE_ATENDIDA', 'ENCERRADA'].includes(detalhe.status)
                  && detalhe.solicitante_id === user?.id
                  && !detalhe.recebimento_confirmado_em && (
                  <button className="btn-almox-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                    onClick={() => setConfirmDialog({
                      title: 'Confirmar Recebimento',
                      message: `Confirmar que você recebeu os materiais da requisição ${detalhe.numero}?`,
                      confirmLabel: 'Confirmar Recebimento',
                      onConfirm: () => handleConfirmarRecebimento(detalhe.id),
                    })}
                    disabled={saving}>
                    <FiUserCheck size={14} /> Confirmar Recebimento
                  </button>
                )}

                {(warehouseMode
                  ? ['RASCUNHO', 'PENDENTE', 'APROVADO', 'AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA', 'PARCIALMENTE_RESERVADA', 'TOTALMENTE_RESERVADA']
                  : ['PENDENTE', 'APROVADO', 'AGUARDANDO_ESTOQUE', 'AGUARDANDO_COMPRA', 'PARCIALMENTE_RESERVADA', 'TOTALMENTE_RESERVADA']
                ).includes(detalhe.status) && (
                  detalhe.solicitante_id === user?.id || isAdmin
                ) && (
                  <button className="btn-almox-secondary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                    onClick={() => handleCancelar(detalhe.id)}>
                    Cancelar Requisição
                  </button>
                )}

                {/* Copiar — qualquer requisição não-rascunho vira um novo rascunho fiel
                    (itens/tipo/vínculos), atalho de preenchimento (design). */}
                {warehouseMode && detalhe.status !== 'RASCUNHO' && (
                  <button className="btn-almox-secondary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                    onClick={() => setConfirmDialog({
                      title: 'Copiar Requisição',
                      message: `Criar um novo rascunho com os mesmos itens da requisição ${detalhe.numero}?`,
                      confirmLabel: 'Copiar',
                      onConfirm: () => handleCopiar(detalhe.id),
                    })}
                    disabled={saving}>
                    <FiCopy size={14} /> Copiar como Novo Rascunho
                  </button>
                )}

                {isAdmin && (
                  <button className="btn-almox-danger" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                    onClick={() => abrirExcluirModal(detalhe, {
                      temEntregue: detalhe.itens.some((i) => getEntregue(i) > 0),
                    })}>
                    <FiTrash2 size={14} /> Excluir Requisição
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal rejeitar valor */}
      {showRejeitarValor && (
        <div className="almox-modal-overlay" onClick={() => setShowRejeitarValor(false)}>
          <div className="almox-modal almox-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>❌ Reprovar Liberação por Valor</h2>
              <button className="almox-modal-close" onClick={() => setShowRejeitarValor(false)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <div className="almox-field">
                <label className="almox-label">Justificativa da reprovação<span className="required">*</span></label>
                <textarea className="almox-textarea" rows={3} value={motivoRejeicaoValor} required
                  onChange={e => setMotivoRejeicaoValor(e.target.value)}
                  placeholder="Informe o motivo para o solicitante..." />
              </div>
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setShowRejeitarValor(false)}>Cancelar</button>
              <button className="btn-almox-danger" onClick={handleRejeitarValor} disabled={saving || !motivoRejeicaoValor.trim()}>
                {saving ? 'Reprovando...' : 'Confirmar Reprovação'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal rejeitar */}
      {showRejeitar && (
        <div className="almox-modal-overlay" onClick={() => setShowRejeitar(false)}>
          <div className="almox-modal almox-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>❌ Rejeitar Requisição</h2>
              <button className="almox-modal-close" onClick={() => setShowRejeitar(false)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <div className="almox-field">
                <label className="almox-label">Motivo da rejeição<span className="required">*</span></label>
                <textarea className="almox-textarea" rows={3} value={motivoRejeicao} required
                  onChange={e => setMotivoRejeicao(e.target.value)}
                  placeholder="Informe o motivo para o solicitante..." />
              </div>
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setShowRejeitar(false)}>Cancelar</button>
              <button className="btn-almox-danger" onClick={handleRejeitar} disabled={saving || !motivoRejeicao.trim()}>
                {saving ? 'Rejeitando...' : 'Confirmar Rejeição'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal encerrar (motivo opcional, design: "body {motivo} opcional") */}
      {showEncerrar && detalhe && (
        <div className="almox-modal-overlay" onClick={() => !saving && setShowEncerrar(false)}>
          <div className="almox-modal almox-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>🔒 Encerrar Requisição</h2>
              <button className="almox-modal-close" onClick={() => setShowEncerrar(false)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <p style={{ color: 'var(--gmp-text-light)', marginBottom: 12, fontSize: '0.875rem' }}>
                Encerrar a requisição <strong>{detalhe.numero}</strong> cancela qualquer saldo pendente — não será mais possível
                entregar itens desta requisição depois disso.
              </p>
              <div className="almox-field">
                <label className="almox-label">Motivo (opcional)</label>
                <textarea className="almox-textarea" rows={3} value={motivoEncerramento}
                  onChange={e => setMotivoEncerramento(e.target.value)}
                  placeholder="Observação sobre o encerramento (opcional)..." />
              </div>
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setShowEncerrar(false)} disabled={saving}>Cancelar</button>
              <button className="btn-almox-primary" onClick={handleEncerrar} disabled={saving}>
                {saving ? 'Encerrando...' : 'Confirmar Encerramento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmação simples — Enviar, Liberar Retirada, Confirmar Recebimento, Copiar */}
      {confirmDialog && (
        <div className="almox-modal-overlay" onClick={() => !saving && setConfirmDialog(null)}>
          <div className="almox-modal almox-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>{confirmDialog.title}</h2>
              <button className="almox-modal-close" onClick={() => setConfirmDialog(null)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <p style={{ color: 'var(--gmp-text-light)', fontSize: '0.875rem' }}>{confirmDialog.message}</p>
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setConfirmDialog(null)} disabled={saving}>Cancelar</button>
              <button className="btn-almox-primary" onClick={confirmDialog.onConfirm} disabled={saving}>
                {saving ? 'Processando...' : (confirmDialog.confirmLabel || 'Confirmar')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal separação */}
      {showSeparar && detalhe && (
        <div className="almox-modal-overlay" onClick={() => setShowSeparar(false)}>
          <div className="almox-modal" onClick={e => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>📦 Separar Materiais — {detalhe.numero}</h2>
              <button className="almox-modal-close" onClick={() => setShowSeparar(false)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <p style={{ color: 'var(--gmp-text-light)', marginBottom: 16, fontSize: '0.875rem' }}>
                Informe a quantidade a separar. Não é possível separar mais que o estoque disponível.
              </p>
              {detalhe.itens.filter(i => maxQtdSeparacao(i) > 0).map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--gmp-border)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{item.material_nome}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>
                      Solicitado: {item.quantidade_solicitada} · Já separado: {getSeparado(item)} · Saldo: {item.saldo_atual}
                    </div>
                  </div>
                  <div>
                    <input className="almox-count-input" type="number" min="0" step="1"
                      max={maxQtdSeparacao(item)}
                      value={quantidadesSeparacao[item.id] ?? ''}
                      onChange={e => setQuantidadesSeparacao(q => ({ ...q, [item.id]: e.target.value }))} />
                    <div style={{ fontSize: '0.7rem', color: 'var(--gmp-text-light)', textAlign: 'right', marginTop: 2 }}>{item.unidade}</div>
                  </div>
                </div>
              ))}
              {detalhe.itens.every(i => maxQtdSeparacao(i) <= 0) && (
                <p style={{ color: 'var(--gmp-text-light)', fontSize: '0.85rem' }}>Nenhum item com estoque disponível para separação.</p>
              )}
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setShowSeparar(false)}>Cancelar</button>
              <button className="btn-almox-primary" onClick={handleSeparacao} disabled={saving || detalhe.itens.every(i => maxQtdSeparacao(i) <= 0)}>
                {saving ? 'Separando...' : '📦 Confirmar Separação'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal entrega */}
      {showEntregar && detalhe && (
        <div className="almox-modal-overlay" onClick={() => setShowEntregar(false)}>
          <div className="almox-modal" onClick={e => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>🚚 Confirmar Entrega — {detalhe.numero}</h2>
              <button className="almox-modal-close" onClick={() => setShowEntregar(false)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <p style={{ color: 'var(--gmp-text-light)', marginBottom: 16, fontSize: '0.875rem' }}>
                Informe a quantidade a entregar nesta rodada. O estoque será baixado apenas do que for confirmado.
              </p>
              {detalhe.itens.filter(i => maxQtdEntrega(i) > 0).map(item => {
                const qtdEntregar = parseFloat(quantidadesEntrega[item.id] || 0) || 0;
                const permanecePendente = Math.max(0, getPendente(item) - qtdEntregar);
                const saldoInsuficienteTotal = getPendente(item) > Number(item.saldo_atual);
                return (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--gmp-border)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{item.material_nome}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>
                      Solicitado: {item.quantidade_solicitada} · Separado: {getSeparado(item)} · Entregue: {getEntregue(item)} · Pendente: {getPendente(item)} · Saldo: {item.saldo_atual}
                    </div>
                    {saldoInsuficienteTotal && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--gmp-warning)', marginTop: 4 }}>
                        Saldo insuficiente para quantidade total — será entregue o máximo disponível
                      </div>
                    )}
                    {qtdEntregar > 0 && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--gmp-success)', marginTop: 4, fontWeight: 600 }}>
                        Será entregue: {qtdEntregar} {item.unidade} | Permanecerá pendente: {permanecePendente} {item.unidade}
                      </div>
                    )}
                  </div>
                  <div>
                    <input className="almox-count-input" type="number" min="0" step="1"
                      max={maxQtdEntrega(item)}
                      value={quantidadesEntrega[item.id] ?? ''}
                      onChange={e => setQuantidadesEntrega(q => ({ ...q, [item.id]: e.target.value }))} />
                    <div style={{ fontSize: '0.7rem', color: 'var(--gmp-text-light)', textAlign: 'right', marginTop: 2 }}>{item.unidade}</div>
                  </div>
                </div>
              );})}
              {detalhe.itens.every(i => maxQtdEntrega(i) <= 0) && (
                <p style={{ color: 'var(--gmp-text-light)', fontSize: '0.85rem' }}>Nenhum item disponível para entrega no momento.</p>
              )}
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setShowEntregar(false)}>Cancelar</button>
              <button className="btn-almox-primary" onClick={handleEntregar} disabled={saving || detalhe.itens.every(i => maxQtdEntrega(i) <= 0)}>
                {saving ? 'Confirmando...' : '✅ Confirmar Entrega'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal assinatura do recebedor (Etapa 15) — etapa opcional depois da entrega e
          também pelo botão avulso do detalhe. "Pular" fecha SEM POST (RN-02). */}
      {assinaturaPos && (
        <div className="almox-modal-overlay" onClick={() => !enviandoAssinatura && setAssinaturaPos(null)}>
          <div className="almox-modal almox-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>✍ Colher assinatura do recebedor{assinaturaPos.numero ? ` — ${assinaturaPos.numero}` : ''}</h2>
              <button className="almox-modal-close" onClick={() => !enviandoAssinatura && setAssinaturaPos(null)} disabled={enviandoAssinatura}>✕</button>
            </div>
            <div className="almox-modal-body">
              <p style={{ color: 'var(--gmp-text-light)', marginBottom: 12, fontSize: '0.85rem' }}>
                Etapa opcional — a entrega já está registrada. Se o recebedor não puder assinar
                agora, use <strong>Pular</strong>; dá para colher a assinatura depois pelo
                detalhe da requisição.
              </p>
              <div className="almox-field">
                <label className="almox-label">Nome do recebedor<span className="required">*</span></label>
                <input className="almox-input" type="text" maxLength={120} value={assinaturaNome}
                  onChange={e => setAssinaturaNome(e.target.value)}
                  placeholder="Nome de quem recebeu o material..." />
              </div>
              <div className="almox-field">
                <label className="almox-label">Assinatura</label>
                <AssinaturaCanvas onConfirm={enviarAssinatura} height={180} />
              </div>
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setAssinaturaPos(null)} disabled={enviandoAssinatura}>
                Pular
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal excluir (admin) */}
      {showExcluir && excluirTarget && (
        <div className="almox-modal-overlay" onClick={() => { setShowExcluir(false); setExcluirTarget(null); }}>
          <div className="almox-modal almox-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>🗑 Excluir Requisição</h2>
              <button className="almox-modal-close" onClick={() => { setShowExcluir(false); setExcluirTarget(null); }}>✕</button>
            </div>
            <div className="almox-modal-body">
              <p style={{ color: 'var(--gmp-text-light)', marginBottom: 12, fontSize: '0.875rem' }}>
                Esta ação remove a requisição <strong>{excluirTarget.numero}</strong> do sistema.
                {excluirTarget.temEntregue && (
                  <span style={{ display: 'block', marginTop: 8, color: 'var(--gmp-warning)' }}>
                    Itens já entregues terão o estoque estornado automaticamente.
                  </span>
                )}
              </p>
              <div className="almox-field">
                <label className="almox-label">Justificativa da exclusão *</label>
                <textarea className="almox-textarea" rows={3} value={justificativaExclusao}
                  onChange={e => setJustificativaExclusao(e.target.value)}
                  placeholder="Informe o motivo da exclusão..." />
              </div>
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => { setShowExcluir(false); setExcluirTarget(null); }}>Cancelar</button>
              <button className="btn-almox-danger" onClick={handleExcluir}
                disabled={saving || !justificativaExclusao.trim()}>
                {saving ? 'Excluindo...' : 'Confirmar Exclusão'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RequisicoesList;
