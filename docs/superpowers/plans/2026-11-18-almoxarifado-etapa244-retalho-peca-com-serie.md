# Etapa 244 — retalho de peça com número de série: aviso antecipado na janela (resto da D (233) 3)

> Item 3 da estimativa de 18/11 (`docs/estimativas/2026-11/estimativa_2026-11-18_cadastro-e-almoxarifado-semana.md`), **revisado** de
> 1h15 para 45 min na Fase 0 (commit `a4409686`). Ponto de partida: a "Próxima tarefa detalhada" do plano da 243 e a do plano da 236.
> Módulo Almoxarifado. A tarefa previa mexer no motor (a baixa do original gravar o lote); a sonda mediu que **não há baixa** de peça com
> série no retalho — a etapa vira fatia de tela + teste de rota. Fases 2 e 5 rodadas mesmo assim (pedido da etapa).

## Fase 0 — o que a sonda executada mediu (sobre `f19d7039`, `createTestApp`, pela rota `POST /api/almoxarifado/sobras/gerar-retalho`)

Material com série e **sem** controle de lote; A1, A2 no lote L1 e B1, B2 no L2 (entradas pela v2).

| # | Gesto | Resultado medido |
|---|---|---|
| P1 | Retalho **com baixa** (`baixar_original: true`, 1 UN), sem lote | 400 *"O material S244-2 tem controle de serie e a geracao de retalho nao tem campo para dizer QUAL numero de serie esta sendo cortado. Baixe a peca pela tela de Movimentacoes (que tem seletor de serie) e depois registre o retalho aqui no modo "peca ja baixada do estoque"."*; nenhum movimento; resumo fecha (físico 4, sem lote 0) |
| P1b | O mesmo com `lote_origem_id` = L2 | a mesma recusa (a guarda vem antes do lote) |
| P2 | O caminho que a recusa ensina: Saída avulsa (v2) de B1 → retalho **sem baixa** | a saída grava o L2 (Etapa 234); o retalho 201, `movimentacao_baixa_id` NULL, nada baixado; B1 ENTREGUE no L2; resumo fecha (físico 3, sem lote 0) |
| P3 | Retalho sem baixa com `lote_origem_id` = L1 (a peça saiu do L2) | 201; a sobra guarda o L1 (só rastreio, não mexe em saldo; a tela não manda lote no modo sem baixa) |
| P5 | Material **sem** série e sem controle de lote, saldo todo em lotes; retalho com baixa sem lote | 201; SAIDA sem lote; "sem lote atribuído" −1 — é a **B204** de sempre (saída sem lote de material sem controle de lote), não é deste item |
| P6 | Material sem série, lote L1 bloqueado, retalho com baixa citando o L1 | 400 *"Lote L1 esta bloqueado e nao pode ser utilizado"* |

**Conclusão:** o item 3 ("a baixa do original grava o lote") **não tem buraco a corrigir**: a geração de retalho recusa a baixa de origem com
série antes de mover qualquer coisa, desde a Etapa 9 (`scrapService.js` — a compensação não conseguiria estornar uma saída sem série), e o
caminho ensinado já grava o lote (Saída avulsa, Etapa 234). O que falta é na tela: a janela deixa marcar *"Baixar o material de origem agora"*
para material com série e só recusa ao confirmar, depois do formulário inteiro.

**Decisões (letra B):**
1. **Manter a recusa** do retalho com baixa de peça com série e avisar antes, na janela (a caixa fica desligada). Descartado: aceitar série
   no retalho (seletor de série na janela, `serie_ids` + `lotePelasSeries` na baixa, a compensação estornando com série) — muda a decisão da
   Etapa 9, ~2h ou mais, e o caminho por Movimentações já grava o lote.
2. A estimativa foi **revisada** (1h15 → 45 min), não refeita.
3. O material **do retalho** com série (recusado nos dois modos) não ganha aviso nesta etapa — fica na D (244).

## Regras (RN)

- **RN-244.01** (servidor, existente — fixado pela rota) — retalho com baixa (`baixar_original: true`) de origem com controle de série → 400
  com a mensagem literal acima (código da origem no lugar de S244-2), com ou sem `lote_origem_id`; nada gravado: nenhum movimento, nenhuma
  sobra, físico, séries e resumo iguais.
- **RN-244.02** (integração, pela rota) — Saída avulsa v2 de B1 (o livro diz L2) → retalho **sem baixa** da mesma origem → 201,
  `movimentacao_baixa_id` NULL, sobra criada, B1 continua ENTREGUE no L2, `GET /materiais/:id/lotes/resumo` fecha (`sem_lote_atribuido` 0);
  a ENTRADA_RETALHO entra no material do retalho.
- **RN-244.03** (tela) — janela **Gerar retalho**, origem com controle de série: a caixa *"Baixar o material de origem agora (a peça está
  saindo do estoque neste momento)"* fica **desligada e desmarcada**, e aparece o aviso literal:
  *"Este material tem controle por número de série: a peça não é baixada aqui. Baixe a peça em Movimentações → Saída (lá se escolhe o
  número de série) e gere o retalho com a opção de baixar desmarcada."* *(Na escrita do teste o texto perdeu "e o lote fica registrado" — o lote
  só é gravado pela série quando ela é de um lote só; a frase não promete o que nem sempre acontece.)*
  Origem **sem** série: a caixa ligada e **sem** o aviso (metade positiva).
- **RN-244.04** (tela) — caixa marcada e a origem trocada para uma com série → a caixa desmarca e os campos da baixa somem; gerar manda
  `baixar_original: false` e nenhum campo da baixa. Trocar de volta para origem sem série → a caixa religa (desmarcada).

## Contrato (congelado)

`POST /api/almoxarifado/sobras/gerar-retalho` — **sem mudança** de campo; a Fase 5 acrescentou uma recusa (a do motor, RN-244.05, abaixo). A tela lê `controle_serie` do
`GET /api/almoxarifado/materiais` (`SELECT m.*`, já vem). Nenhuma fixture de contrato a regravar (o servidor não muda).

- **RN-244.05** (servidor, Fase 5) — a baixa do retalho declara `exigeSerie`: o controle de série ligado no material entre a guarda (lida
  sem trava) e a baixa → 400 *"material com controle de serie: informe 1 serie(s) para 1 unidade(s) — recebidas 0"* (o motor relê sob a
  trava), nada gravado.

## Fase 2 — revisão do plano (agente fresco) e o que mudou

- **1 (controle positivo de T1 vazio):** a sabotagem prevista ("tirar o `origem.controle_serie`") virava `if (baixarOriginal)` e devolvia a
  mesma mensagem — nada cairia. **Já executada certa:** a sabotagem foi `if (baixarOriginal && false)` (o motor baixou: 201, sobra criada) e
  a segunda, estender a guarda ao modo sem baixa, derrubou o RN-244.02; o caso de controle sem série (201) também está no arquivo.
- **2:** o teste manda `quantidade_baixa: 1` (o `superRefine` do schema recusaria antes, com outra mensagem) e compara a mensagem inteira;
  caso novo: origem e retalho com série → vence a da origem.
- **3 (real):** só `disabled` deixaria a caixa marcada e desligada com os campos da baixa → `baixarEfetivo` (caixa **e** origem sem série)
  no payload e na tela, e a troca de origem desmarca. Teste novo: marcar **antes** de escolher a origem.
- **4:** `Number(controle_serie) === 1` (a tela compara `controle_lote === 1`). Feito.
- **5:** T3 = RN-244.02, já no arquivo de T1 (juntados). **6:** a corrida de ligar a série no meio da geração (sugestão: D) — a Fase 5
  reproduziu e foi corrigida (RN-244.05). **7:** sem achado nos gestos da janela.

## Tasks (sort topológico)

- [x] **T1 (tronco, servidor — só teste)** — `40c6e9f5`. `retalhoPecaComSerie.api.test.js` passou de primeira (o código existe). Controle
  positivo: S1 `if (baixarOriginal && false)` → os dois RN-244.01 vermelhos (o motor baixava sem série: 201); S2 a guarda nos dois modos →
  RN-244.02 vermelho. Restauro por cópia, md5 de volta (`cf461643…`).
- [x] **T2 (galho, tela)** — `c73db29d`. Teste primeiro: 2 vermelhos de 62. Depois `disabled`, o aviso, `baixarEfetivo`, o desmarcar na
  troca (+ Fase 2: o caso "marcar antes"; e o "de volta na mesma janela", porque o primeiro reabria a janela e o formulário zerava — a
  sabotagem do desmarcar não caía até ele existir). Controle positivo: sem `disabled` → RN-244.03; sem o aviso → RN-244.03 e o "marcar
  antes"; sem o desmarcar → "mesma janela". **Não cai:** tirar a série do `baixarEfetivo` — inalcançável pela tela com o desmarcar na troca
  (defesa em profundidade, declarada). Nenhuma fixture de contrato (o servidor não mudou a resposta).
- [x] **T3 (integração)** — juntado à T1 (RN-244.02: Saída avulsa → retalho sem baixa → resumo, pela rota).
- [x] **T4** — Fase 5 (abaixo), `7bcb8f5c`; suítes completas e fechamento.

**Divergência:** a etapa previa mexer no motor (a baixa gravar o lote); a Fase 0 mediu que a baixa não existe para peça com série. A
estimativa foi revisada (`a4409686`). A única mudança de servidor veio da Fase 5 (`exigeSerie` na perna 1).

## Fase 5 (um revisor adversarial fresco, com sonda executada) — achados e o que foi feito

- **Achado 1 (real, reproduzido por sonda com gancho):** ligar a série entre a guarda (sem trava) e a baixa → SAIDA sem série (201, físico
  3, o estorno da baixa recusado). Anterior à etapa (Etapa 9). **Corrigido** (`7bcb8f5c`): `exigeSerie: true` na perna 1. Teste próprio
  (RN-244.05, gancho que dispara o `UPDATE` antes da SAIDA, do contexto do teste — não de dentro de seção): vermelho antes do conserto.
- **Achado 10 (lacuna de teste):** origem com lote **e** série sem `lote_origem_id` — a recusa tem de ser a da série. Teste novo; controle
  positivo: pular a guarda de série para material com lote → vermelho (vinha a do lote).
- **Achados 2 e 3 (reais, baixos — rastreio, não saldo):** no caminho ensinado a sobra fica sem lote de origem (a tela não manda lote no
  modo sem baixa); pela rota, um lote informado no modo sem baixa não é conferido contra a saída. **Declarados** (D (244) 2).
- **Achado 6 (muito baixo):** a lista de materiais é a da hora em que a tela abriu (série ligada com a página aberta → a recusa do servidor,
  como antes). Sem mudança. **4, 8, 9, 12:** ruído.

## Verificação (medida, serial, sobre o código final `7bcb8f5c`)

- `npm run test:api`: **637/637 arquivos** OK (636 da 243 + o `retalhoPecaComSerie` com 7 cenários). A primeira rodada (sobre `c73db29d`) foi
  interrompida para aplicar o conserto da Fase 5 sem mexer em produção com a suíte rodando; esta é a rodada inteira sobre `7bcb8f5c`.
- `test:almoxarifado` 44/0; `test:validation` 4/0; `test:safealter` 3/0; `test:sqlite` 16/0.
- Jest da tela: **236 suítes, 3178 testes** (3174 da 243 + 4 novos; rodado sobre `c73db29d` — a Fase 5 não tocou a tela); `CI=true
  react-scripts build`: *Compiled successfully*.

## Retro (4 números)

- Rodadas de correção até verde: 2 (Fase 2: `baixarEfetivo` e os casos novos; Fase 5: `exigeSerie`).
- Achados: Fase 2 — 2 reais (o controle positivo descrito errado no plano; `disabled` sozinho), 3 de texto/teste, 2 sem efeito; Fase 5 — 1
  real reproduzido e corrigido (anterior à etapa), 1 lacuna de teste, 2 reais de rastreio declarados, 1 muito baixo, 4 ruído.
- Paralelismo: T1 e T2 sequenciais (pequenas); a Fase 2 rodou junto com a escrita do teste de rota, a Fase 5 junto com o Jest da tela.
- Defeito que escapou: (preencher na etapa seguinte).

## Próxima tarefa detalhada

Item 4 da estimativa de 18/11 (`docs/estimativas/2026-11/estimativa_2026-11-18_cadastro-e-almoxarifado-semana.md`, 1h15): **a devolução
ao fornecedor de peça com número de série, pela não conformidade** (resto da **D (233)** 3). Módulo Almoxarifado.

- **Medir antes de prometer (Fase 0, sonda pela rota):** a execução da NC *Devolver ao fornecedor* (`nonConformityService.js`, passo 4,
  `registrarMovimentacao` DEVOLUCAO_FORNECEDOR com `{ exigeLote: true, exigeSerie: true }`, ~`:1664`) tem, na precedência, o **nível 6
  (RN-13)**: material com controle de série **recusa** (`EXEC_RECUSA.SERIE` — *"Material com controle de série não pode ser devolvido por
  aqui — dê baixa pela tela de Movimentações"*, `:173` e `:1397`). Se a sonda confirmar que não há baixa de peça com série por ali, é o
  **mesmo caso da 244**: revisar a estimativa pela skill (provável: aviso antecipado na tela da NC, ou só o teste de rota) e registrar na
  letra B. O `:1060` é DESBLOQUEIO (não é saída) — fora.
- **Contrato que consome:** a precedência da execução (`decidirEfeitoExecucao` ~`:1324`) e a rota de execução da NC; na tela, o botão de
  executar a devolução da NC (ver se já desliga/avisa para material com série antes de prometer fatia de tela).
- **Pontos de atenção:** a mesma corrida da Fase 5 da 244 (série ligada entre a precedência e o motor) já está fechada ali pelo
  `exigeSerie: true` da chamada; o lote vem da inspeção (`previsto.lote_id`), não das séries; as travas do CLAUDE.md.
- **O que já está pronto e não reabre:** o retalho (esta etapa), a devolução para Estoque/Quarentena (243), a devolução ao cliente (235/236)
  e a saída avulsa (234).
