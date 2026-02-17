import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../services/api';
import { 
  FiUsers, FiBriefcase, FiDollarSign, 
  FiTrendingUp, FiTrendingDown, FiActivity, FiAward, FiBarChart2,
  FiArrowUp, FiArrowDown, FiBell, FiTarget
} from 'react-icons/fi';
import Notificacoes from './Notificacoes';
import DashboardVendas from './DashboardVendas';
import ModalGrafico from './ModalGrafico';
import Tooltip from './Tooltip';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, 
  ResponsiveContainer, PieChart, Pie, Cell, 
  AreaChart, Area, ComposedChart, Line, LabelList
} from 'recharts';
import './Dashboard.css';

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [historico, setHistorico] = useState([]);
  const [dadosAvancados, setDadosAvancados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clientLogos, setClientLogos] = useState([]);
  const [animatedStats, setAnimatedStats] = useState({
    totalClientes: 0,
    totalProjetos: 0
  });
  const [viewMode, setViewMode] = useState('geral'); // 'geral' ou 'vendas'
  const [modalGrafico, setModalGrafico] = useState({
    isOpen: false,
    titulo: '',
    descricao: '',
    tipoGrafico: 'bar',
    dados: [],
    cores: []
  });
  const [chartHeight, setChartHeight] = useState(350);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);

  // Remover apenas elementos de seleção brancos do Recharts (conservador)
  useEffect(() => {
    const removeWhiteElements = () => {
      const chartCards = document.querySelectorAll('.premium-chart-card');
      chartCards.forEach(card => {
        const svg = card.querySelector('svg');
        if (svg) {
          // Remover apenas rect brancos pequenos que são elementos de seleção
          const whiteRects = svg.querySelectorAll('rect[fill="white"], rect[fill="#ffffff"]');
          whiteRects.forEach(rect => {
            const width = parseFloat(rect.getAttribute('width')) || 0;
            const height = parseFloat(rect.getAttribute('height')) || 0;
            // Remover apenas se for um elemento pequeno (provavelmente um elemento de seleção)
            if (width < 50 && height < 50) {
              rect.remove();
            }
          });
        }
      });
    };

    // Executar apenas uma vez após renderização
    const timeout = setTimeout(removeWhiteElements, 500);
    return () => clearTimeout(timeout);
  }, [stats, dadosAvancados]);

  // Ajustar altura dos gráficos baseado no tamanho da tela (com throttle para performance)
  useEffect(() => {
    let timeoutId = null;
    const handleResize = () => {
      if (timeoutId) return;
      timeoutId = requestAnimationFrame(() => {
        const width = window.innerWidth;
        setIsMobile(width < 768);
        
        if (width < 480) {
          setChartHeight(200);
        } else if (width < 768) {
          setChartHeight(250);
        } else if (width < 1024) {
          setChartHeight(300);
        } else {
          setChartHeight(350);
        }
        timeoutId = null;
      });
    };

    handleResize();
    window.addEventListener('resize', handleResize, { passive: true });
    return () => {
      window.removeEventListener('resize', handleResize);
      if (timeoutId) cancelAnimationFrame(timeoutId);
    };
  }, []);

  useEffect(() => {
    const loadLogos = async () => {
      try {
        const res = await api.get('/clientes/logos', { params: { limit: 300 } });
        setClientLogos(Array.isArray(res.data?.logos) ? res.data.logos : []);
      } catch (_) {
        setClientLogos([]);
      }
    };
    loadLogos();
  }, []);

  useEffect(() => {
    // Carregar em paralelo para melhor performance
    const loadData = async () => {
      try {
        const [dashboardRes, historicoRes, avancadoRes] = await Promise.all([
          api.get('/dashboard').catch(() => ({ 
            data: {
              totalClientes: 0,
              totalProjetos: 0,
              projetosPorStatus: [],
              propostasPorStatus: [],
              valorTotalPropostasAprovadas: 0
            }
          })),
          api.get('/dashboard/historico').catch(() => ({ data: [] })),
          api.get('/dashboard/avancado').catch(() => ({ 
            data: {
              propostasPorEstado: [],
              volumeBuscaPorRegiao: [],
              rankClientesCompras: [],
              rankClientesPropostas: [],
              rankRegiaoCompras: [],
              rankOrigemBusca: [],
              taxaConversaoFamilia: [],
              rankClientesPorSegmento: [],
              motivoNaoVenda: [],
              cotacoesComLembrete: []
            }
          }))
        ]);
        const statsData = dashboardRes.data || {};
        setStats({
          totalClientes: statsData.totalClientes ?? 0,
          totalProjetos: statsData.totalProjetos ?? 0,
          projetosPorStatus: Array.isArray(statsData.projetosPorStatus) ? statsData.projetosPorStatus : [],
          propostasPorStatus: Array.isArray(statsData.propostasPorStatus) ? statsData.propostasPorStatus : [],
          valorTotalPropostasAprovadas: statsData.valorTotalPropostasAprovadas ?? 0
        });
        // Formatar histórico para o formato esperado pelos gráficos
        const historicoRaw = historicoRes.data;
        const historicoFormatado = (Array.isArray(historicoRaw) ? historicoRaw : []).map(item => ({
          name: item.mes ? new Date(item.mes + '-01').toLocaleString('pt-BR', { month: 'short' }) : item.name || 'Sem data',
          clientes: item.clientes || 0,
          projetos: item.projetos || 0,
          receita: item.receita || item.propostas_aprovadas || item.valor_total || 0
        }));
        setHistorico(historicoFormatado);
        const avancadoData = avancadoRes.data || {};
        const arr = (v) => Array.isArray(v) ? v : [];
        setDadosAvancados({
          propostasPorEstado: arr(avancadoData.propostasPorEstado),
          volumeBuscaPorRegiao: arr(avancadoData.volumeBuscaPorRegiao),
          rankClientesCompras: arr(avancadoData.rankClientesCompras),
          rankClientesPropostas: arr(avancadoData.rankClientesPropostas),
          rankRegiaoCompras: arr(avancadoData.rankRegiaoCompras),
          rankOrigemBusca: arr(avancadoData.rankOrigemBusca),
          taxaConversaoFamilia: arr(avancadoData.taxaConversaoFamilia),
          rankClientesPorSegmento: arr(avancadoData.rankClientesPorSegmento),
          motivoNaoVenda: arr(avancadoData.motivoNaoVenda),
          cotacoesComLembrete: arr(avancadoData.cotacoesComLembrete)
        });
        setLoading(false);
      } catch (error) {
        console.error('Erro ao carregar dados do dashboard:', error);
        // Definir valores padrão em caso de erro
        setStats({
          totalClientes: 0,
          totalProjetos: 0,
          projetosPorStatus: [],
          propostasPorStatus: [],
          valorTotalPropostasAprovadas: 0
        });
        setHistorico([]);
        setDadosAvancados({
          propostasPorEstado: [],
          volumeBuscaPorRegiao: [],
          rankClientesCompras: [],
          rankClientesPropostas: [],
          rankRegiaoCompras: [],
          rankOrigemBusca: [],
          taxaConversaoFamilia: [],
          rankClientesPorSegmento: [],
          motivoNaoVenda: [],
          cotacoesComLembrete: []
        });
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Forçar re-renderização dos gráficos quando viewMode muda
  useEffect(() => {
    if (!loading && viewMode === 'geral') {
      // Pequeno delay para garantir que o DOM está pronto
      const timer = setTimeout(() => {
        // Forçar re-renderização dos gráficos do Recharts
        window.dispatchEvent(new Event('resize'));
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [viewMode, loading]);

  useEffect(() => {
    if (stats && stats.totalClientes !== undefined) {
      return animateNumbers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats]);

  useEffect(() => {
    // Animações de scroll - Otimizado para velocidade
    const observerOptions = {
      threshold: 0.01, // Ativar mais cedo
      rootMargin: '100px 0px 0px 0px' // Ativar antes de entrar na viewport
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          // Adicionar classe imediatamente sem delay
          entry.target.classList.add('aos-animate');
          // Parar de observar após animar para melhor performance
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);

    // Animar elementos visíveis imediatamente
    const elements = document.querySelectorAll('[data-aos]');
    elements.forEach(el => {
      const rect = el.getBoundingClientRect();
      const isVisible = rect.top < window.innerHeight + 100;
      if (isVisible) {
        // Se já está visível, animar imediatamente
        el.classList.add('aos-animate');
      } else {
        // Caso contrário, observar
        observer.observe(el);
      }
    });

    return () => {
      elements.forEach(el => observer.unobserve(el));
    };
  }, []);


  // Garantir que stats sempre existe com valores padrão (memoizado)
  const safeStats = useMemo(() => {
    const base = stats || {};
    return {
      totalClientes: base.totalClientes ?? 0,
      totalProjetos: base.totalProjetos ?? 0,
      projetosPorStatus: Array.isArray(base.projetosPorStatus) ? base.projetosPorStatus : [],
      propostasPorStatus: Array.isArray(base.propostasPorStatus) ? base.propostasPorStatus : [],
      valorTotalPropostasAprovadas: base.valorTotalPropostasAprovadas ?? 0,
      taxaConversao: base.taxaConversao ?? 0
    };
  }, [stats]);

  const COLORS = useMemo(() => ['#0066cc', '#00c853', '#00a8e8', '#ff9800', '#003d7a', '#9c27b0'], []);
  const GMP_COLORS = useMemo(() => ({
    primary: '#0066cc',
    secondary: '#00a8e8',
    success: '#00c853',
    warning: '#ff9800',
    accent: '#003d7a'
  }), []);

  const formatCurrency = useCallback((value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value || 0);
  }, []);

  // Dados reais do histórico mensal (memoizado)
  const trendData = useMemo(() => historico.length > 0 ? historico : [
    // Fallback: se não houver histórico, mostrar apenas dados atuais
    { 
      name: new Date().toLocaleString('pt-BR', { month: 'short' }), 
      clientes: safeStats.totalClientes || 0, 
      projetos: safeStats.totalProjetos || 0, 
      receita: safeStats.valorTotalPropostasAprovadas || 0 
    }
  ], [historico, safeStats]);

  const animateNumbers = () => {
    const duration = 2000;
    // Removido limite de steps - usa requestAnimationFrame para máxima fluidez
    const startTime = performance.now();

    const currentStats = stats || {
      totalClientes: 0,
      totalProjetos: 0
    };

    const targets = {
      totalClientes: currentStats.totalClientes || 0,
      totalProjetos: currentStats.totalProjetos || 0
    };

    let animationFrameId = null;
    
    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Easing function para animação suave
      const easeOut = 1 - Math.pow(1 - progress, 3);

      setAnimatedStats({
        totalClientes: Math.floor(targets.totalClientes * easeOut),
        totalProjetos: Math.floor(targets.totalProjetos * easeOut)
      });

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        setAnimatedStats(targets);
      }
    };

    animationFrameId = requestAnimationFrame(animate);
    
    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  };


  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner"></div>
        <p>Carregando dashboard...</p>
      </div>
    );
  }

  // Calcular variações reais baseadas no histórico
  const calcularVariacao = (campo, valorAtual) => {
    if (historico.length < 2) return { percentual: 0, valor: 0, texto: 'Sem dados anteriores' };
    
    const mesAtual = historico[historico.length - 1];
    const mesAnterior = historico[historico.length - 2];
    
    const valorAnterior = mesAnterior[campo] || 0;
    const valorAtualReal = valorAtual !== undefined ? valorAtual : (mesAtual[campo] || 0);
    
    if (valorAnterior === 0) {
      return { 
        percentual: valorAtualReal > 0 ? 100 : 0, 
        valor: valorAtualReal, 
        texto: valorAtualReal > 0 ? `+${valorAtualReal} este mês` : 'Sem variação'
      };
    }
    
    const percentual = ((valorAtualReal - valorAnterior) / valorAnterior) * 100;
    const valor = valorAtualReal - valorAnterior;
    
    return {
      percentual: Math.round(percentual),
      valor: valor,
      texto: valor > 0 ? `+${valor} este mês` : valor < 0 ? `${valor} este mês` : 'Sem variação'
    };
  };

  const variacaoClientes = calcularVariacao('clientes', safeStats.totalClientes);
  const variacaoProjetos = calcularVariacao('projetos', safeStats.totalProjetos);
  const variacaoReceita = calcularVariacao('receita', safeStats.valorTotalPropostasAprovadas);

  const CustomTooltip = ({ active, payload, label }) => {
    const payloadList = Array.isArray(payload) ? payload : [];
    if (active && payloadList.length) {
      return (
        <div className="custom-tooltip">
          <p className="tooltip-label">{label}</p>
          {payloadList.map((entry, index) => (
            <p key={index} className="tooltip-value" style={{ color: entry.color }}>
              {entry.name}: {typeof entry.value === 'number' && entry.value > 1000 
                ? formatCurrency(entry.value) 
                : entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Função para abrir modal de gráfico
  const abrirModalGrafico = (titulo, descricao, tipoGrafico, dados, cores = COLORS) => {
    if (!dados || dados.length === 0) {
      alert('Nenhum dado disponível para exibir');
      return;
    }
    
    // CRÍTICO: Rolar para o topo ANTES de abrir o modal - MÚLTIPLAS VEZES
    const scrollToTop = () => {
      window.scrollTo(0, 0);
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      if (document.documentElement.scrollTop !== 0) {
        document.documentElement.scrollTop = 0;
      }
      if (document.body.scrollTop !== 0) {
        document.body.scrollTop = 0;
      }
    };
    
    // Executar múltiplas vezes para garantir
    scrollToTop();
    requestAnimationFrame(scrollToTop);
    setTimeout(scrollToTop, 0);
    setTimeout(scrollToTop, 10);
    
    const dadosSeguros = Array.isArray(dados) ? dados : [];
    let dadosFormatados = [];
    
    if (tipoGrafico === 'pie') {
      dadosFormatados = dadosSeguros.map(item => ({
        name: item.status || item.name || item.uf || item.regiao || item.familia_produto || item.segmento || item.origem_busca || item.motivo_nao_venda || 'Outro',
        value: item.total || item.count || item.valor_total || item.total_propostas || item.total_clientes || item.taxa_conversao || 0
      }));
    } else if (tipoGrafico === 'composed') {
      dadosFormatados = dadosSeguros.map(item => ({
        name: item.name || item.mes || item.status || 'Item',
        barValue: item.clientes || item.projetos || item.total || 0,
        lineValue: item.receita || item.valor_aprovado || 0
      }));
    } else {
      dadosFormatados = dadosSeguros.map(item => ({
        name: item.name || item.mes || item.status || item.uf || item.regiao || item.razao_social || item.familia_produto || item.segmento || 'Item',
        value: item.clientes || item.projetos || item.receita || item.total || item.count || item.valor_total || item.total_propostas || item.total_clientes || item.taxa_conversao || 0
      }));
    }

    // Pequeno delay para garantir que o scroll aconteceu antes de abrir o modal
    setTimeout(() => {
      setModalGrafico({
        isOpen: true,
        titulo,
        descricao,
        tipoGrafico,
        dados: dadosFormatados,
        cores
      });
    }, 10);
  };

  const fecharModalGrafico = () => {
    setModalGrafico({
      isOpen: false,
      titulo: '',
      descricao: '',
      tipoGrafico: 'bar',
      dados: [],
      cores: []
    });
  };

  const baseURL = api.defaults.baseURL || '';
  const getLogoUrl = (logoUrl) => {
    if (!logoUrl) return '';
    return logoUrl.startsWith('http') ? logoUrl : `${baseURL}/uploads/logos/${logoUrl}`;
  };

  return (
    <div className="dashboard premium-dashboard">
      {clientLogos.length > 0 && (
        <section className="dashboard-clientes-confiam">
          <p className="dashboard-clientes-confiam-titulo">Alguns clientes que confiam na GMP</p>
          <div className="dashboard-clientes-confiam-wrap">
            <div className="dashboard-clientes-confiam-track">
              {(Array.isArray(clientLogos) ? [...clientLogos, ...clientLogos, ...clientLogos] : []).map((c, i) => (
                <div key={`${c.id}-${i}`} className="dashboard-clientes-confiam-item">
                  <img
                    src={getLogoUrl(c.logo_url)}
                    alt={c.nome_fantasia || c.razao_social || 'Cliente'}
                    title={c.nome_fantasia || c.razao_social}
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
      <div className="dashboard-header premium-header">
        <div>
          <h1>Dashboard Executivo</h1>
          <p>Visão geral completa do CRM GMP INDUSTRIAIS</p>
        </div>
        <div className="header-actions">
          {/* Toggle de Visualização */}
          <div className="dashboard-toggle">
            <button 
              className={`toggle-view-btn ${viewMode === 'geral' ? 'active' : ''}`}
              onClick={() => setViewMode('geral')}
            >
              <FiBarChart2 /> Geral
            </button>
            <button 
              className={`toggle-view-btn ${viewMode === 'vendas' ? 'active' : ''}`}
              onClick={() => setViewMode('vendas')}
            >
              <FiTarget /> Vendas
            </button>
          </div>
          <Notificacoes />
          <button className="btn-filter">
            <FiBarChart2 /> Filtros
          </button>
        </div>
      </div>

      {/* Renderização Condicional */}
      {viewMode === 'vendas' ? (
        <DashboardVendas key="vendas" />
      ) : viewMode === 'geral' ? (
        <div key="geral" style={{ width: '100%', minHeight: '100vh' }}>
          {/* Resumo Comercial Premium */}
          <div className="summary-card premium-summary" data-aos="fade-up" style={{ marginBottom: '2rem' }}>
            <div className="summary-header">
              <div>
                <h3>
                  <FiAward /> Resumo Comercial
                </h3>
                <p>Métricas comerciais consolidadas</p>
              </div>
            </div>
            <div className="summary-content premium-summary-content">
              <div className="summary-item premium-summary-item">
                <div className="summary-icon" style={{ background: 'linear-gradient(135deg, #00c853 0%, #00a844 100%)' }}>
                  <FiAward />
                </div>
                <div className="summary-info">
                  <span className="summary-label">Propostas Aprovadas</span>
                  <span className="summary-value">{formatCurrency(safeStats.valorTotalPropostasAprovadas || 0)}</span>
                  <span className="summary-change positive">Valor total aprovado</span>
                </div>
              </div>
              <div className="summary-item premium-summary-item">
                <div className="summary-icon" style={{ background: 'linear-gradient(135deg, #00a8e8 0%, #0080cc 100%)' }}>
                  <FiTrendingUp />
                </div>
                <div className="summary-info">
                  <span className="summary-label">Taxa de Conversão</span>
                  <span className="summary-value">
                    {safeStats.taxaConversao !== undefined 
                      ? `${safeStats.taxaConversao.toFixed(1)}%`
                      : (() => {
                          const totalPropostas = safeStats.propostasPorStatus?.reduce((sum, item) => sum + (item.total || item.count || 0), 0) || 0;
                          const aprovadas = safeStats.propostasPorStatus?.find(item => item.status === 'aprovada')?.total || 
                                           safeStats.propostasPorStatus?.find(item => item.status === 'aprovada')?.count || 0;
                          const rejeitadas = safeStats.propostasPorStatus?.find(item => item.status === 'rejeitada')?.total || 
                                           safeStats.propostasPorStatus?.find(item => item.status === 'rejeitada')?.count || 0;
                          const enviadas = safeStats.propostasPorStatus?.find(item => item.status === 'enviada')?.total || 
                                         safeStats.propostasPorStatus?.find(item => item.status === 'enviada')?.count || 0;
                          const processadas = aprovadas + rejeitadas + enviadas;
                          const taxa = processadas > 0 
                            ? ((aprovadas / processadas) * 100).toFixed(1)
                            : (totalPropostas > 0 ? ((aprovadas / totalPropostas) * 100).toFixed(1) : '0.0');
                          return `${taxa}%`;
                        })()}
                  </span>
                  <span className="summary-change positive">Taxa real de aprovação</span>
                </div>
              </div>
              <div className="summary-item premium-summary-item">
                <div className="summary-icon" style={{ background: 'linear-gradient(135deg, #0066cc 0%, #0052a3 100%)' }}>
                  <FiUsers />
                </div>
                <div className="summary-info">
                  <span className="summary-label">Clientes Ativos</span>
                  <span className="summary-value">{animatedStats.totalClientes}</span>
                  <span className={`summary-change ${variacaoClientes.percentual >= 0 ? 'positive' : 'negative'}`}>
                    {variacaoClientes.percentual !== 0 && (
                      <>
                        {variacaoClientes.percentual > 0 ? <FiArrowUp /> : <FiArrowDown />} {Math.abs(variacaoClientes.percentual)}% • {variacaoClientes.texto}
                      </>
                    )}
                    {variacaoClientes.percentual === 0 && variacaoClientes.texto}
                  </span>
                </div>
              </div>
              <div className="summary-item premium-summary-item">
                <div className="summary-icon" style={{ background: 'linear-gradient(135deg, #00c853 0%, #00a844 100%)' }}>
                  <FiBriefcase />
                </div>
                <div className="summary-info">
                  <span className="summary-label">Projetos Ativos</span>
                  <span className="summary-value">{animatedStats.totalProjetos}</span>
                  <span className={`summary-change ${variacaoProjetos.percentual >= 0 ? 'positive' : 'negative'}`}>
                    {variacaoProjetos.percentual !== 0 && (
                      <>
                        {variacaoProjetos.percentual > 0 ? <FiArrowUp /> : <FiArrowDown />} {Math.abs(variacaoProjetos.percentual)}% • {variacaoProjetos.texto}
                      </>
                    )}
                    {variacaoProjetos.percentual === 0 && variacaoProjetos.texto}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Gráficos Premium */}
          <div className="charts-grid premium-charts">
            {/* Gráfico de Tendências */}
            <div 
              className="chart-card premium-chart-card chart-clickable" 
              data-aos="fade-up"
              onClick={() => abrirModalGrafico(
                'Tendências Mensais',
                'Evolução completa dos principais indicadores ao longo do tempo',
                'composed',
                trendData,
                [GMP_COLORS.primary, GMP_COLORS.success, GMP_COLORS.warning]
              )}
              style={{ cursor: 'pointer' }}
            >
              <div className="chart-header">
                <div>
                  <h3>Tendências Mensais</h3>
                  <p>Evolução dos principais indicadores</p>
                </div>
                <div className="chart-legend-inline">
                  <span className="legend-item"><span className="legend-dot" style={{ background: GMP_COLORS.primary }}></span>Clientes</span>
                  <span className="legend-item"><span className="legend-dot" style={{ background: GMP_COLORS.success }}></span>Projetos</span>
                  <span className="legend-item"><span className="legend-dot" style={{ background: GMP_COLORS.warning }}></span>Receita</span>
                </div>
              </div>
              {trendData && trendData.length > 0 ? (
                <ResponsiveContainer key={`trend-${viewMode}`} width="100%" height={chartHeight}>
                  <ComposedChart data={trendData}>
              <defs>
                <linearGradient id="colorClientes" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={GMP_COLORS.primary} stopOpacity={0.8}/>
                  <stop offset="95%" stopColor={GMP_COLORS.primary} stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={GMP_COLORS.warning} stopOpacity={0.8}/>
                  <stop offset="95%" stopColor={GMP_COLORS.warning} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
              <XAxis 
                dataKey="name" 
                stroke="#64748b" 
                tick={{ fill: '#64748b', fontSize: 12 }}
                axisLine={{ stroke: '#e2e8f0' }}
              />
              <YAxis 
                yAxisId="left"
                stroke="#64748b" 
                tick={{ fill: '#64748b', fontSize: 12 }}
                axisLine={{ stroke: '#e2e8f0' }}
              />
              <YAxis 
                yAxisId="right" 
                orientation="right"
                stroke="#64748b" 
                tick={{ fill: '#64748b', fontSize: 12 }}
                axisLine={{ stroke: '#e2e8f0' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                wrapperStyle={{ paddingTop: '20px' }}
                iconType="circle"
              />
              <Area 
                yAxisId="left"
                type="monotone" 
                dataKey="clientes" 
                fill="url(#colorClientes)" 
                stroke={GMP_COLORS.primary} 
                strokeWidth={2}
                name="Clientes"
              />
              <Bar 
                yAxisId="left"
                dataKey="projetos" 
                fill={GMP_COLORS.success} 
                radius={[8, 8, 0, 0]}
                name="Projetos"
              />
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="receita" 
                stroke={GMP_COLORS.warning} 
                strokeWidth={3}
                dot={{ fill: GMP_COLORS.warning, r: 5 }}
                activeDot={false}
                name="Receita (R$)"
              />
            </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="no-data-premium">
                    <FiActivity size={48} />
                    <p>Nenhum dado disponível</p>
                  </div>
                )}
            </div>

            {/* Gráfico de Pizza Premium */}
            <div 
              className="chart-card premium-chart-card chart-clickable" 
              data-aos="fade-up"
              onClick={() => abrirModalGrafico(
                'Propostas por Status',
                'Distribuição completa de propostas comerciais',
                'pie',
                safeStats.propostasPorStatus || [],
                COLORS
              )}
              style={{ cursor: 'pointer' }}
            >
              <div className="chart-header">
                <div>
                  <h3>Propostas por Status</h3>
                  <p>Distribuição de propostas comerciais</p>
                </div>
              </div>
              {safeStats.propostasPorStatus && safeStats.propostasPorStatus.length > 0 ? (
                <ResponsiveContainer key={`pie-${viewMode}`} width="100%" height={chartHeight}>
              <PieChart>
                <Pie
                  data={safeStats.propostasPorStatus}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent, value }) => 
                    `${name}: ${value} (${(percent * 100).toFixed(0)}%)`
                  }
                  outerRadius={isMobile ? 70 : 100}
                  innerRadius={isMobile ? 35 : 50}
                  fill="#8884d8"
                  dataKey="total"
                  paddingAngle={2}
                >
                  {safeStats.propostasPorStatus.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={COLORS[index % COLORS.length]}
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#ffffff', 
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                  }}
                />
                </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="no-data-premium">
                  <FiActivity size={48} />
                  <p>Nenhum dado disponível</p>
                </div>
              )}
            </div>

            {/* Gráfico de Barras Premium */}
            <div 
              className="chart-card premium-chart-card chart-clickable" 
              data-aos="fade-up"
              onClick={() => abrirModalGrafico(
                'Projetos por Status',
                'Análise completa de projetos em andamento',
                'bar',
                safeStats.projetosPorStatus || [],
                [GMP_COLORS.primary]
              )}
              style={{ cursor: 'pointer' }}
            >
              <div className="chart-header">
                <div>
                  <h3>Projetos por Status</h3>
                  <p>Análise de projetos em andamento</p>
                </div>
              </div>
              {safeStats.projetosPorStatus && safeStats.projetosPorStatus.length > 0 ? (
                <ResponsiveContainer key={`bar-${viewMode}`} width="100%" height={chartHeight}>
              <BarChart data={safeStats.projetosPorStatus}>
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GMP_COLORS.primary} stopOpacity={1}/>
                    <stop offset="100%" stopColor={GMP_COLORS.secondary} stopOpacity={0.8}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
                <XAxis 
                  dataKey="status" 
                  stroke="#64748b" 
                  tick={{ fill: '#64748b', fontSize: isMobile ? 10 : 12 }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  angle={isMobile ? -45 : 0}
                  textAnchor={isMobile ? 'end' : 'middle'}
                  height={isMobile ? 60 : 40}
                />
                <YAxis 
                  stroke="#64748b" 
                  tick={{ fill: '#64748b', fontSize: isMobile ? 10 : 12 }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  width={isMobile ? 50 : 60}
                />
                <Tooltip 
                  content={<CustomTooltip />}
                  cursor={{ fill: 'rgba(0, 102, 204, 0.1)' }}
                />
                <Legend />
                <Bar 
                  dataKey="total" 
                  fill="url(#barGradient)" 
                  radius={[12, 12, 0, 0]}
                  name="Quantidade"
                />
              </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="no-data-premium">
                  <FiActivity size={48} />
                  <p>Nenhum dado disponível</p>
                </div>
              )}
            </div>

            {/* Gráfico de Área Premium */}
            <div className="chart-card premium-chart-card" data-aos="fade-up">
              <div className="chart-header">
                <div>
                  <h3>Evolução de Receita</h3>
                  <p>Tendência de crescimento financeiro</p>
                </div>
              </div>
              <ResponsiveContainer key={`area-${viewMode}`} width="100%" height={chartHeight}>
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={GMP_COLORS.warning} stopOpacity={0.8}/>
                  <stop offset="95%" stopColor={GMP_COLORS.warning} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
              <XAxis 
                dataKey="name" 
                stroke="#64748b" 
                tick={{ fill: '#64748b', fontSize: 12 }}
                axisLine={{ stroke: '#e2e8f0' }}
              />
              <YAxis 
                stroke="#64748b" 
                tick={{ fill: '#64748b', fontSize: isMobile ? 10 : 12 }}
                axisLine={{ stroke: '#e2e8f0' }}
                tickFormatter={(value) => `R$ ${(value / 1000000).toFixed(1)}M`}
                width={isMobile ? 50 : 60}
              />
              <Tooltip 
                content={<CustomTooltip />}
                formatter={(value) => formatCurrency(value)}
              />
              <Area 
                type="monotone" 
                dataKey="receita" 
                stroke={GMP_COLORS.warning} 
                strokeWidth={3}
                fill="url(#areaGradient)"
                name="Receita"
              />
            </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Novos Gráficos Avançados */}
          {dadosAvancados && (
            <div className="advanced-charts-section">
              <h2 className="section-title" data-aos="fade-up">Análises Avançadas</h2>
              
              <div className="charts-grid">
            {/* 1. Propostas por Estado (UF) */}
            <div 
              className="chart-card premium-chart-card chart-clickable" 
              data-aos="fade-up"
              onClick={() => abrirModalGrafico(
                'Propostas por Estado (UF)',
                'Distribuição geográfica completa de propostas',
                'bar',
                dadosAvancados.propostasPorEstado || [],
                [GMP_COLORS.primary]
              )}
              style={{ cursor: 'pointer' }}
            >
              <div className="chart-header">
                <h3>Propostas por Estado (UF)</h3>
                <p>Distribuição geográfica de propostas</p>
              </div>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart data={dadosAvancados.propostasPorEstado || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="uf" 
                    tick={{ fontSize: isMobile ? 10 : 12 }}
                    angle={isMobile ? -45 : 0}
                    textAnchor={isMobile ? 'end' : 'middle'}
                    height={isMobile ? 60 : 40}
                  />
                  <YAxis tick={{ fontSize: isMobile ? 10 : 12 }} width={isMobile ? 50 : 60} />
                  <RechartsTooltip />
                  <Bar dataKey="total" fill={GMP_COLORS.primary} radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 2. Volume de Busca por Região */}
            <div 
              className="chart-card premium-chart-card chart-clickable" 
              data-aos="fade-up"
              onClick={() => abrirModalGrafico(
                'Volume de Busca por Região',
                'Itens buscados por região - análise completa',
                'bar',
                dadosAvancados.volumeBuscaPorRegiao || [],
                [GMP_COLORS.secondary]
              )}
              style={{ cursor: 'pointer' }}
            >
              <div className="chart-header">
                <h3>Volume de Busca por Região</h3>
                <p>Itens buscados por região</p>
              </div>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart data={dadosAvancados.volumeBuscaPorRegiao || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="regiao" 
                    tick={{ fontSize: isMobile ? 10 : 12 }}
                    angle={isMobile ? -45 : 0}
                    textAnchor={isMobile ? 'end' : 'middle'}
                    height={isMobile ? 60 : 40}
                  />
                  <YAxis tick={{ fontSize: isMobile ? 10 : 12 }} width={isMobile ? 50 : 60} />
                  <RechartsTooltip />
                  <Bar dataKey="total" fill={GMP_COLORS.secondary} radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 3. Rank de Clientes que Mais Compram */}
            <div 
              className="chart-card premium-chart-card chart-clickable" 
              data-aos="fade-up"
              onClick={() => abrirModalGrafico(
                'Rank de Clientes que Mais Compram',
                'Ranking completo de clientes por valor de compras',
                'bar',
                dadosAvancados.rankClientesCompras || [],
                [GMP_COLORS.success]
              )}
              style={{ cursor: 'pointer' }}
            >
              <div className="chart-header">
                <h3>Rank de Clientes que Mais Compram</h3>
                <p>Top 10 clientes por valor de compras</p>
              </div>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart data={dadosAvancados.rankClientesCompras || []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    type="number" 
                    tick={{ fontSize: isMobile ? 10 : 12 }}
                    width={isMobile ? 50 : 60}
                  />
                  <YAxis 
                    dataKey="razao_social" 
                    type="category" 
                    width={isMobile ? 100 : 150}
                    tick={{ fontSize: isMobile ? 9 : 11 }}
                  />
                  <RechartsTooltip formatter={(value) => formatCurrency(value)} />
                  <Bar dataKey="valor_total" fill={GMP_COLORS.success} radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 4. Rank de Clientes que Mais Solicitam Propostas */}
            <div 
              className="chart-card premium-chart-card chart-clickable" 
              data-aos="fade-up"
              onClick={() => abrirModalGrafico(
                'Rank de Clientes que Mais Solicitam Propostas',
                'Ranking completo de clientes por número de propostas',
                'bar',
                dadosAvancados.rankClientesPropostas || [],
                [GMP_COLORS.warning]
              )}
              style={{ cursor: 'pointer' }}
            >
              <div className="chart-header">
                <h3>Rank de Clientes que Mais Solicitam Propostas</h3>
                <p>Top 10 clientes por número de propostas</p>
              </div>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart data={dadosAvancados.rankClientesPropostas || []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    type="number" 
                    tick={{ fontSize: isMobile ? 10 : 12 }}
                    width={isMobile ? 50 : 60}
                  />
                  <YAxis 
                    dataKey="razao_social" 
                    type="category" 
                    width={isMobile ? 100 : 150}
                    tick={{ fontSize: isMobile ? 9 : 11 }}
                  />
                  <RechartsTooltip />
                  <Bar dataKey="total_propostas" fill={GMP_COLORS.warning} radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 5. Rank de Região que Mais Compram */}
            <div 
              className="chart-card premium-chart-card chart-clickable" 
              data-aos="fade-up"
              onClick={() => abrirModalGrafico(
                'Rank de Região que Mais Compram',
                'Ranking completo de regiões por valor de compras aprovadas',
                'bar',
                dadosAvancados.rankRegiaoCompras || [],
                [GMP_COLORS.accent]
              )}
              style={{ cursor: 'pointer' }}
            >
              <div className="chart-header">
                <h3>Rank de Região que Mais Compram</h3>
                <p>Regiões por valor de compras aprovadas</p>
              </div>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart data={dadosAvancados.rankRegiaoCompras || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="regiao" 
                    tick={{ fontSize: isMobile ? 10 : 12 }}
                    angle={isMobile ? -45 : 0}
                    textAnchor={isMobile ? 'end' : 'middle'}
                    height={isMobile ? 60 : 40}
                  />
                  <YAxis tick={{ fontSize: isMobile ? 10 : 12 }} width={isMobile ? 50 : 60} />
                  <RechartsTooltip formatter={(value) => formatCurrency(value)} />
                  <Bar dataKey="valor_total" fill={GMP_COLORS.accent} radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 6. Rank de Origem de Busca (MKT) */}
            <div 
              className="chart-card premium-chart-card chart-clickable" 
              data-aos="fade-up"
              onClick={() => abrirModalGrafico(
                'Rank de Origem de Busca (Marketing)',
                'Análise completa da origem das buscas de produtos',
                'pie',
                dadosAvancados.rankOrigemBusca || [],
                COLORS
              )}
              style={{ cursor: 'pointer' }}
            >
              <div className="chart-header">
                <h3>Rank de Origem de Busca (Marketing)</h3>
                <p>Origem das buscas de produtos</p>
              </div>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <PieChart>
                  <Pie
                    data={dadosAvancados.rankOrigemBusca || []}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ origem_busca, total }) => `${origem_busca}: ${total}`}
                    outerRadius={isMobile ? 70 : 100}
                    fill="#8884d8"
                    dataKey="total"
                  >
                    {(Array.isArray(dadosAvancados.rankOrigemBusca) ? dadosAvancados.rankOrigemBusca : []).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* 7. Taxa de Conversão por Família de Produto */}
            <div 
              className="chart-card premium-chart-card chart-clickable" 
              data-aos="fade-up"
              onClick={() => abrirModalGrafico(
                'Taxa de Conversão por Família de Produto',
                'Análise completa da taxa de conversão por família de produto',
                'bar',
                dadosAvancados.taxaConversaoFamilia || [],
                [GMP_COLORS.success]
              )}
              style={{ cursor: 'pointer' }}
            >
              <div className="chart-header">
                <h3>Taxa de Conversão por Família de Produto</h3>
                <p>Percentual de aprovação por família</p>
              </div>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart data={dadosAvancados.taxaConversaoFamilia || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="familia_produto" 
                    tick={{ fontSize: isMobile ? 10 : 12 }}
                    angle={isMobile ? -45 : 0}
                    textAnchor={isMobile ? 'end' : 'middle'}
                    height={isMobile ? 60 : 40}
                  />
                  <YAxis tick={{ fontSize: isMobile ? 10 : 12 }} width={isMobile ? 50 : 60} />
                  <RechartsTooltip formatter={(value) => `${value}%`} />
                  <Bar dataKey="taxa_conversao" fill={GMP_COLORS.success} radius={[8, 8, 0, 0]}>
                    <LabelList dataKey="taxa_conversao" position="top" formatter={(value) => `${value}%`} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 8. Rank de Clientes por Segmento */}
            <div 
              className="chart-card premium-chart-card chart-clickable" 
              data-aos="fade-up"
              onClick={() => abrirModalGrafico(
                'Rank de Clientes por Segmento',
                'Distribuição completa de clientes por segmento',
                'bar',
                dadosAvancados.rankClientesPorSegmento || [],
                [GMP_COLORS.primary]
              )}
              style={{ cursor: 'pointer' }}
            >
              <div className="chart-header">
                <h3>Rank de Clientes por Segmento</h3>
                <p>Distribuição de clientes por segmento</p>
              </div>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart data={dadosAvancados.rankClientesPorSegmento || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="segmento" 
                    tick={{ fontSize: isMobile ? 10 : 12 }}
                    angle={isMobile ? -45 : 0}
                    textAnchor={isMobile ? 'end' : 'middle'}
                    height={isMobile ? 60 : 40}
                  />
                  <YAxis tick={{ fontSize: isMobile ? 10 : 12 }} width={isMobile ? 50 : 60} />
                  <RechartsTooltip />
                  <Bar dataKey="total_clientes" fill={GMP_COLORS.primary} radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 9. Motivo da Não Venda */}
            <div 
              className="chart-card premium-chart-card chart-clickable" 
              data-aos="fade-up"
              onClick={() => abrirModalGrafico(
                'Filtro do Motivo da Não Venda',
                'Análise completa dos principais motivos de rejeição',
                'pie',
                dadosAvancados.motivoNaoVenda || [],
                COLORS
              )}
              style={{ cursor: 'pointer' }}
            >
              <div className="chart-header">
                <h3>Filtro do Motivo da Não Venda</h3>
                <p>Principais motivos de rejeição</p>
              </div>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <PieChart>
                  <Pie
                    data={dadosAvancados.motivoNaoVenda || []}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ motivo_nao_venda, total }) => `${motivo_nao_venda}: ${total}`}
                    outerRadius={isMobile ? 70 : 100}
                    fill="#8884d8"
                    dataKey="total"
                  >
                    {(Array.isArray(dadosAvancados.motivoNaoVenda) ? dadosAvancados.motivoNaoVenda : []).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* 10. Histórico de Cotações com Lembretes */}
            <div className="chart-card premium-chart-card full-width" data-aos="fade-up">
              <div className="chart-header">
                <h3>Histórico de Cotações com Lembretes</h3>
                <p>Cotações com avisos e lembretes por data</p>
              </div>
              <div className="lembretes-list">
                {Array.isArray(dadosAvancados.cotacoesComLembrete) && dadosAvancados.cotacoesComLembrete.length > 0 ? (
                  <table className="lembretes-table">
                    <thead>
                      <tr>
                        <th>Nº Proposta</th>
                        <th>Cliente</th>
                        <th>Título</th>
                        <th>Data Lembrete</th>
                        <th>Mensagem</th>
                        <th>Status</th>
                        <th>Alerta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(Array.isArray(dadosAvancados.cotacoesComLembrete) ? dadosAvancados.cotacoesComLembrete : []).map((item) => (
                        <tr key={item.id} className={item.lembrete_vencido ? 'vencido' : ''}>
                          <td>{item.numero_proposta}</td>
                          <td>{item.razao_social}</td>
                          <td>{item.titulo}</td>
                          <td>{item.lembrete_data ? new Date(item.lembrete_data).toLocaleDateString('pt-BR') : '-'}</td>
                          <td>{item.lembrete_mensagem || '-'}</td>
                          <td>
                            <span className={`status-badge ${item.status}`}>{item.status}</span>
                          </td>
                          <td>
                            {item.lembrete_vencido ? (
                              <span className="alerta-vencido">⚠️ Vencido</span>
                            ) : (
                              <span className="alerta-ok">✓ OK</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="no-data">Nenhuma cotação com lembrete encontrada</p>
                )}
              </div>
            </div>
              </div>
            </div>
            )}
        </div>
      ) : (
        <div>Visualização não encontrada        </div>
      )}

      {/* Modal de Gráfico */}
      <ModalGrafico
        isOpen={modalGrafico.isOpen}
        onClose={fecharModalGrafico}
        titulo={modalGrafico.titulo}
        descricao={modalGrafico.descricao}
        tipoGrafico={modalGrafico.tipoGrafico}
        dados={modalGrafico.dados}
        cores={modalGrafico.cores}
        formatCurrency={formatCurrency}
      />
    </div>
  );
};

export default Dashboard;
