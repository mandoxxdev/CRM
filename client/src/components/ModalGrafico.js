import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FiX, FiMaximize2, FiDownload, FiRefreshCw } from 'react-icons/fi';
import html2canvas from 'html2canvas';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area,
  ComposedChart, Line, LabelList
} from 'recharts';
import './ModalGrafico.css';

const ModalGrafico = ({ isOpen, onClose, titulo, descricao, tipoGrafico, dados, cores, formatCurrency }) => {
  const [dadosCompletos, setDadosCompletos] = useState(dados || []);
  const [loading, setLoading] = useState(false);
  const [totalRegistros, setTotalRegistros] = useState(dados?.length || 0);
  const [chartHeight, setChartHeight] = useState(600);
  const [isDarkTheme, setIsDarkTheme] = useState(false);
  const chartRef = useRef(null);

  // Detectar tema atual
  useEffect(() => {
    const checkTheme = () => {
      const theme = document.documentElement.getAttribute('data-theme');
      setIsDarkTheme(theme === 'dark');
    };
    
    checkTheme();
    
    // Observar mudanças no tema
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });
    
    return () => observer.disconnect();
  }, []);

  // Cores dinâmicas baseadas no tema
  const getChartColors = () => {
    if (isDarkTheme) {
      return {
        grid: '#334155',
        axis: '#94a3b8',
        text: '#f1f5f9',
        stroke: '#475569'
      };
    }
    return {
      grid: '#e2e8f0',
      axis: '#64748b',
      text: '#1e293b',
      stroke: '#cbd5e1'
    };
  };

  const chartColors = getChartColors();

  useEffect(() => {
    if (isOpen && dados) {
      if (dados && dados.length > 0) {
        setDadosCompletos(dados);
        setTotalRegistros(dados.length);
      } else {
        setDadosCompletos([]);
        setTotalRegistros(0);
      }
    } else if (!isOpen) {
      // Limpar dados quando fechar
      setDadosCompletos([]);
      setTotalRegistros(0);
    }
  }, [isOpen, dados]);

  // Forçar resize quando o modal abrir (para tablets)
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Calcular altura do gráfico baseado na viewport e prevenir scroll
  useEffect(() => {
    if (isOpen) {
      // CRÍTICO: Salvar posição do scroll ANTES de qualquer coisa
      const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
      
      // ABORDAGEM ULTRA AGRESSIVA: Rolar para o topo IMEDIATAMENTE e fixar
      // Fazer múltiplas vezes para garantir
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
      
      // Executar imediatamente e múltiplas vezes
      scrollToTop();
      requestAnimationFrame(scrollToTop);
      setTimeout(scrollToTop, 0);
      setTimeout(scrollToTop, 10);
      setTimeout(scrollToTop, 50);
      
      // Bloquear scroll do body mas manter posição visual
      const originalBodyOverflow = document.body.style.overflow;
      const originalBodyPosition = document.body.style.position;
      const originalBodyTop = document.body.style.top;
      const originalBodyLeft = document.body.style.left;
      const originalBodyWidth = document.body.style.width;
      
      // Fixar body no topo (0) para prevenir scroll
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = '0'; // Sempre no topo quando modal abrir
      document.body.style.left = '0';
      document.body.style.width = '100%';
      document.documentElement.style.overflow = 'hidden';
      document.documentElement.style.position = 'fixed';
      document.documentElement.style.top = '0';
      document.documentElement.style.left = '0';
      
      // Calcular altura disponível baseado na viewport VISÍVEL
      const viewportHeight = window.innerHeight;
      const modalMaxHeight = viewportHeight * 0.85; // 85% da viewport
      const headerHeight = 110;
      const contentPadding = 40;
      const chartWrapperPadding = 24;
      
      const availableHeight = modalMaxHeight - headerHeight - contentPadding - chartWrapperPadding;
      setChartHeight(Math.max(350, availableHeight));
      
      // ABORDAGEM ULTRA AGRESSIVA: Centralização absoluta na viewport visível
      const forceCentering = () => {
        // Garantir que página esteja no topo SEMPRE
        scrollToTop();
        
        const modalOverlay = document.querySelector('.modal-grafico-overlay');
        const modalContainer = document.querySelector('.modal-grafico-container');
        
        if (modalOverlay && modalContainer) {
          // Usar viewport visível (não depende do scroll)
          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;
          
          // Overlay sempre no centro da viewport visível usando transform
          modalOverlay.style.position = 'fixed';
          modalOverlay.style.top = '0';
          modalOverlay.style.left = '0';
          modalOverlay.style.right = '0';
          modalOverlay.style.bottom = '0';
          modalOverlay.style.width = `${viewportWidth}px`;
          modalOverlay.style.height = `${viewportHeight}px`;
          modalOverlay.style.display = 'flex';
          modalOverlay.style.alignItems = 'center';
          modalOverlay.style.justifyContent = 'center';
          modalOverlay.style.margin = '0';
          modalOverlay.style.padding = '2rem';
          modalOverlay.style.boxSizing = 'border-box';
          modalOverlay.style.zIndex = '10000';
          modalOverlay.style.transform = 'none';
          
          // Container centralizado via flexbox do overlay
          modalContainer.style.position = 'relative';
          modalContainer.style.margin = '0 auto';
          modalContainer.style.transform = 'none';
          modalContainer.style.top = 'auto';
          modalContainer.style.left = 'auto';
          modalContainer.style.right = 'auto';
          modalContainer.style.bottom = 'auto';
        }
      };
      
      // Executar centralização múltiplas vezes para garantir
      // Primeiro rolar para o topo, depois centralizar
      forceCentering();
      requestAnimationFrame(forceCentering);
      setTimeout(forceCentering, 0);
      setTimeout(forceCentering, 10);
      setTimeout(forceCentering, 50);
      setTimeout(forceCentering, 100);
      setTimeout(forceCentering, 200);
      
      // Salvar valores originais
      const originalHtmlOverflow = document.documentElement.style.overflow;
      const originalBodyHeight = document.body.style.height;
      const originalHtmlPosition = document.documentElement.style.position;
      const originalHtmlTop = document.documentElement.style.top;
      const originalHtmlLeft = document.documentElement.style.left;
      const originalHtmlWidth = document.documentElement.style.width;
      const originalHtmlHeight = document.documentElement.style.height;
      document.documentElement.style.width = '100%';
      document.documentElement.style.height = '100%';
      
      // Prevenir scroll via eventos
      const preventScroll = (e) => {
        // Prevenir scroll com wheel
        if (e.type === 'wheel') {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
        // Prevenir scroll com touch
        if (e.type === 'touchmove') {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
        // Prevenir scroll com teclado
        if (e.type === 'keydown' && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'PageDown' || e.key === 'PageUp' || e.key === 'Home' || e.key === 'End')) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      };
      
      // Adicionar event listeners
      window.addEventListener('wheel', preventScroll, { passive: false });
      window.addEventListener('touchmove', preventScroll, { passive: false });
      window.addEventListener('keydown', preventScroll);
      document.addEventListener('wheel', preventScroll, { passive: false });
      document.addEventListener('touchmove', preventScroll, { passive: false });
      
      return () => {
        // Remover event listeners
        window.removeEventListener('wheel', preventScroll);
        window.removeEventListener('touchmove', preventScroll);
        window.removeEventListener('keydown', preventScroll);
        document.removeEventListener('wheel', preventScroll);
        document.removeEventListener('touchmove', preventScroll);
        
        // Restaurar scroll quando modal fechar
        document.body.style.overflow = originalBodyOverflow || '';
        document.body.style.position = originalBodyPosition || '';
        document.body.style.top = originalBodyTop || '';
        document.body.style.left = originalBodyLeft || '';
        document.body.style.width = originalBodyWidth || '';
        document.body.style.height = originalBodyHeight || '';
        document.documentElement.style.overflow = originalHtmlOverflow || '';
        document.documentElement.style.position = originalHtmlPosition || '';
        document.documentElement.style.top = originalHtmlTop || '';
        document.documentElement.style.left = originalHtmlLeft || '';
        document.documentElement.style.width = originalHtmlWidth || '';
        document.documentElement.style.height = originalHtmlHeight || '';
        
        // Restaurar posição do scroll
        window.scrollTo(0, scrollY);
      };
    }
  }, [isOpen]);

  // Ref para o overlay - DEVE estar antes de qualquer return condicional
  const overlayRef = useRef(null);

  // Quando modal abrir, garantir que apareça na tela visível - DEVE estar antes de qualquer return condicional
  useEffect(() => {
    if (isOpen) {
      // CRÍTICO: Rolar para o topo IMEDIATAMENTE
      const scrollToTop = () => {
        window.scrollTo(0, 0);
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        // Forçar todos os elementos para o topo
        if (document.documentElement.scrollTop !== 0) {
          document.documentElement.scrollTop = 0;
        }
        if (document.body.scrollTop !== 0) {
          document.body.scrollTop = 0;
        }
        // Também tentar com scrollTo em todos os elementos possíveis
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
          mainContent.scrollTop = 0;
        }
      };
      
      // Executar múltiplas vezes
      scrollToTop();
      requestAnimationFrame(scrollToTop);
      setTimeout(scrollToTop, 0);
      setTimeout(scrollToTop, 10);
      setTimeout(scrollToTop, 50);
      setTimeout(scrollToTop, 100);
      
      // Garantir que overlay apareça na tela
      if (overlayRef.current) {
        // Forçar posicionamento fixo
        overlayRef.current.style.position = 'fixed';
        overlayRef.current.style.top = '0';
        overlayRef.current.style.left = '0';
        overlayRef.current.style.right = '0';
        overlayRef.current.style.bottom = '0';
        overlayRef.current.style.width = '100vw';
        overlayRef.current.style.height = '100vh';
        overlayRef.current.style.zIndex = '10000';
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const COLORS = cores || ['#0066cc', '#00c853', '#00a8e8', '#ff9800', '#003d7a', '#9c27b0', '#e91e63', '#795548'];

  const formatValue = (value) => {
    if (formatCurrency && typeof value === 'number' && value > 1000) {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(value);
    }
    return value;
  };

  const handleDownload = async () => {
    try {
      setLoading(true);
      
      // Aguardar para garantir que o gráfico está totalmente renderizado
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Encontrar o elemento do gráfico
      const chartElement = chartRef.current;
      
      if (!chartElement) {
        console.error('Elemento do gráfico não encontrado');
        alert('Erro: Não foi possível encontrar o gráfico. Tente novamente.');
        setLoading(false);
        return;
      }
      
      // Encontrar o SVG dentro do elemento
      const svgElement = chartElement.querySelector('svg');
      
      if (svgElement) {
        // Método 1: Converter SVG diretamente para imagem
        try {
          const svgData = new XMLSerializer().serializeToString(svgElement);
          const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
          const svgUrl = URL.createObjectURL(svgBlob);
          
          // Criar uma imagem a partir do SVG
          const img = new Image();
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          // Obter dimensões do SVG
          const svgRect = svgElement.getBoundingClientRect();
          const width = svgRect.width || parseInt(svgElement.getAttribute('width')) || 1200;
          const height = svgRect.height || parseInt(svgElement.getAttribute('height')) || 800;
          
          canvas.width = width * 2; // Alta resolução
          canvas.height = height * 2;
          
          img.onload = () => {
            // Desenhar a imagem no canvas com fundo branco
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            // Converter para blob e fazer download
            canvas.toBlob((blob) => {
              if (!blob || blob.size === 0) {
                throw new Error('Falha ao criar imagem');
              }
              
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              const fileName = `${titulo.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.png`;
              
              link.download = fileName;
              link.href = url;
              link.style.display = 'none';
              
              document.body.appendChild(link);
              link.click();
              
              setTimeout(() => {
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                URL.revokeObjectURL(svgUrl);
              }, 200);
              
              setLoading(false);
            }, 'image/png', 1.0);
          };
          
          img.onerror = () => {
            throw new Error('Erro ao carregar SVG');
          };
          
          img.src = svgUrl;
          return;
        } catch (svgError) {
          console.warn('Erro ao converter SVG diretamente, tentando html2canvas:', svgError);
        }
      }
      
      // Método 2: Fallback para html2canvas (capturar o modal inteiro)
      const modalContent = document.querySelector('.modal-grafico-content');
      const elementToCapture = modalContent || chartElement;
      
      const canvas = await html2canvas(elementToCapture, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
        useCORS: true,
        allowTaint: false,
        foreignObjectRendering: true,
        removeContainer: false,
        imageTimeout: 20000,
        width: elementToCapture.offsetWidth || elementToCapture.scrollWidth,
        height: elementToCapture.offsetHeight || elementToCapture.scrollHeight,
        onclone: (clonedDoc, element) => {
          // Garantir que todos os SVGs estão visíveis
          const svgs = element.querySelectorAll('svg');
          svgs.forEach(svg => {
            const rect = svg.getBoundingClientRect();
            svg.setAttribute('width', rect.width || '1200');
            svg.setAttribute('height', rect.height || '800');
            svg.setAttribute('style', 'display: block !important; visibility: visible !important;');
          });
        }
      });
      
      // Converter para blob
      canvas.toBlob((blob) => {
        if (!blob || blob.size === 0) {
          throw new Error('Falha ao criar imagem');
        }
        
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const fileName = `${titulo.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.png`;
        
        link.download = fileName;
        link.href = url;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        
        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }, 200);
        
        setLoading(false);
      }, 'image/png', 1.0);
      
    } catch (error) {
      console.error('Erro detalhado ao exportar gráfico:', error);
      alert(`Erro ao exportar gráfico: ${error.message}`);
      setLoading(false);
    }
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="modal-tooltip">
          <p className="tooltip-label">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="tooltip-value" style={{ color: entry.color }}>
              {entry.name}: {formatValue(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const renderGrafico = () => {
    console.log('ModalGrafico - renderGrafico chamado:', {
      dadosCompletos,
      length: dadosCompletos?.length,
      tipoGrafico
    });
    
    if (!dadosCompletos || dadosCompletos.length === 0) {
      return (
        <div className="modal-no-data">
          <p>Nenhum dado disponível</p>
          <p style={{ fontSize: '12px', color: '#999', marginTop: '10px' }}>
            Tipo: {tipoGrafico || 'não definido'} | Dados: {dadosCompletos?.length || 0} itens
          </p>
        </div>
      );
    }

    switch (tipoGrafico) {
      case 'bar':
        return (
          <div ref={chartRef} className="modal-chart-wrapper">
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={dadosCompletos} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} opacity={0.5} />
              <XAxis 
                dataKey="name" 
                angle={-45}
                textAnchor="end"
                height={100}
                stroke={chartColors.axis}
                tick={{ fill: chartColors.axis, fontSize: 12 }}
                interval={Math.floor(dadosCompletos.length / 20)}
              />
              <YAxis 
                stroke={chartColors.axis}
                tick={{ fill: chartColors.axis, fontSize: 12 }}
                tickFormatter={formatCurrency ? (value) => `R$ ${(value / 1000).toFixed(0)}k` : undefined}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar 
                dataKey="value" 
                fill={COLORS[0]}
                radius={[8, 8, 0, 0]}
                name={titulo}
              >
                {dadosCompletos.length <= 50 && (
                  <LabelList dataKey="value" position="top" formatter={formatValue} />
                )}
              </Bar>
              </BarChart>
          </ResponsiveContainer>
          </div>
        );

      case 'pie':
        return (
          <div ref={chartRef} className="modal-chart-wrapper">
          <ResponsiveContainer width="100%" height={chartHeight}>
            <PieChart>
              <Pie
                data={dadosCompletos}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent, value }) => 
                  `${name}: ${formatValue(value)} (${(percent * 100).toFixed(1)}%)`
                }
                outerRadius={200}
                innerRadius={80}
                fill="#8884d8"
                dataKey="value"
                paddingAngle={2}
              >
                {dadosCompletos.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={COLORS[index % COLORS.length]}
                    stroke={isDarkTheme ? '#1e293b' : '#fff'}
                    strokeWidth={2}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                verticalAlign="bottom"
                height={36}
                wrapperStyle={{ paddingTop: '20px' }}
              />
              </PieChart>
          </ResponsiveContainer>
          </div>
        );

      case 'area':
        return (
          <div ref={chartRef} className="modal-chart-wrapper">
          <ResponsiveContainer width="100%" height={chartHeight}>
            <AreaChart data={dadosCompletos} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
              <defs>
                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS[0]} stopOpacity={0.8}/>
                  <stop offset="95%" stopColor={COLORS[0]} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} opacity={0.5} />
              <XAxis 
                dataKey="name"
                angle={-45}
                textAnchor="end"
                height={100}
                stroke={chartColors.axis}
                tick={{ fill: chartColors.axis, fontSize: 12 }}
                interval={Math.floor(dadosCompletos.length / 20)}
              />
              <YAxis 
                stroke={chartColors.axis}
                tick={{ fill: chartColors.axis, fontSize: 12 }}
                tickFormatter={formatCurrency ? (value) => `R$ ${(value / 1000).toFixed(0)}k` : undefined}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke={COLORS[0]} 
                strokeWidth={3}
                fill="url(#areaGradient)"
                name={titulo}
              />
            </AreaChart>
          </ResponsiveContainer>
          </div>
        );

      case 'line':
        return (
          <div ref={chartRef} className="modal-chart-wrapper">
          <ResponsiveContainer width="100%" height={chartHeight}>
            <ComposedChart data={dadosCompletos} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} opacity={0.5} />
              <XAxis 
                dataKey="name"
                angle={-45}
                textAnchor="end"
                height={100}
                stroke={chartColors.axis}
                tick={{ fill: chartColors.axis, fontSize: 12 }}
                interval={Math.floor(dadosCompletos.length / 20)}
              />
              <YAxis 
                stroke={chartColors.axis}
                tick={{ fill: chartColors.axis, fontSize: 12 }}
                tickFormatter={formatCurrency ? (value) => `R$ ${(value / 1000).toFixed(0)}k` : undefined}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke={COLORS[0]} 
                strokeWidth={3}
                dot={{ fill: COLORS[0], r: 4 }}
                activeDot={{ r: 6 }}
                name={titulo}
              />
            </ComposedChart>
          </ResponsiveContainer>
          </div>
        );

      case 'composed':
        return (
          <div ref={chartRef} className="modal-chart-wrapper">
          <ResponsiveContainer width="100%" height={chartHeight}>
            <ComposedChart data={dadosCompletos} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} opacity={0.5} />
              <XAxis 
                dataKey="name"
                angle={-45}
                textAnchor="end"
                height={100}
                stroke={chartColors.axis}
                tick={{ fill: chartColors.axis, fontSize: 12 }}
                interval={Math.floor(dadosCompletos.length / 20)}
              />
              <YAxis 
                yAxisId="left"
                stroke={chartColors.axis}
                tick={{ fill: chartColors.axis, fontSize: 12 }}
              />
              <YAxis 
                yAxisId="right" 
                orientation="right"
                stroke={chartColors.axis}
                tick={{ fill: chartColors.axis, fontSize: 12 }}
                tickFormatter={formatCurrency ? (value) => `R$ ${(value / 1000).toFixed(0)}k` : undefined}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar yAxisId="left" dataKey="barValue" fill={COLORS[0]} radius={[8, 8, 0, 0]} name="Quantidade" />
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="lineValue" 
                stroke={COLORS[1]} 
                strokeWidth={3}
                dot={{ fill: COLORS[1], r: 4 }}
                name="Valor"
              />
            </ComposedChart>
          </ResponsiveContainer>
          </div>
        );

      default:
        return (
          <div className="modal-no-data">
            <p>Tipo de gráfico não suportado</p>
          </div>
        );
    }
  };

  const modalContent = (
    <div 
      ref={overlayRef}
      className="modal-grafico-overlay" 
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 10000
      }}
    >
      <div className="modal-grafico-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-grafico-header">
          <div className="modal-grafico-title">
            <h2>{titulo}</h2>
            {descricao && <p>{descricao}</p>}
            <span className="modal-grafico-count">
              {totalRegistros.toLocaleString('pt-BR')} {totalRegistros === 1 ? 'registro' : 'registros'}
            </span>
          </div>
          <div className="modal-grafico-actions">
            <button className="modal-action-btn" title="Atualizar">
              <FiRefreshCw />
            </button>
            <button 
              className="modal-action-btn" 
              title="Exportar gráfico como PNG"
              onClick={handleDownload}
              disabled={loading}
            >
              {loading ? (
                <FiRefreshCw style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <FiDownload />
              )}
            </button>
            <button className="modal-close-btn" onClick={onClose} title="Fechar">
              <FiX />
            </button>
          </div>
        </div>
        <div className="modal-grafico-content">
          {renderGrafico()}
        </div>
      </div>
    </div>
  );

  // Renderizar diretamente no body usando Portal para garantir que apareça na tela visível
  // Isso evita problemas com containers com scroll
  return isOpen ? createPortal(modalContent, document.body) : null;
};

export default ModalGrafico;

