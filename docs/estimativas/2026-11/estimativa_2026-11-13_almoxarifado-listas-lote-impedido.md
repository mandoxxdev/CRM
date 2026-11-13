# Estimativa 13/11/2026 — almoxarifado: as listas de saldo dizem quanto está em lote impedido (C481, 2ª parte)

Origem: "Próxima tarefa detalhada" do plano da Etapa 222 (`docs/superpowers/plans/2026-11-13-almoxarifado-etapa222-extrato-lote-impedido.md`).

Medido no código antes de estimar (sobre `fbdf485c`):

- **Achado de premissa:** a próxima tarefa da 222 dizia que `/estoque` é consumido por "Materiais/Estoque (a coluna *Disponível*)". **Não é:**
  não existe tela "Estoque"; a tela **Materiais** (`MateriaisAlmoxarifado` → `TabelaMateriais`) lê `GET /api/almoxarifado/materiais`
  (`routes/almoxarifado.js:430`, `listarMateriais`, compartilhada com `/api/compras/materiais/cadastro`) e mostra a coluna *Quantidade*
  (o físico), sem *Disponível*. `GET /estoque` (`stockService.consultarEstoque`, `:3988`) só é lido por **Reservas** (a lista do
  `<select>` da Nova Reserva, `(Disponível: n un)`) e **Inspeções** (`quantidade_bloqueada`). Relatórios usam o `reportService` (outra SQL).
- **Custo medido** (sonda `e223-custo.js` no scratchpad, cópia do banco de dev inflada para 3.022 materiais ativos, 904 com controle de lote,
  4.505 lotes, 180 mil movimentos; mediana de 15 rodadas): `/estoque` 90 ms → **125 ms** com `loteImpedidoSql('m')`; a SQL do `/materiais`
  79 ms → **114 ms**. **+35 ms** na lista inteira — abaixo do limite de ~200 ms da próxima tarefa: o campo vai sempre, sem opt-in.
  O banco de dev real (22 materiais, 4 com lote): 0,8 → 1,4 ms.
- Sem migration, sem trava (só leitura), sem perfil novo. A fatia visível: o número embaixo da *Quantidade* na lista de Materiais e ao lado
  do *Disponível* no `<select>` da Nova Reserva.

| # | Tarefa | Execução estimada | Fator | Informado | Etapa/plano | Régua usada | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | A lista de Materiais e a lista da Nova Reserva mostram quanto está em lote bloqueado, reprovado ou vencido (C481, 2ª parte) | 1h | média (análise 30 min + teste 1 h) | 2h30 | 223 | Etapa 222 mediu 0,7 h (um campo de leitura + duas telas pequenas); aqui o mesmo porte: um campo em duas rotas + duas telas | — | — | — |

Incerteza: baixa — a régua é a mesma da 222 (já testada), e o custo foi medido. Não foi quebrada: 2h30 não passa do teto da skill. Os
relatórios (que somam o disponível pela SQL do `reportService`, com colunas fixas no registro) ficam fora.

Medição no fechamento:
```
--grupos "E223=Etapa 223|Estimativa: almoxarifado - listas"
```
