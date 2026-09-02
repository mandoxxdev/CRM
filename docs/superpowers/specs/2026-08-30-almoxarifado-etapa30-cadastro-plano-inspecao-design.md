# Almoxarifado — Etapa 30: cadastro do plano de inspeção pela tela (design)

Data: 2026-08-30 · Branch: `desenvolvimento-almoxarifado`
Origem: o fechamento da **Etapa 29** nomeou este como o item de maior valor do que falta para a
feature **09** ficar 🟢 — e o único que é *só* front. Enquanto o plano só nascer por API, o bloco
*Medidas do plano* que a 29 entregou **não aparece para ninguém**: a etapa inteira fica
inalcançável por quem opera.

## Fase 0 — medido em 2026-08-30, cruzado com a spec 09 ANTES de desenhar

**A ausência foi medida pelo nome do CONTRATO (`planos-inspecao`), não pelo nome que eu imaginaria
que a tela usaria** — é a regra que a Etapa 24 desta base aprendeu por falha.

- **Um único consumidor no client:** `InspecoesAlmoxarifado.js:149`, a leitura que a Etapa 29
  fez. **Não existe tela de cadastro, edição ou desativação de característica.** Confirmado com
  varredura de `planos-inspecao`, `plano_inspecao` e `planoInspecao` em todo `client/src`.
- **CRUD completo e testado no backend desde a Etapa 27** (`planoInspecao.api.test.js`, 22
  cenários), gate **`gerenciar_plano_inspecao`** = `[ADMINISTRADOR, QUALIDADE, ENGENHARIA]`.
- **`GET /planos-inspecao?material_id=&todos=1`** (`extended.js:292-298`) traz **as inativas
  junto** — é exatamente a leitura que a tela de cadastro precisa, e é diferente da que a tela de
  decisão usa (`ativo = 1`).
- **`MateriaisAlmoxarifado.js` já tem o molde pronto:** ações por linha em `almox-btn-icon` com
  `bloquearSeNaoPode('<ação>', e)`, e **dois modais por material abertos por estado com o id**
  (`ExtratoMaterialModal`, `EtiquetasPdfModal`). A tela nova não inventa padrão nenhum.

### ⚠️ Correção de uma afirmação minha, escrita ontem e ERRADA

A seção *"próxima tarefa detalhada"* do plano da Etapa 29 diz, textualmente:
> *"**Não há rota de REATIVAR** — medir isso na Fase 0 antes de prometer o botão."*

**Está errado, e a Fase 0 mediu:** `PUT /planos-inspecao/:id` aceita **`ativo`**
(`extended.js:393`), com *preserve-when-omitted* declarado no próprio código — omitir mantém o
valor atual, e mandar `{ ativo: 1 }` **reativa**. A frase fica aqui corrigida à vista em vez de
apagada, porque foi a própria instrução "meça antes de prometer" que a pegou — e apagá-la em
silêncio faria a próxima leitura confiar nela de novo.

**Mas reativar tem uma armadilha real, e ela é o motivo de a afirmação errada ter sido plausível:**
o índice único é **parcial**, `(material_id, caracteristica) WHERE ativo = 1`. Desativar *Diâmetro*
**libera o nome**; se alguém recriar *Diâmetro* depois, reativar a antiga colide e a rota responde
**400 *"Já existe esta característica no plano deste material"*** — que, no contexto de um botão
"Reativar", é uma mensagem que não explica nada.

**Nada na spec 09 contradiz o código.** O item novo 5 de "O que falta para 🟢" descreve exatamente
o que foi medido.

## Decisões

**D1 — A tela é um MODAL por material, aberto da lista de Materiais.** Ação por linha
*"Plano de inspeção"*, no mesmo molde do *Extrato* e das *Etiquetas*. **Descartado** rota própria
(`/almoxarifado/planos-inspecao`): o plano é **por material** e não existe navegação sensata para
"todos os planos"; uma rota própria obrigaria a escolher o material primeiro, que é exatamente o
passo que a lista já resolveu. **Descartado** também uma aba dentro do formulário de material
(`MaterialAlmoxarifadoForm`): característica é entidade com CRUD próprio e auditoria própria, e
misturá-la no *submit* do material criaria dois donos para uma escrita só.

**D2 — O modal edita LINHA A LINHA, salvando cada característica na hora.** Cada linha tem
*Característica · Unidade · Nominal · Desvio inferior · Desvio superior* e um botão de salvar;
uma linha em branco no fim adiciona. **Descartado** "salvar o plano inteiro de uma vez": o backend
tem uma rota por característica, não uma rota de plano, e simular a transação no client produziria
o defeito da Etapa 28 (gravar parte e falhar no meio, deixando o resto sem dono).

**D3 — A faixa resultante aparece ao lado ENQUANTO se digita, e isso é legítimo aqui.** É
aritmética de exibição (`formatarFaixa` de `faixaTolerancia.js` — importada, nunca recopiada),
não a régua de conformidade. **Não confundir com a B60:** o que a 29 descartou foi pré-visualizar
o **veredito** (conforme/não conforme), que exigiria duplicar a régua do servidor. Mostrar
`[10.005 ; 10.021]` é o que faz o usuário enxergar que os desvios têm **sinal** — o erro que este
formulário mais convida a cometer.

**D4 — Inativas aparecem, colapsadas, com botão Reativar — e a colisão do nome é tratada NA TELA.**
O modal lê com `?todos=1`. Antes de reativar, a tela verifica se já existe uma **ativa** com o
mesmo nome e, se existir, recusa com texto próprio (*"Já existe uma característica ativa chamada
X. Renomeie ou desative a outra antes de reativar esta."*) em vez de deixar chegar o 400 genérico
do índice. **O servidor continua sendo quem decide** — a checagem da tela é só para a mensagem, e
o 400 é tratado do mesmo jeito se a corrida acontecer.

**D5 — Zero é nominal legítimo, e o formulário não pode recusá-lo.** Batimento, planeza e folga
têm nominal 0; a validação do backend é `=== null`, não falsy. Desvio omitido vira **0**, e plano
com os dois zerados (faixa de largura zero: a medida tem de bater o nominal exatamente) é
**válido**, não vazio.

**D6 — `material_id` não é editável, e a tela nem oferece.** É decisão declarada do backend: mover
uma característica de material deixaria as medidas já gravadas (congeladas) contando a história do
material antigo. Errou o material → apaga e cria.

**D7 — Sem gate novo.** `gerenciar_plano_inspecao` já existe e já é o dono do assunto. O botão da
linha usa `bloquearSeNaoPode('gerenciar_plano_inspecao', e)`; **ler** continua liberado a quem
abre a tela. Quem decide é o backend, como sempre.

## Regras de negócio

- **RN-01** A ação *Plano de inspeção* aparece em toda linha da lista de Materiais e abre o modal
  do material daquela linha; sem permissão, o clique é barrado antes do formulário.
- **RN-02** O modal lista as características **ativas e inativas** (`?todos=1`), as inativas
  visualmente separadas, cada uma com a faixa resultante `[nominal+inf ; nominal+sup]`.
- **RN-03** Criar exige característica e valor nominal; **0 é nominal válido**; desvio em branco
  vira 0; a recusa do servidor aparece **literal**.
- **RN-04** Editar preserva o que não foi enviado, e a faixa é validada sobre a **mistura**
  (enviado + preservado) — mandar só o desvio inferior pode inverter a faixa e tem de recusar.
- **RN-05** Desativar é *soft delete* e **libera o nome**; a linha some da lista de decisão e
  continua no histórico das medidas já feitas (congeladas).
- **RN-06** Reativar com nome já ocupado por uma ativa é recusado com mensagem que **nomeia a
  outra**, não com o 400 genérico do índice.
- **RN-07** A faixa mostrada usa `formatarFaixa` de `faixaTolerancia.js` — **uma cópia só**, com
  soma COM SINAL e as casas decimais do plano.

## Fica FORA, declarado

- **Plano por família** (**B59**) — continua por material.
- **Importar/copiar plano de outro material** — atalho útil, escopo próprio.
- **Anexar desenho técnico à característica** — depende do módulo de anexos.
- **Reabrir ou corrigir medida já gravada** — a leitura da 29 é só leitura, e continua.
