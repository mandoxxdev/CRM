import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { getEffectiveUser } from '../../services/permissionsCache';
import { fetchComercialResponsaveis } from '../../utils/userFilters';
import { toast } from 'react-toastify';
import { mensagemDoErroEmBlob } from '../../utils/baixarDocumentoPedido';
import { FiSave, FiX, FiUser, FiFileText, FiEye, FiDownload, FiPlus, FiTrash2, FiBarChart2, FiUpload, FiPaperclip, FiPercent, FiSend } from 'react-icons/fi';
import SelecaoProdutosPremium from '../SelecaoProdutosPremium';
import {
  opcoesStatusProposta,
  ORIGENS_BUSCA,
  MOTIVOS_NAO_VENDA,
  REGIOES_BUSCA,
  FAMILIAS_PRODUTO_PADRAO,
  STATUS_EXIGE_MOTIVO
} from '../../constants/propostaComercial';
import { nomeArquivoPdfProposta } from '../../utils/nomeArquivoPdf';
import { formatarMoedaBR, digitadoParaValor } from '../../utils/moeda';
import { rotuloDaCotacao } from './valorDaProposta';
import {
  IDIOMAS_PROPOSTA, MOEDAS_PROPOSTA, INCOTERMS, separarIncoterm, montarIncoterm, idiomaDoBanco, moedaDoBanco,
} from './idiomaProposta';
import { lerAcessoriosParaEdicao, totalAcessoriosDosItens } from '../../utils/acessoriosItem';
import { montarPayloadProposta } from './payloadProposta';
import { hojeLocalISO } from '../../utils/dataLocal';
import './PropostaForm.css';

const TIPOS = [
  { value: 'comercial', label: 'Comercial' },
  { value: 'tecnica', label: 'Técnica' },
  { value: 'orcamento', label: 'Orçamento' },
  { value: 'aditivo', label: 'Aditivo' }
];

const defaultForm = {
  numero_proposta: '',
  cliente_id: '',
  titulo: '',
  descricao: '',
  validade: '',
  condicoes_pagamento: '',
  prazo_entrega: '',
  garantia: '',
  observacoes: '',
  oportunidade_id: '',
  tipo_proposta: '',
  expira_em: '',
  responsavel_id: '',
  margem_desconto: 0,
  status: 'rascunho',
  origem_busca: '',
  motivo_nao_venda: '',
  familia_produto: '',
  lembrete_data: '',
  lembrete_mensagem: '',
  probabilidade: 50,
  data_fechamento: '',
  // Proposta para fora do Brasil (RN-BI.01/08/09) — o servidor ja gravava as tres colunas; faltava a tela.
  idioma: 'pt-BR',
  moeda: 'BRL',
  // Cotação (reais por 1 unidade da moeda) — só em USD/EUR; vazia, o servidor grava a PTAX do dia (25/11/2026).
  taxa_cambio: '',
  incoterm: ''
};

const DESCONTO_LIMITE_SEM_APROVACAO = 5;

function emptyItem() {
  return {
    descricao: '',
    quantidade: 1,
    unidade: 'UN',
    valor_unitario: 0,
    valor_total: 0,
    codigo_produto: '',
    familia_produto: '',
    regiao_busca: '',
    manual: true,
    preco_tabela: null,
    desconto_percentual: 0
  };
}

// Exportada para teste (Etapa 142, Fase 5 r3 S42): o item do catálogo nasce SEM `id` — o id do produto não é id de item gravado, e o
// servidor o tomaria como tal (o item novo "roubaria" o par do gravado de mesmo produto).
export function produtoParaItem(p) {
  const preco = Number(p.preco_base) || 0;
  return {
    descricao: p.nome || p.descricao || '',
    quantidade: 1,
    unidade: p.unidade || 'UN',
    valor_unitario: preco,
    valor_total: preco,
    codigo_produto: p.codigo || '',
    familia_produto: p.familia || p.familia_produto || '',
    regiao_busca: '',
    manual: false,
    preco_tabela: preco,
    desconto_percentual: 0
  };
}

/**
 * Preço do item do catálogo editado à mão (pedido do Comercial, 24/11/2026: "devo poder mudar manualmente o preço"). Abaixo do preço de
 * tabela, a diferença É desconto do item e entra na MESMA regra de aprovação do desconto da proposta (acima do limite: rascunho +
 * Aprovações) — senão baixar o preço à mão passaria por fora da aprovação. Acima da tabela (ou tabela zero, como serviço) = 0.
 */
/** Reais por 1 unidade da moeda da proposta: 1 em BRL; em USD/EUR a cotação do campo ("5,8573" ou "5.8573"); sem cotação, null. */
export function reaisPorUnidade(moeda, taxaCambio) {
  if (!moeda || moeda === 'BRL') return 1;
  const t = String(taxaCambio == null ? '' : taxaCambio).trim();
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return n > 0 ? n : null;
}

/**
 * Desconto do item do catálogo: quanto o valor ficou abaixo da tabela. A tabela do catálogo é em REAIS; numa proposta em dólar ou
 * euro ela é convertida pela cotação da proposta antes de comparar (25/11/2026: US$ 23.550 contra uma tabela de R$ 100.000 dava
 * "76% abaixo" e pedia aprovação). Sem cotação não há como comparar: 0.
 */
export function descontoDoItem(it, reaisPorUn = 1) {
  if (!it || it.manual) return 0;
  if (!(Number(reaisPorUn) > 0)) return 0;
  const tabela = (Number(it.preco_tabela) || 0) / Number(reaisPorUn);
  const v = Number(it.valor_unitario) || 0;
  if (tabela <= 0 || v >= tabela) return 0;
  return Math.round((1 - v / tabela) * 10000) / 100;
}

function calcValorComDesconto(precoTabela, descontoPerc) {
  const base = Number(precoTabela) || 0;
  const d = Math.min(100, Math.max(0, Number(descontoPerc) || 0));
  return Math.round(base * (1 - d / 100) * 100) / 100;
}

export default function PropostaForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const effectiveUser = getEffectiveUser(user);
  const isEdit = Boolean(id);
  const [form, setForm] = useState({ ...defaultForm });
  // Etapa 140 (RN-140.12b): o status GRAVADO (o do carregamento) — o seletor só oferece "Desconto aprovado" quando a proposta já está nele.
  const [statusGravado, setStatusGravado] = useState('rascunho');
  const [itens, setItens] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [usuariosReady, setUsuariosReady] = useState(false);
  const [oportunidades, setOportunidades] = useState([]);
  const [familiasFromApi, setFamiliasFromApi] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [showProdutos, setShowProdutos] = useState(false);
  const [gerandoNumero, setGerandoNumero] = useState(false);
  const [pdfAnexo, setPdfAnexo] = useState(null);
  const [pdfNome, setPdfNome] = useState('');
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [descontoModalOpen, setDescontoModalOpen] = useState(false);
  const [descontoEditValor, setDescontoEditValor] = useState('');

  // Os acessórios entram no subtotal porque são linhas próprias da tabela de preços, com
  // valor próprio — o mesmo cálculo que o servidor faz ao montar o documento.
  const subtotalItens = useMemo(
    () => itens.reduce((s, i) => s + (Number(i.valor_total) || 0), 0) + totalAcessoriosDosItens(itens),
    [itens]
  );
  const descontoPercentual = Number(form.margem_desconto) || 0;
  const descontoRequerAprovacao = descontoPercentual > DESCONTO_LIMITE_SEM_APROVACAO;
  const valorDescontoRs = subtotalItens * (descontoPercentual / 100);
  const totalComDesconto = Math.max(0, subtotalItens - valorDescontoRs);

  const familiasProduto = useMemo(() => {
    const fromApi = (familiasFromApi || []).map((f) => (typeof f === 'string' ? f : f.nome)).filter(Boolean);
    const base = fromApi.length > 0 ? fromApi : FAMILIAS_PRODUTO_PADRAO;
    return base.includes('Outros') ? base : [...base, 'Outros'];
  }, [familiasFromApi]);

  const exigeMotivo = STATUS_EXIGE_MOTIVO.includes(form.status);

  const gerarNumeroProposta = useCallback(async (clienteId, responsavelId) => {
    if (!clienteId) return;
    setGerandoNumero(true);
    setForm((prev) => ({ ...prev, numero_proposta: 'Gerando...' }));
    try {
      const { data } = await api.get(`/propostas/gerar-numero/${clienteId}`, {
        params: { responsavel_id: responsavelId || '', revisao: 0 }
      });
      if (data?.numero_proposta) {
        setForm((prev) => ({ ...prev, numero_proposta: data.numero_proposta }));
      }
    } catch {
      setForm((prev) => ({ ...prev, numero_proposta: '' }));
      toast.error('Erro ao gerar número da proposta.');
    } finally {
      setGerandoNumero(false);
    }
  }, []);

  const recalcTotal = useCallback(() => {
    // Os acessórios contam aqui também: este valor_total é o que vai para propostas e o que
    // o dashboard soma como valor aprovado. Sem eles, uma proposta fechada apareceria nos
    // números por menos do que foi vendida.
    const t = itens.reduce((s, i) => s + (Number(i.valor_total) || 0), 0) + totalAcessoriosDosItens(itens);
    setForm((f) => ({ ...f, valor_total: t }));
  }, [itens]);

  useEffect(() => { recalcTotal(); }, [recalcTotal]);

  useEffect(() => {
    if (authLoading || !user?.id) {
      setUsuarios([]);
      setUsuariosReady(false);
      return undefined;
    }
    let cancelled = false;
    setUsuarios([]);
    setUsuariosReady(false);

    Promise.all([
      api.get('/clientes', { params: { status: 'ativo' } }).catch(() => ({ data: [] })),
      fetchComercialResponsaveis(effectiveUser).catch(() => []),
      api.get('/oportunidades', { params: { status: 'ativa' } }).catch(() => ({ data: [] })),
      api.get('/familias').catch(() => ({ data: [] }))
    ]).then(([c, u, o, f]) => {
      if (cancelled) return;
      setClientes(Array.isArray(c.data) ? c.data : []);
      setUsuarios(Array.isArray(u) ? u : []);
      setUsuariosReady(true);
      setOportunidades(Array.isArray(o.data) ? o.data : []);
      setFamiliasFromApi(Array.isArray(f.data) ? f.data : []);
      const authUser = user || JSON.parse(localStorage.getItem('user') || '{}');
      if (!isEdit && authUser?.id) setForm((prev) => ({ ...prev, responsavel_id: String(authUser.id) }));
    });

    return () => { cancelled = true; };
  }, [isEdit, authLoading, user?.id, effectiveUser?.id, effectiveUser?.is_superadmin]);

  useEffect(() => {
    if (!isEdit) { setLoadingData(false); return; }
    api.get(`/propostas/${id}`)
      .then(({ data }) => {
        setForm({
          numero_proposta: data.numero_proposta ?? '',
          cliente_id: data.cliente_id ?? '',
          titulo: data.titulo ?? '',
          descricao: data.descricao ?? '',
          validade: data.validade ? data.validade.split('T')[0] : '',
          condicoes_pagamento: data.condicoes_pagamento ?? '',
          prazo_entrega: data.prazo_entrega ?? '',
          garantia: data.garantia ?? '',
          observacoes: data.observacoes ?? '',
          oportunidade_id: data.oportunidade_id ?? '',
          tipo_proposta: data.tipo_proposta ?? '',
          expira_em: data.expira_em ? data.expira_em.split('T')[0] : '',
          responsavel_id: data.responsavel_id ?? '',
          margem_desconto: Number(data.margem_desconto) || 0,
          valor_total: Number(data.valor_total) || 0,
          status: data.status ?? 'rascunho',
          origem_busca: data.origem_busca ?? '',
          motivo_nao_venda: data.motivo_nao_venda ?? '',
          familia_produto: data.familia_produto ?? '',
          lembrete_data: data.lembrete_data ? data.lembrete_data.split('T')[0] : '',
          lembrete_mensagem: data.lembrete_mensagem ?? '',
          probabilidade: data.probabilidade != null ? Number(data.probabilidade) : 50,
          data_fechamento: data.data_fechamento ? data.data_fechamento.split('T')[0] : '',
          idioma: idiomaDoBanco(data.idioma),
          moeda: moedaDoBanco(data.moeda),
          taxa_cambio: data.taxa_cambio != null ? String(data.taxa_cambio).replace('.', ',') : '',
          incoterm: data.incoterm ?? ''
        });
        setStatusGravado(data.status ?? 'rascunho');
        setPdfAnexo(data.pdf_proposta_cliente || null);
        setPdfNome(data.pdf_proposta_nome || data.pdf_proposta_cliente || '');
        setItens((data.itens || []).map((i) => {
          const manual = !i.codigo_produto;
          const precoTabela = i.preco_tabela != null
            ? Number(i.preco_tabela)
            : (manual ? null : (Number(i.valor_unitario) || 0));
          // O valor GRAVADO é o do item (desde 24/11/2026 o preço do catálogo é editável). Antes, reabrir trocava o item do catálogo
          // pela tabela: o valor digitado sumia e, no Projeto Conceitual (tabela 0), o salvar seguinte gravava 0 — o documento saía
          // "US$ 0,00" (25/11/2026). A tabela só entra quando o item não tem valor gravado (proposta antiga).
          const gravado = i.valor_unitario != null && String(i.valor_unitario).trim() !== '' ? Number(i.valor_unitario) : null;
          const valorUnit = manual
            ? (gravado || 0)
            : (gravado != null && Number.isFinite(gravado) ? gravado : (precoTabela != null ? precoTabela : 0));
          const qtd = Number(i.quantidade) || 1;
          return {
            // Etapa 142 (C298, RN-142.01): o id do item gravado fica no estado e volta no salvar (montarPayloadProposta) — é como o
            // servidor sabe qual dos itens iguais o vendedor tirou.
            id: i.id,
            descricao: i.descricao ?? '',
            quantidade: qtd,
            unidade: i.unidade ?? 'UN',
            valor_unitario: valorUnit,
            valor_total: Math.round(qtd * valorUnit * 100) / 100,
            codigo_produto: i.codigo_produto ?? '',
            familia_produto: i.familia_produto ?? '',
            regiao_busca: i.regiao_busca ?? '',
            manual,
            preco_tabela: precoTabela,
            desconto_percentual: descontoDoItem({ manual, preco_tabela: precoTabela, valor_unitario: valorUnit },
              reaisPorUnidade(moedaDoBanco(data.moeda), data.taxa_cambio)),
            // Sem isto, reabrir a proposta traria os itens sem os acessórios na tela — e o
            // save seguinte mandaria '[]', apagando de verdade o que estava gravado. Este
            // mapeamento monta o item campo a campo, então todo campo novo precisa entrar
            // aqui explicitamente.
            acessorios: lerAcessoriosParaEdicao(i)
          };
        }));
      })
      .catch(() => toast.error('Erro ao carregar proposta.'))
      .finally(() => setLoadingData(false));
  }, [id, isEdit]);

  const updateItem = (idx, field, value) => {
    setItens((prev) => {
      const next = prev.map((item, i) => (i !== idx ? item : { ...item, [field]: value }));
      if (field === 'quantidade' || field === 'valor_unitario') {
        const it = next[idx];
        const q = Number(it.quantidade) || 0;
        const v = Number(it.valor_unitario) || 0;
        next[idx] = { ...next[idx], valor_total: q * v, desconto_percentual: descontoDoItem(it, reaisPorUnidade(form.moeda, form.taxa_cambio)) };
      }
      return next;
    });
  };

  const aplicarDescontoProposta = (percentual) => {
    const desconto = Math.min(100, Math.max(0, Number(percentual) || 0));
    setForm((f) => ({
      ...f,
      margem_desconto: desconto,
      ...(desconto > DESCONTO_LIMITE_SEM_APROVACAO ? { status: 'rascunho' } : {})
    }));
    setDescontoModalOpen(false);
    setDescontoEditValor('');
  };

  const abrirDescontoProposta = () => {
    setDescontoEditValor(String(form.margem_desconto || ''));
    setDescontoModalOpen(true);
  };

  // ACESSORIOS DO ITEM. O mesmo equipamento sai com combinacoes demais para virar
  // cadastro de produto, entao o vendedor escreve o acessorio e o preco aqui na proposta.
  // Ficam no proprio item (campo `acessorios`, JSON) porque proposta_itens e apagada e
  // reinserida a cada save - guardar em tabela filha por item_id perderia o vinculo.
  const atualizarAcessorios = (idx, lista) =>
    setItens((prev) => prev.map((item, i) => (i !== idx ? item : { ...item, acessorios: lista })));

  const addAcessorio = (idx) => {
    const atuais = lerAcessoriosParaEdicao(itens[idx]);
    atualizarAcessorios(idx, [...atuais, { descricao: '', quantidade: 1, valor_unitario: 0 }]);
  };

  const updateAcessorio = (idx, acIdx, campo, valor) => {
    const atuais = lerAcessoriosParaEdicao(itens[idx]);
    atualizarAcessorios(idx, atuais.map((ac, i) => (i !== acIdx ? ac : { ...ac, [campo]: valor })));
  };

  const removeAcessorio = (idx, acIdx) => {
    const atuais = lerAcessoriosParaEdicao(itens[idx]);
    atualizarAcessorios(idx, atuais.filter((_, i) => i !== acIdx));
  };

  const addManualItem = () => setItens((prev) => [...prev, emptyItem()]);
  const removeItem = (idx) => setItens((prev) => prev.filter((_, i) => i !== idx));

  const onProdutosSelect = (produtos) => {
    const novos = (produtos || []).map(produtoParaItem);
    setItens((prev) => [...prev, ...novos]);
    setShowProdutos(false);
  };

  const handleStatusChange = (status) => {
    setForm((f) => ({
      ...f,
      status,
      motivo_nao_venda: STATUS_EXIGE_MOTIVO.includes(status) ? f.motivo_nao_venda : '',
      // Etapa 165 (RN-165.05, B1056): o dia local (antes o UTC: das 21h a meia-noite o campo vinha com amanha — e era o que se gravava)
      data_fechamento: ['aprovada', 'rejeitada'].includes(status) && !f.data_fechamento
        ? hojeLocalISO()
        : f.data_fechamento
    }));
  };

  const validateForm = () => {
    if (!form.cliente_id) { toast.error('Selecione o cliente.'); return false; }
    if (!form.titulo?.trim()) { toast.error('Informe o título.'); return false; }
    if (exigeMotivo && !form.motivo_nao_venda?.trim()) {
      toast.error('Informe o motivo da não venda para propostas perdidas/rejeitadas.');
      return false;
    }
    const itensInvalidos = itens.some((i) => !i.descricao?.trim());
    if (itens.length > 0 && itensInvalidos) {
      toast.error('Todos os itens precisam de descrição.');
      return false;
    }
    return true;
  };

  const handleClienteChange = (clienteId) => {
    setForm((f) => ({ ...f, cliente_id: clienteId }));
    if (!isEdit && clienteId) gerarNumeroProposta(clienteId, form.responsavel_id);
    else if (!isEdit && !clienteId) setForm((f) => ({ ...f, numero_proposta: '' }));
  };

  const handleResponsavelChange = (responsavelId) => {
    setForm((f) => ({ ...f, responsavel_id: responsavelId }));
    if (!isEdit && form.cliente_id) gerarNumeroProposta(form.cliente_id, responsavelId);
  };

  // Moeda estrangeira: busca a cotação do dia (PTAX do Banco Central) e preenche o campo se ele estiver vazio — o vendedor pode trocar.
  const [cotacaoSugerida, setCotacaoSugerida] = useState(null);
  const trocarMoeda = async (moeda) => {
    setForm((f) => ({ ...f, moeda, taxa_cambio: moeda === 'BRL' ? '' : f.taxa_cambio }));
    setCotacaoSugerida(null);
    if (moeda === 'BRL') return;
    try {
      const { data } = await api.get('/cambio', { params: { moeda } });
      if (data && data.valor > 0) {
        setCotacaoSugerida(data);
        setForm((f) => (f.moeda === moeda && !String(f.taxa_cambio || '').trim()
          ? { ...f, taxa_cambio: String(data.valor).replace('.', ',') } : f));
      }
    } catch (e) {
      // Sem resposta do Banco Central: o campo fica para digitar; vazio, o servidor tenta de novo ao salvar.
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    // maxDesc = o desconto GERAL gravado (o da proposta), como sempre. maxDescAprovacao decide a aprovação: o maior entre ele e o de
    // um item com preço baixado à mão abaixo da tabela. Gravar o do item no desconto geral faria o documento descontar duas vezes —
    // o preço já reduzido e mais a porcentagem sobre o total.
    const maxDesc = Number(form.margem_desconto) || 0;
    // O desconto do item é refeito com a moeda e a cotação de AGORA (trocar a moeda ou a cotação depois de digitar muda a conta).
    const porUn = reaisPorUnidade(form.moeda, form.taxa_cambio);
    const itensParaGravar = itens.map((it) => ({ ...it, desconto_percentual: descontoDoItem(it, porUn) }));
    const maxDescAprovacao = Math.max(maxDesc, ...itensParaGravar.map((it) => it.desconto_percentual));
    let statusSalvar = form.status;
    const statusJaLiberado = ['desconto_aprovado', 'enviada', 'visualizada', 'aceita', 'aprovada'].includes(form.status);
    if (maxDescAprovacao > DESCONTO_LIMITE_SEM_APROVACAO && !statusJaLiberado) {
      statusSalvar = 'rascunho';
      if (form.status !== 'rascunho') {
        toast.info(`Desconto acima de ${DESCONTO_LIMITE_SEM_APROVACAO}% exige aprovação. A proposta será salva como rascunho.`);
      }
    }

    setLoading(true);
    try {
      const valorTotal = subtotalItens;
      // Etapa 138: o corpo sai de montarPayloadProposta — os campos apagados vão como null (o servidor mantém o que não vier).
      const payload = montarPayloadProposta({ form, itens: itensParaGravar, statusSalvar, valorTotal, maxDesc, exigeMotivo });
      if (!payload.numero_proposta || payload.numero_proposta === 'Gerando...' || !String(payload.numero_proposta).trim()) {
        delete payload.numero_proposta;
      }

      let propostaId = id ? Number(id) : null;
      if (isEdit) {
        await api.put(`/propostas/${id}`, payload);
      } else {
        const { data } = await api.post('/propostas', payload);
        propostaId = data?.id || null;
        if (data?.numero_proposta) {
          setForm((prev) => ({ ...prev, numero_proposta: data.numero_proposta }));
        }
      }

      if (maxDescAprovacao > DESCONTO_LIMITE_SEM_APROVACAO && propostaId && user?.id && statusSalvar === 'rascunho') {
        try {
          const valorDescontoRs = valorTotal * (maxDescAprovacao / 100);
          await api.post('/aprovacoes', {
            proposta_id: propostaId,
            tipo: 'desconto',
            valor_desconto: maxDescAprovacao,
            valor_total: valorTotal,
            valor_com_desconto: valorTotal - valorDescontoRs,
            valor_desconto_rs: valorDescontoRs,
            solicitado_por: user.id,
            status: 'pendente',
            observacoes: `Solicitação automática: desconto de ${maxDescAprovacao.toFixed(2)}% (acima do limite de ${DESCONTO_LIMITE_SEM_APROVACAO}%)${maxDescAprovacao > maxDesc ? ' — preço de item baixado abaixo da tabela' : ''}`
          });
          toast.success('Proposta salva. Solicitação de aprovação de desconto enviada.');
        } catch (aprovErr) {
          toast.success(isEdit ? 'Proposta atualizada.' : 'Proposta criada.');
          toast.warning(aprovErr.response?.data?.error || 'Salvo, mas não foi possível criar a aprovação automaticamente. Abra Aprovações.');
        }
      } else {
        toast.success(isEdit ? 'Proposta atualizada.' : 'Proposta criada.');
      }
      navigate('/comercial/propostas');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar.');
    } finally {
      setLoading(false);
    }
  };

  const abrirPreview = () => {
    if (!id) return;
    if (form.status === 'rascunho' || form.status === 'desconto_aprovado') {
      toast.info(form.status === 'desconto_aprovado'
        ? 'Clique em Enviar proposta para liberar o documento.'
        : 'Envie a proposta para gerar o documento automático.');
      return;
    }
    api.get(`/propostas/${id}/premium`, { responseType: 'text' }).then(({ data }) => {
      const url = URL.createObjectURL(new Blob([data], { type: 'text/html;charset=utf-8' }));
      window.open(url, '_blank');
    }).catch(async (e) => toast.error(await mensagemDoErroEmBlob(e, 'Erro ao abrir proposta.'))); // RN-141.07: a frase do servidor
  };

  const baixarPdf = () => {
    if (!id) return;
    if (form.status === 'rascunho' || form.status === 'desconto_aprovado') {
      toast.info(form.status === 'desconto_aprovado'
        ? 'Clique em Enviar proposta para liberar o PDF.'
        : 'Envie a proposta para gerar o PDF.');
      return;
    }
    api.get(`/propostas/${id}/pdf`, { responseType: 'blob' }).then((res) => {
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      // Nome vindo do Content-Disposition (numero + cliente). Aqui o fallback era so o id,
      // entao este era o download com o nome mais pobre dos tres.
      a.download = nomeArquivoPdfProposta(res, form.numero_proposta, id);
      a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF baixado.');
    }).catch(async (e) => toast.error(await mensagemDoErroEmBlob(e, 'Erro ao gerar PDF.'))); // RN-141.07: o erro vem dentro do Blob
  };

  const handleUploadPdf = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Selecione um arquivo PDF.');
      e.target.value = '';
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error('O PDF não pode exceder 20MB.');
      e.target.value = '';
      return;
    }
    if (!id) {
      toast.info('Salve a proposta antes de anexar o PDF.');
      e.target.value = '';
      return;
    }
    setUploadingPdf(true);
    try {
      const formData = new FormData();
      formData.append('arquivo', file);
      const { data } = await api.post(`/propostas/${id}/pdf-anexo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setPdfAnexo(data.filename);
      setPdfNome(data.originalName || file.name);
      toast.success('PDF da proposta anexado.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao anexar PDF.');
    } finally {
      setUploadingPdf(false);
      e.target.value = '';
    }
  };

  const handleDownloadPdfAnexo = async () => {
    if (!id || !pdfAnexo) return;
    try {
      const { data } = await api.get(`/propostas/${id}/pdf-anexo`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = pdfNome || `proposta-${form.numero_proposta || id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Erro ao baixar PDF anexado.');
    }
  };

  const handleViewPdfAnexo = async () => {
    if (!id || !pdfAnexo) return;
    try {
      const { data } = await api.get(`/propostas/${id}/pdf-anexo`, { params: { inline: '1' }, responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      window.open(url, '_blank');
    } catch {
      toast.error('Erro ao visualizar PDF anexado.');
    }
  };

  const handleRemovePdfAnexo = async () => {
    if (!id || !pdfAnexo) return;
    if (!window.confirm('Remover o PDF anexado desta proposta?')) return;
    try {
      await api.delete(`/propostas/${id}/pdf-anexo`);
      setPdfAnexo(null);
      setPdfNome('');
      toast.success('PDF removido.');
    } catch {
      toast.error('Erro ao remover PDF.');
    }
  };

  // Os valores da proposta na moeda DELA (25/11/2026: numa proposta em dólar o cadastro mostrava tudo em R$). A tabela do catálogo
  // continua em reais (formatReais) — é o preço cadastrado — e, em outra moeda, ganha a conversão pela cotação ao lado.
  const moedaTela = moedaDoBanco(form.moeda);
  const formatMoney = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moedaTela }).format(Number(v) || 0);
  const formatReais = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
  const simboloMoeda = { USD: 'US$', EUR: '€' }[moedaTela] || 'R$';
  const porUnTela = reaisPorUnidade(moedaTela, form.taxa_cambio);
  const tabelaNaMoeda = (precoReais) => (moedaTela === 'BRL' || !porUnTela || !(Number(precoReais) > 0) ? '' : ` (≈ ${formatMoney((Number(precoReais) || 0) / porUnTela)})`);

  if (loadingData) return <div className="proposta-form"><p className="proposta-form-loading">Carregando...</p></div>;

  return (
    <div className="proposta-form">
      <header className="proposta-form-header">
        <h1>{isEdit ? 'Editar proposta' : 'Nova proposta'}</h1>
        <div className="proposta-form-header-actions">
          {isEdit && !['rascunho', 'desconto_aprovado'].includes(form.status) && (
            <>
              <button type="button" className="btn btn-sec" onClick={abrirPreview}><FiEye /> Ver proposta</button>
              <button type="button" className="btn btn-sec" onClick={baixarPdf}><FiDownload /> PDF</button>
            </>
          )}
          {isEdit && ['rascunho', 'desconto_aprovado'].includes(form.status) && (
            <button
              type="button"
              className="btn btn-sec"
              disabled
              title="Disponível após enviar a proposta"
            >
              <FiEye /> Ver proposta
            </button>
          )}
          {isEdit && (form.status === 'rascunho' || form.status === 'desconto_aprovado') && (
            <button
              type="button"
              className={`btn btn-pri${form.status === 'desconto_aprovado' ? ' btn-enviar-pulse' : ''}`}
              onClick={async () => {
                try {
                  await api.post(`/propostas/${id}/enviar`);
                  toast.success('Proposta enviada.');
                  setForm((f) => ({ ...f, status: 'enviada' }));
                  setStatusGravado('enviada');
                } catch (e) {
                  toast.error(e.response?.data?.error || 'Erro ao enviar proposta.');
                }
              }}
            >
              <FiSend /> Enviar proposta
            </button>
          )}
          <button type="button" className="btn btn-sec" onClick={() => navigate('/comercial/propostas')}><FiX /> Cancelar</button>
          <button type="submit" form="proposta-form-form" className="btn btn-pri" disabled={loading}>
            <FiSave /> {loading ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </header>

      <form id="proposta-form-form" onSubmit={handleSubmit} className="proposta-form-form">
        <section className="proposta-form-section">
          <h2><FiUser /> Dados gerais</h2>
          <div className="proposta-form-grid">
            <div className="proposta-form-field">
              <label>Número da proposta</label>
              <input
                type="text"
                value={form.numero_proposta}
                readOnly
                placeholder={isEdit ? 'Número da proposta' : 'Selecione um cliente para gerar'}
                style={{ color: gerandoNumero ? '#94a3b8' : undefined, fontStyle: gerandoNumero ? 'italic' : undefined }}
              />
              <span className="proposta-form-hint">Gerado automaticamente ao selecionar o cliente (padrão do sistema)</span>
            </div>
            <div className="proposta-form-field">
              <label>Cliente *</label>
              <select value={form.cliente_id} onChange={(e) => handleClienteChange(e.target.value)} required>
                <option value="">Selecione...</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.razao_social || c.nome_fantasia || `#${c.id}`}</option>
                ))}
              </select>
              <span className="proposta-form-hint">UF e segmento vêm do cadastro do cliente (gráficos do dashboard)</span>
            </div>
            <div className="proposta-form-field">
              <label>Título *</label>
              <input type="text" value={form.titulo} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} required placeholder="Ex.: Proposta comercial" />
            </div>
            <div className="proposta-form-field">
              <label>Tipo</label>
              <select value={form.tipo_proposta} onChange={(e) => setForm((f) => ({ ...f, tipo_proposta: e.target.value }))}>
                <option value="">—</option>
                {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="proposta-form-field">
              <label>Responsável (vendedor)</label>
              <select
                value={form.responsavel_id}
                onChange={(e) => handleResponsavelChange(e.target.value)}
                disabled={!usuariosReady}
              >
                <option value="">{usuariosReady ? '—' : 'Carregando responsáveis...'}</option>
                {usuariosReady && usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </div>
          </div>
          <div className="proposta-form-field">
            <label>Descrição</label>
            <textarea value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} rows={2} />
          </div>
          <div className="proposta-form-grid">
            <div className="proposta-form-field">
              <label>Condições de pagamento</label>
              <input type="text" value={form.condicoes_pagamento} onChange={(e) => setForm((f) => ({ ...f, condicoes_pagamento: e.target.value }))} />
            </div>
            <div className="proposta-form-field">
              <label>Prazo entrega</label>
              <input type="text" value={form.prazo_entrega} onChange={(e) => setForm((f) => ({ ...f, prazo_entrega: e.target.value }))} />
            </div>
            <div className="proposta-form-field">
              <label>Garantia</label>
              <input type="text" value={form.garantia} onChange={(e) => setForm((f) => ({ ...f, garantia: e.target.value }))} />
            </div>
          </div>
        </section>

        <section className="proposta-form-section">
          <h2>Cliente de fora do Brasil</h2>
          <p className="proposta-form-section-desc">
            Em outro idioma, o documento sai em duas colunas: português à esquerda e a outra língua à direita. O que for escrito em
            português é traduzido sozinho ao abrir a pré-visualização no Chrome, e a tradução pode ser corrigida ali.
          </p>
          <div className="proposta-form-grid">
            <div className="proposta-form-field">
              <label htmlFor="proposta-idioma">Idioma do documento</label>
              <select id="proposta-idioma" value={form.idioma} onChange={(e) => setForm((f) => ({ ...f, idioma: e.target.value }))}>
                {IDIOMAS_PROPOSTA.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="proposta-form-field">
              <label htmlFor="proposta-moeda">Moeda</label>
              <select id="proposta-moeda" value={form.moeda} onChange={(e) => trocarMoeda(e.target.value)}>
                {MOEDAS_PROPOSTA.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {form.moeda !== 'BRL' && (
              <div className="proposta-form-field">
                <label htmlFor="proposta-taxa-cambio">Cotação (R$ por {form.moeda === 'EUR' ? '€' : 'US$'})</label>
                <input
                  id="proposta-taxa-cambio"
                  type="text"
                  inputMode="decimal"
                  value={form.taxa_cambio}
                  onChange={(e) => setForm((f) => ({ ...f, taxa_cambio: e.target.value }))}
                  placeholder="Ex.: 5,8573"
                />
                <small className="proposta-form-preco-tabela">
                  {cotacaoSugerida ? `Banco Central (PTAX) de ${cotacaoSugerida.data.split('-').reverse().join('/')}: ${rotuloDaCotacao(form.moeda, cotacaoSugerida.valor)}. ` : ''}
                  O painel converte o valor desta proposta para real por esta cotação.
                </small>
              </div>
            )}
            <div className="proposta-form-field">
              <label htmlFor="proposta-incoterm">Incoterm</label>
              <select
                id="proposta-incoterm"
                value={separarIncoterm(form.incoterm).codigo}
                onChange={(e) => setForm((f) => ({ ...f, incoterm: montarIncoterm(e.target.value, separarIncoterm(f.incoterm).local) }))}
              >
                <option value="">—</option>
                {INCOTERMS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="proposta-form-field">
              <label htmlFor="proposta-incoterm-local">Local de entrega (incoterm)</label>
              <input
                id="proposta-incoterm-local"
                type="text"
                value={separarIncoterm(form.incoterm).local}
                onChange={(e) => setForm((f) => ({ ...f, incoterm: montarIncoterm(separarIncoterm(f.incoterm).codigo, e.target.value) }))}
                placeholder="Ex.: Porto de Santos"
              />
            </div>
          </div>
        </section>

        <section className="proposta-form-section proposta-form-section-dashboard">
          <h2><FiBarChart2 /> Pipeline e dashboard</h2>
          <p className="proposta-form-section-desc">Campos vinculados aos gráficos do dashboard comercial (funil, origem, família, motivos de perda e lembretes).</p>
          <div className="proposta-form-grid">
            <div className="proposta-form-field">
              <label>Status da proposta *</label>
              <select value={form.status} onChange={(e) => handleStatusChange(e.target.value)}>
                {opcoesStatusProposta(statusGravado).map((s) => (
                  <option key={s.value} value={s.value} disabled={s.disabled} title={s.title}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="proposta-form-field">
              <label>Origem da busca (marketing)</label>
              <select value={form.origem_busca} onChange={(e) => setForm((f) => ({ ...f, origem_busca: e.target.value }))}>
                <option value="">Selecione...</option>
                {form.origem_busca && !ORIGENS_BUSCA.includes(form.origem_busca) && (
                  <option value={form.origem_busca}>{form.origem_busca}</option>
                )}
                {ORIGENS_BUSCA.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="proposta-form-field">
              <label>Família de produto / equipamento</label>
              <select value={form.familia_produto} onChange={(e) => setForm((f) => ({ ...f, familia_produto: e.target.value }))}>
                <option value="">Selecione...</option>
                {form.familia_produto && !familiasProduto.includes(form.familia_produto) && (
                  <option value={form.familia_produto}>{form.familia_produto}</option>
                )}
                {familiasProduto.map((fam) => <option key={fam} value={fam}>{fam}</option>)}
              </select>
            </div>
            <div className="proposta-form-field">
              <label>Probabilidade de fechamento (%)</label>
              <input type="number" min={0} max={100} value={form.probabilidade} onChange={(e) => setForm((f) => ({ ...f, probabilidade: e.target.value }))} />
              <span className="proposta-form-hint">Usado na previsão de fechamento do dashboard de vendas</span>
            </div>
            <div className="proposta-form-field">
              <label>Data de fechamento</label>
              <input type="date" value={form.data_fechamento} onChange={(e) => setForm((f) => ({ ...f, data_fechamento: e.target.value }))} />
              <span className="proposta-form-hint">Preenchida automaticamente ao marcar como ganha ou perdida</span>
            </div>
            {exigeMotivo && (
              <div className="proposta-form-field proposta-form-field-required">
                <label>Motivo da não venda *</label>
                <select value={form.motivo_nao_venda} onChange={(e) => setForm((f) => ({ ...f, motivo_nao_venda: e.target.value }))} required>
                  <option value="">Selecione o motivo...</option>
                  {MOTIVOS_NAO_VENDA.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}
            <div className="proposta-form-field">
              <label>Data do lembrete</label>
              <input type="date" value={form.lembrete_data} onChange={(e) => setForm((f) => ({ ...f, lembrete_data: e.target.value }))} />
            </div>
            <div className="proposta-form-field full">
              <label>Mensagem do lembrete</label>
              <textarea value={form.lembrete_mensagem} onChange={(e) => setForm((f) => ({ ...f, lembrete_mensagem: e.target.value }))} rows={2} placeholder="Aviso para follow-up desta cotação..." />
            </div>
          </div>
        </section>

        <section className="proposta-form-section proposta-form-section-itens">
          <div className="proposta-form-itens-header">
            <h2><FiFileText /> Itens da proposta</h2>
            <div className="proposta-form-item-actions">
              <button type="button" className="btn btn-pri" onClick={() => setShowProdutos(true)}><FiPlus /> Catálogo de produtos</button>
              <button type="button" className="btn btn-sec" onClick={addManualItem}><FiPlus /> Item manual</button>
            </div>
          </div>
          {itens.length === 0 ? (
            <p className="proposta-form-empty">Nenhum item. Adicione do catálogo ou crie um item manual (texto livre).</p>
          ) : (
            <div className="proposta-form-itens-list">
              {itens.map((item, idx) => (
                <div key={idx} className={`proposta-form-item-card${item.manual ? ' is-manual' : ''}`}>
                  <div className="proposta-form-item-card-top">
                    <div className="proposta-form-item-main">
                      <div className="proposta-form-item-code" title={item.codigo_produto || ''}>
                        {item.manual ? (
                          <input
                            type="text"
                            value={item.codigo_produto}
                            onChange={(e) => updateItem(idx, 'codigo_produto', e.target.value)}
                            placeholder="Código (opcional)"
                            className="input-text-sm"
                          />
                        ) : (
                          <span>{item.codigo_produto || '—'}</span>
                        )}
                      </div>
                      <div className="proposta-form-item-desc">
                        {item.manual ? (
                          <input
                            type="text"
                            value={item.descricao}
                            onChange={(e) => updateItem(idx, 'descricao', e.target.value)}
                            placeholder="Descrição do item"
                            className="input-text"
                            required
                          />
                        ) : (
                          <span>{item.descricao}</span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-remove"
                      onClick={() => removeItem(idx)}
                      title="Remover item"
                      aria-label="Remover item"
                    >
                      <FiTrash2 />
                    </button>
                  </div>

                  <div className="proposta-form-item-grid">
                    <div className="proposta-form-item-panel proposta-form-item-panel-valores">
                      <label className="proposta-form-item-field field-qtd">
                        <span>Qtd</span>
                        <input
                          type="number"
                          min={0.01}
                          step={0.01}
                          value={item.quantidade}
                          onChange={(e) => updateItem(idx, 'quantidade', e.target.value)}
                          className="input-num"
                        />
                      </label>
                      <label className="proposta-form-item-field field-un">
                        <span>Un.</span>
                        {item.manual ? (
                          <input
                            type="text"
                            value={item.unidade}
                            onChange={(e) => updateItem(idx, 'unidade', e.target.value)}
                            className="input-text-sm"
                          />
                        ) : (
                          <span className="proposta-form-item-static">{item.unidade || '—'}</span>
                        )}
                      </label>

                      <div className="proposta-form-item-field field-preco">
                        <span>Valor unitário</span>
                        {/* Editável também no item do catálogo (24/11/2026): vem do cadastro e pode ser mudado à mão. */}
                        <div className="proposta-form-money-input">
                          <span className="proposta-form-money-prefix" aria-hidden="true">{simboloMoeda}</span>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={item.valor_unitario}
                            onChange={(e) => updateItem(idx, 'valor_unitario', e.target.value)}
                            className="input-money"
                            aria-label="Valor unitário"
                          />
                        </div>
                        {!item.manual && (
                          <small className="proposta-form-preco-tabela">
                            Tabela: {formatReais(item.preco_tabela)}{tabelaNaMoeda(item.preco_tabela)}
                            {descontoDoItem(item, porUnTela) > 0 && ` · ${descontoDoItem(item, porUnTela).toFixed(2).replace('.', ',')}% abaixo`}
                            {descontoDoItem(item, porUnTela) > DESCONTO_LIMITE_SEM_APROVACAO && ' — exige aprovação'}
                          </small>
                        )}
                      </div>

                      <div className="proposta-form-item-field field-total">
                        <span>Total do item</span>
                        <div className="proposta-form-total-chip">
                          {formatMoney(item.valor_total)}
                        </div>
                      </div>
                    </div>

                    <div className="proposta-form-item-panel proposta-form-item-panel-meta">
                      <label className="proposta-form-item-field field-familia">
                        <span>Família</span>
                        <select
                          value={item.familia_produto}
                          onChange={(e) => updateItem(idx, 'familia_produto', e.target.value)}
                          className="input-select-sm"
                          title={item.familia_produto || ''}
                        >
                          <option value="">—</option>
                          {familiasProduto.map((fam) => (
                            <option key={fam} value={fam}>{fam}</option>
                          ))}
                        </select>
                      </label>
                      <label className="proposta-form-item-field field-regiao">
                        <span>Região</span>
                        <select
                          value={item.regiao_busca}
                          onChange={(e) => updateItem(idx, 'regiao_busca', e.target.value)}
                          className="input-select-sm"
                        >
                          <option value="">—</option>
                          {REGIOES_BUSCA.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {/* ACESSORIOS: o mesmo equipamento sai com combinacoes demais para
                        virar cadastro de produto, entao entram escritos aqui, com preco. */}
                    <div className="proposta-form-acessorios">
                      <div className="proposta-form-acessorios-topo">
                        <span className="proposta-form-acessorios-titulo">
                          Acessórios
                          {lerAcessoriosParaEdicao(item).length > 0 && (
                            <em>{formatMoney(totalAcessoriosDosItens([item]))}</em>
                          )}
                        </span>
                        <button
                          type="button"
                          className="proposta-form-acessorio-add"
                          onClick={() => addAcessorio(idx)}
                        >
                          <FiPlus /> Acessório
                        </button>
                      </div>
                      {lerAcessoriosParaEdicao(item).length === 0 ? (
                        <p className="proposta-form-acessorios-vazio">
                          Nenhum acessório. Use para itens que não valem cadastro próprio.
                        </p>
                      ) : (
                        lerAcessoriosParaEdicao(item).map((ac, acIdx) => (
                          <div key={acIdx} className="proposta-form-acessorio-linha">
                            <input
                              type="text"
                              placeholder="Descrição do acessório"
                              value={ac.descricao || ''}
                              onChange={(e) => updateAcessorio(idx, acIdx, 'descricao', e.target.value)}
                              className="proposta-form-acessorio-desc"
                            />
                            <input
                              type="number"
                              min="0"
                              step="1"
                              placeholder="Qtd"
                              value={ac.quantidade ?? ''}
                              onChange={(e) => updateAcessorio(idx, acIdx, 'quantidade', e.target.value)}
                              className="proposta-form-acessorio-qtd"
                            />
                            <div className="proposta-form-acessorio-moeda">
                              <span aria-hidden="true">{simboloMoeda}</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="0,00"
                                value={formatarMoedaBR(ac.valor_unitario)}
                                onChange={(e) => updateAcessorio(idx, acIdx, 'valor_unitario', digitadoParaValor(e.target.value))}
                                className="proposta-form-acessorio-valor"
                                aria-label="Valor unitário do acessório"
                              />
                            </div>
                            <button
                              type="button"
                              className="proposta-form-acessorio-remover"
                              title="Remover acessório"
                              onClick={() => removeAcessorio(idx, acIdx)}
                            >
                              <FiTrash2 />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div className="proposta-form-totais">
                <div className="proposta-form-totais-linha">
                  <span>Subtotal dos itens</span>
                  <strong>{formatMoney(subtotalItens)}</strong>
                </div>
                <div className="proposta-form-totais-linha proposta-form-totais-desconto">
                  <div className="proposta-form-totais-desconto-info">
                    <span>Desconto da proposta</span>
                    {descontoPercentual > 0 ? (
                      <em className={descontoRequerAprovacao ? 'is-alert' : ''}>
                        −{descontoPercentual.toFixed(2)}% ({formatMoney(valorDescontoRs)})
                        {descontoRequerAprovacao ? ` · acima de ${DESCONTO_LIMITE_SEM_APROVACAO}% exige aprovação` : ''}
                      </em>
                    ) : (
                      <em>Nenhum desconto aplicado</em>
                    )}
                  </div>
                  <button type="button" className="btn btn-sec btn-desconto-total" onClick={abrirDescontoProposta}>
                    <FiPercent /> {descontoPercentual > 0 ? 'Alterar desconto' : 'Aplicar desconto'}
                  </button>
                </div>
                <div className="proposta-form-totais-linha proposta-form-totais-final">
                  <span>Total</span>
                  <strong>{formatMoney(totalComDesconto)}</strong>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="proposta-form-section">
          <h2><FiPaperclip /> PDF enviado ao cliente</h2>
          <p className="proposta-form-section-desc">Anexe o PDF da proposta que foi enviada ao cliente (substitui o arquivo anterior ao enviar um novo).</p>
          {!isEdit ? (
            <p className="proposta-form-empty">Salve a proposta para poder anexar o PDF.</p>
          ) : (
            <div className="proposta-form-pdf-anexo">
              {pdfAnexo ? (
                <div className="proposta-form-pdf-info">
                  <FiFileText />
                  <span>{pdfNome || pdfAnexo}</span>
                  <button type="button" className="btn btn-sec" onClick={handleViewPdfAnexo}><FiEye /> Visualizar</button>
                  <button type="button" className="btn btn-sec" onClick={handleDownloadPdfAnexo}><FiDownload /> Baixar</button>
                  <button type="button" className="btn btn-sec" onClick={handleRemovePdfAnexo}><FiTrash2 /> Remover</button>
                </div>
              ) : (
                <p className="proposta-form-empty">Nenhum PDF anexado.</p>
              )}
              <label className="proposta-form-pdf-upload">
                <FiUpload /> {uploadingPdf ? 'Enviando...' : (pdfAnexo ? 'Substituir PDF' : 'Anexar PDF')}
                <input type="file" accept="application/pdf,.pdf" onChange={handleUploadPdf} disabled={uploadingPdf} hidden />
              </label>
            </div>
          )}
        </section>
      </form>

      {showProdutos && (
        <SelecaoProdutosPremium
          onClose={() => setShowProdutos(false)}
          onSelect={onProdutosSelect}
          produtosSelecionados={[]}
        />
      )}

      {descontoModalOpen && (
        <div className="proposta-form-modal-overlay" onClick={() => { setDescontoModalOpen(false); setDescontoEditValor(''); }}>
          <div className="proposta-form-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Desconto da proposta</h3>
            <p className="proposta-form-modal-desc">
              Subtotal: <strong>{formatMoney(subtotalItens)}</strong>
              <br />
              O desconto é aplicado uma vez sobre o total dos itens.
            </p>
            <label className="proposta-form-field">
              <span>Desconto (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={descontoEditValor}
                onChange={(e) => setDescontoEditValor(e.target.value)}
                autoFocus
              />
            </label>
            {(Number(descontoEditValor) || 0) > DESCONTO_LIMITE_SEM_APROVACAO && (
              <p className="proposta-form-desconto-aviso">
                Acima de {DESCONTO_LIMITE_SEM_APROVACAO}% a proposta fica em rascunho e entra no fluxo de Aprovações.
              </p>
            )}
            <p className="proposta-form-modal-desc">
              Total com desconto:{' '}
              <strong>
                {formatMoney(calcValorComDesconto(subtotalItens, descontoEditValor))}
              </strong>
            </p>
            <div className="proposta-form-modal-actions">
              <button type="button" className="btn btn-sec" onClick={() => { setDescontoModalOpen(false); setDescontoEditValor(''); }}>
                Cancelar
              </button>
              <button type="button" className="btn btn-sec" onClick={() => aplicarDescontoProposta(0)}>
                Remover desconto
              </button>
              <button type="button" className="btn btn-pri" onClick={() => aplicarDescontoProposta(descontoEditValor)}>
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
