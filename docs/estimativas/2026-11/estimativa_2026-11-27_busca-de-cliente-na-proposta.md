# Estimativa 27/11/2026 — busca do cliente na proposta

Pedido (print do select de Cliente aberto): "Essa parte de selecionar o cliente esta ruim, pensa nisso com 5k de clientes".

| # | Tarefa | Execucao estimada | Regua horas.js | Informado | Etapa/plano | Regua usada | Execucao medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Campo de busca do cliente na proposta | 1h15 | componente novo + parametro no servidor + testes | 1h15 | — | Compras: alteracao de cadastro (~1h a 1h30) | ~30min | 30min | 5e21469 |

Medido antes: PropostaForm.js carrega GET /clientes?status=ativo (SELECT * de todos) ao abrir e so usa a lista no <select>. O servidor ja
busca (`search`: razao social, fantasia, CNPJ, com acento - Etapa 159); falta limitar a resposta. Nao ha combobox no client para reaproveitar.

Medir no fechamento:
`node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-27 --ate 2026-11-27 --grupos "Busca cliente=busca do cliente|cliente na proposta"`

Fechamento: horas.js deu 5e21469 ~16min; o ~88min de 302ca0b conta o intervalo desde o ultimo commit da OUTRA maquina (4bb2d32, Etapa 277), nao esta tarefa. Execucao desta: ~15 min de leitura antes da estimativa + ~16 min depois = ~30 min.
