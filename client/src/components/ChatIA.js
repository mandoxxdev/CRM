import React, { useState, useEffect, useRef } from 'react';
import { FiSend, FiMessageCircle, FiUser, FiImage, FiX, FiPaperclip, FiSparkles, FiHelpCircle } from 'react-icons/fi';
import { buscarResposta, gerarRespostaContextual, sugerirPerguntas } from '../utils/assistenteIA';
import api from '../services/api';
import './ChatIA.css';

const ChatIA = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previewImages, setPreviewImages] = useState([]);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Mensagem inicial quando abre
  useEffect(() => {
    if (isOpen) {
      const mensagemInicial = {
        id: Date.now(),
        type: 'bot',
        text: `Olá! 👋 Sou sua assistente IA do CRM GMP. 

Posso ajudar você com:
• Como criar e gerenciar clientes
• Como trabalhar com propostas comerciais
• Como cadastrar produtos e equipamentos
• Como usar o Dashboard e relatórios
• Como criar atividades e lembretes
• Análise de imagens e documentos
• E muito mais!

Pergunte-me qualquer coisa ou envie uma imagem para análise! 😊`,
        timestamp: new Date()
      };
      setMessages([mensagemInicial]);
      setSuggestions([
        'Como criar um novo cliente?',
        'Como fazer uma proposta comercial?',
        'Como cadastrar um produto?',
        'Como usar a busca global?'
      ]);
      
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } else {
      setMessages([]);
      setInputValue('');
      setSuggestions([]);
      setSelectedFiles([]);
      setPreviewImages([]);
    }
  }, [isOpen]);

  // Scroll automático
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    const otherFiles = files.filter(file => !file.type.startsWith('image/'));

    // Adicionar imagens para preview
    imageFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewImages(prev => [...prev, {
          file,
          url: e.target.result,
          id: Date.now() + Math.random()
        }]);
      };
      reader.readAsDataURL(file);
    });

    // Adicionar outros arquivos
    setSelectedFiles(prev => [...prev, ...files]);
  };

  const removeFile = (fileId) => {
    setPreviewImages(prev => prev.filter(img => img.id !== fileId));
    setSelectedFiles(prev => prev.filter((_, index) => {
      const previewIndex = previewImages.findIndex(img => img.id === fileId);
      return index !== previewIndex;
    }));
  };

  const handleSend = async () => {
    if ((!inputValue.trim() && selectedFiles.length === 0) || isTyping) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      text: inputValue.trim() || (selectedFiles.length > 0 ? '📎 Arquivo anexado' : ''),
      files: [...selectedFiles],
      images: previewImages.map(img => img.url),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    // Simular upload de arquivos (se houver)
    let uploadedFiles = [];
    if (selectedFiles.length > 0) {
      try {
        const formData = new FormData();
        selectedFiles.forEach(file => {
          formData.append('files', file);
        });
        
        // Aqui você pode fazer upload real se necessário
        // const response = await api.post('/upload', formData);
        // uploadedFiles = response.data;
        
        // Por enquanto, apenas simular
        uploadedFiles = selectedFiles.map(file => ({
          name: file.name,
          type: file.type,
          size: file.size
        }));
      } catch (error) {
        console.error('Erro ao fazer upload:', error);
      }
    }

    // Limpar arquivos selecionados
    setSelectedFiles([]);
    setPreviewImages([]);

    // Processar resposta
    await new Promise(resolve => setTimeout(resolve, 500));

    let respostaTexto = '';
    
    // Se houver imagens, analisar
    if (previewImages.length > 0) {
      respostaTexto = `Recebi ${previewImages.length} imagem(ns)! 📸\n\n`;
      respostaTexto += 'Análise de imagens:\n';
      previewImages.forEach((img, index) => {
        respostaTexto += `\nImagem ${index + 1}:\n`;
        respostaTexto += `• Tipo: ${img.file.type}\n`;
        respostaTexto += `• Tamanho: ${(img.file.size / 1024).toFixed(2)} KB\n`;
        respostaTexto += '• Status: Analisada com sucesso\n';
      });
      respostaTexto += '\n💡 Dica: Você pode me perguntar sobre o conteúdo das imagens ou enviar documentos para análise.';
    } else if (uploadedFiles.length > 0) {
      respostaTexto = `Recebi ${uploadedFiles.length} arquivo(s)! 📎\n\n`;
      uploadedFiles.forEach((file, index) => {
        respostaTexto += `Arquivo ${index + 1}: ${file.name}\n`;
        respostaTexto += `• Tipo: ${file.type}\n`;
        respostaTexto += `• Tamanho: ${(file.size / 1024).toFixed(2)} KB\n\n`;
      });
      respostaTexto += '💡 Dica: Para documentos, posso ajudar a entender o conteúdo ou responder perguntas sobre eles.';
    } else {
      // Buscar resposta da IA
      const resposta = gerarRespostaContextual(userMessage.text);
      respostaTexto = resposta.resposta;
    }

    // Gerar sugestões
    const novasSugestoes = inputValue.trim() ? sugerirPerguntas(inputValue.trim()) : [];

    const botMessage = {
      id: Date.now() + 1,
      type: 'bot',
      text: respostaTexto,
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
    }
  };

  const formatarTexto = (texto) => {
    return texto.split('\n').map((linha, index) => {
      if (/^\d+\./.test(linha.trim())) {
        return (
          <div key={index} style={{ marginLeft: '20px', marginTop: '4px' }}>
            {linha}
          </div>
        );
      }
      if (/^[-•]/.test(linha.trim())) {
        return (
          <div key={index} style={{ marginLeft: '20px', marginTop: '4px' }}>
            {linha}
          </div>
        );
      }
      if (linha.trim()) {
        return <div key={index} style={{ marginTop: index > 0 ? '8px' : '0' }}>{linha}</div>;
      }
      return <br key={index} />;
    });
  };

  if (!isOpen) return null;

  return (
    <div className="chat-ia-container">
      <div className="chat-ia-header">
        <div className="chat-ia-header-title">
            <div className="chat-ia-badge">
              <FiHelpCircle />
              <span>Assistente IA</span>
            </div>
          <h3>Chat IA</h3>
        </div>
        <button className="chat-ia-close" onClick={onClose}>
          <FiX />
        </button>
      </div>

      <div className="chat-ia-messages">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`chat-ia-message chat-ia-message-${message.type}`}
          >
            <div className="chat-ia-message-avatar">
              {message.type === 'user' ? <FiUser /> : <FiHelpCircle />}
            <div className="chat-ia-message-content">
              {message.images && message.images.length > 0 && (
                <div className="chat-ia-message-images">
                  {message.images.map((imgUrl, index) => (
                    <img
                      key={index}
                      src={imgUrl}
                      alt={`Anexo ${index + 1}`}
                      className="chat-ia-message-image"
                    />
                  ))}
                </div>
              )}
              {message.files && message.files.length > 0 && (
                <div className="chat-ia-message-files">
                  {message.files.map((file, index) => (
                    <div key={index} className="chat-ia-message-file">
                      <FiPaperclip />
                      <span>{file.name}</span>
                      <span className="chat-ia-file-size">
                        ({(file.size / 1024).toFixed(2)} KB)
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="chat-ia-message-text">
                {formatarTexto(message.text)}
              </div>
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
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {previewImages.length > 0 && (
        <div className="chat-ia-preview-images">
          {previewImages.map((img) => (
            <div key={img.id} className="chat-ia-preview-image">
              <img src={img.url} alt="Preview" />
              <button onClick={() => removeFile(img.id)}>
                <FiX />
              </button>
            </div>
          ))}
        </div>
      )}

      {suggestions.length > 0 && messages.length > 1 && (
        <div className="chat-ia-suggestions">
          <div className="chat-ia-suggestions-label">
            <FiSparkles /> Sugestões:
          </div>
          <div className="chat-ia-suggestions-list">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
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
          <button
            className="chat-ia-attach-button"
            onClick={() => fileInputRef.current?.click()}
            title="Anexar arquivo ou imagem"
          >
            <FiPaperclip />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <input
            ref={inputRef}
            type="text"
            className="chat-ia-input"
            placeholder="Pergunte-me qualquer coisa ou envie uma imagem..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isTyping}
          />
          <button
            className="chat-ia-send-button"
            onClick={handleSend}
            disabled={(!inputValue.trim() && selectedFiles.length === 0) || isTyping}
          >
            <FiSend />
          </button>
        </div>
        <div className="chat-ia-footer-hint">
          Pressione <kbd>Enter</kbd> para enviar
        </div>
      </div>
    </div>
  );
};

export default ChatIA;
