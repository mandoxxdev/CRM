# Etapa 35 (linha `main`) — cadastro de material: unidades e classe ABC

> Design: `docs/superpowers/specs/2026-10-06-crm-lote-compras-outubro-design.md`, seções 1.4 e 5.
> Tasks de origem: nº 4 (revisar fator), 5 (remover unidade de consumo), 6 (legenda ABC). Branch:
> `main`. **Zero linhas de servidor** nesta etapa, de propósito: as colunas ficam e a API continua
> aceitando os dois campos — tudo reversível editando a tela.

## Regras (`grep RN-35`)

- **RN-35.01** *Unidade de Consumo* e *Fator de Conversão (Consumo)* saem da tela; colunas ficam; `PUT` preserva (chave omitida).
- **RN-35.02** *Fator de conversão* com explicação + exemplo vivo ("1 CX = 12 UN") + frase "Informativo: … o sistema não converte sozinho."
- **RN-35.03** legenda A/B/C ao lado do campo, marcada como classificação manual. **Não há definição no projeto** → dúvida D-35 para o P.O.

## Tasks — tudo tronco, um executor, só client

### T1 — testes primeiro ✅ `0e7c0a36`
`client/src/components/almoxarifado/MaterialAlmoxarifadoForm.test.js` (existe, 354 linhas; reusar
a montagem e os mocks de lá). Cenários novos, numerados RN-35:
(a) RN-35.01 — não existe label "Unidade de Consumo" nem "Fator de Conversão (Consumo)";
(b) RN-35.01 — preencher o mínimo e salvar → o corpo do `POST /almoxarifado/materiais` **não tem**
as chaves `unidade_consumo` nem `fator_conversao_consumo`;
(c) RN-35.01 — editar material cujo GET traz `unidade_consumo: 'M'`, salvar → o `PUT` não manda a chave (o servidor preserva);
(d) RN-35.02 — escolher Unidade de Compra "CX", digitar 12 → aparece o texto "1 CX = 12 UN" (UN = unidade de medida escolhida); apagar o fator → o exemplo some;
(e) RN-35.02 — a frase "o sistema não converte sozinho" está na tela quando há unidade de compra;
(f) RN-35.03 — a legenda contém "A —", "B —", "C —" e "classificação manual".
Rodar → (a), (b), (d), (e), (f) falham; (c) pode passar por acaso — **controle positivo**: antes de
implementar, confirmar que (b) falha porque o payload hoje leva `unidade_consumo: ''`.

### T2 — implementar em `MaterialAlmoxarifadoForm.js` ✅ `0e7c0a36`
- Estado inicial (`:126-130`): tirar `unidade_consumo` e `fator_conversao_consumo`; carga na edição
  (`:333-337`) idem; validação (`:411-414`) sai; o `set` genérico já não cria as chaves.
- Bloco "Unidades e Custos" (`:877-917`): o `<select>` de consumo e o input do fator de consumo saem.
  O rótulo do fator de compra vira "Fator de conversão" com ajuda `"Quantas <unidade de medida> há em
  1 <unidade de compra>"`; abaixo, `<p className="almox-help">` com o exemplo vivo quando
  `unidade_compra && fator > 0`: `1 {unidade_compra} = {fator} {unidade}`; e a frase informativa.
- Classe ABC (`:864-870`): ao lado/abaixo do `<select>`, `<ul className="almox-legenda-abc">` com a
  constante `LEGENDA_ABC` (`{A: '…', B: '…', C: '…'}`, exportada para o teste e para o manual citar):
  - **A** — itens de maior valor ou consumo: poucos itens que concentram a maior parte do valor em estoque; contagem e reposição mais frequentes.
  - **B** — intermediários: valor e giro médios; controle normal.
  - **C** — muitos itens de baixo valor: controle simplificado, contagem menos frequente.
  - rodapé: "Classificação manual, definida por quem analisa consumo e valor."
- CSS: `client/src/components/almoxarifado/Almoxarifado.css` — `.almox-legenda-abc` (lista compacta,
  `--gmp-text-light`, 13px) e `.almox-help` se ainda não existir (`grep -n "almox-help" Almoxarifado.css`).

### T3 — documentação ✅ (commit de fechamento — o que contém esta marcação)
- `docs/almoxarifado-manual-do-sistema.md` §2.3 (`:182-198`): tirar "Unidade de Consumo" e o
  segundo fator; reescrever o parágrafo do fator com o exemplo; §2.4/`:216-220`: colar a legenda.
  **Correção ao plano:** a classificação ABC é a **§2.5** do manual (`:216-220` estava certo, o
  número da seção não); e a tabela de seções do cadastro (`:120`) também listava "Unidade de
  Consumo, Fator de Conversão (Consumo)" — o plano não a tinha visto; foi corrigida junto.
  ⚠️ A versão da branch `desenvolvimento-almoxarifado` deste manual é mais nova — anotar em B4 do
  `compras-novidades-por-etapa.md` que a mesma edição precisa ser repetida lá no merge.
- Seção da Etapa 35 no `docs/compras-novidades-por-etapa.md`, com a dúvida **D-35** (legenda sem
  fonte) e **D-35b** (o recebimento deve converter pelo fator? hoje não converte). ✅ (fechamento)
- Marcar este plano. ✅ (fechamento)

## Pontos de atenção
- `refineUnidadesFator` no servidor continua exigindo fator quando `unidade_consumo` vem — como a
  tela não manda mais, nunca dispara pela tela. Não mexer.
- `materialCompleto.api.test.js:114` ("unidade_consumo sem fator → 400") continua verde e serve de
  prova de que a API não mudou — rodar no fechamento e citar.
- A tela está **idêntica** nas duas linhas a menos de 2 linhas — o commit desta etapa é candidato a
  `cherry-pick` para a branch do almoxarifado (B4).

## Retro (preenchido no fechamento)
- Rodadas de correção até verde: **0** — o primeiro `jest` depois da implementação deu 22/22.
- Achados da revisão: não houve revisão por agente (plano: tudo tronco, um executor). Achado
  próprio durante a T3: a tabela de seções do manual (`:120`) ainda listava os campos de consumo
  — **real**, corrigido. O número de seção "§2.4" do plano para a ABC era **ruído** (é §2.5).
- Paralelismo: nenhum, de propósito — três tasks encadeadas (teste → código → doc) no mesmo
  arquivo; as três suítes de verificação (jest inteiro, build, API) rodaram em paralelo.
- Defeito escapado: preencher na etapa seguinte.

## Como foi executado

- **Vermelho (T1):** 6 cenários (a)–(f) escritos antes de tocar o componente. Resultado:
  **6 falharam, 16 passaram, 22 no total**. Controle positivo confirmado no (b):
  `expect(payload).not.toHaveProperty('unidade_consumo')` → `Received value: ""` — a chave ia vazia
  em todo submit. O (c) **não** passou por acaso como o plano admitia: `Received value: "M"`, porque
  `loadMaterial` carregava `unidade_consumo` do GET para o state e o `PUT` a reenviava.
- **Verde (T2):** `0e7c0a36` — 3 arquivos, +202/−36. `MaterialAlmoxarifadoForm.test.js`:
  **22 passaram, 22 no total** na primeira rodada. Sobrou no componente só comentário citando
  `unidade_consumo` (grep confirmado).
- **Suíte inteira do client:** `CI=true npx react-scripts test --watchAll=false` →
  **44 suítes, 691 testes, todos verdes**.
- **Build:** `CI=true npx react-scripts build` → "Compiled successfully." (exit 0, sem warning
  virando erro).
- **Controle de que a API não mudou:** `cd server && node tests/api/materialCompleto.api.test.js`
  → **20 passed, 0 failed**; `git status server/` vazio (zero linhas de servidor, como combinado).
- **Decisões tomadas sem perguntar (reversíveis):** o toast de validação do fator passou de
  "fator de conversão de compra" para "fator de conversão", acompanhando o rótulo novo; sem
  unidade de compra o campo mostra "Só se aplica quando a unidade de compra é diferente da
  unidade de medida" (o plano não dizia o que mostrar nesse estado); a frase "Informativo: … não
  converte sozinho" aparece só com unidade de compra escolhida (cenário (e) do plano).
- **Commits:** `0e7c0a36` (código) + o commit de fechamento (manual §2.3/§2.5 e `:120`, seção
  da Etapa 35 em `compras-novidades-por-etapa.md`, este plano).
