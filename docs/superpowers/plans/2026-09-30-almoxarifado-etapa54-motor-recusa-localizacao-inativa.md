# Etapa 54 — o motor recusa o endereço informado inativo ou inexistente

> Status: **FECHADA (2026-09-30)** — `c757276` (implementação) + 30707de (fix-round da
> Fase 5) + commit de documentação. Fecha o **C73**.
> Origem: C73 (aberto na Etapa 53) — o motor aceitava ENTRADA/TRANSFERENCIA com destino
> **inativo** (o saldo some do mapa, que filtra `ativo = 1`) e com destino **inexistente** (linha de
> saldo órfã, que nenhuma tela mostra).

## Fase 0 — o que foi medido no código (2026-09-30)

- `validarLocalizacaoParaMovimento` (stockService) faz `if (!loc) return;` — inexistente passa.
- `motivoRecusaEndereco` só olha `bloqueada` e `tipos_material_permitidos`; **não** olha `ativo`.
- Chamadores do motor que passam destino: `receiptService` (pré-validação da nota + entrada),
  `returnService` (devolução, destino escolhido pelo usuário, com compensação da linha),
  `scrapService` (retalho, destino escolhido pelo usuário — perna 2, depois da baixa).
- `cancelarMovimentacao` (estorno) **não** valida endereço, por decisão da Etapa 2. Mantido.
- ~~A padrão pode apontar para localização **apagada**~~ — **estava errado** (achado 10 da
  Fase 2): o DELETE de localização é *soft* (`ativo = 0`), não há DELETE físico no código. Id
  inexistente na padrão só vem de integração ou legado. O que existe de verdade é a padrão
  **inativa**: desativar uma localização vazia que é padrão de material zerado era aceito.
- O mapa filtra `ativo = 1`; a régua de inativa aqui é `Number(ativo) !== 1` (a mesma do mapa, do
  `GET /localizacoes`, da guarda do PUT e da sugestão — NULL conta como inativa em todas).

## Fase 2 — revisão do plano (agente fresco): o desenho mudou

A 1ª versão deste plano recusava também a **padrão** inativa na entrada sem destino. O revisor
achou 2 críticos: recebimento (`/processar` não tem campo de destino — a nota inteira travaria),
retorno de terceiros e exclusão de requisição (esta, pior: item 1 já devolvido, item 2 recusado,
retry devolve o 1 de novo) **caem na padrão sem o usuário poder escolher**. E desativar uma
localização vazia que é padrão de material zerado era aceito — armava a armadilha em silêncio.

**Decisão (reversível, letra B):** o motor recusa só o endereço **informado**; a padrão inativa é
impedida **na origem** — não se desativa localização que é padrão de material ativo (RN-04) e o
cadastro não aceita padrão inativa/inexistente (RN-05). A entrada sem destino que cai numa padrão
inativa **de legado** continua aceita (a letra A mede quantas existem). Descartados: recusar a
padrão no motor (trava fluxos sem campo de destino); mandar para "sem localização" quando a padrão
é inativa (mexe na resolução de endereço de todos os fluxos e no fallback do mapa — escopo maior);
limpar a padrão dos materiais ao desativar (muda cadastro sem o dono saber).

Outros achados incorporados: AJUSTE que **sobe** saldo em inativa reabria o C73 (RN-03 virou
"só reduz ou zera"); `AJUSTE_POSITIVO` é da família de entrada (RN-01 o cobre, testado); o retalho
recusava o destino só na perna 2, depois da baixa (pré-validação antes da perna 1); a pré-validação
do recebimento não distinguia explícito de padrão (chamada explícita adicionada).

## Regras de negócio

- **RN-01** — Destino **informado** inativo é recusado em toda a família de ENTRADA
  (`TIPOS_ENTRADA`, inclusive `AJUSTE_POSITIVO`) e no destino da TRANSFERENCIA:
  400 `Localização {codigo} está inativa`.
- **RN-02** — Localização **informada** inexistente é recusada no campo de localização que o tipo **usa** (destino da
  família de ENTRADA e do AJUSTE com localização; origem da família de SAIDA; os dois da TRANSFERENCIA):
  400 `Localização de destino não encontrada` / `Localização de origem não encontrada`. Id **0** é "não informado".
  ⚠️ **Esta RN dizia "em qualquer papel e tipo" — estava exagerado** (achado M-4 da Fase 5): um
  `localizacao_origem_id` numa ENTRADA (campo que o tipo não usa) **não** é validado e vai para o livro como veio —
  declarado na letra **C74**.
- **RN-03** — AJUSTE / AJUSTE_INVENTARIO numa localização **inativa** só reduz ou zera:
  400 `Localização {codigo} está inativa — o ajuste só pode reduzir ou zerar o saldo dela`.
- **RN-04** — **Origem inativa é aceita** (SAIDA, TRANSFERENCIA): é o jeito de esvaziar endereço
  desativado. E a rota: `PUT` que desativa e `DELETE` de localização **ativa** que é padrão de
  material **ativo** → 400 `Localização é a padrão de {N} material(is) ativo(s) ({até 5 códigos}[, …]). Troque a localização padrão deles antes de apagar ou desativar.`
- **RN-05** — Cadastro de material (POST sempre; PUT **só quando a padrão muda**):
  400 `Localização padrão não encontrada` / `Localização padrão {codigo} está inativa`.
- **RN-06** — Estorno continua sem validação de endereço (decisão da Etapa 2).
- **RN-07** — Entrada **sem destino** com padrão inativa de legado: aceita (decisão acima). A tela
  de Movimentações já avisa (`aviso-padrao-inativa`, Etapa 53).

## Tasks

- [x] **T1 (tronco)** — `validarEnderecoExplicito` + `materiaisComPadrao` no stockService, chamadas
  no bloco de validação do motor, RN-03 no ramo do AJUSTE; guarda RN-04 no PUT/DELETE de
  localização; `validarLocalizacaoPadrao` no materialService (POST) e no PUT de material;
  pré-validação explícita no recebimento e no retalho. Testes:
  `server/tests/api/localizacaoInativaMotor.api.test.js` 13/13, 19 sabotagens vermelhas no cenário
  certo — `c757276`.
- [x] **T2** — fixture do `sugestaoLocalizacao` (INAT recebia saldo já inativa): semeada ativa e
  desativada depois — 15/15 — `c757276`.
- [x] **T3** — verificação completa (api 231/231, almoxarifado 42/42, validation 4/4, safealter 3/3, sqlite 5/5,
  cliente 889/889, build limpo — antes do fix-round), Fase 5 e fix-round — 30707de;
  documentação no commit de fechamento.

## Pontos de atenção / não coberto

- **Almoxarifado inativo** não é recusado pelo motor (só a sugestão o evita) — letra D.
- Reativar um material cuja padrão está inativa não é barrado — letra D.
- O `PUT /localizacoes/:id` sem `ativo` no body grava `ativo = 1` (full-replace): editar uma
  localização inativa pela API sem mandar `ativo` a **reativa**. Pré-existente, medido nesta
  etapa, fora do escopo — letra C.

## Fase 5 — revisão adversarial do código (um revisor, só leitura)

Não achou caminho que ainda grave saldo em endereço **informado** inativo ou inexistente (conferiu motor, rotas v2 e
`/transferencias`, recebimento, devolução, retalho; inspeção, NC, requisição, terceiros, reserva e inventário não passam
endereço; a conferência manda AJUSTE_INVENTARIO sem endereço). Achados:

| # | Gravidade | Achado | Destino |
|---|---|---|---|
| I-1 | Importante | RN-03 prendia uma linha **negativa** numa inativa: pedir 0 contava como "subir" (`quantidade > atual`), e ENTRADA/TRANSFERENCIA para lá também são recusadas — a linha ficava presa até reativar o endereço | **Corrigido**: teto `max(atual, 0)`; teste novo (saída de 5 com 3, linha −2, ajuste 1 recusado, ajuste 0 aceito) |
| M-2 | Menor | id `0` virava "não encontrada" em ENTRADA/TRANSFERENCIA, mas "ausente" no AJUSTE e no retalho | **Corrigido**: 0 é "não informado"; teste novo |
| M-3 | Menor | Efeitos antes da recusa: lote novo criado antes da checagem de endereço; auditoria do dono no ajuste de material de cliente | **Declarado** (C74) — padrão pré-existente, o mesmo da recusa de bloqueada |
| M-4 | Menor | Localização em campo que o tipo não usa vai ao livro sem validar; a RN-02 dizia "qualquer papel e tipo" | **Declarado** (C74) e **RN-02 corrigida à vista** |
| M-5 | Menor | Recebimento repetia "está inativa" uma vez por item | **Corrigido**: checado uma vez, antes do laço — `Nao foi possivel dar entrada no estoque: ⟨motivo⟩` |
| T-6 | Teste | O teste do recebimento não distinguia a pré-checagem da recusa do motor (`movs === 0` valia nos dois) | **Corrigido**: literal exata |
| T-7 | Teste | RN-04 no PUT sem metade positiva (sabotagem "sempre recusa" passava) | **Corrigido**: limpar a padrão e desativar pelo PUT → 200 |
| T-8 | Teste | PUT de material com padrão `null` sem teste | **Corrigido** |
| T-9 | Teste | "Mais de 5" comparava ordem de criação com a ordem de texto do servidor | **Corrigido**: ordena os 6 e pega 5 |

Fix-round: 4 sabotagens (teto, id 0, pré-checagem do recebimento, PUT sempre recusando) — todas vermelhas no cenário
certo. `localizacaoInativaMotor` **15/15**.

## Retro de 4 números

- **Rodadas de correção até verde:** 1 (o fix-round da Fase 5). Nenhum teste falhou em mais de uma rodada.
- **Achados:** Fase 2 — 10 (2 críticos) que **mudaram o desenho** (B217), todos reais; Fase 5 — 1 importante + 4
  menores reais (3 corrigidos, 2 declarados) + 4 lacunas de teste; ruído: 0.
- **Paralelismo:** 0 galhos — tronco único (motor + rotas que dependem da mesma regra).
- **Defeito que escapou da Etapa 53:** nenhum — o C73 já estava declarado.

## Próxima tarefa detalhada — Etapa 55: o código de endereço gerado pela hierarquia (feature 02)

**Por que esta.** No mapa, a feature 02 é a 🟡 de onde vieram as quatro últimas etapas; o que falta para 🟢 é
**código de endereço gerado**, **confirmação por leitura** e **áreas especiais com semântica** (capacidade/peso é
informativo por decisão). A confirmação por leitura depende de o endereço ter um código **estável e legível** para a
etiqueta — o código gerado vem primeiro.

**⚠️ Medido no fechamento da 54 — a spec 02 estava parcialmente errada, e foi corrigida à vista:** ela dizia que o
código gerado "não foi entregue" e que "o que existe é `endereco_completo`". **Existe um gerador**, no cliente: o
assistente de nova localização (`ConfiguracoesAlmoxarifado.js`, `generateNextCodigo`) propõe `PREFIXO-NN` — prefixo do
setor (`setores_almoxarifado.codigo_prefixo`, ou derivado do nome) ou do código do pai, e o próximo número entre os
irmãos. É **sugestão de tela**, não regra: o servidor aceita qualquer `codigo` (só `UNIQUE NOT NULL`,
`schema.js:417`), e o formato não é o hierárquico da spec (`ALM-GERAL-A03-E02-N04-P01`).

**Fase 0 da 55 — medir antes de prometer:**
1. **O gerador conta só localizações ATIVAS** (`GET /localizacoes` filtra `ativo = 1`): o "próximo número" pode
   repetir o código de uma **inativa** → o `UNIQUE` recusa a criação. Reproduzir pela API (criar A-01, desativar,
   pedir o próximo) e ver a mensagem que a tela mostra.
2. **Onde o código é lido:** Mapa, etiquetas (`EtiquetasPdfModal.js` — hoje só material?), scanner
   (`ScannerAlmoxarifado.js` — resolve localização?), relatórios, integração. Mudar formato de código existente é
   **proibido** sem decisão (quebra etiqueta impressa e integração): a 55 gera para **novas** e, no máximo, oferece
   renomear.
3. **O que a spec pede de verdade:** código compacto da hierarquia (almoxarifado → setor → pai → posição). Decidir
   (letra B, reversível) entre: (a) mover o gerador para o servidor com o formato atual `PREFIXO-NN` e uma rota
   `GET /localizacoes/proximo-codigo?setor=&parent_id=` (molde: `proximoCodigo` de material, `materialService.js`,
   pelo **MAX** incluindo inativos, retry sob `UNIQUE`); ou (b) o formato hierárquico completo.
4. **Contratos que já existem e a 55 não reabre:** `validarEnderecoExplicito` / `motivoRecusaEndereco` (regra de
   endereço), `OCUPACAO_SQL` (ocupação), a guarda de desativação da 54 (padrão em uso).

**Pontos de atenção.** O PUT de localização é full-replace e grava `ativo = 1` quando o campo não vem (**C74 (3)**) —
se a 55 mexer no PUT, é a hora de corrigir (preservar quando omitido, como `almoxarifado_id`). Teste com controle
positivo para o "próximo código" pulando o de uma inativa.
