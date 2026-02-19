import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';
import { FiX, FiSave, FiEye } from 'react-icons/fi';
import PreviewOSEditavel from './PreviewOSEditavel';
import './operacional/Operacional.css';
import './PreviewOSEditavel.css';

const OSComercialForm = ({ proposta: propostaProp, onClose }) => {
  const { propostaId } = useParams();
  const navigate = useNavigate();
  const [proposta, setProposta] = useState(propostaProp);
  const [formData, setFormData] = useState({
    numero_os: '',
    proposta_id: null,
    projeto_id: '',
    cliente_id: '',
    tipo_os: 'fabricacao',
    prioridade: 'normal',
    status: 'pendente',
    data_abertura: new Date().toISOString().split('T')[0],
    data_prevista: '',
    descricao: '',
    observacoes: '',
    responsavel_id: '',
    valor_total: 0
  });
  const [loading, setLoading] = useState(false);
  const [proximoNumero, setProximoNumero] = useState('');
  const [projetos, setProjetos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [itensComDetalhes, setItensComDetalhes] = useState([]);

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

  useEffect(() => {
    // Se veio pela rota, buscar a proposta
    if (propostaId && !proposta) {
      loadProposta();
    }
    
    if (proposta) {
      // Preencher dados da proposta
      setFormData(prev => ({
        ...prev,
        proposta_id: proposta.id,
        cliente_id: proposta.cliente_id || '',
        projeto_id: proposta.projeto_id || '',
        valor_total: proposta.valor_total || 0,
        descricao: `OS criada a partir da proposta ${proposta.numero_proposta}`,
        observacoes: `Proposta: ${proposta.numero_proposta}\nCliente: ${proposta.cliente_nome || ''}`
      }));
      // Carregar detalhes dos itens se houver
      if (proposta.itens && proposta.itens.length > 0) {
        loadItensComDetalhes(proposta.itens);
      }
    }
    loadProximoNumero();
    loadProjetos();
    loadUsuarios();
  }, [proposta, propostaId]);

  const loadProposta = async () => {
    try {
      const response = await api.get(`/propostas/${propostaId}`);
      const propostaData = response.data;
      // Buscar itens da proposta
      setProposta({ ...propostaData, itens: propostaData.itens || [] });
      // Carregar detalhes dos itens (fotos e especificações)
      if (propostaData.itens && propostaData.itens.length > 0) {
        loadItensComDetalhes(propostaData.itens);
      }
    } catch (error) {
      console.error('Erro ao carregar proposta:', error);
      toast.error('Erro ao carregar proposta');
      handleClose();
    }
  };

  const loadItensComDetalhes = async (itens) => {
    try {
      const itensComDetalhes = await Promise.all(
        itens.map(async (item) => {
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
                descricao_produto: produto.descricao || item.descricao || ''
              };
            } catch (error) {
              console.error(`Erro ao buscar produto ${item.codigo_produto}:`, error);
              return {
                ...item,
                produto_nome: item.descricao,
                produto_imagem: null,
                especificacoes_tecnicas: {},
                descricao_produto: item.descricao || ''
              };
            }
          } else {
            return {
              ...item,
              produto_nome: item.descricao,
              produto_imagem: null,
              especificacoes_tecnicas: {},
              descricao_produto: item.descricao || ''
            };
          }
        })
      );
      
      setItensComDetalhes(itensComDetalhes);
    } catch (error) {
      console.error('Erro ao carregar detalhes dos itens:', error);
    }
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      navigate('/comercial/ordens-servico');
    }
  };

  const loadProximoNumero = async () => {
    try {
      const response = await api.get('/operacional/ordens-servico/proximo-numero');
      const proximoNumeroCompleto = response.data.proximo_numero;
      // Extrair apenas o número (sem o prefixo OS-)
      const numeroSemPrefixo = proximoNumeroCompleto.replace(/^OS-?/i, '');
      setProximoNumero(numeroSemPrefixo);
      setFormData(prev => ({ ...prev, numero_os: `OS-${numeroSemPrefixo}` }));
    } catch (error) {
      console.error('Erro ao carregar próximo número:', error);
      // Se der erro, deixar vazio para preenchimento manual
      setProximoNumero('');
      setFormData(prev => ({ ...prev, numero_os: 'OS-' }));
    }
  };

  const loadProjetos = async () => {
    try {
      const response = await api.get('/projetos');
      setProjetos(response.data || []);
    } catch (error) {
      console.error('Erro ao carregar projetos:', error);
    }
  };

  const loadUsuarios = async () => {
    try {
      const response = await api.get('/usuarios/por-modulo/comercial');
      setUsuarios(response.data || []);
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Mostrar preview antes de criar
    setShowPreview(true);
  };

  const handleConfirmarOS = async (itensEditaveis) => {
    setLoading(true);

    try {
      // Garantir que proposta_id está no formData
      const formDataCompleto = {
        ...formData,
        proposta_id: formData.proposta_id || proposta?.id || null
      };
      
      // Criar a OS
      const osResponse = await api.post('/operacional/ordens-servico', formDataCompleto);
      const osId = osResponse.data.id;

      if (!osId) {
        throw new Error('ID da OS não retornado');
      }

      // Criar itens na OS com descritivo técnico editado
      if (itensEditaveis && itensEditaveis.length > 0) {
        for (const item of itensEditaveis) {
          await api.post('/operacional/os-itens', {
            os_id: osId,
            descricao: item.descritivo_editavel || item.descricao || item.produto_nome || 'Item',
            quantidade: item.quantidade || 1,
            unidade: item.unidade || 'un',
            codigo_produto: item.codigo_produto || item.codigo,
            status_item: 'pendente',
            observacoes: JSON.stringify({
              codigo_produto: item.codigo_produto || item.codigo,
              especificacoes_tecnicas: item.especificacoes_tecnicas || {},
              descritivo_original: item.descritivo_tecnico
            })
          });
        }
      } else if (proposta && proposta.itens && proposta.itens.length > 0) {
        // Fallback: criar itens sem descritivo técnico
        for (const item of proposta.itens) {
          await api.post('/operacional/os-itens', {
            os_id: osId,
            descricao: `${item.quantidade}x ${item.descricao || item.nome || 'Item'}`,
            quantidade: item.quantidade || 1,
            unidade: item.unidade || 'un',
            status_item: 'pendente'
          });
        }
      }

      // Gerar e anexar PDF em background (sem bloquear o fluxo)
      api.post(`/operacional/ordens-servico/${osId}/gerar-pdf`, {
        itens: itensEditaveis || proposta.itens || []
      }, {
        timeout: 60000 // 60 segundos de timeout para geração de PDF
      }).then((pdfResponse) => {
        if (pdfResponse.data && pdfResponse.data.pdf_url) {
          toast.success('OS criada e PDF gerado com sucesso!');
        }
      }).catch((pdfError) => {
        // Não bloquear o fluxo, o PDF pode ser gerado depois manualmente
      });

      // Mostrar toast de sucesso
      toast.success('Ordem de Serviço criada com sucesso!');
      
      // Aguardar um pouco para garantir que tudo foi salvo no banco
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Fechar e navegar de volta
      handleClose();
      
      // Aguardar navegação e então recarregar
      setTimeout(() => {
        if (window.location.pathname === '/comercial/ordens-servico') {
          window.location.reload();
        }
      }, 300);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao criar ordem de serviço');
      setLoading(false);
      setShowPreview(false);
    }
  };

  return (
    <div className="operacional-form">
      <div className="form-header">
        <h2>Nova Ordem de Serviço</h2>
        <button className="btn-icon" onClick={handleClose}>
          <FiX />
        </button>
      </div>

      {proposta && (
        <div style={{ 
          background: '#e8f5e9', 
          padding: '15px', 
          borderRadius: '8px', 
          marginBottom: '20px',
          border: '1px solid #4caf50'
        }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#2e7d32' }}>Proposta Aprovada</h3>
          <p style={{ margin: '5px 0', color: '#1b5e20' }}>
            <strong>Número:</strong> {proposta.numero_proposta}
          </p>
          <p style={{ margin: '5px 0', color: '#1b5e20' }}>
            <strong>Cliente:</strong> {proposta.cliente_nome || '-'}
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-group">
            <label>Número OS *</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ 
                padding: '8px 12px', 
                background: '#f5f5f5', 
                border: '1px solid #e0e0e0',
                borderRight: 'none',
                borderRadius: '4px 0 0 4px',
                fontWeight: '600',
                color: '#555'
              }}>
                OS-
              </span>
              <input
                type="text"
                value={formData.numero_os.replace(/^OS-?/i, '')}
                onChange={(e) => {
                  const numero = e.target.value.replace(/[^0-9]/g, ''); // Apenas números
                  setFormData({ ...formData, numero_os: `OS-${numero}` });
                }}
                placeholder="0001"
                style={{
                  flex: 1,
                  borderRadius: '0 4px 4px 0',
                  borderLeft: 'none'
                }}
                required
              />
            </div>
            <small style={{ color: '#7f8c8d', fontSize: '12px', marginTop: '4px', display: 'block' }}>
              Sugestão: {proximoNumero || '0001'}
            </small>
          </div>

          <div className="form-group">
            <label>Tipo OS *</label>
            <select
              value={formData.tipo_os}
              onChange={(e) => setFormData({ ...formData, tipo_os: e.target.value })}
              required
            >
              <option value="fabricacao">Fabricação</option>
              <option value="manutencao">Manutenção</option>
              <option value="montagem">Montagem</option>
              <option value="reparo">Reparo</option>
              <option value="outro">Outro</option>
            </select>
          </div>

          <div className="form-group">
            <label>Projeto</label>
            <select
              value={formData.projeto_id}
              onChange={(e) => setFormData({ ...formData, projeto_id: e.target.value })}
            >
              <option value="">Selecione...</option>
              {projetos.map(projeto => (
                <option key={projeto.id} value={projeto.id}>
                  {projeto.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Prioridade</label>
            <select
              value={formData.prioridade}
              onChange={(e) => setFormData({ ...formData, prioridade: e.target.value })}
            >
              <option value="baixa">Baixa</option>
              <option value="normal">Normal</option>
              <option value="alta">Alta</option>
              <option value="urgente">Urgente</option>
            </select>
          </div>

          <div className="form-group">
            <label>Status</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            >
              <option value="pendente">Pendente</option>
              <option value="em_andamento">Em Andamento</option>
              <option value="concluido">Concluído</option>
            </select>
          </div>

          <div className="form-group">
            <label>Data de Abertura *</label>
            <input
              type="date"
              value={formData.data_abertura}
              onChange={(e) => setFormData({ ...formData, data_abertura: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label>Data Prevista</label>
            <input
              type="date"
              value={formData.data_prevista}
              onChange={(e) => setFormData({ ...formData, data_prevista: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label>Responsável</label>
            <select
              value={formData.responsavel_id}
              onChange={(e) => setFormData({ ...formData, responsavel_id: e.target.value })}
            >
              <option value="">Selecione...</option>
              {usuarios.map(usuario => (
                <option key={usuario.id} value={usuario.id}>
                  {usuario.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Valor Total</label>
            <input
              type="number"
              step="0.01"
              value={formData.valor_total}
              onChange={(e) => setFormData({ ...formData, valor_total: parseFloat(e.target.value) || 0 })}
            />
          </div>
        </div>

        <div className="form-group">
          <label>Descrição</label>
          <textarea
            value={formData.descricao}
            onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
            rows="4"
          />
        </div>

        <div className="form-group">
          <label>Observações</label>
          <textarea
            value={formData.observacoes}
            onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
            rows="3"
          />
        </div>

        {/* Itens da Proposta com Fotos e Descrições Técnicas em Formato de Planilha */}
        {proposta && itensComDetalhes.length > 0 && (
          <div className="form-group" style={{ gridColumn: '1 / -1', marginTop: '20px' }}>
            <label style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', display: 'block' }}>
              Itens da Proposta
            </label>
            <div className="itens-list-planilha">
              {itensComDetalhes.map((item, index) => {
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
          </div>
        )}

        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={handleClose}>
            Cancelar
          </button>
          <button type="button" className="btn-secondary" onClick={() => setShowPreview(true)} disabled={!proposta || !proposta.itens || proposta.itens.length === 0}>
            <FiEye /> Ver Preview
          </button>
          <button type="submit" className="btn-primary" disabled={loading}>
            <FiSave /> {loading ? 'Criando...' : 'Criar OS'}
          </button>
        </div>
      </form>

      {showPreview && proposta && (
        <PreviewOSEditavel
          proposta={proposta}
          formData={formData}
          onClose={() => setShowPreview(false)}
          onConfirm={handleConfirmarOS}
        />
      )}
    </div>
  );
};

export default OSComercialForm;
