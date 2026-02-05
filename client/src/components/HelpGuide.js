import React, { useState, useEffect } from 'react';
import { FiHelpCircle, FiX, FiChevronRight, FiChevronLeft, FiCheck } from 'react-icons/fi';
import './HelpGuide.css';

const HelpGuide = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState(new Set());
  const [helpMode, setHelpMode] = useState(false);

  const guides = [
    {
      id: 'dashboard',
      title: 'Dashboard Executivo',
      description: 'Visualize métricas importantes e KPIs do seu negócio em tempo real.',
      target: '.dashboard-header',
      position: 'bottom',
      content: 'Aqui você encontra uma visão geral completa do CRM, incluindo clientes ativos, projetos, propostas e muito mais.'
    },
    {
      id: 'clientes',
      title: 'Gestão de Clientes',
      description: 'Gerencie todos os seus clientes em um só lugar.',
      target: '[href="/clientes"]',
      position: 'right',
      content: 'Cadastre novos clientes, visualize histórico de relacionamento e gerencie informações importantes.'
    },
    {
      id: 'oportunidades',
      title: 'Oportunidades de Vendas',
      description: 'Acompanhe seu pipeline de vendas e oportunidades.',
      target: '[href="/oportunidades"]',
      position: 'right',
      content: 'Gerencie todas as oportunidades de negócio, acompanhe probabilidades e valores estimados.'
    },
    {
      id: 'propostas',
      title: 'Propostas Comerciais',
      description: 'Crie e gerencie propostas comerciais detalhadas.',
      target: '[href="/propostas"]',
      position: 'right',
      content: 'Crie propostas profissionais com produtos, valores e condições personalizadas.'
    },
    {
      id: 'atividades',
      title: 'Atividades e Lembretes',
      description: 'Organize suas tarefas e compromissos.',
      target: '[href="/atividades"]',
      position: 'right',
      content: 'Gerencie atividades, lembretes e compromissos relacionados a clientes e projetos.'
    },
    {
      id: 'busca',
      title: 'Busca Global',
      description: 'Encontre qualquer informação rapidamente.',
      target: '.busca-global-trigger',
      position: 'bottom',
      content: 'Use Ctrl+K para buscar clientes, propostas, projetos e muito mais em todo o sistema.'
    }
  ];

  useEffect(() => {
    if (helpMode) {
      highlightCurrentStep();
    }
  }, [helpMode, currentStep]);

  const highlightCurrentStep = () => {
    if (currentStep >= guides.length) return;
    
    const guide = guides[currentStep];
    const element = document.querySelector(guide.target);
    
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('help-highlight');
      
      setTimeout(() => {
        element.classList.remove('help-highlight');
      }, 3000);
    }
  };

  const startGuide = () => {
    setIsOpen(true);
    setHelpMode(true);
    setCurrentStep(0);
    highlightCurrentStep();
  };

  const nextStep = () => {
    if (currentStep < guides.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeGuide();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const skipStep = () => {
    setCompletedSteps(prev => new Set([...prev, guides[currentStep].id]));
    nextStep();
  };

  const completeGuide = () => {
    setHelpMode(false);
    setIsOpen(false);
    setCurrentStep(0);
    guides.forEach(guide => {
      const element = document.querySelector(guide.target);
      if (element) {
        element.classList.remove('help-highlight');
      }
    });
    localStorage.setItem('helpGuideCompleted', 'true');
  };

  const closeGuide = () => {
    setHelpMode(false);
    setIsOpen(false);
    guides.forEach(guide => {
      const element = document.querySelector(guide.target);
      if (element) {
        element.classList.remove('help-highlight');
      }
    });
  };

  const currentGuide = guides[currentStep];

  return (
    <>
      <button
        className="help-guide-button"
        onClick={startGuide}
        title="Iniciar guia de ajuda"
      >
        <FiHelpCircle />
      </button>

      {isOpen && (
        <div className="help-guide-overlay" onClick={closeGuide}>
          <div className="help-guide-modal" onClick={(e) => e.stopPropagation()}>
            <div className="help-guide-header">
              <div>
                <h3>{currentGuide?.title}</h3>
                <p>{currentGuide?.description}</p>
              </div>
              <button className="help-guide-close" onClick={closeGuide}>
                <FiX />
              </button>
            </div>

            <div className="help-guide-content">
              <div className="help-guide-progress">
                <div className="help-guide-steps">
                  {guides.map((guide, index) => (
                    <div
                      key={guide.id}
                      className={`help-guide-step ${
                        index === currentStep ? 'active' : ''
                      } ${completedSteps.has(guide.id) ? 'completed' : ''} ${
                        index < currentStep ? 'passed' : ''
                      }`}
                    >
                      {completedSteps.has(guide.id) || index < currentStep ? (
                        <FiCheck />
                      ) : (
                        <span>{index + 1}</span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="help-guide-progress-bar">
                  <div
                    className="help-guide-progress-fill"
                    style={{ width: `${((currentStep + 1) / guides.length) * 100}%` }}
                  />
                </div>
              </div>

              <div className="help-guide-text">
                <p>{currentGuide?.content}</p>
              </div>
            </div>

            <div className="help-guide-footer">
              <button className="help-guide-btn-secondary" onClick={skipStep}>
                Pular
              </button>
              <div className="help-guide-nav">
                <button
                  className="help-guide-btn"
                  onClick={prevStep}
                  disabled={currentStep === 0}
                >
                  <FiChevronLeft /> Anterior
                </button>
                <button className="help-guide-btn-primary" onClick={nextStep}>
                  {currentStep === guides.length - 1 ? 'Finalizar' : 'Próximo'} <FiChevronRight />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default HelpGuide;


