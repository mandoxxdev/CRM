# Etapa 141 (propostas): o documento da proposta barrado no servidor (C304) e os valores em reais do pedido (C306) — plano

> Origem: "Próxima tarefa detalhada — Etapa 141" do plano da 140. Design com a Fase 0 medida:
> `docs/superpowers/specs/2026-10-17-almoxarifado-etapa141-o-documento-barrado-no-servidor-design.md`.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-17): última B **B913**, último C
> **C306**, última A **A88**. Esta etapa: **B914+**, **C307+**, **A89+**. Worktree `CRM-wt-e141`, branch `etapa-e141` (da main `953441a4`).
>
> **Trava de máquina:** `scratchpad/e141-lock.sh` (o diretório `maquina-testes.lock` de sempre). Um arquivo de teste de servidor por vez,
> inclusive os revisores. Revisão obrigatória da proposta: `scratchpad/e141/review-proposta.sh` (22 + editor). A etapa **não** toca o
> template; toca o `index.js` (as rotas `/premium`, `/pdf` e `POST /aprovacoes`), `server/aprovacaoDesconto.js` e quatro telas da proposta.
>
> **Fase 2 (um revisor fresco, só leitura): 0 Critical, 5 Important, 5 Minor — todos aceitos antes de qualquer código de produção, com o
> que mudou:** **I1** a recusa mandava a Aprovações, mas proposta enviada/ganha não tem saída por lá (o modal só lista rascunho; o `PUT`
> /aprovação recusam fora de rascunho/*desconto aprovado*) — o caminho real é **Nova revisão** (volta a rascunho) e salvar (o pedido sai
> sozinho) → o **L-DOCUMENTO diz isso**, e a A89 lista quantas por status. E o modal "Nova solicitação" esconde a proposta cuja aprovação
> de mesmo valor foi decidida por quem pediu (não olha o decisor, B912) → **RN-141.09**. **I2** o admin apaga uma aprovação válida
> (`DELETE /api/aprovacoes/:id`) e a ganha perde o PDF → declarado em D (141) (não mexido: rota de admin, reversível). **I3** o motivo de
> deixar o `embed=1` livre estava errado: o `embed` é o **mesmo** HTML completo (só sem a barra de impressão), saindo para qualquer logado
> pelo editor aberto por URL ou pelas DevTools → **o `embed` também recusa** (RN-141.03 reescrita; no uso normal o editor só abre fora de
> rascunho, pela lista — barrá-lo custa só o editor de proposta com desconto não liberado, que não tem documento a mostrar). Isso também
> dissolve o **I4** (a variável do `embed` divergindo da que tira a barra). **I5** erro de banco na conferência do `/premium` → contrato
> fixado: `SQLITE_BUSY`/`locked` → 503 *"Banco de dados temporariamente ocupado. Tente novamente em alguns segundos."* (`retryAfter: 2`),
> o resto 500 *"Erro ao verificar aprovação de desconto"* (o literal do `PUT`), sempre por `sendOnce`. Minors: a conferência usa a margem da
> **mesma linha** que gera o documento (sem nova leitura); o `html_rendered` antigo continua saindo no `GET /api/propostas/:id` (D (141);
> a A89 mostra quem tem); observável de "o navegador não abriu" = a linha `[PDF] proposta <id>` ausente no log do filho (e presente no
> liberado); `valor_total` lido com `Number` + `Number.isFinite` (texto numérico `'1500'` vale; `'1.234,56'` → 0), com cenário; a A89
> espelha a régua do JS e inclui todos os status.

## Regras de negócio

Literal novo:
- **L-DOCUMENTO** = *"Não é possível gerar o documento (visualização ou PDF) de uma proposta com desconto acima de 5% sem a aprovação desse
  desconto. Peça a aprovação em Comercial → Aprovações; se a proposta já saiu do rascunho, volte-a para rascunho (Nova revisão, ou o status
  Rascunho no formulário) e salve-a para pedir a aprovação."* (em `aprovacaoDesconto.MSG.DOCUMENTO`; *a primeira versão dizia só "emita
  uma nova revisão" — a Fase 5 (r1 m-1) mostrou que a* desconto aprovado *não tem Nova revisão na tela*)
- De antes, para o erro de banco na conferência do `/premium`: *"Banco de dados temporariamente ocupado. Tente novamente em alguns
  segundos."* (503, `retryAfter: 2`) e *"Erro ao verificar aprovação de desconto"* (500).
- De antes: *"Proposta não encontrada"* (404), *"ID da proposta inválido"* (400).

"Liberada" = `aprovacaoDesconto.margemLiberada(db, id, margemParaRegra(propostas.margem_desconto))` — a margem gravada até 5 (inclusive
`NULL`, que a régua lê como 0) passa; acima de 5 ou ilegível só com aprovação que **casa** (`aprovado`, tipo desconto, decidida por alguém
que não é quem pediu, mesmo percentual a 0,01 ponto). É a mesma do `/enviar` e do `/assinar` (RN-140.10/13).

- **RN-141.01 — o PDF recusa o desconto não liberado (C304).** `GET /api/propostas/:id/pdf` de proposta cuja margem não está liberada →
  **403 L-DOCUMENTO**, em **qualquer status**, e **nada é gravado** (`html_rendered`, `css_snapshot`, `pdf_gerado_at`, `snapshot_checksum`,
  `proposta_snapshot`) nem o navegador headless é aberto. Cenário (o da C304): enviada com 10 % aprovado → nova revisão → rascunho → `PUT`
  margem 50 → `/pdf` → 403 (antes: o PDF com 50 %).
- **RN-141.02 — a visualização recusa o mesmo.** `GET /api/propostas/:id/premium` (com ou sem `embed`) → **403 L-DOCUMENTO** nas mesmas
  condições, antes das customizações e das cláusulas; usa a margem da linha já lida (a mesma que gera o documento).
- **RN-141.03 — o editor (`embed=1`/`true`) também recusa** (Fase 2, I3 — *esta RN dizia "continua abrindo"; **estava errada**: o `embed` é o
  mesmo documento completo*). Cenário: a mesma rascunho com 50 % → `/premium?embed=1` → 403; o editor mostra a frase.
- **RN-141.04 — o liberado sai como antes.** Margem ≤ 5 (inclusive 0 e `NULL`) em qualquer status, e margem acima de 5 com aprovação que
  casa → `/premium` 200 HTML e `/pdf` 200 `application/pdf` (e o `/pdf` grava o retrato, como sempre). Cenário: rascunho com 3 % → 200 nos
  dois (a tela continua barrando rascunho pelos botões — a regra do servidor é a do desconto, B914).
- **RN-141.05 — a aprovação que não casa não libera:** aprovação de outro percentual; decidida por quem pediu (as de antes da 140, B912);
  pendente ou rejeitada; margem gravada ilegível (`'10,5'` em texto, legado) → 403.
- **RN-141.06 — ordem:** sem login 401 → 400 id → 503 banco → 404 → 403 L-DOCUMENTO. Proposta inexistente dá 404, não 403. Erro de banco
  na conferência: `/premium` 503/500 (literais acima, por `sendOnce`); `/pdf` 500 pelo `catch` de sempre.
- **RN-141.07 — a tela mostra a frase do servidor.** Os downloads de PDF (`PropostasList`, `PropostaDetalhe`, `proposta/PropostaForm`, o
  editor `PropostaPreviewEditavel` — no PDF **e** ao carregar) e os "Ver proposta" (`PropostaDetalhe`, `proposta/PropostaForm`) mostram no toast o `error` da resposta
  (lido de dentro do Blob/texto por `mensagemDoErroEmBlob`); sem `error`, a frase genérica de hoje (*"Erro ao gerar PDF."* /
  *"Erro ao abrir proposta."*).
- **RN-141.08 — os valores em reais do pedido saem da proposta (C306).** *(**Esta RN estava errada** — Fase 5, r1/r2 I-1: o `valor_total` gravado vem do corpo do `PUT`, sem conferir com os itens; **o total é o do documento**, `server/totalDocumentoProposta.js` (a soma dos itens; sem itens, o `valor_total` por `parseFloat`). O texto original segue.)* `POST /api/aprovacoes` grava `valor_total` = `propostas.valor_total`
  (lido com `Number` e `Number.isFinite`: texto numérico vale, `"1.234,56"`/`"abc"`/nulo → 0), `valor_desconto_rs` = `round2(valor_total × valor_desconto / 100)` e `valor_com_desconto` =
  `round2(valor_total − valor_desconto_rs)`, com `valor_desconto` já lido pela régua; os três do corpo são **ignorados sem erro**. A
  descrição da atividade do aprovador usa os mesmos. Cenário: proposta de R$ 100.000 com 30 %, corpo dizendo total 1 / desconto R$ 100 →
  gravado 100000 / 30000 / 70000. As recusas e a ordem do `POST` (B908) não mudam.
- **RN-141.09 — o modal "Nova solicitação" não esconde a proposta cuja aprovação não vale** (Fase 2, I1). Em `Aprovacoes.js`, "já tem
  aprovação" passa a exigir também a decidida por alguém que não é quem pediu (`aprovado_por` presente e diferente de `solicitado_por`, B912)
  e o percentual com a tolerância de 0,01; antes uma aprovação auto-decidida de mesmo valor escondia a proposta para sempre.

## Contratos (congelados)

| Rota | Antes | Agora |
|---|---|---|
| `GET /api/propostas/:id/pdf` | 200 PDF de qualquer proposta | 403 `{ error: L-DOCUMENTO }` se não liberada (antes de gravar e do Puppeteer); senão o de sempre |
| `GET /api/propostas/:id/premium` (sem embed) | 200 HTML de qualquer proposta | 403 `{ error: L-DOCUMENTO }` se não liberada; senão o de sempre |
| `GET /api/propostas/:id/premium?embed=1` | 200 | 403 `{ error: L-DOCUMENTO }` se não liberada (Fase 2, I3); senão o de sempre |
| `POST /api/aprovacoes` | grava os R$ do corpo | grava os R$ calculados da proposta; resposta igual `{ id, message, aprovador_id }` |

Nenhuma rota nova, nenhuma coluna nova, nenhuma migração. A assinatura das linhas `app.get('/api/propostas/:id/premium', authenticateToken,`
e `app.get('/api/propostas/:id/pdf', authenticateToken,` não muda (o `propostaPdfExigeLogin` é teste de texto delas).

## Tasks

- [x] (`9815d197`; Fase 5 `10ec3229`) **T1 (tronco) — o servidor: RN-141.01 a 06.** `MSG.DOCUMENTO` em `aprovacaoDesconto.js`; a conferência no `/premium` (depois do 404, antes
  das customizações, valendo também para o `embed`) e no `/pdf` (depois do 404, antes dos itens). Teste novo
  `server/tests/api/propostaDocumentoDesconto.api.test.js` (molde: `aprovacaoDescontoAutorizacao.api.test.js` — usuários por
  `POST /api/usuarios`, dois aprovadores, banco por fora com `sqlite3` para o legado). **Integração pela rota e pelo serviço:** cada
  cenário de recusa/liberação confere também `aprovacaoDesconto.margemLiberada` contra o mesmo banco (rota 403 ⇔ serviço `false`), e o
  fluxo C304 inteiro (criar → pedir → aprovar → enviar → nova revisão → `PUT` 50 → `/pdf` 403 → `PUT` 10 → `/pdf` 200) cruza seis rotas.
  Controles positivos: tirar a conferência do `/pdf`; tirar a do `/premium`; pular no `embed`; conferir depois da gravação do retrato
  (mover para o fim); ler o status em vez da margem; `margemParaRegra` → `Number`.
- [x] (`4167208e`; Fase 5 `10ec3229` — o total passou a ser o do documento) **T2 (tronco, depois da T1) — C306, RN-141.08.** No `POST /api/aprovacoes`: o `SELECT` da proposta traz `valor_total`; os três valores
  calculados. Cenários no mesmo arquivo de teste. Controle: voltar a gravar o do corpo; trocar o arredondamento.
- [x] (`be150a88`; Fase 5 `317bf471`) **T3 (galho, contrato congelado) — a tela, RN-141.07 e RN-141.09.** O modal de `Aprovacoes.js`; os sete pontos com `mensagemDoErroEmBlob`. Teste jest novo
  `client/src/components/proposta/PropostaDocumentoRecusado.test.js`: monta `proposta/PropostaForm` numa proposta *enviada* com a API
  devolvendo 403 L-DOCUMENTO num Blob (PDF) e numa string (Ver proposta) → o toast tem a frase; sem `error`, a genérica; e uma régua de
  fonte para os outros quatro pontos (com controle que mostra que ela acusa o código antigo). Controle: voltar um ponto à frase fixa.
- [x] (antes de cada commit de código — números em "Execução") **T4 — suíte completa e a revisão obrigatória (22 + editor)** antes de cada commit de código.

**Pontos de atenção:** o `/premium` responde por `sendOnce` (há um timeout global de rota) — a recusa usa `sendOnce(403, ...)`. O `/pdf` é
`async` com `try/catch` → erro do banco na conferência vira 500 pelo `catch` de sempre. O `id` do parâmetro chega como texto ao
`margemLiberada` (o `/enviar` faz igual; a afinidade INTEGER da coluna converte). O teste do `/pdf` liberado abre o Chrome do Puppeteer
(lento — um ou dois cenários só).

## Execução (2026-10-17)

- **Fase 0** (o design tem a medição): os seis chamadores ativos e os três mortos; nenhum outro caminho do servidor gera o documento; o
  editor só se abre pela lista fora de rascunho; banco local (cópia de 09/10): 57 propostas, **0** com margem acima de 5.
- **Fase 2**: 5 Important + 5 Minor, todos aceitos antes do código (o cabeçalho tem o que mudou; a RN-141.03 e a decisão 2 do design
  estavam erradas — ditas lá).
- **Suíte de base** (a main `953441a4`, antes de qualquer mudança): `test:api` **458/459** — o `superPadraoNoBoot` caiu com
  `SQLITE_READONLY` na rodada cheia e passou **14/14** sozinho logo depois (intermitente, anterior; não volta nas rodadas desta etapa);
  `test:almoxarifado` 44/0; `test:validation`/`safealter`/`sqlite` verdes (16/0 no sqlite); client **137**/**1804**; build ok; revisão
  obrigatória **22/22** + editor **39/39**.
- **T1 — `9815d197`.** O teste nasceu **vermelho** (1/10 — o único verde era a liberação com aprovação que casa, que já valia). Uma
  divergência do previsto: o retrato do `/pdf` liberado é gravado **sem esperar** a resposta (`db.run` solto) → o teste espera até 5 s por ele
  (e a recusa espera 1,5 s antes de afirmar que nada foi gravado). Controles: **S1–S7** e **S12** (tirar a conferência do `/pdf` e do
  `/premium`, pular no `embed`, pelo status, `Number` em vez da régua nas duas, conferir depois de gerar e gravar, casar aceitando quem pediu)
  — todos caíram pela asserção certa (o S5/S6 só pelo cenário da margem ilegível, que é o que os prende).
- **T2 — `4167208e`.** Controles **S8–S11** (o total do corpo, sem arredondar, `parseFloat`, a atividade com o total do corpo) — todos
  caíram. A asserção da atividade lia "a última atividade" e caía pela atividade de **outro** cenário (gravada depois da resposta) → passou a
  procurar a desta proposta pelo título, esperando até 5 s.
- **T3 — `be150a88`.** 2 arquivos jest novos (9 testes). Controles **C1–C7** — todos caíram.
- **Suíte antes de `9815d197`/`4167208e`/`be150a88`** (a árvore com os três): `test:api` **460/460**; `test:almoxarifado` **44/0**;
  `test:validation` 4/0, `test:safealter` 3/0, `test:sqlite` 16/0; client **139** suítes / **1813** testes; `CI=true build` *Compiled
  successfully*; revisão obrigatória **22/22** + editor **39/39**.

## Fase 5 — três revisores frescos em paralelo, sob a trava

- **Regra (r1): 1 Important + 2 Minor, executados.** **I-1** (desta etapa; **o mesmo do r2 I-1**) a RN-141.08 lia `propostas.valor_total`,
  que o `PUT` grava do corpo sem conferir com os itens — o documento soma os itens: `PUT {valor_total: 100}` numa proposta de R$ 100.000 e o
  pedido de 30 % saía "Valor Total: R$ 100.00 / Desconto: R$ 30.00" → **a RN-141.08 estava errada**: o total do pedido é o **do documento**
  (`server/totalDocumentoProposta.js` — a soma que o `/premium` e o `/pdf` faziam em duas cópias, agora uma só para os três; sem itens, o
  `valor_total` gravado por `parseFloat`, como o documento). **m-1** (desta) o L-DOCUMENTO não dava saída para a *desconto aprovado* (sem
  Nova revisão na tela) → o literal diz "volte-a para rascunho (Nova revisão, ou o status Rascunho no formulário)". **m-2** (anterior) a ganha
  legada que segue a frase sai dos relatórios de ganhas até voltar a ser aceita → D (141). **Verificado e correto:** o caminho da frase
  executado ponta a ponta; a margem que o template imprime contra a régua (1e1, " 10.5 ", 5.001, 100.5); nenhuma outra porta.
- **Autorização (r2): 1 Important (= r1 I-1) + 2 Minor anteriores (a regra que casa aceita o legado decidido por responsável/criador; a
  aprovação vale pelo percentual — B910).** **Verificado e correto, executado:** id com sufixo (`3.0`, ` 3`, `+3`, `3e0`, `03` → 403;
  `3abc` → 404 — a conferência e a geração olham a mesma linha), `embed[]=1`, `EMBED=1`, `embed=TRUE` → 403; auto-aprovação pelo corpo; a
  corrida (a margem é a da linha em memória); `sendOnce`.
- **Sabotagem (r3, worktree própria `CRM-wt-e141-r3`, removida com a branch): 31 sabotagens — 18 caíram, 9 sobreviveram por falta de
  cenário (reais) e 4 equivalentes** (K6 `aprovado_por` vazio, K7 tipo nulo — `NOT NULL`, K9 `<=`, K10 sem `isFinite` — provados). Os 9
  viraram cenários, cada um com o controle rodado **por mim** com a mesma mutação no código já corrigido: **R1/R2** a conferência que falha
  no banco "liberava" (o `falhaSqlInjetada` ganhou `FALHA_SQL_METODOS`/`FALHA_SQL_MSG`, e o teste sobe mais duas vezes com a leitura das
  aprovações falhando: 500, nada gravado, navegador fechado), **R3** o 503 com `retryAfter`, **R16/R17** os centavos (1234,55 × 10 % e
  desconto + com desconto = total), **K1–K3** o `await` (a régua exige a chamada inteira), **K11/K12** o modal (teste novo que monta
  Aprovações e abre "Nova solicitação"), **K8** o util contra o `casaComAprovacao` numa grade de 3 casas. A busca da atividade (frágil, por
  título) passou a ser por id acima de uma marca. O I-1 ganhou cenários próprios (o `PUT` com 100, vários itens, quantidade 0, acessórios,
  `preco_base` do produto, sem itens) e 9 controles (F-R1, F-R2, F-R3, F-R16, F-R17, F-I1, F-M1, F-M2, F-M3) + 6 do client (K1, K2, K3, K8,
  K11, K12) — **todos caíram pela asserção certa**; o F-M2 e o F-M3 só caíram depois de o cenário gravar quantidade 0 pelo banco (a API grava
  0 como 1) e de criar o produto com `preco_base`.
- **Fase 5 — `10ec3229` (servidor) e `317bf471` (client).** O teste do servidor passou de 10 para **13** cenários (quatro subidas — duas com a
  leitura das aprovações falhando); o client ganhou `Aprovacoes.novaSolicitacao.test.js` e a grade contra o servidor (**140** suítes).
- **Suíte antes de `10ec3229`/`317bf471`** (a árvore com os dois): `test:api` **460/460**; `test:almoxarifado` **44/0**; `test:validation`
  4/0, `test:safealter` 3/0, `test:sqlite` 16/0; client **140** suítes / **1815** testes; `CI=true build` *Compiled successfully*; revisão
  obrigatória da proposta **22/22** + editor **39/39** (o `/premium` e o `/pdf` passaram a usar `totalDocumentoProposta.js` — a revisão
  cobre o documento).
- **Consultas A89 e A90** rodadas no banco local (cópia de 09/10): **0** linhas cada; controle positivo numa cópia com uma enviada a 30 %
  sem aprovação, uma ganha com `'10,5'` e uma aprovação decidida pelo responsável: A89 achou as duas, A90 a uma.

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** (a Fase 5). Testes antigos mudados: **0** (o `falhaSqlInjetada` ganhou duas variáveis, com o
   padrão de antes intacto — o `superPadraoNoBoot` passou nas duas rodadas da etapa).
2. **Achados da revisão:** Fase 2 — **5 Important + 5 Minor, todos reais** (um deles derrubou a decisão do `embed` do próprio design). Fase 5 —
   r1 **1 Important** desta (= r2) + **1 Minor** desta + **1** anterior; r2 o mesmo Important + **2** Minor anteriores (um vira **C307**, o
   outro é a **B910**); r3 **9** sobreviventes reais + **4** equivalentes; **0** ruído. **A RN-141.08 do plano estava errada** (o total do
   pedido pelo `valor_total` gravado) — a Fase 2 a viu passar, as duas lentes da Fase 5 a pegaram.
3. **Paralelismo:** **0** galhos em paralelo de fato (a T3 era galho, mas foi feita em sequência — o "um teste por vez" e o tamanho); **0**
   retrabalho; **1** revisor na Fase 2, **3** em paralelo na Fase 5 sob a trava (o r3 numa worktree própria, removida).
4. **Defeito que escapou:** **0** (preenchido na Etapa 142). A 142 mexeu nas mesmas rotas (`/premium`, `/pdf`) e no `PUT` da proposta: o
   `propostaDocumentoDesconto.api.test.js` (13) ficou verde nas duas rodadas da suíte, e nenhum dos achados das revisões da 142 (Fase 2: 12;
   Fase 5: 1 defeito + 11 sem cenário + 7 menores) era da 141 — os anteriores achados (C308, C309, C310, os D (142)) vêm de antes dela.

## Próxima tarefa detalhada — Etapa 142

*(A série desta etapa foi B914–B917, C307, A89–A90 — a 142 começa em **B918**, **C308**, **A91**; confira com `grep -oE` antes.)*

**Escolhida: a C298 (das propostas) — com dois itens do mesmo produto, tirar o primeiro troca as variáveis manuais.** Reproduzida na
revisão da Etapa 138: proposta com o mesmo produto duas vezes, variável manual *TAG-A* no primeiro e *TAG-B* no segundo; tirar o primeiro e
salvar deixa o que ficou com *TAG-A* (a do que saiu) e a *TAG-B* se perde. **Onde:** a religação no salvamento
(`religarVariaveisManuais` dentro do `PUT /api/propostas/:id`, `server/index.js` ~8625) e o reparo na leitura (`repararVariaveisManuais`,
~9301, usado pelo `/premium` e pelo `/pdf`) reconhecem o item por **código do produto + posição entre os iguais** (`item_chave`, gravado em
`POST .../variaveis-manuais` ~6284). **Fase 0:** medir como o formulário manda os itens no `PUT` (`montarPayloadProposta` — o item mantém o
`id`? `mesclarItensPreservandoCampos`), se o `PUT` apaga e recria os itens (ids novos) ou atualiza; e o que a chave guarda hoje no banco local
(`SELECT item_chave, COUNT(*) FROM proposta_variaveis_manuais GROUP BY 1`). **Desenho reversível sugerido:** religar pelo `id` do item quando
ele sobrevive ao salvamento, e só cair na posição entre iguais quando o item é recriado; ou gravar na chave algo que não muda com a remoção
de um irmão. **Pontos de atenção:** mexe no `/premium` e no `/pdf` → a revisão obrigatória da proposta (22 + editor) é critério; os
cenários da C296 (Etapa 138, a gravação com variável manual que nunca terminava) e o `propostaItensPreservar.test.js` não podem voltar;
prove pela rota (o `index.js` real em pasta vazia) **e** pelo reparo (a função pura). **Alternativa:** a **C297** (o vazio da *Classificação
de área* do produto não apaga — pequena, mas é regra do cadastro: decidir o vazio, reversível, registrar em B).

**Dependem do P.O. — NÃO implemente:** **B853**/**C279**, **B808**, **B755**, **B761**/**C239**, **C224**, o resto da **C225**, **C228**,
**C219**, **C230**, o reparo da **C246** (e a **C247**), a tabela de conversões e o grupo acima de família, a **régua do tempo de
recebimento (E2)**, a **C268**, a **C269**, **C275**, **C276**, **C277**, **C109**, **C117**/**C118**, **C139**, **C278**; na 05, os itens
de produto e a **C198**; na 06, a **B11** e a Engenharia; na 21, a valorização por cliente e previsto × realizado; na 22, **B13**,
**B101**/G30, **G38**; no Compras, D-35, D-37, D-78, D-90, G9/G30, G4, G15, B63, B60, B62; nas propostas, a verificação do dono da proposta
(Fase 12 de `specs/proposta-editavel/tasks.md`; também a **C305**), o filtro por permissão do histórico (`auditoria.md`), a **B910** (a
aprovação pelo percentual ou pelo valor) e agora a **C307** (as aprovações antigas decididas pelo responsável ou pelo criador); a Frente B da
lentidão das propostas (`specs/lentidao-api-propostas/...`, marcada "não executar"). Pendem de Postgres: **C98**, **C110**.

**O que já está pronto e não precisa reabrir:** `server/aprovacaoDesconto.js` (`margemLiberada`, `MSG.DOCUMENTO`) — toda porta nova que
entregue o documento da proposta passa por ela; `server/totalDocumentoProposta.js` — a conta do total do documento, uma só (preview, PDF,
pedido de aprovação); `tests/helpers/falhaSqlInjetada.js` com `FALHA_SQL_METODOS`/`FALHA_SQL_MSG` (faz falhar também `db.all`, com a
mensagem escolhida); o molde `propostaDocumentoDesconto.api.test.js` (várias subidas no mesmo banco, a régua do log `[PDF] proposta <id>`
para provar que o navegador não abriu); a revisão obrigatória **22/22**.
