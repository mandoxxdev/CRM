# 23 — Perfis, Segurança e Auditoria

> **Status:** 🟡 — sistema de permissões robusto; auditoria em uso pelos fluxos principais desde as Etapas 3–6 (restam dois buracos nomeados abaixo) · **Spec original:** seções 28, 29
> **Última atualização:** 2026-08-11 — auditoria de cauda: corrigida a afirmação "auditoria não é usada em produção" (era verdade em 2026-08-02, foi superada pelas Etapas 3–6 e ninguém atualizou aqui), corrigida a contagem de ações (14, não 15) e nomeados os dois buracos reais de auditoria que restam

## Objetivo

Perfis da spec cobertos, regras de segurança da seção 29 aplicadas (imutabilidade, estorno, histórico de cadastro, justificativas) e trilha de auditoria visível.

## O que já existe (4 camadas — detalhes em `00-fundacao-tecnica/estado-atual.md`)

1. Flags globais: `is_superadmin`, `role='admin'`, `admin_modulos` (`services/systemPermissions.js`).
2. Permissão por módulo: `checkModulePermission` + tabelas `permissoes`/grupos.
3. **7 perfis × 14 ações** do almoxarifado (`ACAO_PERFIS` em `services/almoxarifado/permissions.js`): ADMINISTRADOR, ALMOXARIFE, COMPRAS, PRODUCAO, ENGENHARIA, GESTOR, CONSULTA. *(A spec dizia "15 ações" — contagem errada, corrigida em 2026-08-11.)*
4. Whitelist de materiais por setor (`sectorMaterialService.js`).

- Auditoria: `auditoria_log_almoxarifado` + `registrarAuditoria()`; rota `GET /almoxarifado/auditoria` (`extended.js`).
  **⚠️ Correção (2026-08-11):** esta spec afirmava "0 linhas em produção — o front usa a rota v1 que não audita". A afirmação era verdadeira em 2026-08-02 e foi **superada pelas Etapas 3–6** sem que a spec fosse atualizada. Hoje auditam (todos com tela no front):
  - CRUD v1 de materiais: criação e edição, com `dados_anteriores`/`dados_novos` (`routes/almoxarifado.js`);
  - requisições: aprovar, aprovar-valor, rejeitar, confirmar, encerrar e excluir;
  - motor de estoque: movimentação e estorno — a tela usa `POST /movimentacoes/v2` e o cancelamento, que auditam;
  - serviços de cauda: `reservationService`, `lotService`, `receiptService`, `inspectionService` e `returnService`.

  **Os dois buracos reais que restam (auditoria de 2026-08-11):**
  1. Conclusão de conferência/inventário — `PUT /conferencias/:id/concluir` faz UPDATE cru de `quantidade_atual` + INSERT manual de movimentação, sem `registrarAuditoria` (detalhado na feature 17);
  2. `scrapService` (sobras) — único serviço de cauda sem nenhuma chamada de auditoria (detalhado na feature 15).
- `logs_auditoria` global (tentativas de acesso negado) + `POST /api/auditoria/tentativa-acesso`.
- Front: `systemPermissions.js`, `permissionsCache.js`, guards de rota, telas de admin.
- Teste: `permissionsCacheAdmin.test.js` (⚠️ replica lógica em vez de importar — corrigir junto do harness).

## Checklist

### Perfis (spec 28)
- [ ] Mapear perfis da spec → perfis existentes: Solicitante→PRODUCAO? · Aprovador→GESTOR · Supervisor→? · Qualidade→**falta perfil QUALIDADE** · Auditoria/Diretoria→CONSULTA com relatórios
- [ ] Criar perfil QUALIDADE (ações `inspecionar`, aprovar/reprovar/bloquear/liberar sob desvio — feature 09)
- [ ] Revisar fallback perigoso: usuário sem perfil → PRODUCAO (`getPerfilFromUser` em `permissions.js`) — decidir se CONSULTA é default mais seguro
- [ ] Revisar default de módulo: usuário sem grupo ganha `comercial` (`index.js`) — fora do escopo do almoxarifado, mas registrar
- [ ] UI de atribuição de perfil por usuário (hoje via sync de admin_modulos)

### Segurança (spec 29)
- [x] Movimentação confirmada não pode ser excluída — **confirmado na auditoria de 2026-08-11**: não existe rota DELETE de movimentação; estorno (cancelamento) é o único caminho — feature 03
- [x] Estorno exige motivo — existe no motor e **agora tem teste**: `server/tests/api/estorno.api.test.js` (a spec pedia esse teste como pendente; coberto na Etapa 6)
- [ ] Registrar usuário, data/hora e **dispositivo** (user-agent/IP na movimentação)
- [ ] Alterações de cadastro com histórico — parcial: **materiais auditam desde a Etapa 2** (criação/edição com de/para, inclusive pela rota v1 — a redação anterior "CRUDs v1 não auditam" ficou defasada, corrigida em 2026-08-11); localizações, setores, famílias e configs seguem sem auditoria
- [ ] Bloquear lançamento retroativo sem autorização (data do movimento ≠ data atual exige permissão)
- [ ] Justificativa obrigatória em operações excepcionais (emergencial, desvio, ajuste)
- [ ] Dupla conferência em materiais críticos (feature 05)
- [ ] Backup/retenção de documentos (rotina `dbRecovery.js` existe — validar cobertura de uploads)

### Auditoria visível
- [ ] Tela de auditoria no front (a rota existe; falta UI) — **segue verdade em 2026-08-11**: não há tela de auditoria do almoxarifado; `Logs.js` consome a rota de auditoria global, não a do módulo
- [ ] Filtros por entidade/usuário/período; exportação

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Matriz perfil × ação respeitada em todas as rotas | `perfil sem acao recebe 403` (tabela de casos por rota) |
| CONSULTA não altera nada | `perfil CONSULTA em rotas de escrita recebe 403` |
| Movimentação não tem DELETE | `nao existe rota DELETE de movimentacao` |
| Todo write relevante gera auditoria com dados anteriores/novos | `update de material grava auditoria diff` |
| Tentativa de acesso negado é registrada | `403 de modulo grava em logs_auditoria` |

## Dependências

- 00 (unificação v1/v2 para a auditoria valer) · 09 (perfil QUALIDADE).
