# Almoxarifado — Etapa 25: a perna Segurança (design)

Data: 2026-08-29 · Branch: `desenvolvimento-almoxarifado`
Origem: a perna **Segurança** da spec 23 — os 5 itens que o fechamento da Etapa 24 nomeou como
"o que falta para 🟢", agora que Perfis e Auditoria foram pagas.

## Decisão de escopo (Fase 0 — medida em 2026-08-29)

A medição mudou o escopo **antes** de o plano existir: dos cinco itens da spec, **um não é
tarefa**, **um está muito mais pago do que a spec diz**, e **um escondia um defeito real** que
vale mais que a feature pedida.

### 1. Retenção de backup: a chave é dado morto, e há 132 acompanhantes órfãos em disco

`index.js:1013` chama `pruneOldBackups(dbPath, 10)` — **literal**. A tela de Configurações edita
`backup_manter_dias` (semeada com `'30'`, `index.js:2128`; editada em `Configuracoes.js:437`) e
**nenhum leitor do servidor a consome** — é a "feature morta" que a Etapa 21 declarou.

Pior, e é o achado que justifica a task: **`pruneOldBackups` não alcança os órfãos.** Ele filtra
o diretório por `.sqlite` (`dbRecovery.js:105`) e, para cada backup **além do `keep`**, apaga
`f`, `f-wal` e `f-shm`. Um `-wal` cujo `.sqlite` já foi apagado **nunca entra na lista** — o
filtro não o vê. Medido agora:

```
data/backups: 11 .sqlite (133,4 MB) · 77 -wal · 77 -shm  →  132 acompanhantes órfãos · 44,4 MB
```

**CORREÇÃO (achado A6): a primeira versão deste documento escreveu "66 órfãos · 188 MB", e os
dois números estavam errados.** Órfãos são **132** (66 `-wal` **+ 66 `-shm`**, que eu não contei)
e ocupam **44,4 MB**. Os 187,4 MB são o diretório **inteiro**, dos quais 133,4 MB são as 11
cópias legítimas — que esta etapa **não** apaga. Prometer "limpar 188 MB" seria prometer 4× o
que se entrega, e no documento que o André leva para a empresa.

**E o passivo está quase todo no nome ANTIGO** (achado A2): `database-X-wal`, sem o `.sqlite` no
meio — que é exatamente o formato que a Etapa 21 consertou, então tudo que ela deixou para trás
tem esse nome. Medido: 130 dos 132 órfãos. Uma régua que só reconheça `<base>.sqlite-wal`
limparia **2 arquivos, 0,03 MB**, e o teste passaria verde — porque o arranjo montado por
`backupDatabaseFiles` só produz o nome novo. É teste vazio com aparência de prova.

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

A coluna existe, `registrarAuditoria` a grava, e a spec a lista como "não construída", o que é
**falso** — mas **o número que eu usei para provar isso estava inflado ~10×** (achado A10). Os
"77 call sites" são ocorrências de `justificativa:` como **chave de objeto**, ou seja, o campo
sendo **repassado** pelo pipeline. Os pontos que de fato **exigem** justificativa são **~8**
(`inspectionService.js:99/185/198`, `seriesService.js:296`, `scrapDisposalService.js:154`,
`thirdPartyService.js:585`, `schemas.js:347/586`, `routes/almoxarifado.js:1360`).
A direção estava certa e a magnitude não: **o 77 é número a descartar, não a confirmar.** A
tarefa real continua sendo medir o que falta e reescrever o item com a lista.

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
- **RN-02 — A retenção é por DIAS, com piso E TETO.** `backup_manter_dias` passa a valer: apaga
  o que for mais velho que N dias, **nunca deixa menos de 3 cópias** e **nunca mantém mais de
  10**.
  **O teto entrou pelo achado A5, e sem ele esta etapa faria o oposto do que promete.** Hoje
  `keep = 10` é teto rígido: no máximo ~121 MB. Trocar isso por "piso + dias" **remove o limite
  de tamanho** — simulado sobre o diretório real com o valor semeado (30 dias), sobrevivem **11**
  cópias, uma a mais que hoje. E `backupDatabaseFiles` roda **a cada boot**: o diretório já tem 8
  cópias criadas em ~30 minutos num dia de desenvolvimento. A 8 boots/dia × 30 dias × 12,1 MB, o
  diretório iria a **~2,9 GB**. A etapa que existe para limpar disco passaria a enchê-lo.
  **Descartado** ligar a chave direto ao parâmetro de quantidade (a tela prometeria dias e o
  servidor contaria cópias) e **descartado** retenção só por dias sem piso: um valor baixo
  apagaria tudo e **removeria o fallback de recuperação** que a RN-08 da Etapa 21 garante —
  `dbRecovery.js:86` manda restaurar dali, e o zip do backup leva a cópia mais recente.
- **RN-03 — Valor inválido não apaga nada.** `backup_manter_dias` ausente, não numérico ou < 1 →
  o prune usa o padrão e **registra no log**; nunca interpreta lixo como "zero dias".
- **RN-04 — A movimentação registra de onde veio.** A auditoria de movimentação passa a gravar
  `ip` e `user_agent`, com o `x-forwarded-for` junto **porque não há `trust proxy`** — sem ele o
  campo seria `127.0.0.1` para todo mundo em produção.
- **RN-05 — Registrar origem não pode derrubar a movimentação.**
  **CORREÇÃO (achado A4): esta RN dizia "no mesmo `try/catch` da auditoria (padrão do módulo
  desde a Etapa 19)" — e esse `try/catch` NÃO EXISTE nos dois pontos que a etapa toca.** Medido:
  das 60 chamadas de `registrarAuditoria` em `services/almoxarifado/`, **59 estão sem `try`**,
  incluindo `stockService.js:1367` (a auditoria de movimentação) e `:1814`. Hoje, se a auditoria
  falhar, a movimentação **já commitada no ledger** rejeita e a rota devolve 500.
  Então a régua real é outra: **a origem é montada FORA e chega como dado inerte** — um objeto
  já pronto, sem `req.get` nem acesso a Express dentro do serviço. Assim não há o que falhar no
  ponto da escrita, e a etapa **não** muda a semântica congelada da auditoria de movimentação.
  Criar o `try/catch` seria mudança de comportamento própria, não um detalhe desta RN.

## Arquitetura

- **`services/dbRecovery.js`** — `pruneOldBackups(dbPath, opcoes)` ganha duas responsabilidades
  separadas e testáveis: varrer órfãos, e aplicar a régua de dias com piso. Função pura para a
  decisão ("dada esta lista de arquivos e esta régua, o que apagar"), para que o teste não
  dependa do relógio nem do disco.
- **`index.js`** — a leitura de `backup_manter_dias` **não pode ficar em `:1013`** (achado A1,
  bloqueante e reproduzido): quem **cria** a tabela `configuracoes` (`:1504`) e **semeia** a
  chave (`:2128`) é `initializeDatabase`, que roda **depois**. No primeiro boot de uma instalação
  nova a tabela não existe, e o `SELECT` falha com `no such table: configuracoes`. Os dois
  desfechos são ruins: dentro do `.then` de `:1012`, o `.catch` de `:1016` marca
  `dbStartupFailed = true` e o `/health` passa a **mentir sobre a integridade do banco** pelo
  resto do processo; fora dele, a rejeição não tratada **derruba o processo** no Node 24 — e o
  backup do boot, que é a rede de segurança do sistema, nunca roda.
  **O prune passa para dentro de `initializeDatabase`, depois de `inicializarConfiguracoesPadrao`
  (`:2074`).** Só o `backupDatabaseFiles` precisa acontecer antes das migrations; o prune não.
- **A auditoria de movimentação** (`stockService.js`, onde `acao: tipo` é gravado) — recebe `ip`
  e `user_agent` no `dados_novos`, montados por um helper único (`origemRequisicao(req)`), para
  que as próximas rotas não repitam a régua do `x-forwarded-for`.

## Testes

- `backupRetencao.api.test.js`: RN-01 (órfão varrido — **o cenário de peso**, com contagem de
  arquivos antes/depois, e **obrigatoriamente com órfãos de nome ANTIGO `database-X-wal`**, onde
  está 130 dos 132 do passivo real: o arranjo montado por `backupDatabaseFiles` só produz o nome
  novo, então sem isso o cenário fica verde com a régua limpando 2 arquivos), RN-02 (piso de 3
  respeitado mesmo com todas velhas; **teto de 10 respeitado mesmo com todas novas**; e o mais
  recente **nunca** apagado), RN-03 (lixo na chave não apaga nada).
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
