# Etapa 43 — a divergência vira DOCUMENTO NUMERADO (features 08 + 09)

> Design. Data: 2026-09-28. Branch: `desenvolvimento-almoxarifado`.
> Antecessora: Etapa 42 (`dcda360..cac5863` — o recebimento fecha o pedido de compra).

## O problema, em linguagem de galpão

Hoje o sistema **detecta** que chegou material a menos (ou a mais) e que a inspeção reprovou uma
quantidade — e avisa, por alerta e por e-mail. Mas **não existe documento**. Ninguém consegue
responder, olhando o sistema:

- *"Quem decidiu aceitar aquela falta de 3 kg do fornecedor X, e quando?"*
- *"Aquele lote reprovado foi devolvido, sucateado, ou aceito sob desvio?"*
- *"Quantas não conformidades estão abertas sem decisão há mais de uma semana?"*

O fato está calculado e some do alerta assim que sai da janela de dias. A decisão sobre o fato
não é gravada em lugar nenhum — mora no e-mail de alguém, ou na memória do almoxarife.

Esta etapa cria o documento: **NC-XXXXXXXXXXXXXXXX**, numerado, com o fato congelado, a decisão,
o autor, a justificativa e a trilha.

## O que JÁ EXISTE (medido na Fase 0, 2026-09-28)

| Insumo | Onde | Estado |
|---|---|---|
| Régua float-safe de divergência | `services/almoxarifado/divergencia.js` (`EPSILON_DIVERGENCIA = 1e-9`, `divergenciaRealSql`) | pronta, dono único desde a Etapa 10b |
| Consulta da divergência de recebimento, **com modo por id** | `alertRegistry.listarDivergenciasRecebimento(db, { dias, recebimentoId })` `:139` | pronta |
| Consulta dos reprovados, **com modo por id** | `alertRegistry.listarReprovados(db, { dias, inspecaoId })` `:113` | pronta |
| Numerador único com retry | `numeroDoc.inserirComNumeroUnico(db, prefixo, fn)` `:126` — **este é o contrato**, não `gerarNumeroDocumento` | pronto, 4 consumidores |
| Vocabulário de encaminhamento | `inspectionService.ENCAMINHAMENTOS = ['DEVOLVER','ANALISE_ENGENHARIA','SUBSTITUICAO']` `:33` | existe; **falta** `ACEITAR`, `ACEITAR_SOB_DESVIO`, `SUCATEAR` |
| Anexos por entidade | `anexoService.ENTIDADES_ANEXO` `:30` (6 entidades) | acrescentar entidade é **uma linha** de cada lado |
| Registro de alertas | `alertRegistry.ALERT_REGISTRY` — **13 entradas** (contadas, não deduzidas) | pronto |
| Perfis a conciliar | `receber_material: [ADMIN, ALMOXARIFE, COMPRAS]` `:86`; `inspecionar: [ADMIN, ALMOXARIFE, QUALIDADE]` `:102` | interseção ADMIN+ALMOXARIFE |

**Medida de ausência, pelo nome do CONTRATO** (não pelo nome imaginado): não há tabela
`nao_conformidades_*` nem `divergencias_*` em `schema.js`. O único `nao_conformidades` do repo é
um KPI de dashboard de **produção** (`server/index.js:22305`) que lê `controle_qualidade` —
tabela **órfã para escrita**, já documentada como tal na spec 09. Não há o que reaproveitar.

## Decisões de desenho

### D1 — UM documento, não dois. E o nome é "não conformidade".

A spec 08 pede *"divergência formal numerada"*; a spec 09 pede *"não conformidade formal
numerada"*. **É o mesmo documento visto de dois lados.** Uma tabela só,
`nao_conformidades_almoxarifado`, com `origem` (`RECEBIMENTO` | `INSPECAO`).

- **Descartado:** duas tabelas. Divergiriam na primeira edição e dariam **dois números para o
  mesmo fato físico** — a classe de bug que este módulo mais combate.
- **Precedente a favor:** `anexos_documento_almoxarifado` é tabela única com `entidade` +
  `entidade_id`, e funcionou para seis consumidores (Etapas 32/34).
- **O nome:** *"divergência"* continua nomeando o **fato** (o que `divergencia.js` calcula);
  *"não conformidade"* nomeia o **documento**. Uma falta aceita continua sendo não conformidade.
  Registrar em **letra B**, porque a tela de recebimento continua falando "divergência" enquanto
  a tela nova fala "NC-…" — duas palavras para o mesmo fato, e o usuário arbitra. *(Este item
  prometia que a tela de recebimento passaria a mostrar "NC-…". A Fase 2 mostrou que nenhuma task
  tocava aquela tela — a promessa SAIU, ver o item 7 de "O que esta etapa NÃO faz". Corrigida à
  vista, não apagada.)*
- **Origem `INVENTARIO` fica FORA**, de propósito: a divergência de inventário tem fluxo próprio
  (conferência → ajuste) e a coluna `origem` a aceita no dia em que for pedida, sem migração.

### D2 — O fato é CONGELADO na abertura; a decisão é GRAVADA.

A NC copia `quantidade_esperada`, `quantidade_recebida` e `divergencia` no ato — mesmo
precedente das medidas de inspeção (RN-05 da Etapa 27: o plano é congelado, e editar o plano
depois não reescreve inspeção antiga).

**Mas com uma diferença, e ela é uma regra:** enquanto a NC está `ABERTA`, o fato ainda está
sendo apurado, então **reconferir o item atualiza os números congelados** (RN-04). Depois de
`DECIDIDA`, nada mais toca o documento. E se a reconferência **apaga** a divergência (o operador
corrigiu o próprio erro de digitação), a NC aberta é **CANCELADA automaticamente** (RN-05) — sem
isso, um erro de digitação corrigido deixaria NC fantasma para sempre, que é o beco "Atrasado
para sempre" da Etapa 42 em outra roupa.

### D3 — `divergencia_quantidade` da INSPEÇÃO passa a ser DERIVADA (correção de defeito)

Achado medido no fechamento da 42 e confirmado agora (`inspectionService.js:275`):
`data.divergencia_quantidade ? 1 : 0` — **o payload manda**, enquanto `conforme` (`:274`) e
`divergencia_dimensional` (`:224`) são derivados. O item já está carregado na função, com
`quantidade_esperada` e `quantidade_recebida` ao lado. É a mesma classe de defeito do
`reserva_id` da feature 07: coluna que a spec descreve como fato e que é só um checkbox.

**Decisão:** derivar, pela régua de `divergencia.js`, ignorando o payload; devolver o valor
derivado na resposta (aditivo); tornar a caixa somente-leitura na tela, como a Etapa 29 fez com
a dimensional. `certificado_ausente` / `dano_fisico` / `material_incorreto` **continuam
auto-declarados** — ninguém os calcula, e isso é legítimo.

> **A FASE 2 MEDIU O CUSTO (achado BLOQUEANTE 2), e ele não estava aqui.** Os fixtures nascem
> com `quantidade_recebida = quantidade_esperada` (`receiptService.js:425`), então a derivada dá
> **0** e dois testes ficam vermelhos: `medidasInspecao.api.test.js:454` e
> `inspecaoHistorico.api.test.js:287`, ambos afirmando `divergencia_quantidade === 1` depois de
> mandar a flag no payload. **E há algo pior que o vermelho:** o cenário
> `inspecaoHistorico.api.test.js:244-292` existe para pegar **cruzamento de coluna no SELECT** —
> as três flags valiam 0 em todo lugar, e o padrão **`1/0/0`**, a única alavanca que distingue
> uma coluna da outra, só era produzível **pelo payload**. Com a RN-07 essa alavanca some e a
> medição morre em silêncio. **Os dois testes têm de fabricar divergência real** (`UPDATE` da
> `quantidade_recebida` no fixture) para manter o padrão `1/0/0` vivo — está escrito na T3.

> **E a tela não tinha como mostrar o derivado (achado BLOQUEANTE 4).**
> `listarInspecoesPendentes` (`inspectionService.js:390-397`) **não devolve**
> `quantidade_esperada` nem `quantidade_recebida`, e calcular no client está vetado pelo
> precedente escrito da própria feature (nota da B60: *"pré-visualizar na tela exigiria uma
> segunda cópia da régua"*). Sem contrato novo, T5 entregaria uma caixa desabilitada e
> **desmarcada — que mente quando há divergência**. A T3 passa a devolver, na fila de pendentes,
> `quantidade_esperada`, `quantidade_recebida` **e a flag `divergencia_quantidade` já derivada no
> servidor** — a tela lê a flag, não a recalcula.

### D4 — Abre sozinha, no ato, por gancho NÃO FATAL — em TRÊS portas, não duas

> **CORRIGIDO NA FASE 2 (achado BLOQUEANTE 1).** Este bloco dizia "dois ganchos" e listava só
> `conferirRecebimento` do lado do recebimento. **Estava errado, e errado do jeito mais caro:**
> quem escreve `quantidade_recebida` são **DOIS** serviços — `conferirRecebimento`
> (`receiptService.js:782`) e `salvarDadosFiscal` (`:940`) —, e **a UI de produção passa pelo
> fiscal**. O próprio arquivo registra isso no cabeçalho (`:43-45`) como achado Crítico da Etapa
> 17, e há teste congelando (`alertaEventoGanchos.api.test.js:160`: *"a rota /fiscal tambem
> dispara … a UI nunca chama /conferir"*). Com o gancho só na conferência, a feature **nasceria
> invisível no único caminho que o cliente usa**.

Três ganchos, no molde exato do gancho de alerta que já existe nos mesmos três pontos:

1. `conferirRecebimento` — item com divergência real → NC `origem=RECEBIMENTO`, `tipo=QUANTIDADE`.
2. `salvarDadosFiscal` — **o mesmo**, porque é por aqui que a tela real escreve a quantidade.
3. `decidirInspecao` — `quantidade_reprovada > 0` → NC `origem=INSPECAO`, `tipo` derivado (D9).

**Posição congelada:** o gancho de NC entra **DEPOIS** de `avisarDivergenciasDoRecebimento`
(`receiptService.js:799` e `:966`) nas duas portas. Com a correção do D6 a ordem não muda o
resultado — mas fica congelada assim para que uma falha do gancho novo não possa afetar o aviso
que já existia.

**Não fatal**: falha do gancho vira `console.warn` e **não** derruba a conferência nem a decisão
de inspeção. A rede de segurança contra o gancho que falhou é o alerta `DIVERGENCIA_RECEBIMENTO`
que já existe (ver D6).

Existe também a **porta manual** (`POST /nao-conformidades`), para o caso que nenhum gancho vê:
certificado ausente sem reprovação, dano físico notado depois.

### D5 — Idempotência por índice único parcial

`CREATE UNIQUE INDEX ... ON nao_conformidades_almoxarifado(origem, referencia_tipo,
referencia_id, tipo) WHERE status = 'ABERTA'` — reconferir dez vezes não abre dez NCs. Mesmo
molde do índice parcial de `planos_inspecao_almoxarifado` (Etapa 27). A colisão é detectada
**pelo banco**, nunca por `SELECT`-antes-do-`INSERT`, que tem janela de corrida.

Consequência declarada: **duas NCs DECIDIDAS** do mesmo item são possíveis (chegou a menos,
decidiu-se aceitar; reconferiu e faltou mais ainda). É o desejado — cada decisão é um documento.

**Mas só quando o FATO MUDOU (RN-10).** A Fase 2 achou o buraco (achado IMPORTANTE 7): o modal
de NF **reenvia a quantidade de TODOS os itens** (`receiptService.js:889-890` diz isso em
letras), então salvar de novo **sem mudar nada** reabriria NC para um fato que ninguém
reobservou. Antes de abrir, o serviço compara a divergência atual com a da última NC
**encerrada** do mesmo item+tipo, pela régua de `divergencia.js`: igual ⇒ não reabre.

### D6 — O alerta novo, e o que acontece com o antigo

Entrada **14ª**, `NAO_CONFORMIDADE_ABERTA`: NCs em `ABERTA` há mais de N dias
(`alerta_nc_parada_dias`, default 7), uma linha por NC, com número, material, tipo e dias.

E o cartão `DIVERGENCIA_RECEBIMENTO` passa a **excluir itens que já têm NC** — vira a **rede de
segurança do gancho não fatal**: enquanto a NC não existir, o item continua na central e na
varredura diária. Sem isso, o mesmo item apareceria em dois avisos e o usuário aprenderia a
ignorar os dois.

> **CORRIGIDO NA FASE 2 (achado BLOQUEANTE 3).** Este bloco dizia "`listarDivergenciasRecebimento`
> passa a excluir". **Estava errado:** aquela função é o **detector** do módulo, não a população
> de um cartão — ela é dual-mode e é chamada direto por `avisarDivergenciasDoRecebimento` nos dois
> escritores. Mexer nela derrubaria `recebimentoExcedente.api.test.js:257`,
> `recebimentoPortasIntegracao.api.test.js:214` e `alertaEventoGanchos.api.test.js:143` — e, pior,
> silenciaria o cenário **A1** (`alertaEventoGanchos.api.test.js:289-318`), que existe para
> garantir que *"errar de novo, PIOR, avisa de novo"*, que é o bug que a Etapa 17 pagou.
> **A exclusão entra no `listar` DA ENTRADA do alerta** (`alertRegistry.js:412`), por um parâmetro
> `{ excluirComNC: true }`; os dois modos da função compartilhada ficam intactos.

Reversível numa cláusula `WHERE`. Registrar em **letra B**.

### D7 — A decisão é de DOCUMENTO, não de ESTOQUE

Decidir `DEVOLVER` **não** cria a devolução; decidir `SUCATEAR` **não** baixa saldo. O estoque
já se moveu (a inspeção bloqueou o reprovado; a conferência registrou o que chegou). A NC
registra **o que se decidiu fazer**, com autor e justificativa.

**Limitação declarada (letra D)**, não omissão: ligar a decisão ao motor de estoque é etapa
própria, e ligá-la agora significaria inventar como uma NC de quantidade "devolve" material que
nunca entrou. Fazer errado seria pior que não fazer.

### D8 — Autorização: abrir é largo, decidir é estreito

| Ação nova | Perfis | Por quê |
|---|---|---|
| `registrar_nao_conformidade` | `[ADMINISTRADOR, ALMOXARIFE, QUALIDADE, COMPRAS]` | quem **vê** o problema abre: quem confere (ALMOXARIFE, COMPRAS) e quem inspeciona (QUALIDADE) |
| `decidir_nao_conformidade` | `[ADMINISTRADOR, QUALIDADE]` | aceitar sob desvio é ato de quem responde pela qualidade do que entra |

**Tirar COMPRAS da decisão é escolha**, não esquecimento: COMPRAS tem `receber_material` e é
parte interessada no fornecedor — deixá-lo decidir sobre o próprio fornecedor é o conflito que a
separação de papéis existe para evitar. Reversível numa linha. **Letra B.**

Os ganchos automáticos rodam **sem** `requirePermission` (são efeito do ato já autorizado —
conferir e inspecionar), pelo mesmo desenho do gancho de status da Etapa 42.

### D9 — O `tipo` da NC de inspeção: UMA NC por inspeção, tipo por prioridade declarada

A Fase 2 achou o branco (achado 9): a decisão de inspeção pode gravar `divergencia_dimensional`,
`certificado_ausente`, `dano_fisico` e `material_incorreto` **ao mesmo tempo**
(`inspectionService.js:275-276`), e o enum de tipo tem um valor para cada. Quatro NCs? Uma
arbitrária? O plano não dizia, e um agente de galho escolheria sozinho.

**Decisão: UMA NC por inspeção** (`referencia_id` = `inspecao_id`, que é novo a cada decisão, então
a idempotência do D5 nem é exercitada aqui), com o `tipo` escolhido por **prioridade declarada**,
da causa mais específica para a mais genérica:

`MATERIAL_INCORRETO` → `DANO_FISICO` → `DIMENSIONAL` → `CERTIFICADO_AUSENTE` → `QUANTIDADE` →
`OUTRO`

**Todas** as flags ligadas entram na `descricao` do documento, então nada se perde — o `tipo` é
para agrupar e filtrar, não para contar a história. Chegar em `QUANTIDADE` significa "reprovou e
nenhuma flag foi marcada": a reprovação é o fato.

### D10 — O documento NUNCA é apagado por um gesto posterior ao processamento

A Fase 2 achou o buraco (achado 8, cenário concreto): `conferirRecebimento` **não tem guarda de
status** (`:752-802`) — ao contrário de `salvarDadosFiscal` (`:851-857`) e de `processarNota`
(`:1348`). Então um recebimento **PROCESSADO** (estoque creditado, conta a pagar gerada, pedido
fechado pela Etapa 42) pode ser reconferido para 10, e a RN-05 **cancelaria** a NC da falta de 2
unidades que já virou estoque e dinheiro — com o motivo automático dizendo "divergência
corrigida". É a `B161` ganhando um irmão.

**Decisão assimétrica, e é de propósito:** com o recebimento já processado, a sincronização
**pode abrir** uma NC nova (uma divergência descoberta depois do processamento é justamente o que
precisa de documento), mas **não atualiza e não cancela** nada. Destruir documento é irreversível;
criar não é.

## Regras de negócio

- **RN-01** — Toda NC tem `numero` único com prefixo `NC-`, gerado por `inserirComNumeroUnico`,
  com `UNIQUE` na DDL. Nunca `Date.now()` cru (o `REC-` já repetia a cada 27,78 h — Etapa 31).
- **RN-02** — A NC nasce `ABERTA`. Estados: `ABERTA` → `DECIDIDA` | `CANCELADA`. Não volta.
- **RN-03** — A abertura automática usa a régua de `divergencia.js`: `|recebida - esperada| >
  1e-9`. Item sem `quantidade_recebida` registrada **não** abre NC (ninguém conferiu ainda).
- **RN-04** — Reconferir um item com NC `ABERTA` **atualiza** o fato congelado. NC `DECIDIDA` ou
  `CANCELADA` é imutável.
- **RN-05** — Reconferir de modo que a divergência **desapareça** cancela a NC `ABERTA`, com
  `motivo_cancelamento` automático e trilha.
- **RN-06** — Decidir exige `decisao` do enum e `justificativa` não vazia. Decisão em NC não
  `ABERTA` recusa com 409.
- **RN-07** — `divergencia_quantidade` da inspeção é **derivada** do item, nunca do payload.
- **RN-08** — Um item só pode ter **uma** NC `ABERTA` por `tipo` (índice único parcial).
- **RN-09** — Toda abertura, decisão e cancelamento deixa linha na auditoria, entidade
  `nao_conformidade`, com **três rótulos de ação distintos** — `NC_ABERTA`, `NC_DECIDIDA`,
  `NC_CANCELADA`. Não um grupo só: `auditLabels.js:160-163` diz que agrupar vale para
  **sinônimos do mesmo ato**, não para atos diferentes de nome parecido (achado 12 da Fase 2).
- **RN-10** — Depois de uma NC **encerrada**, só nasce outra do mesmo item+tipo se a divergência
  **mudou** (mesma régua). Salvar a conferência sem mudar nada não reabre documento (D5).
- **RN-11** — Com o recebimento já **processado**, a sincronização abre, mas **não atualiza e
  não cancela** (D10).

## Enum de decisão (estende o vocabulário que já existe)

`ACEITAR` · `ACEITAR_SOB_DESVIO` · `DEVOLVER` · `SUBSTITUICAO` · `ANALISE_ENGENHARIA` ·
`SUCATEAR`

Os três do meio são os `ENCAMINHAMENTOS` que a inspeção já usa — **reusados, não reinventados**.
`ACEITAR_SOB_DESVIO` é o item (2) do "falta para 🟢" da feature 09.

## Enum de tipo

`QUANTIDADE` · `DIMENSIONAL` · `CERTIFICADO_AUSENTE` · `DANO_FISICO` · `MATERIAL_INCORRETO` ·
`OUTRO`

## O que esta etapa NÃO faz

1. Não move estoque na decisão (D7).
2. Não cobre inventário (D1) — a coluna `origem` o aceita depois.
3. Não fecha o item (4) do "falta para 🟢" da 08 (o pedido que reabre no estorno, `B161`):
   medido, a NC não sabe nada sobre estorno de movimentação, e amarrar as duas coisas exigiria o
   gancho de estorno, que não existe. Fica nomeado, não resolvido.
4. Não numera a divergência de **inventário** nem a de **devolução ao cliente**.
5. **NC aberta NÃO trava o processamento do recebimento.** O material entra no estoque e a conta
   a pagar é gerada com a NC em aberto — coerente com o D7 (o documento registra a decisão, não
   bloqueia o fluxo), e agora **declarado**, porque a Fase 2 mostrou que quem lê "não
   conformidade" supõe o contrário (achado 13).
6. **`ACEITAR_SOB_DESVIO` fecha o DOCUMENTO, não a LIBERAÇÃO.** O item (2) do "falta para 🟢" da
   feature 09 (*liberação sob desvio autorizado*) **NÃO fica pago**: os quilos reprovados
   continuam em `quantidade_bloqueada` (`inspectionService.js:250-251`), e quem os libera é
   `POST /materiais/:id/desbloquear`, gateado por `ajustar_estoque` — que **não inclui
   QUALIDADE**, exclusão deliberada e já escrita em `permissions.js:99-101`. Ou seja: a QUALIDADE
   decide "aceito sob desvio" e **não consegue executar a própria decisão**. Achado 11 da Fase 2.
   Fica declarado aqui e na letra C das novidades — não marcado como entregue.
7. **A tela de RECEBIMENTO não mostra o número da NC.** O D1 prometia isso e nenhuma task tocava
   `RecebimentosAlmoxarifado.js` (achado 10). A promessa foi **retirada** em vez de virar task: a
   NC tem tela própria e o vínculo aparece lá, pelo número do recebimento. Acrescentar o
   distintivo na tela de recebimento é uma linha, no dia em que for pedido.
