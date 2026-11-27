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

**Sem código.** Ficam a prova permanente (teste) e a correção dos documentos (C498 e B1410 diziam o contrário).

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
  não levam nada de ninguém. **Reversível** (nada mudou).
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

### Item 17 — a janela de entrega limita a quantidade de outra prateleira (tela)

- **RN-268.10** Janela de entrega, item com o **Sai de** numa opção da lista (endereço, lote) diferente da origem da separação dele (ou item sem
  origem guardada): o máximo do item passa a ser o menor entre o de hoje (`maxEntregaNaTela`) e o **limite da opção**:
  `sobra da opção − ocupado pelos outros itens desta requisição no par`, e, com `lote_livre` na opção (lote com peça presa), também
  `lote_livre − ocupado pelos outros itens no lote`. Ocupado por outro item *j* no par *P* (B1636): se a origem guardada de *j* é *P* —
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

- [ ] **T1 (galho, prova do item 16, servidor)** — `server/tests/api/saiDeComLoteParteSemLote.api.test.js` (RN-268.01..04, rota e serviço).
  Controle positivo: sabotar a régua do par exato na conferência física da separação (`checarOrigemItem`, `lote_id IS ?`) — RN-268.01 cai; e a
  chave do lote no `parteGuardadaDeOutrasPorPar` (NULL vira o lote) — RN-268.04 cai.
- [ ] **T2 (galho, tela do item 17)** — `RequisicoesList.js` + `client/src/components/almoxarifado/RequisicoesEntregaLimiteDaOrigem.test.js`
  (RN-268.10..15). Controle positivo: tirar o limite do `max`/da regra (RN-268.10 cai), tirar a descida na escolha (RN-268.11), tirar o aviso do
  botão (RN-268.12), tirar a exceção da própria origem (RN-268.13), tirar a parcela "fica" do irmão (RN-268.15).
- [ ] **T3** — Fase 5; documentos (`fechar-etapa`), suítes, estimativa.

T1 e T2 independentes (T1 só prova o servidor; T2 lê campos que já existem).

## Pontos de atenção

- O limite é teto: nunca menor que o que a porta aceita (B1636). Onde a tela não sabe (a parte que fica de um irmão que sai de outro lugar é
  `min(parte, caixa − q)` no servidor), usa a menor que pode ser.
- O campo de quantidade fica livre (B1637); a descida só no `onChange` do **Sai de**.
- O botão de um clique não abre a janela e não é tocado.
