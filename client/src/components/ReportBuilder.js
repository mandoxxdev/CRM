import React, { useState } from 'react';
import { FiBarChart2, FiX, FiSave, FiDownload, FiPlus, FiTrash2, FiMove } from 'react-icons/fi';
import api from '../services/api';
import { toast } from 'react-toastify';
import './ReportBuilder.css';

const ReportBuilder = ({ isOpen, onClose, onSave }) => {
  const [reportName, setReportName] = useState('');
  const [widgets, setWidgets] = useState([]);
  const [draggedWidget, setDraggedWidget] = useState(null);

  const widgetTypes = [
    { id: 'kpi', name: 'KPI Card', icon: FiBarChart2, defaultConfig: { title: 'Novo KPI', value: 0 } },
    { id: 'chart', name: 'Gráfico', icon: FiBarChart2, defaultConfig: { type: 'line', title: 'Novo Gráfico' } },
    { id: 'table', name: 'Tabela', icon: FiBarChart2, defaultConfig: { title: 'Nova Tabela', columns: [] } },
    { id: 'text', name: 'Texto', icon: FiBarChart2, defaultConfig: { content: 'Novo texto' } },
  ];

  const addWidget = (type) => {
    const widgetType = widgetTypes.find(w => w.id === type);
    const newWidget = {
      id: Date.now(),
      type: type,
      config: { ...widgetType.defaultConfig },
      position: widgets.length
    };
    setWidgets([...widgets, newWidget]);
  };

  const removeWidget = (id) => {
    setWidgets(widgets.filter(w => w.id !== id));
  };

  const updateWidget = (id, config) => {
    setWidgets(widgets.map(w => w.id === id ? { ...w, config: { ...w.config, ...config } } : w));
  };

  const handleDragStart = (e, widget) => {
    setDraggedWidget(widget);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, targetWidget) => {
    e.preventDefault();
    if (!draggedWidget || draggedWidget.id === targetWidget.id) return;

    const draggedIndex = widgets.findIndex(w => w.id === draggedWidget.id);
    const targetIndex = widgets.findIndex(w => w.id === targetWidget.id);

    const newWidgets = [...widgets];
    newWidgets.splice(draggedIndex, 1);
    newWidgets.splice(targetIndex, 0, draggedWidget);

    setWidgets(newWidgets);
    setDraggedWidget(null);
  };

  const handleSave = async () => {
    if (!reportName.trim()) {
      toast.error('Digite um nome para o relatório');
      return;
    }

    try {
      const reportData = {
        name: reportName,
        widgets: widgets,
        createdAt: new Date().toISOString()
      };

      // Salvar no backend
      await api.post('/api/reports', reportData);
      toast.success('Relatório salvo com sucesso!');
      if (onSave) onSave(reportData);
      onClose();
    } catch (error) {
      console.error('Erro ao salvar relatório:', error);
      toast.error('Erro ao salvar relatório');
    }
  };

  const handleExport = () => {
    // Implementar exportação
    toast.info('Funcionalidade de exportação em desenvolvimento');
  };

  if (!isOpen) return null;

  return (
    <div className="report-builder-overlay" onClick={onClose}>
      <div className="report-builder-modal" onClick={(e) => e.stopPropagation()}>
        <div className="report-builder-header">
          <div className="report-builder-title">
            <FiBarChart2 />
            <h2>Criar Relatório Personalizado</h2>
          </div>
          <button className="report-builder-close" onClick={onClose}>
            <FiX />
          </button>
        </div>

        <div className="report-builder-content">
          <div className="report-builder-sidebar">
            <div className="report-builder-section">
              <h3>Nome do Relatório</h3>
              <input
                type="text"
                className="report-builder-name-input"
                placeholder="Digite o nome do relatório"
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
              />
            </div>

            <div className="report-builder-section">
              <h3>Adicionar Widget</h3>
              <div className="widget-types">
                {widgetTypes.map(type => (
                  <button
                    key={type.id}
                    className="widget-type-btn"
                    onClick={() => addWidget(type.id)}
                  >
                    <type.icon />
                    <span>{type.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="report-builder-canvas">
            <div className="report-builder-widgets">
              {widgets.length === 0 ? (
                <div className="report-builder-empty">
                  <FiBarChart2 />
                  <p>Adicione widgets para começar</p>
                </div>
              ) : (
                widgets.map((widget, index) => {
                  const WidgetType = widgetTypes.find(w => w.id === widget.type);
                  return (
                    <div
                      key={widget.id}
                      className="report-builder-widget"
                      draggable
                      onDragStart={(e) => handleDragStart(e, widget)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, widget)}
                    >
                      <div className="widget-header">
                        <div className="widget-drag-handle">
                          <FiMove />
                        </div>
                        <span className="widget-title">
                          {WidgetType?.name || 'Widget'}
                        </span>
                        <button
                          className="widget-remove"
                          onClick={() => removeWidget(widget.id)}
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                      <div className="widget-content">
                        {widget.type === 'kpi' && (
                          <div className="widget-kpi">
                            <input
                              type="text"
                              placeholder="Título do KPI"
                              value={widget.config.title || ''}
                              onChange={(e) => updateWidget(widget.id, { title: e.target.value })}
                              className="widget-input"
                            />
                            <input
                              type="number"
                              placeholder="Valor"
                              value={widget.config.value || 0}
                              onChange={(e) => updateWidget(widget.id, { value: e.target.value })}
                              className="widget-input"
                            />
                          </div>
                        )}
                        {widget.type === 'chart' && (
                          <div className="widget-chart">
                            <input
                              type="text"
                              placeholder="Título do Gráfico"
                              value={widget.config.title || ''}
                              onChange={(e) => updateWidget(widget.id, { title: e.target.value })}
                              className="widget-input"
                            />
                            <select
                              value={widget.config.type || 'line'}
                              onChange={(e) => updateWidget(widget.id, { type: e.target.value })}
                              className="widget-select"
                            >
                              <option value="line">Linha</option>
                              <option value="bar">Barras</option>
                              <option value="pie">Pizza</option>
                            </select>
                          </div>
                        )}
                        {widget.type === 'text' && (
                          <textarea
                            placeholder="Digite o texto"
                            value={widget.config.content || ''}
                            onChange={(e) => updateWidget(widget.id, { content: e.target.value })}
                            className="widget-textarea"
                            rows="4"
                          />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="report-builder-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-secondary" onClick={handleExport}>
            <FiDownload /> Exportar
          </button>
          <button className="btn-primary" onClick={handleSave}>
            <FiSave /> Salvar Relatório
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportBuilder;


