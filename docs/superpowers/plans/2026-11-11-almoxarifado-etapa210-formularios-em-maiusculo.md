# Etapa 210 (núcleo) — textos dos formulários em maiúsculo

> Pedido da empresa via André (11/11/2026): "mudar todos os textos de todos os formulários pra caps lock, tanto ao digitar quanto
> colar". Estimativa `99e780ba` (`docs/estimativas/2026-11/estimativa_2026-11-11_formularios-em-maiusculo.md`): 5h30 (4h + 1h30).
> A Etapa 209 (almoxarifado, T0–T5 feitas) fica parada na T6 e é retomada depois desta.

## Medido antes (Fase 0)

- 141 arquivos de tela com `<input>`/`<textarea>`, 949 campos, 475 não texto. 22 `email`/`password`/`url`.
- Já existe a regra no fornecedor (Compras 192, `e8bd4374`): CSS `text-transform` + corpo subido no envio, porque trocar o valor a
  cada tecla "pulava o cursor". Aqui o pedido inclui **colar** e é para **todos** os formulários: trocar tela a tela (141 arquivos)
  é o caminho caro e esquecível (tela nova nasceria minúscula). Escolhido: um **utilitário global** iniciado no `index.js`, como os
  três do celular (`iniciarTabelasComoCartoes` etc.), que vale para tela que ainda nem existe.
- O servidor já tem `services/buscaSemCaixa.js` (Etapa 159): a busca procura o termo como veio, em MAIÚSCULAS e em minúsculas, porque
  o `LIKE` do SQLite só ignora a caixa sem acento (`'SÃO' LIKE '%são%'` = 0). Várias buscas ainda usam `LIKE` cru.

## Regras de negócio

- **RN-210.01** — Campo de texto (`<input>` de tipo texto, ou sem tipo, e `<textarea>`): o que é digitado **ou colado** vira
  MAIÚSCULO com acento (`toLocaleUpperCase('pt-BR')`, "são joão" → "SÃO JOÃO") no mesmo instante, e o valor que a tela guarda e
  envia já é o maiúsculo. O cursor fica onde estava (corrigir no meio do texto não pula para o fim).
- **RN-210.02** — Ficam **fora**: e-mail, senha, endereço de site (`type` email/password/url, ou `name`/`id`/`autocomplete` que diga
  e-mail, senha, url, site, link, token, host); campos numéricos/data/etc. (não são texto); **caixas de busca e filtro** (`type=search`
  ou placeholder começando com Buscar/Pesquisar/Procurar/Filtrar) — não são dado gravado, e a busca já ignora caixa; o **editor do
  documento da proposta** (texto editável dentro da folha, não é campo); a **mensagem do chat** (conversa, não formulário); e qualquer
  campo marcado com `data-sem-maiusculas` (a saída para casos futuros).
- **RN-210.03** — Teclado de celular que monta a palavra (composição): não mexe no meio da composição; sobe quando a palavra fecha.
  Enquanto isso o campo **mostra** em maiúsculo (CSS), então quem digita não vê minúscula.
- **RN-210.04** — Os cadastros já gravados **não** são convertidos (conversão em massa é irreversível — letra B). Um campo antigo em
  minúsculo só sobe se for editado.
- **RN-210.05** — A busca do servidor acha o texto em qualquer caixa, com acento: as buscas que ainda usam `LIKE` cru passam a usar a
  `condicaoDeBusca` da 159 (como veio, MAIÚSCULAS, minúsculas). Assim "são" acha o "SÃO" novo e "SÃO" acha o "são" antigo.

## Contratos

Nenhuma rota nova nem mensagem nova. RN-210.05 só muda o que as buscas existentes acham (passam a achar mais, nunca menos: a forma
"como veio" continua no `OR`).

## Tasks

| # | Task | Tipo | Estado |
|---|---|---|---|
| T1 | `client/src/utils/maiusculasNosFormularios.js` (`iniciarMaiusculasNosFormularios`, `campoVaiEmMaiusculas`) + teste Jest com controle positivo; iniciado no `index.js`; CSS da classe de foco | galho (tela) | feita `7d819264` |
| T2 | Exclusões explícitas: `data-sem-maiusculas` no chat e no que a varredura achar | galho (tela) | feita `7d819264` (chat) e `aa545678` (lote, serie, config. da proposta — Fase 5) |
| T3 | Servidor: buscas com `LIKE` cru de texto digitado → `condicaoDeBusca`; teste pelo servidor real | galho (servidor) | feita `fca14c27` (worktree, cherry-pick de `e5688073`) |
| T4 | Integração: componente React controlado de verdade (estado recebe o maiúsculo ao digitar e ao colar) | integração | feita junto da T1 (`7d819264`): os cenarios montam um formulario React controlado |
| T5 | Fechamento (`fechar-etapa`) | — | feita (commit do fechamento) |

T1/T2 e T3 não dividem regra: a tela não depende do servidor e vice-versa (RN-210.05 vale mesmo sem a tela).

### Como a T1 funciona (para quem retomar)

Ouvinte de `input` em `document`, **fase de captura** — roda antes do React 18 (que escuta no `#root`). Sobe o valor pelo **setter
nativo** (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set`): atribuir `el.value = x` atualizaria o rastreador
de valor do React e o `onChange` não dispararia. Depois devolve a seleção (`setSelectionRange`) contando o comprimento do prefixo
subido. Com `isComposing`, não mexe; no `compositionend`, sobe e dispara um `input` novo.

## Execução (2026-11-11)

- **Divergência do plano — a Fase 2 não rodou como agente à parte:** o plano é curto e sem contrato novo; no lugar, a revisão adversarial da
  Fase 5 rodou sobre o código pronto e achou o que a RN-210.02 não previa (abaixo). Registrado aqui para não parecer pulado.
- **Fase 5 (revisor fresco, lente "campos que não podem subir"):** 3 achados reais, todos reproduzidos lendo o código: (1) **lote e série**
  são achados pelo texto exato no servidor (`criarOuObterLote`, séries) — subir duplicava lote/série antigos; (2) **Variáveis técnicas**: a
  lista condicional é chaveada pelo texto da 1ª escolha, subir apagava as sub-opções ao salvar; (3) **Modelo da proposta**: cabeçalho/rodapé
  com HTML (caminho de imagem) e o `{numero}` do formato. Corrigidos em `aa545678` com `data-sem-maiusculas` (B1431). Dois viraram aviso:
  Ctrl+Z (C511) e `ß` acima do limite (C512). 0 ruído.
- **RN-210.02 estava incompleta** (dizia só e-mail, senha, site, busca, editor e chat): ganhou lote, corrida, série e as duas telas de
  configuração da proposta — corrigida na B1431, não apagada em silêncio.
- **Testes:** tela `maiusculasNosFormularios.test.js` 8/8, controle positivo de 4 sabotagens (4, 2, 2 e 1 vermelhos, md5 de volta);
  servidor `buscaSemCaixaNasBuscasRestantes.api.test.js` 9/9, controle positivo voltando os 9 arquivos ao HEAD (8 de 9 vermelhos; o de
  fornecedores é guarda de regressão — a rota viva já usava a régua). Navegador: digitar e colar no meio das Observações da requisição
  sobem com o cursor no lugar; o e-mail do login fica minúsculo.
- **Verificação final NÃO concluída:** a suíte inteira do servidor (`test:api`, `test:almoxarifado`, validation/safealter/sqlite) e a rodada inteira da tela depois do `aa545678` foram **interrompidas pelo sistema por falta de memória** na máquina, sem resultado. O que foi medido: tela inteira 215/215 arquivos (2956 testes) e build CI ok **antes** do `aa545678`; as 16 suítes das telas tocadas pelo `aa545678` (268 testes) depois dele; no worktree do servidor, `test:api` 575/578 — as 3 que falharam (`filaSugestaoColeta*`, `preSelecaoColetaIntegracao`) eram datas fixas já trocadas por relativas na `main` (Etapa 197), não esta etapa. Falta rodar as cinco suítes na `main`.
- **Spec de feature:** não há pasta em `specs/` para o núcleo de formulários; a regra mora neste plano, nas novidades (B1430–B1433) e no
  manual ("Textos em maiúsculo").

## Retro (4 números)

- Rodadas de correção até verde: 1 (a da Fase 5).
- Achados da revisão: 3 reais, 0 ruído (mais 2 avisos registrados).
- Paralelismo: 2 galhos de fato (tela comigo, servidor em worktree), sem retrabalho.
- Defeito que escapou: preencher na próxima etapa.

## Próxima tarefa detalhada

Voltar à **Etapa 209** (almoxarifado, *o bloqueio sabe o lote*), pela **T6** — o plano
`docs/superpowers/plans/2026-11-07-almoxarifado-etapa209-bloqueio-sabe-o-lote.md` tem a T6 detalhada (T0–T5 feitas). Atenção: os campos
de lote da tela (recebimento e movimentação) agora levam `data-sem-maiusculas`; a T6 que mexer em tela de lote deve manter o atributo.
