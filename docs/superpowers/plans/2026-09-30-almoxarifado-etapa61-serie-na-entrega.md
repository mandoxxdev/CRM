# Etapa 61 — a entrega de material com série diz QUAIS séries saem

> Status: **Fase 0-1** (design + plano). Feature 05 (o que falta do "registro por item" é a série) e
> o invariante da Etapa 6b (`COUNT(série presente) == quantidade_atual`).

## Fase 0 — medido com sonda (2026-09-30)

- **Defeito reproduzido:** material com `controle_serie`, entrada de 3 com séries S1–S3, requisição
  de 2, separar 2, entregar 2 pela rota → **200**; físico **1**, séries `EM_ESTOQUE` **3**. O invariante
  da 6b quebra a cada entrega de material serializado — a série entregue continua "em estoque" e
  pode ser escolhida de novo em outra saída.
- Causa: o motor só exige série quando o chamador declara `exigeSerie` (decisão da 6b: "entrega/
  exclusão de requisição ... isentas até as telas deles terem campo de série"). A entrega não declara
  e não manda `serie_ids`.
- O motor já sabe: `serie_ids` + `exigeSerie` → cardinalidade (N séries para N unidades, quantidade
  inteira) e `claimSaidaSeries` (série do material, EM_ESTOQUE, do lote da saída), com compensação.
- Rota de séries em estoque: `GET /materiais/:id/series?status=EM_ESTOQUE` (usada pela tela de
  Movimentações).

## Regras de negócio

- **RN-01** — cada item de `itens_atendidos` aceita `serie_ids` (lista de ids). Material com
  `controle_serie`: **obrigatório**, com `N == quantidade_atendida` (inteira), validado **antes de
  qualquer baixa** (pré-checagem da Etapa 58): séries do material, `EM_ESTOQUE`, do lote escolhido
  (se houver), sem repetição. Recusa: `{material}: material com controle de serie: informe {q} serie(s) para {q} unidade(s) — recebidas {n}`
  e, quando não veio nenhuma, o sufixo ` — entregue escolhendo as séries` (a de um clique cai aqui).
- **RN-02** — as baixas do item (excedente + reservada) recebem as séries em ordem (a 1ª baixa as
  primeiras `q1`), e o motor é chamado com `exigeSerie: true`.
- **RN-03** — material sem `controle_serie`: `serie_ids` ignorado (comportamento de hoje).
- **RN-04 (tela)** — modal de entrega: item serializado mostra as séries em estoque (do lote
  escolhido, se houver) como caixas de seleção; confirmar exige exatamente a quantidade.
- **A medir na Fase 2:** a exclusão da requisição (estorno ENTRADA sem séries) e o estorno da saída.

## Tasks

- **T1 (tronco)** — serviço. Testes `server/tests/api/entregaSeriePorItem.api.test.js`: o defeito
  (entrega sem séries de material serializado → 400, nada sai); com séries → físico e séries batem;
  série de outro material / já entregue / repetida → 400, nada sai; com reserva (duas baixas) as
  séries se dividem; material sem série ignora `serie_ids`.
- **T2 (galho, tela)** — RN-04.
- **T3** — verificação, Fase 5, fechamento. Letra A: SQL dos materiais com série cujo número de
  séries em estoque difere do físico (o estrago que já existe em produção).

## Fase 2 — revisão do plano: 2 críticos, 4 importantes, 3 menores → escopo revisto

- **CRÍTICO 1** — a exclusão da requisição estorna com ENTRADA sem séries: com a entrega baixando
  séries, excluir devolve o físico e deixa as séries ENTREGUE (o invariante quebra ao contrário).
  → **RN-05**: na exclusão, material serializado devolve **por saída** com as séries daquela saída
  (`movimentacao_saida_id`, status ENTREGUE) e `exigeSerie`; saída legada sem séries → o de antes; parte
  das séries já devolvida → recusa antes da 1ª ENTRADA.
- **CRÍTICO 2** — dado legado trava nos dois sentidos, sem gesto de regularização: (a) físico sem
  linhas de série → a entrega nunca mais sai; (b) séries "fantasma" (EM_ESTOQUE mas já saíram, das
  entregas anteriores a esta etapa) → a tela as oferece. → **RN-06**: gesto de **regularização**,
  `POST /materiais/:id/series/regularizar { cadastrar: [numeros], baixar: [serie_ids], justificativa }`
  — cadastrar só até `físico − presentes`, baixar (novo status **BAIXADA**, não presente) só até
  `presentes − físico`; justificativa obrigatória; auditado. Nunca cria divergência nova.
- **IMPORTANTE** — série + lote sem lote explícito: o lote vem das séries escolhidas (todas do mesmo
  lote → `lote_id`; lotes diferentes → recusa `{material}: escolha series de um lote so`).
- **IMPORTANTE** — "Sai de" vs série: `localizacao_id` da série não é confiável (transferência não move
  a série, decisão 9) → não filtra; C76 segue declarado; a tela só mostra o endereço como dica.
- **IMPORTANTE** — T1 e T2 no mesmo push (a de um clique de material serializado passa a recusar).
- **IMPORTANTE** — o comentário do motor (`stockService` ~l.995 "entrega/exclusao ... isentas"), a
  decisão da 6b nas novidades e a "pendência declarada" das specs 04/12 ficam **errados** → corrigir à vista.
- Menores: literal única (sem acento, como o motor): `{material}: material com controle de serie: informe {q} serie(s) para {q} unidade(s) — recebidas {n}`
  e, com 0, o sufixo ` — entregue escolhendo as series`; o cancelamento de saída legada por Movimentações
  já recusa com mensagem enganosa (pré-existente, D); a devolução não baixa `quantidade_entregue` (medir; D).

## Tasks (revistas)
- **T1** — entrega com séries (RN-01..03 + lote pelas séries) e exclusão por saída com séries (RN-05).
- **T1b** — regularização (RN-06) + reescrever o teste `serieControleObrigatorio` :111 (a entrega sem
  série deixa de passar — de propósito).
- **T2** — tela: séries na entrega (caixas, exatamente a quantidade) e regularização (na aba Séries do
  material: aviso "séries presentes X ≠ físico Y" e o formulário).
- **T3** — verificação, Fase 5, fechamento; letra A com os dois sinais da diferença.
