import { db } from '../../db/database';
import { generateId } from '../helpers';
import type { Reuniao, ParticipanteReuniao } from '../../types';

export const calendarioService = {
  getAll: async (): Promise<Reuniao[]> => {
    return await db.reunioes.orderBy('dataInicio').toArray();
  },
  
  getById: async (id: string): Promise<Reuniao | undefined> => {
    return await db.reunioes.get(id);
  },
  
  getByDateRange: async (dataInicio: string, dataFim: string): Promise<Reuniao[]> => {
    return await db.reunioes
      .where('dataInicio')
      .between(dataInicio, dataFim, true, true)
      .toArray();
  },
  
  getByCliente: async (clienteId: string): Promise<Reuniao[]> => {
    return await db.reunioes.where('clienteId').equals(clienteId).toArray();
  },
  
  create: async (reuniao: Omit<Reuniao, 'id' | 'dataCriacao' | 'dataAtualizacao'>): Promise<string> => {
    const now = new Date().toISOString();
    
    const newReuniao: Reuniao = {
      ...reuniao,
      id: generateId(),
      dataCriacao: now,
      dataAtualizacao: now,
    };
    
    await db.reunioes.add(newReuniao);
    return newReuniao.id;
  },
  
  criarLinkTeams: (titulo: string, dataInicio: string, duracaoMinutos: number = 60): string => {
    // Gerar link do Teams usando o formato de URL do Microsoft Teams
    // Formato: https://teams.microsoft.com/l/meetup-join/...
    // Para produção, seria necessário usar a API do Microsoft Graph
    // Por enquanto, vamos gerar um link que pode ser usado manualmente
    
    const data = new Date(dataInicio);
    const dataFim = new Date(data.getTime() + duracaoMinutos * 60000);
    
    // Formato ISO para o calendário
    const startISO = data.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const endISO = dataFim.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    
    // Link do Teams (formato simplificado - em produção usar Microsoft Graph API)
    // Link para criar reunião do Teams
    return `https://teams.microsoft.com/l/meetup-join/19%3ameeting_${generateId().substring(0, 32)}%40thread.v2/0?context=%7b%22Tid%22%3a%22${generateId().substring(0, 36)}%22%2c%22Oid%22%3a%22${generateId().substring(0, 36)}%22%7d`;
  },
  
  gerarLinkCalendario: (reuniao: Reuniao): { google: string; outlook: string; ics: string } => {
    const start = new Date(reuniao.dataInicio);
    const end = new Date(reuniao.dataFim);
    
    const formatDate = (date: Date): string => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };
    
    const startFormatted = formatDate(start);
    const endFormatted = formatDate(end);
    const titulo = encodeURIComponent(reuniao.titulo);
    const descricao = encodeURIComponent(reuniao.descricao || '');
    const local = encodeURIComponent(reuniao.local || reuniao.linkTeams || '');
    
    // Google Calendar
    const googleLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${titulo}&dates=${startFormatted}/${endFormatted}&details=${descricao}&location=${local}`;
    
    // Outlook Calendar
    const outlookLink = `https://outlook.live.com/calendar/0/deeplink/compose?subject=${titulo}&startdt=${start.toISOString()}&enddt=${end.toISOString()}&body=${descricao}&location=${local}`;
    
    // ICS file content
    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//GMP CRM//Reuniao//PT
BEGIN:VEVENT
UID:${reuniao.id}@gmp.com
DTSTAMP:${formatDate(new Date())}
DTSTART:${startFormatted}
DTEND:${endFormatted}
SUMMARY:${reuniao.titulo}
DESCRIPTION:${reuniao.descricao || ''}
LOCATION:${reuniao.local || reuniao.linkTeams || ''}
URL:${reuniao.linkTeams || ''}
END:VEVENT
END:VCALENDAR`;
    
    return {
      google: googleLink,
      outlook: outlookLink,
      ics: `data:text/calendar;charset=utf8,${encodeURIComponent(icsContent)}`,
    };
  },
  
  update: async (id: string, updates: Partial<Reuniao>): Promise<void> => {
    await db.reunioes.update(id, {
      ...updates,
      dataAtualizacao: new Date().toISOString(),
    });
  },
  
  atualizarStatus: async (id: string, status: Reuniao['status']): Promise<void> => {
    await db.reunioes.update(id, {
      status,
      dataAtualizacao: new Date().toISOString(),
    });
  },
  
  adicionarParticipante: async (reuniaoId: string, participante: Omit<ParticipanteReuniao, 'id'>): Promise<void> => {
    const reuniao = await db.reunioes.get(reuniaoId);
    if (!reuniao) return;
    
    const newParticipante: ParticipanteReuniao = {
      ...participante,
      id: generateId(),
    };
    
    await db.reunioes.update(reuniaoId, {
      participantes: [...reuniao.participantes, newParticipante],
      dataAtualizacao: new Date().toISOString(),
    });
  },
  
  confirmarParticipante: async (reuniaoId: string, participanteId: string, confirmado: boolean): Promise<void> => {
    const reuniao = await db.reunioes.get(reuniaoId);
    if (!reuniao) return;
    
    const participantes = reuniao.participantes.map(p =>
      p.id === participanteId ? { ...p, confirmado } : p
    );
    
    await db.reunioes.update(reuniaoId, {
      participantes,
      dataAtualizacao: new Date().toISOString(),
    });
  },
  
  delete: async (id: string): Promise<void> => {
    await db.reunioes.delete(id);
  },
  
  getProximas: async (dias: number = 7): Promise<Reuniao[]> => {
    const hoje = new Date();
    const futuro = new Date();
    futuro.setDate(hoje.getDate() + dias);
    
    return await db.reunioes
      .where('dataInicio')
      .between(hoje.toISOString(), futuro.toISOString(), true, true)
      .and(r => r.status === 'agendada')
      .toArray();
  },
};

