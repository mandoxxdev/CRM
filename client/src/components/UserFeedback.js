import React, { useState } from 'react';
import { FiMessageSquare, FiX, FiSend, FiStar, FiSmile, FiFrown, FiMeh } from 'react-icons/fi';
import api from '../services/api';
import './UserFeedback.css';

const UserFeedback = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [category, setCategory] = useState('sugestao');
  const [submitted, setSubmitted] = useState(false);

  const categories = [
    { id: 'sugestao', label: 'Sugestão' },
    { id: 'problema', label: 'Problema/Bug' },
    { id: 'duvida', label: 'Dúvida' },
    { id: 'elogio', label: 'Elogio' }
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!feedback.trim()) {
      alert('Por favor, descreva seu feedback.');
      return;
    }

    try {
      await api.post('/feedback', {
        rating,
        feedback,
        category,
        page: window.location.pathname,
        userAgent: navigator.userAgent
      });

      setSubmitted(true);
      setTimeout(() => {
        setIsOpen(false);
        setSubmitted(false);
        setRating(0);
        setFeedback('');
        setCategory('sugestao');
      }, 2000);
    } catch (error) {
      console.error('Erro ao enviar feedback:', error);
      alert('Erro ao enviar feedback. Por favor, tente novamente.');
    }
  };

  const getRatingIcon = (value) => {
    if (value <= 2) return <FiFrown />;
    if (value === 3) return <FiMeh />;
    return <FiSmile />;
  };

  if (!isOpen) {
    return (
      <button
        className="user-feedback-button"
        onClick={() => setIsOpen(true)}
        title="Enviar feedback"
      >
        <FiMessageSquare />
      </button>
    );
  }

  return (
    <div className="user-feedback-overlay" onClick={() => setIsOpen(false)}>
      <div className="user-feedback-modal" onClick={(e) => e.stopPropagation()}>
        <div className="user-feedback-header">
          <h3>Enviar Feedback</h3>
          <button className="user-feedback-close" onClick={() => setIsOpen(false)}>
            <FiX />
          </button>
        </div>

        {submitted ? (
          <div className="user-feedback-success">
            <FiStar />
            <h4>Obrigado pelo seu feedback!</h4>
            <p>Sua opinião é muito importante para nós.</p>
          </div>
        ) : (
          <form className="user-feedback-form" onSubmit={handleSubmit}>
            <div className="user-feedback-rating">
              <label>Avaliação</label>
              <div className="user-feedback-stars">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`user-feedback-star ${
                      value <= rating ? 'active' : ''
                    }`}
                    onClick={() => setRating(value)}
                    onMouseEnter={() => {
                      // Efeito hover
                    }}
                  >
                    <FiStar />
                  </button>
                ))}
              </div>
              {rating > 0 && (
                <div className="user-feedback-rating-text">
                  {getRatingIcon(rating)}
                  <span>
                    {rating === 1 && 'Muito Ruim'}
                    {rating === 2 && 'Ruim'}
                    {rating === 3 && 'Regular'}
                    {rating === 4 && 'Bom'}
                    {rating === 5 && 'Excelente'}
                  </span>
                </div>
              )}
            </div>

            <div className="user-feedback-category">
              <label>Categoria</label>
              <div className="user-feedback-categories">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className={`user-feedback-category-btn ${
                      category === cat.id ? 'active' : ''
                    }`}
                    onClick={() => setCategory(cat.id)}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="user-feedback-text">
              <label>Seu feedback</label>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Descreva sua sugestão, problema, dúvida ou elogio..."
                rows={6}
                required
              />
            </div>

            <div className="user-feedback-footer">
              <button
                type="button"
                className="user-feedback-btn-secondary"
                onClick={() => setIsOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="user-feedback-btn-primary"
                disabled={!feedback.trim()}
              >
                <FiSend /> Enviar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default UserFeedback;


