import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { FiPackage, FiPlus, FiTrash2, FiChevronDown } from 'react-icons/fi';
import './OpcoesPorFamilia.css';

function parseMarcadores(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((m, i) => ({ ...m, numero: m.numero != null ? m.numero : i + 1 }));
  if (raw.marcadores && Array.isArray(raw.marcadores)) return raw.marcadores.map((m, i) => ({ ...m, numero: m.numero != null ? m.numero : i + 1 }));
  return [];
}

const OpcoesPorFamilia = () => {
  const [familias, setFamilias] = useState([]);
  const [familiaId, setFamiliaId] = useState('');
  const [familiaDetail, setFamiliaDetail] = useState(null);
  const [opcoesByVar, setOpcoesByVar] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [novoValor, setNovoValor] = useState({}); // { variavel_chave: '' }
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/familias/todas').then((res) => {
      setFamilias(Array.isArray(res.data) ? res.data : []);
    }).catch(() => setFamilias([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!familiaId) {
      setFamiliaDetail(null);
      setOpcoesByVar({});
      return;
    }
    setLoadingDetail(true);
    Promise.all([
      api.get(`/familias/${familiaId}`),
      api.get(`/familias/${familiaId}/opcoes-variaveis`)
    ]).then(([famRes, opcRes]) => {
      const fam = famRes.data;
      let raw = fam.marcadores_vista;
      if (typeof raw === 'string') try { raw = JSON.parse(raw); } catch (_) { raw = []; }
      const marcadores = parseMarcadores(raw);
      setFamiliaDetail({ ...fam, marcadores });
      setOpcoesByVar(opcRes.data || {});
      setNovoValor({});
    }).catch((err) => {
      console.error(err);
      setFamiliaDetail(null);
      setOpcoesByVar({});
    }).finally(() => setLoadingDetail(false));
  }, [familiaId]);

  const marcadores = familiaDetail?.marcadores || [];

  const addOpcao = async (variavelChave, valor) => {
    const v = (valor || novoValor[variavelChave] || '').trim();
    if (!v || !familiaId) return;
    setSaving(true);
    try {
      await api.post(`/familias/${familiaId}/variaveis/${variavelChave}/opcoes`, { valor: v });
      const res = await api.get(`/familias/${familiaId}/opcoes-variaveis`);
      setOpcoesByVar(res.data || {});
      setNovoValor(prev => ({ ...prev, [variavelChave]: '' }));
    } catch (e) {
      console.error(e);
      alert(e.response?.data?.error || 'Erro ao adicionar opção');
    } finally {
      setSaving(false);
    }
  };

  const removeOpcao = async (variavelChave, id) => {
    if (!familiaId || !id) return;
    setSaving(true);
    try {
      await api.delete(`/familias/${familiaId}/variaveis/${variavelChave}/opcoes/${id}`);
      const res = await api.get(`/familias/${familiaId}/opcoes-variaveis`);
      setOpcoesByVar(res.data || {});
    } catch (e) {
      console.error(e);
      alert(e.response?.data?.error || 'Erro ao remover opção');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="opcoes-familia-loading">Carregando famílias...</div>;
  }

  return (
    <div className="config-section opcoes-por-familia">
      <h2><FiPackage /> Opções de configuração por família</h2>
      <p className="opcoes-familia-desc">
        Defina, para cada família, os valores disponíveis em cada marcador técnico. Na proposta, o vendedor escolherá marcador a marcador e o sistema indicará se o equipamento é <strong>Existente</strong> (padrão) ou <strong>Não existente</strong> (sob consulta).
      </p>
      <div className="opcoes-familia-select-wrap">
        <label>Família</label>
        <select
          value={familiaId}
          onChange={(e) => setFamiliaId(e.target.value)}
          className="opcoes-familia-select"
        >
          <option value="">Selecione uma família</option>
          {familias.filter(f => f.ativo !== 0).map((f) => (
            <option key={f.id} value={f.id}>{f.nome}</option>
          ))}
        </select>
      </div>

      {loadingDetail && <div className="opcoes-familia-loading">Carregando marcadores e opções...</div>}

      {!loadingDetail && familiaId && familiaDetail && (
        <div className="opcoes-familia-content">
          {marcadores.length === 0 ? (
            <p className="opcoes-familia-empty">
              Esta família ainda não tem marcadores técnicos na vista frontal. Edite a família e adicione marcadores na vista frontal para poder configurar as opções aqui.
            </p>
          ) : (
            <div className="opcoes-familia-marcadores">
              {marcadores.map((m) => {
                const chave = m.variavel || m.key || '';
                const opcoes = opcoesByVar[chave] || [];
                const valorNovo = novoValor[chave] || '';
                return (
                  <div key={m.id || chave} className="opcoes-familia-card">
                    <div className="opcoes-familia-card-header">
                      <span className="opcoes-familia-numero">{m.numero != null ? m.numero : '—'}</span>
                      <span className="opcoes-familia-label">{m.label || chave || 'Variável'}</span>
                      <span className="opcoes-familia-chave">{chave}</span>
                    </div>
                    <div className="opcoes-familia-card-body">
                      <ul className="opcoes-familia-list">
                        {opcoes.map((o) => (
                          <li key={o.id} className="opcoes-familia-item">
                            <span>{o.valor}</span>
                            <button
                              type="button"
                              className="opcoes-familia-btn-remove"
                              onClick={() => removeOpcao(chave, o.id)}
                              disabled={saving}
                              title="Remover"
                            >
                              <FiTrash2 size={14} />
                            </button>
                          </li>
                        ))}
                      </ul>
                      <div className="opcoes-familia-add">
                        <input
                          type="text"
                          value={valorNovo}
                          onChange={(e) => setNovoValor(prev => ({ ...prev, [chave]: e.target.value }))}
                          placeholder="Novo valor (ex: 50 CV, Inox 304)"
                          onKeyDown={(e) => e.key === 'Enter' && addOpcao(chave, valorNovo)}
                        />
                        <button
                          type="button"
                          className="opcoes-familia-btn-add"
                          onClick={() => addOpcao(chave, valorNovo)}
                          disabled={saving || !valorNovo.trim()}
                        >
                          <FiPlus size={16} /> Adicionar
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default OpcoesPorFamilia;
