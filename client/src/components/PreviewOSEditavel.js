import React, { useState, useEffect } from 'react';
import { FiX, FiSave, FiFileText, FiEdit2, FiCheck, FiHash, FiTag, FiAlertCircle, FiCalendar, FiDollarSign, FiUser, FiTrendingUp, FiImage } from 'react-icons/fi';
import api from '../services/api';
import { toast } from 'react-toastify';
import './PreviewOSEditavel.css';

const PreviewOSEditavel = ({ proposta, formData, onClose, onConfirm }) => {
  const [itensEditaveis, setItensEditaveis] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (proposta && proposta.itens) {
      loadItensComEspecificacoes();
    }
  }, [proposta]);

  const loadItensComEspecificacoes = async () => {
    try {
      const itensComEspecs = await Promise.all(
        proposta.itens.map(async (item) => {
          if (item.codigo_produto) {
            try {
              const produtoResponse = await api.get(`/produtos/codigo/${item.codigo_produto}`);
              const produto = produtoResponse.data;
              
              // Parsear especificações técnicas
              let especs = {};
              if (produto.especificacoes_tecnicas) {
                try {
                  if (typeof produto.especificacoes_tecnicas === 'string') {
                    const trimmed = produto.especificacoes_tecnicas.trim();
                    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                      especs = JSON.parse(produto.especificacoes_tecnicas);
                    } else {
                      especs = { descricao: produto.especificacoes_tecnicas };
                    }
                  } else if (typeof produto.especificacoes_tecnicas === 'object') {
                    especs = produto.especificacoes_tecnicas;
                  }
                } catch (e) {
                  especs = { descricao: produto.especificacoes_tecnicas };
                }
              }

              return {
                ...item,
                produto_nome: produto.nome || item.descricao,
                produto_imagem: produto.imagem || null,
                especificacoes_tecnicas: especs,
                descritivo_tecnico: especs.descricao || especs.descritivo || produto.descricao || item.descricao || '',
                descritivo_editavel: especs.descricao || especs.descritivo || produto.descricao || item.descricao || ''
              };
            } catch (error) {
              console.error(`Erro ao buscar produto ${item.codigo_produto}:`, error);
              return {
                ...item,
                produto_nome: item.descricao,
                produto_imagem: null,
                especificacoes_tecnicas: {},
                descritivo_tecnico: item.descricao || '',
                descritivo_editavel: item.descricao || ''
              };
            }
          } else {
            return {
              ...item,
              produto_nome: item.descricao,
              especificacoes_tecnicas: {},
              descritivo_tecnico: item.descricao || '',
              descritivo_editavel: item.descricao || ''
            };
          }
        })
      );
      
      setItensEditaveis(itensComEspecs);
    } catch (error) {
      console.error('Erro ao carregar itens:', error);
      toast.error('Erro ao carregar especificações técnicas');
    }
  };

  // Removido: handleEditarEspecificacao - preview não permite edição

  const handleConfirmar = async () => {
    setLoading(true);
    try {
      await onConfirm(itensEditaveis);
    } catch (error) {
      console.error('Erro ao confirmar:', error);
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

  // Lista de campos de especificações técnicas
  const camposEspecificacoes = [
    { key: 'material_contato', label: 'Material de Contato' },
    { key: 'motor_central_cv', label: 'Motor Central (CV)' },
    { key: 'motoredutor_central_cv', label: 'Motorredutor Central (CV)' },
    { key: 'motores_laterais_cv', label: 'Motores Laterais (CV)' },
    { key: 'ccm_incluso', label: 'CCM Incluso' },
    { key: 'ccm_tensao', label: 'CCM Tensão' },
    { key: 'celula_carga', label: 'Célula de Carga' },
    { key: 'plc_ihm', label: 'PLC/IHM' },
    { key: 'valvula_saida_tanque', label: 'Válvula Saída Tanque' },
    { key: 'classificacao_area', label: 'Classificação Área' },
    { key: 'densidade', label: 'Densidade' },
    { key: 'viscosidade', label: 'Viscosidade' },
    { key: 'espessura', label: 'Espessura' },
    { key: 'acabamento', label: 'Acabamento' },
    { key: 'diametro', label: 'Diâmetro' },
    { key: 'furacao', label: 'Furação' },
    { key: 'funcao', label: 'Função' },
    { key: 'tratamento_termico', label: 'Tratamento Térmico' },
    { key: 'tratamento_termico_especifico', label: 'Tratamento Térmico Específico' },
    { key: 'velocidade_trabalho', label: 'Velocidade Trabalho' },
    { key: 'velocidade_trabalho_especifica', label: 'Velocidade Trabalho Específica' }
  ];

  const renderEspecificacoesTecnicas = (item, itemIndex) => {
    const especs = item.especificacoes_tecnicas || {};
    
    // Criar lista de todos os campos com valor (pré-definidos + dinâmicos)
    const todosCampos = [];
    
    // Primeiro adicionar campos pré-definidos que têm valor
    camposEspecificacoes.forEach(campo => {
      const valor = especs[campo.key];
      if (valor !== null && valor !== undefined && valor !== '') {
        todosCampos.push({ ...campo, valor });
      }
    });
    
    // Depois adicionar campos dinâmicos que não estão na lista pré-definida
    Object.keys(especs).forEach(key => {
      const valor = especs[key];
      if (valor !== null && valor !== undefined && valor !== '' && 
          !camposEspecificacoes.find(c => c.key === key)) {
        // Formatar o label do campo dinâmico (capitalizar e substituir underscores)
        const label = key
          .split('_')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        todosCampos.push({ key, label, valor });
      }
    });

    // Se não há campos com valor, não renderizar nada
    if (todosCampos.length === 0) {
      return null;
    }

    return (
      <div className="especificacoes-tecnicas-table">
        <h4>Especificações Técnicas</h4>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ 
                background: '#0066cc', 
                color: 'white', 
                padding: '12px', 
                textAlign: 'left',
                fontWeight: '700',
                fontSize: '13px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Especificação
              </th>
              <th style={{ 
                background: '#0066cc', 
                color: 'white', 
                padding: '12px', 
                textAlign: 'left',
                fontWeight: '700',
                fontSize: '13px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Valor
              </th>
            </tr>
          </thead>
          <tbody>
            {todosCampos.map((campo, idx) => (
              <tr 
                key={campo.key}
                style={{
                  background: idx % 2 === 0 ? '#ffffff' : '#f8f9fa',
                  borderBottom: '1px solid #e0e0e0'
                }}
              >
                <td style={{ 
                  padding: '12px', 
                  fontWeight: '600', 
                  color: '#333',
                  borderRight: '1px solid #e0e0e0',
                  width: '40%'
                }}>
                  {campo.label}
                </td>
                <td style={{ 
                  padding: '12px', 
                  color: '#555',
                  width: '60%'
                }}>
                  {String(campo.valor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="preview-os-overlay">
      <div className="preview-os-container">
        <div className="preview-os-header">
          <h2>
            <FiFileText /> Preview da Ordem de Serviço
          </h2>
          <button className="btn-icon" onClick={onClose}>
            <FiX />
          </button>
        </div>

        <div className="preview-os-content">
          {/* Informações da OS */}
          <div className="preview-os-info">
            <div className="info-section info-section-os">
              <div className="info-section-header">
                <div className="info-section-icon">
                  <FiFileText />
                </div>
                <h3>Informações da OS</h3>
              </div>
              <div className="info-grid">
                <div className="info-item">
                  <div className="info-item-icon">
                    <FiHash />
                  </div>
                  <div className="info-item-content">
                    <span className="info-item-label">Número OS</span>
                    <span className="info-item-value info-item-value-highlight">{formData.numero_os}</span>
                  </div>
                </div>
                <div className="info-item">
                  <div className="info-item-icon">
                    <FiTag />
                  </div>
                  <div className="info-item-content">
                    <span className="info-item-label">Tipo</span>
                    <span className="info-item-value info-item-badge">{formData.tipo_os}</span>
                  </div>
                </div>
                <div className="info-item">
                  <div className="info-item-icon">
                    <FiAlertCircle />
                  </div>
                  <div className="info-item-content">
                    <span className="info-item-label">Prioridade</span>
                    <span className={`info-item-value info-item-badge info-item-priority-${formData.prioridade}`}>
                      {formData.prioridade}
                    </span>
                  </div>
                </div>
                <div className="info-item">
                  <div className="info-item-icon">
                    <FiCalendar />
                  </div>
                  <div className="info-item-content">
                    <span className="info-item-label">Data Abertura</span>
                    <span className="info-item-value">{new Date(formData.data_abertura).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>
                {formData.data_prevista && (
                  <div className="info-item">
                    <div className="info-item-icon">
                      <FiCalendar />
                    </div>
                    <div className="info-item-content">
                      <span className="info-item-label">Data Prevista</span>
                      <span className="info-item-value">{new Date(formData.data_prevista).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>
                )}
                <div className="info-item info-item-featured">
                  <div className="info-item-icon">
                    <FiDollarSign />
                  </div>
                  <div className="info-item-content">
                    <span className="info-item-label">Valor Total</span>
                    <span className="info-item-value info-item-value-currency">{formatCurrency(formData.valor_total)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="info-section info-section-proposta">
              <div className="info-section-header">
                <div className="info-section-icon">
                  <FiTrendingUp />
                </div>
                <h3>Informações da Proposta</h3>
              </div>
              <div className="info-grid">
                <div className="info-item">
                  <div className="info-item-icon">
                    <FiHash />
                  </div>
                  <div className="info-item-content">
                    <span className="info-item-label">Número Proposta</span>
                    <span className="info-item-value info-item-value-highlight">{proposta?.numero_proposta || '-'}</span>
                  </div>
                </div>
                <div className="info-item">
                  <div className="info-item-icon">
                    <FiUser />
                  </div>
                  <div className="info-item-content">
                    <span className="info-item-label">Cliente</span>
                    <span className="info-item-value">
                      {proposta?.cliente_nome ? proposta.cliente_nome.substring(0, 3).toUpperCase() : '-'}
                      {proposta?.cliente_id && ` (${proposta.cliente_id})`}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Itens com Especificações Técnicas em Formato de Planilha */}
          <div className="preview-os-itens">
            <h3>Itens para Fabricação</h3>
            {itensEditaveis.length === 0 ? (
              <p className="no-items">Carregando itens...</p>
            ) : (
              <div className="itens-list-planilha">
                {itensEditaveis.map((item, index) => {
                  const especs = item.especificacoes_tecnicas || {};
                  const todosCampos = [];
                  
                  // Adicionar campos pré-definidos que têm valor
                  camposEspecificacoes.forEach(campo => {
                    const valor = especs[campo.key];
                    if (valor !== null && valor !== undefined && valor !== '') {
                      todosCampos.push({ ...campo, valor });
                    }
                  });
                  
                  // Adicionar campos dinâmicos
                  Object.keys(especs).forEach(key => {
                    const valor = especs[key];
                    if (valor !== null && valor !== undefined && valor !== '' && 
                        !camposEspecificacoes.find(c => c.key === key)) {
                      const label = key
                        .split('_')
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                        .join(' ');
                      todosCampos.push({ key, label, valor });
                    }
                  });

                  return (
                    <div key={index} className="item-planilha-container">
                      {/* Cabeçalho do Item com Foto */}
                      <div className="item-planilha-header">
                        <div className="item-planilha-info">
                          {item.produto_imagem && (
                            <div className="item-planilha-image">
                              <img
                                src={`${api.defaults.baseURL}/uploads/produtos/${item.produto_imagem}`}
                                alt={item.produto_nome || item.descricao}
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                }}
                              />
                            </div>
                          )}
                          <div className="item-planilha-dados">
                            <h4>Item {index + 1}: {item.produto_nome || item.descricao}</h4>
                            <div className="item-planilha-meta">
                              <span><strong>Quantidade:</strong> {item.quantidade} {item.unidade || 'un'}</span>
                              {item.codigo_produto && (
                                <span><strong>Código:</strong> {item.codigo_produto}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Tabela Completa de Especificações Técnicas */}
                      {todosCampos.length > 0 && (
                        <div className="especificacoes-tecnicas-table">
                          <h4>Especificações Técnicas</h4>
                          <table>
                            <thead>
                              <tr>
                                <th>Especificação</th>
                                <th>Valor</th>
                              </tr>
                            </thead>
                            <tbody>
                              {todosCampos.map((campo, idx) => (
                                <tr key={campo.key}>
                                  <td className="spec-label">{campo.label}</td>
                                  <td className="spec-value">{String(campo.valor)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Descrição e Observações */}
          {(formData.descricao || formData.observacoes) && (
            <div className="preview-os-observacoes">
              {formData.descricao && (
                <div className="observacao-section">
                  <strong>Descrição:</strong>
                  <p>{formData.descricao}</p>
                </div>
              )}
              {formData.observacoes && (
                <div className="observacao-section">
                  <strong>Observações:</strong>
                  <p>{formData.observacoes}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="preview-os-actions">
          <button className="btn-secondary" onClick={onClose} disabled={loading}>
            CANCELAR
          </button>
          <button className="btn-primary" onClick={handleConfirmar} disabled={loading}>
            <FiFileText /> {loading ? 'Criando OS e Gerando PDF...' : 'CONFIRMAR E CRIAR OS'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PreviewOSEditavel;
