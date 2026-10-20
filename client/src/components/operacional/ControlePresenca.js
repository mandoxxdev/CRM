import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import useUltimoPedido from '../../hooks/useUltimoPedido';
import { hojeLocalISO } from '../../utils/dataLocal';
import { toast } from 'react-toastify';
import { FiSearch, FiCalendar, FiClock } from 'react-icons/fi';
import { SkeletonTable } from '../SkeletonLoader';
import PresencaForm from './PresencaForm';
import './Operacional.css';

const ControlePresenca = () => {
  const [presencas, setPresencas] = useState([]);
  const [loading, setLoading] = useState(true);
  // Etapa 161 (RN-161.05, C397): o filtro padrao e o hoje LOCAL — o toISOString dava o dia UTC (depois das 21h, o de amanha)
  const [dataInicio, setDataInicio] = useState(hojeLocalISO());
  const [dataFim, setDataFim] = useState(hojeLocalISO());
  const [showForm, setShowForm] = useState(false);
  const [selectedPresenca, setSelectedPresenca] = useState(null);

  useEffect(() => {
    loadPresencas();
  }, [dataInicio, dataFim]);

  // Etapa 161 (RN-161.01, C396): so o ULTIMO pedido mexe na lista — a resposta, o erro (o aviso) e o fim do carregando de um pedido
  // anterior (o periodo velho; tambem quem recarrega depois de registrar) sao descartados; o descarte e return, nunca erro
  const novoPedido = useUltimoPedido();
  const loadPresencas = async () => {
    const ehUltimo = novoPedido();
    try {
      setLoading(true);
      const response = await api.get('/operacional/controle-presenca', {
        params: { data_inicio: dataInicio, data_fim: dataFim }
      });
      if (!ehUltimo()) return;
      setPresencas(response.data || []);
    } catch (error) {
      if (!ehUltimo()) return;
      console.error('Erro ao carregar presenças:', error);
      toast.error('Erro ao carregar presenças');
    } finally {
      if (ehUltimo()) setLoading(false);
    }
  };

  const formatTime = (time) => {
    if (!time) return '-';
    return time.substring(0, 5);
  };

  if (showForm) {
    return <PresencaForm presenca={selectedPresenca} onClose={() => { setShowForm(false); setSelectedPresenca(null); loadPresencas(); }} />;
  }

  return (
    <div className="operacional-list">
      <div className="list-header">
        <div className="search-filters">
          <div className="form-group" style={{ margin: 0 }}>
            <label>Data Início</label>
            <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Data Fim</label>
            <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
          </div>
        </div>
        <button className="btn-primary" onClick={() => { setSelectedPresenca(null); setShowForm(true); }}>
          <FiClock /> Registrar Presença
        </button>
      </div>

      {loading ? (
        <SkeletonTable rows={8} cols={8} />
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Data</th>
                <th>Entrada</th>
                <th>Saída Almoço</th>
                <th>Retorno Almoço</th>
                <th>Saída</th>
                <th>Horas Trabalhadas</th>
                <th>Horas Extras</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {presencas.length === 0 ? (
                <tr><td colSpan="9" className="no-data">Nenhum registro de presença encontrado</td></tr>
              ) : (
                presencas.map((presenca) => (
                  <tr key={presenca.id}>
                    <td><strong>{presenca.colaborador_nome}</strong></td>
                    <td>{new Date(presenca.data).toLocaleDateString('pt-BR')}</td>
                    <td>{formatTime(presenca.hora_entrada)}</td>
                    <td>{formatTime(presenca.hora_saida_almoco)}</td>
                    <td>{formatTime(presenca.hora_entrada_almoco)}</td>
                    <td>{formatTime(presenca.hora_saida)}</td>
                    <td>{presenca.horas_trabalhadas ? `${presenca.horas_trabalhadas.toFixed(2)}h` : '-'}</td>
                    <td>{presenca.horas_extras ? `${presenca.horas_extras.toFixed(2)}h` : '-'}</td>
                    <td><span className={`status-badge status-${presenca.status}`}>{presenca.status}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ControlePresenca;
