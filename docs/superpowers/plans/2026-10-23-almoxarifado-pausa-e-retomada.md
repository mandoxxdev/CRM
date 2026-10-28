# Almoxarifado — pausa de 2026-10-23 e como retomar

> **Leia isto primeiro** se você é a sessão que vai continuar o módulo almoxarifado.
> O desenvolvimento foi **pausado a pedido do André em 2026-10-23**, para começar outro
> assunto. Nada ficou pela metade no código: a última etapa com código (190) está fechada
> e a seguinte (191) só tem o plano.

## 1. Onde parou, em uma linha

**Etapa 190 fechada. Etapa 191 com o plano commitado (`c0cce170`) e a revisão do plano
(Fase 2) ainda NÃO feita. Nenhum commit foi empurrado (push pendente — ver seção 5).**

## 2. Como retomar (passo a passo)

1. `git log --oneline -5` na `main` — o topo deve ser o fechamento da 190 (seção 3) ou este arquivo.
2. Leia o processo: `CLAUDE.md` da raiz, as skills `.claude/skills/desenvolver-etapa/SKILL.md`
   (chamava-se `desenvolver-etapa-almoxarifado` até 2026-10-28; hoje vale para todos os módulos)
   e `.claude/skills/fechar-etapa/SKILL.md`.
3. Abra o plano da 191: `docs/superpowers/plans/2026-10-23-almoxarifado-etapa191-corrigir-validade-de-lote.md`.
   **Comece pela Fase 2** (revisor fresco do plano, as quatro perguntas da skill). Pontos que o revisor
   tem de olhar com atenção (já levantados antes da pausa, ainda sem resposta):
   - **risco de controle:** corrigir a validade de um lote vencido para uma data futura faz o lote
     voltar a sair **sem passar pela liberação de vencido** (ação `inspecionar`). É brecha? Como fechar
     (exigir quem libera? motivo + auditoria bastam?);
   - o e-mail de "lote vencendo" que **já está na fila** não é reconferido no envio — sai com a data velha;
   - separação planejada de um lote cuja liberação de vencido é anulada pela correção — a entrega fica presa?;
   - o cenário 16 da 190 (recebimento com lote existente) tem de continuar verde.
4. Depois: execução T1 → T4, Fase 5 (revisão adversarial por execução), fix-round, `fechar-etapa`.
5. Números livres: letra **B** — B1283 a B1289 soltos e **B1290–B1299 reservados para a 191**;
   letra **C a partir de C458**; letra **A a partir de A111**.

## 3. O que foi feito nesta leva (2026-10-22 e 2026-10-23)

Cada etapa passou por: plano → revisão fresca do plano → execução com TDD e controle positivo →
revisão adversarial por execução → fix-round → fechamento (7 artefatos). O detalhe de cada uma está
no plano dela em `docs/superpowers/plans/` e na seção dela em `docs/almoxarifado-novidades-por-etapa.md`.

| Etapa | O que resolve | Fechamento |
|---|---|---|
| 171 | Pedido de compra vinculado a uma OS; material recebido fica reservado para a OS | ver plano |
| 172 | Requisição com OS cadastrada; a cesta dos outros módulos voltou a enviar | `b4b8f400` |
| 174 | Entrega grava a OS; consumo por OS com devolvido e líquido | `9d2b74da` |
| 176 | Recebimento informa a OS (material de cliente para industrialização) | `27ae07af` |
| 178 | Entrega de EPI com assinatura no tablet, HMAC + cadeia (NR-6) | `d358fc49` / `3c9a1d68` |
| 180 | Termo de responsabilidade no empréstimo de ferramenta | `7446bf35` |
| 181 | Relatório de EPI por colaborador; nome do colaborador mascarado | `5feba6b2` |
| 182 | Alerta "material separado aguardando retirada há N dias" | `8515946a` |
| 183 | Ficha de EPI com matrícula confirmada e aparelho | `43593b68` |
| 184 | Nome/e-mail dos aprovadores da liberação por valor fora da leitura pública | `35865117` |
| 185 | Ficha de EPI e termo de ferramenta: texto dentro da folha | `c90b403f` |
| 186 | Remessa, posição do cliente e etiquetas dentro da folha; helper `pdfTexto.js` | `a96546c4` |
| 187 | Ferramenta baixada não calibra nem edita; selo/aviso da restrição da manutenção | `e244ae30` |
| 188 | Fila de separação sugere de onde pegar e a ordem de coleta | `2e548a9f` |
| 189 | Janela de separação pré-seleciona o "Sai de"; lista de coleta em PDF | `1ccb47f4` |
| 190 | Entrada manual grava a validade do lote (antes descartava em silêncio desde a Etapa 6) | `2d61ea49` |

**Da outra sessão (`crm-main-20`, mesma máquina):** 173 (F2 abre o fornecedor), 175 (edição de
ferramenta), 177 (retorno da manutenção) — integradas na `main`. **A 179 está reservada para ela,
sem código.** Antes de abrir etapa em ferramentas, confira com ela (a 187 foi combinada assim).

## 4. O que falta fazer (fila sugerida, em ordem)

1. **Etapa 191** — corrigir validade de lote com saldo (plano pronto; Fase 2 pendente).
2. **Etapa 192 (candidata)** — o recebimento com lote já existente de outra validade (hoje fica como
   está; fixado pelo cenário 16 da 190). Rascunho no plano da 190/191.
3. **C454** — com a janela de separação aberta, trocar de aba e voltar faz as quantidades digitadas
   voltarem ao valor inicial (3 → 5). Anterior à 189. Etapa pequena.
4. **C452** — o ramo "Separar e entregar" de `RequisicoesList.js` (~:1079) é código morto (o botão só
   aparece quando o ramo não roda). Anterior (jun/2026).
5. **C453 / C451 / B204** — separar em duas rodadas sem entregar no meio troca a origem e, em material
   com lote, a saída automática gera linha sem lote negativa. Defeito antigo do motor; mexe no motor
   (tronco, revisão pesada).
6. **C449** — `checarOrigemItem` não desconta o separado de outras requisições (falha segura: 400 na entrega).
7. **C448** — a tela "Materiais de clientes" mostra `12.5` enquanto o PDF mostra `12,5`.
8. **C447** — o termo de ferramenta colapsa espaços do texto da versão (pouco ganho; o "Verificar
   integridade" já resolve).
9. Feature 05: a "lista de separação como entidade" segue `[ ]`. Feature 01, 06, 16, 21, 22, 23, 25:
   o que falta para 🟢 está no mapa `specs/modulo-almoxarifado/README.md` — a maioria depende de
   resposta da empresa (seção 5).

## 5. O que espera o André (não é trabalho de sessão)

Tudo está no bloco **"⚠️ Leia antes de apresentar"** no topo de `docs/almoxarifado-novidades-por-etapa.md`:

- **Push:** 231+ commits locais na `main` sem `git push` (a outra sessão também espera esse aval).
- **Letra A (rodar em produção antes do deploy):** A107 (segredo HMAC fora do banco — guardar no
  Coolify/cofre e no backup), A108 (trocar o texto provisório do termo de responsabilidade), A109
  (e-mails do alerta de retirada parada no primeiro dia), A110 (lotes sem validade vindos de entrada manual).
- **Letra B:** decisões tomadas no lugar dele, todas reversíveis (B1092 … B1282).
- **Letra F:** nenhuma etapa desta leva foi clicada num navegador de verdade — cada uma tem roteiro
  clicável no guia `docs/almoxarifado-guia-etapas-e-testes.md`.
- **Perguntas à empresa (Matheus/Compras):** material de cliente chega amarrado a uma OS específica?;
  formulários de EPI e de termo; retirada definitiva (RN-C); maquinário/patrimônio; B1146 (instrumento
  perdido/avariado na inspeção).

## 6. Cuidados de ambiente (aprendidos nesta leva)

- **Pouca memória:** rode as suítes **uma de cada vez**; duas rodadas completas em paralelo já
  derrubaram processos. Testes por arquivo durante as tasks; as 7 suítes só no fim.
- **Não mate processos `node`:** o André roda `npm run dev` em `projetos\CRM`.
- **Revisão em paralelo com execução:** o revisor trabalha numa cópia
  (`git archive <hash> server client/src client/package.json | tar -x -C <scratchpad>`), nunca na árvore,
  porque o executor sabota arquivos de produção nos controles positivos.
- Commits como Andre, **sem** trailer Co-Authored-By; nunca `git add -A`; `python3` não existe no
  Git Bash desta máquina (use `perl`).
- Última rodada completa verde antes da pausa: em `9555ed29` (190 T4) — test:api 538/538,
  almoxarifado 44/0, validation 4/0, safealter 3/0, sqlite 16/0, client 187 suítes / 2539, build OK;
  e em `1ccb47f4` (fechamento 189) — test:api 538/538, client 187 / 2545. **Depois do fix-round da 190
  (`4fcdcb27`) as suítes completas não foram rodadas** — rode-as primeiro ao retomar.
