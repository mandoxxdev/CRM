# 23 — Perfis, Segurança e Auditoria

> **Status:** 🟡 — sistema de permissões robusto; auditoria existe mas não é usada em produção · **Spec original:** seções 28, 29
> **Última atualização:** 2026-08-02

## Objetivo

Perfis da spec cobertos, regras de segurança da seção 29 aplicadas (imutabilidade, estorno, histórico de cadastro, justificativas) e trilha de auditoria visível.

## O que já existe (4 camadas — detalhes em `00-fundacao-tecnica/estado-atual.md`)

1. Flags globais: `is_superadmin`, `role='admin'`, `admin_modulos` (`services/systemPermissions.js`).
2. Permissão por módulo: `checkModulePermission` + tabelas `permissoes`/grupos.
3. **7 perfis × 15 ações** do almoxarifado (`services/almoxarifado/permissions.js`): ADMINISTRADOR, ALMOXARIFE, COMPRAS, PRODUCAO, ENGENHARIA, GESTOR, CONSULTA.
4. Whitelist de materiais por setor (`sectorMaterialService.js`).

- Auditoria: `auditoria_log_almoxarifado` + `registrarAuditoria()` chamado pelos serviços v3; rota `GET /auditoria` (`extended.js:305`). ⚠️ **0 linhas em produção** — o front usa a rota v1 que não audita (fundação 0.3).
- `logs_auditoria` global (tentativas de acesso negado) + `POST /api/auditoria/tentativa-acesso`.
- Front: `systemPermissions.js`, `permissionsCache.js`, guards de rota, telas de admin.
- Teste: `permissionsCacheAdmin.test.js` (⚠️ replica lógica em vez de importar — corrigir junto do harness).

## Checklist

### Perfis (spec 28)
- [ ] Mapear perfis da spec → perfis existentes: Solicitante→PRODUCAO? · Aprovador→GESTOR · Supervisor→? · Qualidade→**falta perfil QUALIDADE** · Auditoria/Diretoria→CONSULTA com relatórios
- [ ] Criar perfil QUALIDADE (ações `inspecionar`, aprovar/reprovar/bloquear/liberar sob desvio — feature 09)
- [ ] Revisar fallback perigoso: usuário sem perfil → PRODUCAO (`permissions.js:40`) — decidir se CONSULTA é default mais seguro
- [ ] Revisar default de módulo: usuário sem grupo ganha `comercial` (`index.js:2818`) — fora do escopo do almoxarifado, mas registrar
- [ ] UI de atribuição de perfil por usuário (hoje via sync de admin_modulos)

### Segurança (spec 29)
- [ ] Movimentação confirmada não pode ser excluída (garantir que NÃO existe DELETE; estorno é o único caminho) — feature 03
- [ ] Estorno exige motivo (existe na v2 — cobrir com teste)
- [ ] Registrar usuário, data/hora e **dispositivo** (user-agent/IP na movimentação)
- [ ] Alterações de cadastro com histórico (auditoria em materiais/localizações/configs — parcial: serviços v3 auditam, CRUDs v1 não)
- [ ] Bloquear lançamento retroativo sem autorização (data do movimento ≠ data atual exige permissão)
- [ ] Justificativa obrigatória em operações excepcionais (emergencial, desvio, ajuste)
- [ ] Dupla conferência em materiais críticos (feature 05)
- [ ] Backup/retenção de documentos (rotina `dbRecovery.js` existe — validar cobertura de uploads)

### Auditoria visível
- [ ] Tela de auditoria no front (a rota existe; falta UI)
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
