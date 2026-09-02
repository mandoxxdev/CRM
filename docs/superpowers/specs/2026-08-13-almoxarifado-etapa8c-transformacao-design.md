# Etapa 8c — Transformação no terceiro (chapa → peças cortadas + sobra)

> **Data:** 2026-08-13 · **Branch:** `desenvolvimento-almoxarifado`
> **Feature:** [14 — Materiais em terceiros](../../../specs/modulo-almoxarifado/14-materiais-terceiros/README.md)
> **Antecessora:** [Etapa 8b — remessas a terceiros](2026-08-12-almoxarifado-etapa8b-materiais-terceiros-design.md)

## O problema

A Etapa 8b entregou o ciclo de remessa para serviços que devolvem o **mesmo** material:
tratamento térmico, pintura, galvanização. Para esses, ela está completa.

Corte, dobra e usinagem são outra coisa: sai **uma chapa** e voltam **40 peças e uma sobra**. Hoje
o sistema recusa isso explicitamente, em um ponto só (`thirdPartyService.js:356-360`), com uma
mensagem que aponta para esta etapa.

Sem a 8c, a GMP tem duas saídas ruins: registrar o retorno como se a chapa tivesse voltado inteira
(o estoque passa a ter uma chapa que não existe), ou não registrar (o material some do controle no
momento em que vira produto). As duas mentem no inventário.

---

## A diferença de natureza que organiza a etapa inteira

Esta é a descoberta que reorganizou o desenho, e vale escrever antes das decisões.

**Na 8b, a remessa é retenção pura.** `REMESSA_TERCEIRO` sobe `quantidade_em_terceiros` e
**não mexe em `quantidade_atual`** (`stockService.js:812-825`), porque o material continua sendo
nosso — ele só não está no prédio. O retorno é a operação inversa e igualmente inócua: desce a
retenção, o patrimônio não se move. É por isso que `registrarRetorno` **não credita estoque**, e o
docstring dele diz isso em voz alta (`thirdPartyService.js:380-394`).

**Na transformação, a chapa deixa de existir.** Ela tem de sair do patrimônio *e* da retenção, e as
peças têm de **entrar** como material novo. São dois efeitos de sinais opostos em **materiais
diferentes**, e nenhum tipo de movimento de hoje faz isso sozinho.

Mas metade já está pronta: **`CONSUMO_TERCEIRO` é exatamente a baixa definitiva de que a chapa
precisa** — baixa `quantidade_atual` e `quantidade_em_terceiros` **no mesmo UPDATE**, com claim
duplo (`stockService.js:984-1006`). Ele foi criado na 8b para o encerramento com perda; serve aqui
sem nenhuma alteração. Falta só o outro lado: o crédito das peças.

---

## Decisões

### 1. O retorno com transformação separa **o que foi consumido** de **o que voltou**

O teto da 8b compara `quantidade` do retorno contra `item.quantidade - quantidade_retornada`, na
unidade do material **enviado** (`thirdPartyService.js:367-376`). Numa transformação isso deixa de
fechar: a chapa saiu em KG e as peças voltam em UN. Comparar os dois números é somar laranja com
maçã, e foi o que quase me fez redesenhar o teto.

**Decisão:** não redesenhar o teto. A linha de retorno com transformação declara **dois números
separados**:

- `quantidade_consumida` — quanto do item enviado foi gasto, **sempre na unidade do enviado**. É
  este que baixa o item e conta no teto. O teto da 8b continua valendo, intacto e comparável.
- `resultados[]` — a lista do que voltou, cada um com o **seu** `material_id`, a **sua** quantidade
  e a **sua** unidade. Nenhum deles encosta no teto.

Isto também resolve o critério de "liquidado" que decide `ENCERRADA` vs `RETORNO_PARCIAL`
(`thirdPartyService.js:478-481`): ele continua sendo quantitativo sobre o item enviado, porque
`quantidade_consumida` está na unidade certa. Zero mudança na máquina de estados.

### 2. Um tipo novo para o crédito: `RETORNO_TRANSFORMACAO`

O crédito das peças **não** pode ser `ENTRADA_MANUAL`. Três razões, em ordem de gravidade:

1. **Dono.** `ENTRADA_MANUAL` não tem lógica de proprietário. A peça cortada de uma chapa do
   cliente X é do cliente X, e a Etapa 8 inteira existe para essa garantia não depender de alguém
   lembrar.
2. **Livro.** No extrato, `ENTRADA_MANUAL` faz a peça parecer ter aparecido do nada. O motivo real
   — "veio da chapa tal, remessa tal" — some.
3. **Estorno.** Cancelar uma entrada manual não sabe que existe uma baixa de chapa do outro lado.

`RETORNO_TRANSFORMACAO` é **entrada** (entra em `tiposEntrada`, aceita `custo_unitario`, alimenta o
custo médio pelo caminho que já existe em `stockService.js:1031-1041`). Entra em
`TIPOS_DEDICADOS` — não é criável pela movimentação avulsa, só pelo serviço de transformação.

### 3. A peça tem de ter o **mesmo dono** da chapa. Sem exceção.

Se a chapa é do cliente X e o material-peça está cadastrado como nosso (`proprietario_cliente_id`
NULL), a transformação **converteria material de cliente em patrimônio da GMP**. Recusa, com
mensagem dizendo qual é o dono da chapa e qual é o do material de destino.

Isto **não é regra deduzida**: decorre direto da guarda de saída da Etapa 8, e é o mesmo raciocínio
que fez a movimentação emergencial não furar a guarda do dono — "regularizo depois" não é resposta
para o dono da chapa.

### 4. Custo: rateio por **quantidade** entre as peças, sobra a **zero**

Decidido com o cliente (2026-08-13), com a alternativa por peso descartada.

**Por que quantidade e não peso.** No caso da GMP uma chapa vira N peças **iguais**, e aí os dois
critérios dão o mesmo número. Peso só ganharia se a mesma remessa voltasse com peças de tamanhos
bem diferentes. E peso exige `peso_unitario` preenchido em todo material — sem ele o cálculo
simplesmente não roda.

**Por que a sobra entra a zero.** O rateio por quantidade não quebra entre as peças; quebra na
sobra. Chapa de R$ 1.000 → 40 peças + 1 sobra que é um terço da chapa: rateando por quantidade em
41 linhas, a sobra carrega 2,4% do valor e as peças ficam ~40% caras. A sobra é **uma linha** e uma
**fatia grande** — é ela que envenena a média. Sobra a custo zero é o tratamento conservador que
ERP dá a retalho: o patrimônio nunca infla, e se um dia a sobra for vendida como sucata aparece
como ganho, nunca como perda inventada.

**O invariante fecha sozinho, e é por isso que ele é confiável.** Não existe coluna de valor no
sistema — valor é sempre `quantidade × custo`, calculado na leitura (`reportService.js:10`,
`stockService.js:1870`). Chapa de 100 kg a R$ 10 sai e leva R$ 1.000; as peças entram com R$ 1.000
no total.

> **CORREÇÃO (2026-08-13, achada ao escrever o plano — esta decisão estava ERRADA).**
> A frase original terminava com *"o patrimônio não se move porque **não há um segundo lugar onde
> ele possa discordar**"*. **Isso está errado, e o erro é interno a este documento:** há dois
> lugares, e a **decisão 11.1, escrita abaixo, os nomeia**. Escrevi as duas coisas sem cruzar uma
> com a outra.
>
> Existem **duas famílias de leitura de custo** convivendo: uma usa só `custo_unitario`
> (`routes/almoxarifado.js:249` e `:1048`), a outra usa `COALESCE(custo_medio, custo_unitario)`
> (`reportService.js:10`, `stockService.js:1870`, `requisitionValueApprovalService.js:61`). E o
> ramo de entrada com custo escreve **as duas colunas com valores diferentes**
> (`stockService.js:1032-1041`): `custo_medio` recebe a média ponderada, `custo_unitario` recebe o
> custo desta entrada.
>
> **O que continua valendo:** o invariante é real, mas é relativo a **uma** fórmula, não absoluto.
> Ele fecha para `COALESCE(custo_medio, custo_unitario)`, que é a família majoritária (3 leituras
> contra 2) e a que representa custo de estoque de verdade.
>
> **O que muda na prática:** o teste do invariante **declara qual fórmula usa**, em vez de afirmar
> que o número é o mesmo em toda parte. E a divergência entre as duas famílias — que é
> **anterior a esta etapa** — continua registrada na decisão 11.1 como o que é: dívida herdada que
> a 8c não cria nem conserta, e que vai fazer duas telas mostrarem números diferentes.

**Custo do serviço do terceiro:** campo opcional `custo_servico` **na linha de transformação** (é
ali que a nota do terceiro chega). Se preenchido, soma ao valor rateado — a peça não é peça sem o
corte. Se em branco, não entra. Sem estimativa, sem default.

O rateio mora numa **função pura só** (`services/almoxarifado/transformCost.js`), para trocar a
base ser uma linha se a GMP passar a cortar peças mistas.

> **ACRÉSCIMO (2026-08-13, achado ao escrever o plano): "sobra a zero" não se implementa passando
> zero.** O motor só escreve custo sob `if (custoInformado && custoInformado > 0)`
> (`stockService.js:1031`); crédito com `custo_unitario = 0` cai no ramo `else`, que **não escreve
> custo nenhum** — a sobra entraria carregando o custo antigo que o material dela já tivesse. O
> efeito pretendido ("a sobra não recebe rateio") precisa ser **explícito**, e não pode depender de
> passar 0 e torcer. O plano trata isso na Task 6; o design não tinha percebido.

### 5. **Correção de pré-requisito:** o recebimento passa a alimentar o custo médio

Achado durante o desenho, e ele decide se a decisão 4 vale alguma coisa.

**O custo médio quase não é alimentado hoje.** `receiptService.js:493-513` chama
`registrarMovimentacao` com `ENTRADA_COMPRA` e **não passa `custo_unitario`** — apesar de gravar
`valor_unitario` e `valor_total` na linha da nota (`receiptService.js:111-115`). O único caminho
que move `custo_medio` no sistema inteiro é a movimentação manual com custo digitado à mão.

Consequência: o rateio distribuiria **R$ 0,00** na maioria dos casos. A conta fecharia (zero =
zero) e o resultado seria inútil.

**Decisão:** o recebimento passa a repassar `valor_unitario` da linha da nota como
`custo_unitario`. É pequeno — o dado já está gravado, só não é passado adiante.

**Mudança de comportamento declarada:** materiais recebidos por NF passam a ter custo médio real.
Vale **só daqui para frente**; não há backfill de histórico, porque recalcular custo médio
retroativo exigiria o custo por movimento, que **não existe** (o ledger
`movimentacoes_almoxarifado` não tem nenhuma coluna de custo — `schema.js:205-219`).

### 6. O material-peça tem de **existir**. A tela ajuda a criar; o motor não cria.

Precedente do módulo: o recebimento **não** cria material (`receiptService.js:44-50` filtra itens
sem `material_id`). Criar material implicitamente a partir de um formulário de retorno produziria
cadastro-lixo a cada erro de digitação, e cadastro-lixo em almoxarifado não se apaga — ele ganha
saldo.

**Decisão:** a transformação **recusa** material inexistente, com mensagem que ensina o caminho. A
tela oferece um atalho **explícito** de criar o material resultante (ação separada, botão próprio),
que chama a criação normal e já herda `proprietario_cliente_id` da chapa e a família dela.

**Dívida técnica que isso obriga a pagar (e é bom):** hoje **não existe função de criar material**
— o único `INSERT INTO materiais_almoxarifado` de produção está *inline no handler HTTP*
(`routes/almoxarifado.js:454`). Vira `services/almoxarifado/materialService.createMaterial`, e a
rota passa a chamá-la. Comportamento idêntico, testado antes e depois.

E o gerador de código **não aguenta lote**: `GET /almoxarifado/proximo-codigo` monta o próximo
número com `ORDER BY id DESC LIMIT 1`, sem transação (`routes/almoxarifado.js:697-739`). Pedir
código para N peças gera **duplicata** — exatamente o caso da 8c. Passa a usar `MAX` do sufixo
numérico e a tolerar colisão com retry, e ganha teste de concorrência.

### 7. Fechamento aritmético é **informativo**, nunca bloqueia

`chapa consumida = peças + sobra + perda` só é verificável se todos os materiais tiverem
`peso_unitario`, e eles não têm. Bloquear com base num dado opcional trava o operador por um campo
de cadastro em branco.

**Decisão:** quando **todos** os materiais envolvidos têm `peso_unitario`, o sistema calcula o
**rendimento** (peso que voltou ÷ peso que saiu) e mostra na tela e no retorno da API. Quando não
tem, mostra "rendimento não calculável — peso não cadastrado", dizendo **qual** material falta.
Nunca recusa, nunca estima.

### 8. Sobra é **classificação da linha de resultado**, não material especial

Cada resultado é `PECA` ou `SOBRA`. É a classificação que decide o rateio (decisão 4): `PECA`
recebe rateio, `SOBRA` entra a zero. Nada além disso muda — a sobra é um material normal, com
código e cadastro, e a categoria `Sucata e sobras reaproveitáveis` **já existe no seed**
(`schema.js:7-13`).

**Buraco conhecido que a 8c encosta e não conserta:** o formulário de material usa uma lista de
categorias **hardcoded no front, diferente da tabela seedada**, e essa lista não tem a categoria da
sobra (`MaterialAlmoxarifadoForm.js:13-16`). Dívida já catalogada na spec 01. A 8c **não** a
resolve — resolvê-la mexe em três telas por um motivo que não é o desta etapa. Fica declarado.

O que "virou cavaco" **não é resultado**: é a diferença entre o consumido e o que voltou, e ela já
está baixada pelo `CONSUMO_TERCEIRO` da chapa. Não precisa de linha, não precisa de destino novo em
`DESTINOS_ENCERRAMENTO`.

### 9. Sem transação: pré-checagem, claim, compensação — a forma da 8b

SQLite, motor sem transação. A transformação é a operação mais composta do módulo até aqui: uma
baixa e **N** créditos. Copia a forma que a 8b já usa em `registrarRetorno`
(`thirdPartyService.js:395-512`): valida **tudo** antes de mover **qualquer coisa**, faz claim no
item, e no `catch` desfaz o que já entrou.

**A ordem importa e é decidida aqui: baixa a chapa primeiro, credita as peças depois.** Se o
crédito falhar no meio, a compensação estorna os créditos já feitos e devolve a chapa. A ordem
inversa (creditar primeiro) criaria, na falha, peças sem baixa — estoque do nada, que é o pior dos
dois estados, e é literalmente o que a mensagem de recusa da 8b diz querer evitar.

### 10. Fora do escopo, declarado

- **Ordem de produção / apontamento de chão de fábrica.** A 8c é transformação **no terceiro**.
  Corte feito dentro da GMP é outra etapa e outra feature.
- **BOM / estrutura de produto.** Não existe nada disso no servidor (verificado: zero resultados
  para `estrutura_produto|explosao|material_pai|componentes_|rateio`). A 8c registra o que
  **aconteceu**, não planeja o que **deveria** acontecer.
- **Custo por lote ou por localização.** `estoque_saldo_almoxarifado.custo_medio` é coluna morta
  (nenhum escritor) e continua morta. O custo é escalar por material.
- **Custo no ledger.** `movimentacoes_almoxarifado` não guarda custo e a 8c não acrescenta —
  acrescentar exigiria decidir baixa valorizada (CMV) para o módulo inteiro.
- **Backfill de custo histórico** (ver decisão 5).
- **Categorias hardcoded do front** (ver decisão 8).
- **E-mail (19) e alerta (20).**

### 11. Duas inconsistências pré-existentes que ficam **registradas, não consertadas**

1. **Dois relatórios discordam dos outros três.** O dashboard de patrimônio
   (`routes/almoxarifado.js:249`) e `GET /relatorio/posicao-estoque` (`:1048`) usam **só**
   `custo_unitario`; `reportService.js:10`, `stockService.js:1870` e
   `requisitionValueApprovalService.js:61` usam `COALESCE(custo_medio, custo_unitario)`. Já é
   inconsistente **hoje**. O caminho da 8c escreve **as duas colunas** (é o que
   `stockService.js:1032-1041` faz), então ela não piora nada — mas os números vão continuar
   divergindo entre telas, e alguém vai perguntar por quê.
2. **Estorno não reverte custo**, por decisão explícita anterior (`stockService.js:1548-1550`).
   Estornar uma transformação devolve as quantidades, **não** o custo médio.

---

## Testes exigidos

| Teste | Por que existe |
|---|---|
| `transformacao baixa a chapa e credita as pecas` | o caminho feliz, medido nos dois materiais |
| `[invariante] o valor que sai na chapa e o que entra nas pecas` | decisão 4, o único invariante contábil da etapa |
| `sobra entra com custo zero e nao dilui as pecas` | decisão 4 — o caso que motivou a regra |
| `custo_servico informado soma ao valor rateado` | decisão 4 |
| `[controle positivo] chapa com custo zero credita peca com custo zero, sem erro` | prova que o rateio não inventa número |
| `transformacao para material de OUTRO dono falha` | decisão 3, a guarda que impede converter material de cliente |
| `[controle positivo] transformacao para material do MESMO dono passa` | senão a guarda poderia recusar tudo e o teste acima passaria à toa |
| `peca de material inexistente falha ensinando o caminho` | decisão 6 |
| `quantidade_consumida acima do pendente falha` | decisão 1 — o teto da 8b continua valendo |
| `resultado em unidade diferente NAO conta no teto` | decisão 1, o erro que o desenho evita |
| `falha no credito da segunda peca devolve a chapa` | decisão 9, compensação |
| `[schema] resultado nao declarado no Zod nao chega ao servico` | `z.object` descarta chave em silêncio (`schemas.js:312-320`) |
| `recebimento por NF passa a alimentar custo medio` | decisão 5 |
| `[controle positivo] recebimento sem valor_unitario nao zera o custo existente` | o modo de falhar da decisão 5 |
| `proximo-codigo em lote nao repete` | decisão 6, concorrência |
| `createMaterial extraido produz o mesmo resultado da rota` | decisão 6, refactor sem mudança de comportamento |
| `rendimento nao calculavel diz QUAL material nao tem peso` | decisão 7 |

---

## O que esta etapa **não** entrega, em linguagem de usuário

- Não planeja corte (não há BOM/nesting): registra o que voltou.
- Não controla corte feito **dentro** da GMP.
- Não recalcula o custo de nada que já entrou antes desta etapa.
- Não valida que os pesos fecham — mostra o rendimento quando dá para calcular, e diz quando não dá.
- Não conserta a divergência entre as telas de patrimônio (ela é anterior e está registrada).
