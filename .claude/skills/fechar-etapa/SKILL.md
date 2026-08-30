---
name: fechar-etapa
description: Use ao terminar QUALQUER etapa, task ou correção do CRM (especialmente do módulo almoxarifado) — antes de dizer que acabou. Fecha o contrato de documentação combinado com o usuário - novidades por etapa, README da feature, mapa de status, guia do usuário e plano - e roda a verificação final. Use também quando o usuário pedir "documenta", "fecha a etapa", "atualiza os docs" ou perguntar se está tudo documentado.
---

# Fechar etapa — o contrato de documentação deste projeto

O usuário **não quer revisar isto toda vez**. Esta skill existe para que ele não precise.
Se você a seguir inteira, ele lê só o resultado.

**Documentação desatualizada é trabalho não terminado.** Já falhou nesta base: código entregue e
specs continuando a dizer que a feature não existia — a sessão seguinte lê os documentos primeiro e
é **ativamente enganada** por eles.

**Anuncie ao começar:** "Usando a skill `fechar-etapa` para fechar a documentação e a verificação."

---

## Regra zero: o que você escreve tem de ser verdade medida

Nada nesta skill pode ser preenchido de memória ou por dedução.

- Número de teste vem de **rodar** a suíte e ler a saída, nunca de "deve estar passando".
- Hash de commit vem de `git log`, nunca inventado ou aproximado.
- Se você não executou uma verificação, escreva que **não executou** — não a marque como feita.
  Um item honestamente marcado "não verificado" vale mais que um `[x]` falso, porque o `[x]` falso
  faz o usuário parar de checar.
- Se algum passo abaixo não se aplica, diga **por que** no lugar dele. Não deixe em branco: em
  branco parece esquecimento.

---

## Os 7 artefatos. Nenhum é opcional.

Crie uma tarefa por item e complete em ordem.

**Dois documentos, dois públicos — não confunda.** `docs/almoxarifado-novidades-por-etapa.md` (item 1) é
para **quem acompanha o desenvolvimento**: organizado por etapa, com bug, pendência e decisão.
`docs/almoxarifado-manual-do-sistema.md` (item 7) é para **quem usa o sistema** e nunca ouviu falar
de etapa nenhuma. Nunca misture os dois.

### 1. `docs/almoxarifado-novidades-por-etapa.md` — o documento de apresentação

**É o mais importante**, porque é o que o usuário leva para a empresa. Ele apresenta a partir daqui
e **testa os cenários ao vivo** enquanto apresenta.

A seção da etapa nova entra **antes** de `## Onde estamos e o que vem a seguir`, seguindo o padrão
das etapas anteriores (leia a Etapa 8b como modelo antes de escrever), e contém:

- **Um parágrafo de abertura em linguagem de usuário** — que problema real do galpão isto resolve.
  Sem nome de arquivo, sem nome de função, sem jargão de código.
- **Tabela "Antes → Agora"** — uma linha por mudança perceptível.
- **Seção "As regras, com o cenário exato"** — cada regra de negócio e cada validação como um
  cenário **clicável e demonstrável ao vivo**: o que digitar, o que o sistema faz, e a **mensagem
  literal** que aparece na tela. O usuário vai reproduzir isso na frente de outras pessoas; uma
  mensagem aproximada o faz passar vergonha.
- **O que esta etapa NÃO cobre** — limitação declarada é decisão, e precisa parecer decisão.

**E o bloco consolidado no topo** (`## ⚠️ Leia antes de apresentar`), que é onde o usuário revisa
tudo de uma vez. Se a etapa produziu qualquer um destes, **acrescente à letra certa** (não crie
seção nova, não repita o que já está lá):

| Letra | O que entra |
|---|---|
| **A** | Consultas SQL para rodar **em produção antes do deploy** — com a query pronta para copiar e o que fazer com cada resultado possível |
| **B** | **Decisões de negócio** esperando resposta dele. Diga as opções e a consequência de cada uma |
| **C** | **Furos conhecidos em operação** — o que quem opera precisa saber para não ser pego |
| **D** | **Limitações declaradas** — cortes deliberados de escopo |
| **E+** | Regras que você **deduziu** e ninguém confirmou; verificações manuais **não executadas**; fragilidades estruturais |

**Regra de ouro deste documento:** toda decisão que você tomou no lugar dele tem de estar escrita
aqui, com o que foi **escolhido** e o que foi **descartado** e por quê. Ele autorizou você a
decidir — não a esconder que decidiu.

### 2. `specs/<modulo>/<feature>/README.md` — a spec da feature

- **Status no topo** atualizado.
- **Checklist marcado item por item**, cada `[x]` **com o hash do commit** que o entregou.
- Item que ficou de fora: **explique ali por quê**. Desmarcado e mudo parece esquecimento.
- **Se a spec estava errada, corrija E DIGA QUE ESTAVA ERRADA.** Isto já falhou três vezes aqui
  (a feature 07 afirmava "consumo baixa reserva" quando `reserva_id` era só uma coluna; a 8b dizia
  "envio = saída para localização virtual", que não tira nada do disponível). **Apagar a afirmação
  errada em silêncio faz o próximo confiar nela de novo.** Deixe a correção visível, no formato
  "isto dizia X; **estava errado**; o certo é Y".

### 3. `specs/<modulo>/README.md` — o mapa de status

A linha da feature na tabela, com o range de commits e o que a etapa mudou no estado dela
(🔴/🟡/🟢). Se a feature continua 🟡, diga **o que falta** para virar 🟢.

### 4. O guia do usuário do módulo (`docs/almoxarifado-guia-etapas-e-testes.md`)

- Seção da etapa em linguagem de usuário.
- **Roteiro de teste manual clicável** — passo a passo, do login à verificação.
- O que a etapa **não** cobre.
- **O cabeçalho do guia tem de deixar óbvio onde o desenvolvimento parou.**

### 5. `docs/superpowers/plans/<plano-da-etapa>.md`

- Tasks feitas **marcadas**, com hash.
- Onde a execução **divergiu do plano**, escreva a divergência e o motivo — o plano errado é dado,
  não vergonha. (Nesta base, cinco tasks seguidas acharam defeito no código que o plano trazia
  pronto.)
- **A próxima tarefa detalhada**: contrato de API que ela consome, pontos de atenção, o que já está
  pronto e ela não precisa reabrir. É o que permite retomar sem reler o código.

### 7. `docs/almoxarifado-manual-do-sistema.md` — o manual de quem USA

**Documento vivo, atualizado a cada feature entregue.** Não é changelog e não é histórico: é a
descrição de **como o sistema é hoje**, para alguém que não participou do desenvolvimento e vai
operar ou apresentar o sistema.

Organize por **o que a pessoa faz**, nunca por quando foi construído. Ao entregar uma feature,
**enxerte o comportamento novo na seção temática onde ele pertence** — não crie uma seção "novidades
da etapa X". Se o comportamento novo contradiz o que o manual dizia, **reescreva a frase antiga**:
aqui, ao contrário das specs, não se deixa a versão errada à vista, porque o leitor não tem contexto
para interpretar uma correção — ele leria as duas e não saberia qual vale.

**Proibido neste arquivo:**
- número de etapa ("Etapa 8c", "na 6b"), hash de commit, nome de branch;
- qualquer menção a bug, defeito, correção, ou "antes era assim";
- nome de arquivo, função, tabela ou coluna do código.

**Obrigatório neste arquivo:**
- **regra de negócio explicada com precisão técnica** — fórmulas, condições, o que **bloqueia** e o
  que só **avisa**. O leitor precisa conseguir explicar a terceiros *como o sistema decide*;
- a **mensagem literal que aparece na tela** quando o sistema recusa algo, entre aspas e **lida do
  código**, nunca aproximada;
- português com acentuação normal (é documento, não mensagem de commit).

**Regra de verdade:** se você não conseguir confirmar uma regra lendo o código, **não a escreva**.
Manual de usuário que mente é pior que manual incompleto — o operador age com base nele.

### 6. Verificação final — medida, não presumida

```
cd server && npm run test:api
cd server && npm run test:almoxarifado
cd server && npm run test:validation && npm run test:safealter && npm run test:sqlite
cd client && CI=true npx react-scripts test --watchAll=false
cd client && CI=true npx react-scripts build
```

E ainda:

- `git status` — a árvore tem de estar limpa (fora os artefatos de runtime já conhecidos em
  `server/data/` e `server/uploads/`).
- **Cite os números reais** na resposta ao usuário. "Suíte verde" não é resultado; "74/74 arquivos"
  é.
- **Se algo falhou, diga que falhou, com a saída.** Não conserte em silêncio e não arredonde.

---

## Desconfie de teste que passa de primeira

Já aconteceram **quatro** casos de teste vazio nesta base: varredura com caminho errado e
`2>/dev/null` engolindo o erro; `grep -c` combinado com `wc -l`; backup testado **depois** de
fechar a conexão SQLite (o checkpoint apaga o `-wal`, então o teste provava nada); e um harness de
sabotagem que não sabotava.

Quando um teste novo passa de primeira, rode um **controle positivo**: quebre a implementação de
propósito e confirme que o teste **fica vermelho**. Regras do harness de sabotagem, todas
aprendidas por falha silenciosa aqui:

- **Use `python3`, nunca `python`.** O binário é `/usr/bin/python3`; o alias `python` **não
  existe**, e um heredoc chamando `python` vira **no-op silencioso** — foi assim que quatro
  sabotagens da Etapa 8b "passaram" sem sabotar nada. A versão anterior desta regra dizia
  "`python` não existe nesta máquina" e **mandava evitar a ferramenta mais confiável
  disponível**; a revisão adversarial da Etapa 22 pegou isso usando `python3` sem problema
  algum. O erro real era o alias, não a linguagem.
- Conte a âncora antes de aplicar `sed`: `grep -cF '<ancora>' arquivo` **tem de dar exatamente 1**.
  Se der 0 ou mais de 1, **aborte** — já houve sabotagem aplicada na tabela errada por casar a 1ª
  de 4 ocorrências.
- `md5sum` **antes**, **depois da sabotagem** e **depois de restaurar**; `git diff --stat` tem de
  voltar vazio. Só o md5 pegou uma sabotagem que não fez nada.
- **Sabotagem que não derruba nenhum teste é um achado**, não um detalhe: diga qual asserção falta.
  **Mas há dois motivos diferentes para isso, e eles pedem respostas opostas.** (1) *Falta
  asserção* — o caso comum: escreva o cenário. (2) **O defeito virou inalcançável** — o caso raro
  e valioso: na Etapa 27, trocar o `INSERT` multi-linha por um laço **não derrubou nada**, porque
  a validação completa antes do claim de saldo tornou impossível uma linha falhar no meio. O
  executor provou a diferença com um `UNIQUE` artificial (laço deixa 1 medida órfã, multi-linha
  deixa 0), **manteve** a forma segura e **declarou que a suíte não a protege**. Fingir que o
  vermelho existe seria pior; remover a proteção porque "nada cai" seria muito pior.
- **Numa régua com folga, sabotar o OPERADOR é invisível — sabote a POSIÇÃO.** Aconteceu duas
  vezes na Etapa 27: trocar `<=` por `<` numa comparação com epsilon não derruba nada (nenhuma
  medida cai exatamente em `limite + 1e-6`), e tirar só o `WHERE ativo = 1` de um índice único
  parcial passa verde no cenário da duplicada. O que o teste ancora é **onde** a régua está, não
  o sinal que a escreve.
- **Leia QUAL asserção caiu, não só o placar.** Uma sabotagem que derruba o cenário certo pela
  asserção *errada* deixa a asserção que interessa sem prova nenhuma — e o placar vermelho faz
  parecer que está tudo coberto. Aconteceu **três vezes seguidas** nesta base, sempre com o
  controle positivo prescrito no plano: (1) as duas sabotagens do de/para de auditoria não
  tocavam o cenário do segredo, porque quem apaga o segredo é a comparação de igualdade e não a
  iteração; (2) trocar os `params` do fetch por `{}` derrubava o cenário pela primeira asserção
  (`data_inicio`), então a linha do `Array.isArray` — o ponto do achado — nunca rodava; (3) uma
  sabotagem de fiação passava porque o teste contava ocorrências do identificador em vez de
  travar a chamada literal. **Se a asserção que guarda o achado não caiu, o controle não valeu**:
  acrescente a sabotagem que a atinge, não troque por outra que funcione.
- **Teste que depende de fuso, relógio ou locale precisa declarar isso e falhar fora do
  ambiente esperado.** Um cenário de UTC-vs-local passa vazio numa máquina em UTC. Fixe
  `process.env.TZ` antes do primeiro `Date` e abra o cenário com uma guarda que **derrube** o
  teste no ambiente errado, em vez de deixá-lo verde provando nada.
- **Cenário que afirma ausência ("não mostra o aviso") passa com a tela vazia.** Todo cenário
  negativo precisa da metade positiva no mesmo teste — alguma coisa que **tem** de estar lá.
- **Asserção negativa sobre permissão não fica vermelha na rodada TDD** — e por isso o controle
  positivo é a **única** prova dela. Ao criar um perfil novo, o cenário "não pode `movimentar`"
  passa **verde antes de o perfil existir**, porque `can()` devolve `false` para o que não
  conhece. Quem tratar o controle positivo como formalidade entrega a lista negativa sem prova
  nenhuma — e a lista negativa é justamente a que importa, porque perfil que herda demais é pior
  que perfil nenhum. Sabote **concedendo** a permissão proibida e confirme que o cenário cai
  **nomeando a ação**.

---

## Commits

- Mensagem em **português**, corpo **sem acento** (o histórico é assim).
- Explique **por quê**: qual era o bug, qual a consequência, o que foi **decidido e descartado**.
- **Um commit por assunto.**
- **Hash de task executada em worktree só vale DEPOIS do cherry-pick.** O cherry-pick reescreve
  o hash, então o que o executor reportou existe apenas no reflog da máquina dele — num clone,
  `git show <aquele hash>` falha. Já aconteceu duas vezes (a revisão adversarial da Etapa 21
  pegou um; a Etapa 22 tinha quatro). Depois de integrar, confira cada hash citado com
  `git merge-base --is-ancestor <hash> HEAD` e corrija os órfãos.
- **Nunca `git add -A` na raiz** — há artefatos de runtime em `server/data/` e `server/uploads/`.
  Sempre `git add <caminhos explícitos>`.

---

## Antes de responder "terminei", releia esta lista

- [ ] A etapa está no `almoxarifado-novidades-por-etapa.md`, com Antes→Agora e cenários com
      mensagem literal?
- [ ] Tudo que exige **ação ou decisão do usuário** foi para o bloco `⚠️ Leia antes de apresentar`,
      na letra certa?
- [ ] Toda decisão que **você** tomou no lugar dele está escrita, com o descartado e o porquê?
- [ ] O README da feature tem checklist com **hash** por item, e explicação do que ficou de fora?
- [ ] Alguma spec estava errada? Foi corrigida **dizendo que estava errada**?
- [ ] O mapa de status e o guia do usuário foram atualizados, e o cabeçalho do guia mostra onde
      parou?
- [ ] O plano tem as tasks marcadas, as divergências registradas e a **próxima tarefa detalhada**?
- [ ] O **manual do sistema** recebeu o comportamento novo, **enxertado na seção temática** — sem
      número de etapa, sem menção a bug, com as regras e mensagens conferidas no código?
- [ ] As suítes foram **rodadas** e os números na resposta são os que você **leu**?
- [ ] `git status` limpo e tudo commitado?

Se algum item ficou não, **a etapa não está fechada** — termine antes de reportar.

---

## Passo 8 (obrigatório): emende na próxima etapa, no mesmo turno

**Fechar uma etapa não é o fim do trabalho — é o meio.** Este é o ponto exato em que se costuma
parar e devolver o turno ao André, e é o que ele pediu, com irritação, para não acontecer mais:
*"toda hora tenho que pedir pra vc continuar, nao quero que pare"*.

Depois de reportar o fechamento — **na mesma resposta, sem perguntar nada**:

1. **Escolha a próxima etapa**, nesta ordem: a "próxima tarefa detalhada" que você acabou de
   escrever no plano → o que o fechamento nomeou como "falta para 🟢" → o mapa
   `specs/modulo-almoxarifado/README.md` (a feature 🔴/🟡 de maior valor).
2. **Comece a Fase 0** da skill `desenvolver-etapa-almoxarifado`: medir no código **antes** de
   prometer. Uma sessão desta base já desenhou uma etapa inteira sobre a premissa "esta tela não
   existe" — a tela existia, estava no menu e no manual. Medir ausência exige procurar pelo nome
   do **contrato**, não pelo nome que você imagina que o consumidor usaria.
3. **Relate ao André** o que foi fechado **e** o que já começou. Um relatório que termina em
   "o que você quer que eu faça agora?" é um relatório mal terminado.

**Não termine o turno com uma pauta de perguntas.** Decisão ambígua → caminho reversível,
executado, registrado na letra B. Ele arbitra depois, lendo o documento.
