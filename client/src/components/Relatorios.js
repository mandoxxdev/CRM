import React, { useState, useEffect } from 'react';
import api from '../services/api';
import {
  FiTrendingUp, FiTrendingDown, FiDollarSign, FiUsers, FiTarget,
  FiMapPin, FiBarChart2, FiPieChart, FiActivity, FiAward,
  FiAlertCircle, FiCheckCircle, FiArrowRight, FiDownload,
  FiRefreshCw, FiCalendar, FiPackage, FiShoppingCart, FiTool,
  FiX, FiCheck, FiSearch, FiSettings
} from 'react-icons/fi';
import ReportBuilder from './ReportBuilder';
import WorkflowEngine from './WorkflowEngine';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line,
  AreaChart, Area, ComposedChart
} from 'recharts';
import MapaClientes from './MapaClientes';
import ModalGrafico from './ModalGrafico';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import './Relatorios.css';

const Relatorios = () => {
  const [loading, setLoading] = useState(true);
  const [chartHeight, setChartHeight] = useState(300);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);

  // Ajustar altura dos gráficos baseado no tamanho da tela
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      setIsMobile(width < 768);
      
      if (width < 480) {
        setChartHeight(200);
      } else if (width < 768) {
        setChartHeight(250);
      } else if (width < 1024) {
        setChartHeight(280);
      } else {
        setChartHeight(300);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [dados, setDados] = useState(null);
  const [error, setError] = useState(null);
  const [loadingVisitas, setLoadingVisitas] = useState(false);
  const [visitasTecnicas, setVisitasTecnicas] = useState(null);
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroPrioridade, setFiltroPrioridade] = useState('todas');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroTaxaConversao, setFiltroTaxaConversao] = useState('todas');
  const [ordenacao, setOrdenacao] = useState('prioridade');
  const [modalGrafico, setModalGrafico] = useState({
    isOpen: false,
    titulo: '',
    descricao: '',
    tipoGrafico: 'bar',
    dados: [],
    cores: []
  });
  const [reportBuilderOpen, setReportBuilderOpen] = useState(false);
  const [workflowEngineOpen, setWorkflowEngineOpen] = useState(false);

  useEffect(() => {
    loadRelatorios();
    loadVisitasTecnicas();
  }, []);

  const loadRelatorios = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/relatorios/executivo');
      setDados(response.data);
    } catch (err) {
      console.error('Erro ao carregar relatórios:', err);
      setError('Erro ao carregar dados dos relatórios');
    } finally {
      setLoading(false);
    }
  };

  const loadVisitasTecnicas = async () => {
    setLoadingVisitas(true);
    try {
      const response = await api.get('/relatorios/visitas-tecnicas');
      setVisitasTecnicas(response.data);
    } catch (err) {
      console.error('Erro ao carregar visitas técnicas:', err);
    } finally {
      setLoadingVisitas(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const formatPercent = (value) => {
    return `${(value || 0).toFixed(1)}%`;
  };

  // Função para abrir modal de gráfico
  const abrirModalGrafico = (titulo, descricao, tipoGrafico, dados, cores = COLORS) => {
    let dadosFormatados = [];
    
    if (tipoGrafico === 'pie') {
      dadosFormatados = dados.map(item => ({
        name: item.status || item.name || item.estado || 'Outro',
        value: item.total || item.count || item.valor_total || 0
      }));
    } else if (tipoGrafico === 'composed') {
      dadosFormatados = dados.map(item => ({
        name: item.mes || item.name || 'Item',
        barValue: item.total || 0,
        lineValue: item.valor_aprovado || 0
      }));
    } else {
      dadosFormatados = dados.map(item => ({
        name: item.estado || item.mes || item.name || item.razao_social || 'Item',
        value: item.valor_total || item.total || item.count || 0
      }));
    }

    setModalGrafico({
      isOpen: true,
      titulo,
      descricao,
      tipoGrafico,
      dados: dadosFormatados,
      cores
    });
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

  const handleExportPDF = () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      let yPos = 20;

      // Cores GMP
      const corPrimaria = [0, 102, 204]; // #0066cc

      // Função auxiliar para adicionar nova página se necessário
      const checkNewPage = (requiredSpace = 30) => {
        if (yPos > pageHeight - requiredSpace) {
          doc.addPage();
          yPos = 20;
          return true;
        }
        return false;
      };

      // Função auxiliar para adicionar título de seção
      const addSectionTitle = (title, fontSize = 16) => {
        checkNewPage(40);
        doc.setFontSize(fontSize);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(title, 20, yPos);
        yPos += 10;
      };

      // Cabeçalho
      doc.setFillColor(...corPrimaria);
      doc.rect(0, 0, pageWidth, 50, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.text('GMP INDUSTRIAIS', pageWidth / 2, 20, { align: 'center' });
      
      doc.setFontSize(14);
      doc.setFont('helvetica', 'normal');
      doc.text('Relatórios Executivos', pageWidth / 2, 35, { align: 'center' });
      
      doc.setFontSize(10);
      doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`, pageWidth / 2, 45, { align: 'center' });

      yPos = 60;

      // 1. KPIs Principais
      if (dados.kpis) {
        addSectionTitle('Indicadores Principais (KPIs)', 16);
        
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        
        const kpis = [
          ['Total de Clientes', dados.kpis.totalClientes || 0],
          ['Propostas Aprovadas', dados.kpis.propostasAprovadas || 0],
          ['Faturamento Total', formatCurrency(dados.kpis.faturamentoTotal || 0)],
          ['Taxa de Conversão', formatPercent(dados.kpis.taxaConversao || 0)],
        ];

        kpis.forEach(([label, value]) => {
          doc.text(`${label}:`, 25, yPos);
          doc.setFont('helvetica', 'bold');
          doc.text(String(value), 100, yPos);
          doc.setFont('helvetica', 'normal');
          yPos += 8;
        });

        yPos += 10;
      }

      // 2. Resumo de Visitas Técnicas
      if (visitasTecnicas) {
        addSectionTitle('Resumo de Visitas Técnicas', 16);
        
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`Total Analisado: ${visitasTecnicas.total || 0}`, 25, yPos);
        yPos += 8;
        doc.text(`Clientes Elegíveis: ${visitasTecnicas.totalElegiveis || 0}`, 25, yPos);
        yPos += 8;
        doc.text(`Clientes Não Elegíveis: ${visitasTecnicas.totalNaoElegiveis || 0}`, 25, yPos);
        yPos += 15;
      }

      // 3. Top 10 Clientes por Valor
      if (dados.graficos?.topClientes && dados.graficos.topClientes.length > 0) {
        addSectionTitle('Top 10 Clientes por Valor', 16);
        
        const tableData = dados.graficos.topClientes.map(cliente => [
          cliente.razao_social || '-',
          cliente.estado || '-',
          cliente.total_propostas || 0,
          formatCurrency(cliente.valor_total || 0)
        ]);

        doc.autoTable({
          startY: yPos,
          head: [['Cliente', 'Estado', 'Propostas', 'Valor Total']],
          body: tableData,
          styles: { fontSize: 9 },
          headStyles: { fillColor: corPrimaria, textColor: 255, fontStyle: 'bold' },
          margin: { left: 20, right: 20 },
        });

        yPos = doc.lastAutoTable.finalY + 15;
      }

      // 4. Propostas por Status
      if (dados.graficos?.propostasPorStatus && dados.graficos.propostasPorStatus.length > 0) {
        addSectionTitle('Propostas por Status', 16);
        
        const tableData = dados.graficos.propostasPorStatus.map(item => [
          item.status || '-',
          item.total || 0,
          formatPercent((item.total / dados.graficos.propostasPorStatus.reduce((sum, i) => sum + (i.total || 0), 0)) * 100)
        ]);

        doc.autoTable({
          startY: yPos,
          head: [['Status', 'Quantidade', 'Percentual']],
          body: tableData,
          styles: { fontSize: 9 },
          headStyles: { fillColor: corPrimaria, textColor: 255, fontStyle: 'bold' },
          margin: { left: 20, right: 20 },
        });

        yPos = doc.lastAutoTable.finalY + 15;
      }

      // 5. Análise por Região
      if (dados.graficos?.analiseRegiao && dados.graficos.analiseRegiao.length > 0) {
        addSectionTitle('Análise por Região', 16);
        
        const tableData = dados.graficos.analiseRegiao.slice(0, 15).map(regiao => [
          regiao.estado || '-',
          regiao.total_clientes || 0,
          regiao.total_propostas || 0,
          formatCurrency(regiao.valor_total || 0)
        ]);

        doc.autoTable({
          startY: yPos,
          head: [['Estado', 'Clientes', 'Propostas', 'Valor Total']],
          body: tableData,
          styles: { fontSize: 8 },
          headStyles: { fillColor: corPrimaria, textColor: 255, fontStyle: 'bold' },
          margin: { left: 20, right: 20 },
        });

        yPos = doc.lastAutoTable.finalY + 15;
      }

      // 6. Evolução de Propostas (Últimos 6 Meses)
      if (dados.graficos?.evolucaoPropostas && dados.graficos.evolucaoPropostas.length > 0) {
        addSectionTitle('Evolução de Propostas (Últimos 6 Meses)', 16);
        
        const tableData = dados.graficos.evolucaoPropostas.map(item => [
          item.mes || '-',
          item.total || 0,
          formatCurrency(item.valor_aprovado || 0)
        ]);

        doc.autoTable({
          startY: yPos,
          head: [['Mês', 'Total de Propostas', 'Valor Aprovado']],
          body: tableData,
          styles: { fontSize: 9 },
          headStyles: { fillColor: corPrimaria, textColor: 255, fontStyle: 'bold' },
          margin: { left: 20, right: 20 },
        });

        yPos = doc.lastAutoTable.finalY + 15;
      }

      // 7. Clientes que Precisam de Visita
      if (dados.insights?.clientesParaVisitar && dados.insights.clientesParaVisitar.length > 0) {
        addSectionTitle('Clientes que Precisam de Visita', 16);
        
        const tableData = dados.insights.clientesParaVisitar.slice(0, 20).map(cliente => [
          cliente.razao_social || '-',
          cliente.cidade && cliente.estado ? `${cliente.cidade}, ${cliente.estado}` : '-',
          cliente.ultima_proposta 
            ? new Date(cliente.ultima_proposta).toLocaleDateString('pt-BR')
            : 'Nunca',
          cliente.total_propostas_historico || 0
        ]);

        doc.autoTable({
          startY: yPos,
          head: [['Cliente', 'Localização', 'Última Proposta', 'Total Histórico']],
          body: tableData,
          styles: { fontSize: 8 },
          headStyles: { fillColor: corPrimaria, textColor: 255, fontStyle: 'bold' },
          margin: { left: 20, right: 20 },
        });

        yPos = doc.lastAutoTable.finalY + 15;
      }

      // 8. Análise de Origem de Busca
      if (dados.insights?.origemBusca && dados.insights.origemBusca.length > 0) {
        addSectionTitle('Análise de Origem de Busca (Marketing)', 16);
        
        const tableData = dados.insights.origemBusca.map(origem => [
          origem.origem_busca || '-',
          origem.total || 0,
          formatCurrency(origem.valor_aprovado || 0),
          formatPercent(origem.taxa_conversao || 0)
        ]);

        doc.autoTable({
          startY: yPos,
          head: [['Origem', 'Total', 'Valor Aprovado', 'Taxa Conversão']],
          body: tableData,
          styles: { fontSize: 9 },
          headStyles: { fillColor: corPrimaria, textColor: 255, fontStyle: 'bold' },
          margin: { left: 20, right: 20 },
        });

        yPos = doc.lastAutoTable.finalY + 15;
      }

      // 9. Clientes Elegíveis para Visita Técnica (com filtros aplicados)
      if (visitasTecnicas && visitasTecnicas.elegiveis && visitasTecnicas.elegiveis.length > 0) {
        addSectionTitle('Clientes Elegíveis para Visita Técnica', 16);
        
        // Aplicar os mesmos filtros que estão na tela
        let elegiveisFiltrados = visitasTecnicas.elegiveis.filter(cliente => {
          if (filtroCliente) {
            const busca = filtroCliente.toLowerCase();
            const matchNome = (
              cliente.razao_social?.toLowerCase().includes(busca) ||
              cliente.nome_fantasia?.toLowerCase().includes(busca) ||
              cliente.cidade?.toLowerCase().includes(busca) ||
              cliente.estado?.toLowerCase().includes(busca)
            );
            if (!matchNome) return false;
          }
          
          if (filtroPrioridade !== 'todas' && cliente.prioridade !== filtroPrioridade) {
            return false;
          }
          
          if (filtroEstado !== 'todos' && cliente.estado !== filtroEstado) {
            return false;
          }
          
          if (filtroTaxaConversao !== 'todas') {
            const taxa = cliente.taxa_conversao || 0;
            switch (filtroTaxaConversao) {
              case 'alta':
                if (taxa < 30) return false;
                break;
              case 'media':
                if (taxa < 20 || taxa >= 30) return false;
                break;
              case 'baixa':
                if (taxa < 10 || taxa >= 20) return false;
                break;
              case 'muito-baixa':
                if (taxa >= 10) return false;
                break;
            }
          }
          
          return true;
        });

        const tableData = elegiveisFiltrados.map(cliente => [
          (cliente.razao_social || '-').substring(0, 40),
          cliente.cidade && cliente.estado ? `${cliente.cidade}, ${cliente.estado}` : '-',
          formatPercent(cliente.taxa_conversao || 0),
          cliente.total_propostas || 0,
          formatCurrency(cliente.valor_total_aprovado || 0),
          cliente.valor_visita ? formatCurrency(cliente.valor_visita.valor || 0) : '-',
          cliente.prioridade || '-'
        ]);

        doc.autoTable({
          startY: yPos,
          head: [['Cliente', 'Localização', 'Taxa Conv.', 'Propostas', 'Valor Aprovado', 'Valor Visita', 'Prioridade']],
          body: tableData,
          styles: { fontSize: 7 },
          headStyles: { fillColor: corPrimaria, textColor: 255, fontStyle: 'bold' },
          margin: { left: 20, right: 20 },
          columnStyles: {
            0: { cellWidth: 50 },
            1: { cellWidth: 30 },
            2: { cellWidth: 20 },
            3: { cellWidth: 20 },
            4: { cellWidth: 25 },
            5: { cellWidth: 25 },
            6: { cellWidth: 20 }
          }
        });

        yPos = doc.lastAutoTable.finalY + 15;
      }

      // 10. Clientes Não Elegíveis
      if (visitasTecnicas && visitasTecnicas.naoElegiveis && visitasTecnicas.naoElegiveis.length > 0) {
        addSectionTitle('Clientes Não Elegíveis', 16);
        
        // Aplicar filtros
        let naoElegiveisFiltrados = visitasTecnicas.naoElegiveis.filter(cliente => {
          if (filtroCliente) {
            const busca = filtroCliente.toLowerCase();
            const matchNome = (
              cliente.razao_social?.toLowerCase().includes(busca) ||
              cliente.nome_fantasia?.toLowerCase().includes(busca) ||
              cliente.cidade?.toLowerCase().includes(busca) ||
              cliente.estado?.toLowerCase().includes(busca)
            );
            if (!matchNome) return false;
          }
          
          if (filtroEstado !== 'todos' && cliente.estado !== filtroEstado) {
            return false;
          }
          
          if (filtroTaxaConversao !== 'todas') {
            const taxa = cliente.taxa_conversao || 0;
            switch (filtroTaxaConversao) {
              case 'alta':
                if (taxa < 30) return false;
                break;
              case 'media':
                if (taxa < 20 || taxa >= 30) return false;
                break;
              case 'baixa':
                if (taxa < 10 || taxa >= 20) return false;
                break;
              case 'muito-baixa':
                if (taxa >= 10) return false;
                break;
            }
          }
          
          return true;
        });

        const tableData = naoElegiveisFiltrados.slice(0, 30).map(cliente => [
          (cliente.razao_social || '-').substring(0, 40),
          cliente.cidade && cliente.estado ? `${cliente.cidade}, ${cliente.estado}` : '-',
          formatPercent(cliente.taxa_conversao || 0),
          cliente.total_propostas || 0,
          cliente.motivoBloqueio ? cliente.motivoBloqueio.substring(0, 60) : '-'
        ]);

        doc.autoTable({
          startY: yPos,
          head: [['Cliente', 'Localização', 'Taxa Conv.', 'Propostas', 'Motivo do Bloqueio']],
          body: tableData,
          styles: { fontSize: 7 },
          headStyles: { fillColor: [200, 0, 0], textColor: 255, fontStyle: 'bold' },
          margin: { left: 20, right: 20 },
        });

        yPos = doc.lastAutoTable.finalY + 15;
      }

      // 11. Insights e Recomendações
      if (dados.recomendacoes && dados.recomendacoes.length > 0) {
        addSectionTitle('Insights Estratégicos e Recomendações', 16);
        
        dados.recomendacoes.forEach((rec, index) => {
          checkNewPage(40);
          
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.text(`${index + 1}. ${rec.titulo}`, 25, yPos);
          yPos += 7;
          
          doc.setFontSize(10);
          doc.setFont('helvetica', 'normal');
          const descLines = doc.splitTextToSize(rec.descricao || '', pageWidth - 50);
          doc.text(descLines, 25, yPos);
          yPos += descLines.length * 5 + 3;
          
          doc.setFont('helvetica', 'bold');
          doc.text('Ação Recomendada:', 25, yPos);
          yPos += 6;
          
          doc.setFont('helvetica', 'normal');
          const acaoLines = doc.splitTextToSize(rec.acao || '', pageWidth - 50);
          doc.text(acaoLines, 25, yPos);
          yPos += acaoLines.length * 5 + 8;
        });
      }

      // Rodapé em todas as páginas
      const totalPages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(128, 128, 128);
        doc.text(
          `Página ${i} de ${totalPages} - GMP INDUSTRIAIS - Relatórios Executivos`,
          pageWidth / 2,
          pageHeight - 10,
          { align: 'center' }
        );
      }

      // Salvar PDF
      const fileName = `Relatorios_GMP_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      alert('Erro ao gerar PDF. Por favor, tente novamente.');
    }
  };

  if (loading) {
    return (
      <div className="relatorios-loading">
        <div className="loading-spinner"></div>
        <p>Carregando relatórios executivos...</p>
      </div>
    );
  }

  if (error || !dados) {
    return (
      <div className="relatorios-error">
        <FiAlertCircle />
        <p>{error || 'Erro ao carregar relatórios'}</p>
        <button onClick={loadRelatorios} className="btn-retry">
          <FiRefreshCw /> Tentar Novamente
        </button>
      </div>
    );
  }

  const COLORS = ['#0066cc', '#00a8e8', '#0052a3', '#003d7a', '#00c853', '#ff9800', '#f44336'];

  return (
    <div className="relatorios">
      <div className="relatorios-header">
        <div>
          <h1>Relatórios Executivos</h1>
          <p>Análise estratégica e insights para tomada de decisão</p>
        </div>
        <div className="header-actions">
          <button onClick={loadRelatorios} className="btn-refresh">
            <FiRefreshCw /> Atualizar
          </button>
          <button onClick={() => setReportBuilderOpen(true)} className="btn-secondary">
            <FiBarChart2 /> Criar Relatório
          </button>
          <button onClick={() => setWorkflowEngineOpen(true)} className="btn-secondary">
            <FiSettings /> Workflows
          </button>
          <button onClick={handleExportPDF} className="btn-export">
            <FiDownload /> Exportar PDF
          </button>
        </div>
      </div>

      {/* KPIs Principais */}
      <div className="kpis-grid">
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: 'linear-gradient(135deg, #0066cc, #0052a3)' }}>
            <FiUsers />
          </div>
          <div className="kpi-content">
            <p className="kpi-label">Clientes Ativos</p>
            <h3 className="kpi-value">{dados.kpis?.totalClientes || 0}</h3>
            <span className="kpi-trend positive">
              <FiTrendingUp /> Base de clientes
            </span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: 'linear-gradient(135deg, #00c853, #00a844)' }}>
            <FiCheckCircle />
          </div>
          <div className="kpi-content">
            <p className="kpi-label">Propostas Aprovadas</p>
            <h3 className="kpi-value">{dados.kpis?.propostasAprovadas || 0}</h3>
            <span className="kpi-trend positive">
              <FiTrendingUp /> Vendas fechadas
            </span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: 'linear-gradient(135deg, #ff9800, #f57c00)' }}>
            <FiDollarSign />
          </div>
          <div className="kpi-content">
            <p className="kpi-label">Faturamento Total</p>
            <h3 className="kpi-value">{formatCurrency(dados.kpis?.faturamentoTotal)}</h3>
            <span className="kpi-trend positive">
              <FiTrendingUp /> Receita aprovada
            </span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: 'linear-gradient(135deg, #00a8e8, #0088cc)' }}>
            <FiBarChart2 />
          </div>
          <div className="kpi-content">
            <p className="kpi-label">Taxa de Conversão</p>
            <h3 className="kpi-value">{formatPercent(dados.kpis?.taxaConversao)}</h3>
            <span className={`kpi-trend ${(dados.kpis?.taxaConversao || 0) >= 30 ? 'positive' : 'negative'}`}>
              {(dados.kpis?.taxaConversao || 0) >= 30 ? <FiTrendingUp /> : <FiTrendingDown />}
              {(dados.kpis?.taxaConversao || 0) >= 30 ? 'Acima da média' : 'Abaixo da média'}
            </span>
          </div>
        </div>
      </div>

      {/* Mapa de Localização de Clientes */}
      {dados.graficos?.localizacoesClientes && dados.graficos.localizacoesClientes.length > 0 && (
        <div className="section-card map-section">
          <div className="section-header">
            <h2>
              <FiMapPin /> Distribuição Geográfica de Clientes
            </h2>
            <p>Visualize onde estão concentrados seus clientes no mapa do Brasil</p>
          </div>
          <div className="map-container">
            <MapaClientes 
              key="mapa-clientes"
              localizacoes={dados.graficos.localizacoesClientes}
              formatCurrency={formatCurrency}
            />
            <div className="map-legend">
              <div className="legend-item">
                <div className="legend-color" style={{ background: '#00c853' }}></div>
                <span>Alto valor (&gt; R$ 1M)</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ background: '#ff9800' }}></div>
                <span>Médio valor (&gt; R$ 500k)</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ background: '#0066cc' }}></div>
                <span>Outros valores</span>
              </div>
              <div className="legend-note">
                <small>O tamanho do círculo indica a quantidade de clientes</small>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gráficos Principais */}
      <div className="charts-section">
        <div 
          className="chart-card full-width chart-clickable" 
          onClick={() => abrirModalGrafico(
            'Evolução de Propostas',
            'Evolução completa de propostas e valores aprovados ao longo do tempo',
            'composed',
            dados.graficos?.evolucaoPropostas || [],
            ['#0066cc', '#00c853']
          )}
          style={{ cursor: 'pointer' }}
        >
          <div className="chart-header">
            <h3>
              <FiActivity /> Evolução de Propostas (Últimos 6 Meses)
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <ComposedChart data={dados.graficos?.evolucaoPropostas || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="mes" 
                tick={{ fontSize: isMobile ? 10 : 12 }}
                angle={isMobile ? -45 : 0}
                textAnchor={isMobile ? 'end' : 'middle'}
                height={isMobile ? 60 : 40}
              />
              <YAxis 
                yAxisId="left" 
                tick={{ fontSize: isMobile ? 10 : 12 }}
                width={isMobile ? 50 : 60}
              />
              <YAxis 
                yAxisId="right" 
                orientation="right"
                tick={{ fontSize: isMobile ? 10 : 12 }}
                width={isMobile ? 50 : 60}
              />
              <Tooltip />
              <Legend />
              <Bar yAxisId="left" dataKey="total" fill="#0066cc" name="Total de Propostas" />
              <Line yAxisId="right" type="monotone" dataKey="valor_aprovado" stroke="#00c853" strokeWidth={3} name="Valor Aprovado (R$)" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div 
          className="chart-card chart-clickable" 
          onClick={() => abrirModalGrafico(
            'Propostas por Status',
            'Distribuição completa de propostas por status',
            'pie',
            dados.graficos?.propostasPorStatus || [],
            COLORS
          )}
          style={{ cursor: 'pointer' }}
        >
          <div className="chart-header">
            <h3>
              <FiPieChart /> Propostas por Status
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <PieChart>
              <Pie
                data={dados.graficos?.propostasPorStatus || []}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={isMobile ? 70 : 100}
                fill="#8884d8"
                dataKey="total"
              >
                {(dados.graficos?.propostasPorStatus || []).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div 
          className="chart-card chart-clickable" 
          onClick={() => abrirModalGrafico(
            'Análise por Região',
            'Análise completa de propostas por região/estado',
            'bar',
            dados.graficos?.analiseRegiao || [],
            ['#0066cc']
          )}
          style={{ cursor: 'pointer' }}
        >
          <div className="chart-header">
            <h3>
              <FiMapPin /> Análise por Região
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={(dados.graficos?.analiseRegiao || []).slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="estado" 
                tick={{ fontSize: isMobile ? 10 : 12 }}
                angle={isMobile ? -45 : 0}
                textAnchor={isMobile ? 'end' : 'middle'}
                height={isMobile ? 60 : 40}
              />
              <YAxis tick={{ fontSize: isMobile ? 10 : 12 }} width={isMobile ? 50 : 60} />
              <Tooltip />
              <Legend />
              <Bar dataKey="valor_total" fill="#0066cc" name="Valor Total (R$)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Clientes */}
      <div className="section-card">
        <div className="section-header">
          <h2>
            <FiAward /> Top 10 Clientes por Valor
          </h2>
        </div>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Estado</th>
                <th>Propostas</th>
                <th>Valor Total</th>
              </tr>
            </thead>
            <tbody>
              {(dados.graficos?.topClientes || []).map((cliente, index) => (
                <tr key={index}>
                  <td><strong>{cliente.razao_social}</strong></td>
                  <td>{cliente.estado || '-'}</td>
                  <td>{cliente.total_propostas || 0}</td>
                  <td className="valor-cell">{formatCurrency(cliente.valor_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Insights e Recomendações */}
      <div className="insights-section">
        <div className="section-header">
          <h2>
            <FiAlertCircle /> Insights Estratégicos e Recomendações
          </h2>
        </div>

        <div className="insights-grid">
          {dados.recomendacoes?.map((rec, index) => (
            <div key={index} className={`insight-card ${rec.prioridade.toLowerCase()}`}>
              <div className="insight-header">
                <div className="insight-icon">
                  {rec.tipo === 'visita' && <FiUsers />}
                  {rec.tipo === 'regiao' && <FiMapPin />}
                  {rec.tipo === 'marketing' && <FiBarChart2 />}
                  {rec.tipo === 'produto' && <FiPackage />}
                  {rec.tipo === 'estrategia' && <FiTarget />}
                </div>
                <div className="insight-badges">
                  <span className={`badge-impact ${rec.impacto.toLowerCase()}`}>
                    Impacto: {rec.impacto}
                  </span>
                  <span className={`badge-priority ${rec.prioridade.toLowerCase()}`}>
                    {rec.prioridade}
                  </span>
                </div>
              </div>
              <h3>{rec.titulo}</h3>
              <p className="insight-desc">{rec.descricao}</p>
              <div className="insight-action">
                <FiArrowRight />
                <strong>Ação Recomendada:</strong>
                <p>{rec.acao}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Análises Detalhadas */}
      <div className="analises-section">
        <div className="analise-card">
          <div className="section-header">
            <h3>
              <FiUsers /> Clientes que Precisam de Visita
            </h3>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Localização</th>
                  <th>Última Proposta</th>
                  <th>Histórico</th>
                </tr>
              </thead>
              <tbody>
                {(dados.insights?.clientesParaVisitar || []).slice(0, 10).map((cliente, index) => (
                  <tr key={index}>
                    <td><strong>{cliente.razao_social}</strong></td>
                    <td>{cliente.cidade}, {cliente.estado}</td>
                    <td>
                      {cliente.ultima_proposta
                        ? new Date(cliente.ultima_proposta).toLocaleDateString('pt-BR')
                        : 'Nunca'}
                    </td>
                    <td>{cliente.total_propostas_historico || 0} propostas</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Análise de Marketing */}
      <div className="marketing-section">
        <div className="analise-card">
          <div className="section-header">
            <h3>
              <FiBarChart2 /> Análise de Origem de Busca
            </h3>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Origem</th>
                  <th>Total</th>
                  <th>Valor Aprovado</th>
                  <th>Taxa de Conversão</th>
                </tr>
              </thead>
              <tbody>
                {(dados.insights?.origemBusca || []).map((origem, index) => (
                  <tr key={index}>
                    <td><strong>{origem.origem_busca}</strong></td>
                    <td>{origem.total}</td>
                    <td className="valor-cell">{formatCurrency(origem.valor_aprovado)}</td>
                    <td>
                      <span className={`taxa-badge ${origem.taxa_conversao >= 30 ? 'high' : origem.taxa_conversao >= 20 ? 'medium' : 'low'}`}>
                        {formatPercent(origem.taxa_conversao)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="analise-card">
          <div className="section-header">
            <h3>
              <FiPackage /> Performance por Família de Produtos
            </h3>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Família</th>
                  <th>Propostas</th>
                  <th>Valor Aprovado</th>
                  <th>Taxa de Conversão</th>
                </tr>
              </thead>
              <tbody>
                {(dados.insights?.familiaProdutos || []).map((familia, index) => (
                  <tr key={index}>
                    <td><strong>{familia.familia_produto}</strong></td>
                    <td>{familia.total_propostas}</td>
                    <td className="valor-cell">{formatCurrency(familia.valor_aprovado)}</td>
                    <td>
                      <span className={`taxa-badge ${familia.taxa_conversao >= 30 ? 'high' : familia.taxa_conversao >= 20 ? 'medium' : 'low'}`}>
                        {formatPercent(familia.taxa_conversao)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Visitas Técnicas Recomendadas */}
      <div className="section-card">
        <div className="section-header">
          <h2>
            <FiTool /> Visitas Técnicas Recomendadas
          </h2>
          <p>Sistema de elegibilidade baseado em regras de negócio</p>
        </div>

        {loadingVisitas ? (
          <div className="loading-section">
            <div className="loading-spinner"></div>
            <p>Carregando análise de visitas técnicas...</p>
          </div>
        ) : visitasTecnicas ? (
          <>
            {/* Resumo */}
            <div className="visitas-resumo">
              <div className="resumo-card elegivel">
                <div className="resumo-icon">
                  <FiCheckCircle />
                </div>
                <div className="resumo-content">
                  <h3>{visitasTecnicas.totalElegiveis || 0}</h3>
                  <p>Clientes Elegíveis</p>
                </div>
              </div>
              <div className="resumo-card nao-elegivel">
                <div className="resumo-icon">
                  <FiX />
                </div>
                <div className="resumo-content">
                  <h3>{visitasTecnicas.totalNaoElegiveis || 0}</h3>
                  <p>Clientes Não Elegíveis</p>
                </div>
              </div>
              <div className="resumo-card total">
                <div className="resumo-icon">
                  <FiUsers />
                </div>
                <div className="resumo-content">
                  <h3>{visitasTecnicas.total || 0}</h3>
                  <p>Total Analisado</p>
                </div>
              </div>
            </div>

            {/* Regras de Elegibilidade */}
            <div className="regras-section">
              <h3>Regras de Elegibilidade</h3>
              <div className="regras-grid">
                <div className="regra-card obrigatoria">
                  <div className="regra-header">
                    <FiCheckCircle className="regra-icon" />
                    <span className="regra-badge obrigatoria">Obrigatória</span>
                  </div>
                  <h4>Possuir Propostas</h4>
                  <p>Cliente deve ter pelo menos 1 proposta cadastrada</p>
                </div>
                <div className="regra-card opcional">
                  <div className="regra-header">
                    <FiTarget className="regra-icon" />
                    <span className="regra-badge opcional">Recomendada</span>
                  </div>
                  <h4>Taxa de Conversão ≥ 10%</h4>
                  <p>Taxa de conversão igual ou superior a 10% aumenta a prioridade</p>
                </div>
                <div className="regra-card obrigatoria">
                  <div className="regra-header">
                    <FiCheckCircle className="regra-icon" />
                    <span className="regra-badge obrigatoria">Obrigatória</span>
                  </div>
                  <h4>Propostas Processadas</h4>
                  <p>Deve ter pelo menos 1 proposta processada (aprovada, rejeitada ou enviada)</p>
                </div>
                <div className="regra-card opcional">
                  <div className="regra-header">
                    <FiTarget className="regra-icon" />
                    <span className="regra-badge opcional">Recomendada</span>
                  </div>
                  <h4>Valor Mínimo R$ 50.000</h4>
                  <p>Valor total aprovado acima de R$ 50.000 aumenta a prioridade</p>
                </div>
                <div className="regra-card opcional">
                  <div className="regra-header">
                    <FiActivity className="regra-icon" />
                    <span className="regra-badge opcional">Recomendada</span>
                  </div>
                  <h4>Atividade Recente</h4>
                  <p>Propostas nos últimos 90 dias aumentam a prioridade</p>
                </div>
              </div>
            </div>

            {/* Filtros Avançados */}
            <div className="visitas-filtros">
              <div className="filtros-row">
                <div className="filtro-input-wrapper">
                  <FiSearch className="filtro-icon" />
                  <input
                    type="text"
                    placeholder="Buscar cliente por nome..."
                    value={filtroCliente}
                    onChange={(e) => setFiltroCliente(e.target.value)}
                    className="filtro-input"
                  />
                </div>
                <select
                  className="filtro-select"
                  value={filtroPrioridade}
                  onChange={(e) => setFiltroPrioridade(e.target.value)}
                >
                  <option value="todas">Todas as Prioridades</option>
                  <option value="Alta">Alta</option>
                  <option value="Média">Média</option>
                  <option value="Baixa">Baixa</option>
                </select>
                <select
                  className="filtro-select"
                  value={filtroEstado}
                  onChange={(e) => setFiltroEstado(e.target.value)}
                >
                  <option value="todos">Todos os Estados</option>
                  {visitasTecnicas && [...new Set([
                    ...(visitasTecnicas.elegiveis || []).map(c => c.estado),
                    ...(visitasTecnicas.naoElegiveis || []).map(c => c.estado)
                  ].filter(Boolean))].sort().map(estado => (
                    <option key={estado} value={estado}>{estado}</option>
                  ))}
                </select>
                <select
                  className="filtro-select"
                  value={filtroTaxaConversao}
                  onChange={(e) => setFiltroTaxaConversao(e.target.value)}
                >
                  <option value="todas">Todas as Taxas</option>
                  <option value="alta">≥ 30%</option>
                  <option value="media">20% - 29%</option>
                  <option value="baixa">10% - 19%</option>
                  <option value="muito-baixa">&lt; 10%</option>
                </select>
                <select
                  className="filtro-select"
                  value={ordenacao}
                  onChange={(e) => setOrdenacao(e.target.value)}
                >
                  <option value="prioridade">Ordenar por Prioridade</option>
                  <option value="nome">Ordenar por Nome</option>
                  <option value="taxa">Ordenar por Taxa de Conversão</option>
                  <option value="valor">Ordenar por Valor Aprovado</option>
                  <option value="distancia">Ordenar por Distância</option>
                </select>
              </div>
            </div>

            {/* Clientes Elegíveis */}
            {visitasTecnicas.elegiveis && visitasTecnicas.elegiveis.length > 0 && (() => {
              let elegiveisFiltrados = visitasTecnicas.elegiveis.filter(cliente => {
                // Filtro por nome
                if (filtroCliente) {
                  const busca = filtroCliente.toLowerCase();
                  const matchNome = (
                    cliente.razao_social?.toLowerCase().includes(busca) ||
                    cliente.nome_fantasia?.toLowerCase().includes(busca) ||
                    cliente.cidade?.toLowerCase().includes(busca) ||
                    cliente.estado?.toLowerCase().includes(busca)
                  );
                  if (!matchNome) return false;
                }
                
                // Filtro por prioridade
                if (filtroPrioridade !== 'todas' && cliente.prioridade !== filtroPrioridade) {
                  return false;
                }
                
                // Filtro por estado
                if (filtroEstado !== 'todos' && cliente.estado !== filtroEstado) {
                  return false;
                }
                
                // Filtro por taxa de conversão
                if (filtroTaxaConversao !== 'todas') {
                  const taxa = cliente.taxa_conversao || 0;
                  switch (filtroTaxaConversao) {
                    case 'alta':
                      if (taxa < 30) return false;
                      break;
                    case 'media':
                      if (taxa < 20 || taxa >= 30) return false;
                      break;
                    case 'baixa':
                      if (taxa < 10 || taxa >= 20) return false;
                      break;
                    case 'muito-baixa':
                      if (taxa >= 10) return false;
                      break;
                  }
                }
                
                return true;
              });
              
              // Ordenação
              elegiveisFiltrados.sort((a, b) => {
                switch (ordenacao) {
                  case 'prioridade':
                    const ordemPrioridade = { 'Alta': 3, 'Média': 2, 'Baixa': 1 };
                    return (ordemPrioridade[b.prioridade] || 0) - (ordemPrioridade[a.prioridade] || 0);
                  case 'nome':
                    return (a.razao_social || '').localeCompare(b.razao_social || '');
                  case 'taxa':
                    return (b.taxa_conversao || 0) - (a.taxa_conversao || 0);
                  case 'valor':
                    return (b.valor_total_aprovado || 0) - (a.valor_total_aprovado || 0);
                  case 'distancia':
                    const distA = a.valor_visita?.distancia || 9999;
                    const distB = b.valor_visita?.distancia || 9999;
                    return distA - distB;
                  default:
                    return 0;
                }
              });

              return (
                <div className="visitas-lista">
                  <h3>
                    <FiCheckCircle /> Clientes Elegíveis para Visita Técnica ({elegiveisFiltrados.length})
                  </h3>
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Cliente</th>
                          <th>Localização</th>
                          <th>Taxa Conversão</th>
                          <th>Propostas</th>
                          <th>Valor Aprovado</th>
                          <th>Valor Visita Recomendado</th>
                          <th>Prioridade</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {elegiveisFiltrados.map((cliente) => (
                        <tr key={cliente.id} className={cliente.prioridade.toLowerCase()}>
                          <td>
                            <strong>{cliente.razao_social}</strong>
                            {cliente.nome_fantasia && (
                              <div className="nome-fantasia">{cliente.nome_fantasia}</div>
                            )}
                          </td>
                          <td>
                            {cliente.cidade && cliente.estado 
                              ? `${cliente.cidade}, ${cliente.estado}`
                              : '-'}
                          </td>
                          <td>
                            <span className={`taxa-badge ${cliente.taxa_conversao >= 30 ? 'high' : cliente.taxa_conversao >= 20 ? 'medium' : 'low'}`}>
                              {formatPercent(cliente.taxa_conversao)}
                            </span>
                          </td>
                          <td>{cliente.total_propostas}</td>
                          <td className="valor-cell">{formatCurrency(cliente.valor_total_aprovado)}</td>
                          <td className="valor-visita-cell">
                            {cliente.valor_visita ? (
                              <div className="valor-visita-info">
                                <div className={`valor-visita-principal ${cliente.valor_visita.noRaioComum ? 'raio-comum' : ''}`}>
                                  {formatCurrency(cliente.valor_visita.valor)}
                                  {cliente.valor_visita.noRaioComum && (
                                    <span className="raio-comum-badge">Visita Barata</span>
                                  )}
                                </div>
                                <div className="valor-visita-detalhes">
                                  <small>
                                    {cliente.valor_visita.distancia} km
                                    {cliente.valor_visita.requerEstadia && ' • Inclui estadia'}
                                    {cliente.valor_visita.noRaioComum && ' • Raio comum de atendimento'}
                                  </small>
                                </div>
                              </div>
                            ) : (
                              <span className="valor-visita-indisponivel">-</span>
                            )}
                          </td>
                          <td>
                            <span className={`prioridade-badge ${cliente.prioridade.toLowerCase()}`}>
                              {cliente.prioridade}
                            </span>
                          </td>
                          <td>
                            <span className="status-badge elegivel">
                              <FiCheck /> Elegível
                            </span>
                          </td>
                        </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {/* Clientes Não Elegíveis */}
            {visitasTecnicas.naoElegiveis && visitasTecnicas.naoElegiveis.length > 0 && (() => {
              let naoElegiveisFiltrados = visitasTecnicas.naoElegiveis.filter(cliente => {
                // Filtro por nome
                if (filtroCliente) {
                  const busca = filtroCliente.toLowerCase();
                  const matchNome = (
                    cliente.razao_social?.toLowerCase().includes(busca) ||
                    cliente.nome_fantasia?.toLowerCase().includes(busca) ||
                    cliente.cidade?.toLowerCase().includes(busca) ||
                    cliente.estado?.toLowerCase().includes(busca)
                  );
                  if (!matchNome) return false;
                }
                
                // Filtro por estado
                if (filtroEstado !== 'todos' && cliente.estado !== filtroEstado) {
                  return false;
                }
                
                // Filtro por taxa de conversão
                if (filtroTaxaConversao !== 'todas') {
                  const taxa = cliente.taxa_conversao || 0;
                  switch (filtroTaxaConversao) {
                    case 'alta':
                      if (taxa < 30) return false;
                      break;
                    case 'media':
                      if (taxa < 20 || taxa >= 30) return false;
                      break;
                    case 'baixa':
                      if (taxa < 10 || taxa >= 20) return false;
                      break;
                    case 'muito-baixa':
                      if (taxa >= 10) return false;
                      break;
                  }
                }
                
                return true;
              });
              
              // Ordenação
              naoElegiveisFiltrados.sort((a, b) => {
                switch (ordenacao) {
                  case 'nome':
                    return (a.razao_social || '').localeCompare(b.razao_social || '');
                  case 'taxa':
                    return (b.taxa_conversao || 0) - (a.taxa_conversao || 0);
                  case 'valor':
                    return (b.valor_total_aprovado || 0) - (a.valor_total_aprovado || 0);
                  case 'distancia':
                    const distA = a.valor_visita?.distancia || 9999;
                    const distB = b.valor_visita?.distancia || 9999;
                    return distA - distB;
                  default:
                    return 0;
                }
              });

              return (
                <div className="visitas-lista">
                  <h3>
                    <FiX /> Clientes Não Elegíveis ({naoElegiveisFiltrados.length})
                  </h3>
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Cliente</th>
                          <th>Localização</th>
                          <th>Taxa Conversão</th>
                          <th>Propostas</th>
                          <th>Motivo do Bloqueio</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {naoElegiveisFiltrados.map((cliente) => (
                        <tr key={cliente.id} className="nao-elegivel-row">
                          <td>
                            <strong>{cliente.razao_social}</strong>
                            {cliente.nome_fantasia && (
                              <div className="nome-fantasia">{cliente.nome_fantasia}</div>
                            )}
                          </td>
                          <td>
                            {cliente.cidade && cliente.estado 
                              ? `${cliente.cidade}, ${cliente.estado}`
                              : '-'}
                          </td>
                          <td>
                            <span className={`taxa-badge ${cliente.taxa_conversao >= 30 ? 'high' : cliente.taxa_conversao >= 20 ? 'medium' : 'low'}`}>
                              {formatPercent(cliente.taxa_conversao)}
                            </span>
                          </td>
                          <td>{cliente.total_propostas}</td>
                          <td className="motivo-bloqueio">
                            <div className="regras-status">
                              {Object.entries(cliente.regras || {}).map(([key, regra]) => (
                                <div key={key} className={`regra-status ${regra.passou ? 'passou' : 'falhou'}`}>
                                  {regra.passou ? <FiCheckCircle /> : <FiX />}
                                  <span>{regra.mensagem}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td>
                            <span className="status-badge nao-elegivel">
                              <FiX /> Não Elegível
                            </span>
                          </td>
                        </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </>
        ) : (
          <div className="no-data">
            <p>Nenhum dado disponível para análise de visitas técnicas</p>
          </div>
        )}
      </div>

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
      <ReportBuilder 
        isOpen={reportBuilderOpen} 
        onClose={() => setReportBuilderOpen(false)} 
      />
      <WorkflowEngine 
        isOpen={workflowEngineOpen} 
        onClose={() => setWorkflowEngineOpen(false)} 
      />
    </div>
  );
};

export default Relatorios;

