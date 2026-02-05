import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { 
  FiTrendingUp, FiDollarSign, FiClock, FiTarget, FiAlertCircle,
  FiCheckCircle, FiXCircle, FiFileText
} from 'react-icons/fi';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, Cell, LabelList
} from 'recharts';
import { format } from 'date-fns';
import './DashboardVendas.css';

const DashboardVendas = () => {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const response = await api.get('/dashboard/vendas');
      setDados(response.data);
      
      // Calcular porcentagens do funil
      if (response.data.funilVendas && response.data.funilVendas.length > 0) {
        const maxQuantidade = Math.max(...response.data.funilVendas.map(e => e.quantidade));
        response.data.funilVendas.forEach(etapa => {
          etapa.porcentagem = maxQuantidade > 0 ? (etapa.quantidade / maxQuantidade) * 100 : 0;
        });
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Erro ao carregar dados de vendas:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading-vendas">Carregando dados de vendas...</div>;
  }

  if (!dados) {
    return <div className="no-data-vendas">Nenhum dado disponível</div>;
  }

  const coresFunil = {
    'Rascunho': '#95a5a6',
    'Enviadas': '#3498db',
    'Aprovadas': '#27ae60',
    'Rejeitadas': '#e74c3c'
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  return (
    <div className="dashboard-vendas">
      <div className="vendas-header">
        <h2>Dashboard de Vendas</h2>
        <p>Análise completa do pipeline e previsão de fechamento</p>
      </div>

      {/* KPIs Principais */}
      <div className="vendas-kpis">
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
            <FiDollarSign />
          </div>
          <div className="kpi-content">
            <div className="kpi-value">{formatCurrency(dados.pipeline.valorTotal)}</div>
            <div className="kpi-label">Valor Total do Pipeline</div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}>
            <FiTarget />
          </div>
          <div className="kpi-content">
            <div className="kpi-value">{dados.analisePipeline.taxaConversao.toFixed(1)}%</div>
            <div className="kpi-label">Taxa de Conversão</div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }}>
            <FiClock />
          </div>
          <div className="kpi-content">
            <div className="kpi-value">{dados.analisePipeline.tempoMedioFechamento}</div>
            <div className="kpi-label">Dias Médios para Fechamento</div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' }}>
            <FiTrendingUp />
          </div>
          <div className="kpi-content">
            <div className="kpi-value">{dados.analisePipeline.totalPropostas}</div>
            <div className="kpi-label">Total de Propostas</div>
          </div>
        </div>
      </div>

      {/* Funil de Vendas */}
      <div className="vendas-section">
        <h3>Funil de Vendas</h3>
        <div className="funil-container">
          <ResponsiveContainer width="100%" height={400}>
            <BarChart
              data={dados.funilVendas}
              layout="vertical"
              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="etapa" type="category" width={100} />
              <Tooltip 
                formatter={(value, name) => {
                  if (name === 'quantidade') return [`${value} propostas`, 'Quantidade'];
                  if (name === 'valor') return [formatCurrency(value), 'Valor Total'];
                  return value;
                }}
              />
              <Legend />
              <Bar dataKey="quantidade" name="Quantidade de Propostas" fill="#667eea" radius={[0, 8, 8, 0]}>
                {dados.funilVendas.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={coresFunil[entry.etapa] || '#95a5a6'} />
                ))}
                <LabelList dataKey="quantidade" position="right" formatter={(value) => `${value} propostas`} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Tabela de detalhes do funil */}
          <div className="funil-detalhes">
            <table>
              <thead>
                <tr>
                  <th>Etapa</th>
                  <th>Quantidade</th>
                  <th>Valor Total</th>
                  <th>% do Total</th>
                </tr>
              </thead>
              <tbody>
                {dados.funilVendas.map((etapa, index) => (
                  <tr key={index}>
                    <td>
                      <div className="etapa-badge" style={{ backgroundColor: coresFunil[etapa.etapa] || '#95a5a6' }}>
                        {etapa.etapa}
                      </div>
                    </td>
                    <td>{etapa.quantidade}</td>
                    <td>{formatCurrency(etapa.valor)}</td>
                    <td>
                      <div className="porcentagem-bar">
                        <div 
                          className="porcentagem-fill" 
                          style={{ 
                            width: `${etapa.porcentagem}%`,
                            backgroundColor: coresFunil[etapa.etapa] || '#95a5a6'
                          }}
                        >
                          {etapa.porcentagem.toFixed(1)}%
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Análise de Pipeline */}
      <div className="vendas-section">
        <h3>Análise de Pipeline</h3>
        <div className="pipeline-analise">
          <div className="analise-card">
            <h4>Valor por Etapa</h4>
            <div className="valor-etapas">
              {Object.entries(dados.pipeline.valorPorEtapa).map(([etapa, valor]) => (
                <div key={etapa} className="valor-etapa-item">
                  <div className="valor-etapa-label">{etapa}</div>
                  <div className="valor-etapa-valor">{formatCurrency(valor)}</div>
                  <div 
                    className="valor-etapa-bar"
                    style={{ 
                      width: `${(valor / dados.pipeline.valorTotal) * 100}%`,
                      backgroundColor: coresFunil[etapa] || '#95a5a6'
                    }}
                  ></div>
                </div>
              ))}
            </div>
          </div>

          <div className="analise-card">
            <h4>Tempo Médio por Etapa</h4>
            <div className="tempo-etapas">
              {Object.entries(dados.pipeline.tempoMedioPorEtapa).map(([etapa, dias]) => (
                <div key={etapa} className="tempo-etapa-item">
                  <div className="tempo-etapa-label">{etapa}</div>
                  <div className="tempo-etapa-valor">{dias} dias</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Previsão de Fechamento */}
      <div className="vendas-section">
        <h3>Previsão de Fechamento</h3>
        <div className="previsao-fechamento">
          {dados.pipeline.previsaoFechamento.length === 0 ? (
            <div className="no-data">Nenhuma proposta com previsão de fechamento</div>
          ) : (
            <div className="previsao-lista">
              {dados.pipeline.previsaoFechamento.map((proposta) => (
                <div key={proposta.id} className="previsao-item">
                  <div className="previsao-header">
                    <div className="previsao-info">
                      <h4>{proposta.numero_proposta}</h4>
                      <p>{proposta.titulo}</p>
                      <span className="previsao-cliente">{proposta.cliente_nome}</span>
                    </div>
                    <div className="previsao-valor">
                      <div className="valor-principal">{formatCurrency(proposta.valor)}</div>
                      <div className="probabilidade" style={{
                        color: proposta.probabilidade >= 70 ? '#27ae60' : 
                               proposta.probabilidade >= 50 ? '#f39c12' : '#e74c3c'
                      }}>
                        {proposta.probabilidade}% de chance
                      </div>
                    </div>
                  </div>
                  <div className="previsao-footer">
                    <div className="previsao-meta">
                      <span>
                        <FiClock /> {proposta.dias_restantes} dias restantes
                      </span>
                      <span>
                        <FiFileText /> Validade: {format(new Date(proposta.validade), 'dd/MM/yyyy')}
                      </span>
                      {proposta.responsavel_nome && (
                        <span>Responsável: {proposta.responsavel_nome}</span>
                      )}
                    </div>
                    <div className="previsao-badge" style={{
                      backgroundColor: proposta.dias_restantes <= 7 ? '#e74c3c' : 
                                      proposta.dias_restantes <= 15 ? '#f39c12' : '#3498db'
                    }}>
                      {proposta.dias_restantes <= 7 ? 'Urgente' : 
                       proposta.dias_restantes <= 15 ? 'Atenção' : 'Normal'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardVendas;


