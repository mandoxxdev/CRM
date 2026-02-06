// Utilitário para Notificações Push no Browser

// Registrar Service Worker
export const registerServiceWorker = async () => {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker registrado:', registration);
      return registration;
    } catch (error) {
      console.error('Erro ao registrar Service Worker:', error);
      return null;
    }
  }
  return null;
};

// Solicitar permissão de notificação
export const requestNotificationPermission = async () => {
  if (!('Notification' in window)) {
    console.log('Este navegador não suporta notificações');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
};

// Enviar notificação local
export const showNotification = (title, options = {}) => {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  const notification = new Notification(title, {
    icon: '/logo.png',
    badge: '/logo.png',
    ...options
  });

  notification.onclick = () => {
    window.focus();
    notification.close();
  };

  return notification;
};

// Notificar sobre nova mensagem
export const notifyNewMessage = (mensagem, conversa) => {
  const title = conversa.tipo === 'grupo' 
    ? `Nova mensagem em ${conversa.nome}`
    : `Nova mensagem de ${conversa.outro_usuario?.nome || 'Usuário'}`;
  
  const body = mensagem.mensagem || 'Arquivo anexado';
  
  showNotification(title, {
    body: body.length > 100 ? body.substring(0, 100) + '...' : body,
    tag: `chat-${conversa.id}`,
    data: {
      url: `/chat?conversa=${conversa.id}`,
      conversa_id: conversa.id
    }
  });
};
