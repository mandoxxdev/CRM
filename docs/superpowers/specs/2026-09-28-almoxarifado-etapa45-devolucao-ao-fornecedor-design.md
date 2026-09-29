# Etapa 45 — A devolução ao fornecedor, e o encaminhamento com status (features 12 + 09)

> **Design.** Escrito em 2026-09-28, depois da Fase 0 medida no código. Paga o **último** item de
> "falta para 🟢" da feature 09 (*encaminhamento com status*) e o item desmarcado da feature 12
> (*devolução ao fornecedor*), e fecha o corte declarado da Etapa 44 (**B174**): a decisão
> *Devolver ao fornecedor* apenas marcava intenção.

---

## 1. O problema, em uma frase de galpão

A inspeção reprovou 3 kg e alguém decidiu **devolver ao fornecedor**. O documento fechou dizendo
isso — e **ninguém sabe se a devolução aconteceu**. O material continua bloqueado no galpão, o
cartão de alerta mostra *"Encaminhamento: DEVOLVER"* para sempre, e a única forma de descobrir se
a caixa voltou para a transportadora é perguntar para alguém.

## 2. O que a Fase 0 mediu

### F0-1 — ⚠️ Executar na hora da decisão seria ERRADO, e é a diferença desta etapa para a 44

A Etapa 44 fez a decisão **aceitar** executar no mesmo clique, e estava certa: liberar é um ato
**administrativo** — o material está no galpão antes e depois, só deixa de estar retido.

**Devolver não é.** O material **sai fisicamente**: alguém embala, emite documento, chama a
transportadora. Se a decisão baixasse o estoque na hora, o sistema afirmaria uma remessa que ainda
não aconteceu — e o galpão teria 3 kg que o sistema diz não existirem. **É o defeito que a Etapa 12
já pagou** na devolução ao estoque (*"a spec descrevia um comportamento quebrado como se estivesse
certo"*).

**Consequência de desenho:** a etapa **não** copia a 44. São **dois gestos**: decidir (já existe) e
**registrar que foi executado** (novo). E isso é exatamente o que o requisito pede — *"acompanhar
se a devolução/análise/substituição **já foi executada**"*.

### F0-2 — O material a devolver está BLOQUEADO, e o motor tem duas guardas contra isso

Uma saída comum não consegue tirá-lo, e por **dois** motivos independentes
(`stockService.js:790-801`):

1. `disponivel < quantidade` → *"Saldo insuficiente. Disponível: N"* — o disponível **subtrai** o
   bloqueado;
2. `(material.quantidade_bloqueada || 0) > 0 && tiposSaida.includes(tipo)` →
   *"Material bloqueado não pode ser utilizado"*.

**E existe molde exato para as duas**, medido e não inventado: `PERDA_TERCEIRO` /
`CONSUMO_TERCEIRO` (Etapa 8b). Eles baixam material que está **retido** em
`quantidade_em_terceiros`, pela mesma razão, e a saída se declara com a flag `baixandoTerceiro`
(`:598`), que desliga a guarda (1); a validação real acontece **no claim atômico**, com as duas
condições no próprio `WHERE`:

```sql
UPDATE materiais_almoxarifado
   SET quantidade_atual = quantidade_atual - ?,
       quantidade_em_terceiros = COALESCE(quantidade_em_terceiros,0) - ?
 WHERE id = ? AND COALESCE(quantidade_em_terceiros,0) >= ? AND quantidade_atual >= ?
```

**A devolução ao fornecedor é a mesma forma, com `quantidade_bloqueada` no lugar.** Não há régua
nova a inventar — há uma a copiar, e o comentário do molde diz por que ela é assim.

### F0-3 — A devolução que existe é uma ENTRADA; o fluxo novo não é "mais um destino"

`devolucoes_material_almoxarifado` (`schema.js:1537`) e `returnService.js` tratam do material
**voltando** ao galpão: `DESTINOS = ['ESTOQUE','QUARENTENA','SUCATA','RETRABALHO']` (`:12`), todos
gravando `ENTRADA_DEVOLUCAO`. Acrescentar `FORNECEDOR` ali faria o serviço dar **entrada** de algo
que está indo embora.

**A spec 12 já dizia isso** (`:176`) e a medição **a confirma** — raro o bastante para registrar:
aqui não há correção a fazer, há uma afirmação a reusar.

**O molde de direção certo já existe:** `DEVOLUCAO_CLIENTE` (Etapa 8, `schema.js:63`) — *"devolver
ao cliente é SAÍDA: o material sai do prédio de volta para quem é dele"*, com o comentário
avisando que é **direção oposta** à devolução da Etapa 7, *"a confusão mais provável de quem ler
este código depois"*. A devolução ao fornecedor é a irmã dela.

### F0-4 — `encaminhamento` tem leitores; o que falta é ESTADO

Correção de uma afirmação do meu próprio handoff. `inspecoes_recebimento_almoxarifado.encaminhamento`
é lido em **quatro** lugares: a consulta do cartão de alerta (`alertRegistry.js:119`), o corpo do
e-mail (`:457`), a coluna *Encaminhamento* da tela de Alertas (`AlertasAlmoxarifado.js:141`) e a
descrição da NC (`nonConformityService.js:511`).

**Todos mostram a INTENÇÃO.** Nenhum sabe se ela foi cumprida — e é por isso que o cartão cobra
para sempre. A etapa não precisa criar a fila: precisa dar **estado** à que já está na tela.

### F0-5 — O documento já existe, e é a NC

A Etapa 43 reusou os três encaminhamentos da inspeção como decisões da NC (`DEVOLVER`,
`SUBSTITUICAO`, `ANALISE_ENGENHARIA` — `nonConformityService.js:61`, declarado como reuso
deliberado). Então *"encaminhamento com status"* não pede documento novo: pede que **a decisão da
NC ganhe estado de execução**.

Isso evita o erro que a feature 09 cometeu com a tabela de anexos — seis specs esperando que outra
criasse o dono.

---

## 3. As regras de negócio

| ID | Regra |
|---|---|
| **RN-01** | A decisão da NC ganha **estado de execução**: `PENDENTE` quando a decisão exige um ato externo (`DEVOLVER`, `SUBSTITUICAO`, `ANALISE_ENGENHARIA`, `SUCATEAR`), e `NAO_SE_APLICA` para as duas de aceitação, que já se executaram sozinhas na Etapa 44. |
| **RN-02** | **Registrar a execução é um gesto próprio e posterior**, nunca automático na decisão — o material sai fisicamente, e afirmar a saída antes dela é mentir sobre o galpão (F0-1). |
| **RN-03** | Registrar a execução de **`DEVOLVER`** baixa o material: `DEVOLUCAO_FORNECEDOR` pelo motor, tirando de `quantidade_atual` **e** de `quantidade_bloqueada` no **mesmo** `UPDATE`, com as duas guardas no `WHERE` (F0-2). |
| **RN-04** | Registrar a execução de `SUBSTITUICAO`, `ANALISE_ENGENHARIA` e `SUCATEAR` **não move estoque** — marca a data, o autor e a observação. Para `SUCATEAR`, o abate é o fluxo de sucateamento, com as duas aprovações; para `SUBSTITUICAO`, a reposição entra como recebimento novo. **Corte declarado.** |
| **RN-05** | A execução é **idempotente**: claim em `execucao_em` com `WHERE execucao_em IS NULL`. Registrar duas vezes responde 409, e o estoque não se move de novo. |
| **RN-06** | A execução é **FATAL** quando move estoque: se o motor recusar, a marcação não fica. Mas — lição da Etapa 44, **RN-11** — estados **conhecidos** não travam o documento: bloqueado insuficiente (alguém já desbloqueou ou devolveu por fora) e material inativo **registram a execução sem mover saldo**, com mensagem própria. |
| **RN-07** | Só NC **decidida** pode ter execução registrada. NC `ABERTA` ou `CANCELADA` recusa, com literal própria. |
| **RN-08** | O cartão de alerta **para de cobrar** o que foi executado, e o e-mail deixa de sair. Hoje ele cobra a intenção para sempre (F0-4). |
| **RN-09** | A movimentação carrega o **número da NC** em `documento_vinculado` e o motivo *"Devolução ao fornecedor"* — mesmo desenho da liberação da Etapa 44, e é o que torna a saída legível no livro sem cruzar tabela. |
| **RN-10** | A execução **não é estornável pelo livro** — herda a razão da RN-12 da Etapa 44: estorná-la devolveria o material ao galpão com o documento dizendo "devolvido", e **sem saída**, porque a execução não se registra duas vezes. |

## 4. Quem pode registrar a execução — e por que é ação PRÓPRIA desta vez

⚠️ **Aqui a resposta é o oposto da Etapa 44, e a diferença é medível.** Lá, liberar era **efeito do
ato já autorizado** — o mesmo gesto, o mesmo instante, a mesma pessoa. Aqui não: registrar que a
devolução saiu é **outro ato, outro dia, outra pessoa** — quem trata com o fornecedor é **Compras**,
que está **fora** de `decidir_nao_conformidade` de propósito (**B169**: *"decidir sobre a entrega do
fornecedor que ele mesmo escolheu seria decidir em causa própria"*).

**Decisão: ação própria `executar_encaminhamento`**, concedida a `[ADMINISTRADOR, QUALIDADE, COMPRAS]`.
Compras **entra** aqui — e isso não contradiz a B169: decidir *o que fazer* continua fora dele;
**registrar que o combinado aconteceu** é exatamente o ofício dele.

**O que foi descartado:** pendurar em `decidir_nao_conformidade` (deixaria Compras de fora do que é
trabalho dele) e em `movimentar` (o gate mais amplo do módulo, que daria a ação a quem só movimenta
prateleira). Critério já escrito no módulo para `remessar_terceiro` e `ajustar_material_cliente`:
**quando a operação muda a natureza do risco, ela ganha ação própria.** Registrar na **letra B**.

## 5. Contratos de API

### `POST /api/almoxarifado/nao-conformidades/:id/executar` — **novo**

Permissão: `executar_encaminhamento`. Payload:

```json
{ "observacoes": "coletado pela transportadora X, conhecimento 12345" }
```

Resposta: a NC, **mais** o campo `execucao`:

```json
{ "...": "campos da NC",
  "execucao": { "estado": "EXECUTADA", "efeito": "BAIXADA",
                "quantidade": 3, "material_id": 12,
                "mensagem": "3 devolvido(s) ao fornecedor" } }
```

| `efeito` | Quando | `mensagem` **literal congelada** |
|---|---|---|
| `BAIXADA` | RN-03 cumprida | `"{q} devolvido(s) ao fornecedor"` |
| `SEM_SALDO` | RN-06: bloqueado insuficiente | `"O material já havia saído do bloqueio — a execução foi registrada sem mover saldo"` |
| `SEM_SALDO` | RN-06: material inativo | `"Material inativo — a execução foi registrada sem mover saldo"` |
| `NENHUMA` | RN-04: as três que não movem estoque | `"Esta execução não altera o saldo"` |

Erros:

| Código | Mensagem literal | Quando |
|---|---|---|
| 404 | `"Não conformidade não encontrada"` | id inexistente ou não inteiro |
| 400 | `"Só é possível registrar a execução de uma não conformidade decidida"` | RN-07 |
| 400 | `"Esta decisão não tem execução a registrar"` | decisão de aceitação (RN-01) |
| 409 | `"A execução desta não conformidade já foi registrada"` | RN-05 |

### `GET /api/almoxarifado/nao-conformidades` — **aditivo**

Ganha `execucao_estado` e `execucao_em` na projeção, e aceita `?execucao=PENDENTE` como filtro. É
o que transforma a listagem na **fila do que falta executar** — sem tela nova.

## 6. A tela

`NaoConformidadesAlmoxarifado.js`: coluna **Execução** (— / Pendente / Executada, com a data),
filtro *Pendentes de execução*, e botão **Registrar execução** nas linhas decididas que ainda não
têm. Modal com observações (opcional) e o aviso do que vai acontecer com o saldo.

⚠️ **O parágrafo do modal de decisão muda junto** — hoje ele diz que as outras quatro decisões
*"registram a intenção e não mexem no saldo"*, e passa a valer só até a execução. **Há cenário
`(21)` prendendo essa frase**; mudá-la sem atualizar o cenário quebra a suíte de propósito.

## 7. O que esta etapa NÃO cobre

- **Não emite documento fiscal de saída.** A spec 12 diz que a devolução ao fornecedor *"tem
  documento fiscal e contraparte externa"* — o fiscal fica de fora, declarado, e é o que impede
  esta etapa de fechar a feature 12 sozinha. **Letra B.**
- **Não avisa o fornecedor por e-mail.** A fila de notificações existe (feature 19) e plugar é
  pequeno, mas exige decidir texto e destinatário com o cliente.
- **Não cria a reposição da `SUBSTITUICAO`** — ela entra como recebimento novo, à mão.
- **Não desfaz a execução.** Registrou, valeu (RN-10). Erro se corrige por movimentação avulsa,
  como o resto do módulo.
- **Não retroage:** NCs decididas antes do deploy nascem com estado `PENDENTE` se a decisão pedir
  execução — e isso é **deliberado**, ao contrário do backfill da Etapa 44: aqui a fila retroativa
  é **útil** (são devoluções que de fato ninguém sabe se saíram), e nada acontece sozinho.
  Consulta para a **letra A**.
