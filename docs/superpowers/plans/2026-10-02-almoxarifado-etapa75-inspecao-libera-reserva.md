# Etapa 75 — o material que a inspeção libera fica com quem esperava (C126, feature 07 com a 09 e a 19)

> Status: **TRONCO ENTREGUE (T0–T3) — 2026-10-02.** Fases 0, 1 e 2 feitas; T0 `1b2a6959`, T1 `f149977b`, T2
> `c4d9212c`, T3 `c8c089cb`. Falta: T4 (integração), Fase 5 (revisão adversarial), T5 (fechamento). Ver
> "Tronco executado (T0–T3)" no fim.
> Origem: "Próxima tarefa detalhada — Etapa 75" de
> `docs/superpowers/plans/2026-10-02-almoxarifado-etapa74-reserva-na-chegada.md:697-736` e o aviso **C126** de
> `docs/almoxarifado-novidades-por-etapa.md:6652`.

**Escopo desta etapa:**
1. **C126** — quando a **inspeção aprova** (toda ou parte) o material que entrou retido, o que ela aprovou é reservado
   para as requisições que **já esperavam** aquele material, na ordem da fila de separação — a mesma régua da Etapa 74.
   Quem é aprovado depois só leva o que sobrou.
2. **A mesma coisa pela outra porta:** quando a **não conformidade** da inspeção é decidida `ACEITAR` ou
   `ACEITAR_SOB_DESVIO` e o reprovado volta ao disponível (Etapa 44), o liberado é reservado para quem esperava.
3. **O solicitante é avisado** de que o material saiu da inspeção, e de quanto ficou reservado para ele (o e-mail da 70
   com a frase da 74), uma vez por liberação.
4. **A retomada de uma nota já inspecionada não reconta o item inspecionado como livre** (Surpresa 2 — o gancho da 74
   reservaria de saldo alheio).

**Fora (declarado, ver "O que fica de fora"):** o desbloqueio **avulso** (`POST /materiais/:id/desbloquear`) e o
estorno de um `BLOQUEIO` avulso — devolvem ao disponível, mas não têm "quem esperava" ligado a eles; entradas que não são
nota; tela nova; chave nova nas respostas.

**Toque no cliente:** **nenhum** (D5, D7 — o aviso reaproveita o evento que a tela de Notificações já filtra).
**Toque em Compras:** nenhum.

## Fase 0 — medido (2026-10-02)

Sonda executada: `sonda75-c126.js` (scratchpad da sessão), pelas rotas reais com o harness `testApp.js`
(`requirePermission` real; solicitante, aprovador e inspetor distintos; tabela `usuarios` criada para o e-mail sair;
`inspecao_material_critico = '1'`, material com `material_critico = 1`). Réguas de ausência testadas contra caso que
existe: `grep -rn "avisarEntradaConfirmada"` acha o chamador (`receiptService.js:69`) e nenhum em `inspectionService` /
`nonConformityService`; `grep -rn "reservaChegadaService"` acha `receiptService` e o lazy do `stockService` — nenhum na
inspeção nem na NC.

### 1. A C126 reproduzida (sonda, blocos A e B)

```
A1 R1 (4) aprovada antes da nota          "AGUARDANDO_ESTOQUE reservas=[]"
A2 nota de 4 retida                       saldo q=4 r=0 i=4 b=0, nenhuma reserva, R1 AGUARDANDO_ESTOQUE   (a 74 pula o retido — B370)
A2 R2 aprovada com o material retido      "AGUARDANDO_ESTOQUE reservas=[]"
A3 POST /recebimentos/itens/:id/inspecionar aprova 4    201; saldo q=4 r=0 i=0 b=0; NENHUMA reserva; R1/R2 AGUARDANDO_ESTOQUE
A3 fila                                   R1 #0, R2 #1, as duas AGUARDANDO_ESTOQUE
A3 fila_notificacoes depois da inspeção   []   <- ninguém é avisado
A4 R3 aprovada DEPOIS da inspeção         "TOTALMENTE_RESERVADA reservas=[4]"  (recebimento_id NULL, dono = aprovador)
A5 separar 4 de R1 (quem esperava)        400 "Sonda S75-A: não é possível separar 4 PC. Máximo: 0 (pendente: 4, disponível: 0)"
A6 decidir de novo o mesmo item           400 "Item não possui quantidade em inspeção retida"   (o claim é a idempotência)

B1 T1 (4) esperando; nota de 4 retida
B2 inspeção 3 aprovados / 1 reprovado     201; q=4 i=0 b=1; nenhuma reserva; NC aberta automaticamente (origem INSPECAO, recebimento_id da nota)
B3 T3 (3) aprovada depois da inspeção     "TOTALMENTE_RESERVADA reservas=[3]"   <- leva os 3 aprovados
B4 POST /nao-conformidades/:id/decidir ACEITAR_SOB_DESVIO   200, liberacao {efeito LIBERADA, quantidade 1, material_id}; b=0; T1 continua sem nada; nenhum aviso
B5 T4 (1) aprovada depois da NC           "TOTALMENTE_RESERVADA reservas=[1]"   <- leva o liberado pela NC
B6 decidir a NC de novo                   409 "Esta não conformidade já foi encerrada"
B6 livro                                  DECISAO_INSPECAO q=4 recebimento_id=nota; DESBLOQUEIO motivo "Liberação por não conformidade", documento_vinculado NC-…, recebimento_id=nota
```

### 2. As portas que tiram material da retenção para o disponível (régua: escritores de `quantidade_em_inspecao` e de `quantidade_bloqueada` para menos)

| Porta | Onde | O que sabe | Idempotência | Vale para a etapa? |
|---|---|---|---|---|
| **Decisão da inspeção** (`POST /recebimentos/itens/:itemId/inspecionar`, gate `inspecionar`, 201) | `inspectionService.decidirInspecao` `:182`; claim do item `:254-259`; `DECISAO_INSPECAO` no motor `:273-280` (`stockService.js:1448-1475`, baixa o retido inteiro e soma o reprovado em `quantidade_bloqueada` num UPDATE só); INSERT da inspeção `:292`; gancho da NC `:348-362`; `return` `:368` | `item.recebimento_id`, `item.material_id`, `aprovada` (a parte que virou disponível), `ins.lastID`, `user` | claim do item (`quantidade_em_inspecao >= retido`) — a segunda decisão toma 400 antes de qualquer efeito (A6) | **sim** — a porta principal da C126 |
| **Liberação pela NC** (`POST /nao-conformidades/:id/decidir` com `ACEITAR`/`ACEITAR_SOB_DESVIO`, gate `decidir_nao_conformidade`, 200) | `nonConformityService.decidirNaoConformidade` `:887`; claim da NC (`status='ABERTA'`) `:920-927`; `executarLiberacao` `:970` (claim de `liberacao_nc_em` + os 3 carimbos, `DESBLOQUEIO` com `MOTIVO_LIBERACAO` `:996-1004`); auditoria não fatal `:944-957`; `obterNaoConformidade` `:959` | `atual.numero`, `atual.recebimento_id`, `liberacao.{efeito, quantidade, material_id}`, `insp.recebimento_id` | claim da NC (409) **e** claim da inspeção (`JA_LIBERADA`) — só `efeito === 'LIBERADA'` moveu saldo | **sim** |
| Desbloqueio avulso (`POST /materiais/:id/desbloquear`, gate `ajustar_estoque`) | `inspectionService.desbloquearMaterial` `:414` → `DESBLOQUEIO` motivo `Desbloqueio avulso` | só material e quantidade; nenhum documento, nenhuma nota | nenhuma (é um ajuste) | **não** — D1. Medido (C3): drena também o reprovado de uma NC aberta; a NC depois responde `SEM_BLOQUEIO` *"O material já havia sido desbloqueado fora do documento…"* (Etapa 44, conhecido) |
| Estorno de `BLOQUEIO` avulso (`POST /movimentacoes/:id/cancelar`) | `stockService.js:2697-2710` | idem | — | **não** — D1 |
| `LIBERACAO_INSPECAO`/`REPROVACAO_INSPECAO` | ramos do motor `stockService.js:1429-1445` | — | — | sem chamador vivo (a rota genérica os recusa, `schemas.js:25-60`; o `decidirInspecao` usa `DECISAO_INSPECAO`) |
| Devolução / sucata do reprovado (Etapas 45/69) | `stockService.js:1700-1735` | — | — | não liberam: tiram do físico |

### 3. Reaproveitar a 74: o miolo serve, a entrada não (sonda, bloco D)

`reservaChegadaService.reservarChegadaParaQuemEspera(db, user, recebimentoId)` (`reservaChegadaService.js:139-249`)
calcula o **livre da nota** pelos itens com `quantidade_em_inspecao <= 1e-9` (`:147-153`). **Depois da inspeção o item
tem `quantidade_em_inspecao = 0`**, então chamar a função de novo conta o item **inteiro** como livre — inclusive o
reprovado — e o teto `min(livre, disponível)` completa com saldo de ajuste:

```
D2 nota mista: crítico 4 retido + comum 2 livre      comum reservado 2 a V2 (recebimento_id da nota) — a 74 ok
D3 ENTRADA manual de 5 do crítico                    q=9 i=4
D4 inspeção 1 aprovado / 3 reprovados                q=9 i=0 b=3   (disponível 6)
D5 reservarChegadaParaQuemEspera(recD) de novo       reservou 4 a V1 (TOTALMENTE_RESERVADA) — a inspeção aprovou 1; 3 vieram da entrada manual
D5 o comum                                           não reservou de novo (a régua idempotente da 74 segura)
```

O miolo (`:156-237`: candidatos por `PODE_SEPARAR`, regra do dono, valor ao vivo, falta relida, `criarReserva`
`sistema: true`, releitura da requisição, excesso desfeito, recálculo pela máquina no `finally`) é exatamente o que a
inspeção precisa — com **outro teto** (o que esta decisão liberou) e **outro texto** na observação. Decisão D2: extrair o
laço por material para uma função interna com teto injetado, chamada pelas duas entradas.

**Mesma conta, outro lugar — a retomada da nota (Surpresa 2):** se uma nota for retomada (molde da 70/74, RN-08) depois
de o item retido ter sido inspecionado, o gancho da 74 reconta o item como livre. Hoje é latente (a retomada só existe
após falha parcial do processamento); com a reserva da inspeção passa a dobrar a distribuição do mesmo material. D8.

### 4. O e-mail

- A inspeção **não avisa** ninguém (A3, B2, B4: zero linhas novas em `fila_notificacoes_almoxarifado`). O único aviso
  pós-inspeção é o `MATERIAL_REPROVADO` (`inspectionService.js:336-346`), à lista de alertas.
- O aviso da 70 da **nota** (`receiptNotificationService.avisarEntradaConfirmada`, `:198-360`) pula o retido (`:222-226`,
  D5 da 70): numa nota só com material crítico, **ninguém** recebe e-mail na chegada (`livrePorMaterial` vazio →
  `avisaveis` vazio). O dedupe da 70 é `recebimento-entrada-<rec>-req-<req>` (`:338`) — reusar a chave faria a segunda
  liberação da mesma nota (dois itens, ou inspeção + NC) ser engolida pelo `INSERT OR IGNORE`
  (`notificationQueueService.js:57-75`). Chave nova por documento (D7).
- O evento `RECEBIMENTO_ENTRADA_REQUISITANTE` já está no filtro da tela (`NotificacoesAlmoxarifado.js:45`, *"Aviso ao
  requisitante"*). Evento novo = uma linha no cliente; reusar = zero (D7).
- Testes que contam a fila e passam por inspeção/NC (medir na T1/T3, podem ganhar linhas): `alertaEventoGanchos`,
  `alertaEventoJornada`, `alertaExecucaoPendente`, `alertaNaoConformidade` (`grep -ln inspecionar | xargs grep -ln
  fila_notificacoes`).

### 5. Perfil e dono

`inspecionar` = ADMINISTRADOR, ALMOXARIFE, QUALIDADE (`permissions.js:102`); `reservar` **não** tem QUALIDADE (`:103`).
`criarReserva` com `opcoes.sistema === true` dispensa o perfil (`stockService.js:2929-2930`) — o mesmo caminho da 74.
O dono da reserva é o `user` da chamada (B361/B372): na inspeção, o inspetor; na NC, quem decidiu (D5 da sonda: a
chamada direta gravou `solicitante_nome = "Inspetor s75"`).

### 6. O estorno da entrada depois da inspeção (sonda, bloco E)

```
E1 nota de 3 retida → inspeção aprova 3 → POST /movimentacoes/:id/cancelar   200, saldo 0
```
A guarda da 71 (`stockService.js:2329-2370`) só recusa **enquanto** há retido ou se houve **reprovado**. Inspeção
aprovada inteira → o estorno passa pelo caminho normal, e o `liberarParaEstorno` da 74 (`reservaChegadaService.js:270`)
só solta reservas com `recebimento_id = mov.recebimento_id`. Sem a marca, a reserva da inspeção faria o estorno recusar
com a literal da B382 (*"…reservado para requisições (<REQ>)…"*) até alguém liberar à mão. Com a marca, vale a B374
(D4). Com reprovado, o estorno é sempre recusado — a marca na reserva da NC é inofensiva.

### 7. Corridas

- **Decisão × `/aprovar` (ou automática) do mesmo material:** como na 74 (Fase 0 §8): `criarReserva` atômico; a falta
  relida antes de cada reserva e o excesso desfeito depois. A ordem pode inverter numa corrida de milissegundos —
  declarado.
- **Duas decisões de itens diferentes do mesmo material** (ou inspeção × NC × nota): cada uma com o próprio teto; a
  releitura da falta e o desfazer o excesso já existem no miolo.
- **A mesma decisão duas vezes:** impossível chegar ao gancho duas vezes — o claim do item (400) e o da NC (409) vêm
  antes. O gancho roda **fora** de qualquer marca de processamento (a inspeção não tem uma) — não precisa: o claim é o
  serializador.

### Surpresas da medição

1. **A liberação pela NC também solta o material sem reservar nem avisar** (B4/B5) — a C126 tem duas portas, não uma.
2. **Chamar a função da 74 de novo depois da inspeção reserva o reprovado com saldo alheio** (D5: aprovou 1, reservou 4).
   Prova que a variante por teto é necessária e que a retomada da nota tem o mesmo furo, latente (D8).
3. **O desbloqueio avulso drena o reprovado de uma NC aberta** (C3/C4) — conhecido da Etapa 44 (efeito `SEM_BLOQUEIO`
   com literal própria). Não é porta desta etapa (D1); registrar no fechamento se nenhum C o nomeia ainda.
4. **Numa nota só de material crítico ninguém recebe o e-mail da 70** — nem na chegada (o retido não avisa), nem na
   inspeção (não há aviso). Para o solicitante, o material crítico chega em silêncio hoje.

## Decisões reversíveis (letra B do documento de novidades; última usada: B382)

- **D1 (B383) — duas portas: a decisão da inspeção (a parte aprovada) e a liberação pela NC (`efeito === 'LIBERADA'`).**
  Descartados: (a) o desbloqueio avulso — é ajuste de prateleira, sem nota nem documento; reservar ali faria um
  desbloqueio administrativo distribuir material sem ninguém pedir; (b) o estorno de `BLOQUEIO` avulso, pelo mesmo
  motivo; (c) pendurar no motor (`DECISAO_INSPECAO`/`DESBLOQUEIO` em `stockService.registrarMovimentacao`) — o motor não
  sabe de requisição, e o `DESBLOQUEIO` avulso pegaria carona.
- **D2 (B384) — um miolo só, teto injetado.** O laço por material de `reservarChegadaParaQuemEspera` vira uma função
  interna `distribuirParaQuemEspera(db, user, materialId, teto, rotulos, acc)`; a chegada (74) e a liberação (75) a
  chamam. Descartados: (a) chamar a função da 74 de novo com o `recebimento_id` (Surpresa 2: reserva o reprovado com
  saldo alheio); (b) copiar o laço (duas réguas de "quem esperava" — a lição da D2 da 74).
- **D3 (B385) — o teto é o que ESTA decisão liberou, e o disponível na hora:** `min(quantidade_aprovada | liberacao.quantidade,
  disponível do material agora)`. Descartado: o disponível global (distribuiria saldo de ajuste — o mesmo descarte da
  D4 da 74).
- **D4 (B386) — a reserva da liberação é marcada com a nota (`recebimento_id`), como a da chegada.** O estorno da entrada
  depois da inspeção aprovada passa a soltá-la pela B374 (só o necessário, só de quem não separou) e recalcula o status.
  Descartados: (a) sem marca (o estorno pós-inspeção recusaria com a literal da B382 até alguém liberar à mão — e liberar
  à mão deixa o status mentindo, C127); (b) coluna nova `inspecao_id`/`nao_conformidade_id` na reserva (a observação
  já diz o documento; nenhuma regra precisa distinguir). **Consequência declarada:** na retomada do aviso da 70 de uma
  nota (raríssima), a reserva da inspeção conta como "reservado nesta nota".
- **D5 (B387) — gancho no fim de cada porta, best-effort, respostas inalteradas.** Inspeção: depois do gancho da NC (`:362`), antes do `return`, só se `aprovada > 1e-9`. NC: depois da auditoria (`:957`), antes do `obterNaoConformidade`,
  só se `liberacao.efeito === 'LIBERADA'`. Falha vira `console.warn` com literal; a decisão já está gravada e o saldo já
  mudou. Descartados: (a) chave nova na resposta (`reservas_para_quem_esperava`) — exigiria tela para valer algo, e o
  toast hoje lê só as chaves da 43; (b) fatal (a decisão da Qualidade nunca deixa de valer por causa de reserva — o
  mesmo da D1 da 74 e da RN-02 da 44 ao contrário: lá a liberação é fatal porque É a decisão; aqui a reserva é efeito).
- **D6 (B388) — o dono da reserva é quem decidiu** (inspetor, ou quem decidiu a NC), com `sistema: true` (QUALIDADE não
  tem `reservar`). Descartado: dono = o solicitante (a trilha gravaria um usuário que não agiu — o mesmo da D6 da 74).
- **D7 (B389) — o solicitante é avisado pelo mesmo evento da 70, com dedupe por documento.** Evento
  `RECEBIMENTO_ENTRADA_REQUISITANTE`, governado pela mesma chave `notificar_recebimento_solicitante`; dedupe
  `inspecao-liberada-<inspecao_id>-req-<requisicao_id>` e `nc-liberada-<nc_id>-req-<requisicao_id>`; assunto e primeira
  linha próprios; as frases L0/L1 da 74. Recebe quem ganhou reserva nesta liberação **ou** tem disponível livre do
  material para separar (a régua da 74 com as linhas filtradas). Descartados: (a) evento novo (toca o filtro do cliente);
  (b) reusar o dedupe da 70 (`recebimento-entrada-<rec>-req-<req>` engoliria a segunda liberação da mesma nota); (c) não
  avisar (Surpresa 4: o material crítico chega em silêncio); (d) avisar todos os que esperavam (prometeria material
  reservado a outra requisição — o defeito A2 da 74).
- **D8 (B390) — a chegada (74) deixa de contar como livre o item que já tem inspeção registrada.** No cálculo do livre de
  `reservarChegadaParaQuemEspera`: item com `quantidade_em_inspecao > 1e-9` **ou** com linha em
  `inspecoes_recebimento_almoxarifado` fica de fora — o que a inspeção liberou é distribuído pela porta da inspeção.
  Descartado: deixar (Surpresa 2 — a retomada reservaria o reprovado com saldo alheio). O aviso da 70 **não** muda (seu
  cabeçalho já declara "retido reflete o estado ATUAL do item").
- **D9 (B391) — sem correção do passado.** Inspeções e NCs decididas antes do deploy não reservam; itens ainda na fila de
  inspeção no deploy reservam quando forem decididos. Descartado: reservar no boot (a B377 pelo mesmo motivo).
- **D10 (B392) — material de cliente, valor ao vivo, `EM_SEPARACAO`, recálculo pela máquina: herdados do miolo**, sem
  regra nova (B375 revista, B378–B380). Descartado: regra própria da inspeção (duas réguas).

## Regras de negócio

- **RN-01 (quem esperava fica com o que a inspeção aprovou)** — material crítico retido; R1 (4) aprovada antes da nota →
  `AGUARDANDO_*`; nota de 4 → nenhuma reserva, `quantidade_em_inspecao` 4; R2 (4) aprovada com o material retido →
  `AGUARDANDO_*`; `POST /recebimentos/itens/:id/inspecionar` aprova 4 → **201, resposta com as mesmas chaves de hoje**;
  **uma reserva ATIVA de 4 para o item de R1**, `recebimento_id` da nota, `origem = 'REQUISICAO'`, observação
  `Reserva na liberação da inspeção — recebimento <REC> — requisição <REQ>`; R1 `TOTALMENTE_RESERVADA`; R2
  `AGUARDANDO_*` sem reserva. *Metade positiva:* R3 (4) aprovada **depois** → `AGUARDANDO_*`, `reservas: []`; `PUT
  /separar` de 4 em R1 → 200; em R3 → 400 *"… Máximo: 0 …"*.
- **RN-02 (a ordem é a da fila)** — R1 NORMAL (criada antes, 6) e R2 URGENTE (depois, 3) esperando; inspeção aprova 4 →
  R2 3 (`TOTALMENTE_RESERVADA`), R1 1 (`PARCIALMENTE_RESERVADA`). *Positiva da régua única:* a ordem de `GET
  /fila-separacao` antes da decisão é a ordem das reservas.
- **RN-03 (só o aprovado, nunca o reprovado nem saldo alheio)** — inspeção 3 aprovados / 1 reprovado, R espera 4 → reserva
  **3**; `quantidade_bloqueada` 1; nenhuma reserva acima de 3. Com entrada manual de 5 do mesmo material antes da
  decisão e inspeção 1/3 → reserva **1** (não 4, não 6). Reprovação total (0/4) → nenhuma reserva, NC aberta como hoje.
- **RN-04 (a NC que aceita também reserva)** — após RN-03 (3/1), T3 aprovada depois **não** levou o 1 bloqueado; `POST
  /nao-conformidades/:id/decidir` `ACEITAR_SOB_DESVIO` → 200, `liberacao.efeito = 'LIBERADA'` (resposta inalterada);
  **reserva de 1** para R (agora `TOTALMENTE_RESERVADA`), observação `Reserva na liberação da não conformidade <NC> —
  requisição <REQ>`, `recebimento_id` da nota. O mesmo com `ACEITAR`. *Negativas:* `DEVOLVER`, `SUCATEAR`,
  `SUBSTITUICAO`, `ANALISE_ENGENHARIA` → nenhuma reserva; NC aceita depois de desbloqueio avulso (`SEM_BLOQUEIO`) →
  nenhuma reserva.
- **RN-05 (o status acompanha — herdado)** — `AGUARDANDO_COMPRA` com tudo coberto → `TOTALMENTE_RESERVADA`;
  `PARCIALMENTE_ATENDIDA` ganha e mantém; `EM_SEPARACAO` ganha a reserva e mantém o status; `CANCELADO`/`ativo = 0` não
  ganham.
- **RN-06 (best-effort)** — `stockService.criarReserva` forçado a lançar (monkeypatch pelo objeto): inspeção → 201, a
  decisão gravada, saldo movido, nenhuma reserva órfã, `console.warn` com a literal do contrato; NC → 200 `DECIDIDA`,
  `LIBERADA`, idem. E o aviso forçado a lançar não derruba nada.
- **RN-07 (uma vez por decisão)** — decidir o mesmo item de novo → 400 *"Item não possui quantidade em inspeção retida"*
  e nenhuma reserva nova; decidir a NC de novo → 409 *"Esta não conformidade já foi encerrada"* e nenhuma reserva nova.
  *Pelo serviço:* `reservarChegadaParaQuemEspera(recebimento)` chamado depois da inspeção (a retomada) **não** reserva o
  item inspecionado (D8) e continua reservando o item comum livre da mesma nota que ainda falte.
- **RN-08 (a Qualidade reserva sem ter `reservar`)** — usuário com perfil QUALIDADE (gate real) decide a inspeção → 201 e a
  reserva existe, dono = o inspetor. Usuário sem `inspecionar` → 403 de hoje, nada reservado.
- **RN-09 (o e-mail diz a verdade)** — com `usuarios`: R1 ganhou 4 de 4 → assunto `[Almoxarifado] Material liberado para
  a sua requisição <REQ>`, primeira linha da inspeção, linha *"liberado 4 PC (pendente na requisição: 4 PC; reservado
  para a sua requisição: 4 PC)"*, frase **L1**; reserva forçada a falhar e disponível > 0 → frase **L0**; R4 esperava e
  tudo foi para outras → **nenhum** e-mail para R4; NC aceita → primeira linha com o número da NC. *Dedupe:* dois itens
  do mesmo material na mesma nota decididos em sequência → dois e-mails para a mesma requisição (chaves diferentes); a
  mesma liberação nunca duas vezes. `notificar_recebimento_solicitante = '0'` → nada.
- **RN-10 (o estorno da entrada solta a reserva da inspeção)** — nota de 4 retida, inspeção aprova 4 → reservada a R1;
  `POST /movimentacoes/:id/cancelar` da `ENTRADA_COMPRA` → 200; a reserva `LIBERADA` com o motivo da B374; R1 volta a
  `AGUARDANDO_*`. *Negativa:* com reprovado, a recusa da 71 de hoje (literal lida do código), nada liberado.
- **RN-11 (o desbloqueio avulso não reserva — declarado)** — reprovado 2, R espera; `POST /materiais/:id/desbloquear` 2
  → 200, **nenhuma** reserva, R continua `AGUARDANDO_*`. (O teste existe para a mudança futura ser vista, não escondida.)
- **RN-12 (corrida decisão × aprovação)** — `Promise.all([inspecionar aprovando 4, /aprovar de R3 (4)])`, R1 (4)
  esperando, 6 rodadas com material novo: soma das reservas ATIVAS ≤ 4; nenhuma `*_RESERVADA` sem hold; o status
  respondido pelo `/aprovar` é o gravado.

## Contrato (congelado)

### Serviço — `services/almoxarifado/reservaChegadaService.js`

**T0 (refatoração sem mudar comportamento + D8):**
```
distribuirParaQuemEspera(db, user, materialId, teto, rotulos, acc)   // interna, não exportada
  rotulos = { observacao: (c) => string, motivo: string, recebimento_id: number|null }
  acc     = { tocadas: Set<number>, resultado: { reservas: [], status: [] } }
```
É o corpo atual do `for (const [materialId, livre] of livrePorMaterial)` (`:157-236`) com `livre` → `teto`.
`reservarChegadaParaQuemEspera` passa a chamá-la com `observacao: (c) => 'Reserva na chegada do recebimento <REC> —
requisição <REQ>'` e `motivo: 'Reserva na chegada — recebimento <REC>'` (literais da 74, **inalteradas**). O `finally`
do recálculo continua na função pública. **D8:** a consulta dos itens da nota ganha
`AND NOT EXISTS (SELECT 1 FROM inspecoes_recebimento_almoxarifado i WHERE i.recebimento_item_id = ri.id)` no cálculo do
livre (o filtro de `em_inspecao` continua).

**T1 (a liberação):**
```
reservarLiberacaoParaQuemEspera(db, user, { origem, documento_id, documento_numero, material_id, quantidade, recebimento_id })
  origem ∈ 'INSPECAO' | 'NAO_CONFORMIDADE'
  -> { reservas: [{ requisicao_id, item_id, material_id, reserva_id, quantidade }], status: [{ requisicao_id, de, para }] }
```
1. `quantidade <= 1e-9` ou material inexistente → vazio. `rec = SELECT numero FROM recebimentos… WHERE id = recebimento_id`
   (pode faltar → usa o id).
2. `teto = min(quantidade, disponível do material agora)` (D3).
3. `distribuirParaQuemEspera` com:
   - INSPECAO: observação `Reserva na liberação da inspeção — recebimento <REC> — requisição <REQ>`, motivo
     `Reserva na liberação da inspeção — recebimento <REC>`;
   - NAO_CONFORMIDADE: observação `Reserva na liberação da não conformidade <NC> — requisição <REQ>`, motivo
     `Reserva na liberação da não conformidade <NC>`;
   - `recebimento_id` gravado na reserva (D4).
4. Recálculo no `finally` (o mesmo da chegada). Erro de banco fora do try por item **lança**.

```
aposLiberacaoSemFalhar(db, user, ctx) -> void       // exportada; NUNCA lança
```
`try { r = await module.exports.reservarLiberacaoParaQuemEspera(db, user, ctx) } catch (e) { console.warn('[almoxarifado-reservas]
reserva na liberacao falhou (<origem> <documento_id>): <msg>'); r = { reservas: [], status: [] } }` — e (T3) depois:
`try { await receiptNotificationService.avisarLiberacao(db, user, ctx, r) } catch (e) { console.warn('[almoxarifado-reservas]
aviso da liberacao falhou (<origem> <documento_id>): <msg>') }`. Chamada pelo objeto do módulo (monkeypatch dos testes).

### Ganchos

- **`inspectionService.decidirInspecao` (T1):** depois do bloco do `abrirNaoConformidadeDeInspecao` (`:348-362`), antes do
  `return`: `if (aprovada > 1e-9) { try { const rcs = require('./reservaChegadaService'); await
  rcs.aposLiberacaoSemFalhar(db, user, { origem: 'INSPECAO', documento_id: ins.lastID, documento_numero: null,
  material_id: item.material_id, quantidade: aprovada, recebimento_id: item.recebimento_id }); } catch (e) {
  console.warn('[almoxarifado-reservas] reserva na liberacao falhou (INSPECAO ' + ins.lastID + '): ' + e.message); } }`
  (`require` lazy: sem ciclo na carga — medir carga fria nas duas ordens). Resposta **inalterada**.
- **`nonConformityService.decidirNaoConformidade` (T2):** depois do `try` da auditoria (`:944-957`), antes do
  `obterNaoConformidade`: `if (liberacao.efeito === 'LIBERADA')` → o mesmo, com `origem: 'NAO_CONFORMIDADE',
  documento_id: id, documento_numero: atual.numero, material_id: liberacao.material_id, quantidade: liberacao.quantidade,
  recebimento_id: atual.recebimento_id || insp?.recebimento_id || null`. Resposta **inalterada**.

### Aviso (T3) — `receiptNotificationService.js`

```
avisarLiberacao(db, user, ctx, resultadoReserva) -> { requisitantes: [{ requisicao_id, ...fila }] } | { desligado: true }
montarAvisoLiberacao(dados) -> { assunto, corpo_texto, linhas }       // pura, exportada
```
- Desligado se `notificar_recebimento_solicitante` ≠ `'1'` (padrão `'1'`).
- Quem: requisições ativas em `STATUS_QUE_ESPERAM` (a lista da 70) com item do `material_id`; `reservado` = soma de
  `resultadoReserva.reservas` do item; `pendente = MAX(0, solicitada − separada) − (hold ATIVO REQUISICAO do item −
  reservado)`; entra se `pendente > 1e-9` **e** (`reservado > 1e-9` **ou** disponível do material > 1e-9).
- `montarAvisoLiberacao`:
  - assunto: `[Almoxarifado] Material liberado para a sua requisição <REQ>`
  - 1ª linha INSPECAO: `O material que a sua requisição aguardava foi aprovado na inspeção e está no estoque.`
  - 1ª linha NAO_CONFORMIDADE: `O material que a sua requisição aguardava foi liberado pela não conformidade <NC> e está no estoque.`
  - `Requisição: <REQ>` · `Situação da requisição: <SITUACAO_REQUISICAO[status]>` (status relido depois da reserva) ·
    `Recebimento: <REC>` · `Material liberado:` ·
    `- <cod> — <nome>: liberado <q un> (pendente na requisição: <p un>)` ou, com reserva,
    `- <cod> — <nome>: liberado <q un> (pendente na requisição: <p un>; reservado para a sua requisição: <r un>)`
  - frase final: `FRASE_TUDO_RESERVADO` (L1) se `reservado > 0`, senão `FRASE_SEM_RESERVA` (L0) — constantes da 74, sem cópia.
  - `Link: <app><caminhoRequisicoesDoModulo(modulo_origem)>`
- Fila: `evento: 'RECEBIMENTO_ENTRADA_REQUISITANTE'`, `dedupe_chave: 'inspecao-liberada-<documento_id>-req-<rid>'` ou
  `'nc-liberada-<documento_id>-req-<rid>'`, destinatário = `usuarios.email` do solicitante (vazio se não houver),
  `payload: { recebimento_id, requisicao_id, numero_requisicao, origem, documento_id }`.
- `avisarEntradaConfirmada`, `montarAvisoRequisitante`, `montarAvisoNota`, as três frases e o dedupe da 70:
  **inalterados**.

### O que não muda (contratos que não se reabrem)

A reserva na chegada da 74 (literais, ordem `compararPrioridade`, recálculo pela máquina, estorno B374/B381/B382) — só o
livre ganha o filtro da D8; a decisão da inspeção (claims de dois níveis, guarda de fechamento, medidas, resposta 201 e
chaves); a decisão da NC (claim da NC, claim dos três carimbos, `DESBLOQUEIO` fatal, resposta); devolução/sucateamento
(45/69); o e-mail da 70 (assunto, dedupe, frases); o cliente inteiro.

## Tasks

Ordem topológica: **T0 → T1 → (T2 ∥ T3) → T4 → T5**. T0 e T1 são tronco (mudam o serviço compartilhado). T2 e T3 são
galhos depois de T1: só **consomem** `aposLiberacaoSemFalhar`/`reservarLiberacaoParaQuemEspera` já testados.

**Regras de paralelismo (G84 da 72, mantida na 73 e na 74):**
- **Dois agentes nunca no mesmo arquivo.** T0: `reservaChegadaService.js` + teste novo. T1: `reservaChegadaService.js`,
  `inspectionService.js` + teste novo. **T2: só `nonConformityService.js` + teste novo.** **T3: só
  `receiptNotificationService.js`, `reservaChegadaService.js` (a segunda metade de `aposLiberacaoSemFalhar`) + teste novo
  + `recebimentoAvisoEntrada.api.test.js` (função pura).** T4: só um teste novo.
- **T2 roda numa worktree própria** (junction de `node_modules`, memória do projeto), em paralelo à T3 na árvore
  principal: arquivos disjuntos, SQLite de teste próprio, e nenhuma das duas sabota o motor de estoque (as sabotagens
  são no gancho da NC e no aviso). Se a T3 precisar sabotar `reservaChegadaService.js`, a sabotagem fica na árvore
  principal e a T2 não a vê. **Quem sabota produção não roda suíte junto com outra suíte na mesma árvore.**
- **T4 só depois do merge da T2 e da T3**, com a árvore quieta. **A revisão adversarial (Fase 5) só começa com a T4
  commitada e a worktree removida.**
- Scratchpad com nome único por agente (`msg-e75-t2.txt`, `bak-e75-t3-rns.js`...). Executores **não** marcam este plano;
  o fio principal marca.

- [x] **T0 (tronco) — o miolo com teto injetado, e a retomada que não reconta o inspecionado.** ✅ `1b2a6959`.
  Realizado: `distribuirParaQuemEspera` + `rotulosDaChegada(rec)` (9 rótulos: observação, motivo, recebimento_id,
  aviso por item, motivo/aviso do desfazer, saiu da espera, excesso, aviso do recálculo — literais da 74 byte a byte)
  + `recalcularTocadas`. Testes da 74 sem edição: 8 + 23 + 5 + 14 + 11 verdes. Teste novo 3/3 (D8 pelo serviço, D8
  pela rota com retomada forçada pelo lote, carga fria). Controles: sem `NOT EXISTS` → os dois D8 caem; teto = disponível
  → cai o RN-04 da 74 "reserva 4, não 6". Suíte: api 281/281, almoxarifado 44/0, validation, safealter, sqlite verdes.
  Pelo contrato "T0".
  **Medir antes e citar no commit:** os testes da 74 (`recebimentoReservaChegada*`, `reservaChegadaBase`) passam **sem
  edição** depois da extração. Teste novo `server/tests/api/reservaLiberacaoBase.api.test.js`, **pelo serviço**: RN-07
  (parte D8 — nota mista crítico+comum, entrada manual de 5, inspeção 1/3 pela rota, depois
  `reservarChegadaParaQuemEspera` direto: o crítico **não** é reservado; uma requisição nova do comum, com o comum ainda
  livre, **é**). Controles positivos: (1) sem o `NOT EXISTS` → o crítico ganha 4 e cai; (2) teto trocado pelo disponível
  global dentro do miolo → um RN-04 da 74 cai (prova que a extração preservou o teto). Carga fria `node -e` de
  `reservaChegadaService` e `inspectionService` nas duas ordens.
- [x] **T1 (tronco) — a inspeção reserva para quem esperava.** ✅ `f149977b`. Realizado:
  `rotulosDaLiberacao(ctx, recNumero)`, `reservarLiberacaoParaQuemEspera(db, user, ctx, resultado?)` (4º argumento
  opcional: o acumulador preenchido no lugar — é como o `aposLiberacaoSemFalhar` devolve o PARCIAL, Fase 2),
  `aposLiberacaoSemFalhar` (devolve o resultado; a metade do aviso é a T3) e o gancho em `decidirInspecao`. Teste
  novo 15/15. Os 26 arquivos que passam por `inspecionar` continuam verdes **sem edição** (nenhum caiu). Controles:
  (s1) gancho desligado → 9 caem, RN-01 na 1ª asserção de reserva; (s2) teto = disponível → cai só o RN-03 da entrada
  manual; (s3) sem a guarda `aprovada > 1e-9` → **nada cai: defeito inalcançável declarado** (o passo 1 do serviço
  devolve vazio com quantidade 0; a guarda só evita a chamada); (s4) gancho sem wrapper e com `throw` no catch +
  `compararPrioridade` lançando → RN-06 (escape) cai com `{"error":"ordem quebrou 75"}` (500); (s5) `sistema: false` →
  RN-08 cai com a reserva ausente (e todos os que decidem como QUALIDADE); (s6) catch zerando o parcial → cai o
  `[servico]` do resultado parcial. Suíte: api 282/282, almoxarifado 44/0, validation, safealter, sqlite verdes.
  Original: `reservarLiberacaoParaQuemEspera` +
  `aposLiberacaoSemFalhar` (só a metade da reserva) + o gancho em `decidirInspecao`. Teste novo
  `server/tests/api/inspecaoReservaLiberacao.api.test.js`, **pelas rotas** (nota pelas portas do recebimento,
  `POST /recebimentos/itens/:id/inspecionar`): RN-01, RN-02, RN-03 (as três), RN-05, RN-06 (inspeção), RN-07 (inspeção),
  RN-08, RN-11, RN-12; e **pelo serviço** uma chamada de `reservarLiberacaoParaQuemEspera` com `quantidade: 0` (vazio,
  não lança). **Medir antes:** os testes de inspeção (`grep -ln "inspecionar" tests/api`) passam sem edição; listar os
  que caírem (achado vai ao plano). Controles positivos: (1) gancho comentado → RN-01 cai na primeira asserção de
  reserva; (2) teto = disponível global → RN-03 (entrada manual) cai; (3) gancho sem a guarda `aprovada > 1e-9` não
  existe como sabotagem útil — no lugar, reprovação total com R esperando e saldo livre de ajuste: nenhuma reserva (cai
  se o teto for o disponível); (4) gancho sem `try` + `criarReserva` lançando → RN-06 cai com 500; (5) `sistema: false`
  → RN-08 cai com a reserva ausente (o warn do 403).
- [x] **T2 — a NC que aceita também reserva.** ✅ `c4d9212c`. **Rodou no tronco, sem
  worktree** (Fase 2). Realizado pelo contrato: gancho em `decidirNaoConformidade` depois da auditoria, antes do
  `obterNaoConformidade`. Teste novo `ncReservaLiberacao` 10/10 (RN-04 com as duas que liberam e as quatro que não,
  `SEM_BLOQUEIO` depois do avulso, RN-06 por item e por escape, RN-07 409). Os 10 arquivos que decidem NC verdes **sem
  edição**. Achado no próprio teste: o RN-06 "escape" com UMA candidata nunca chamava o comparador (o `sort` de um
  elemento não compara) — passava sem provar nada; ganhou a segunda candidata. Controles: (s1) gancho desligado →
  RN-04 (as duas), RN-06 e RN-07 caem; (s2) sem a guarda `efeito === 'LIBERADA'` → **nada cai: defeito inalcançável
  declarado** (todo efeito que não é LIBERADA sai com `quantidade: null` — `nada()` `:781`, `JA_LIBERADA`/
  `SEM_BLOQUEIO_JA_SAIU` `:984-986` —, e o serviço devolve vazio no passo 1); (s3) sem wrapper e com `throw` +
  `compararPrioridade` lançando → RN-06 escape cai com 500 `{"error":"ordem quebrou 75 nc"}`. Suíte: api 283/283,
  almoxarifado 44/0, validation, safealter, sqlite verdes. Original: O gancho em `decidirNaoConformidade`, pelo
  contrato. Teste novo `server/tests/api/ncReservaLiberacao.api.test.js`, pelas rotas: RN-04 inteira (as duas decisões
  que liberam, as quatro que não, o `SEM_BLOQUEIO` depois do avulso), RN-06 (NC), RN-07 (NC, 409). **Medir antes:** os
  testes da 44/45/69 (`grep -ln "nao-conformidades/.*decidir" tests/api`) passam sem edição. Controles: (1) gancho
  comentado → RN-04 cai; (2) gancho sem a guarda `efeito === 'LIBERADA'` → a negativa `SEM_BLOQUEIO` cai (reserva de
  saldo livre que não veio da NC); (3) gancho **antes** da auditoria com `criarReserva` lançando sem `try` → a decisão
  responde 500 com a NC DECIDIDA (prova a posição). Commit na branch da worktree; o fio principal faz o merge.
- [x] **T3 — o solicitante é avisado.** ✅ `c8c089cb`. Rodou no tronco, depois da T2.
  Realizado pelo contrato: `montarAvisoLiberacao(dados)` (pura; `dados.material` é UM objeto — um material só, L2
  não se aplica; sem recebimento a linha `Recebimento:` sai), `avisarLiberacao(db, user, ctx, resultadoReserva)` e a
  segunda metade do `aposLiberacaoSemFalhar` (warn `[almoxarifado-reservas] aviso da liberacao falhou (<origem>
  <documento_id>): <msg>`). `reservaChegadaService` passou a requerer o `receiptNotificationService` pelo OBJETO (já o
  requeria no topo pela `QTD_DO_ITEM_SQL`; sem ciclo novo — a carga fria da T0 continua verde). Testes: 3 puros
  novos em `recebimentoAvisoEntrada` (23/23), `inspecaoReservaLiberacaoAviso` 10/10 (L1, L0 com a reserva falhando,
  R4 sem e-mail, quem não ganhou com disponível livre recebe L0, NC com a 1ª linha da NC, dois itens → duas chaves,
  a mesma liberação nunca duas vezes, toggle 0, aviso lançando não derruba, resultado PARCIAL no e-mail). Divergência
  de medição: a fila guarda `hash_dedupe = sha256(evento|chave)`, não a chave — o teste compara o hash. Medido antes:
  os quatro `alerta*` que contam a fila (Fase 0 §4) continuam verdes **sem edição** (o harness deles não tem a tabela
  `usuarios` → `SEM_DESTINATARIO`, nada enfileirado). Controles: (s1) dedupe da 70 → cai o "dois itens" (e o L1/NC na
  asserção do hash); (s2) sem o filtro de avisáveis → cai só o R4; (s3) pendente descontando a reserva desta liberação
  → 7 caem, o L1 em `[]` (quem ganhou tudo fica sem e-mail); (s4) 1ª linha trocada → cai o L1 da rota e o puro.
  Suíte: api 284/284, almoxarifado 44/0, validation, safealter, sqlite verdes. Original: `avisarLiberacao` + `montarAvisoLiberacao` + a
  segunda metade de `aposLiberacaoSemFalhar`. Testes: em `recebimentoAvisoEntrada.api.test.js` a função pura (assunto,
  as duas primeiras linhas, as duas formas da linha, L0/L1 pelas constantes); teste novo
  `server/tests/api/inspecaoReservaLiberacaoAviso.api.test.js` pela rota da inspeção com `usuarios`: RN-09 (L1, L0 com a
  reserva forçada a falhar, R4 sem e-mail, dois itens da mesma nota → duas chaves, toggle desligado). **Medir antes:** os
  quatro `alerta*` que contam a fila (Fase 0 §4) — se algum cair por linha nova da fila, ajustar à vista com o motivo.
  Controles: (1) dedupe da 70 (`recebimento-entrada-…`) → o segundo item da mesma nota fica sem e-mail e cai; (2) sem o
  filtro de avisáveis → R4 recebe e cai; (3) pendente descontando a reserva desta liberação → quem ganhou tudo fica sem
  e-mail e cai; (4) literal da 1ª linha trocada → cai.
- [ ] **T4 (integração, cruza T1 × T2 × T3 × 74) — a jornada de quem espera o material crítico.** Arquivo
  `server/tests/api/inspecaoReservaLiberacaoIntegracao.api.test.js`, só pelas portas reais: material crítico com mínimo
  → pedido → R1 (URGENTE, 4) e R2 (NORMAL, 4, criada antes) aprovadas → `AGUARDANDO_*` → nota de 6 pelas portas do
  recebimento, retida → **nada reservado**, nenhum e-mail ao solicitante → R3 aprovada com o material retido →
  `AGUARDANDO_*` → inspeção 5 aprovados / 1 reprovado → R1 4 `TOTALMENTE_RESERVADA`, R2 1 `PARCIALMENTE_RESERVADA`, R3
  nada; e-mails de R1 (L1) e R2 (L1), R3 sem e-mail; fila: R1 e R2 `SEPARAR`, R3 `AGUARDANDO_SALDO` → R4 aprovada
  **depois** → `AGUARDANDO_*`, `reservas: []` → separar e entregar R1 (a saída consome a reserva da inspeção) → NC
  `ACEITAR` → o 1 vai a R2 (agora `TOTALMENTE_RESERVADA`), e-mail com a 1ª linha da NC → R3 e R4 continuam sem nada →
  separar/entregar R2. **Segundo cenário (estorno):** nota de 3 retida, inspeção aprova 3 → R5 reservada →
  estorno da `ENTRADA_COMPRA` → 200, reserva `LIBERADA`, R5 de volta a `AGUARDANDO_*`. **Terceiro (retomada):** pela
  rota, não pelo serviço, se houver porta de retomada medível (molde `recebimentoAvisoEntradaRotas` RN-03); senão,
  declarar no plano. Controles: (s1) gancho da inspeção desligado → cai na primeira asserção de reserva; (s2) gancho da
  NC desligado → cai em R2 depois da NC; (s3) ordem sem urgência → cai em R1/R2; (s4) aviso desligado no
  `aposLiberacaoSemFalhar` → cai nos e-mails.
- [ ] **T5 — fechamento (skill `fechar-etapa`).** Novidades: seção da 75 (Antes → Agora; roteiro clicável: aprovar
  requisição de material crítico → processar a nota → *Inspeções* → aprovar → a requisição vira *Reservada* → aprovar
  outra → fica esperando; NC aceita → o liberado vai para quem esperava); **B383–B392** ajustadas ao realizado; **C126
  resolvido**; Surpresa 3 (desbloqueio avulso drena a NC) como C novo se nenhum C a nomeia; Surpresa 4 anotada na seção;
  D (75); F (75). Spec 07 (cabeçalho, item "Reserva na liberação da inspeção/NC" com hashes, linhas novas na tabela de
  regras), spec 09 (o gancho na decisão e na NC; o "Fica de fora" da 74 sobre a inspeção riscado à vista), spec 19 (o
  aviso novo no mesmo evento), mapa (linhas 07, 09, 19), guia (cabeçalho "75 ENTREGUE · 76 começando", seção da 75),
  manual (inspeção, NC, reservas, e-mail). Retro de 4 números. **Próxima tarefa detalhada — Etapa 76.**

## O que fica de fora (declarado — e por quê)

- **Desbloqueio avulso e estorno de `BLOQUEIO` avulso** (D1): ajuste de prateleira sem documento; reservar ali
  distribuiria material sem ninguém pedir. RN-11 prende o comportamento.
- **Entradas que não são nota** (como na 74).
- **Liberar à mão / expirar não recalcula o status** (C127, anterior).
- **Trava entre decisão e aprovação** (corrida de milissegundos, Postgres depois).
- **Backfill** (D9).
- **Chave nova na resposta da inspeção/NC e tela** (D5).

## Letra A — consulta para produção (candidata, a confirmar no fechamento)

O que está retido ou bloqueado hoje e tem requisição esperando — o tamanho do que a primeira decisão vai reservar:
```sql
SELECT ri.material_id, ri.recebimento_id, ri.quantidade_em_inspecao AS retido_no_item,
  (SELECT COUNT(*) FROM itens_requisicao_almoxarifado ir JOIN requisicoes_almoxarifado r ON r.id = ir.requisicao_id
    WHERE ir.material_id = ri.material_id AND COALESCE(r.ativo,1) = 1
      AND r.status IN ('APROVADO','AGUARDANDO_ESTOQUE','AGUARDANDO_COMPRA','PARCIALMENTE_RESERVADA','TOTALMENTE_RESERVADA','PARCIALMENTE_ATENDIDA','EM_SEPARACAO')) AS requisicoes_esperando
FROM recebimentos_material_itens_almoxarifado ri
WHERE COALESCE(ri.quantidade_em_inspecao, 0) > 0;
-- e as NCs de inspeção abertas com bloqueio: SELECT id, numero, recebimento_id FROM nao_conformidades_almoxarifado
--   WHERE status = 'ABERTA' AND origem = 'INSPECAO' AND referencia_tipo = 'INSPECAO';
```

## Próximo passo

**Fase 2** (revisão do plano por agente fresco, as quatro perguntas da skill — inclusive "cada RN traçada até o último
gesto": decisão → reserva → aprovação de outra → separar → entregar → estorno), depois T0.

## Fase 2 — revisão do plano: 0 críticos, 6 importantes, 8 menores → plano revisto (vale sobre o texto acima)

- **IMPORTANTE — quatro controles positivos NÃO conseguiam falhar** (o padrão de teste vazio do CLAUDE.md): o laço da 74
  engole a falha de cada item (`reservaChegadaService.js:184-204`) e o `aposLiberacaoSemFalhar` nunca lança, então
  "gancho sem try → 500" (T1-4) e "gancho antes da auditoria → 500" (T2-3) nunca dão 500; "sem a guarda
  `efeito === 'LIBERADA'`" (T2-2) cai no passo 1 do contrato (quantidade nula → vazio); "teto pelo disponível" (T1-3)
  com reprovação total nunca usa o teto. → **controles refeitos**: provar a POSIÇÃO do gancho sabotando algo que ESCAPA
  do laço (`compararPrioridade` lançando, chamado sem o wrapper); a guarda da NC provada com um cenário em que a
  quantidade NÃO é nula mas o efeito não é LIBERADA (se não existir, declarar a guarda como redundante — o motivo
  "defeito inalcançável" da skill); o teto provado só pelo RN-03 (entrada manual).
- **IMPORTANTE — o aviso do RN-06 não sai quando `criarReserva` lança** (o laço escreve "Falha ao reservar NA
  CHEGADA"). → `rotulos` ganha também os textos internos do laço (o aviso por item, `motivoMovimentacao` do desfazer, a
  observação de "saiu da espera" e de "excesso desfeito"), com os valores da 74 como padrão (os testes da 74 não mudam)
  e textos de "liberação da inspeção/NC" no caminho novo; o RN-06 confere o texto do aviso por item.
- **IMPORTANTE — T4: R2 fica PARCIALMENTE_RESERVADA depois da NC** (1 + 1 de 4), não TOTAL; o separar/entregar de R2 é
  parcial de 2. Corrigido no cenário.
- **IMPORTANTE — o teste de retomada da B390 usava um caminho que não existe** (nota PROCESSADO não reprocessa,
  `receiptService.js:1752`). → modelo: forçar a PRIMEIRA execução a falhar antes do gancho, inspecionar, retomar — o
  comum é reservado e o crítico (já inspecionado) não.
- **IMPORTANTE — falha no meio faz o e-mail mentir**: o catch zerava o resultado parcial → `aposLiberacaoSemFalhar`
  devolve o `acc.resultado` parcial (o aviso diz o que de fato ficou reservado).
- Menores: linhas corretas do laço (`:149-236`, livre `:141-144`); janela entre o claim da inspeção e o INSERT da linha
  (item livre sem inspeção) — declarado; desfazer de excesso duplo com duas inspeções simultâneas (herdado da 74) —
  declarado; janela de corrida maior que na 74 — declarado; estorno do item A solta reserva da inspeção do item B do
  mesmo material (herdado) — declarado; L2 nunca se aplica na liberação (um material só).
- **Paralelismo revisto**: T2 e T3 sabotam produção e rodariam suítes — pela regra da Etapa 72 **não rodam em
  paralelo**: o tronco inteiro (T0→T3) roda num agente só, sequencial; a T4 depois; a revisão adversarial depois, com a
  árvore quieta. (Sem worktree.)

## Tronco executado (T0–T3) — contrato final realizado (para a T4 e o fechamento)

Hashes: T0 `1b2a6959`, T1 `f149977b`, T2 `c4d9212c`, T3 `c8c089cb`. Tudo na árvore principal,
sequencial, sem worktree. Testes da 74 sem edição em todas as tasks.

**Serviço (`reservaChegadaService.js`):**
- `distribuirParaQuemEspera(db, user, materialId, teto, rotulos, acc)` — interna; `min(teto, disponível agora)`.
- `rotulosDaChegada(rec)` (74, byte a byte) e `rotulosDaLiberacao(ctx, recNumero)`; nove campos: `recebimento_id`,
  `observacao(c)`, `motivo`, `falhaReserva(c, e)`, `motivoDesfazer`, `falhaDesfazer(id, e)`, `saiuDaEspera`,
  `excessoDesfeito`, `falhaRecalculo(id, e)`.
- `reservarLiberacaoParaQuemEspera(db, user, ctx, resultado?)` — exportada; 4º argumento opcional = acumulador
  preenchido no lugar (é por ele que o parcial chega ao aviso).
- `aposLiberacaoSemFalhar(db, user, ctx)` — exportada, nunca lança, **devolve** o resultado (parcial na falha); depois
  chama `receiptNotificationService.avisarLiberacao(db, user, ctx, r)` pelo objeto.
- D8: o livre da nota na chegada ganhou `AND NOT EXISTS (SELECT 1 FROM inspecoes_recebimento_almoxarifado i WHERE
  i.recebimento_item_id = ri.id)`.

**Literais (reserva):**
- INSPECAO: observação `Reserva na liberação da inspeção — recebimento <REC> — requisição <REQ>`; motivo da
  movimentação `Reserva na liberação da inspeção — recebimento <REC>`.
- NAO_CONFORMIDADE: observação `Reserva na liberação da não conformidade <NC> — requisição <REQ>`; motivo `Reserva na
  liberação da não conformidade <NC>`.
- Desfazer: `motivoMovimentacao` `Liberação de reserva na liberação da inspeção desfeita` / `… na liberação da não
  conformidade <NC> desfeita`; motivo `Requisição saiu da espera durante a reserva na liberação da inspeção` (ou da NC
  `<NC>`); `Reserva na liberação da inspeção acima do pendente — excesso desfeito` (ou da NC `<NC>`).

**Textos do log (`console.warn`):**
- por item: `[almoxarifado-reservas] Falha ao reservar na liberação da inspeção <inspecao_id> o item <item> da
  requisição <req>: <msg>` / `… na liberação da não conformidade <NC> o item …`;
- desfazer: `[almoxarifado-reservas] Falha ao desfazer a reserva <id> na liberação da inspeção <inspecao_id>: <msg>`;
- recálculo: `[almoxarifado-reservas] recalculo do status apos a reserva na liberacao falhou (<origem> <doc>,
  requisicao <id>): <msg>`;
- escape do laço / gancho: `[almoxarifado-reservas] reserva na liberacao falhou (INSPECAO <inspecao_id>): <msg>` e
  `(NAO_CONFORMIDADE <nc_id>)` (o id, não o número);
- aviso: `[almoxarifado-reservas] aviso da liberacao falhou (<origem> <documento_id>): <msg>`.

**Aviso (`receiptNotificationService.js`):** `avisarLiberacao(db, user, ctx, resultadoReserva)` → `{ requisitantes }` |
`{ desligado: true }`; `montarAvisoLiberacao({ origem, documento_numero, numero_requisicao, status, numero_recebimento,
material: { codigo, nome, unidade, liberado, pendente, reservado }, link })`.
- assunto `[Almoxarifado] Material liberado para a sua requisição <REQ>`;
- 1ª linha `O material que a sua requisição aguardava foi aprovado na inspeção e está no estoque.` / `O material que a
  sua requisição aguardava foi liberado pela não conformidade <NC> e está no estoque.`;
- `Requisição: <REQ>` · `Situação da requisição: <…>` (relida depois da reserva) · `Recebimento: <REC>` (sai sem nota) ·
  `Material liberado:` · `- <cod> — <nome>: liberado <q un> (pendente na requisição: <p un>[; reservado para a sua
  requisição: <r un>])` · L1/L0 (constantes da 74) · `Link: …`;
- evento `RECEBIMENTO_ENTRADA_REQUISITANTE`; dedupe `inspecao-liberada-<inspecao_id>-req-<rid>` /
  `nc-liberada-<nc_id>-req-<rid>` (a fila guarda `sha256(evento|chave)`); payload `{ recebimento_id, requisicao_id,
  numero_requisicao, origem, documento_id }`.

**Ganchos:** `decidirInspecao` depois da NC, antes do `return`, `if (aprovada > 1e-9)`; `decidirNaoConformidade`
depois da auditoria, antes do `obterNaoConformidade`, `if (liberacao.efeito === 'LIBERADA')`. As duas guardas são
**redundantes por construção** (controle positivo não cai: o serviço devolve vazio com quantidade 0/null) — declaradas,
não falta de asserção.

**Achados do tronco para a doc:** (1) o RN-06 "escape" com uma candidata só não testava nada (o `sort` de um elemento
não chama o comparador) — corrigido na T2; (2) as duas guardas redundantes acima; (3) a fila guarda o hash do dedupe,
não a chave (o plano falava em "chave").

## Próximo passo (atualizado)

**T4** (integração, `inspecaoReservaLiberacaoIntegracao.api.test.js`, só pelas portas reais, com a correção da Fase 2:
R2 termina PARCIALMENTE_RESERVADA com 1 + 1 de 4). Para a retomada pela rota existe porta medível: a falha forçada no
lote na 1ª execução de `/processar` (molde do teste `[RN-07/D8] retomada pela rota` de `reservaLiberacaoBase`).
