import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { fetchFrotasMeta } from '../../utils/frotasApi';
import { toast } from 'react-toastify';
import { FiPlus, FiSearch, FiEdit, FiTrash2, FiX, FiCheck } from 'react-icons/fi';
import FrotasPageHeader from './FrotasPageHeader';
import { ENTITY_CONFIGS } from './frotasEntityConfigs';
import { mascararTelefoneDigitando, mascararTelefoneCompleto } from '../../utils/telefone';
import { useAuth } from '../../context/AuthContext';
import { getEffectiveUser } from '../../services/permissionsCache';
import { perfilFrota, PERFIS_FROTA } from '../../utils/systemPermissions';
import './Frotas.css';

const FrotasEntityPage = ({ entityKey }) => {
  const config = ENTITY_CONFIGS[entityKey];
  const { user } = useAuth();
  // Frota Etapa 2 (RN-F2.14): CONSULTA so le — sem Novo, Editar, Aprovar e Excluir (ate aqui via os botoes e levava 403 ao salvar).
  // A regua e a do servidor (perfilFrota); quem decide continua sendo ele.
  const podeAlterar = perfilFrota(getEffectiveUser(user)) !== PERFIS_FROTA.CONSULTA;
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [veiculos, setVeiculos] = useState([]);
  const [motoristas, setMotoristas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const loadAux = useCallback(async () => {
    const promises = [fetchFrotasMeta().catch(() => null)];
    if (config.needsVeiculos) promises.push(api.get('/frotas/veiculos').catch(() => ({ data: [] })));
    if (config.needsMotoristas) promises.push(api.get('/frotas/motoristas').catch(() => ({ data: [] })));
    // Frota Etapa 1 (T7, F2-5): usuarios ativos com o motorista a que cada um ja esta ligado.
    if (config.needsUsuariosVinculaveis) promises.push(api.get('/frotas/usuarios-vinculaveis').catch(() => ({ data: [] })));
    const results = await Promise.all(promises);
    setMeta(results[0]);
    let idx = 1;
    if (config.needsVeiculos) { setVeiculos(results[idx]?.data || []); idx += 1; }
    if (config.needsMotoristas) { setMotoristas(results[idx]?.data || []); idx += 1; }
    if (config.needsUsuariosVinculaveis) { setUsuarios(Array.isArray(results[idx]?.data) ? results[idx].data : []); }
  }, [config]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = { search, ...filters };
      Object.keys(params).forEach((k) => { if (!params[k]) delete params[k]; });
      const res = await api.get(`/frotas/${config.endpoint}`, { params });
      setRows(res.data || []);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao carregar dados');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [config.endpoint, search, filters]);

  useEffect(() => { loadAux(); }, [loadAux]);
  useEffect(() => { loadRows(); }, [loadRows]);

  const openNew = () => {
    setEditing(null);
    setForm(config.getDefaultForm(meta));
    setShowModal(true);
  };

  const openEdit = (row) => {
    if (config.readOnlyEdit) return;
    setEditing(row);
    const defaults = config.getDefaultForm(meta);
    const merged = { ...defaults };
    Object.keys(defaults).forEach((k) => {
      if (row[k] !== undefined && row[k] !== null) merged[k] = row[k];
    });
    // Registro gravado antes da máscara abre já formatado no campo.
    (config.camposTelefone || []).forEach((k) => {
      if (merged[k]) merged[k] = mascararTelefoneCompleto(merged[k]);
    });
    setForm(merged);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Confirma a exclusão deste registro?')) return;
    try {
      await api.delete(`/frotas/${config.endpoint}/${id}`);
      toast.success('Registro excluído');
      loadRows();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao excluir');
    }
  };

  const handleAprovarViagem = async (id) => {
    try {
      await api.post(`/frotas/viagens/${id}/aprovar`);
      toast.success('Viagem aprovada');
      loadRows();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao aprovar');
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form };
      Object.keys(payload).forEach((k) => {
        if (payload[k] === '') payload[k] = null;
      });
      ['veiculo_id', 'motorista_id', 'tipo_id', 'ano', 'alerta_dias_antes', 'pontos', 'requisicao_almox_id', 'consumo_medio_esperado', 'horimetro_atual', 'usuario_id'].forEach((k) => {
        if (payload[k] != null && payload[k] !== '') payload[k] = Number(payload[k]);
      });
      ['pneus_ok', 'oleo_ok', 'luzes_ok', 'freios_ok', 'extintor_ok', 'documentos_ok', 'limpeza_ok'].forEach((k) => {
        if (payload[k] !== undefined) payload[k] = payload[k] ? 1 : 0;
      });

      if (editing?.id) {
        await api.put(`/frotas/${config.endpoint}/${editing.id}`, payload);
        toast.success('Registro atualizado');
      } else {
        await api.post(`/frotas/${config.endpoint}`, payload);
        toast.success('Registro criado');
      }
      setShowModal(false);
      loadRows();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const renderCell = (col, row) => {
    if (col.render) return col.render(row);
    const val = col.format ? col.format(row) : (row[col.key] ?? '-');
    if (col.badge) {
      const cls = String(row[col.key] || '').toLowerCase().replace(/\s/g, '_');
      return <span className={`frotas-badge frotas-badge-${cls}`}>{row[col.key] || '-'}</span>;
    }
    if (col.bold) return <strong>{val}</strong>;
    return val;
  };

  const formFields = config.formFields(meta, form, setForm, veiculos, motoristas, { usuarios, editing });
  const ehCampoTelefone = (key) => (config.camposTelefone || []).includes(key);

  if (!config) return <div className="frotas-page">Entidade não configurada.</div>;

  return (
    <div className="frotas-page">
      <FrotasPageHeader
        title={config.title}
        subtitle={config.subtitle}
        breadcrumbs={[{ label: config.breadcrumb }]}
        actions={podeAlterar ? (
          <button type="button" className="frotas-btn frotas-btn-primary" onClick={openNew}>
            <FiPlus /> {config.newLabel}
          </button>
        ) : null}
      />

      <div className="frotas-toolbar">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flex: 1 }}>
          <div className="frotas-search">
            <FiSearch />
            <input
              type="text"
              placeholder={config.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {(config.filters || []).map((f) => (
            <select
              key={f.key}
              className="frotas-filter-select"
              value={filters[f.key] || ''}
              onChange={(e) => setFilters((prev) => ({ ...prev, [f.key]: e.target.value }))}
            >
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ))}
        </div>
      </div>

      <div className="frotas-section">
        <div className="frotas-table-wrap">
          {loading ? (
            <div className="frotas-empty">Carregando...</div>
          ) : (
            <table className="frotas-table">
              <thead>
                <tr>
                  {config.columns.map((c) => <th key={c.key}>{c.label}</th>)}
                  {podeAlterar && <th>Ações</th>}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={config.columns.length + (podeAlterar ? 1 : 0)} className="frotas-empty">Nenhum registro encontrado</td></tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id}>
                      {config.columns.map((c) => (
                        <td key={c.key}>{renderCell(c, row)}</td>
                      ))}
                      {podeAlterar && (
                      <td>
                        <div className="frotas-actions">
                          {/* Frota Etapa 6: acoes proprias da entidade (componente opcional; recebe a linha e o recarregar da lista). */}
                          {config.AcoesDaLinha && <config.AcoesDaLinha row={row} recarregar={loadRows} />}
                          {!config.readOnlyEdit && (
                            <button type="button" className="frotas-action-btn" onClick={() => openEdit(row)} title="Editar">
                              <FiEdit size={14} />
                            </button>
                          )}
                          {config.extraActions && row.status === 'solicitada' && (
                            <button type="button" className="frotas-action-btn" onClick={() => handleAprovarViagem(row.id)} title="Aprovar">
                              <FiCheck size={14} />
                            </button>
                          )}
                          <button type="button" className="frotas-action-btn danger" onClick={() => handleDelete(row.id)} title="Excluir">
                            <FiTrash2 size={14} />
                          </button>
                        </div>
                      </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showModal && (
        <div className="frotas-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="frotas-modal" onClick={(e) => e.stopPropagation()}>
            <div className="frotas-modal-header">
              <h2>{editing ? 'Editar' : config.newLabel}</h2>
              <button type="button" className="frotas-action-btn" onClick={() => setShowModal(false)}><FiX /></button>
            </div>
            <form onSubmit={handleSave}>
              <div className="frotas-modal-body">
                <div className="frotas-form-grid">
                  {formFields.map((field) => {
                    if (field.type === 'checks') {
                      return (
                        <div key={field.key} className="frotas-form-group full">
                          <label>{field.label}</label>
                          <div className="frotas-check-grid">
                            {field.items.map((item) => (
                              <label key={item.key} className="frotas-check-item">
                                <input
                                  type="checkbox"
                                  checked={!!form[item.key]}
                                  onChange={(e) => setForm((f) => ({ ...f, [item.key]: e.target.checked ? 1 : 0 }))}
                                />
                                {item.label}
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={field.key} className={`frotas-form-group ${field.full ? 'full' : ''}`}>
                        <label>{field.label}</label>
                        {field.type === 'select' ? (
                          <select
                            value={form[field.key] ?? ''}
                            required={field.required}
                            onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                          >
                            <option value="">{field.placeholder || 'Selecione...'}</option>
                            {(field.options || []).map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        ) : field.type === 'textarea' ? (
                          <textarea
                            value={form[field.key] ?? ''}
                            onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                          />
                        ) : ehCampoTelefone(field.key) ? (
                          <input
                            type="text"
                            value={form[field.key] ?? ''}
                            required={field.required}
                            placeholder="(00) 00000-0000"
                            inputMode="tel"
                            maxLength={15}
                            onChange={(e) => setForm((f) => ({ ...f, [field.key]: mascararTelefoneDigitando(e.target.value) }))}
                          />
                        ) : (
                          <input
                            type={field.type || 'text'}
                            value={form[field.key] ?? ''}
                            required={field.required}
                            onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                          />
                        )}
                        {/* Frota Etapa 2 (RN-F2.09): aviso do campo (string|null), dado pela config; nao bloqueia o salvar. */}
                        {field.aviso && <div className="frotas-aviso-campo" role="note">{field.aviso}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="frotas-modal-footer">
                <button type="button" className="frotas-btn frotas-btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="frotas-btn frotas-btn-primary" disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export const FrotasVeiculos = () => <FrotasEntityPage entityKey="veiculos" />;
export const FrotasMotoristas = () => <FrotasEntityPage entityKey="motoristas" />;
export const FrotasManutencoes = () => <FrotasEntityPage entityKey="manutencoes" />;
export const FrotasAbastecimentos = () => <FrotasEntityPage entityKey="abastecimentos" />;
export const FrotasMultas = () => <FrotasEntityPage entityKey="multas" />;
export const FrotasDocumentos = () => <FrotasEntityPage entityKey="documentos" />;
export const FrotasViagens = () => <FrotasEntityPage entityKey="viagens" />;
export const FrotasChecklists = () => <FrotasEntityPage entityKey="checklists" />;

export default FrotasEntityPage;
