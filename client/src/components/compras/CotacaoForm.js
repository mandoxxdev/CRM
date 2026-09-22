/**
 * Etapa 40, Task 5 — criacao e edicao de COTACAO (`/compras/cotacoes/nova`, `/compras/cotacoes/editar/:id`).
 * Cabecalho + itens desde a 41 (D2/D3/D10): numero DIGITADO (e o numero do documento do
 * fornecedor), fornecedor, datas, valor total, status, observacoes e as LINHAS de material.
 * Molde: `PedidoCompraForm.js` — `Number()` antes do POST (o Zod do servidor nao coage), `hojeISO`
 * LOCAL (RN-D03 da Etapa 39), erro em `role="alert"`, toast so no sucesso.
 *
 * D3 — `valor_total` tem DUAS regras, e a tela espelha o servidor: com itens o total e DERIVADO
 * (soma das linhas; o campo fica `readOnly` mostrando a soma e o payload NAO leva `valor_total`);
 * sem itens e ENTRADA (o campo e digitavel e viaja no payload, como na 40). `itens` viaja sempre,
 * mesmo `[]` — no PUT, `[]` apaga as linhas (RN-F05).
 * D10 — o bloco de itens e copia do `PedidoCompraForm` (busca por `GET /compras/materiais?search=`,
 * tabela de linhas), com `data-testid` prefixados `cotacao-` e SEM `min="0"` nas linhas (F4 da 40).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FiArrowLeft, FiPlus, FiSave, FiSearch, FiTrash2 } from 'react-icons/fi';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { formatarErroPermissao } from '../../utils/permissaoErro';
import '../Compras.css';

// O vocabulario de `STATUS_COTACAO` do servidor, na mesma ordem; rotulos iguais aos do filtro da aba.
export const STATUS_COTACAO = [
  { valor: 'em_analise', label: 'Em Análise' },
  { valor: 'aprovado', label: 'Aprovado' },
  { valor: 'rejeitado', label: 'Rejeitado' },
  { valor: 'cancelado', label: 'Cancelado' },
];

// Data LOCAL, nunca `toISOString()` (UTC): das 21h a meia-noite no fuso do Brasil a cotacao
// nasceria com a data de AMANHA. Copia de `PedidoCompraForm.js` (RN-D03 da Etapa 39).
const hojeISO = () => {
  const agora = new Date();
  return [agora.getFullYear(), String(agora.getMonth() + 1).padStart(2, '0'), String(agora.getDate()).padStart(2, '0')].join('-');
};
function mensagemDeErro(erro, fallback) {
  const data = erro?.response?.data;
  return formatarErroPermissao(data) || data?.error || fallback;
}

const formatCurrency = (valor) => new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL',
}).format(Number(valor) || 0);

// Copia de `PedidoCompraForm.js`: a chave da linha e local (o mesmo material pode aparecer duas
// vezes; o servidor decide). Preco vazio e aceito — o aviso abaixo diz o que deixa de acontecer.
let sequenciaLinha = 0;
const novaLinha = (dados) => ({ chave: `linha-${(sequenciaLinha += 1)}`, ...dados });
const LITERAL_AVISO_PRECO = 'Item sem preço entra na cotação com valor unitário 0.';

const CotacaoForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const edicao = Boolean(id);
  const [fornecedores, setFornecedores] = useState([]);
  const [numero, setNumero] = useState('');
  const [fornecedorId, setFornecedorId] = useState('');
  const [dataCotacao, setDataCotacao] = useState(hojeISO());
  const [validade, setValidade] = useState('');
  const [valorTotal, setValorTotal] = useState('');
  const [status, setStatus] = useState('em_analise');
  const [observacoes, setObservacoes] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(edicao);
  const [salvando, setSalvando] = useState(false);
  // Etapa 41 (D10): as linhas e a busca de material, como no pedido.
  const [itens, setItens] = useState([]);
  const [termoMaterial, setTermoMaterial] = useState('');
  const [materiais, setMateriais] = useState([]);
  const [buscando, setBuscando] = useState(false);
  // Onda de correcao da 41 (F5, UX I1): a cotacao que JA virou pedido abre travada. O GET /:id ja
  // traz `pedido_id`/`pedido_numero` (RN-F04); antes a tela os ignorava e o comprador so descobria
  // no 409 do Salvar, com o formulario inteiro editado e perdido. Molde: `soStatus` do pedido.
  const [convertida, setConvertida] = useState(false);
  const [pedidoGerado, setPedidoGerado] = useState({ id: null, numero: '' });

  useEffect(() => {
    let vivo = true;
    api.get('/compras/fornecedores')
      .then((res) => { if (vivo) setFornecedores(res.data || []); })
      .catch(() => { if (vivo) setErro('Não foi possível carregar os fornecedores.'); });
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    if (!edicao) return undefined;
    let vivo = true;
    api.get(`/compras/cotacoes/${id}`)
      .then((res) => {
        if (!vivo) return;
        const c = res.data || {};
        setNumero(c.numero || '');
        setFornecedorId(c.fornecedor_id == null ? '' : String(c.fornecedor_id));
        setDataCotacao((c.data_cotacao || '').slice(0, 10));
        setValidade((c.validade || '').slice(0, 10));
        setValorTotal(c.valor_total == null ? '' : String(c.valor_total));
        setStatus(c.status || 'em_analise');
        setObservacoes(c.observacoes || '');
        // F5: `pedido_id` preenchido = ja virou pedido (RN-F10); a tela trava e aponta para ele.
        setConvertida(c.pedido_id != null);
        setPedidoGerado({ id: c.pedido_id ?? null, numero: c.pedido_numero || '' });
        // RN-F13: a edicao pre-carrega as linhas do GET /:id (codigo/descricao/unidade vem do JOIN
        // do servidor, RN-F04) — nenhuma busca de material e disparada.
        setItens((c.itens || []).map((it) => novaLinha({
          material_id: it.material_id,
          codigo: it.codigo || '',
          descricao: it.descricao || '',
          unidade: it.unidade || 'UN',
          quantidade: String(it.quantidade ?? ''),
          valor_unitario: String(it.valor_unitario ?? ''),
        })));
      })
      .catch((e) => { if (vivo) setErro(mensagemDeErro(e, 'Não foi possível carregar a cotação.')); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [id, edicao]);

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
    })]);
  };
  const alterarItem = (chave, campo, valor) => {
    setItens((atuais) => atuais.map((it) => (it.chave === chave ? { ...it, [campo]: valor } : it)));
  };
  const removerItem = (chave) => setItens((atuais) => atuais.filter((it) => it.chave !== chave));

  const total = useMemo(
    () => itens.reduce((soma, it) => soma + (Number(it.quantidade) || 0) * (Number(it.valor_unitario) || 0), 0),
    [itens],
  );
  const temItemSemPreco = itens.some((it) => !(Number(it.valor_unitario) > 0));

  const handleSubmit = async (e) => {
    e.preventDefault();
    // F5: sem botao Salvar a tela nao submete, mas Enter num campo ainda dispara o evento.
    if (convertida) return;
    setErro('');
    if (!numero.trim()) { setErro('Número da cotação é obrigatório'); return; }
    if (!fornecedorId) { setErro('Fornecedor da cotação é obrigatório'); return; }
    // `Number()` em tudo que e numero: o Zod do servidor nao coage e `<input>` devolve string.
    const payload = {
      numero: numero.trim(),
      fornecedor_id: Number(fornecedorId),
      data_cotacao: dataCotacao,
      validade,
      status,
      observacoes,
      itens: itens.map((it) => ({
        material_id: Number(it.material_id),
        quantidade: Number(it.quantidade),
        valor_unitario: Number(it.valor_unitario) || 0,
      })),
    };
    // D3: duas regras, a tela espelha o servidor — com itens o total e derivado la (o payload seria
    // ignorado); sem itens, o digitado viaja.
    if (itens.length === 0) payload.valor_total = Number(valorTotal) || 0;
    setSalvando(true);
    try {
      if (edicao) await api.put(`/compras/cotacoes/${id}`, payload);
      else await api.post('/compras/cotacoes', payload);
      toast.success('Cotação salva');
      navigate('/compras/cotacoes');
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível salvar a cotação.'));
    } finally {
      setSalvando(false);
    }
  };

  const coluna = { display: 'flex', flexDirection: 'column', gap: 4 };
  return (
    <div className="compras">
      <div className="page-header">
        <div>
          <Link to="/compras/cotacoes" className="btn-secondary" style={{ marginBottom: 8, display: 'inline-flex' }}>
            <FiArrowLeft /> Voltar para cotações
          </Link>
          <h1>{edicao ? 'Editar cotação' : 'Nova cotação'}</h1>
          <p>O número é o do documento do fornecedor e tem de ser único.</p>
        </div>
      </div>
      {erro && (
        <div role="alert" style={{ background: 'rgba(231, 76, 60, 0.12)', color: '#c0392b', border: '1px solid #e74c3c', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
          {erro}
        </div>
      )}
      {carregando ? <div className="loading">Carregando...</div> : (
        <form data-testid="cotacao-form" onSubmit={handleSubmit}>
          {/* F5 (UX I1): `role="status"`, nao `role="alert"` — e informativa, nao erro, e as suites
              medem erro por `[role="alert"]`. A literal e a mesma ideia do 409 do servidor
              (`cotacaoJaGerouPedido`), com o link para o pedido no lugar do numero da cotacao. */}
          {convertida && (
            <div
              role="status"
              data-testid="cotacao-convertida"
              style={{ background: 'rgba(185, 119, 14, 0.12)', color: '#b9770e', border: '1px solid #b9770e', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}
            >
              Esta cotação já gerou o pedido{' '}
              <Link to={`/compras/pedidos/editar/${pedidoGerado.id}`}>{pedidoGerado.numero || `#${pedidoGerado.id}`}</Link>
              {' '}— não pode mais ser editada
            </div>
          )}
          <div className="filters" style={{ flexWrap: 'wrap', gap: 12 }}>
            <label style={coluna}>Número *<input data-testid="cotacao-numero" type="text" value={numero} onChange={(ev) => setNumero(ev.target.value)} disabled={convertida} /></label>
            <label style={coluna}>Fornecedor *
              <select data-testid="cotacao-fornecedor" value={fornecedorId} onChange={(ev) => setFornecedorId(ev.target.value)} disabled={convertida} className="filter-select">
                <option value="">Selecione o fornecedor</option>
                {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.razao_social}</option>)}
              </select>
            </label>
            <label style={coluna}>Data<input data-testid="cotacao-data" type="date" value={dataCotacao} onChange={(ev) => setDataCotacao(ev.target.value)} disabled={convertida} /></label>
            <label style={coluna}>Validade<input data-testid="cotacao-validade" type="date" value={validade} onChange={(ev) => setValidade(ev.target.value)} disabled={convertida} /></label>
            {/* Sem `min`: o servidor decide (D3/D11) e a literal do 400 chega ao role="alert";
                com `min="0"` o navegador barrava o submit com tooltip nativa (UX M2).
                Etapa 41 (D3): com linhas o campo trava e mostra a soma; o `onChange` segue setando
                so `valorTotal` — `readOnly` impede que dispare, e o digitado volta ao remover. */}
            <label style={coluna}>Valor total
              <input
                data-testid="cotacao-valor"
                type="number"
                step="0.01"
                readOnly={itens.length > 0}
                disabled={convertida}
                value={itens.length > 0 ? String(total) : valorTotal}
                onChange={(ev) => setValorTotal(ev.target.value)}
                style={itens.length > 0 ? { background: '#f0f0f0' } : undefined}
              />
            </label>
            <label style={coluna}>Status
              <select data-testid="cotacao-status" value={status} onChange={(ev) => setStatus(ev.target.value)} disabled={convertida} className="filter-select">
                {STATUS_COTACAO.map((s) => <option key={s.valor} value={s.valor}>{s.label}</option>)}
              </select>
            </label>
          </div>
          <label style={{ display: 'block', margin: '12px 0' }}>Observações
            <textarea data-testid="cotacao-observacoes" value={observacoes} onChange={(ev) => setObservacoes(ev.target.value)} disabled={convertida} rows={2} style={{ width: '100%' }} />
          </label>

          {/* Etapa 41 (D10): bloco de itens copiado de `PedidoCompraForm.js`, testids `cotacao-`. */}
          <h2>Itens da cotação</h2>
          <div className="filters" style={{ gap: 8 }}>
            <div className="search-box">
              <FiSearch />
              <input
                data-testid="cotacao-busca-material"
                type="text"
                placeholder="Buscar material por código ou descrição..."
                value={termoMaterial}
                onChange={(ev) => setTermoMaterial(ev.target.value)}
                disabled={convertida}
                onKeyDown={(ev) => {
                  // Enter no campo busca, e NÃO submete a cotação: um `type="submit"` implícito
                  // aqui gravaria a cotação no primeiro Enter da busca de material.
                  if (ev.key === 'Enter') { ev.preventDefault(); buscarMateriais(); }
                }}
              />
            </div>
            {/* A busca é ato do usuário, não da digitação: a porta tem LIMIT 50 e um GET por tecla
                seria uma consulta por caractere. */}
            <button
              data-testid="cotacao-botao-buscar-material"
              type="button"
              className="btn-secondary"
              onClick={buscarMateriais}
              disabled={buscando || convertida}
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
                          data-testid={`cotacao-adicionar-material-${m.id}`}
                          type="button"
                          className="btn-icon"
                          title="Adicionar à cotação"
                          onClick={() => adicionarMaterial(m)}
                          disabled={convertida}
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

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Código</th><th>Descrição</th><th>Unidade</th>
                  <th>Quantidade</th><th>Valor unitário</th><th>Subtotal</th><th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {itens.length === 0 ? (
                  <tr><td colSpan="7" className="no-data">Nenhum item adicionado</td></tr>
                ) : itens.map((it) => (
                  <tr key={it.chave}>
                    <td>{it.codigo || '-'}</td>
                    <td>{it.descricao || '-'}</td>
                    <td>{it.unidade}</td>
                    {/* Sem `min="0"` nas linhas (F4 da 40): o servidor decide e a literal do 400
                        (`… do item da cotação …`) chega ao role="alert". */}
                    <td>
                      <input
                        data-testid={`cotacao-qtd-item-${it.material_id}`}
                        type="number"
                        step="any"
                        value={it.quantidade}
                        onChange={(ev) => alterarItem(it.chave, 'quantidade', ev.target.value)}
                        disabled={convertida}
                        style={{ width: 90 }}
                      />
                    </td>
                    <td>
                      <input
                        data-testid={`cotacao-valor-item-${it.material_id}`}
                        type="number"
                        step="any"
                        value={it.valor_unitario}
                        onChange={(ev) => alterarItem(it.chave, 'valor_unitario', ev.target.value)}
                        disabled={convertida}
                        style={{ width: 110 }}
                      />
                    </td>
                    <td>{formatCurrency((Number(it.quantidade) || 0) * (Number(it.valor_unitario) || 0))}</td>
                    <td>
                      <button
                        data-testid={`cotacao-remover-item-${it.material_id}`}
                        type="button"
                        className="btn-icon btn-danger"
                        title="Remover item"
                        onClick={() => removerItem(it.chave)}
                        disabled={convertida}
                      >
                        <FiTrash2 />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {temItemSemPreco && itens.length > 0 && (
            <p style={{ color: '#b9770e' }}>{LITERAL_AVISO_PRECO}</p>
          )}

          <p><strong>Total: {formatCurrency(total)}</strong></p>

          {/* F5: convertida nao tem Salvar (nem travado) — nao ha o que salvar; o `handleSubmit`
              ainda sai cedo para o Enter num campo. */}
          {!convertida && (
            <div className="header-actions">
              <button type="submit" className="btn-premium" disabled={salvando}><FiSave /> {salvando ? 'Salvando...' : 'Salvar cotação'}</button>
            </div>
          )}
        </form>
      )}
    </div>
  );
};

export default CotacaoForm;
