# Etapa 222 — o extrato do material diz quanto está em lote impedido (C481, 1ª parte)

> Usando a skill `desenvolver-etapa`. Ponto de partida: a "Próxima tarefa detalhada" de
> `docs/superpowers/plans/2026-11-13-almoxarifado-etapa221-reserva-manual-lote-impedido.md` (`:228-246`). Estimativa já commitada:
> `docs/estimativas/2026-11/estimativa_2026-11-13_almoxarifado-extrato-lote-impedido.txt` (**3h**, `75f8201d`). Números de linha
> medidos sobre `f06103e8`. A Fase 0.0 (`controle-horas`) não rodou: o pedido desta etapa mandou executá-la inteira (e pular o Passo 7½).

## Objetivo (em linguagem simples)

Desde a Etapa 205 a aprovação, a separação, a entrega e (desde a 221) a reserva manual não deixam sair peça de lote **bloqueado**
(sem certificado), **reprovado** ou **vencido**. Mas as telas de saldo ainda mostram essas peças dentro do *Disponível*, sem dizer que
estão presas (**C481**): o almoxarife vê 10 disponíveis, tenta reservar 5 e o sistema recusa porque 6 estão num lote bloqueado. Depois
desta etapa, o **extrato do material** (aberto de Materiais, Movimentações, Sobras e Reservas) mostra um cartão *"Em lote impedido"* com
a quantidade e uma frase explicando, e o formulário **Nova Reserva** troca o aviso genérico da 221 pelo número do material escolhido. O
*Disponível* continua o mesmo número de sempre (as portas que reservam/saem já descontam por conta própria).

## Fase 0 — medido em 2026-11-13 (sobre `f06103e8`)

1. **A rota**: `GET /api/almoxarifado/materiais/:id/extrato` (`routes/almoxarifado/extended.js:1050-1071`) — `auth` só (o portão do
   módulo é o do prefixo; leitura). Lê o material com `SELECT m.*, disponivelSql('m') as quantidade_disponivel, …` por id (não filtra o
   dono, Etapa 8) e devolve `{ material, saldos_localizacao, movimentacoes, reservas }`. Sem serviço: a SQL mora na rota.
2. **A régua pronta**: `loteImpedido.loteImpedidoSql(m, hojeISO = diaLocal.hojeLocalISO())` (205 + 217) — `CASE WHEN controle_lote = 1
   THEN … ELSE 0 END`, arredondado por `Q.qtdSql`, uma passada pelos lotes do material (`lotesComRetidoSql`). Já é usada pela aprovação
   (`saldoDisponivelParaItem`), separação, fila, detalhe e (221) pela reserva manual. A frase `fraseLoteImpedido(n, unidade)` é da recusa.
3. **O modal**: `client/src/components/almoxarifado/ExtratoMaterialModal.js` — cartões `almox-kpi-card` (`:139-185`: Físico, Reservado,
   Bloqueado, Em inspeção, Disponível, Custo médio, Séries em estoque condicional). Aberto por `MateriaisAlmoxarifado`,
   `MovimentacoesAlmoxarifado`, `SobrasAlmoxarifado`, `ReservasAlmoxarifado`. Teste: `ExtratoMaterialModal.test.js` (o selo, Etapa 8).
4. **O formulário**: `ReservasAlmoxarifado.js:511-522` — *"Disponível: ⟨n⟩ ⟨un⟩"* e, com `controle_lote === 1`, o aviso fixo
   `AVISO_LOTE_IMPEDIDO_RESERVA` (B1472). Os materiais vêm de `/estoque` (`consultarEstoque`, todos os materiais ativos). Testes
   RN-221.10/.10 b/.11 em `ReservasAlmoxarifado.test.js:542-596` — o mock devolve `{ data: [] }` para URL desconhecida.
5. **`/estoque` fica fora**: a régua faz uma passada pelos lotes **por material**, com subconsultas por lote (saldo, inspeção, livro,
   reprovação, terceiros); na lista inteira seria uma passada por material com controle de lote a cada abertura de Materiais/Estoque/
   Reservas. Medir isso é a 2ª parte do C481.
6. **Trava**: só leitura, sem trava (como o resto do extrato). O número pode estar um instante velho — é exibição; quem reserva/sai relê sob
   a trava.

## Caminhos

- **(escolhido) Campo aditivo `lote_impedido` no material do extrato** (uma coluna a mais no mesmo `SELECT`), cartão no modal só quando
  `> 0`, e o formulário lendo o número do extrato do material escolhido. Reverter = tirar a coluna, o cartão e a chamada.
- **(descartado) O *Disponível* já descontado.** Mudaria o número de todas as telas e dos relatórios que somam o disponível; e o
  disponível descontado não bate com o que a separação mostra para requisição com caixa. A próxima tarefa da 221 mandou não mudar.
- **(descartado) Levar o campo ao `/estoque` agora.** Custo não medido (item 5).
- **(descartado) Rota nova só para o número.** Contrato novo para uma leitura que o extrato já faz; o extrato é um material só por chamada.

## Decisões (letra B — reversíveis; livres depois de **B1475**, **C526**, **A116**, conferido por `grep` em `docs` e `specs`)

- **B1476 — o extrato devolve `material.lote_impedido`** = `loteImpedidoSql('m')` com o "hoje" de Brasília (o padrão da régua), no mesmo
  `SELECT` do material; 0 em material sem controle de lote. Aditivo: nenhum campo some nem muda. Descartado: calcular no cliente (segunda
  fonte de verdade).
- **B1477 — o modal mostra um cartão *"Em lote impedido"* e uma frase, só quando `lote_impedido > 0`**: o cartão (ícone de alerta,
  cor de atenção — **não** o cadeado vermelho do *Bloqueado*, Fase 2 I3) com o número; abaixo dos cartões, a frase *"⟨n⟩ ⟨un⟩ em lote
  bloqueado, reprovado ou vencido, fora o que já aparece em Bloqueado: essas peças não saem para uso até o lote ser liberado na tela Lotes e
  Séries."*. Com 0 (ou campo ausente — servidor antigo), nada muda na tela. Descartado: *"o Disponível ainda conta essas peças"* (a 1ª
  versão do plano) e *"⟨n⟩ do disponível"* — o impedido pode passar do disponível (reserva da OS sobre o lote bloqueado, B1381; reserva de
  antes do bloqueio, B1471), e a frase ficaria falsa (Fase 2 I1); *"não saem do estoque"* — o vencido ainda sai como sucata ou perda (Fase
  2 M3). "Fora o Bloqueado": a régua já tira a quantidade bloqueada, os dois cartões não se somam.
- **B1478 — o formulário Nova Reserva troca o aviso fixo pelo número**: escolhido um material com controle de lote, a tela busca o extrato
  dele; com `lote_impedido > 0` mostra *"⟨n⟩ ⟨un⟩ deste material estão em lote bloqueado, reprovado ou vencido e não entram na reserva."*;
  com 0, nada; enquanto busca ou se a busca falhar (ou não trouxer o campo), o aviso fixo da 221 (B1472) — nunca menos do que hoje. A
  resposta de um material que deixou de ser o escolhido é ignorada. Descartado: só o aviso fixo (a próxima tarefa da 221 pedia o número);
  `/estoque?material_id=` (o campo não está no `/estoque`). Custo (Fase 2): a escolha do material busca o extrato inteiro (até 100
  movimentos, reservas e saldos por endereço) — aceitável para um material; a régua mediu 0,6 a 1,5 ms por material no banco de
  desenvolvimento.
- **C527 (aviso, Fase 2 I2) — o número do formulário e o da recusa podem diferir.** Com reserva do sistema (a da OS, B1381) sobre o lote
  bloqueado, o impedido passa do livre: L1 5 + L2 BLOQUEADO 10 + reserva da OS de 8 → o extrato e o formulário dizem 10; a reserva manual
  recusa com *"Saldo disponível insuficiente: 0. Não entram 7 un …"* (o corte, B1470). Os dois são verdadeiros (10 estão no lote; o lote
  cortou 7 do que a reserva podia levar). Fixado pela RN-222.06 b.
- **C528 (aviso, Fase 2 M4) — a tela não diz qual lote está impedido.** A frase aponta para *Lotes e Séries*; listar os lotes no extrato
  (status e validade na tabela *Saldos por localização*) fica para a 2ª parte do C481.
- **B1479 — sem migration, sem trava, sem perfil novo, sem rota nova.** O extrato continua aberto a quem abre o módulo (`auth` + portão do
  prefixo); o número não é dado sensível (é saldo, que o extrato já mostra).

## Regras de negócio (RN-222.xx)

| RN | Enunciado | Cenário |
|---|---|---|
| RN-222.01 | O extrato diz quanto está em lote BLOQUEADO; o Disponível não muda | material `un` com controle de lote, L1 ATIVO 4 + L2 BLOQUEADO 6: `GET /materiais/:id/extrato` → `material.lote_impedido === 6`, `material.quantidade_disponivel === 10` |
| RN-222.02 | REPROVADO e vencido também; vencido liberado e o que vence hoje não | (a) L2 REPROVADO → 6; (b) L2 ATIVO validade ontem → 6; (c) (b) + `PUT /lotes/L2/liberar-vencimento` → 0; (d) L2 validade hoje → 0 |
| RN-222.03 | Material sem controle de lote → 0 | lote BLOQUEADO 6 com `controle_lote = 0` → `lote_impedido === 0` |
| RN-222.04 | Sem lote impedido → 0 | só L1 ATIVO 4 → 0; material sem nenhum lote nem saldo → 0 |
| RN-222.05 | O número é a régua da aprovação (`loteImpedidoSql`), não outra conta | para cada material dos cenários acima e um com parte bloqueada no material sem lote conhecido (`quantidade_bloqueada = 2` → a régua supõe dentro do lote impedido: 4), `lote_impedido` == `SELECT loteImpedidoSql('m') FROM materiais_almoxarifado m WHERE id = ?` |
| RN-222.06 | Integração: quando o livre cobre o impedido, o extrato e a recusa da reserva manual dizem o mesmo número; liberar o lote zera | L1 ATIVO 4 + L2 BLOQUEADO 6: extrato 6; `POST /reservas` de 5 → 400 `Saldo disponível insuficiente: 4. Não entram 6 un em lote bloqueado, reprovado ou vencido.`; `PUT /lotes/L2/status ATIVO` → extrato 0; reserva de 5 → 201 |
| RN-222.06 b | (Fase 2, C527) Com reserva do sistema sobre o lote bloqueado a recusa diz o corte, menor que o extrato | L1 5 + L2 BLOQUEADO 10 + reserva do sistema de 8: extrato 10, disponível 7; reserva manual de 1 → `Saldo disponível insuficiente: 0. Não entram 7 un em lote bloqueado, reprovado ou vencido.` |
| RN-222.11 | (Fase 2, I1) Impedido maior que o Disponível: os dois números, a frase não diz que o Disponível o contém | servidor: o cenário da .06 b → `lote_impedido 10` = a régua; tela: `quantidade_disponivel 2`, `lote_impedido 10` → cartões 2 e 10, a frase sem "o Disponível ainda conta" |
| RN-222.07 | Material de cliente: o campo vem | material com `proprietario_cliente_id` e L2 BLOQUEADO 6 → `lote_impedido === 6` (o extrato não filtra o dono) |
| RN-222.08 | O modal mostra o cartão e a frase só com número | `lote_impedido: 6`, `unidade: 'PC'` → cartão `Em lote impedido` (ícone `warning`, não o `danger` do Bloqueado) com `6` e a frase literal `6 PC em lote bloqueado, reprovado ou vencido, fora o que já aparece em Bloqueado: essas peças não saem para uso até o lote ser liberado na tela Lotes e Séries.`; o cartão Disponível continua com o `quantidade_disponivel`; `lote_impedido: 0` ou ausente → nem cartão nem frase |
| RN-222.09 | O formulário mostra o número do material escolhido | `controle_lote: 1`, extrato `lote_impedido: 6` → `6 PC deste material estão em lote bloqueado, reprovado ou vencido e não entram na reserva.` e não o aviso fixo; `lote_impedido: 0` → nem número nem aviso fixo; extrato com erro → o aviso fixo da 221; `controle_lote: 0` → não busca o extrato, nada aparece |
| RN-222.10 | O formulário ignora a resposta de um material que deixou de ser o escolhido | escolher A (extrato lento, 6), depois B (extrato 2); A responde depois de B → aparece o número de B (2), não o de A |

## Contratos congelados

**`GET /api/almoxarifado/materiais/:id/extrato`** — sem payload. Resposta 200 igual à de hoje, com **um campo a mais** em `material`:
`lote_impedido` (número ≥ 0, arredondado a 1e-6; 0 sem controle de lote). Erros iguais: 404 `{ error: 'Material não encontrado' }`, 500
pelo `handleError`. Sem mudança de autorização.

**Tela — literais novos**:
- cartão do extrato: rótulo `Em lote impedido` (classe `almox-extrato-lote-impedido` no cartão);
- frase do extrato: `${n} ${unidade} em lote bloqueado, reprovado ou vencido, fora o que já aparece em Bloqueado: essas peças não saem para
  uso até o lote ser liberado na tela Lotes e Séries.` (sem unidade: sem o espaço);
- formulário: `${n} ${unidade} deste material estão em lote bloqueado, reprovado ou vencido e não entram na reserva.` (classe
  `almox-reserva-aviso-lote`, a mesma da 221; sem unidade: sem o espaço);
- o aviso fixo da 221 (`Peças em lote bloqueado, reprovado ou vencido não entram na reserva.`) continua como fallback.

Campo ausente, nulo ou não numérico (`Number.isFinite` falso) = desconhecido → o aviso fixo (Fase 2 M2). O número aparece como o servidor mandou (`Number(n)`, sem formatação local — o extrato já mostra os outros cartões assim).

## Tasks (sort topológico)

- [x] **T1 (tronco)** — rota do extrato com `loteImpedidoSql('m') as lote_impedido`. Testes RN-222.01 a .07 em
  `server/tests/api/extratoLoteImpedido.api.test.js` — `6224f8d1` (RN-222.11/.06 b da Fase 2 no commit da Fase 2).
- [x] **T2 (galho, consome o contrato)** — `ExtratoMaterialModal`: o cartão e a frase (RN-222.08), testes em `ExtratoMaterialModal.test.js` — `7ee7530a`.
- [x] **T3 (galho, consome o contrato)** — `ReservasAlmoxarifado`: o número no formulário (RN-222.09, .10), testes em
  `ReservasAlmoxarifado.test.js` (RN-221.10/.10 b continuam verdes: o mock delas não traz o extrato → fallback) — `52cc0035`.
- [x] **T4 (integração)** — RN-222.06 pela rota (extrato → reserva recusada com o mesmo número → liberar o lote → extrato 0 → reserva), no
  arquivo da T1 — `6224f8d1`.
- [x] **T5 (Fase 5, não estava no plano)** — as 2 lacunas de unidade (RN-222.08 b, RN-222.09 b) — `7cd9920e`.

T2 e T3 são pequenas e no mesmo diretório do cliente: feitas em sequência pelo mesmo executor, não em paralelo.

## Sabotagens previstas (controle positivo)

1. sem a coluna (campo ausente) → RN-222.01..07; 2. `lote_impedido` com o "hoje" +1 dia → RN-222.02 d; 3. outra conta (só os lotes com
status ≠ ATIVO, sem o vencido) → RN-222.02 b, .05; 4. sem o `CASE controle_lote` (conta sempre) → RN-222.03; 5. Disponível descontado
(`disponivel − impedido`) → RN-222.01; 6. modal sem a guarda `> 0` → RN-222.08 (o "nem cartão"); 7. formulário sem o fallback → RN-222.09
(o erro); 8. formulário sem a guarda de material escolhido → RN-222.10; 9. formulário mostra o aviso fixo também com número → RN-222.09.

## Fase 2 — revisão do plano (1 revisor fresco)

Sem trava. **3 importantes, todos aceitos:** (I1) a frase *"o Disponível ainda conta essas peças"* fica falsa quando o impedido passa do
disponível (reserva da OS sobre o lote bloqueado) → frase nova + **RN-222.11**; (I2) a recusa da reserva diz o **corte** (`min(impedido,
base)`), não o número do extrato → RN-222.06 restrita a "quando o livre cobre", **RN-222.06 b** e **C527**; (I3) o cartão novo com o mesmo
cadeado vermelho do *Bloqueado* parece uma cópia dele → ícone de alerta, cor de atenção, "fora o que já aparece em Bloqueado" na frase.
**4 menores, aceitos:** a regra "sem unidade, sem espaço" também no formulário; campo não numérico = desconhecido (aviso fixo); *"não saem
do estoque"* → *"não saem para uso"* (o vencido sai como sucata/perda); a tela não diz qual lote → a frase aponta *Lotes e Séries* e
**C528**. Confirmado por sonda: a régua custa 0,6–1,5 ms por material no banco de desenvolvimento; nenhum teste do servidor compara o
conjunto de chaves do `material` do extrato; os mocks do cliente sem `controle_lote` não disparam a busca nova.

## Execução e controles (medidos)

`extratoLoteImpedido.api.test.js`: vermelho antes da T1 **1 passou, 11 falhou** (o verde é o 404 de contrato); **12/12** em `6224f8d1`;
**13/13** com a RN-222.11/.06 b. Tela: `ExtratoMaterialModal.test.js` vermelho **2 falhou, 5 passou** (o verde é o "nem cartão" com 0) →
**9/9**; `ReservasAlmoxarifado.test.js` vermelho **3 falhou, 37 passou** (os verdes novos são os do aviso fixo, que é o comportamento da 221)
→ **40/40**.

| # | Sabotagem | Caiu |
|---|---|---|
| 2 | "hoje" + 1 dia no extrato | RN-222.02 d, .05 b |
| 3 | outra conta (só status ≠ ATIVO, sem vencido) | RN-222.02 b, .05, .05 b |
| 4 | sem o `CASE controle_lote` | RN-222.03 |
| 5 | Disponível descontado | RN-222.01 |
| 6 | modal sem a guarda `> 0` | RN-222.08 (4 testes, inclusive o "nem cartão") |
| 7 | formulário sem o fallback | RN-222.09 (falhou, sem campo, buscando) e RN-221.10/.10 b |
| 8 | formulário sem o `vivo` (resposta velha grava) | RN-222.10 |
| 9 | aviso fixo também com número | RN-222.09 (número e zero), .10 |
| 10 | a frase antiga ("o Disponível ainda conta") | RN-222.08, .11 |
| 11 | o cartão com o cadeado do Bloqueado | RN-222.08 (o ícone) |
| 12 | a frase do extrato com a unidade fixa (Fase 5) | RN-222.08 b |
| 13 | a frase do formulário com a unidade fixa (Fase 5) | RN-222.09 b |
| 8b | ler o valor sem conferir o material (`impedidoDoForm.valor`) | **sobrevive — equivalente**: o efeito zera o valor antes de qualquer leitura observável; o único efeito é um quadro pintado antes do efeito rodar. A guarda fica. |

Restauro conferido por igualdade de conteúdo depois de cada rodada.

## Fase 5 — revisão adversarial (2 revisores frescos em paralelo: regra/tela/autorização e "o teste passaria com a feature quebrada?")

Proibidos de editar o repositório; sondas `e222-rev-regra-*.js` no scratchpad; o de testes mutou uma worktree própria (11 mutações, junções de
`node_modules` removidas com `rmdir`, worktree removida).

1. **[REGRA/TELA/AUTORIZAÇÃO] nada reproduzido como defeito.** A sonda leu o extrato e tentou reservar `disponível − lote_impedido` e
   `+ 0,01` em 5 estados (fracionado 3,3/2,2; vencido ontem/hoje; vencido liberado; material inativo; reserva da OS sobre o bloqueado): a
   fronteira bate com a reserva em todos. Usuário sem perfil (cai em PRODUCAO) lê o extrato com o campo (200) — o mesmo portão de `GET
   /reservas`; o número é soma de lotes que **Lotes e Séries** já mostra. Notas (não achados): com a reserva da OS sobre o bloqueado e o
   impedido ≥ disponível, o formulário não diz com todas as letras "nada pode ser reservado" (a recusa diz) → **D (222)** (4); com o formulário
   aberto o número não se atualiza → **D (222)** (5); a frase fala em *peças* também para KG → **D (222)** (6).
2. **[TESTE, real, menor] 2 lacunas de unidade** (mutações sobreviventes R4, M1): a frase do formulário e a do extrato com `${n} ${unidade}`
   fixo passariam — material com `unidade` nula (a coluna aceita) leria *"6 null …"*. → **RN-222.08 b** e **RN-222.09 b**; sabotagens 12 e 13
   caem. Equivalentes (o servidor sempre manda número; o reset do efeito esconde a diferença): sem `showForm` em `idComLote`, sem `n != null`,
   sem `Number.isFinite`, dependência `[materialSelecionado?.id]`, sem o reset `{ valor: null }`, sem a conferência do material (8b), sem
   `Number()` no modal. Mortos: sem o `catch` da busca, `Math.round` no modal.

Sem trava nova nem ordem de trava: tudo é leitura.

## Divergências do plano

- **RN-222.06 b, .08 b, .09 b, .11** e as frases novas da B1477 (Fase 2) não existiam na 1ª versão do plano.
- A T2 e a T3 foram feitas em sequência pelo mesmo executor (pequenas), não em paralelo.

## Retro (4 números)

- **Rodadas até verde na Fase 5:** 1 (os 2 testes novos passaram na primeira, cada um com controle positivo).
- **Achados reais:** Fase 2: 3 importantes + 4 menores (todos aceitos). Fase 5: 0 de regra, 2 lacunas de teste (fechadas); 0 ruído.
- **Paralelismo:** sem galhos em paralelo; a revisão da Fase 2 rodou junto com a T1; 2 revisores da Fase 5 em paralelo (o de testes numa
  worktree própria) junto com o `test:api` — sem contaminação.
- **Defeito que escapou da 221:** nenhum achado nesta etapa.

## Verificação (medida, serial)

`test:api` **617/617 arquivos OK** (os 616 da 221 + `extratoLoteImpedido`; rodada sobre `52cc0035` — a Fase 5 `7cd9920e` só acrescentou testes do cliente); `test:almoxarifado` **44 passou, 0 falhou**; `test:validation` **4/0**; `test:safealter` **3/0**; `test:sqlite` **16/0**; cliente (`CI=true npx react-scripts test --watchAll=false --maxWorkers=2`) **224/224 suítes, 3027/3027 testes** (3013 + 14 novos); `build` **Compiled successfully**. `extratoLoteImpedido` **13/13**.

## Fechamento

- [x] Fase 5 — 2 revisores; 0 achado de regra, 2 lacunas de teste fechadas, 0 ruído — `7cd9920e`.
- [x] Fechamento (`fechar-etapa`, sem o Passo 7½ e o 8, por pedido do André) — novidades (B1476–B1479, C527, C528, a nota no C481, D (222), F (222), seção, topo e "onde estamos"), spec 10 (topo, nota no C481 da 205 e a seção 222), mapa, guia (seção e cabeçalho), manual (6.9 e 9.1), este plano e a estimativa.

## Próxima tarefa detalhada

*(Escolhida pela ordem do CLAUDE.md: a 222 fecha a 1ª parte do C481 e nomeia a 2ª como o que falta; a spec 10 continua 🟢. Visível — a semana
pede algo na tela. **Sem estimativa** — começa pela Fase 0.5.)*

**As listas de saldo dizem quanto está em lote impedido (C481, 2ª parte).**

- **Onde:** `GET /api/almoxarifado/estoque` (`stockService.consultarEstoque`, `:3988` — `m.*` + `disponivelSql('m')`, todos os materiais
  ativos), consumido por **Materiais**/**Estoque** (a coluna *Disponível*), pela lista de materiais da **Nova Reserva** (`(Disponível: n un)`
  no `<option>`) e pelos relatórios que somam o disponível. A coluna *disponível* da Fila de separação já mostra o *separável* ao lado.
  *(**Estava errado** — medido na Fase 0 da Etapa 223: não existe tela "Estoque"; a tela **Materiais** lê `GET /materiais` (`listarMateriais`,
  compartilhada com o Compras) e mostra a *Quantidade* (o físico), sem *Disponível*; `/estoque` só é lido pela **Nova Reserva** e pelas
  **Inspeções**; os relatórios usam a SQL do `reportService`.)*
- **Medir antes de prometer (Fase 0):** a régua `loteImpedidoSql('m')` é uma subconsulta correlacionada por material (uma passada pelos lotes
  dele, com subconsultas por lote: saldo, inspeção, livro, reprovação, terceiros) e só calcula com `controle_lote = 1` (o `CASE`). A Fase 2 da
  222 mediu 0,6–1,5 ms por material no banco de desenvolvimento — numa lista de N materiais com lote, N vezes isso a cada abertura. Medir no
  banco de desenvolvimento (cópia, só leitura) o `/estoque` com e sem a coluna; se passar de ~200 ms, a alternativa é o campo só com
  `?com_lote_impedido=1` (opt-in) ou só para `controle_lote = 1`.
- **O que está pronto e não reabre:** a régua (205 + 217), o campo do extrato e o cartão (222), a frase da reserva (221/222). O *Disponível*
  **não muda** (B1476) — mostrar a parte impedida ao lado, como no extrato.
- **A decisão a tomar (letra B, reversível):** (1) o campo `lote_impedido` no `/estoque` (aditivo; opt-in se a medida pedir); (2) na lista
  de **Materiais/Estoque**, um selo ao lado do *Disponível* (*"6 em lote impedido"*) só quando > 0; (3) se a **Nova Reserva** passa a ler o
  número da lista (e deixa de buscar o extrato — B1478).
- **Pontos de atenção:** leitura sem trava; o "hoje" de Brasília (`diaLocal`); material sem controle de lote → 0 e nada na tela; os testes
  que comparam o conjunto de chaves do `/estoque` (procurar `deepStrictEqual` sobre as linhas de `/estoque` antes de mudar); o **C527** vale
  também para a lista. Vizinho barato que segue aberto: **C528** (a tabela *Saldos por localização* do extrato mostrar a situação e a
  validade de cada lote — o `consultarSaldosPorLocalizacao` já faz `JOIN` no lote). Outros: C519, C521, C524, C525, C526, C514–C518, C486,
  C491, C495, C497, C498.
