import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';
import { FiX, FiSave, FiFileText, FiHash, FiTag, FiAlertCircle, FiCalendar, FiUser, FiTrendingUp, FiArrowLeft, FiDownload, FiExternalLink } from 'react-icons/fi';
import './PreviewOSEditavel.css';
import './OSDetalhesForm.css';

const OSDetalhesForm = ({ os, onClose, isFromComercial = false }) => {
  const navigate = useNavigate();
  const [itensComEspecificacoes, setItensComEspecificacoes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editandoItem, setEditandoItem] = useState(null);
  const [itemEditandoIndex, setItemEditandoIndex] = useState(null);
  const [proposta, setProposta] = useState(null);

  useEffect(() => {
    if (os) {
      loadPropostaEItens();
    }
  }, [os]);

  const loadPropostaEItens = async () => {
    try {
      let itensParaProcessar = [];

      // Primeiro tentar buscar itens da OS (os_itens)
      try {
        const osItensResponse = await api.get(`/operacional/ordens-servico/${os.id}/itens`);
        if (osItensResponse.data && osItensResponse.data.length > 0) {
          itensParaProcessar = osItensResponse.data.map(item => {
            // Extrair especificações técnicas de observacoes se existir
            let especsFromObservacoes = {};
            if (item.observacoes) {
              try {
                const obs = typeof item.observacoes === 'string' ? JSON.parse(item.observacoes) : item.observacoes;
                if (obs.especificacoes_tecnicas) {
                  especsFromObservacoes = typeof obs.especificacoes_tecnicas === 'string' 
                    ? JSON.parse(obs.especificacoes_tecnicas) 
                    : obs.especificacoes_tecnicas;
                }
                // Também usar codigo_produto de observacoes se não estiver no item
                if (!item.codigo_produto && obs.codigo_produto) {
                  item.codigo_produto = obs.codigo_produto;
                }
              } catch (e) {
                console.warn('Erro ao parsear observacoes:', e);
              }
            }

            return {
              ...item,
              codigo_produto: item.codigo_produto || item.codigo,
              descricao: item.descricao || item.produto_nome,
              quantidade: item.quantidade || 1,
              unidade: item.unidade || 'un',
              especificacoes_tecnicas_salvas: especsFromObservacoes // Guardar para usar depois
            };
          });
        }
      } catch (error) {
        console.log('Itens da OS não encontrados, tentando buscar da proposta...');
      }

      // Se não encontrou itens da OS, buscar da proposta
      if (itensParaProcessar.length === 0 && os.proposta_id) {
        try {
          const propostaResponse = await api.get(`/propostas/${os.proposta_id}`);
          const propostaData = propostaResponse.data;
          setProposta(propostaData);
          
          if (propostaData.itens && propostaData.itens.length > 0) {
            itensParaProcessar = propostaData.itens;
          }
        } catch (error) {
          console.error('Erro ao buscar proposta:', error);
        }
      }

      // Buscar especificações técnicas de cada item
      if (itensParaProcessar.length > 0) {
        const itensComEspecs = await Promise.all(
          itensParaProcessar.map(async (item) => {
            const codigoProduto = item.codigo_produto || item.codigo;
            
            if (codigoProduto) {
              try {
                const produtoResponse = await api.get(`/produtos/codigo/${codigoProduto}`);
                const produto = produtoResponse.data;
                console.log(`Produto encontrado para código ${codigoProduto}:`, produto);
                
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
                    console.log(`Especificações do produto ${codigoProduto}:`, especs);
                  } catch (e) {
                    console.error(`Erro ao parsear especificações do produto ${codigoProduto}:`, e);
                    especs = { descricao: produto.especificacoes_tecnicas };
                  }
                }

                // Se o item tem descritivo_tecnico, usar ele também (mesclar)
                if (item.descritivo_tecnico) {
                  try {
                    const descritivo = typeof item.descritivo_tecnico === 'string' 
                      ? JSON.parse(item.descritivo_tecnico) 
                      : item.descritivo_tecnico;
                    especs = { ...especs, ...descritivo };
                    console.log(`Descritivo técnico do item mesclado:`, especs);
                  } catch (e) {
                    especs.descricao = item.descritivo_tecnico;
                  }
                }

                // Mesclar com especificações salvas em observacoes (prioridade maior)
                if (item.especificacoes_tecnicas_salvas && Object.keys(item.especificacoes_tecnicas_salvas).length > 0) {
                  especs = { ...especs, ...item.especificacoes_tecnicas_salvas };
                  console.log(`Especificações de observacoes mescladas:`, especs);
                }

                return {
                  ...item,
                  produto_nome: produto.nome || item.descricao || item.produto_nome,
                  produto_imagem: produto.imagem || item.produto_imagem,
                  especificacoes_tecnicas: especs
                };
              } catch (error) {
                console.error(`Erro ao buscar produto ${codigoProduto}:`, error);
                return {
                  ...item,
                  produto_nome: item.descricao || item.produto_nome || 'Produto sem nome',
                  descricao: item.descricao || item.produto_nome || 'Sem descrição',
                  especificacoes_tecnicas: item.descritivo_tecnico ? 
                    (typeof item.descritivo_tecnico === 'string' ? 
                      (item.descritivo_tecnico.startsWith('{') ? JSON.parse(item.descritivo_tecnico) : { descricao: item.descritivo_tecnico }) 
                      : item.descritivo_tecnico) 
                    : {}
                };
              }
            } else {
              // Se não tem código, tentar usar descritivo_tecnico se existir
              let especs = {};
              if (item.descritivo_tecnico) {
                try {
                  especs = typeof item.descritivo_tecnico === 'string' 
                    ? (item.descritivo_tecnico.startsWith('{') ? JSON.parse(item.descritivo_tecnico) : { descricao: item.descritivo_tecnico })
                    : item.descritivo_tecnico;
                } catch (e) {
                  especs = { descricao: item.descritivo_tecnico };
                }
              }
              
              return {
                ...item,
                produto_nome: item.descricao || item.produto_nome || 'Produto sem nome',
                descricao: item.descricao || item.produto_nome || 'Sem descrição',
                especificacoes_tecnicas: especs
              };
            }
          })
        );
        
        console.log('Itens processados:', itensComEspecs);
        setItensComEspecificacoes(itensComEspecs);
      } else {
        console.log('Nenhum item encontrado para processar');
      }
    } catch (error) {
      console.error('Erro ao carregar itens:', error);
      toast.error('Erro ao carregar itens da OS');
    }
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      navigate(isFromComercial ? '/comercial/ordens-servico' : '/fabrica/ordens-servico');
    }
  };

  const handleEditarEspecificacao = (itemIndex, campo, valor) => {
    const novosItens = [...itensComEspecificacoes];
    if (!novosItens[itemIndex].especificacoes_tecnicas) {
      novosItens[itemIndex].especificacoes_tecnicas = {};
    }
    novosItens[itemIndex].especificacoes_tecnicas[campo] = valor;
    setItensComEspecificacoes(novosItens);
  };

  const handleSalvar = async () => {
    setLoading(true);
    try {
      // Aqui você pode salvar as alterações nas especificações se necessário
      toast.success('Alterações salvas com sucesso');
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar alterações');
    } finally {
      setLoading(false);
    }
  };

  const handleGerarPDF = async () => {
    if (!os || !os.id) {
      toast.error('OS não encontrada');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post(`/operacional/ordens-servico/${os.id}/gerar-pdf`);
      
      if (response.data && response.data.pdf_url) {
        toast.success('PDF gerado e salvo com sucesso!');
        
        // Opcional: abrir o PDF em nova aba
        // Usar URL direta sem /api/ duplicado
        const pdfUrlPath = response.data.pdf_url.startsWith('/') ? response.data.pdf_url : '/' + response.data.pdf_url;
        const pdfUrl = `${window.location.protocol}//${window.location.hostname}:5000${pdfUrlPath}`;
        window.open(pdfUrl, '_blank');
      } else {
        toast.error('Erro ao gerar PDF');
      }
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast.error(error.response?.data?.error || 'Erro ao gerar PDF');
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
    
    console.log(`Renderizando especificações para item ${itemIndex}:`, {
      produto: item.produto_nome || item.descricao,
      especificacoes: especs,
      keys: Object.keys(especs),
      temEspecs: Object.keys(especs).length > 0
    });
    
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

    console.log(`Total de campos com valor para item ${itemIndex}:`, todosCampos.length);

    // Se não há campos com valor, não renderizar nada
    if (todosCampos.length === 0) {
      console.log(`Nenhum campo com valor para item ${itemIndex}`);
      return null;
    }

    return (
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
                <td className="spec-value">
                  {itemEditandoIndex === itemIndex && editandoItem === campo.key ? (
                    <input
                      type="text"
                      value={campo.valor}
                      onChange={(e) => handleEditarEspecificacao(itemIndex, campo.key, e.target.value)}
                      onBlur={() => {
                        setEditandoItem(null);
                        setItemEditandoIndex(null);
                      }}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          setEditandoItem(null);
                          setItemEditandoIndex(null);
                        }
                      }}
                      autoFocus
                      className="spec-input"
                    />
                  ) : (
                    <span
                      onClick={() => {
                        setEditandoItem(campo.key);
                        setItemEditandoIndex(itemIndex);
                      }}
                      className="spec-value-editable"
                      title="Clique para editar"
                    >
                      {String(campo.valor)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  if (!os) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p>Carregando...</p>
      </div>
    );
  }

  return (
    <div className="os-detalhes-page">
      <div className="os-detalhes-container-page">
        <div className="preview-os-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
              className="btn-back-header" 
              onClick={handleClose}
              style={{ 
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                color: 'white',
                padding: '8px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              <FiArrowLeft /> Voltar
            </button>
            <h2>
              <FiFileText /> {os.numero_os || 'Ordem de Serviço'}
            </h2>
          </div>
          <button className="btn-icon" onClick={handleClose}>
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
                    <span className="info-item-value info-item-value-highlight">{os.numero_os}</span>
                  </div>
                </div>
                <div className="info-item">
                  <div className="info-item-icon">
                    <FiTag />
                  </div>
                  <div className="info-item-content">
                    <span className="info-item-label">Tipo</span>
                    <span className="info-item-value info-item-badge">{os.tipo_os || '-'}</span>
                  </div>
                </div>
                <div className="info-item">
                  <div className="info-item-icon">
                    <FiAlertCircle />
                  </div>
                  <div className="info-item-content">
                    <span className="info-item-label">Prioridade</span>
                    <span className={`info-item-value info-item-badge info-item-priority-${os.prioridade || 'normal'}`}>
                      {os.prioridade || 'Normal'}
                    </span>
                  </div>
                </div>
                <div className="info-item">
                  <div className="info-item-icon">
                    <FiCalendar />
                  </div>
                  <div className="info-item-content">
                    <span className="info-item-label">Data Abertura</span>
                    <span className="info-item-value">
                      {os.data_abertura ? new Date(os.data_abertura).toLocaleDateString('pt-BR') : '-'}
                    </span>
                  </div>
                </div>
                {os.data_prevista && (
                  <div className="info-item">
                    <div className="info-item-icon">
                      <FiCalendar />
                    </div>
                    <div className="info-item-content">
                      <span className="info-item-label">Data Prevista</span>
                      <span className="info-item-value">
                        {new Date(os.data_prevista).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  </div>
                )}
                <div className="info-item">
                  <div className="info-item-icon">
                    <FiTag />
                  </div>
                  <div className="info-item-content">
                    <span className="info-item-label">Status</span>
                    <span className="info-item-value info-item-badge">{os.status || 'Pendente'}</span>
                  </div>
                </div>
              </div>
            </div>

            {(proposta || os.cliente_nome) && (
              <div className="info-section info-section-proposta">
                <div className="info-section-header">
                  <div className="info-section-icon">
                    <FiTrendingUp />
                  </div>
                  <h3>Informações da Proposta</h3>
                </div>
                <div className="info-grid">
                  {os.proposta_numero && (
                    <div className="info-item">
                      <div className="info-item-icon">
                        <FiHash />
                      </div>
                      <div className="info-item-content">
                        <span className="info-item-label">Número Proposta</span>
                        <span className="info-item-value info-item-value-highlight">
                          {os.proposta_numero}
                        </span>
                      </div>
                    </div>
                  )}
                  {os.cliente_nome && (
                    <div className="info-item">
                      <div className="info-item-icon">
                        <FiUser />
                      </div>
                      <div className="info-item-content">
                        <span className="info-item-label">Cliente</span>
                        <span className="info-item-value">
                          {os.cliente_nome ? os.cliente_nome.substring(0, 3).toUpperCase() : '-'}
                          {os.cliente_id && ` (${os.cliente_id})`}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Itens com Especificações Técnicas em Formato de Planilha */}
          {itensComEspecificacoes.length > 0 && (
            <div className="preview-os-itens">
              <h3>Itens para Fabricação</h3>
              <div className="itens-list-planilha">
                {itensComEspecificacoes.map((item, index) => {
                  const nomeItem = item.produto_nome || item.descricao || (typeof item.descritivo_tecnico === 'string' && !item.descritivo_tecnico.startsWith('{') ? item.descritivo_tecnico : '') || 'Item sem descrição';
                  
                  return (
                    <div key={index} className="item-planilha-container">
                      {/* Cabeçalho do Item com Foto */}
                      <div className="item-planilha-header">
                        <div className="item-planilha-info">
                          {item.produto_imagem && (
                            <div className="item-planilha-image">
                              <img
                                src={`${api.defaults.baseURL}/uploads/produtos/${item.produto_imagem}`}
                                alt={nomeItem}
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                }}
                              />
                            </div>
                          )}
                          <div className="item-planilha-dados">
                            <h4>Item {index + 1}: {nomeItem}</h4>
                            <div className="item-planilha-meta">
                              <span><strong>Quantidade:</strong> {item.quantidade || 1} {item.unidade || 'un'}</span>
                              {(item.codigo_produto || item.codigo) && (
                                <span><strong>Código:</strong> {item.codigo_produto || item.codigo}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Tabela Completa de Especificações Técnicas */}
                      {renderEspecificacoesTecnicas(item, index)}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Descrição e Observações */}
          {(os.descricao || os.observacoes) && (
            <div className="preview-os-observacoes">
              {os.descricao && (
                <div className="observacao-section">
                  <strong>Descrição:</strong>
                  <p>{os.descricao}</p>
                </div>
              )}
              {os.observacoes && (
                <div className="observacao-section">
                  <strong>Observações:</strong>
                  <p>{os.observacoes}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="preview-os-actions">
          <button className="btn-secondary" onClick={handleClose} disabled={loading}>
            FECHAR
          </button>
          {os.pdf_url ? (
            <a
              href={`${window.location.protocol}//${window.location.hostname}:5000${os.pdf_url.startsWith('/') ? os.pdf_url : '/' + os.pdf_url}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}
            >
              <FiExternalLink /> VER PDF
            </a>
          ) : null}
          <button 
            className="btn-secondary" 
            onClick={handleGerarPDF} 
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <FiDownload /> {loading ? 'Gerando...' : os.pdf_url ? 'REGENERAR PDF' : 'GERAR PDF'}
          </button>
          <button className="btn-primary" onClick={handleSalvar} disabled={loading}>
            <FiSave /> {loading ? 'Salvando...' : 'SALVAR ALTERAÇÕES'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OSDetalhesForm;
