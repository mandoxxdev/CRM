/**
 * Etapa 192 (RN-192.10) — Compras → Materiais: a lista do cadastro de material, com "Novo material" e "Editar".
 *
 * Usa as portas do próprio Compras (`/compras/materiais/cadastro`, `/compras/materiais/aux/...`), porque o prefixo
 * `/almoxarifado` exige o módulo Almoxarifado, que o comprador pode não ter. O formulário é o MESMO do Almoxarifado
 * (`MaterialAlmoxarifadoForm` com `ROTAS_COMPRAS`). Excluir, foto, saldo e movimentação ficam no Almoxarifado.
 *
 * Quem decide é o servidor; `minhas-permissoes` (da porta do Compras) só esconde os botões e explica por que a lista não
 * aparece para quem não cadastra material.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiEdit, FiPlus, FiRefreshCw, FiSearch, FiPackage } from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../../services/api';
import { useAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';
import { ROTAS_COMPRAS } from '../almoxarifado/rotasCadastroMaterial';
import '../almoxarifado/Almoxarifado.css';

export const AVISO_SEM_ACESSO = 'Seu acesso não permite cadastrar material. Peça a um administrador o perfil de Almoxarife '
  + 'ou Engenharia no Almoxarifado.';

const MateriaisCompras = () => {
  const navigate = useNavigate();
  const { pode, bloquearSeNaoPode, loading: carregandoPermissoes } = useAlmoxPermissoes(ROTAS_COMPRAS.api.permissoes);
  const podeVer = pode('criar_material') || pode('editar_material');
  const [materiais, setMateriais] = useState([]);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const pedidoRef = useRef(0);

  const carregar = async () => {
    const meu = ++pedidoRef.current;
    setCarregando(true);
    try {
      const params = busca ? { search: busca } : {};
      const res = await api.get(ROTAS_COMPRAS.api.lista, { params });
      if (meu !== pedidoRef.current) return;
      setMateriais(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      if (meu !== pedidoRef.current) return;
      setMateriais([]);
      if (err?.response?.status !== 403) toast.error(err?.response?.data?.error || 'Erro ao carregar materiais');
    } finally {
      if (meu === pedidoRef.current) setCarregando(false);
    }
  };

  useEffect(() => {
    if (carregandoPermissoes || !podeVer) return undefined;
    const t = setTimeout(carregar, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, carregandoPermissoes, podeVer]);

  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1>Materiais</h1>
          <p>Compras · Cadastro de Materiais{podeVer && !carregando ? ` · ${materiais.length} ${materiais.length === 1 ? 'material' : 'materiais'}` : ''}</p>
        </div>
        {podeVer && (
          <div className="almox-header-actions">
            <button type="button" className="btn-almox-secondary" onClick={carregar}>
              <FiRefreshCw size={13} /> Atualizar
            </button>
            <Link to={ROTAS_COMPRAS.tela.novo} className="btn-almox-primary"
              onClick={(e) => bloquearSeNaoPode('criar_material', e)}>
              <FiPlus size={14} /> Novo Material
            </Link>
          </div>
        )}
      </div>

      {!carregandoPermissoes && !podeVer ? (
        <div className="almox-empty" data-testid="materiais-compras-sem-acesso">
          <FiPackage size={48} style={{ opacity: 0.3, display: 'block', margin: '0 auto 12px' }} />
          <p>{AVISO_SEM_ACESSO}</p>
        </div>
      ) : (
        <>
          <div className="almox-filters">
            <div className="almox-search-wrapper">
              <FiSearch className="almox-search-icon" />
              <input className="almox-search-input" placeholder="Buscar por nome, código ou fornecedor..."
                value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
          </div>
          <div className="almox-table-container">
            {carregando ? (
              <div className="almox-loading"><FiRefreshCw size={16} /> Carregando...</div>
            ) : materiais.length === 0 ? (
              <div className="almox-empty"><p>Nenhum material encontrado</p></div>
            ) : (
              <table className="almox-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Material</th>
                    <th>Família</th>
                    <th>Unidade</th>
                    <th>NCM</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {materiais.map((m) => (
                    <tr key={m.id}>
                      <td><span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{m.codigo}</span></td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{m.nome}</div>
                        {m.fornecedor_principal && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>{m.fornecedor_principal}</div>
                        )}
                      </td>
                      <td>{m.familia_nome || '—'}</td>
                      <td>{m.unidade || '—'}</td>
                      <td>{m.ncm || '—'}</td>
                      <td>
                        <div className="almox-actions">
                          <button type="button" className="almox-btn-icon primary" title="Edita o cadastro deste material"
                            data-testid={`editar-material-${m.id}`}
                            onClick={(e) => { if (!bloquearSeNaoPode('editar_material', e)) return; navigate(ROTAS_COMPRAS.tela.editar(m.id)); }}>
                            <FiEdit />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default MateriaisCompras;
