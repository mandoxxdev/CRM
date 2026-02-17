import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { toast } from 'react-toastify';
import { FiFilter, FiX, FiAlertCircle, FiClock, FiCalendar, FiList, FiSearch } from 'react-icons/fi';
import { format } from 'date-fns';
import CalendarioAtividades from './CalendarioAtividades';
import './Atividades.css';
import './Loading.css';

const Atividades = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [atividades, setAtividades] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroUsuario, setFiltroUsuario] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');
  const [modalLembrete, setModalLembrete] = useState(null);
  const [confirmarRemocao, setConfirmarRemocao] = useState(false);
  const [visualizacao, setVisualizacao] = useState('lista'); // 'lista' ou 'calendario'
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [viewCalendario, setViewCalendario] = useState('month'); // 'month', 'week', 'day', 'agenda'
  const [dateCalendario, setDateCalendario] = useState(new Date());

  useEffect(() => {
    // Inicializar filtro com o usuário logado quando o componente carregar
    if (user?.id && !filtroUsuario) {
      setFiltroUsuario(user.id);
    }
  }, [user, filtroUsuario]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Carregar em paralelo para melhor performance
        // Se filtroUsuario for "todos", enviar parâmetro todos=true
        // Se filtroUsuario estiver vazio, não enviar parâmetro (backend mostrará apenas do usuário logado)
        // Se filtroUsuario tiver um ID, enviar responsavel_id
        const params = filtroUsuario === 'todos' ? { todos: true } : filtroUsuario ? { responsavel_id: filtroUsuario } : {};
        const [atividadesRes, usuariosRes, clientesRes] = await Promise.all([
          api.get('/atividades', { params }),
          api.get('/usuarios'),
          api.get('/clientes')
        ]);
        // Ordenar atividades: lembretes vencidos primeiro, depois por data
        const atividadesOrdenadas = (atividadesRes.data || []).sort((a, b) => {
          if (!a.data_agendada && !b.data_agendada) return 0;
          if (!a.data_agendada) return 1;
          if (!b.data_agendada) return -1;
          
          const dataA = new Date(a.data_agendada);
          const dataB = new Date(b.data_agendada);
          const hoje = new Date();
          hoje.setHours(0, 0, 0, 0);
          
          // Lembretes vencidos primeiro
          const aVencido = dataA < hoje;
          const bVencido = dataB < hoje;
          if (aVencido && !bVencido) return -1;
          if (!aVencido && bVencido) return 1;
          
          // Depois ordenar por data (mais próximos primeiro)
          return dataA - dataB;
        });
        
        setAtividades(atividadesOrdenadas);
        setUsuarios((Array.isArray(usuariosRes.data) ? usuariosRes.data : []).filter(u => u.ativo));
        setClientes(clientesRes.data || []);
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [filtroUsuario]);

  // Calcular estatísticas de lembretes
  const estatisticasLembretes = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);

    let vencidos = 0;
    let prestesAVencer = 0;

    atividades.forEach(atividade => {
      if (atividade.tipo === 'lembrete' && atividade.data_agendada) {
        try {
          let dataLembrete;
          const dataStr = String(atividade.data_agendada);
          
          if (dataStr.match(/^\d{4}-\d{2}-\d{2}/)) {
            const partes = dataStr.split('T')[0].split('-');
            dataLembrete = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));
          } else {
            dataLembrete = new Date(atividade.data_agendada);
          }
          
          dataLembrete.setHours(0, 0, 0, 0);
          
          const diffTime = dataLembrete.getTime() - hoje.getTime();
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
          
          console.log('Estatísticas - Lembrete:', {
            dataOriginal: atividade.data_agendada,
            dataFormatada: dataLembrete.toLocaleDateString('pt-BR'),
            hoje: hoje.toLocaleDateString('pt-BR'),
            diffDays,
            numeroProposta: atividade.numero_proposta || 'N/A'
          });
          
          if (diffDays < 0) {
            vencidos++;
          } else if (diffDays === 0 || diffDays === 1) {
            prestesAVencer++;
          }
        } catch (error) {
          console.error('Erro ao calcular data do lembrete:', error);
        }
      }
    });

    return { vencidos, prestesAVencer };
  }, [atividades]);

  const getTipoColor = (tipo) => {
    const colors = {
      'reuniao': '#3498db',
      'ligacao': '#2ecc71',
      'email': '#f39c12',
      'visita': '#9b59b6',
      'tarefa': '#e74c3c',
      'lembrete': '#e67e22'
    };
    return colors[tipo] || '#95a5a6';
  };


  const handleAbrirModalLembrete = (atividade) => {
    if (atividade.tipo === 'lembrete' && atividade.proposta_id) {
      setModalLembrete(atividade);
      setConfirmarRemocao(false);
    }
  };

  const handleFecharModal = () => {
    setModalLembrete(null);
    setConfirmarRemocao(false);
  };

  const handleVisualizarProposta = () => {
    if (modalLembrete && modalLembrete.proposta_id) {
      navigate(`/propostas/editar/${modalLembrete.proposta_id}`);
      handleFecharModal();
    }
  };

  const handleRemoverLembrete = async () => {
    if (!confirmarRemocao) {
      setConfirmarRemocao(true);
      return;
    }

    if (!modalLembrete || !modalLembrete.proposta_id) {
      return;
    }

    try {
      await api.put(`/propostas/${modalLembrete.proposta_id}/remover-lembrete`);
      
      // Recarregar atividades
      const [atividadesRes] = await Promise.all([
        api.get('/atividades', { params: filtroUsuario ? { responsavel_id: filtroUsuario } : {} })
      ]);
      
      const atividadesOrdenadas = (atividadesRes.data || []).sort((a, b) => {
        if (!a.data_agendada && !b.data_agendada) return 0;
        if (!a.data_agendada) return 1;
        if (!b.data_agendada) return -1;
        
        const dataA = new Date(a.data_agendada);
        const dataB = new Date(b.data_agendada);
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        
        const aVencido = dataA < hoje;
        const bVencido = dataB < hoje;
        if (aVencido && !bVencido) return -1;
        if (!aVencido && bVencido) return 1;
        
        return dataA - dataB;
      });
      
      setAtividades(atividadesOrdenadas);
      handleFecharModal();
    } catch (error) {
      console.error('Erro ao remover lembrete:', error);
      alert('Erro ao remover lembrete. Tente novamente.');
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
        <p>Carregando atividades...</p>
      </div>
    );
  }

  return (
    <div className="atividades">
      <div className="page-header atividades-header">
        <div>
          <h1 className="atividades-title">Atividades</h1>
          <p className="atividades-subtitle">Gestão de atividades e tarefas</p>
        </div>
      </div>

      <div className="filters">
        <div className="filter-group">
          <FiFilter />
          <select
            value={filtroUsuario}
            onChange={(e) => setFiltroUsuario(e.target.value)}
            className="filter-select"
          >
            <option value="todos">Todos os responsáveis</option>
            {usuarios.map(usuario => (
              <option key={usuario.id} value={usuario.id}>
                {usuario.nome}
              </option>
            ))}
          </select>
        </div>
        
        <div className="filter-group">
          <FiSearch />
          <input
            type="text"
            placeholder="Buscar por cliente..."
            value={filtroCliente}
            onChange={(e) => setFiltroCliente(e.target.value)}
            className="filter-input"
          />
        </div>
        
        {/* Toggle de Visualização */}
        <div className="visualizacao-toggle">
          <button
            className={`toggle-btn ${visualizacao === 'lista' ? 'active' : ''}`}
            onClick={() => setVisualizacao('lista')}
            title="Visualização em Lista"
          >
            <FiList /> Lista
          </button>
          <button
            className={`toggle-btn ${visualizacao === 'calendario' ? 'active' : ''}`}
            onClick={() => setVisualizacao('calendario')}
            title="Visualização em Calendário"
          >
            <FiCalendar /> Calendário
          </button>
        </div>
      </div>

      {/* Cards de Estatísticas de Lembretes */}
      <div className="lembretes-stats">
        <div className={`stat-card stat-card-vencido ${estatisticasLembretes.vencidos === 0 ? 'stat-card-empty' : ''}`}>
          <div className="stat-icon">
            <FiAlertCircle />
          </div>
          <div className="stat-content">
            <div className="stat-value">{estatisticasLembretes.vencidos}</div>
            <div className="stat-label">Lembretes Vencidos</div>
          </div>
        </div>
        <div className={`stat-card stat-card-proximo ${estatisticasLembretes.prestesAVencer === 0 ? 'stat-card-empty' : ''}`}>
          <div className="stat-icon">
            <FiClock />
          </div>
          <div className="stat-content">
            <div className="stat-value">{estatisticasLembretes.prestesAVencer}</div>
            <div className="stat-label">Prestes a Vencer</div>
          </div>
        </div>
      </div>

      {/* Visualização: Calendário ou Lista */}
      {visualizacao === 'calendario' ? (
        <CalendarioAtividades
          atividades={atividades}
          onSelectEvent={(event) => {
            if (event.resource.tipo === 'lembrete') {
              handleAbrirModalLembrete(event.resource);
            }
          }}
          view={viewCalendario}
          onViewChange={setViewCalendario}
          date={dateCalendario}
          onNavigate={setDateCalendario}
          filtroTipo={filtroTipo}
          onFiltroTipoChange={setFiltroTipo}
          onEventCreate={async (dados) => {
            try {
              await api.post('/atividades', dados);
              toast.success('Atividade criada com sucesso!');
              // Recarregar atividades
              const params = filtroUsuario === 'todos' ? { todos: true } : filtroUsuario ? { responsavel_id: filtroUsuario } : {};
              const atividadesRes = await api.get('/atividades', { params });
              const atividadesOrdenadas = (atividadesRes.data || []).sort((a, b) => {
                if (!a.data_agendada && !b.data_agendada) return 0;
                if (!a.data_agendada) return 1;
                if (!b.data_agendada) return -1;
                const dataA = new Date(a.data_agendada);
                const dataB = new Date(b.data_agendada);
                return dataA - dataB;
              });
              setAtividades(atividadesOrdenadas);
            } catch (error) {
              console.error('Erro ao criar atividade:', error);
              toast.error('Erro ao criar atividade. Tente novamente.');
            }
          }}
          onEventUpdate={async (id, dados) => {
            try {
              await api.put(`/atividades/${id}`, dados);
              toast.success('Atividade atualizada com sucesso!');
              // Recarregar atividades
              const params = filtroUsuario === 'todos' ? { todos: true } : filtroUsuario ? { responsavel_id: filtroUsuario } : {};
              const atividadesRes = await api.get('/atividades', { params });
              const atividadesOrdenadas = (atividadesRes.data || []).sort((a, b) => {
                if (!a.data_agendada && !b.data_agendada) return 0;
                if (!a.data_agendada) return 1;
                if (!b.data_agendada) return -1;
                const dataA = new Date(a.data_agendada);
                const dataB = new Date(b.data_agendada);
                return dataA - dataB;
              });
              setAtividades(atividadesOrdenadas);
            } catch (error) {
              console.error('Erro ao atualizar atividade:', error);
              toast.error('Erro ao atualizar atividade. Tente novamente.');
            }
          }}
          onEventDelete={async (id) => {
            try {
              await api.delete(`/atividades/${id}`);
              toast.success('Atividade excluída com sucesso!');
              // Recarregar atividades
              const params = filtroUsuario === 'todos' ? { todos: true } : filtroUsuario ? { responsavel_id: filtroUsuario } : {};
              const atividadesRes = await api.get('/atividades', { params });
              const atividadesOrdenadas = (atividadesRes.data || []).sort((a, b) => {
                if (!a.data_agendada && !b.data_agendada) return 0;
                if (!a.data_agendada) return 1;
                if (!b.data_agendada) return -1;
                const dataA = new Date(a.data_agendada);
                const dataB = new Date(b.data_agendada);
                return dataA - dataB;
              });
              setAtividades(atividadesOrdenadas);
            } catch (error) {
              console.error('Erro ao excluir atividade:', error);
              toast.error('Erro ao excluir atividade. Tente novamente.');
            }
          }}
          clientes={clientes}
          usuarios={usuarios}
        />
      ) : (
        <div className="atividades-list">
          {atividades.filter(atividade => {
            if (!filtroCliente) return true;
            return atividade.cliente_nome && 
                   atividade.cliente_nome.toLowerCase().includes(filtroCliente.toLowerCase());
          }).length === 0 ? (
            <div className="no-data">Nenhuma atividade encontrada</div>
          ) : (
            atividades.filter(atividade => {
              if (!filtroCliente) return true;
              return atividade.cliente_nome && 
                     atividade.cliente_nome.toLowerCase().includes(filtroCliente.toLowerCase());
            }).map((atividade, index) => {
            const hoje = new Date();
            hoje.setHours(0, 0, 0, 0);
            
            // Calcular diferença de dias para lembretes
            let classeUrgencia = '';
            if (atividade.tipo === 'lembrete' && atividade.data_agendada) {
              try {
                // Parse da data - pode vir como string "YYYY-MM-DD" ou como Date
                let dataLembreteFormatada;
                const dataStr = String(atividade.data_agendada);
                
                // Se for string no formato "YYYY-MM-DD", parsear manualmente
                if (dataStr.match(/^\d{4}-\d{2}-\d{2}/)) {
                  const partes = dataStr.split('T')[0].split('-');
                  // Criar data no timezone local (evita problemas de UTC)
                  dataLembreteFormatada = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));
                } else {
                  dataLembreteFormatada = new Date(atividade.data_agendada);
                }
                
                // Garantir que ambas as datas estão no mesmo timezone (meia-noite local)
                dataLembreteFormatada.setHours(0, 0, 0, 0);
                
                // Calcular diferença em dias
                const diffTime = dataLembreteFormatada.getTime() - hoje.getTime();
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                
                // Debug para verificar cálculo
                if (diffDays < 0) {
                  console.log('Lembrete vencido detectado:', {
                    dataOriginal: atividade.data_agendada,
                    dataFormatada: dataLembreteFormatada.toLocaleDateString('pt-BR'),
                    hoje: hoje.toLocaleDateString('pt-BR'),
                    diffDays,
                    numeroProposta: atividade.numero_proposta
                  });
                }
                
                // Vence amanhã: piscar bem fraquinho
                if (diffDays === 1) {
                  classeUrgencia = 'lembrete-proximo';
                }
                // Vence hoje: também piscar
                else if (diffDays === 0) {
                  classeUrgencia = 'lembrete-hoje';
                }
                // Vencido há 1-3 dias: vermelho médio
                else if (diffDays < 0 && diffDays >= -3) {
                  classeUrgencia = 'lembrete-vencido-medio';
                }
                // Vencido há mais de 3 dias: vermelho forte
                else if (diffDays < -3) {
                  classeUrgencia = 'lembrete-vencido-forte';
                }
              } catch (error) {
                console.error('Erro ao calcular data do lembrete:', error, atividade.data_agendada);
              }
            }
            
            return (
            <div 
              key={atividade.id} 
              className={`atividade-card ${atividade.tipo === 'lembrete' ? 'atividade-card-clickable' : ''} ${classeUrgencia} ${atividade.prioridade === 'alta' && atividade.tipo !== 'lembrete' ? 'prioridade-alta' : ''}`}
              onClick={() => handleAbrirModalLembrete(atividade)}
              style={atividade.tipo === 'lembrete' ? { cursor: 'pointer' } : {}}
            >
              <div className="atividade-header">
                <div className="atividade-tipo" style={{ background: getTipoColor(atividade.tipo) }}>
                  {atividade.tipo === 'lembrete' ? 'LEMBRETE' : atividade.tipo.toUpperCase()}
                </div>
                <div className="atividade-meta">
                  {atividade.cliente_nome && (
                    <span className="meta-item">Cliente: {atividade.cliente_nome}</span>
                  )}
                  {atividade.numero_proposta && (
                    <span className="meta-item">Proposta: {atividade.numero_proposta}</span>
                  )}
                  {atividade.responsavel_nome && (
                    <span className="meta-item">Responsável: {atividade.responsavel_nome}</span>
                  )}
                </div>
              </div>
              <div className="atividade-body">
                <h3>{atividade.titulo}</h3>
                {atividade.descricao && <p>{atividade.descricao}</p>}
              </div>
              <div className="atividade-footer">
                <div className="atividade-info">
                  {atividade.data_agendada && (
                    <span>
                      {atividade.tipo === 'lembrete' ? 'Lembrete para: ' : 'Agendada: '}
                      {format(new Date(atividade.data_agendada), 'dd/MM/yyyy')}
                    </span>
                  )}
                  <span className={`prioridade-badge ${atividade.prioridade}`}>
                    {atividade.prioridade.toUpperCase()}
                  </span>
                </div>
                <div className="atividade-footer-actions">
                  <span className={`status-badge ${atividade.status}`}>
                    {atividade.status === 'pendente' ? 'Pendente' : atividade.status === 'concluida' ? 'Concluída' : 'Pendente'}
                  </span>
                </div>
              </div>
            </div>
            );
          })
          )}
        </div>
      )}

      {/* Modal de Lembrete */}
      {modalLembrete && (
        <div className="modal-overlay" onClick={handleFecharModal}>
          <div className="modal-lembrete" onClick={(e) => e.stopPropagation()}>
            <div className="modal-lembrete-header">
              <h2>Lembrete: {modalLembrete.numero_proposta}</h2>
              <button className="modal-close" onClick={handleFecharModal}>
                <FiX />
              </button>
            </div>
            <div className="modal-lembrete-body">
              <div className="modal-lembrete-info">
                <p><strong>Cliente:</strong> {modalLembrete.cliente_nome || 'N/A'}</p>
                <p><strong>Proposta:</strong> {modalLembrete.numero_proposta}</p>
                <p><strong>Título:</strong> {modalLembrete.titulo.replace('Lembrete: ', '')}</p>
                {modalLembrete.data_agendada && (
                  <p><strong>Data do Lembrete:</strong> {format(new Date(modalLembrete.data_agendada), 'dd/MM/yyyy')}</p>
                )}
                {modalLembrete.descricao && (
                  <div className="modal-lembrete-mensagem">
                    <strong>Mensagem:</strong>
                    <p>{modalLembrete.descricao}</p>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-lembrete-footer">
              <button
                className="btn-visualizar-proposta"
                onClick={handleVisualizarProposta}
              >
                Visualizar Proposta
              </button>
              <button
                className={`btn-remover-lembrete-modal ${confirmarRemocao ? 'confirmar' : ''}`}
                onClick={handleRemoverLembrete}
              >
                {confirmarRemocao ? 'Confirmar Remoção' : 'Remover Lembrete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Atividades;

