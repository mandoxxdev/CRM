# Almoxarifado — Etapa 7: Transferências e Devoluções (design)

> **Data:** 2026-08-12 · **Status:** aprovado (decisões tomadas pelo usuário nesta sessão, uma a
> uma) · **Briefing de origem:** seção final de
> `docs/superpowers/plans/2026-08-11-almoxarifado-etapa6c-etiquetas.md`
> **Features:** `specs/modulo-almoxarifado/11-transferencias` + `specs/modulo-almoxarifado/12-devolucoes`

## O problema

As duas rotas existem e nenhuma tem tela — hoje só são alcançáveis por chamada direta à API.
Além de invisíveis, as duas são frouxas:

- **Transferência** move saldo (e, desde a Etapa 6, a linha do lote) entre localizações, mas não
  declara `exigeLote` e não está em `REGRAS_VINCULO`. Material com `controle_lote` transfere sem
  citar de qual lote saiu — o oposto do que a flag promete.
- **Devolução** aceita qualquer quantidade de qualquer material, sem dizer de qual entrega veio.
  Não há "não devolver mais do que foi entregue" nem rastro da saída que está sendo desfeita. A
  entrada de devolução grava `lote_id NULL` mesmo em material controlado, criando saldo que a
  saída seguinte não consegue consumir (a saída exige lote e não acha nenhum).

E há um bug de saldo que só apareceu quando esta etapa foi sondada — ver "O bug do SUCATA".

## Decisões (perguntas feitas ao usuário e respostas adotadas)

1. **"Em trânsito" foi CORTADO.** A spec 11 pedia a máquina de estados `SOLICITADA → APROVADA →
   EM_TRANSITO → RECEBIDA → CONFIRMADA / CANCELADA` com localização virtual onde o saldo não é
   disponível nem na origem nem no destino. **Resposta do usuário: a transferência é imediata** —
   os almoxarifados são áreas físicas do mesmo site (regra já fixada no `CLAUDE.md`), alguém pega
   a caixa e leva na hora. A transferência continua atômica origem→destino. **Isto é um corte
   deliberado, não um item esquecido**, e a spec 11 tem de dizer isso com todas as letras: quem
   ler o checklist depois não pode achar que o trânsito ficou pendente por descuido. Se um dia o
   cliente passar a ter obra externa ou segundo prédio, o item volta com justificativa nova.

2. **Vínculo da devolução: opcional, mas validado quando informado.** O operador pode devolver
   avulso (sobra antiga, material entregue antes do sistema, entrega sem registro), mas quando
   aponta a saída de origem o sistema valida `quantidade + já devolvido ≤ quantidade da saída` e
   guarda o rastro. Obrigatório sempre foi descartado porque tornaria impossível devolver o que
   saiu por um caminho sem registro; "continua avulso" foi descartado porque é justamente o
   buraco que a spec 12 mais cita.

3. **A tela de devolução começa pelo material.** O operador escolhe o material e vê as saídas
   daquele material (data, quantidade, quem retirou, requisição/OS, quanto já foi devolvido).
   Começar pela requisição foi descartado porque não alcança saída manual sem requisição —
   e `SAIDA_PRODUCAO`/`SAIDA_MONTAGEM`/`SAIDA_ASSISTENCIA` existem exatamente para isso. Os dois
   caminhos ao mesmo tempo foi descartado por YAGNI.

4. **Devolução herda o lote da saída; transferência passa a exigir lote.** Fecha as duas lacunas
   nomeadas na auditoria de 2026-08-11 e evita o saldo devolvido sem lote que fica preso. O
   comentário do próprio motor já previa esta etapa (`stockService.js`, bloco do `exigeLote`):
   *"dar-lhes lote automaticamente (FEFO na entrega, herdar da saída original na devolução) é o
   conteúdo natural de uma etapa seguinte"*.

5. **`TRANSFERENCIA` entra em `REGRAS_VINCULO` com `{ vinculo: 'nenhum' }`.** Não exige nada — mas
   passa a estar **declarado**, então a lacuna deixa de ser omissão e vira decisão escrita. Exigir
   justificativa em toda transferência foi descartado: mover material de prateleira é rotina, e
   operador obrigado a justificar rotina escreve "ok". Exigir só quando muda de almoxarifado foi
   descartado por ser mais regra para explicar e testar do que valor entregue. A tela terá campo
   de motivo **opcional**, que vai para o livro.

6. **Condição sugere o destino, não determina.** `Boa → Estoque`, `Suspeita → Quarentena`,
   `Danificada → Sucata` pré-selecionam o destino; o operador pode trocar. Guia quem está
   aprendendo sem travar o caso fora da regra, e **não cria validação nova no backend** — a
   sugestão é da tela.

7. **Arquitetura de tela: transferência dentro de Movimentações, devolução em tela dedicada.**
   A transferência *é* uma movimentação origem→destino, e o formulário de `MovimentacoesAlmoxarifado`
   já tem os dois campos de localização e o seletor de lote — 90% dela já está construído. A
   devolução não é: o fluxo dela é material → saídas daquele material → devolver com herança de
   lote, e não cabe num formulário genérico. Duas telas dedicadas foi descartado por duplicar
   seletor de material, de localização e de lote; tela única com abas foi descartada por juntar
   dois assuntos que não compartilham nada além de "mexem em material".

8. **Transferência NÃO checa status do lote** (bloqueado / reprovado / vencido). Mover um lote
   reprovado de prateleira é legítimo — é assim que ele vai parar na área de bloqueados. A guarda
   de status continua só na saída, que é onde ela protege alguma coisa. Decisão explícita, com
   teste que a fixa.

9. **Série na transferência: fora do escopo, declarado.** As séries guardam `localizacao_id`, mas
   movê-lo exigiria um seletor de séries na transferência e um caminho novo no motor (o claim de
   série hoje só existe para entrada e saída). O `localizacao_id` da série é informativo; o saldo
   real vive em `estoque_saldo_almoxarifado`, que a transferência move corretamente. Pendência
   declarada na spec 11.

10. **Série no descarte de devolução: fora do escopo, declarado.** Devolução com série cobre
    destino `ESTOQUE` e `QUARENTENA` (o motor reativa `ENTREGUE → EM_ESTOQUE` via
    `seriesService.entradaSeries`). Para sucatear uma peça serializada devolvida, o caminho é
    devolver ao estoque e depois sucatear em **Movimentações**, que já tem seletor de série.
    Suportar direto exigiria encadear entrada+saída de série com compensação no meio — risco
    desproporcional ao ganho, e os dois passos já funcionam hoje.

11. **Fora do escopo, declarado nas specs 11 e 12:** aprovação de transferência (feature 06);
    e-mail e alerta "transferência não recebida" (features 19/20); fotos/anexos da devolução;
    devolução ao fornecedor (fluxo próprio com documento); estorno de custo de projeto
    (feature 22); tipos de devolução por origem (ferramenta → feature 16, cliente → feature 13).

## O bug do SUCATA (achado nesta sessão, por sonda executada)

Devolver material para sucata **baixa o estoque duas vezes**. O material já tinha saído na
entrega; o `returnService` emite um `SUCATA` (tipo de saída para o motor), que desconta de novo
um saldo que nunca voltou.

Medido com `createTestApp` real, com controle positivo:

```
estoque inicial          => 100
saída 10                 => 90
devolução 3 → SUCATA     => 87      ← errado, deveria ser 90
devolução 2 → ESTOQUE    => 89      ← controle positivo: a sonda sabe medir
```

Nenhum teste existente pega isso, e nem a spec 12 nem o guia mencionam. A leitura do código não
mostrava o problema — só a execução, que é a lição já registrada para o motor de estoque.

**Correção adotada:** destino `SUCATA` passa a emitir **`ENTRADA_DEVOLUCAO` seguida de `SUCATA`**
— entra e sai. O saldo fecha em 90 e o livro conta as duas coisas: voltou, e foi sucateada.
Alternativa descartada: não movimentar nada no destino `SUCATA`. O saldo também ficaria certo,
mas a sucata sumiria do livro — e a feature 15 (retalhos e sucatas) vai precisar dela lá.
`RETRABALHO` já estava correto: é tipo neutro ao saldo desde a Etapa 6.

A correção vai em **commit próprio**, separada das features da etapa, porque é conserto de bug
com causa e consequência próprias.

## Arquitetura

### Transferência — 3 mudanças de backend, nenhuma tabela nova

| O quê | Onde |
|---|---|
| `TRANSFERENCIA: { vinculo: 'nenhum' }` em `REGRAS_VINCULO` | `services/almoxarifado/movementRules.js` |
| Guarda de `exigeLote` passa a alcançar `TRANSFERENCIA` | `services/almoxarifado/stockService.js` |
| `POST /transferencias` declara `{ exigeLote: true }` no **4º argumento** | `routes/almoxarifado/extended.js` |

**Ponto de atenção que muda a implementação:** `TRANSFERENCIA` **não está** em `tiposEntrada` nem
em `tiposSaida` (é um ramo próprio no `stockService`), e a guarda do `exigeLote` hoje só dispara
para esses dois conjuntos. Exigir lote na transferência **não sai de graça** — precisa de uma
condição própria no `if` da guarda. Quem implementar sem notar isto vai declarar `exigeLote: true`
na rota, ver o teste continuar passando sem lote, e concluir errado que já funciona.

**`exigeLote` continua no 4º argumento, nunca no body** — padrão fixado nas Etapas 6/6b: a rota
repassa `req.body` inteiro, então ler a exigência de lá permitiria ao cliente desligá-la mandando
`exigeLote: false` no JSON.

### Devolução — 2 colunas, 1 rota de leitura, validações no serviço

**Schema** (via `safeAlter`, nenhuma tabela nova):

```
devolucoes_material_almoxarifado.movimentacao_saida_id INTEGER
devolucoes_material_almoxarifado.lote_id              INTEGER
```

**Rota nova de leitura** — `GET /api/almoxarifado/devolucoes/saidas-elegiveis?material_id=X`
(só `auth`, como o `GET /devolucoes` que já existe). Devolve as saídas daquele material —
tipos `SAIDA`, `SAIDA_PRODUCAO`, `SAIDA_MONTAGEM`, `SAIDA_ASSISTENCIA`, com `cancelado = 0`, as
30 mais recentes — cada uma com:

- data, tipo, quantidade, `lote_id` e o código do lote congelado na movimentação;
- `requisicao_id` (+ número), `os_id`, `projeto_id`, `usuario_nome`;
- `quantidade_devolvida` — soma das devoluções que já citam aquela movimentação;
- `saldo_devolvivel` = quantidade − devolvida (linhas zeradas voltam mesmo assim, desabilitadas na
  tela: "já devolvido por inteiro" é informação útil, não ruído);
- `series` — os números com status `ENTREGUE` e `movimentacao_saida_id` igual à saída, quando o
  material tem `controle_serie`. Isto é uma **query**, não uma estrutura nova:
  `series_almoxarifado` já tem a coluna `movimentacao_saida_id` desde a Etapa 6b.

`SUCATA`, `PERDA` e `AJUSTE_NEGATIVO` ficam fora da lista de propósito: não se devolve o que foi
descartado ou corrigido.

**`returnService.registrarDevolucao` — validações novas.** Quando `movimentacao_saida_id` vier:

1. a movimentação existe, não está cancelada, é do **mesmo material** e é de um tipo de saída
   elegível — senão 400;
2. `quantidade + já devolvido ≤ quantidade da saída` — senão 400 **dizendo quanto resta**
   (mensagem de erro que não diz o número obriga o operador a adivinhar);
3. herda o `lote_id` da saída quando o material tem `controle_lote` e nenhum lote foi informado.

Sem vínculo, o comportamento atual continua — e a tela oferece seletor de lote em material
controlado. Como agora **existe onde informar o lote nos dois caminhos**, a entrada de devolução
passa a declarar `exigeLote: true` honestamente, saindo da lista de fluxos internos isentos da
spec 10. Séries seguem o mesmo raciocínio: `series: [...]` + `exigeSerie: true` quando o material
é serializado e o destino é `ESTOQUE`/`QUARENTENA`.

**Consistência de rastro:** hoje só os destinos `ESTOQUE`/`QUARENTENA` gravam
`referencia: DEV-<id>` na movimentação; `SUCATA` e `RETRABALHO` não. Passam a gravar também — sem
isso, a devolução que virou sucata fica sem nenhum fio ligando o lançamento do livro ao registro
da devolução.

### Telas

**`MovimentacoesAlmoxarifado.js`** — `TRANSFERENCIA` entra em `TIPOS_FORM`, mostrando origem **e**
destino (hoje `SAIDA` mostra só origem, `ENTRADA` só destino) e o seletor de lote, reaproveitando
o mecanismo de `TIPOS_SAIDA_LOTE`, mas com a variante que ignora vencimento — a mesma lógica que
`loteDisponivelParaTipo` já aplica ao descarte, pela decisão 8.

No mesmo arquivo, **`DEVOLUCAO` sai de `TIPOS_FORM`**: registrar "Devolução" ali cria uma
movimentação solta, sem motivo, sem condição e sem destino, e **não cria registro nenhum** na
tabela de devoluções. Continua em `TIPOS` (a lista completa), senão o livro para de exibir os
lançamentos antigos. Um hint aponta a tela nova.

**`/almoxarifado/devolucoes`** — tela nova no molde de `LotesAlmoxarifado`: lista (data, material,
quantidade, motivo, condição, destino, saída de origem, responsável) e modal `.almox-modal` com o
fluxo: material → escolhe a saída de origem **ou** "devolução avulsa" → quantidade limitada ao
devolvível → condição pré-selecionando o destino → motivo (a lista `MOTIVOS` que o serviço já
exporta) e observações → lote herdado em modo leitura, ou seletor quando não há o que herdar →
checkboxes de série. Rota em `App.js`, item no menu do `Layout`, e `useAlmoxPermissoes` /
`bloquearSeNaoPode` como as outras telas do módulo. A permissão continua `movimentar`, que é a
que a rota já exige — a UI só barra antes do formulário.

## Componentes e limites

| Unidade | Faz | Depende de |
|---|---|---|
| `movementRules.js` | declara a regra de vínculo de `TRANSFERENCIA` | nada |
| `stockService.js` | guarda de lote passa a alcançar o ramo `TRANSFERENCIA` | material, lote |
| `returnService.js` | valida vínculo/quantidade, herda lote, orquestra os movimentos por destino | `stockService`, `seriesService`, `lotService` |
| rota `saidas-elegiveis` | leitura agregada (saídas + devolvido + séries) | `movimentacoes`, `devolucoes`, `series` |
| `DevolucoesAlmoxarifado.js` | tela e sugestão condição→destino | as duas rotas de devolução |
| `MovimentacoesAlmoxarifado.js` | ganha `TRANSFERENCIA`, perde `DEVOLUCAO` do formulário | rota de transferências |

A sugestão condição→destino vive **só na tela**. O backend aceita qualquer combinação — quem
decide o destino é quem está com a peça na mão, e uma regra rígida no motor criaria um caso sem
saída (material bom que precisa ir para inspeção por outro motivo).

## Tratamento de erro

- Devolução acima do entregue → 400 nomeando o saldo devolvível restante.
- `movimentacao_saida_id` inexistente, cancelada, de outro material ou de tipo não elegível → 400
  com a razão específica (não uma mensagem genérica de "saída inválida").
- Transferência de material com `controle_lote` sem lote → 400 do motor, mesma mensagem já usada
  na movimentação manual.
- Transferência acima do saldo da origem → 400 (guarda no `WHERE` do `UPDATE`, já existente).
- Devolução para sucata em material serializado → a tela não oferece as séries e explica o
  caminho (devolver ao estoque, depois sucatear em Movimentações), em vez de falhar no envio.

## Testes

**`server/tests/api/devolucaoVinculo.api.test.js`** (novo)

| Teste | Prova |
|---|---|
| `devolucao acima da quantidade entregue falha` | a validação de quantidade |
| `devolucao sem saida original valida falha` | id inexistente, de outro material e cancelada |
| `devolucao para quarentena nao aumenta disponivel` | regra essencial da spec 12 |
| `devolucao boa aumenta saldo com movimentacao vinculada` | regra essencial da spec 12 |
| `devolucao herda o lote da saida original` | decisão 4 |
| `devolucao para sucata nao baixa estoque duas vezes` | **o bug**, com controle positivo |
| `devolucao de material com serie reativa a serie da saida` | decisão 10, caminho suportado |

**`server/tests/api/transferenciaRegras.api.test.js`** (novo)

| Teste | Prova |
|---|---|
| `transferencia de material com controle de lote sem lote falha` | decisão 4 + a armadilha do ramo próprio |
| `transferencia com lote move a linha do lote entre localizacoes` | comportamento da Etapa 6 preservado |
| `transferencia acima do saldo da origem falha` | regra essencial da spec 11 |
| `transferencia de lote bloqueado e permitida` | decisão 8, fixada como intenção |

**Client:** teste da tela nova no molde de `LotesAlmoxarifado.test.js`, cobrindo a sugestão
condição→destino e o limite de quantidade pelo devolvível.

**Controle positivo obrigatório** no teste do SUCATA: o mesmo arquivo prova que a medição sabe
falhar (uma devolução para `ESTOQUE` que soma), como a sonda desta sessão fez. Teste de saldo que
passa de primeira nesta base já enganou três vezes.

## Documentação a atualizar ao fim da etapa

1. `specs/modulo-almoxarifado/11-transferencias/README.md` — checklist com hash por item; o
   trânsito marcado como **cortado por decisão do cliente**, com o motivo (site único), não como
   pendência; série na transferência declarada como fora de escopo.
2. `specs/modulo-almoxarifado/12-devolucoes/README.md` — idem; **corrigir a spec**, que descreve o
   destino `SUCATA` como se estivesse correto; declarar a limitação de série no descarte.
3. `specs/modulo-almoxarifado/10-lotes-series-etiquetas/README.md` — a devolução sai da lista de
   fluxos internos isentos de `exigeLote`.
4. `specs/modulo-almoxarifado/README.md` — linha das features 11 e 12, Etapa 7 ✅, próxima etapa
   da ordem: **Etapa 8 — materiais de clientes e terceiros**.
5. `docs/almoxarifado-guia-etapas-e-testes.md` — cabeçalho "onde o desenvolvimento parou", seção da
   Etapa 7 com "Antes → Agora", roteiro clicável e o que a etapa não cobre. **O bug do SUCATA
   precisa estar no guia**: quem já usou o sistema pode ter saldo errado em casa.
6. `docs/superpowers/plans/2026-08-12-almoxarifado-etapa7-transferencias-devolucoes.md` — tasks
   marcadas com hash e a próxima tarefa detalhada.
