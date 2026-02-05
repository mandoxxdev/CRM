import React, { useState, useEffect, useRef } from 'react';
import { FiSearch, FiX, FiHelpCircle, FiBook, FiVideo, FiFileText } from 'react-icons/fi';
import './HelpSearch.css';

const HelpSearch = ({ isOpen, onClose }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const inputRef = useRef(null);

  const helpArticles = [
    {
      id: 1,
      title: 'Como criar um novo cliente',
      category: 'clientes',
      content: 'Para criar um novo cliente, vá em Clientes > Novo Cliente e preencha os dados necessários.',
      tags: ['cliente', 'cadastro', 'novo']
    },
    {
      id: 2,
      title: 'Como criar uma proposta comercial',
      category: 'propostas',
      content: 'Acesse Propostas > Nova Proposta, selecione o cliente e adicione os produtos desejados.',
      tags: ['proposta', 'comercial', 'vendas']
    },
    {
      id: 3,
      title: 'Como gerenciar oportunidades',
      category: 'oportunidades',
      content: 'Na página de Oportunidades, você pode criar novas oportunidades e acompanhar o pipeline de vendas.',
      tags: ['oportunidade', 'vendas', 'pipeline']
    },
    {
      id: 4,
      title: 'Como criar atividades e lembretes',
      category: 'atividades',
      content: 'Em Atividades, clique em Nova Atividade para criar tarefas e lembretes relacionados a clientes ou projetos.',
      tags: ['atividade', 'lembrete', 'tarefa']
    },
    {
      id: 5,
      title: 'Como usar o Dashboard',
      category: 'dashboard',
      content: 'O Dashboard Executivo mostra métricas importantes do seu negócio. Use os filtros para visualizar dados específicos.',
      tags: ['dashboard', 'métricas', 'kpi']
    },
    {
      id: 6,
      title: 'Como exportar relatórios',
      category: 'relatorios',
      content: 'Na página de Relatórios, você pode exportar dados em PDF ou Excel usando os botões de exportação.',
      tags: ['relatório', 'exportar', 'pdf', 'excel']
    },
    {
      id: 7,
      title: 'Como usar a busca global',
      category: 'geral',
      content: 'Pressione Ctrl+K para abrir a busca global e encontrar rapidamente clientes, propostas, projetos e mais.',
      tags: ['busca', 'pesquisa', 'atalho']
    },
    {
      id: 8,
      title: 'Como configurar notificações',
      category: 'configuracoes',
      content: 'Acesse Configurações > Sistema para ajustar preferências de notificações e outras opções.',
      tags: ['configuração', 'notificação', 'preferências']
    },
    {
      id: 9,
      title: 'Como gerenciar usuários e permissões',
      category: 'usuarios',
      content: 'Administradores podem gerenciar usuários e permissões nas páginas Usuários e Permissões.',
      tags: ['usuário', 'permissão', 'admin']
    },
    {
      id: 10,
      title: 'Como usar filtros avançados',
      category: 'geral',
      content: 'A maioria das páginas possui filtros que permitem buscar e filtrar dados de forma específica.',
      tags: ['filtro', 'busca', 'pesquisa']
    }
  ];

  const categories = [
    { id: 'all', name: 'Todos', icon: FiBook },
    { id: 'clientes', name: 'Clientes', icon: FiFileText },
    { id: 'propostas', name: 'Propostas', icon: FiFileText },
    { id: 'oportunidades', name: 'Oportunidades', icon: FiFileText },
    { id: 'atividades', name: 'Atividades', icon: FiFileText },
    { id: 'dashboard', name: 'Dashboard', icon: FiFileText },
    { id: 'relatorios', name: 'Relatórios', icon: FiFileText }
  ];

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = helpArticles.filter(article => {
      const matchesCategory = selectedCategory === 'all' || article.category === selectedCategory;
      const matchesSearch = 
        article.title.toLowerCase().includes(query) ||
        article.content.toLowerCase().includes(query) ||
        article.tags.some(tag => tag.toLowerCase().includes(query));
      
      return matchesCategory && matchesSearch;
    });

    setResults(filtered);
  }, [searchQuery, selectedCategory]);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="help-search-overlay" onClick={onClose}>
      <div className="help-search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="help-search-header">
          <div className="help-search-title">
            <FiHelpCircle />
            <h2>Central de Ajuda</h2>
          </div>
          <button className="help-search-close" onClick={onClose}>
            <FiX />
          </button>
        </div>

        <div className="help-search-input-wrapper">
          <FiSearch className="help-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="help-search-input"
            placeholder="Pesquise por tópicos de ajuda..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {searchQuery && (
            <button
              className="help-search-clear"
              onClick={() => setSearchQuery('')}
            >
              <FiX />
            </button>
          )}
        </div>

        <div className="help-search-categories">
          {categories.map(category => {
            const Icon = category.icon;
            return (
              <button
                key={category.id}
                className={`help-search-category ${
                  selectedCategory === category.id ? 'active' : ''
                }`}
                onClick={() => setSelectedCategory(category.id)}
              >
                <Icon />
                <span>{category.name}</span>
              </button>
            );
          })}
        </div>

        <div className="help-search-results">
          {searchQuery ? (
            results.length > 0 ? (
              <>
                <div className="help-search-results-header">
                  <p>{results.length} resultado(s) encontrado(s)</p>
                </div>
                {results.map(article => (
                  <div key={article.id} className="help-search-result-item">
                    <div className="help-search-result-header">
                      <h3>{article.title}</h3>
                      <span className="help-search-result-category">
                        {categories.find(c => c.id === article.category)?.name || article.category}
                      </span>
                    </div>
                    <p className="help-search-result-content">{article.content}</p>
                    <div className="help-search-result-tags">
                      {article.tags.map((tag, index) => (
                        <span key={index} className="help-search-tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <div className="help-search-empty">
                <FiSearch />
                <p>Nenhum resultado encontrado</p>
                <span>Tente usar palavras-chave diferentes</span>
              </div>
            )
          ) : (
            <div className="help-search-empty">
              <FiHelpCircle />
              <p>Digite para pesquisar</p>
              <span>Ou escolha uma categoria acima</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HelpSearch;


