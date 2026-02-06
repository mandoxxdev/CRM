import React, { useState, useEffect, useRef } from 'react';
import { FiX, FiSend, FiMessageCircle, FiUser, FiSparkles, FiHelpCircle } from 'react-icons/fi';
import { buscarResposta, gerarRespostaContextual, sugerirPerguntas } from '../utils/assistenteIA';
import './HelpSearch.css';

const HelpSearch = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Mensagem inicial quando abre
  useEffect(() => {
    if (isOpen) {
      const mensagemInicial = {
        id: Date.now(),
        type: 'bot',
        text: `Olá! 👋 Sou sua assistente de ajuda do CRM GMP. 

Posso ajudar você com:
• Como criar e gerenciar clientes
• Como trabalhar com propostas comerciais
• Como cadastrar produtos e equipamentos
• Como usar o Dashboard e relatórios
• Como criar atividades e lembretes
• E muito mais!

Pergunte-me qualquer coisa sobre o sistema. 😊`,
        timestamp: new Date()
      };
      setMessages([mensagemInicial]);
      setSuggestions([
        'Como criar um novo cliente?',
        'Como fazer uma proposta comercial?',
        'Como cadastrar um produto?',
        'Como usar a busca global?'
      ]);
      
      // Focar no input após um pequeno delay
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } else {
      // Limpar mensagens ao fechar
      setMessages([]);
      setInputValue('');
      setSuggestions([]);
    }
  }, [isOpen]);

  // Scroll automático para última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!inputValue.trim() || isTyping) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      text: inputValue.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    // Simular delay de processamento (efeito de "digitando")
    await new Promise(resolve => setTimeout(resolve, 500));

    // Buscar resposta da IA
    const resposta = gerarRespostaContextual(userMessage.text);
    
    // Gerar sugestões relacionadas
    const novasSugestoes = sugerirPerguntas(userMessage.text);

    const botMessage = {
      id: Date.now() + 1,
      type: 'bot',
      text: resposta.resposta,
      categoria: resposta.categoria,
      timestamp: new Date()
    };

    setIsTyping(false);
    setMessages(prev => [...prev, botMessage]);
    
    if (novasSugestoes.length > 0) {
      setSuggestions(novasSugestoes);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    setInputValue(suggestion);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const formatarTexto = (texto) => {
    // Formatar texto com quebras de linha e listas
    return texto.split('\n').map((linha, index) => {
      // Detectar listas numeradas
      if (/^\d+\./.test(linha.trim())) {
        return (
          <div key={index} style={{ marginLeft: '20px', marginTop: '4px' }}>
            {linha}
          </div>
        );
      }
      // Detectar listas com bullet
      if (/^[-•]/.test(linha.trim())) {
        return (
          <div key={index} style={{ marginLeft: '20px', marginTop: '4px' }}>
            {linha}
          </div>
        );
      }
      // Linhas normais
      if (linha.trim()) {
        return <div key={index} style={{ marginTop: index > 0 ? '8px' : '0' }}>{linha}</div>;
      }
      return <br key={index} />;
    });
  };

  if (!isOpen) return null;

  return (
    <div className="help-search-overlay" onClick={onClose}>
      <div className="help-search-modal help-search-chat" onClick={(e) => e.stopPropagation()}>
        <div className="help-search-header">
          <div className="help-search-title">
            <div className="help-search-ai-badge">
              <FiHelpCircle />
              <span>Assistente IA</span>
            </div>
            <h2>Central de Ajuda Inteligente</h2>
          </div>
          <button className="help-search-close" onClick={onClose}>
            <FiX />
          </button>
        </div>

        <div className="help-search-chat-messages">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`help-search-message help-search-message-${message.type}`}
            >
              <div className="help-search-message-avatar">
                {message.type === 'user' ? <FiUser /> : <FiHelpCircle />}
              <div className="help-search-message-content">
                <div className="help-search-message-text">
                  {formatarTexto(message.text)}
                </div>
                {message.categoria && (
                  <div className="help-search-message-category">
                    {message.categoria}
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {isTyping && (
            <div className="help-search-message help-search-message-bot">
              <div className="help-search-message-avatar">
                <FiHelpCircle />
              </div>
              <div className="help-search-message-content">
                <div className="help-search-typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {suggestions.length > 0 && messages.length > 1 && (
          <div className="help-search-suggestions">
            <div className="help-search-suggestions-label">
              <FiSparkles /> Sugestões:
            </div>
            <div className="help-search-suggestions-list">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  className="help-search-suggestion-item"
                  onClick={() => handleSuggestionClick(suggestion)}
                >
                  <FiMessageCircle />
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="help-search-input-container">
          <div className="help-search-input-wrapper">
            <input
              ref={inputRef}
              type="text"
              className="help-search-input"
              placeholder="Pergunte-me qualquer coisa sobre o sistema..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isTyping}
            />
            <button
              className="help-search-send-button"
              onClick={handleSend}
              disabled={!inputValue.trim() || isTyping}
            >
              <FiSend />
            </button>
          </div>
          <div className="help-search-footer-hint">
            Pressione <kbd>Enter</kbd> para enviar • <kbd>Esc</kbd> para fechar
          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpSearch;
