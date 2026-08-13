import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiRefreshCw, FiSend, FiCornerDownLeft, FiCheckSquare, FiXCircle, FiFileText, FiEye, FiPlus, FiTrash2, FiScissors } from 'react-icons/fi';
import { SkeletonTable } from '../SkeletonLoader';
import { useAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';
import { gerarRemessaPDF } from '../../utils/remessaPdf';
import SeloProprietario, { nomeDoDono, DONO_SEM_NOME } from './SeloProprietario';
import './Almoxarifado.css';

/**
 * Remessas a Terceiros (Etapa 8b).
 *
 * Ate esta etapa, quando uma chapa ia para o galvanizador ela sumia do controle: ou alguem dava
 * baixa (e o material desaparecia do patrimonio, embora continuasse sendo da empresa), ou nao dava
 * baixa nenhuma (e o sistema afirmava que a chapa estava na prateleira, com ela a 40 km).
 *
 * As ACOES seguem o STATUS, e nao a vontade da tela: quem decide e o backend (a maquina de estados
 * em thirdPartyStateMachine.js). Aqui os botoes so escondem o que o servidor recusaria — oferecer
 * "Enviar" numa remessa ja enviada so produziria um 400 que o operador nao entenderia.
 *
 * "Vencida" e alerta que SE SOMA ao status (badge separado, ao lado), e vem calculado do servidor
 * (`vencida` na listagem). Recalcular aqui criaria uma segunda conta que discordaria do filtro.
 *
 * NAO confundir com /almoxarifado/devolucoes (Etapa 7, o material VOLTA para o estoque) nem com
 * Materiais de Clientes (Etapa 8, o material e de outro dono). Aqui o material e NOSSO (ou de um
 * cliente, e o documento diz de quem) e esta FORA DO PREDIO, temporariamente.
 */
const STATUS_COM_ENVIO = ['ABERTA'];
const STATUS_COM_RETORNO = ['ENVIADA', 'RETORNO_PARCIAL'];
const STATUS_COM_ENCERRAR = ['ENVIADA', 'RETORNO_PARCIAL'];
const STATUS_COM_CANCELAR = ['ABERTA', 'ENVIADA', 'RETORNO_PARCIAL'];

/**
 * Transformacao (Etapa 8c) tem os MESMOS status do retorno, e isto e afirmacao e nao coincidencia:
 * as duas sao formas de o material voltar do terceiro, e as duas passam por
 * sm.PODE_RECEBER_RETORNO no servidor. Duas listas com os mesmos valores divergiriam na primeira
 * mudanca; uma constante propria existe para o dia em que elas DEVAM divergir.
 */
const STATUS_COM_TRANSFORMACAO = STATUS_COM_RETORNO;

/** Classificacao da linha de resultado (schema.TIPOS_RESULTADO) em linguagem de tela. */
const ROTULO_RESULTADO = {
  PECA: 'Peça (recebe o custo rateado da chapa)',
  SOBRA: 'Sobra / retalho (entra a custo zero)',
};

/**
 * Destinos do encerramento (thirdPartyService.DESTINOS_ENCERRAMENTO) em linguagem de tela.
 * Ficam AQUI, e nao importados de utils/remessaPdf: o documento fala com o terceiro, a tela fala
 * com o almoxarife, e as duas frases nao precisam ser a mesma.
 */
const ROTULO_DESTINO = {
  PERDA_NO_TERCEIRO: 'perda no terceiro',
  CONSUMIDO_NO_PROCESSO: 'consumido no processo',
};

/**
 * O que a coluna "baixado" significa, lido do CABECALHO da remessa.
 *
 * Sem isto a tela mentiria: ao encerrar com destino (e ao cancelar), o servico grava
 * `quantidade_retornada = quantidade` nos itens pendentes so para zerar a pendencia — ali o numero
 * quer dizer LIQUIDADO, nao "voltou". Um item perdido no galvanizador fica com pendente zero SEM
 * ter retornado nada. A verdade do que voltou esta em `retornos` (retornos_remessa_item_almoxarifado).
 */
function rotuloDaBaixa(remessa) {
  if (!remessa) return null;
  if (remessa.status === 'CANCELADA') return 'estornado no cancelamento (voltou ao disponivel sem sair da remessa)';
  const destino = remessa.encerramento_destino;
  if (!destino) return null;
  return `baixa definitiva no encerramento — ${ROTULO_DESTINO[destino] || String(destino).toLowerCase().replace(/_/g, ' ')}`;
}

/** Nome do dono para a mensagem de remessa mista — `null` e o nosso estoque, e tem nome proprio. */
const rotuloDono = (material) => nomeDoDono(material) || 'estoque proprio (material nosso)';

/** `proprietario_cliente_id` e NUMERO ou `null` — nunca booleano, e `0` nao existe como dono. */
const donoDoMaterial = (m) => {
  const id = m?.proprietario_cliente_id;
  return (id === null || id === undefined || id === '') ? null : Number(id);
};

const RemessasTerceirosAlmoxarifado = () => {
  const { bloquearSeNaoPode } = useAlmoxPermissoes();
  const [remessas, setRemessas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [aberta, setAberta] = useState(null);

  const [modal, setModal] = useState(null); // { tipo: 'nova'|'retorno'|'encerrar'|'cancelar', remessa }
  const [form, setForm] = useState({});
  const [salvando, setSalvando] = useState(false);

  // Formulario de criacao
  const [materiais, setMateriais] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [novoItem, setNovoItem] = useState({ material_id: '', quantidade: '', peso: '' });
  const [itensNovos, setItensNovos] = useState([]);

  // Linhas de resultado do modal de transformacao (N por documento) e o formulario da linha nova.
  const [resultados, setResultados] = useState([]);
  const [novoResultado, setNovoResultado] = useState({ material_id: '', quantidade: '', tipo_resultado: 'PECA' });
  // Atalho de criar o material resultante (decisao 6): sub-formulario que aparece SOB DEMANDA,
  // nunca junto — criar material tem gate PROPRIO (criar_material), diferente do da transformacao.
  const [novoMaterial, setNovoMaterial] = useState(null); // null = fechado; {} = aberto

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    const qs = filtroStatus ? `?status=${filtroStatus}` : '';
    api.get(`/almoxarifado/remessas-terceiros${qs}`)
      .then((r) => { if (!cancelado) setRemessas(Array.isArray(r.data) ? r.data : []); })
      .catch(() => { if (!cancelado) { setRemessas([]); toast.error('Não foi possível carregar as remessas'); } })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [filtroStatus, reloadToken]);

  const modalTipo = modal?.tipo || null;

  // Materiais e terceiros so sao buscados quando o formulario que precisa deles abre: sao duas
  // listas grandes que nenhuma outra parte da tela usa. Guarda `cancelado` no molde de
  // LotesAlmoxarifado — fechar o modal antes da resposta chegar nao pode pintar estado numa tela
  // que mudou.
  //
  // Etapa 8c: `transformacao` ENTROU nesta guarda. Sem isso o `<select>` de material do resultado
  // nasceria vazio para sempre e `adicionarResultado` nunca acharia o material — a tela inteira
  // seria inalcancavel, com a rota do servidor pronta e sem consumidor. Fornecedor continua so no
  // `nova`: a transformacao nao escolhe terceiro, ela usa o da remessa que ja existe.
  useEffect(() => {
    if (modalTipo !== 'nova' && modalTipo !== 'transformacao') return undefined;
    let cancelado = false;
    Promise.all([
      api.get('/almoxarifado/materiais').catch(() => ({ data: [] })),
      modalTipo === 'nova'
        ? api.get('/almoxarifado/recebimentos-aux/fornecedores').catch(() => ({ data: [] }))
        : Promise.resolve(null),
    ]).then(([m, f]) => {
      if (cancelado) return;
      setMateriais(Array.isArray(m.data) ? m.data : []);
      if (f) setFornecedores(Array.isArray(f.data) ? f.data : []);
    });
    return () => { cancelado = true; };
  }, [modalTipo]);

  const recarregar = useCallback(() => setReloadToken((t) => t + 1), []);

  const abrirDetalhe = useCallback(async (remessa) => {
    try {
      const r = await api.get(`/almoxarifado/remessas-terceiros/${remessa.id}`);
      setAberta(r.data);
      return r.data;
    } catch {
      toast.error('Não foi possível carregar a remessa');
      return null;
    }
  }, []);

  const enviar = async (remessa, evento) => {
    if (!bloquearSeNaoPode('remessar_terceiro', evento)) return;
    try {
      await api.post(`/almoxarifado/remessas-terceiros/${remessa.id}/enviar`, {});
      toast.success('Remessa enviada — o saldo saiu do disponível');
      recarregar();
    } catch (err) {
      // A mensagem do backend nomeia o item que travou e quanto ha disponivel. Trocar por um texto
      // generico apagaria justamente o numero que resolve o problema.
      toast.error(err.response?.data?.error || 'Erro ao enviar a remessa');
    }
  };

  const abrirModal = (tipo, remessa, evento) => {
    if (!bloquearSeNaoPode('remessar_terceiro', evento)) return;
    setForm({});
    setResultados([]);
    setNovoResultado({ material_id: '', quantidade: '', tipo_resultado: 'PECA' });
    setNovoMaterial(null);
    setModal({ tipo, remessa });
    // Retorno, transformacao e encerramento decidem pelos ITENS (qual item voltou, qual chapa foi
    // consumida, se sobrou pendencia), entao o detalhe e recarregado ao abrir: a listagem em
    // memoria pode estar velha. A transformacao entrou aqui na 8c pelo mesmo motivo do retorno —
    // sem isto, quem clicasse em "Transformar" SEM ter clicado em "Abrir" veria o seletor de item
    // vazio e nao teria como registrar nada.
    if (tipo === 'retorno' || tipo === 'transformacao' || tipo === 'encerrar') abrirDetalhe(remessa);
  };

  const abrirNova = (evento) => {
    if (!bloquearSeNaoPode('remessar_terceiro', evento)) return;
    setForm({});
    setNovoItem({ material_id: '', quantidade: '', peso: '' });
    setItensNovos([]);
    setModal({ tipo: 'nova', remessa: null });
  };

  /**
   * Uma remessa nao junta donos diferentes — a mesma recusa que o servidor faz em
   * resolverProprietario, adiantada aqui para o operador nao montar dez itens e perder tudo no
   * Salvar. O documento de remessa nomeia UM proprietario; com dois, nao ha nome a escrever.
   */
  const adicionarItem = () => {
    const material = materiais.find((m) => String(m.id) === String(novoItem.material_id));
    if (!material) { toast.error('Selecione o material do item'); return; }
    const qtd = Number(novoItem.quantidade);
    if (!(qtd > 0)) { toast.error('Informe a quantidade do item'); return; }
    if (itensNovos.length > 0) {
      const donoAtual = donoDoMaterial(itensNovos[0]);
      const dono = donoDoMaterial(material);
      if (donoAtual !== dono) {
        toast.error(`Esta remessa já tem material de ${rotuloDono(itensNovos[0])} e ${material.codigo} `
          + `é de ${rotuloDono(material)}. O documento de remessa nomeia um proprietário — `
          + 'separe em remessas diferentes.');
        return;
      }
    }
    setItensNovos((lista) => [...lista, {
      material_id: Number(material.id),
      codigo: material.codigo,
      nome: material.nome,
      unidade: material.unidade,
      proprietario_cliente_id: material.proprietario_cliente_id ?? null,
      proprietario_cliente_nome: material.proprietario_cliente_nome ?? null,
      quantidade: qtd,
      peso: novoItem.peso === '' ? null : Number(novoItem.peso),
    }]);
    setNovoItem({ material_id: '', quantidade: '', peso: '' });
  };

  /** O item de remessa selecionado no modal de transformacao (a CHAPA). */
  const itemDaTransformacao = useMemo(() => {
    const id = String(form.item_remessa_id || '');
    return (aberta?.itens || []).find((i) => String(i.id) === id) || null;
  }, [aberta, form.item_remessa_id]);

  /**
   * Acrescenta uma linha de resultado.
   *
   * As duas recusas aqui ESPELHAM o servidor (thirdPartyService.registrarTransformacao e
   * ownerRules.assertMesmoDonoNaTransformacao), adiantadas para o operador nao montar cinco linhas
   * e perder tudo no Confirmar. Quem DECIDE continua sendo o backend — se estas duas sumissem, o
   * 400 viria com a mesma frase.
   */
  const adicionarResultado = () => {
    const material = materiais.find((m) => String(m.id) === String(novoResultado.material_id));
    if (!material) { toast.error('Selecione o material do resultado'); return; }
    const qtd = Number(novoResultado.quantidade);
    if (!(qtd > 0)) { toast.error('Informe a quantidade do resultado'); return; }
    if (itemDaTransformacao && Number(material.id) === Number(itemDaTransformacao.material_id)) {
      toast.error(`${material.codigo} é a mesma chapa enviada. Chapa que volta como ela mesma não é `
        + 'transformação — use "Retorno".');
      return;
    }
    if (itemDaTransformacao) {
      const chapa = materiais.find((m) => Number(m.id) === Number(itemDaTransformacao.material_id));
      const donoChapa = donoDoMaterial(chapa);
      const donoResultado = donoDoMaterial(material);
      if (donoChapa !== donoResultado) {
        toast.error(`${itemDaTransformacao.material_codigo} é de ${rotuloDono(chapa)} e `
          + `${material.codigo} é de ${rotuloDono(material)}. A transformação não pode `
          + 'mudar o proprietário do material.');
        return;
      }
    }
    setResultados((lista) => [...lista, {
      material_id: Number(material.id),
      codigo: material.codigo,
      nome: material.nome,
      unidade: material.unidade,
      quantidade: qtd,
      tipo_resultado: novoResultado.tipo_resultado || 'PECA',
    }]);
    setNovoResultado({ material_id: '', quantidade: '', tipo_resultado: 'PECA' });
  };

  /**
   * Atalho EXPLICITO de criar o material resultante (decisao 6 do design).
   *
   * O motor NAO cria material — precedente do modulo (o recebimento tambem nao). Criar
   * implicitamente a partir de um formulario de retorno produziria cadastro-lixo a cada erro de
   * digitacao, e cadastro-lixo em almoxarifado nao se apaga: ele ganha saldo. Este atalho chama a
   * criacao NORMAL (POST /almoxarifado/materiais), so pre-preenchendo o que ja se sabe.
   *
   * GATE PROPRIO: `criar_material`, NAO `remessar_terceiro`. Sao listas de perfis diferentes
   * (ENGENHARIA cria material e nao transforma), e barrar pelo gate errado tiraria a funcao de quem
   * tem direito a ela.
   *
   * `codigo_auto: 1` porque GET /proximo-codigo devolve o MESMO numero para N chamadas
   * concorrentes: a colisao e resolvida no INSERT, com retry (materialService.createMaterial).
   */
  const abrirCriarMaterial = (evento) => {
    if (!bloquearSeNaoPode('criar_material', evento)) return;
    const chapa = materiais.find((m) => Number(m.id) === Number(itemDaTransformacao?.material_id));
    setNovoMaterial({ nome: '', unidade: 'UN', familia_id: chapa?.familia_id ?? null,
      proprietario_cliente_id: chapa?.proprietario_cliente_id ?? null });
  };

  const cadastrarMaterialResultante = async () => {
    if (!String(novoMaterial?.nome || '').trim()) { toast.error('Informe o nome do novo material'); return; }
    if (!novoMaterial.familia_id) {
      toast.error('A chapa enviada não tem família cadastrada — cadastre o material resultante pela tela de Materiais');
      return;
    }
    setSalvando(true);
    try {
      const prox = await api.get(`/almoxarifado/proximo-codigo?familia_id=${novoMaterial.familia_id}`);
      const criado = await api.post('/almoxarifado/materiais', {
        codigo: prox.data?.codigo,
        codigo_auto: 1,
        nome: String(novoMaterial.nome).trim(),
        unidade: String(novoMaterial.unidade || 'UN').trim(),
        familia_id: Number(novoMaterial.familia_id),
        proprietario_cliente_id: novoMaterial.proprietario_cliente_id ?? null,
      });
      setMateriais((lista) => [...lista, criado.data]);
      setNovoResultado((r) => ({ ...r, material_id: String(criado.data.id) }));
      setNovoMaterial(null);
      toast.success(`Material ${criado.data.codigo} criado — já selecionado como resultado`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao criar o material resultante');
    } finally { setSalvando(false); }
  };

  const criar = async () => {
    if (!form.fornecedor_id && !String(form.fornecedor_nome || '').trim()) {
      toast.error('Informe o terceiro que vai receber o material'); return;
    }
    if (itensNovos.length === 0) {
      toast.error('Adicione ao menos um item à remessa'); return;
    }
    const body = {
      fornecedor_nome: String(form.fornecedor_nome || '').trim() || undefined,
      tipo_servico: String(form.tipo_servico || '').trim() || undefined,
      prazo_previsto: form.prazo_previsto || undefined,
      observacoes: String(form.observacoes || '').trim() || undefined,
      itens: itensNovos.map((i) => (i.peso === null || Number.isNaN(i.peso)
        ? { material_id: i.material_id, quantidade: i.quantidade }
        : { material_id: i.material_id, quantidade: i.quantidade, peso: i.peso })),
    };
    if (form.fornecedor_id) body.fornecedor_id = Number(form.fornecedor_id);
    setSalvando(true);
    try {
      const r = await api.post('/almoxarifado/remessas-terceiros', body);
      toast.success(`Remessa ${r.data?.numero || ''} criada — ainda em ABERTA, o saldo só sai no envio`.trim());
      setModal(null);
      recarregar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao criar a remessa');
    } finally { setSalvando(false); }
  };

  const confirmar = async () => {
    const { tipo, remessa } = modal;
    if (tipo === 'nova') return criar();
    if (tipo === 'encerrar') {
      const detalhe = aberta?.id === remessa.id ? aberta : null;
      const temPendencia = (detalhe?.itens || []).some((i) => Number(i.pendente) > 0);
      // A tela so ADIANTA a exigencia; quem decide e o servidor, que sabe o pendente real. Sem o
      // detalhe carregado ela exige o destino: cobrar a mais e recuperavel, deixar passar sem
      // destino nao — o 400 do servidor viria depois com a mesma cobranca.
      if ((temPendencia || !detalhe) && !form.destino) {
        toast.error('Informe o destino do saldo que não voltou'); return undefined;
      }
      if (form.destino && !String(form.justificativa || '').trim()) {
        toast.error('Informe a justificativa do encerramento'); return undefined;
      }
    }
    if (tipo === 'cancelar' && !String(form.motivo || '').trim()) {
      toast.error('Informe o motivo do cancelamento'); return undefined;
    }
    if (tipo === 'transformacao') {
      if (!form.item_remessa_id) { toast.error('Selecione a chapa que foi transformada'); return undefined; }
      if (!(Number(form.quantidade_consumida) > 0)) {
        toast.error('Informe quanto da chapa foi consumido'); return undefined;
      }
      if (resultados.length === 0) {
        toast.error('Adicione ao menos um resultado (peça ou sobra) — se a chapa voltou inteira, use "Retorno"');
        return undefined;
      }
    }
    if (tipo === 'retorno' && !(Number(form.quantidade) > 0)) {
      toast.error('Informe a quantidade retornada'); return undefined;
    }
    if (tipo === 'retorno' && !form.item_remessa_id) {
      toast.error('Selecione o item que voltou do terceiro'); return undefined;
    }
    setSalvando(true);
    try {
      if (tipo === 'transformacao') {
        // OS DOIS NUMEROS SEPARADOS (decisao 1): `quantidade_consumida` esta na unidade da CHAPA e
        // e a unica coisa que conta no teto do item; cada resultado tem a SUA quantidade, na SUA
        // unidade, e nenhum deles encosta no teto. Trocar os dois aqui nao daria erro nenhum — 40
        // (UN) cabe no teto de 100 (KG) — e a chapa seria baixada errado. Por isso ha teste.
        const item = {
          item_remessa_id: Number(form.item_remessa_id),
          quantidade_consumida: Number(form.quantidade_consumida),
          resultados: resultados.map((r) => ({
            material_id: r.material_id, quantidade: r.quantidade, tipo_resultado: r.tipo_resultado,
          })),
        };
        if (Number(form.custo_servico) > 0) item.custo_servico = Number(form.custo_servico);
        const resp = await api.post(`/almoxarifado/remessas-terceiros/${remessa.id}/transformacoes`, {
          nota_fiscal: form.nota_fiscal || undefined,
          itens: [item],
        });
        toast.success('Transformação registrada — a chapa foi baixada e os resultados entraram no estoque');
        // Rendimento (decisao 7): INFORMATIVO. `toast.info` e nao `warn`: nao ha nada errado em um
        // material sem peso cadastrado, e um alerta amarelo ensinaria o operador a ignorar alertas.
        // E ele NUNCA bloqueia: chega depois do sucesso, com a operacao ja gravada.
        const rend = resp.data?.rendimento?.[0];
        if (rend?.calculavel) {
          toast.info(`Rendimento: ${rend.rendimento_percentual}% `
            + `(saíram ${rend.peso_saida} kg, voltaram ${rend.peso_retorno} kg)`);
        } else if (rend?.motivo) {
          toast.info(rend.motivo);
        }
      } else if (tipo === 'retorno') {
        await api.post(`/almoxarifado/remessas-terceiros/${remessa.id}/retornos`, {
          nota_fiscal: form.nota_fiscal || undefined,
          itens: [{ item_remessa_id: Number(form.item_remessa_id), quantidade: Number(form.quantidade) }],
        });
        toast.success('Retorno registrado');
      } else if (tipo === 'encerrar') {
        const body = form.destino
          ? { destino: form.destino, justificativa: String(form.justificativa).trim() }
          : {};
        await api.put(`/almoxarifado/remessas-terceiros/${remessa.id}/encerrar`, body);
        toast.success('Remessa encerrada');
      } else {
        await api.put(`/almoxarifado/remessas-terceiros/${remessa.id}/cancelar`,
          { motivo: String(form.motivo).trim() });
        toast.success('Remessa cancelada — o saldo pendente voltou ao disponível');
      }
      setModal(null);
      setAberta(null);
      recarregar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao concluir a operação');
    } finally { setSalvando(false); }
    return undefined;
  };

  /**
   * O que voltou de verdade, por item, SEPARADO em duas naturezas.
   *
   * `quantidade_retornada` do item ja significava DUAS coisas (voltou / foi liquidado no
   * encerramento). Com a 8c passa a significar TRES: a transformacao tambem soma nela. A coluna nao
   * distingue e nao vai distinguir nesta etapa (a decisao de criar `quantidade_baixada` foi adiada
   * de novo, com o motivo escrito no plano) — quem distingue e a linha de resultado, por
   * `tipo_resultado`: NULL = retorno simples da 8b, PECA/SOBRA = transformacao.
   */
  const retornadoPorItem = useMemo(() => {
    const mapa = {};
    for (const r of (aberta?.retornos || [])) {
      if (r.tipo_resultado) continue; // linha de transformacao: conta no outro mapa
      const k = String(r.item_remessa_id);
      mapa[k] = (mapa[k] || 0) + Number(r.quantidade || 0);
    }
    return mapa;
  }, [aberta]);

  /**
   * Transformado, por item: NAO e a soma das quantidades dos resultados — elas estao em OUTRA
   * unidade (40 pecas em UN nao sao 40 kg de chapa). O que foi consumido da chapa e o que sobra em
   * `quantidade_retornada` depois de tirar o que voltou de verdade e o que foi liquidado; como o
   * detalhe nao carrega a movimentacao de consumo, a tela deriva pelo unico caminho honesto: itens
   * que TEM linha de transformacao mostram a diferenca rotulada como "transformado".
   */
  const temTransformacao = useMemo(() => {
    const set = new Set();
    for (const r of (aberta?.retornos || [])) if (r.tipo_resultado) set.add(String(r.item_remessa_id));
    return set;
  }, [aberta]);

  const rotuloBaixa = rotuloDaBaixa(aberta);

  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1>Remessas a Terceiros</h1>
          <p>{loading ? 'Carregando...' : `${remessas.length} remessa(s) · material que está fora do prédio para beneficiamento`}</p>
        </div>
        <div className="almox-header-actions">
          <button className="btn-almox-secondary" onClick={recarregar}>
            <FiRefreshCw size={13} /> Atualizar
          </button>
          {/* PDF gerado no NAVEGADOR (utils/remessaPdf.js) — zero mudanca de servidor. So habilita
              com uma remessa aberta, porque o documento precisa dos ITENS. */}
          <button className="btn-almox-secondary" disabled={!aberta}
            onClick={() => gerarRemessaPDF({ remessa: aberta, itens: aberta?.itens || [], geradoEm: new Date().toISOString() })}>
            <FiFileText size={13} /> PDF da remessa
          </button>
          <button className="btn-almox-primary" onClick={abrirNova}>
            <FiPlus size={13} /> Nova remessa
          </button>
        </div>
      </div>

      <div className="almox-filters">
        <select className="almox-select" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {['ABERTA', 'ENVIADA', 'RETORNO_PARCIAL', 'ENCERRADA', 'CANCELADA'].map((s) => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>
      </div>

      <div className="almox-table-container">
        {loading ? <SkeletonTable rows={6} columns={7} />
          : remessas.length === 0 ? (
            <div className="almox-empty"><p>Nenhuma remessa a terceiros</p></div>
          ) : (
            <table className="almox-table almox-remessa-lista">
              <thead>
                <tr>
                  <th>Número</th><th>Terceiro</th><th>Serviço</th><th>Prazo</th>
                  <th>Itens</th><th>Status</th><th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {remessas.map((r) => (
                  <tr key={r.id}>
                    <td>{r.numero}</td>
                    <td>
                      {r.fornecedor_nome || '—'}
                      {/* Selo de propriedade: o MESMO componente da Etapa 8 (SeloProprietario), e
                          nao uma copia — o significado ("isto nao e nosso") ja tem uma cara so no
                          modulo, e o nome da classe CSS precisa de um unico lugar de verdade. */}
                      <SeloProprietario material={r} />
                    </td>
                    <td>{r.tipo_servico || '—'}</td>
                    <td>
                      {r.prazo_previsto || '—'}
                      {r.vencida ? (
                        <span className="almox-badge almox-badge-vencida" style={{ marginLeft: 6 }}
                          title="O prazo combinado com o terceiro já passou e ainda há material lá fora">Vencida</span>
                      ) : null}
                    </td>
                    <td>{r.itens_total}</td>
                    <td>
                      <span className={`almox-badge almox-badge-${String(r.status).toLowerCase()}`}>{r.status}</span>
                    </td>
                    <td>
                      <div className="almox-actions">
                        <button className="btn-almox-secondary" title="Abrir a remessa"
                          onClick={() => abrirDetalhe(r)}><FiEye size={13} /> Abrir</button>
                        {STATUS_COM_ENVIO.includes(r.status) && (
                          <button className="btn-almox-primary" title="Enviar ao terceiro (retém o saldo)"
                            onClick={(e) => enviar(r, e)}><FiSend size={13} /> Enviar</button>
                        )}
                        {STATUS_COM_RETORNO.includes(r.status) && (
                          <button className="btn-almox-secondary" title="Registrar retorno do terceiro"
                            onClick={(e) => abrirModal('retorno', r, e)}><FiCornerDownLeft size={13} /> Retorno</button>
                        )}
                        {STATUS_COM_TRANSFORMACAO.includes(r.status) && (
                          <button className="btn-almox-secondary"
                            title="A chapa foi cortada: registrar as peças e a sobra que voltaram"
                            onClick={(e) => abrirModal('transformacao', r, e)}>
                            <FiScissors size={13} /> Transformar
                          </button>
                        )}
                        {STATUS_COM_ENCERRAR.includes(r.status) && (
                          <button className="btn-almox-secondary" title="Encerrar a remessa"
                            onClick={(e) => abrirModal('encerrar', r, e)}><FiCheckSquare size={13} /> Encerrar</button>
                        )}
                        {STATUS_COM_CANCELAR.includes(r.status) && (
                          <button className="btn-almox-secondary" title="Cancelar a remessa"
                            onClick={(e) => abrirModal('cancelar', r, e)}><FiXCircle size={13} /> Cancelar</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      {aberta && (
        <div className="almox-table-container almox-remessa-detalhe" style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: '1rem', margin: '8px 12px' }}>
            {aberta.numero} — itens e retornos
          </h2>
          {rotuloBaixa && (
            // A frase existe porque a coluna "Baixado" nao e "Retornado": aqui o saldo saiu do
            // patrimonio sem voltar para a prateleira, e quem le a tela precisa saber disso.
            <p style={{ margin: '0 12px 8px', fontSize: '0.8rem', color: 'var(--gmp-error)' }}>
              Esta remessa teve {rotuloBaixa}
              {aberta.encerramento_justificativa ? `: ${aberta.encerramento_justificativa}` : ''}
              {aberta.cancelamento_motivo ? `: ${aberta.cancelamento_motivo}` : ''}
            </p>
          )}
          <table className="almox-table">
            <thead>
              <tr>
                <th>Código</th><th>Material</th><th>Un.</th><th>Enviado</th>
                <th title="Soma dos retornos registrados — o que voltou de verdade para a prateleira">Retornado</th>
                <th title="Consumido numa transformação: a chapa deixou de existir e voltou como outro material">Transformado</th>
                <th title="Saldo que deixou de ser pendente sem voltar: baixa no encerramento ou estorno do cancelamento">Baixado (não voltou)</th>
                <th>Ainda no terceiro</th>
              </tr>
            </thead>
            <tbody>
              {(aberta.itens || []).map((i) => {
                const retornado = retornadoPorItem[String(i.id)] || 0;
                // `quantidade_retornada` e o TETO acumulado que o motor usa; a parte dele que nao
                // tem retorno registrado foi liquidada (perda/consumo/estorno), nao devolvida.
                const semRetorno = Math.max(0, Number(i.quantidade_retornada || 0) - retornado);
                // Se este item tem linha de transformacao, o que sobrou foi CONSUMIDO na
                // transformacao; senao, foi liquidado no encerramento/cancelamento.
                const transformado = temTransformacao.has(String(i.id)) ? semRetorno : 0;
                const baixado = temTransformacao.has(String(i.id)) ? 0 : semRetorno;
                return (
                  <tr key={i.id}>
                    <td>{i.material_codigo}</td><td>{i.material_nome}</td><td>{i.unidade}</td>
                    <td>{i.quantidade}</td>
                    <td data-col="retornado">{retornado}</td>
                    <td data-col="transformado">{transformado > 0 ? transformado : '—'}</td>
                    <td data-col="baixado" title={baixado > 0 ? (rotuloBaixa || 'saldo baixado sem retorno') : undefined}>
                      {baixado > 0 ? `${baixado}${rotuloBaixa ? ` (${rotuloBaixa})` : ''}` : '—'}
                    </td>
                    <td>
                      <span className={`almox-badge almox-badge-${Number(i.pendente) > 0 ? 'baixo' : 'ok'}`}>{i.pendente}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {(aberta.retornos || []).length > 0 && (
            <p style={{ margin: '8px 12px', fontSize: '0.85rem' }}>
              {/* A natureza da linha vem rotulada: `tipo_resultado` NULL e retorno simples da 8b,
                  PECA/SOBRA e transformacao. Sem o rotulo a lista juntaria coisas diferentes com a
                  mesma cara — e e justamente `tipo_resultado` que carrega a distincao que
                  `quantidade_retornada` perdeu. */}
              Retornos recebidos: {aberta.retornos.map((r) => `${r.material_codigo} ${r.quantidade}`
                + (r.tipo_resultado ? ` [${r.tipo_resultado === 'SOBRA' ? 'sobra' : 'peça'}${r.custo_unitario_aplicado ? `, R$ ${r.custo_unitario_aplicado}/un` : ''}]` : '')
                + (r.nota_fiscal ? ` (${r.nota_fiscal})` : '')).join(' · ')}
            </p>
          )}
        </div>
      )}

      {modal && (
        <div className="almox-modal-overlay" onClick={() => { if (!salvando) setModal(null); }}>
          <div className={`almox-modal ${modal.tipo === 'nova' || modal.tipo === 'transformacao' ? 'almox-modal-lg' : 'almox-modal-sm'}`}
            onClick={(e) => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>
                {modal.tipo === 'nova' ? 'Nova remessa a terceiros'
                  : modal.tipo === 'transformacao' ? 'Registrar transformação (corte, dobra, usinagem)'
                    : modal.tipo === 'retorno' ? 'Registrar retorno'
                      : modal.tipo === 'encerrar' ? 'Encerrar remessa' : 'Cancelar remessa'}
              </h2>
              <button className="almox-modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="almox-modal-body">
              {modal.remessa && (
                <p style={{ marginTop: 0 }}><strong>{modal.remessa.numero}</strong> — {modal.remessa.fornecedor_nome}</p>
              )}

              {modal.tipo === 'nova' && (
                <>
                  <div className="almox-field">
                    <label className="almox-label">Terceiro cadastrado (Compras)</label>
                    <select className="almox-form-select" value={form.fornecedor_id || ''}
                      onChange={(e) => {
                        const f = fornecedores.find((x) => String(x.id) === String(e.target.value));
                        setForm((prev) => ({ ...prev, fornecedor_id: e.target.value || '', fornecedor_nome: f ? f.razao_social : prev.fornecedor_nome }));
                      }}>
                      <option value="">Não cadastrado / digitar abaixo</option>
                      {fornecedores.map((f) => (
                        <option key={f.id} value={f.id}>{f.razao_social}{f.cnpj ? ` — ${f.cnpj}` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Nome do terceiro<span className="required">*</span></label>
                    <input className="almox-input" value={form.fornecedor_nome || ''}
                      onChange={(e) => setForm((f) => ({ ...f, fornecedor_nome: e.target.value }))}
                      placeholder="Galvanizadora Sul LTDA" />
                    <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                      O terceiro pode não estar cadastrado em Compras — o nome digitado basta.
                    </small>
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Tipo de serviço</label>
                    <input className="almox-input" value={form.tipo_servico || ''}
                      onChange={(e) => setForm((f) => ({ ...f, tipo_servico: e.target.value }))}
                      placeholder="Galvanização, corte, dobra, usinagem, pintura..." />
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Prazo previsto de retorno</label>
                    <input className="almox-input" type="date" value={form.prazo_previsto || ''}
                      onChange={(e) => setForm((f) => ({ ...f, prazo_previsto: e.target.value }))} />
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Observações</label>
                    <textarea className="almox-input" rows={2} value={form.observacoes || ''}
                      onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
                  </div>

                  <div className="almox-field">
                    <label className="almox-label">Material<span className="required">*</span></label>
                    <select className="almox-form-select" value={novoItem.material_id}
                      onChange={(e) => setNovoItem((n) => ({ ...n, material_id: e.target.value }))}>
                      <option value="">Selecionar material...</option>
                      {materiais.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.codigo} — {m.nome}{nomeDoDono(m) ? ` [${nomeDoDono(m) === DONO_SEM_NOME ? nomeDoDono(m) : `cliente: ${nomeDoDono(m)}`}]` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Quantidade do item<span className="required">*</span></label>
                    <input className="almox-input" type="number" min="0" value={novoItem.quantidade}
                      onChange={(e) => setNovoItem((n) => ({ ...n, quantidade: e.target.value }))} />
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Peso do item (kg)</label>
                    <input className="almox-input" type="number" min="0" value={novoItem.peso}
                      onChange={(e) => setNovoItem((n) => ({ ...n, peso: e.target.value }))} />
                  </div>
                  <button type="button" className="btn-almox-secondary" onClick={adicionarItem}>
                    <FiPlus size={13} /> Adicionar item
                  </button>

                  <div className="almox-remessa-novos-itens" style={{ marginTop: 12 }}>
                    <table className="almox-table">
                      <thead>
                        <tr><th>Código</th><th>Material</th><th>Qtde</th><th>Peso</th><th /></tr>
                      </thead>
                      <tbody>
                        {itensNovos.map((i, idx) => (
                          <tr key={`${i.material_id}-${idx}`}>
                            <td>{i.codigo}</td>
                            <td>{i.nome}<SeloProprietario material={i} /></td>
                            <td>{i.quantidade} {i.unidade}</td>
                            <td>{i.peso === null ? '—' : i.peso}</td>
                            <td>
                              <button type="button" className="btn-almox-secondary" title="Remover o item"
                                onClick={() => setItensNovos((lista) => lista.filter((_, k) => k !== idx))}>
                                <FiTrash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {itensNovos.length === 0 && (
                      <p style={{ margin: '8px 0', fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>
                        Nenhum item na remessa ainda. O saldo só sai do disponível no envio, não aqui.
                      </p>
                    )}
                  </div>
                </>
              )}

              {modal.tipo === 'retorno' && (
                <>
                  <div className="almox-field">
                    <label className="almox-label">Item retornado<span className="required">*</span></label>
                    <select className="almox-form-select" value={form.item_remessa_id || ''}
                      onChange={(e) => setForm((f) => ({ ...f, item_remessa_id: e.target.value }))}>
                      <option value="">Selecionar item...</option>
                      {(aberta?.id === modal.remessa.id ? (aberta.itens || []) : []).map((i) => (
                        <option key={i.id} value={i.id}>{i.material_codigo} — ainda no terceiro: {i.pendente}</option>
                      ))}
                    </select>
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Quantidade<span className="required">*</span></label>
                    <input className="almox-input" type="number" min="0" value={form.quantidade || ''}
                      onChange={(e) => setForm((f) => ({ ...f, quantidade: e.target.value }))} />
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Nota fiscal do retorno</label>
                    <input className="almox-input" value={form.nota_fiscal || ''}
                      onChange={(e) => setForm((f) => ({ ...f, nota_fiscal: e.target.value }))} />
                  </div>
                </>
              )}

              {modal.tipo === 'transformacao' && (
                <>
                  <p style={{ marginTop: 0, fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>
                    Use aqui quando <strong>voltou material diferente do que saiu</strong> (corte, dobra,
                    usinagem). A chapa consumida sai do estoque de vez e os resultados entram como
                    material próprio. Se a chapa voltou inteira, use <strong>Retorno</strong>.
                  </p>

                  <div className="almox-field">
                    <label className="almox-label">Item transformado (a chapa)<span className="required">*</span></label>
                    <select className="almox-form-select" value={form.item_remessa_id || ''}
                      onChange={(e) => setForm((f) => ({ ...f, item_remessa_id: e.target.value }))}>
                      <option value="">Selecionar item...</option>
                      {(aberta?.id === modal.remessa.id ? (aberta.itens || []) : []).map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.material_codigo} — ainda no terceiro: {i.pendente} {i.unidade}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="almox-field">
                    <label className="almox-label">
                      Quantidade consumida da chapa{itemDaTransformacao ? ` (em ${itemDaTransformacao.unidade})` : ''}
                      <span className="required">*</span>
                    </label>
                    <input className="almox-input" type="number" min="0" value={form.quantidade_consumida || ''}
                      onChange={(e) => setForm((f) => ({ ...f, quantidade_consumida: e.target.value }))} />
                    <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                      Na unidade da chapa. É só este número que desconta do que está no terceiro — as
                      peças que voltaram têm a unidade delas e não entram nesta conta.
                    </small>
                  </div>

                  <div className="almox-field">
                    <label className="almox-label">Custo do serviço do terceiro (R$)</label>
                    <input className="almox-input" type="number" min="0" value={form.custo_servico || ''}
                      onChange={(e) => setForm((f) => ({ ...f, custo_servico: e.target.value }))} />
                    <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                      Opcional. Se informado, soma ao custo das peças (a peça não é peça sem o corte).
                      Em branco, não entra — o sistema não estima.
                    </small>
                  </div>

                  <div className="almox-field">
                    <label className="almox-label">Nota fiscal do retorno</label>
                    <input className="almox-input" value={form.nota_fiscal || ''}
                      onChange={(e) => setForm((f) => ({ ...f, nota_fiscal: e.target.value }))} />
                  </div>

                  <h3 style={{ fontSize: '0.9rem', margin: '12px 0 4px' }}>O que voltou</h3>
                  <div className="almox-field">
                    <label className="almox-label">Material do resultado</label>
                    <select className="almox-form-select" value={novoResultado.material_id}
                      onChange={(e) => setNovoResultado((r) => ({ ...r, material_id: e.target.value }))}>
                      <option value="">Selecionar material...</option>
                      {materiais.map((m) => (
                        <option key={m.id} value={m.id}>{m.codigo} — {m.nome} ({m.unidade})</option>
                      ))}
                    </select>
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Quantidade do resultado</label>
                    <input className="almox-input" type="number" min="0" value={novoResultado.quantidade}
                      onChange={(e) => setNovoResultado((r) => ({ ...r, quantidade: e.target.value }))} />
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Classificação</label>
                    <select className="almox-form-select" value={novoResultado.tipo_resultado}
                      onChange={(e) => setNovoResultado((r) => ({ ...r, tipo_resultado: e.target.value }))}>
                      <option value="PECA">{ROTULO_RESULTADO.PECA}</option>
                      <option value="SOBRA">{ROTULO_RESULTADO.SOBRA}</option>
                    </select>
                  </div>
                  <div className="almox-actions" style={{ marginBottom: 8 }}>
                    <button type="button" className="btn-almox-secondary" onClick={adicionarResultado}>
                      <FiPlus size={13} /> Adicionar resultado
                    </button>
                    {/* Gate PROPRIO: criar_material, e nao remessar_terceiro. ENGENHARIA cria
                        material e nao transforma — barrar pelo gate errado tiraria a funcao de quem
                        tem direito a ela. O botao continua VISIVEL: bloquearSeNaoPode barra no
                        onClick, com o mesmo texto que o backend produziria, e FALHA ABERTO se
                        GET /minhas-permissoes nao carregar. */}
                    <button type="button" className="btn-almox-secondary"
                      title="Cadastrar agora o material que voltou, já com a família e o dono da chapa"
                      onClick={(e) => abrirCriarMaterial(e)}>
                      <FiPlus size={13} /> Criar material resultante
                    </button>
                  </div>

                  {novoMaterial && (
                    // Sem a classe `almox-field` no CONTORNO, e de proposito: cada rotulo deste
                    // sub-formulario tem de morar no seu proprio `.almox-field`, senao "nome" e
                    // "unidade" ficam no MESMO campo e qualquer busca por rotulo (a da tela de
                    // teste, e a de um leitor de tela) devolve sempre o primeiro input.
                    <div style={{ border: '1px solid var(--gmp-border)', padding: 8, borderRadius: 6, marginBottom: 8 }}>
                      <p style={{ marginTop: 0, fontSize: '0.8rem' }}>
                        O código é gerado pela família da chapa e o proprietário é herdado dela — a
                        peça cortada de uma chapa do cliente continua sendo do cliente.
                      </p>
                      <div className="almox-field">
                        <label className="almox-label">Nome do novo material<span className="required">*</span></label>
                        <input className="almox-input" value={novoMaterial.nome}
                          onChange={(e) => setNovoMaterial((m) => ({ ...m, nome: e.target.value }))} />
                      </div>
                      <div className="almox-field">
                        <label className="almox-label">Unidade do novo material</label>
                        <input className="almox-input" value={novoMaterial.unidade}
                          onChange={(e) => setNovoMaterial((m) => ({ ...m, unidade: e.target.value }))} />
                      </div>
                      <div className="almox-actions" style={{ marginTop: 8 }}>
                        <button type="button" className="btn-almox-primary" disabled={salvando}
                          onClick={cadastrarMaterialResultante}>Cadastrar e usar</button>
                        <button type="button" className="btn-almox-secondary"
                          onClick={() => setNovoMaterial(null)}>Cancelar cadastro</button>
                      </div>
                    </div>
                  )}

                  <table className="almox-table">
                    <thead>
                      <tr><th>Código</th><th>Material</th><th>Qtd.</th><th>Un.</th><th>Classificação</th><th /></tr>
                    </thead>
                    <tbody>
                      {resultados.map((r, idx) => (
                        <tr key={`${r.material_id}-${idx}`}>
                          <td>{r.codigo}</td><td>{r.nome}</td><td>{r.quantidade}</td><td>{r.unidade}</td>
                          <td>{r.tipo_resultado === 'SOBRA' ? 'Sobra (custo zero)' : 'Peça'}</td>
                          <td>
                            <button type="button" className="btn-almox-secondary" title="Remover o resultado"
                              onClick={() => setResultados((l) => l.filter((_, k) => k !== idx))}>
                              <FiTrash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {resultados.length === 0 && (
                    <p style={{ margin: '8px 0', fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>
                      Nenhum resultado ainda. A chapa só é baixada quando você confirmar.
                    </p>
                  )}
                </>
              )}

              {modal.tipo === 'encerrar' && (
                <>
                  <div className="almox-field">
                    <label className="almox-label">Destino do saldo que não voltou<span className="required">*</span></label>
                    <select className="almox-form-select" value={form.destino || ''}
                      onChange={(e) => setForm((f) => ({ ...f, destino: e.target.value }))}>
                      <option value="">Selecionar destino...</option>
                      <option value="PERDA_NO_TERCEIRO">Perda no terceiro (sumiu ou foi danificado lá)</option>
                      <option value="CONSUMIDO_NO_PROCESSO">Consumido no processo (virou cavaco / refugo)</option>
                    </select>
                    <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                      Obrigatório quando sobrou material no terceiro: as duas opções dão baixa
                      definitiva no estoque. Se voltou tudo, a remessa já encerrou sozinha.
                    </small>
                  </div>
                  <div className="almox-field">
                    <label className="almox-label">Justificativa<span className="required">*</span></label>
                    <textarea className="almox-input" rows={3} value={form.justificativa || ''}
                      onChange={(e) => setForm((f) => ({ ...f, justificativa: e.target.value }))} />
                  </div>
                </>
              )}

              {modal.tipo === 'cancelar' && (
                <div className="almox-field">
                  <label className="almox-label">Motivo do cancelamento<span className="required">*</span></label>
                  <textarea className="almox-input" rows={3} value={form.motivo || ''}
                    onChange={(e) => setForm((f) => ({ ...f, motivo: e.target.value }))} />
                  <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                    O material que ainda estiver no terceiro volta para o disponível.
                  </small>
                </div>
              )}
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setModal(null)} disabled={salvando}>Fechar</button>
              <button className="btn-almox-primary" onClick={confirmar} disabled={salvando}>
                {salvando ? 'Salvando...'
                  : modal.tipo === 'nova' ? 'Criar remessa'
                    : modal.tipo === 'transformacao' ? 'Confirmar transformação'
                      : modal.tipo === 'retorno' ? 'Confirmar retorno'
                        : modal.tipo === 'encerrar' ? 'Confirmar encerramento' : 'Confirmar cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RemessasTerceirosAlmoxarifado;
