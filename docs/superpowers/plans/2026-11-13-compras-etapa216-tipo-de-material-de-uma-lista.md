# Etapa 216 (Compras) — Tipo de Material escolhido de uma lista

> Pedido da compradora (12/11/2026, `specs/modulo-almoxarifado/01-cadastros-materiais/pedido-2026-11-12/`). Estimativa
> `estimativa_2026-11-12_cadastro-de-material-fornecedores`, item 1, **revisada para 2h30** (`08503223`). Fila do Compras, linha 3.

## Medido antes (Fase 0)

- O campo **Tipo de Material** do formulário (`MaterialAlmoxarifadoForm.js:802`) é texto livre, gravado em `materiais_almoxarifado.tipo_material`.
- O cadastro de tipos (`tipos_material_almoxarifado`, nomes como `Consumível`, `EPI`) é lido por `GET /api/compras/materiais/aux/tipos-material`
  (Compras, Etapa 215) e `GET /api/almoxarifado/tipos-material`.
- **A restrição de endereço** (`stockService.motivoRecusaEndereco`) compara `material.tipo_material` por **igualdade exata** com a lista
  `tipos_material_permitidos` da localização, que é escolhida das chaves de `TIPOS_MATERIAL_ENUM` (`consumivel`, `epi`, `componente_pneumatico`…).
  Com o nome do cadastro (`Consumível`), a igualdade falha.

## Decisão (letra B)

**Escolhido:** a comparação da restrição passa a ser **normalizada** dos dois lados — sem acento, sem caixa, espaços e hífens viram `_`
(`Consumível` = `consumivel`, `Componente pneumático` = `componente_pneumatico`). Quem já casava continua casando (a chave normalizada é
ela mesma). **Descartado:** trocar a lista da restrição pela do cadastro (mexe na tela de localização e nos dados gravados das localizações —
etapa própria, se pedirem) e gravar a chave em vez do nome (a tela mostraria `consumivel`).

## Regras de negócio

- **RN-216.01** — No formulário de material, o Tipo de Material é um `<select>` com os tipos ativos do cadastro (pelo nome), mais
  "Selecione…" (vazio). Grava o nome.
- **RN-216.02** — Material com um tipo gravado que não está na lista mostra esse valor como opção `⟨valor⟩ (fora da lista)`, selecionada;
  salvar sem mexer mantém o valor.
- **RN-216.03** — A restrição de endereço compara normalizado: material `Consumível` entra em localização que permite `consumivel`; material
  `Chapa` não entra em localização que só permite `consumivel` (a mensagem continua *"Localização ⟨código⟩ não aceita o tipo de material
  '⟨tipo⟩'"*).

## Tasks

| # | Task | Tipo | Estado |
|---|---|---|---|
| T1 | `motivoRecusaEndereco` normalizado; teste `tipoMaterialNormalizado.api.test.js` (função + entrada pela rota) com controle positivo | tronco | — |
| T2 | Formulário: `<select>` pela rota do módulo (`rotas.api.tiposMaterial`), valor fora da lista; teste | galho | — |
| T3 | Fechamento | — | — |
