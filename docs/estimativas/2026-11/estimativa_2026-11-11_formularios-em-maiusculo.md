# Estimativa 2026-11-11 — textos dos formulários em maiúsculo

Pedido da empresa, via André (11/11): "mudar todos os textos de todos os formulários pra caps lock, tanto ao digitar quanto colar".

Medido no código (11/11): 141 arquivos do `client/src` com `<input>`/`<textarea>`, 949 campos, dos quais 475 não são texto
(number, date, checkbox, file…). 22 campos `email`/`password`/`url` — ficam fora. O editor da proposta
(`PropostaPreviewEditavel.js`, contentEditable) fica fora: é texto livre de documento.

Molde: Compras Etapa 192 (`e8bd4374`, 30/10) — fornecedor em maiúsculas: CSS `text-transform` enquanto digita + corpo enviado
já em `toLocaleUpperCase('pt-BR')`; descartado trocar o valor a cada tecla (cursor pulava). Aqui o pedido é **global** e inclui
colar, então o caminho previsto é um ouvinte único de `input` na fase de captura (antes do React), que sobe o valor e devolve o
cursor ao lugar — em vez de mexer nos 141 arquivos. A mesma 192 mostrou o efeito colateral do item 2: `LIKE`/`UPPER` do SQLite
só ignoram caixa em ASCII (acento).

Decisões a registrar na letra B ao executar: os já cadastrados **não** são convertidos (conversão em massa é irreversível);
quais campos ficam fora (e-mail, senha, site, editor da proposta; a conferir: chave de nota fiscal, código de barras).

| # | Tarefa | Execução estimada | Fator | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Tudo em maiúsculo ao digitar e ao colar | 1h | análise 30 min + 30 min (decisão das exceções); teste 1h30 + 30 min (celular) | 4h | 210 (plano `6660594d`) | Etapa 192 F1 (maiúsculas do fornecedor, ~20-30 min, um formulário) × mecanismo global + varredura das exceções | 1,2 h do pacote (horas.js --grupos "Maiusculo=maiuscul|Etapa 210", 11/11), rateado pela execução estimada → 45 min | 3h45 (45 min + análise 1 h + teste 2 h, da tabela — não informado pelo André) | 7d819264, aa545678, af226b25 |
| 2 | Buscas continuam achando os cadastros antigos | 45 min | pequena com regra: 15 min + 30 min | 1h30 | 210 (plano `6660594d`) | o ajuste de busca da 192 F1 | rateio do pacote → 30 min (o commit foi cherry-pick de um agente em paralelo; o tempo dele não aparece no horas.js) | 1h15 (30 min + 15 min + 30 min, da tabela) | fca14c27 |

Total: 5h30.

Medição no fechamento:
```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-11-11 --ate <fim> --grupos "Maiusculo=maiuscul;Busca acento=busca.*acento|acento.*busca"
```
