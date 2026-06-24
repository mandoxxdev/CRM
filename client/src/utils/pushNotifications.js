// Utilitário para Notificações Push no Browser

let swRegistrationPromise = null;

// Registrar Service Worker (somente produção — em dev o SW quebrava chunks do webpack)
export const registerServiceWorker = async () => {
  if (process.env.NODE_ENV === 'development') {
    return null;
  }

  if (!('serviceWorker' in navigator)) {
    return null;
  }

  if (swRegistrationPromise) {
    return swRegistrationPromise;
  }

  swRegistrationPromise = (async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        updateViaCache: 'none',
        scope: '/',
      });

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            newWorker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });

      await registration.update();
      return registration;
    } catch (error) {
      console.error('Erro ao registrar Service Worker:', error);
      swRegistrationPromise = null;
      return null;
    }
  })();

  return swRegistrationPromise;
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
    ...options,
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
      conversa_id: conversa.id,
    },
  });
};
