/**
 * Etapa 38, Task 5 (RN-C12) — o formulário de PEDIDO DE COMPRA: criação, edição e importação.
 *
 * POR QUE ESTA TELA EXISTE: até a Etapa 38 o módulo Compras **não tinha como criar um pedido**.
 * `Compras.js` já escrevia os dois `<Link>` da aba "Pedidos de Compra" — o botão "Novo Pedido"
 * (`getNewItemPath`) e o lápis de cada linha (`/compras/pedidos/editar/:id`) — e `App.js` não
 * declarava rota nenhuma que os casasse: clicar voltava para a própria lista. Com isso, a Etapa 37
 * inteira (recebimento contra pedido) era inalcançável por clique, em qualquer ambiente, incluindo
 * produção, onde `COUNT(pedidos_compra)` era 0.
 *
 * ⚠️ OS TIPOS SÃO CONTRATO, E É POR ISSO QUE TUDO PASSA POR `Number()`:
 * os schemas Zod do servidor (`services/compras/schemas.js`) são `z.number()` **sem coerção** —
 * medido na Task 2: `'5'` responde 400. E `<input type="number">` e `<select>` devolvem **string**.
 * Sem a coação daqui, a suíte de API ficaria verde e **todo submit real** tomaria 400. As chaves
 * coagidas: `fornecedor_id`, `material_id`, `quantidade`, `valor_unitario`, `ipi_percentual`,
 * `peso_unitario` (quando preenchido), os três encargos (e `solicitacao_id`, quando vem por query).
 *
 * ⚠️ O QUE O PAYLOAD **NÃO** LEVA, e é decisão, não esquecimento:
 * - `numero`: é gerado pelo servidor (`inserirComNumeroUnico(db, 'PC', …)`). A tela não tem campo
 *   de número; ela **diz** que o número é gerado.
 * - `valor_total`: é derivado pelo próprio serviço (RN-C04; na Etapa 39, `= total_geral`, RN-39.02).
 *   O total mostrado aqui é informação para quem preenche, não dado de entrada.
 * - `item_numero`: é a posição da linha, atribuída pelo servidor (RN-39.01).
 *
 * ⚠️ AS LINHAS REPETIDAS DO MESMO MATERIAL SÃO LEGÍTIMAS (a importação da Task 4 as cria), então a
 * chave de React de cada linha é um id LOCAL crescente, nunca o `material_id`. Os `data-testid`
 * usam o `material_id` por legibilidade da régua — com duas linhas do mesmo material, o seletor
 * pega a primeira, e isso está dito aqui para ninguém confundir as duas coisas.
 *
 * ⚠️ QUEM DECIDE É O BACKEND. A única recusa local é "sem item" (e a literal é **cópia** da do
 * servidor, para a tela não inventar uma segunda frase para o mesmo fato). Quantidade, preço,
 * fornecedor inexistente, pedido já recebido e permissão são recusas do servidor, e chegam ao DOM
 * em `role="alert"` com a literal **dele**.
 *
 * ── Etapa 39 (RN-39.07) — O DOCUMENTO DA ETAPA 32, PORTADO SOBRE ESTE FORMULÁRIO ─────────────────
 *
 * No merge de 2026-10-07 o pedido desta branch venceu o da Etapa 32 — e a 32 nasceu de requisito
 * real: o PDF do ERP atual (`TF_PEDCOMPRA`), o documento que a GMP emite e o fornecedor recebe. O
 * que ela tinha e sumiu: condições comerciais (pagamento, frete, transportadora, via, tabela de
 * preço, contato, entregar em, cobrar em), IPI/NCM/peso/observação por item, encargos (frete,
 * desconto, ICMS-ST) e os seis totais. Isto volta AQUI, sobre o formulário atual — busca de
 * material, importação por planilha, 7 status, número gerado e "só status" após recebimento ficam.
 * Descartado da 32 (B19): número digitado, 4 status, modais de escolha de material/fornecedor e
 * a inclusão em lote por F2 (o formulário atual já tem a busca e a importação por planilha).
 *
 * Três regras que o código abaixo obedece e que a suíte mede:
 *  - A tela é de BOTÃO (G1b da 32: "não quero o usuário escrevendo nada"): cada lista do servidor
 *    vira chips; "Outro" abre um campo, e o que for digitado nele volta como botão no próximo
 *    pedido porque `GET /pedidos-aux/opcoes` une a lista fixa ao DISTINCT do que já foi gravado
 *    (RN-39.06). Não existe cadastro de condição a manter.
 *  - O payload leva o VALOR da opção, nunca o rótulo (o frete grava a string da SEFAZ e o chip
 *    mostra "FOB — nós pagamos").
 *  - O NAVEGADOR NÃO SOMA (RN-14 da 32, RN-39.05): os seis totais e o subtotal de cada linha vêm
 *    de `POST /compras/pedidos/calcular`, chamado 300 ms depois da última tecla. A única conta
 *    local que sobrou é o aviso de "item sem preço" (`> 0`), que não é um total.
 *
 * Divergência declarada: `GET /compras/materiais` devolve só `id, codigo, descricao, unidade`,
 * então NCM e peso nascem VAZIOS na criação (`''` = "o do material", RN-39.01: o servidor completa)
 * e só na edição vêm preenchidos, do `GET /:id`. Unidade e descrição do item NÃO são editáveis
 * (não estão no contrato do POST/PUT; continuam copiadas do material pelo servidor).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  FiArrowLeft, FiCheck, FiChevronDown, FiChevronUp, FiPlus, FiSave, FiSearch, FiTrash2, FiUpload,
} from 'react-icons/fi';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { formatarErroPermissao } from '../../utils/permissaoErro';
import { mascararTelefoneCompleto, mascararTelefoneDigitando } from '../../utils/telefone';
import '../Compras.css';
import './PedidoCompraForm.css';

// Os 7 status do contrato (`STATUS_PEDIDO_COMPRA` do servidor). A ordem é a do schema; os rótulos
// são os mesmos do filtro de `Compras.js`, para a mesma coisa não ter dois nomes no módulo.
const STATUS = [
  { valor: 'pendente', label: 'Pendente' },
  { valor: 'aprovado', label: 'Aprovado' },
  { valor: 'rejeitado', label: 'Rejeitado' },
  { valor: 'em_analise', label: 'Em Análise' },
  { valor: 'enviado', label: 'Enviado' },
  { valor: 'recebido', label: 'Recebido' },
  { valor: 'cancelado', label: 'Cancelado' },
];

const LITERAL_SEM_ITEM = 'Inclua ao menos um item no pedido de compra';
const LITERAL_AVISO_PRECO = 'Sem preço o custo médio do material não é alimentado no recebimento.';

/**
 * Etapa 39, onda de correção F4 — a faixa do pedido que JÁ TEVE RECEBIMENTO.
 *
 * O comprador preenchia o formulário inteiro de um pedido já recebido, clicava em "Salvar pedido"
 * e só então levava o 400 `… já teve recebimento — não pode mais ser editado` (guarda da Etapa 38,
 * que existe porque o `PUT` faz DELETE+INSERT das linhas e zeraria `quantidade_recebida`). Pior:
 * era justamente o pedido preso no beco da RN-D12 — recebido com atraso, marcado "Atrasado" para
 * sempre — e o gesto que o corrigiria era o único que a tela não deixava completar.
 *
 * Agora o `GET /compras/pedidos/:id` devolve `teve_recebimento` (0|1, derivado pelas MESMAS duas
 * pernas da guarda do servidor) e a tela diz ANTES: o que continua editável é só o status, e o
 * "Salvar pedido" vira `PATCH …/status`. Quem decide continua sendo o backend — esta faixa evita a
 * viagem perdida, não substitui a régua.
 */
const LITERAL_SO_STATUS = 'Este pedido já teve recebimento — só o status pode ser alterado';
const LITERAL_STATUS_ATUALIZADO = 'Status do pedido atualizado';

/**
 * ── A IMPORTAÇÃO 100% RECUSADA ERA ANUNCIADA EM VERDE (onda de correção, F6 — achado I3/UX) ───
 *
 * A porta responde **201 com sucesso parcial** por contrato, inclusive quando `pedidos: []` e todas
 * as linhas foram para `ignorados`. A tela não distinguia: mostrava `toast.success` escrito
 * `0 pedido(s) importado(s)`.
 *
 * E o caso é o MAIS provável de todos: `CHAVES_CODIGO` aceita só `codigo/código/cod/sku/…`, então
 * uma planilha com a coluna `Material`, `Item` ou `Cód.` recusa TODAS as linhas. Inclusive — até
 * este mesmo fix-round — a planilha que o próprio módulo produz: o "Exportar Excel" da aba Pedidos
 * não tinha coluna de código (corrigido em `Compras.js` na mesma passada), e reimportar o export do
 * próprio CRM é o primeiro arquivo que qualquer operador vai tentar.
 */
const LITERAL_NADA_IMPORTADO = 'Nenhum pedido importado — veja os motivos abaixo';

/**
 * Teto de renderização da lista de recusas: 5.000 linhas recusadas eram 5.000 `<li>`, e travar a
 * aba é o resultado do erro mais comum. O resto vira UMA linha que diz quantas ficaram de fora —
 * para o operador saber que a lista está cortada, em vez de achar que são só 20.
 */
const TETO_LISTA = 20;
const literalRestantes = (n) => `… e mais ${n} linha(s)`;

const formatCurrency = (valor) => new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL',
}).format(Number(valor) || 0);

/**
 * Etapa 39 (D2, RN-D03) — HOJE no fuso de quem clica.
 *
 * Era `new Date().toISOString().slice(0, 10)`, que e **UTC**: das 21h a meia-noite no fuso do
 * Brasil o formulario nascia com a data de AMANHA, e o pedido era gravado com ela. Mesma forma de
 * `FerramentasAlmoxarifado.js:417-424` (client) e de `hojeLocalISO` (`pedidoCompraService.js:615`,
 * servidor) — os tres dizem a mesma coisa, e agora dizem do mesmo jeito.
 */
const hojeISO = () => {
  const agora = new Date();
  return [agora.getFullYear(), String(agora.getMonth() + 1).padStart(2, '0'),
    String(agora.getDate()).padStart(2, '0')].join('-');
};

// Mensagem de erro do servidor, com o 403 de perfil já rotulado por `permissaoErro` (o mesmo
// utilitário que o almoxarifado usa): o 403 condicional do vínculo de solicitação (fix 1 da Task 2)
// responde `{ error, acao, perfil }`, e mostrar só o `error` esconderia QUAL permissão falta.
function mensagemDeErro(erro, fallback) {
  const data = erro?.response?.data;
  return formatarErroPermissao(data) || data?.error || fallback;
}

let sequenciaLinha = 0;
const novaLinha = (dados) => ({
  chave: `linha-${(sequenciaLinha += 1)}`,
  // O documento por item (RN-39.01). `''` em NCM/peso é "o do material" — a tela não inventa 0.
  ipi_percentual: 0, ncm: '', peso_unitario: '', observacao: '',
  ...dados,
});

// ── Etapa 39: o cabeçalho do documento ─────────────────────────────────────────────────────────
// Os 9 complementares viajam SEMPRE, como string (vazia quando não escolhidos): o servidor grava
// o que vier, e mandar a chave vazia é o que permite LIMPAR uma condição na edição.
const CONDICOES_VAZIAS = {
  condicao_pagamento: '', frete_modalidade: '', transportadora: '', transportadora_telefone: '',
  via_transporte: '', tabela_preco: '', contato: '', local_entrega: '', local_cobranca: '',
};
const ENCARGOS_VAZIOS = { total_icms_st: '', valor_frete: '', total_desconto: '' };
const TOTAIS_ZERO = {
  total_produtos: 0, total_ipi: 0, total_icms_st: 0, total_desconto: 0, valor_frete: 0, total_geral: 0,
};
const OPCOES_VAZIAS = {
  frete_modalidades: [], condicoes_pagamento: [], vias_transporte: [], unidades: [],
  ipi_sugerido: [], transportadoras: [], tabelas_preco: [], empresa: null,
};
// 300 ms depois da ÚLTIMA tecla (RN-39.07). Menos que isso é uma viagem por caractere; mais, e o
// total parece "travado" para quem digita o preço e olha o rodapé.
const DEBOUNCE_CALCULO_MS = 300;

const valorDe = (o) => (o && typeof o === 'object' ? o.valor : o);
const rotuloDe = (o) => (o && typeof o === 'object' ? (o.curto || o.valor) : o);
const ipiRotulo = (v) => `${String(Number(v) || 0).replace('.', ',')}%`;
const numeroOuZero = (v) => Number(v) || 0;
// Peso preenchido vira número; vazio (ou lixo) continua `''` = "o do material".
const pesoParaPayload = (v) => {
  if (v === '' || v == null) return '';
  const n = Number(v);
  return Number.isFinite(n) ? n : '';
};

/**
 * Grupo de botões de escolha única — o controle padrão do documento (porte da Etapa 32).
 *
 * `permitirOutro` acrescenta um botão que abre um campo: é como a Compras registra um valor que
 * ainda não existe (IPI fora da tabela, condição de pagamento nova). Reclicar no selecionado
 * limpa — sem isso, um campo opcional escolhido por engano não teria como voltar a vazio.
 *
 * Os `data-testid` são `chip-<campo>-<valor>`, `chip-<campo>-outro` e `outro-<campo>`: a régua
 * clica no VALOR, não no rótulo, porque é o valor que grava.
 */
function Chips({
  campo, label, opcoes, valor, onChange, ajuda, permitirOutro, tipoOutro = 'text', sufixoOutro, disabled,
}) {
  const lista = opcoes || [];
  const conhecido = lista.some((o) => String(valorDe(o)) === String(valor ?? ''));
  const temValor = valor !== '' && valor !== null && valor !== undefined;
  const [abertoOutro, setAbertoOutro] = useState(false);
  const outroAtivo = Boolean(permitirOutro && temValor && !conhecido);

  return (
    <div className="pedido-form-chips-bloco">
      <span className="pedido-form-chips-label">
        {label}
        {ajuda && <small>{ajuda}</small>}
      </span>
      <div className="pedido-form-chips" role="group" aria-label={label}>
        {lista.map((o) => {
          const v = valorDe(o);
          const ativo = String(valor ?? '') === String(v);
          return (
            <button
              type="button"
              key={String(v)}
              data-testid={`chip-${campo}-${v}`}
              className={`pedido-form-chip${ativo ? ' pedido-form-chip-ativo' : ''}`}
              aria-pressed={ativo}
              disabled={disabled}
              onClick={() => { setAbertoOutro(false); onChange(ativo ? '' : v); }}
            >
              {ativo && <FiCheck />}{rotuloDe(o)}
            </button>
          );
        })}
        {permitirOutro && (
          <button
            type="button"
            data-testid={`chip-${campo}-outro`}
            className={`pedido-form-chip${outroAtivo ? ' pedido-form-chip-ativo' : ''}`}
            aria-pressed={outroAtivo}
            disabled={disabled}
            onClick={() => setAbertoOutro((a) => !a)}
          >
            {outroAtivo && <FiCheck />}
            {outroAtivo ? `${valor}${sufixoOutro || ''}` : 'Outro…'}
          </button>
        )}
      </div>
      {permitirOutro && (abertoOutro || outroAtivo) && (
        <input
          data-testid={`outro-${campo}`}
          className="pedido-form-input pedido-form-input-outro"
          type={tipoOutro}
          step={tipoOutro === 'number' ? 'any' : undefined}
          min={tipoOutro === 'number' ? '0' : undefined}
          disabled={disabled}
          placeholder={tipoOutro === 'number' ? 'Digite o valor' : 'Digite a opção'}
          value={outroAtivo ? valor : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

/**
 * "Entregar em" / "Cobrar em": dois endereços conhecidos viram botão — o da empresa (vem de
 * `opcoes.empresa`, das configurações) e o do fornecedor escolhido — e "Outro endereço" abre o
 * campo. Componente de módulo, e não função dentro do render do formulário: definido lá dentro,
 * o React o trataria como um componente NOVO a cada render e o campo perderia o foco a cada tecla.
 */
function BotoesLocal({ campo, label, valor, onChange, empresa, fornecedor, disabled }) {
  const enderecoFornecedor = fornecedor
    ? [fornecedor.endereco, fornecedor.cidade, fornecedor.estado, fornecedor.cep].filter(Boolean).join(' - ')
    : '';
  const opcoes = [
    empresa?.endereco && { chave: 'empresa', valor: empresa.endereco, curto: empresa.nome || 'Nossa empresa' },
    enderecoFornecedor && { chave: 'fornecedor', valor: enderecoFornecedor, curto: 'Endereço do fornecedor' },
  ].filter(Boolean);
  const [outro, setOutro] = useState(false);
  const atual = valor || '';
  const ehOutro = Boolean(atual) && !opcoes.some((o) => o.valor === atual);

  return (
    <div className="pedido-form-chips-bloco">
      <span className="pedido-form-chips-label">{label}</span>
      <div className="pedido-form-chips" role="group" aria-label={label}>
        {opcoes.map((o) => {
          const ativo = atual === o.valor;
          return (
            <button
              type="button"
              key={o.chave}
              data-testid={`chip-${campo}-${o.chave}`}
              className={`pedido-form-chip${ativo ? ' pedido-form-chip-ativo' : ''}`}
              aria-pressed={ativo}
              disabled={disabled}
              onClick={() => { setOutro(false); onChange(ativo ? '' : o.valor); }}
            >
              {ativo && <FiCheck />}{o.curto}
            </button>
          );
        })}
        <button
          type="button"
          data-testid={`chip-${campo}-outro`}
          className={`pedido-form-chip${(outro || ehOutro) ? ' pedido-form-chip-ativo' : ''}`}
          aria-pressed={outro || ehOutro}
          disabled={disabled}
          onClick={() => { setOutro(true); if (!ehOutro) onChange(''); }}
        >
          Outro endereço
        </button>
      </div>
      {(outro || ehOutro) && (
        <input
          data-testid={`outro-${campo}`}
          className="pedido-form-input"
          placeholder="Digite o endereço"
          disabled={disabled}
          value={atual}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {atual && !outro && !ehOutro && <div className="pedido-form-escolhido">{atual}</div>}
    </div>
  );
}

const PedidoCompraForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const edicao = Boolean(id);

  const [fornecedores, setFornecedores] = useState([]);
  const [fornecedorId, setFornecedorId] = useState('');
  const [numero, setNumero] = useState('');
  const [dataPedido, setDataPedido] = useState(hojeISO());
  const [previsaoEntrega, setPrevisaoEntrega] = useState('');
  const [status, setStatus] = useState('pendente');
  const [observacoes, setObservacoes] = useState('');
  const [itens, setItens] = useState([]);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(edicao);
  // 0|1 do servidor -> boolean local. Só existe no modo edição (a criação não tem recebimento).
  const [soStatus, setSoStatus] = useState(false);

  // Etapa 39: o documento.
  const [opcoes, setOpcoes] = useState(OPCOES_VAZIAS);
  const [condicoes, setCondicoes] = useState(CONDICOES_VAZIAS);
  const [encargos, setEncargos] = useState(ENCARGOS_VAZIOS);
  const [totais, setTotais] = useState(TOTAIS_ZERO);
  // `valor_linha`/`ipi_linha` de cada item, na ORDEM dos itens — vêm do servidor, nunca de conta local.
  const [linhas, setLinhas] = useState([]);
  // IPI definido UMA vez para o pedido (G1c da 32: era o campo que mais se repetia em pedidos
  // longos). Item novo nasce com ele; cada item pode divergir em "detalhes".
  const [ipiPadrao, setIpiPadrao] = useState(0);
  const [detalhesAbertos, setDetalhesAbertos] = useState({});

  const [termoMaterial, setTermoMaterial] = useState('');
  const [materiais, setMateriais] = useState([]);
  const [buscando, setBuscando] = useState(false);

  const [importando, setImportando] = useState(false);
  const [resultadoImportacao, setResultadoImportacao] = useState(null);

  // `solicitacao_id` só existe no fluxo "Gerar pedido" da Reposição (Task 6). Os três parâmetros
  // viajam na URL porque **não há porta** que resolva uma solicitação do almoxarifado a partir do
  // módulo Compras: `GET /api/compras/solicitacoes-compra/:id` é a tabela `solicitacoes_compra` do
  // CORE, outra tabela, que traria o registro errado em silêncio.
  const solicitacaoId = params.get('solicitacao');

  const setCondicao = (campo, valor) => setCondicoes((c) => ({ ...c, [campo]: valor }));
  const setEncargo = (campo, valor) => setEncargos((c) => ({ ...c, [campo]: valor }));

  useEffect(() => {
    let vivo = true;
    api.get('/compras/fornecedores')
      .then((res) => { if (vivo) setFornecedores(res.data || []); })
      .catch(() => { if (vivo) setErro('Não foi possível carregar os fornecedores.'); });
    // As opções do documento (RN-39.06). Falhar aqui NÃO trava a tela: os chips ficam só com
    // "Outro" e o comprador digita — o servidor continua aceitando qualquer valor.
    api.get('/compras/pedidos-aux/opcoes')
      .then((res) => { if (vivo) setOpcoes({ ...OPCOES_VAZIAS, ...(res.data || {}) }); })
      .catch(() => { if (vivo) toast.warn('Não foi possível carregar as opções do pedido — os campos aceitam digitação.'); });
    return () => { vivo = false; };
  }, []);

  // O GET /:id já traz `totais` e `valor_linha` por item (RN-39.03): o primeiro disparo do
  // recálculo depois da carga seria refazer no servidor o que ele acabou de devolver. A flag pula
  // UM disparo — o seguinte (qualquer mudança do comprador) volta a chamar `/calcular`.
  const pularProximoCalculoRef = useRef(false);

  useEffect(() => {
    if (!edicao) {
      // Pré-carga do fluxo da Reposição. Sem consulta nenhuma: a linha da Reposição já tem
      // `material_id`, `material_nome` e `quantidade`, e o módulo Compras não tem porta de
      // material por id (a busca é por texto, com LIMIT 50).
      const materialParam = params.get('material');
      if (materialParam) {
        setItens([novaLinha({
          material_id: Number(materialParam),
          codigo: params.get('codigo') || '',
          descricao: params.get('material_nome') || `Material #${materialParam}`,
          unidade: params.get('unidade') || 'UN',
          quantidade: params.get('quantidade') || '1',
          valor_unitario: '',
        })]);
      }
      return;
    }
    let vivo = true;
    setCarregando(true);
    api.get(`/compras/pedidos/${id}`)
      .then((res) => {
        if (!vivo) return;
        const p = res.data || {};
        setNumero(p.numero || '');
        setFornecedorId(p.fornecedor_id == null ? '' : String(p.fornecedor_id));
        setDataPedido((p.data_pedido || '').slice(0, 10));
        setPrevisaoEntrega((p.previsao_entrega || '').slice(0, 10));
        setStatus(p.status || 'pendente');
        setObservacoes(p.observacoes || '');
        // `=== 1` estrito: o contrato é NÚMERO 0|1 (o SQLite não tem boolean). Um `Boolean(p.x)`
        // aceitaria a string '0' de um contrato futuro e travaria o formulário de todo pedido.
        setSoStatus(p.teve_recebimento === 1);
        // O documento gravado (RN-39.07: "edição mostra o que está gravado").
        setCondicoes(Object.fromEntries(Object.keys(CONDICOES_VAZIAS)
          .map((k) => [k, p[k] == null ? '' : String(p[k])])));
        setEncargos(Object.fromEntries(Object.keys(ENCARGOS_VAZIOS)
          .map((k) => [k, p[k] == null ? '' : String(p[k])])));
        const itensDoServidor = p.itens || [];
        if (p.totais) {
          setTotais({ ...TOTAIS_ZERO, ...p.totais });
          setLinhas(itensDoServidor.map((item) => ({ valor_linha: item.valor_linha, ipi_linha: item.ipi_linha })));
          pularProximoCalculoRef.current = itensDoServidor.length > 0;
        }
        setItens(itensDoServidor.map((item) => novaLinha({
          material_id: item.material_id,
          codigo: item.codigo || '',
          descricao: item.descricao || '',
          unidade: item.unidade || 'UN',
          quantidade: String(item.quantidade ?? ''),
          valor_unitario: String(item.valor_unitario ?? ''),
          ipi_percentual: item.ipi_percentual ?? 0,
          ncm: item.ncm == null ? '' : String(item.ncm),
          peso_unitario: item.peso_unitario == null ? '' : String(item.peso_unitario),
          observacao: item.observacao || '',
        })));
        // O IPI padrão do pedido aberto é o que a maioria dos itens usa.
        if (itensDoServidor.length) {
          const contagem = {};
          itensDoServidor.forEach((item) => {
            const k = String(Number(item.ipi_percentual) || 0);
            contagem[k] = (contagem[k] || 0) + 1;
          });
          const maisUsado = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0][0];
          setIpiPadrao(Number(maisUsado) || 0);
        }
      })
      .catch((e) => { if (vivo) setErro(mensagemDeErro(e, 'Não foi possível carregar o pedido.')); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
    // `params` fora das dependências de propósito: a pré-carga por query é da MONTAGEM, e
    // reexecutá-la a cada troca de query apagaria o que o comprador já digitou.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, edicao]);

  /**
   * ── A CONTA É DO SERVIDOR (RN-39.05) ────────────────────────────────────────────────────────
   *
   * Qualquer mudança em item ou encargo arma um timer de 300 ms; a última tecla vence e UMA
   * chamada a `POST /compras/pedidos/calcular` sai com o pedido inteiro. O que volta (`totais` e
   * `itens[].valor_linha/ipi_linha`) é o que a tela mostra — se a chamada falhar, a tela continua
   * de pé com o último valor conhecido; o servidor decide no salvar de qualquer forma.
   *
   * Sem item nenhum e sem encargo não há o que perguntar: zeros locais (não é uma soma, é a
   * ausência de pedido) e nenhuma viagem.
   */
  useEffect(() => {
    if (pularProximoCalculoRef.current) {
      pularProximoCalculoRef.current = false;
      return undefined;
    }
    const temEncargo = Object.values(encargos).some((v) => v !== '' && v != null);
    if (itens.length === 0 && !temEncargo) {
      setTotais(TOTAIS_ZERO);
      setLinhas([]);
      return undefined;
    }
    let ativo = true;
    const timer = setTimeout(() => {
      api.post('/compras/pedidos/calcular', {
        itens: itens.map((it) => ({
          material_id: Number(it.material_id),
          quantidade: numeroOuZero(it.quantidade),
          valor_unitario: numeroOuZero(it.valor_unitario),
          ipi_percentual: numeroOuZero(it.ipi_percentual),
        })),
        total_icms_st: numeroOuZero(encargos.total_icms_st),
        valor_frete: numeroOuZero(encargos.valor_frete),
        total_desconto: numeroOuZero(encargos.total_desconto),
      })
        .then((res) => {
          if (!ativo || !res?.data?.totais) return;
          setTotais({ ...TOTAIS_ZERO, ...res.data.totais });
          setLinhas(res.data.itens || []);
        })
        .catch(() => { /* a tela continua utilizável; o servidor decide no salvar */ });
    }, DEBOUNCE_CALCULO_MS);
    return () => { ativo = false; clearTimeout(timer); };
  }, [itens, encargos]);

  const buscarMateriais = useCallback(async () => {
    setBuscando(true);
    setErro('');
    try {
      const res = await api.get('/compras/materiais', { params: { search: termoMaterial } });
      setMateriais(res.data || []);
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível buscar materiais.'));
    } finally {
      setBuscando(false);
    }
  }, [termoMaterial]);

  const adicionarMaterial = (material) => {
    setItens((atuais) => [...atuais, novaLinha({
      material_id: material.id,
      codigo: material.codigo || '',
      descricao: material.descricao || '',
      unidade: material.unidade || 'UN',
      quantidade: '1',
      valor_unitario: '',
      ipi_percentual: ipiPadrao,
      // NCM/peso: a busca não os traz; `''` deixa o servidor completar com o do material.
      ncm: material.ncm == null ? '' : String(material.ncm),
      peso_unitario: material.peso_unitario == null ? '' : String(material.peso_unitario),
    })]);
  };

  const alterarItem = (chave, campo, valor) => {
    setItens((atuais) => atuais.map((it) => (it.chave === chave ? { ...it, [campo]: valor } : it)));
  };
  const removerItem = (chave) => setItens((atuais) => atuais.filter((it) => it.chave !== chave));

  /** Aplica o IPI padrão a TODOS os itens — o item pode divergir depois, em "detalhes". */
  const aplicarIpiPadrao = (v) => {
    const n = v === '' ? 0 : (Number(v) || 0);
    setIpiPadrao(n);
    setItens((atuais) => atuais.map((it) => ({ ...it, ipi_percentual: n })));
  };

  const temItemSemPreco = itens.some((it) => !(Number(it.valor_unitario) > 0));
  const fornecedorSel = fornecedores.find((f) => String(f.id) === String(fornecedorId)) || null;
  const ipiOpcoes = (opcoes.ipi_sugerido || []).map((v) => ({ valor: v, curto: ipiRotulo(v) }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErro('');

    // ── Etapa 39, F4: pedido JÁ RECEBIDO — o "Salvar pedido" é um PATCH de status ─────────────
    //
    // Sai ANTES da recusa de "sem item" e antes de montar o payload, e essa ordem é a regra: o
    // corpo do `PUT` não serve aqui (ele traz `itens`, e mandá-los para uma porta que promete
    // só-status seria a mentira que o `strip` do Zod conserta no servidor). O que este ramo manda
    // é `{ status }` e nada mais.
    if (edicao && soStatus) {
      setSalvando(true);
      try {
        await api.patch(`/compras/pedidos/${id}/status`, { status });
        toast.success(LITERAL_STATUS_ATUALIZADO);
        navigate('/compras/pedidos');
      } catch (err) {
        setErro(mensagemDeErro(err, 'Não foi possível atualizar o status do pedido.'));
      } finally {
        setSalvando(false);
      }
      return;
    }

    // A ÚNICA recusa local, e a literal é a do servidor (`inclua ao menos um item no pedido de
    // compra`, com a inicial maiúscula da frase de tela). Vale a pena ser local porque um pedido
    // sem linha é o defeito que a Fase 0 mediu em produção: cabeça gravada, item nenhum.
    if (itens.length === 0) {
      setErro(LITERAL_SEM_ITEM);
      return;
    }
    const payload = {
      fornecedor_id: Number(fornecedorId),
      data_pedido: dataPedido,
      previsao_entrega: previsaoEntrega,
      status,
      observacoes,
      ...condicoes,
      total_icms_st: numeroOuZero(encargos.total_icms_st),
      valor_frete: numeroOuZero(encargos.valor_frete),
      total_desconto: numeroOuZero(encargos.total_desconto),
      itens: itens.map((it) => ({
        material_id: Number(it.material_id),
        quantidade: Number(it.quantidade),
        valor_unitario: Number(it.valor_unitario) || 0,
        ipi_percentual: numeroOuZero(it.ipi_percentual),
        ncm: String(it.ncm || '').trim(),
        peso_unitario: pesoParaPayload(it.peso_unitario),
        observacao: it.observacao || '',
      })),
    };
    // Só na criação, e só quando veio pela Reposição: o `PUT` do servidor IGNORA `solicitacao_id`
    // de propósito (vincular solicitação é ato da criação, e é lá que vive o gate de
    // `gerenciar_reposicao`), então mandá-lo na edição só daria ruído.
    if (!edicao && solicitacaoId) payload.solicitacao_id = Number(solicitacaoId);

    setSalvando(true);
    try {
      if (edicao) {
        await api.put(`/compras/pedidos/${id}`, payload);
        toast.success('Pedido de compra atualizado');
      } else {
        const res = await api.post('/compras/pedidos', payload);
        toast.success(`Pedido ${res.data?.numero || ''} criado`.trim());
        if (res.data?.vinculo_solicitacao === 'falhou') {
          toast.warn('O pedido foi criado, mas a solicitação não pôde ser vinculada.');
        }
      }
      navigate('/compras/pedidos');
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível salvar o pedido de compra.'));
    } finally {
      setSalvando(false);
    }
  };

  /**
   * Importação por planilha — o precedente MEDIDO desta base: o NAVEGADOR lê o `.xlsx` (`XLSX.read`,
   * igual a `ItensFornecedor.js`) e o servidor recebe **JSON**. Nenhum upload de binário, nenhum
   * multer novo.
   *
   * `sheet_to_json` (e não `aoa_to_sheet` invertido) porque a porta
   * `POST /api/compras/pedidos/importar` espera **objetos** com o cabeçalho da planilha como chave,
   * em qualquer grafia — quem normaliza as chaves e escolhe os candidatos é o servidor
   * (`planilhaCompras.js`). `defval: ''` mantém a célula vazia como chave presente, senão uma
   * coluna em branco na primeira linha mudaria o formato do objeto linha a linha.
   */
  const handleImportar = (e) => {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    const input = e.target;
    setImportando(true);
    setErro('');
    setResultadoImportacao(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      let linhasPlanilha;
      try {
        const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        linhasPlanilha = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      } catch (err) {
        setErro('Erro ao ler arquivo. Use Excel (.xlsx, .xls) ou CSV.');
        setImportando(false);
        input.value = '';
        return;
      }
      if (!linhasPlanilha.length) {
        setErro('A planilha não tem nenhuma linha de dados.');
        setImportando(false);
        input.value = '';
        return;
      }
      api.post('/compras/pedidos/importar', { linhas: linhasPlanilha })
        .then((res) => {
          setResultadoImportacao(res.data || {});
          const criados = (res.data?.pedidos || []).length;
          // O 201 pode ser um FRACASSO TOTAL (ver `LITERAL_NADA_IMPORTADO`): quando nada entrou, a
          // tela diz isso, e em vermelho.
          if (criados === 0) toast.error(LITERAL_NADA_IMPORTADO);
          else toast.success(`${criados} pedido(s) importado(s)`);
        })
        .catch((err) => {
          setErro(mensagemDeErro(err, 'Não foi possível importar a planilha.'));
        })
        .finally(() => { setImportando(false); input.value = ''; });
    };
    reader.readAsArrayBuffer(arquivo);
  };

  return (
    <div className="compras pedido-form">
      <div className="page-header">
        <div>
          <Link to="/compras/pedidos" className="btn-secondary" style={{ marginBottom: 8, display: 'inline-flex' }}>
            <FiArrowLeft /> Voltar para pedidos
          </Link>
          <h1>{edicao ? 'Editar pedido de compra' : 'Novo pedido de compra'}</h1>
          {edicao ? (
            <p>Pedido <strong>{numero || `#${id}`}</strong> — o número não é editável.</p>
          ) : (
            <p>O número do pedido é gerado pelo sistema.</p>
          )}
        </div>
        {!edicao && (
          <div className="header-actions">
            <label className="btn-secondary" style={{ cursor: importando ? 'wait' : 'pointer' }}>
              <FiUpload /> {importando ? 'Importando...' : 'Importar planilha'}
              <input
                data-testid="importar-planilha"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleImportar}
                style={{ display: 'none' }}
              />
            </label>
          </div>
        )}
      </div>

      {erro && (
        <div
          role="alert"
          style={{
            background: 'rgba(231, 76, 60, 0.12)', color: '#c0392b', border: '1px solid #e74c3c',
            borderRadius: 8, padding: '10px 14px', marginBottom: 16,
          }}
        >
          {erro}
        </div>
      )}

      {resultadoImportacao && (() => {
        const pedidosCriados = resultadoImportacao.pedidos || [];
        const ignorados = resultadoImportacao.ignorados || [];
        const avisos = resultadoImportacao.avisos || [];
        // Nada criado = fracasso, e a caixa tem de PARECER um fracasso: o verde num "0 pedidos
        // criados" é o que fazia o operador ir embora achando que a carga funcionou.
        const nadaCriado = pedidosCriados.length === 0;
        return (
          <div
            data-testid="resultado-importacao"
            style={{
              background: nadaCriado ? 'rgba(231, 76, 60, 0.10)' : 'rgba(46, 204, 113, 0.10)',
              border: `1px solid ${nadaCriado ? '#e74c3c' : '#2ecc71'}`,
              borderRadius: 8, padding: '10px 14px', marginBottom: 16,
            }}
          >
            <strong>{nadaCriado ? LITERAL_NADA_IMPORTADO : 'Importação concluída'}</strong>
            <p>
              {pedidosCriados.length} pedidos criados,{' '}
              {resultadoImportacao.itens || 0} itens.
            </p>
            <ul>
              {pedidosCriados.map((p) => (
                <li key={p.id}>{p.numero} — {p.itens} itens</li>
              ))}
            </ul>
            {ignorados.length > 0 ? (
              <>
                <strong>Linhas ignoradas</strong>
                <ul data-testid="ignorados-lista">
                  {ignorados.slice(0, TETO_LISTA).map((ig, i) => (
                    <li key={`${ig.linha}-${i}`}>Linha {ig.linha}: {ig.motivo}</li>
                  ))}
                </ul>
                {ignorados.length > TETO_LISTA && (
                  <p data-testid="ignorados-restantes">{literalRestantes(ignorados.length - TETO_LISTA)}</p>
                )}
              </>
            ) : (
              <p>Nenhuma linha ignorada.</p>
            )}
            {/* `avisos` (F3) é IRMÃO de `ignorados`, não substituto: a linha ENTROU no pedido e só
                o campo ficou em branco — por isso a lista é outra, com o nome do campo. */}
            {avisos.length > 0 && (
              <>
                <strong>Linhas importadas com aviso</strong>
                <ul data-testid="avisos-lista">
                  {avisos.slice(0, TETO_LISTA).map((av, i) => (
                    <li key={`${av.linha}-${av.campo}-${i}`}>Linha {av.linha} ({av.campo}): {av.motivo}</li>
                  ))}
                </ul>
                {avisos.length > TETO_LISTA && (
                  <p data-testid="avisos-restantes">{literalRestantes(avisos.length - TETO_LISTA)}</p>
                )}
              </>
            )}
          </div>
        );
      })()}

      {carregando ? (
        <div className="loading"><p>Carregando pedido...</p></div>
      ) : (
        <form data-testid="form-pedido-compra" onSubmit={handleSubmit} className="module-content">
          {/* `role="alert"` como as demais mensagens desta tela: o comprador precisa saber POR QUE
              os campos estão travados antes de tentar mexer neles. */}
          {soStatus && (
            <p data-testid="aviso-so-status" role="alert" style={{ color: '#b9770e' }}>
              {LITERAL_SO_STATUS}
            </p>
          )}

          {/* ── 1. o pedido ───────────────────────────────────────────────────────────────── */}
          <section className="pedido-form-bloco">
            <h2>1. Pedido</h2>
            <div className="filters" style={{ flexWrap: 'wrap', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                Fornecedor
                <select
                  data-testid="pedido-fornecedor"
                  value={fornecedorId}
                  onChange={(ev) => setFornecedorId(ev.target.value)}
                  disabled={soStatus}
                  className="filter-select"
                >
                  <option value="">Selecione o fornecedor</option>
                  {fornecedores.map((f) => (
                    <option key={f.id} value={f.id}>{f.razao_social}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                Data do pedido
                <input
                  data-testid="pedido-data"
                  type="date"
                  value={dataPedido}
                  onChange={(ev) => setDataPedido(ev.target.value)}
                  disabled={soStatus}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                Previsão de entrega
                <input
                  data-testid="pedido-previsao"
                  type="date"
                  value={previsaoEntrega}
                  onChange={(ev) => setPrevisaoEntrega(ev.target.value)}
                  disabled={soStatus}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                Status
                <select
                  data-testid="pedido-status"
                  value={status}
                  onChange={(ev) => setStatus(ev.target.value)}
                  className="filter-select"
                >
                  {STATUS.map((s) => <option key={s.valor} value={s.valor}>{s.label}</option>)}
                </select>
              </label>
            </div>

            <label style={{ display: 'block', margin: '12px 0 0' }}>
              Observações
              <textarea
                data-testid="pedido-observacoes"
                value={observacoes}
                onChange={(ev) => setObservacoes(ev.target.value)}
                disabled={soStatus}
                rows={2}
                style={{ width: '100%' }}
              />
            </label>
          </section>

          {/* ── 2. os itens ───────────────────────────────────────────────────────────────── */}
          <section className="pedido-form-bloco">
            <h2>2. Itens do pedido{itens.length > 0 ? ` (${itens.length})` : ''}</h2>
            <div className="filters" style={{ gap: 8 }}>
              <div className="search-box">
                <FiSearch />
                <input
                  data-testid="busca-material"
                  type="text"
                  disabled={soStatus}
                  placeholder="Buscar material por código ou descrição..."
                  value={termoMaterial}
                  onChange={(ev) => setTermoMaterial(ev.target.value)}
                  onKeyDown={(ev) => {
                    // Enter no campo busca, e NÃO submete o pedido: um `type="submit"` implícito aqui
                    // gravaria o pedido no primeiro Enter da busca de material.
                    if (ev.key === 'Enter') { ev.preventDefault(); buscarMateriais(); }
                  }}
                />
              </div>
              {/* A busca é ato do usuário, não da digitação: a porta tem LIMIT 50 e um GET por tecla
                  seria uma consulta por caractere. */}
              <button
                data-testid="botao-buscar-material"
                type="button"
                className="btn-secondary"
                onClick={buscarMateriais}
                disabled={buscando || soStatus}
              >
                <FiSearch /> {buscando ? 'Buscando...' : 'Buscar material'}
              </button>
            </div>

            {materiais.length > 0 && (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr><th>Código</th><th>Descrição</th><th>Unidade</th><th>Ações</th></tr>
                  </thead>
                  <tbody>
                    {materiais.map((m) => (
                      <tr key={m.id}>
                        <td>{m.codigo}</td>
                        <td>{m.descricao}</td>
                        <td>{m.unidade}</td>
                        <td>
                          <button
                            data-testid={`adicionar-material-${m.id}`}
                            type="button"
                            disabled={soStatus}
                            className="btn-icon"
                            title="Adicionar ao pedido"
                            onClick={() => adicionarMaterial(m)}
                          >
                            <FiPlus />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* O IPI é do pedido, não do item: era o campo que mais se repetia em pedidos longos. */}
            <Chips
              campo="ipi_padrao"
              label="IPI dos itens"
              ajuda="vale para todos; dá para mudar item a item em “detalhes”"
              opcoes={ipiOpcoes}
              valor={ipiPadrao}
              onChange={aplicarIpiPadrao}
              permitirOutro
              tipoOutro="number"
              sufixoOutro="%"
              disabled={soStatus}
            />

            <div className="table-container">
              <table className="data-table pedido-form-itens">
                <thead>
                  <tr>
                    <th>Código</th><th>Descrição</th><th>Unidade</th>
                    <th>Quantidade</th><th>Valor unitário</th><th>Subtotal</th><th>Detalhes</th><th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.length === 0 ? (
                    <tr><td colSpan="8" className="no-data">Nenhum item adicionado</td></tr>
                  ) : itens.map((it, idx) => {
                    const aberto = Boolean(detalhesAbertos[it.chave]);
                    const linha = linhas[idx];
                    return (
                      <React.Fragment key={it.chave}>
                        <tr>
                          <td>{it.codigo || '-'}</td>
                          <td>{it.descricao || '-'}</td>
                          <td>{it.unidade}</td>
                          <td>
                            <input
                              data-testid={`qtd-item-${it.material_id}`}
                              type="number"
                              disabled={soStatus}
                              min="0"
                              step="any"
                              value={it.quantidade}
                              onChange={(ev) => alterarItem(it.chave, 'quantidade', ev.target.value)}
                              style={{ width: 90 }}
                            />
                          </td>
                          <td>
                            <input
                              data-testid={`valor-item-${it.material_id}`}
                              type="number"
                              disabled={soStatus}
                              min="0"
                              step="any"
                              value={it.valor_unitario}
                              onChange={(ev) => alterarItem(it.chave, 'valor_unitario', ev.target.value)}
                              style={{ width: 110 }}
                            />
                          </td>
                          {/* O subtotal é o `valor_linha` do SERVIDOR; antes da primeira resposta
                              a célula fica em "—", e não em qtd × unitário. */}
                          <td data-testid={`subtotal-item-${it.material_id}`} className="pedido-form-subtotal">
                            {linha && linha.valor_linha != null ? formatCurrency(linha.valor_linha) : '—'}
                          </td>
                          <td>
                            {/* O IPI do item fica VISÍVEL na linha fechada: se ficasse só dentro de
                                "detalhes", ninguém repararia que um item entre cinquenta saiu com
                                outra alíquota. */}
                            <button
                              data-testid={`detalhes-item-${it.material_id}`}
                              type="button"
                              className="pedido-form-detalhes"
                              title="IPI, NCM, peso e observação deste item"
                              aria-expanded={aberto}
                              onClick={() => setDetalhesAbertos((d) => ({ ...d, [it.chave]: !d[it.chave] }))}
                            >
                              {aberto ? <FiChevronUp /> : <FiChevronDown />}
                              <em className={Number(it.ipi_percentual) !== Number(ipiPadrao) ? 'pedido-form-ipi-diverge' : ''}>
                                IPI {ipiRotulo(it.ipi_percentual)}
                              </em>
                            </button>
                          </td>
                          <td>
                            <button
                              data-testid={`remover-item-${it.material_id}`}
                              type="button"
                              disabled={soStatus}
                              className="btn-icon btn-danger"
                              title="Remover item"
                              onClick={() => removerItem(it.chave)}
                            >
                              <FiTrash2 />
                            </button>
                          </td>
                        </tr>
                        {aberto && (
                          <tr className="pedido-form-item-extra">
                            <td colSpan="8">
                              <Chips
                                campo={`ipi-${it.material_id}`}
                                label="IPI deste item"
                                ajuda="em %"
                                opcoes={ipiOpcoes}
                                valor={it.ipi_percentual}
                                onChange={(v) => alterarItem(it.chave, 'ipi_percentual', v === '' ? 0 : v)}
                                permitirOutro
                                tipoOutro="number"
                                sufixoOutro="%"
                                disabled={soStatus}
                              />
                              <div className="pedido-form-livres">
                                <label>
                                  <span>NCM</span>
                                  <input
                                    data-testid={`ncm-item-${it.material_id}`}
                                    className="pedido-form-input"
                                    disabled={soStatus}
                                    placeholder="o do cadastro do material"
                                    value={it.ncm}
                                    onChange={(ev) => alterarItem(it.chave, 'ncm', ev.target.value)}
                                  />
                                </label>
                                <label>
                                  <span>Peso unitário (kg)</span>
                                  <input
                                    data-testid={`peso-item-${it.material_id}`}
                                    className="pedido-form-input"
                                    type="number"
                                    min="0"
                                    step="any"
                                    disabled={soStatus}
                                    placeholder="o do cadastro do material"
                                    value={it.peso_unitario}
                                    onChange={(ev) => alterarItem(it.chave, 'peso_unitario', ev.target.value)}
                                  />
                                </label>
                                <label className="pedido-form-livre-full">
                                  <span>Observação do item</span>
                                  <input
                                    data-testid={`obs-item-${it.material_id}`}
                                    className="pedido-form-input"
                                    disabled={soStatus}
                                    value={it.observacao}
                                    onChange={(ev) => alterarItem(it.chave, 'observacao', ev.target.value)}
                                  />
                                </label>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* O aviso do preço 0 — medido na Fase 2: o recebimento da Etapa 37 herda o preço da
                linha do pedido e só manda `custo_unitario` para o motor quando `> 0`. Preço 0 no
                pedido = custo médio NÃO alimentado. O pedido sem preço continua aceito (é decisão);
                o que não pode é o comprador não saber o que está deixando de acontecer. */}
            {temItemSemPreco && itens.length > 0 && (
              <p style={{ color: '#b9770e' }}>{LITERAL_AVISO_PRECO}</p>
            )}
          </section>

          {/* ── 3. condições ──────────────────────────────────────────────────────────────── */}
          <section className="pedido-form-bloco">
            <h2>3. Condições</h2>

            <Chips
              campo="condicao_pagamento"
              label="Condição de pagamento"
              opcoes={opcoes.condicoes_pagamento}
              valor={condicoes.condicao_pagamento}
              onChange={(v) => setCondicao('condicao_pagamento', v)}
              permitirOutro
              ajuda="a que você digitar em “Outro” vira botão no próximo pedido"
              disabled={soStatus}
            />
            <Chips
              campo="frete_modalidade"
              label="Quem paga o frete"
              opcoes={opcoes.frete_modalidades}
              valor={condicoes.frete_modalidade}
              onChange={(v) => setCondicao('frete_modalidade', v)}
              permitirOutro
              disabled={soStatus}
            />
            <Chips
              campo="via_transporte"
              label="Via de transporte"
              opcoes={opcoes.vias_transporte}
              valor={condicoes.via_transporte}
              onChange={(v) => setCondicao('via_transporte', v)}
              permitirOutro
              disabled={soStatus}
            />
            <Chips
              campo="transportadora"
              label="Transportadora"
              opcoes={opcoes.transportadoras}
              valor={condicoes.transportadora}
              onChange={(v) => setCondicao('transportadora', v)}
              permitirOutro
              disabled={soStatus}
            />
            <Chips
              campo="tabela_preco"
              label="Tabela de preço"
              opcoes={opcoes.tabelas_preco}
              valor={condicoes.tabela_preco}
              onChange={(v) => setCondicao('tabela_preco', v)}
              permitirOutro
              disabled={soStatus}
            />

            <div className="pedido-form-livres">
              <label>
                <span>Telefone da transportadora</span>
                <input
                  data-testid="pedido-transportadora-telefone"
                  className="pedido-form-input"
                  inputMode="tel"
                  disabled={soStatus}
                  value={condicoes.transportadora_telefone}
                  /* Máscara compartilhada, e não uma própria: o telefone da transportadora vai para
                     o mesmo lugar que os demais, e dois formatos no banco quebram a busca. */
                  onChange={(ev) => setCondicao('transportadora_telefone', mascararTelefoneDigitando(ev.target.value))}
                  onBlur={(ev) => setCondicao('transportadora_telefone', mascararTelefoneCompleto(ev.target.value))}
                />
              </label>
              <label>
                <span>Contato no fornecedor</span>
                <input
                  data-testid="pedido-contato"
                  className="pedido-form-input"
                  disabled={soStatus}
                  value={condicoes.contato}
                  onChange={(ev) => setCondicao('contato', ev.target.value)}
                />
              </label>
            </div>

            <BotoesLocal
              campo="local_entrega"
              label="Entregar em"
              valor={condicoes.local_entrega}
              onChange={(v) => setCondicao('local_entrega', v)}
              empresa={opcoes.empresa}
              fornecedor={fornecedorSel}
              disabled={soStatus}
            />
            <BotoesLocal
              campo="local_cobranca"
              label="Cobrar em"
              valor={condicoes.local_cobranca}
              onChange={(v) => setCondicao('local_cobranca', v)}
              empresa={opcoes.empresa}
              fornecedor={fornecedorSel}
              disabled={soStatus}
            />
          </section>

          {/* ── 4. total ──────────────────────────────────────────────────────────────────── */}
          <section className="pedido-form-bloco">
            <h2>4. Total</h2>
            <div className="pedido-form-encargos">
              <label>
                <span>Frete (R$)</span>
                <input
                  data-testid="pedido-frete"
                  className="pedido-form-input"
                  type="number" min="0" step="0.01" placeholder="0,00"
                  disabled={soStatus}
                  value={encargos.valor_frete}
                  onChange={(ev) => setEncargo('valor_frete', ev.target.value)}
                />
              </label>
              <label>
                <span>Desconto (R$)</span>
                <input
                  data-testid="pedido-desconto"
                  className="pedido-form-input"
                  type="number" min="0" step="0.01" placeholder="0,00"
                  disabled={soStatus}
                  value={encargos.total_desconto}
                  onChange={(ev) => setEncargo('total_desconto', ev.target.value)}
                />
              </label>
              <label>
                <span>ICMS ST (R$)</span>
                <input
                  data-testid="pedido-icms-st"
                  className="pedido-form-input"
                  type="number" min="0" step="0.01" placeholder="0,00"
                  disabled={soStatus}
                  value={encargos.total_icms_st}
                  onChange={(ev) => setEncargo('total_icms_st', ev.target.value)}
                />
                {/* A Compras informou (Etapa 32) que este lançamento é do Financeiro, na entrada
                    da NF. Fica disponível, mas dito que normalmente não é preenchido aqui. */}
                <small className="pedido-form-dica">normalmente lançado pelo Financeiro, na entrada da NF</small>
              </label>
            </div>

            {/* Os seis totais, TODOS do servidor (`/calcular` ou o `GET /:id`). */}
            <div className="pedido-form-totais">
              <div data-testid="total-produtos"><span>Produtos</span><strong>{formatCurrency(totais.total_produtos)}</strong></div>
              <div data-testid="total-ipi"><span>IPI</span><strong>{formatCurrency(totais.total_ipi)}</strong></div>
              <div data-testid="total-icms-st"><span>ICMS ST</span><strong>{formatCurrency(totais.total_icms_st)}</strong></div>
              <div data-testid="total-frete"><span>Frete</span><strong>{formatCurrency(totais.valor_frete)}</strong></div>
              <div data-testid="total-desconto"><span>Desconto</span><strong>{formatCurrency(totais.total_desconto)}</strong></div>
              <div data-testid="total-geral" className="pedido-form-total-geral">
                <span>Total do pedido</span><strong>{formatCurrency(totais.total_geral)}</strong>
              </div>
            </div>
          </section>

          <div className="header-actions">
            <button type="submit" className="btn-premium" disabled={salvando}>
              <FiSave /> {salvando ? 'Salvando...' : 'Salvar pedido'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default PedidoCompraForm;
