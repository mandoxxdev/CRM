# Etapa 48 — Regras por urgência e por material de cliente, e a fila da aprovação simples (plano)

> **Desenho:** `docs/superpowers/specs/2026-09-30-almoxarifado-etapa48-regras-urgencia-cliente-fila-simples-design.md`
> **Feature:** 06 (com efeito na 04)

## T1 — tronco: a urgência vira lista fechada (RN-01)

- `schema.js`: `TIPOS_URGENCIA`, exportada ao lado de `TIPOS_REQUISICAO`.
- `requisitionCreateService.createRequisicao`: normaliza vazio/ausente para `NORMAL` e recusa o que estiver fora da lista, com 400 `Urgência inválida: <valor>`. A recusa roda **antes** de qualquer escrita (a validação de material já é assim).
- **Cenários** (`requisicaoUrgencia.api.test.js`):
  - fora da lista: 400 com a literal, **pelas duas rotas**;
  - `''` e ausente: `NORMAL`;
  - os três valores válidos: 201;
  - **nenhuma requisição** gravada quando há recusa.
- **Controle positivo:** tirar a checagem derruba o 400. Aceitar em minúscula tem de derrubar também, porque a lista é exata.

## T2 — tronco: os dois critérios novos (RN-02/03)

- `schema.js`: `safeAlter` de `urgencia TEXT` e `material_cliente INTEGER` em `regras_aprovacao`.
- `approvalRulesService`:
  - `validarRegra` aceita os dois e conta os dois em "algum critério";
  - `regraCasa` compara os dois;
  - a query de itens do avaliador traz `MAX(CASE WHEN m.proprietario_cliente_id IS NOT NULL THEN 1 ELSE 0 END)` **por material**, no molde do `GROUP BY` da 47;
  - `formatarRegra` normaliza `material_cliente` como já faz com `material_critico`.
- **Cenários** (no `regrasAprovacao.api.test.js` ou num arquivo novo):
  - regra de urgência, a metade que casa e a que não casa;
  - regra de material de cliente, as duas metades;
  - urgência inválida no cadastro, com a literal;
  - `material_cliente: 0` sozinho recebe "sem critério".

## T3 — a aba de regras ganha os dois campos

`TabRegrasAprovacao.js`:
- `<select>` de urgência, com "Qualquer" e os três rótulos;
- checkbox "Algum item é material de cliente";
- `resumoCriterios` descreve os dois;
- `paraPayload` manda os dois.

**Cenário:** o payload do contrato com os dois campos, e a linha da lista descrevendo os dois.

## T4 — o painel da fila simples (RN-04)

Componente `FilaAprovacaoSimples`, no arquivo de `AprovacoesRegra.js`, montado só com `warehouseMode`:
- faz um `GET /almoxarifado/requisicoes` com `status=PENDENTE` próprio, porque a lista principal pode estar filtrada;
- filtra por `solicitante_id ≠ eu` e `pendencias_regra_abertas = 0`;
- só aparece com `pode('aprovar_requisicao')`;
- clicar abre a requisição.

**Cenários:**
- o recorte, com as três exclusões e a metade positiva;
- sem a permissão, o painel não aparece;
- fora do modo almoxarifado, nenhum GET;
- o clique abre a requisição certa.

## T5 — tronco: integração

Cria-se uma regra de urgência e uma de material de cliente. Envia-se uma requisição `URGENTE` com material de cliente, **pela segunda rota**, e as duas pendências nascem. Uma requisição com urgência inválida recebe 400 pelas duas rotas. Por fim, a fila de regras da 47 lista as duas pendências para quem assina.

## Fase 2 — o que o revisor tem de atacar

1. Existe **algum** outro escritor de `urgencia` além do formulário? Procurar em outros módulos, no `/copiar`, em importação, nos seeds e nos testes que gravam `urgencia` por SQL (o `/copiar` copia a urgência antiga? Se ela estiver fora da lista, o rascunho novo recebe 400?).
2. Fechar a lista quebra algum teste ou cliente existente que manda outro valor?
3. A fila simples: o recorte bate com o que o `/aprovar` aceita? E a requisição com `regras_avaliadas_em NULL`, que o `/aprovar` **reavalia** e pode barrar?
4. Cada RN até o último gesto: regra de urgência × auto-aprovação (a `CRITICO` nunca é auto-aprovada; e a `URGENTE` com regra?).

## Estado

- [x] Fase 0: medida (seção 1 do desenho)
- [x] Fase 1: desenho e plano
- [ ] Fase 2 · [ ] T1 · [ ] T2 · [ ] T3 · [ ] T4 · [ ] T5 · [ ] Fase 5 · [ ] Fase 6
