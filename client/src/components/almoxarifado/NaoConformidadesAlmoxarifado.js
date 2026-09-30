import React, { useCallback, useEffect, useState } from 'react';
import {
  FiAlertOctagon, FiAlertTriangle, FiCheckSquare, FiChevronDown, FiChevronUp, FiRefreshCw, FiTruck,
  FiXCircle,
} from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../../services/api';
import { SkeletonTable } from '../SkeletonLoader';
import { useAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';
import { formatarErroPermissao } from '../../utils/permissaoErro';
import AnexosDocumento from './AnexosDocumento';
import './Almoxarifado.css';

/**
 * Etapa 43, T5 — a tela do documento numerado de não conformidade (features 08 + 09).
 *
 * O que esta tela É: a lista dos documentos que nascem sozinhos quando a conferência/o fiscal
 * registra quantidade diferente da esperada (origem RECEBIMENTO) ou quando a inspeção reprova
 * (origem INSPECAO), mais a porta de DECIDIR o que se faz com cada um. Sem ela, a Etapa 43
 * repetiria o erro da feature 07: backend correto que ninguém alcança porque não existe botão.
 *
 * Quatro regras que este arquivo TEM de respeitar, e o porquê de cada uma:
 *
 * 1. **`limite`, nunca `limit`.** Convenção medida do módulo (`inspectionService.js:455`,
 *    `reportRegistry.js`, `auditFiltros.js`). Com `limit`, o parâmetro seria ignorado em
 *    silêncio e o usuário receberia 100 linhas achando que recebeu tudo. O serviço clampa em
 *    500 sem erro, então o rodapé abaixo da tabela avisa quando a lista chegou no teto pedido.
 *
 * 2. **Falha de carga NÃO deixa a lista anterior na tela.** Defeito que a Etapa 35 consertou nas
 *    telas irmãs (e a Etapa 11 antes dela, achado 1/Critical): gravar `[]` ou manter o array
 *    velho faz um 403 de perfil parecer fato operacional ("não há não conformidade"), que é a
 *    pior mentira possível numa tela cuja razão de existir é dizer que HÁ problema. Aqui o
 *    `catch` zera para `null` e o painel de erro ocupa o lugar da tabela.
 *
 * 3. **Os enums são repetidos aqui, de propósito.** Nenhuma rota publica `NC_DECISOES` para o
 *    client — é o mesmo desenho das demais telas do módulo (`ENCAMINHAMENTOS` de
 *    `InspecoesAlmoxarifado.js`, `TIPOS` de `AnexosDocumento.js`). O servidor valida de novo e a
 *    mensagem literal (`Decisão inválida`) é dele.
 *
 * 4. **O gate de UI falha ABERTO.** `useAlmoxPermissoes` deixa clicar quando a carga de
 *    permissões falhou, e quem decide de verdade é o `requirePermission('decidir_nao_
 *    conformidade')` do servidor. Aqui o botão só some por STATUS (NC encerrada não se decide de
 *    novo — RN-06, 409); por PERFIL ele continua visível e o clique mostra o 403 traduzido.
 *
 * O que esta tela NÃO faz, e é escolha registrada (letra B), não esquecimento:
 *
 * - **Não oferece abertura manual de NC.** A rota existe (`POST /nao-conformidades`, gate
 *   `registrar_nao_conformidade`) e o T6 a exercita por HTTP, mas o payload dela exige
 *   `referencia_tipo` + `referencia_id` — o id do ITEM de recebimento ou da INSPEÇÃO —, e
 *   nenhuma tela do módulo hoje mostra esses ids para escolher. Oferecer um campo numérico cru
 *   seria convidar a pendurar o documento no registro errado, que é exatamente o que a guarda
 *   `Number.isInteger` do serviço existe para evitar. O caminho reversível é este: a NC nasce
 *   pelos três ganchos (D4), e a abertura manual ganha porta no dia em que a tela de recebimento
 *   tiver um botão "abrir NC deste item" — uma linha, com o id em mãos.
 * - ~~**Não move estoque** (D7): decidir `DEVOLVER` não cria devolução, `SUCATEAR` não baixa
 *   saldo. O documento registra o que se decidiu, com autor e justificativa.~~
 *   **ISTO DEIXOU DE VALER PELA METADE, e fica corrigido à vista em vez de apagado.** Desde a
 *   Etapa 44, decidir **Aceitar** ou **Aceitar sob desvio** numa NC de inspeção **libera** o
 *   material que a reprovação havia bloqueado — e o toast de sucesso passa a dizer quanto saiu do
 *   bloqueio. ~~`DEVOLVER`, `SUBSTITUICAO`, `ANALISE_ENGENHARIA` e `SUCATEAR` continuam só
 *   marcando intenção~~ — **e desde a Etapa 45 `DEVOLVER` também deixou de ser só intenção,
 *   por um SEGUNDO gesto.**
 *
 * ── Etapa 45, T4 — O ESTADO DE EXECUÇÃO NA TELA ─────────────────────────────────────────────
 *
 * Decidir `DEVOLVER` é dizer o que se vai fazer; o material só sai do prédio quando alguém de
 * Compras embala e chama a transportadora — outro dia, outra pessoa, outro gate
 * (`executar_encaminhamento`, que inclui COMPRAS e NÃO inclui quem decide). Por isso a tela ganha
 * TRÊS coisas, e nenhuma delas é enfeite:
 *
 * 1. **Coluna Execução.** Sem ela, uma NC decidida `DEVOLVER` há três semanas e uma decidida hoje
 *    são a mesma linha — e a pergunta que o módulo existe para responder ("o material já voltou
 *    ao fornecedor?") não tem resposta na tela.
 * 2. **Filtro "Pendentes de execução"** (`?execucao=PENDENTE`), que é a FILA de Compras. O
 *    servidor soma `AND status = 'DECIDIDA'` a este filtro, então escolher a fila também põe o
 *    status em "Decididas" — ver `trocarExecucao` abaixo, e a razão medida ali.
 * 3. **Botão "Registrar execução"**, só onde ele pode dar certo (DECIDIDA + PENDENTE), e o toast
 *    repete a literal que o servidor manda em `execucao.mensagem` — mesmo padrão de `liberacao`
 *    da Etapa 44, e pela mesma razão: a régua de quando a baixa acontece (RN-06, série, lote,
 *    saldo) mora no servidor, e uma segunda cópia dela aqui mentiria sobre o saldo no dia em que
 *    as duas divergissem.
 *
 * ── Etapa 46, T4 — A SAÍDA DO DOCUMENTO PRESO ───────────────────────────────────────────────
 *
 * A Etapa 45 deixou um beco: material com série decidido `DEVOLVER` é recusado pela execução
 * (400, e a recusa é fatal de propósito — a Etapa 46 não a afrouxa), então o documento fica
 * `DECIDIDA` + execução `PENDENTE` para sempre, cobrando um gesto que ninguém consegue registrar.
 * O botão **Cancelar** é a porta de saída, e três coisas dele são regra, não estilo:
 *
 * 1. **Ele não apaga a decisão** (RN-06). O servidor preserva `decisao`, `justificativa`,
 *    `decidido_por_*`, `decidido_em` — e até o `execucao_estado`. O que o cancelamento encerra é a
 *    COBRANÇA: quem exclui a linha cancelada da fila é o `status`. O aviso dentro do modal diz
 *    isso ao usuário, e o cenário (42) prende a frase — este arquivo já deixou texto visível
 *    atrás da regra duas vezes (cenários (21) e (32)).
 * 2. **Ele SOME por perfil**, como o de execução e pelo mesmo motivo: `cancelar_nao_conformidade`
 *    é de QUALIDADE/ADMINISTRADOR (gate próprio — não é `decidir_nao_conformidade`, porque anular
 *    não é decidir, nem `executar_encaminhamento`, senão Compras limparia a própria fila). Quem
 *    não pode não deve ver um convite a uma recusa. Continua falhando ABERTO: `pode()` devolve
 *    `true` enquanto as permissões não voltaram.
 * 3. **A coluna Execução passa a olhar o `status`.** Como a RN-06 preserva `PENDENTE`, sem isso a
 *    linha ficaria com badge Cancelada ao lado de execução Pendente — contradizendo, na mesma
 *    tela e no mesmo segundo, o toast que acabou de dizer que a execução deixa de ser cobrada.
 */

const ROTA = '/almoxarifado/nao-conformidades';

// A régua do motivo é do servidor (400 `O motivo do cancelamento deve ter pelo menos 5
// caracteres`). Ela é repetida aqui de propósito, e só para DESABILITAR o botão: entregar um 400
// que a tela já sabia evitar é viagem de ida e volta sem informação nova. Quem recusa de verdade
// continua sendo o backend — se as duas réguas divergirem, o 400 dele aparece no toast.
const MOTIVO_CANCELAMENTO_MINIMO = 5;

// Teto pedido ao servidor. O serviço clampa em 500 sem erro; 200 é o que cabe numa tela de fila
// sem virar rolagem infinita, e o rodapé avisa quando a lista encosta neste número.
const LIMITE_LISTA = 200;

const STATUS_FILTROS = [
  { valor: '', rotulo: 'Todos os status' },
  { valor: 'ABERTA', rotulo: 'Abertas' },
  { valor: 'DECIDIDA', rotulo: 'Decididas' },
  { valor: 'CANCELADA', rotulo: 'Canceladas' },
];

const ORIGEM_FILTROS = [
  { valor: '', rotulo: 'Todas as origens' },
  { valor: 'RECEBIMENTO', rotulo: 'Recebimento' },
  { valor: 'INSPECAO', rotulo: 'Inspeção' },
];

// Etapa 45 — a fila do que falta executar. Os três valores são os de `execucao_estado`
// (`nonConformityService.js:100-102`); o servidor filtra por igualdade e soma `AND status =
// 'DECIDIDA'` sozinho, então qualquer um deles só faz sentido sobre NC decidida.
const EXECUCAO_FILTROS = [
  { valor: '', rotulo: 'Qualquer execução' },
  { valor: 'PENDENTE', rotulo: 'Pendentes de execução' },
  { valor: 'EXECUTADA', rotulo: 'Já executadas' },
  { valor: 'NAO_SE_APLICA', rotulo: 'Sem execução a registrar' },
];

// Os seis do enum `NC_DECISOES` (nonConformityService.js:45). Os três do meio são os
// `ENCAMINHAMENTOS` que a inspeção já usa — reusados, não reinventados.
const DECISOES = [
  { valor: 'ACEITAR', rotulo: 'Aceitar' },
  { valor: 'ACEITAR_SOB_DESVIO', rotulo: 'Aceitar sob desvio' },
  { valor: 'DEVOLVER', rotulo: 'Devolver ao fornecedor' },
  { valor: 'SUBSTITUICAO', rotulo: 'Substituição' },
  { valor: 'ANALISE_ENGENHARIA', rotulo: 'Análise da Engenharia' },
  { valor: 'SUCATEAR', rotulo: 'Sucatear' },
];

const ROTULO_DECISAO = Object.fromEntries(DECISOES.map((d) => [d.valor, d.rotulo]));

const ROTULO_ORIGEM = { RECEBIMENTO: 'Recebimento', INSPECAO: 'Inspeção' };

const ROTULO_TIPO = {
  QUANTIDADE: 'Quantidade',
  DIMENSIONAL: 'Dimensional',
  CERTIFICADO_AUSENTE: 'Certificado ausente',
  DANO_FISICO: 'Dano físico',
  MATERIAL_INCORRETO: 'Material incorreto',
  OUTRO: 'Outro',
};

const ROTULO_STATUS = { ABERTA: 'Aberta', DECIDIDA: 'Decidida', CANCELADA: 'Cancelada' };

// `NAO_SE_APLICA` é o estado das duas decisões de ACEITAÇÃO: elas já se executaram no mesmo
// clique da decisão (Etapa 44), então não há ato externo a confirmar. Dizer "Não se aplica" é
// diferente de deixar a célula vazia — vazio é a NC que ainda não foi decidida, e confundir as
// duas faria a fila de Compras parecer maior do que é.
const ROTULO_EXECUCAO = {
  PENDENTE: 'Pendente',
  EXECUTADA: 'Executada',
  NAO_SE_APLICA: 'Não se aplica',
};

// Timestamps do SQLite chegam em UTC sem sufixo ("YYYY-MM-DD HH:MM:SS") — sem o 'Z' o V8 leria
// como hora local e a NC decidida às 22h apareceria no dia seguinte. Mesmo ajuste de
// AlertasAlmoxarifado.js/ConferenciaEstoque.js.
const formatDataHora = (valor) => {
  if (!valor) return '—';
  const iso = typeof valor === 'string' && valor.includes(' ') && !valor.includes('T')
    ? `${valor.replace(' ', 'T')}Z` : valor;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(valor);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const formatNum = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 4 }));

// Mesmo painel de erro por estado das telas irmãs (AlertasAlmoxarifado.js, ReposicaoAlmoxarifado.js,
// NotificacoesAlmoxarifado.js) — o módulo não pode ganhar um sétimo jeito de dizer "os dados não
// carregaram". Ver a regra 2 do cabeçalho.
const PainelErroCarga = ({ mensagem, onTentarNovamente }) => (
  <div
    data-testid="nc-erro-carga"
    style={{
      marginBottom: 16,
      padding: '14px 18px',
      borderRadius: 10,
      border: '1px solid rgba(239, 68, 68, 0.35)',
      background: 'rgba(239, 68, 68, 0.08)',
      color: 'var(--gmp-text)',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
      flexWrap: 'wrap',
    }}
  >
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <FiAlertTriangle size={18} style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }} />
      <div>
        <strong style={{ display: 'block', marginBottom: 4 }}>Dados indisponíveis no momento</strong>
        <span style={{ fontSize: '0.9rem', color: 'var(--gmp-text-light)' }}>{mensagem}</span>
      </div>
    </div>
    {onTentarNovamente && (
      <button type="button" className="btn-almox-secondary" onClick={onTentarNovamente}>
        <FiRefreshCw size={14} /> Tentar novamente
      </button>
    )}
  </div>
);

const FORM_DECISAO_VAZIO = { decisao: '', justificativa: '' };

const NaoConformidadesAlmoxarifado = () => {
  const { perfil, pode, bloquearSeNaoPode } = useAlmoxPermissoes();

  // `null` = nada carregado (ou carga falhou). `[]` = carregou e não há NC. Os dois estados
  // PRECISAM ser distintos — ver a regra 2 do cabeçalho.
  const [itens, setItens] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [statusFiltro, setStatusFiltro] = useState('ABERTA');
  const [origemFiltro, setOrigemFiltro] = useState('');
  const [execucaoFiltro, setExecucaoFiltro] = useState('');
  const [recarga, setRecarga] = useState(0);
  const [expandida, setExpandida] = useState(null);

  const [decisaoTarget, setDecisaoTarget] = useState(null);
  const [decisaoForm, setDecisaoForm] = useState(FORM_DECISAO_VAZIO);
  const [salvando, setSalvando] = useState(false);

  const [execucaoTarget, setExecucaoTarget] = useState(null);
  const [execucaoObs, setExecucaoObs] = useState('');

  const [cancelamentoTarget, setCancelamentoTarget] = useState(null);
  const [cancelamentoMotivo, setCancelamentoMotivo] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      // Regra 1: `limite`, nunca `limit`.
      const params = { limite: LIMITE_LISTA };
      if (statusFiltro) params.status = statusFiltro;
      if (origemFiltro) params.origem = origemFiltro;
      if (execucaoFiltro) params.execucao = execucaoFiltro;
      const res = await api.get(ROTA, { params });
      setItens(res.data?.itens || []);
    } catch (err) {
      // Regra 2: NÃO grava [] aqui — seria o mesmo shape de "nenhuma não conformidade".
      // ⚠️ MEDIDO na sabotagem desta task: tirar esta linha sozinha NÃO derruba teste nenhum,
      // porque quem esconde a lista velha é a PRECEDÊNCIA do `erro ?` no render abaixo. Ela fica
      // como segunda trava, para o dia em que alguém reordenar aquele ternário — mas o próximo a
      // ler isto precisa saber que a garantia está no render, não aqui.
      setItens(null);
      const mensagem = formatarErroPermissao(err.response?.data)
        || err.response?.data?.error
        || 'Não foi possível carregar as não conformidades';
      setErro(mensagem);
      toast.error(mensagem);
    } finally {
      setLoading(false);
    }
  }, [statusFiltro, origemFiltro, execucaoFiltro]);

  useEffect(() => { carregar(); }, [carregar, recarga]);

  const abrirDecisao = (nc) => {
    setDecisaoTarget(nc);
    setDecisaoForm(FORM_DECISAO_VAZIO);
  };

  const submeterDecisao = async () => {
    if (!decisaoForm.decisao) {
      toast.error('Escolha a decisão');
      return;
    }
    // Justificativa obrigatória (RN-06). O servidor recusa com 400 e a mensagem literal
    // "Justificativa é obrigatória para decidir a não conformidade"; barrar aqui evita a viagem
    // de ida e volta — e é o único registro de POR QUE se aceitou/devolveu, que é a razão de o
    // documento existir.
    if (!decisaoForm.justificativa.trim()) {
      toast.error('Justificativa é obrigatória para decidir a não conformidade');
      return;
    }
    setSalvando(true);
    try {
      const resp = await api.post(`${ROTA}/${decisaoTarget.id}/decidir`, {
        decisao: decisaoForm.decisao,
        justificativa: decisaoForm.justificativa.trim(),
      });
      // O QUE ACONTECEU COM O SALDO, dito na tela. Sem isto, decidir "aceito sob desvio" e ver a
      // linha virar DECIDIDA parece idêntico a decidir "devolver" — e foi exatamente esse silêncio
      // que criou o furo C57: a decisão que libera material e a que só marca intenção eram
      // indistinguíveis para quem clica.
      //
      // A mensagem vem PRONTA do servidor, nunca montada aqui. Montá-la no client exigiria uma
      // segunda cópia das regras de qual decisão libera, em qual origem, com qual quantidade — e
      // no dia em que as duas divergissem a tela mentiria sobre o saldo, que é o defeito que este
      // aviso existe para evitar. Mesmo critério, já escrito, da pré-visualização de tolerância
      // que a B60 vetou.
      //
      // O `?.` não é decoração: um servidor anterior a esta versão não manda o campo, e
      // concatenar `undefined` mostraria "decidida! undefined" no lugar do aviso.
      const mensagemSaldo = resp?.data?.liberacao?.mensagem;
      toast.success(`Não conformidade ${decisaoTarget.numero} decidida!${mensagemSaldo ? ` ${mensagemSaldo}` : ''}`);
      setDecisaoTarget(null);
      // ⚠️ Achado 11 da revisão adversarial: com o filtro em "Abertas" (o padrão), a NC recém
      // decidida deixa de casar o filtro e a linha SOME junto com o toast — a pessoa decide e a
      // tabela fica vazia, sem nada dizendo que deu certo. Pior num documento cujo valor é
      // justamente ficar: quem acabou de decidir quer VER a decisão gravada, com o próprio nome.
      // Então a tela larga o filtro de status e mostra tudo; o de origem continua onde estava,
      // porque ele não esconde o que você acabou de fazer.
      if (statusFiltro === 'ABERTA') setStatusFiltro('');
      setRecarga((n) => n + 1);
    } catch (err) {
      toast.error(
        formatarErroPermissao(err.response?.data)
        || err.response?.data?.error
        || 'Erro ao decidir a não conformidade',
      );
    } finally {
      setSalvando(false);
    }
  };

  /**
   * Etapa 45 — POR QUE OS DOIS FILTROS SE SINCRONIZAM, e por que isso não é esperteza de UI.
   *
   * `?execucao=<estado>` NÃO é um filtro independente no servidor: ele vem com
   * `AND nc.status = 'DECIDIDA'` grudado (`nonConformityService.js:1146`), porque execução de
   * documento ABERTO ou CANCELADO não existe. Com o status padrão da tela ("Abertas"), pedir a
   * fila de execução produziria `status='ABERTA' AND status='DECIDIDA'` — **lista vazia sempre**,
   * e o usuário leria "não há nada pendente de execução" quando a verdade é que a pergunta era
   * impossível. É o mesmo modo de falha da regra 2 do cabeçalho (a tela AFIRMANDO ausência que
   * ela não mediu), entrando pela porta do filtro.
   *
   * Então: escolher um estado de execução põe o status em "Decididas" (que é o recorte real que
   * o servidor vai aplicar de qualquer forma — a tela só passa a DIZER isso), e escolher um
   * status que não seja "Decididas" larga o filtro de execução, em vez de deixar a combinação
   * impossível de pé. Decisão reversível e registrada na letra B: o descartado era deixar os dois
   * selects independentes e explicar a lista vazia com um aviso.
   */
  const trocarStatus = (valor) => {
    setExpandida(null);
    setStatusFiltro(valor);
    if (valor !== 'DECIDIDA' && execucaoFiltro) setExecucaoFiltro('');
  };

  const trocarExecucao = (valor) => {
    setExpandida(null);
    setExecucaoFiltro(valor);
    if (valor && statusFiltro !== 'DECIDIDA') setStatusFiltro('DECIDIDA');
  };

  const abrirExecucao = (nc) => {
    setExecucaoTarget(nc);
    setExecucaoObs('');
  };

  /**
   * O SEGUNDO GESTO. Não há campo obrigatório aqui de propósito: quem clica está declarando um
   * FATO do mundo físico ("mandei de volta"), e exigir justificativa para registrar um fato
   * empurraria a pessoa a digitar "ok" — o oposto do que a justificativa da DECISÃO serve.
   * `observacoes` vai só quando tem conteúdo; o servidor usa o próprio texto como justificativa
   * da movimentação quando ele existe, e monta uma frase com o número da NC quando não existe.
   */
  const submeterExecucao = async () => {
    setSalvando(true);
    try {
      const obs = execucaoObs.trim();
      const resp = await api.post(`${ROTA}/${execucaoTarget.id}/executar`, obs ? { observacoes: obs } : {});
      // Mesma regra da decisão (Etapa 44): a literal do que aconteceu com o saldo vem PRONTA do
      // servidor. Aqui ela pesa mais ainda, porque os desfechos sem baixa não são erro — a
      // execução FICA registrada e a mensagem é o único lugar que diz por que o saldo não mudou
      // ("O material já havia saído do bloqueio…", "Material inativo…"). O `?.` protege resposta
      // de servidor anterior a esta versão: concatenar `undefined` seria pior que não avisar.
      const mensagemSaldo = resp?.data?.execucao?.mensagem;
      toast.success(`Execução de ${execucaoTarget.numero} registrada!${mensagemSaldo ? ` ${mensagemSaldo}` : ''}`);
      setExecucaoTarget(null);
      // Irmão do achado 11 da Etapa 43: com a fila "Pendentes de execução" ligada, a NC que
      // acabou de ser executada deixa de casar o filtro e a linha SOME junto com o toast — quem
      // acabou de registrar quer VER o registro com o próprio nome. A tela larga a fila e mostra
      // as decididas; o filtro de origem fica onde estava, porque ele não esconde o que se fez.
      if (execucaoFiltro === 'PENDENTE') setExecucaoFiltro('');
      setRecarga((n) => n + 1);
    } catch (err) {
      toast.error(
        formatarErroPermissao(err.response?.data)
        || err.response?.data?.error
        || 'Erro ao registrar a execução',
      );
    } finally {
      setSalvando(false);
    }
  };

  const abrirCancelamento = (nc) => {
    setCancelamentoTarget(nc);
    setCancelamentoMotivo('');
  };

  const motivoCancelamentoValido = cancelamentoMotivo.trim().length >= MOTIVO_CANCELAMENTO_MINIMO;

  /**
   * A SAÍDA. Não redecide e não apaga nada: o servidor só troca o `status` para `CANCELADA` e
   * guarda motivo, autor e data. O que a tela tem de acertar aqui são os DOIS filtros.
   */
  const submeterCancelamento = async () => {
    // Trava dupla do motivo: o botão já está desabilitado abaixo de 5 caracteres, mas o guarda
    // fica porque o submit também é alcançável por Enter/teclado em navegador — e a mensagem é a
    // literal do servidor, para o usuário não ler duas redações da mesma régua.
    //
    // ⚠️ MEDIDO na sabotagem desta task (a 11ª): apagar ESTE `if` sozinho não derruba teste
    // nenhum — 43/43 continuam verdes —, porque quem impede o clique no harness é o `disabled` do
    // botão, e o jsdom não dispara `onClick` em botão desabilitado. Mesma situação da regra 2 do
    // cabeçalho: a garantia está no outro lugar, e o próximo a ler precisa saber disso antes de
    // "limpar" este guarda achando que a suíte o cobre.
    if (!motivoCancelamentoValido) {
      toast.error('O motivo do cancelamento deve ter pelo menos 5 caracteres');
      return;
    }
    setSalvando(true);
    try {
      const resp = await api.post(`${ROTA}/${cancelamentoTarget.id}/cancelar`, {
        motivo: cancelamentoMotivo.trim(),
      });
      // Mesma regra de `liberacao` (Etapa 44) e `execucao` (Etapa 45): a literal vem PRONTA do
      // servidor. Aqui ela carrega a diferença entre cancelar um documento que ninguém decidiu e
      // cancelar um decidido — no segundo caso a decisão FICA, e é a mensagem que diz isso. O
      // `?.` protege resposta de servidor anterior a esta versão.
      const mensagem = resp?.data?.cancelamento?.mensagem;
      toast.success(`Não conformidade ${cancelamentoTarget.numero} cancelada!${mensagem ? ` ${mensagem}` : ''}`);
      setCancelamentoTarget(null);
      // ⚠️ TERCEIRA APARIÇÃO DO MESMO PADRÃO nesta base: achado 11 da Etapa 43 (decidir com o
      // filtro em "Abertas" escondia a linha), T4 da Etapa 45 (executar com a fila ligada
      // escondia a linha), e agora o cancelamento — que é o pior dos três, porque ele esconde a
      // linha pelos DOIS filtros ao mesmo tempo:
      //
      //   - o padrão do status é 'ABERTA', e a NC que acabou de ser cancelada não casa mais;
      //   - `trocarExecucao` FORÇA `statusFiltro = 'DECIDIDA'` ao ligar a fila de Compras, e a
      //     cancelada não casa 'DECIDIDA' tampouco — então largar SÓ o filtro de execução não
      //     devolveria a linha (achado 8 da Fase 2, medido).
      //
      // Quem acabou de cancelar quer VER o documento cancelado, com o motivo que digitou. O
      // filtro de origem fica onde estava, porque ele não esconde o que se acabou de fazer.
      if (statusFiltro && statusFiltro !== 'CANCELADA') setStatusFiltro('');
      if (execucaoFiltro) setExecucaoFiltro('');
      setRecarga((n) => n + 1);
    } catch (err) {
      toast.error(
        formatarErroPermissao(err.response?.data)
        || err.response?.data?.error
        || 'Erro ao cancelar a não conformidade',
      );
    } finally {
      setSalvando(false);
    }
  };

  const lista = itens || [];
  const abertas = lista.filter((nc) => nc.status === 'ABERTA').length;

  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1><FiAlertOctagon size={20} /> Não Conformidades</h1>
          <p>
            Divergências de recebimento e reprovações de inspeção viram documento numerado (NC-…),
            com o fato congelado na abertura e a decisão gravada com autor e justificativa.
          </p>
        </div>
        <div className="almox-header-actions">
          <button className="btn-almox-secondary" onClick={() => setRecarga((n) => n + 1)}>
            <FiRefreshCw size={13} /> Atualizar
          </button>
        </div>
      </div>

      <div className="almox-filters">
        <select
          className="almox-select"
          aria-label="Filtrar por status"
          value={statusFiltro}
          onChange={(e) => trocarStatus(e.target.value)}
        >
          {STATUS_FILTROS.map((s) => <option key={s.valor || 'todos'} value={s.valor}>{s.rotulo}</option>)}
        </select>
        {/*
          O filtro de ORIGEM existe porque o serviço sempre aceitou `origem` e a tela nunca o
          enviava — achado 12 da revisão adversarial: o roteiro de teste manual mandava "filtre
          por origem Inspeção" e não havia onde. Separar o que veio do recebimento do que veio da
          qualidade é a primeira coisa que quem opera pergunta.
        */}
        <select
          className="almox-select"
          aria-label="Filtrar por origem"
          value={origemFiltro}
          onChange={(e) => { setExpandida(null); setOrigemFiltro(e.target.value); }}
        >
          {ORIGEM_FILTROS.map((o) => <option key={o.valor || 'todas'} value={o.valor}>{o.rotulo}</option>)}
        </select>
        {/* Etapa 45: a FILA de Compras. Ver `trocarExecucao` para o porquê de ele mexer no
            status — sem essa sincronia o combo padrão devolveria lista vazia sempre. */}
        <select
          className="almox-select"
          aria-label="Filtrar por execução"
          value={execucaoFiltro}
          onChange={(e) => trocarExecucao(e.target.value)}
        >
          {EXECUCAO_FILTROS.map((x) => <option key={x.valor || 'qualquer'} value={x.valor}>{x.rotulo}</option>)}
        </select>
        {!loading && !erro && (
          <span style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>
            {lista.length} documento{lista.length !== 1 ? 's' : ''}
            {statusFiltro !== 'ABERTA' && abertas > 0 ? ` · ${abertas} em aberto` : ''}
          </span>
        )}
      </div>

      {erro ? (
        <PainelErroCarga mensagem={erro} onTentarNovamente={() => setRecarga((n) => n + 1)} />
      ) : loading || itens === null ? (
        <div className="almox-table-container"><SkeletonTable rows={6} columns={9} /></div>
      ) : lista.length === 0 ? (
        <div className="almox-table-container">
          <div className="almox-empty">
            <p>
              {statusFiltro
                ? `Nenhuma não conformidade ${ROTULO_STATUS[statusFiltro]?.toLowerCase() || ''}`.trim()
                : 'Nenhuma não conformidade registrada'}
            </p>
          </div>
        </div>
      ) : (
        <div className="almox-table-container">
          <table className="almox-table">
            <thead>
              <tr>
                <th>Número</th>
                <th>Material</th>
                <th>Origem</th>
                <th>Tipo</th>
                <th>O fato</th>
                <th>Status</th>
                <th>Decisão</th>
                <th>Execução</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((nc) => {
                const aberto = expandida === nc.id;
                return (
                  <React.Fragment key={nc.id}>
                    <tr data-testid={`nc-linha-${nc.id}`}>
                      <td style={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{nc.numero}</td>
                      <td>
                        <div>{nc.material_nome || '—'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>
                          {nc.material_codigo || '—'}
                          {nc.recebimento_numero ? ` · ${nc.recebimento_numero}` : ''}
                          {nc.nota_fiscal ? ` · NF ${nc.nota_fiscal}` : ''}
                        </div>
                      </td>
                      <td>{ROTULO_ORIGEM[nc.origem] || nc.origem}</td>
                      <td>{ROTULO_TIPO[nc.tipo] || nc.tipo}</td>
                      {/* O fato é CONGELADO na abertura (D2) e vem PRONTO do servidor: a tela
                          NUNCA refaz `recebida − esperada`. Duas cópias da régua acabam
                          divergindo — é a mesma B60 que veta o pré-cálculo na tela de inspeção. */}
                      <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        {nc.quantidade_esperada == null && nc.quantidade_recebida == null ? '—' : (
                          <>
                            <div>Esperada {formatNum(nc.quantidade_esperada)} · Recebida {formatNum(nc.quantidade_recebida)}</div>
                            <div style={{ fontWeight: 700, color: 'var(--gmp-error)' }}>
                              Divergência {formatNum(nc.divergencia)}
                            </div>
                          </>
                        )}
                      </td>
                      <td>
                        <span className={`almox-badge almox-badge-nc-${String(nc.status || '').toLowerCase()}`}>
                          {ROTULO_STATUS[nc.status] || nc.status}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8rem' }}>
                        {nc.decisao ? (
                          <>
                            <div>{ROTULO_DECISAO[nc.decisao] || nc.decisao}</div>
                            <div style={{ color: 'var(--gmp-text-light)' }}>
                              {nc.decidido_por_nome || '—'} · {formatDataHora(nc.decidido_em)}
                            </div>
                          </>
                        ) : nc.status === 'CANCELADA' ? (
                          <div style={{ color: 'var(--gmp-text-light)' }}>
                            Cancelada em {formatDataHora(nc.cancelado_em)}
                          </div>
                        ) : '—'}
                      </td>
                      {/* Etapa 45 — a coluna que responde "o material já voltou ao fornecedor?".
                          Os três estados são distintos NA TELA, e o vazio é um quarto: NC ainda
                          não decidida não tem execução a mostrar, e igualar vazio a "pendente"
                          inflaria a fila de Compras com documento que ninguém decidiu ainda. */}
                      {/* ⚠️ ETAPA 46 — O `status` VEM PRIMEIRO, e isso é regra (achado 5 da
                          Fase 2). O servidor PRESERVA `execucao_estado` ao cancelar (RN-06: quem
                          exclui a cancelada da fila é o `status`, não o estado de execução), então
                          sem este primeiro ramo a linha cancelada mostraria o badge "Pendente" ao
                          lado do badge de status "Cancelada" — contradizendo, na mesma tela e no
                          mesmo segundo, o toast que acabou de dizer que a execução deixa de ser
                          cobrada.

                          A ESCOLHA, e o porquê: a célula diz "Deixou de ser cobrada" em vez de um
                          travessão. O travessão seria mais curto e não mentiria, mas igualaria
                          esta linha à da NC nunca decidida — e as duas são coisas diferentes:
                          nesta havia uma execução pendente, e ela foi encerrada por alguém, com
                          motivo (visível no painel de detalhes). O texto ECOA a literal do toast,
                          então quem cancelou vê a tela confirmar o que acabou de ler, e quem
                          chega depois entende por que o documento saiu da fila de Compras. */}
                      <td style={{ fontSize: '0.8rem' }}>
                        {nc.status === 'CANCELADA' ? (
                          <span style={{ color: 'var(--gmp-text-light)' }}>Deixou de ser cobrada</span>
                        ) : nc.execucao_estado === 'EXECUTADA' ? (
                          <>
                            <div style={{ fontWeight: 700 }}>{ROTULO_EXECUCAO.EXECUTADA}</div>
                            <div style={{ color: 'var(--gmp-text-light)' }}>
                              {nc.execucao_por_nome || '—'} · {formatDataHora(nc.execucao_em)}
                            </div>
                          </>
                        ) : nc.execucao_estado === 'PENDENTE' ? (
                          <span className="almox-badge almox-badge-nc-aberta">{ROTULO_EXECUCAO.PENDENTE}</span>
                        ) : nc.execucao_estado === 'NAO_SE_APLICA' ? (
                          <span style={{ color: 'var(--gmp-text-light)' }}>{ROTULO_EXECUCAO.NAO_SE_APLICA}</span>
                        ) : '—'}
                      </td>
                      <td>
                        <div className="almox-actions">
                          {/* Só para NC ABERTA: decidir de novo é 409 (RN-06), e botão que
                              produz erro garantido é armadilha, não gate. O gate de PERFIL fica
                              no clique (falha aberto — regra 4 do cabeçalho). */}
                          {nc.status === 'ABERTA' && (
                            <button
                              type="button"
                              className="almox-btn-icon"
                              title="Decidir a não conformidade"
                              onClick={(e) => {
                                if (!bloquearSeNaoPode('decidir_nao_conformidade', e)) return;
                                abrirDecisao(nc);
                              }}
                            >
                              <FiCheckSquare />
                            </button>
                          )}
                          {/* Etapa 45 — o SEGUNDO gesto, e ele aparece onde pode dar certo: a
                              rota recusa (400/409) execução de NC não decidida, de decisão de
                              aceitação e de execução já registrada, e botão com erro garantido é
                              armadilha (mesmo critério do botão de decidir acima).

                              ⚠️ Aqui o gate de PERFIL ESCONDE, ao contrário do botão de decidir —
                              e continua falhando ABERTO, porque `pode()` devolve `true` quando a
                              carga de `minhas-permissoes` falhou ou ainda não voltou (ver o hook).
                              A razão de esconder: `executar_encaminhamento` é a única ação desta
                              tela cuja plateia (COMPRAS) é DIFERENTE de quem decide (QUALIDADE),
                              então o botão visível para a Qualidade seria um convite permanente a
                              um 403 que não é engano dela. Quem manda continua sendo o backend. */}
                          {nc.status === 'DECIDIDA' && nc.execucao_estado === 'PENDENTE'
                            && pode('executar_encaminhamento') && (
                            <button
                              type="button"
                              className="almox-btn-icon"
                              title="Registrar execução do encaminhamento"
                              onClick={() => abrirExecucao(nc)}
                            >
                              <FiTruck />
                            </button>
                          )}
                          {/* Etapa 46 — a SAÍDA. As duas condições de visibilidade são as duas
                              únicas em que a rota pode dizer sim; nas outras três ela recusa com
                              409, cada uma com literal própria:

                                DECIDIDA + NAO_SE_APLICA -> "A decisão … já liberou o material"
                                DECIDIDA + EXECUTADA     -> "A execução … já foi registrada"
                                CANCELADA                -> "Esta não conformidade já está cancelada"

                              Botão com erro garantido é armadilha, não gate (mesmo critério dos
                              dois botões acima).

                              ⚠️ E aqui o gate de PERFIL ESCONDE, como no de execução e pela mesma
                              razão já escrita lá: `cancelar_nao_conformidade` tem plateia própria
                              (QUALIDADE/ADMINISTRADOR), então o botão visível para quem opera a
                              fila seria um convite permanente a um 403 que não é engano dele.
                              Continua falhando ABERTO — `pode()` devolve `true` enquanto a carga
                              de permissões não voltou. Quem manda continua sendo o backend. */}
                          {(nc.status === 'ABERTA'
                            || (nc.status === 'DECIDIDA' && nc.execucao_estado === 'PENDENTE'))
                            && pode('cancelar_nao_conformidade') && (
                            <button
                              type="button"
                              className="almox-btn-icon"
                              title="Cancelar a não conformidade"
                              onClick={() => abrirCancelamento(nc)}
                            >
                              <FiXCircle />
                            </button>
                          )}
                          <button
                            type="button"
                            className="almox-btn-icon"
                            title="Detalhes e anexos"
                            aria-expanded={aberto}
                            onClick={() => setExpandida(aberto ? null : nc.id)}
                          >
                            {aberto ? <FiChevronUp /> : <FiChevronDown />}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {aberto && (
                      <tr data-testid={`nc-detalhe-${nc.id}`}>
                        <td colSpan={9}>
                          <div style={{ padding: '4px 2px 10px' }}>
                            <p style={{ margin: '0 0 8px', fontSize: '0.85rem' }}>
                              <strong>Descrição:</strong> {nc.descricao || '—'}
                            </p>
                            {nc.justificativa && (
                              <p style={{ margin: '0 0 8px', fontSize: '0.85rem' }}>
                                <strong>Justificativa da decisão:</strong> {nc.justificativa}
                              </p>
                            )}
                            {nc.motivo_cancelamento && (
                              <p style={{ margin: '0 0 8px', fontSize: '0.85rem' }}>
                                <strong>Motivo do cancelamento:</strong> {nc.motivo_cancelamento}
                              </p>
                            )}
                            <p style={{ margin: '0 0 8px', fontSize: '0.78rem', color: 'var(--gmp-text-light)' }}>
                              Aberta por {nc.aberto_por_nome || (nc.aberto_automaticamente ? 'gancho automático' : '—')}
                              {nc.aberto_automaticamente ? ' (automática)' : ''} em {formatDataHora(nc.created_at)}
                            </p>
                            {/* Entidade `nao_conformidade` — laudo, foto da peça, relatório
                                dimensional, e-mail do fornecedor. A entidade entra no mapa do
                                servidor (`anexoService.ENTIDADES_ANEXO`) pela T4; até ela subir,
                                o bloco existe e o GET responde 400 "Entidade inválida para
                                anexo", que o próprio AnexosDocumento mostra à vista. */}
                            <AnexosDocumento entidade="nao_conformidade" entidadeId={nc.id} titulo="Anexos" />
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          {lista.length >= LIMITE_LISTA && (
            <p style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)', padding: '8px 12px', margin: 0 }}>
              Mostrando as primeiras {LIMITE_LISTA} — use o filtro de status para reduzir a lista.
            </p>
          )}
        </div>
      )}

      {decisaoTarget && (
        <div className="almox-modal-overlay" onClick={() => { if (!salvando) setDecisaoTarget(null); }}>
          <div className="almox-modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>Decidir {decisaoTarget.numero}</h2>
              <button className="almox-modal-close" onClick={() => setDecisaoTarget(null)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <p style={{ marginTop: 0 }}>
                <strong>{decisaoTarget.material_nome || 'Material não identificado'}</strong>
                {decisaoTarget.material_codigo ? ` (${decisaoTarget.material_codigo})` : ''}
                {' — '}
                {ROTULO_TIPO[decisaoTarget.tipo] || decisaoTarget.tipo}
                {' · '}
                {ROTULO_ORIGEM[decisaoTarget.origem] || decisaoTarget.origem}
                {decisaoTarget.divergencia != null && (
                  <>
                    <br />
                    <span style={{ fontSize: '0.82rem', color: 'var(--gmp-text-light)' }}>
                      Esperada {formatNum(decisaoTarget.quantidade_esperada)} · Recebida{' '}
                      {formatNum(decisaoTarget.quantidade_recebida)} · Divergência{' '}
                      {formatNum(decisaoTarget.divergencia)}
                    </span>
                  </>
                )}
              </p>
              {/*
                ⚠️ ESTE PARÁGRAFO É LIDO PELO USUÁRIO NO INSTANTE EM QUE ELE DECIDE — é o único
                lugar da tela que explica o que a decisão faz com o saldo, e por isso ele TEM de
                acompanhar a regra.

                Até a Etapa 44 ele dizia "A decisão fecha o DOCUMENTO, não o estoque … o material
                reprovado continua bloqueado até alguém com ajustar_estoque desbloqueá-lo" — o
                enunciado literal do furo C57. A Etapa 44 fechou o furo e, na primeira passada,
                corrigiu só o comentário de cabeçalho deste arquivo: o texto VISÍVEL ficou
                afirmando o contrário do que o sistema passou a fazer, e o roteiro de apresentação
                mandava abrir justamente este modal. A revisão adversarial pegou.

                Lição que fica escrita aqui: comentário de código corrigido não corrige a tela.
                O cenário `(21)` de `NaoConformidadesAlmoxarifado.test.js` prende esta frase.

                ⚠️ ETAPA 45, E É A SEGUNDA VEZ QUE ESTE PARÁGRAFO FICA PARA TRÁS DA REGRA. Ele
                dizia "devolver não cria a devolução" — verdade até a T3 desta etapa, e mentira
                depois dela: `Devolver ao fornecedor` agora baixa o material, no gesto seguinte,
                por quem tem `executar_encaminhamento`. Corrigido aqui, no mesmo commit da tela,
                e o cenário (26) prende a frase nova sem largar as duas negativas do (21).
              */}
              <p style={{ fontSize: '0.78rem', color: 'var(--gmp-text-light)', marginTop: 0 }}>
                <strong>Aceitar</strong> e <strong>Aceitar sob desvio</strong> liberam o material
                que esta inspeção deixou bloqueado, agora. As outras quatro decisões
                <strong> não mexem no saldo</strong> neste clique: <strong>Devolver ao
                fornecedor</strong> passa a esperar o registro da execução (coluna
                <em> Execução</em>), e é ele que baixa o material — até lá ele segue retido.
                Substituição, Análise da Engenharia e Sucatear registram só a intenção. O aviso ao
                confirmar diz o que aconteceu.
              </p>
              <div className="almox-field">
                <label className="almox-label">Decisão<span className="required">*</span></label>
                <select
                  className="almox-form-select"
                  value={decisaoForm.decisao}
                  onChange={(e) => setDecisaoForm((f) => ({ ...f, decisao: e.target.value }))}
                >
                  <option value="">Selecionar decisão...</option>
                  {DECISOES.map((d) => <option key={d.valor} value={d.valor}>{d.rotulo}</option>)}
                </select>
              </div>
              <div className="almox-field">
                <label className="almox-label">Justificativa<span className="required">*</span></label>
                <textarea
                  className="almox-input"
                  rows={3}
                  value={decisaoForm.justificativa}
                  placeholder="Por que esta decisão? É o que fica no documento para quem auditar depois."
                  onChange={(e) => setDecisaoForm((f) => ({ ...f, justificativa: e.target.value }))}
                />
              </div>
              {!pode('decidir_nao_conformidade') && (
                <p style={{ fontSize: '0.78rem', color: 'var(--gmp-warning)', margin: 0 }}>
                  {formatarErroPermissao({ acao: 'decidir_nao_conformidade', perfil })
                    || 'Seu perfil provavelmente não pode decidir não conformidade.'}
                </p>
              )}
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setDecisaoTarget(null)}>Cancelar</button>
              <button className="btn-almox-primary" disabled={salvando} onClick={submeterDecisao}>
                {salvando ? 'Salvando...' : 'Registrar decisão'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/*
        Etapa 45 — o modal do SEGUNDO gesto. Separado do de decisão de propósito, e não uma aba
        dele: são dois atos, de duas pessoas, em dois dias, com dois gates. Juntá-los num
        formulário só convidaria a "decidir e marcar como executado" no mesmo clique — que é
        exatamente a confusão entre intenção e fato que a etapa existe para desfazer.
      */}
      {execucaoTarget && (
        <div className="almox-modal-overlay" onClick={() => { if (!salvando) setExecucaoTarget(null); }}>
          <div className="almox-modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>Registrar execução de {execucaoTarget.numero}</h2>
              <button className="almox-modal-close" onClick={() => setExecucaoTarget(null)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <p style={{ marginTop: 0 }}>
                <strong>{execucaoTarget.material_nome || 'Material não identificado'}</strong>
                {execucaoTarget.material_codigo ? ` (${execucaoTarget.material_codigo})` : ''}
                {' — decisão: '}
                {ROTULO_DECISAO[execucaoTarget.decisao] || execucaoTarget.decisao}
              </p>
              {/*
                O texto muda com a DECISÃO porque o efeito muda: só `DEVOLVER` move saldo (RN-03).
                Dizer a mesma frase nos dois casos faria "registrei a execução do sucateamento"
                parecer que o estoque baixou — o mesmo silêncio do furo C57, um andar acima.
                Quanto/se o saldo se move, quem diz é o servidor, no toast.
              */}
              <p style={{ fontSize: '0.78rem', color: 'var(--gmp-text-light)', marginTop: 0 }}>
                {execucaoTarget.decisao === 'DEVOLVER' ? (
                  <>
                    Confirme que o material <strong>saiu de fato</strong> para o fornecedor. É este
                    registro que dá a baixa no estoque — antes dele o material segue retido. O
                    aviso ao confirmar diz quanto saiu, ou por que não saiu.
                  </>
                ) : (
                  <>
                    Esta decisão <strong>não movimenta estoque</strong>: o registro guarda a data,
                    o autor e a observação de que o encaminhamento foi cumprido.
                  </>
                )}
              </p>
              <div className="almox-field">
                <label className="almox-label">Observações</label>
                <textarea
                  className="almox-input"
                  rows={3}
                  value={execucaoObs}
                  placeholder="Opcional — nº da nota de devolução, transportadora, quem recebeu do outro lado."
                  onChange={(e) => setExecucaoObs(e.target.value)}
                />
              </div>
              {!pode('executar_encaminhamento') && (
                <p style={{ fontSize: '0.78rem', color: 'var(--gmp-warning)', margin: 0 }}>
                  {formatarErroPermissao({ acao: 'executar_encaminhamento', perfil })
                    || 'Seu perfil provavelmente não pode registrar a execução.'}
                </p>
              )}
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setExecucaoTarget(null)}>Cancelar</button>
              <button className="btn-almox-primary" disabled={salvando} onClick={submeterExecucao}>
                {salvando ? 'Salvando...' : 'Registrar execução'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/*
        Etapa 46 — o modal da SAÍDA. Terceiro modal desta tela, e separado dos outros dois pela
        mesma razão que os separa entre si: são atos distintos, de plateias distintas. O botão
        secundário se chama "Voltar", e não "Cancelar" como nos outros dois — num modal cujo botão
        primário é "Cancelar documento", dois botões com a palavra "Cancelar" seriam um convite ao
        clique errado num gesto que não tem desfazer.
      */}
      {cancelamentoTarget && (
        <div className="almox-modal-overlay" onClick={() => { if (!salvando) setCancelamentoTarget(null); }}>
          <div className="almox-modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>Cancelar {cancelamentoTarget.numero}</h2>
              <button className="almox-modal-close" onClick={() => setCancelamentoTarget(null)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <p style={{ marginTop: 0 }}>
                <strong>{cancelamentoTarget.material_nome || 'Material não identificado'}</strong>
                {cancelamentoTarget.material_codigo ? ` (${cancelamentoTarget.material_codigo})` : ''}
                {cancelamentoTarget.decisao
                  ? ` — decisão: ${ROTULO_DECISAO[cancelamentoTarget.decisao] || cancelamentoTarget.decisao}`
                  : ' — ainda não decidida'}
              </p>
              {/*
                ⚠️ ESTE PARÁGRAFO É A ÚNICA EXPLICAÇÃO QUE O USUÁRIO RECEBE do que o cancelamento
                faz com a decisão, e a tela toda já ficou atrás da regra duas vezes (o parágrafo
                do modal de decisão, nas Etapas 44 e 45). A regra que ele descreve é a RN-06: o
                claim do servidor NÃO zera `execucao_estado`, NÃO apaga `decisao`,
                `justificativa`, `decidido_por_*` nem `decidido_em`. O cenário (42) prende a
                frase; se a RN-06 mudar, é aqui que se corrige primeiro.
              */}
              <p style={{ fontSize: '0.78rem', color: 'var(--gmp-text-light)', marginTop: 0 }}>
                Cancelar <strong>não apaga a decisão</strong>: o documento continua guardando o que
                foi decidido, <strong>quem decidiu</strong> e quando. O que termina aqui é a
                cobrança da execução — ela <strong>deixa de ser cobrada</strong> de quem embala e
                envia, e o documento sai da fila de pendências. Para mudar o rumo do material,
                cancele este documento e abra outro: este fica no histórico, com o motivo abaixo.
              </p>
              <div className="almox-field">
                <label className="almox-label">Motivo<span className="required">*</span></label>
                <textarea
                  className="almox-input"
                  rows={3}
                  value={cancelamentoMotivo}
                  placeholder="Por que este documento não se cumpre? Mínimo de 5 caracteres — é o que fica para quem auditar depois."
                  onChange={(e) => setCancelamentoMotivo(e.target.value)}
                />
                {!motivoCancelamentoValido && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--gmp-text-light)' }}>
                    O motivo precisa de pelo menos {MOTIVO_CANCELAMENTO_MINIMO} caracteres.
                  </span>
                )}
              </div>
              {!pode('cancelar_nao_conformidade') && (
                <p style={{ fontSize: '0.78rem', color: 'var(--gmp-warning)', margin: 0 }}>
                  {formatarErroPermissao({ acao: 'cancelar_nao_conformidade', perfil })
                    || 'Seu perfil provavelmente não pode cancelar não conformidade.'}
                </p>
              )}
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setCancelamentoTarget(null)}>Voltar</button>
              <button
                className="btn-almox-primary"
                disabled={salvando || !motivoCancelamentoValido}
                onClick={submeterCancelamento}
              >
                {salvando ? 'Salvando...' : 'Cancelar documento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NaoConformidadesAlmoxarifado;
