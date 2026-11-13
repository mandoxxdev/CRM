# Etapa 223 — as listas de saldo dizem quanto está em lote impedido (C481, 2ª parte)

> Usando a skill `desenvolver-etapa`. Ponto de partida: a "Próxima tarefa detalhada" de
> `docs/superpowers/plans/2026-11-13-almoxarifado-etapa222-extrato-lote-impedido.md` (`:204-228`). Estimativa já commitada:
> `docs/estimativas/2026-11/estimativa_2026-11-13_almoxarifado-listas-lote-impedido.txt` (**2h30**, `19471d77`). Números de linha
> medidos sobre `fbdf485c`. A Fase 0.0 (`controle-horas`) não rodou: o pedido desta etapa mandou executá-la inteira (e pular o Passo 7½).

## Objetivo (em linguagem simples)

Desde a 222 o **extrato** de um material diz quanto do estoque está em lote **bloqueado**, **reprovado** ou **vencido** (o cartão *Em lote
impedido*). Mas quem olha a **lista** de materiais não vê isso: só descobre abrindo material por material. Depois desta etapa, a lista da
tela **Materiais** mostra, embaixo da *Quantidade*, *"6 un em lote impedido"* (só quando há), e a lista de materiais da **Nova Reserva**
mostra *"(Disponível: 10 un) · 6 em lote impedido"*. O *Disponível* não muda (B1476).

## Fase 0 — medido em 2026-11-13 (sobre `fbdf485c`)

1. **A premissa da próxima tarefa da 222 estava errada (regra 5).** Ela dizia que `GET /estoque` é consumido por "Materiais/Estoque (a
   coluna *Disponível*)". **Não existe tela "Estoque"**, e a tela **Materiais** (`MateriaisAlmoxarifado.js:123` → `TabelaMateriais.js`) lê
   `GET /api/almoxarifado/materiais` (`routes/almoxarifado.js:430`, `listarMateriais`), cuja coluna *Quantidade* (`TabelaMateriais.js:181-192`)
   é o **físico** (`quantidade_atual`) com *Mín · Máx* — sem *Disponível*. `GET /estoque` (`stockService.consultarEstoque`, `:3988`) só é
   lido por **Reservas** (`ReservasAlmoxarifado.js:141`, a lista do `<select>` da Nova Reserva, `:520-522`) e **Inspeções**
   (`InspecoesAlmoxarifado.js:179`, `quantidade_bloqueada`). Os relatórios somam o disponível pelo `reportService` (outra SQL, colunas fixas
   no registro). Corrigido no plano da 222 com a nota "estava errado".
2. **`listarMateriais` é compartilhada** com `GET /api/compras/materiais/cadastro` (`routes/almoxarifado.js:513`, a tela Materiais do
   Compras, `MateriaisCompras.js:65` — o mesmo `TabelaMateriais`) e é lida por **18** chamadas no cliente (seletores de várias telas).
3. **Custo medido** (`e223-custo.js` no scratchpad; cópia do banco de dev **inflada** a 3.022 materiais ativos, 904 com controle de lote,
   4.505 lotes, 180 mil movimentos; mediana de 15 rodadas; `e223-escala.js` infla): `/estoque` **90 → 125 ms**; a SQL do `/materiais`
   **79 → 114 ms**. **+35 ms** na lista inteira. O banco de dev real (22 materiais, 4 com lote): 0,8 → 1,4 ms. Abaixo do limite de ~200 ms
   que a próxima tarefa pôs.
4. **Testes que comparam chaves:** `comprasCadastroMaterial.api.test.js:159` compara as chaves do `PUT` do Compras com as do almoxarifado
   (mesmo handler — não muda); nenhum teste compara o conjunto de chaves das linhas de `/estoque` ou de `/materiais` (procurado por
   `Object.keys`/`deepStrictEqual` em `tests/api`).
5. **A régua** `loteImpedido.loteImpedidoSql('m')` (205 + 217) e o campo do extrato (222) estão prontos e não reabrem.
6. **Trava:** só leitura, sem trava (como o extrato). O número pode estar um instante velho — é exibição; quem reserva/sai relê sob a trava.

## Caminhos

- **(escolhido) `/estoque` sempre com `lote_impedido`; `/materiais` só com `?com_lote_impedido=1`** (opt-in), mandado só pela tela
  Materiais do almoxarifado. Selo embaixo da *Quantidade* e sufixo no `<option>` da Nova Reserva, só com `> 0`.
- **(descartado) `/materiais` sempre com o campo.** Os +35 ms caem nas 18 chamadas (seletores que não mostram o número) e na tela do
  Compras, que é cadastro. Opt-in custa um parâmetro.
- **(descartado) `/estoque` opt-in.** Dois leitores só (Reservas, que mostra; Inspeções, +35 ms a 3 mil materiais), abaixo do limite.
- **(descartado) Coluna nova *Disponível* na lista de Materiais.** Mudaria a tela além do pedido; a lista mostra o físico e o selo diz quanto
  dele está em lote impedido **fora o já bloqueado** (a régua tira a `quantidade_bloqueada` — Fase 2 I1: a 1ª versão dizia "quanto dele está
  preso", e com `quantidade_bloqueada` 2 sem lote o selo diz 4 enquanto **Lotes e Séries** mostra o lote com 6; a dica agora diz "fora o que
  já está bloqueado" e aponta o extrato, que mostra os dois).
- **(descartado) A Nova Reserva ler o número da lista e deixar de buscar o extrato (B1478).** A lista é carregada ao abrir a tela; o extrato
  é buscado ao escolher o material — mais novo. O `<option>` mostra o da lista; a frase sob a quantidade continua a do extrato.

## Decisões (letra B — reversíveis; livres depois de **B1479**, **C528**, **A116**, conferido por `grep` em `docs` e `specs`)

- **B1480 — `GET /estoque` devolve `lote_impedido` em toda linha** = `loteImpedidoSql('m')` com o "hoje" de Brasília, no mesmo `SELECT`;
  0 sem controle de lote. Aditivo. Medido: +35 ms a 3 mil materiais. Descartado: opt-in (acima).
- **B1481 — `GET /materiais` (e `/api/compras/materiais/cadastro`, o mesmo handler) devolve `lote_impedido` só com `com_lote_impedido=1`**
  (texto exato `'1'`; outro valor = sem o campo, sem 400 — como o `incluir_clientes` do `/estoque`). Sem o parâmetro, a resposta é **a
  mesma de hoje** (a chave nem aparece). Só a tela Materiais do almoxarifado manda. Descartado: sempre (custo nas 18 chamadas); rota nova
  (contrato novo para uma coluna).
- **B1482 — a lista de Materiais mostra o selo `⟨n⟩ ⟨un⟩ em lote impedido`** embaixo do *Mín · Máx*, cor de atenção (a mesma do cartão
  do extrato), com a dica (`title`) *"Em lote bloqueado, reprovado ou vencido: não sai para uso até o lote ser liberado na tela Lotes e
  Séries."*; só com `Number.isFinite(Number(n)) && n > 0`. Sem unidade, sem o espaço. A tela do Compras não manda o parâmetro → o campo não
  vem → nada aparece lá (o componente é o mesmo). Descartado: mostrar também no Compras (é cadastro; a regra 12/11 diz que o almoxarifado
  movimenta e o Compras cadastra — o saldo preso é assunto do almoxarifado).
- **B1483 — o `<option>` da Nova Reserva ganha ` · ⟨n⟩ em lote impedido`** **depois** do parêntese do *Disponível* (fora dele — o impedido
  pode passar do disponível, B1381/B1471; dentro do parêntese pareceria parte dele, Fase 2 M2), só com `n > 0` (finito). A frase sob a quantidade (B1478) continua lendo o extrato. Descartado: trocar a busca do extrato pela lista (acima).
- **C529 (aviso) — o número da lista pode estar um instante velho.** A lista é lida ao abrir/filtrar a tela; um lote bloqueado ou liberado
  depois só aparece ao recarregar. Exibição; a reserva/saída relê. (O mesmo da lista de *Disponível* de sempre.)

## Regras de negócio (RN-223.xx)

| RN | Enunciado | Cenário |
|---|---|---|
| RN-223.01 | `/estoque` diz quanto está em lote impedido; o Disponível não muda | material `un` com controle de lote, L1 ATIVO 4 + L2 BLOQUEADO 6: a linha dele em `GET /estoque` tem `lote_impedido === 6` e `quantidade_disponivel === 10` |
| RN-223.02 | REPROVADO e vencido também; vencido liberado, o que vence hoje, sem controle de lote e sem lote impedido → 0 | em `/estoque`: (a) REPROVADO → 6; (b) vencido ontem → 6; (c) (b) + liberar vencimento → 0; (d) vence hoje → 0; (e) `controle_lote = 0` com lote BLOQUEADO → 0; (f) só ATIVO → 0 |
| RN-223.03 | Em toda linha de `/estoque` o campo existe e é a régua | para todas as linhas: `lote_impedido` presente e == `SELECT loteImpedidoSql('m') … WHERE id = ?` (inclusive com `quantidade_bloqueada = 2` sem lote conhecido → 4) |
| RN-223.04 | Material de cliente em `/estoque` (`incluir_clientes=1` e `proprietario_cliente_id=`) traz o campo | cliente com L2 BLOQUEADO 6 → 6 nos dois filtros |
| RN-223.05 | `/materiais` sem o parâmetro: a resposta de hoje, sem a chave | `GET /materiais` → nenhuma linha tem `lote_impedido`; `?com_lote_impedido=0`, `=true` → idem |
| RN-223.06 | `/materiais?com_lote_impedido=1` traz o campo = régua, inclusive com os outros filtros | linha do material da .01 → 6; com `search=` e `status=inativo` também (material inativado com L2 BLOQUEADO → 6); toda linha == régua |
| RN-223.07 | Integração: lista, extrato e reserva dizem o mesmo número; liberar zera as três leituras | L1 4 + L2 BLOQUEADO 6: `/estoque` 6, `/materiais?com_lote_impedido=1` 6, extrato 6, reserva de 5 recusada com `… Não entram 6 un …`; `PUT /lotes/L2/status ATIVO` → as três 0; reserva de 5 → 201 |
| RN-223.08 | Tela Materiais: o selo só com número; a tela pede o campo | linha `lote_impedido: 6`, `unidade: 'PC'` → `6 PC em lote impedido` (classe `almox-lista-lote-impedido`, `title` literal); `unidade` nula → `6 em lote impedido`; `0`, ausente, `null`, `'abc'` → nenhum selo, e a linha mostra a quantidade; a busca vai com `params.com_lote_impedido === 1` |
| RN-223.09 | Tela Materiais do Compras: não pede o campo | a chamada de `MateriaisCompras` vai sem `com_lote_impedido` |
| RN-223.10 | Nova Reserva: o `<option>` diz o número só com > 0 | `quantidade_disponivel 10`, `lote_impedido 6`, `unidade 'un'` → texto `E-1 — Mat (Disponível: 10 un) · 6 em lote impedido`; `quantidade_disponivel 0` com `lote_impedido 6` → `… (Disponível: 0 un) · 6 em lote impedido`; `0`/ausente → `… (Disponível: 10 un)` (o de hoje) |

## Contratos congelados

**`GET /api/almoxarifado/estoque`** — query igual à de hoje. Resposta: o array de hoje, cada linha com **um campo a mais**: `lote_impedido`
(número ≥ 0, arredondado a 1e-6; 0 sem controle de lote). Erros iguais (500 pelo `handleError`). Sem mudança de autorização.

**`GET /api/almoxarifado/materiais`** (e `GET /api/compras/materiais/cadastro`, o mesmo handler) — query de hoje **+ `com_lote_impedido`**
opcional: só o texto `'1'` liga; com ele, cada linha ganha `lote_impedido` (como acima); sem ele (ou outro valor), a resposta é **idêntica à
de hoje** (sem a chave). Erros iguais (500 `{ error: err.message }`). Sem mudança de autorização.

**Tela — literais novos:**
- Materiais: selo `${n} ${unidade} em lote impedido` (sem unidade: `${n} em lote impedido`), classe `almox-lista-lote-impedido`,
  `title="Em lote bloqueado, reprovado ou vencido, fora o que já está bloqueado no material: não sai para uso até o lote ser liberado na tela Lotes e Séries. O extrato mostra os dois números."`;
- Nova Reserva: `<option>` `${codigo} — ${nome} (Disponível: ${d} ${unidade}) · ${n} em lote impedido`.

Campo ausente, nulo ou não numérico = nada na tela. O número aparece como o servidor mandou (`Number(n)`).

## Fase 2 — revisão do plano (1 revisor fresco)

Rodou junto com a T1 (leu a árvore com a T1 em andamento e confirmou que todo cenário se monta no harness). **1 importante, aceito:** (I1) o
selo diz o número da régua, que **tira o já bloqueado** (`quantidade_bloqueada`); o extrato explica isso na frase e mostra o cartão
*Bloqueado* ao lado, a lista não — com `quantidade_bloqueada` 2 sem lote conhecido e L2 BLOQUEADO 6, a lista diria "4 un em lote impedido"
e **Lotes e Séries** o lote com 6. → a dica do selo diz "fora o que já está bloqueado no material" e aponta o extrato. **3 menores, aceitos:**
(M1) o parâmetro vai em `MateriaisAlmoxarifado`, não no `paramsDaBusca` compartilhado com o Compras; (M2) o impedido pode passar do
disponível — dentro do parêntese do *Disponível* pareceria parte dele → o sufixo vai **depois** do parêntese (RN-223.10 ganhou o caso
`Disponível: 0`); (M3) a T4 já estava dentro da T1. **Ruído:** parâmetro repetido vira array (não é `'1'`, sem o campo — o contrato);
+35 ms por busca é aceitável (a busca tem pausa de 300 ms). Confirmado: nenhuma outra tela renderiza `TabelaMateriais`; nenhum dos 17
outros chamadores de `/materiais` manda o parâmetro; o Inspeções ignora o campo novo do `/estoque`.

## Tasks (sort topológico)

- [x] **T1 (tronco)** — `consultarEstoque` com a coluna; `listarMateriais` com o opt-in. Testes RN-223.01 a .07 em
  `server/tests/api/listasLoteImpedido.api.test.js` — `cc9e7374`.
- [x] **T2 (galho, consome o contrato)** — `TabelaMateriais` (o selo) + `MateriaisAlmoxarifado` (o parâmetro — em `MateriaisAlmoxarifado.loadMateriais`, **não** no `paramsDaBusca` de `TabelaMateriais.js:42`,
  que o Compras também usa; Fase 2 M1): RN-223.08; `MateriaisCompras`
  sem o parâmetro: RN-223.09. Testes em `MateriaisAlmoxarifado.test.js` e `MateriaisCompras.test.js` — `ab2443c1`.
- [x] **T3 (galho, consome o contrato)** — `ReservasAlmoxarifado`: o `<option>` (RN-223.10), em `ReservasAlmoxarifado.test.js` — `068129a6`.
- [x] **T4 (integração)** — RN-223.07 pela rota, no arquivo da T1 — entrou no mesmo commit da T1 (Fase 2 M3: a T4 já estava dentro da T1).

T2 e T3 são pequenas e no mesmo diretório do cliente: em sequência pelo mesmo executor.

## Sabotagens previstas (controle positivo)

1. sem a coluna no `/estoque` → RN-223.01..04; 2. outra conta (só status ≠ ATIVO) → RN-223.02 b, .03; 3. "hoje" + 1 dia → RN-223.02 d;
4. `/materiais` sempre com a coluna → RN-223.05; 5. opt-in por verdade (`if (com_lote_impedido)`) → RN-223.05 (`=0`, `=true`); 6. opt-in
fora do caminho dos filtros (coluna só sem `search`) → RN-223.06; 7. selo sem a guarda `> 0` → RN-223.08; 8. selo com unidade fixa →
RN-223.08 (sem unidade); 9. tela Materiais sem o parâmetro → RN-223.08 (a busca); 10. `<option>` sem a guarda → RN-223.10.
11. sufixo dentro do parêntese → RN-223.10; 12. a dica sem "fora o que já está bloqueado" → RN-223.08.

## Execução e controles (medidos)

`listasLoteImpedido.api.test.js`: vermelho antes da T1 **0 passou, 12 falhou** (a RN-223.05 caiu pela régua de "poucas linhas", calibrada
para ≥ 8; a metade positiva dela também cai sem a T1); **12/12** em `cc9e7374`; **14/14** com a Fase 5. Tela: `MateriaisAlmoxarifado.test.js`
vermelho **8 falhou** (os 4 novos e 4 testes cujas asserções de parâmetros exatos ganharam a chave nova) → verde; `MateriaisCompras.test.js`
RN-223.09 **verde de primeira** (afirma ausência — o controle é a sabotagem 9b); `ReservasAlmoxarifado.test.js` vermelho **3 falhou** → **44/44**,
**45** com a Fase 5.

| # | Sabotagem | Caiu |
|---|---|---|
| 1 | sem a coluna no `/estoque` | RN-223.01 a .04, .07 (10) |
| 2 | outra conta (só status ≠ ATIVO) | RN-223.02 b, c, d, .03 |
| 3 | "hoje" + 1 dia | RN-223.02 d, .03 |
| 4 | `/materiais` sempre com a coluna | RN-223.05 |
| 5 | opt-in por verdade (`!!`) | RN-223.05 |
| 6 | opt-in só sem busca | RN-223.06 |
| 7 | o *Disponível* descontado no `/estoque` | RN-223.01 |
| 8 | selo sem a guarda `> 0` | RN-223.08 (o "nenhum selo") |
| 9 | selo com a unidade fixa | RN-223.08 b |
| 10 | tela Materiais sem o parâmetro | RN-223.08 (a busca) e as 4 asserções de parâmetros |
| 11 | o parâmetro no `paramsDaBusca` (Compras) | RN-223.09 e 3 testes do Compras |
| 12 | `<option>` sem a guarda | RN-223.10 |
| 13 | sufixo dentro do parêntese | RN-223.10 (2) |
| 14 | a dica sem "fora o que já está bloqueado" | RN-223.08 (a dica literal) |
| 15–20 | Fase 5: `CAST … AS INTEGER`, `MIN(impedido, disponível)`, selo só do ativo, selo `>= 1`, `Math.round` e `>= 1` no `<option>` | RN-223.01 b, .11, .08, .10 b (S1/S2 rodadas depois da suíte — ver Verificação) |

Restauro conferido por md5 depois de cada rodada.

## Fase 5 — revisão adversarial (2 revisores frescos em paralelo, junto com o `test:api`)

1. **[REGRA/TELA/AUTORIZAÇÃO] nada reproduzido como defeito.** A sonda (`e223-rev-regra-1.js`) conferiu `/estoque`, `/materiais?com_lote_impedido=1`
   e o extrato com o mesmo número e a reserva manual recusando exatamente o disponível menos ele, em fracionado (0,3 KG sem cauda), vence
   hoje/ontem (inclusive validade com hora), cliente, série e inativo; 384 combinações de filtro em `/materiais` e no cadastro do Compras e 64
   em `/estoque`, todas 200 com a chave e iguais à régua (a coluna não acrescenta `?`). Usuário sem perfil: o mesmo acesso de antes. Notas (não
   achados): o C527 vale para a lista (reserva da OS sobre o bloqueado: *"(Disponível: 4 un) · 6"* e a recusa *"… 0. Não entram 4 …"*) →
   **D (223)** (6); o *Disponível* da lista não desconta a caixa (anterior) → **D (223)** (7); o Compras pode pedir o parâmetro na rota dele
   (não é sensível); virada do dia com a tela aberta (= **C529**).
2. **[TESTE] 13 mutações: 5 mortas, 8 sobreviventes, 6 lacunas reais** — nenhum cenário com quantidade fracionada (S1 `CAST` inteiro, S7
   `Math.round` na resposta, C3 `Math.round` no `<option>`), nenhum do servidor com o impedido maior que o disponível (S2 `MIN`), nenhum selo
   com menos de 1 (C2, C5 `>= 1`) nem em material inativo (C1). → **RN-223.01 b**, **RN-223.11**, **RN-223.10 b** e as linhas 0,5 e inativa do
   selo — `c6836a53`. Equivalentes: S3 (`== 1` aceitaria `01`/`1.0` — a tela não muda); C4 (`'1'` texto: o axios manda o mesmo). S7 é a mesma
   lacuna do S1 (fechada pela RN-223.01 b na lista de Materiais).

## Divergências do plano

- **A premissa da 222 estava errada** (Fase 0, item 1): não há tela "Estoque"; a lista de Materiais lê `/materiais`. Daí o opt-in (B1481).
- **RN-223.01 b, .10 b, .11** não existiam na 1ª versão (Fase 5). A T4 já estava dentro da T1.
- A régua de "poucas linhas" da RN-223.05 era ≥ 10 e o banco do teste tinha 9 materiais nesse ponto (ajustada para ≥ 8 antes da T1).

## Retro (4 números)

- **Rodadas até verde na Fase 5:** 1 (os testes novos passaram na primeira — o código estava certo; as 6 mutações que sobreviviam agora caem).
- **Achados reais:** Fase 2: 1 importante + 3 menores (todos aceitos). Fase 5: 0 de regra, 6 lacunas de teste (fechadas); 0 ruído.
- **Paralelismo:** sem galhos em paralelo (T2 e T3 pequenas, em sequência); a Fase 2 rodou junto com a T1; os 2 revisores da Fase 5 junto com o
  `test:api` (o de testes numa worktree própria) — sem contaminação; as sabotagens do servidor da Fase 5 esperaram a suíte terminar.
- **Defeito que escapou da 222:** a premissa errada da próxima tarefa (documento, não código).

## Próxima tarefa detalhada

*(Escolhida pela ordem do CLAUDE.md: a 223 fecha o C481 nas listas e nomeia como vizinho barato o **C528**; a spec 10 continua 🟢. Visível. **Sem
estimativa** — começa pela Fase 0.5.)*

**O extrato diz qual lote está impedido (C528).**

- **Onde:** a tabela *Saldos por localização* do `ExtratoMaterialModal.js` (`:223-250` — colunas *Localização*, *Lote*, *Quantidade*), alimentada
  por `material.saldos_localizacao` do `GET /materiais/:id/extrato` (`routes/almoxarifado/extended.js:1067`, `stockService.consultarSaldosPorLocalizacao`,
  que já faz `LEFT JOIN lotes_almoxarifado lt` e devolve `lote` = `lt.codigo`). A mesma função alimenta `GET /estoque/:id/saldos` (`:855`).
- **O que fazer:** devolver também `lt.status`, `lt.data_validade`, `lt.vencimento_liberado_em` (aditivo, nas duas rotas) e um booleano
  `lote_impedido` por linha pelo `predicadoLoteImpedidoSql('lt')` (o "hoje" de Brasília) — **não** reescrever a régua; na tela, a situação do
  lote ao lado do código (*Bloqueado*, *Reprovado*, *Vencido em dd/mm/aaaa*) só nas linhas impedidas.
- **Pontos de atenção:** o JOIN é `LEFT` (linha sem lote = `null`, nada na tela); `predicadoLoteImpedidoSql` com `l` nulo dá verdadeiro em
  `COALESCE(status,'') <> 'ATIVO'` — guardar com `lt.id IS NOT NULL`; procurar asserções de chaves exatas sobre `saldos` (`deepStrictEqual`) antes de
  mudar (a 201 e a 218 acrescentaram campos a `/estoque/:id/saldos`); leitura sem trava. Pronto e que não reabre: a régua, os campos da 222/223.
- Outros abertos: C519, C521, C524, C525, C526, C527, C529, C514–C518, C486, C491, C495, C497, C498; os relatórios sem o número (**D (223)**).

## Verificação (medida, serial)

`test:api` **618/618 arquivos OK** (os 617 da 222 + `listasLoteImpedido`, 14/14 dentro da suíte; rodada sobre `068129a6` + a Fase 5 dos testes); `test:almoxarifado` **44 passou, 0 falhou**; `test:validation` **4/0**; `test:safealter` **3/0**; `test:sqlite` **16/0**; cliente (`CI=true npx react-scripts test --watchAll=false --maxWorkers=2`) **224/224 suítes, 3036/3036 testes** (3027 + 9 novos); `build` **Compiled successfully**. As sabotagens S1 e S2 da Fase 5 (servidor) rodaram depois da suíte: caem a RN-223.01 b e a RN-223.11.

## Fechamento

- [x] Fase 5 — 2 revisores; 0 achado de regra, 6 lacunas de teste fechadas, 0 ruído — `c6836a53`.
- [x] Fechamento (`fechar-etapa`, sem o Passo 7½ e o 8, por pedido do André) — novidades (B1480–B1483, C529, a nota no C481, D (223), F (223), seção, topo e "onde estamos"), spec 10 (topo, nota no C481 da 205, o "Fora" da 222 com "estava errado" e a seção 223), mapa (linha e última atualização), guia (seção e cabeçalho), manual (2.12 e 9.1), o plano da 222 (a premissa errada) e a estimativa.
