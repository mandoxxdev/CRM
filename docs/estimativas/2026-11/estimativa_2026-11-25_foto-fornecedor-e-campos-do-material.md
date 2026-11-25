# Estimativa 25/11/2026 — foto do fornecedor e campos do cadastro de material

Pedido do Andre (25/11), com prioridade sobre os itens 8 a 22 da estimativa de 23/11. O item 2 substitui os itens 23 (Aplicacao) e,
em parte, 25 (Especificacoes; a Descricao entra, Observacoes fica) da estimativa de 23/11 — estes deixam de "depender de resposta".

Regua: horas.js (tempo medido, sem parte fixa). Fatias de tela da semana mediram 30 min cada (Etapas 260-262).

| # | Tarefa | Execucao estimada | Informado | Etapa/plano | Medido antes | Execucao medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|
| 1 | Foto do fornecedor | 1h | 1h | Etapa 263 | coluna `fornecedores.foto` ja existe (ALTERS_FORNECEDORES, `server/index.js`); `FornecedorForm.js` nao usa; molde: foto do material (`MaterialAlmoxarifadoForm.js`) | ~21 min (rateio de 0,7 h) | 30 min | `9bf903a8` (+ `b2ad50db`, `b0304e68`) |
| 2 | Tirar Aplicacao, Especificacoes Tecnicas e Descricao do cadastro de material | 1h | 1h | Etapa 263 | `MaterialAlmoxarifadoForm.js:741` (Descricao), `:971` (Aplicacao), `:976` (Especificacoes); colunas ficam; texto antigo so leitura | ~21 min (rateio de 0,7 h) | 30 min | `6e9d07ca` (+ `b2ad50db`, `b0304e68`) |

Linha para medir: `--grupos "Foto do fornecedor=foto do fornecedor|Etapa 263.*fornecedor;Campos do material=Aplicacao|Especificacoes|campos do cadastro de material"`

## Fechamento (Etapa 263, 25/11/2026)

Medido com a linha acima (`horas.js --desde 2026-11-25 --ate 2026-11-25 --grupos ...`): **0,7 h** para o pacote, todo no grupo "Foto do
fornecedor" porque os commits de plano e fechamento citam os dois assuntos e o primeiro grupo que casa leva. Os dois itens rodaram juntos:
rateio pelo estimado (1h : 1h) → ~21 min cada; arredondado para cima → **realizado 30 min + 30 min = 1h** contra **2h** estimadas.

**Item 1 menor do que o medido antes:** a estimativa supunha fazer o envio da foto no molde do material; no meio da etapa veio a informação de que
a tela do grupo homologado já enviava e mostrava a mesma foto, pelas rotas que existiam — o item virou reusar essas rotas e funções na ficha e
tirar a foto pela chave `foto` do salvar (sem rota nova; B94). Item 2 também coube abaixo da régua "alteração de cadastro no Compras" (1h a
1h30): a régua de "tirar um campo" (30 min) acertou. Conclusão: `conclusao_2026-11-25_foto-fornecedor-e-campos-do-material.txt`.
