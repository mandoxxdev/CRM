import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import {
  FiPlus, FiSearch, FiEdit, FiTrash2, FiFileText, FiArrowLeft, FiCopy,
  FiMoreHorizontal, FiX, FiPackage,
} from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import './Produtos.css';
import './Loading.css';

const Produtos = ({ familiaFromUrl, familiaNome, grupoId }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  // Clonar e so para admin, mesma regra combinada para o clone de familia. Esconder o
  // botao e cortesia de interface; quem recusa de verdade e a rota no servidor.
  const isAdmin = String(user?.role || '').toLowerCase() === 'admin';
  const [produtos, setProdutos] = useState([]);
  // Celular: qual produto abriu o menu de mais ações.
  const [acoesDe, setAcoesDe] = useState(null);
  const [familias, setFamilias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterFamilia, setFilterFamilia] = useState(familiaFromUrl || '');
  useEffect(() => {
    if (familiaFromUrl) setFilterFamilia(familiaFromUrl);
  }, [familiaFromUrl]);

  useEffect(() => {
    api.get('/familias').then((res) => {
      const list = (res.data || []).map((f) => f.nome);
      setFamilias(list);
    }).catch(() => setFamilias([]));
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      loadProdutos();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [search, filterFamilia]);

  const loadProdutos = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (filterFamilia) params.familia = filterFamilia;
      params.ativo = 'true';
      
      const response = await api.get('/produtos', { params });
      setProdutos(response.data);
    } catch (error) {
      console.error('Erro ao carregar produtos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Tem certeza que deseja desativar este produto?')) {
      try {
        await api.delete(`/produtos/${id}`);
        loadProdutos();
      } catch (error) {
        alert('Erro ao desativar produto');
      }
    }
  };

  // Clonar produto: o codigo novo sai da serie do proprio produto de origem
  // (60-01-DHY-10-01 vira 60-01-DHY-10-02), entao nao ha nada para o usuario digitar.
  const handleClonar = async (produto) => {
    const rotulo = produto.codigo || produto.nome;
    if (!window.confirm(
      `Clonar o produto ${rotulo}?\n\n`
      + 'Será criado um produto novo com o mesmo cadastro e um código gerado na sequência.'
    )) return;
    try {
      const { data } = await api.post(`/produtos/${produto.id}/clonar`);
      await loadProdutos();
      const aviso = data.codigo_fora_do_padrao
        ? '\n\nAtenção: o código de origem está fora do padrão, então o novo código precisa de revisão.'
        : '';
      alert(`Produto clonado como ${data.codigo}.${aviso}`);
    } catch (error) {
      console.error('Erro ao clonar produto:', error);
      alert(error.response?.data?.error || 'Erro ao clonar produto');
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  // Monta o descritivo técnico (material, espessura, etc. para discos; CCM, potência, etc. para equipamentos)
  const getDescritivoTecnico = (produto) => {
    let spec = {};
    try {
      const raw = produto.especificacoes_tecnicas;
      if (raw) spec = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (_) {}
    const parts = [];
    // Campos comuns / discos e acessórios
    if (spec.material_contato) parts.push(`Material: ${spec.material_contato}`);
    if (spec.espessura) parts.push(`Espessura: ${spec.espessura}`);
    if (spec.acabamento) parts.push(`Acabamento: ${spec.acabamento}`);
    if (spec.diametro) parts.push(`Diâmetro: ${spec.diametro}`);
    if (spec.funcao) parts.push(`Função: ${spec.funcao}`);
    if (spec.tratamento_termico) parts.push(`Trat. Térmico: ${spec.tratamento_termico}`);
    if (spec.velocidade_trabalho) parts.push(`Velocidade: ${spec.velocidade_trabalho}`);
    // Campos de equipamento
    if (spec.ccm_incluso) parts.push(`CCM: ${spec.ccm_incluso}`);
    if (spec.ccm_tensao) parts.push(`Tensão CCM: ${spec.ccm_tensao}`);
    if (spec.celula_carga) parts.push(`Célula de Carga: ${spec.celula_carga}`);
    if (spec.plc_ihm) parts.push(`PLC/IHM: ${spec.plc_ihm}`);
    if (spec.valvula_saida_tanque) parts.push(`Válvula Saída: ${spec.valvula_saida_tanque}`);
    const totalCV = [spec.motor_central_cv, spec.motoredutor_central_cv, spec.motores_laterais_cv]
      .reduce((s, v) => s + (parseFloat(v) || 0), 0);
    if (totalCV > 0) parts.push(`Potência: ${totalCV.toFixed(1).replace('.', ',')} CV`);
    const classArea = spec.classificacao_area || produto.classificacao_area;
    if (classArea) parts.push(`Class. Área: ${classArea}`);
    return parts.length ? parts.join(' • ') : null;
  };

  // Monta a URL da foto do produto (imagem = nome de arquivo em /api/uploads/produtos)
  const getImagemUrl = (img) => {
    if (!img) return null;
    if (img.startsWith('data:') || img.startsWith('http')) return img;
    const base = api.defaults.baseURL || '/api';
    return base.replace(/\/api\/?$/, '') + '/api/uploads/produtos/' + img;
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
        <p>Carregando produtos...</p>
      </div>
    );
  }

  return (
    <div className="produtos">
      <div className="page-header">
        <div>
          {filterFamilia && (
            <button
              type="button"
              onClick={() => navigate(grupoId ? `/comercial/produtos/grupo/${grupoId}` : '/comercial/produtos')}
              className="btn-voltar-familias"
            >
              <FiArrowLeft /> {grupoId ? 'Voltar para famílias' : 'Voltar para grupos'}
            </button>
          )}
          <h1>Produtos{filterFamilia ? ` – ${filterFamilia}` : ''}</h1>
          <p>Gerenciamento de produtos e geração de propostas</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--spacing-md)' }}>
          <button
            onClick={() => {
              const qs = filterFamilia || familiaNome ? `?familia=${encodeURIComponent(filterFamilia || familiaNome || '')}` : '';
              navigate(`/comercial/produtos/novo${qs}`);
            }}
            className="btn-premium"
          >
            <div className="btn-premium-icon">
              <FiPlus size={20} />
            </div>
            <span className="btn-premium-text">Novo Produto</span>
            <div className="btn-premium-shine"></div>
          </button>
        </div>
      </div>

      <div className="filters">
        <div className="search-box">
          <FiSearch />
          <input
            type="text"
            placeholder="Buscar por código, nome, modelo ou descrição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          value={filterFamilia}
          onChange={(e) => setFilterFamilia(e.target.value)}
          className="filter-select"
        >
          <option value="">Todas as famílias</option>
          {familias.map(familia => (
            <option key={familia} value={familia}>{familia}</option>
          ))}
        </select>
      </div>

      {/* ══ CELULAR ══════════════════════════════════════════════════════════
          A tabela tem ONZE colunas. No telefone ela vira rolagem lateral e nada
          fica legível. Aqui entra uma lista feita para o polegar, com as MESMAS
          onze informações — o que muda é o peso de cada uma, não o conteúdo.

          Todos os handlers (handleDelete, handleClonar, formatCurrency,
          getDescritivoTecnico, getImagemUrl, isAdmin) são os da tabela: as regras
          existem uma vez só, e mudam nos dois lugares ao mesmo tempo. */}
      <div className="prm">
        <div className="prm-topo">
          <span className="prm-contagem">
            {`${produtos.length} ${produtos.length === 1 ? 'produto' : 'produtos'}`}
          </span>
          <Link to="/comercial/produtos/novo" className="prm-novo">
            <FiPlus size={16} /> Novo
          </Link>
        </div>

        <div className="prm-busca">
          <FiSearch size={17} />
          <input
            type="text"
            placeholder="Buscar por nome ou código…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} aria-label="Limpar busca">
              <FiX size={16} />
            </button>
          )}
        </div>

        {/* Os chips de família só aparecem quando a tela NÃO foi aberta a partir
            de uma família. Vindo de lá o filtro já está decidido, e oferecer a
            troca confundiria: a pessoa acha que está numa família e está noutra. */}
        {!familiaFromUrl && familias.length > 0 && (
          <div className="prm-chips">
            <button
              type="button"
              className={`prm-chip${filterFamilia === '' ? ' is-on' : ''}`}
              onClick={() => setFilterFamilia('')}
            >
              Todas
            </button>
            {familias.map((f) => (
              <button
                key={f}
                type="button"
                className={`prm-chip${filterFamilia === f ? ' is-on' : ''}`}
                onClick={() => setFilterFamilia(filterFamilia === f ? '' : f)}
              >
                {f}
              </button>
            ))}
          </div>
        )}

        <div className="prm-lista">
          {produtos.length === 0 ? (
            <div className="prm-vazio">
              <FiPackage size={28} />
              <span>Nenhum produto encontrado.</span>
            </div>
          ) : produtos.map((produto) => {
            const classificacao = produto.classificacao_area || (() => {
              try {
                const raw = produto.especificacoes_tecnicas;
                const spec = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
                return spec.classificacao_area || null;
              } catch (e) { return null; }
            })();
            const descritivo = getDescritivoTecnico(produto);
            const foto = getImagemUrl(produto.imagem);
            return (
              <article className="prm-card" key={produto.id}>
                <Link to={`/comercial/produtos/editar/${produto.id}`} className="prm-toque">
                  <div className="prm-linha1">
                    {foto ? (
                      <img
                        src={foto}
                        alt=""
                        className="prm-foto"
                        loading="lazy"
                        onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                      />
                    ) : (
                      <div className="prm-foto prm-foto-vazia"><FiPackage size={18} /></div>
                    )}
                    <div className="prm-ident">
                      <span className="prm-codigo">{produto.codigo || '—'}</span>
                      <div className="prm-nome">{produto.nome}</div>
                    </div>
                  </div>

                  {classificacao && (
                    <span className={`class-area-selo ${
                      classificacao.toLocaleUpperCase('pt-BR').includes('ATEX')
                        ? 'class-area-atex'
                        : classificacao.toLocaleUpperCase('pt-BR').includes('SEGURA')
                          ? 'class-area-segura'
                          : 'class-area-outro'
                    }`}>
                      {classificacao}
                    </span>
                  )}

                  {descritivo && <div className="prm-descritivo">{descritivo}</div>}

                  <div className="prm-preco">{formatCurrency(produto.preco_base)}</div>
                  <div className="prm-meta">
                    {produto.familia || 'Sem família'}
                    {produto.modelo ? ` · ${produto.modelo}` : ''}
                    {` · ${produto.unidade || '—'}`}
                    {` · ICMS ${produto.icms}% · IPI ${produto.ipi}%`}
                  </div>
                </Link>

                <div className="prm-acts">
                  <Link
                    to={`/comercial/produtos/editar/${produto.id}`}
                    className="prm-act is-destaque"
                  >
                    <FiEdit size={16} /> Editar
                  </Link>
                  <Link
                    to={`/comercial/propostas/nova?produto=${produto.id}`}
                    className="prm-act"
                  >
                    <FiFileText size={16} /> Proposta
                  </Link>
                  <button
                    type="button"
                    className="prm-act prm-act-mais"
                    onClick={() => setAcoesDe(produto)}
                    aria-label="Mais ações"
                  >
                    <FiMoreHorizontal size={19} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {/* Folha de ações. Clonar aparece sob a MESMA condição da tabela (isAdmin),
          e desativar chama o mesmo handleDelete, com a mesma confirmação. */}
      {acoesDe && (
        <div className="prm-fundo" onClick={() => setAcoesDe(null)}>
          <div className="prm-folha" onClick={(e) => e.stopPropagation()}>
            <div className="prm-puxador" />
            <div className="prm-folha-tit">
              {acoesDe.codigo || 'Produto'} · {acoesDe.nome}
            </div>

            <Link
              to={`/comercial/produtos/editar/${acoesDe.id}`}
              className="prm-op"
              onClick={() => setAcoesDe(null)}
            >
              <FiEdit size={18} /> Editar produto
            </Link>
            <Link
              to={`/comercial/propostas/nova?produto=${acoesDe.id}`}
              className="prm-op"
              onClick={() => setAcoesDe(null)}
            >
              <FiFileText size={18} /> Gerar proposta
            </Link>
            {isAdmin && (
              <button
                type="button"
                className="prm-op"
                onClick={() => { const x = acoesDe; setAcoesDe(null); handleClonar(x); }}
              >
                <FiCopy size={18} /> Clonar produto
              </button>
            )}
            <button
              type="button"
              className="prm-op is-danger"
              onClick={() => { const x = acoesDe; setAcoesDe(null); handleDelete(x.id); }}
            >
              <FiTrash2 size={18} /> Desativar produto
            </button>
          </div>
        </div>
      )}

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Foto</th>
              <th>Código</th>
              <th>Nome</th>
              <th>Família</th>
              <th>Modelo</th>
              <th>Class. Área</th>
              <th>Preço Base</th>
              <th>ICMS</th>
              <th>IPI</th>
              <th>Unidade</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {produtos.length === 0 ? (
              <tr>
                <td colSpan="11" className="no-data">
                  Nenhum produto encontrado
                </td>
              </tr>
            ) : (
              produtos.map(produto => {
                const classificacao = produto.classificacao_area || (() => {
                  try {
                    const spec = produto.especificacoes_tecnicas ? (typeof produto.especificacoes_tecnicas === 'string' ? JSON.parse(produto.especificacoes_tecnicas) : produto.especificacoes_tecnicas) : {};
                    return spec.classificacao_area || null;
                  } catch (e) { return null; }
                })();
                const descritivoTecnico = getDescritivoTecnico(produto);
                return (
                <tr key={produto.id}>
                  <td className="produto-foto-cell">
                    {getImagemUrl(produto.imagem) ? (
                      <img
                        src={getImagemUrl(produto.imagem)}
                        alt={produto.nome}
                        className="produto-thumb"
                        loading="lazy"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    ) : (
                      <div className="produto-thumb produto-thumb-vazia">—</div>
                    )}
                  </td>
                  <td><strong>{produto.codigo}</strong></td>
                  <td className="produto-nome-cell">
                    <div className="produto-nome-texto">{produto.nome}</div>
                    {descritivoTecnico && (
                      <div className="produto-nome-descritivo" title={descritivoTecnico}>
                        {descritivoTecnico}
                      </div>
                    )}
                  </td>
                  <td>{produto.familia || '-'}</td>
                  <td>{produto.modelo || '-'}</td>
                  <td>
                    {classificacao ? (
                      // Comparacao sem caixa: o servidor grava em CAIXA ALTA (toUpper).
                      // Valor fora das duas opcoes (ex.: "BASE AGUA", de antes) recebe selo
                      // neutro em vez de verde ou vermelho — pintar de verde um valor que
                      // nao afirma "area segura" seria pior do que nao pintar.
                      <span className={`class-area-selo ${
                        classificacao.toLocaleUpperCase('pt-BR').includes('ATEX')
                          ? 'class-area-atex'
                          : classificacao.toLocaleUpperCase('pt-BR').includes('SEGURA')
                            ? 'class-area-segura'
                            : 'class-area-outro'
                      }`}>
                        {classificacao}
                      </span>
                    ) : '-'}
                  </td>
                  <td>{formatCurrency(produto.preco_base)}</td>
                  <td>{produto.icms}%</td>
                  <td>{produto.ipi}%</td>
                  <td>{produto.unidade}</td>
                  <td>
                    <div className="action-buttons">
                      <Link
                        to={`/comercial/produtos/editar/${produto.id}`}
                        className="btn-icon"
                        title="Editar"
                      >
                        <FiEdit />
                      </Link>
                      <button
                        onClick={() => handleDelete(produto.id)}
                        className="btn-icon btn-danger"
                        title="Desativar"
                      >
                        <FiTrash2 />
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => handleClonar(produto)}
                          className="btn-icon"
                          title="Clonar produto (cria um novo com o mesmo cadastro e código na sequência)"
                        >
                          <FiCopy />
                        </button>
                      )}
                      <Link
                        to={`/comercial/propostas/nova?produto=${produto.id}`}
                        className="btn-icon btn-success"
                        title="Gerar Proposta"
                      >
                        <FiFileText />
                      </Link>
                    </div>
                  </td>
                </tr>
              );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Produtos;

