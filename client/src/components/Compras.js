import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';
import { 
  FiPlus, FiSearch, FiEdit, FiTrash2, FiDownload, 
  FiShoppingCart, FiPackage, FiFileText, FiDollarSign,
  FiFilter, FiCalendar, FiTrendingUp, FiTrendingDown
} from 'react-icons/fi';
import { exportToExcel } from '../utils/exportExcel';
import { SkeletonTable } from './SkeletonLoader';
import './Compras.css';
import './Loading.css';

// Etapa 40 (RN-E16): as opcoes do filtro de status sao POR ABA. Antes o select trazia uma mistura
// (ativo/inativo/pendente/...) e a aba Cotacoes oferecia `pendente`, que nunca casa com uma
// cotacao. Fornecedores: `ativo`/`inativo`; Pedidos: `STATUS_PEDIDO_COMPRA` (as 7); Cotacoes:
// `STATUS_COTACAO` do servidor, na mesma ordem.
const OPCOES_STATUS = {
  fornecedores: [['ativo', 'Ativo'], ['inativo', 'Inativo']],
  pedidos: [['pendente', 'Pendente'], ['aprovado', 'Aprovado'], ['rejeitado', 'Rejeitado'], ['em_analise', 'Em Análise'], ['enviado', 'Enviado'], ['recebido', 'Recebido'], ['cancelado', 'Cancelado']],
  cotacoes: [['em_analise', 'Em Análise'], ['aprovado', 'Aprovado'], ['rejeitado', 'Rejeitado'], ['cancelado', 'Cancelado']],
};

const Compras = () => {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Detectar seção ativa baseada na rota
  const getActiveSection = () => {
    const path = location.pathname;
    if (path.includes('/fornecedores')) return 'fornecedores';
    if (path.includes('/pedidos')) return 'pedidos';
    if (path.includes('/cotacoes')) return 'cotacoes';
    return 'fornecedores'; // Default
  };

  const activeSection = getActiveSection();
  const [fornecedores, setFornecedores] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [cotacoes, setCotacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  // Etapa 39 (RN-D07): viaja como `params.atrasados` e entra nas dependencias do efeito que ja
  // re-dispara por `search` e `status` — um `param` a mais e uma dependencia a mais, zero
  // refatoracao (`loadData` ja passa params no mesmo `api.get`).
  const [soAtrasados, setSoAtrasados] = useState(false);
  // Onda de correcao da 41 (F4): id da cotacao cujo "Gerar pedido" esta em voo. O ESTADO trava o
  // botao (`disabled`); o REF e a guarda do handler — dois cliques no mesmo tick chegam antes do
  // re-render e o closure do estado ainda le `null`, so o ref ve o primeiro.
  const [gerandoId, setGerandoId] = useState(null);
  const gerandoRef = useRef(null);
  // Etapa 40 (RN-E16): ao trocar de aba, `<Compras/>` NAO remonta (as tres rotas renderizam o
  // mesmo elemento e o React Router v6 preserva o state). Um `filterStatus='inativo'` vindo da aba
  // Fornecedores iria em `GET /compras/cotacoes?status=inativo` (lista vazia) enquanto o select,
  // sem essa opcao, exibiria "Todos os status". Derivado no render — sem efeito, sem setState —
  // e usado NOS DOIS lugares: no `value` do select e nos `params.status` de `loadData`.
  const statusValido = (OPCOES_STATUS[activeSection] || []).some(([v]) => v === filterStatus) ? filterStatus : '';

  const tabs = [
    { id: 'fornecedores', label: 'Fornecedores', icon: FiShoppingCart },
    { id: 'pedidos', label: 'Pedidos de Compra', icon: FiPackage },
    { id: 'cotacoes', label: 'Cotações', icon: FiFileText },
  ];

  useEffect(() => {
    // Redirecionar para fornecedores se estiver na raiz
    if (location.pathname === '/compras' || location.pathname === '/compras/') {
      navigate('/compras/fornecedores', { replace: true });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    loadData();
  }, [activeSection, search, filterStatus, soAtrasados]);

  const loadData = async () => {
    setLoading(true);
    try {
      switch (activeSection) {
        case 'fornecedores':
          const fornecedoresRes = await api.get('/compras/fornecedores', {
            params: { search, status: statusValido }
          });
          setFornecedores(fornecedoresRes.data || []);
          break;
        case 'pedidos':
          // Etapa 39 (RN-D07): a chave `atrasados` so entra quando o checkbox esta marcado.
          // Manda-la sempre faria `?atrasados=0` viajar em TODA listagem — e o servidor so liga
          // o filtro com a string '1', entao seria ruido de contrato que nao faz nada.
          const pedidosRes = await api.get('/compras/pedidos', {
            params: soAtrasados
              ? { search, status: statusValido, atrasados: 1 }
              : { search, status: statusValido }
          });
          setPedidos(pedidosRes.data || []);
          break;
        case 'cotacoes':
          const cotacoesRes = await api.get('/compras/cotacoes', {
            params: { search, status: statusValido }
          });
          setCotacoes(cotacoesRes.data || []);
          break;
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  /**
   * Etapa 39 (D2, RN-D01/RN-D02) — a data e formatada A PARTIR DA STRING, sem `new Date`.
   *
   * O QUE ESTAVA ERRADO (defeito ESCAPADO da Etapa 38): esta funcao era
   * `new Date(date).toLocaleDateString('pt-BR')`. `new Date('2026-09-16')` e meia-noite **UTC** e
   * `toLocaleDateString` renderiza no fuso local, entao em America/Sao_Paulo saia **15/09/2026** —
   * o dia ANTERIOR ao que esta no banco. Valia para `Data Pedido`, `Previsao Entrega`,
   * `Cadastrado em` dos fornecedores e `Data`/`Validade` das cotacoes.
   *
   * E A METADE CARA: a EXPORTACAO usa esta MESMA funcao, e a importacao le `DD/MM/AAAA` — entao
   * exportar e reimportar o proprio Excel do CRM movia as duas datas um dia para tras. A promessa
   * do F6 da Etapa 38 (`ba6278e`) estava cumprida na estrutura e falha no valor.
   *
   * NAO troque por `new Date(str + 'T00:00:00')`: funciona, mas continua criando um `Date` para
   * nao usar nenhum campo dele — e e a forma que o proximo "simplifica" de volta para
   * `new Date(str)`. NAO use `{ timeZone: 'America/Sao_Paulo' }`: acerta hoje e finge que uma
   * data-only tem fuso.
   *
   * Valor com hora (`created_at`, `'2026-09-16 10:33:00'`) -> os 10 primeiros caracteres.
   * Valor que nao casa `AAAA-MM-DD` -> devolvido COMO VEIO, sem `new Date`.
   */
  const formatDate = (date) => {
    if (!date) return '-';
    const iso = String(date).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return String(date);
    const [ano, mes, dia] = iso.split('-');
    return `${dia}/${mes}/${ano}`;
  };

  /**
   * Etapa 39 (RN-D07) — a literal do contrato e `Atrasado há N dia(s)` **RESOLVIDA**: o
   * parenteses e notacao do contrato, nunca texto de tela. 1 -> "1 dia"; 3 -> "3 dias".
   */
  const rotuloAtraso = (dias) => `Atrasado há ${dias} ${Number(dias) === 1 ? 'dia' : 'dias'}`;

  const getStatusColor = (status) => {
    const colors = {
      'ativo': '#2ecc71',
      'inativo': '#e74c3c',
      'pendente': '#f39c12',
      'aprovado': '#2ecc71',
      'rejeitado': '#e74c3c',
      'em_analise': '#3498db',
      'enviado': '#9b59b6',
      'recebido': '#2ecc71',
      'cancelado': '#e74c3c'
    };
    return colors[status] || '#95a5a6';
  };

  const handleDelete = async (id, tipo) => {
    if (window.confirm('Tem certeza que deseja excluir este item?')) {
      try {
        await api.delete(`/compras/${tipo}/${id}`);
        toast.success('Item excluído com sucesso');
        loadData();
      } catch (error) {
        // Etapa 38, Task 5: a literal passa a ser a DO SERVIDOR.
        //
        // Este `catch` trocava QUALQUER erro por 'Erro ao excluir item', e a Etapa 38 criou a
        // recusa que isso esconde: `DELETE /api/compras/pedidos/:id` responde **409** com
        // 'Pedido de compra <numero> ja teve recebimento — nao pode ser excluido' (RN-C08). Com a
        // mensagem generica, o 409 que a regra congela ficava indistinguivel de um 500 para quem
        // clica na lixeira — o comprador tentaria de novo sem nunca saber que existe recebimento
        // vinculado. O fallback fica para o erro sem corpo (rede, 500 sem JSON).
        toast.error(error.response?.data?.error || 'Erro ao excluir item');
      }
    }
  };

  // Etapa 41 (RN-F14): a conversao e do SERVIDOR (D5) — a tela so pede e vai para a edicao do pedido
  // gerado, onde o comprador confere datas e previsao. Erro no toast: e o mesmo canal da lixeira,
  // e pela mesma razao — a literal e a do servidor (409 `Cotação X já gerou o pedido Y`, 400 sem
  // itens / fornecedor inativo); o fallback fica para o erro sem corpo (rede, 500 sem JSON).
  // Sem `window.confirm` (Fase 2, M6): a acao e reversivel — excluir o pedido LIBERA a cotacao
  // (RN-F12), entao um confirm aqui so cobraria um clique a mais de quem ja escolheu o botao.
  //
  // Onda de correcao da 41 (F4, UX C1): `gerandoId` trava o botao enquanto o POST esta em voo. Sem
  // isso, um duplo clique (ou rede lenta) disparava DOIS POSTs e o servidor, sem transacao, criava
  // dois pedidos para a mesma cotacao — um deles orfao. O `disabled` fecha o gesto na tela; o
  // `return` cedo pelo ref e a segunda trava, para o clique que chegar antes do re-render.
  const handleGerarPedido = async (cotacao) => {
    if (gerandoRef.current === cotacao.id) return;
    gerandoRef.current = cotacao.id;
    setGerandoId(cotacao.id);
    try {
      const res = await api.post(`/compras/cotacoes/${cotacao.id}/gerar-pedido`);
      toast.success(`Pedido ${res.data?.numero || ''} gerado da cotação ${cotacao.numero}`.replace('  ', ' '));
      navigate(`/compras/pedidos/editar/${res.data.id}`);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Não foi possível gerar o pedido');
    } finally {
      gerandoRef.current = null;
      setGerandoId(null);
    }
  };

  /**
   * A linha do Excel da aba Pedidos — UMA POR ITEM, e as colunas são as que a importação LÊ.
   *
   * ── POR QUE MUDOU (onda de correção, F6 — achado I3/UX) ─────────────────────────────────────
   * O export era uma linha por PEDIDO, com `Número`, `Fornecedor`, `Valor Total`, `Status`, `Data`
   * e `Previsão Entrega` — e **nenhuma coluna de código de material**. Reimportar o próprio export
   * do CRM (o primeiro arquivo que qualquer operador vai tentar, porque é o único que ele tem em
   * mãos) recusava TODAS as linhas com `linha sem código de material` e — até o F6 — anunciava isso
   * num toast VERDE. As colunas abaixo casam com as grafias que `pedidoCompraService` aceita:
   * `Número` (agrupador), `Fornecedor` (razão social exata), `Código`, `Quantidade`,
   * `Valor Unitário`, `Data` e `Previsão Entrega`.
   *
   * ⚠️ `Quantidade` e `Valor Unitário` saem como NÚMERO, nunca formatados: `formatCurrency` produz
   * `R$ 1.234,50`, que o leitor de número da importação não entende (viraria 0 em silêncio e o
   * pedido reimportado nasceria sem preço, desfazendo o custo médio do recebimento). `Valor Total`
   * continua formatado porque é coluna de leitura humana — a importação não a lê.
   *
   * Pedido sem item vira UMA linha com as colunas de item vazias: perder o pedido do relatório
   * seria pior, e a importação já recusa a linha dizendo por quê.
   */
  const linhaExportPedido = (pedido, item) => ({
    'Número': pedido.numero || '',
    'Fornecedor': pedido.fornecedor_nome || '',
    'Código': item ? (item.codigo || '') : '',
    'Descrição': item ? (item.descricao || '') : '',
    'Unidade': item ? (item.unidade || '') : '',
    'Quantidade': item ? item.quantidade : '',
    'Valor Unitário': item ? item.valor_unitario : '',
    'Valor Total': formatCurrency(pedido.valor_total),
    'Status': pedido.status || '',
    'Data': formatDate(pedido.data_pedido),
    'Previsão Entrega': formatDate(pedido.previsao_entrega),
    // Etapa 39 (RN-D08). Campos do CABECALHO: repetem-se em todas as linhas do mesmo pedido, e
    // isso e declarado. A importacao le por grafia conhecida de cabecalho e IGNORA as duas, como
    // ja faz com `Status` e `Valor Total`. `Dias de atraso` vazio (nunca 0, nunca '-') quando o
    // pedido esta no prazo: `0` mentiria ("zero dias de atraso" nao e "nao esta atrasado").
    'Atrasado': pedido.atrasado === 1 ? 'Sim' : 'Não',
    'Dias de atraso': pedido.atrasado === 1 ? pedido.dias_atraso : ''
  });

  const handleExportExcel = async () => {
    try {
      let dadosExport = [];
      let nomeArquivo = '';

      switch (activeSection) {
        case 'fornecedores':
          dadosExport = fornecedores.map(f => ({
            'Razão Social': f.razao_social,
            'Nome Fantasia': f.nome_fantasia || '',
            'CNPJ': f.cnpj || '',
            'Contato': f.contato || '',
            'Email': f.email || '',
            'Telefone': f.telefone || '',
            'Status': f.status || '',
            'Cadastrado em': formatDate(f.created_at)
          }));
          nomeArquivo = 'fornecedores';
          break;
        case 'pedidos': {
          // A lista da aba traz só o CABEÇALHO (`GET /compras/pedidos` não devolve itens), então as
          // linhas de item vêm de um `GET /compras/pedidos/:id` por pedido. É sequencial de
          // propósito: a alternativa (uma porta nova que devolvesse os itens de todos) é mudança de
          // contrato de API, e o acervo desta aba é pequeno (produção tem 0 pedidos hoje).
          // Um pedido que falhe na leitura entra com as colunas de item vazias em vez de derrubar
          // a exportação inteira.
          const linhas = [];
          for (const p of pedidos) {
            let itens = [];
            try {
              const detalhe = await api.get(`/compras/pedidos/${p.id}`);
              itens = (detalhe.data && detalhe.data.itens) || [];
            } catch (e) {
              itens = [];
            }
            if (itens.length === 0) linhas.push(linhaExportPedido(p, null));
            else itens.forEach(item => linhas.push(linhaExportPedido(p, item)));
          }
          dadosExport = linhas;
          nomeArquivo = 'pedidos_compra';
          break;
        }
        case 'cotacoes':
          dadosExport = cotacoes.map(c => ({
            'Número': c.numero || '',
            'Fornecedor': c.fornecedor_nome || '',
            'Valor': formatCurrency(c.valor_total),
            'Status': c.status || '',
            'Data': formatDate(c.data_cotacao),
            'Validade': formatDate(c.validade),
            // Etapa 41 (RN-F14): o numero do pedido gerado, NO FIM — as 6 colunas acima ficam
            // identicas para quem ja tem planilha montada em cima do export.
            'Pedido': c.pedido_numero || ''
          }));
          nomeArquivo = 'cotacoes';
          break;
      }

      exportToExcel(dadosExport, nomeArquivo, nomeArquivo);
      toast.success('Exportação realizada com sucesso!');
    } catch (error) {
      toast.error('Erro ao exportar dados');
    }
  };

  const renderFornecedores = () => (
    <div className="table-container">
      {loading ? (
        <SkeletonTable rows={5} />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Razão Social</th>
              <th>CNPJ</th>
              <th>Contato</th>
              <th>Email</th>
              <th>Telefone</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {fornecedores.length === 0 ? (
              <tr>
                <td colSpan="7" className="no-data">Nenhum fornecedor encontrado</td>
              </tr>
            ) : (
              fornecedores.map(fornecedor => (
                <tr key={fornecedor.id}>
                  <td>
                    <div className="cell-primary">{fornecedor.razao_social}</div>
                    <div className="cell-secondary">{fornecedor.nome_fantasia || ''}</div>
                  </td>
                  <td>{fornecedor.cnpj || '-'}</td>
                  <td>{fornecedor.contato || '-'}</td>
                  <td>{fornecedor.email || '-'}</td>
                  <td>{fornecedor.telefone || '-'}</td>
                  <td>
                    <span 
                      className="status-badge" 
                      style={{ backgroundColor: getStatusColor(fornecedor.status) + '20', color: getStatusColor(fornecedor.status) }}
                    >
                      {fornecedor.status || 'ativo'}
                    </span>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <Link to={`/compras/fornecedores/editar/${fornecedor.id}`} className="btn-icon" title="Editar">
                        <FiEdit />
                      </Link>
                      <button
                        onClick={() => handleDelete(fornecedor.id, 'fornecedores')}
                        className="btn-icon btn-danger"
                        title="Excluir"
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  );

  const renderPedidos = () => (
    <div className="table-container">
      {loading ? (
        <SkeletonTable rows={5} />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Número</th>
              <th>Fornecedor</th>
              <th>Valor Total</th>
              <th>Data Pedido</th>
              <th>Previsão Entrega</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {pedidos.length === 0 ? (
              <tr>
                <td colSpan="7" className="no-data">Nenhum pedido encontrado</td>
              </tr>
            ) : (
              pedidos.map(pedido => (
                <tr key={pedido.id}>
                  <td><strong>{pedido.numero || `#${pedido.id}`}</strong></td>
                  <td>{pedido.fornecedor_nome || '-'}</td>
                  <td><strong>{formatCurrency(pedido.valor_total)}</strong></td>
                  <td>{formatDate(pedido.data_pedido)}</td>
                  {/* Etapa 39 (RN-D07): o badge mora DENTRO da celula de previsao — a informacao
                      e SOBRE a previsao, e uma coluna a mais afastaria a causa do efeito. A
                      comparacao e ESTRITA com 1 (o contrato da rota devolve 0|1, nunca boolean):
                      se um dia a rota passar a devolver `null`, `null &&` renderizaria vazio mas
                      qualquer outro truthy acenderia o badge sem dias. */}
                  <td>
                    {formatDate(pedido.previsao_entrega)}
                    {pedido.atrasado === 1 && (
                      <span className="pedido-atrasado">{rotuloAtraso(pedido.dias_atraso)}</span>
                    )}
                  </td>
                  <td>
                    <span 
                      className="status-badge" 
                      style={{ backgroundColor: getStatusColor(pedido.status) + '20', color: getStatusColor(pedido.status) }}
                    >
                      {pedido.status || 'pendente'}
                    </span>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <Link to={`/compras/pedidos/editar/${pedido.id}`} className="btn-icon" title="Editar">
                        <FiEdit />
                      </Link>
                      <button
                        onClick={() => handleDelete(pedido.id, 'pedidos')}
                        className="btn-icon btn-danger"
                        title="Excluir"
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  );

  const renderCotacoes = () => (
    <div className="table-container">
      {loading ? (
        <SkeletonTable rows={5} />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Número</th>
              <th>Fornecedor</th>
              <th>Valor Total</th>
              <th>Data</th>
              <th>Validade</th>
              <th>Status</th>
              <th>Pedido</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {cotacoes.length === 0 ? (
              <tr>
                <td colSpan="8" className="no-data">Nenhuma cotação encontrada</td>
              </tr>
            ) : (
              cotacoes.map(cotacao => (
                <tr key={cotacao.id}>
                  <td><strong>{cotacao.numero || `#${cotacao.id}`}</strong></td>
                  <td>{cotacao.fornecedor_nome || '-'}</td>
                  <td><strong>{formatCurrency(cotacao.valor_total)}</strong></td>
                  <td>{formatDate(cotacao.data_cotacao)}</td>
                  <td>{formatDate(cotacao.validade)}</td>
                  <td>
                    <span 
                      className="status-badge" 
                      style={{ backgroundColor: getStatusColor(cotacao.status) + '20', color: getStatusColor(cotacao.status) }}
                    >
                      {cotacao.status || 'em_analise'}
                    </span>
                  </td>
                  {/* Etapa 41 (RN-F14): o pedido gerado desta cotacao (`pedido_id`/`pedido_numero`
                      vem do LEFT JOIN da lista, T2). Link para a edicao do pedido; '-' sem pedido. */}
                  <td>
                    {cotacao.pedido_id
                      ? <Link to={`/compras/pedidos/editar/${cotacao.pedido_id}`}>{cotacao.pedido_numero || `#${cotacao.pedido_id}`}</Link>
                      : '-'}
                  </td>
                  <td>
                    <div className="action-buttons">
                      {/* Etapa 41 (RN-F14): "Gerar pedido" so quando AINDA NAO gerou (RN-F10) e o
                          status permite (RN-F09) — o servidor recusa os dois casos com 409/400; a
                          tela so nao oferece um botao que vai falhar. */}
                      {!cotacao.pedido_id && !['rejeitado', 'cancelado'].includes(cotacao.status) && (
                        <button
                          type="button"
                          onClick={() => handleGerarPedido(cotacao)}
                          disabled={gerandoId === cotacao.id}
                          className="btn-icon"
                          title="Gerar pedido"
                          data-testid={`gerar-pedido-${cotacao.id}`}
                        >
                          <FiShoppingCart />
                        </button>
                      )}
                      <Link to={`/compras/cotacoes/editar/${cotacao.id}`} className="btn-icon" title="Editar">
                        <FiEdit />
                      </Link>
                      <button
                        onClick={() => handleDelete(cotacao.id, 'cotacoes')}
                        className="btn-icon btn-danger"
                        title="Excluir"
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  );

  const getNewItemPath = () => {
    switch (activeSection) {
      case 'fornecedores':
        return '/compras/fornecedores/novo';
      case 'pedidos':
        return '/compras/pedidos/novo';
      case 'cotacoes':
        return '/compras/cotacoes/nova';
      default:
        return '#';
    }
  };

  return (
    <div className="compras">
      <div className="page-header">
        <div>
          <h1>Compras</h1>
          <p>Gestão de fornecedores, pedidos e cotações</p>
        </div>
        <div className="header-actions">
          <button onClick={handleExportExcel} className="btn-secondary" title="Exportar para Excel">
            <FiDownload /> Exportar Excel
          </button>
          <Link to={getNewItemPath()} className="btn-premium">
            <div className="btn-premium-icon">
              <FiPlus size={20} />
            </div>
            <span className="btn-premium-text">{activeSection === 'fornecedores' ? 'Novo Fornecedor' : activeSection === 'pedidos' ? 'Novo Pedido' : 'Nova Cotação'}</span>
            <div className="btn-premium-shine"></div>
          </Link>
        </div>
      </div>

      <div className="filters">
        <div className="search-box">
          <FiSearch />
          <input
            type="text"
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <FiFilter />
          <select
            data-testid="filtro-status"
            value={statusValido}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="filter-select"
          >
            <option value="">Todos os status</option>
            {(OPCOES_STATUS[activeSection] || []).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        {/* Etapa 39 (RN-D07): CONDICIONAL a aba Pedidos. O bloco `.filters` e renderizado FORA do
            switch de abas e e compartilhado pelas tres — um checkbox incondicional apareceria na
            aba de Fornecedores sem fazer nada. */}
        {activeSection === 'pedidos' && (
          <label className="filter-group filter-atrasados">
            <input
              type="checkbox"
              checked={soAtrasados}
              onChange={(e) => setSoAtrasados(e.target.checked)}
            />
            Só atrasados
          </label>
        )}
      </div>

      <div className="module-content">
        {activeSection === 'fornecedores' && renderFornecedores()}
        {activeSection === 'pedidos' && renderPedidos()}
        {activeSection === 'cotacoes' && renderCotacoes()}
      </div>
    </div>
  );
};

export default Compras;

