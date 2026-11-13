/**
 * Etapa 215 (RN-215.01, RN-215.04) — Compras → Categorias: o cadastro de categorias de material, que saiu do Almoxarifado (regra
 * "cadastro é do Compras; o Almoxarifado só movimenta", CLAUDE.md, 12/11/2026). Molde: `FamiliasCompras.js` (Etapa 211).
 *
 * A aba é a MESMA do Almoxarifado (`CategoriasDeMaterial`), pelas portas do Compras (`/compras/materiais/...`). Quem grava é quem
 * cadastra material (`criar_material`/`editar_material`: admin do módulo Compras ou do sistema). Para os outros, só o aviso de quem
 * pode, sem pedir a lista — a mesma literal de Compras → Tipos de Material.
 */
import React from 'react';
import { FiTag } from 'react-icons/fi';
import { useAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';
import CategoriasDeMaterial, { ROTAS_CATEGORIAS_COMPRAS } from '../almoxarifado/CategoriasDeMaterial';
import { ROTAS_COMPRAS } from '../almoxarifado/rotasCadastroMaterial';
import { AVISO_SEM_ACESSO_CATEGORIAS_E_TIPOS } from './TiposMaterialCompras';
import '../almoxarifado/Almoxarifado.css';

export { AVISO_SEM_ACESSO_CATEGORIAS_E_TIPOS };

const CategoriasCompras = () => {
  const { pode, loading } = useAlmoxPermissoes(ROTAS_COMPRAS.api.permissoes);
  const podeGravar = pode('criar_material') || pode('editar_material');

  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1>Categorias</h1>
          <p>Compras · Categorias de material</p>
        </div>
      </div>
      {loading ? null : podeGravar ? (
        <CategoriasDeMaterial rotas={ROTAS_CATEGORIAS_COMPRAS} podeGravar />
      ) : (
        <div className="almox-empty" data-testid="categorias-compras-sem-acesso">
          <FiTag size={48} style={{ opacity: 0.3, display: 'block', margin: '0 auto 12px' }} />
          <p>{AVISO_SEM_ACESSO_CATEGORIAS_E_TIPOS}</p>
        </div>
      )}
    </div>
  );
};

export default CategoriasCompras;
