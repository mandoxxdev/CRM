import React, { useState, useEffect } from 'react';
import { FiSettings, FiX, FiSave, FiPlus, FiTrash2, FiPlay, FiPause, FiCheckCircle } from 'react-icons/fi';
import api from '../services/api';
import { toast } from 'react-toastify';
import './WorkflowEngine.css';

const WorkflowEngine = ({ isOpen, onClose }) => {
  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [workflowName, setWorkflowName] = useState('');
  const [workflowActive, setWorkflowActive] = useState(false);
  const [triggers, setTriggers] = useState([]);
  const [actions, setActions] = useState([]);

  useEffect(() => {
    if (isOpen) {
      loadWorkflows();
    }
  }, [isOpen]);

  const loadWorkflows = async () => {
    try {
      const response = await api.get('/api/workflows');
      setWorkflows(response.data || []);
    } catch (error) {
      console.error('Erro ao carregar workflows:', error);
    }
  };

  const triggerTypes = [
    { id: 'proposta_criada', name: 'Proposta Criada', icon: FiCheckCircle },
    { id: 'proposta_aprovada', name: 'Proposta Aprovada', icon: FiCheckCircle },
    { id: 'cliente_criado', name: 'Cliente Criado', icon: FiCheckCircle },
    { id: 'atividade_vencida', name: 'Atividade Vencida', icon: FiCheckCircle },
    { id: 'oportunidade_fechada', name: 'Oportunidade Fechada', icon: FiCheckCircle },
  ];

  const actionTypes = [
    { id: 'criar_atividade', name: 'Criar Atividade', icon: FiCheckCircle },
    { id: 'enviar_email', name: 'Enviar Email', icon: FiCheckCircle },
    { id: 'notificar_usuario', name: 'Notificar Usuário', icon: FiCheckCircle },
    { id: 'atualizar_status', name: 'Atualizar Status', icon: FiCheckCircle },
    { id: 'criar_proposta', name: 'Criar Proposta', icon: FiCheckCircle },
  ];

  const addTrigger = (type) => {
    const newTrigger = {
      id: Date.now(),
      type: type,
      config: {}
    };
    setTriggers([...triggers, newTrigger]);
  };

  const removeTrigger = (id) => {
    setTriggers(triggers.filter(t => t.id !== id));
  };

  const addAction = (type) => {
    const newAction = {
      id: Date.now(),
      type: type,
      config: {}
    };
    setActions([...actions, newAction]);
  };

  const removeAction = (id) => {
    setActions(actions.filter(a => a.id !== id));
  };

  const updateActionConfig = (id, config) => {
    setActions(actions.map(a => a.id === id ? { ...a, config: { ...a.config, ...config } } : a));
  };

  const handleSave = async () => {
    if (!workflowName.trim()) {
      toast.error('Digite um nome para o workflow');
      return;
    }

    if (triggers.length === 0) {
      toast.error('Adicione pelo menos um trigger');
      return;
    }

    if (actions.length === 0) {
      toast.error('Adicione pelo menos uma ação');
      return;
    }

    try {
      const workflowData = {
        name: workflowName,
        active: workflowActive,
        triggers: triggers,
        actions: actions,
        createdAt: new Date().toISOString()
      };

      if (selectedWorkflow) {
        await api.put(`/api/workflows/${selectedWorkflow.id}`, workflowData);
        toast.success('Workflow atualizado com sucesso!');
      } else {
        await api.post('/api/workflows', workflowData);
        toast.success('Workflow criado com sucesso!');
      }

      loadWorkflows();
      handleNewWorkflow();
    } catch (error) {
      console.error('Erro ao salvar workflow:', error);
      toast.error('Erro ao salvar workflow');
    }
  };

  const handleNewWorkflow = () => {
    setSelectedWorkflow(null);
    setWorkflowName('');
    setWorkflowActive(false);
    setTriggers([]);
    setActions([]);
  };

  const handleSelectWorkflow = (workflow) => {
    setSelectedWorkflow(workflow);
    setWorkflowName(workflow.name);
    setWorkflowActive(workflow.active);
    setTriggers(workflow.triggers || []);
    setActions(workflow.actions || []);
  };

  const handleDeleteWorkflow = async (id) => {
    if (!window.confirm('Tem certeza que deseja excluir este workflow?')) return;

    try {
      await api.delete(`/api/workflows/${id}`);
      toast.success('Workflow excluído com sucesso!');
      loadWorkflows();
      if (selectedWorkflow?.id === id) {
        handleNewWorkflow();
      }
    } catch (error) {
      console.error('Erro ao excluir workflow:', error);
      toast.error('Erro ao excluir workflow');
    }
  };

  const toggleWorkflowActive = async (workflow) => {
    try {
      await api.put(`/api/workflows/${workflow.id}`, {
        ...workflow,
        active: !workflow.active
      });
      toast.success(`Workflow ${!workflow.active ? 'ativado' : 'desativado'}!`);
      loadWorkflows();
    } catch (error) {
      console.error('Erro ao atualizar workflow:', error);
      toast.error('Erro ao atualizar workflow');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="workflow-engine-overlay" onClick={onClose}>
      <div className="workflow-engine-modal" onClick={(e) => e.stopPropagation()}>
        <div className="workflow-engine-header">
          <div className="workflow-engine-title">
            <FiSettings />
            <h2>Workflow Engine</h2>
          </div>
          <button className="workflow-engine-close" onClick={onClose}>
            <FiX />
          </button>
        </div>

        <div className="workflow-engine-content">
          <div className="workflow-engine-sidebar">
            <div className="workflow-engine-section">
              <div className="workflow-engine-section-header">
                <h3>Workflows</h3>
                <button className="btn-icon-small" onClick={handleNewWorkflow}>
                  <FiPlus />
                </button>
              </div>
              <div className="workflow-list">
                {workflows.map(workflow => (
                  <div
                    key={workflow.id}
                    className={`workflow-item ${selectedWorkflow?.id === workflow.id ? 'active' : ''}`}
                    onClick={() => handleSelectWorkflow(workflow)}
                  >
                    <div className="workflow-item-header">
                      <span className="workflow-item-name">{workflow.name}</span>
                      <div className="workflow-item-actions">
                        <button
                          className="workflow-toggle"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleWorkflowActive(workflow);
                          }}
                          title={workflow.active ? 'Desativar' : 'Ativar'}
                        >
                          {workflow.active ? <FiPlay /> : <FiPause />}
                        </button>
                        <button
                          className="workflow-delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteWorkflow(workflow.id);
                          }}
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </div>
                    <div className="workflow-item-status">
                      {workflow.active ? (
                        <span className="status-active">Ativo</span>
                      ) : (
                        <span className="status-inactive">Inativo</span>
                      )}
                    </div>
                  </div>
                ))}
                {workflows.length === 0 && (
                  <div className="workflow-empty">
                    <p>Nenhum workflow criado</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="workflow-engine-main">
            <div className="workflow-form">
              <div className="workflow-form-section">
                <h3>Informações do Workflow</h3>
                <input
                  type="text"
                  className="workflow-name-input"
                  placeholder="Nome do Workflow"
                  value={workflowName}
                  onChange={(e) => setWorkflowName(e.target.value)}
                />
                <label className="workflow-active-checkbox">
                  <input
                    type="checkbox"
                    checked={workflowActive}
                    onChange={(e) => setWorkflowActive(e.target.checked)}
                  />
                  <span>Workflow Ativo</span>
                </label>
              </div>

              <div className="workflow-form-section">
                <div className="workflow-form-section-header">
                  <h3>Triggers (Quando)</h3>
                  <div className="trigger-buttons">
                    {triggerTypes.map(type => (
                      <button
                        key={type.id}
                        className="trigger-type-btn"
                        onClick={() => addTrigger(type.id)}
                      >
                        <type.icon />
                        <span>{type.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="triggers-list">
                  {triggers.map(trigger => {
                    const triggerType = triggerTypes.find(t => t.id === trigger.type);
                    const TriggerIcon = triggerType?.icon || FiCheckCircle;
                    return (
                      <div key={trigger.id} className="trigger-item">
                        <div className="trigger-item-header">
                          <TriggerIcon />
                          <span>{triggerType?.name || trigger.type}</span>
                          <button
                            className="trigger-remove"
                            onClick={() => removeTrigger(trigger.id)}
                          >
                            <FiTrash2 />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {triggers.length === 0 && (
                    <div className="empty-state">
                      <p>Adicione triggers para iniciar o workflow</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="workflow-form-section">
                <div className="workflow-form-section-header">
                  <h3>Ações (O que fazer)</h3>
                  <div className="action-buttons">
                    {actionTypes.map(type => (
                      <button
                        key={type.id}
                        className="action-type-btn"
                        onClick={() => addAction(type.id)}
                      >
                        <type.icon />
                        <span>{type.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="actions-list">
                  {actions.map(action => {
                    const actionType = actionTypes.find(a => a.id === action.type);
                    const ActionIcon = actionType?.icon || FiCheckCircle;
                    return (
                      <div key={action.id} className="action-item">
                        <div className="action-item-header">
                          <ActionIcon />
                          <span>{actionType?.name || action.type}</span>
                          <button
                            className="action-remove"
                            onClick={() => removeAction(action.id)}
                          >
                            <FiTrash2 />
                          </button>
                        </div>
                        {action.type === 'criar_atividade' && (
                          <div className="action-config">
                            <input
                              type="text"
                              placeholder="Título da atividade"
                              value={action.config.title || ''}
                              onChange={(e) => updateActionConfig(action.id, { title: e.target.value })}
                              className="action-input"
                            />
                          </div>
                        )}
                        {action.type === 'enviar_email' && (
                          <div className="action-config">
                            <input
                              type="email"
                              placeholder="Email destinatário"
                              value={action.config.email || ''}
                              onChange={(e) => updateActionConfig(action.id, { email: e.target.value })}
                              className="action-input"
                            />
                            <input
                              type="text"
                              placeholder="Assunto"
                              value={action.config.subject || ''}
                              onChange={(e) => updateActionConfig(action.id, { subject: e.target.value })}
                              className="action-input"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {actions.length === 0 && (
                    <div className="empty-state">
                      <p>Adicione ações para executar no workflow</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="workflow-engine-footer">
          <button className="btn-secondary" onClick={onClose}>
            Fechar
          </button>
          <button className="btn-primary" onClick={handleSave}>
            <FiSave /> Salvar Workflow
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkflowEngine;

