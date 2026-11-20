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

## Fase 2 (revisor fresco, 20/11) — 1 importante (gesto posterior, defeito anterior), 2 menores, 2 ruídos

Sondas executadas em cópias de `server/` sobre `9fda71f7` e `3a2d5aed`. Nenhuma rota, resposta ou mensagem muda; todos os `TIPOS_SAIDA`
passam pelo mesmo bloco; depois do livro o rastreador tem exatamente o que saiu (a recusa do lote e a série recusada o esvaziam; a origem
conferida lança antes do livro); a soma das linhas bateu com o físico em todos os cenários; o estorno de uma transferência *A*→*B* depois
do estorno da Saída passa a sair (antes: *"o destino não tem mais o saldo transferido"*).

1. **[importante]** O estorno de um **Ajuste** sem localização feito depois do estorno de uma Saída mais antiga deixa a padrão **negativa**
   num material sem negativo: *A* 3, *B* 5; Saída de 6; Ajuste para 1; estorno da Saída (*A* 3, *B* 4); estorno do Ajuste → total 2 (o certo
   seria 8) e *A* −2, *B* 4 (antes da 257: *A* 1, *B* 1, total 2). A causa é o `SET` absoluto do estorno do Ajuste (D (256) 3, anterior);
   com uma Entrada em *B* no lugar do estorno da Saída o mesmo já acontecia (*A* −5). → **não** se conserta a Saída (ela está certa);
   declarado como **C550**, cenário *[C550, documenta]* (`9476a64b`), e é a próxima tarefa (abaixo).
2. **[menor]** A RN-257.03 (linha que não existe mais ou de outro lote) não é alcançável pelo sistema: linha de saldo nunca muda de lote,
   endereço ou material, ids AUTOINCREMENT, o único `DELETE` é o desfazer da criação do material. → a guarda fica (defensiva) e o teste a
   alcança apagando a linha no banco; dito aqui.
3. **[menor]** A T3 não citava o `estornoLivroNaTrava` [R4]: o gancho pegava o `UPDATE` por chave e passou a não disparar. → já ajustado no
   T1 (o gancho reconhece o material no 3º parâmetro); citado abaixo.
4. **[ruído]** Arredondamento (0,1 + 0,2, Saída de 0,3): volta exato; sobra ≤ 1e-6 iria pelo caminho antigo.
5. **[ruído]** Duas falhas na cópia do revisor eram da fixture do client ausente no scratchpad (falham igual no código de antes).

## Tasks

- [x] **T1 (tronco, motor)** — `9fda71f7`: gravação na ida (o mesmo `INSERT` do AJUSTE, agora para `TIPOS_SAIDA` com o rastreador),
  devolução por id no estorno (`UPDATE … RETURNING`, sem guarda), resto pelo caminho de antes, desfazer pelo `compensarLinhasClaim`.
  `estornoSaidaDevolvePrateleira.api.test.js` (19 no commit; **15 de 19 vermelhos no código de antes** — rodado com o `stockService.js` de
  `3a2d5aed`; os 4 verdes são os "como antes"). **Sabotagens (8)**, harness `scratchpad/sab-257-harness.js` (âncora contada, cópia, md5 de
  volta ao pós-conserto): S1 estorno ignora o registro (12 caem), S2 a ida não grava (15), S3 desfazer sem a devolução (os 2 de RN-257.05), S4
  sem o resto pelo caminho antigo e S6 sem conferir a linha (o da linha apagada), S5 lê o registro de todos os movimentos (o das duas
  Saídas), S7 registro fatal (o da falha do registro: 500), S8 sem limitar ao resto — **não derrubava nada na 1ª rodada** (inalcançável sem
  adulterar o banco: o rastreador soma a quantidade da saída); escrito o cenário do registro adulterado com mais (a soma das linhas passava do
  total: 12 ≠ 8).
- [x] **T2** integração — no T1: pela rota (v2 Saída → estorno → transferência de 5 a partir de *B*), pela entrega (separação → entrega: grava
  o registro, o estorno pelo livro continua recusado) e pelo serviço (`registrarMovimentacao` + `cancelarMovimentacao`).
- [x] **T3** os testes que afirmavam o defeito — no T1: `saidaLotePrateleiraDoLote` RN-239.01 (*P* 2, *A* 3 → *A* 5, *P* 0; o comentário diz
  que a linha antiga estava certa até a 257); `estornoLivroNaTrava` [R4] (o gancho). Os 94 arquivos de `tests/api` que estornam saída,
  rodados um a um: 0 vermelhos.
- [x] **T3b** Fase 2 — `9476a64b` (o cenário *[C550, documenta]*).
- [x] **T4** Fase 5 — um revisor fresco, adversarial, sondas executadas numa cópia de `server/`. **Nenhum defeito reproduzido no código.**
  Tentado e não quebrou: AJUSTE_NEGATIVO, SUCATA, PERDA, DEVOLUCAO_CLIENTE, CONSUMO_TERCEIRO e PERDA_TERCEIRO depois de uma remessa;
  fracionário em três prateleiras (0,1/0,2/0,7, saída de 0,95); lote em material que permite negativo; lote com origem que drena outras;
  saída sem lote de material só com linhas de lote; Entrada, transferência e ajuste com localização no meio (estornos em ordem inversa);
  saída que consumiu reserva; dois estornos simultâneos; falha forçada na 1ª e na 2ª devolução, no crédito, no livro, no
  `movimento_estorno_id`, na linha do resto repetida, e falha única no desfazer (estado exato e o estorno de novo certo em todos);
  concorrência (Saída, Saída com origem, transferência e ajuste disparados do contexto do teste com o estorno parado na 1ª/2ª devolução):
  todos esperaram. **2 menores reais (testes):** (1) sabotar a gravação para só `tipo === 'SAIDA'` passava 20/20 — cenário com PERDA e
  AJUSTE_NEGATIVO (S9); (2) pôr as devoluções no rastreador só depois do laço passava 20/20 — cenário da falha na 2ª devolução (S10).
  **1 ruído:** falha permanente no próprio desfazer deixa o movimento inconsistente — anterior (o `compensarLinha` de uma linha só tinha o
  mesmo), a C246 (falha dupla) já declarada. Testes: `d259dcc0` (22/22; S9 e S10 derrubam cada um o seu cenário, lida a asserção).
- [x] **T5** fechamento (fechar-etapa sem 7½ e 8) — o commit de fechamento. Primeiro boot: **não se aplica** — nenhuma tabela ou coluna nova (só um comentário em
  `schema.js`).

## Divergências do plano

- O plano contava a **entrega da requisição** entre os estornos que mudam; a saída da entrega **não se estorna pelo livro** (*"Movimentação
  vinculada a requisição — use os fluxos da requisição (exclusão/encerramento)"*, `cancelarMovimentacao` ~3134) — ela grava o registro, mas
  quem a desfaz é a exclusão da requisição, que credita por uma ENTRADA própria numa posição só (D (257)). O teste da entrega afirma isso.
- O `UPDATE` da devolução por id saiu com `RETURNING` (`dbGet`), como o `ajustarSaldoExistente`; o gancho do `estornoLivroNaTrava` [R4] foi
  ajustado para reconhecer o material no 3º parâmetro (o plano não o listava — Fase 2, achado 3).
- A Fase 2 achou o **C550** (o estorno do Ajuste fora de ordem), anterior; declarado, não consertado aqui.
- **CLAUDE.md:** nenhuma linha ficou errada — a gravação e a leitura do registro ficam dentro das seções que a seção das travas já descreve
  (a saída sob `naTravaDoMaterial` do motor; o estorno de saída numa seção do efeito ao livro).

## Verificação (medida)

- `npm run test:api` (rodado **sozinho**, `NODE_OPTIONS=--max-old-space-size=4096`, sem sabotagem rodando, sobre `9fda71f7` com o teste da
  etapa em 20 cenários): **654/654 arquivos de teste OK** (o mais lento: `entregaGuardaSemLote`, 91,9 s). A Fase 5 (`d259dcc0`) só
  acrescentou dois cenários ao teste da etapa: `estornoSaidaDevolvePrateleira` **22/22** rodado à parte.
- `test:almoxarifado` 44/0; `test:validation` 4/0; `test:safealter` 3/0; `test:sqlite` 16/0 (sobre `d259dcc0`).
- Jest da tela (`--maxWorkers=2`): **240 suítes, 3248 testes**, verdes; `CI=true react-scripts build`: *Compiled successfully* (nenhum arquivo da
  tela mudou).
- Os 94 arquivos de `tests/api` que estornam saída, rodados um a um depois do T1: 0 vermelhos (dois declarados atualizados no T1).
- Primeiro boot: não se aplica (nenhuma tabela nem coluna nova). Nenhum clique no navegador (F (257)).

## Retro (4 números)

- Rodadas de correção até verde: 1 (o teste: a entrega não se estorna pelo livro; o gancho do R4; as duas lacunas da Fase 5).
- Achados: Fase 2 — 1 importante (C550, defeito anterior, declarado), 2 menores, 2 ruídos; Fase 5 — 2 menores (testes), 1 ruído; nenhum
  defeito no código novo.
- Paralelismo: o revisor da Fase 2 rodou enquanto o T1 era escrito (sondas em cópia, sem retrabalho); o da Fase 5 enquanto a suíte rodava.
- Defeito que escapou: (preencher na etapa seguinte). Da 256: nenhum apontado.

## Próxima tarefa detalhada

1. **Itens 24, 25 e 26 da estimativa de 18/11 — continuam esperando resposta da empresa.** Caminho reversível de cada um no plano da 253
   ("Próxima tarefa detalhada"). **Não comece sem a resposta.**
2. **Sem resposta, o próximo do almoxarifado: o C550 — o estorno do Ajuste sem localização fora de ordem** (achado da Fase 2 desta etapa;
   a D (256) 3). **Medido (20/11):** `cancelarMovimentacao`, ramo `AJUSTE` sem `localizacao_destino_id` (~`stockService.js:3850`):
   `guardaEstornoAjuste(mov.saldo_anterior, atual)` → `UPDATE … SET quantidade_atual = saldo_anterior` (~3867) → `syncSaldoLocalizacaoPadrao`
   (resíduo na padrão; com lote drena, sem lote não). Com qualquer movimento do material **depois** do Ajuste (Saída, Entrada, estorno de
   outra), o `SET` absoluto apaga esse movimento do total, e o resíduo pode deixar a padrão negativa (cenário *[C550, documenta]* em
   `estornoSaidaDevolvePrateleira.api.test.js`: total 2, *A* −2; o certo seria 8). Caminhos (escolher o reversível e registrar na letra B):
   (a) estornar **por diferença** (`atual − (saldo_posterior − saldo_anterior)`), como o ramo com localização já faz — muda o número que o
   estorno grava quando houve movimento depois (hoje "volta ao de antes"); (b) **recusar** o estorno quando houve movimento do material
   depois do Ajuste, com mensagem que mande fazer um Ajuste novo — mais conservador, trava estornos que hoje passam. Pontos de atenção: a
   guarda de retenção (`guardaEstornoAjuste`) e a do lote (`projecaoDoLoteNoAjuste`) usam o total novo; o desfazer
   (`compensarQuantidadeMaterial` é a diferença atual − saldo_anterior); a devolução às prateleiras da 256 (`devolver`/limite) usa o resíduo;
   o `AJUSTE_INVENTARIO` não estorna. Motor: Fase 2 e Fase 5 completas, ~1h15. Molde: `estornoAjusteDevolvePrateleira.api.test.js`.
3. Depois: **a exclusão da requisição devolver às prateleiras de onde a entrega tirou** (D (257) 2): `requisitionService` ~3401 monta
   `partes` por saída com `localizacao_destino_id = origem da saída (se aceita) ou padrão` e credita por ENTRADA; o registro da entrega já
   existe desde esta etapa (`ajuste_linhas_drenadas_almoxarifado` por `movimentacao_id` da saída). Ponto de atenção: a ENTRADA da exclusão
   tem a validação de endereço (ativa, não bloqueada, tipo permitido) que o estorno não tem — decidir se a prateleira bloqueada recebe (B1604)
   ou cai na padrão.
4. Outras 🟡 medidas (planos da 254 e 255): o agrupamento da Fila em seções (B1600, se pedirem); a dupla aprovação do Ajuste (06, espera
   decisão); lista de separação como entidade e kits (05, fora da estimativa).
- **O que já está pronto e não reabre:** o registro das linhas baixadas de toda saída e a devolução por linha no estorno (com e sem lote,
  série, resto negativo, desfazer); o registro e a devolução do AJUSTE (256).
