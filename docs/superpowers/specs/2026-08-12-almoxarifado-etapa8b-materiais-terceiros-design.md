# Almoxarifado — Etapa 8b: Materiais Enviados a Terceiros (design)

> **Data:** 2026-08-12 · **Status:** aprovado — o usuário autorizou explicitamente adotar as
> opções recomendadas e executar ("pode marcar todas as opções recomendadas, só deixe em escrito o
> que decidiu, e já executar tudo"). **Cada decisão abaixo foi tomada pelo assistente**, com a
> razão escrita, para revisão posterior.
> **Feature:** `specs/modulo-almoxarifado/14-materiais-terceiros`
> **Briefing de origem:** seção final de
> `docs/superpowers/plans/2026-08-12-almoxarifado-etapa8-materiais-clientes.md`

## O problema

A GMP manda material para fora beneficiar — corte, dobra, usinagem, tratamento, pintura,
galvanização — e hoje **nada disso existe no sistema**. A feature 14 está ❌: nenhuma tabela,
nenhuma rota, nenhuma tela.

Na prática, quando uma chapa vai para o galvanizador ela simplesmente **some do controle**: ou
alguém dá baixa (e o material desaparece do patrimônio, embora continue sendo da empresa), ou não
dá baixa nenhuma (e o sistema afirma que a chapa está na prateleira, quando ela está a 40 km).
Não há prazo, não há retorno parcial, e não há como amarrar a peça que voltou à chapa que saiu.

## Escopo — a etapa foi DIVIDIDA em 8b e 8c

**Decisão 1.** A feature 14 vira **duas** etapas:

- **Etapa 8b — remessa e retorno do MESMO material** (este design): máquina de estados, saldo em
  terceiros, documento de remessa, retorno parcial, encerramento com pendência justificada, tela.
- **Etapa 8c — transformação**: o material que volta **não é** o que saiu (chapa → peças + sobra).

**Por que a divisão tem uma fronteira real, e não é só "cortar pela metade":** metade dos
beneficiamentos da lista — **tratamento, pintura, galvanização** — devolve o **mesmo** material,
com o mesmo código. Para esses, a 8b entrega o ciclo **completo**, sozinha. Só **corte, dobra e
usinagem** devolvem material diferente, e é aí que entra a modelagem nova.

Mesmo precedente da Etapa 6 (dividida em 6/6b/6c) e da própria Etapa 8 (8/8b). Cada uma fecha com
testes passando por conta própria.

## Decisões

### Decisão 2 — saldo "em terceiros": coluna de retenção, e a conferência passa a descontá-la

O checklist pede "saldo visível mas não disponível". O briefing oferecia duas opções e **as duas
estavam incompletas**:

- **Localização virtual (a) não entrega o que promete.** `stockService.getSaldoDisponivel` calcula
  sobre o escalar `materiais_almoxarifado.quantidade_atual` — material numa localização virtual
  **continuaria disponível** para saída. Falha o requisito.
- **Coluna de retenção (b), sozinha, cria um problema novo.** É a resposta certa para o
  disponível: `getSaldoDisponivel` já subtrai `quantidade_reservada`, `quantidade_bloqueada` e
  `quantidade_em_inspecao`, e subtrairia a quarta. **Mas** material no galvanizador **não está na
  prateleira**, e a conferência de inventário monta o esperado a partir de `m.quantidade_atual` —
  **por material, não por localização** (`routes/almoxarifado.js:900`, verificado). Toda contagem
  passaria a acusar uma diferença fantasma.

> **Correção de um pressuposto meu, registrada porque quase virou desenho errado:** cheguei a
> propor combinar (a) + (b), supondo que a conferência contasse **por localização** e que uma
> localização virtual ficaria fora da contagem. **Não conta** — é por material. A combinação não
> resolveria nada e teria custado uma localização virtual inútil.

**Adotado:** coluna **`quantidade_em_terceiros`** em `materiais_almoxarifado`, no padrão das três
existentes, **mais** a mudança na conferência: `quantidade_sistema` passa a ser
`quantidade_atual − quantidade_em_terceiros`.

**E só essa retenção é descontada da contagem** — de propósito. Quarentena e bloqueio continuam
somando, porque aquele material **está** na prateleira e **tem** de ser contado; "bloqueado" é um
estado administrativo, não uma ausência física. `quantidade_em_terceiros` é a única das quatro que
significa **"não está no prédio"**. Essa distinção tem de estar comentada no código, senão o
próximo leitor "uniformiza" as quatro e quebra a contagem.

**Consequência que a etapa herda, e não resolve:** a pendência já registrada — `AJUSTE` não
reconcilia `quantidade_bloqueada`, deixando disponível negativo — **ganha uma segunda instância**
com a quarta coluna. A decisão de negócio (o Ajuste deve baixar a retenção, recusar, ou avisar?)
continua sendo do cliente e está no item **B** do bloco "Leia antes de apresentar" em
`docs/almoxarifado-novidades-por-etapa.md`. A 8b **não** a resolve; apenas **não piora** —
o encerramento de remessa é o caminho controlado para zerar `quantidade_em_terceiros`.

**Reusar a auditoria da Etapa 8.** A coluna nova repropõe a mesma pergunta para **todas** as
leituras de `materiais_almoxarifado` — e a lista de **40 leituras já está levantada e classificada
em A/B/C** na Task 1 do plano da Etapa 8. **Reusar a lista, não refazer o grep.**

### Decisão 3 — máquina de estados

`ABERTA → ENVIADA → RETORNO_PARCIAL → ENCERRADA / CANCELADA`, no molde de
`requisitionStateMachine.js` (transições declaradas e validadas, com teste por transição).

- **ABERTA**: remessa montada, itens escolhidos, **nada saiu do estoque ainda**. `CANCELADA` daqui
  não mexe em saldo nenhum.
- **ENVIADA**: o efeito de estoque acontece — `quantidade_em_terceiros` sobe, disponível desce.
- **RETORNO_PARCIAL**: parte voltou; o restante segue retido.
- **ENCERRADA**: fecha. Se sobrar saldo que nunca voltou, **exige destino justificado** (ver
  decisão 4).
- **CANCELADA** depois de ENVIADA: devolve tudo ao disponível, como um estorno.

### Decisão 4 — encerrar com pendência exige destino, não só justificativa

O teste que a spec exige (`encerrar remessa com pendencia sem justificativa falha`) diz que
**alguma coisa** tem de ser registrada. Texto livre não basta: o saldo retido precisa **sair** de
`quantidade_em_terceiros`, e para onde ele vai muda o estoque.

**Adotado:** encerrar remessa com saldo pendente exige escolher um **destino** para o que não
voltou — **`PERDA_NO_TERCEIRO`** (sumiu/foi danificado lá) ou **`CONSUMIDO_NO_PROCESSO`** (virou
cavaco, refugo de processo) — **mais justificativa**. Cada um emite a movimentação correspondente
pelo motor, e as duas **baixam** o material de vez.

Rejeitado "só justificativa": deixaria `quantidade_em_terceiros` preso para sempre num material
cuja remessa está encerrada — exatamente o tipo de saldo órfão que esta sessão já corrigiu duas
vezes (reserva presa na Etapa 6, linha órfã de devolução na Etapa 7).

### Decisão 5 — guarda do dono: isenta, com o dono obrigatório no documento

Remessa de material que pertence a um cliente (a chapa do cliente que vai galvanizar) é **isenta**
da regra de OS/projeto da `ownerRules` — o material continua sendo daquele cliente, só mudou de
endereço. Mesmo espírito da `TRANSFERENCIA`.

**Mas com contrapartida obrigatória:** a remessa **registra o dono** e o **documento de remessa
nomeia o cliente proprietário**. Sem isso, a isenção viraria um caminho para material de cliente
sair do prédio sem rastro de propriedade — o oposto do que a Etapa 8 acabou de construir.

O modelo de propriedade **já existe**: é `proprietario_cliente_id`. **Não se cria conceito novo.**

### Decisão 6 — ação de perfil própria `remessar_terceiro`

Mesmo critério que a Etapa 8 usou para `ajustar_material_cliente`: a operação tem risco próprio —
**o material sai do site**, o que é diferente de mover prateleira. Ação nova em `ACAO_PERFIS`,
exposta em `GET /almoxarifado/minhas-permissoes`.

Concedida inicialmente aos mesmos perfis de `movimentar` (`ADMINISTRADOR`, `ALMOXARIFE`) — o ganho
não é restringir hoje, é **poder restringir sem reescrever nada** quando o cliente quiser.

### Decisão 7 — transformação fica para a 8c, e a 8b não fecha a porta dela

A 8b **não** implementa "chapa → peças". Mas o retorno já nasce modelado como **lista de
resultados** (`retornos_remessa_item`), e não como "quantidade que voltou": na 8b todo resultado
tem o mesmo `material_id` do item enviado; na 8c passa a poder ter outro, e o vínculo de
rastreabilidade já existe. **Modelar o retorno como escalar agora obrigaria a 8c a reescrever a
tabela.**

### Decisão 8 — documento de remessa em PDF gerado no navegador

Padrão validado em duas etapas seguidas (`utils/etiquetasPdf.js` 6c, `utils/posicaoClientePdf.js`
8): funções puras montadoras + renderizador `jspdf`, testáveis sem tocar em binário, **zero
mudança de servidor**. `jspdf` já é dependência.

### Decisão 9 — sem transação, copiar a forma do recebimento

Remessa com N itens move estoque item a item. **Copiar o padrão do
`receiptService.darEntradaEstoque`**: pré-checagem que recusa a remessa **inteira** antes de mover
qualquer coisa, depois efeito item a item com claim no `WHERE`. Não inventar forma nova — e a
Etapa 7 mostrou por quê: reprocessar nota com falha no meio duplicava estoque.

### Decisão 10 — fora do escopo, declarado

E-mails (feature 19) e alerta de atraso (feature 20) — mesma decisão da Etapa 8, para não travar a
etapa esperando outra feature. A 8b **grava o prazo previsto** e a tela **destaca remessa vencida**;
o disparo automático é da 19/20. Anexo de desenhos nos itens também fica fora — o checklist o pede,
mas ele não bloqueia o ciclo, e a 8c (transformação) é o consumidor natural dele.

## Arquitetura

| Peça | Papel |
|---|---|
| `remessas_terceiro_almoxarifado` | cabeçalho: fornecedor, OS/pedido, prazo previsto, status, documento |
| `itens_remessa_terceiro_almoxarifado` | item: material, quantidade, lote, quantidade já retornada |
| `retornos_remessa_item_almoxarifado` | resultado de um retorno (na 8b, mesmo material; na 8c, outro) |
| `services/almoxarifado/thirdPartyService.js` | ciclo: criar, enviar, retornar, encerrar, cancelar |
| `services/almoxarifado/thirdPartyStateMachine.js` | transições, no molde de `requisitionStateMachine.js` |
| `stockService` | 4ª coluna de retenção + `getSaldoDisponivel` |
| `routes/almoxarifado.js` (conferência) | `quantidade_sistema` desconta `quantidade_em_terceiros` |
| `client/.../RemessasTerceirosAlmoxarifado.js` | tela: criar, enviar, receber retorno, encerrar |
| `client/src/utils/remessaPdf.js` | documento de remessa |

## Tratamento de erro

- Enviar remessa com item acima do disponível → 400 **antes de mover qualquer item** (decisão 9).
- Retorno acima do que foi enviado → 400 **dizendo quanto ainda está no terceiro** (mesma lição da
  Etapa 7: mensagem sem o número obriga o operador a adivinhar).
- Encerrar com saldo pendente sem destino/justificativa → 400 nomeando a quantidade pendente.
- Transição de status inválida → 400 dizendo o status atual e os permitidos.
- Remessa de material de cliente sem o dono registrado no documento → 400.

## Testes exigidos

| Regra | Teste |
|---|---|
| Material em terceiros sai do disponível mas continua no patrimônio | `envio a terceiro remove do disponivel e mantem quantidade_atual` |
| **A contagem de inventário não cobra o que está no terceiro** | `conferencia desconta o que esta em terceiros do esperado` |
| Quarentena e bloqueio **continuam** sendo contados | `[controle positivo] conferencia continua cobrando material bloqueado e em quarentena` |
| Retorno acima do enviado falha | `retorno maior que a remessa falha` |
| Encerrar com pendência sem destino falha | `encerrar remessa com pendencia sem destino falha` |
| Encerrar com destino baixa o saldo retido | `encerrar com perda no terceiro zera o em_terceiros` |
| Cancelar remessa ENVIADA devolve ao disponível | `cancelar remessa enviada restaura o disponivel` |
| Remessa não move nada se um item falhar | `remessa com item sem saldo nao move nenhum item` |
| Material de cliente vai a terceiro isento de OS/projeto | `remessa de material de cliente nao exige vinculo do dono` |
| Sem a ação, a remessa é recusada | `remessa sem a acao remessar_terceiro falha com 403` |

**Controle positivo bilateral obrigatório** em cada regra de segregação — a Etapa 8 mostrou cinco
vezes que teste só de recusa aprova implementação que barra tudo, e que a metade de exclusão
sozinha aprova leitura zerada.

## Documentação ao fim da etapa

Os 6 de sempre — spec 14, README mestre, guia (com roteiro clicável), plano, e
**`docs/almoxarifado-novidades-por-etapa.md`** com cada regra em linguagem de negócio, cenário
exato e mensagem real; mais o bloco **"Leia antes de apresentar"**, que precisa receber a segunda
instância da decisão pendente do `AJUSTE` (decisão 2).
