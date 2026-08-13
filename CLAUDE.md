# CRM GMP Industriais — instruções do projeto

Stack: Express + SQLite (`server/`) e React CRA (`client/`). Rodar tudo: `npm run dev` na raiz.

## Ao terminar qualquer etapa/tarefa, ATUALIZE A DOCUMENTAÇÃO antes de dizer que acabou

> **Use a skill `fechar-etapa`** (`.claude/skills/fechar-etapa/SKILL.md`) — ela é a versão
> executável desta seção, com o formato exato do documento de apresentação, as regras do harness
> de sabotagem e o checklist final. O usuário não quer ter de revisar isto toda vez.

Esta é a regra mais importante deste arquivo, porque já falhou: código foi entregue e as specs
continuaram dizendo que a feature não existia. Uma sessão nova (ou outra máquina) lê os
documentos primeiro e é **ativamente enganada** por eles.

Documentação desatualizada é trabalho não terminado. Antes de reportar conclusão:

1. **`specs/<modulo>/<feature>/README.md`** — status no topo e o checklist marcado item por
   item, cada `[x]` com o hash do commit. Se um item ficou de fora, diga **por quê** ali (não
   deixe desmarcado sem explicação, senão parece esquecimento).
2. **`specs/<modulo>/README.md`** — a linha da feature no mapa de status.
3. **O guia de usuário do módulo** (ex.: `docs/almoxarifado-guia-etapas-e-testes.md`) — seção
   da etapa em linguagem de usuário, tabela "Antes → Agora", roteiro de teste manual clicável,
   e o que a etapa **não** cobre.
4. **`docs/superpowers/plans/`** — plano da etapa com as tasks feitas marcadas e a **próxima
   tarefa detalhada** (contrato de API que ela consome, pontos de atenção). É o que permite
   retomar sem reler o código.
5. **Se a spec estava errada, corrija a spec e diga que estava errada.** Já aconteceu duas
   vezes: a feature 07 afirmava "consumo baixa reserva" quando `reserva_id` era só uma coluna.
   Apagar a afirmação errada em silêncio faz o próximo confiar nela de novo.

Onde o desenvolvimento parou tem de ficar óbvio no cabeçalho do guia do módulo.

## Testes — rode antes de commitar, e cite o resultado real

```
cd server && npm run test:api          # suíte principal (tests/api/*.api.test.js)
cd server && npm run test:almoxarifado # serviço do almoxarifado
cd server && npm run test:validation && npm run test:safealter && npm run test:sqlite
cd client && CI=true npx react-scripts test --watchAll=false
cd client && CI=true npx react-scripts build   # CI=true faz warning virar erro
```

Convenções dos testes: o runner descobre apenas `server/tests/api/*.api.test.js`; cada arquivo
tem runner próprio (`test()`, contador, `process.exit`). O harness é
`server/tests/helpers/testApp.js` e roda o `requirePermission` **real** — `setUser` com usuário
sem perfil retorna 403.

**Cuidado com teste vazio.** Já aconteceu três vezes nesta base: varredura com caminho errado e
`2>/dev/null` engolindo o erro; `grep -c` combinado com `wc -l`; e backup testado depois de
fechar a conexão SQLite (o checkpoint apaga o `-wal`, então o teste passava provando nada).
Quando um teste passa de primeira, desconfie e rode um **controle positivo** que prove que ele
sabe falhar.

## Autorização do almoxarifado — duas camadas

Acesso ao módulo (`checkModulePermission`) permite **abrir** as telas. Perfil
(`services/almoxarifado/permissions.js`, `ACAO_PERFIS` + `requirePermission`) permite **agir**.
`getPerfilFromUser` faz fallback para `PRODUCAO` — então usuário sem perfil não é "sem acesso",
é chão de fábrica. Quem decide é sempre o backend; `GET /almoxarifado/minhas-permissoes` existe
só para a UI barrar antes do formulário, e falha **aberto** de propósito.

## Regra de negócio: almoxarifado é área física, não filial

Os almoxarifados são áreas de alocação dentro do **mesmo site** — o cliente tem uma filial só.
Saldo global por material é **correto e intencional**. Não proponha segregar saldo por
almoxarifado nem seletor de almoxarifado em movimentação/requisição como se fosse pendência.

## Commits

Mensagem em português, sem acento no corpo (o histórico é assim). Explique **por que**, não só o
quê: qual era o bug, qual a consequência, e o que foi decidido e descartado. Um commit por
assunto. Não use `git add -A` na raiz — há artefatos de runtime em `server/data/` e
`server/uploads/` que não devem ser versionados.
