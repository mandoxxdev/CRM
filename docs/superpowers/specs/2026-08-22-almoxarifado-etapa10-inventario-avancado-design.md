# Etapa 10 — Inventário avançado (feature 17) — Design

> **Data:** 2026-08-22 · **Spec:** `specs/modulo-almoxarifado/17-inventario-contagem/README.md`
> **Autorização:** delegação ampla do usuário ("pode fazer tudo como você recomendar" +
> "continua até fechar a etapa. Após fechar a etapa já pode ir pra próxima") — decisões D1–D9
> abaixo tomadas pelo assistente sob essa delegação, cada uma registrando o descartado e o
> porquê. Regras de overnight valem: nenhuma pergunta fica em aberto — vira decisão reversível
> registrada na letra B do `docs/almoxarifado-novidades-por-etapa.md`.

## O problema

O inventário existe desde a Etapa 0, mas com um risco **nomeado e nunca resolvido**: concluir uma
conferência com `aplicar_ajustes: true` (`PUT /conferencias/:id/concluir`,
`routes/almoxarifado.js:812-867`) grava o saldo por um caminho **inteiramente fora do motor** —
`UPDATE materiais_almoxarifado SET quantidade_atual = ?` direto, seguido de um `INSERT` manual em
`movimentacoes_almoxarifado` que nem usa `registrarAuditoria`. Consequência prática: **nenhuma**
das guardas que o motor (`stockService.registrarMovimentacao`) sempre aplicou — validação de
saldo, retenção, custo médio, dono do material, auditoria de verdade — roda aqui. É o **único**
caminho de escrita de saldo do módulo inteiro que ignora o motor (a spec 03 já nomeia essa
exceção).

**Esta mesma lacuna já apareceu, sob outro nome, em TRÊS etapas anteriores** — registrada em
`docs/almoxarifado-novidades-por-etapa.md` como pendência de negócio aberta (itens B1–B3):
Etapa 7 (Ajuste contra material bloqueado), Etapa 8 (a própria conferência gravando fora do
motor) e Etapa 8b (Ajuste contra material em terceiros). As três são a **mesma pergunta**: *o que
o Ajuste deve fazer quando reduzir o total para menos do que está retido?* Três respostas
possíveis ficaram registradas sem decisão: **(a)** baixar a retenção proporcionalmente; **(b)**
recusar enquanto a retenção for maior que o novo total; **(c)** aceitar e só avisar. **Esta etapa
decide — RN-06 abaixo — porque o checklist da própria spec 17 pede exatamente o mecanismo que
resolve as três de uma vez: "Ajuste como movimentação específica, dedicada, passando pelo motor".**

## Princípio herdado (motor único de estoque, Etapa 8b)

`services/almoxarifado/availabilitySql.js` já é a fonte única das quatro colunas de retenção
(`COLUNAS_RETENCAO`) e da fórmula do disponível. Esta etapa **reusa essa constante**, não inventa
uma lista paralela — é exatamente o tipo de segunda fonte que o próprio arquivo foi criado para
matar.

## Regras de negócio numeradas

| ID | Regra |
|---|---|
| **RN-01** | Criar conferência aceita `modo_cego` (bool, default `false` — muda comportamento **só quando pedido**) e `tolerancia_percentual` (número, default lido de `configuracoes_almoxarifado` chave `tolerancia_inventario_percentual`, e se ausente/vazio/não-numérico, `2`; **`0` é um valor válido e diferente de "ausente"** — não usar `\|\|` para o fallback). |
| **RN-02** | Com `modo_cego = true` e conferência `ABERTO`, `GET /conferencias/:id` **omite** `quantidade_sistema` e `divergencia` de cada item para quem **não** tem a ação `ajustar_estoque` — quem homologa o ajuste precisa ver para decidir; quem só conta, não. Concluída ou cancelada, os dois campos **sempre** aparecem (é o registro histórico). O item sempre traz `recontagem_necessaria` (bool, calculado no servidor pela fórmula de RN-05) — o front nunca recalcula a fórmula, só exibe. |
| **RN-03** | `PUT /conferencias/:id/item/:itemId` só aceita contagem com a conferência `ABERTO`. Fora disso: `"Conferência não está aberta (status atual: <status>)"`. |
| **RN-04** | A **segunda** vez que um item recebe `quantidade_contada` (isto é: o item já tinha uma contagem registrada), a chamada conta como **recontagem** — marca `recontado = 1` automaticamente, sem rota nova. |
| **RN-05** | Item com `\|divergência\| / max(quantidade_sistema, 1) × 100 > tolerancia_percentual` e `recontado = 0` **bloqueia a conclusão inteira** da conferência (com ou sem `aplicar_ajustes`) — `400` citando os itens **(código e o percentual — sem o nome do material, ver a tabela de contratos abaixo para o formato exato por item)**. Recontar (RN-04) libera, **qualquer que seja o novo valor**: a segunda contagem não entra em loop de tolerância de novo — ela é a segunda chance, não uma aprovação. |
| **RN-06** | Um Ajuste **sem localização** (`AJUSTE` **ou** `AJUSTE_INVENTARIO`) que definiria `quantidade_atual` **abaixo** da soma das quatro colunas de retenção (`availabilitySql.COLUNAS_RETENCAO`) é **recusado** — decide, para as três instâncias registradas (B1/B2/B3), a opção **(b)**: nunca aceitar um ajuste que deixaria o disponível negativo. Mensagem cita **quais** retenções pesam e o **mínimo** aceitável. **Sem bypass por `permite_saldo_negativo`** — isso é consistência interna dos dados, não política de negócio (D6 abaixo). **A guarda mora em UMA função pura exportada** (não em código duplicado) para poder ser chamada tanto pelo motor quanto pela pré-validação de RN-07. |
| **RN-06b** | `AJUSTE_INVENTARIO` exige `justificativa` (a mesma exigência que `AJUSTE` já tem via `REGRAS_VINCULO` — sem isto o comentário de `ownerRules.js` que afirma "todo AJUSTE\* tem justificativa" vira falso). A rota lê de `justificativa_ajuste` no payload de `PUT /concluir` (coluna já existente, nunca usada, `conferencias_almoxarifado.justificativa_ajuste`) — obrigatória (mín. 5 caracteres) sempre que `aplicar_ajustes: true`. |
| **RN-06c** | O valor absoluto que o `AJUSTE_INVENTARIO` manda ao motor é `quantidade_contada + COALESCE(material.quantidade_em_terceiros, 0)` — **nunca** `quantidade_contada` sozinho. `quantidade_sistema` mostrada ao contador já é `quantidade_atual − quantidade_em_terceiros` (decisão da Etapa 8b: quem está no galvanizador não é contável fisicamente); reconstituir o total sem somar de volta apagaria a retenção em terceiros do material — **é literalmente o item B3** que esta etapa existe para fechar, e não só B1/B2. |
| **RN-07** | Concluir com `aplicar_ajustes: true` aplica cada item divergente via `stockService.registrarMovimentacao(tipo: 'AJUSTE_INVENTARIO')` — nunca mais `UPDATE` direto. É **tudo ou nada**, em duas passadas (pré-validação sem efeito colateral, depois aplicação real — ver Task 2 do plano para o motivo de não dar para usar uma transação composta aqui): se qualquer item for recusado, **nada** é aplicado, a conferência continua `ABERTO`. **Prioridade do status de erro** quando há mais de um motivo de bloqueio na mesma resposta: se **algum** item bloquear por falta de `ajustar_material_cliente` (Etapa 8, decisão 7 — material de cliente com divergência), a resposta inteira é **403** (mensagem cita quais materiais); senão, se algum item bloquear por retenção (RN-06), **400**, listando `"<código>: <motivo>"` por item — mensagem literal exata na tabela de contratos abaixo. |
| **RN-08** | A dupla permissão existente não muda: `inventario` fecha a contagem (middleware), `ajustar_estoque` autoriza `aplicar_ajustes` (handler). Concluir **sem** `aplicar_ajustes` continua só fechando a contagem, sem tocar saldo — RN-05 vale igual (a tolerância protege o **registro**, não só o ajuste). **Isto é "dupla permissão" (quem conta ≠ quem homologa), não "dupla aprovação" no sentido do sucateamento da Etapa 9** (duas pessoas assinando, máquina de estados própria) — o checklist da spec 17 usa a palavra "aprovação" para o mesmo conceito que já existia antes desta etapa; ver D10 sobre por que a etapa não constrói o fluxo de duas assinaturas. |
| **RN-09** | `AJUSTE_INVENTARIO` é **dedicado** (`TIPOS_DEDICADOS`) — só a conclusão da conferência emite; a rota genérica de Movimentações não o aceita, do mesmo jeito que `SUCATA` desde a Etapa 9. Também entra em `CAMINHO_TIPO_DEDICADO` (`schemas.js`), apontando para a tela de Inventário — sem isso a rota genérica devolveria a mensagem genérica errada ("vá em Reservas ou Inspeções"), regressão do que a Etapa 9 (decisão 8) já corrigiu para os outros tipos dedicados. |
| **RN-10** | `AJUSTE_INVENTARIO` **não pode ser estornado** por `POST /movimentacoes/:id/cancelar` — recusa explícita (mesmo precedente de `REMESSA_TERCEIRO`), porque a semântica de "estorno" do motor (`saldo_anterior == saldo_posterior` só reverte deltas; o Ajuste é valor absoluto) não sabe desfazer um `AJUSTE_INVENTARIO` sem esconder o defeito descrito em D-decisão nova (D11). O caminho de correção é uma **nova** contagem. |

## Decisões (escolhido · descartado · porquê)

**D1 — A guarda de retenção (RN-06) vive UMA vez em `stockService.js`, como função pura
exportada (`motivoRecusaAjustePorRetencao(material, novoTotal)` → `string \| null`), chamada
tanto pelo branch de Ajuste sem localização quanto pela pré-validação de RN-07.** "Uma vez" aqui
quer dizer **uma fórmula**, não **um call-site**: a pré-validação da Task 2 PRECISA chamar a
mesma checagem antes de aplicar (é o que torna RN-07 tudo-ou-nada possível sem transação
composta) — o que D1 proíbe é uma SEGUNDA implementação da fórmula na rota, não uma segunda
chamada da mesma função. Descartado: reescrever a soma de `COLUNAS_RETENCAO` na rota —
replicaria exatamente a doença que `availabilitySql.js` já existe para matar. **A checagem só se
aplica ao branch de Ajuste SEM `localizacao_destino_id`** — no código real
(`stockService.js:726-727`) esse branch hoje NÃO distingue com/sem localização; implementar RN-06
exige acrescentar esse qualificador, senão a guarda recusa contagens por localização legítimas
(achado da Fase 2). Ajuste **com** localização fica **fora** desta guarda por ora: o novo total
ali só é conhecido depois de `syncMaterialTotals` somar todas as linhas, e calcular a retenção
contra um total ainda-não-existente é problema de outra forma — registrado como corte declarado
(D7).

**D2 — `AJUSTE_INVENTARIO` reusa a semântica de `AJUSTE` sem localização (define valor absoluto),
não cria máquina de estados nem coluna nova.** Descartado: `AJUSTE_POSITIVO`/`AJUSTE_NEGATIVO`
(delta relativo) — a conferência sempre sabe o **valor contado**, não o delta; forçar delta
obrigaria a rota a calcular a diferença e reabriria a janela de corrida entre ler e escrever que o
motor já resolve internamente ao aceitar o valor absoluto direto.

**D3 — Tudo ou nada na aplicação dos ajustes da conferência (RN-07).** Descartado: aplicar os
itens que passam e só reportar os que falham — deixaria a conferência num estado **parcialmente
homologada, parcialmente não**, sem sinalizar isso no status (`CONCLUIDO` continua sendo uma
palavra só). O precedente do próprio módulo (remessa a terceiros, Etapa 8b: "envio é tudo ou
nada") já resolveu o mesmo dilema do mesmo jeito. Custo: uma retenção presa (ex.: material
bloqueado por qualidade) trava a conclusão de **toda** a conferência, não só daquele item — mas
resolver a retenção (desbloquear, encerrar a remessa) é sempre o caminho certo antes de homologar
divergência daquele material, então a trava é a mensagem certa, não um incômodo.

**D4 — `modo_cego` é propriedade da conferência, não um perfil novo.** Descartado: criar perfil
`CONTADOR` — mexeria em `PERFIS`/`ACAO_PERFIS`/`permissoesRotas` inteiros para um caso de uso que
uma flag por conferência já resolve, reversível por conferência. **Ressalva declarada:** isso não
é blindagem perfeita — um ALMOXARIFE contando às cegas ainda pode abrir a tela de Materiais e ver
o saldo lá; a "cegueira" é da tela de conferência, não do sistema inteiro. Registrar como
limitação declarada (D8).

**D5 — `modo_cego` default `false` (preserva o comportamento atual).** Descartado: default
`true` — mudaria o que toda conferência nova mostra sem ninguém pedir. Quem quiser contagem cega
liga na criação; quem não mexer, não percebe diferença nenhuma nas conferências de hoje em diante.

**D6 — A guarda de retenção (RN-06) não tem bypass por `permite_saldo_negativo`.** A flag existe
para "aceito vender/consumir mais do que tenho fisicamente" (uma decisão comercial); um Ajuste que
deixaria retenção maior que o total é uma inconsistência **interna** dos próprios dados do
sistema (bloqueei/reservei/mandei para terceiro mais do que digo que existe), categoria diferente.
Se essa distinção se provar errada na operação real, é decisão de negócio nova — reversível.

**D7 — Fora do escopo, com corte declarado.** Tipos de contagem além de "por categoria" (por
endereço, por família, cíclica automática por criticidade/ABC, item crítico, curva ABC, surpresa,
por material de cliente/terceiros como modos distintos); dupla contagem por **duas pessoas
diferentes** (RN-04 aceita recontagem pela mesma pessoa — mais barato, e "duas pessoas" exigiria
rastrear quem contou cada rodada); congelar movimentações do escopo durante a contagem (mesmo
argumento do site único da Etapa 7 — baixo valor, alto custo, ninguém pediu); guarda de retenção
para Ajuste **com** localização (D1); relatório de acuracidade formal (feature 21); e-mail do
resultado (feature 19). Ficam para uma **Etapa 10b**, mesmo precedente de divisão de 6/6b/6c,
8/8b/8c, 9/9b — cada corte é isolado e testável por conta própria.

**D8 — Impacto financeiro do ajuste (item do checklist) entra de graça.** A resposta de
`concluir` com `aplicar_ajustes` soma `quantidade_ajustada × custo_médio` (reusando `custoSql.js`,
fonte única de leitura de custo) por item e no total — sem tela nova, sem rota nova, é o mesmo
payload que já ia responder.

**D9 — `PUT /item` passa a exigir conferência `ABERTO` (RN-03).** Hoje não checa status nenhum —
um item de conferência `CONCLUIDO` ou `CANCELADO` aceita edição, o que contradiz o próprio teste
que a spec 17 já pedia ("conferência concluída não pode ser editada"). Não é mudança de
comportamento pedida por ninguém: é o comportamento que a spec sempre presumiu e o código nunca
teve.

**D10 — Esta etapa entrega "dupla permissão" (RN-08), não constrói o fluxo de "dupla aprovação"
por duas pessoas** que o checklist da spec 17 nomeia lado a lado com "Ajuste como movimentação
específica". Descartado: replicar a máquina de estados de duas assinaturas do sucateamento
(Etapa 9) para o ajuste de inventário — é o tamanho de uma etapa própria (tela de pendências,
notificação de quem falta assinar), e o checklist da spec 17 não distingue claramente as duas
coisas sob a palavra "aprovação". Fica nomeado como pendência aberta (não descoberta silenciosa)
na letra B do fechamento, para o usuário decidir se quer o fluxo formal — reversível, constrói-se
depois sem migração de dado (a dupla PERMISSÃO que existe hoje não precisa ser desfeita).

**D11 — `AJUSTE_INVENTARIO` não é estornável pela rota genérica de cancelamento (RN-10); `AJUSTE`
comum não muda.** `cancelarMovimentacao` (`stockService.js:1601`) já tem um ramo funcional para
`mov.tipo === 'AJUSTE'` — isso **não** é tocado por esta etapa. O achado da Fase 2 é só que
`AJUSTE_INVENTARIO`, por ser tipo NOVO, cai fora desse `if`-chain inteiro (nem o ramo de `AJUSTE`
nem nenhum outro) e por isso seria cancelável em silêncio, sem reverter nada — a mesma classe de
"assimetria silenciosa" que os comentários do próprio `cancelarMovimentacao` já documentam como
defeito caro de achar. Descartado: dar a `AJUSTE_INVENTARIO` o mesmo ramo de `AJUSTE` — reverter
um valor absoluto para `saldo_anterior` é semanticamente válido para `AJUSTE`, mas um
`AJUSTE_INVENTARIO` representa uma contagem física **homologada**; desfazê-lo por engano sem
reabrir a conferência original apagaria o rastro de que uma contagem aconteceu. `AJUSTE_INVENTARIO`
recebe uma recusa explícita (mesmo precedente de `REMESSA_TERCEIRO`), e o caminho de correção é
uma contagem nova.

## Contratos de API (congelados)

Erros seguem o padrão do módulo: `{ error: "<mensagem>" }`, 400 para regra recusada, 403 para
perfil sem a ação, 404 para id inexistente.

**Mensagem única de retenção, usada nos dois níveis (RN-06):** a função pura em `stockService.js`
lança, para UM material, exatamente:
`"Ajuste para <novoTotal> <unidade> deixaria o disponível negativo (<lista 'label: valor'>, mínimo aceitável: <retido> <unidade>). Resolva a retenção antes de ajustar para menos, ou ajuste para um valor maior ou igual ao mínimo."`
— com `label` em `{reservada, bloqueada, em inspeção, em terceiros}`, só as que forem `> 0`. A
rota da conferência (Task 2), ao pré-validar vários itens, **reusa essa mesma string** por item,
prefixada pelo código do material — nunca reescreve a frase.

| Método e caminho | Gate | Payload (mudança) | Sucesso | Recusas novas (mensagem literal) |
|---|---|---|---|---|
| `POST /api/almoxarifado/conferencias` | inventario | ganha `modo_cego?` (bool), `tolerancia_percentual?` (number) | 201 `{id, numero, status, modo_cego, tolerancia_percentual, totalItens}` (os dois campos novos SEMPRE ecoados, mesmo quando vieram do default) | — |
| `GET /api/almoxarifado/conferencias/:id` | auth | — | 200; itens **sem** `quantidade_sistema`/`divergencia` quando `modo_cego && status==='ABERTO' && !can(user,'ajustar_estoque')`; todo item sempre traz `recontagem_necessaria` (bool, calculada no servidor) | — |
| `PUT /api/almoxarifado/conferencias/:id/item/:itemId` | inventario | igual | 200 `{success, divergencia, recontagem: bool}` | **400** `"Conferência não está aberta (status atual: <status>)"` |
| `PUT /api/almoxarifado/conferencias/:id/concluir` | inventario (+ ajustar_estoque se `aplicar_ajustes`; `justificativa_ajuste` obrigatória se `aplicar_ajustes`) | ganha `justificativa_ajuste?` (string, obrigatória com `aplicar_ajustes: true`, mín. 5 caracteres) | 200 `{success, ajustesAplicados, impactoFinanceiro}` | **400** `"Justificativa deve ter pelo menos 5 caracteres"` (falta `justificativa_ajuste` com `aplicar_ajustes: true`) · **400** `"Recontagem necessária antes de concluir: <lista 'código - divergência% (limite X%)'>"` (cada item: `"<código> - <divergência com 2 casas decimais>% (limite <tolerância inteira>%)"`, itens separados por `"; "` — SEM a palavra "divergência" antes do número, é só o valor; ex.: `"MAT-1 - 10.00% (limite 2%)"`) · **400** `"Ajuste bloqueado: <lista '<código>: <mensagem de retenção acima>'>"` (nenhum item da lista falhou por permissão) · **403** `"Ajuste bloqueado — os seguintes materiais são de cliente e exigem a permissão \"ajustar_material_cliente\": <lista 'código (dono)'>"` (prioridade sobre o 400 de retenção quando os dois motivos coexistem na mesma conclusão — RN-07). **`impactoFinanceiro`** é a soma dos **valores absolutos** (`|divergência| × custo`) de cada item ajustado — não o líquido; um ajuste de +10 e outro de −10 no mesmo lote somam 20, não 0 (é "quanto dinheiro este inventário moveu", não "quanto sobrou/faltou no total"). |

## O que muda para quem opera (resumo para o manual)

Inventário ganha modo "não mostrar quanto o sistema diz que tem" (por conferência), exige
recontar item muito divergente antes de fechar, e o ajuste final agora é uma movimentação de
verdade no livro — auditada, recusada se deixar material bloqueado/reservado/em terceiro/de
cliente com número que não fecha.
