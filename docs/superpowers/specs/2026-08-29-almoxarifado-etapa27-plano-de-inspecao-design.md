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

## Regras de negócio (RN)

- **RN-01 — Plano de inspeção é por material**, com N características a medir: nome (ex.
  "Diâmetro externo"), unidade, valor nominal, tolerância inferior e superior. Material sem plano
  continua inspecionável exatamente como hoje.
- **RN-02 — Medida fora da tolerância reprova a característica.** A régua é
  `nominal - tol_inf <= medido <= nominal + tol_sup`, **inclusiva nos dois extremos** (peça no
  limite exato da tolerância é conforme — é o que a tolerância significa).
- **RN-03 — `divergencia_dimensional` passa a ser derivada** quando a inspeção tem medidas: é
  verdadeira se **alguma** característica reprovou. Sem medidas, segue como está (manual), e
  isso fica declarado na tela.
- **RN-04 — Medida exige instrumento, e instrumento vencido não mede.** A medida registra qual
  ferramenta foi usada; se ela `exige_calibracao` e não tem `calibracaoVigente`, a rota **recusa**
  com mensagem que diz qual instrumento e desde quando. **É aqui que a integração com a feature
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
pura para a régua da tolerância (`services/almoxarifado/toleranciaSql.js` ou similar — o padrão
de `availabilitySql`/`custoSql`/`divergencia`), o CRUD do plano e a gravação das medidas dentro
de `decidirInspecao`.

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
