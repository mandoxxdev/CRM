import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../../services/api';
import { mascararTelefoneDigitando, mascararTelefoneCompleto } from '../../utils/telefone';
import {
  FiPlus, FiTrash2, FiSearch, FiArrowLeft, FiSave, FiEdit2, FiMinus,
  FiCheck, FiChevronDown, FiChevronUp, FiAlertTriangle, FiLayers,
} from 'react-icons/fi';
import './PedidoCompraForm.css';

/**
 * Formulário do pedido de compra (Etapa 32 — G1, G1b e G1c).
 *
 * G1b fixou a regra da tela: *"todas as opções devem ser botões, não quero o usuário
 * escrevendo nada"*. G1c responde ao e-mail da Gerente de Compras de 15/09/2026, que usou a
 * tela em produção e apontou quatro coisas:
 *
 *  1. IPI precisa de valor livre — a empresa usa alíquotas fora da lista.
 *  2. "G", "M" e "L" sozinhos não se distinguem (resolvido no rótulo, em `opcoesPedido.js`).
 *  3. Mais condições de pagamento, e como cadastrar novas. Resposta: qualquer condição usada
 *     uma vez volta como botão no próximo pedido — não há cadastro a fazer.
 *  4. **O ponto mais pesado**: pedidos com mais de 50 itens eram inviáveis, porque cada item
 *     pedia todos os campos. Daí três mudanças: IPI padrão definido UMA vez para o pedido,
 *     linha de item compacta (o resto fica em "detalhes"), e a inclusão em lote (F2), que é
 *     o fluxo que ela descreveu do Vision.
 *
 * Duas regras de módulo seguem valendo:
 *  - A conta NÃO é feita aqui: os totais vêm de `POST /compras/pedidos/calcular`, o mesmo
 *    `pedidoTotais` que grava.
 *  - Material vem de `/compras/pedidos-aux/materiais`, não de `/almoxarifado/materiais`:
 *    aquele prefixo é guardado por `checkModulePermission('almoxarifado')`.
 */

const LINHA_VAZIA = {
  material_id: '', material_nome: '', codigo: '', descricao: '', ncm: '',
  quantidade: 1, unidade: 'UN', valor_unitario: '', ipi_percentual: 0,
  peso_unitario: '', data_entrega: '', observacao: '',
};

const CABECALHO_VAZIO = {
  numero: '', fornecedor_id: '', status: 'pendente',
  data_pedido: new Date().toISOString().slice(0, 10),
  previsao_entrega: '', condicao_pagamento: '', frete_modalidade: '',
  transportadora: '', transportadora_telefone: '', via_transporte: '',
  tabela_preco: '', contato: '', observacoes: '', local_entrega: '', local_cobranca: '',
  total_icms_st: '', valor_frete: '', total_desconto: '',
};

const TOTAIS_ZERO = {
  total_produtos: 0, total_ipi: 0, total_icms_st: 0,
  total_desconto: 0, valor_frete: 0, total_geral: 0,
};

const STATUS = [
  { valor: 'pendente', curto: 'Pendente' },
  { valor: 'aprovado', curto: 'Aprovado' },
  { valor: 'finalizado', curto: 'Finalizado' },
  { valor: 'cancelado', curto: 'Cancelado' },
];

const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// O unitário guarda até 4 casas (RN-12: o ERP de origem armazena 4 e imprime 3). Cortar em 2
// aqui faria a tela divergir da nota fiscal do fornecedor.
const moedaUnit = (v) => Number(v || 0).toLocaleString('pt-BR', {
  style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4,
});

const hojeISO = () => new Date().toISOString().slice(0, 10);
const emDias = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const dataCurta = (iso) => {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso).slice(0, 10));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

const valorDe = (o) => (o && typeof o === 'object' ? o.valor : o);
const rotuloDe = (o) => (o && typeof o === 'object' ? (o.curto || o.valor) : o);

/**
 * Grupo de botões de escolha única — o controle padrão desta tela.
 *
 * `permitirOutro` acrescenta um botão que abre um campo: é como a Compras registra um valor
 * que ainda não existe (IPI fora da tabela, condição de pagamento nova). O que for usado uma
 * vez volta como botão no próximo pedido, porque o servidor une a lista fixa ao que já foi
 * gravado — não existe tela de cadastro a manter.
 */
const Chips = ({
  label, opcoes, valor, onChange, obrigatorio, ajuda,
  permitirOutro, tipoOutro = 'text', sufixoOutro,
}) => {
  const conhecido = (opcoes || []).some((o) => String(valorDe(o)) === String(valor ?? ''));
  const temValor = valor !== '' && valor !== null && valor !== undefined;
  const [abertoOutro, setAbertoOutro] = useState(false);
  const outroAtivo = permitirOutro && temValor && !conhecido;

  return (
    <div className="pcf-chips-bloco">
      <span className="pcf-chips-label">
        {label}{obrigatorio && <em> *</em>}
        {ajuda && <small>{ajuda}</small>}
      </span>
      <div className="pcf-chips">
        {(opcoes || []).map((o) => {
          const v = valorDe(o);
          const ativo = String(valor ?? '') === String(v);
          return (
            <button type="button" key={String(v)}
              className={`pcf-chip${ativo ? ' pcf-chip-ativo' : ''}`}
              aria-pressed={ativo}
              // Reclicar no selecionado limpa: sem isto, um campo opcional escolhido por
              // engano não teria como voltar a vazio sem recarregar a tela.
              onClick={() => { setAbertoOutro(false); onChange(ativo ? '' : v); }}>
              {ativo && <FiCheck />}{rotuloDe(o)}
            </button>
          );
        })}
        {permitirOutro && (
          <button type="button"
            className={`pcf-chip${outroAtivo ? ' pcf-chip-ativo' : ''}`}
            onClick={() => setAbertoOutro((a) => !a)}>
            {outroAtivo && <FiCheck />}
            {outroAtivo ? `${valor}${sufixoOutro || ''}` : 'Outro…'}
          </button>
        )}
      </div>
      {permitirOutro && (abertoOutro || outroAtivo) && (
        <input className="pcf-input-solto pcf-input-outro" type={tipoOutro}
          step={tipoOutro === 'number' ? 'any' : undefined}
          min={tipoOutro === 'number' ? '0' : undefined}
          autoFocus={abertoOutro}
          placeholder={tipoOutro === 'number' ? 'Digite o valor' : 'Digite a opção'}
          value={outroAtivo ? valor : ''}
          onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
};

const PedidoCompraForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const editando = !!id;

  const [cab, setCab] = useState(CABECALHO_VAZIO);
  const [itens, setItens] = useState([{ ...LINHA_VAZIA }]);
  const [fornecedores, setFornecedores] = useState([]);
  const [opcoes, setOpcoes] = useState(null);
  const [totais, setTotais] = useState(TOTAIS_ZERO);
  const [linhas, setLinhas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  // IPI definido UMA vez para o pedido inteiro: era o campo que mais se repetia item a item.
  const [ipiPadrao, setIpiPadrao] = useState(0);

  const [editandoNumero, setEditandoNumero] = useState(false);
  const [maisOpcoes, setMaisOpcoes] = useState(false);
  const [entregaOutro, setEntregaOutro] = useState(false);
  const [cobrancaOutro, setCobrancaOutro] = useState(false);
  const [detalhesAbertos, setDetalhesAbertos] = useState({});

  // Modais
  const [buscaLinha, setBuscaLinha] = useState(null);
  const [busca, setBusca] = useState('');
  const [materiais, setMateriais] = useState([]);
  const [escolhendoFornecedor, setEscolhendoFornecedor] = useState(false);
  const [buscaForn, setBuscaForn] = useState('');
  const [lote, setLote] = useState(null); // { selecionados: { [id]: qtd } }

  const setCampo = (campo, valor) => setCab((c) => ({ ...c, [campo]: valor }));

  /* ── carga inicial ──────────────────────────────────────────────── */
  useEffect(() => {
    let vivo = true;
    Promise.all([
      api.get('/compras/fornecedores', { params: { status: 'ativo' } }).then((r) => r.data || []),
      api.get('/compras/pedidos-aux/opcoes').then((r) => r.data),
      editando ? api.get(`/compras/pedidos/${id}`).then((r) => r.data) : Promise.resolve(null),
    ])
      .then(([forns, ops, pedido]) => {
        if (!vivo) return;
        setFornecedores(forns);
        setOpcoes(ops);

        if (pedido) {
          setCab({
            ...CABECALHO_VAZIO,
            ...Object.fromEntries(Object.keys(CABECALHO_VAZIO)
              .map((k) => [k, pedido[k] != null ? pedido[k] : CABECALHO_VAZIO[k]])),
            fornecedor_id: pedido.fornecedor_id || '',
          });
          const its = (pedido.itens || []).map((i) => ({
            ...LINHA_VAZIA, ...i,
            material_nome: i.material_nome || i.descricao || '',
            valor_unitario: i.valor_unitario ?? '',
            ipi_percentual: i.ipi_percentual ?? 0,
            data_entrega: i.data_entrega || '',
          }));
          setItens(its);
          // O IPI padrão do pedido aberto é o que a maioria dos itens usa.
          if (its.length) {
            const contagem = {};
            its.forEach((i) => { contagem[i.ipi_percentual] = (contagem[i.ipi_percentual] || 0) + 1; });
            const maisUsado = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0][0];
            setIpiPadrao(Number(maisUsado) || 0);
          }
        } else {
          setCab((c) => ({ ...c, numero: ops.proximo_numero || '' }));
        }
      })
      .catch((e) => {
        if (!vivo) return;
        if (editando) {
          toast.error(e.response?.data?.error || 'Pedido não encontrado');
          navigate('/compras/pedidos');
        } else {
          toast.error('Não foi possível carregar as opções do formulário');
        }
      })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [id, editando, navigate]);

  /* ── busca de material (debounce), serve aos dois modais ────────── */
  const buscandoMaterial = buscaLinha !== null || lote !== null;
  useEffect(() => {
    if (!buscandoMaterial) return undefined;
    const t = setTimeout(() => {
      api.get('/compras/pedidos-aux/materiais', { params: { search: busca || undefined } })
        .then((r) => setMateriais(r.data || []))
        .catch(() => setMateriais([]));
    }, 250);
    return () => clearTimeout(t);
  }, [busca, buscandoMaterial]);

  /* ── F2 abre a inclusão em lote ─────────────────────────────────── */
  // Atalho pedido no e-mail ("com F2 abra esta aba"), que é como o Vision funciona.
  const semMateriaisRef = useRef(false);
  useEffect(() => {
    const aoTeclar = (e) => {
      if (e.key !== 'F2' || semMateriaisRef.current) return;
      e.preventDefault();
      setBusca('');
      setLote({ selecionados: {} });
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, []);

  /* ── totais: SEMPRE do servidor ─────────────────────────────────── */
  const pedidoRef = useRef();
  pedidoRef.current = { itens, cab };

  const recalcular = useCallback(() => {
    const { itens: its, cab: c } = pedidoRef.current;
    const temValor = its.some((i) => i.quantidade !== '' && i.valor_unitario !== '');
    if (!temValor) {
      setTotais({
        ...TOTAIS_ZERO,
        valor_frete: Number(c.valor_frete) || 0,
        total_icms_st: Number(c.total_icms_st) || 0,
        total_desconto: Number(c.total_desconto) || 0,
      });
      setLinhas([]);
      return;
    }
    api.post('/compras/pedidos/calcular', {
      total_icms_st: c.total_icms_st, valor_frete: c.valor_frete, total_desconto: c.total_desconto,
      itens: its.map((i) => ({
        quantidade: Number(i.quantidade) || 0,
        valor_unitario: Number(i.valor_unitario) || 0,
        ipi_percentual: Number(i.ipi_percentual) || 0,
      })),
    })
      .then((r) => { setTotais(r.data.totais); setLinhas(r.data.itens || []); })
      .catch(() => { /* a tela continua utilizável; o servidor decide no salvar */ });
  }, []);

  useEffect(() => {
    const t = setTimeout(recalcular, 350);
    return () => clearTimeout(t);
  }, [itens, cab.valor_frete, cab.total_icms_st, cab.total_desconto, recalcular]);

  /* ── itens ──────────────────────────────────────────────────────── */
  const mudarItem = (idx, campo, valor) =>
    setItens((l) => l.map((it, i) => (i === idx ? { ...it, [campo]: valor } : it)));

  const somarQtd = (idx, delta) => setItens((l) => l.map((it, i) => {
    if (i !== idx) return it;
    return { ...it, quantidade: Math.max(1, (Number(it.quantidade) || 0) + delta) };
  }));

  /** Converte um material do cadastro em linha de item, já com o IPI padrão do pedido. */
  const linhaDeMaterial = (m, quantidade = 1) => ({
    ...LINHA_VAZIA,
    material_id: m.id,
    material_nome: m.nome,
    codigo: m.codigo || '',
    descricao: m.nome || '',
    unidade: m.unidade || 'UN',
    ncm: m.ncm || '',
    valor_unitario: m.custo_unitario || '',
    ipi_percentual: ipiPadrao,
    quantidade,
  });

  const escolherMaterial = (idx, m) => {
    setItens((l) => l.map((it, i) => (i === idx
      ? { ...linhaDeMaterial(m, Number(it.quantidade) || 1), ipi_percentual: it.ipi_percentual }
      : it)));
    setBuscaLinha(null);
    setBusca('');
  };

  const adicionarLinha = () =>
    setItens((l) => [...l, { ...LINHA_VAZIA, ipi_percentual: ipiPadrao }]);

  const removerLinha = (idx) =>
    setItens((l) => (l.length === 1 ? [{ ...LINHA_VAZIA, ipi_percentual: ipiPadrao }] : l.filter((_, i) => i !== idx)));

  /** Aplica o IPI padrão a TODOS os itens — o item pode divergir depois, em "detalhes". */
  const aplicarIpiPadrao = (v) => {
    const n = v === '' ? 0 : Number(v) || 0;
    setIpiPadrao(n);
    setItens((l) => l.map((it) => ({ ...it, ipi_percentual: n })));
  };

  /* ── inclusão em lote ───────────────────────────────────────────── */
  const marcarNoLote = (m) => setLote((lt) => {
    const sel = { ...lt.selecionados };
    if (sel[m.id] !== undefined) delete sel[m.id];
    else sel[m.id] = 1;
    return { ...lt, selecionados: sel };
  });

  const qtdNoLote = (id, valor) => setLote((lt) => ({
    ...lt, selecionados: { ...lt.selecionados, [id]: valor },
  }));

  const confirmarLote = () => {
    const escolhidos = Object.entries(lote.selecionados);
    if (escolhidos.length === 0) { setLote(null); return; }

    // `materiais` só tem a página atual da busca; o lote pode ter itens marcados numa busca
    // anterior. Por isso a linha é montada a partir do que está em `materiaisDoLote`.
    const novas = escolhidos.map(([idMat, qtd]) => {
      const m = materiaisDoLote.current[idMat];
      return m ? linhaDeMaterial(m, Number(qtd) || 1) : null;
    }).filter(Boolean);

    setItens((l) => {
      // A primeira linha vazia do pedido é substituída, e não empurrada para o fim.
      const semVaziaInicial = (l.length === 1 && !l[0].material_id) ? [] : l;
      return [...semVaziaInicial, ...novas];
    });
    toast.success(`${novas.length} ${novas.length === 1 ? 'item adicionado' : 'itens adicionados'}`);
    setLote(null);
    setBusca('');
  };

  // Guarda os materiais já vistos, para o lote sobreviver a uma troca de busca.
  const materiaisDoLote = useRef({});
  useEffect(() => {
    materiais.forEach((m) => { materiaisDoLote.current[m.id] = m; });
  }, [materiais]);

  const escolherFornecedor = (f) => {
    setCampo('fornecedor_id', f.id);
    setEscolhendoFornecedor(false);
    setBuscaForn('');
  };

  /* ── salvar ─────────────────────────────────────────────────────── */
  const salvar = async (e) => {
    e.preventDefault();
    if (!String(cab.numero).trim()) return toast.error('Informe o número do pedido');
    if (!cab.fornecedor_id) return toast.error('Escolha o fornecedor');
    if (itens.some((i) => !i.material_id)) {
      return toast.error('Todo item precisa de um material do cadastro');
    }
    if (itens.some((i) => !(Number(i.quantidade) > 0))) {
      return toast.error('Todo item precisa de uma quantidade maior que zero');
    }

    setSalvando(true);
    try {
      const payload = {
        ...cab,
        fornecedor_id: Number(cab.fornecedor_id),
        total_icms_st: Number(cab.total_icms_st) || 0,
        valor_frete: Number(cab.valor_frete) || 0,
        total_desconto: Number(cab.total_desconto) || 0,
        itens: itens.map((i, idx) => ({
          material_id: Number(i.material_id),
          codigo: i.codigo || null,
          descricao: i.descricao || null,
          observacao: i.observacao || null,
          ncm: i.ncm || null,
          peso_unitario: Number(i.peso_unitario) || 0,
          data_entrega: i.data_entrega || null,
          quantidade: Number(i.quantidade) || 0,
          unidade: i.unidade || 'UN',
          valor_unitario: Number(i.valor_unitario) || 0,
          ipi_percentual: Number(i.ipi_percentual) || 0,
          item_numero: idx + 1,
        })),
      };
      const r = editando
        ? await api.put(`/compras/pedidos/${id}`, payload)
        : await api.post('/compras/pedidos', payload);
      toast.success(`Pedido ${r.data.numero} ${editando ? 'atualizado' : 'criado'}!`);
      navigate('/compras/pedidos');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar o pedido');
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) return <div className="pcf-carregando">Carregando…</div>;

  const fornecedorSel = fornecedores.find((f) => String(f.id) === String(cab.fornecedor_id));
  const ops = opcoes || {};
  const semMateriais = ops.total_materiais === 0;
  semMateriaisRef.current = semMateriais;

  const enderecoEmpresa = ops.empresa?.endereco || '';
  const enderecoFornecedor = fornecedorSel
    ? [fornecedorSel.endereco, fornecedorSel.cidade, fornecedorSel.estado, fornecedorSel.cep]
      .filter(Boolean).join(' - ')
    : '';

  const BotoesLocal = ({ campo, outro, setOutro }) => {
    const atual = cab[campo] || '';
    const opcoesLocal = [
      enderecoEmpresa && { valor: enderecoEmpresa, curto: `${ops.empresa?.nome || 'Nossa empresa'}` },
      enderecoFornecedor && { valor: enderecoFornecedor, curto: 'Endereço do fornecedor' },
    ].filter(Boolean);
    const ehOutro = atual && !opcoesLocal.some((o) => o.valor === atual);

    return (
      <div className="pcf-chips-bloco">
        <span className="pcf-chips-label">
          {campo === 'local_entrega' ? 'Entregar em' : 'Cobrar em'}
        </span>
        <div className="pcf-chips">
          {opcoesLocal.map((o) => (
            <button type="button" key={o.valor}
              className={`pcf-chip${atual === o.valor ? ' pcf-chip-ativo' : ''}`}
              onClick={() => { setOutro(false); setCampo(campo, atual === o.valor ? '' : o.valor); }}>
              {atual === o.valor && <FiCheck />}{o.curto}
            </button>
          ))}
          <button type="button"
            className={`pcf-chip${(outro || ehOutro) ? ' pcf-chip-ativo' : ''}`}
            onClick={() => { setOutro(true); if (!ehOutro) setCampo(campo, ''); }}>
            Outro endereço
          </button>
        </div>
        {(outro || ehOutro) && (
          <input className="pcf-input-solto" value={atual}
            placeholder="Digite o endereço"
            onChange={(e) => setCampo(campo, e.target.value)} />
        )}
        {atual && !outro && !ehOutro && <div className="pcf-escolhido">{atual}</div>}
      </div>
    );
  };

  const fornecedoresFiltrados = buscaForn.trim().length === 0
    ? fornecedores
    : fornecedores.filter((f) => `${f.razao_social} ${f.nome_fantasia || ''} ${f.cnpj || ''}`
      .toLowerCase().includes(buscaForn.trim().toLowerCase()));

  const itensCompletos = itens.filter((i) => i.material_id).length;
  const marcadosNoLote = lote ? Object.keys(lote.selecionados).length : 0;

  return (
    <div className="pcf">
      <form onSubmit={salvar}>
        <div className="pcf-topo">
          <div>
            <button type="button" className="pcf-voltar" onClick={() => navigate('/compras/pedidos')}>
              <FiArrowLeft /> Voltar
            </button>
            <h1>{editando ? `Pedido ${cab.numero}` : 'Novo Pedido de Compra'}</h1>
          </div>
          <button type="submit" className="pcf-salvar" disabled={salvando}>
            <FiSave /> {salvando ? 'Salvando…' : 'Salvar pedido'}
          </button>
        </div>

        {semMateriais && (
          <div className="pcf-bloqueio">
            <FiAlertTriangle />
            <div>
              <strong>Nenhum material cadastrado.</strong> Todo item do pedido precisa de um
              material do cadastro, então não é possível salvar nada ainda.{' '}
              <Link to="/almoxarifado/materiais">Cadastrar materiais</Link> primeiro.
            </div>
          </div>
        )}

        {/* ── 1. fornecedor e número ────────────────────────────── */}
        <section className="pcf-bloco">
          <h2>1. Fornecedor</h2>

          {fornecedorSel ? (
            <div className="pcf-forn-card">
              <div>
                <strong>{fornecedorSel.razao_social}</strong>
                <span>
                  {[fornecedorSel.cnpj, fornecedorSel.cidade, fornecedorSel.estado,
                    fornecedorSel.telefone].filter(Boolean).join(' · ') || 'sem dados de contato'}
                </span>
              </div>
              <button type="button" className="pcf-trocar"
                onClick={() => setEscolhendoFornecedor(true)}>Trocar</button>
            </div>
          ) : (
            <button type="button" className="pcf-escolher-grande"
              onClick={() => setEscolhendoFornecedor(true)}>
              <FiSearch /> Escolher fornecedor
            </button>
          )}

          <div className="pcf-numero-linha">
            <span className="pcf-chips-label">Número do pedido</span>
            {editandoNumero ? (
              <input className="pcf-input-solto pcf-input-numero" autoFocus value={cab.numero}
                onChange={(e) => setCampo('numero', e.target.value)}
                onBlur={() => setEditandoNumero(false)} />
            ) : (
              <span className="pcf-numero">
                {cab.numero || '—'}
                <button type="button" onClick={() => setEditandoNumero(true)} title="Alterar número">
                  <FiEdit2 /> alterar
                </button>
              </span>
            )}
            {!editando && <small>sugerido pelo sistema, continuando a sua numeração</small>}
          </div>
        </section>

        {/* ── 2. itens ──────────────────────────────────────────── */}
        <section className="pcf-bloco">
          <div className="pcf-bloco-topo">
            <h2>2. O que está sendo comprado{itensCompletos > 0 ? ` (${itensCompletos})` : ''}</h2>
            <div className="pcf-acoes-itens">
              <button type="button" className="pcf-add pcf-add-destaque" disabled={semMateriais}
                onClick={() => { setBusca(''); setLote({ selecionados: {} }); }}>
                <FiLayers /> Adicionar vários <kbd>F2</kbd>
              </button>
              <button type="button" className="pcf-add" onClick={adicionarLinha} disabled={semMateriais}>
                <FiPlus /> Adicionar um
              </button>
            </div>
          </div>

          {/* O IPI é do pedido, não do item: era o campo que mais se repetia em pedidos longos. */}
          <Chips label="IPI dos itens" ajuda="vale para todos; dá para mudar item a item em “detalhes”"
            opcoes={(ops.ipi || []).map((v) => ({ valor: v, curto: `${String(v).replace('.', ',')}%` }))}
            valor={ipiPadrao} onChange={aplicarIpiPadrao}
            permitirOutro tipoOutro="number" sufixoOutro="%" />

          <div className="pcf-itens-lista">
            {itens.map((it, idx) => {
              const aberto = !!detalhesAbertos[idx];
              const ipiDiverge = Number(it.ipi_percentual) !== Number(ipiPadrao);
              return (
                <div key={idx} className={`pcf-item${!it.material_id ? ' pcf-item-vazio' : ''}`}>
                  <div className="pcf-item-linha">
                    <span className="pcf-item-num">{idx + 1}</span>

                    {it.material_id ? (
                      <button type="button" className="pcf-item-material"
                        onClick={() => { setBuscaLinha(idx); setBusca(''); }}>
                        <strong>{it.material_nome}</strong>
                        <small>{it.codigo}{it.ncm ? ` · NCM ${it.ncm}` : ''} · {it.unidade}</small>
                      </button>
                    ) : (
                      <button type="button" className="pcf-item-material pcf-item-material-vazio"
                        disabled={semMateriais}
                        onClick={() => { setBuscaLinha(idx); setBusca(''); }}>
                        <FiSearch /> Escolher material
                      </button>
                    )}

                    <div className="pcf-stepper">
                      <button type="button" onClick={() => somarQtd(idx, -1)} title="Menos um">
                        <FiMinus />
                      </button>
                      <input type="number" min="0" step="any" value={it.quantidade}
                        aria-label={`Quantidade do item ${idx + 1}`}
                        onChange={(e) => mudarItem(idx, 'quantidade', e.target.value)} />
                      <button type="button" onClick={() => somarQtd(idx, 1)} title="Mais um">
                        <FiPlus />
                      </button>
                    </div>

                    <input className="pcf-input-preco" type="number" min="0" step="0.0001"
                      placeholder="0,00" value={it.valor_unitario}
                      aria-label={`Preço unitário do item ${idx + 1}`}
                      onChange={(e) => mudarItem(idx, 'valor_unitario', e.target.value)} />

                    <strong className="pcf-item-total">
                      {linhas[idx] ? moeda(linhas[idx].valor_linha) : '—'}
                    </strong>

                    <button type="button" className="pcf-item-detalhes"
                      title="Unidade, IPI e entrega deste item"
                      onClick={() => setDetalhesAbertos((d) => ({ ...d, [idx]: !d[idx] }))}>
                      {aberto ? <FiChevronUp /> : <FiChevronDown />}
                      {ipiDiverge && <em title="IPI diferente do padrão">IPI {it.ipi_percentual}%</em>}
                    </button>

                    <button type="button" className="pcf-remover" title="Remover item"
                      onClick={() => removerLinha(idx)}>
                      <FiTrash2 />
                    </button>
                  </div>

                  {aberto && (
                    <div className="pcf-item-extra">
                      <Chips label="Unidade" opcoes={ops.unidades || []} valor={it.unidade}
                        onChange={(v) => mudarItem(idx, 'unidade', v || 'UN')} />

                      <Chips label="IPI deste item" ajuda="em %"
                        opcoes={(ops.ipi || []).map((v) => ({ valor: v, curto: `${String(v).replace('.', ',')}%` }))}
                        valor={it.ipi_percentual}
                        onChange={(v) => mudarItem(idx, 'ipi_percentual', v === '' ? 0 : v)}
                        permitirOutro tipoOutro="number" sufixoOutro="%" />

                      <div className="pcf-chips-bloco">
                        <span className="pcf-chips-label">Entrega deste item</span>
                        <div className="pcf-chips">
                          {[['Hoje', hojeISO()], ['Em 7 dias', emDias(7)], ['Em 15 dias', emDias(15)],
                            ['Em 30 dias', emDias(30)]].map(([rot, valor]) => (
                              <button type="button" key={rot}
                                className={`pcf-chip${it.data_entrega === valor ? ' pcf-chip-ativo' : ''}`}
                                onClick={() => mudarItem(idx, 'data_entrega', it.data_entrega === valor ? '' : valor)}>
                                {it.data_entrega === valor && <FiCheck />}{rot}
                              </button>
                            ))}
                          <input type="date" className="pcf-data-input" value={it.data_entrega || ''}
                            onChange={(e) => mudarItem(idx, 'data_entrega', e.target.value)} />
                        </div>
                        {it.data_entrega && <div className="pcf-escolhido">{dataCurta(it.data_entrega)}</div>}
                      </div>

                      <div className="pcf-livres">
                        <label><span>Descrição no pedido</span>
                          <input value={it.descricao}
                            onChange={(e) => mudarItem(idx, 'descricao', e.target.value)} /></label>
                        <label><span>Observação do item</span>
                          <input value={it.observacao}
                            onChange={(e) => mudarItem(idx, 'observacao', e.target.value)} /></label>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── 3. condições ──────────────────────────────────────── */}
        <section className="pcf-bloco">
          <h2>3. Condições</h2>

          <Chips label="Condição de pagamento" opcoes={ops.condicao_pagamento || []}
            valor={cab.condicao_pagamento}
            onChange={(v) => setCampo('condicao_pagamento', v)}
            permitirOutro
            ajuda="a que você digitar em “Outro” vira botão no próximo pedido" />

          <Chips label="Quem paga o frete" opcoes={ops.frete_modalidade || []}
            valor={cab.frete_modalidade}
            onChange={(v) => setCampo('frete_modalidade', v)} />

          <Chips label="Via de transporte" opcoes={ops.via_transporte || []}
            valor={cab.via_transporte}
            onChange={(v) => setCampo('via_transporte', v)} permitirOutro />

          <div className="pcf-chips-bloco">
            <span className="pcf-chips-label">Previsão de entrega do pedido</span>
            <div className="pcf-chips">
              {[['Em 7 dias', emDias(7)], ['Em 15 dias', emDias(15)], ['Em 30 dias', emDias(30)],
                ['Em 45 dias', emDias(45)]].map(([rot, valor]) => (
                  <button type="button" key={rot}
                    className={`pcf-chip${cab.previsao_entrega === valor ? ' pcf-chip-ativo' : ''}`}
                    onClick={() => setCampo('previsao_entrega', cab.previsao_entrega === valor ? '' : valor)}>
                    {cab.previsao_entrega === valor && <FiCheck />}{rot}
                  </button>
                ))}
              <input type="date" className="pcf-data-input" value={cab.previsao_entrega || ''}
                onChange={(e) => setCampo('previsao_entrega', e.target.value)} />
            </div>
            {cab.previsao_entrega && <div className="pcf-escolhido">{dataCurta(cab.previsao_entrega)}</div>}
          </div>

          <BotoesLocal campo="local_entrega" outro={entregaOutro} setOutro={setEntregaOutro} />
        </section>

        {/* ── 4. totais ─────────────────────────────────────────── */}
        <section className="pcf-bloco">
          <h2>4. Total</h2>
          <div className="pcf-encargos">
            <label><span>Frete (R$)</span>
              <input type="number" min="0" step="0.01" placeholder="0,00" value={cab.valor_frete}
                onChange={(e) => setCampo('valor_frete', e.target.value)} /></label>
            <label><span>Desconto (R$)</span>
              <input type="number" min="0" step="0.01" placeholder="0,00" value={cab.total_desconto}
                onChange={(e) => setCampo('total_desconto', e.target.value)} /></label>
            <label>
              <span>ICMS ST (R$)</span>
              <input type="number" min="0" step="0.01" placeholder="0,00" value={cab.total_icms_st}
                onChange={(e) => setCampo('total_icms_st', e.target.value)} />
              {/* A Compras informou que este lançamento é do Financeiro, na entrada da NF.
                  Fica disponível, mas dito que normalmente não é preenchido aqui. */}
              <small className="pcf-dica">normalmente lançado pelo Financeiro, na entrada da NF</small>
            </label>
          </div>

          <div className="pcf-totais">
            <div><span>Produtos</span><strong>{moeda(totais.total_produtos)}</strong></div>
            <div><span>IPI</span><strong>{moeda(totais.total_ipi)}</strong></div>
            <div><span>ICMS ST</span><strong>{moeda(totais.total_icms_st)}</strong></div>
            <div><span>Frete</span><strong>{moeda(totais.valor_frete)}</strong></div>
            <div><span>Desconto</span><strong>{moeda(totais.total_desconto)}</strong></div>
            <div className="pcf-total-geral">
              <span>Total do pedido</span><strong>{moeda(totais.total_geral)}</strong>
            </div>
          </div>
        </section>

        {/* ── 5. o que quase nunca muda ─────────────────────────── */}
        <section className="pcf-bloco">
          <button type="button" className="pcf-mais" onClick={() => setMaisOpcoes((v) => !v)}>
            {maisOpcoes ? <FiChevronUp /> : <FiChevronDown />} Mais opções
            <small>transportadora, cobrança, status, observações</small>
          </button>

          {maisOpcoes && (
            <div className="pcf-mais-corpo">
              <Chips label="Status do pedido" opcoes={STATUS} valor={cab.status}
                onChange={(v) => setCampo('status', v || 'pendente')} />

              <Chips label="Transportadora" opcoes={ops.transportadoras || []}
                valor={cab.transportadora}
                onChange={(v) => setCampo('transportadora', v)} permitirOutro />

              {(ops.tabelas_preco || []).length > 0 && (
                <Chips label="Tabela de preço" opcoes={ops.tabelas_preco} valor={cab.tabela_preco}
                  onChange={(v) => setCampo('tabela_preco', v)} permitirOutro />
              )}

              <BotoesLocal campo="local_cobranca" outro={cobrancaOutro} setOutro={setCobrancaOutro} />

              <div className="pcf-livres">
                <label><span>Telefone da transportadora</span>
                  <input
                    value={cab.transportadora_telefone}
                    /* Mascara compartilhada, e nao uma propria: o telefone da
                       transportadora vai para o mesmo lugar que os demais, e
                       dois formatos diferentes no banco quebram a busca. */
                    onChange={(e) => setCampo('transportadora_telefone', mascararTelefoneDigitando(e.target.value))}
                    onBlur={(e) => setCampo('transportadora_telefone', mascararTelefoneCompleto(e.target.value))}
                    inputMode="tel"
                  /></label>
                <label><span>Contato no fornecedor</span>
                  <input value={cab.contato}
                    onChange={(e) => setCampo('contato', e.target.value)} /></label>
                <label className="pcf-livre-full"><span>Observações do pedido</span>
                  <textarea rows="2" value={cab.observacoes}
                    onChange={(e) => setCampo('observacoes', e.target.value)} /></label>
              </div>
            </div>
          )}
        </section>

        <div className="pcf-rodape">
          <button type="submit" className="pcf-salvar" disabled={salvando}>
            <FiSave /> {salvando ? 'Salvando…' : 'Salvar pedido'}
          </button>
        </div>
      </form>

      {/* ── inclusão em lote (F2) ───────────────────────────────── */}
      {lote && (
        <div className="pcf-modal-overlay" onClick={() => setLote(null)}>
          <div className="pcf-modal pcf-modal-largo" onClick={(e) => e.stopPropagation()}>
            <div className="pcf-modal-topo">
              <h3>Adicionar vários itens</h3>
              <button type="button" onClick={() => setLote(null)}>✕</button>
            </div>
            <div className="pcf-modal-busca">
              <FiSearch />
              <input autoFocus placeholder="Buscar por código ou nome…"
                value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <div className="pcf-lote-lista">
              {materiais.length === 0 && (
                <div className="pcf-busca-vazio">
                  {semMateriais
                    ? 'Nenhum material cadastrado no almoxarifado ainda.'
                    : 'Nenhum material encontrado com esse termo.'}
                </div>
              )}
              {materiais.map((m) => {
                const marcado = lote.selecionados[m.id] !== undefined;
                return (
                  <div key={m.id} className={`pcf-lote-item${marcado ? ' pcf-lote-marcado' : ''}`}>
                    <button type="button" className="pcf-lote-check" onClick={() => marcarNoLote(m)}>
                      {marcado ? <FiCheck /> : <FiPlus />}
                    </button>
                    <button type="button" className="pcf-lote-nome" onClick={() => marcarNoLote(m)}>
                      <strong>{m.codigo}</strong> {m.nome}
                      <small>{m.unidade}{m.ncm ? ` · NCM ${m.ncm}` : ''}
                        {m.custo_unitario ? ` · último custo ${moedaUnit(m.custo_unitario)}` : ''}</small>
                    </button>
                    {marcado && (
                      <input className="pcf-lote-qtd" type="number" min="1" step="any"
                        aria-label={`Quantidade de ${m.codigo}`}
                        value={lote.selecionados[m.id]}
                        onChange={(e) => qtdNoLote(m.id, e.target.value)} />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="pcf-modal-rodape">
              <span>
                {marcadosNoLote === 0 ? 'Nenhum item marcado'
                  : `${marcadosNoLote} ${marcadosNoLote === 1 ? 'item marcado' : 'itens marcados'}`}
              </span>
              <button type="button" className="pcf-salvar" disabled={marcadosNoLote === 0}
                onClick={confirmarLote}>
                <FiPlus /> Adicionar ao pedido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── escolher UM material ────────────────────────────────── */}
      {buscaLinha !== null && (
        <div className="pcf-modal-overlay" onClick={() => setBuscaLinha(null)}>
          <div className="pcf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pcf-modal-topo">
              <h3>Escolher material — item {buscaLinha + 1}</h3>
              <button type="button" onClick={() => setBuscaLinha(null)}>✕</button>
            </div>
            <div className="pcf-modal-busca">
              <FiSearch />
              <input autoFocus placeholder="Buscar por código ou nome…"
                value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <div className="pcf-busca-lista">
              {materiais.length === 0 && (
                <div className="pcf-busca-vazio">
                  {semMateriais
                    ? 'Nenhum material cadastrado no almoxarifado ainda.'
                    : 'Nenhum material encontrado com esse termo.'}
                </div>
              )}
              {materiais.map((m) => (
                <button type="button" key={m.id} className="pcf-busca-item"
                  onClick={() => escolherMaterial(buscaLinha, m)}>
                  <strong>{m.codigo}</strong> {m.nome}
                  <small>{m.unidade}{m.ncm ? ` · NCM ${m.ncm}` : ''}
                    {m.custo_unitario ? ` · último custo ${moedaUnit(m.custo_unitario)}` : ''}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {escolhendoFornecedor && (
        <div className="pcf-modal-overlay" onClick={() => setEscolhendoFornecedor(false)}>
          <div className="pcf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pcf-modal-topo">
              <h3>Escolher fornecedor</h3>
              <button type="button" onClick={() => setEscolhendoFornecedor(false)}>✕</button>
            </div>
            {fornecedores.length > 8 && (
              <div className="pcf-modal-busca">
                <FiSearch />
                <input autoFocus placeholder="Buscar por nome ou CNPJ…"
                  value={buscaForn} onChange={(e) => setBuscaForn(e.target.value)} />
              </div>
            )}
            <div className="pcf-busca-lista">
              {fornecedoresFiltrados.length === 0 && (
                <div className="pcf-busca-vazio">Nenhum fornecedor ativo encontrado.</div>
              )}
              {fornecedoresFiltrados.map((f) => (
                <button type="button" key={f.id} className="pcf-busca-item"
                  onClick={() => escolherFornecedor(f)}>
                  <strong>{f.razao_social}</strong>
                  <small>{[f.cnpj, f.cidade, f.estado].filter(Boolean).join(' · ')}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PedidoCompraForm;
