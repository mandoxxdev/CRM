# Almoxarifado — Etapa 28: a separação ganha dono e segunda conferência (design)

Data: 2026-08-29 · Branch: `desenvolvimento-almoxarifado`
Origem: a feature 05 (separação e picking), 🟡 desde a Etapa 3 — e a **dupla conferência em
material crítico**, o último item da perna Segurança da spec 23, que a Etapa 25 deixou na letra B.

## Decisão de escopo (Fase 0 — medida em 2026-08-29)

**A separação não tem dono e não deixa rastro.** Medido:

- `separarRequisicao(db, requisicaoId, itensSeparados)` (`requisitionService.js:189`) **não recebe
  `user`** — a rota não repassa `req.user`;
- `requisitionService.js` tem **zero** chamadas de auditoria, enquanto `/confirmar-recebimento` e
  `/rejeitar-valor`, no mesmo arquivo, auditam;
- `auditLabels.js` não tem nenhum verbo de separação.

Num almoxarifado, **"quem separou?" é a primeira pergunta quando falta material na caixa** — e
hoje o sistema não sabe responder. Pior: sem esse campo, os dois itens que a spec pede
("responsável pela separação" e "segunda conferência: conferente ≠ separador") **não têm como
existir** — não há de onde tirar o separador para comparar.

**A separação ACUMULA em rodadas.** `separarRequisicao` soma sobre `quantidade_separada`
(`:44`), então a mesma requisição pode ser separada por pessoas diferentes em momentos
diferentes. Isso decide o desenho: guardar "o separador" no cabeçalho da requisição registraria
**o último** e apagaria os outros — e alguém que separou na primeira rodada poderia conferir a
própria separação depois.

## As decisões

**1. Cada rodada de separação vira uma linha append-only**, não um campo no cabeçalho.
`separacoes_requisicao_almoxarifado` (requisição, usuário, quando, quantos itens tocou). É o
mesmo padrão de `assinaturas_entrega_almoxarifado` (Etapa 15), e é o que permite a barreira da
segunda conferência ser **correta** em vez de aproximada.
**Descartado** `separado_por_id` na requisição (registra só o último) e **descartado** derivar da
trilha de auditoria: auditoria é **best-effort** neste módulo (decisão da Etapa 19 — falha de log
não derruba o ato), então uma barreira de segurança apoiada nela **falha aberta**. Barreira que
falha aberta não é barreira.

**2. A barreira se repete no `WHERE` do claim**, não só na checagem. É o molde do sucateamento
(`scrapDisposalService.js:340-360`), que documenta o TOCTOU exato: a checagem lê e decide, o
claim escreve depois, e entre as duas não há lock — duas requisições simultâneas passam as duas.
A checagem em JS existe **pela mensagem** (explica ao operador o que aconteceu); quem **garante**
é a condição gêmea dentro do `WHERE`.

**3. A separação passa a auditar**, com verbo próprio e rótulo — o cadastro nasce instrumentado,
como a Etapa 26 fez com categorias e a 27 com planos.

## Regras de negócio (RN)

- **RN-01 — Separar exige identidade.** `separarRequisicao` recebe `user`; a rota repassa
  `req.user`. Sem usuário, a operação **não acontece** (não é um `|| null` silencioso).
- **RN-02 — Cada rodada de separação é registrada**, com quem, quando e quantos itens tocou.
  Rodadas não se sobrescrevem.
- **RN-03 — Quem separou não confere.** A conferência da separação recusa quem aparece em
  **qualquer** rodada daquela requisição — não só a última. A barreira se repete no `WHERE` do
  claim.
  **Descartado** comparar só com o último separador: com acumulação em rodadas, quem separou
  primeiro conferiria a própria separação, que é exatamente o que a regra existe para impedir.
- **RN-04 — A separação deixa rastro na trilha** (verbo próprio em `auditLabels`), pós-escrita e
  best-effort, como o resto do módulo.
- **RN-05 — Conferir é um ato com dono, e sem dono não vale.** Mesma régua da RN-01.

## Arquitetura

- **`separacoes_requisicao_almoxarifado`** (append-only): `id`, `requisicao_id` (FK),
  `usuario_id`, `usuario_nome`, `itens_tocados`, `created_at`.
- **`requisitionService.separarRequisicao`** ganha `user` e grava a rodada + audita.
- **A conferência** (rota nova ou campo na existente — a Fase 1 decide, medindo o que a tela já
  chama): grava `conferido_por_*` na requisição, com a barreira da RN-03.
- **`auditLabels.js`**: verbo e entidade novos.

## Testes

- `separacaoComDono.api.test.js`: RN-01 (sem usuário não separa), RN-02 (**duas rodadas por
  pessoas diferentes geram duas linhas**, e nenhuma apaga a outra), RN-04 (a trilha mostra o ato).
- `segundaConferencia.api.test.js`: RN-03 — **o cenário de peso é o separador da PRIMEIRA rodada
  tentando conferir** (o que a comparação com "o último" deixaria passar); mais o caminho feliz
  (terceira pessoa confere) e o TOCTOU: **duas conferências simultâneas** (`Promise.all`) com o
  mesmo usuário que separou → uma só passa, e é a barreira do `WHERE` que decide. É o mesmo
  cenário que a Etapa 18 usou para provar o claim atômico do cancelamento.
- Controle positivo com alvo, **lendo qual asserção caiu** — e atenção à lição da Etapa 27:
  numa barreira com checagem **e** `WHERE`, remover só a checagem em JS pode ser **no-op** para o
  teste sequencial (o `WHERE` ainda segura). Sabote **os dois**, separadamente, e diga o que caiu
  em cada um.

## Fica FORA, declarado

- **Localizações do tipo Reservado / Kit / Aguardando retirada** — a spec 05 afirmava que
  `TIPOS_LOCALIZACAO` já os tinha, e a Fase 0 mediu que **nenhum dos três existe**. Acrescentá-los
  é estender um contrato de API que outras telas consomem; a spec foi corrigida dizendo que
  estava errada, e o item fica.
- **Onda de separação / lista de picking otimizada por rota** — é o "picking" propriamente dito,
  e depende de capacidade e endereçamento que a feature 02 ainda não fecha.
- **A dupla conferência de material crítico como MÁQUINA DE ESTADOS** (B57): esta etapa entrega a
  barreira por identidade na separação. Quais **outras** operações exigem dois pares de olhos
  continua sendo decisão de negócio.
