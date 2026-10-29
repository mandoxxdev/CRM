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
30 min e registre.

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
   Procure 2 ou 3 entregas do mesmo porte e use o tempo delas. Referências medidas (out/2026,
   todo o trabalho incluído — código, conferências automáticas, documentação):

   | Porte | Exemplo real | Gasto medido |
   |---|---|---|
   | Ajuste pontual de tela | remover o botão de ajuda flutuante; corrigir layout do celular | ~30 min |
   | Uma mudança pequena com regra | o gestor remove uma foto pela lista | ~1 h |
   | Etapa média (várias telas + cadastro novo) | destinos, condutor, origem, perfis pela tela | ~2 h a 2h30 |
   | Mudança em estoque/saldo, travas, estorno | etapas do motor do almoxarifado | 3 h ou mais — meça antes |

   Atualize esta tabela quando a medida mostrar que ela envelheceu (diga de quando é a medida).

### 3. Estimar — regras

- **Unidade:** múltiplos de 30 min (30 min, 1h, 1h30, 2h…). Mínimo 30 min por tarefa.
- **Tudo incluído:** entender, fazer, conferências automáticas, revisão, documentação e manual.
  Não existe "mais o tempo de teste" à parte.
- **Acima de 4 h, quebre** em tarefas menores que a empresa reconheça ("1ª parte: …"). Estimativa
  grande é chute grande.
- **Incerteza declarada, não escondida:** se depende de algo que só se descobre fazendo (ex.:
  integração com sistema de fora), dê a faixa ("2h a 3h") e diga em uma frase do que depende.
- **Não arredonde para agradar.** Se a medida diz 2 h, é 2 h. Estimativa sistematicamente baixa
  destrói a confiança mais rápido que uma alta.

### 4. Gravar os dois arquivos

```
docs/estimativas/AAAA-MM/
  estimativa_AAAA-MM-DD_<tema-curto>.txt   <- EXATAMENTE o texto do WhatsApp (o que se cola)
  estimativa_AAAA-MM-DD_<tema-curto>.md    <- uso interno: tarefa → etapa/spec/plano, como foi medido, gasto real
```

O `.txt` é o bloco abaixo, sem mais nada. O `.md` tem uma tabela
`| # | Tarefa | Estimado | Etapa/plano | Régua usada | Gasto | Commits |` (Gasto e Commits ficam
"—" até o fechamento) e a linha de `--grupos` que vai medir cada tarefa no fim.

### 5. O formato do WhatsApp (copiar e colar)

WhatsApp entende `*negrito*`, `_itálico_` e listas com `-`. **Não** use `#`, tabelas, `**` nem
links de arquivo — viram lixo na conversa.

```
*Planejamento — <assunto em linguagem de usuário>*
_<DD/MM/AAAA>_

*1. <Título curto da alteração>*
<O que muda para quem usa, em 1 ou 2 frases. Por que é feito, se não for óbvio.>
⏱ Tempo estimado: *1h30*

*2. <Título>*
<…>
⏱ Tempo estimado: *30 min*

*Total estimado: 2h*
_O tempo de cada item já inclui fazer, conferir e atualizar os manuais._
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

1. Meça o gasto de cada tarefa com `horas.js --grupos` (a linha gravada no `.md`; os assuntos dos
   commits da tarefa precisam casar com a regex — por isso, nos commits, cite o assunto da tarefa).
   Arredonde para 30 min.
2. Preencha Gasto e Commits no `.md`.
3. Grave `docs/estimativas/AAAA-MM/conclusao_AAAA-MM-DD_<tema>.txt`, rode o
   `conferir-linguagem.js` nele, e mostre ao André em bloco de código:

```
*Concluído — <assunto>*
_<DD/MM/AAAA>_

1. <Título> — estimado 1h30 · gasto 1h
2. <Título> — estimado 30 min · gasto 30 min

*Total: estimado 2h · gasto 1h30*
```

   Se uma tarefa estourou mais de 30 min, uma frase curta em linguagem de usuário dizendo por quê.
4. Se o estimado errou por muito, corrija a tabela de régua do passo 2 — é assim que a próxima
   estimativa melhora.

## Red flags

- "É pequeno, nem precisa estimar" → precisa. 30 min, registrado.
- "Vou estimar depois do plano, quando souber melhor" → a estimativa vem antes; o plano pode
  **revisar** ela.
- "Coloquei 'servidor' e 'tela' como itens separados" → bastidor; junte na alteração que o
  usuário reconhece.
- "Vou esperar o André aprovar a estimativa" → não; mostre e siga (salvo se ele mudar a regra).
- "Escrevi as horas que restam na semana no arquivo" → pessoal; apague.
