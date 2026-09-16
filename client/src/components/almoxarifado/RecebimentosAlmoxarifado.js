import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { SkeletonTable } from '../SkeletonLoader';
import AlmoxPageHeader from './AlmoxPageHeader';
import {
  FiPlus, FiRefreshCw, FiPackage, FiCheck, FiTruck, FiSearch, FiX,
  FiArrowRight, FiFileText, FiDollarSign, FiTag,
} from 'react-icons/fi';
import EtiquetasPdfModal from './EtiquetasPdfModal';
import AnexosDocumento from './AnexosDocumento';
// Etapa 36 (RN-18): usado SÓ para esconder a caixa de autorização de excedente antes do
// formulário. O hook FALHA ABERTO de propósito (`useAlmoxPermissoes.js`): se o
// `GET /almoxarifado/minhas-permissoes` não carregar, `pode()` deixa passar. Quem DECIDE é o
// backend — `conferirRecebimento` checa `autorizar_excedente` por `can()` e devolve 403 com a
// literal congelada. Consequência declarada e aceita: quem não tem a ação pode ver a caixa por um
// instante e tomar 403 do servidor; é o desenho, não defeito.
import { useAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';
import { montarEtiquetasDoRecebimento } from '../../utils/etiquetasPdf';
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

// Revisão final (F2): `tipo_recebimento` SAIU daqui e do carregamento de `abrirDetalhe`. Este
// objeto é espalhado inteiro no `PUT /fiscal` (`salvarFiscal`), e o modal de NF não tem controle
// nenhum para o tipo — o `<select>` de tipo vive no modal de *novo* recebimento, que usa o `form`.
// Ecoando a coluna, um registro de acervo com valor fora do enum da RN-11 levava 400 do Zod em
// TODA gravação fiscal, sem nenhum campo na tela para o operador corrigir. Quem não edita não
// reenvia: o `COALESCE` do `salvarDadosFiscal` preserva a coluna de quem não manda o campo.
const EMPTY_FISCAL = {
  nota_fiscal: '', nota_serie: '', data_emissao_nf: '', data_entrada_nf: '',
  cfop_nota: '', cfop_entrada: '', chave_nfe: '',
  fornecedor_nome: '', fornecedor_cnpj: '', pedido_compra_numero: '',
  base_icms: '', valor_icms: '', valor_produtos: '', frete: '', desconto: '',
  outras_despesas: '', valor_ipi: '', valor_total_nota: '',
};

const RecebimentosAlmoxarifado = () => {
  const { pode } = useAlmoxPermissoes();
  const [recebimentos, setRecebimentos] = useState([]);
  const [materiais, setMateriais] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [loading, setLoading] = useState(true);
  // Etapa 35 (RN-04/RN-05): falha de carga NAO pode virar estado vazio. "Nenhum recebimento
  // registrado" e indistinguivel de "nao ha recebimento", e o toast some em segundos — no teste
  // ele e mockado, no navegador o operador ja saiu da tela. Mesma regua que a Etapa 29 aplicou em
  // `HistoricoInspecoes.js:56`, achado da revisao adversarial de la.
  const [erro, setErro] = useState(null);
  // (RN-06) A lista de materiais alimenta a busca do modal de novo recebimento: falhando em
  // silencio (`catch { /* ignore */ }`), o operador digita um material que existe e conclui que
  // nao esta cadastrado.
  const [erroMateriais, setErroMateriais] = useState(null);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroEtapa, setFiltroEtapa] = useState('');
  const [detalhe, setDetalhe] = useState(null);
  // Etapa 35 (RN-07/RN-08). `selectedId` é a linha que o usuário clicou — setado SINCRONAMENTE,
  // antes do GET. É ele que sustenta o painel enquanto o detalhe carrega: sem ele o painel teria
  // de continuar gatilhado por `detalhe`, e anular `detalhe` na troca faria a coluna de 420px
  // sumir e voltar a cada clique. Molde: `RequisicoesList.js`, o trio `selectedId` /
  // `loadedDetalheIdRef` / `detalheFetchSeqRef` de `abrirDetalhe`.
  const [selectedId, setSelectedId] = useState(null);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);
  // `idCarregadoRef`: qual id está REALMENTE dentro de `detalhe`. É a guarda que faz
  // `setDetalhe(null)` acontecer só na TROCA de linha, nunca no refetch do mesmo id — anular
  // sempre desmontaria o bloco de anexos e jogaria fora o arquivo já escolhido no input (o fix F2
  // da Etapa 34, travado pelo cenário (g) da suíte).
  const idCarregadoRef = useRef(null);
  // `detalheFetchSeqRef`: dois cliques rápidos deixam duas requisições em voo, e sem contador a
  // ÚLTIMA A RESPONDER vencia — o painel terminava no registro que o usuário já tinha abandonado.
  const detalheFetchSeqRef = useRef(0);
  const [saving, setSaving] = useState(false);
  // Etapa 36 (RN-18): a caixa "Autorizo o recebimento acima do pedido". Estado do PAINEL e não do
  // item: a autorização vale para o documento (o servidor recebe uma flag por requisição), e
  // marcar item por item daria a impressão de granularidade que a rota não tem.
  const [autorizarExcedente, setAutorizarExcedente] = useState(false);
  // Etapa 36 (RN-16): a recusa da conferência tem de ficar NA TELA, não só no toast. As duas
  // recusas desta porta são 400 de excedente sem flag e 403 de flag sem permissão, e as duas
  // trazem literal que explica o que fazer — um toast que some em segundos deixa o operador com
  // "não salvou" e nenhum motivo. Mesma régua da Etapa 35 para a lista que não carregou (RN-04).
  const [erroConferencia, setErroConferencia] = useState(null);
  const [showNovo, setShowNovo] = useState(false);
  const [showFiscal, setShowFiscal] = useState(false);
  const [buscaMat, setBuscaMat] = useState('');
  const [etiquetas, setEtiquetas] = useState(null);
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
    setErro(null);
    try {
      const params = {};
      if (filtroStatus) params.status = filtroStatus;
      if (filtroEtapa) params.etapa = filtroEtapa;
      const res = await api.get('/almoxarifado/recebimentos', { params });
      setRecebimentos(res.data || []);
    } catch (err) {
      const msg = err.response?.data?.error || 'Erro ao carregar recebimentos';
      toast.error(msg);
      // Zerar a lista e marcar o erro andam juntos: sem o `setRecebimentos([])`, um refresh que
      // falha deixaria as linhas velhas em memoria passando por frescas (RN-05).
      setRecebimentos([]);
      setErro(msg);
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
    setErroMateriais(null);
    try {
      const res = await api.get('/almoxarifado/materiais');
      setMateriais(res.data || []);
    } catch (err) {
      setErroMateriais(err.response?.data?.error || 'Erro ao carregar materiais');
    }
  };

  const loadAuxiliares = async () => {
    try {
      const [pRes, fRes] = await Promise.all([
        api.get('/almoxarifado/recebimentos-aux/pedidos-compra'),
        api.get('/almoxarifado/recebimentos-aux/fornecedores'),
      ]);
      setPedidos(pRes.data || []);
      setFornecedores(fRes.data || []);
    } catch {
      // Tolerado de propósito (Etapa 35, decisão 5): pedidos de compra e fornecedores alimentam
      // dois `<select>` OPCIONAIS, e os dois têm entrada manual ao lado — o recebimento pode ser
      // registrado inteiro sem eles. Um terceiro estado de erro aqui pagaria o custo de uma
      // superfície nova para uma falha que não bloqueia ninguém. O que era errado era o
      // `/* ignore */` sem explicação, que fazia parecer esquecimento.
    }
  };

  const abrirDetalhe = async (id) => {
    const seq = ++detalheFetchSeqRef.current;
    setSelectedId(id);
    setLoadingDetalhe(true);
    // Etapa 36: abrir (ou recarregar) o painel zera a autorização de excedente e a recusa da
    // conferência anterior — senão a caixa marcada no recebimento A viajaria para o B, e a
    // mensagem de erro de A ficaria acusando o B de algo que não aconteceu nele.
    setAutorizarExcedente(false);
    setErroConferencia(null);
    // Só na TROCA de id (ver `idCarregadoRef`): no refetch do mesmo id o `detalhe` fica de pé e o
    // bloco de anexos não remonta.
    if (idCarregadoRef.current !== id) setDetalhe(null);
    try {
      const res = await api.get(`/almoxarifado/recebimentos/${id}`);
      if (seq !== detalheFetchSeqRef.current) return;   // chegou atrasada: outro clique venceu
      setDetalhe(res.data);
      idCarregadoRef.current = id;
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
        // `tipo_recebimento` NÃO entra aqui — ver o comentário de `EMPTY_FISCAL` (revisão final F2).
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
      if (seq !== detalheFetchSeqRef.current) return;
      toast.error('Erro ao carregar recebimento');
      setSelectedId(null);
      setDetalhe(null);
      idCarregadoRef.current = null;
    } finally {
      // Só a requisição VENCEDORA desliga o spinner: o `finally` de uma resposta atrasada
      // apagaria o "carregando" do clique que ainda está em voo.
      if (seq === detalheFetchSeqRef.current) setLoadingDetalhe(false);
    }
  };

  // Fechar é fechar: além de zerar o painel, BUMPA a sequência para descartar a resposta em voo —
  // senão o GET do clique anterior reabriria o painel sozinho depois do ✕.
  const fecharDetalhe = () => {
    ++detalheFetchSeqRef.current;
    setSelectedId(null);
    setDetalhe(null);
    idCarregadoRef.current = null;
    setAutorizarExcedente(false);
    setErroConferencia(null);
    // Etapa 36 (RN-19): fechar tem de desligar o "carregando" TAMBEM. O `finally` de `abrirDetalhe`
    // so desliga a flag quando a sequencia ainda e a dele, entao fechar com um GET em voo a deixava
    // pendurada em `true` para sempre.
    //
    // SEM CENARIO DE TESTE, e isso e declaracao, nao esquecimento (caso 2 da skill fechar-etapa):
    // todo consumidor de `loadingDetalhe` nesta tela so renderiza com o painel aberto, e abrir o
    // painel passa por `abrirDetalhe`, que liga a flag na entrada — logo nao existe sequencia de
    // gestos em que a flag pendurada apareca no DOM. Qualquer assercao escrita hoje passaria antes
    // e depois desta linha (o controle positivo e um NO-OP declarado). A linha fica porque a forma
    // segura e barata e porque o proximo consumidor de `loadingDetalhe` — um botao de atualizar o
    // detalhe, por exemplo — herdaria o defeito em silencio.
    setLoadingDetalhe(false);
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
        series: item.series,
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

  // Etapa 36 (RN-16) — o PRIMEIRO chamador de `PUT /almoxarifado/recebimentos/:id/conferir`.
  //
  // A rota existia completa (gate `receber_material`, gravação por item, disparo do alerta
  // `DIVERGENCIA_RECEBIMENTO` no fim) e NUNCA teve chamador no client — achado Crítico registrado
  // em `alertaEventoGanchos.api.test.js`. Sem ela, `quantidade_recebida` nunca diferia de
  // `quantidade_esperada` por gesto de tela (o modal de criar nasce com as duas iguais), então o
  // alerta de divergência tinha consumidor, dedupe, e-mail e central, e ZERO produtor alcançável.
  //
  // Por que `/conferir` e NÃO `/fiscal` (decisão 8 do desenho da etapa): (1) o `/fiscal` só
  // renderiza no Faturamento, três transições DEPOIS do gesto real — a divergência só seria
  // registrável quando o material já tivesse passado pelo almoxarifado e por Compras; (2) o
  // `/conferir` é a rota que existe para isto, e usar a outra a deixaria morta; (3) o `/conferir`
  // grava `conferencia_quantidade`, que o `/fiscal` não grava.
  //
  // SEM `status` no payload, de propósito: salvar a contagem não avança o workflow. Conferir e
  // "Finalizar Conferência" continuam sendo dois gestos — avançar o status por dentro do salvar
  // seria mudança de comportamento invisível para quem só quis corrigir um número.
  const salvarConferencia = async () => {
    if (!detalhe) return;
    setSaving(true);
    setErroConferencia(null);
    try {
      const itens = (detalhe.itens || []).map((item) => {
        const recebida = Number(item.quantidade_recebida);
        // ⚠️ `Number('')` é 0. O input nasce `value={item.quantidade_recebida ?? ''}`, então sem
        // esta guarda limpar o campo e salvar mandaria `quantidade_recebida: 0` — que o servidor
        // GRAVA (0 é menor que a esperada, não é excedente, responde 200) e que dispara o alerta
        // de divergência com "0 recebidos". O campo é OMITIDO quando está vazio: é o caso que o
        // `COALESCE` do `/conferir` existe para preservar, e o par (omitir aqui + `COALESCE` lá) é
        // o que faz "não digitei" ser diferente de "chegou zero".
        const preenchida = item.quantidade_recebida !== '' && item.quantidade_recebida != null
          && Number.isFinite(recebida);
        // ⚠️ Fix-round 1: `conferencia_quantidade` sai pela MESMA porta, e não por fora dela.
        // Mandar o booleano SEMPRE (era o que esta função fazia) deixava o `COALESCE` que a T3 pôs
        // nessa coluna MORTO para este chamador — o serviço só preserva o valor gravado quando a
        // chave vem ausente/nula, porque ele converte para 0/1 apenas quando o campo `!= null`.
        // Dano medido pelo cenário (q): item conferido e marcado `true`; o operador reabre o
        // painel, limpa (ou nunca digita) o campo daquele item e salva para gravar a contagem de
        // OUTRO item — a quantidade era preservada pelo COALESCE, mas o `false` que ia junto
        // DESMARCAVA a conferência anterior, em silêncio. Campo vazio é "não contei este item":
        // não manda quantidade, e também não manda veredicto sobre ela.
        return {
          id: item.id,
          ...(preenchida ? {
            quantidade_recebida: recebida,
            conferencia_quantidade: recebida === Number(item.quantidade_esperada),
          } : {}),
        };
      });
      await api.put(`/almoxarifado/recebimentos/${detalhe.id}/conferir`, {
        itens,
        // A flag só vai quando a caixa está marcada: mandar `false` sempre faria o serviço
        // exercitar o caminho da autorização (e do 403) em toda conferência normal.
        ...(autorizarExcedente ? { autorizar_excedente: true } : {}),
      });
      toast.success('Conferência salva');
      // Mesmo molde de `salvarFiscal`: refetch do MESMO id + recarga da lista. O refetch do mesmo
      // id não anula `detalhe` (guarda `idCarregadoRef`), então o bloco de anexos continua
      // montado com o arquivo já escolhido no input.
      abrirDetalhe(detalhe.id);
      loadRecebimentos();
    } catch (err) {
      const msg = err.response?.data?.error || 'Erro ao salvar a conferência';
      toast.error(msg);
      setErroConferencia(msg);
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

  // Etapa 36 (RN-17): o aviso de divergência, com as DUAS quantidades e a diferença. A literal é
  // a MESMA que vai para o manual — não aproximar nem reescrever.
  // `null` quando o campo está vazio (não é divergência, é "ainda não contei") e quando as
  // quantidades batem. `Number(diff.toFixed(2))` para que 13 não apareça como
  // 13.000000000000001, que é o que a subtração de decimais produz.
  const avisoDivergencia = (item) => {
    const recebida = Number(item.quantidade_recebida);
    if (item.quantidade_recebida === '' || item.quantidade_recebida == null
      || !Number.isFinite(recebida)) return null;
    const esperada = Number(item.quantidade_esperada);
    if (!Number.isFinite(esperada) || recebida === esperada) return null;
    // Revisão final (R7): duas casas era o arredondamento errado no caso pequeno. Com `200.001`
    // contra `200`, o aviso dizia "Divergência: 0 a mais que o esperado (200)" — a tela afirmando
    // que a diferença é ZERO enquanto o servidor, que compara os números crus, barra o save com
    // 400 de excedente. Abaixo de meio centésimo o aviso mostra até QUATRO casas; acima, segue em
    // duas (que é o que impede `13.000000000000001` de aparecer).
    const bruto = Math.abs(recebida - esperada);
    const diff = Number(bruto.toFixed(bruto < 0.005 ? 4 : 2));
    const sentido = recebida > esperada ? 'a mais' : 'a menos';
    return (
      <div style={{ color: 'var(--gmp-danger)', fontSize: '0.72rem', marginTop: 4 }}>
        Divergência: {diff} {sentido} que o esperado ({esperada})
      </div>
    );
  };

  // A caixa de autorização só aparece quando existe DE FATO item acima do pedido: caixa sempre
  // visível é formulário, não barreira, e treina o operador a marcá-la por reflexo.
  const temExcedente = (detalhe?.itens || []).some((item) => {
    const recebida = Number(item.quantidade_recebida);
    if (item.quantidade_recebida === '' || item.quantidade_recebida == null
      || !Number.isFinite(recebida)) return false;
    return recebida > Number(item.quantidade_esperada);
  });

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

  // `undefined` e nao `0` quando nao ha detalhe (achado F2 da revisao final da Etapa 35): este e o
  // 8o consumidor de `detalhe`, e ficou de fora da tabela de 7 do desenho da T4. Como a T4 passou a
  // ANULAR `detalhe` na troca de linha (RN-07), com `0` a barra de passos desabava para o passo 1
  // ACESO durante todo o round-trip e pulava de volta quando o detalhe novo chegava — e, na lista
  // sem nenhuma linha aberta, ela ja acendia "Almoxarifado" sem haver recebimento algum.
  // `AlmoxPageHeader` faz `idx = currentStep ?? -1`, entao `undefined` = nenhum passo aceso e
  // nenhum concluido: durante a carga a barra fica NEUTRA em vez de mentir. Molde: `RequisicoesList.js`,
  // `currentStep={warehouseMode && detalhe ? … : undefined}`.
  // Descartado: guardar o ultimo passo num ref para "congelar" a barra — mostraria o passo do
  // recebimento ANTERIOR sob o id novo, que e exatamente a classe de defeito que a RN-07 fechou.
  const currentStep = detalhe
    ? (STATUS_INFO[detalhe.status]?.etapa || 1) - 1
    : undefined;

  const renderAcoes = () => {
    if (!detalhe) return null;

    // Etiquetas dos itens processados/aprovados
    if (['PROCESSADO', 'APROVADO'].includes(detalhe.status)) {
      const etiquetasNota = montarEtiquetasDoRecebimento(detalhe.itens || [], materiais, window.location.origin);
      return (
        <button className="btn-almox-secondary" style={{ width: '100%', justifyContent: 'center' }}
          disabled={etiquetasNota.length === 0}
          title={etiquetasNota.length === 0 ? 'Nenhum item com entrada para etiquetar' : 'Gera o PDF de etiquetas dos itens desta nota'}
          onClick={() => setEtiquetas(etiquetasNota)}>
          <FiTag size={14} /> Imprimir etiquetas dos itens
        </button>
      );
    }

    // Early return para status finais que não têm ações
    if (['REPROVADO'].includes(detalhe.status)) return null;

    const s = detalhe.status;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
        {/* Etapa 36 (RN-16): ANTES do botão de workflow, de propósito — salvar a contagem é o
            gesto anterior a finalizar a conferência. Nos dois status em que o almoxarifado ainda
            tem o material na mão: `RECEBIDO` (acabou de chegar) e `EM_CONFERENCIA`. */}
        {['RECEBIDO', 'EM_CONFERENCIA'].includes(s) && (
          <button type="button" className="btn-almox-secondary" style={{ width: '100%', justifyContent: 'center' }}
            onClick={salvarConferencia} disabled={saving}>
            <FiCheck size={14} /> Salvar Conferência
          </button>
        )}
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
            {/* Etapa 35: o botão era só o ícone — sem texto e sem nome acessível, nenhum leitor
                de tela o anunciava e nenhum teste conseguia selecioná-lo. Mesmo padrão do refresh
                do detalhe de requisições, o botão `title="Atualizar detalhe e saldos"` de
                `RequisicoesList.js` (referência por título, não por linha: o número rotou entre a
                T3 e a T4 desta mesma etapa). */}
            <button type="button" className="btn-almox-secondary" title="Atualizar lista" onClick={loadRecebimentos}>
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

      {/* `selectedId` e NÃO `detalhe` (Etapa 35): o painel em carga já precisa da coluna de
          420px, senão o grid reflui duas vezes a cada clique. */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedId ? '1fr 420px' : '1fr', gap: 20 }}>
        <div className="almox-table-container">
          {/* A ORDEM dos ramos é a regra, não estilo: com o ramo de `erro` DEPOIS do teste de
              lista vazia, a rede caída volta a renderizar "Nenhum recebimento registrado" e o
              conserto some. Molde: `HistoricoInspecoes.js:106-116`. */}
          {loading ? <SkeletonTable rows={8} columns={6} /> : erro ? (
            <div className="almox-empty">
              <p>Não foi possível carregar os recebimentos.</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>{erro}</p>
              <button type="button" className="btn-almox-secondary" onClick={loadRecebimentos}>
                Tentar de novo
              </button>
            </div>
          ) : recebimentos.length === 0 ? (
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
                    <tr key={r.id} style={{ cursor: 'pointer', background: selectedId === r.id ? 'rgba(79,172,254,0.06)' : '' }}
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

        {/* Gatilhado por `selectedId`, não por `detalhe` (Etapa 35, RN-07): o painel é do CLIQUE,
            o conteúdo é do registro carregado. Como `detalhe` agora é nulo enquanto o novo
            carrega, tudo aqui dentro que desreferencia `detalhe` precisa da própria guarda — o
            cabeçalho por `?.`, o corpo pelo par `loadingDetalhe || !detalhe`, e o bloco de anexos
            pelo `{detalhe && …}` do fim. */}
        {selectedId && (
          <div className="almox-detail-panel">
            <div className="almox-detail-panel-header">
              <div>
                <div style={{ fontWeight: 700, fontFamily: 'monospace', color: '#4facfe' }}>{detalhe?.numero || '...'}</div>
                {detalhe && (
                  <span className={`almox-badge almox-badge-${STATUS_INFO[detalhe.status]?.cls || 'ajuste'}`}>
                    {STATUS_INFO[detalhe.status]?.label || detalhe.status}
                  </span>
                )}
              </div>
              <button type="button" className="almox-modal-close" onClick={fecharDetalhe}>✕</button>
            </div>
            {loadingDetalhe || !detalhe ? (
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
                {['EM_ENTRADA_NF', 'ENCAMINHADO_FATURAMENTO'].includes(detalhe.status) && (
                  <div className="almox-hint-banner" style={{ marginBottom: 16, fontSize: '0.8rem' }}>
                    Preencha lote e séries e clique em Salvar Dados Fiscais antes de Processar a Nota — o processamento lê o que está salvo, não o que está digitado.
                  </div>
                )}
                {(detalhe.itens || []).map((item) => (
                  <div key={item.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--gmp-border)', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>{item.material_nome}</div>
                        <div style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>{item.material_codigo}</div>
                      </div>
                      {/* Etapa 36 (RN-16/RN-17): até aqui o painel mostrava UMA quantidade —
                          `recebida || esperada` —, e não havia campo nenhum para dizer quanto
                          chegou de verdade. As duas, agora, porque a conferência é a comparação:
                          sem a esperada ao lado, "187" não é informação, é um número.
                          `??` e não `||`: com `||`, uma recebida de `0` (nada chegou) exibia a
                          ESPERADA, escondendo exatamente o caso mais grave. */}
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700 }}>{item.quantidade_recebida ?? item.quantidade_esperada} {item.unidade}</div>
                        <div style={{ color: 'var(--gmp-text-light)', fontSize: '0.7rem' }}>Esperada: {item.quantidade_esperada}</div>
                      </div>
                    </div>
                    {/* O campo de contagem só nos dois status em que o material está com o
                        almoxarifado. Depois disso a quantidade já virou base de custo médio e de
                        conta a pagar, e corrigi-la aqui seria mexer no passado sem trilha. */}
                    {['RECEBIDO', 'EM_CONFERENCIA'].includes(detalhe.status) && (
                      <div style={{ marginTop: 6 }}>
                        <input className="almox-input" type="number" step="0.01" min="0"
                          title="Qtd. conferida" placeholder="Qtd. conferida"
                          value={item.quantidade_recebida ?? ''}
                          style={{ fontSize: '0.75rem', padding: '4px 6px', maxWidth: 160 }}
                          onChange={(e) => atualizarItemDetalhe(item.id, 'quantidade_recebida', e.target.value)} />
                        {avisoDivergencia(item)}
                      </div>
                    )}
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
                        {materiais.find((m) => m.id === item.material_id)?.controle_serie === 1 && (() => {
                          const seriesPreenchidas = String(item.series || '').split(/\r?\n/).filter((s) => s.trim()).length;
                          const quantidadeEsperada = item.quantidade_recebida || item.quantidade_esperada || 0;
                          return (
                            <div className="almox-field" style={{ gridColumn: '1 / -1', marginTop: 6 }}>
                              <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Séries (uma por linha) — <span style={{ color: seriesPreenchidas === quantidadeEsperada ? 'var(--gmp-text-light)' : 'var(--gmp-danger)' }}>{seriesPreenchidas}/{quantidadeEsperada}</span></label>
                              <textarea className="almox-textarea" rows={2} value={item.series || ''}
                                style={{ fontSize: '0.75rem', padding: '4px 6px' }}
                                onChange={(e) => atualizarItemDetalhe(item.id, 'series', e.target.value)} />
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </div>
                ))}
                {/* Etapa 36 (RN-18): a autorização de excedente. `pode(...)` aqui é conveniência
                    de interface — esconder a caixa de quem não pode marcá-la —, NÃO segurança: o
                    hook falha aberto e é o `conferirRecebimento` que checa `autorizar_excedente`
                    por `can()`, devolvendo 403 com a literal que aparece no aviso abaixo. */}
                {temExcedente && pode('autorizar_excedente') && (
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.78rem', marginTop: 8 }}>
                    <input type="checkbox" checked={autorizarExcedente}
                      onChange={(e) => setAutorizarExcedente(e.target.checked)} />
                    Autorizo o recebimento acima do pedido
                  </label>
                )}
                {renderAcoes()}
                {/* A recusa da conferência FICA na tela. As duas literais desta porta dizem QUEM
                    resolve ("a autorização de excedente é de Compras ou do Administrador", "exige
                    a permissão autorizar_excedente"), e num toast de cinco segundos elas não
                    chegam a ser lidas — o operador fica com "não salvou" e nenhum motivo.
                    (Revisão final, F3: a literal do 400 mandava "marque a autorização de
                    excedente" — um gesto impossível para o ALMOXARIFE, que não vê a caixa.) */}
                {erroConferencia && (
                  <div className="almox-hint-banner" role="alert"
                    style={{ marginTop: 12, fontSize: '0.8rem', color: 'var(--gmp-danger)' }}>
                    {erroConferencia}
                  </div>
                )}
                {detalhe.contas_pagar_id && (
                  <div className="almox-hint-banner" style={{ marginTop: 12, fontSize: '0.8rem' }}>
                    Conta a pagar #{detalhe.contas_pagar_id} gerada. Verifique em{' '}
                    <Link to="/financeiro/contas-pagar">Contas a Pagar</Link>.
                  </div>
                )}

              </div>
            )}

            {/* Etapa 34 — anexos do recebimento (NF digitalizada, certificado, boleto).
                INLINE, no fim do painel: o painel é o único lugar do client onde o `id` do
                recebimento existe, e é onde quem acabou de registrar cai
                (`handleCriar` → `abrirDetalhe(res.data.id)`), com a nota fiscal na mão.
                FORA do ternário de `loadingDetalhe`, de propósito (achado F2 da revisão da
                branch): o bloco guarda estado LOCAL do usuário — o arquivo escolhido no input,
                o tipo e a descrição (`AnexosDocumento.js:110-112`) — e `workflow` (`:151`),
                `salvarFiscal` (`:195`) e `processarNota` (`:212`) recarregam o detalhe com
                `abrirDetalhe(detalhe.id)`, que começa em `setLoadingDetalhe(true)`. Dentro do
                ternário, cada uma dessas ações desmontava o corpo e jogava fora o arquivo já
                escolhido, com um segundo GET de anexos de brinde; "Anexar" respondia
                "Arquivo é obrigatório" sem nada na tela explicando. ⚠️ Etapa 35: a frase antiga
                ("`abrirDetalhe` nunca zera `detalhe`, então o bloco não remonta") FICOU ERRADA —
                `abrirDetalhe` agora ZERA, quando o id muda (RN-07). A justificativa do F2
                continua de pé, mas por outro motivo: a guarda `idCarregadoRef.current !== id`.
                No refetch do MESMO id o `detalhe` não é anulado, o `{detalhe && …}` abaixo segue
                verdadeiro entre os dois commits e o React reconcilia o mesmo elemento na mesma
                posição — o bloco continua montado com o arquivo já escolhido (cenário (g), que
                mede IDENTIDADE de nó, não presença).
                E esse `{detalhe && …}` é obrigatório agora, não decorativo: o painel passou a ser
                gatilhado por `selectedId`, então sem ele `detalhe.id` estouraria na troca de
                linha. Ele é também a régua da RN-07 (cenário (k)) — trocar de linha tira o bloco
                de cena em vez de deixá-lo oferecendo upload com o `entidade_id` ANTIGO.
                `detalhe.id` e NÃO o id da linha clicada (`selectedId`): o bloco lê o REGISTRO
                CARREGADO — `selectedId` aqui anexaria a um detalhe que ainda nem chegou, e
                `recebimentos[0].id` mostraria os anexos de outro recebimento sem erro na tela.
                Sem gate novo: quem vê o recebimento vê os anexos dele; anexar/remover
                continua decidido pelo backend (requirePermission), com a UI barrando antes
                do formulário pelo próprio hook do componente. */}
            {detalhe && (
              <div style={{ padding: '0 20px 20px' }}>
                <AnexosDocumento entidade="recebimento" entidadeId={detalhe.id} titulo="Anexos" />
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
                    {erroMateriais && (
                      <p style={{ fontSize: '0.8rem', color: 'var(--gmp-error)', margin: '0 0 8px' }}>
                        Não foi possível carregar a lista de materiais.{' '}
                        <button type="button" className="almox-link-btn" onClick={loadMateriais}>
                          Tentar de novo
                        </button>
                      </p>
                    )}
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

      {/* Etiquetas PDF */}
      <EtiquetasPdfModal etiquetas={etiquetas} onClose={() => setEtiquetas(null)} />
    </div>
  );
};

export default RecebimentosAlmoxarifado;
