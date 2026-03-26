import React, { useMemo, useState } from 'react';
import { FiTruck, FiTool, FiClipboard, FiBarChart2 } from 'react-icons/fi';

const VeiculosManutencao = () => {
  const [aba, setAba] = useState('dashboard'); // dashboard | cadastro | vistoria | manutencao

  const conteudo = useMemo(() => {
    if (aba === 'cadastro') {
      return (
        <div>
          <h2 style={{ marginBottom: 8 }}>Cadastro de Veículos</h2>
          <p style={{ color: '#6b7280' }}>
            Tela do cadastro ainda está em modo inicial. Assim que você confirmar que o clique está funcionando,
            eu conecto o formulário completo (placa, ficha de retirada, fotos, NF, custos e gráficos).
          </p>
        </div>
      );
    }

    if (aba === 'vistoria') {
      return (
        <div>
          <h2 style={{ marginBottom: 8 }}>Vistoria Antes/Depois</h2>
          <p style={{ color: '#6b7280' }}>
            Tela inicial de vistoria. Clique em “Manutenções e Itens” para registrar troca/reparo e custo.
          </p>
        </div>
      );
    }

    if (aba === 'manutencao') {
      return (
        <div>
          <h2 style={{ marginBottom: 8 }}>Manutenções e Itens</h2>
          <p style={{ color: '#6b7280' }}>
            Tela inicial de manutenção (troca/reparo). Vou conectar o registro completo e cálculo de tempo/custo
            quando você confirmar o comportamento dos botões.
          </p>
        </div>
      );
    }

    return (
      <div>
        <h2 style={{ marginBottom: 8 }}>Dashboard de Custos</h2>
        <p style={{ color: '#6b7280' }}>
          A aba “Dashboard” abre os gráficos e indicadores de tempo/pagamentos por manutenção.
          Neste momento é uma tela inicial para validação de navegação.
        </p>
      </div>
    );
  }, [aba]);

  return (
    <div style={{ padding: '24px' }}>
      <h1 style={{ marginBottom: '8px' }}>Manutenção e Vistoria de Veículos</h1>
      <p style={{ color: '#6b7280', marginBottom: '20px' }}>
        Acesse aqui o módulo de frota para cadastro, vistorias, manutenção e custos.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '12px' }}>
        <button
          type="button"
          className="card"
          style={{ display: 'flex', gap: '10px', alignItems: 'center', cursor: 'pointer' }}
          onClick={() => setAba('cadastro')}
        >
          <FiTruck />
          <span>Cadastro de Veículos</span>
        </button>
        <button
          type="button"
          className="card"
          style={{ display: 'flex', gap: '10px', alignItems: 'center', cursor: 'pointer' }}
          onClick={() => setAba('vistoria')}
        >
          <FiClipboard />
          <span>Vistoria Antes/Depois</span>
        </button>
        <button
          type="button"
          className="card"
          style={{ display: 'flex', gap: '10px', alignItems: 'center', cursor: 'pointer' }}
          onClick={() => setAba('manutencao')}
        >
          <FiTool />
          <span>Manutenções e Itens</span>
        </button>
        <button
          type="button"
          className="card"
          style={{ display: 'flex', gap: '10px', alignItems: 'center', cursor: 'pointer' }}
          onClick={() => setAba('dashboard')}
        >
          <FiBarChart2 />
          <span>Dashboard de Custos</span>
        </button>
      </div>

      <div style={{ marginTop: 18 }}>{conteudo}</div>
    </div>
  );
};

export default VeiculosManutencao;
