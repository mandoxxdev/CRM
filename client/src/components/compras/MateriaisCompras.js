/**
 * Etapa 192 (RN-192.10) — Compras → Materiais: a lista do cadastro de material, com "Novo material" e "Editar".
 * Etapa 193 (RN-193.01..04): o cadastro e SO daqui — o Almoxarifado so consulta. Ganhou o filtro de inativos e os botoes
 * Inativar / Reativar (as mesmas regras do Almoxarifado: saldo e retencao prendem; reativar confere a familia), e o formulario
 * ganhou a foto e o Proprietario.
 *
 * 04/11/2026: a lista era outra, escrita do zero na 192 (Codigo, Material, Familia, Unidade, NCM; so busca e situacao). O pedido
 * era mover a tela do Almoxarifado para ca, nao fazer uma diferente — agora filtros e tabela sao os MESMOS do Almoxarifado
 * (`TabelaMateriais`: foto, categoria, quantidade com minimo e maximo, localizacao, status; filtros de categoria, familia e
 * status). Ficam no Almoxarifado os botoes de estoque (entrada/saida rapida, requisitar, extrato, mapa, etiqueta, plano de
 * inspecao) e os anexos, que falam com rotas do prefixo `/almoxarifado`.
 *
 * Usa as portas do próprio Compras (`/compras/materiais/cadastro`, `/compras/materiais/aux/...`), porque o prefixo
 * `/almoxarifado` exige o módulo Almoxarifado, que o comprador pode não ter. O formulário é o MESMO do Almoxarifado
 * (`MaterialAlmoxarifadoForm` com `ROTAS_COMPRAS`). Saldo e movimentação ficam no Almoxarifado.
 *
 * Quem decide é o servidor; `minhas-permissoes` (da porta do Compras) só esconde os botões e explica por que a lista não
 * aparece para quem não cadastra material.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiEdit, FiPlus, FiRefreshCw, FiPackage, FiTrash2, FiRotateCcw } from 'react-icons/fi';
import { toast } from 'react-toastify';
import api from '../../services/api';
import { useAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';
import { useCategoriasMaterial } from '../../hooks/useCategoriasMaterial';
import { ROTAS_COMPRAS } from '../almoxarifado/rotasCadastroMaterial';
import { FiltrosMateriais, TabelaMateriais, estaInativo, paramsDaBusca } from '../almoxarifado/TabelaMateriais';
import '../almoxarifado/Almoxarifado.css';

// Etapa 193 (RN-193.03): quem cadastra é SÓ o administrador do módulo Compras (cadastro de usuário) e os administradores do
// sistema — os perfis do Almoxarifado deixaram de entrar, e o aviso deixou de citá-los.
export const AVISO_SEM_ACESSO = 'Seu acesso não permite cadastrar material. Peça a um administrador do sistema para marcar '
  + 'você como administrador do módulo Compras.';

const MateriaisCompras = () => {
  const navigate = useNavigate();
  const { pode, bloquearSeNaoPode, loading: carregandoPermissoes } = useAlmoxPermissoes(ROTAS_COMPRAS.api.permissoes);
  const podeVer = pode('criar_material') || pode('editar_material');
  const { categorias } = useCategoriasMaterial(ROTAS_COMPRAS.api.categorias);
  const [materiais, setMateriais] = useState([]);
  const [familias, setFamilias] = useState([]);
  const [search, setSearch] = useState('');
  const [categoria, setCategoria] = useState('');
  const [familiaFilter, setFamiliaFilter] = useState('');
  // RN-193.04: '' = ativos (como sempre); 'inativo' = só os inativos — o mesmo `status` da lista do Almoxarifado.
  const [statusFilter, setStatusFilter] = useState('');
  const [carregando, setCarregando] = useState(true);
  const pedidoRef = useRef(0);

  useEffect(() => {
    if (carregandoPermissoes || !podeVer) return undefined;
    let vivo = true;
    api.get(ROTAS_COMPRAS.api.familias)
      .then((res) => { if (vivo) setFamilias(Array.isArray(res.data) ? res.data : []); })
      .catch(() => { /* sem familias, o filtro so fica vazio */ });
    return () => { vivo = false; };
  }, [carregandoPermissoes, podeVer]);

  const carregar = async () => {
    const meu = ++pedidoRef.current;
    setCarregando(true);
    try {
      const params = paramsDaBusca({ search, categoria, familiaFilter, statusFilter }, familias);
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

  // Etapa 38 (RN-38.05) no Almoxarifado: com filtro de família, a chegada da lista de famílias reagenda a busca (é dela que sai a
  // subfamília); sem filtro, a chave fica constante.
  const familiasKey = familiaFilter ? familias.length : 0;
  useEffect(() => {
    if (carregandoPermissoes || !podeVer) return undefined;
    const t = setTimeout(carregar, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, categoria, familiaFilter, statusFilter, familiasKey, carregandoPermissoes, podeVer]);

  // RN-193.04: inativar e reativar mudaram do Almoxarifado para cá (as mesmas regras no servidor: o 400 diz o saldo que prende).
  const inativar = async (m) => {
    if (!window.confirm(`Inativar o material "${m.nome}"?`)) return;
    try {
      await api.delete(ROTAS_COMPRAS.api.inativar(m.id));
      toast.success('Material inativado');
      carregar();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Erro ao inativar material');
    }
  };
  const reativar = async (m) => {
    if (!window.confirm(`Reativar o material "${m.nome}"?`)) return;
    try {
      await api.put(ROTAS_COMPRAS.api.material(m.id), { ativo: 1 });
      toast.success('Material reativado');
      carregar();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Erro ao reativar material');
    }
  };

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
              title="Cadastra um novo material (código, família, dados técnicos, unidades e localização)"
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
          <FiltrosMateriais
            search={search} onSearch={setSearch}
            categoria={categoria} onCategoria={setCategoria} categorias={categorias}
            familiaFilter={familiaFilter} onFamilia={setFamiliaFilter} familias={familias}
            statusFilter={statusFilter} onStatus={setStatusFilter}
            onLimpar={() => { setSearch(''); setCategoria(''); setFamiliaFilter(''); setStatusFilter(''); }}
          />
          <TabelaMateriais
            materiais={materiais}
            loading={carregando}
            renderAcoes={(m) => (
              <>
                <button type="button" className="almox-btn-icon primary" title="Edita o cadastro deste material"
                  data-testid={`editar-material-${m.id}`}
                  onClick={(e) => { if (!bloquearSeNaoPode('editar_material', e)) return; navigate(ROTAS_COMPRAS.tela.editar(m.id)); }}>
                  <FiEdit />
                </button>
                {estaInativo(m) ? (
                  <button type="button" className="almox-btn-icon success" title="Reativa o material (volta às listas e a movimentar)"
                    data-testid={`reativar-material-${m.id}`}
                    onClick={(e) => { if (!bloquearSeNaoPode('editar_material', e)) return; reativar(m); }}>
                    <FiRotateCcw />
                  </button>
                ) : (
                  <button type="button" className="almox-btn-icon danger" title="Inativa o material (não apaga o histórico)"
                    data-testid={`inativar-material-${m.id}`}
                    onClick={(e) => { if (!bloquearSeNaoPode('editar_material', e)) return; inativar(m); }}>
                    <FiTrash2 />
                  </button>
                )}
              </>
            )}
          />
        </>
      )}
    </div>
  );
};

export default MateriaisCompras;
