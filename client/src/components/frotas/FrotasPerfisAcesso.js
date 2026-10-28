/**
 * Frota Etapa 2 (T3) — tela "Perfis de acesso" (/frota/perfis): o ADMIN_FROTA diz quem e Consulta (ve o painel, nao registra) e quem
 * e Motorista (registra no portal). Molde: a aba "Perfis de acesso" do almoxarifado (TabPerfisAcesso).
 *
 * Contrato: GET/PUT /api/frotas/perfis-usuario (plano docs/superpowers/plans/2026-10-23-frotas-etapa2-perfis-pela-tela.md, "Contrato
 * depois da Fase 2"). A regua do perfil efetivo e a do SERVIDOR (perfil_efetivo/origem vem prontos): a tela nao recalcula nada.
 * Quem decide continua sendo o servidor — a pagina aberta por quem nao e ADMIN_FROTA mostra o `error` dele (Fase 2, achado 7).
 *
 * Etapa 8 (G3, RN-F8.09–11): o seletor ganha "Administrador de Frota". O servidor distingue `origem 'forcado'` (superadmin/role admin —
 * nao se mexe por aqui, etiqueta) de `'admin_modulo'` (admin_modulos com 'frota' — se da e se tira por esta tela, seletor). Dar
 * Administrador pede `window.confirm`; tirar, nao. Contrato: docs/superpowers/plans/2026-10-28-frotas-etapa8-admin-destinos-condutor.md.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'react-toastify';
import { FiSearch } from 'react-icons/fi';
import api from '../../services/api';
import FrotasPageHeader from './FrotasPageHeader';
import './Frotas.css';

export const ROTULOS_PERFIL_FROTA = Object.freeze({
  MOTORISTA: 'Motorista',
  CONSULTA: 'Consulta',
  ADMIN_FROTA: 'Administrador de Frota',
});

const DESCRICOES = Object.freeze({
  MOTORISTA: 'Registra saída, retorno, inspeção e abastecimento no portal; vê só o que é dele.',
  CONSULTA: 'Vê o painel, os alertas, as listas e os relatórios, e exporta a planilha. Não registra nem altera nada.',
  ADMIN_FROTA: 'Faz tudo no módulo, inclusive dar perfis.',
});

// Etapa 8 (RN-F8.09): so superadmin e administrador do sistema ficam fora desta tela; o administrador do modulo agora se tira aqui.
const TEXTO_FORCADO = 'Superadmin ou administrador do sistema: não se altera por esta tela.';
const AJUDA_ADMIN = 'Administrador de Frota pode ser dado e tirado aqui; superadmin e administrador do sistema, não.';
const TOAST_REMOVIDO = 'Perfil removido — o usuário volta ao padrão (Motorista)';
const AVISO_VIAGEM_ABERTA = 'Tem saída sem retorno: como Consulta, não consegue registrar o retorno. Feche a viagem em Frota → Viagens '
  + 'ou volte o perfil para Motorista.';
const confirmacaoAdmin = (nome) => `Dar Administrador de Frota a ${nome}? A pessoa passa a fazer tudo no módulo, inclusive dar perfis.`;

// B29: "Motorista (padrao)" (value '' -> PUT null) e "Consulta"; uma linha MOTORISTA explicita tem o mesmo efeito do padrao e aparece
// como ele. Etapa 8 (RN-F8.09): "Administrador de Frota" entra como opcao normal (o servidor grava `frota` em admin_modulos).
const OPCOES = [
  { value: '', label: 'Motorista (padrão)' },
  { value: 'CONSULTA', label: 'Consulta' },
  { value: 'ADMIN_FROTA', label: 'Administrador de Frota' },
];

function valorDoSeletor(u) {
  if (u.origem === 'admin_modulo') return 'ADMIN_FROTA';
  if (!u.perfil_explicito || u.perfil_explicito === 'MOTORISTA') return '';
  return u.perfil_explicito;
}

// Fase 2 (achado 6 e RN-F2.07): valor gravado fora da lista (ex.: 'consulta' minusculo por SQL) aparece como opcao extra, para o gestor
// ver o que esta gravado e corrigir pelo PUT. Etapa 8: ADMIN_FROTA deixou de ser caso especial — e uma das OPCOES.
function opcaoExtra(valor) {
  if (!valor || OPCOES.some((o) => o.value === valor)) return null;
  return { value: valor, label: `${valor} (valor inválido — escolha outro)` };
}

const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const FrotasPerfisAcesso = () => {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [busca, setBusca] = useState('');
  const [salvandoId, setSalvandoId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/frotas/perfis-usuario');
      setUsuarios(Array.isArray(res.data?.usuarios) ? res.data.usuarios : []);
      setErro(null);
    } catch (err) {
      setErro(err.response?.data?.error || 'Erro ao carregar os perfis de acesso');
      setUsuarios([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const alterar = async (usuario, valor) => {
    const perfil = valor === '' ? null : valor;
    // RN-F8.10: dar Administrador pede confirmacao; tirar (qualquer outra opcao), nao. O <select> e controlado: sem mudar o estado,
    // o React devolve o valor anterior ao DOM — nao ha o que "voltar" na mao.
    if (perfil === 'ADMIN_FROTA' && !window.confirm(confirmacaoAdmin(usuario.nome))) return;
    setSalvandoId(usuario.id);
    try {
      const res = await api.put(`/frotas/perfis-usuario/${usuario.id}`, { perfil });
      const d = res.data || {};
      setUsuarios((lista) => lista.map((u) => (u.id === usuario.id
        ? { ...u, perfil_explicito: d.perfil_explicito ?? null, perfil_efetivo: d.perfil_efetivo || u.perfil_efetivo, origem: d.origem || u.origem }
        : u)));
      toast.success(perfil === null ? TOAST_REMOVIDO : `Perfil definido: ${ROTULOS_PERFIL_FROTA[perfil] || perfil}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao alterar o perfil');
    } finally {
      setSalvandoId(null);
    }
  };

  const filtrados = useMemo(() => {
    const termo = normalizar(busca.trim());
    if (!termo) return usuarios;
    return usuarios.filter((u) => normalizar(u.nome).includes(termo) || normalizar(u.email).includes(termo));
  }, [usuarios, busca]);

  const celulaPerfil = (u) => {
    // So 'forcado' (superadmin/administrador do sistema) fica sem seletor; 'admin_modulo' e opcao normal (RN-F8.09).
    if (u.origem === 'forcado') {
      return (
        <>
          <span className="frotas-badge frotas-badge-ativo">Administrador</span>
          <div className="frotas-perfil-forcado">{TEXTO_FORCADO}</div>
        </>
      );
    }
    const valor = valorDoSeletor(u);
    const extra = opcaoExtra(valor);
    return (
      <select
        className="frotas-filter-select"
        aria-label={`Perfil no Frota de ${u.nome}`}
        value={valor}
        disabled={salvandoId === u.id}
        onChange={(e) => alterar(u, e.target.value)}
      >
        {OPCOES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        {extra && <option value={extra.value}>{extra.label}</option>}
      </select>
    );
  };

  // Fase 2 (T-3): CONSULTA com motorista ligado nao registra no portal; com saida sem retorno, o carro fica preso. O PUT nao recusa (B30).
  const avisos = (u) => {
    if (u.perfil_efetivo !== 'CONSULTA' || !u.motorista) return null;
    return (
      <>
        <div className="frotas-aviso-linha" role="note">
          {`Ligado ao motorista ${u.motorista.nome}: como Consulta, não registra no portal.`}
        </div>
        {u.viagem_aberta && <div className="frotas-aviso-linha" role="note">{AVISO_VIAGEM_ABERTA}</div>}
      </>
    );
  };

  return (
    <div className="frotas-page">
      <FrotasPageHeader
        title="Perfis de acesso"
        subtitle="Quem vê o painel e quem registra no portal"
        breadcrumbs={[{ label: 'Perfis de acesso' }]}
      >
        <p className="frotas-ajuda">
          Ter acesso ao módulo Frota (no cadastro de usuário) permite abrir as telas; o perfil abaixo diz o que a pessoa faz dentro delas.
        </p>
        <p className="frotas-ajuda">Quem não tem perfil definido entra como Motorista.</p>
        <p className="frotas-ajuda">{AJUDA_ADMIN}</p>
      </FrotasPageHeader>

      {erro ? (
        <div className="frotas-error-banner" role="alert">{erro}</div>
      ) : (
        <>
          <div className="frotas-toolbar">
            <div className="frotas-search">
              <FiSearch />
              <input
                type="text"
                placeholder="Buscar por nome ou e-mail..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
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
                      <th>Usuário</th>
                      <th>Perfil no Frota</th>
                      <th>O que isso permite</th>
                      <th>Motorista ligado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.length === 0 ? (
                      <tr><td colSpan={4} className="frotas-empty">Nenhum usuário encontrado</td></tr>
                    ) : (
                      filtrados.map((u) => (
                        <tr key={u.id}>
                          <td>
                            <strong>{u.nome}</strong>
                            {u.email && <div className="frotas-perfil-desc">{u.email}</div>}
                          </td>
                          <td>
                            {celulaPerfil(u)}
                            {avisos(u)}
                          </td>
                          <td className="frotas-perfil-desc">{DESCRICOES[u.perfil_efetivo] || '—'}</td>
                          <td>{u.motorista?.nome || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default FrotasPerfisAcesso;
