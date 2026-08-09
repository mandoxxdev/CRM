# 10 — Lotes, Números de Série e Etiquetas

> **Status:** ❌ — lote hoje é texto livre; série e etiquetas não existem · **Spec original:** seção 10
> **Última atualização:** 2026-08-09 (levantamento verificado contra o código antes da Etapa 6)
> **Design da Etapa 6 (só lotes):** [`docs/superpowers/specs/2026-08-09-almoxarifado-etapa6-lotes-design.md`](../../../docs/superpowers/specs/2026-08-09-almoxarifado-etapa6-lotes-design.md)

**A feature 10 foi dividida em três etapas.** Ela é grande demais para uma só, e o mapa mestre a
descrevia como um item único — o que fazia parecer que ficaria pronta de uma vez:

| Parte | Entrega | Quando |
|---|---|---|
| **Etapa 6** | Lotes: tabela real, validade, corrida, certificado, FEFO, guarda contra saldo negativo por lote, campo de lote no recebimento | em desenho (2026-08-09) |
| **Etapa 6b** | Números de série — confirmado em 2026-08-09 que a GMP rastreia série individualmente hoje (rotina, não exceção). Não é descarte de escopo, é sequência | depois da 6 |
| **Etapa 6c** | Etiquetas com QR Code e impressão em PDF | depois da 6b |

(`6b`/`6c` e não `7`/`8` de propósito: as etapas 7 e 8 do plano mestre já são
transferências/devoluções e materiais de clientes/terceiros.)

## Objetivo

Controle real por lote (validade, corrida/heat number, certificado), número de série individual, e etiquetas com QR/código de barras.

## O que já existe — verificado no código em 2026-08-09

Cada afirmação abaixo foi conferida no arquivo citado. A versão anterior desta seção estava
otimista demais em um ponto e incompleta em outros dois; as correções estão marcadas.

- Coluna `lote TEXT` livre em `estoque_saldo_almoxarifado` (`schema.js:635`) e em
  `movimentacoes_almoxarifado` (`schema.js:651`). A chave do saldo é
  `UNIQUE(material_id, localizacao_id, lote)` (`schema.js:642`).
- O motor segrega saldo por lote em ENTRADA/SAÍDA (`stockService.js:476-485`), TRANSFERÊNCIA
  (`stockService.js:282-290`) e AJUSTE com localização (`stockService.js:450-452`), sempre via
  `getOrCreateSaldo(db, material, localizacao, lote)` (`stockService.js:61-70`).
- Campo `lote` no item de recebimento (`schema.js:736`), gravado por `receiptService.js:111-115`
  e repassado ao motor na entrada (`receiptService.js:332`).
- Tabela órfã `lotes` é de lote de **produção** (`numero_lote`, `os_id`, `tipo_lote`,
  `data_producao`), sem rota — não confundir. **Correção:** fica em `index.js:19554`, não em
  `19458` como esta spec dizia.

### ⚠️ Correção: "o motor já segrega saldo por lote" é meia verdade (histórico — fechado na Task 3)

> **Status deste achado: RESOLVIDO na Etapa 6, Task 3 (`65d78fd`+).** O texto abaixo descreve o
> estado do motor **antes** da Task 3 — é o levantamento que justificou o design da etapa, mantido
> como registro. Hoje o motor lê o lote (status e vencimento) antes de qualquer efeito de saldo e
> reivindica o saldo do **próprio** lote com guarda no `WHERE`, não mais só o do material — ver a
> seção "Saldos" em [03-motor-estoque](../03-motor-estoque/README.md). A citação de linha de
> `syncMaterialTotals` abaixo (`stockService.js:43-59`) também não vale mais — a função está hoje
> em `stockService.js:52-69` e foi restaurada depois de uma volta pela remoção (ver o review da
> Task 3: a soma de todas as linhas é decisão de negócio do cliente, não bug).

A frase anterior — *"o motor já segrega saldo por lote — bom ponto de partida"* — estava certa na
letra e enganosa na prática. A segregação era **write-only**: escrevia-se o lote, nunca se lia o
lote para decidir nada.

1. **Saída por lote não validava o saldo daquele lote.** A guarda de saldo insuficiente
   (`stockService.js:263-268` no código da época) comparava com o disponível **do material**; logo
   depois, `stockService.js:481-484` subtraía da linha do lote sem nenhuma verificação. Tirar 10 do
   lote `A` quando `A` tinha 2 e o material tinha 100 passava, e a linha do lote ficava **negativa
   em silêncio**. `syncMaterialTotals` somava essa linha negativa de volta, então o total do
   material continuava "certo" e o erro ficava invisível.

   Reproduzido em 2026-08-09 (sonda descartável sobre `tests/helpers/testApp.js`, não versionada
   — a versão definitiva virou teste de API na Etapa 6, Task 3: `loteGuardasSaida.api.test.js`).
   Entrada de 100 no lote `A` e 2 no lote `B`, depois SAÍDA de 10 no lote `B`:

   | | lote A | lote B | `material.quantidade_atual` |
   |---|---|---|---|
   | antes | 100 | 2 | 102 |
   | depois da saída de 10 em `B` | 100 | **−8** | 92 |

   O motor **não lançava erro nenhum**, e a soma das linhas (92) batia com o total do material —
   por isso nenhuma consulta ao material denunciava o problema. Só olhando a linha do lote se via.
2. **As colunas de retenção da linha por lote nunca são escritas.** `estoque_saldo_almoxarifado`
   tem `quantidade_reservada`, `quantidade_bloqueada` e `quantidade_em_inspecao`
   (`schema.js:637-639`), mas RESERVA, BLOQUEIO e QUARENTENA escrevem só em
   `materiais_almoxarifado` (`stockService.js:292-313`). Reter um lote específico é hoje
   impossível: bloqueia-se o material inteiro.
3. É **exatamente o padrão que já mordeu três vezes neste módulo** (coluna existe, fórmula
   subtrai, ciclo nunca fecha — `reserva_id` e `expira_em` na Etapa 4, `quantidade_em_inspecao`
   na Etapa 5). Quem ler "o motor já segrega por lote" e construir por cima sem checar vai
   repetir o erro pela quarta vez.

### ⚠️ Correção: são cinco flags mortas, não duas

A spec listava `controle_lote` e `controle_certificado`. São cinco, todas gravadas pelo CRUD e
**nunca lidas por nenhuma regra**: `controle_lote`, `controle_certificado` (`schema.js:508-509`),
`controle_serie`, `controle_validade`, `controle_corrida` (`schema.js:529-531`). Existem no
formulário do material (`MaterialAlmoxarifadoForm.js:28`), na rota de CRUD
(`routes/almoxarifado.js:295-394`) e no Zod (`schemas.js:178-195`) — e em lugar nenhum mais.

Pior que ausência: `receiptService.js:309` faz `SELECT ... m.controle_certificado` e **nunca usa
a coluna selecionada**. Quem for auditar por `grep controle_certificado` encontra essa linha e
conclui que a entrada verifica certificado. Não verifica.

### Lacunas que a spec não registrava

- **O recebimento não tem campo de lote na tela.** `RecebimentosAlmoxarifado.js` não menciona
  lote em lugar nenhum, embora a coluna exista e o backend a repasse ao motor. O único lugar do
  sistema onde se digita um lote é a movimentação manual, e só nos tipos ENTRADA e SAÍDA
  (`MovimentacoesAlmoxarifado.js:173,415`). Ou seja: o ponto em que um lote naturalmente nasce —
  a nota fiscal do fornecedor — é justamente o que não consegue registrá-lo.
- **`UNIQUE(material_id, localizacao_id, lote)` não impede duplicata sem lote.** No SQLite dois
  NULL são distintos para efeito de UNIQUE, então linhas com `lote IS NULL` (a maioria hoje)
  podem duplicar numa corrida entre dois `getOrCreateSaldo`. A migração dos textos livres para a
  tabela de lotes precisa deduplicar antes de criar a FK.
- **Leitura por lote só existe no extrato**: `ExtratoMaterialModal.js:158,174` exibe a coluna.
  Nenhuma consulta agrega, filtra ou ordena por lote.

## Checklist

### Backend — lotes
- [ ] Tabela `lotes_almoxarifado`: material, código do lote, fornecedor, corrida/heat number, certificado (anexo), data de fabricação, validade, status (ativo/bloqueado/reprovado)

  > ⚠️ **Correção (2026-08-09): `VENCIDO` não é status.** Esta linha pedia
  > `ativo/bloqueado/reprovado/vencido`. Vencimento é **derivado** de `data_validade <
  > date('now')`, calculado na leitura. Gravar `VENCIDO` exigiria um cron para virar o status à
  > meia-noite e criaria um estado que diverge da data toda vez que o cron falhasse — mais uma
  > coluna mentindo, que é o problema que esta spec inteira documenta. Derivado não diverge.
- [ ] `estoque_saldo_almoxarifado.lote` passa a referenciar a tabela (migração dos textos existentes, **deduplicando as linhas `lote IS NULL`** — ver lacunas acima)
- [ ] **Saída não pode deixar a linha do lote negativa** (hoje deixa, em silêncio — item 1 das correções). Guarda no `WHERE` do UPDATE, como o resto do motor
- [ ] Aplicar `controle_lote`: material controlado exige lote em TODA entrada e saída
- [ ] Aplicar `controle_certificado`: entrada sem certificado anexado falha (ou entra bloqueada). Remover ou usar o `SELECT` morto em `receiptService.js:309`
- [ ] Validade: bloquear saída de lote vencido; sugestão FEFO (primeiro que vence sai primeiro)
- [ ] Rastreabilidade: consulta de tudo que aconteceu com um lote
- [ ] **Decidir se retenção passa a ser por lote** (reserva/bloqueio/quarentena hoje só existem no material — as colunas por lote existem e ninguém escreve nelas). Se a decisão for "continua no material", **apagar as três colunas** de `estoque_saldo_almoxarifado` para não parecerem implementadas

### Backend — números de série
- [ ] Tabela `series_almoxarifado`: material, número de série, status (em estoque/reservado/entregue/em terceiro/devolvido), localização, projeto/OS atual
- [ ] `controle_serie` no material: entrada exige N séries para N unidades; saída exige quais séries
- [ ] Série é única por material; ciclo de vida rastreável

### Backend — etiquetas
- [ ] Geração de etiqueta (spec 10): código GMP, descrição, quantidade, lote/série, fornecedor, pedido, NF, projeto, localização, status inspeção + **QR Code**
- [ ] Endpoint de etiqueta em PDF (aproveitar infra `pdfkit`/`puppeteer` existente)
- [ ] Etiqueta de retalho com dimensões/peso remanescente (feature 15)
- [ ] Regras por tipo (spec 10): motores/instrumentos → série; chapas/tubos certificados → lote+corrida; químicos → lote+validade

### Frontend
- [ ] **Campo de lote no recebimento** — hoje inexistente na tela, apesar de coluna e backend prontos (ver lacunas acima). É onde o lote nasce
- [ ] Cadastro/consulta de lotes e séries no detalhe do material
- [ ] Seleção de lote/série na movimentação, separação e entrega
- [ ] Botão imprimir etiqueta (recebimento, material, localização)

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Material com controle_lote exige lote na movimentação | `movimentar material controlado sem lote falha` |
| Saída de lote vencido falha | `saida de lote vencido falha` |
| Saída de lote reprovado falha | `saida de lote reprovado falha` |
| Série não pode estar em dois lugares | `entrada de serie ja em estoque falha` |
| Saída de material seriado exige séries válidas em estoque | `saida seriada com serie inexistente falha` |
| Saldo por lote soma o saldo do material | `soma dos lotes igual saldo total` |

## Dependências

- 03 (motor de estoque) — as validações entram no `stockService`. Consome: 04/05 (entrega), 07 (reserva por lote), 08 (entrada), 09 (reprovação), 15 (retalhos).
