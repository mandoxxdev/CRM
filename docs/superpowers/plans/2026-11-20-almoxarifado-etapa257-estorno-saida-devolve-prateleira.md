# Etapa 257 — o estorno da Saída devolve às prateleiras de onde a baixa saiu (C544)

> Item único: o **C544** (Etapa 239; a pendência antiga da spec 03, "o endereçamento pode consolidar"). A "próxima tarefa detalhada" (item 2)
> do plano da 256. Estimativa `docs/estimativas/2026-11/estimativa_2026-11-20_almoxarifado-estorno-saida-devolve-prateleira.md` (1h15,
> `e5e4f699`). **Não entram:** os itens 24, 25 e 26 da estimativa de 18/11 (esperam resposta da empresa).
> **Fatia visível:** não há tela nova — o que muda aparece no **Sai de** (a quantidade por prateleira) e no saldo por localização depois de
> **Estornar** uma Saída que baixou de mais de uma prateleira. Declarado (motor puro).

## Fase 0 — medido (sonda executada sobre `3c478876`, 20/11)

- **Reprodução** (`scratchpad/sab-257-sonda.js`, pelo serviço): sem lote, padrão *A* 3 e *B* 5, Saída de 6 sem origem → *A* 0, *B* 2;
  **estorno → *A* 6, *B* 2** (certo: *A* 3, *B* 5). Padrão *P* vazia, *A* 4, *B* 4, Saída de 6 → *A* 0, *B* 2; **estorno → *P* 6** (certo:
  *A* 4, *B* 4, *P* 0).
- **Ida:** `registrarMovimentacaoSemTrava` (sob `naTravaDoMaterial` inteiro, Etapa 97), ramo de saída (~`stockService.js:2510`). O
  rastreador `saldoLinhasSaidaParaReverter` (`[{ id, quantidade }]`) já tem cada linha baixada: `claimSaldoDoLote` (com lote, sem negativo),
  `claimSaldoSemLote` (sem lote; inclui a linha do **resto** que fica negativa, e a mesma linha pode vir duas vezes) e a linha única do
  material com lote que permite negativo. As compensações (série recusada, origem que mudou) o **esvaziam** antes de lançar; depois do livro
  ele tem exatamente o que saiu. Ninguém grava.
- **Estorno:** `cancelarMovimentacao`, ramo `tiposSaida` (~3700), sob a trava do material (uma seção do efeito ao livro, Etapa 118): relê o
  controle de série, guardas, crédito do total, `loc = mov.localizacao_origem_id || material.localizacao_padrao_id`,
  `ajustarSaldoExistente(loc, lote, +q)` (ou `reconciliarEstornoSemLinha` sem a linha), séries de volta. O desfazer
  (`desfazerEfeitosDoEstorno`) devolve `compensarLinha` e `compensarLinhasClaim` **antes** do total.
- **Todas as saídas passam pelo motor:** saída avulsa, entrega de requisição, consumo, EPI, sucata, perda, devolução ao cliente/fornecedor
  (`TIPOS_SAIDA`). Um ponto de gravação e um de devolução cobrem todas — não precisa fatiar.
- **Fora do caminho:** a **exclusão da requisição** não estorna pelo livro — credita por uma ENTRADA própria na origem da saída
  (`requisitionService`, ~3401). Fica como está (D (257)). A **devolução viva** que cita a saída já recusa o estorno (inteiro ou nada), então
  a devolução nunca é parcial.
- **Banco:** a tabela da Etapa 256 (`ajuste_linhas_drenadas_almoxarifado`: `movimentacao_id`, `saldo_id`, `quantidade`) é chaveada pelo
  movimento — serve à Saída sem mudança. **Decisão B1603:** reusar a tabela com o nome que tem (o nome fica "ajuste"); renomear descartado
  — não dá para saber daqui se a 256 já foi implantada, e renomear tabela implantada pede migração dos registros.
- **Série:** a saída não muda o endereço da série e o estorno também não; a C545 (a baixa não segue a prateleira da série) continua.

## Regras de negócio

- **RN-257.01** Toda saída (`TIPOS_SAIDA`) gravada pelo motor grava, por movimento, cada linha baixada e quanto (na mesma tabela da 256), na
  ordem do claim, num `INSERT` só (tudo ou nada), **depois** do livro e dentro da seção do material. **Falha ao gravar não derruba a Saída**
  (o livro já valeu, padrão C250): log, nenhuma linha gravada, e o estorno dessa Saída faz o de antes.
- **RN-257.02** O estorno da saída com registro, depois de creditar o total (de sempre), devolve a cada linha registrada (por id, somadas as
  repetidas, na ordem do claim) a quantidade que saiu dela — **sem limite e sem guarda**: o delta é positivo (devolver não cria negativo) e a
  soma é a quantidade da saída. Cenário C544: padrão *A* 3, *B* 5, Saída de 6 → *A* 0, *B* 2; estorno → **A 3, B 5** (antes: *A* 6, *B* 2).
  A linha do **resto** (a que fica negativa no material que permite negativo) também volta: padrão *A* 2, *B* 1, Saída de 5 → *A* −2 (o
  resto), *B* 0; estorno → *A* 2, *B* 1 (antes: *A* 3, *B* 0).
- **RN-257.03** Linha registrada que não existe mais (só a exclusão do material apaga) ou de outro lote: pulada — a parte dela vai pelo
  caminho de antes (a origem do livro ou a padrão, `ajustarSaldoExistente` / `reconciliarEstornoSemLinha`). Saída **antiga** (sem
  registro) ou cujo registro falhou: tudo como antes. Declarado.
- **RN-257.04** A prateleira **bloqueada** (ou inativa) recebe de volta o que saiu dela (como a **B1602** da 256 — o estorno não confere
  endereço, Etapa 2). **Decisão B1604.**
- **RN-257.05** Desfazer: se o estorno falhar depois da devolução (o livro do estorno, a reversão das séries), as linhas devolvidas voltam
  (subtraem, pelo `compensarLinhasClaim`) antes do total, dentro da seção. Depois do desfazer: estado idêntico ao de antes do estorno; o
  estorno de novo, sem a falha, devolve certo.
- **RN-257.06** O que não muda: a ida (as linhas finais são as de hoje — só ganha o registro); as mensagens de recusa do estorno (séries que
  reentraram, devolução viva, material inativo); a exclusão da requisição; o AJUSTE (a leitura do registro dele continua só no ramo do
  AJUSTE, e um id de movimento é de um tipo só).

## Contratos

- Rotas: **nenhuma muda.** `POST /api/almoxarifado/movimentacoes/v2` (SAIDA e afins) — resposta igual (inclusive `enderecos_saida`).
  `POST /api/almoxarifado/movimentacoes/:id/cancelar` — resposta igual; mensagens de recusa iguais (nenhuma nova).
- Banco: nenhuma tabela ou coluna nova (a da 256). Sem consulta de produção (saída antiga = comportamento de hoje) — **não** vai para a letra A.

## Desenho

- **Ida:** junto à gravação do AJUSTE (depois do livro, fora do `try` dos efeitos): `if (tiposSaida.includes(tipo) &&
  saldoLinhasSaidaParaReverter.length)` → o mesmo `INSERT` (um só, `try/catch` + `console.warn`).
- **Estorno:** no ramo de saída, no lugar do `ajustarSaldoExistente(loc, lote, mov.quantidade)`: lê `SELECT saldo_id, SUM(quantidade), MIN(id)
  … GROUP BY saldo_id ORDER BY MIN(id)`; `compensarLinhasClaim = []`; para cada linha, `q = min(soma, resto)`, `UPDATE … + q WHERE id = ? AND
  material_id = ? AND lote_id IS ?` (0 mudanças → pula); `compensarLinhasClaim.push({ id, quantidade: -q })`; `resto -= q`. Se sobrar
  `resto`, o caminho de antes com `resto` no lugar de `mov.quantidade` (`compensarLinha` com `-resto`).
- **Travas:** nada novo — a ida e o estorno já rodam na seção do material. Nenhuma chamada nova de trava (não reentrante).

## Tasks

- [ ] **T1 (tronco, motor)** — gravação na ida + devolução no estorno + desfazer. `estornoSaidaDevolvePrateleira.api.test.js` (TDD: vermelho no
  código de antes; sabotagens).
- [ ] **T2** integração — pela rota (v2 → estorno; requisição separada → entrega → estorno) e pelo serviço.
- [ ] **T3** os testes que afirmavam o defeito (`saidaLotePrateleiraDoLote` RN-239 "o estorno devolve na linha da padrão") viram a prova.
- [ ] **T4** Fase 5 — revisor fresco adversarial com sonda executada e falha forçada.
- [ ] **T5** fechamento (fechar-etapa sem 7½ e 8).
