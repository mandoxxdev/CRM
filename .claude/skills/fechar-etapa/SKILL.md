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

## Os 6 artefatos. Nenhum é opcional.

Crie uma tarefa por item e complete em ordem.

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

- **`python` não existe nesta máquina.** Heredoc de python vira no-op silencioso.
- Conte a âncora antes de aplicar `sed`: `grep -cF '<ancora>' arquivo` **tem de dar exatamente 1**.
  Se der 0 ou mais de 1, **aborte** — já houve sabotagem aplicada na tabela errada por casar a 1ª
  de 4 ocorrências.
- `md5sum` **antes**, **depois da sabotagem** e **depois de restaurar**; `git diff --stat` tem de
  voltar vazio. Só o md5 pegou uma sabotagem que não fez nada.
- **Sabotagem que não derruba nenhum teste é um achado**, não um detalhe: diga qual asserção falta.

---

## Commits

- Mensagem em **português**, corpo **sem acento** (o histórico é assim).
- Explique **por quê**: qual era o bug, qual a consequência, o que foi **decidido e descartado**.
- **Um commit por assunto.**
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
- [ ] As suítes foram **rodadas** e os números na resposta são os que você **leu**?
- [ ] `git status` limpo e tudo commitado?

Se algum item ficou não, **a etapa não está fechada** — termine antes de reportar.
