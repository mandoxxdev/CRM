/**
 * Etapa 215 (RN-215.01, RN-215.04) — Compras → Tipos de Material: o cadastro de tipos de material, que saiu do Almoxarifado (regra
 * "cadastro é do Compras; o Almoxarifado só movimenta", CLAUDE.md, 12/11/2026). Molde: `FamiliasCompras.js` (Etapa 211).
 *
 * A aba é a MESMA do Almoxarifado (`TiposDeMaterial`), pelas portas do Compras (`/compras/materiais/...`). Quem grava é quem
 * cadastra material (`criar_material`/`editar_material` de `/compras/materiais/aux/minhas-permissoes`: admin do módulo Compras ou do
 * sistema). Para os outros a tela mostra só o aviso de quem pode, sem pedir a lista — como Compras → Famílias.
 */
import React from 'react';
import { FiPackage } from 'react-icons/fi';
import { useAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';
import TiposDeMaterial, { ROTAS_TIPOS_COMPRAS } from '../almoxarifado/TiposDeMaterial';
import { ROTAS_COMPRAS } from '../almoxarifado/rotasCadastroMaterial';
import '../almoxarifado/Almoxarifado.css';

// Etapa 215 (RN-215.04): a MESMA literal nas duas telas (Tipos de Material e Categorias).
export const AVISO_SEM_ACESSO_CATEGORIAS_E_TIPOS = 'Seu acesso não permite cadastrar categorias e tipos de material. Peça a um '
  + 'administrador do sistema para marcar você como administrador do módulo Compras.';

const TiposMaterialCompras = () => {
  const { pode, loading } = useAlmoxPermissoes(ROTAS_COMPRAS.api.permissoes);
  const podeGravar = pode('criar_material') || pode('editar_material');

  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1>Tipos de Material</h1>
          <p>Compras · Tipos de material (EPI, controlado, assinatura e termo)</p>
        </div>
      </div>
      {loading ? null : podeGravar ? (
        <TiposDeMaterial rotas={ROTAS_TIPOS_COMPRAS} podeGravar />
      ) : (
        <div className="almox-empty" data-testid="tipos-compras-sem-acesso">
          <FiPackage size={48} style={{ opacity: 0.3, display: 'block', margin: '0 auto 12px' }} />
          <p>{AVISO_SEM_ACESSO_CATEGORIAS_E_TIPOS}</p>
        </div>
      )}
    </div>
  );
};

export default TiposMaterialCompras;
