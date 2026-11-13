# Etapa 224 — o extrato diz qual lote está impedido (C528)

> Usando a skill `desenvolver-etapa`. Ponto de partida: a "Próxima tarefa detalhada" de
> `docs/superpowers/plans/2026-11-13-almoxarifado-etapa223-listas-lote-impedido.md` (`:188-204`). Estimativa já commitada:
> `docs/estimativas/2026-11/estimativa_2026-11-13_almoxarifado-extrato-qual-lote-impedido.txt` (**2h15**, `98b90f22`). Números de linha
> medidos sobre `e0bca4f1`. A Fase 0.0 (`controle-horas`) não rodou: o pedido desta etapa mandou executá-la inteira (e pular o Passo 7½ e o 8).

## Objetivo (em linguagem simples)

Desde a 222 o extrato de um material diz **quanto** do estoque está em lote bloqueado, reprovado ou vencido (o cartão *Em lote impedido*),
mas não **qual** lote é (C528): era preciso abrir **Lotes e Séries**. Depois desta etapa, a tabela *Saldos por localização* do extrato
mostra, ao lado do código do lote, *Bloqueado*, *Reprovado* ou *Vencido em 12/11/2026* — só nas linhas de lote que não pode sair para uso.

## Fase 0 — medido em 2026-11-13 (sobre `e0bca4f1`)

1. A tabela (`ExtratoMaterialModal.js:223-250`, colunas *Localização*, *Lote*, *Quantidade*) lê `data.saldos_localizacao` do
   `GET /materiais/:id/extrato` (`routes/almoxarifado/extended.js:1067`), que chama `stockService.consultarSaldosPorLocalizacao`
   (`stockService.js:4020`): `SELECT s.*, …, lt.codigo as lote … LEFT JOIN lotes_almoxarifado lt ON s.lote_id = lt.id WHERE s.material_id = ?`.
2. A mesma função alimenta `GET /estoque/:materialId/saldos` (`extended.js:855`), que acrescenta `disponivel_para_esta` etc. e, desde a 218,
   `lote_livre`/`lote_bloqueado`/`lote_inspecao` (o retido — número, **não** a situação do lote). Lido pelo "Sai de" da entrega
   (`RequisicoesList.js:601`). Usada direto em 3 testes (`loteMigracaoSaldo`, `remessaTerceiroMotor`). ~~Nenhum teste compara o conjunto
   exato de chaves das linhas~~ — **estava errado** (Fase 2 M3): `saldosSobraDeOutras.api.test.js:306-307` compara as chaves da rota (menos
   as dela) com as da função; continua verde, porque os dois lados ganham os mesmos cinco campos.
3. `estoque_saldo_almoxarifado` não tem `status`, `data_validade`, `vencimento_liberado_em` (`schema.js:1489`): sem colisão com `s.*`.
4. A régua `predicadoLoteImpedidoSql(l)` (`loteImpedido.js:45`): `COALESCE(l.status,'') <> 'ATIVO' OR (validade não vazia AND
   substr(validade,1,10) < hoje AND vencimento_liberado_em vazio)`. Com `l` nulo (linha sem lote, o `LEFT JOIN`) dá **verdadeiro** — guarda
   `lt.id IS NOT NULL`. O impedido do material só vale com `controle_lote = 1` (B1371) — mas o **motor** recusa a saída que cita lote
   não ATIVO ou vencido sem olhar `controle_lote` (`stockService.js:1570-1606`, Fase 2 I1).
5. Status de lote: `ATIVO`, `BLOQUEADO`, `REPROVADO` (`lotService.js:23`, coluna `NOT NULL DEFAULT 'ATIVO'`). A tela **Lotes e Séries**
   chama-os *Bloqueado* e *Reprovado* (`LotesAlmoxarifado.js:61-62`) e o vencido de *VENCIDO*.
6. **Nome do campo (divergência da próxima tarefa):** ela sugeria um booleano `lote_impedido` por linha. Esse nome já é o **número** do
   material no extrato, no `/estoque`, no `/materiais` e no item da requisição (`RequisicoesList.js:2524`, `TabelaMateriais.js:37`); o mesmo
   nome com outro tipo na linha de saldo convida a ler um pelo outro. → `lote_esta_impedido` (B1484).
7. **Trava:** só leitura, sem trava (como o extrato). Pode estar um instante velho — exibição; a saída relê sob a trava.

## Caminhos

- **(escolhido)** a função devolve, por linha, a situação crua do lote (`lote_status`, `lote_validade`, `lote_vencimento_liberado_em`) e
  dois booleanos calculados no servidor com a régua (`lote_esta_impedido`, `lote_vencido_sem_liberacao`), ambos falsos sem lote. A tela só
  escolhe as palavras — não compara datas (o "hoje" é o de Brasília, no servidor).
- **(descartado)** a tela calcular o vencido com a data do navegador: outro relógio, outro fuso, segunda régua que divergiria.
- **(descartado)** uma coluna nova *Situação*: a tabela fica mais larga em todo material, e a maioria das linhas ficaria vazia. Ao lado do
  código, na coluna *Lote*.
- **(descartado)** mostrar a situação em toda linha de lote (inclusive *Ativo*): o pedido é dizer qual está impedido; *Ativo* em toda linha
  vira ruído.

## Decisões (letra B — reversíveis; livres B1484 a B1487, C530, conferido por `grep` em `docs` e `specs`)

- **B1484 — as linhas de saldo do extrato e de `/estoque/:id/saldos` trazem a situação do lote.** Aditivo: `lote_status`,
  `lote_validade`, `lote_vencimento_liberado_em` (crus, `null` sem lote) e `lote_esta_impedido` / `lote_vencido_sem_liberacao`
  (booleanos `true`/`false`). `lote_esta_impedido` = `predicadoLoteImpedidoSql('lt')`; `lote_vencido_sem_liberacao` = a parte "vencido" da
  mesma régua, extraída para `predicadoLoteVencidoSql('lt')` — `predicadoLoteImpedidoSql` passa a montá-la com ela, **texto idêntico**.
  Descartado: o nome `lote_impedido` por linha (Fase 0, item 6); a tela calcular o vencido.
- **B1485 — sem lote, os dois booleanos são falsos; com o controle de lote desligado, a linha ainda diz.** Guarda só `lt.id IS NOT NULL`.
  *1ª versão (trocada na Fase 2, I1):* guardava também `controle_lote = 1` (o B1371 do número). Mas o motor recusa a saída que cita o lote
  bloqueado ou vencido **sem olhar o controle** (`registrarMovimentacao`), e o "Sai de" da entrega ainda oferece o lote — com a guarda, a
  linha calaria sobre um lote que não sai. O cartão continua 0 nesse caso (B1371): a linha diz qual lote, o cartão quanto — **C530**.
  Descartado: a guarda do controle (a 1ª versão).
- **B1486 — a tela mostra a situação ao lado do código, só nas linhas impedidas.** Na coluna *Lote*, depois do código, um selo
  (`almox-extrato-lote-situacao`, cor de atenção, a mesma da frase da 222) com as partes que valem, unidas por ` · `: *Bloqueado* (status
  `BLOQUEADO`), *Reprovado* (`REPROVADO`), *Vencido em dd/mm/aaaa* (`lote_vencido_sem_liberacao`; a data dos 10 primeiros caracteres de
  `lote_validade`, sem `new Date` — sem fuso). Validade fora do formato `AAAA-MM-DD` (lixo antigo do recebimento, `31/03/2027` — a
  régua compara texto e a dá por vencida; Fase 2 M2) → *Validade a corrigir: ⟨texto⟩* em vez de *Vencido em*. Impedido sem nenhuma das
  partes (status desconhecido) → *Impedido*. Dica (`title`):
  *"Este lote não sai para uso até ser liberado na tela Lotes e Séries."*. Linha não impedida, ou sem os campos (servidor antigo) → como hoje.
  Descartado: *Ativo* nas outras linhas; coluna nova.
- **B1487 — sem mudança no banco, sem trava, sem rota nova, sem perfil novo.** Quem abre o extrato já vê o código do lote; a situação está
  em **Lotes e Séries**, aberta a quem abre o módulo.
- **C530 (aviso) — a linha diz a situação do lote, não quanto dele está impedido.** Uma linha *Bloqueado* de 6 não quer dizer que o cartão
  *Em lote impedido* soma 6 dela: a régua tira o que já está bloqueado no material sem lote conhecido (Fase 2 I1 da 223) e o retido do lote
  (217). O cartão continua sendo o número; a linha diz qual lote.

## Regras de negócio (RN-224.xx)

| RN | Enunciado | Cenário |
|---|---|---|
| RN-224.01 | No extrato, a linha do lote bloqueado diz que está impedido; a do ativo não | material `un` com controle de lote, L1 ATIVO 4 + L2 BLOQUEADO 6: linha L2 `lote_status 'BLOQUEADO'`, `lote_esta_impedido === true`, `lote_vencido_sem_liberacao === false`; linha L1 `lote_status 'ATIVO'`, os dois `false`; `lote` (código) e `quantidade` como antes |
| RN-224.02 | REPROVADO, vencido, vencido liberado, vence hoje, bloqueado e vencido | (a) L2 REPROVADO → impedido `true`; (b) L2 ATIVO vencido ontem → impedido `true`, vencido `true`, `lote_validade` = ontem; (c) (b) + liberar vencimento → os dois `false`, `lote_vencimento_liberado_em` preenchido; (d) vence hoje → os dois `false`; (e) BLOQUEADO e vencido ontem → os dois `true` |
| RN-224.03 | Linha sem lote: tudo nulo/falso | material com controle de lote e entrada **sem** lote (linha `lote_id` nulo) → `lote null`, `lote_status null`, `lote_validade null`, os dois `false` |
| RN-224.04 | Sem controle de lote, a linha ainda diz (o motor recusa a saída do lote) | `controle_lote = 0` com L2 BLOQUEADO e vencido ontem → `lote_status 'BLOQUEADO'`, os dois `true`, o cartão 0; a saída v2 citando L2 → 400 *"Lote L2 esta bloqueado…"* (a premissa) |
| RN-224.05 | `GET /estoque/:id/saldos` traz os mesmos campos, iguais aos do extrato | o material da .01: cada linha de `/estoque/:id/saldos` (e com `?requisicao_id=`) tem os cinco campos iguais aos da linha de mesmo `id` do extrato; `lote_livre`/`disponivel_para_esta` continuam lá |
| RN-224.06 | Toda linha é a régua | para todos os materiais criados: `lote_esta_impedido === (lote_id não nulo && SELECT predicadoLoteImpedidoSql('lt') …)` e o vencido idem |
| RN-224.07 | Integração: liberar o lote apaga a situação e o cartão | L1 4 + L2 BLOQUEADO 6: linha L2 impedida e cartão 6; `PUT /lotes/L2/status ATIVO` → linha L2 `false` e cartão 0; vencido ontem + `PUT /lotes/L2/liberar-vencimento` → idem |
| RN-224.08 | Tela: o selo só nas linhas impedidas, com as palavras certas | linhas: `BLOQUEADO`+impedido → `Bloqueado`; `REPROVADO` → `Reprovado`; ATIVO+vencido `2026-11-12` → `Vencido em 12/11/2026`; BLOQUEADO+vencido `2026-11-12 00:00:00` → `Bloqueado · Vencido em 12/11/2026`; ATIVO+vencido com validade `31/03/2027` → `Validade a corrigir: 31/03/2027`; status `X` impedido → `Impedido`; classe `almox-extrato-lote-situacao`, `title` literal; ATIVO não impedido, sem os campos, ou `lote_esta_impedido` não `true` → nenhum selo; sem lote → `—` como hoje |

## Contratos congelados

**`GET /api/almoxarifado/materiais/:id/extrato`** e **`GET /api/almoxarifado/estoque/:materialId/saldos`** — query, autorização e erros
iguais aos de hoje. Cada linha de `saldos_localizacao` (extrato) / do array (saldos) ganha **cinco** campos:

| Campo | Tipo | Valor |
|---|---|---|
| `lote_status` | texto \| `null` | `lotes_almoxarifado.status`; `null` sem lote |
| `lote_validade` | texto \| `null` | `lotes_almoxarifado.data_validade` cru |
| `lote_vencimento_liberado_em` | texto \| `null` | `lotes_almoxarifado.vencimento_liberado_em` cru |
| `lote_esta_impedido` | booleano | `lt.id IS NOT NULL AND predicadoLoteImpedidoSql('lt')` |
| `lote_vencido_sem_liberacao` | booleano | `lt.id IS NOT NULL AND predicadoLoteVencidoSql('lt')` |

O "hoje" é `diaLocal.hojeLocalISO()` (Brasília), como a régua. Nenhum campo existente muda.

**`loteImpedido.js`** — nova exportação `predicadoLoteVencidoSql(l, hojeISO)`; `predicadoLoteImpedidoSql` devolve o **mesmo texto** de
antes (teste de igualdade de string).

**Tela — literais novos:** selo `<span className="almox-extrato-lote-situacao" title="Este lote não sai para uso até ser liberado na tela Lotes e Séries.">`
com o texto das partes (`Bloqueado`, `Reprovado`, `Vencido em dd/mm/aaaa` ou `Validade a corrigir: ⟨texto⟩`, ou `Impedido`) unidas por ` · `.
Os nomes crus seguem os de `requisitionService.js:443` (`lote_validade`, `lote_vencimento_liberado_em`; Fase 2 M5 — a 1ª versão dizia
`lote_data_validade`).

## Fase 2 — revisão do plano (1 revisor fresco)

Rodou junto com a T1. **1 importante, aceito:** (I1) a guarda `controle_lote = 1` da B1485 calava a linha de um lote que o motor recusa
(`stockService.js:1570-1606` não olha o controle) e que o "Sai de" da entrega ainda oferece → a guarda saiu; RN-224.04 invertida (a linha diz,
o cartão 0) e com a premissa provada (saída v2 citando o lote → 400). **4 menores, aceitos:** (M2) validade fora do formato (`31/03/2027`,
lixo antigo que a régua dá por vencida) → *Validade a corrigir: ⟨texto⟩* na tela; (M3) a Fase 0 dizia que nenhum teste compara as chaves das
linhas — `saldosSobraDeOutras:306` compara (continua verde); (M4) o JOIN com o material — some junto com a guarda; (M5) `lote_data_validade`
→ `lote_validade`, o nome que `requisitionService` já usa. **Confirmado:** sem colisão com as chaves da rota (`separado_outras`, `sobra`,
`lote_livre`, `lote_bloqueado`, `lote_inspecao`); o "Sai de" ignora chaves que não conhece; T2 independe de T1 (mock na fronteira HTTP).

## Tasks (sort topológico)

- [x] **T1 (tronco)** (`f09e8ec7`) — `predicadoLoteVencidoSql` + `consultarSaldosPorLocalizacao` com os cinco campos (booleanos convertidos em JS).
  Testes RN-224.01 a .07 em `server/tests/api/extratoQualLoteImpedido.api.test.js` (a .07 é a integração pela rota: status → extrato → saldos).
- [x] **T2 (galho, consome o contrato)** (`c7399966`) — `ExtratoMaterialModal`: o selo (RN-224.08), em `ExtratoMaterialModal.test.js`.

T2 é pequena: em sequência pelo mesmo executor.

## Sabotagens previstas (controle positivo)

1. sem a guarda `lt.id IS NOT NULL` → RN-224.03; 2. a guarda do `controle_lote` de volta → RN-224.04; 3. "hoje" + 1 dia → RN-224.02 d;
4. `lote_vencido_sem_liberacao` sem olhar a liberação → RN-224.02 c; 5. booleano devolvido como 0/1 → RN-224.01 (`=== true`);
6. campos só no extrato (o `/saldos` sem) → RN-224.05; 7. `predicadoLoteImpedidoSql` com texto diferente → o teste de igualdade;
8. selo sem a guarda → RN-224.08 (nenhum selo); 9. data por `new Date` (fuso) → RN-224.08 (`2026-11-12 00:00:00`); 10. só a 1ª parte → RN-224.08 (`Bloqueado · Vencido`).

## Execução e controles (medidos)

`extratoQualLoteImpedido.api.test.js`: vermelho antes da T1 **0 passou, 13 falhou**; **13/13** em `f09e8ec7`; **15/15** com a Fase 5. Tela:
`ExtratoMaterialModal.test.js` vermelho **1 falhou** (o RN-224.08; o controle negativo afirma ausência — a prova dele é a sabotagem C1/C2) →
**12/12** em `c7399966` (com 2 linhas a mais na Fase 5).

| # | Sabotagem | Caiu |
|---|---|---|
| S1 | sem a guarda `lt.id IS NOT NULL` | RN-224.03, .06 |
| S2 | a guarda do `controle_lote` de volta (a 1ª versão do plano) | RN-224.04, .06 |
| S3 | "hoje" + 1 dia | RN-224.02 d, .06 |
| S4 | vencido sem olhar a liberação | RN-224.00, .02 c, .07 b |
| S5 | booleano devolvido como 0/1 | 12 dos 13 |
| S6 | régua com `<=` | RN-224.00, .02 d |
| C1 | selo por verdade (`!s.lote_esta_impedido`) | RN-224.08 (controle) |
| C2 | selo sem guarda | RN-224.08 (os dois) |
| C3 | data por `new Date` | RN-224.08 |
| C4 | só a 1ª parte | RN-224.08 |
| C5 | vencido sem olhar o formato | RN-224.08 |
| C6 | dica diferente | RN-224.08 |
| F1 | (Fase 5) vencido pela validade, não pelo servidor | RN-224.08 (L8) |
| F2/F3 | (Fase 5) sem o `trim` / sem o `—` | RN-224.08 (L9) |
| F4 | (Fase 5) "hoje" em UTC (`toISOString`) | RN-224.02 f |
| F5 | (Fase 5) guarda `s.lote_id IS NOT NULL` | RN-224.03 b, .06 |

Restauro conferido por md5 depois de cada rodada.

## Fase 5 — revisão adversarial (2 revisores frescos em paralelo, junto com o `test:api`)

1. **[REGRA/TELA/AUTORIZAÇÃO] nada reproduzido.** A sonda (`e224-rev-regra-motor.js`) comparou, para 17 situações de lote × controle de lote
   ligado e desligado (34 casos), o booleano do extrato, o do `/saldos`, a régua em JS e o motor de verdade (saída v2 de 1 citando o lote):
   32 batem nas quatro. Bloqueado, reprovado, bloqueado com vencimento liberado, vencido (com hora), `vencimento_liberado_em = ''`, validade
   `' '`, `'01/01/2030'` e numérica, status minúsculo — o motor recusa e a linha diz; ativo, vencido liberado, vence hoje, validade vazia —
   passa e a linha cala. A divergência (`vencimento_liberado_em` = inteiro `0`: a régua dá por liberado, o motor recusa) é anterior, declarada
   no cabeçalho da régua e **inalcançável** (os escritores gravam `NULL` ou `CURRENT_TIMESTAMP`) — ruído. O "Sai de" não muda (o valor da
   opção continua `localizacao_id`/`lote_id`); autorização igual (só a SQL do serviço mudou).
2. **[TESTE] 21 mutações: 9 mortas, 12 sobreviventes, 4 lacunas reais** — (C10) bloqueado com validade **futura** diria *"Bloqueado · Vencido
   em 31/03/2027"* se a tela decidisse o vencido pela validade → linha L8 do RN-224.08; (C3/C4) validade em branco → *"Validade a corrigir: —"*
   (linha L9); (S3) o "hoje" em UTC só erra das 21h à meia-noite → **RN-224.02 f** (troca o `diaLocal.hojeLocalISO` pelo dia seguinte);
   (S4) a guarda pela coluna do saldo (`s.lote_id`) marcaria a linha órfã (lote apagado) como impedida → **RN-224.03 b**. As outras 8 são
   equivalentes (o servidor só manda `true`/`false`, a guarda do lote já tira a linha sem lote, BLOQUEADO e REPROVADO não coexistem, o status
   não é gravado em minúsculas).

## Divergências do plano

- **B1485 invertida na Fase 2** (I1): a 1ª versão calava a linha com o controle de lote desligado; o motor recusa a saída do lote sem olhar o
  controle. RN-224.04 virou "a linha ainda diz", com a premissa provada no próprio teste.
- `lote_data_validade` → `lote_validade` (Fase 2 M5); *Validade a corrigir* (Fase 2 M2) não existia na 1ª versão.
- A Fase 0 dizia que nenhum teste compara as chaves das linhas — **estava errado** (`saldosSobraDeOutras:306`, continua verde).
- RN-224.00 (o texto da régua) e RN-224.02 f / .03 b (Fase 5) não estavam na 1ª tabela.

## Tasks feitas

- [x] **T1 (tronco)** — `f09e8ec7` (com a Fase 2 aplicada antes do commit).
- [x] **T2 (galho)** — `c7399966`.
- [x] **Fase 5** — 4 lacunas de teste fechadas — `e1c6cf6d`.

## Verificação (medida, serial)

`test:api` **619/619 arquivos OK** (os 618 da 223 + `extratoQualLoteImpedido`, 15/15 dentro da suíte — rodou já com os testes da Fase 5; sobre `c7399966`); `test:almoxarifado` **44 passou, 0 falhou**; `test:validation` **4/0**; `test:safealter` **3/0**; `test:sqlite` **16/0**; cliente (`CI=true npx react-scripts test --watchAll=false --maxWorkers=2`) **224/224 suítes, 3038/3038 testes** (3036 + 2 novos); `build` **Compiled successfully**. As sabotagens F4 e F5 da Fase 5 (servidor) rodaram depois da suíte: caem a RN-224.02 f e a RN-224.03 b. Na 1ª tentativa da F4 a âncora (`const hoje = diaLocal.hojeLocalISO();`) casava 2 vezes no arquivo e a troca caiu na outra função — nada caiu, e foi refeita com a âncora única (a regra do harness: contar a âncora antes).

## Retro (4 números)

- **Rodadas até verde:** 1 (os testes da Fase 5 passaram na primeira — o código estava certo; as mutações que sobreviviam agora caem).
- **Achados reais:** Fase 2: 1 importante + 4 menores (todos aceitos). Fase 5: 0 de regra, 4 lacunas de teste (fechadas); 1 ruído (o `0`
  inteiro, inalcançável).
- **Paralelismo:** sem galhos em paralelo (T2 pequena, em sequência); a Fase 2 rodou junto com a T1; os 2 revisores da Fase 5 junto com o
  `test:api` (o de testes numa worktree própria) — sem contaminação; as sabotagens do servidor da Fase 5 esperaram a suíte terminar.
- **Defeito que escapou da 223:** nenhum achado.

## Fechamento

- [x] Fechamento (`fechar-etapa`, sem o Passo 7½ e o 8, por pedido do André) — novidades (B1484–B1487, C528 resolvido, C530, D (224), F (224),
  seção, topo e "onde estamos"), spec 10 (topo, os "Fora" da 222 e da 223 e a seção 224), mapa (linha e última atualização), guia (seção e
  cabeçalho), manual (6.9) e a estimativa.

## Próxima tarefa detalhada

*(Escolhida pela ordem do CLAUDE.md: a 224 fecha o C528; o vizinho aberto de maior valor visível é a **D (223)** — os relatórios. A spec 10
continua 🟢. **Sem estimativa** — começa pela Fase 0.5.)*

**Os relatórios de saldo dizem quanto está em lote impedido (D (223)).**

- **Onde:** `reportService.relatorioEstoqueAtual` (`reportService.js:14`, o relatório *Estoque atual*) e `relatorioSaldosComprometidos`
  (`:119`). As colunas são **estáticas** no registro (`reportRegistry.js:56` e `:702`) — coluna nova é entrada no `colunas` e campo no `SELECT`;
  o teste do registro exige `colunas ⊇ COLUNAS_RETENCAO` no comprometido. Rotas: `extended.js:2561` e `:2602`; tela genérica
  `RelatoriosAlmoxarifado.js` (cabeçalho pelo registro; o comentário em `:26` lembra o caso das 64 colunas — só as declaradas aparecem).
- **O que fazer:** `${loteImpedidoSql('m')} as lote_impedido` nos dois `SELECT` e a coluna *Em lote impedido* nos dois registros (depois do
  *Disponível*). O *Saldo por lote* (`:40`) já tem *status* e *validade* por lote — conferir se a tela os mostra e, se não, se a coluna
  *Situação* cabe ali (mesmas palavras da B1486). Exportação (CSV/PDF) usa as mesmas colunas — conferir.
- **Pontos de atenção:** medir o custo antes (como na 223: `e223-escala.js` no scratchpad infla o banco); o *Saldos comprometidos* filtra
  "alguma retenção > 0" — material só com lote impedido (sem bloqueado) **não** aparece: decidir se entra (mudaria o filtro — é decisão, B);
  `relatorioEstoqueAtual` exclui material de cliente; leitura sem trava. Pronto e que não reabre: a régua, os campos da 222/223/224.
- Outros abertos: C519, C521, C524, C525, C526, C527, C529, C530, C514–C518, C486, C491, C495, C497, C498; o "Sai de" sem a situação (**D (224)**).
