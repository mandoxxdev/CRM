---
name: relatorio-semanal
description: Use quando o usuário pedir o relatório semanal, o resumo da semana para a empresa, "horas trabalhadas", "quanto tempo gastamos", "o que fizemos esta semana", prints das novidades para mostrar aos usuários, ou quando alguém da empresa achar que o sistema "não mudou" numa semana de trabalho no motor. Use também ao fechar a última etapa da semana (sexta-feira) ou ao planejar uma etapa que não tem nada visível na tela.
---

# Relatório semanal para a empresa

**Para quem é:** pessoas da GMP que **usam** o sistema e não são da área. Elas não sabem o que é
spec, etapa, commit, back-end nem que o trabalho é feito com IA. Elas veem a tela — se a tela não
mudou, para elas a semana não existiu.

**O objetivo:** mostrar o que mudou, **por que** cada coisa foi feita, e para onde foi o tempo —
inclusive o tempo que não aparece na tela.

**Anuncie ao começar:** "Usando a skill `relatorio-semanal` para montar o relatório da semana."

## Passo a passo

1. **Medir as horas** (nunca invente número):
   ```
   node .claude/skills/relatorio-semanal/scripts/horas.js --desde AAAA-MM-DD --ate AAAA-MM-DD
   ```
   Padrão: últimos 7 dias. Ele separa o tempo em **tela** (`client/`), **bastidores**
   (`server/`), **testes** e **documentação**, por pessoa e por dia, e lista os assuntos dos
   commits. `--json` para usar os números; `--autor` para uma pessoa só. É uma estimativa
   **por baixo** (sessões pelo intervalo entre commits) — diga isso no relatório, sem decimais
   falsos: arredonde para hora cheia.

2. **Levantar o que mudou**, nesta ordem de fonte: `docs/almoxarifado-novidades-por-etapa.md`
   e `docs/compras-novidades-por-etapa.md` (parte "Antes → Agora" — o do almoxarifado registra
   também etapas de outros módulos, como Comercial e Propostas), os guias de usuário em `docs/`,
   e os assuntos dos commits do script.
   Essas fontes são **matéria-prima**: estão cheias de códigos internos (B476, C131, Etapa 190).
   Nada delas é copiado — tudo é reescrito.

3. **Separar em dois montes:**
   - **Visível** — o que mudou em `client/` e dá para **mostrar num print**. Agrupe por tela ou
     assunto (EPI, ferramentas, pedido de compra…): no máximo 6 itens. Correção que não se
     fotografa (a lista que voltava com o filtro errado) vai para "por baixo".
   - **Por baixo** — o resto. Agrupe por **efeito que o usuário reconheceria** ("o estoque não
     fica negativo quando duas pessoas dão baixa ao mesmo tempo"), nunca por etapa. Dez etapas
     sobre o mesmo assunto viram **um** item. Máximo de 5 itens por baixo; o resto vira uma frase.

4. **Tirar os prints** de cada item visível. Use a skill `claude-in-chrome` (o navegador do
   André já está logado; o app roda em `http://localhost:3000` com `npm run dev`; as rotas estão
   em `client/src/App.js` e os nomes do menu em `client/src/components/Layout.js`). Um print
   por tela — item agrupado pode ter mais de uma `<figure>`. Se o app não estiver no ar ou o
   navegador não responder, entregue com `prints-pendentes.txt` na pasta (arquivo, tela, o que
   precisa aparecer) e diga isso ao André. Antes de
   tirar, deixe a tela com dados que façam sentido (não "teste123"). Salve em
   `docs/relatorios-semanais/AAAA-MM-DD/prints/<nome-curto>.png`. Sem print, o item não entra
   no bloco "o que você já pode ver" — vai para "por baixo" ou fica para a próxima semana.

5. **Escrever** a partir de `.claude/skills/relatorio-semanal/modelo.html`, salvando em
   `docs/relatorios-semanais/AAAA-MM-DD/relatorio.html` (data = sexta-feira da semana).
   Preencha todos os `{{...}}` e apague os blocos que sobrarem.

6. **Conferir a linguagem** — obrigatório, e só entrega com saída 0:
   ```
   node .claude/skills/relatorio-semanal/scripts/conferir-linguagem.js docs/relatorios-semanais/AAAA-MM-DD/relatorio.html
   ```
   E confira que nenhum `{{` sobrou: `grep -c "{{" .../relatorio.html` tem de dar 0.

7. **Commitar** só a pasta da semana (arquivos explícitos, nunca `git add -A`) e entregar ao
   André o caminho do HTML. Ele abre no navegador e, se quiser PDF, Ctrl+P → Salvar como PDF.

## Como escrever cada parte

| Parte | Regra |
|---|---|
| Resumo | 3 frases: o que dá para ver, o que melhorou por baixo, o que vem. |
| Novidade visível | Nome como o usuário chama a tela ("Requisições", "Notas de entrada"), onde fica no menu, antes / agora, print. |
| Item por baixo | **Problema** com exemplo real do chão de fábrica → **o que fizemos** → **o que isso evita**. Use analogia quando ajudar ("é como dois caixas vendendo o último item da prateleira ao mesmo tempo"). |
| Para onde foi o tempo | Os números do script + uma frase honesta do motivo. "Conferências automáticas" = testes: explique que são robôs que repetem centenas de situações a cada mudança para nada quebrar escondido. |
| Próxima semana | **Sempre** pelo menos uma coisa que vai aparecer na tela. |
| Quer conferir? | Passos clicáveis: "Abra Almoxarifado → Requisições → clique em…". |

**Tom:** frases curtas, sem jargão, como se explicasse para alguém do almoxarifado no café. O
"porquê" vem antes do "como".

**Troque assim:**

| Nosso jeito | Jeito do relatório |
|---|---|
| back-end, servidor, API | o motor do sistema, por baixo |
| front-end, client | as telas |
| teste automatizado, suíte | conferências automáticas |
| corrida, concorrência, trava | duas pessoas mexendo no mesmo material ao mesmo tempo |
| estorno | desfazer um lançamento |
| migração, coluna, banco | onde o sistema guarda as informações |
| spec, plano, etapa, fix-round | (não mencione — diga o que mudou) |

## Toda semana precisa ter algo na tela

A régua é o bloco "o que você já pode ver", **não** a porcentagem de horas: as telas são a parte
rápida, e teste de tela conta como "testes" no script. Uma semana com 6% de horas em tela pode ter
muita novidade visível. Se o bloco ficou **vazio ou com um item só**:

- Não esconda: diga no "para onde foi o tempo" que foi uma semana de motor, e por quê.
- Na "próxima semana", nomeie **uma entrega visível pequena** que já se apoia no que foi feito
  por baixo (um aviso novo, um campo que agora aparece, um filtro, um relatório).
- Registre essa entrega como próxima tarefa no plano da etapa em andamento, para que ela de fato
  aconteça — o relatório não pode prometer o que ninguém vai fazer.

## Erros comuns

- **Copiar o título do commit ou da novidade.** "O livro e o desfazer do estorno rodam sob a
  trava" não significa nada para o leitor. Reescreva pelo efeito.
- **Um item por etapa.** Vira uma lista de 30 coisas técnicas. Agrupe pelo efeito.
- **Horas com decimal ou somadas à mão.** Use o script e arredonde.
- **Print de tela vazia ou com dado de teste.** Prepare a tela antes.
- **Prometer na "próxima semana" algo que não está planejado.** Confira o plano em
  `docs/superpowers/plans/` **e** se o módulo não está pausado (procure um arquivo
  `*pausa*` em `docs/superpowers/plans/`). Módulo pausado não entra na promessa.
- **Ler "testes 60%" como "não fizemos nada".** É o custo de não quebrar o que já funciona;
  explique assim no "para onde foi o tempo".
