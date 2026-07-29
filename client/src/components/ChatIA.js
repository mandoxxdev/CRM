import React, { useState, useEffect, useRef } from 'react';
import { FiSend, FiUser, FiX, FiStar, FiHelpCircle, FiCpu } from 'react-icons/fi';
import { gerarRespostaContextual, sugerirPerguntas } from '../utils/assistenteIA';
import api from '../services/api';
import './ChatIA.css';

const SUGESTOES_INICIAIS = [
  'Quantos clientes ativos temos?',
  'Como está o pipeline de oportunidades?',
  'Resumo das propostas por status',
  'Como criar uma nova proposta?',
];

const ChatIA = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [aiReady, setAiReady] = useState(null);
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setMessages([]);
      setInputValue('');
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    (async () => {
      let configured = false;
      try {
        const { data } = await api.get('/ai/status');
        configured = Boolean(data?.configured);
      } catch {
        configured = false;
      }
      if (cancelled) return;
      setAiReady(configured);

      setMessages([
        {
          id: Date.now(),
          type: 'bot',
          text: configured
            ? `Olá! Sou a assistente IA do CRM GMP (Gemini, gratuito).\n\nPosso consultar dados do sistema e ajudar a usar o CRM. Exemplos:\n• Quantos clientes ativos temos?\n• Como está o pipeline?\n• Como criar uma proposta?\n\nPergunte o que precisar.`
            : `Olá! O assistente Gemini ainda não está configurado no servidor.\n\nPara ativar (sem custo):\n1. Acesse https://aistudio.google.com/apikey\n2. Crie uma API key gratuita\n3. Defina GEMINI_API_KEY no ambiente do servidor e reinicie\n\nEnquanto isso, consigo responder dúvidas básicas de uso do CRM pelo guia local.`,
          timestamp: new Date(),
        },
      ]);
      setSuggestions(SUGESTOES_INICIAIS);
      setTimeout(() => inputRef.current?.focus(), 100);
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const buildHistory = (msgs) =>
    msgs
      .filter((m) => m.type === 'user' || m.type === 'bot')
      .slice(1)
      .map((m) => ({
        role: m.type === 'user' ? 'user' : 'model',
        text: m.text,
      }));

  const handleSend = async (textoDireto) => {
    const texto = (textoDireto ?? inputValue).trim();
    if (!texto || isTyping) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      text: texto,
      timestamp: new Date(),
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInputValue('');
    setIsTyping(true);

    let respostaTexto = '';
    let usedGemini = false;

    try {
      const history = buildHistory(messages);
      const { data } = await api.post('/ai/chat', { message: texto, history });
      respostaTexto = data?.reply || 'Não consegui gerar uma resposta.';
      usedGemini = true;
    } catch (error) {
      const code = error?.response?.data?.code;
      const apiMsg = error?.response?.data?.error;

      if (code === 'GEMINI_NOT_CONFIGURED' || error?.response?.status === 503) {
        const local = gerarRespostaContextual(texto);
        respostaTexto = `${local.resposta}\n\n—\n💡 Para respostas com dados ao vivo do CRM, configure a chave gratuita GEMINI_API_KEY (aistudio.google.com/apikey).`;
      } else if (apiMsg) {
        const local = gerarRespostaContextual(texto);
        respostaTexto = `${apiMsg}\n\nResposta local (fallback):\n${local.resposta}`;
      } else {
        const local = gerarRespostaContextual(texto);
        respostaTexto = local.resposta;
      }
    }

    const novasSugestoes = sugerirPerguntas(texto);
    setIsTyping(false);
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now() + 1,
        type: 'bot',
        text: respostaTexto,
        timestamp: new Date(),
        source: usedGemini ? 'gemini' : 'local',
      },
    ]);
    if (novasSugestoes.length > 0) {
      setSuggestions(novasSugestoes);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    handleSend(suggestion);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatarTexto = (texto) =>
    texto.split('\n').map((linha, index) => {
      if (/^\d+\./.test(linha.trim()) || /^[-•*]/.test(linha.trim())) {
        return (
          <div key={index} style={{ marginLeft: '20px', marginTop: '4px' }}>
            {linha}
          </div>
        );
      }
      if (linha.trim()) {
        return (
          <div key={index} style={{ marginTop: index > 0 ? '8px' : '0' }}>
            {linha}
          </div>
        );
      }
      return <br key={index} />;
    });

  if (!isOpen) return null;

  return (
    <div className="chat-ia-container">
      <div className="chat-ia-header">
        <div className="chat-ia-header-title">
          <div className="chat-ia-badge">
            <FiCpu />
            <span>{aiReady ? 'Gemini' : 'Assistente'}</span>
          </div>
          <h3>Assistente IA</h3>
        </div>
        <button type="button" className="chat-ia-close" onClick={onClose} aria-label="Fechar">
          <FiX />
        </button>
      </div>

      <div className="chat-ia-messages">
        {messages.map((message) => (
          <div key={message.id} className={`chat-ia-message chat-ia-message-${message.type}`}>
            <div className="chat-ia-message-avatar">
              {message.type === 'user' ? <FiUser /> : <FiHelpCircle />}
            </div>
            <div className="chat-ia-message-content">
              <div className="chat-ia-message-text">{formatarTexto(message.text)}</div>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="chat-ia-message chat-ia-message-bot">
            <div className="chat-ia-message-avatar">
              <FiHelpCircle />
            </div>
            <div className="chat-ia-message-content">
              <div className="chat-ia-typing-indicator">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {suggestions.length > 0 && messages.length >= 1 && (
        <div className="chat-ia-suggestions">
          <div className="chat-ia-suggestions-label">
            <FiStar /> Sugestões:
          </div>
          <div className="chat-ia-suggestions-list">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                type="button"
                className="chat-ia-suggestion-item"
                onClick={() => handleSuggestionClick(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="chat-ia-input-container">
        <div className="chat-ia-input-wrapper">
          <input
            ref={inputRef}
            type="text"
            className="chat-ia-input"
            placeholder="Pergunte sobre dados do CRM ou como usar o sistema..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isTyping}
          />
          <button
            type="button"
            className="chat-ia-send-button"
            onClick={() => handleSend()}
            disabled={!inputValue.trim() || isTyping}
          >
            <FiSend />
          </button>
        </div>
        <div className="chat-ia-footer-hint">
          Pressione <kbd>Enter</kbd> para enviar
          {aiReady === false ? ' · modo local (sem Gemini)' : ''}
        </div>
      </div>
    </div>
  );
};

export default ChatIA;
