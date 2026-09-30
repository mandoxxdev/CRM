# Etapa 53 — A sugestão de localização na entrada (plano)

> **Desenho:** `docs/superpowers/specs/2026-09-30-almoxarifado-etapa53-sugestao-localizacao-design.md`

## T1 — predicado, serviço, rota

- **`motivoRecusaDestino(loc, material)`**: função pura extraída de `validarLocalizacaoParaMovimento`, com as **mesmas literais**. O motor passa a chamá-la.
- **`sugerirLocalizacaoEntrada(db, materialId)`** em `stockService`, pela RN-02.
- **Rota:** `GET /materiais/:id/sugestao-localizacao`, só com `auth`.
- **Cenários** (`sugestaoLocalizacao.api.test.js`):
  - a padrão aceita vem primeiro, com motivo `PADRAO`;
  - uma padrão **bloqueada** e uma padrão que **não aceita o tipo** do material **não** aparecem;
  - as posições com saldo aparecem, ordenadas pela quantidade, com `JA_TEM_O_MATERIAL`;
  - as vazias compatíveis aparecem, até 5, e a vazia que não aceita o tipo não aparece;
  - não há repetição (a padrão com saldo aparece uma vez só, como `PADRAO`);
  - **para toda sugestão, uma ENTRADA real com ela como destino é aceita pelo motor**: é a invariante da RN-01;
  - material inexistente devolve 404 com a literal.

## T2 — a tela

`MovimentacoesAlmoxarifado.js`: com o tipo ENTRADA e um material escolhido, busca a sugestão e mostra até 3 botões com o motivo. Clicar preenche `localizacao_destino_id`.

**Cenários:**
- os botões aparecem e o clique preenche o destino;
- no tipo SAIDA, nenhum GET de sugestão;
- uma falha da sugestão não quebra o formulário;
- sem material, nenhum GET.

## Fase 2 — o revisor ataca

1. A extração do predicado muda alguma literal ou algum comportamento do motor, nos dois papéis?
2. Localização **inativa** como padrão, e um material sem tipo (`tipo_material` NULL) diante de um endereço com restrição: o que o motor faz, e a sugestão acompanha?
3. As vazias da 52 incluem localizações "pai" (contêiner). Sugerir um pai para entrada faz sentido? Com que regra?
4. A tela: o `form.tipo` e o `material_id` mudam em vários lugares. Existe corrida entre dois GETs de sugestão?

## Estado

- [x] Fase 0 · [x] Fase 1
- [ ] Fase 2 · [ ] T1 · [ ] T2 · [ ] Fase 5 · [ ] Fase 6
