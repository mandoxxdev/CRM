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
 * Sem a coação daqui, a suíte de API ficaria verde e **todo submit real** tomaria 400. As quatro
 * chaves coagidas: `fornecedor_id`, `material_id`, `quantidade`, `valor_unitario` (e
 * `solicitacao_id`, quando vem por query).
 *
 * ⚠️ O QUE O PAYLOAD **NÃO** LEVA, e é decisão, não esquecimento:
 * - `numero`: é gerado pelo servidor (`inserirComNumeroUnico(db, 'PC', …)`). A tela não tem campo
 *   de número; ela **diz** que o número é gerado.
 * - `valor_total`: é derivado da soma das linhas pelo próprio serviço (RN-C04). O total mostrado
 *   aqui é informação para quem preenche, não dado de entrada.
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
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { FiArrowLeft, FiPlus, FiSave, FiSearch, FiTrash2, FiUpload } from 'react-icons/fi';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { formatarErroPermissao } from '../../utils/permissaoErro';
import '../Compras.css';

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

const formatCurrency = (valor) => new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL',
}).format(Number(valor) || 0);

const hojeISO = () => new Date().toISOString().slice(0, 10);

// Mensagem de erro do servidor, com o 403 de perfil já rotulado por `permissaoErro` (o mesmo
// utilitário que o almoxarifado usa): o 403 condicional do vínculo de solicitação (fix 1 da Task 2)
// responde `{ error, acao, perfil }`, e mostrar só o `error` esconderia QUAL permissão falta.
function mensagemDeErro(erro, fallback) {
  const data = erro?.response?.data;
  return formatarErroPermissao(data) || data?.error || fallback;
}

let sequenciaLinha = 0;
const novaLinha = (dados) => ({ chave: `linha-${(sequenciaLinha += 1)}`, ...dados });

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

  useEffect(() => {
    let vivo = true;
    api.get('/compras/fornecedores')
      .then((res) => { if (vivo) setFornecedores(res.data || []); })
      .catch(() => { if (vivo) setErro('Não foi possível carregar os fornecedores.'); });
    return () => { vivo = false; };
  }, []);

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
        setItens((p.itens || []).map((item) => novaLinha({
          material_id: item.material_id,
          codigo: item.codigo || '',
          descricao: item.descricao || '',
          unidade: item.unidade || 'UN',
          quantidade: String(item.quantidade ?? ''),
          valor_unitario: String(item.valor_unitario ?? ''),
        })));
      })
      .catch((e) => { if (vivo) setErro(mensagemDeErro(e, 'Não foi possível carregar o pedido.')); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
    // `params` fora das dependências de propósito: a pré-carga por query é da MONTAGEM, e
    // reexecutá-la a cada troca de query apagaria o que o comprador já digitou.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setErro('');
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
      itens: itens.map((it) => ({
        material_id: Number(it.material_id),
        quantidade: Number(it.quantidade),
        valor_unitario: Number(it.valor_unitario) || 0,
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
      let linhas;
      try {
        const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        linhas = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      } catch (err) {
        setErro('Erro ao ler arquivo. Use Excel (.xlsx, .xls) ou CSV.');
        setImportando(false);
        input.value = '';
        return;
      }
      if (!linhas.length) {
        setErro('A planilha não tem nenhuma linha de dados.');
        setImportando(false);
        input.value = '';
        return;
      }
      api.post('/compras/pedidos/importar', { linhas })
        .then((res) => {
          setResultadoImportacao(res.data || {});
          toast.success(`${(res.data?.pedidos || []).length} pedido(s) importado(s)`);
        })
        .catch((err) => {
          setErro(mensagemDeErro(err, 'Não foi possível importar a planilha.'));
        })
        .finally(() => { setImportando(false); input.value = ''; });
    };
    reader.readAsArrayBuffer(arquivo);
  };

  return (
    <div className="compras">
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

      {resultadoImportacao && (
        <div
          data-testid="resultado-importacao"
          style={{
            background: 'rgba(46, 204, 113, 0.10)', border: '1px solid #2ecc71',
            borderRadius: 8, padding: '10px 14px', marginBottom: 16,
          }}
        >
          <strong>Importação concluída</strong>
          <p>
            {(resultadoImportacao.pedidos || []).length} pedidos criados,{' '}
            {resultadoImportacao.itens || 0} itens.
          </p>
          <ul>
            {(resultadoImportacao.pedidos || []).map((p) => (
              <li key={p.id}>{p.numero} — {p.itens} itens</li>
            ))}
          </ul>
          {(resultadoImportacao.ignorados || []).length > 0 ? (
            <>
              <strong>Linhas ignoradas</strong>
              <ul>
                {resultadoImportacao.ignorados.map((ig, i) => (
                  <li key={`${ig.linha}-${i}`}>Linha {ig.linha}: {ig.motivo}</li>
                ))}
              </ul>
            </>
          ) : (
            <p>Nenhuma linha ignorada.</p>
          )}
        </div>
      )}

      {carregando ? (
        <div className="loading"><p>Carregando pedido...</p></div>
      ) : (
        <form data-testid="form-pedido-compra" onSubmit={handleSubmit} className="module-content">
          <div className="filters" style={{ flexWrap: 'wrap', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              Fornecedor
              <select
                data-testid="pedido-fornecedor"
                value={fornecedorId}
                onChange={(ev) => setFornecedorId(ev.target.value)}
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
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              Previsão de entrega
              <input
                data-testid="pedido-previsao"
                type="date"
                value={previsaoEntrega}
                onChange={(ev) => setPrevisaoEntrega(ev.target.value)}
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

          <label style={{ display: 'block', margin: '12px 0' }}>
            Observações
            <textarea
              data-testid="pedido-observacoes"
              value={observacoes}
              onChange={(ev) => setObservacoes(ev.target.value)}
              rows={2}
              style={{ width: '100%' }}
            />
          </label>

          <h2>Itens do pedido</h2>
          <div className="filters" style={{ gap: 8 }}>
            <div className="search-box">
              <FiSearch />
              <input
                data-testid="busca-material"
                type="text"
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
              disabled={buscando}
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
                    <td>
                      <input
                        data-testid={`qtd-item-${it.material_id}`}
                        type="number"
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
                        min="0"
                        step="any"
                        value={it.valor_unitario}
                        onChange={(ev) => alterarItem(it.chave, 'valor_unitario', ev.target.value)}
                        style={{ width: 110 }}
                      />
                    </td>
                    <td>{formatCurrency((Number(it.quantidade) || 0) * (Number(it.valor_unitario) || 0))}</td>
                    <td>
                      <button
                        data-testid={`remover-item-${it.material_id}`}
                        type="button"
                        className="btn-icon btn-danger"
                        title="Remover item"
                        onClick={() => removerItem(it.chave)}
                      >
                        <FiTrash2 />
                      </button>
                    </td>
                  </tr>
                ))}
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

          <p><strong>Total: {formatCurrency(total)}</strong></p>

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
