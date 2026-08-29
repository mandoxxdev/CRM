---
name: desenvolver-etapa-almoxarifado
description: Use ao iniciar o desenvolvimento de qualquer etapa, feature nova ou SDD de correção do CRM (especialmente do módulo almoxarifado) — antes de escrever qualquer plano ou código. Use também quando o usuário pedir "começa a etapa X", "desenvolve a feature Y", deixar specs para executar em background ou de madrugada, ou quando houver dúvida sobre quais tasks podem ir para agentes em paralelo.
---

# Desenvolver etapa — o contrato de execução deste projeto

Este é o espelho da skill `fechar-etapa`: aquela garante que o **fim** da etapa não pula passo;
esta garante que o **começo e o meio** não pulam. O usuário roda etapas em background, às vezes
de madrugada, e é o único responsável pelo projeto — o fluxo não pode travar esperando ninguém
e não pode entregar nada que não esteja **medido como verde**.

**Anuncie ao começar:** "Usando a skill `desenvolver-etapa-almoxarifado` para conduzir a etapa."

Crie uma tarefa por fase abaixo e execute em ordem.

---

## Fase 0 — Ler antes de escrever qualquer coisa

1. A spec da feature: `specs/modulo-almoxarifado/<NN-feature>/README.md` (e o mapa em
   `specs/modulo-almoxarifado/README.md` para saber o estado das vizinhas).
2. O plano da etapa anterior em `docs/superpowers/plans/` — a seção "próxima tarefa detalhada"
   existe para isto: retomar sem reler o código.
3. As regras inegociáveis (estão no CLAUDE.md, mas releia): autorização em **duas camadas**
   (módulo abre tela, perfil autoriza ação; fallback é `PRODUCAO`, backend decide);
   **almoxarifado é área física, não filial** (saldo global é intencional — não "corrija");
   testes descobertos só em `server/tests/api/*.api.test.js`, harness `testApp.js` com
   `requirePermission` real.

**Se a spec contradiz o código existente, pare e registre** — spec errada já enganou sessões
inteiras aqui. A correção da spec faz parte da etapa (regra 5 do CLAUDE.md).

**E o inverso também: ANTES de medir "o que existe / o que falta / em quantos lugares está",
leia o que a spec já mediu.** Duas etapas seguidas desenharam sobre varredura minha que estava
errada: na 24 afirmei que uma tela não existia (existia, estava no menu e no manual) porque
procurei pelo nome que **imaginei** que o consumidor usaria em vez do nome do **contrato**; na
26 contei "3 arquivos" e nomeei dois, deixando o terceiro de fora — enquanto a
`specs/.../01-cadastros-materiais/README.md:52` **já nomeava os três**, corretamente, e dizia
"mexe em três telas". Medir é obrigatório; medir **sem cruzar com a spec** é refazer, pior, um
trabalho que já estava feito. Quando os dois discordarem, isso é um achado — investigue qual
está errado em vez de escolher o seu.

## Fase 1 — Pensar: design e plano (o pensador, sequencial)

Use `superpowers:brainstorming` e depois `superpowers:writing-plans`. Convenção de nomes:

- Design: `docs/superpowers/specs/<AAAA-MM-DD>-almoxarifado-etapaN-<tema>-design.md`
- Plano: `docs/superpowers/plans/<AAAA-MM-DD>-almoxarifado-etapaN-<tema>.md`

O plano desta base **tem de conter**, além das tasks:

1. **Regras de negócio numeradas (`RN-xx`)** — cada regra com ID, enunciado e cenário. O mesmo
   ID aparece depois no nome do teste que a prova e na frase do manual do sistema que a
   descreve. Quando o P.O. mudar uma regra, `grep RN-xx` acha os três lugares — a SDD de
   correção começa editando spec + teste, nunca o código primeiro.
2. **Contratos de API congelados** — por endpoint: método, payload, resposta, códigos de erro
   e **mensagem literal** de cada recusa. É o que permite front e back andarem em paralelo.
3. **Sort topológico das tasks**: cada task marcada como **`tronco`** ou **`galho`** (critério
   na Fase 3).
4. **Pelo menos uma task de teste de integração que cruza galhos** — um fluxo que passa por
   mais de uma rota nova (ex.: criar → consumir → conferir saldo). Verde por unidade não prova
   que as partes compõem.
   **Onde a feature depende de FIAÇÃO — middleware, ordem de registro, herança de contexto —, o
   cenário de integração é a única prova que existe.** Na Etapa 25 o plano mandava pendurar a
   origem da requisição num `app.use` do prefixo; como `req.user` é **reatribuído** pelo `auth`
   que cada rota redeclara, a origem era jogada fora. Placar dessa forma: **12 cenários de
   unidade verdes e 4 de integração vermelhos** — a feature morta com a suíte de unidade inteira
   passando. Quando existirem os dois caminhos, exija no plano um cenário que entre **pela rota**
   e outro que entre **pelo serviço**.

## Fase 2 — Revisar o plano ANTES de executar

O plano é o ponto único de falha do fluxo: contrato congelado errado faz todos os galhos
construírem em cima do erro em paralelo. Nesta base, cinco tasks seguidas já acharam defeito em
código que o plano trazia pronto.

Despache **um agente fresco** (sem o contexto de quem escreveu) com o plano + a spec e três
perguntas: os contratos cobrem os casos de erro e as mensagens literais? As RN batem com a
spec? Cada `galho` é independente de verdade (critério da Fase 3)? Corrija o plano antes de
executar. Uma passada só — isto é seguro barato, não um loop.

## Fase 3 — Executar: tronco sequencial, galhos paralelos

**Critério de independência (decide tronco vs galho):** se um erro de interpretação num agente
exigiria retrabalho no outro, **não é independente**. Na prática:

| A task... | Classificação |
|---|---|
| muda o motor de estoque, migration, `ACAO_PERFIS`, ou qualquer regra compartilhada | **tronco** — sequencial, vai primeiro |
| só **consome** motor/serviço que já existe, testado e estável | **galho** — paralelizável |
| é tela do front contra contrato congelado no plano | **galho** — paralelizável |

Regras de execução:

- **Tronco primeiro, em ordem, um executor por task** (`superpowers:subagent-driven-development`).
  O tronco *é* o congelamento do contrato interno da etapa.
- **Galhos de backend em paralelo só em worktrees isoladas** (`superpowers:using-git-worktrees`)
  — os testes batem num SQLite só; dois executores na mesma árvore corrompem a suíte um do outro.
- **Arquivo de scratchpad precisa de nome único por agente.** O diretório é compartilhado entre
  os agentes em paralelo: na Etapa 25 dois executores usaram `msg.txt` para a mensagem de commit
  e um sobrescreveu o do outro. Não custou nada daquela vez porque o commit já tinha saído, mas
  o modo de falha é um agente commitar com a mensagem do outro. Use `msg-<assunto>.txt`.
- **Galho testa contra o motor REAL, nunca contra mock do motor.** Mock entre rotas
  institucionaliza divergência: cada agente escreve o mock refletindo a própria suposição e as
  duas suítes passam provando coisas incompatíveis. Mock de JSON é legítimo **só na fronteira
  HTTP** (front contra contrato), porque ali a fronteira existe de verdade e foi combinada.
- **Cada task**: TDD (`superpowers:test-driven-development`) com **controle positivo** — teste
  novo que passa de primeira é suspeito nesta base (quatro casos de teste vazio documentados na
  `fechar-etapa`); quebre a implementação de propósito e confirme o vermelho.
- **Ao terminar cada task, marque o plano** com o estado real (feita, hash quando houver,
  divergência do previsto). É a trilha retomável: se o processo morrer às 3h, a sessão da manhã
  retoma do plano, não da arqueologia.

## Fase 4 — Integração serial

Merge das worktrees na branch da etapa, **suíte completa** (os cinco comandos da `fechar-etapa`)
rodando serial, e a task de integração cruzando galhos. Conflito semântico descoberto aqui —
duas rotas interpretando a mesma RN de jeitos diferentes — é achado de plano, não só de código:
registre no plano o que a Fase 2 deixou passar.

## Fase 5 — Revisão adversarial do código

Revisores **frescos** em paralelo, lentes distintas (correção da RN, autorização/perfil,
"este teste passaria com a feature quebrada?"), instruídos a **refutar**. Duas regras que
protegem o loop:

- **Achado só vale com cenário concreto de falha** ("com input X e estado Y, sai Z errado") e
  só vira correção depois de **reproduzido**. Crítica de estilo e "eu faria diferente" não
  entram no loop.
- **Detector de esteira:** o critério de saída é "tudo verde, medido" — sem limite de rodadas —
  **exceto** se o *mesmo* teste falhar em **3 rodadas** de correção seguidas: pare e reporte
  com precisão onde travou, em vez de continuar se debatendo sem ninguém olhando.

## Regras de overnight (valem em todas as fases)

- **Nunca espere input.** Decisão ambígua → escolha o caminho **reversível**, registre a decisão
  e a alternativa descartada na **letra B** do bloco `⚠️ Leia antes de apresentar`
  (`docs/almoxarifado-novidades-por-etapa.md`). De manhã o usuário arbitra.
- **Nada de pergunta no meio do fluxo** — a pergunta vira registro escrito + caminho reversível.
- Falhou de forma irrecuperável? **Pare com relatório preciso no plano** (o que rodou, o que
  falta, por que parou). Parar legível vale mais que insistir ilegível.

## Fase 6 — Fechar e medir

1. Use a skill **`fechar-etapa`** inteira (os 7 artefatos + verificação medida).
2. **Retro de 4 números**, registrada no fim do plano da etapa — é o que permite melhorar este
   fluxo com evidência em vez de impressão:
   - rodadas de correção até verde;
   - achados da revisão: quantos reais vs. ruído (não reproduzidos);
   - paralelismo: quantos galhos rodaram em paralelo de fato, e se algum causou retrabalho;
   - defeito que escapou (descoberto depois do fechamento — preencher na etapa seguinte).

## Red flags — pare e releia a fase correspondente

- "Essas duas rotas são independentes, são arquivos diferentes" → independência é de **regra**,
  não de arquivo (Fase 3).
- "Vou mockar o motor só pra andar em paralelo" → proibido; mock só na fronteira HTTP.
- "O teste passou de primeira, ótimo" → controle positivo antes de comemorar.
- "Vou perguntar pro usuário e esperar" (de madrugada) → decisão reversível + registro na letra B.
- "Mais uma rodada de correção e vai" (4ª rodada do mesmo teste) → pare e reporte.
- "O plano está obviamente certo, não precisa revisar" → cinco tasks seguidas já provaram que não.
