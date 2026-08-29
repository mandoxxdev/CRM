# Etapa 25 — A perna Segurança (plano)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`.

**Goal:** limpar 188 MB de acompanhantes órfãos que o prune nunca alcança, fazer
`backup_manter_dias` deixar de ser dado morto, e a movimentação passar a registrar de onde veio
— sem cair na armadilha do `req.ip` atrás do proxy.

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
   **E nesta etapa em especial: `server/data/backups` é dado real de 188 MB.** Trabalhe sempre
   em diretório temporário do scratchpad; **nunca** rode o prune apontando para `server/data`.
7. Commit em português, corpo sem acento, `git commit -F`.

## Regras de negócio

| RN | Enunciado | Onde é provada |
|---|---|---|
| RN-01 | Acompanhante órfão (`-wal`/`-shm` sem `.sqlite`) é varrido | `backupRetencao` |
| RN-02 | Retenção por **dias**, com **piso de 3 cópias** — o mais recente nunca sai | `backupRetencao` |
| RN-03 | `backup_manter_dias` inválido → usa o padrão e **loga**; nunca apaga tudo | `backupRetencao` |
| RN-04 | A movimentação grava `ip` e `user_agent`, com `x-forwarded-for` junto | `origemRequisicao` + integração |
| RN-05 | Registrar origem é best-effort e não derruba a movimentação | integração |

## Contratos congelados

**C1 — `services/dbRecovery.js`**

```js
// decidirRemocao(arquivos, { manterDias, pisoCopias = 3, agora }) -> { apagar: string[], motivo: {} }
//   `arquivos`: [{ nome, mtimeMs }] — TUDO que está no diretório, inclusive -wal/-shm órfãos.
//   Função PURA: recebe `agora` por parâmetro (nunca Date.now() dentro) para o teste não
//   depender do relógio.
// pruneOldBackups(dbPath, opcoes) — assinatura ATUAL é (dbPath, keep = 10); a nova aceita
//   objeto. MANTENHA compatibilidade: `pruneOldBackups(dbPath, 10)` (index.js:1013) não pode
//   quebrar enquanto a Task 2 não trocar a chamada.
```

Régua da `decidirRemocao`, nesta ordem:
1. **Órfão** (`-wal`/`-shm` cujo `.sqlite` não está na lista) → **apagar sempre**, sem olhar data.
2. Das cópias `.sqlite` restantes, ordenadas da mais nova para a mais velha: as **3 primeiras
   nunca saem** (piso), por mais velhas que sejam.
3. Das demais, apagar as mais velhas que `manterDias`, **junto com seus acompanhantes**.

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

- [ ] **Step 1: teste que falha** — `decidirRemocao` como função pura, com `agora` fixo e
  `mtime` fixos:
  - **RN-01, o cenário de peso:** lista com 2 `.sqlite` e 8 `-wal`, dos quais 6 são órfãos →
    os 6 entram em `apagar`, os 2 acompanhados não saem por serem órfãos.
  - **RN-02:** 5 cópias, **todas** mais velhas que `manterDias` → só 2 saem; as 3 mais novas
    ficam. E a mais recente **nunca** aparece em `apagar` (asserção própria — é o fallback que a
    RN-08 da Etapa 21 garante).
  - **RN-03:** `manterDias` `undefined`, `'abc'`, `0` e `-5` → cai no padrão, e **nada** é
    apagado por data (só órfão).
  - **Guarda anti-teste-vazio:** afirme que a lista de entrada não está vazia e que **algo**
    sobrou, antes de afirmar o que saiu.
- [ ] **Step 2: implementar** `decidirRemocao` + `pruneOldBackups` usando-a. **Compatibilidade:**
  a chamada atual `pruneOldBackups(dbPath, 10)` continua funcionando (número = piso/quantidade,
  como hoje) — a Task 2 troca.
- [ ] **Step 3: controle positivo** (commitar antes): faça a régua ignorar órfãos (volte a
  filtrar só `.sqlite`) → o cenário RN-01 cai **nomeando os 6 órfãos que ficaram**. Segunda
  sabotagem: remova o piso → o cenário RN-02 cai dizendo que a mais recente foi apagada.
- [ ] **Step 4:** `npm run test:api` e `npm run test:sqlite`; commit.

---

### Task 2 (tronco): `backup_manter_dias` deixa de ser dado morto

**Files:** Modify `server/index.js` (a chamada em `:1013`); Test — acrescente ao arquivo da Task 1.

- [ ] **Step 1: teste que falha** — a leitura da chave: valor `'7'` vira `manterDias: 7`;
  ausente/lixo vira o padrão **com log** (RN-03). Como não há harness de core, o teste é da
  **função** que traduz a configuração em opções — extraia-a em vez de embutir na rota.
- [ ] **Step 2: implementar.** Ler `backup_manter_dias` de `configuracoes` antes de chamar o
  prune. **Atenção:** o startup roda antes de o banco estar pronto? Confira a ordem em
  `index.js:1000-1030` e, se a leitura não for segura ali, **diga no relatório** em vez de
  forçar — o backup no boot é a rede de segurança do sistema.
- [ ] **Step 3: controle positivo** (commitar antes): faça a leitura ignorar a chave e sempre
  usar o padrão → o cenário do `'7'` cai nomeando o valor lido.
- [ ] **Step 4:** `npm run test:api`; commit.

---

### Task 3 (galho): a movimentação registra de onde veio

**Files:** Create `server/services/almoxarifado/origemRequisicao.js`; Modify
`server/services/almoxarifado/stockService.js` (a auditoria de movimentação) e a rota que a
chama, para repassar o `req`; Test `server/tests/api/origemMovimentacao.api.test.js`.

**Independência:** não toca nada da Task 1/2 — **é galho, pode ir em paralelo com a Task 2.**

- [ ] **Step 1: teste que falha** — `origemRequisicao` puro: `x-forwarded-for` com um IP; com
  **vários** (`"cliente, proxy1, proxy2"` → o **primeiro** é o cliente); ausente (cai em
  `req.ip`, e `ip_proxy` fica `null`); `user-agent` ausente; `user-agent` gigante (truncado no
  limite, com o limite **afirmado**).
- [ ] **Step 2: implementar** o helper e ligá-lo à auditoria de movimentação, dentro do
  `try/catch` best-effort que já existe (RN-05).
- [ ] **Step 3: integração** — movimentar por rota real e ler pela tela-contrato
  (`GET /api/almoxarifado/auditoria?entidade=movimentacao`), conferindo que `ip` e `user_agent`
  aparecem. **Não** espere total fixo (o erro do plano da Etapa 23); afirme a composição.
- [ ] **Step 4: controle positivo com alvo:** faça o helper devolver `req.ip` cru → o cenário do
  `x-forwarded-for` com vários IPs cai **nomeando o IP do proxy no lugar do cliente**. É a
  asserção que guarda o achado da Fase 0.
- [ ] **Step 5:** `npm run test:api`; commit.

---

### Task 4: as duas correções de spec, integração e fechamento

- [ ] **Step 1: reescrever os dois itens errados da spec 23**, dizendo que estavam errados:
  - **lançamento retroativo** — não é tarefa: `created_at` é `CURRENT_TIMESTAMP` e nenhuma rota
    aceita data do cliente; bloquear o retroativo é impossível porque o retroativo é impossível.
    **Meça de novo antes de escrever** (não confie neste plano) e cole o comando.
  - **justificativa em operações excepcionais** — a spec diz "não construída" e há **77** call
    sites. Meça o que **falta**, liste, e reescreva o item com a lista.
- [ ] **Step 2:** os cinco comandos da suíte + o cliente com `TZ=UTC`, números **lidos**.
- [ ] **Step 3:** skill `fechar-etapa` inteira, **incluindo o Passo 8** (escolher a próxima etapa
  e começar a Fase 0 no mesmo turno). Diga se a feature 23 finalmente vira 🟢 — e se não virar,
  diga **o que exatamente** falta, sem repetir o erro das etapas 22 e 24 de pesar só uma perna.
  Letra **B**: dupla conferência em material crítico (com o precedente do sucateamento).
  Letra **A**: a limpeza dos 188 MB é a primeira coisa a rodar em produção — escreva como.

## Próxima tarefa detalhada

Se parar aqui: **Fase 2** — agente fresco com plano + design e três perguntas (contratos cobrem
os erros? as RN batem com o código? a Task 3 é galho de verdade?). Peça atenção especial a:
o piso de 3 cópias é suficiente para a RN-08 da Etapa 21 (o zip leva **a mais recente** — o piso
protege isso?); a leitura de `backup_manter_dias` no boot é segura (o banco está pronto?); e se
`stockService` tem mesmo acesso ao `req` no ponto onde audita — **se não tiver, a Task 3 muda de
forma** e é melhor descobrir agora que no meio da execução.
