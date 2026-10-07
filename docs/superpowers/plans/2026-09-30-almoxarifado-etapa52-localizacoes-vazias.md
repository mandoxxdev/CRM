# Etapa 52 — A tela de localizações vazias (plano)

> **Desenho:** `docs/superpowers/specs/2026-09-30-almoxarifado-etapa52-localizacoes-vazias-design.md`

## T1 — fonte única, helper, rota e chave

- **`stockService`:**
  - `OCUPACAO_SQL`, extraído **literalmente** do ramo `combined` do `MAPA_LOCALIZACOES_SQL`, que passa a usá-lo;
  - `listarLocalizacoesVazias(db)`, com o `endereco_completo` movido da rota.
- **Rota:** `/localizacoes/vazias` usa o helper e ganha `requirePermission('visualizar')`.
- **Registro:** `'localizacoes-vazias'` com a nota da RN-03. O **dispatcher** ganha a chave. A **varredura do registro** passa de 22 para 23.

## T2 — cenários (`localizacoesVazias.api.test.js`)

Para **cada** cenário, conferir que a lista de vazias bate com o mapa, isto é, `qtd_itens == 0` se e somente se a localização está na lista:
1. endereço com saldo não está vazio; endereço sem nada está;
2. **legado (S8):** material com padrão LEG e físico 40 **sem linha** → LEG **não** é vazia (antes era);
3. **drenado (51):** entrada de 30 em A e entrega sem origem de 30 → A **vazia**;
4. bloqueado vazio aparece, com `bloqueada = 1`;
5. localização inativa não aparece;
6. **material com lote (C72):** entrada no lote em A e entrega sem lote → A continua **ocupada**, e a lista e o mapa concordam (declarado);
7. a rota e a chave do relatório devolvem as **mesmas** localizações;
8. PRODUCAO lê as duas (gate `visualizar`), e o `endereco_completo` vem montado.

## Fase 2 — o revisor ataca

1. O `OCUPACAO_SQL` extraído é **idêntico** ao do mapa? Algum número do mapa muda?
2. Material de cliente e material inativo: o que a ocupação considera? A lista acompanha?
3. Linha endereçada **zerada** com o físico em "sem localização atribuída": o fallback não dispara porque não há linha endereçada **positiva**… e aí? Onde o material aparece?
4. `requirePermission('visualizar')` na rota quebra algum consumidor ou teste?

## Estado

- [x] Fase 0 · [x] Fase 1
- [x] Fase 2 (2 IMPORTANT, 2 MINOR — seção 5 do desenho) · [x] T1 + T2 (`8e1d46d`) · [x] Fase 5 (fix-round — `44138a0`) · [x] Fase 6 (verificação final medida: `test:api` 229/229 · `test:almoxarifado` 42/42 · validation 4/4 · safealter 3/3 · sqlite 5/5 · client 881/881 em 53 suítes · build `CI=true` limpo)

## Execução — T1 + T2 (`8e1d46d`)

- **T1:** `stockService.OCUPACAO_SQL`, extraída **literalmente** do ramo `combined` do `MAPA_LOCALIZACOES_SQL`, que
  passa a usá-la; `listarLocalizacoesVazias` (endereço montado no SQL, `sub_ocupadas`); `contarOcupacaoLocalizacao`;
  a rota `/localizacoes/vazias` usa o helper e **continua só `auth`** (B210); chave `localizacoes-vazias` no registro
  e no dispatcher; varredura do registro 22 → **23**.
- **RN-04 (entrou na Fase 2):** o `DELETE` e o `PUT` que desativa recusam localização ocupada pela mesma régua, com
  *"Localização ocupada: há material nela (N item(ns)). Transfira o saldo antes de apagar ou desativar."*; a recusa
  antiga (`quantidade != 0`) continua antes.
- **T2:** `localizacoesVazias.api.test.js` 11/11 — em cada cenário, "na lista ⇔ `qtd_itens == 0` no mapa" para todas as
  localizações ativas. 6 sabotagens, 6 vermelhas (uma refeita após NO-OP de âncora). `test:api` 229/229.
- **Divergências do plano:** o gate `visualizar` **caiu** (a justificativa estava errada — B210); o pai **fica** na
  lista com `sub_ocupadas` (B211); a RN-04 (DELETE/PUT) **entrou** por achado da Fase 2 (B212).

## Fase 5 — um revisor, as duas lentes, numa worktree isolada

**Correção:**
- **IMPORTANT — a recusa ANTIGA do DELETE não tinha nenhum teste.** Trocar `quantidade != 0` por `0` passava a suíte
  **inteira** (229/229): localização com linha **−3** passava a ser apagada. A etapa reescreveu a rota por dentro de
  um `.then`, e a guarda que sobreviveu era a única sem prova. Cenário (12).
- **MINOR — `ativo: 2` no PUT** gravava 2 e a localização sumia do mapa (que filtra `ativo = 1`) com o material
  dentro. Guarda `Number(ativo) !== 1` e o valor gravado normalizado para 0/1. Cenário (13).
- **MINOR — DELETE de localização JÁ inativa** que ainda é padrão do legado respondia *"ocupada… transfira o saldo
  antes de apagar"*, que engana (já está apagada). A guarda nova só vale para localização **ativa** (200 `ja_inativo`).
  Cenário (15).
- **Refutadas com sonda:** o mapa não mudou (texto normalizado e resultado JSON idênticos com 21, 508 e 3008
  localizações, 0 divergências no invariante); desempenho (3000 localizações/5000 materiais: lista em ~20 ms, rota
  em 42 ms); o callback convertido em `.then` sem resposta dupla; PUT que desativa e muda outros campos é recusado
  inteiro; o pai apagável com filha ocupada é aceitável (lista plana) — **D (52)**.

**Força dos testes:** 5 sabotagens verdes — `ativo` como `'0'`/`false`; filha **inativa** contada em `sub_ocupadas`;
`COUNT(*)` no lugar de `COUNT(DISTINCT material_id)`; PUT em localização já inativa; setor vazio. Fechadas pelos
cenários (13), (14), (16) e (17). **Fix-round: 8 sabotagens, 8 vermelhas.**

⚠️ **Teste vazio meu, pego antes de valer:** o cenário do setor vazio (17) passava **com o defeito**. O helper do
próprio teste gravava `extra.setor || null` — transformava `''` em `NULL` e nunca criava setor vazio. A primeira
tentativa de corrigir só endureceu a asserção (a barra sobrando aparece no **começo**, não entre duas) e continuou
verde; só a correção do helper fez a sabotagem ficar vermelha. Sétimo caso desta forma na base.

`localizacoesVazias` **17/17**.

## Retro de 4 números — Etapa 52

1. **Rodadas de correção até verde: 1** (Fase 5), mais a correção do plano na Fase 2.
2. **Achados reais:** Fase 2 — 2 IMPORTANT + 2 MINOR; Fase 5 — 1 IMPORTANT + 2 MINOR + 5 lacunas de teste. **Ruído: 0**
   (revisor em worktree isolada).
3. **Paralelismo:** nenhum galho (duas tasks, tronco). A revisão da Fase 5 e a verificação rodaram sem se pisar
   (worktree).
4. **Defeito que escapou:** *preencher na próxima etapa.* Da 51 para cá: **0** achado nesta etapa.

## Próxima tarefa detalhada — Etapa 53: a SUGESTÃO de localização na entrada (feature 02)

**Escolha, pela ordem do CLAUDE.md** (a próxima desta etapa → o que ficou para 🟢 → o mapa). Medido hoje:

| Candidata | O que falta | Depende de |
|---|---|---|
| **02 — sugestão de localização na entrada** | hoje só o fallback `resolveLocalizacaoEntrada` (`stockService.js:500`: destino informado ‖ padrão ‖ null), sem restrição nem espaço | **nada** — e agora tem base: saldo por endereço confiável (51) e a regra de vazias (52) |
| 02 — código de endereço gerado | `endereco_completo` é só exibição | nada, mas é cadastro, valor menor |
| 02 — capacidade/peso | **fora de escopo por decisão do design** | decisão sua |
| 02 — confirmação por leitura | código de barras | feature 15 |
| **05** — lista de separação como entidade, rota de picking | a maior das 🟡 | nada, mas grande |
| **08** — conferência física estruturada, pedido que reabre no estorno | **B161** em aberto | **decisão sua** |
| **23** — `qtd_permissoes` sem gate etc. | **B41** em aberto | **decisão sua** |
| **C72** — material com lote na entrega | reabre a **B204** (a entrega escolheria lote? FEFO?) | **decisão sua** (regra do estoque) |

**A sugestão é a de maior valor sem dependência.** Medido pelo nome do contrato: nenhum `sugest*localiza*` no código
(grep em `server/services`, `server/routes`, `client/src`: zero).

**Contrato proposto (a Fase 1 da 53 congela):**
- `GET /api/almoxarifado/materiais/:id/sugestao-localizacao` → lista ordenada de `{ localizacao_id, codigo,
  endereco_completo, motivo }`, com `motivo` em `PADRAO` | `JA_TEM_O_MATERIAL` | `VAZIA_COMPATIVEL`:
  1. a **padrão**, se ativa, não bloqueada e aceitando o tipo do material;
  2. as posições onde o material **já tem saldo** (consolidar), mesmas restrições, maiores primeiro;
  3. as **vazias** compatíveis (`listarLocalizacoesVazias` + `tipos_material_permitidos` + não bloqueada), de
     preferência do mesmo almoxarifado da padrão.
- **Fonte única das restrições:** a mesma de `validarLocalizacaoParaMovimento` (`stockService.js:~516`: bloqueio e
  `tipos_material_permitidos` com a semântica "lista vazia = sem restrição") — extrair um predicado, não copiar.
- **Tela:** em **Movimentações → Entrada** (campo `localizacao_destino_id`, `MovimentacoesAlmoxarifado.js:173/400`),
  a sugestão preenche o destino quando vazio e mostra o motivo; o operador troca à vontade. **Recebimento** (processar
  envia `{}` hoje — `RecebimentosAlmoxarifado.js`) é a segunda superfície: medir na Fase 0 se o item de recebimento
  tem campo de localização antes de prometer.

**Pontos de atenção:** sugestão **não** é trava (a validação do motor continua decidindo); material **com lote** —
"já tem o material" pode ser lote que saiu pela entrega (C72), declarar; espaço/capacidade **fora** (decisão do design);
e a sugestão nunca pode propor posição que o motor recusaria (cenário: bloqueada e tipo não permitido nunca aparecem).
