import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Calendar as CalendarIcon, Plus, Video, MapPin, Users, Clock, ExternalLink, Download } from 'lucide-react';
import { Calendar, momentLocalizer, View, Event } from 'react-big-calendar';
import moment from 'moment';
import 'moment/locale/pt-br';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import '../styles/calendar.css';
import { calendarioService } from '../utils/services/calendarioService';
import { clienteService } from '../utils/dbService';
import { formatDateTime } from '../utils/format';
import { generateId } from '../utils/helpers';
import type { Reuniao, ParticipanteReuniao } from '../types';

moment.locale('pt-br');
const localizer = momentLocalizer(moment);

export default function CalendarioPage() {
  const [reunioes, setReunioes] = useState<Reuniao[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Reuniao | null>(null);
  const [currentView, setCurrentView] = useState<View>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [formData, setFormData] = useState({
    titulo: '',
    descricao: '',
    dataInicio: new Date().toISOString().slice(0, 16),
    dataFim: new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
    tipo: 'online' as Reuniao['tipo'],
    local: '',
    linkTeams: '',
    clienteId: '',
    oportunidadeId: '',
    projetoId: '',
    lembrete: 15,
    participantes: [] as Omit<ParticipanteReuniao, 'id'>[],
  });

  useEffect(() => {
    loadReunioes();
    loadClientes();
  }, []);

  const loadReunioes = async () => {
    try {
      const allReunioes = await calendarioService.getAll();
      setReunioes(allReunioes);
    } catch (error) {
      console.error('Erro ao carregar reuniões:', error);
    }
  };

  const loadClientes = async () => {
    try {
      const allClientes = await clienteService.getAll();
      setClientes(allClientes);
    } catch (error) {
      console.error('Erro ao carregar clientes:', error);
    }
  };

  const eventos = useMemo(() => {
    return reunioes.map(reuniao => ({
      id: reuniao.id,
      title: reuniao.titulo,
      start: new Date(reuniao.dataInicio),
      end: new Date(reuniao.dataFim),
      resource: reuniao,
    })) as Event[];
  }, [reunioes]);

  const handleSelectSlot = ({ start, end }: { start: Date; end: Date }) => {
    setFormData({
      ...formData,
      dataInicio: start.toISOString().slice(0, 16),
      dataFim: end.toISOString().slice(0, 16),
    });
    setSelectedEvent(null);
    setShowModal(true);
  };

  const handleSelectEvent = (event: Event) => {
    const reuniao = (event as any).resource as Reuniao;
    setSelectedEvent(reuniao);
    if (reuniao) {
      setFormData({
        titulo: reuniao.titulo,
        descricao: reuniao.descricao || '',
        dataInicio: new Date(reuniao.dataInicio).toISOString().slice(0, 16),
        dataFim: new Date(reuniao.dataFim).toISOString().slice(0, 16),
        tipo: reuniao.tipo,
        local: reuniao.local || '',
        linkTeams: reuniao.linkTeams || '',
        clienteId: reuniao.clienteId || '',
        oportunidadeId: reuniao.oportunidadeId || '',
        projetoId: reuniao.projetoId || '',
        lembrete: reuniao.lembrete || 15,
        participantes: reuniao.participantes.map(p => ({
          nome: p.nome,
          email: p.email,
          tipo: p.tipo,
          confirmado: p.confirmado,
        })),
      });
    }
    setShowModal(true);
  };

  const handleGerarLinkTeams = () => {
    const dataInicio = new Date(formData.dataInicio);
    const dataFim = new Date(formData.dataFim);
    const duracao = Math.round((dataFim.getTime() - dataInicio.getTime()) / 60000);
    const link = calendarioService.criarLinkTeams(formData.titulo, formData.dataInicio, duracao);
    setFormData({ ...formData, linkTeams: link });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (selectedEvent) {
        await calendarioService.update(selectedEvent.id, {
          ...formData,
          participantes: formData.participantes.map(p => ({ ...p, id: generateId() })),
        });
      } else {
        await calendarioService.create({
          ...formData,
          participantes: formData.participantes.map(p => ({ ...p, id: generateId() })),
          status: 'agendada',
        });
      }
      await loadReunioes();
      setShowModal(false);
      setSelectedEvent(null);
    } catch (error) {
      console.error('Erro ao salvar reunião:', error);
      alert('Erro ao salvar reunião');
    }
  };

  const handleDelete = async () => {
    if (selectedEvent && confirm('Tem certeza que deseja excluir esta reunião?')) {
      try {
        await calendarioService.delete(selectedEvent.id);
        await loadReunioes();
        setShowModal(false);
        setSelectedEvent(null);
      } catch (error) {
        console.error('Erro ao excluir reunião:', error);
      }
    }
  };

  const handleExportarCalendario = (reuniao: Reuniao) => {
    const links = calendarioService.gerarLinkCalendario(reuniao);
    
    // Criar e baixar arquivo ICS
    const link = document.createElement('a');
    link.href = links.ics;
    link.download = `${reuniao.titulo.replace(/\s+/g, '_')}.ics`;
    link.click();
  };

  const eventStyleGetter = (event: Event) => {
    const reuniao = (event as any).resource as Reuniao;
    let backgroundColor = '#0ea5e9';
    
    if (reuniao.tipo === 'online') backgroundColor = '#10b981';
    else if (reuniao.tipo === 'presencial') backgroundColor = '#f59e0b';
    else if (reuniao.tipo === 'hibrida') backgroundColor = '#8b5cf6';
    
    if (reuniao.status === 'cancelada') backgroundColor = '#ef4444';
    else if (reuniao.status === 'concluida') backgroundColor = '#6b7280';
    
    return {
      style: {
        backgroundColor,
        borderRadius: '4px',
        border: 'none',
        color: 'white',
        padding: '2px 4px',
      },
    };
  };

  return (
    <div>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Calendário</h1>
          <p className="mt-2 text-gray-600">Gerencie suas reuniões e eventos</p>
        </div>
        <button
          onClick={() => {
            setSelectedEvent(null);
            setFormData({
              titulo: '',
              descricao: '',
              dataInicio: new Date().toISOString().slice(0, 16),
              dataFim: new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
              tipo: 'online',
              local: '',
              linkTeams: '',
              clienteId: '',
              oportunidadeId: '',
              projetoId: '',
              lembrete: 15,
              participantes: [],
            });
            setShowModal(true);
          }}
          className="btn-primary flex items-center justify-center gap-2"
        >
          <Plus size={20} />
          <span>Nova Reunião</span>
        </button>
      </div>

      <div className="card" style={{ height: '600px' }}>
        <Calendar
          localizer={localizer}
          events={eventos}
          startAccessor="start"
          endAccessor="end"
          style={{ height: '100%' }}
          view={currentView}
          onView={setCurrentView}
          date={currentDate}
          onNavigate={setCurrentDate}
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
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
            noEventsInRange: 'Nenhum evento neste período',
          }}
        />
      </div>

      {/* Modal de Reunião */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setShowModal(false)} />
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full">
              <form onSubmit={handleSubmit} className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-gray-900">
                    {selectedEvent ? 'Editar Reunião' : 'Nova Reunião'}
                  </h2>
                  {selectedEvent && (
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="btn-danger text-sm"
                    >
                      Excluir
                    </button>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Título *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.titulo}
                      onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                      className="input"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Data/Hora Início *
                      </label>
                      <input
                        type="datetime-local"
                        required
                        value={formData.dataInicio}
                        onChange={(e) => setFormData({ ...formData, dataInicio: e.target.value })}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Data/Hora Fim *
                      </label>
                      <input
                        type="datetime-local"
                        required
                        value={formData.dataFim}
                        onChange={(e) => setFormData({ ...formData, dataFim: e.target.value })}
                        className="input"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tipo de Reunião *
                    </label>
                    <select
                      required
                      value={formData.tipo}
                      onChange={(e) => setFormData({ ...formData, tipo: e.target.value as Reuniao['tipo'] })}
                      className="input"
                    >
                      <option value="online">Online (Teams/Zoom)</option>
                      <option value="presencial">Presencial</option>
                      <option value="hibrida">Híbrida</option>
                    </select>
                  </div>

                  {formData.tipo === 'online' || formData.tipo === 'hibrida' ? (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-700">
                          Link Microsoft Teams
                        </label>
                        <button
                          type="button"
                          onClick={handleGerarLinkTeams}
                          className="btn-secondary text-sm flex items-center gap-2"
                        >
                          <Video size={16} />
                          Gerar Link Teams
                        </button>
                      </div>
                      <input
                        type="url"
                        value={formData.linkTeams}
                        onChange={(e) => setFormData({ ...formData, linkTeams: e.target.value })}
                        placeholder="https://teams.microsoft.com/..."
                        className="input"
                      />
                    </div>
                  ) : null}

                  {formData.tipo === 'presencial' || formData.tipo === 'hibrida' ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Local
                      </label>
                      <input
                        type="text"
                        value={formData.local}
                        onChange={(e) => setFormData({ ...formData, local: e.target.value })}
                        placeholder="Endereço ou sala"
                        className="input"
                      />
                    </div>
                  ) : null}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Descrição
                    </label>
                    <textarea
                      value={formData.descricao}
                      onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                      className="input"
                      rows={3}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Cliente (opcional)
                    </label>
                    <select
                      value={formData.clienteId}
                      onChange={(e) => setFormData({ ...formData, clienteId: e.target.value })}
                      className="input"
                    >
                      <option value="">Selecione um cliente</option>
                      {clientes.map((cliente) => (
                        <option key={cliente.id} value={cliente.id}>
                          {cliente.nome}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Lembrete (minutos antes)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.lembrete}
                      onChange={(e) => setFormData({ ...formData, lembrete: parseInt(e.target.value) || 0 })}
                      className="input"
                    />
                  </div>
                </div>

                <div className="mt-6 flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      setSelectedEvent(null);
                    }}
                    className="btn-secondary"
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="btn-primary">
                    {selectedEvent ? 'Salvar' : 'Criar Reunião'}
                  </button>
                </div>

                {(selectedEvent || formData.linkTeams) && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="flex items-center gap-2 flex-wrap">
                      {formData.linkTeams && (
                        <a
                          href={formData.linkTeams}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary flex items-center gap-2"
                        >
                          <ExternalLink size={16} />
                          Abrir no Teams
                        </a>
                      )}
                      {selectedEvent && (
                        <button
                          type="button"
                          onClick={() => handleExportarCalendario(selectedEvent)}
                          className="btn-secondary flex items-center gap-2"
                        >
                          <Download size={16} />
                          Exportar para Calendário
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

