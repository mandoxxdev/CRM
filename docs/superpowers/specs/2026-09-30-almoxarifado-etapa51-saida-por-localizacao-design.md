# Etapa 51 — A saída baixa o endereço de onde o material sai (desenho)

> **Feature:** 02 (Localizações), com efeito no motor (03). **Plano:**
> `docs/superpowers/plans/2026-09-30-almoxarifado-etapa51-saida-por-localizacao.md`

## 1. A Fase 0: a tela de vazias MENTIRIA, e o motor tem um furo

A próxima tarefa da 50 mandava medir antes de dar tela às "localizações vazias". A sonda
(`scratchpad/e51-sonda-localizacao.js`, rotas reais, controle positivo que sabe falhar) mediu:

| Cenário | Linhas de saldo depois | Físico |
|---|---|---|
| entrada de 100 em A → **entrega de requisição** de 100 | A:100, NULL:−100 | 0 |
| saída **sem origem** de 10 | A:40, NULL:−10 | 30 |
| saída com origem **B, que nunca teve nada** (5) | A:40, B:−5 | 25 |
| **AJUSTE absoluto sem localização** (A30 e B20, ajustado para 5) | A:30, B:20, NULL:−45 | 5 |
| material com padrão P, entrada de 50 em Q, entrega de 60 | Q:50, P:−40 | 10 |
| transferência A→B, e o estorno dela | corretos | — |

**Por quê:**
- a saída sem lote debita **uma linha só**, a da origem declarada, a da localização padrão ou a `NULL` (`stockService.js:1333-1337`), sem guarda. A entrega de requisição não manda origem (`requisitionService.js:633`);
- o AJUSTE absoluto sem localização grava o resíduo na linha padrão/NULL (`syncSaldoLocalizacaoPadrao`).

**Efeito:** o endereço de onde o material saiu **continua com o saldo antigo**. A entrega de requisição é
o fluxo principal, então o "sem localização" negativo é regra, não exceção. O mapa e a rota de
vazias contam as linhas com `quantidade > 0`, e o A:100 com o físico em 0 aparece **ocupado**.

**E um furo do motor:** depois do AJUSTE sem localização (NULL:−45), um AJUSTE **com** localização A = 0
deixou `quantidade_atual = −25` num material com `permite_saldo_negativo = 0`. O motivo é que `syncMaterialTotals`
soma as linhas, inclusive a negativa.

**Decisão da Fase 0:** a tela de vazias **não** entra nesta etapa, nem com aviso. O aviso cobriria o fluxo
principal inteiro. Ela vai para a **52**, como chave no registro de relatórios. A 51 conserta a atribuição.

## 2. As regras

**RN-01 — Saída sem lote consome os endereços que TÊM saldo.** É a mesma regra que o motor já usa para
lote (`claimSaldoDoLote`, "área física não é filial"), aplicada às linhas **sem lote**:
- a ordem é a localização resolvida (a origem declarada ou a padrão), depois as de maior saldo;
- só o que **sobrar** vai para a linha da localização resolvida (ou `NULL`), que pode ficar negativa e representa o **"sem localização atribuída"**, no molde do "sem lote atribuído" das Etapas 49/50;
- **linhas de lote não são tocadas** pela saída sem lote. A B204 decidiu que a entrega de requisição não escolhe lote.

*Cenário:* entrada de 100 em A → entrega de 100 → **A:0**, sem linha negativa.

**RN-02 — Origem declarada sem saldo não negativa sozinha.** A saída de 5 com origem B, sem nada em B e
40 em A, fica com **B:0 e A:35**: a origem declarada é a **preferida**, não a única. É a mesma leitura do lote.

**RN-03 — AJUSTE absoluto sem localização, para BAIXO, drena os endereços antes de negativar.** Quando o
resíduo da linha padrão/NULL ficaria negativo, a diferença sai primeiro das linhas sem lote **positivas**
(a padrão, depois as maiores). Ajuste para **cima** continua indo para a linha padrão/NULL, porque não há
como saber onde o material apareceu.
*Cenário:* A30 e B20, ajuste para 5 → as linhas somam 5, **sem negativa**.

**RN-04 — Nenhum AJUSTE deixa o físico negativo em material que não o permite.** O AJUSTE com localização
que levaria `quantidade_atual` abaixo de zero é **recusado**, com
`400 — Ajuste deixaria o saldo do material negativo (<valor>). O material não permite saldo negativo.`

## 3. O que NÃO é

- **O estorno de saída** credita de volta uma linha só (a da origem ou a padrão), e não as linhas que o claim
  drenou: o movimento não guarda quais linhas debitou. O total fica certo e o endereço pode não voltar
  ao exato. Isso vai para a **letra D**. Guardar as linhas por movimento é tabela nova, em etapa própria.
- **Linhas negativas já gravadas** em produção **não** são corrigidas por migração, porque isso seria
  irreversível. A dump de 3/set tem **0 movimentos com localização**, então o passado é quase vazio. A consulta
  para medir vai para a **letra A**.
- **A tela de vazias** e o alinhamento da rota de vazias com o fallback do mapa (legado sem linha) vão
  para a **Etapa 52**.

## 4. Sort

Tudo é **tronco**: é motor de estoque, na mesma função.

| Task | O que é |
|---|---|
| **T1** | `claimSaldoSemLote` (RN-01/02) no ramo sem lote da saída |
| **T2** | RN-03 no `syncSaldoLocalizacaoPadrao` |
| **T3** | RN-04, a guarda do AJUSTE com localização |
| **T4** | integração: os 8 cenários da sonda viram teste, pelas rotas reais, incluindo a entrega de requisição |
