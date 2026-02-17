import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiTool, FiPackage, FiSettings, FiX } from 'react-icons/fi';
import './ModalSelecaoTipoProduto.css';

const ModalSelecaoTipoProduto = ({ isOpen, onClose, familiaNome }) => {
  const navigate = useNavigate();

  // Se não receber isOpen, assumir que está sempre aberto (compatibilidade)
  if (isOpen === false) return null;

  const queryFamilia = familiaNome ? `&familia=${encodeURIComponent(familiaNome)}` : '';

  const tiposProduto = [
    {
      id: 'equipamentos',
      nome: 'Equipamentos',
      descricao: 'Máquinas, sistemas e grandes componentes industriais',
      icon: FiTool,
      rota: `/comercial/produtos/novo?tipo=equipamentos${queryFamilia}`,
      gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      glowColor: 'rgba(102, 126, 234, 0.4)'
    },
    {
      id: 'discos-acessorios',
      nome: 'Discos e Acessórios',
      descricao: 'Peças menores, consumíveis e complementos',
      icon: FiPackage,
      rota: `/comercial/produtos/novo?tipo=discos-acessorios${queryFamilia}`,
      gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      glowColor: 'rgba(245, 87, 108, 0.4)'
    },
    {
      id: 'servicos',
      nome: 'Serviços',
      descricao: 'Mão de obra, consultoria, manutenção e outros',
      icon: FiSettings,
      rota: `/comercial/produtos/novo?tipo=servicos${queryFamilia}`,
      gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
      glowColor: 'rgba(79, 172, 254, 0.4)'
    }
  ];

  const handleSelecionarTipo = (rota) => {
    navigate(rota);
    onClose();
  };

  return (
    <div className="modal-selecao-tipo-overlay" onClick={onClose}>
      <div className="modal-selecao-tipo-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-selecao-tipo-header">
          <h2>Selecione o Tipo de Produto</h2>
          <button className="modal-close-btn" onClick={onClose}>
            <FiX />
          </button>
        </div>
        <div className="modal-selecao-tipo-content">
          <p className="modal-selecao-tipo-subtitle">
            Escolha o tipo de produto que deseja cadastrar:
          </p>
          <div className="tipos-produto-grid">
            {tiposProduto.map((tipo) => {
              const Icon = tipo.icon;
              return (
                <div
                  key={tipo.id}
                  className="tipo-produto-card"
                  onClick={() => handleSelecionarTipo(tipo.rota)}
                  style={{
                    '--card-gradient': tipo.gradient,
                    '--card-glow': tipo.glowColor
                  }}
                >
                  <div className="tipo-produto-icon-wrapper">
                    <div className="tipo-produto-icon-bg"></div>
                    <div className="tipo-produto-icon" style={{ background: tipo.gradient }}>
                      <Icon />
                    </div>
                    <div className="tipo-produto-icon-glow"></div>
                  </div>
                  <div className="tipo-produto-content">
                    <h3>{tipo.nome}</h3>
                    <p>{tipo.descricao}</p>
                  </div>
                  <div className="tipo-produto-hover-effect"></div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModalSelecaoTipoProduto;

