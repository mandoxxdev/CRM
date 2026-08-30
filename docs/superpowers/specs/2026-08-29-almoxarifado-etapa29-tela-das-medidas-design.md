# Almoxarifado — Etapa 29: a tela das medidas de inspeção (design)

Data: 2026-08-29 · Branch: `desenvolvimento-almoxarifado`
Origem: a Etapa 27 entregou plano de inspeção, medidas e divergência derivada **sem tela** e
deixou nomeados os furos **C34** (o formulário de decisão não tem campo de medida) e **C35** (as
medidas gravadas não têm quem as leia), mais o alerta **B60**. Feature 09.

## Fase 0 — medido em 2026-08-29, cruzado com a spec 09 ANTES de varrer o client

- **Contrato do backend, inteiro e testado (Etapa 27):** `GET /api/almoxarifado/planos-inspecao?material_id=`
  (`extended.js:292`, `auth` só, 400 *"Material é obrigatório"* sem o parâmetro, `?todos=1` traz
  inativas), `POST .../recebimentos/itens/:itemId/inspecionar` (`extended.js:977`, gate
  `inspecionar`) aceitando `medidas: [{ plano_id, valor_medido, ferramenta_id? }]` e respondendo
  `divergencia_dimensional` (derivada) + `medidas_registradas`. **`valor_medido` pode ir como
  string** — o servidor valida (`inspectionService.js:118-122`, `'12,4'` → 400 *"Valor medido
  inválido para "<característica>": informe um número (use ponto decimal)"*) e **nada é gravado**.
- **`GET /api/almoxarifado/ferramentas`** (`extended.js:1280`) devolve `calibracao_vigente`
  (`true`/`false`/`null` quando não exige calibração — `toolService.js:398`). A tela pode
  **mostrar** o instrumento vencido antes de o servidor recusar.
- **A fila** `GET /inspecoes/pendentes` já traz `material_id` por item
  (`inspectionService.js:390`) — o modal sabe qual plano buscar.
- **O modal de decisão** (`InspecoesAlmoxarifado.js:273-345`): quantidades, encaminhamento,
  observações e as cinco caixas `FLAGS_INSPECAO` (`:44-50`), **nenhum campo de medida**;
  `submitDecisao` (`:118-150`) monta o payload só com as flags marcadas. 11 testes Jest no
  arquivo, mocks de `api`, `toast` e `useAlmoxPermissoes` — o padrão do módulo.
- **C35 confirmado com grep de caminho completo:** `FROM medidas_inspecao` **não aparece em
  nenhuma rota ou serviço** (só nos testes), e `inspecoes_recebimento_almoxarifado` só é lida
  pelo `alertRegistry.js:121`. **Não existe leitura de inspeção decidida no produto.**

**Nada na spec 09 contradiz o código.** Os dois itens desmarcados do checklist de front (`:118`
e `:121`) descrevem exatamente o que foi medido.

## Decisões

**D1 — As medidas entram DENTRO do modal de decisão, não em tela nova.** A inspeção é um ato só
(decidir + medir), e o servidor já grava as duas coisas numa chamada. Ao abrir o modal, a tela
busca o plano do material; **sem plano, o modal fica exatamente como está** (nenhum usuário sem
plano cadastrado vê diferença — mesmo compromisso da Etapa 27).

**D2 — B60 cumprida à risca: com QUALQUER medida preenchida, a caixa "Divergência dimensional"
vira somente leitura e explicada.** Texto ao lado: *"Derivada das medidas ao salvar — fora da
tolerância liga sozinha"*. Sem medida preenchida, a caixa volta a ser clicável e manual.
**Descartado** calcular a divergência no client para "pré-visualizar": seria duplicar a régua
(epsilon incluído) e a Etapa 27 mediu que a régua ingênua erra 12,3% no limite. A tela **mostra a
faixa** de cada característica (`[nominal+inf ; nominal+sup] unidade`) para o operador enxergar, e
o **resultado** vem na resposta: o toast passa a dizer *"Inspeção registrada! Divergência
dimensional: sim/não (N medidas)"* quando houve medidas.

**D3 — Só a linha com valor preenchido vai no payload**, com o valor **como string crua** (sem
`parseFloat`, que transformaria `12,4` em `12` **em silêncio** — o oposto do que a Etapa 27
construiu). Linha com instrumento e sem valor é ignorada. O instrumento é opcional (B61).

**D4 — O seletor de instrumento lista as ferramentas ativas e marca as vencidas.** Origem:
`GET /ferramentas` (uma chamada ao abrir o modal, só se houver plano). Ferramenta com
`calibracao_vigente === false` aparece com sufixo *"(calibração vencida)"* e **desabilitada** —
o servidor recusa de qualquer jeito (*"Ferramenta com calibração vencida ou sem calibração
registrada (<nome>)"*), a tela evita o 400 previsível. `null` (não exige calibração) aparece normal.

**D5 — C35: nasce a leitura de inspeção decidida, como aba "Histórico" na mesma tela.** Dois
endpoints aditivos: `GET /api/almoxarifado/inspecoes/historico` (lista de inspeções decididas,
com material, quantidades, flags, responsável, data e `medidas_total`/`medidas_nao_conformes`) e
`GET /api/almoxarifado/inspecoes/:id/medidas` (as medidas daquela inspeção, com a tolerância
**congelada no ato**). Leitura sem gate novo (como `/pendentes`: `auth` + acesso ao módulo).
**Descartado** enfiar as medidas na resposta do `/pendentes`: pendente não tem medida por
definição. **Descartado** tela própria de rota nova: a aba na tela de Inspeções é onde quem
inspeciona já está.

**D6 — Sem gate novo de perfil.** A tela já é gateada por `inspecionar` para agir; ler o plano e
o histórico é liberado a quem abre a tela — mesma régua do `GET /planos-inspecao`.

## Regras de negócio

- **RN-01** Modal com plano ativo mostra um campo de medida por característica, com nome,
  unidade, nominal e faixa; sem plano, nada muda.
- **RN-02** Com ≥1 medida preenchida, `divergencia_dimensional` é somente leitura e explicada;
  o payload **não** manda a flag nesse caso (o servidor ignoraria; não mandar é honesto).
- **RN-03** O payload leva só as linhas com valor preenchido, valor como string crua; a recusa
  do servidor aparece literal no toast e o modal **continua aberto** com os valores.
- **RN-04** Instrumento vencido aparece marcado e desabilitado no seletor.
- **RN-05** `GET /inspecoes/historico` lista decididas em ordem decrescente de data, filtrável
  por `material_id`, com contagem de medidas e não conformes; `GET /inspecoes/:id/medidas`
  devolve as medidas com os valores congelados (não o plano atual); 404 se a inspeção não existe.
- **RN-06** A aba Histórico mostra as medidas expandindo a linha, com conforme/não conforme por
  característica e o instrumento usado.

## Fica FORA, declarado

- **Plano por família** (B59) — a tela busca o plano **do material**.
- **Cadastro do plano pela tela** — continua por API (Etapa 27); é etapa própria com gate
  `gerenciar_plano_inspecao` e fica registrada como o que falta para 🟢 da feature 09 no front.
- **Fotos e anexos** no formulário — dependem do módulo de anexos.
- **Reabrir/editar inspeção decidida** — a leitura é só leitura.
