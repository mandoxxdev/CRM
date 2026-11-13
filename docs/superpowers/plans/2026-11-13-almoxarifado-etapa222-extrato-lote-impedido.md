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
- **B1477 — o modal mostra um cartão *"Em lote impedido"* e uma frase, só quando `lote_impedido > 0`**: o cartão (ícone de cadeado,
  cor de perigo) com o número; abaixo dos cartões, a frase *"⟨n⟩ ⟨un⟩ em lote bloqueado, reprovado ou vencido: o Disponível ainda conta
  essas peças, mas elas não saem do estoque até o lote ser liberado."*. Com 0 (ou campo ausente — servidor antigo), nada muda na tela.
  Descartado: a frase "⟨n⟩ do disponível" — o impedido pode passar do disponível (reserva da OS sobre o lote bloqueado, B1381; reserva de
  antes do bloqueio, B1471), e "6 do disponível 2" confunde.
- **B1478 — o formulário Nova Reserva troca o aviso fixo pelo número**: escolhido um material com controle de lote, a tela busca o extrato
  dele; com `lote_impedido > 0` mostra *"⟨n⟩ ⟨un⟩ deste material estão em lote bloqueado, reprovado ou vencido e não entram na reserva."*;
  com 0, nada; enquanto busca ou se a busca falhar (ou não trouxer o campo), o aviso fixo da 221 (B1472) — nunca menos do que hoje. A
  resposta de um material que deixou de ser o escolhido é ignorada. Descartado: só o aviso fixo (a próxima tarefa da 221 pedia o número);
  `/estoque?material_id=` (o campo não está no `/estoque`).
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
| RN-222.06 | Integração: o extrato e a recusa da reserva manual dizem o mesmo número; liberar o lote zera | L1 ATIVO 4 + L2 BLOQUEADO 6: extrato 6; `POST /reservas` de 5 → 400 `Saldo disponível insuficiente: 4. Não entram 6 un em lote bloqueado, reprovado ou vencido.`; `PUT /lotes/L2/status ATIVO` → extrato 0; reserva de 5 → 201 |
| RN-222.07 | Material de cliente: o campo vem | material com `proprietario_cliente_id` e L2 BLOQUEADO 6 → `lote_impedido === 6` (o extrato não filtra o dono) |
| RN-222.08 | O modal mostra o cartão e a frase só com número | `lote_impedido: 6`, `unidade: 'PC'` → cartão `Em lote impedido` com `6` e a frase literal `6 PC em lote bloqueado, reprovado ou vencido: o Disponível ainda conta essas peças, mas elas não saem do estoque até o lote ser liberado.`; o cartão Disponível continua com o `quantidade_disponivel`; `lote_impedido: 0` ou ausente → nem cartão nem frase |
| RN-222.09 | O formulário mostra o número do material escolhido | `controle_lote: 1`, extrato `lote_impedido: 6` → `6 PC deste material estão em lote bloqueado, reprovado ou vencido e não entram na reserva.` e não o aviso fixo; `lote_impedido: 0` → nem número nem aviso fixo; extrato com erro → o aviso fixo da 221; `controle_lote: 0` → não busca o extrato, nada aparece |
| RN-222.10 | O formulário ignora a resposta de um material que deixou de ser o escolhido | escolher A (extrato lento, 6), depois B (extrato 2); A responde depois de B → aparece o número de B (2), não o de A |

## Contratos congelados

**`GET /api/almoxarifado/materiais/:id/extrato`** — sem payload. Resposta 200 igual à de hoje, com **um campo a mais** em `material`:
`lote_impedido` (número ≥ 0, arredondado a 1e-6; 0 sem controle de lote). Erros iguais: 404 `{ error: 'Material não encontrado' }`, 500
pelo `handleError`. Sem mudança de autorização.

**Tela — literais novos**:
- cartão do extrato: rótulo `Em lote impedido` (classe `almox-extrato-lote-impedido` no cartão);
- frase do extrato: `${n} ${unidade} em lote bloqueado, reprovado ou vencido: o Disponível ainda conta essas peças, mas elas não saem do
  estoque até o lote ser liberado.` (sem unidade: sem o espaço);
- formulário: `${n} ${unidade} deste material estão em lote bloqueado, reprovado ou vencido e não entram na reserva.` (classe
  `almox-reserva-aviso-lote`, a mesma da 221);
- o aviso fixo da 221 (`Peças em lote bloqueado, reprovado ou vencido não entram na reserva.`) continua como fallback.

O número aparece como o servidor mandou (`Number(n)`, sem formatação local — o extrato já mostra os outros cartões assim).

## Tasks (sort topológico)

- [ ] **T1 (tronco)** — rota do extrato com `loteImpedidoSql('m') as lote_impedido`. Testes RN-222.01 a .07 em
  `server/tests/api/extratoLoteImpedido.api.test.js`.
- [ ] **T2 (galho, consome o contrato)** — `ExtratoMaterialModal`: o cartão e a frase (RN-222.08), testes em `ExtratoMaterialModal.test.js`.
- [ ] **T3 (galho, consome o contrato)** — `ReservasAlmoxarifado`: o número no formulário (RN-222.09, .10), testes em
  `ReservasAlmoxarifado.test.js` (RN-221.10/.10 b continuam verdes: o mock delas não traz o extrato → fallback).
- [ ] **T4 (integração)** — RN-222.06 pela rota (extrato → reserva recusada com o mesmo número → liberar o lote → extrato 0 → reserva), no
  arquivo da T1.

T2 e T3 são pequenas e no mesmo diretório do cliente: feitas em sequência pelo mesmo executor, não em paralelo.

## Sabotagens previstas (controle positivo)

1. sem a coluna (campo ausente) → RN-222.01..07; 2. `lote_impedido` com o "hoje" +1 dia → RN-222.02 d; 3. outra conta (só os lotes com
status ≠ ATIVO, sem o vencido) → RN-222.02 b, .05; 4. sem o `CASE controle_lote` (conta sempre) → RN-222.03; 5. Disponível descontado
(`disponivel − impedido`) → RN-222.01; 6. modal sem a guarda `> 0` → RN-222.08 (o "nem cartão"); 7. formulário sem o fallback → RN-222.09
(o erro); 8. formulário sem a guarda de material escolhido → RN-222.10; 9. formulário mostra o aviso fixo também com número → RN-222.09.
