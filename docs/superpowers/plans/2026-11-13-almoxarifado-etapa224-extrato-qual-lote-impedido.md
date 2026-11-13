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

- [ ] **T1 (tronco)** — `predicadoLoteVencidoSql` + `consultarSaldosPorLocalizacao` com os cinco campos (booleanos convertidos em JS).
  Testes RN-224.01 a .07 em `server/tests/api/extratoQualLoteImpedido.api.test.js` (a .07 é a integração pela rota: status → extrato → saldos).
- [ ] **T2 (galho, consome o contrato)** — `ExtratoMaterialModal`: o selo (RN-224.08), em `ExtratoMaterialModal.test.js`.

T2 é pequena: em sequência pelo mesmo executor.

## Sabotagens previstas (controle positivo)

1. sem a guarda `lt.id IS NOT NULL` → RN-224.03; 2. a guarda do `controle_lote` de volta → RN-224.04; 3. "hoje" + 1 dia → RN-224.02 d;
4. `lote_vencido_sem_liberacao` sem olhar a liberação → RN-224.02 c; 5. booleano devolvido como 0/1 → RN-224.01 (`=== true`);
6. campos só no extrato (o `/saldos` sem) → RN-224.05; 7. `predicadoLoteImpedidoSql` com texto diferente → o teste de igualdade;
8. selo sem a guarda → RN-224.08 (nenhum selo); 9. data por `new Date` (fuso) → RN-224.08 (`2026-11-12 00:00:00`); 10. só a 1ª parte → RN-224.08 (`Bloqueado · Vencido`).

## Próxima tarefa detalhada

*(a preencher no fechamento)*
