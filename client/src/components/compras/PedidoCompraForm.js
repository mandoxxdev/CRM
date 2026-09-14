import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../../services/api';
import {
  FiPlus, FiTrash2, FiSearch, FiArrowLeft, FiSave, FiEdit2, FiMinus,
  FiCheck, FiChevronDown, FiChevronUp, FiAlertTriangle,
} from 'react-icons/fi';
import './PedidoCompraForm.css';

/**
 * Formulário do pedido de compra (Etapa 32 / G1 + G1b).
 *
 * O P.O. definiu a regra desta tela em uma frase: *"todas as opções do formulário devem ser
 * botões, não quero o usuário escrevendo nada"*. Na prática isso quer dizer:
 *
 *  - Todo campo com conjunto conhecido de valores é BOTÃO (`Chips` abaixo), nunca `<input>`.
 *    As listas vêm de `/compras/pedidos-aux/opcoes`, um lugar só, e crescem com o uso.
 *  - O que sobra de digitação é o que é VALOR e não opção: quantidade (com + e −), preço
 *    unitário e os encargos. Não dá para transformar preço em botão sem inventar preço.
 *  - O número do pedido chega preenchido com a sugestão do servidor; digitar só se quiser
 *    outro.
 *  - O que quase nunca muda vive fechado em "Mais opções", porque a queixa recorrente do
 *    P.O. nas telas anteriores foi excesso de campos visíveis, não falta.
 *
 * Duas regras de módulo continuam valendo aqui, das versões anteriores:
 *  - A conta NÃO é feita neste arquivo: os totais vêm de `POST /compras/pedidos/calcular`,
 *    que roda o mesmo `pedidoTotais` que grava.
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
  { valor: 'pendente', rotulo: 'Pendente' },
  { valor: 'aprovado', rotulo: 'Aprovado' },
  { valor: 'finalizado', rotulo: 'Finalizado' },
  { valor: 'cancelado', rotulo: 'Cancelado' },
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

/** Grupo de botões de escolha única. É o controle padrão desta tela. */
const Chips = ({ label, opcoes, valor, onChange, obrigatorio, ajuda }) => (
  <div className="pcf-chips-bloco">
    <span className="pcf-chips-label">
      {label}{obrigatorio && <em> *</em>}
      {ajuda && <small>{ajuda}</small>}
    </span>
    <div className="pcf-chips">
      {opcoes.map((o) => {
        const v = typeof o === 'object' ? o.valor : o;
        const r = typeof o === 'object' ? (o.curto || o.rotulo || o.valor) : o;
        const ativo = String(valor ?? '') === String(v);
        return (
          <button type="button" key={String(v)}
            className={`pcf-chip${ativo ? ' pcf-chip-ativo' : ''}`}
            aria-pressed={ativo}
            // Reclicar no selecionado limpa: sem isto, um campo opcional escolhido por engano
            // não teria como voltar a vazio sem recarregar a tela.
            onClick={() => onChange(ativo ? '' : v)}>
            {ativo && <FiCheck />}{r}
          </button>
        );
      })}
    </div>
  </div>
);

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

  const [editandoNumero, setEditandoNumero] = useState(false);
  const [maisOpcoes, setMaisOpcoes] = useState(false);
  const [entregaOutro, setEntregaOutro] = useState(false);
  const [cobrancaOutro, setCobrancaOutro] = useState(false);

  // Modais de escolha
  const [buscaLinha, setBuscaLinha] = useState(null);
  const [busca, setBusca] = useState('');
  const [materiais, setMateriais] = useState([]);
  const [escolhendoFornecedor, setEscolhendoFornecedor] = useState(false);
  const [buscaForn, setBuscaForn] = useState('');

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
          setItens((pedido.itens || []).map((i) => ({
            ...LINHA_VAZIA, ...i,
            material_nome: i.material_nome || i.descricao || '',
            valor_unitario: i.valor_unitario ?? '',
            ipi_percentual: i.ipi_percentual ?? 0,
            data_entrega: i.data_entrega || '',
          })));
        } else {
          // Número já preenchido: o caminho normal não pede digitação nenhuma aqui.
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

  /* ── busca de material (debounce) ───────────────────────────────── */
  useEffect(() => {
    if (buscaLinha === null) return undefined;
    const t = setTimeout(() => {
      api.get('/compras/pedidos-aux/materiais', { params: { search: busca || undefined } })
        .then((r) => setMateriais(r.data || []))
        .catch(() => setMateriais([]));
    }, 250);
    return () => clearTimeout(t);
  }, [busca, buscaLinha]);

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

  /* ── grade ──────────────────────────────────────────────────────── */
  const mudarItem = (idx, campo, valor) =>
    setItens((l) => l.map((it, i) => (i === idx ? { ...it, [campo]: valor } : it)));

  const somarQtd = (idx, delta) => setItens((l) => l.map((it, i) => {
    if (i !== idx) return it;
    const atual = Number(it.quantidade) || 0;
    return { ...it, quantidade: Math.max(1, atual + delta) };
  }));

  const escolherMaterial = (idx, m) => {
    setItens((l) => l.map((it, i) => (i === idx ? {
      ...it,
      material_id: m.id,
      material_nome: m.nome,
      codigo: m.codigo || it.codigo || '',
      descricao: it.descricao || m.nome || '',
      unidade: m.unidade || it.unidade,
      ncm: m.ncm || it.ncm || '',
      valor_unitario: it.valor_unitario !== '' ? it.valor_unitario : (m.custo_unitario || ''),
    } : it)));
    setBuscaLinha(null);
    setBusca('');
  };

  const escolherFornecedor = (f) => {
    setCampo('fornecedor_id', f.id);
    setEscolhendoFornecedor(false);
    setBuscaForn('');
  };

  const adicionarLinha = () => setItens((l) => [...l, { ...LINHA_VAZIA }]);
  const removerLinha = (idx) => setItens((l) => (l.length === 1 ? l : l.filter((_, i) => i !== idx)));

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

  const enderecoEmpresa = ops.empresa?.endereco || '';
  const enderecoFornecedor = fornecedorSel
    ? [fornecedorSel.endereco, fornecedorSel.cidade, fornecedorSel.estado, fornecedorSel.cep]
      .filter(Boolean).join(' - ')
    : '';

  /** Botões de local: GMP, fornecedor, ou um endereço digitado. */
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
            <h2>2. O que está sendo comprado</h2>
            <button type="button" className="pcf-add" onClick={adicionarLinha} disabled={semMateriais}>
              <FiPlus /> Adicionar item
            </button>
          </div>

          {itens.map((it, idx) => (
            <div key={idx} className={`pcf-item${!it.material_id ? ' pcf-item-vazio' : ''}`}>
              <div className="pcf-item-topo">
                <span className="pcf-item-num">Item {idx + 1}</span>
                <button type="button" className="pcf-remover" title="Remover item"
                  onClick={() => removerLinha(idx)} disabled={itens.length === 1}>
                  <FiTrash2 />
                </button>
              </div>

              {it.material_id ? (
                <div className="pcf-mat-card">
                  <div>
                    <strong>{it.material_nome}</strong>
                    <span>
                      {it.codigo}{it.ncm ? ` · NCM ${it.ncm}` : ''}
                    </span>
                  </div>
                  <button type="button" className="pcf-trocar"
                    onClick={() => { setBuscaLinha(idx); setBusca(''); }}>Trocar</button>
                </div>
              ) : (
                <button type="button" className="pcf-escolher-grande" disabled={semMateriais}
                  onClick={() => { setBuscaLinha(idx); setBusca(''); }}>
                  <FiSearch /> Escolher material
                </button>
              )}

              <div className="pcf-item-campos">
                <div className="pcf-qtd-bloco">
                  <span className="pcf-chips-label">Quantidade</span>
                  <div className="pcf-stepper">
                    <button type="button" onClick={() => somarQtd(idx, -1)} title="Menos um">
                      <FiMinus />
                    </button>
                    <input type="number" min="0" step="any" value={it.quantidade}
                      onChange={(e) => mudarItem(idx, 'quantidade', e.target.value)} />
                    <button type="button" onClick={() => somarQtd(idx, 1)} title="Mais um">
                      <FiPlus />
                    </button>
                  </div>
                </div>

                <div className="pcf-preco-bloco">
                  <span className="pcf-chips-label">
                    Preço unitário <small>o que o fornecedor cobrou</small>
                  </span>
                  <input className="pcf-input-preco" type="number" min="0" step="0.0001"
                    placeholder="0,00" value={it.valor_unitario}
                    onChange={(e) => mudarItem(idx, 'valor_unitario', e.target.value)} />
                </div>

                <div className="pcf-linha-total">
                  <span className="pcf-chips-label">Total do item</span>
                  <strong>{linhas[idx] ? moeda(linhas[idx].valor_linha) : '—'}</strong>
                </div>
              </div>

              <Chips label="Unidade" opcoes={ops.unidades || []} valor={it.unidade}
                onChange={(v) => mudarItem(idx, 'unidade', v || 'UN')} />

              <Chips label="IPI" ajuda="em %" valor={it.ipi_percentual}
                opcoes={(ops.ipi || []).map((v) => ({ valor: v, curto: `${String(v).replace('.', ',')}%` }))}
                onChange={(v) => mudarItem(idx, 'ipi_percentual', v === '' ? 0 : v)} />

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
            </div>
          ))}
        </section>

        {/* ── 3. condições ──────────────────────────────────────── */}
        <section className="pcf-bloco">
          <h2>3. Condições</h2>

          <Chips label="Condição de pagamento" opcoes={ops.condicao_pagamento || []}
            valor={cab.condicao_pagamento}
            onChange={(v) => setCampo('condicao_pagamento', v)} />

          <Chips label="Quem paga o frete" opcoes={ops.frete_modalidade || []}
            valor={cab.frete_modalidade}
            onChange={(v) => setCampo('frete_modalidade', v)} />

          <Chips label="Via de transporte" opcoes={ops.via_transporte || []}
            valor={cab.via_transporte}
            onChange={(v) => setCampo('via_transporte', v)} />

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
            <label><span>ICMS ST (R$)</span>
              <input type="number" min="0" step="0.01" placeholder="0,00" value={cab.total_icms_st}
                onChange={(e) => setCampo('total_icms_st', e.target.value)} /></label>
            <label><span>Desconto (R$)</span>
              <input type="number" min="0" step="0.01" placeholder="0,00" value={cab.total_desconto}
                onChange={(e) => setCampo('total_desconto', e.target.value)} /></label>
          </div>

          {/* Os números abaixo vêm do servidor, do MESMO cálculo que grava. */}
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

              {(ops.transportadoras || []).length > 0 && (
                <Chips label="Transportadora" opcoes={ops.transportadoras} valor={cab.transportadora}
                  onChange={(v) => setCampo('transportadora', v)} />
              )}

              {(ops.tabelas_preco || []).length > 0 && (
                <Chips label="Tabela de preço" opcoes={ops.tabelas_preco} valor={cab.tabela_preco}
                  onChange={(v) => setCampo('tabela_preco', v)} />
              )}

              <BotoesLocal campo="local_cobranca" outro={cobrancaOutro} setOutro={setCobrancaOutro} />

              <div className="pcf-livres">
                <label><span>Transportadora (outra)</span>
                  <input value={cab.transportadora}
                    onChange={(e) => setCampo('transportadora', e.target.value)} /></label>
                <label><span>Telefone da transportadora</span>
                  <input value={cab.transportadora_telefone}
                    onChange={(e) => setCampo('transportadora_telefone', e.target.value)} /></label>
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

      {/* ── modais de escolha ───────────────────────────────────── */}
      {/* Ficam FORA do formulário e com position:fixed de propósito: na versão anterior o
          seletor era um dropdown dentro da grade, e o `overflow-x:auto` do container cortava
          146px da lista. */}
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
