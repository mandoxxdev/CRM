# Etapa 80 — fila no Chromium compartilhado dos PDFs (B32)

> Origem: B32 da Etapa 78 (`docs/compras-novidades-por-etapa.md`) e a próxima tarefa do plano da 79.
> Baseline (`83d77cf2`): `test:api` 297/297; client 86 suítes / 1338 testes; build limpo.

## Fase 0 — o que existe (medido em 2026-10-08, `server/index.js`)
- Estado de módulo `:292-294`: `navegadorPdf`, `pdfsGerados`, `timerOciosoPdf`. `obterNavegadorPdf`
  (`:312-337`) recicla depois de `PDFS_ANTES_DE_RECICLAR = 20` (`:290`) e abre com
  `puppeteer.launch`. `fecharNavegadorPdf` (`:302-310`) zera e fecha.
- **Dois chamadores**: a rota `GET /api/propostas/:id/pdf` (`~:10314-10374`: `obterNavegadorPdf` →
  `newPage` → … → `page.pdf` → `page.close` → `pdfsGerados += 1`; no `catch`, `fecharNavegadorPdf`
  se `browser`) e `gerarPdfDeHtml` (`:358-394`, Etapa 78, mesmo padrão).
- **Três corridas reais**, nenhuma serializada:
  1. **Reciclagem no meio de outro PDF:** A está em `page.pdf`; B chama `obterNavegadorPdf` com
     `pdfsGerados >= 20` → `fecharNavegadorPdf` → A morre com "Target closed"/"Protocol error".
  2. **Erro de um derruba o outro:** A falha e chama `fecharNavegadorPdf('erro na geração')`
     enquanto B está gerando → B morre também.
  3. **Lançamento duplo (vazamento):** com `navegadorPdf === null` (primeiro PDF, ou depois do
     fechamento por ociosidade), A e B entram juntos em `obterNavegadorPdf`; os dois passam no
     `if (!navegadorPdf)` antes do `await puppeteer.launch` voltar → **dois Chromium**; o segundo
     sobrescreve `navegadorPdf` e o primeiro **nunca é fechado** (~580 MB residentes, comentário
     `:286`; o servidor já teve queda por pressão de memória). Segundo caminho para a mesma corrida:
     `fecharNavegadorPdf` zera `navegadorPdf` **antes** do `await b.close()` — quem chega nesse
     intervalo também lança.
  4. **Temporizador de ociosidade** (achado da revisão do plano): `agendarFechamentoOcioso`
     (`:296-299`) dispara `fecharNavegadorPdf('ocioso')` por `setTimeout`, fora de qualquer fila,
     e só é rearmado quando um PDF **termina**. Último PDF em t=0; A começa em 4:59,5 reusando o
     navegador; em 5:00 o temporizador fecha o navegador debaixo de A.
- **Fora do escopo, registrado:** a rota de PDF da OS (`POST /api/operacional/ordens-servico/:id/gerar-pdf`,
  `index.js:~21394`, `puppeteer.launch` próprio em `~:21823`, fecha ao fim) **não** usa o navegador
  compartilhado: não causa as corridas 1–4, mas é um segundo Chromium simultâneo possível. Migrá-la
  para a fila muda o comportamento dela (`networkidle0`, sleep de 2 s) — etapa própria (B35).
- **Tempo máximo de uma geração travada** (a primeira versão deste plano dizia 60 s + 30 s e estava
  errada): os `page.evaluate`, `newPage`, `page.close` e `b.close` não têm timeout próprio;
  valem o `protocolTimeout` padrão do Puppeteer (180 s) — e `paginateProposalContent` é JS da página.

## Decisão (B35)
Uma **fila serial** (uma geração por vez no Chromium compartilhado). Escolhido: é a menor mudança
que elimina as três corridas de uma vez, sem dependência nova; o custo é latência sob concorrência
(um PDF leva ~1–2 s; com poucos usuários simultâneos, a espera é de segundos). Descartado:
contagem de referências (abas em uso) com reciclagem adiada — resolve 1 e 2 mas é mais estado
compartilhado para errar, e não resolve 3 sozinho; descartado pool de navegadores (memória).

## Regras
- **RN-80.01** No máximo **uma** geração de PDF usa o Chromium por vez, somando os dois chamadores.
- **RN-80.02** Uma geração que **falha** não trava as seguintes: a fila libera e a próxima roda (o
  navegador derrubado pelo erro é reaberto por ela).
- **RN-80.03** Reciclagem e fechamento por erro só acontecem **entre** gerações (consequência de
  80.01, porque ambos rodam dentro da vez de quem os disparou).
- **RN-80.04** Nunca há dois Chromium vivos abertos por `obterNavegadorPdf`.
- **RN-80.05** Fora da fila nada muda: HTML, opções de `page.pdf`, snapshot da proposta, headers,
  mensagens de erro e status de resposta continuam os mesmos.
- **RN-80.06** O fechamento por ociosidade também passa pela fila
  (`setTimeout(() => enfileirarPdf(() => fecharNavegadorPdf('ocioso')))`) **e** cada tarefa da
  fila começa com `clearTimeout(timerOciosoPdf)` — o navegador nunca fecha por ociosidade durante
  uma geração.
- **RN-80.07** Uma geração travada segura a fila por no máximo ~60 s: `protocolTimeout: 60000` nas
  opções de `puppeteer.launch` de `obterNavegadorPdf` (a proposta mais pesada medida leva ~1,3 s
  no `page.pdf`; 60 s é folga larga). Reversível (B35).

## Tasks
**T1 (única, tronco):**
1. `server/services/filaPdf.js` (puro): `criarFilaSerial()` → `enfileirar(fn)` que devolve a promessa
   do resultado de `fn`, rodando uma de cada vez em ordem de chegada; erro de `fn` rejeita só a sua
   promessa (a cadeia interna usa `.then(fn, fn)`/`catch` para não envenenar a fila).
   Teste `server/tests/api/filaPdf.api.test.js` (⚠️ `tests/*.test.js` fora de `api/` **não** roda em
   nenhum script — `pedidoDocumentoHtml.test.js` da 78 é só manual; precedente de teste de serviço
   em `api/`: `backupExposicao.api.test.js`; terminar com `process.exit(failed ? 1 : 0)`, exigido
   pelo `guardaProcessExit.js`): ordem FIFO; concorrência máxima medida = 1 com 5 tarefas assíncronas de
   durações diferentes; tarefa que lança não impede as seguintes e a sua promessa rejeita com o
   mesmo erro; valor de retorno propagado.
2. `server/index.js`: uma instância `const enfileirarPdf = criarFilaSerial()` junto ao estado do
   navegador; em `gerarPdfDeHtml` e na rota da proposta, **todo** o trecho do `obterNavegadorPdf`
   até `agendarFechamentoOcioso()` — incluindo o `fecharNavegadorPdf` do erro — roda dentro de
   `enfileirarPdf(async () => …)`. O snapshot e a resposta HTTP da proposta ficam **fora** (não
   seguram a fila). Atualizar os comentários ⚠️ B32 de `gerarPdfDeHtml` e pôr ⚠️ "nunca chamar de
   dentro de uma tarefa da fila (deadlock)".
   **Cuidados na rota da proposta** (revisão do plano): a tarefa usa `browser`/`page` **locais**,
   faz o `fecharNavegadorPdf('erro na geração')` **dentro** dela e relança; o `catch` externo
   (`~:10407-10412`) **deixa de chamar** `fecharNavegadorPdf` (apagar, não deixar morto) — senão,
   quando a promessa de A rejeita, a tarefa de B já pode ter começado e o catch de A fecharia o
   navegador de B. `navegadorJaEstavaDePe` e o cronômetro (`tPdf`) passam a ser medidos dentro da
   tarefa, com uma marca `fila=⟨ms⟩` separada para o tempo de espera (senão o log culpa o navegador
   pela fila). A tarefa devolve `pdfBuffer` (e o que o snapshot precisar).
   Também: RN-80.06 (ociosidade pela fila + `clearTimeout` no início de cada tarefa) e RN-80.07
   (`protocolTimeout`).
3. `PDFS_ANTES_DE_RECICLAR` aceita override por env (`PDF_RECICLAR_APOS`, inteiro ≥ 1; default 20)
   — só para a prova real conseguir reciclar com poucos PDFs.
4. Teste de fiação por fonte (padrão `propostaPdfExigeLogin.api.test.js`), em
   `server/tests/api/filaPdfFiacao.api.test.js`: `obterNavegadorPdf(` (excluindo a **definição**
   `async function obterNavegadorPdf(`) e `fecharNavegadorPdf(` (excluindo a definição; o
   `'ocioso'` tem de estar dentro de `enfileirarPdf(` também) só aparecem no `index.js` dentro de um bloco `enfileirarPdf(` (afirmar a contagem de chamadas
   e que cada uma está entre a abertura do `enfileirarPdf(async` e o fechamento correspondente — ou
   o critério textual mais simples que **falhe** quando alguém chama fora; provar com sabotagem).
**Ordem de execução:** o override `PDF_RECICLAR_APOS` (item 3) entra **primeiro, sozinho** (commit
próprio) — sem ele a prova "antes" nunca recicla (20 fixo) e só enxergaria a corrida 3.
**Prova real (obrigatória, com controle positivo):** servidor em `CRM_DATA_DIR` vazio com
`PDF_RECICLAR_APOS=2`; criar 2 propostas e 2 pedidos de compra pela API; disparar **8 downloads
concorrentes** (4 proposta + 4 pedido, `curl … &` + `wait`) com Bearer. **Antes da fila** (só com o override aplicado, rodar primeiro): registrar quantos falham (500) e quantos "navegador" abriram no
log — é o controle positivo de que a prova enxerga a corrida (se nada falhar, dizer isso e
aumentar a concorrência; se ainda assim não falhar, registrar honestamente). **Depois:** 8/8 200
com `%PDF`, e o log mostra reciclagens sem erro. Contar Chromium do servidor antes/depois para a RN-80.04 com
`Get-CimInstance Win32_Process` filtrando a linha de comando por `--headless` **e** pelo caminho do
Chromium do Puppeteer, contando só os processos raiz (sem `--type=`) — `tasklist | grep chrome`
conta o Chrome do próprio André e cada Chromium são vários processos.

## Pontos de atenção
- Sob muita concorrência, espera na fila + geração pode passar do timeout do proxy (Traefik → 502,
  comentário `index.js:~9558`), e a fila continua gerando para quem já desconectou. Aceito: poucos
  usuários simultâneos; registrar em B35.
- A rota da proposta tem `return` de erro antes do `obterNavegadorPdf` (400/404/503) — ficam fora
  da fila, sem mudança.
- `page.setContent` tem timeout de 60 s e `page.pdf` o default de 30 s: uma geração travada segura a
  fila no máximo por esse tempo. Registrar; não inventar timeout novo.
- Não mudar `PREMIUM_ROUTE_TIMEOUT_MS` nem nada da `/premium` (não usa o Chromium).
