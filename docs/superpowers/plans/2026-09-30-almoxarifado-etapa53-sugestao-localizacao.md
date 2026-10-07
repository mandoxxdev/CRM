# Etapa 53 — A sugestão de localização na entrada (plano)

> **Desenho:** `docs/superpowers/specs/2026-09-30-almoxarifado-etapa53-sugestao-localizacao-design.md`

## T1 — predicado, serviço, rota

- **`motivoRecusaDestino(loc, material)`**: função pura extraída de `validarLocalizacaoParaMovimento`, com as **mesmas literais**. O motor passa a chamá-la.
- **`sugerirLocalizacaoEntrada(db, materialId)`** em `stockService`, pela RN-02.
- **Rota:** `GET /materiais/:id/sugestao-localizacao`, só com `auth`.
- **Cenários** (`sugestaoLocalizacao.api.test.js`):
  - a padrão aceita vem primeiro, com motivo `PADRAO`;
  - uma padrão **bloqueada** e uma padrão que **não aceita o tipo** do material **não** aparecem;
  - as posições com saldo aparecem, ordenadas pela quantidade, com `JA_TEM_O_MATERIAL`;
  - as vazias compatíveis aparecem, até 5, e a vazia que não aceita o tipo não aparece;
  - não há repetição (a padrão com saldo aparece uma vez só, como `PADRAO`);
  - **para toda sugestão, uma ENTRADA real com ela como destino é aceita pelo motor**: é a invariante da RN-01;
  - material inexistente devolve 404 com a literal.

## T2 — a tela

`MovimentacoesAlmoxarifado.js`: com o tipo ENTRADA e um material escolhido, busca a sugestão e mostra até 3 botões com o motivo. Clicar preenche `localizacao_destino_id`.

**Cenários:**
- os botões aparecem e o clique preenche o destino;
- no tipo SAIDA, nenhum GET de sugestão;
- uma falha da sugestão não quebra o formulário;
- sem material, nenhum GET.

## Fase 2 — o revisor ataca

1. A extração do predicado muda alguma literal ou algum comportamento do motor, nos dois papéis?
2. Localização **inativa** como padrão, e um material sem tipo (`tipo_material` NULL) diante de um endereço com restrição: o que o motor faz, e a sugestão acompanha?
3. As vazias da 52 incluem localizações "pai" (contêiner). Sugerir um pai para entrada faz sentido? Com que regra?
4. A tela: o `form.tipo` e o `material_id` mudam em vários lugares. Existe corrida entre dois GETs de sugestão?

## Estado

- [x] Fase 0 · [x] Fase 1 — `26ddffa`
- [x] Fase 2 (4 IMPORTANT, 3 MINOR — seção 5 do desenho) — `abb8d25`
- [x] T1 — `adce812` · [x] T2 — `adce812` · [x] Fase 5 — 3d8680c · [x] Fase 6 (docs neste fechamento)

### T1 — feita (`adce812`), com divergências do plano

- **O predicado virou `motivoRecusaEndereco(loc, material, papel)`**, não `motivoRecusaDestino(loc, material)`: a Fase 2
  mostrou que o bloqueio vale na **origem** também, e um predicado só de destino deixaria uma segunda cópia no motor. Mesmas
  literais — as suítes de restrição de endereço continuaram verdes sem alteração.
- **A resposta virou `{ padrao, sugestoes }`**, não uma lista: a padrão que o motor recusa precisa ser **dita** (a RN-04 do
  desenho estava errada — ver seção 5 do desenho).
- **Material inativo:** o desenho previu *"Material inativo não recebe entrada"*; a literal real, medida, é
  *"Material inativo não pode ser movimentado"* (a do motor). O teste (8) trava a real.
- 8 cenários, 8 sabotagens vermelhas.

### T2 — feita (`adce812`)

- Até 3 botões, `data-testid="sugestoes-localizacao"`; aviso `aviso-padrao-recusada`; nada preenche sozinho; trocar de
  material limpa **só** o destino vindo de sugestão (ref `destinoDeSugestao`); guarda `cancelado`. 5 cenários, 5 sabotagens.

## Fase 5 — revisão adversarial do código (1 IMPORTANT, 4 MINOR, lacunas de teste; 0 ruído)

Todos reproduzidos e corrigidos em 3d8680c:

| Achado | Cenário | Correção |
|---|---|---|
| **I-2** padrão inativa sem aviso | padrão com `ativo = 0` (ou almoxarifado inativo): a sugestão a omitia em silêncio e a entrada sem destino caía nela — saldo fora do mapa | `padrao.inativa: true` + aviso `aviso-padrao-inativa`: *"A localização padrão X está inativa — escolha um destino."* (só sem destino e sem recusa) |
| **M-1** pai sugerido | pai com filho ativo e saldo do material aparecia em `JA_TEM_O_MATERIAL`; padrão que é pai aparecia como `PADRAO` | predicado `sugerivel` único para os 3 caminhos (`tem_filho_ativo` no `LOC_SQL`) |
| **M-2** saldo negativo "vazia" | endereço com `SUM(quantidade) < 0` do material fica fora da `OCUPACAO_SQL` (só `> 0`) e era rotulado `VAZIA_COMPATIVEL` | exclui os endereços com saldo negativo do material |
| **M-3** ordenação sem padrão | `almoxPadrao = null` → `null === null` jogava as vazias **sem** almoxarifado para o topo | ordena só quando `almoxPadrao != null` |
| **M-4** N+1 | uma consulta de quantidade por endereço com saldo | quantidade do JOIN (`sd.q`), `JA_TEM` limitado a 10 |

**Lacunas de teste fechadas:** servidor (9) quantidade no botão, (10) padrão inativa, (11) padrão em almoxarifado
inativo, (12) vazias do almoxarifado da padrão primeiro (com um endereço de outro almoxarifado **alfabeticamente antes**
— sem isso a ordem natural passava), (13) pai com saldo, (14) saldo negativo (endereço `0-NEG`, primeiro na ordem natural),
(15) sem padrão. Client: aviso some ao escolher destino, aviso de inativa, reset imediato na troca de material (promessa
pendente), resposta atrasada do material anterior. **Sabotagens do fix-round:** 7 no serviço (filtro de pai, negativo,
`if (almoxPadrao != null)`, sort, `inativa` falso, `inativa` sem almoxarifado, quantidade 0) + 4 na tela (reset imediato,
`!destino` no aviso, `cancelado`, aviso de inativa) — todas vermelhas **no cenário certo**. **Não provado:** o corte de 10
do `JA_TEM` (declarado em D (53)).

**Suíte:** `sugestaoLocalizacao.api.test.js` 15/15; bloco "Etapa 53" do client 8/8 (arquivo 41/41). A verificação completa
fica no commit de fechamento.

## Retro (4 números)

- **Rodadas de correção até verde:** 1 fix-round (Fase 5), sem teste repetindo falha.
- **Achados da revisão:** Fase 2 — 7 (4 IMPORTANT, 3 MINOR), todos reais; Fase 5 — 5 reais (I-2, M-1..M-4), reproduzidos,
  + lacunas de teste; **0 ruído**.
- **Paralelismo:** 0 galhos em paralelo — etapa pequena, T2 em série contra o contrato de T1. Sem retrabalho.
- **Defeito que escapou:** *(preencher na Etapa 54)*.

## Próxima tarefa detalhada — Etapa 54: o motor recusa ENTRADA/TRANSFERÊNCIA em localização inativa ou inexistente

**Por que:** **C73** (novidades). A Fase 2 da 53 provou pelo motor real: entrada com destino **inativo** é aceita e grava
saldo que o mapa (`ativo = 1`) não mostra — fura a regra da 52 (não se desativa endereço ocupado, mas o motor ocupa um
inativo); entrada com destino **inexistente** (999999) é aceita e grava saldo órfão.

**Onde mexer (medido nesta etapa):**
- `validarLocalizacaoParaMovimento` (`stockService.js`, ~l. 550) **retorna em silêncio** quando `!loc` — é o furo do
  inexistente. Chamadores: `registrarMovimentacao` (~l. 984-993: entrada pelo `resolveLocalizacaoEntrada`, saída pelo
  `resolveLocalizacaoSaida`, TRANSFERENCIA origem+destino, AJUSTE com destino) e **`receiptService.js:1163`** (o
  recebimento valida o destino resolvido — **a mudança alcança o recebimento**: material com padrão inativa passaria a
  ter o recebimento recusado — medir e decidir).
- `motivoRecusaEndereco` **não olha `ativo`** nem o `ativo` do almoxarifado. Pôr ali muda os dois papéis e a sugestão
  (que já filtra inativa por conta própria; o `padrao.inativa` continua útil à tela).
- **Fallback da padrão:** a entrada SEM destino resolve para a padrão. Se a padrão inativa passar a ser recusada, a tela
  já avisa (Etapa 53, `aviso-padrao-inativa`) — o aviso pode passar a usar `padrao.recusa`, e o `inativa` vira
  redundante. Decidir e registrar na letra B.
- **Papel origem:** saída de localização inativa **com saldo** (legado de antes da 52) tem de continuar possível —
  senão o saldo fica preso. Proposta: inativa recusa só no papel **destino**; inexistente recusa nos dois.
- **Estorno** (`cancelarMovimentacao`, ~l. 1827) **não valida** endereço, por decisão da Etapa 2 (reverter precisa
  ser sempre possível). O estorno de uma SAÍDA devolve para a localização de origem — que pode estar inativa hoje.
  Manter a decisão e **registrar** que o saldo volta a um endereço inativo, ou recusar — escolher o reversível e
  registrar na letra B.
- **Almoxarifado inativo:** inativar almoxarifado com localização ativa vinculada já é recusado (spec 02), então
  "localização ativa em almoxarifado inativo" só nasce por SQL/integração — tratar igual a inativa no destino.
- **Literais novas** a congelar no plano: por exemplo *"Localização X está inativa"* e *"Localização de destino não
  encontrada"* (400 ou 404 — decidir; o motor usa 400 para regra de endereço).

**Letra A (produção antes do deploy):** a consulta já está no **C73** — saldo em localização inativa, de almoxarifado
inativo ou inexistente. Na 54, promover a **A29** com o "como ler o resultado" (reativar e transferir, ou contagem).
Também: materiais com `localizacao_padrao_id` apontando para localização inativa/inexistente — a entrada sem destino
deles passará a ser recusada:

```sql
SELECT m.codigo, m.nome, m.localizacao_padrao_id, l.codigo, l.ativo
  FROM materiais_almoxarifado m
  LEFT JOIN localizacoes_almoxarifado l ON l.id = m.localizacao_padrao_id
 WHERE m.ativo = 1 AND m.localizacao_padrao_id IS NOT NULL AND (l.id IS NULL OR l.ativo <> 1);
```

**Testes que a 54 precisa:** entrada com destino inativo/inexistente → 400 literal; entrada sem destino com padrão
inativa → 400; transferência para inativa → 400; **saída de inativa com saldo → aceita** (controle); estorno de saída
cuja origem foi desativada → o comportamento escolhido; recebimento com padrão inativa → o comportamento escolhido; as
suítes de restrição de endereço existentes sem mudança de literal.

**Já pronto, não reabrir:** `motivoRecusaEndereco` (fonte única), a sugestão (já exclui inativa/pai/almoxarifado
inativo), a guarda da 52 contra desativar endereço ocupado.
