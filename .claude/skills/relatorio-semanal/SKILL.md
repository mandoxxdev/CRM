---
name: relatorio-semanal
description: Use quando o usuário pedir o relatório semanal, o resumo da semana ou o resumo do mês para a empresa, "horas do mês", "horas trabalhadas", "quanto tempo gastamos", "o que fizemos esta semana", prints das novidades para mostrar aos usuários, ou quando alguém da empresa achar que o sistema "não mudou" numa semana de trabalho no motor. Use também ao fechar a última etapa da semana ou ao planejar uma etapa que não tem nada visível na tela.
---

# Relatório semanal para a empresa

**Para quem é:** pessoas da GMP que **usam** o sistema e não são da área. Elas não sabem o que é
spec, etapa, commit, back-end nem que o trabalho é feito com IA. Elas veem a tela — se a tela não
mudou, para elas a semana não existiu.

**O objetivo:** mostrar o que mudou, **por que** cada coisa foi feita, e para onde foi o tempo —
inclusive o tempo que não aparece na tela.

**Anuncie ao começar:** "Usando a skill `relatorio-semanal` para montar o relatório da semana."

## Onde fica cada coisa — por mês, e dentro do mês por semana

```
docs/relatorios-semanais/
  2026-09/                              <- AAAA-MM: um diretório por mês
    resumo-do-mes_2026-09-01_a_2026-09-30.html  .pdf   <- o RESUMÃO do mês (obrigatório, ver abaixo)
    2026-09-13_a_2026-09-19/            <- uma pasta por semana (domingo_a_sábado)
      relatorio-semanal_2026-09-13_a_2026-09-19.html  .pdf  prints/
    2026-09-27_a_2026-10-03/            <- semana que cruza o mês: fica no mês em que COMEÇA
  2026-10/
    resumo-do-mes_2026-10-01_a_2026-10-23.html  .pdf   <- resumo PARCIAL: o fim é o último dia medido
    ...
```

**Todo arquivo leva o período no nome — sempre.** O André encaminha os PDFs para outras
pessoas, e quem recebe não tem as pastas: um `relatorio.pdf` solto não diz de quando é.
- Semana: `relatorio-semanal_AAAA-MM-DD_a_AAAA-MM-DD.pdf` (domingo e sábado), o `.html` com o
  mesmo nome. Nunca `relatorio.pdf`.
- Mês: `resumo-do-mes_AAAA-MM-01_a_AAAA-MM-<último dia>.pdf`. Resumo **parcial** vai até o dia
  medido (`resumo-do-mes_2026-10-01_a_2026-10-23.pdf`); quando o mês fechar e o resumo for
  refeito, renomeie (`git mv`) para o fim do mês — não deixe dois resumos do mesmo mês.
- Dentro do resumo do mês, a lista "Relatórios das semanas" cita cada semana pelo **nome do
  arquivo** (não pela pasta), para quem recebe saber qual PDF pedir.

- **Semana que cruza dois meses** (27/09 a 03/10) fica na pasta do mês do **domingo** em que
  começa. Nas horas do **mês**, porém, cada dia conta no mês dele (o resumo usa o calendário).
- **Resumo do mês — nunca esqueça.** Sempre que fizer um relatório semanal, confira:
  1. Se o mês **anterior** já acabou e a pasta dele não tem `resumo-do-mes_*.pdf` do mês inteiro → faça o
     resumo dele **antes** de entregar (é a parte que o André mais usa para cobrar as horas).
  2. Ao fazer a semana que **fecha** o mês (a que contém o último dia), faça o resumo do mês.
  3. Mês em andamento pode ter resumo **parcial** quando pedirem: subtítulo "parcial, até DD/MM".
- **Como fazer o resumo do mês:** modelo `.claude/skills/relatorio-semanal/modelo-resumo-mes.html`,
  salvo como `docs/relatorios-semanais/AAAA-MM/resumo-do-mes_AAAA-MM-DD_a_AAAA-MM-DD.html` (+ PDF com o mesmo nome, mesmo comando do passo 7).
  - Horas do mês: `horas.js --mes AAAA-MM` (dia 1 ao último dia; com `--grupos` para atividades).
  - Horas por semana: `horas.js --desde X --ate Y` de cada semana **recortada no mês** (a semana
    que cruza o mês entra só com os dias dele). A soma das linhas = total do mês, em hora cheia.
  - Semana do mês sem relatório semanal também entra na tabela de horas (o mês é inteiro).
  - "O que mudou no mês": até 8 blocos por assunto, reaproveitando prints das semanas
    (`src="AAAA-MM-DD_a_AAAA-MM-DD/prints/x.png"`, caminho relativo à pasta do mês).
  - Mesmas regras de linguagem (impessoal, sem dias, sem promessa) e `conferir-linguagem.js` com saída 0.

**Estimado × gasto.** Desde 29/10/2026 cada alteração tem estimativa gravada antes de começar
(skill `estimativa-de-tarefas`, em `docs/estimativas/AAAA-MM/`). Se a semana tem estimativas, a
seção "Para onde foi o tempo" ganha a tabela **Estimado × gasto** por alteração, com os números dos
`.md` de fechamento (nunca recalculados de cabeça) e uma frase para cada estouro de mais de 30 min.

## Passo a passo

1. **Medir as horas** (nunca invente número):
   ```
   node .claude/skills/relatorio-semanal/scripts/horas.js --semana AAAA-MM-DD
   ```
   **A semana vai de domingo a sábado.** `--semana` recebe qualquer dia e mede o domingo→sábado
   que o contém (sem argumento: a semana corrente); `--mes AAAA-MM` mede o mês de calendário; `--desde`/`--ate` sobrepõem o recorte. Ele separa o tempo em **tela** (`client/`), **bastidores**
   (`server/`), **testes** e **documentação**, por pessoa e por dia, e lista os assuntos dos
   commits com os minutos de cada um. `--json` para usar os números; `--autor` para uma pessoa só.
   **Horas por atividade:** `--grupos "Celular=celular|PWA;Pedido de compra=Etapa 3[89]|pedido"`
   soma as horas de cada atividade pelo assunto do commit (o que não casa vai para "Outros" —
   ajuste as regex até "Outros" sumir ou ficar pequeno). É uma estimativa
   **por baixo** (sessões pelo intervalo entre commits) — diga isso no relatório, sem decimais
   falsos: arredonde para hora cheia.

   **O contrato do André é de horas por semana, não de dias.** Por isso o relatório mede tempo
   **por atividade** e nunca diz em que dia algo foi feito ("de quinta a sábado", "na segunda")
   — o "por dia" do script é só para você conferir. Os termos do contrato (teto, saldo da
   semana) são **pessoais** e ficam fora do repositório, na skill pessoal `controle-horas`
   (`~/.claude/skills/controle-horas/`, se existir nesta máquina) — **não** os escreva aqui, no
   relatório nem em nenhum arquivo versionado. Quando essa skill mandar parar na semana, é ela
   quem chama esta para fechar o relatório.

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
   `docs/relatorios-semanais/<pasta>/prints/<nome-curto>.png`. Sem print, o item não entra
   no bloco "o que você já pode ver" — vai para "por baixo".
   O André autorizou criar dados de exemplo direto (pela API, com a sessão do navegador, ou no
   banco) para os prints, e **não** apagar depois: ele quer ver os dados quando entrar. A janela
   do Chrome dele é maximizada — `resize_window` não muda o tamanho; recorte com `zoom` +
   `save_to_disk` (sempre em escala 1, senão o arquivo sai pequeno) e, para print de celular,
   abra a tela num `<iframe>` de 390px.

5. **Escrever** a partir de `.claude/skills/relatorio-semanal/modelo.html`, salvando em
   `docs/relatorios-semanais/<pasta>/relatorio-semanal_<semana>.html` (`<semana>` = `AAAA-MM-DD_a_AAAA-MM-DD`, o mesmo da pasta), com **`<pasta>` = `AAAA-MM/AAAA-MM-DD_a_AAAA-MM-DD`** (o mês do domingo, e dentro dele domingo e sábado da semana, ex.: `2026-09/2026-09-13_a_2026-09-19`). No texto, o período é "Semana de DD/MM a DD/MM/AAAA".
   Preencha todos os `{{...}}` e apague os blocos que sobrarem.

6. **Conferir a linguagem** — obrigatório, e só entrega com saída 0:
   ```
   node .claude/skills/relatorio-semanal/scripts/conferir-linguagem.js docs/relatorios-semanais/<pasta>/relatorio-semanal_<semana>.html
   ```
   E confira que nenhum `{{` sobrou: `grep -c "{{" .../relatorio-semanal_<semana>.html` tem de dar 0.

7. **Gerar o PDF** com o Chrome sem janela:
   ```
   "/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --user-data-dir="<scratchpad>/chrome-pdf" --no-pdf-header-footer --print-to-pdf="<pasta>/relatorio-semanal_<semana>.pdf" "file:///<pasta>/relatorio-semanal_<semana>.html"
   ```

8. **Resumo do mês:** confira a regra da seção "Onde fica cada coisa" — mês anterior fechado sem
   `resumo-do-mes_*.pdf` do mês inteiro, ou semana que fecha o mês → faça o resumo agora.

9. **Commitar** só a pasta da semana (e o resumo do mês, se fez) — arquivos explícitos, nunca
   `git add -A` — e entregar ao André o caminho dos PDFs (confira que o nome tem o período).

## Como escrever cada parte

| Parte | Regra |
|---|---|
| Resumo | 3 frases: o que dá para ver, o que melhorou por baixo, quantas horas e em que atividades. |
| Novidade visível | Nome como o usuário chama a tela ("Requisições", "Notas de entrada"), onde fica no menu, antes / agora, print. |
| Item por baixo | **Problema** com exemplo real do chão de fábrica → **o que foi feito** → **o que isso evita**. Use analogia quando ajudar ("é como dois caixas vendendo o último item da prateleira ao mesmo tempo"). |
| Para onde foi o tempo | Total da semana, a barra por área, a tabela **Tempo por atividade** (`--grupos`, hora cheia, soma = total) e uma frase honesta do motivo. Nunca cite dias da semana. "Conferências automáticas" = testes: explique que são robôs que repetem centenas de situações a cada mudança para nada quebrar escondido. |
| Quer conferir? | Passos clicáveis: "Abra Almoxarifado → Requisições → clique em…". |

**Tom:** frases curtas, sem jargão, como se explicasse para alguém do almoxarifado no café. O
"porquê" vem antes do "como". **Sempre impessoal:** "o que foi feito", "foi corrigido", "a tela
passou a mostrar" — nunca "fizemos", "corrigimos", "pegamos".

**Não existe seção "o que vem na próxima semana"** — o André não quer promessa no relatório.

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
- Registre no plano da etapa em andamento, como próxima tarefa, **uma entrega visível pequena**
  que se apoie no que foi feito por baixo (um aviso novo, um campo, um filtro) — fora do
  relatório, que não faz promessa.

## Erros comuns

- **Copiar o título do commit ou da novidade.** "O livro e o desfazer do estorno rodam sob a
  trava" não significa nada para o leitor. Reescreva pelo efeito.
- **Um item por etapa.** Vira uma lista de 30 coisas técnicas. Agrupe pelo efeito.
- **Horas com decimal ou somadas à mão.** Use o script e arredonde.
- **Print de tela vazia ou com dado de teste.** Prepare a tela antes.
- **Escrever na primeira pessoa ou citar dias.** "Fizemos", "de quinta a sábado" — troque por
  "foi feito" e por horas da atividade.
- **Ler "testes 60%" como "nada foi feito".** É o custo de não quebrar o que já funciona;
  explique assim no "para onde foi o tempo".
- **Arquivo sem o período no nome** (`relatorio.pdf`, `resumo-do-mes.pdf`). Quem recebe o PDF
  encaminhado não sabe de quando é. Use sempre `relatorio-semanal_AAAA-MM-DD_a_AAAA-MM-DD.pdf`
  e `resumo-do-mes_AAAA-MM-DD_a_AAAA-MM-DD.pdf`.
