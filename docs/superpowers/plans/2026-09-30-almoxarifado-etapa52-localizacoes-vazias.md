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
- [x] Fase 2 (2 IMPORTANT, 2 MINOR — seção 5 do desenho) · [ ] T1 · [ ] T2 · [ ] Fase 5 · [ ] Fase 6
