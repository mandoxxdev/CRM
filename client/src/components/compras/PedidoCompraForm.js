import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../../services/api';
import { FiPlus, FiTrash2, FiSearch, FiArrowLeft, FiSave } from 'react-icons/fi';
import './PedidoCompraForm.css';

/**
 * Formulário do pedido de compra (Etapa 32 / G1).
 *
 * Antes disto o botão "Novo Pedido" apontava para `/compras/pedidos/novo`, que NÃO tinha rota:
 * caía no `path="*"` do App.js e só re-renderizava a mesma lista — clicar não fazia nada.
 *
 * Duas regras do módulo aparecem como código aqui:
 *
 *  - **A conta não é feita neste arquivo.** Os totais vêm de `POST /compras/pedidos/calcular`,
 *    que roda o mesmo `pedidoTotais` do que grava. Somar aqui seria uma segunda implementação
 *    da RN-03/04/05 — e o usuário veria um total na tela e outro depois de salvar.
 *  - **Material vem de `/compras/pedidos-aux/materiais`**, não de `/almoxarifado/materiais`:
 *    aquele prefixo é guardado por `checkModulePermission('almoxarifado')` e o comprador
 *    tomaria 403.
 */

const LINHA_VAZIA = {
  material_id: '', material_nome: '', codigo: '', descricao: '', ncm: '',
  quantidade: 1, unidade: 'UN', valor_unitario: '', ipi_percentual: '',
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

const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// O unitário guarda até 4 casas (RN-12: o ERP de origem armazena 4 e imprime 3). Cortar em 2
// aqui faria a tela divergir da nota fiscal do fornecedor.
const moedaUnit = (v) => Number(v || 0).toLocaleString('pt-BR', {
  style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4,
});

const PedidoCompraForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const editando = !!id;

  const [cab, setCab] = useState(CABECALHO_VAZIO);
  const [itens, setItens] = useState([{ ...LINHA_VAZIA }]);
  const [fornecedores, setFornecedores] = useState([]);
  const [totais, setTotais] = useState(TOTAIS_ZERO);
  const [linhas, setLinhas] = useState([]);
  const [carregando, setCarregando] = useState(editando);
  const [salvando, setSalvando] = useState(false);

  // Busca de material por linha: qual linha está com o campo aberto e o que já veio
  const [buscaLinha, setBuscaLinha] = useState(null);
  const [busca, setBusca] = useState('');
  const [materiais, setMateriais] = useState([]);

  const setCampo = (campo, valor) => setCab((c) => ({ ...c, [campo]: valor }));

  /* ── carga inicial ──────────────────────────────────────────────── */
  useEffect(() => {
    api.get('/compras/fornecedores', { params: { status: 'ativo' } })
      .then((r) => setFornecedores(r.data || []))
      .catch(() => toast.error('Não foi possível carregar os fornecedores'));
  }, []);

  useEffect(() => {
    if (!editando) return;
    api.get(`/compras/pedidos/${id}`)
      .then((r) => {
        const p = r.data;
        setCab({
          ...CABECALHO_VAZIO,
          ...Object.fromEntries(Object.keys(CABECALHO_VAZIO)
            .map((k) => [k, p[k] != null ? p[k] : CABECALHO_VAZIO[k]])),
          fornecedor_id: p.fornecedor_id || '',
        });
        setItens((p.itens || []).map((i) => ({
          ...LINHA_VAZIA,
          ...i,
          material_nome: i.material_nome || i.descricao || '',
          valor_unitario: i.valor_unitario ?? '',
          ipi_percentual: i.ipi_percentual ?? '',
          data_entrega: i.data_entrega || '',
        })));
      })
      .catch((e) => {
        toast.error(e.response?.data?.error || 'Pedido não encontrado');
        navigate('/compras/pedidos');
      })
      .finally(() => setCarregando(false));
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
    const comValor = its.filter((i) => i.quantidade !== '' && i.valor_unitario !== '');
    if (comValor.length === 0) {
      setTotais({ ...TOTAIS_ZERO,
        valor_frete: Number(c.valor_frete) || 0,
        total_icms_st: Number(c.total_icms_st) || 0,
        total_desconto: Number(c.total_desconto) || 0 });
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
  const mudarItem = (idx, campo, valor) => {
    setItens((lista) => lista.map((it, i) => (i === idx ? { ...it, [campo]: valor } : it)));
  };

  const escolherMaterial = (idx, m) => {
    setItens((lista) => lista.map((it, i) => (i === idx ? {
      ...it,
      material_id: m.id,
      material_nome: m.nome,
      codigo: it.codigo || m.codigo || '',
      descricao: it.descricao || m.nome || '',
      unidade: m.unidade || it.unidade,
      ncm: it.ncm || m.ncm || '',
      valor_unitario: it.valor_unitario !== '' ? it.valor_unitario : (m.custo_unitario || ''),
    } : it)));
    setBuscaLinha(null);
    setBusca('');
  };

  const adicionarLinha = () => setItens((l) => [...l, { ...LINHA_VAZIA }]);
  const removerLinha = (idx) => setItens((l) => (l.length === 1 ? l : l.filter((_, i) => i !== idx)));

  /* ── salvar ─────────────────────────────────────────────────────── */
  const salvar = async (e) => {
    e.preventDefault();

    // As mesmas recusas do servidor, ditas antes do round-trip. O servidor continua sendo a
    // autoridade — isto é conveniência, não validação.
    if (!cab.numero.trim()) return toast.error('Informe o número do pedido');
    if (!cab.fornecedor_id) return toast.error('Selecione o fornecedor');
    if (itens.some((i) => !i.material_id)) {
      return toast.error('Todo item precisa de um material do cadastro');
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

  if (carregando) return <div className="pcf-carregando">Carregando pedido…</div>;

  const fornecedorSel = fornecedores.find((f) => String(f.id) === String(cab.fornecedor_id));

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

        {/* ── cabeçalho ─────────────────────────────────────────── */}
        <section className="pcf-bloco">
          <h2>Dados do pedido</h2>
          <div className="pcf-grid">
            <label className="pcf-campo">
              <span>Número do pedido *</span>
              <input value={cab.numero} onChange={(e) => setCampo('numero', e.target.value)}
                placeholder="28433" required />
            </label>
            <label className="pcf-campo pcf-campo-2">
              <span>Fornecedor *</span>
              <select value={cab.fornecedor_id}
                onChange={(e) => setCampo('fornecedor_id', e.target.value)} required>
                <option value="">Selecione…</option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.razao_social}{f.cnpj ? ` — ${f.cnpj}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="pcf-campo">
              <span>Status</span>
              <select value={cab.status} onChange={(e) => setCampo('status', e.target.value)}>
                <option value="pendente">Pendente</option>
                <option value="aprovado">Aprovado</option>
                <option value="finalizado">Finalizado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </label>
            <label className="pcf-campo">
              <span>Data do pedido</span>
              <input type="date" value={cab.data_pedido}
                onChange={(e) => setCampo('data_pedido', e.target.value)} />
            </label>
            <label className="pcf-campo">
              <span>Previsão de entrega</span>
              <input type="date" value={cab.previsao_entrega}
                onChange={(e) => setCampo('previsao_entrega', e.target.value)} />
            </label>
            <label className="pcf-campo">
              <span>Condição de pagamento</span>
              <input value={cab.condicao_pagamento}
                onChange={(e) => setCampo('condicao_pagamento', e.target.value)}
                placeholder="28 D.D.L." />
            </label>
            <label className="pcf-campo">
              <span>Contato</span>
              <input value={cab.contato} onChange={(e) => setCampo('contato', e.target.value)} />
            </label>
          </div>

          {fornecedorSel && (
            <div className="pcf-forn-resumo">
              <strong>{fornecedorSel.razao_social}</strong>
              <span>
                {[fornecedorSel.cnpj, fornecedorSel.cidade, fornecedorSel.estado,
                  fornecedorSel.telefone].filter(Boolean).join(' · ')}
              </span>
            </div>
          )}
        </section>

        {/* ── transporte ────────────────────────────────────────── */}
        <section className="pcf-bloco">
          <h2>Transporte e entrega</h2>
          <div className="pcf-grid">
            <label className="pcf-campo pcf-campo-2">
              <span>Modalidade do frete</span>
              <input value={cab.frete_modalidade}
                onChange={(e) => setCampo('frete_modalidade', e.target.value)}
                placeholder="2-Contratação do Frete por conta de Terceiros" />
            </label>
            <label className="pcf-campo">
              <span>Via de transporte</span>
              <input value={cab.via_transporte}
                onChange={(e) => setCampo('via_transporte', e.target.value)} placeholder="Rodoviário" />
            </label>
            <label className="pcf-campo">
              <span>Transportadora</span>
              <input value={cab.transportadora}
                onChange={(e) => setCampo('transportadora', e.target.value)} />
            </label>
            <label className="pcf-campo">
              <span>Telefone da transportadora</span>
              <input value={cab.transportadora_telefone}
                onChange={(e) => setCampo('transportadora_telefone', e.target.value)} />
            </label>
            <label className="pcf-campo">
              <span>Tabela de preço</span>
              <input value={cab.tabela_preco}
                onChange={(e) => setCampo('tabela_preco', e.target.value)} />
            </label>
            <label className="pcf-campo pcf-campo-full">
              <span>Local de entrega</span>
              <input value={cab.local_entrega}
                onChange={(e) => setCampo('local_entrega', e.target.value)} />
            </label>
            <label className="pcf-campo pcf-campo-full">
              <span>Local de cobrança</span>
              <input value={cab.local_cobranca}
                onChange={(e) => setCampo('local_cobranca', e.target.value)} />
            </label>
          </div>
        </section>

        {/* ── itens ─────────────────────────────────────────────── */}
        <section className="pcf-bloco">
          <div className="pcf-bloco-topo">
            <h2>Itens</h2>
            <button type="button" className="pcf-add" onClick={adicionarLinha}>
              <FiPlus /> Adicionar item
            </button>
          </div>

          <div className="pcf-tabela-wrap">
            <table className="pcf-tabela">
              <thead>
                <tr>
                  <th>#</th>
                  <th className="pcf-col-mat">Material *</th>
                  <th>Código</th>
                  <th>NCM</th>
                  <th className="num">Qtd</th>
                  <th>Un</th>
                  <th className="num">Vl. unit.</th>
                  <th className="num">IPI %</th>
                  <th>Entrega</th>
                  <th className="num">Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {itens.map((it, idx) => (
                  <tr key={idx} className={!it.material_id ? 'pcf-linha-incompleta' : ''}>
                    <td>{idx + 1}</td>
                    <td className="pcf-col-mat">
                      {it.material_id ? (
                        <button type="button" className="pcf-mat-escolhido"
                          onClick={() => { setBuscaLinha(idx); setBusca(''); }}>
                          {it.material_nome || it.descricao}
                          <small>trocar</small>
                        </button>
                      ) : (
                        <button type="button" className="pcf-mat-vazio"
                          onClick={() => { setBuscaLinha(idx); setBusca(''); }}>
                          <FiSearch /> Escolher material
                        </button>
                      )}

                      <input className="pcf-desc" placeholder="Descrição no pedido"
                        value={it.descricao}
                        onChange={(e) => mudarItem(idx, 'descricao', e.target.value)} />
                    </td>
                    <td><input className="pcf-in-sm" value={it.codigo}
                      onChange={(e) => mudarItem(idx, 'codigo', e.target.value)} /></td>
                    <td><input className="pcf-in-sm" value={it.ncm}
                      onChange={(e) => mudarItem(idx, 'ncm', e.target.value)} /></td>
                    <td><input className="pcf-in-num" type="number" min="0" step="any"
                      value={it.quantidade}
                      onChange={(e) => mudarItem(idx, 'quantidade', e.target.value)} /></td>
                    <td><input className="pcf-in-un" value={it.unidade}
                      onChange={(e) => mudarItem(idx, 'unidade', e.target.value)} /></td>
                    <td><input className="pcf-in-num" type="number" min="0" step="0.0001"
                      value={it.valor_unitario}
                      onChange={(e) => mudarItem(idx, 'valor_unitario', e.target.value)} /></td>
                    <td><input className="pcf-in-num" type="number" min="0" step="0.01"
                      value={it.ipi_percentual}
                      onChange={(e) => mudarItem(idx, 'ipi_percentual', e.target.value)} /></td>
                    <td><input className="pcf-in-data" type="date" value={it.data_entrega}
                      onChange={(e) => mudarItem(idx, 'data_entrega', e.target.value)} /></td>
                    <td className="num pcf-total-linha">
                      {linhas[idx] ? moeda(linhas[idx].valor_linha) : '—'}
                    </td>
                    <td>
                      <button type="button" className="pcf-remover" title="Remover item"
                        onClick={() => removerLinha(idx)} disabled={itens.length === 1}>
                        <FiTrash2 />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {itens.some((i) => !i.material_id) && (
            <div className="pcf-aviso">
              Todo item precisa de um material do cadastro — é o vínculo que permite dar baixa
              no recebimento depois.
            </div>
          )}
        </section>

        {/* ── encargos e totais ─────────────────────────────────── */}
        <section className="pcf-bloco">
          <h2>Encargos e totais</h2>
          <div className="pcf-grid">
            <label className="pcf-campo">
              <span>Frete (R$)</span>
              <input type="number" min="0" step="0.01" value={cab.valor_frete}
                onChange={(e) => setCampo('valor_frete', e.target.value)} />
            </label>
            <label className="pcf-campo">
              <span>ICMS ST (R$)</span>
              <input type="number" min="0" step="0.01" value={cab.total_icms_st}
                onChange={(e) => setCampo('total_icms_st', e.target.value)} />
            </label>
            <label className="pcf-campo">
              <span>Desconto (R$)</span>
              <input type="number" min="0" step="0.01" value={cab.total_desconto}
                onChange={(e) => setCampo('total_desconto', e.target.value)} />
            </label>
            <label className="pcf-campo pcf-campo-full">
              <span>Observações</span>
              <textarea rows="2" value={cab.observacoes}
                onChange={(e) => setCampo('observacoes', e.target.value)} />
            </label>
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
          <div className="pcf-nota">
            Totais calculados pelo servidor, com a mesma conta que grava o pedido — cada linha é
            arredondada antes de somar. Unitário aceita até 4 casas
            {itens.some((i) => i.valor_unitario !== '' && String(i.valor_unitario).includes('.'))
              ? ` (ex.: ${moedaUnit(itens.find((i) => String(i.valor_unitario).includes('.')).valor_unitario)})`
              : ''}.
          </div>
        </section>
      </form>

      {/* O seletor mora AQUI, fora da tabela, e nao dentro da celula.
          `.pcf-tabela-wrap` tem `overflow-x: auto` para a grade de 11 colunas rolar sozinha —
          e overflow-x:auto obriga o overflow-y a virar auto tambem, entao um dropdown
          `position:absolute` dentro da celula era CORTADO pelo container (medido: 146px da
          lista ficavam fora). Em modal o problema nao existe, e ainda funciona no celular. */}
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
                <div className="pcf-busca-vazio">Nenhum material encontrado</div>
              )}
              {materiais.map((m) => (
                <button type="button" key={m.id} className="pcf-busca-item"
                  onClick={() => escolherMaterial(buscaLinha, m)}>
                  <strong>{m.codigo}</strong> {m.nome}
                  <small>{m.unidade}{m.ncm ? ` · NCM ${m.ncm}` : ''}</small>
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
