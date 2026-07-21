# Checklist de teste — Fix Layout + Auditoria (2026-07-21)

Branch: `fix/proposta-layout-auditoria` · Marque `[x]` conforme for validando no Chrome.

## O que foi feito (resumo)

8 correções na proposta editável, todas com testes automatizados passando (render/paginação/lógica). Falta a validação **visual** com dados reais no navegador.

| # | Cenário | Status código |
|---|---|---|
| 1 | Cláusula 5.23 (preço + FINAME + fiscais) sempre visível, em página própria | ✅ feito + teste |
| 2 | Seção "5. CONDIÇÕES GERAIS" começa em página nova | ✅ feito + teste |
| 3 | "Descritivo técnico" como 1º item do equipamento (após o nome) | ✅ feito + teste |
| 4 | Mais espaçamento entre linhas dos descritivos técnicos | ✅ feito |
| 5 | Cláusula 5.24 começa em página nova | ✅ feito + teste |
| 6 | Número da proposta no header (linha própria abaixo do título) | ✅ feito + teste |
| 7 | Histórico registra incluir/editar/remover **produtos** | ✅ feito + teste |
| 8 | Logo do cliente na capa (acima do nome), se cadastrada | ✅ feito + teste |

Extra: renumeração automática das cláusulas reserva o slot **5.23** (editáveis vão 5.1–5.22 e pulam para 5.24).

---

## Checklist de validação no Chrome

> App rodando (`npm run dev`), abrir uma proposta pelo ícone de olho → `/comercial/propostas/:id/preview-editavel`.

### #1 — Cláusula 5.23
- [ ] A 5.23 (PREÇO, CONDIÇÃO DE PAGAMENTO E IMPOSTOS) **aparece** na proposta
- [ ] Ela começa numa página **só dela** (não divide página com a 5.22 ou 5.24)
- [ ] A **tabela de preços** reflete os itens/total reais da proposta
- [ ] Tabela FINAME/BNDES e tabelas fiscais aparecem logo abaixo (fixas)
- [ ] No SUMÁRIO, a 5.23 aparece listada com número de página correto

### #2 e #5 — Quebras de página
- [ ] A seção "5. CONDIÇÕES GERAIS DE FORNECIMENTO" inicia no topo de uma página nova
- [ ] A cláusula "5.24 CONSIDERAÇÃO FINAL" inicia no topo de uma página nova

### #3 e #4 — Descritivo técnico (seção 4.x)
- [ ] Em um item com descritivo, o "Descritivo técnico" aparece **primeiro**, logo após o nome do equipamento (antes de Equipamento/Código/Quantidade…)
- [ ] O texto do descritivo está com espaçamento entre linhas mais confortável de ler
- [ ] A foto do equipamento continua flutuando à direita (não regrediu)

### #6 — Número no header
- [ ] No topo de cada página: "PROPOSTA TÉCNICA COMERCIAL" e, **abaixo**, "Nº {número}"
- [ ] ⚠️ **Se em produção o número NÃO aparecer**: a causa é `proposta_template_config.header_image_url` apontando para uma imagem de header custom (estática, esconde o header dinâmico). Ação: anular esse campo no banco de prod.

### #7 — Histórico de edições (produtos)
- [ ] Adicionar um produto à proposta → salvar → abrir o Histórico → aparece "Produto adicionado"
- [ ] Editar quantidade/valor de um produto → salvar → aparece "Produto editado" (com antes/depois)
- [ ] Remover um produto → salvar → aparece "Produto removido"
- [ ] (Robustez) Um save que falha (ex.: número de proposta duplicado) **não** cria registros de produto no histórico

### #8 — Logo do cliente na capa
- [ ] Cliente **com** logo cadastrada: a logo aparece na capa, **acima** do nome do cliente
- [ ] Cliente **sem** logo: capa normal, sem espaço vazio

### Regressão geral
- [ ] Gerar/baixar o **PDF** e conferir que tudo acima também vale no PDF final
- [ ] Console do navegador sem erros durante o fluxo

---

## Pendências não-bloqueantes
- [ ] Diagnóstico prod do #6 (`header_image_url`) — só se o número sumir em prod
- [ ] Push da branch / abrir PR (ainda não feito)
- [ ] Decidir se o commit de performance `03c2697` fica nesta branch ou vai para uma branch separada
