# 00 — Processo atual (como a frota é controlada hoje)

> **Status:** aguardando os arquivos. **Coloque aqui:**
>
> - o **formulário** que vai para o motorista (Word, PDF, foto, link do Forms — o que for);
> - a **planilha de Excel** onde tudo é passado a limpo;
> - se puder, **um exemplo preenchido** de cada (pode ser com dado fictício).
>
> Sugestão de nomes: `anexos/formulario-motorista.*`, `anexos/planilha-frota.xlsx`.

## O fluxo de hoje

1. A empresa manda o formulário para o motorista.
2. O motorista preenche.
3. Alguém do escritório passa a limpo na planilha de Excel, que centraliza tudo.

## O que precisa ser respondido com os arquivos (para desenhar o portal do motorista)

- **Quando** o motorista preenche? A cada abastecimento, a cada viagem, por dia, por semana?
- **Quais campos** o formulário pede? (Comparar com o que o sistema já grava — lista em
  [`docs/frotas/referencia-tecnica.md`](../../../docs/frotas/referencia-tecnica.md#tabelas).)
- O formulário mistura assuntos (abastecimento + km + checklist + ocorrência num papel só)? Se sim, a
  tela do motorista deve ser **um formulário só**, não oito telas.
- Tem **foto** ou comprovante (cupom do posto)? O módulo hoje não guarda anexo.
- Quais **colunas da planilha** são calculadas (km/L, custo por km, total do mês)? Essas o sistema
  calcula; o motorista não digita.
- Quem usa a planilha depois, e para quê? (Isso decide a exportação.)
