# Etapa 111 — as listas parciais de módulo (G17): design

> Frente **Compras/core**, worktree `CRM-wt-e111`, branch `etapa-e111` (de `main` `0686c3a8`). Em paralelo com a
> Etapa 110 do almoxarifado (cadastro de material, família) — esta etapa não toca material, família nem os quatro
> documentos do almoxarifado. Plano: `docs/superpowers/plans/2026-10-15-crm-etapa111-listas-parciais-de-modulo.md`.

## Fase 0 — o que a medição achou (varredura de `engenharia_projetos` em `client/src` e `server`, fora testes)

O G17 (letra G de `docs/compras-novidades-por-etapa.md`) dizia "dez listas parciais". Lidas uma a uma:

| # | Lista | O que contém | Quem lê | Divergência com efeito visível |
|---|---|---|---|---|
| 1 | `server/index.js` `registrarTentativaAcessoNegado.nomesModulos` | 7 nomes (comercial, compras, financeiro, operacional, administrativo, admin "Administração", engenharia "Cálculos de Engenharia") | coluna `nome_modulo` de `logs_auditoria` quando uma **rota** do servidor dá 403 de módulo | **sim** — almoxarifado (um `app.use('/api/almoxarifado', …)` sobre o router inteiro — o design dizia "8 rotas"; **estava errado**, o 8 contou testes, achado da Fase 2), engenharia_projetos (5), frota (1, o portão de todo `/api/frotas`), todolist (1) e a combinação `engenharia\|engenharia_projetos` vão para a tela **Logs de Auditoria** com a chave crua (`almoxarifado`), enquanto a negação do **cliente** (`POST /api/auditoria/tentativa-acesso`, escrita pela tela `AcessoNegado`) grava "Almoxarifado" — o mesmo módulo com dois nomes na mesma coluna |
| 2 | `ProtectedModuleRoute.nomesModulos` | 11 nomes (admin "Administração") | **só fallback**: as 11 rotas do `App.js` passam `nomeModulo` literal (os mesmos 11 nomes) | não (hoje igual ao `App.js`) |
| 3 | `App.js` `nomeModulo="…"` das 11 `ProtectedModuleRoute` | 11 nomes | título da tela "acesso negado" e o `nome_modulo` que ela grava no log | não (igual ao 2) |
| 4 | `ModuleLoading.MODULE_LABELS` | 11 + `sistema: 'Orion'` | "Carregando X..." | **sim, pequena** — engenharia diz "Carregando **Engenharia**..." e todo o resto diz "Cálculos de Engenharia" |
| 5 | `SplashScreen` `MODULE_CONFIG` | título/subtítulo/cor por módulo (`CRM GMP INDUSTRIAIS`, `MÓDULO DE COMPRAS`…) | splash de entrada | não — é texto de desenho próprio, não repete o nome |
| 6 | `lazyModules` `MODULE_PREFETCH` + `prefetchModuleByRoute` | import do chunk por módulo; rota → módulo (11 `startsWith`) | hover na seleção / menu | não; o mapa rota → módulo repete `MODULOS_META.rota` |
| 7 | `ProtectedModuleRoute.getModuloFromPath` | rota → módulo (11 `startsWith`) | splash/sessão do módulo; fallback do `modulo` | não; repete `MODULOS_META.rota` |
| 8 | `Layout.getActiveModuleFromPath` | rota → módulo (10; comercial vira `crm`, e o que não casa também) | qual menu lateral aparece | não; repete `MODULOS_META.rota` (com `crm` no lugar de `comercial`) |
| 9 | `App.js` `isProtectedModuleRoute` | 11 prefixos **incluindo `/chat`**, sem `/engenharia-projetos` (coberto por `/engenharia`) | decide não mostrar a seleção | não; tem `/chat`, que não é módulo — não deriva |
| 10 | `requisicoesMaterialConfig.MODULOS_REQUISICAO` + `detectModuloRequisicao`, e `receiptNotificationService.BASE_PATH_POR_MODULO` | 10 módulos, sem TODOLIST | requisição de material por módulo; link do e-mail de recebimento | não; já presos um no outro por teste; domínio do almoxarifado (área da 110) |
| 11 | `sectorMaterialService.SETORES_MODULO_SEED` | 9 setores semeados (Produção = operacional, Manutenção = frota) | dado do banco | não — nome de **setor**, não de módulo; mudar seria migração de dado |
| 12 | `App.js` rotas e `Layout` menus | componentes por rota | navegação | não — não é lista de nomes, é a árvore de telas |

| 13 | `Logs.js` filtro de módulo (achado da Fase 2) | 6 opções (sem engenharia, engenharia_projetos, almoxarifado, frota, todolist; admin "Admin") | filtra `logs_auditoria.modulo` por igualdade | **sim** — não dá para filtrar o 403 de almoxarifado/frota/todolist/engenharia; "Admin" no filtro e "Administração" na coluna |
| 14 | `ModuleSplash.js` `getModuleFromPath` + `isProtectedRoute` (achado da Fase 2) | 6 módulos (`/admin` → `administrativo`); cópia do `isProtectedModuleRoute` com `/chat` | splash do Layout | não hoje — `isProtectedRoute` sai antes |

**Correção do G17:** não são dez — são **catorze** pontos (os mapas rota → módulo são seis, não um: `ProtectedModuleRoute`,
`lazyModules`, `Layout`, `requisicoesMaterialConfig`, `ModuleSplash`, mais o `isProtectedModuleRoute` do `App.js`; e o
filtro da tela Logs, que a primeira versão deste design também deixou de fora). A afirmação "só 7
dos 11 — os outros vão para o log com a chave crua" estava **certa** (são os 4 acima, mais a combinação do
`checkAnyModulePermission`).

### O "sem nenhuma linha de permissão" (perto do G9)
Medido no código:
- **Seleção** (`TipoSelecao`): `permissoes` vazia → só **Comercial** disponível (e Comercial também quando não há usuário
  ou a busca de permissões falha).
- **Portão de rota do cliente** (`hasModuleAccess`): `permissoes` vazia → **Comercial ou Frota**.
- **Servidor** (`checkModulePermission`): sem permissão direta e **sem grupo ativo** → só **Comercial**; **com** grupo
  ativo sem a linha → nada (nem Comercial). `checkAnyModulePermission` igual, para a lista.

Efeito para o usuário real: (a) um usuário criado sem nenhum módulo marcado vê só Comercial na seleção; digitando
`/frota` no endereço a casca do módulo de frota **abre** (splash e menu) e cada chamada a `/api/frotas/*` responde
403 "Acesso negado ao módulo" — e cada uma grava uma linha `frota` no log; (b) um usuário com permissão **direta** só de
Compras e sem grupo: o cliente nega Comercial (há linhas, nenhuma de comercial), o servidor libera as rotas de
comercial que checam módulo (hoje só `GET /api/comercial/ordens-servico`). Fechar qualquer um dos dois **muda quem
acessa o quê** → não muda nesta etapa: congelado no teste cruzado e na **B63** (decisão do P.O.).

## Design
1. **Servidor, nome do log (prioridade do plano da 109):** `MODULOS_SISTEMA` ganha `nome` (os 7 de antes, iguais; os 4
   que faltavam com o nome que a tela de acesso negado do cliente já grava; `relatorios` "Relatórios"). A função de log
   sai do `index.js` para `services/acessoNegadoLog.js` (testável com banco de verdade); o nome vem de
   `nomeDoModulo(chave)` — chave desconhecida continua indo crua, a combinação `a|b` vira os nomes unidos por " ou ".
   A coluna `modulo` não muda.
2. **Cliente, nome do módulo:** `modulosMeta.js` ganha `NOMES_MODULO` (os 11 nomes que o acesso negado e o log usam —
   admin "Administração", diferente do cartão "Admin" da seleção: mantido, B62). `ProtectedModuleRoute` e
   `ModuleLoading` passam a ler dele. O teste cruzado confere `NOMES_MODULO` = nomes do servidor, e os `nomeModulo` do
   `App.js` = `NOMES_MODULO`.
3. **Cliente, rota → módulo:** `moduloDaRota(path)` em `modulosMeta.js`, derivado de `MODULOS_META.rota` (prefixo mais
   longo primeiro); `getModuloFromPath`, `prefetchModuleByRoute` e `getActiveModuleFromPath` passam a usá-la, com o
   mesmo resultado para todo caminho (caracterização escrita antes).
4. **Congelar o "sem linha":** as três regras viram listas nomeadas (`MODULOS_LIBERADOS_SEM_PERMISSAO_PORTAO`,
   `…_SELECAO` no cliente; `MODULOS_LIBERADOS_SEM_GRUPO` no servidor), com os mesmos valores; o teste cruzado prende a
   divergência (frota só no portão) e cai se alguém alinhar.
5. **Fora, declarado:** splash (texto de desenho), prefetch de chunk (import, não nome), requisição por módulo e e-mail
   (almoxarifado), setores (dado), árvore de rotas e menus, `isProtectedModuleRoute` (tem `/chat`).

**Descartado:** derivar `NOMES_MODULO` de `MODULOS_META.nome` (mudaria o acesso negado do Admin para "Admin" e o log
passaria a ter dois nomes para o Admin entre linhas antigas e novas); gravar o nome do log **pelo cliente** (o 403 do
servidor não passa pelo cliente); `GET /api/modulos` (como na B60).
