/**
 * Etapa 212 (RN-212.01 a RN-212.05) — a seção "Fornecedores deste material" do formulário de Compras → Materiais.
 *
 * Cada linha é a linha do catálogo do fornecedor que é este material: fornecedor, código no fornecedor, descrição comercial,
 * unidade e preço. Cada gesto grava NA HORA (não espera o Salvar do material — o PUT do material não mexe nesta lista). O código
 * interno da GMP nunca muda por aqui. Portas: `/compras/materiais/cadastro/:id/fornecedores` (o servidor decide quem grava).
 */
import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import { FiPlus, FiEdit2, FiTrash2, FiSave, FiX, FiTruck } from 'react-icons/fi';
import api from '../../services/api';

export const urlFornecedoresDoMaterial = (materialId, linhaId) =>
  `/compras/materiais/cadastro/${materialId}/fornecedores${linhaId ? `/${linhaId}` : ''}`;

const VAZIO = { fornecedor_id: '', codigo: '', descricao: '', unidade: '', preco: '' };
const nomeDoFornecedor = (f) => (f.nome_fantasia && f.nome_fantasia.trim()) || f.razao_social;
const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const FornecedoresDoMaterial = ({ materialId, somenteLeitura = false, textoAntigo = null }) => {
  const [linhas, setLinhas] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState(null); // null = fechado; { ...VAZIO, id? }
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await api.get(urlFornecedoresDoMaterial(materialId));
      setLinhas(Array.isArray(r.data) ? r.data : []);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Erro ao carregar os fornecedores do material');
    } finally { setCarregando(false); }
  }, [materialId]);

  useEffect(() => { carregar(); }, [carregar]);

  const abrirNovo = async () => {
    setForm({ ...VAZIO });
    if (fornecedores.length) return;
    try {
      // o inativo e recusado pelo servidor (RN-212.02); status NULL (legado) conta como ativo, como no servidor
      const r = await api.get('/compras/fornecedores');
      const lista = (Array.isArray(r.data) ? r.data : []).filter((f) => String(f.status || 'ativo').toLowerCase() !== 'inativo');
      setFornecedores([...lista].sort((a, b) => nomeDoFornecedor(a).localeCompare(nomeDoFornecedor(b), 'pt-BR')));
    } catch { toast.error('Erro ao carregar a lista de fornecedores'); }
  };
  const abrirEdicao = (l) => setForm({
    id: l.id, fornecedor_id: l.fornecedor_id, fornecedor_nome: l.fornecedor_nome, codigo: l.codigo || '',
    descricao: l.descricao || '', unidade: l.unidade || '', preco: l.preco == null ? '' : String(l.preco),
  });

  const salvar = async () => {
    if (!form.id && !form.fornecedor_id) { toast.error('Escolha o fornecedor.'); return; }
    setSalvando(true);
    try {
      const corpo = { codigo: form.codigo, descricao: form.descricao, unidade: form.unidade, preco: form.preco };
      if (form.id) await api.put(urlFornecedoresDoMaterial(materialId, form.id), corpo);
      else await api.post(urlFornecedoresDoMaterial(materialId), { ...corpo, fornecedor_id: Number(form.fornecedor_id) });
      toast.success(form.id ? 'Fornecedor do material atualizado' : 'Fornecedor vinculado ao material');
      setForm(null);
      carregar();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Erro ao salvar o fornecedor do material');
    } finally { setSalvando(false); }
  };

  const remover = async (l) => {
    if (!window.confirm(`Remover o fornecedor "${l.fornecedor_nome}" deste material? A linha sai também da lista de itens do fornecedor.`)) return;
    try {
      await api.delete(urlFornecedoresDoMaterial(materialId, l.id));
      toast.success('Fornecedor removido do material');
      carregar();
    } catch (err) { toast.error(err?.response?.data?.error || 'Erro ao remover o fornecedor'); }
  };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div data-testid="fornecedores-do-material">
      <div className="almox-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <FiTruck size={14} /> Fornecedores deste material
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)', margin: '0 0 12px' }}>
        O mesmo material pode vir de vários fornecedores, cada um com o seu código. O código da GMP continua sendo o principal.
        As mudanças desta lista são gravadas na hora.
      </p>
      {textoAntigo && (textoAntigo.fornecedor || textoAntigo.codigo) && (
        <div data-testid="fornecedor-texto-antigo" style={{ fontSize: '0.8rem', marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(229,152,0,0.08)', border: '1px solid rgba(229,152,0,0.3)' }}>
          Fornecedor informado antes (texto livre): <strong>{textoAntigo.fornecedor || '—'}</strong>
          {textoAntigo.codigo ? <> · código <strong>{textoAntigo.codigo}</strong></> : null}
          {' '}— se ainda não estiver na lista abaixo, vincule-o.
        </div>
      )}

      {carregando ? (
        <div style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)' }}>Carregando fornecedores...</div>
      ) : linhas.length === 0 ? (
        <div style={{ fontSize: '0.85rem', color: 'var(--gmp-text-light)', marginBottom: 12 }}>Nenhum fornecedor vinculado.</div>
      ) : (
        <table className="almox-table" style={{ fontSize: '0.85rem', marginBottom: 12 }}>
          <thead>
            <tr><th>Fornecedor</th><th>Código no fornecedor</th><th>Descrição do fornecedor</th><th>Unid.</th><th>Preço</th><th /></tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} data-testid={`fornecedor-do-material-${l.id}`}>
                <td>{l.fornecedor_nome}</td>
                <td style={{ fontFamily: 'monospace' }}>{l.codigo || '—'}</td>
                <td>{l.descricao}</td>
                <td>{l.unidade}</td>
                <td>{moeda(l.preco)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {!somenteLeitura && (
                    <>
                      <button type="button" className="almox-btn-icon" title="Editar" onClick={() => abrirEdicao(l)}
                        data-testid={`editar-fornecedor-${l.id}`}><FiEdit2 size={13} /></button>
                      <button type="button" className="almox-btn-icon danger" title="Remover" onClick={() => remover(l)}
                        data-testid={`remover-fornecedor-${l.id}`}><FiTrash2 size={13} /></button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!somenteLeitura && !form && (
        <button type="button" className="btn-almox-secondary" onClick={abrirNovo} data-testid="vincular-fornecedor">
          <FiPlus size={13} /> Vincular fornecedor
        </button>
      )}

      {form && (
        // Fase 5 da 212: a secao mora DENTRO do <form> do material — Enter num campo daqui enviava o material (PUT e volta para a
        // lista) e o fornecedor digitado se perdia. Enter aqui salva o fornecedor.
        <div style={{ border: '1px solid rgba(79,172,254,0.25)', borderRadius: 10, padding: 14 }} data-testid="form-fornecedor-do-material"
          onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); salvar(); } }}>
          <div className="almox-form-grid">
            <div className="almox-field">
              <label className="almox-label" htmlFor="fdm-fornecedor">Fornecedor<span className="required">*</span></label>
              {form.id ? (
                <div style={{ padding: '8px 0', fontWeight: 600 }}>{form.fornecedor_nome}</div>
              ) : (
                <select id="fdm-fornecedor" className="almox-form-select" value={form.fornecedor_id}
                  onChange={(e) => set('fornecedor_id', e.target.value)}>
                  <option value="">Selecione...</option>
                  {fornecedores.filter((f) => !linhas.some((l) => l.fornecedor_id === f.id)).map((f) => (
                    <option key={f.id} value={f.id}>{nomeDoFornecedor(f)}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="almox-field">
              <label className="almox-label" htmlFor="fdm-codigo">Código no fornecedor</label>
              <input id="fdm-codigo" className="almox-input" value={form.codigo} onChange={(e) => set('codigo', e.target.value)}
                placeholder="Ex.: INX-001" />
            </div>
            <div className="almox-field almox-form-full">
              <label className="almox-label" htmlFor="fdm-descricao">Descrição do fornecedor</label>
              <input id="fdm-descricao" className="almox-input" value={form.descricao} onChange={(e) => set('descricao', e.target.value)}
                placeholder="Se o fornecedor usa outra descrição (vazio = o nome do material)" />
            </div>
            <div className="almox-field">
              <label className="almox-label" htmlFor="fdm-unidade">Unidade</label>
              <input id="fdm-unidade" className="almox-input" value={form.unidade} onChange={(e) => set('unidade', e.target.value)}
                placeholder="UN" />
            </div>
            <div className="almox-field">
              <label className="almox-label" htmlFor="fdm-preco">Preço (R$)</label>
              <input id="fdm-preco" className="almox-input" inputMode="decimal" value={form.preco}
                onChange={(e) => set('preco', e.target.value)} placeholder="0,00" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" className="btn-almox-primary" onClick={salvar} disabled={salvando} data-testid="salvar-fornecedor-do-material">
              <FiSave size={13} /> {salvando ? 'Salvando...' : 'Salvar fornecedor'}
            </button>
            <button type="button" className="btn-almox-secondary" onClick={() => setForm(null)}><FiX size={13} /> Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FornecedoresDoMaterial;
