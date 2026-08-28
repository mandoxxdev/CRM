# 23 — Perfis, Segurança e Auditoria

> **Status:** 🟡-forte (Etapa 20: os **três** buracos de exposição que esta spec nomeava estão pagos; resta a TELA de auditoria e os itens nomeados abaixo) · antes 🟡-forte (Etapa 19: os 23 endpoints de cadastro/configuração auditam) · antes 🟡 — sistema de permissões robusto; auditoria em uso pelos fluxos principais desde as Etapas 3–6 (os dois buracos daquela auditoria foram PAGOS — Etapa 9 e Etapas 18/19) · **Spec original:** seções 28, 29
> **Última atualização:** 2026-08-28 (Etapa 20, `1b0f0e9..a3f5135`: a rota de foto de material para de mentir sucesso, de deixar órfão e de não auditar; a leitura de configurações para de devolver segredo em claro e o PUT genérico para de aceitá-lo; ler o mapa de permissões por setor passa a exigir o mesmo que escrevê-lo). Antes: 2026-08-28 (Etapa 19, `a574b3a..55e4144`: os 23 endpoints de cadastro e configuração passam a auditar, com diff nas configurações, segredo mascarado e três correções de comportamento que o log exigia). Antes: 2026-08-28 (Etapa 18: a trilha do inventário). Antes: 2026-08-11 — auditoria de cauda: corrigida a afirmação "auditoria não é usada em produção" (era verdade em 2026-08-02, foi superada pelas Etapas 3–6 e ninguém atualizou aqui), corrigida a contagem de ações (14, não 15) e nomeados os dois buracos reais de auditoria que restam

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

  **⚠️ Correção (2026-08-28, Etapa 18) — DUAS afirmações desta spec estavam erradas:**
  1. Ela dizia que a conclusão de conferência "faz UPDATE cru de `quantidade_atual` + INSERT
     manual de movimentação". **A primeira metade está errada desde a Etapa 10** (2026-08-22):
     o ajuste passa pelo motor como `AJUSTE_INVENTARIO`; `grep "SET quantidade_atual"` nas
     rotas devolve zero. Só a segunda metade — "sem `registrarAuditoria`" — era verdade, **e
     foi paga nesta etapa**.
  2. Ela lista "excluir" entre as requisições que auditam. **Falso:** `requisitionService.js`
     não tinha nenhuma chamada de `registrarAuditoria` (só os estornos apareciam, como
     `movimentacao`). Corrigido na Etapa 18 (`requisicao`/`EXCLUSAO`).

  **Buracos daquela auditoria (2026-08-11), estado em 2026-08-28:**
  1. ~~Conclusão de conferência/inventário sem auditoria~~ — **PAGO na Etapa 18**
     (`3893444`, `395caf3`): `entidade: 'conferencia'` com 5 ações (CRIACAO, CONTAGEM,
     RECONTAGEM, CONCLUSAO, CANCELAMENTO), todas pós-escrita e best-effort; cancelar passou a
     exigir motivo e a gravar autor/data; `aprovador_id`/`aprovador_nome` deixaram de ser
     colunas mortas.
  2. ~~`scrapService` (sobras)~~ — **PAGO na Etapa 9** (`bedce46`).

  ~~**Buracos que restam:** os ~20 endpoints de cadastro e configuração seguem sem trilha~~ —
  **PAGO na Etapa 19** (2026-08-28, `a574b3a..55e4144`): os **23** endpoints auditam, cada
  classe com o tratamento honesto — cadastros com de/para completo (`tipo_material`,
  `localizacao`, `setor`, `familia`, `centro_custo`, `almoxarifado`), configurações com
  **diff** (uma linha por PUT, só o que mudou — a tela manda 18 chaves a cada save),
  **segredo mascarado** e a URL do webhook sem a query string, edição em lote como
  `material`/`ATUALIZACAO` por material alterado, e `setor_permissao` com o de/para completo
  do mapa de acesso. Três correções de comportamento vieram junto, exigidas para o log não
  mentir: 404 nas 4 rotas que respondiam sucesso para id inexistente, o cascata do rename de
  setor contado (era fire-and-forget), e o import de `audit` por objeto no `extended.js`
  (sem ele o teste de "auditoria quebrada não derruba o ato" era vazio naquele arquivo).

  **O que continua aberto:**
  - **A rota `GET /almoxarifado/auditoria` não é consumida por nenhuma tela** — a trilha, agora
    muito mais rica, segue sem leitor prático (letra B33). O gate é `configurar`, que aceita
    administrador do sistema — grupo ligeiramente mais amplo do que o que a tela de
    configurações exige (`canConfigureAlmox`); nota, não risco.
  - **Volume:** o histórico de `setor_permissao` grava a lista inteira duas vezes por save
    (~46 KB medidos com 200 famílias) — dívida a resolver antes da tela (letra G8).
  - **Rastro do ato parcial:** `PUT /configuracoes` grava chave a chave sem transação; se
    falhar no meio, parte fica gravada **sem** linha de histórico.
  - **`EXCLUSAO` de linha já inativa** é registrada mesmo sem excluir nada (SQLite conta a
    linha atingida); só id inexistente vira 404.
  - **Verbos do log:** o módulo já era inconsistente (`CRIACAO`/`CRIAR`,
    `EDICAO`/`ATUALIZACAO`/`ATUALIZAR`). A Etapa 19 fixou a regra — **consistência dentro da
    entidade** (`material` seguiu com `ATUALIZACAO`) e `EDICAO` só para as entidades novas —
    e introduziu `REATIVACAO` e `INCLUSAO_EM_LOTE`. Normalizar as antigas mexeria em log
    histórico; fica declarado.
  - **Rota órfã:** `PUT /configuracoes/tipos-material` não tem nenhum chamador no client;
    auditada mesmo assim, **candidata a remoção** (apagar sem confirmar quem chama seria
    irreversível de graça).
  - ~~**Fora do escopo, nomeados:** `POST /materiais/:id/foto` não audita e responde sucesso
    para material inexistente (deixando arquivo órfão); `GET /configuracoes` devolve
    `alertas_smtp_pass` em claro (a rota irmã de alertas já mascara); e
    `GET /setores-requisicao/:id/permissoes` expõe o mapa de acesso com `auth` apenas.~~ —
    **OS TRÊS PAGOS na Etapa 20** (2026-08-28, `1b0f0e9..a3f5135`). Mantidos riscados, não
    apagados, para que quem lembrar dos buracos confirme que fecharam e com qual commit:
    - foto de material — `6cb594e` (+ `05a5c81`): 404 `Material não encontrado`, limpeza do
      órfão em **toda** saída ≠ 200, `unlink` da foto anterior **depois** do UPDATE e em
      try/catch, auditoria `material`/`ATUALIZACAO` com o de/para do arquivo. O `05a5c81`
      fechou ainda a janela entre o SELECT e o UPDATE (`changes === 0` → 404): o SELECT
      resolve o caso comum mas não impede um 200 sobre escrita que não aconteceu;
    - `GET`/`PUT` de configurações — `a0b19c9`: as duas chaves de segredo
      (`alertas_smtp_pass`, `alertas_whatsapp_api_key`) saem como `PASSWORD_MASK` quando há
      valor e `''` quando não há, e o PUT genérico passou a **recusá-las** com 400 antes de
      qualquer UPDATE. **`alertas_whatsapp_webhook_url` ficou de fora da máscara de propósito**
      (a URL é o campo que o admin edita; mascarar faria a tela regravar a máscara como URL) —
      decisão B40, consequência declarada em C24;
    - `GET /setores-requisicao/:id/permissoes` — `8c0feff`: `isSystemAdmin || canConfigureAlmox`,
      cópia literal do PUT irmão, mensagem inclusive.
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

### Exposição e rastro (Etapa 20 — `1b0f0e9..a3f5135`)

- [x] **Foto de material inexistente responde 404, sem deixar arquivo no disco** — `6cb594e`.
      `SELECT` antes do UPDATE; `Material não encontrado`; `limparUploadOrfao` extraída do
      closure de `extended.js` para `services/almoxarifado/uploadCleanup.js` (8 call sites / 4
      rotas trocados por script com assert de contagem) e chamada também aqui.
- [x] **Nenhuma saída ≠ 200 da rota de foto deixa órfão** — `6cb594e` (+ `05a5c81`). Cobre erro
      no SELECT, erro no UPDATE, 404 por material inexistente e 404 por `changes === 0`. O ramo
      403 não precisa de limpeza: `requirePermission` roda **antes** do multer, então nada foi
      gravado — provado por `permissoesRotas.api.test.js:535-549`. *(A RN-02 do design da etapa
      afirmava que o 403 apagava arquivo; **estava errada**, e o certo é que não há arquivo para
      apagar.)*
- [x] **A foto anterior só é apagada DEPOIS do UPDATE, em try/catch** — `6cb594e`. Antes era um
      `db.get` fire-and-forget correndo em paralelo com o UPDATE, com `unlinkSync` sem catch: no
      vermelho do TDD isso **derrubou o processo** (`EISDIR` subindo de dentro de um callback do
      sqlite3), não só a resposta.
- [x] **Trocar foto audita** (`material`/`ATUALIZACAO`, de/para do arquivo) — `6cb594e`.
      Pós-escrita e best-effort, em try/catch com `console.error`: o UPDATE já foi commitado.
- [x] **A janela entre o SELECT e o UPDATE está fechada** — `05a5c81` (fix-round). `dbRun`
      devolve `{ changes }`; `changes === 0` → 404 + limpeza. Alcance real é baixo (o DELETE de
      material é soft), mas responder 200 a uma escrita que não aconteceu é o mesmo defeito que
      a etapa foi consertar.
- [x] **`GET /configuracoes` mascara as duas chaves de segredo** — `a0b19c9`. `PASSWORD_MASK`
      quando há valor, `''` quando não há — idêntico ao que a rota de alertas já devolvia.
      Pré-requisito bloqueante resolvido junto: `configDiff` estava **desestruturado** no
      `require`, e usá-lo como namespace sem trocar o import daria `ReferenceError` na primeira
      request das TRÊS rotas de configuração (comprovado por sabotagem).
- [x] **`PUT /configuracoes` recusa as duas chaves de segredo** — `a0b19c9`. 400
      `Configuração "<chave>" só pode ser alterada em Configurações → Alertas de Estoque`, no
      laço de **validação** (que roda inteiro antes do de UPDATE) — sem transação, recusar no
      meio deixaria metade do formulário aplicada. Chave secreta com valor `''` também é
      recusada.
- [x] **`GET /setores-requisicao/:id/permissoes` exige `isSystemAdmin || canConfigureAlmox`** —
      `8c0feff`. Cópia literal do PUT irmão, com teste que assere `deepStrictEqual` entre os
      corpos dos dois 403 para que não se separem depois.
- [ ] **`alertas_whatsapp_webhook_url` NÃO é mascarado no GET** — **de propósito, não pendência**
      (decisão B40 das novidades, congelada em `configuracoesSegredo.api.test.js:188-196`): a URL
      é o campo que o admin edita, e devolvê-la mascarada faria a tela regravar a máscara como
      URL no primeiro Salvar. A proteção continua onde o registro é permanente — o log de
      auditoria (`configDiff.mascararUrl`, Etapa 19). Consequência aceita e declarada (C24):
      **quem administra o módulo lê o token embutido na query string**. Conserto de verdade =
      tirar o token da URL, etapa própria.
- [ ] **`GET /setores-requisicao` continua devolvendo `qtd_permissoes` por setor sem gate**
      (`sectorMaterialService.listSetores:328-334`) — buraco irmão do gate acima, achado pela
      revisão adversarial da Etapa 20 e **declarado em vez de consertado**: a consumidora é a
      tela de requisição (não-admin), então fechar é mudança de contrato, não uma linha. Letra
      B41, **em aberto e esperando decisão do usuário**.
- [ ] **`GET /configuracoes/liberacao-valor` continua expondo nome e e-mail dos aprovadores** a
      qualquer usuário do módulo (`requisitionValueApprovalService.getAprovadoresDetalhes`) — a
      lista de requisições depende dessa leitura para saber se o usuário é aprovador; reduzir o
      payload para não-admin é mudança de contrato. Letra D das novidades.
- [ ] **Erro de multer continua virando 500 opaco nas 5 rotas de upload** — a rota de foto saiu
      do conjunto quanto a órfão/404/auditoria, mas **continua** neste item; o conserto é um
      error-handler uniforme nas cinco. Segue nomeado na spec 24 (G7 / C25).

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
