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
| T1 | `motivoRecusaEndereco` normalizado; teste `tipoMaterialNormalizado.api.test.js` (função + entrada pela rota) com controle positivo | tronco | feita `6bd2f1ed` (3/3; igualdade exata de volta derruba os dois cenários) |
| T2 | Formulário: `<select>` pela rota do módulo (`rotas.api.tiposMaterial`), valor fora da lista; teste | galho | feita `a61ac325` (3/3; 3 sabotagens vermelhas) |
| T3 | Fechamento | — | feito |

## Execução (2026-11-13)

- Fase 2 e Fase 5 não despachadas (etapa pequena); a Fase 0 achou o ponto que a estimativa não previa (a restrição de endereço) e a
  estimativa foi revisada antes do código (`08503223`).
- Achado de passagem: desde a Etapa 210 os tipos digitados subiam para maiúsculo e a restrição de endereço, por igualdade exata, já
  recusava *CONSUMÍVEL* numa posição que aceita *consumivel*. A normalização corrige isso também (B90).
- **Verificação (medida, em `a61ac325`):** `test:api` 610/610, `test:almoxarifado` 44/0, validation 4/0, safealter 3/0, sqlite 16/0; tela
  inteira 223/223 suítes (2989 testes); build OK.

## Retro (4 números)

- Rodadas de correção até verde: 0. Achados: sem revisão. Paralelismo: nenhum. Defeito que escapou da 215: nenhum até aqui.

## Próxima tarefa detalhada

A fila do cadastro de material com estimativa acabou; a linha 7 (tirar o campo Aplicação) espera o Matheus, e img4, Especificações/
Observações e a sobra/remessa esperam a compradora. Pelo pedido do André (13/11), o tempo que sobra da semana vai para as pendências do
almoxarifado: retomar a **Etapa 209 T6**, pausada.
