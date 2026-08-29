# Almoxarifado — Etapa 27: plano de inspeção com medidas (design)

Data: 2026-08-29 · Branch: `desenvolvimento-almoxarifado`
Origem: os dois primeiros itens do checklist da feature 09, fora do escopo da Etapa 5 por decisão
de design (2026-08-07) — e **destravados desde 22/08**, embora a spec não soubesse.

## Decisão de escopo (Fase 0 — medida em 2026-08-29)

**A feature 09 declarava um bloqueio que caiu há uma semana.** As duas linhas de backend dizem
que planos e medidas *"ligam com a feature 16 (calibração de instrumentos), **que também não
existe ainda**"*. A feature 16 está **🟢 desde a Etapa 9b** (22/08): `exige_calibracao`,
`calibracoes_ferramenta_almoxarifado`, `calibracaoVigente(db, ferramentaId)`
(`toolService.js:57`), duas rotas e tela própria. Terceira spec seguida nesta base a afirmar
ausência de algo que existe — corrigida em voz alta.

**O que existe hoje** (`inspecoes_recebimento_almoxarifado`, `schema.js:1121`): a decisão de
inspeção grava quantidade aprovada/reprovada, encaminhamento, e **cinco flags booleanas** —
entre elas `divergencia_dimensional`, marcada **à mão** por quem inspeciona. Não há plano, não há
medida, não há instrumento.

**O que NÃO existe e não serve de base:** `padroes_qualidade` é do **core** (`index.js:19761`),
com `tipo_produto`, `especificacoes` e `limites` — é qualidade de **produto fabricado**, outro
domínio. Reusá-la ligaria o almoxarifado a uma tabela de outro contexto pelo nome parecido.

## A decisão central: a divergência dimensional deixa de ser opinião e vira medição

Hoje `divergencia_dimensional` é uma caixa que o inspetor marca. Com plano e medidas, ela passa a
ser **derivada**: se alguma medida sai da tolerância, a flag é verdadeira — não por alguém ter
lembrado de marcar, mas porque o número diz.

É o mesmo movimento que a Etapa 23 fez com a trilha (parar de registrar o que não aconteceu) e
que a 22 fez com o de/para (calcular em vez de supor). **Descartado** manter a flag manual ao
lado da derivada (duas fontes para o mesmo fato, e a manual venceria por ser a que a tela mostra)
e **descartado** derivar só quando houver plano — sem plano a flag continua manual, e isso
precisa estar **declarado**, não implícito.

## A decisão que a Fase 2 forçou: a régua precisa de epsilon

**Sem epsilon, 12,3% das peças exatamente no limite da tolerância são reprovadas.** A revisão
varreu 50.000 pares (nominal 0,1–50,0, tolerância 0,01–0,50, medida no limite exato) e mediu
**6.132 falsos reprovados**. Casos concretos:

```
nominal 12.3, tol 0.1, medido 12.2 -> limite inferior calcula 12.200000000000001 -> REPROVA
nominal 0.7,  tol 0.1, medido 0.8  -> limite superior calcula 0.7999999999999999 -> REPROVA
```

Com a RN-03, cada um desses liga `divergencia_dimensional = 1` sozinho. Seria a etapa
**fabricando** a divergência que ela existe para medir.

**E o precedente já está dentro da função que esta etapa vai alterar:** `inspectionService.js:78`
usa `Math.abs(...) > 1e-6` com um comentário explicando exatamente este fenômeno, e
`InspecoesAlmoxarifado.js:126` espelha o mesmo epsilon. A régua adota `1e-6`, o do módulo.

## Regras de negócio (RN)

- **RN-01 — Plano de inspeção é por material**, com N características a medir: nome (ex.
  "Diâmetro externo"), unidade, valor nominal e **dois desvios COM SINAL**
  (`desvio_inferior`, `desvio_superior`), com `desvio_inferior <= desvio_superior`.
  Material sem plano continua inspecionável exatamente como hoje.
  **CORREÇÃO (achado B7): a primeira versão usava "tolerância inferior/superior" como
  MAGNITUDES não-negativas, e isso (a) não vem da spec e (b) não representa metade dos casos
  reais.** Verifiquei: a seção 9 do requisito original diz apenas "selecionar plano, registrar
  medidas, registrar instrumento" — não fala de tolerância, então o modelo é **invenção deste
  design** e precisa ser declarado como decisão nova, não derivada. E magnitude não representa
  **tolerância unilateral deslocada**, que é o caso normal em ajuste ISO 286 e comum em
  usinagem: um eixo `+0,021 / +0,005` tem os **dois** limites acima do nominal. Com desvios com
  sinal, o simétrico continua sendo `-0,05 / +0,05` e o unilateral passa a ser representável.
  **Trocar depois seria migração de dado congelado (RN-05) — é agora ou nunca.**
- **RN-02 — Medida fora da tolerância reprova a característica.** A régua é
  `nominal + desvio_inf <= medido <= nominal + desvio_sup`, **inclusiva nos dois extremos**
  (peça no limite exato da tolerância é conforme — é o que a tolerância significa),
  **com epsilon**: ver a decisão de ponto flutuante abaixo.
- **RN-03 — `divergencia_dimensional` passa a ser derivada** quando a inspeção tem medidas: é
  verdadeira se **alguma** característica reprovou. Sem medidas, segue como está (manual), e
  isso fica declarado na tela.
- **RN-04 — Medida exige instrumento, e instrumento vencido não mede.** A medida registra qual
  ferramenta foi usada; se ela `exige_calibracao` e não tem `calibracaoVigente`, a rota **recusa**.
  **CORREÇÃO (achado B1): esta RN prometia "qual instrumento e DESDE QUANDO", e
  `calibracaoVigente` não sabe dizer** — ela devolve a linha da calibração **vigente** ou
  `undefined`, então no caso da recusa devolve exatamente nada. Dar a data exigiria uma segunda
  consulta e distinguir "vencida em DD/MM" de "nunca calibrada". **Decidido: a mensagem nomeia o
  instrumento e não promete data**, reusando o texto do vizinho (`toolService.js:70`,
  `'Ferramenta com calibração vencida ou sem calibração registrada'`) — que cobre os dois casos
  com honestidade. Prometer a data e entregar `undefined` seria a tela mentindo, de novo.
  **E ferramenta inexistente ou inativa é 404**, pelo padrão de `toolService.js:64`
  (`WHERE id = ? AND ativo = 1`) — sem isso, `f.exige_calibracao` sobre `undefined` vira
  `TypeError` e **500**, não 400 (achado B2). **É aqui que a integração com a feature
  16 vira valor**: medir com paquímetro descalibrado é o defeito que o registro existe para
  impedir.
  **Descartado** apenas avisar: uma medida feita com instrumento vencido não é dado, é ruído com
  aparência de dado — e ficaria na trilha como se fosse prova.
- **RN-05 — O plano é congelado no ato.** A inspeção guarda o valor nominal e as tolerâncias
  **usados naquele momento**, não uma referência ao plano. Editar o plano depois **não** reescreve
  inspeções antigas. É a mesma razão da RN-05 da Etapa 26 (renomear categoria não reclassifica o
  acervo) e da regra da Etapa 22 (a trilha não pode mudar retroativamente).
- **RN-06 — Medida sem plano não é aceita.** Registrar "diâmetro = 12,4" sem uma característica
  que diga o que é esperado é guardar número sem significado.

## Arquitetura

Duas tabelas novas (`planos_inspecao_almoxarifado` e `medidas_inspecao_almoxarifado`), uma função
pura para a régua da tolerância (o padrão de `availabilitySql`/`custoSql`/`divergencia`), o CRUD
do plano e a gravação das medidas dentro de `decidirInspecao`.

**Três decisões estruturais que a Fase 2 forçou, todas sobre ATOMICIDADE — o tema das etapas 23
e 25 reaparecendo aqui:**

1. **Toda validação nova roda ANTES do claim de saldo** (achado A2, bloqueante). `decidirInspecao`
   reivindica o saldo em duas fases **sem transação** (`inspectionService.js:35` explica: a
   atomicidade vem do `UPDATE` condicional no próprio `WHERE`), e valida tudo antes da Fase 1
   **de propósito** — o comentário de `:74` diz "o saldo não pode mudar quando isto recusa".
   As três recusas novas (plano inexistente, plano de outro material, instrumento vencido) têm
   de rodar **antes da linha 90**. Postas no lugar natural — junto da gravação das medidas —
   produziriam **400 depois de o saldo já ter se movido**. Nada disso precisa do `inspecao_id`.
2. **As medidas entram num ÚNICO `INSERT` multi-linha** (achado A3, bloqueante). Um laço de
   `INSERT` deixa, se a segunda de três falhar, a inspeção gravada com
   `divergencia_dimensional = 1` e **uma medida só** — a flag afirmando uma reprovação cuja prova
   não está no banco. É o defeito que a Etapa 23 consertou no `PUT /configuracoes`, e `BEGIN`
   **não** é a saída (a mesma etapa mediu: conexão única, o `ROLLBACK` engole escrita alheia).
   `VALUES (?,...),(?,...),(?,...)` é atômico por statement.
3. **A FK não é a régua** (achado B8): o harness roda com `PRAGMA foreign_keys = 0` e produção
   com `1`. Um `plano_id` inexistente passaria no teste e falharia em produção — a validação em
   código (400 da RN-06) é a única portável.

**A régua da tolerância é função pura de propósito:** ela decide aprovação por número, e é o tipo
de coisa que precisa de teste de borda (limite exato, tolerância zero, medida negativa) sem
subir banco.

## Testes

- `tolerancia`: RN-02 nos extremos — **exatamente** no limite inferior e superior (conforme),
  um passo além (não conforme), tolerância zero, e medida igual ao nominal. Bordas são o teste;
  o meio é fácil.
- `planoInspecao.api.test.js`: RN-01 (CRUD), RN-06 (medida sem característica é recusada).
- `medidasInspecao.api.test.js`: RN-03 (**o cenário de peso** — medida fora da tolerância marca
  `divergencia_dimensional` sozinha, e o inspetor **não** precisou marcar nada), RN-04
  (instrumento vencido recusa, com a mensagem literal; instrumento vigente aceita; ferramenta que
  não exige calibração aceita), RN-05 (editar o plano depois **não** muda a inspeção antiga).
- Controle positivo com alvo em cada um, **lendo qual asserção caiu**.

## Fica FORA, declarado

- **Não conformidade formal** (número, ação, responsável, fluxo próprio) e **liberação sob desvio
  autorizado** — são os outros dois itens do checklist, e cada um é uma máquina de estados.
- **Anexos** (relatório dimensional, fotos) — depende de `anexos_documento_almoxarifado`, que é
  item próprio da spec.
- **Encaminhamento com status** — a pendência que a Etapa 5 criou; a execução é a feature 12.
- **Plano por família** (a spec diz "por material/família") — começar por material é o caminho
  reversível: herança de plano por família é fácil de acrescentar depois e difícil de tirar.
- **A TELA de medidas** — esta etapa entrega o backend e a régua. Quem inspeciona pela tela segue
  com a flag manual até a etapa da UI, e **isso vai para a letra C**: sem dizer, o usuário procura
  o campo e não acha.
- **Leitura das medidas** (achado B5): elas nascem sem leitor — a fila `/inspecoes/pendentes` só
  traz o que **não** foi decidido, e a própria spec 09 já registra que "rever uma inspeção
  concluída não tem caminho no produto". Declarado agora para não virar a terceira ocorrência do
  padrão "calculado, exibido e jogado fora" que esta base já nomeou duas vezes.
- **Auditoria da decisão de inspeção** — `inspectionService.js` **não audita nada** hoje
  (verificado: não há `registrarAuditoria` nem `auditar` entre os `require`). O único ato
  auditável desta etapa é o **CRUD do plano**. Ampliar seria mudança de escopo própria.
