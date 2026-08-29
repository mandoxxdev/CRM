# Etapa 25 — A perna Segurança (plano)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`.

**Goal:** limpar **132 acompanhantes órfãos (~44 MB)** que o prune nunca alcança, fazer
`backup_manter_dias` deixar de ser dado morto **sem remover o teto de tamanho**, e a movimentação
passar a registrar de onde veio — sem cair na armadilha do `req.ip` atrás do proxy.

> **A Fase 2 mudou três coisas deste plano** (12 achados): a leitura da configuração **sai** de
> `index.js:1013` (lá ela mata o boot de uma instalação nova); a régua ganha **teto** além do
> piso (sem ele o diretório iria a ~2,9 GB); e a Task 3 **muda de forma** — `req` não chega em 23
> dos 28 call sites. Onde o texto diz "ESTAVA ERRADO", vale a versão corrigida.

**Architecture:** duas funções puras novas (a régua do prune e a leitura da origem da
requisição), consumidas por `dbRecovery.js`, `index.js` e a auditoria de movimentação.

**Spec:** `docs/superpowers/specs/2026-08-29-almoxarifado-etapa25-seguranca-design.md`

## Global Constraints

1. **Use `python3`, nunca `python`** (o alias não existe; heredoc com `python` vira no-op).
   Ou `sed` contando a âncora antes (`grep -cF` = exatamente **1**; se der 2, **aborte** — isso
   aconteceu na Etapa 24 e a âncora teve de virar duas linhas), ou a ferramenta Edit.
2. **COMMITE ANTES DE SABOTAR.** Já apagou correção não commitada **quatro** vezes nesta sessão,
   a última na Etapa 24.
3. **Controle positivo com alvo, lendo QUAL asserção caiu.** `md5sum` antes/depois/restaurado,
   `git diff --stat` vazio.
4. **Nada de teste que dependa do relógio.** Fixe `mtime` com `fs.utimesSync` em vez de esperar
   — a Etapa 22 teve suíte que só sabia falhar em 3 das 24 horas do dia.
5. **Vermelho por asserção, não por erro de setup.** Cuidado com guarda de setup disparando
   antes da asserção de peso (mordeu duas vezes na Etapa 23).
6. **Nunca `git add -A`** — há artefatos de runtime em `server/data/` e `server/uploads/`.
   **E nesta etapa em especial: `server/data/backups` é dado real — 165 arquivos, 187 MB, dos
   quais 133 MB são as 11 cópias legítimas do banco.** Trabalhe sempre em diretório temporário
   do scratchpad; **nunca** rode o prune apontando para `server/data`.
7. Commit em português, corpo sem acento, `git commit -F`.

## Regras de negócio

| RN | Enunciado | Onde é provada |
|---|---|---|
| RN-01 | Acompanhante órfão (`-wal`/`-shm` sem `.sqlite`) é varrido | `backupRetencao` |
| RN-02 | Retenção por **dias**, com **piso de 3** e **teto de 10** — o mais recente nunca sai | `backupRetencao` |
| RN-03 | `backup_manter_dias` inválido → usa o padrão e **loga**; nunca apaga tudo | `backupRetencao` |
| RN-04 | A movimentação grava `ip` e `user_agent`, com `x-forwarded-for` junto | `origemRequisicao` + integração |
| RN-05 | A origem chega ao serviço como **dado inerte** (o `try/catch` que a RN citava **não existe** — achado A4) | integração |

## Contratos congelados

**C1 — `services/dbRecovery.js`**

```js
// decidirRemocao(arquivos, { manterDias, pisoCopias = 3, agora }) -> { apagar: string[], motivo: {} }
//   `arquivos`: [{ nome, mtimeMs }] — TUDO que está no diretório, inclusive -wal/-shm órfãos.
//   Função PURA: recebe `agora` por parâmetro (nunca Date.now() dentro) para o teste não
//   depender do relógio.
// pruneOldBackups(dbPath, opcoes) — assinatura ATUAL é (dbPath, keep = 10); a nova aceita
//   objeto. A compatibilidade tem de ser EXPLICITA: `if (typeof opcoes === 'number')` traduz
//   para { tetoCopias: n }. Desestruturar um Number NAO lanca em JS — ele e encaixotado, os
//   campos viram undefined e a funcao vira NO-OP SILENCIOSO (achado A7, reproduzido:
//   `decidirRemocao(arquivos, 1)` devolveu `{apagar: []}`). Para uma funcao de limpeza, esse e o
//   pior desfecho possivel, e e o que acontece se a Task 2 atrasar ou for esquecida.
//   O numero significa TETO (o sentido de hoje), nunca piso — inverter faria `keep = 10` passar
//   de "no maximo 10" para "no minimo 10". E `tests/api/dbRecoveryBackup.api.test.js:138` chama
//   `pruneOldBackups(dbPath, 1)`, ou seja ABAIXO do piso de 3: nomeie o caso `teto < piso` e
//   decida (o teto vence, senao o teste congelado quebra).
```

Régua da `decidirRemocao`, nesta ordem:
0. **Fora de `database-*`, não toca** (achado A9). O diretório é onde alguém salvaria uma cópia
   manual antes de restaurar; esta função **apaga arquivos** e não pode decidir sobre o que não é
   dela.
1. **Órfão** (`-wal`/`-shm` cujo `.sqlite` não está na lista) → **apagar sempre**, sem olhar data.
   **Reconheça os DOIS formatos de nome** (achado A2): o novo (`database-X.sqlite-wal`) e o
   **antigo** (`database-X-wal`, sem `.sqlite` no meio) — **130 dos 132 órfãos reais estão no
   antigo**, porque é o que a Etapa 21 deixou para trás ao consertar a causa.
2. Das cópias `.sqlite` restantes, ordenadas da mais nova para a mais velha: as **3 primeiras
   nunca saem** (piso), por mais velhas que sejam; e **da 11ª em diante saem sempre** (teto),
   por mais novas que sejam.
3. Das demais, apagar as mais velhas que `manterDias`, **junto com seus acompanhantes** — se a
   regra 3 esquecer os acompanhantes, ela **recria** o passivo que a regra 1 acabou de limpar
   (é o bug original, de volta, dentro da mesma função).

**C2 — helper de origem** (arquivo novo em `services/almoxarifado/`)

```js
// origemRequisicao(req) -> { ip, ip_proxy, user_agent }
//   ip         = primeiro IP de `x-forwarded-for` (é o cliente) quando houver; senão `req.ip`
//   ip_proxy   = `req.ip` quando os dois diferem; senão null
//   user_agent = req.get('user-agent') truncado (limite explícito, string longa não é dado útil)
```
**Por que os dois campos:** `trust proxy` **não** está configurado (a única ocorrência no repo é
um comentário dizendo isso), então atrás do nginx `req.ip` é `127.0.0.1`. Guardar só um dos dois
dá a trilha errada em produção **ou** perde o dado quando não há proxy. O core faz assim desde a
Etapa 21.

---

### Task 1 (tronco): o prune varre órfão e passa a ter régua testável

**Files:** Modify `server/services/dbRecovery.js`; Test `server/tests/api/backupRetencao.api.test.js`
(vai em `tests/api/` porque **é o único lugar que o runner enxerga** — precedente explícito em
`dbRecoveryBackup.api.test.js:1-6`, que já faz isso sendo teste de serviço).

> **STATUS: Task 1 FEITA** — commit `ffea21f`. Placar: `backupRetencao.api.test.js` **21/21**
> (novo), `dbRecoveryBackup.api.test.js` **5/5** antes e depois, `test:api` **152/152** arquivos
> (era 151), `test:sqlite` **5/5**. Três divergências registradas no fim desta task.

- [x] **Step 1: teste que falha** — `decidirRemocao` como função pura, com `agora` fixo e
  `mtime` fixos:
  - **RN-01, o cenário de peso:** lista com 2 `.sqlite` e 8 `-wal`, dos quais 6 são órfãos →
    os 6 entram em `apagar`, os 2 acompanhados não saem por serem órfãos.
    **OBRIGATÓRIO: inclua órfãos de nome ANTIGO (`database-X-wal`, sem `.sqlite` no meio).**
    130 dos 132 órfãos reais têm esse formato, e o arranjo montado por `backupDatabaseFiles` só
    produz o nome novo — sem isso o cenário fica **verde** com uma régua que limparia 2 arquivos
    (0,03 MB) dos 44 MB de passivo (achado A2). Inclua também `-shm` órfão, não só `-wal`.
  - **RN-02, teto:** 15 cópias **novas** (dentro do prazo) → as 5 mais velhas saem assim mesmo.
    Sem este cenário, a etapa troca um teto rígido por nenhum teto e o diretório cresce sem
    limite (achado A5: ~2,9 GB em 30 dias no ritmo de boots medido).
  - **Regra 0:** um `producao-2026.sqlite` e um `notas-wal` no diretório → **nenhum dos dois**
    aparece em `apagar` (achado A9).
  - **RN-02:** 5 cópias, **todas** mais velhas que `manterDias` → só 2 saem; as 3 mais novas
    ficam. E a mais recente **nunca** aparece em `apagar` (asserção própria — é o fallback que a
    RN-08 da Etapa 21 garante).
  - **RN-03:** `manterDias` `undefined`, `'abc'`, `0` e `-5` → cai no padrão, e **nada** é
    apagado por data (só órfão).
  - **Guarda anti-teste-vazio:** afirme que a lista de entrada não está vazia e que **algo**
    sobrou, antes de afirmar o que saiu.
- [x] **Step 2: implementar** `decidirRemocao` + `pruneOldBackups` usando-a. **Compatibilidade
  explícita** (`typeof opcoes === 'number'` → `{ tetoCopias: n }`), pelo motivo do C1: número
  desestruturado vira **no-op silencioso**, não erro. Rode
  `node tests/api/dbRecoveryBackup.api.test.js` (5 cenários, verde hoje) **antes e depois** — ele
  chama `pruneOldBackups(dbPath, 1)`, abaixo do piso, e é o teste que congela o contrato.
- [x] **Step 3: controle positivo** (commitado antes, `ffea21f`), **três**, lendo qual asserção
  caiu:
  1. acompanhante nem classificado (régua volta a olhar só `.sqlite`) → **RN-01 caiu nomeando os
     6 órfãos que ficaram** (`apagar=[]`). 7 passed, 14 failed.
  2. `pisoEfetivo = 0` → **RN-02 caiu**: "a régua apagou TUDO (5/5) — isso não é limpeza, é perda"
     e "única cópia (de 8 anos) foi apagada — a recuperação ficou sem fallback". 18/3.
  3. `ehAcompanhante` só reconhece o nome NOVO → **RN-01 caiu mostrando exatamente o passivo
     real**: `apagar` só com os 2 órfãos de nome novo, os 4 de nome antigo intactos. 7/14.
     **E o `dbRecoveryBackup.api.test.js` continuou 5/5 sob essa sabotagem** — porque
     `backupDatabaseFiles` só produz o nome novo. É a prova de que o teste congelado sozinho
     **não pega** o bug de 44 MB, e de que o cenário novo não é vazio.
  `md5sum` conferido antes/depois/restaurado (OK nos dois arquivos), `git diff --stat` vazio.
- [x] **Step 4:** `test:api` **152/152**, `test:sqlite` **5/5**; commit `ffea21f`.

#### Divergências desta task (o que saiu diferente do plano, e por quê)

1. **O contrato C1 acima está incompleto:** ele lista `{ manterDias, pisoCopias = 3, agora }` e
   **não tem `tetoCopias`** — mas a própria RN-02 (corrigida na Fase 2 pelo achado A5) e a regra 2
   exigem o teto. A assinatura implementada é
   `decidirRemocao(arquivos, { manterDias, pisoCopias = 3, tetoCopias = 10, agora })`.
   O texto do C1 ficou defasado quando a Fase 2 acrescentou o teto; **está errado como escrito**.
2. **Regra 3 apaga os acompanhantes nos DOIS formatos de nome**, não só no novo. O plano diz
   "junto com seus acompanhantes" sem qualificar. Se a regra 3 só limpasse `X.sqlite-wal`, um
   `X-wal` de mesmo carimbo sobreviveria à passagem — e como a regra 1 já rodou antes dele virar
   órfão, ele só sairia no boot **seguinte**. Custa uma linha varrer os dois agora.
3. **A letra A da Task 4 vai prometer o número errado.** Ela manda escrever "liberam-se ~44 MB em
   132 acompanhantes órfãos; as 11 cópias e seus 133 MB **continuam**". Com o teto de 10 isso não
   se sustenta: há **11** cópias em disco, então a 11ª sai pelo teto. Dry-run sobre o diretório
   real (só leitura, nada executado) em 2026-08-29:

   ```
   ENTRADA        : 165 arquivos, 187,36 MB
   APAGARIA       : 135 arquivos,  57,27 MB
     orfaos       : 132   (44,4 MB — o passivo)
     acimaDoTeto  :   1   database-2026-08-05T19-54-12.sqlite
     acompanhantes:   2   (os dessa cópia)
     porIdade     :   0   (as 11 cópias estão todas dentro dos 30 dias)
     ignorados(r0):   0
   SOBRARIAM      :  30 arquivos, 130,09 MB — 10 cópias .sqlite
   ```

   Texto correto para a letra A: **liberam-se ~57 MB em 135 arquivos** — 132 acompanhantes
   órfãos (44,4 MB) **mais** a 11ª cópia e seus 2 acompanhantes (12,9 MB), que saem pelo teto de
   10. Sobram **10 cópias e ~130 MB**, não 11 e 133 MB.

---

### Task 2 (tronco): `backup_manter_dias` deixa de ser dado morto — **e o prune muda de lugar**

**Files:** Modify `server/index.js`; Test — acrescente ao arquivo da Task 1.

**A leitura NÃO pode ficar em `index.js:1013`** (achado A1, **bloqueante**, reproduzido). Quem
cria a tabela `configuracoes` (`:1504`) e semeia a chave (`:2128`) é `initializeDatabase`, que
roda **depois** do prune. No primeiro boot de uma instalação nova (volume vazio, clone novo) o
`SELECT` falha com `no such table: configuracoes`, e os dois desfechos são ruins:

- dentro do `.then` de `:1012` → o `.catch` de `:1016` marca `dbStartupFailed = true`, e o
  `/health` passa a reportar `db_startup_failed` **pelo resto da vida do processo** — o boot
  mente sobre a integridade do banco;
- fora dele → rejeição não tratada, e no **Node 24** isso **encerra o processo** (não há
  `process.on('unhandledRejection')` no `index.js`). O backup do boot, que é a rede de segurança
  do sistema, nunca roda.

**Mova o prune para dentro de `initializeDatabase`, depois de `inicializarConfiguracoesPadrao`
(`:2074`).** Só o `backupDatabaseFiles` precisa acontecer antes das migrations; o prune não.

- [ ] **Step 1: teste que falha** — extraia a tradução configuração → opções para uma **função**
  (sem harness de core, é o que dá para testar): `'7'` → `manterDias: 7`; ausente, `'abc'`,
  `'0'`, `'-5'` e `NaN` → padrão **com log** (RN-03). **Inclua o caminho "tabela ausente"**: a
  função recebe o erro e cai no padrão sem lançar — é o cenário que guarda o A1.
- [ ] **Step 2: implementar** a mudança de lugar + a leitura. Confira que o backup do boot
  continua rodando **antes** das migrations (não mova esse).
- [ ] **Step 3: controle positivo** (commitar antes): faça a leitura ignorar a chave e sempre usar
  o padrão → o cenário do `'7'` cai nomeando o valor lido. Segunda: faça o caminho de erro
  **lançar** → o cenário da tabela ausente cai.
- [ ] **Step 4:** `npm run test:api`; commit.

---

### Task 3 (galho): a movimentação registra de onde veio — **pelo `req.user`, não pelo `req`**

**Files:** Create `server/services/almoxarifado/origemRequisicao.js`; Modify o middleware que
popula `req.user` no módulo **e** `server/services/almoxarifado/stockService.js`;
Test `server/tests/api/origemMovimentacao.api.test.js`.

**A forma que este plano trazia ESTAVA ERRADA** (achado A3). Ele mandava "repassar o `req`" para
a auditoria, e o `req` **não chega lá**: `registrarMovimentacao(db, user, params, opcoes)` não o
recebe, e dos **28** call sites de produção, **23 nascem dentro de serviços** que também não têm
`req` (`thirdPartyService` 6, `returnService` 5, `inspectionService` 3, `receiptService` 2,
`requisitionService` 2, `scrapService` 2, `stockService` interno 2, `scrapDisposalService` 1).
Cumprir a letra do plano exigiria mudar **8 assinaturas de serviço** e ~20 chamadores.

**O caminho medido:** `req.user` já é o objeto universal — **57 de 57** chamadas de serviço nas
rotas do módulo usam a forma `Service.x(db, req.user, …)`, sem exceção. Anexar `origem` a
`req.user` num middleware e ler `user.origem` dentro do `stockService` alcança os **28** call
sites com **duas** edições e **zero** mudança de assinatura. E degrada limpo nos testes, que
constroem `user` literal: `user.origem` vira `undefined`.

**Descartado** `opcoes.origem` (o 4º parâmetro, que já existe): só as 5 rotas passariam origem, e
os **23 movimentos originados em serviço gravariam `null`** — metade da feature, em silêncio.

- [ ] **Step 1: teste que falha** — `origemRequisicao` puro: `x-forwarded-for` com um IP; com
  **vários** (`"cliente, proxy1, proxy2"` → o **primeiro** é o cliente); ausente (cai em
  `req.ip`, `ip_proxy` fica `null`); `user-agent` ausente; `user-agent` gigante (truncado, com o
  limite **afirmado**); e `req` malformado (sem `get`) → não lança, devolve campos nulos.
  O último importa porque a origem vai virar **dado inerte** (RN-05).
- [ ] **Step 2: implementar** o helper, anexar `origem` a `req.user` no middleware do módulo, e
  ler `user.origem` na auditoria de movimentação (`stockService.js:1367`).
  **NÃO crie `try/catch` ali** — ele não existe (achado A4: 59 das 60 chamadas de
  `registrarAuditoria` estão sem `try`), e criá-lo mudaria a semântica congelada da auditoria de
  movimentação sem que esta etapa tenha decidido isso. A origem é dado já pronto; não há o que
  falhar no ponto da escrita.
- [ ] **Step 3: integração** — movimentar por rota real e ler pela tela-contrato
  (`GET /api/almoxarifado/auditoria?entidade=movimentacao`), conferindo que `ip` e `user_agent`
  aparecem nas `alteracoes`. **Não** espere total fixo; afirme a composição.
  **E um cenário para o caminho de serviço:** uma operação que movimenta de dentro de um serviço
  (devolução, recebimento) também tem de gravar a origem — é o que separa esta forma da
  descartada.
- [ ] **Step 4: controle positivo com alvo:** faça o helper devolver `req.ip` cru → o cenário do
  `x-forwarded-for` com vários IPs cai **nomeando o IP do proxy no lugar do cliente**.
- [ ] **Step 5:** `npm run test:api`; commit.

---

### Task 4: as duas correções de spec, integração e fechamento

- [ ] **Step 1: reescrever os dois itens errados da spec 23**, dizendo que estavam errados:
  - **lançamento retroativo** — não é tarefa: `created_at` é `CURRENT_TIMESTAMP` e nenhuma rota
    aceita data do cliente; bloquear o retroativo é impossível porque o retroativo é impossível.
    **Meça de novo antes de escrever** (não confie neste plano) e cole o comando.
  - **justificativa em operações excepcionais** — a spec diz "não construída", o que é falso;
    mas **o "77" é número a DESCARTAR, não a confirmar** (achado A10): ele conta `justificativa:`
    como chave de objeto, ou seja, o campo sendo **repassado** pelo pipeline. Os pontos que de
    fato **exigem** são **~8**. Meça o que falta, liste, e reescreva o item com a lista.
- [ ] **Step 2:** os cinco comandos da suíte + o cliente com `TZ=UTC`, números **lidos**.
- [ ] **Step 3:** skill `fechar-etapa` inteira, **incluindo o Passo 8** (escolher a próxima etapa
  e começar a Fase 0 no mesmo turno). Diga se a feature 23 finalmente vira 🟢 — e se não virar,
  diga **o que exatamente** falta, sem repetir o erro das etapas 22 e 24 de pesar só uma perna.
  Letra **B**: dupla conferência em material crítico (com o precedente do sucateamento).
  Letra **A**: a limpeza é a primeira coisa a rodar em produção — escreva como, **com os números
  certos**. Prometer "188 MB" seria prometer 4× o que se entrega (achado A6) — **mas "~44 MB e as
  11 cópias continuam" também está errado**, e foi corrigido na execução da Task 1 (ver
  "Divergências" lá): com o teto de 10, a 11ª cópia sai. Dry-run sobre o diretório real:
  **liberam-se ~57 MB em 135 arquivos** — 132 acompanhantes órfãos (44,4 MB) **mais** a 11ª cópia
  e seus 2 acompanhantes (12,9 MB). **Sobram 10 cópias e ~130 MB.** Confira com o dry-run de novo
  antes de escrever: o número muda conforme quantas cópias houver no dia.
  Letra **C**: a tela de Backup fica com **um** controle vivo e **dois** decorativos —
  `backup_automatico` e `backup_frequencia` seguem sem leitor no servidor (achado A11). Se o guia
  disser só "a retenção agora funciona", o usuário conclui que o painel inteiro funciona.

## Próxima tarefa detalhada

**A Task 1 está feita (`ffea21f`). A próxima é a Task 2.** O que ela consome:

- `pruneOldBackups(dbPath, opcoes)` aceita **objeto** `{ manterDias, pisoCopias, tetoCopias }` ou
  **número** (= `tetoCopias`, o sentido histórico). Devolve `{ apagados: string[], motivo }`.
- `motivo.manterDiasInvalido` é `true` quando o valor lido não presta; `motivo.manterDias` traz o
  efetivo. `pruneOldBackups` **já loga** o aviso da RN-03 quando recebe `manterDias` num objeto —
  a Task 2 não precisa duplicar o log, só passar a chave lida.
- Constantes exportadas para a Task 2 não reinventar: `MANTER_DIAS_PADRAO` (30),
  `PISO_COPIAS_PADRAO` (3), `TETO_COPIAS_PADRAO` (10).
- **`index.js:1013` continua `pruneOldBackups(dbPath, 10)` e continua correto** (vira teto 10,
  padrão de 30 dias). A Task 2 é que o move para dentro de `initializeDatabase`, depois de
  `inicializarConfiguracoesPadrao` (`:2074`), e troca o `10` por
  `{ manterDias: <valor lido>, tetoCopias: 10 }`.

---

### Se a etapa inteira parar aqui

Se parar aqui: **Fase 2** — agente fresco com plano + design e três perguntas (contratos cobrem
os erros? as RN batem com o código? a Task 3 é galho de verdade?). Peça atenção especial a:
o piso de 3 cópias é suficiente para a RN-08 da Etapa 21 (o zip leva **a mais recente** — o piso
protege isso?); a leitura de `backup_manter_dias` no boot é segura (o banco está pronto?); e se
`stockService` tem mesmo acesso ao `req` no ponto onde audita — **se não tiver, a Task 3 muda de
forma** e é melhor descobrir agora que no meio da execução.
