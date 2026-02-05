import React, { useState } from 'react';
import { FiX, FiArrowRight, FiArrowLeft, FiCheck } from 'react-icons/fi';
import './Onboarding.css';

const Onboarding = ({ isOpen, onClose, onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      title: 'Bem-vindo ao CRM GMP!',
      description: 'Sistema completo de gestão de relacionamento com clientes, projetos e propostas comerciais.',
      icon: '👋',
      features: [
        'Gestão completa de clientes',
        'Controle de projetos Turn Key',
        'Propostas comerciais detalhadas',
        'Dashboard com insights'
      ]
    },
    {
      title: 'Busca Global',
      description: 'Use Ctrl+K para buscar rapidamente qualquer informação no sistema.',
      icon: '🔍',
      tip: 'Pressione Ctrl+K em qualquer momento para abrir a busca'
    },
    {
      title: 'Relatórios Personalizados',
      description: 'Crie relatórios customizados com drag & drop. Arraste widgets e configure como preferir.',
      icon: '📊',
      tip: 'Acesse Relatórios e clique em "Criar Relatório"'
    },
    {
      title: 'Workflows Automatizados',
      description: 'Automatize tarefas repetitivas criando workflows com triggers e ações.',
      icon: '⚙️',
      tip: 'Configure workflows em Relatórios > Workflows'
    },
    {
      title: 'Tema Escuro/Claro',
      description: 'Altere o tema conforme sua preferência. O sistema se adapta automaticamente.',
      icon: '🌓',
      tip: 'Use o botão de tema no menu lateral'
    }
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    // Salvar que o usuário completou o onboarding
    localStorage.setItem('onboarding_completed', 'true');
    if (onComplete) onComplete();
    onClose();
  };

  const handleSkip = () => {
    localStorage.setItem('onboarding_completed', 'true');
    onClose();
  };

  if (!isOpen) return null;

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;

  return (
    <div className="onboarding-overlay" onClick={handleSkip}>
      <div className="onboarding-modal" onClick={(e) => e.stopPropagation()}>
        <button className="onboarding-close" onClick={handleSkip}>
          <FiX />
        </button>

        <div className="onboarding-content">
          <div className="onboarding-icon">{step.icon}</div>
          <h2 className="onboarding-title">{step.title}</h2>
          <p className="onboarding-description">{step.description}</p>

          {step.features && (
            <ul className="onboarding-features">
              {step.features.map((feature, index) => (
                <li key={index} className="onboarding-feature">
                  <FiCheck className="feature-icon" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          )}

          {step.tip && (
            <div className="onboarding-tip">
              <span className="tip-label">💡 Dica:</span>
              <span className="tip-text">{step.tip}</span>
            </div>
          )}

          <div className="onboarding-progress">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`progress-dot ${index === currentStep ? 'active' : ''} ${index < currentStep ? 'completed' : ''}`}
              />
            ))}
          </div>
        </div>

        <div className="onboarding-footer">
          <button className="btn-skip" onClick={handleSkip}>
            Pular
          </button>
          <div className="onboarding-actions">
            {currentStep > 0 && (
              <button className="btn-secondary" onClick={handlePrevious}>
                <FiArrowLeft /> Anterior
              </button>
            )}
            <button className="btn-primary" onClick={handleNext}>
              {isLastStep ? (
                <>
                  <FiCheck /> Começar
                </>
              ) : (
                <>
                  Próximo <FiArrowRight />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;


