import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { FiAlertTriangle, FiEdit2, FiPlus, FiRefreshCw, FiRotateCcw, FiSave, FiTag, FiTrash2 } from 'react-icons/fi';
import api from '../../services/api';
import AvisoSomenteLeitura from './AvisoSomenteLeitura';
import './Almoxarifado.css';

// Etapa 215 (RN-215.03): o aviso do Almoxarifado — a aba so consulta; a MESMA literal do 403 do servidor.
export const AVISO_CATEGORIAS_NO_COMPRAS = 'O cadastro de categorias é feito em Compras → Categorias.';

// Etapa 215 (contrato do plano): por onde a tela fala com o servidor. A lista vai SEMPRE com `?todos=1` (a decisao 1 abaixo); o
// Almoxarifado le pela rota dele (gravar recusa, RN-215.02); o Compras le pela porta de leitura `/compras/materiais/aux/...` e grava
// pelas `/compras/materiais/...` (RN-215.01).
export const ROTAS_CATEGORIAS_ALMOXARIFADO = {
  lista: '/almoxarifado/categorias?todos=1',
  criar: '/almoxarifado/categorias',
  item: (id) => `/almoxarifado/categorias/${id}`,
};
export const ROTAS_CATEGORIAS_COMPRAS = {
  lista: '/compras/materiais/aux/categorias?todos=1',
  criar: '/compras/materiais/categorias',
  item: (id) => `/compras/materiais/categorias/${id}`,
};

/* ===================== TAB CATEGORIAS DE MATERIAL ===================== */
/**
 * Etapa 26, Task 3 — o cadastro de categorias de material.
 *
 * FAMÍLIAS É O MOLDE DA UI (estados de carregamento/erro, formulário embutido, botões), mas NÃO
 * do modelo: família tem `parent_id`, código automático e hierarquia; categoria é uma lista
 * PLANA de nomes. A tabela `categorias_material_almoxarifado` tem uma coluna `parent_id` herdada
 * da modelagem original e sem nenhum uso — esta aba a ignora de propósito, e tratá-la como
 * árvore inventaria uma hierarquia que o servidor não valida.
 *
 * Três decisões que o servidor (Task 1) impõe e que a tela precisa respeitar:
 *
 *  1. o GET vai SEMPRE com `?todos=1`. Sem ele a resposta traz só `ativo = 1`, e a categoria que
 *     acabou de ser desativada some da única tela capaz de reativá-la — "desativar não apaga"
 *     ficaria verdadeiro no banco e falso para o usuário;
 *  2. renomear manda `PUT` SEM `ativo`. A rota preserva o valor atual quando o campo é omitido;
 *     mandar `ativo: 1` no rename ressuscitaria em silêncio uma categoria aposentada;
 *  3. reativar manda `PUT { nome, ativo: 1 }` — pela mesma regra, um PUT sem `ativo` aqui seria
 *     um no-op com toast de sucesso.
 *
 * RN-05: renomear NÃO reescreve `materiais.categoria` (a coluna é texto livre, não chave
 * estrangeira). O aviso abaixo é a única vez em que o usuário fica sabendo disso ANTES de agir —
 * sem ele, renomeia achando que reclassificou o acervo. Propagar o rename (ou promover a coluna
 * a chave estrangeira) é decisão de outra etapa, registrada na letra B.
 *
 * Etapa 215: a aba saiu de `ConfiguracoesAlmoxarifado.js` para servir as duas telas — Almoxarifado -> Configuracoes -> Categorias
 * (`podeGravar` false, sempre: RN-215.03 — a lista, ativas e inativas, sem Nova/Renomear/Desativar/Reativar e sem a coluna Acoes)
 * e Compras -> Categorias (`podeGravar` = quem cadastra material: RN-215.01). `aviso`: a faixa de cima (null = nenhuma). Com
 * `podeGravar` os gestos, toasts e confirmacao sao os de antes, letra por letra.
 */
const CategoriasDeMaterial = ({ rotas, podeGravar = false, aviso = null }) => {
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({ nome: '' });

  useEffect(() => { loadCategorias(); }, []);

  const loadCategorias = async () => {
    setLoading(true);
    try {
      const res = await api.get(rotas.lista);
      setCategorias(res.data);
    } catch { toast.error('Erro ao carregar categorias'); }
    finally { setLoading(false); }
  };

  const resetForm = () => {
    setForm({ nome: '' });
    setEditando(null);
    setShowForm(false);
  };

  const handleEditar = (cat) => {
    setForm({ nome: cat.nome });
    setEditando(cat.id);
    setShowForm(true);
  };

  const handleSalvar = async () => {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return; }
    setSaving(true);
    try {
      if (editando) {
        // SEM `ativo`: a rota preserva o valor atual quando o campo é omitido.
        await api.put(rotas.item(editando), { nome: form.nome });
        toast.success('Categoria renomeada! Os materiais já classificados mantêm o nome antigo.');
      } else {
        await api.post(rotas.criar, { nome: form.nome });
        toast.success('Categoria criada!');
      }
      resetForm();
      loadCategorias();
    } catch (err) {
      // A mensagem do servidor CRUA: ele já diz o que houve ("Já existe uma categoria com este
      // nome"). Trocar por "Erro ao salvar" faria o usuário tentar o mesmo nome de novo.
      toast.error(err.response?.data?.error || 'Erro ao salvar');
    } finally { setSaving(false); }
  };

  const handleDesativar = async (cat) => {
    if (!window.confirm(
      `Desativar a categoria "${cat.nome}"? Ela sai das listas de novos materiais, mas os que já a usam continuam com ela.`
    )) return;
    try {
      await api.delete(rotas.item(cat.id));
      toast.success('Categoria desativada');
      loadCategorias();
    } catch (err) { toast.error(err.response?.data?.error || 'Erro ao desativar'); }
  };

  const handleReativar = async (cat) => {
    try {
      // `ativo: 1` EXPLÍCITO — omitir preservaria o 0 e o clique não faria nada.
      await api.put(rotas.item(cat.id), { nome: cat.nome, ativo: 1 });
      toast.success('Categoria reativada');
      loadCategorias();
    } catch (err) { toast.error(err.response?.data?.error || 'Erro ao reativar'); }
  };

  return (
    <div>
      {aviso && <AvisoSomenteLeitura frase={aviso} className="almox-categorias-somente-leitura" />}
      <p style={{ fontSize: '0.85rem', color: 'var(--gmp-text-light)', marginBottom: 20 }}>
        Classificação livre dos materiais (ex.: Consumível, Aço carbono). Desativar não apaga:
        a categoria sai das listas de novos materiais e continua valendo nos que já a usam.
      </p>

      {!showForm && podeGravar && (
        <button className="btn-almox-primary" style={{ marginBottom: 20 }} onClick={() => setShowForm(true)}>
          <FiPlus size={14} /> Nova Categoria
        </button>
      )}

      {showForm && (
        <div style={{ background: 'var(--gmp-surface)', border: '1px solid rgba(79,172,254,0.25)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 18 }}>
            {editando ? '✏️ Renomear Categoria' : '➕ Nova Categoria'}
          </div>
          <div className="almox-field" style={{ marginBottom: 16, maxWidth: 420 }}>
            <label className="almox-label">Nome<span className="required">*</span></label>
            <input className="almox-input" value={form.nome}
              onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
              placeholder="Ex: Consumível, Aço carbono..." />
          </div>

          {/* RN-05 — só no renomear: criar não tem este efeito colateral, e aviso permanente
              vira ruído que o usuário para de ler. */}
          {editando && (
            <div style={{
              display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 20,
              background: 'rgba(249,168,37,0.08)', border: '1px solid rgba(249,168,37,0.3)',
              borderRadius: 8, padding: '12px 14px', fontSize: '0.82rem', color: 'var(--gmp-text)',
            }}>
              <FiAlertTriangle size={16} style={{ color: '#f9a825', flexShrink: 0, marginTop: 1 }} />
              <span>
                Renomear <strong>não reclassifica</strong> os materiais: os que já usam esta
                categoria continuam gravados com o <strong>nome antigo</strong>. Para movê-los,
                edite cada material.
              </span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-almox-primary" onClick={handleSalvar} disabled={saving}>
              <FiSave size={14} /> {saving ? 'Salvando...' : 'Salvar Categoria'}
            </button>
            <button className="btn-almox-secondary" onClick={resetForm}>Cancelar</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="almox-loading"><FiRefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Carregando...</div>
      ) : categorias.length === 0 ? (
        <div className="almox-empty" style={{ padding: 40 }}>
          <FiTag size={40} style={{ opacity: 0.3, display: 'block', margin: '0 auto 12px' }} />
          <p>Nenhuma categoria cadastrada</p>
        </div>
      ) : (
        <table className="almox-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th style={{ width: 120 }}>Situação</th>
              {podeGravar && <th style={{ width: 140 }}>Ações</th>}
            </tr>
          </thead>
          <tbody>
            {categorias.map(cat => (
              <tr key={cat.id} style={{ opacity: cat.ativo ? 1 : 0.6 }}>
                <td style={{ fontWeight: 600 }}>{cat.nome}</td>
                <td>
                  {cat.ativo ? (
                    <span style={{ fontSize: '0.7rem', background: 'rgba(67,233,123,0.12)', color: '#27ae60', padding: '2px 10px', borderRadius: 20, fontWeight: 600 }}>Ativa</span>
                  ) : (
                    <span style={{ fontSize: '0.7rem', background: 'rgba(120,144,156,0.15)', color: 'var(--gmp-text-light)', padding: '2px 10px', borderRadius: 20, fontWeight: 600 }}>Inativa</span>
                  )}
                </td>
                {podeGravar && (
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {cat.ativo ? (
                      <>
                        <button className="almox-btn-icon" title="Renomear" onClick={() => handleEditar(cat)}>
                          <FiEdit2 size={13} />
                        </button>
                        <button className="almox-btn-icon danger" title="Desativar" onClick={() => handleDesativar(cat)}>
                          <FiTrash2 size={13} />
                        </button>
                      </>
                    ) : (
                      <button className="btn-almox-secondary" title="Reativar"
                        style={{ fontSize: '0.75rem', padding: '4px 12px' }}
                        onClick={() => handleReativar(cat)}>
                        <FiRotateCcw size={12} /> Reativar
                      </button>
                    )}
                  </div>
                </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default CategoriasDeMaterial;
