# Etapa 268 — "Sai de" com lote e a parte separada sem lote (C498) e a janela de entrega que limita a quantidade de outra prateleira (B1579)

> Itens **16** e **17** da estimativa da semana (`docs/estimativas/2026-11/estimativa_2026-11-23_almoxarifado-semana.md` — 1h15 + 45 min; não
> refeita). A "próxima tarefa detalhada" do plano da 267.
> **Fatia visível:** na janela de **Entregar**, escolhendo no **Sai de** uma prateleira diferente da separação, aparece *"Daqui podem sair até N
> un."*, a quantidade acima disso desce para N, e o **Confirmar Entrega** fica apagado enquanto alguém digita mais do que sai dali.

## Fase 0 — medido (sonda `server/tests/api/zzsonda268.api.test.js`, apagada antes do commit, sobre `8682f8cc`)

### Item 16 (C498, B1410) — **já funciona; o C498 estava errado**

O C498 dizia que a parte separada de *A* **sem lote** era *"qualquer lote em A"* e que a entrega com **Sai de** (*A*, *L1*) a levava. Medido:

- Material com lote, *A* com *L1* 4 e *L2* 2 (sem linha sem lote): R1 separa 4 com `localizacao_origem_id` = *A* e sem `lote_id` → **400**
  *"⟨material⟩: O saldo em S8-A (0) não cobre a quantidade (4) — a saída tiraria de outros endereços"*. A separação com endereço e sem lote
  confere o físico do par **exato** (*A*, sem lote) — a linha sem lote de *A* —, nunca o endereço inteiro. Não há como guardar "qualquer lote em
  *A*".
- A parte sem lote só existe sobre a **linha sem lote** (material que ganhou controle de lote com saldo antigo): *A* sem lote 3, *A/L1* 4, *B/L1*
  5. R1 separa 3 de *A* sem lote (200; origem *A*, lote NULL, parte 3). O **Sai de** de R2 mostra *A* sem lote *"sobra 0"* e *A/L1* *"(4)"*. R2
  entrega 4 com **Sai de** (*A*, *L1*) → 200, sai de *A/L1* (*A* sem lote continua 3); R1 entrega num clique → 200, sai da linha sem lote. O
  mesmo com as duas peças na mesma requisição (B1410). **Nenhuma recusa "não serve mais".**
- **Por quê:** a linha sem lote e a linha do lote são pares diferentes no saldo e no motor (a saída estrita por (*A*, *L1*) só baixa a linha de
  *L1*; a de (*A*, sem lote), só a sem lote). A régua exata (B1410) é a certa.

**Sem código para o caso medido.** Ficam a prova permanente (teste) e a correção dos documentos (C498 e B1410 diziam o contrário).
*(**Fase 2, achado 3 — a conclusão acima estava incompleta.** O C498 existia por outro caminho: a peça com a origem guardada em (*A*, sem lote)
escolhendo ela mesma o **Sai de** (*A*, *L1*). Para a troca (Etapa 63) é a mesma origem ("qualquer lote ali"), então a entrega não conferia a
E1 — só o físico de (*A*, *L1*) — e levava a guarda de outra requisição em (*A*, *L1*). Reproduzido: R1 guardou 3 em (*A*, sem lote), R3 2 em
(*A*, *L1*); R1 entrega 3 com **Sai de** (*A*, *L1*) → **200**, *A/L1* 1; R3 num clique → 400 *"… a origem da separação (SL-A) não serve mais (O
saldo em SL-A (1) não cobre a quantidade (2) …"*. Consertado — **B1638**, RN-268.05.)*

### Item 17 (D (251) 1, B1579) — confirmado

`RequisicoesList.js`: o máximo da quantidade na janela de entrega é `maxEntregaNaTela(item, outros, outrosNoLote)` — o pendente, o entregável do
servidor e a divisão da 251 — e **não olha a opção escolhida no Sai de**. O `max` do campo não impede digitar, e nada segura o **Confirmar
Entrega**. Escolhendo uma prateleira com *"sobra 2"* para 4 → a entrega vai ao servidor e volta a E1 *"… sobra 2, que não cobre a quantidade
(4). …"*. A separação já tem a régua da opção (`maxSeparavelNaTela`, a sobra menos o planejado), usada para o motivo de divergência.

## Decisões

- **B1634 (item 16)** — sem código: a parte separada sem lote é da **linha sem lote** do endereço (a separação confere o par exato), e a saída
  por (*A*, *L1*) nunca toca essa linha. **O C498 estava errado** ("qualquer lote em A"; "conserto: contar a parte sem lote em todo lote do
  endereço") e a B1410 ("o mesmo limite… → C498") também, na parte que dizia ser um limite. **Descartado:** o caminho reversível do plano da 267
  ("descontar a parte sem lote do total do endereço") — descontaria de *A/L1* uma guarda que está na linha sem lote, recusando entregas que
  não levam nada de ninguém. **Reversível** (nada mudou). *(Fase 2: vale para o par exato; o caminho da própria peça sem lote escolhendo o lote é a B1638.)*
- **B1638 (item 16, Fase 2 achado 3)** — a entrega da peça com origem guardada **sem lote** escolhendo no **Sai de** um **lote** no mesmo endereço
  passa a ser conferida como o caso (c): a E1 do par escolhido (a guarda de outras caixas e dos irmãos em (*A*, *L1*)). A troca e a parte continuam
  as da Etapa 63 (é a mesma origem para o registro). **Descartado:** (a) chamar de troca (mudaria o registro e a parte que fica, sem ganho para a
  recusa); (b) descontar da linha sem lote (a parte está lá, mas o motor baixa a do lote). Fora: a planejada aplicada num clique com o lote vindo
  das séries (D (268)). **Reversível** (uma condição no caso (c)).
- **B1635 (item 17)** — o limite só vale quando o **Sai de** é uma **prateleira da lista diferente da origem da separação do item** (ou o item
  não tem origem guardada) — o caso (c) da entrega, onde o servidor confere a E1 (a sobra do par menos a guarda que fica dos outros itens desta
  requisição e o que eles pedem dali) e, com peça presa no lote, a régua do lote da 218. Com a própria origem, automático, *"Escolha de onde
  sai"* ou *"Planejada da separação"*: como hoje. **Descartado:** limitar também a própria origem — a porta não confere a E1 nela (caso (a)/(b),
  só o físico), e a tela recusaria o que a entrega aceita. **Reversível.**
- **B1636 (item 17)** — a conta da tela é um **teto** (pode prometer mais, nunca menos — a regra da 218): o outro item desta requisição com
  origem guardada no par conta pelo que **fica** lá no pior caso (*parte − quantidade dele nesta entrega*, nunca menos que 0); o que sai do par
  nesta entrega (outro item com o mesmo **Sai de**, ou com a própria origem ali, até a parte) conta inteiro. **Descartado:** reler a conta do
  servidor por escolha (uma rota nova a cada clique; a B1579 já tinha descartado duas réguas divergentes — esta é a mesma conta da E1 com o que
  a tela sabe).
- **B1637 (item 17)** — como limita: (1) ao **escolher** a prateleira, a quantidade acima do limite desce para ele (se o limite for 0, fica como
  está — zerar tiraria o item da entrega sem o almoxarife ver); (2) a linha *"Daqui podem sair até N un."* aparece sob o **Sai de** sempre que o
  limite é menor que o máximo do item; (3) digitado acima, a frase vira aviso e o **Confirmar Entrega** fica apagado. **Descartado:** só avisar
  (a recusa continuaria a um clique) e travar o campo no limite (o `max` do navegador não segura o digitado).

## Regras de negócio

### Item 16 — a parte sem lote é da linha sem lote (prova, sem código)

- **RN-268.01** Material com controle de lote: a separação com endereço e **sem** lote confere o físico da linha **sem lote** do endereço. *A*
  só com lotes → 400 *"⟨material⟩: O saldo em ⟨A⟩ (0) não cobre a quantidade (4) — a saída tiraria de outros endereços"*, nada gravado.
- **RN-268.02** Com a linha sem lote (*A* sem lote 3, *A/L1* 4, *B/L1* 5): R1 separa 3 de *A* sem lote; R2 (outra requisição) entrega 4 com
  **Sai de** (*A*, *L1*) → 200, sai de *A/L1*; R1 entrega num clique → 200, sai da linha sem lote; o livro: SAÍDA 4 de *A/L1* e SAÍDA 3 de *A*
  sem lote. Pela rota e pelo serviço.
- **RN-268.03** O mesmo com as duas peças na **mesma** requisição (B1410).
- **RN-268.04** O **Sai de** de R2 (`GET /estoque/:m/saldos?requisicao_id=R2`) mostra *A* sem lote com `separado_outras` 3 e `sobra` 0, e *A/L1*
  com `separado_outras` 0 e `sobra` 4.
- **RN-268.05 (Fase 2, B1638)** R1 guardou 3 em (*A*, sem lote); R3 guardou 2 em (*A*, *L1*) (físico 4). R1 entrega 3 com **Sai de** (*A*, *L1*)
  → **400** antes de qualquer baixa, nada gravado: *"⟨material⟩: em SL-A, lote L1 há 4 para esta entrega, mas 2 já está separado dali para outra
  requisição (⟨R3⟩); sobra 2, que não cobre a quantidade (3). Escolha outro endereço ou deixe "Qualquer endereço (automático)""*. Com 2 → 200 e R3
  entrega num clique. Sem a guarda de R3: 200 (nenhuma recusa nova). Pela rota e pelo serviço.

### Item 17 — a janela de entrega limita a quantidade de outra prateleira (tela)

- **RN-268.10** Janela de entrega, item com o **Sai de** numa opção da lista (endereço, lote) diferente da origem da separação dele (ou item sem
  origem guardada): o máximo do item passa a ser o menor entre o de hoje (`maxEntregaNaTela`) e o **limite da opção**:
  `sobra da opção − ocupado pelos outros itens desta requisição no par`, e, com `lote_livre` na opção (lote com peça presa), também
  `lote_livre − ocupado pelos outros itens no lote`. *(Fase 2, achados 3 e 4: "diferente da origem" é o par **exato** — a origem sem
  lote com o **Sai de** num lote é caso (c) desde a B1638; e na própria origem a porta confere a E1 acima da parte, então ali o teto é
  `max(parte, a conta)`, não "sem limite". A B1635 dizia "a porta não confere a E1 nela" — **estava errado** acima da parte.)* Ocupado por outro item *j* no par *P* (B1636): se a origem guardada de *j* é *P* —
  `max(0, parte_j − q_j)` (o que fica) + o que *j* tira de *P* nesta entrega; senão, o que *j* tira de *P* (q_j quando o **Sai de** dele é *P*).
  *j* tira de *P* = `q_j` com **Sai de** = *P*; `min(q_j, parte_j)` sem escolha nem automático com origem guardada *P* (o servidor aplica a
  planejada); 0 nos outros casos. No lote, a mesma conta pelo lote da opção (origem guardada no lote; **Sai de** com o lote).
- **RN-268.11** Escolher a opção com a quantidade acima do limite → a quantidade desce para o limite (limite > 0). Limite 0 → a quantidade fica.
- **RN-268.12** Limite menor que o máximo de hoje → sob o **Sai de**, *"Daqui podem sair até ⟨N⟩ ⟨un⟩."* (`id="entrega-limite-origem-⟨item⟩"`).
  Quantidade acima do limite → a frase vira *"Daqui só podem sair ⟨N⟩ ⟨un⟩ nesta entrega. Diminua a quantidade ou escolha outro endereço."*
  (cor de aviso), e o **Confirmar Entrega** fica apagado com o título *"Diminua a quantidade: o endereço escolhido não tem tudo isso"*.
- **RN-268.13** **Sai de** = a origem da separação do item, automático, *"Escolha de onde sai"*, *"Planejada da separação"*, ou opção impedida:
  como hoje (nenhum limite, nenhuma frase nova).
- **RN-268.14** A lista relida (a releitura na recusa da 267) muda o limite sem fechar a janela; a quantidade não desce sozinha (só no gesto de
  escolher, RN-268.11) — a frase de aviso e o botão apagado bastam.
- **RN-268.15 (fluxo da janela, fronteira HTTP)** Item 1 separou 4 de *B-01*; *B-02* tem 6, 2 separados por outra requisição (*"sobra 4 de 6;
  2 para outras"*). Item 1 escolhe *B-02* com 5 digitado → desce para 4 e a frase *"Daqui podem sair até 4 un."*; digita 5 → aviso e botão
  apagado; volta a 4 e confirma → o PUT leva `localizacao_origem_id` de *B-02*, `quantidade_atendida` 4. Com outro item da mesma requisição com
  origem guardada em *B-02* (parte 1, nada a entregar nesta rodada) → o limite é 3.

## Contratos (congelados)

- Servidor: nenhum contrato novo (item 16 sem código; item 17 só tela). `GET /estoque/:m/saldos?requisicao_id=` já devolve `sobra`,
  `separado_outras`, `lote_livre` (Etapas 201 e 218).
- Tela (`RequisicoesList.js`): funções novas `limiteDaOrigemNaEntrega(item, valor, saldos, itens, quantidades, origens)` → número ou `null`
  (sem limite) e `entregaAcimaDaOrigem()`; exportada `limiteDaOrigemNaEntrega` para o teste de unidade.
- Frases literais (RN-268.12): *"Daqui podem sair até N un."*, *"Daqui só podem sair N un. nesta entrega. Diminua a quantidade ou escolha outro
  endereço."*, título *"Diminua a quantidade: o endereço escolhido não tem tudo isso"*. N com `fmtQtd` (pt-BR); unidade `item.unidade ||
  item.material_unidade` (sem unidade: sem o sufixo).

## Tasks (sort topológico)

- [x] **T1 (galho, prova do item 16, servidor)** — `9c26e962` (6/6; sabotagens: a conferência física sem o lote exato → RN-268.01 cai;
  a sobra do Sai de pelo endereço inteiro → RN-268.04 cai; a âncora da primeira contou 2 — refeita com âncora única, mesmo resultado) — `server/tests/api/saiDeComLoteParteSemLote.api.test.js` (RN-268.01..04, rota e serviço).
  Controle positivo: sabotar a régua do par exato na conferência física da separação (`checarOrigemItem`, `lote_id IS ?`) — RN-268.01 cai; e a
  chave do lote no `parteGuardadaDeOutrasPorPar` (NULL vira o lote) — RN-268.04 cai.
- [x] **T2 (galho, tela do item 17)** — `0ac0fd70` (9/9; 8 sabotagens, todas caem: sem limite 9, sem a descida 3, sem o botão 2, sem a
  própria origem 2, sem o "fica" do irmão 2, sem o lote 1, descida com teto 0 1, sem o aviso do botão 2) — `RequisicoesList.js` + `client/src/components/almoxarifado/RequisicoesEntregaLimiteDaOrigem.test.js`
  (RN-268.10..15). Controle positivo: tirar o limite do `max`/da regra (RN-268.10 cai), tirar a descida na escolha (RN-268.11), tirar o aviso do
  botão (RN-268.12), tirar a exceção da própria origem (RN-268.13), tirar a parcela "fica" do irmão (RN-268.15).
- [x] **T1b (tronco, servidor, nasceu na Fase 2)** — `1a2dfc81` — RN-268.05 (B1638): `loteForaDaGuarda` no `marcaC` da entrega. 4 cenários
  (10/10 no arquivo); o RN-200.04 (b') de `entregaSaiDeRespeitaSeparado` registrava o caso e passou a esperar a E1 (26/26). Sabotagem: sem a
  condição → RN-268.05 e RN-268.05 serviço caem, e o RN-200.04 (b').
- [x] **T3** — Fase 5 (um achado, registrado — C555); documentos (`fechar-etapa`), suítes, estimativa.

T1 e T2 independentes (T1 só prova o servidor; T2 lê campos que já existem).

## Fase 2 (revisor fresco, uma passada, sobre o plano `8315a69f`)

- **(3) importante, reproduzido e absorvido** — a própria peça com origem (A, sem lote) escolhendo (A, L1): a entrega a tratava como a
  própria origem (Etapa 63) e só conferia o físico — R1 3 por (A, L1) → 200, levando as 2 de R3; R3 depois "não serve mais". O item 16 **não
  estava todo feito**. → B1638, RN-268.05, `1a2dfc81`. A tela: "a própria origem" é o par **exato** (o servidor agora concorda).
- **(4) menor, absorvido** — a B1635 dizia "a porta não confere a E1 na própria origem": **errado** acima da parte (B1408) e com a parte zerada.
  → na própria origem o teto é `max(parte, a conta)`; sem parte, a conta.
- **(5) menor, absorvido** — `parte_j` é `pendentePlanejado` (min(parte, caixa)), como o servidor.
- **(1)/(2) menores, absorvidos** — a unidade é a do item (sem unidade, sem sufixo); o título do botão: o da escolha impedida primeiro.
- **(6), (7), (8) menores, registrados** — o Ajuste que tira o saldo sem lote sob uma separação (D (268) 4); série com a quantidade que desce
  (o contador *"Escolha exatamente N série(s)"* já avisa); o detalhe relido com a janela aberta volta o número cheio (D (268) 3).
- T1 e T2 independentes: confirmado.

## Fase 5 (um revisor fresco, sondas `zzf5-268-*`, apagadas, sobre `0ac0fd70` e o servidor ainda sem commit — hoje `1a2dfc81`)

1. **[médio, reproduzido, registrado — C555]** Lote com peça presa (podem sair 5), item *i* sem origem e item *k* com 4 em (ZA, L): a mesma
   entrega (*i* 3 de ZB/L, *k* 2 de ZC/L) dá **200** com *i* antes de *k* e **400** com *k* antes — a conferência do lote da 218 soma o
   `jaPedido` só dos itens anteriores. A janela dá 1 para *i* (soma o que fica e o que sai de *k*) — mais apertada que a ordem que passa,
   igual à que recusa. **Não consertado aqui** (é da 218, ~1 h): a janela fica com a conta segura e a B1636 ganhou a exceção escrita.
- Tentado e não quebrou: a guarda do próprio item não conta duas vezes; irmão com guarda em (A, sem lote) não pesa em (A, L1); troca e
  motivo iguais; saldo negativo permitido; irmão no automático, pela planejada acima da parte, com o Sai de na própria origem; `lote_livre`
  só com peça presa; série (`lote_livre` nulo); a quantidade gravada como número no estado (todo uso passa por `parseFloat`).

## Divergências do plano

- **Item 16** — a Fase 0 dizia "já funciona; sem código". **Estava incompleto** (Fase 2, achado 3): o caso que o C498 descrevia não existe,
  mas o efeito existia pela própria peça sem lote escolhendo o lote → T1b, `1a2dfc81`.
- **B1635** — "nenhum limite na própria origem" virou `max(parte, a conta)` (Fase 2, achado 4).
- **B1636** — "nunca menos que a porta aceita" tem uma exceção (C555, Fase 5): a conferência do lote depende da ordem dos itens.
- O RN-200.04 (b') (Etapa 200) registrava o C498 pela própria peça e passou a esperar a E1.
- **CLAUDE.md:** nenhuma linha ficou errada — a conferência nova roda dentro da passada do caso (c), sob as duas travas da entrega.

## Próxima tarefa detalhada

O item **18** da estimativa de 23/11 (`docs/estimativas/2026-11/estimativa_2026-11-23_almoxarifado-semana.md`):

1. **Item 18 — Entrega com o lote ainda em inspeção (C485, B1386; 1h15, motor).** `requisitionService.js`, a passada do automático com lote
   impedido (~`if (!impedidos.length) continue`): a falta que vem de peça **em inspeção** (não de lote impedido) sai sem lote, negativa. Caminho
   reversível do C485: tratar a falta vinda de inspeção como a do lote impedido (sai o que cobre, diz o resto). Sonda antes: material com
   lote, *L1* 4 com 3 em inspeção, sem outro saldo; requisição de 4 separada no automático; entregar 4 → hoje? (medir: 200 com saldo sem lote
   negativo, ou 400). A régua de inspeção mora em `lotesParaOAutomatico` (`emInspecao`) e no `retidoDoLote.situacaoDosLotes`. Roda sob as duas
   travas. Atenção: a parte guardada de outra caixa (Etapa 197) fica como está se a sonda mostrar regressão — declarar.
- **O que já está pronto e não reabre:** o limite da janela de entrega (esta etapa); a peça sem lote com o Sai de num lote (B1638).
- Candidatos fora da estimativa: **C555** (a conferência do lote somar o pedido de todos os itens, ~1 h); série com só o lote (D (267) 1); a
  entrega num clique com o lote das séries sobre origem sem lote (D (268) 1).

## Pontos de atenção

- O limite é teto: nunca menor que o que a porta aceita (B1636). Onde a tela não sabe (a parte que fica de um irmão que sai de outro lugar é
  `min(parte, caixa − q)` no servidor), usa a menor que pode ser.
- O campo de quantidade fica livre (B1637); a descida só no `onChange` do **Sai de**.
- O botão de um clique não abre a janela e não é tocado.

## Verificação (medida sobre o código final, `1a2dfc81`/`0ac0fd70`; os documentos não mudam código)

- `npm run test:api` (sozinho, `NODE_OPTIONS=--max-old-space-size=4096`): **677/679 arquivos OK** — os 2 que falham são os já conhecidos de
  proposta, de outra máquina (`propostaBilingueTemplate` 7/1, `propostaPdfExigeLogin` 3/1); o mais lento: `propostaClausulasGrava`, 79,9 s.
- `npm run test:almoxarifado`: **44 passou, 0 falhou**. `test:validation` **4/0**, `test:safealter` **3/0**, `test:sqlite` **16/0**.
- Jest da tela (`--maxWorkers=2`): **258/258 suítes, 3386/3386 testes**. `CI=true npx react-scripts build`: **Compiled successfully.**
- `saiDeComLoteParteSemLote` 10/10; `entregaSaiDeRespeitaSeparado` 26/26; `RequisicoesEntregaLimiteDaOrigem` 9/9; o subconjunto de
  entrega/lote/separação/requisição/fila (156 arquivos) verde. Sabotagens: 3 no servidor, 8 na tela (âncora contada = 1, cópia, md5 sabotado ≠
  original e restaurado = original).
- Nenhum clique no navegador (F (268)).

## Retro (4 números)

- Rodadas de correção até verde: 1 (Fase 2 — a peça sem lote escolhendo o lote, B1638, e o teto da própria origem).
- Achados: Fase 2 — 1 importante reproduzido e consertado, 4 menores absorvidos, 3 registrados; Fase 5 — 1 médio reproduzido, de antes da etapa
  (C555), registrado e não consertado; nenhum ruído.
- Paralelismo: T1 e T2 em série (um executor); as revisões rodaram enquanto o código e os documentos andavam.
- Defeito que escapou: (preencher na etapa seguinte). Da 267: nenhum apontado.
