/**
 * Etapa 211 (RN-211.01, RN-211.04) — Compras → Famílias: o cadastro de famílias e subfamílias de material, que saiu do
 * Almoxarifado (regra "cadastro é do Compras; o Almoxarifado só movimenta", CLAUDE.md, 12/11/2026).
 *
 * A aba é a MESMA do Almoxarifado (`FamiliasDeMaterial`), pelas portas do Compras (`/compras/materiais/...`). Quem grava é quem
 * cadastra material (`criar_material`/`editar_material` de `/compras/materiais/aux/minhas-permissoes`: admin do módulo Compras ou do
 * sistema). Para os outros a porta de leitura também recusa (403, a mesma régua de Compras → Materiais), então a tela mostra só o
 * aviso de quem pode — como Compras → Materiais (Fase 2 da 211: "ver só para consulta" não existe para quem não cadastra).
 * O "Ver" de cada item abre o material em Compras → Materiais (o comprador pode não ter o módulo Almoxarifado).
 */
import React from 'react';
import { FiLayers } from 'react-icons/fi';
import { useAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';
import FamiliasDeMaterial, { ROTAS_FAMILIAS_COMPRAS } from '../almoxarifado/FamiliasDeMaterial';
import { ROTAS_COMPRAS } from '../almoxarifado/rotasCadastroMaterial';
import '../almoxarifado/Almoxarifado.css';

export const AVISO_SEM_ACESSO_FAMILIAS = 'Seu acesso não permite cadastrar famílias. Peça a um administrador do sistema para marcar '
  + 'você como administrador do módulo Compras.';

const FamiliasCompras = () => {
  const { pode, loading } = useAlmoxPermissoes(ROTAS_COMPRAS.api.permissoes);
  const podeGravar = pode('criar_material') || pode('editar_material');

  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1>Famílias</h1>
          <p>Compras · Famílias e subfamílias de material</p>
        </div>
      </div>
      {loading ? null : podeGravar ? (
        <FamiliasDeMaterial rotas={ROTAS_FAMILIAS_COMPRAS} podeGravar linkDoItem={ROTAS_COMPRAS.tela.editar} />
      ) : (
        <div className="almox-empty" data-testid="familias-compras-sem-acesso">
          <FiLayers size={48} style={{ opacity: 0.3, display: 'block', margin: '0 auto 12px' }} />
          <p>{AVISO_SEM_ACESSO_FAMILIAS}</p>
        </div>
      )}
    </div>
  );
};

export default FamiliasCompras;
