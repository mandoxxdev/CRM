---
name: estimativa-de-tarefas
description: OBRIGATÓRIA antes de fazer qualquer alteração no CRM. Use sempre que receber tarefas novas do usuário (a, b, c…), ao analisar ou planejar uma etapa, feature, correção ou SDD (Fase 0.5 da `desenvolver-etapa`), ao emendar na próxima etapa (Passo 8 da `fechar-etapa`), e quando pedirem "estima", "quanto tempo vai levar", "planeja as tarefas", "manda pro pessoal". Gera, para cada tarefa, o descritivo em linguagem de usuário e o tempo estimado, num bloco pronto para copiar e colar no WhatsApp — e, no fechamento, o estimado × gasto.
---

# Estimativa de tarefas — o tempo de cada alteração, informado ANTES de fazer

**O processo novo (desde 29/10/2026):** a empresa quer saber **antes** quanto tempo cada
alteração vai levar, para ir controlando. Não basta o relatório da semana dizer depois para onde
foi o tempo: **toda tarefa ganha descritivo + tempo estimado antes da primeira linha de código**,
num texto que o André copia e cola direto no WhatsApp.

**Isto é obrigatório.** Nenhuma alteração começa sem a estimativa dela escrita e mostrada ao
André. Vale para tarefa pedida por ele, etapa do plano, correção pequena e a etapa que você
escolheu sozinho no Passo 8 da `fechar-etapa`. "É só uma correçãozinha" não é exceção: estime
(mínimo 30 min) e registre.

**Anuncie ao começar:** "Usando a skill `estimativa-de-tarefas` para estimar antes de fazer."

## Onde entra no fluxo

| Momento | O que fazer |
|---|---|
| O André manda tarefas (a, b, c) | Esta skill **primeiro**, para todas juntas; depois `desenvolver-etapa` em cada uma |
| `desenvolver-etapa`, Fase 0.5 | Depois de ler spec/código (Fase 0), **antes** do design e do plano (Fase 1) |
| Plano escrito e o tamanho mudou muito | Refaça a estimativa (veja "Reestimar") antes de executar |
| `fechar-etapa` | Preencha o **gasto** de cada tarefa e gere o bloco de conclusão |
| Passo 8 (emendar na próxima) | A próxima etapa passa por aqui antes da Fase 1 |

**Não trava o fluxo.** Estimou, gravou, mostrou o bloco ao André — e segue executando no mesmo
turno (a regra "NÃO PARE" do CLAUDE.md continua valendo). Ele encaminha o texto para a empresa;
quem acompanha é a empresa, não um aval que você espera. Se um dia o André disser que a empresa
precisa **aprovar** antes, aí sim pare depois de mostrar o bloco — e atualize esta linha.

## Passo a passo

### 1. Separar as tarefas como a empresa as enxerga

Uma tarefa = **uma alteração que o usuário reconhece na tela ou no resultado** ("o destino passa
a ter endereço com CEP"). Não quebre em tronco/galho, servidor/tela, teste/documentação — isso é
bastidor e já está **dentro** do tempo de cada tarefa. Se o André mandou a, b, c, a lista tem
a, b, c (pode subdividir uma só se ela for claramente duas mudanças diferentes para o usuário).

### 2. Medir antes de estimar (nunca chutar)

1. **O tamanho:** leia a spec e o código que a tarefa toca (o mínimo da Fase 0 da
   `desenvolver-etapa`): quantas telas, se mexe em regra de estoque/permissão/banco, se precisa
   de coluna nova, se há tela de celular junto.
2. **A régua — o tempo real de tarefas parecidas**, pelo mesmo medidor do relatório semanal
   (assim estimado e gasto saem na mesma unidade):
   ```
   node .claude/skills/relatorio-semanal/scripts/horas.js --desde AAAA-MM-DD --ate AAAA-MM-DD --grupos "Nome=regex do assunto;..."
   ```
   Procure 2 ou 3 entregas do mesmo porte e use o tempo delas. **Atenção: isto mede só a
   EXECUÇÃO** (as sessões de desenvolvimento, pelo intervalo entre commits — código, conferências
   automáticas, documentação). Referências medidas (out/2026):

   | Porte | Exemplo real | Execução medida |
   |---|---|---|
   | Ajuste pontual de tela | Voltar no topo (Frota); NCM e peso preenchidos no item (30/10) | ~10 a 20 min |
   | Mudança pequena com regra | fornecedor em maiúsculas; acesso do Compras aos materiais (30/10) | ~20 a 30 min |
   | Média (campo + validação + busca + documento) | CPF no fornecedor; OS digitada no pedido; materiais no Compras (30/10) | ~30 a 45 min |
   | Etapa com várias telas + cadastro novo | endereço do destino na Frota (29/10, com revisão e fechamento) | ~1h30 |
   | Mudança em estoque/saldo, travas, estorno | etapas do motor do almoxarifado | 3 h ou mais — meça antes |

   **Tarefas que rodam juntas (em paralelo) não somam execução**: o pacote de 8 pedidos de 30/10
   levou ~2,6 h de execução no total, não as 8 h da soma por tarefa. Estime a execução do
   **pacote** pelo relógio e rateie entre as tarefas.

   Atualize esta tabela quando a medida mostrar que ela envelheceu (diga de quando é a medida).

### 3. Estimar — regras

- **O tempo informado é o tempo de trabalho previsto, na MESMA régua do `horas.js`** (a que o relatório
  semanal mede). Nada de parte fixa somada por cima. A conta é só:

  **tempo informado = execução estimada pela régua do passo 2** (tarefas parecidas, medidas pelo `horas.js`).

  Régua medida (semana 08-14/11/2026, `horas.js --semana 2026-11-10 --grupos ...`), conferida em 18/11/2026:

  | Porte | Exemplo real | Medido |
  |---|---|---|
  | Tirar um campo, uma frase, um aviso simples | — | 30 min |
  | Alteração de cadastro no Compras (campo, lista, tela) | Etapas 211-216: famílias 1,8 h; fornecedores 0,9 h; histórico de preços 1,8 h; tipo de material de lista 0,6 h | ~1h a 1h30 |
  | Fatia do almoxarifado (tela ou regra, com teste e documentação) | Etapas 230, 233, 236, 237: 0,7 a 1,1 h | ~45 min a 1h |
  | Fatia do almoxarifado no motor, trava ou estorno | Etapas 217-234 de motor | ~1h15 a 1h30 |

  Fatia que passar de 2 h: quebre (veja abaixo).

  **Por que a regra anterior estava errada (corrigida em 18/11/2026):** até aqui o tempo informado era
  "execução + análise + teste e conferência", com a parte do André **fixa pelo porte** (até 1 h + 2 h por
  tarefa). Na semana de 08 a 14/11/2026 a soma das estimativas deu **91h45** e o trabalho medido pelo
  `horas.js` foi **29 h** (apontado em 15/11/2026). A parte fixa não existe na prática: o trabalho roda
  sozinho, o André não gasta essas horas por tarefa, e o relatório e o contrato medem só o `horas.js`. Somar
  a parte fixa triplicava o informado. Antes disso (até 30/10) a regra era "execução × 2", que também inflava
  — no pacote de 30/10, 21h30 informadas para 2,6 h medidas.
- **Unidade:** múltiplos de 15 min, sempre arredondando **para cima**. Mínimo **30 min** por tarefa.
- **Tudo incluído:** entender, planejar, fazer, conferências automáticas, documentação e manual — é o que o
  `horas.js` mede. Não existe "mais o tempo de teste" à parte.
- **Acima de 2 h, quebre** em tarefas menores que a empresa reconheça ("1ª parte: …"). Estimativa grande
  é chute grande.
- **Incerteza declarada, não escondida:** se depende de algo que só se descobre fazendo (ex.:
  integração com sistema de fora) ou de uma resposta de quem pediu, dê o tempo do caminho que será seguido
  e diga em uma frase do que depende.
- **Nem para agradar, nem para inflar.** Aplique a régua e informe o resultado. Estimativa
  sempre baixa destrói a confiança; estimativa sempre muito alta também, quando o estimado ×
  realizado aparece.

### 4. Gravar os dois arquivos

```
docs/estimativas/AAAA-MM/
  estimativa_AAAA-MM-DD_<tema-curto>.txt   <- EXATAMENTE o texto do WhatsApp (o que se cola)
  estimativa_AAAA-MM-DD_<tema-curto>.md    <- uso interno: tarefa → etapa/spec/plano, como foi medido, gasto real
```

O `.txt` é o bloco abaixo, sem mais nada. O `.md` tem uma tabela
`| # | Tarefa | Execução estimada | Régua horas.js | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |`
(as quatro últimas ficam "—" até o fechamento) e a linha de `--grupos` que vai medir cada tarefa no fim.

### 5. O formato do WhatsApp (copiar e colar)

WhatsApp entende `*negrito*`, `_itálico_` e listas com `-`. **Não** use `#`, tabelas, `**` nem
links de arquivo — viram lixo na conversa. Sem emoji (nem relógio ao lado do tempo): o André pediu o texto limpo.

```
*Planejamento — <assunto em linguagem de usuário>*
_<DD/MM/AAAA>_

*1. <Título curto da alteração>*
<O que muda para quem usa, em 1 ou 2 frases. Por que é feito, se não for óbvio.>
Tempo estimado: *2h30*

*2. <Título>*
<…>
Tempo estimado: *1h30*

*Total estimado: 4h*
_O tempo de cada item inclui análise, planejamento, desenvolvimento, testes, conferência e atualização dos manuais._
```

Regras de linguagem — as mesmas do relatório semanal: impessoal ("o destino passa a ter…",
nunca "vamos fazer"), sem spec, etapa, códigos (B476, RN-03), commit, servidor, banco, nem
menção a IA; sem dias da semana nem promessa de data. Confira, e só entrega com saída 0:

```
node .claude/skills/relatorio-semanal/scripts/conferir-linguagem.js docs/estimativas/AAAA-MM/estimativa_AAAA-MM-DD_<tema>.txt
```

### 6. Mostrar ao André

Na resposta, mostre o conteúdo do `.txt` **dentro de um bloco de código** (para ele copiar com
um clique) e o caminho do arquivo. Uma linha antes: "Estimativa para enviar:". Depois, siga para
a Fase 1 da `desenvolver-etapa`.

**Pessoal fica fora:** o teto semanal e o saldo da skill `controle-horas` não entram no `.txt`
nem no `.md`. Se o total estimado passar do que o ponteiro diz que resta na semana, avise o André
**só no chat**, em uma linha, e comece pelas tarefas que cabem.

### 7. Commitar a estimativa antes do código

Commit próprio, só os dois arquivos, **antes** do primeiro commit de código da tarefa — o
histórico prova que a estimativa veio antes. Mensagem: `Estimativa: <assunto> (<total>)`.

## Reestimar

Se o plano (Fase 1/2) mostrar que a tarefa é bem maior ou menor — diferença de 1 h ou mais, ou
50% —, atualize os dois arquivos, acrescente no `.txt` a linha
`_Revisado: <motivo em linguagem de usuário>_`, mostre o bloco novo ao André e commite. Revisão
honesta antes de fazer é melhor que estouro descoberto depois.

## No fechamento (chamado pela `fechar-etapa`)

1. Meça a **execução** de cada tarefa com `horas.js --grupos` (a linha gravada no `.md`; os
   assuntos dos commits da tarefa precisam casar com a regex — por isso, nos commits, cite o
   assunto da tarefa).
2. **Realizado = execução medida pelo `horas.js`**, e nada mais. Pacote em paralelo: rateie a
   execução medida do pacote pela execução estimada. Arredonde para cima, na unidade do passo 3.
   Preencha Execução medida, Realizado e Commits no `.md`.
   **A regra anterior estava errada:** "Realizado = execução medida + a parte do André (pela tabela do
   passo 3)" somava a cada tarefa a mesma parte fixa da estimativa e escondia o erro — na semana de 08 a
   14/11/2026 as estimativas somaram 91h45 e o `horas.js` mediu 29 h (15/11/2026). Estimado e realizado
   saem agora na mesma régua, a do relatório. Os `.md` antigos com "+ parte da tabela" ficam como
   histórico; não refaça.
3. Grave `docs/estimativas/AAAA-MM/conclusao_AAAA-MM-DD_<tema>.txt`, rode o
   `conferir-linguagem.js` nele, e mostre ao André em bloco de código:

```
*Concluído — <assunto>*
_<DD/MM/AAAA>_

1. <Título> — estimado 2h30 · realizado 2h
2. <Título> — estimado 1h30 · realizado 1h30

*Total: estimado 4h · realizado 3h30*
```

   Se uma tarefa estourou mais de 30 min, uma frase curta em linguagem de usuário dizendo por quê.
4. Se a **execução** errou por muito, corrija a régua do passo 3 (diga de quando é a medida) — é
   assim que a próxima estimativa melhora.

## Red flags

- "É pequeno, nem precisa estimar" → precisa. Mínimo 30 min, registrado.
- "Somei análise + teste do André por tarefa" → não; o informado é o da régua do `horas.js` (passo 3).
  Essa parte fixa fez a semana de 08 a 14/11/2026 somar 91h45 estimadas para 29 h medidas.
- "A soma das estimativas passou muito do que a semana mede" → a régua está errada; reveja antes de mandar.
- "Vou estimar depois do plano, quando souber melhor" → a estimativa vem antes; o plano pode
  **revisar** ela.
- "Coloquei 'servidor' e 'tela' como itens separados" → bastidor; junte na alteração que o
  usuário reconhece.
- "Vou esperar o André aprovar a estimativa" → não; mostre e siga (salvo se ele mudar a regra).
- "Escrevi as horas que restam na semana no arquivo" → pessoal; apague.
