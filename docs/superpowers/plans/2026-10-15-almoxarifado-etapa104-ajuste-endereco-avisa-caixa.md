# Etapa 104 — o ajuste com endereço que leva a caixa passa a avisar (C186, B495)

> Status: **EM ANDAMENTO — 2026-10-15.** Worktree `CRM-wt-e104`, branch `etapa-e104` (de `main` `806a0e0c`).
> Origem: "Próxima tarefa detalhada — Etapa 104" no fim de
> `docs/superpowers/plans/2026-10-15-almoxarifado-etapa102-encerrar-com-caixa-recusa.md`; C186, B495.
> Design: `docs/superpowers/specs/2026-10-15-almoxarifado-etapa104-ajuste-endereco-avisa-caixa-design.md`.
>
> **Numeração** (conferida com `grep -o` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-15): última B **B703**,
> último C **208**, última A **A54**. A Etapa 105 (Compras) roda em paralelo e escreve só em `docs/compras-*`. Esta etapa:
> **B704–B709**, **C209–C210**, A55 se houver consulta.

## Fase 0 — medido (2026-10-15)

Sonda `server/tests/sonda/e104fase0.js` (não versionada). Tabela e respostas no design. Resumo:

- P1: AJUSTE com endereço A→0 sobre caixa sem reserva 4 → **201**, total 0; a entrega → 400 *"Máximo: 0"*.
- P5: o **estorno** desse ajuste (ADMIN, `ajustar_estoque`) → 200, total 4, a entrega → 200 *Entregue*.
- O teste da Etapa 10 (`ajusteRetencao` *"AJUSTE COM localizacao continua passando mesmo com retencao"*) prende um
  **corte de escopo** (D1/D7), não "a contagem é verdade física"; "a contagem redefine" é a decisão do cliente no
  comentário do motor (Etapa 6, round 3).
- A conferência de inventário grava `AJUSTE_INVENTARIO` **sem** endereço — já protegida (Etapa 97).
- Com reserva (P2) a caixa também é levada; a entrega diz "disponível negativo" (C209, declarado).
- **Erro do plano da 102** (ponto de atenção): *"o ajuste com endereço não pega a trava por material hoje"* — **estava
  errado**: desde a 97 (B494) `registrarMovimentacao` envolve o motor em `naTravaDoMaterial`.

## Regras de negócio

- **RN-01 — a contagem por endereço continua gravando.** `AJUSTE` (e `AJUSTE_INVENTARIO`) com `localizacao_destino_id`:
  a linha vira o contado e o total a soma das linhas, como sempre — nenhuma recusa nova. O teste da Etapa 10 não muda.
  *Cenário:* P1 → 201, total 0.
- **RN-02 — avisa quando o DISPONÍVEL fica abaixo da caixa sem reserva.** Depois do ajuste com endereço,
  `lerCaixa(material)` e o `disponivelSql` do material (físico − reservado − bloqueado − em inspeção − em terceiros: o
  mesmo que limita a entrega); se `caixa > disponível + 1e-9` (`!Q.cabe(caixa, disponível)`), a resposta ganha
  `aviso_caixa` = literal **A1** (o número mostrado é `max(0, disponível)`). Senão a chave **não vem**. Vale nos dois
  sentidos (o ajuste que sobe e continua abaixo também avisa). *Cenários:* P1 avisa; P3 B→0 (total 4 = caixa 4, sem
  retenção) não avisa; P3 A→1 avisa; P3 A→3 avisa; bloqueado 2 com total = caixa avisa com 2; a reserva 3 de outra
  requisição com total = caixa avisa com 1; sem caixa nunca avisa. *(Corrigido na Fase 2, achado 2: o plano dizia
  `caixa > total` — com bloqueado ou reserva de outra requisição a entrega ficava presa em "Máximo: 2" sem aviso.)*
- **RN-03 — só o ajuste com endereço.** Ajuste sem endereço já recusa (97); ENTRADA, SAIDA, TRANSFERENCIA: sem aviso.
- **RN-04 — o aviso nunca derruba o ajuste.** A leitura vem depois do livro, num `try/catch`; falhou → 201 sem aviso.
- **RN-05 — sem trava nova.** O motor já roda sob a trava do material; a caixa é lida dentro dela.
- **RN-06 — a tela mostra o aviso.** Em Movimentações, depois do *"Movimentação registrada!"*, `toast.warn(aviso_caixa,
  { autoClose: false })` com a literal do servidor; sem `aviso_caixa`, nada além do sucesso.
- **RN-07 — os dois caminhos que a A1 ensina funcionam.** (i) estornar o ajuste **que baixou** o estoque (perfil com
  `ajustar_estoque`: Administrador, Gestor; o almoxarife recebe 403) → o total volta e a entrega passa; (ii) devolver à
  prateleira o que se perdeu → a caixa some, um ajuste seguinte não avisa, e a requisição vazia sem entrega é cancelada por
  quem pediu (E2 da 101). *(Corrigido na Fase 2, achado 1: a A1 dizia "estorne este ajuste" — o ajuste que SOBE e
  continua abaixo também avisa, e o estorno dele reduz o total e é recusado pela guarda da 97.)*

## Contrato congelado

`server/services/almoxarifado/caixaSql.js` exporta, além do que já exporta:

```js
// a lista "a requisição X" / "as requisições X e Y" / "as requisições X, Y, Z e mais N" — a mesma do sufixoCaixa
function descreverRequisicoes(requisicoes) { ... }  // usada por sufixoCaixa (texto byte a byte o de hoje) e pelo aviso
// null se a caixa cabe no disponível (Q.cabe(caixa, disponivel)); senão a literal A1
function avisoCaixaDoAjuste({ caixa, requisicoes } = {}, disponivel, material) { ... }
```

**A1** (literal, `${…}` = `Q.qtd(...)` e `material.codigo` / `material.unidade`):

```
Ajuste gravado, mas o disponível de ${codigo} ficou em ${max(0, disponível)} ${unidade}, abaixo dos ${caixa} ${unidade} separados para ${lista}: a entrega fica limitada ao disponível. Se o material está na caixa, a contagem não o incluiu — estorne o ajuste que baixou o estoque (perfil Administrador ou Gestor do almoxarifado); se ele se perdeu, devolva-o à prateleira na requisição.
```

Motor (`stockService.registrarMovimentacaoSemTrava`): retorno `{ id, saldo_anterior, saldo_posterior }` e, só no ajuste
com endereço com aviso, `aviso_caixa: <A1>`. `POST /api/almoxarifado/movimentacoes/v2` devolve o retorno do motor (201)
— a chave chega sem mudar a rota. A v1 não aceita endereço (inalterada). Recusas: nenhuma nova.

Cliente (`MovimentacoesAlmoxarifado.js`): lê `resposta?.data?.aviso_caixa` (string não vazia; resposta sem `data` não quebra — Fase 2, achado 3) → `toast.warn(texto, { autoClose:
false })`.

## Fase 2 — revisão do plano (agente fresco, 2026-10-15) — 1 trava, 2 correções, notas

O revisor leu o código e rodou a sonda `server/tests/sonda/e104rv-1.js` (R1–R6, contra a T1 parcial que já estava no disco).

1. **(trava) A A1 mandava estornar um ajuste cujo estorno é recusado.** R1: A→0 (avisa), A→3 (sobe, ainda abaixo, avisa
   *"estorne este ajuste"*); estornar o A→3 → 400 da guarda da 97 (reduz o total abaixo da caixa); estornar o A→0 → 200,
   entrega 200. **Corrigido:** *"estorne o ajuste que baixou o estoque"*; teste J5 prende os dois estornos.
2. **(correção) A régua `caixa > total` deixava a entrega presa sem aviso** com retenção fora da caixa: R2 (bloqueado 2,
   A:6, caixa 4, A→4 → sem aviso, entrega *"Máximo: 2"*); R3 (reserva 3 de outra requisição, A:7, A→4 → sem aviso, entrega
   *"Máximo: 1"*). **Corrigido:** a régua é o `disponivelSql` do material depois do ajuste; a A1 diz "disponível".
3. **(correção) Cliente:** `api.post` sem guardar o retorno; ler `res.data` com `res` indefinido daria TypeError dentro do
   `try` e `toast.error` logo depois do sucesso. Já estava `resposta?.data?.aviso_caixa`; o teste cobre `undefined`.
4. **(nota)** `AJUSTE_INVENTARIO` com endereço não tem chamador (a v2 barra o tipo; a conferência grava sem endereço) — o
   "(e AJUSTE_INVENTARIO)" da RN-01 só é alcançável pelo serviço direto.
5. **(nota)** O retorno do motor: a v1 monta a resposta campo a campo; nenhum outro chamador chega ao ramo; nenhum
   `deepStrictEqual` do retorno em risco. `saldoPosterior` no ramo é o total relido depois do `syncMaterialTotals`.
6. **(nota)** Perfis conferidos (ALMOXARIFE estorna → 403, GESTOR → 200); a devolução vale em todo `STATUS_COM_CAIXA`;
   "na requisição" fica no singular com duas requisições e a A1 não diz quanto devolver (declarado, B706).
7. **(nota)** O fluxo até o fim funciona (R4 várias linhas e uma entrada no meio; R5 perdeu tudo → devolver → cancelar pelo
   solicitante; R6 entrega parcial → devolver 3 → encerrar 200).
8. **(nota)** T2 é independente (só a chave congelada).

## Tasks (sort topológico)

- [ ] **T1 (tronco) — o aviso no motor.** RN-01..RN-05. `caixaSql.js` (`descreverRequisicoes`, `avisoCaixaDoAjuste`),
  `stockService.js` (ramo do ajuste com endereço marca; aviso no fim, em `try/catch`). Teste novo
  `server/tests/api/ajusteEnderecoCaixa.api.test.js`: P1 (literal inteira, total 0, linha 0); P3 (B→0 sem chave; A→1
  com; A→3 com); sem caixa sem chave; o ajuste sem endereço segue recusando (M6); ENTRADA/TRANSFERENCIA sem chave; duas
  requisições na lista; pela função pura (`avisoCaixaDoAjuste` com caixa 0, igual, resto 1e-10, maior); `sufixoCaixa`
  byte a byte o de hoje; RN-04 (a leitura falha → 201 sem chave, por stub de `caixaSql.lerCaixa`). Controle positivo:
  sabotar a régua (`>=`→ sempre), o ramo (sem endereço também), o `try/catch`.
- [ ] **T2 (galho, depois da T1) — a tela.** RN-06. `MovimentacoesAlmoxarifado.js`; teste novo
  `client/src/components/almoxarifado/MovimentacoesAvisoCaixa.test.js`: com `aviso_caixa` → `toast.success` e
  `toast.warn(literal, { autoClose: false })`; sem → só o sucesso; `aviso_caixa` vazio/não texto → nada. Controle:
  sabotar o `toast.warn`.
- [ ] **T3 (integração, depois de T1–T2) — o documento até o fim, pela rota E pelo serviço.**
  `server/tests/api/ajusteEnderecoCaixaIntegracao.api.test.js`: (J1) pela rota, ALMOXARIFE conta A→0 → 201 com A1;
  entrega → "Máximo: 0"; ALMOXARIFE estorna → 403 (perfil); ADMIN estorna → 200; entrega 4 → 200 *Entregue*. (J2) pelo
  serviço (`registrarMovimentacao`) o mesmo aviso no retorno; devolver à prateleira 4 → a caixa some → um novo ajuste
  com endereço não traz a chave. (J3) o teste da Etapa 10 intacto (ajuste com endereço abaixo do reservado passa, sem
  aviso: não há caixa).
- [ ] **T4 — Fase 5 e fechamento.**

## Próxima tarefa detalhada — Etapa 106

*(preenchida no fechamento.)*
