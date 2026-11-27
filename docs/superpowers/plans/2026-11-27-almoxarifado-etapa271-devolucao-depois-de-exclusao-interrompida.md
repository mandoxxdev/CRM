# Etapa 271 — Devolução depois de uma exclusão interrompida (C553)

> Item **22** da estimativa de 23/11 (`docs/estimativas/2026-11/estimativa_2026-11-23_almoxarifado-semana.md`, 1h15, motor).
> Feature: `specs/modulo-almoxarifado/04-requisicoes` (C553) e `12-devolucoes`. Etapa anterior: 270.

## Fase 0 — medido antes de prometer

- O defeito **existe como descrito** (reproduzido com o teste da etapa, sobre `c3de7a14`, 7 de 8 cenários vermelhos):
  *A* 3, *B* 5 (padrão *A*); entrega de 6 (*A* 3, *B* 3, uma saída); a exclusão falha na 2ª ENTRADA (a requisição continua, físico 5);
  **Devolução** de 6 citando a saída → **201**; com a corrida dentro da trava (a exclusão interrompida enquanto a devolução espera a
  trava), físico **11** (o certo: 8 depois de excluir de novo).
- Onde: a régua do que já voltou de uma saída tem três peças (`devolucaoViva.js`): a devolução viva, as séries que voltaram por outra
  entrada (C253) — e **nenhuma** para a ENTRADA da exclusão interrompida. A ENTRADA da exclusão grava `requisicao_id`, `tipo = 'ENTRADA'`,
  `motivo = 'Estorno exclusão requisição <numero>'` (a mesma chave da B1609) e **não** cita a saída.
- As cinco contas da régua e quem precisa da peça nova:
  1. a validação da devolução (`returnService.validarSaidaOriginal`) — **precisa**;
  2. a gravação condicional (`INSERT … WHERE EXISTS`) — **precisa** (corrida validação × gravação);
  3. a reconferência dentro da trava (`reconferirNaTrava`) — **precisa** (corrida medida: físico 11);
  4. a lista das entregas devolvíveis (`listarSaidasElegiveis`) — **precisa** (senão a tela oferece 6 e a gravação recusa);
  5. o estorno da saída pelo livro (`stockService`) — **não precisa**: a saída de requisição já é recusada no estorno avulso
     (*"Movimentação vinculada a requisição — use os fluxos da requisição (exclusão/encerramento)"*);
  6. a própria exclusão (`requisitionService.excluirSemTrava`) — **não pode**: ela já pula o que entrou (B1609); contar aqui de novo
     descontaria duas vezes.
- Série: a ENTRADA da exclusão com séries reativa as séries e grava `series_entrada_anterior_almoxarifado.saida_anterior_id` — elas
  **já** entram em `seriesQueVoltaramSql`. A peça nova tem de ignorar a ENTRADA da exclusão que trouxe série (senão conta em dobro).

## Regras de negócio

- **RN-271.01** — A Devolução citando uma entrega de requisição desconta o que uma exclusão interrompida dessa requisição já devolveu ao
  estoque dessa entrega. Cenário: o medido acima → Devolução de 6 → **400** com a literal E1; nada gravado; físico 5.
- **RN-271.02** — Devolver o que falta (3) passa; excluir de novo depois não credita mais nada (B1609 continua): físico 8.
- **RN-271.03** — A lista das entregas devolvíveis mostra o mesmo saldo (`saldo_devolvivel` 3) e o campo novo `quantidade_exclusao` (3);
  sem exclusão, `quantidade_exclusao` 0 e o saldo de sempre. Na tela, o rótulo da entrega diz *"N já voltou/voltaram ao estoque pela
  exclusão interrompida da requisição"* (fatia visível).
- **RN-271.04** — Com várias entregas na mesma requisição, o que a exclusão devolveu é de cada entrega **na ordem dela** — a mesma ordem
  da exclusão (saídas por id, cada uma pelo líquido: entregue − devolução viva): entregas de 2 e 4, a exclusão para na 2ª → a 1ª fica sem
  nada a devolver, a 2ª com 4. Fórmula, por saída *s* (requisição *R*, material *M*):
  `exclusao(s) = max(0, min(liquido(s), E − Σ liquido(s') das saídas de R/M com id < s))`, com `E` = soma das ENTRADAs vivas da exclusão de
  *R*/*M* **sem série** e `liquido = max(0, quantidade − devolução viva)`.
- **RN-271.05** — Material com série: a ENTRADA da exclusão que trouxe séries não entra em `E` (as séries já contam como "voltaram por
  outra entrada"). Cenário: S1 S2 em *A*, S3 S4 em *B*, saída das 4, a exclusão para depois de *A* → devolver S3 S4 → 201.
- **RN-271.06** — A mesma conta na gravação condicional (a) e na reconferência dentro da trava (b). (a) a exclusão interrompida entre a
  validação e a gravação → 400 E1 (pela validação de novo, depois da gravação que não gravou); (b) a exclusão interrompida enquanto a
  devolução espera a trava do material → 400 E2, a linha apagada, físico 5.

## Contratos (congelados)

`POST /api/almoxarifado/devolucoes` — nenhum campo novo.
- **E1** (400, a de sempre, com um trecho novo só quando a exclusão devolveu algo): `Devolução acima do entregue: a saída <id> entregou
  <q>, já foram devolvidos <d>[, <v> já voltou|já voltaram ao estoque por uma entrada que não cita esta saída][, <e> já voltou|já voltaram
  ao estoque pela exclusão interrompida da requisição] e restam <r>` — sem exclusão, a literal **não muda**.
- **E2** (400, a de sempre): `A saída <id> mudou enquanto a devolução era gravada — nada foi gravado. Tente de novo.`

`GET /api/almoxarifado/devolucoes/saidas-elegiveis?material_id=` — campo novo por saída `quantidade_exclusao` (número, 0 sem exclusão);
`saldo_devolvivel = max(0, quantidade − quantidade_devolvida − quantidade_reentrada − quantidade_exclusao)`.

## Tasks

- [ ] **T1 (tronco, motor)** — `exclusaoInterrompidaSql(saidaSql)` em `devolucaoViva.js`; as quatro contas do `returnService`; teste
  `devolucaoDepoisDeExclusaoInterrompida.api.test.js` (integração pela rota: separação → entrega → exclusão interrompida → lista →
  devolução → exclusão). Controle positivo por sabotagem de cada conta.
- [ ] **T2 (galho, tela)** — o rótulo da entrega em `DevolucoesAlmoxarifado.js` + teste Jest.
- [ ] **T3** — Fase 5 (revisor fresco, adversarial, cenário reproduzido).
- [ ] **T4** — fechamento (`fechar-etapa`, sem 7½ e 8).

## Pontos de atenção

- A chave da ENTRADA da exclusão é a da B1609 (`motivo = 'Estorno exclusão requisição ' || numero`, `requisicao_id`, vivo). Mudar o
  motivo da exclusão quebra as duas juntas.
- O cenário sem exclusão interrompida não pode mudar (literal E1 igual, `quantidade_exclusao` 0).
- A ordem por id das saídas é a da exclusão (`ORDER BY m.id`); a exclusão pula a saída com líquido 0.
