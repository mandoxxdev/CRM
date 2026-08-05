import React from 'react';
import { Link } from 'react-router-dom';
import { FiChevronRight, FiHome } from 'react-icons/fi';
import './Almoxarifado.css';

/**
 * Cabeçalho reutilizável com breadcrumb e passos de fluxo opcionais.
 */
const AlmoxPageHeader = ({ title, subtitle, breadcrumbs = [], flowSteps, currentStep, actions, children }) => (
  <>
    {breadcrumbs.length > 0 && (
      <nav className="almox-breadcrumb" aria-label="Navegação">
        <Link to="/almoxarifado" className="almox-breadcrumb-home" title="Dashboard">
          <FiHome size={14} />
        </Link>
        {breadcrumbs.map((crumb, i) => (
          <React.Fragment key={i}>
            <FiChevronRight size={12} className="almox-breadcrumb-sep" />
            {crumb.to ? (
              <Link to={crumb.to}>{crumb.label}</Link>
            ) : (
              <span className="almox-breadcrumb-current">{crumb.label}</span>
            )}
          </React.Fragment>
        ))}
      </nav>
    )}

    {flowSteps && flowSteps.length > 0 && (
      <div className="almox-flow-steps" role="list" aria-label="Etapas do processo">
        {flowSteps.map((step, i) => {
          const idx = currentStep ?? -1;
          const done = i < idx;
          const active = i === idx;
          return (
            <React.Fragment key={step.key || i}>
              {i > 0 && <div className={`almox-flow-connector ${done ? 'done' : ''}`} />}
              <div className={`almox-flow-step ${done ? 'done' : ''} ${active ? 'active' : ''}`} role="listitem">
                <span className="almox-flow-step-num">{done ? '✓' : i + 1}</span>
                <span className="almox-flow-step-label">{step.label}</span>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    )}

    <div className="almox-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
        {children}
      </div>
      {actions && <div className="almox-header-actions">{actions}</div>}
    </div>
  </>
);

// Etapa 3 (design, "Frontend": "Stepper do AlmoxPageHeader atualizado" — Criar→Aprovar→
// Separar→Retirada→Entregar→Encerrar). "Retirada" e "Encerrar" são as duas etapas novas
// (PRONTA_PARA_RETIRADA e ENCERRADA) que a máquina de estados ganhou nesta etapa.
export const REQUISICAO_FLOW = [
  { key: 'criar', label: 'Criar' },
  { key: 'aprovar', label: 'Aprovar' },
  { key: 'separar', label: 'Separar' },
  { key: 'retirada', label: 'Retirada' },
  { key: 'entregar', label: 'Entregar' },
  { key: 'encerrar', label: 'Encerrar' },
];

// idx = quantidade de etapas já concluídas (não o índice do próprio status) — mesma
// convenção da versão anterior deste mapa: ex. EM_SEPARACAO aponta para o índice da etapa
// "Separar" (ainda separando, retirada não liberada); PRONTA_PARA_RETIRADA já marca
// "Separar" como concluída e ativa "Retirada".
export const getRequisicaoStepIndex = (status) => {
  const map = {
    RASCUNHO: 0,
    PENDENTE: 1,
    AGUARDANDO_APROVACAO_VALOR: 1,
    APROVADO: 2,
    AGUARDANDO_ESTOQUE: 2,
    AGUARDANDO_COMPRA: 2,
    EM_SEPARACAO: 2,
    PRONTA_PARA_RETIRADA: 3,
    PARCIALMENTE_ATENDIDA: 4,
    ENTREGUE: 5,
    ENCERRADA: 6,
    REJEITADO: -1,
    CANCELADO: -1,
  };
  return map[status] ?? 0;
};

export default AlmoxPageHeader;
