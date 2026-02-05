import React, { useMemo, useState, useEffect } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import ptBR from 'date-fns/locale/pt-BR';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { FiCalendar, FiList, FiPlus, FiX, FiUser, FiEdit, FiTrash2 } from 'react-icons/fi';
import './CalendarioAtividades.css';

const locales = {
  'pt-BR': ptBR,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { locale: ptBR }),
  getDay,
  locales,
});

const CalendarioAtividades = ({ atividades, onSelectEvent, view, onViewChange, date, onNavigate, filtroTipo, onFiltroTipoChange, onEventCreate, onEventUpdate, onEventDelete, clientes, usuarios }) => {
  const [showModal, setShowModal] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [editingEvent, setEditingEvent] = useState(null);
  // Converter atividades para eventos do calendário
  const eventos = useMemo(() => {
    return atividades
      .filter(atividade => {
        // Filtrar por tipo se houver filtro
        if (filtroTipo && filtroTipo !== 'todos') {
          return atividade.tipo === filtroTipo;
        }
        return true;
      })
      .filter(atividade => atividade.data_agendada) // Apenas atividades com data
      .map(atividade => {
        const dataInicio = new Date(atividade.data_agendada);
        // Se não tiver hora, definir como 9h da manhã
        if (!atividade.data_agendada.includes('T') || atividade.data_agendada.split('T')[1]?.length <= 1) {
          dataInicio.setHours(9, 0, 0, 0);
        }
        
        // Duração padrão: 1 hora para atividades, 2 horas para visitas
        const dataFim = new Date(dataInicio);
        if (atividade.tipo === 'visita') {
          dataFim.setHours(dataFim.getHours() + 2);
        } else {
          dataFim.setHours(dataFim.getHours() + 1);
        }

        // Formatar título com informações adicionais
        let title = atividade.titulo;
        if (atividade.cliente_nome) {
          title = `${title} - ${atividade.cliente_nome}`;
        }
        if (atividade.numero_proposta) {
          title = `${title} (${atividade.numero_proposta})`;
        }

        return {
          id: atividade.id,
          title: title,
          start: dataInicio,
          end: dataFim,
          resource: atividade,
          tipo: atividade.tipo,
          prioridade: atividade.prioridade,
          cliente_nome: atividade.cliente_nome,
          numero_proposta: atividade.numero_proposta,
        };
      });
  }, [atividades, filtroTipo]);

  // Função para definir cor do evento baseado no tipo
  const eventStyleGetter = (event) => {
    let backgroundColor = '#3174ad';
    let borderColor = '#3174ad';
    let color = '#fff';

    switch (event.tipo) {
      case 'visita':
        backgroundColor = '#9b59b6';
        borderColor = '#8e44ad';
        break;
      case 'reuniao':
        backgroundColor = '#3498db';
        borderColor = '#2980b9';
        break;
      case 'entrega':
        backgroundColor = '#e67e22';
        borderColor = '#d35400';
        break;
      case 'lembrete':
        backgroundColor = '#e74c3c';
        borderColor = '#c0392b';
        // Se for vencido, deixar mais escuro
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const dataEvento = new Date(event.start);
        dataEvento.setHours(0, 0, 0, 0);
        if (dataEvento < hoje) {
          backgroundColor = '#c0392b';
          borderColor = '#a93226';
        }
        break;
      case 'outro':
        backgroundColor = '#95a5a6';
        borderColor = '#7f8c8d';
        break;
      default:
        backgroundColor = '#3174ad';
        borderColor = '#3174ad';
    }

    // Se for prioridade alta, adicionar borda mais grossa
    if (event.prioridade === 'alta' && event.tipo !== 'lembrete') {
      borderColor = '#f39c12';
    }

    return {
      style: {
        backgroundColor,
        borderColor,
        borderWidth: event.prioridade === 'alta' ? '3px' : '2px',
        color,
        borderRadius: '4px',
        padding: '2px 5px',
        fontSize: '12px',
      },
    };
  };


  return (
    <div className="calendario-atividades-container">
      {/* Filtros */}
      <div className="calendario-filtros">
        <div className="calendario-filtro-tipo">
          <label>Filtrar por tipo:</label>
          <select value={filtroTipo} onChange={(e) => onFiltroTipoChange(e.target.value)}>
            <option value="todos">Todos os tipos</option>
            <option value="visita">Visitas Técnicas</option>
            <option value="reuniao">Reuniões</option>
            <option value="entrega">Entregas</option>
            <option value="lembrete">Lembretes</option>
            <option value="outro">Outros</option>
          </select>
        </div>
      </div>

      {/* Legenda */}
      <div className="calendario-legenda">
        <div className="legenda-item">
          <div className="legenda-cor" style={{ backgroundColor: '#9b59b6' }}></div>
          <span>Visitas Técnicas</span>
        </div>
        <div className="legenda-item">
          <div className="legenda-cor" style={{ backgroundColor: '#3498db' }}></div>
          <span>Reuniões</span>
        </div>
        <div className="legenda-item">
          <div className="legenda-cor" style={{ backgroundColor: '#e67e22' }}></div>
          <span>Entregas</span>
        </div>
        <div className="legenda-item">
          <div className="legenda-cor" style={{ backgroundColor: '#e74c3c' }}></div>
          <span>Lembretes</span>
        </div>
        <div className="legenda-item">
          <div className="legenda-cor" style={{ backgroundColor: '#95a5a6' }}></div>
          <span>Outros</span>
        </div>
      </div>

      {/* Botão de Nova Atividade */}
      <div className="calendario-actions">
        <button 
          className="btn-nova-atividade"
          onClick={() => {
            setEditingEvent(null);
            setSelectedSlot(null);
            setShowModal(true);
          }}
        >
          <FiPlus /> Nova Atividade
        </button>
      </div>

      {/* Calendário */}
      <div className="calendario-wrapper">
        <Calendar
          localizer={localizer}
          events={eventos}
          startAccessor="start"
          endAccessor="end"
          style={{ height: 600 }}
          view={view}
          onView={onViewChange}
          date={date}
          onNavigate={onNavigate}
          onSelectEvent={(event) => {
            setEditingEvent(event);
            setShowModal(true);
            if (onSelectEvent) {
              onSelectEvent(event);
            }
          }}
          onSelectSlot={(slotInfo) => {
            setSelectedSlot(slotInfo);
            setEditingEvent(null);
            setShowModal(true);
          }}
          selectable
          eventPropGetter={eventStyleGetter}
          messages={{
            next: 'Próximo',
            previous: 'Anterior',
            today: 'Hoje',
            month: 'Mês',
            week: 'Semana',
            day: 'Dia',
            agenda: 'Agenda',
            date: 'Data',
            time: 'Hora',
            event: 'Evento',
            noEventsInRange: 'Nenhuma atividade neste período',
          }}
          culture="pt-BR"
          formats={{
            dayFormat: 'EEEE, dd/MM',
            weekdayFormat: 'EEEE',
            monthHeaderFormat: 'MMMM yyyy',
            dayHeaderFormat: 'EEEE, dd/MM',
            dayRangeHeaderFormat: ({ start, end }) => 
              `${format(start, 'dd/MM', { locale: ptBR })} - ${format(end, 'dd/MM', { locale: ptBR })}`,
          }}
          components={{
            event: CustomEvent,
          }}
        />
      </div>

      {/* Modal de Criar/Editar Atividade */}
      {showModal && (
        <ModalAtividade
          isOpen={showModal}
          onClose={() => {
            setShowModal(false);
            setEditingEvent(null);
            setSelectedSlot(null);
          }}
          event={editingEvent}
          slot={selectedSlot}
          onSave={async (dados) => {
            if (editingEvent) {
              if (onEventUpdate) {
                await onEventUpdate(editingEvent.resource.id, dados);
              }
            } else {
              if (onEventCreate) {
                await onEventCreate(dados);
              }
            }
            setShowModal(false);
            setEditingEvent(null);
            setSelectedSlot(null);
          }}
          onDelete={async () => {
            if (editingEvent && onEventDelete) {
              await onEventDelete(editingEvent.resource.id);
            }
            setShowModal(false);
            setEditingEvent(null);
            setSelectedSlot(null);
          }}
          clientes={clientes || []}
          usuarios={usuarios || []}
        />
      )}
    </div>
  );
};

// Componente de Evento Customizado
const CustomEvent = ({ event }) => {
  return (
    <div className="custom-calendar-event">
      <div className="event-title">{event.title}</div>
      {event.cliente_nome && (
        <div className="event-cliente">{event.cliente_nome}</div>
      )}
      {event.resource?.prioridade === 'alta' && (
        <div className="event-priority">⚠️ Alta</div>
      )}
    </div>
  );
};

// Modal de Criar/Editar Atividade
const ModalAtividade = ({ isOpen, onClose, event, slot, onSave, onDelete, clientes, usuarios }) => {
  const [formData, setFormData] = useState({
    titulo: '',
    descricao: '',
    tipo: 'reuniao',
    cliente_id: '',
    responsavel_id: '',
    data_agendada: '',
    hora_inicio: '09:00',
    hora_fim: '10:00',
    prioridade: 'media',
    status: 'pendente'
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (event) {
      const dataEvento = new Date(event.start);
      const dataFim = new Date(event.end);
      setFormData({
        titulo: event.resource.titulo || '',
        descricao: event.resource.descricao || '',
        tipo: event.resource.tipo || 'reuniao',
        cliente_id: event.resource.cliente_id || '',
        responsavel_id: event.resource.responsavel_id || '',
        data_agendada: format(dataEvento, 'yyyy-MM-dd'),
        hora_inicio: format(dataEvento, 'HH:mm'),
        hora_fim: format(dataFim, 'HH:mm'),
        prioridade: event.resource.prioridade || 'media',
        status: event.resource.status || 'pendente'
      });
    } else if (slot) {
      const dataSlot = slot.start;
      const dataFim = slot.end || new Date(dataSlot.getTime() + 60 * 60 * 1000);
      setFormData(prev => ({
        ...prev,
        data_agendada: format(dataSlot, 'yyyy-MM-dd'),
        hora_inicio: format(dataSlot, 'HH:mm'),
        hora_fim: format(dataFim, 'HH:mm')
      }));
    } else {
      setFormData({
        titulo: '',
        descricao: '',
        tipo: 'reuniao',
        cliente_id: '',
        responsavel_id: '',
        data_agendada: format(new Date(), 'yyyy-MM-dd'),
        hora_inicio: '09:00',
        hora_fim: '10:00',
        prioridade: 'media',
        status: 'pendente'
      });
    }
  }, [event, slot]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const dataHoraInicio = new Date(`${formData.data_agendada}T${formData.hora_inicio}`);
      const dataHoraFim = new Date(`${formData.data_agendada}T${formData.hora_fim}`);
      
      await onSave({
        ...formData,
        data_agendada: dataHoraInicio.toISOString(),
        data_fim: dataHoraFim.toISOString()
      });
    } catch (error) {
      console.error('Erro ao salvar atividade:', error);
      alert('Erro ao salvar atividade. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-atividade" onClick={(e) => e.stopPropagation()}>
        <div className="modal-atividade-header">
          <h2>{event ? 'Editar Atividade' : 'Nova Atividade'}</h2>
          <button className="modal-close" onClick={onClose}>
            <FiX />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="modal-atividade-form">
          <div className="form-group">
            <label>Título *</label>
            <input
              type="text"
              value={formData.titulo}
              onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
              required
              placeholder="Ex: Reunião com cliente"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Cliente</label>
              <select
                value={formData.cliente_id}
                onChange={(e) => setFormData({ ...formData, cliente_id: e.target.value })}
              >
                <option value="">Selecione um cliente</option>
                {clientes.map(cliente => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nome || cliente.razao_social}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Responsável</label>
              <select
                value={formData.responsavel_id}
                onChange={(e) => setFormData({ ...formData, responsavel_id: e.target.value })}
              >
                <option value="">Selecione um responsável</option>
                {usuarios.map(usuario => (
                  <option key={usuario.id} value={usuario.id}>
                    {usuario.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Tipo</label>
              <select
                value={formData.tipo}
                onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}
              >
                <option value="reuniao">Reunião</option>
                <option value="visita">Visita Técnica</option>
                <option value="entrega">Entrega</option>
                <option value="lembrete">Lembrete</option>
                <option value="outro">Outro</option>
              </select>
            </div>

            <div className="form-group">
              <label>Prioridade</label>
              <select
                value={formData.prioridade}
                onChange={(e) => setFormData({ ...formData, prioridade: e.target.value })}
              >
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Data *</label>
              <input
                type="date"
                value={formData.data_agendada}
                onChange={(e) => setFormData({ ...formData, data_agendada: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label>Hora Início</label>
              <input
                type="time"
                value={formData.hora_inicio}
                onChange={(e) => setFormData({ ...formData, hora_inicio: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>Hora Fim</label>
              <input
                type="time"
                value={formData.hora_fim}
                onChange={(e) => setFormData({ ...formData, hora_fim: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Descrição</label>
            <textarea
              value={formData.descricao}
              onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
              rows={4}
              placeholder="Detalhes da atividade..."
            />
          </div>

          <div className="modal-atividade-footer">
            {event && (
              <button
                type="button"
                className="btn-delete"
                onClick={async () => {
                  if (window.confirm('Tem certeza que deseja excluir esta atividade?')) {
                    await onDelete();
                  }
                }}
              >
                <FiTrash2 /> Excluir
              </button>
            )}
            <div className="footer-actions">
              <button type="button" className="btn-cancel" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="btn-save" disabled={loading}>
                {loading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CalendarioAtividades;
