# Almoxarifado — Etapa 25: a perna Segurança (design)

Data: 2026-08-29 · Branch: `desenvolvimento-almoxarifado`
Origem: a perna **Segurança** da spec 23 — os 5 itens que o fechamento da Etapa 24 nomeou como
"o que falta para 🟢", agora que Perfis e Auditoria foram pagas.

## Decisão de escopo (Fase 0 — medida em 2026-08-29)

A medição mudou o escopo **antes** de o plano existir: dos cinco itens da spec, **um não é
tarefa**, **um está muito mais pago do que a spec diz**, e **um escondia um defeito real** que
vale mais que a feature pedida.

### 1. Retenção de backup: a chave é dado morto, e há 66 arquivos órfãos em disco

`index.js:1013` chama `pruneOldBackups(dbPath, 10)` — **literal**. A tela de Configurações edita
`backup_manter_dias` (semeada com `'30'`, `index.js:2128`; editada em `Configuracoes.js:437`) e
**nenhum leitor do servidor a consome** — é a "feature morta" que a Etapa 21 declarou.

Pior, e é o achado que justifica a task: **`pruneOldBackups` não alcança os órfãos.** Ele filtra
o diretório por `.sqlite` (`dbRecovery.js:105`) e, para cada backup **além do `keep`**, apaga
`f`, `f-wal` e `f-shm`. Um `-wal` cujo `.sqlite` já foi apagado **nunca entra na lista** — o
filtro não o vê. Medido agora:

```
data/backups: 11 .sqlite · 77 -wal · 77 -shm  →  66 -wal órfãos · 188 MB
```

A Etapa 21 consertou a **causa** (o prune passou a apagar os acompanhantes), mas o passivo
anterior ao conserto continua lá e **nunca será varrido**. É a diferença entre parar de sujar e
limpar.

**A armadilha da semântica:** a chave diz **dias**, o parâmetro conta **quantidade**. Ligar uma
na outra sem decidir isso entregaria uma tela que promete "manter 30 dias" e um servidor que
mantém 30 **cópias**.

### 2. Lançamento retroativo: **não é tarefa** — a spec pede para bloquear o que não existe

`created_at` é `CURRENT_TIMESTAMP` em todas as tabelas de movimentação e **nenhuma rota aceita
data do cliente** (medido). Lançar retroativo é impossível por construção. O item do checklist
está **errado** e vai ser reescrito dizendo que estava — marcar `[x]` seria fingir entrega, e
deixar `[ ]` faria a próxima sessão procurar trabalho que não existe.

### 3. Justificativa em operações excepcionais: muito mais paga do que a spec diz

A coluna existe, `registrarAuditoria` a grava, e há **77 call sites** com `justificativa` em
`routes/` e `services/` — inspeção, sucateamento, compras, estoque e a rota estendida já a
exigem com validação. A spec a lista como "não construída", o que é **falso**. A tarefa real é
**medir o que falta** e reescrever o item com a lista do que sobra, em vez de tratar tudo como
ausente.

### 4. Dispositivo/IP na movimentação: não existe, e tem uma armadilha medida

Não há coluna nem gravação (a spec acerta aqui). **Mas `trust proxy` não está configurado** — a
única ocorrência no repositório é um comentário dizendo isso. Atrás do nginx, `req.ip` vira
`127.0.0.1`: gravar cru encheria a trilha de produção com o IP do proxy **enquanto o teste local
passa verde**, que é o modo de falha silenciosa que esta base já pagou caro. O core resolveu isso
na Etapa 21 gravando `req.ip` **e** `x-forwarded-for` juntos — é o precedente a seguir.

### 5. Dupla conferência em material crítico: fica FORA, declarado

`material_critico` já é coluna viva e a dupla aprovação de sucateamento é o precedente (barreira
por **identidade**, não só por perfil). Mas decidir **quais** operações exigem dois pares de
olhos é decisão de negócio, não de código, e a implementação é uma máquina de estados própria.
Vai para a letra B com a medição, apontando o precedente.

## Escopo escolhido

- **Limpar o passivo e ligar a chave** (item 1): o prune passa a varrer **acompanhantes órfãos**,
  e `backup_manter_dias` deixa de ser dado morto.
- **IP e user-agent na movimentação** (item 4), com `x-forwarded-for` junto, pelo precedente do
  core.
- **Corrigir os dois itens errados da spec** (2 e 3), dizendo que estavam errados.

## Regras de negócio (RN)

- **RN-01 — O prune varre acompanhante órfão.** Um `-wal`/`-shm` cujo `.sqlite` não existe mais é
  removido, independentemente do `keep`. Hoje ele é invisível para a varredura.
- **RN-02 — A retenção é por DIAS e tem piso.** `backup_manter_dias` passa a valer: apaga o que
  for mais velho que N dias, **mas nunca deixa menos de 3 cópias**, por mais velhas que sejam.
  **Descartado** ligar a chave direto ao parâmetro de quantidade (a tela prometeria dias e o
  servidor contaria cópias) e **descartado** retenção só por dias sem piso: um valor baixo
  apagaria tudo e **removeria o fallback de recuperação** que a RN-08 da Etapa 21 garante —
  `dbRecovery.js:86` manda restaurar dali, e o zip do backup leva a cópia mais recente.
- **RN-03 — Valor inválido não apaga nada.** `backup_manter_dias` ausente, não numérico ou < 1 →
  o prune usa o padrão e **registra no log**; nunca interpreta lixo como "zero dias".
- **RN-04 — A movimentação registra de onde veio.** A auditoria de movimentação passa a gravar
  `ip` e `user_agent`, com o `x-forwarded-for` junto **porque não há `trust proxy`** — sem ele o
  campo seria `127.0.0.1` para todo mundo em produção.
- **RN-05 — Registrar origem não pode derrubar a movimentação.** É dado de rastro, best-effort,
  no mesmo `try/catch` da auditoria (padrão do módulo desde a Etapa 19).

## Arquitetura

- **`services/dbRecovery.js`** — `pruneOldBackups(dbPath, opcoes)` ganha duas responsabilidades
  separadas e testáveis: varrer órfãos, e aplicar a régua de dias com piso. Função pura para a
  decisão ("dada esta lista de arquivos e esta régua, o que apagar"), para que o teste não
  dependa do relógio nem do disco.
- **`index.js:1013`** — passa a ler `backup_manter_dias` do banco antes de chamar o prune.
- **A auditoria de movimentação** (`stockService.js`, onde `acao: tipo` é gravado) — recebe `ip`
  e `user_agent` no `dados_novos`, montados por um helper único (`origemRequisicao(req)`), para
  que as próximas rotas não repitam a régua do `x-forwarded-for`.

## Testes

- `backupRetencao.api.test.js`: RN-01 (órfão varrido — **o cenário de peso**, com contagem de
  arquivos antes/depois), RN-02 (piso de 3 respeitado mesmo com todas velhas; e o mais recente
  **nunca** apagado), RN-03 (lixo na chave não apaga nada).
  **Sem depender do relógio:** os `mtime` do arranjo são fixados com `fs.utimesSync`, não
  esperados — senão o cenário fica verde de dia e vermelho de madrugada, como na Etapa 22.
- `origemRequisicao`: função pura — `x-forwarded-for` com um IP, com vários (o primeiro é o
  cliente), ausente, e `req.ip` sozinho.
- Integração: movimentar por rota real e **ler pela tela-contrato** (`GET /auditoria`),
  conferindo que `ip` e `user_agent` aparecem nas `alteracoes`.
- Controle positivo com alvo em cada um, **lendo qual asserção caiu**.

## O que muda em cada camada

| Camada | Mudança |
|---|---|
| `services/dbRecovery.js` | varre órfãos; régua de dias com piso |
| `server/index.js` | lê `backup_manter_dias` antes do prune |
| `services/almoxarifado/stockService.js` (+ helper) | `ip` e `user_agent` na auditoria |
| `specs/23` | dois itens **reescritos por estarem errados**; um pago |
