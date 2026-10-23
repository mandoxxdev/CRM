# Etapa 186 — O PDF da remessa a terceiros e o da posição do cliente cabem na folha: célula quebra em linhas, nada é cortado

> **Status:** 📝 **PLANO (2026-10-22)** — Fase 0 medida e Fase 1 escritas; **Fase 2 feita (0 críticos, 4 importantes, 8 menores — ver "Emendas da Fase 2", prevalecem)**;
> nenhuma task executada.
> Corrige o que a Etapa 185 deixou de fora com motivo (**B1220**, **B1221** e o aviso **C445** do plano da 185 — a remessa **é** prova assinada
> pelo terceiro, `remessaPdf.js:121`). Decisões desta etapa a partir de **B1230** (a 185 usa B1215–B1222 e a 184 B1223–B1224; B1225–B1229 ficam
> livres para o fechamento da 185, que está em revisão).
> Antes: Etapa 185 (ficha de EPI e termo de ferramenta) — **outra sessão revisa a 185 em paralelo: não tocar** em `fichaEpiPdf.js`,
> `termoFerramentaPdf.js`, nos testes deles, em `EpiAlmoxarifado.test.js`, `FerramentasAlmoxarifado.test.js` e no plano da 185 (só a T6,
> condicional, toca neles — e só depois do fechamento da 185).

## Objetivo (em linguagem simples)

O papel da **remessa a terceiros** acompanha o material que sai do prédio e **volta assinado pelo terceiro** — é o que prova o que foi
entregue. Hoje cada célula da tabela é cortada por **número de letras** (40), sem olhar o espaço do papel. Resultado, medido:

- um código de material de 17 letras (`EPI-MASC-SOLDA-07`, o padrão dos EPIs) **invade** a coluna Material (termina em 45,5 mm; a coluna
  começa em 44); um de 25 letras vai a 57,8;
- o nome do material **perde o fim**: *Eixo usinado em aco SAE 1045 retificado diametro 50 mm comprimento 1200* sai sem as últimas
  **31** letras — o terceiro assina um papel que não diz o que recebeu;
- uma observação de 7 linhas **passa por cima da linha de assinatura**, e uma longa perto do fim da folha **sai do papel**.

O PDF de **posição do cliente** (o cliente confere o patrimônio dele) tem o mesmo defeito (corte em 34 letras; código de 17 letras invade) e
o **título** com a razão social do cliente passa da margem a partir de **48** letras — o maior nome de cliente no banco de hoje tem **69**
(o título iria a 233,8 mm; a folha tem 210).

Depois desta etapa: **cada célula quebra em quantas linhas precisar** (a linha fica mais alta), **nenhuma letra é perdida**, nada invade a
coluna vizinha nem passa da margem; as colunas são redistribuídas para os textos comuns caberem numa linha só. Nas **etiquetas**, o código
comprido deixa de **escrever por cima do nome**.

Nada muda no que é gravado, na API, nem nas telas: só o **desenho** dos PDFs.

## Fase 0 (medido em 2026-10-22, sobre `a9759b07`)

**Como foi medido.** Sondas no scratchpad com o **jsPDF real** do client (`client/node_modules/jspdf/dist/jspdf.node.min.js`, Helvetica, mm,
A4), molde `p185-sonda-pos.js`. As colunas e os cortes foram **lidos do arquivo de produção** por regex (não copiados à mão):
- `p186-sonda-fase0.js` → `e186-sonda-fase0.txt` — cada coluna da remessa, da posição (itens e aplicações), as linhas fora da tabela, as
  observações da remessa e as etiquetas;
- `p186-sonda-proposto.js` → `e186-sonda-proposto.txt` — o layout proposto com a quebra da 185 (`splitTextToSize` + aparar à direita,
  **lido** de `fichaEpiPdf.js`), folga de 1 mm: **76 casos, 0 falhas** (fim ≤ limite e junção sem espaços = texto em todos);
- `p186-dados-reais.js` — comprimentos no banco da pasta de rodar (`projetos/CRM/server/data/database.sqlite`, **somente leitura**): o banco
  é de desenvolvimento (3 materiais, códigos de 7 letras), mas `clientes.razao_social` chega a **69** letras. Nenhum campo usado nos PDFs
  (`materiais_almoxarifado.codigo`/`nome`, `clientes.razao_social`, `fornecedor_nome`, `tipo_servico`, `observacoes`) tem tamanho máximo
  no servidor.

(Caminho completo: `C:\Users\User\AppData\Local\Temp\claude\C--Users-User-projetos-CRM-main\bf36ab2c-c3a4-467f-bc1f-24a9b62a2a92\scratchpad\p186-*.js`
e `e186-*.txt`.)

### Todos os geradores jsPDF do client (`grep -rln "jspdf\|jsPDF" client/src`, fora testes) — escopo

| Arquivo:linha | Padrão | Medido | Decisão |
|---|---|---|---|
| `client/src/utils/remessaPdf.js:110` | `String(c).slice(0, 40)` por célula, fonte 9, uma linha | código de 17 → 45,5 (coluna acaba em 44); material perde 6/10/31 letras | **ENTRA** (T2) |
| `client/src/utils/remessaPdf.js:89,91,93,96` | título (f14), subtítulo (f10), prazo/status (f9), proprietário (f10) — `text` de uma linha | proprietário passa com razão de **72+** letras; subtítulo com fornecedor de **85+** | **ENTRA** (T2) |
| `client/src/utils/remessaPdf.js:118` | observações: `text(splitTextToSize(obs, 175))` e depois `y += 10` fixo | 7+ linhas cruzam a linha de assinatura (última base em y0 + 21,9; a linha em y0 + 22); 20 linhas a partir de y = 240 vão a **309,4** (sem quebra de página) | **ENTRA** (T2) — defeito novo, não estava na B1220 |
| `client/src/utils/remessaPdf.js:100` | encerramento: `text(array)` + `y += 5 × linhas`, largura 175 | ok (passo 5 > altura de linha 3,7; 14 + 175 = 189) | não muda |
| `client/src/utils/posicaoClientePdf.js:68` | `slice(0, 34)` (itens) | código de 17 → 45,5 (coluna acaba em 40); material perde 12/16/37 | **ENTRA** (T3) |
| `client/src/utils/posicaoClientePdf.js:90` | `slice(0, 60)` (aplicações) | código de 17 → 45,5 (acaba em 44); *Aplicado em* (nome do projeto) de 80 perde 20 | **ENTRA** (T3) |
| `client/src/utils/posicaoClientePdf.js:54` | título f14 `Posição de materiais — <razão>` sem quebra | razão de **48+** passa; a de 69 (real) → **233,8** | **ENTRA** (T3) |
| `client/src/utils/etiquetasPdf.js:165` | código f14 negrito com `maxWidth` (o jsPDF **quebra** em linhas) | código de 22+ letras (`MP-ACO-INOX-304-CH-3MM` 64,7 mm; largura 55/56) quebra em 2 linhas: a 2ª em y + 14,7, o nome em y + 15 — **escreve por cima do nome** | **ENTRA** (T4) — ver divergência 1 |
| `client/src/utils/etiquetasPdf.js:168` | nome f8 `splitTextToSize(...).slice(0, 2)` | 71 letras → 2 linhas (cabe); ~100+ → perde a 3ª linha em diante | **FORA** — decisão física da etiqueta, mantida (B1237) |
| `client/src/utils/etiquetasPdf.js:173` | linha de controle f9 negrito `maxWidth` | o caso longo (`PRATELEIRA · Setor de usinagem pesada e caldeiraria`) → 2 linhas, a última em y + 55,7 (A4, etiqueta até 57) / y + 48,7 (térmica, até 50) | não muda (cabe) |
| `client/src/utils/fichaEpiPdf.js`, `termoFerramentaPdf.js` | já medem (Etapa 185) | — | **FORA** (só a T6 condicional, migração mecânica para o helper) |
| `client/src/components/Relatorios.js:428,501,505` | `razao_social.substring(0, 40)`, `motivoBloqueio.substring(0, 60)` — **corpo de `autoTable`** | o `autoTable` quebra a célula sozinho (não invade); o corte é de conteúdo, num relatório comercial de visitas | **FORA** — não é do almoxarifado, não é prova; registrar como candidato (B1230) |
| `client/src/utils/gerarPDFProposta.js:130,251,302` | `splitTextToSize` (já mede); nenhum corte por contagem | — | **FORA** — a proposta tem review obrigatório próprio (`specs/proposta-editavel/review-proposta.md`) |

### Remessa — medida por coluna (fonte 9, layout de hoje; "até" = a próxima coluna, ou 196 na última)

| # | Coluna | x | até (mm) | cabem | texto plausível → fim (mm) | defeito hoje |
|---|---|---|---|---|---|---|
| 0 | Código | 14 | 44 (30) | 17 `a`, 10 `W` | `ESC-001` 26,8; `MP-INOX-304` 33,8; **`EPI-MASC-SOLDA-07` (17) 45,5**; `MP-ACO-INOX-304-CH-3MM` (22) 55,4; `EIXO-SAE1045-D50-L1200-RT` (25) 57,8 | **invade** a partir de ~16 letras |
| 1 | Material | 44 | 124 (80) | 45 `a`, 26 `W` | `Chapa de aco inox 304 2B 3,00 x 1250 x 3000 mm` (46) → desenhado 103,6, **perde 6**; `Mascara de solda … DIN 9-13` (50) perde **10**; `Eixo usinado … comprimento 1200` (71) perde **31**; 40 `W` → 163,4 (invade até a Qtde) | **perde texto** |
| 2 | Un. | 124 | 140 (16) | 9 `a` | `UN` 128,6; `BARRA` 134,9 | nenhum plausível |
| 3 | Qtde | 140 | 166 (26) | 14 `a` | `99999.125` 154,9 | nenhum plausível |
| 4 | Peso (kg) | 166 | 196 (30) | 17 `a` | `1250.75` 177,4 | nenhum plausível |

Cabeçalhos cabem (o maior, `Peso (kg)`, termina em 179,5).

### Posição do cliente — medida por coluna (fonte 9, layout de hoje)

| Tabela | # | Coluna | x | até | texto plausível → fim (mm) | defeito hoje |
|---|---|---|---|---|---|---|
| itens | 0 | Código | 14 | 40 | `MP-INOX-304` 33,8; **`EPI-MASC-SOLDA-07` 45,5**; 25 letras 57,8 | **invade** |
| itens | 1 | Material | 40 | 98 | 46 letras → **perde 12**; 50 → perde 16; 71 → perde **37** | **perde texto** |
| itens | 2–6 | Un., Recebido, Consumido, Devolvido, Saldo | 98, 110, 130, 154, 178 | 110, 130, 154, 178, 196 | `BARRA` 108,9; `99999.125` cabe em todas (Saldo 192,9) | nenhum plausível |
| aplicações | 0 | Código | 14 | 44 | `EPI-MASC-SOLDA-07` 45,5 | **invade** |
| aplicações | 1 | Aplicado em (`OS n` ou nome do projeto) | 44 | 144 | projeto de 80 letras → desenhado 129,6, **perde 20** | **perde texto** |
| aplicações | 2 | Quantidade | 144 | 196 | `99999.125` 158,9 | nenhum |

**Ruído de ponto flutuante:** `num()` é `String(Number(v))` sobre `SUM` do SQLite — `0.1 + 0.2` sai `0.30000000000000004` (19 car., 32,3 mm):
hoje invade a coluna seguinte nas colunas numéricas estreitas; com a quebra, vira 2 linhas (B1238).

### O layout proposto (medido, `e186-sonda-proposto.txt`)

Útil = até 1 mm antes da próxima coluna; a última até 196 (a mesma régua da 185, `UTIL_DA_COLUNA`).

| Tabela | x | útil (mm) | resultado medido |
|---|---|---|---|
| Remessa | **14, 48, 126, 142, 166** | 33 / 77 / 15 / 23 / 30 | `EPI-MASC-SOLDA-07` **1 linha** (45,5 ≤ 47); 22 e 25 letras 2 linhas; 40 `W` 4. Material de 46 e de 50 **1 linha** (124,1 ≤ 125); 71 → 2; 120 `W` → 5. `BARRA` 1; `99999.125` 1; ruído 2 linhas |
| Posição — itens | **14, 48, 100, 112, 132, 155, 177** | 33 / 51 / 11 / 19 / 22 / 21 / 19 | código como na remessa; material 46 → 2, 71 → 3, 120 `W` → 8; `99999.125` 1 linha em todas as numéricas (Recebido 126,9 ≤ 131); cabeçalhos em 1 linha (`Consumido` 147,9 ≤ 154) |
| Posição — aplicações | **14, 48, 144** | 33 / 95 / 52 | projeto de 80 → 2 linhas (138,1 ≤ 143) |

Cabeçalhos das três tabelas: todos em 1 linha. Linhas fora da tabela quebradas em 182 mm: título da posição com razão de 69 → 2 linhas
(192,3); proprietário com 80 `W` → 2 (192,8); subtítulo de 130 → 2 (184,8). **Junção sem espaços = texto em todos os 76 casos.**

### Onde mora o helper da 185 hoje, e o acoplamento

- `linhasPorLargura(pdf, texto, largura)` — **privada** em `fichaEpiPdf.js:61` (`splitTextToSize` + aparar à direita, emenda M1 da 185);
- `linhasQuebradas(texto, passoFinal)` — **closure** dentro de `gerarTermoFerramentaPdf` (`termoFerramentaPdf.js:101`), a mesma conta copiada;
- `quebrarTexto(texto, largura, medir)` — exportada de `termoFerramentaPdf.js:23` (parágrafos; só o termo usa);
- `quebrarPorLargura(medir, texto, …)` — exportada de `fichaEpiPdf.js:31` (corte por **letra**, só para o aparelho — B1207; não serve aqui).
- **M5 da 185:** `termoFerramentaPdf.js:12` importa `carregarImagemComoDataUrl` de `fichaEpiPdf.js`; a ficha evita o ciclo importando de
  `termoFerramenta` (sem imports). Importar o helper **de** `fichaEpiPdf.js` na remessa/posição puxaria `dataLocal`, `resolveMaterialPhotoUrl`,
  `epiEntrega` e `termoFerramenta`, e uma sabotagem da ficha derrubaria as suítes da remessa.

**Decisão (B1231):** o helper vira **`client/src/utils/pdfTexto.js`, sem nenhum import** (recebe o `pdf` por parâmetro). Remessa e posição
importam dele. Ficha e termo **não** mudam nesta etapa (estão em revisão); a migração deles é a T6, **condicional** ao fechamento da 185.

### Testes que tocam o desenho (cuidado com o mock)

- `client/src/utils/remessaPdf.test.js` e `posicaoClientePdf.test.js` — testam **só o descritor** (`montar*`); não há `jest.mock('jspdf')`.
  O gerador nunca foi testado: os testes novos ganham um gravador que mede com o jsPDF real (molde `EpiAlmoxarifado.test.js:43-58`).
- `client/src/components/datasDoChatDeComprasEDoAlmoxarifadoNoDiaLocal.test.js:62-71` — gera remessa e posição **pela tela** com um `FakePdf`
  que tem `text`, `setFontSize`, `line`, `addPage`, `splitTextToSize` (devolve `[t]`) e `save` — **não tem `getTextWidth` nem `setFont`**.
  Os testes `:384` e `:402` (`'Posição de materiais — CLI 170'` inteiro num `text`) são guarda: a produção da remessa e da posição só pode
  medir por `splitTextToSize` (RN-186.11). **Não mudar este arquivo.**
- `RemessasTerceirosAlmoxarifado.test.js:29`, `RemessasTerceirosTransformacao.test.js:26`, `MateriaisClienteAlmoxarifado.test.js:31` —
  mockam o util inteiro (`jest.fn`): não são afetados e não servem de integração.
- `client/src/utils/etiquetasPdf.test.js:1-20` — mock com `splitTextToSize: (t) => [t]` e **sem** `getTextWidth`; `:208` exige `maxWidth`
  na linha de controle (continua). `EtiquetasPdfModal.test.js:25` mocka o gerador.
- Não há fixture de rota para remessa/posição (só `client/src/utils/__fixtures__/fichaEpi.rota.json`, gravada por
  `server/tests/api/epiFichaConfirmacaoIntegracao.api.test.js` com `CRM_GRAVAR_FIXTURE=1`). Rotas: `GET /api/almoxarifado/remessas-terceiros/:id`
  (`server/routes/almoxarifado/extended.js:2774`, itens com `material_codigo`, `material_nome`, `unidade`, `quantidade`, `peso`) e
  `GET /api/almoxarifado/materiais-cliente/posicao` (`:2177`, `itens[].codigo/nome/unidade/recebido/consumido/devolvido/saldo`,
  `aplicacoes[].codigo/numero_os/projeto_nome/quantidade`).

### Divergências da Fase 0

1. **A B1220 (plano da 185) diz que as etiquetas "já medem" — é meia verdade.** O nome (2 linhas por decisão) e a linha de controle cabem.
   Mas o **código** vai com `maxWidth` em fonte 14 negrito: com 22+ letras (ou 12 `W`/16 `A`) o jsPDF quebra em 2 linhas e a 2ª (base em
   y + 14,7) cai **em cima** do nome (base em y + 15). Não é corte por contagem, é sobreposição — mas é o mesmo "nada legível perdido".
   Entra (T4), pequeno e separável.
2. **A remessa tem um defeito que a B1220 não nomeou:** as observações avançam `y += 10` fixo — com 7+ linhas o texto cruza a linha de
   assinatura, e não há quebra de página no bloco. Entra (T2).
3. **A posição tem um defeito que a B1220 não nomeou:** o título passa da margem com razão social de 48+ letras, e o banco **real** já tem
   uma de 69. Entra (T3).
4. A medida da 185 (*"código de 26 car. → 64,3"*, *"código de 16 car. → 40,5"*) é coerente com a de hoje (25 → 57,8; 17 → 45,5): o
   código invade a partir de ~16 letras nas duas.

## Regras

| ID | Regra | Cenário |
|---|---|---|
| RN-186.01 | **Helper** `linhasPorLargura(pdf, texto, largura)`: cada linha, medida na **fonte corrente** (`getTextWidth`), cabe em `largura`; a junção sem espaços é o texto sem espaços; cada linha é aparada à direita; texto vazio → `['']` (a linha da tabela existe). | `EIXO-SAE1045-D50-L1200-RT` em 33 (f9) → 2 linhas ≤ 33; 120 `W` em 77 → 5 linhas, junção = texto; `'5wh5OcA0t japiucOIvi2s16Oms83ess-erx f9Otf5102mt8b2tewgIzj62zoi M5wwrIt'` em 30 → nenhuma linha termina em espaço (cru, o `splitTextToSize` dá `'vi2s16Oms83ess-erx '` com 30,54 > 30). |
| RN-186.02 | **Remessa — célula** termina antes da coluna seguinte (`x + largura ≤ x_próxima − 1`), a última até 196, fonte 9 real; **nenhuma letra perdida** (junção sem espaços = texto do descritor sem espaços). | Item com `material_codigo: 'EIXO-SAE1045-D50-L1200-RT'` e `material_nome` de 71 → código em 2 linhas ≤ 47, material em 2 ≤ 125, a junção = o nome inteiro (hoje perde 31). |
| RN-186.03 | **Remessa — colunas** x = `[14, 48, 126, 142, 166]` (cabeçalho e células). Em **uma** linha: `EPI-MASC-SOLDA-07`, `Chapa de aco inox 304 2B 3,00 x 1250 x 3000 mm`, `UN`, `BARRA`, `99999.125`, `1250.75`; os 5 cabeçalhos. | Item comum → cada célula é **um** `text`. |
| RN-186.04 | **A linha cresce**: célula com k linhas desenha a linha j em `y + 4·j`, cada uma num `text` próprio; n = maior k; a próxima linha da tabela vem em `y + 5 + 4·(n − 1)` (com n = 1, o passo de hoje). A linha só começa na página se a **última** linha dela fica em `y + 4·(n − 1) ≤ limite` — limite de hoje: **262** (remessa), **275** (posição, itens), **280** (posição, aplicações); senão `addPage` e `y = 18`. | 60 itens com material de 120 `W` (5 linhas) → nenhuma célula com y > 262 em nenhuma página e nenhuma linha partida entre páginas; com n = 1 o y de cada item é o de hoje (`y0 + 5·i`). |
| RN-186.05 | **Remessa — fora da tabela**: título (f14, passo 6), subtítulo (f10, passo 5), prazo/status (f9, passo 5) e proprietário (f10, passo 6) quebram em 182 mm, cada bloco avançando o passo de hoje **por linha** (com texto curto, todo y é o de hoje). **Observações** (175 mm, como hoje): uma linha por `text`, passo 4, `addPage` (`y = 18`) se `y > 280` antes de desenhar a linha, e depois do bloco `y += 6` (1 linha: `+4 +6 = +10`, o de hoje). A linha de assinatura fica sempre abaixo da última linha das observações. | Proprietário com razão de 80 `W` → 2 linhas ≤ 196; observação de 10 linhas → a `line` de assinatura com y > o da última linha da observação + 4; observação de 20 linhas começando perto do fim → nenhum `text` com y > 287. |
| RN-186.06 | **Posição — itens**: colunas `[14, 48, 100, 112, 132, 155, 177]`; RN-186.02 e RN-186.04 valem (limite 275). Em uma linha: `EPI-MASC-SOLDA-07`, `UN`, `BARRA`, `99999.125` nas cinco numéricas, os 7 cabeçalhos. | Material de 71 → 3 linhas ≤ 99, junção = texto (hoje perde 37). |
| RN-186.07 | **Posição — aplicações**: colunas `[14, 48, 144]`; RN-186.02 e RN-186.04 valem (limite 280). | `projeto_nome` de 80 → 2 linhas ≤ 143 (hoje perde 20). |
| RN-186.08 | **Posição — título** quebra em 182 mm (f14, passo 6 por linha). | Razão social de 69 (o maior do banco real) → 2 linhas ≤ 196 (hoje 233,8); a tabela começa depois da última. |
| RN-186.09 | **Régua geral dos dois PDFs:** nenhum `text`, em **qualquer** fonte, termina depois de 196 mm, e nenhum tem y > 287. (`text` com array — o encerramento — é medido linha a linha.) | Remessa e posição do pior caso (todos os campos longos, 60 itens) → listas vazias. |
| RN-186.10 | **Etiqueta — o código não escreve por cima do nome.** Fonte do código (negrito): a maior de 14, 13, 12, 11, 10 em que `splitTextToSize(codigo, larguraTexto)` dá **1** linha; se nem em 10 cabe, quebra em fonte 10 (linhas de passo 4,5) e o nome desce `4,5 · (k − 1)`. O nome continua em no máximo 2 linhas e a linha de controle no lugar de hoje. Código que cabe em 14 → desenho idêntico ao de hoje. | `MP-ACO-INOX-304-CH-3MM` (64,7 mm em f14) → 1 linha em fonte **11** na A4 (50,8 ≤ 55; em 12 mede 55,5) e **12** na térmica (55,5 ≤ 56); 40 `W` → f10, 3 linhas, a 1ª linha do nome em y + 15 + 9; `MAT-7` → f14, como hoje. Nas duas folhas (A4 2×5 e térmica 100×50). |
| RN-186.11 | **Nada muda fora do desenho:** API, banco, telas, os descritores (`montarRemessaPDF`, `montarPosicaoClientePDF`, `montarEtiqueta*`) e os testes deles. A produção da remessa e da posição mede **só** por `splitTextToSize` (o `FakePdf` da `datasDoChat…:62` não tem `getTextWidth`) e não chama `setFont`. | `git diff --stat` da etapa: `client/src/utils/{pdfTexto,remessaPdf,posicaoClientePdf,etiquetasPdf}.js`, testes, fixtures, um teste novo no servidor e documentos; `datasDoChat…test.js` intocado e verde. |
| RN-186.12 | **Fora:** ficha de EPI e termo de ferramenta (salvo a T6), o nome da etiqueta em 2 linhas, `Relatorios.js` e `gerarPDFProposta.js` (B1230, B1237). | — |

## Contrato (do desenho — não há API nova nem alterada)

**`client/src/utils/pdfTexto.js`** (novo, **sem imports**):
- `export const MARGEM_DIREITA = 196;`
- `export function linhasPorLargura(pdf, texto, largura)` — `pdf.splitTextToSize(String(texto ?? ''), largura).map((s) => String(s).replace(/\s+$/, ''))`
  (a mesma da `fichaEpiPdf.js:61`, com `?? ''`).
- `export function utilDasColunas(colunas, margem = MARGEM_DIREITA)` — `colunas.map((x, i) => (i < colunas.length - 1 ? colunas[i + 1] - 1 : margem) - x)`.
- `export function quebrarCelulas(pdf, celulas, util)` → `string[][]` (uma lista de linhas por célula; `linhasPorLargura` na fonte corrente).
- `export function desenharCelulas(pdf, linhasCelula, colunas, y, passo = 4)` → desenha `linhasCelula[i][j]` em `(colunas[i], y + passo·j)`,
  um `text` por linha; devolve `n` (maior número de linhas).
- `export function desenharQuebrado(pdf, texto, x, y, largura, passo)` → desenha `linhasPorLargura` linha a linha, devolve o `y` depois do
  bloco (`y + passo·k`).

**`remessaPdf.js`**: `const COLUNAS = [14, 48, 126, 142, 166]` e `const UTIL = utilDasColunas(COLUNAS)` no módulo (literais, comentário com
`M + …`); cabeçalho por `desenharQuebrado` (passos da RN-186.05); por item, **depois** do `setFontSize(9)`: `linhas = quebrarCelulas(pdf, linha, UTIL)`,
`n = max`, `if (y + 4 * (n - 1) > 262) { addPage; y = 18; }`, `desenharCelulas(...)`, `y += 5 + 4 * (n - 1)`; observações linha a linha
(RN-186.05). O `slice(0, 40)` some. O encerramento não muda.

**`posicaoClientePdf.js`**: `COLUNAS_ITENS = [14, 48, 100, 112, 132, 155, 177]`, `COLUNAS_APLICACOES = [14, 48, 144]`; título por
`desenharQuebrado` (182, passo 6); as duas tabelas como a remessa (limites 275 e 280). Os `slice(0, 34)` e `slice(0, 60)` somem.

**`etiquetasPdf.js`** (`gerarEtiquetasPDF`): `const FONTES_CODIGO = [14, 13, 12, 11, 10]`; com `setFont('helvetica','bold')`, a primeira fonte
em que `doc.splitTextToSize(e.codigo, larguraTexto).length === 1`; se nenhuma, fonte 10 e `linhasCodigo = splitTextToSize(...)`, cada uma num
`text` em `y + PAD + 5 + 4,5·j`; nome em `y + PAD + 11 + 4,5·(k − 1)`. Sem `maxWidth` no código (as linhas já vêm medidas). Linha de
controle e nome: como hoje.

## Tasks

| # | Task | Tipo |
|---|---|---|
| T1 | `pdfTexto.js` — o helper compartilhado (RN-186.01) | **tronco** |
| T2 | Remessa: colunas, células, altura, cabeçalho, observações (RN-186.02–05, 09, 11) | galho (só `remessaPdf.js` + teste) |
| T3 | Posição: colunas, células, altura, título (RN-186.06–09, 11) | galho (só `posicaoClientePdf.js` + teste) |
| T4 | Etiqueta: o código não sobrepõe o nome (RN-186.10) | galho (só `etiquetasPdf.js` + teste) |
| T5 | Integração: fixture gravada pela rota real + telas (remessa, posição, modal de etiquetas) + sonda pós + suítes | depois de T2–T4 |
| T6 | **Condicional:** ficha e termo passam a usar `pdfTexto.js` (migração mecânica) | só se a 185 já fechou (T4 dela commitada) |
| T7 | Fase 5 (revisão adversarial com sonda) + fix-round + fechamento | depois de T5/T6 |

**Por que T1 é tronco:** é a regra compartilhada — um erro de interpretação nela (aparar, vazio, fonte corrente) exige retrabalho em T2 e
T3. **T2, T3, T4 são galhos:** arquivos disjuntos do client, só **consomem** o helper testado (T4 nem o usa), não tocam servidor, motor, trava,
migration nem `ACAO_PERFIS`. Só Jest (sem SQLite): podem rodar na mesma árvore, **mas sabotagem concorrente contamina a suíte do outro**
(memória do projeto): em paralelo, sabotagem e restauro **só** no arquivo da própria task, nenhum galho sabota `pdfTexto.js`, e a suíte completa
do client só depois que todos restauraram (`cmp`). Na dúvida, sequencial: T2 → T3 → T4.

**Protocolo de controle positivo (todas as tasks):** sabotagem por `perl` com âncora contada = 1 (base LF — memória *harness: nunca inserir
\r\n*), md5 antes / sabotado / restaurado = antes, restauro por cópia `e186-<task>-*.bak`, `cmp`; log `e186-sab-<task>-cN.log`. Registrar na
Execução qual asserção caiu e com que número.

### T1 (tronco) — o helper compartilhado

Arquivos: `client/src/utils/pdfTexto.js`, `client/src/utils/pdfTexto.test.js` (**sem** `jest.mock('jspdf')`: usa `jest.requireActual('jspdf')`
— um jsPDF real, A4, mm — com o `console.error` do carregamento calado, molde `EpiAlmoxarifado.test.js:43-48`; para os `text`, um espião
fino que grava `[x, y, texto]` e repassa).

1. **Vermelho primeiro** (o arquivo não existe → todos caem no import; depois, com um esqueleto que devolve `[String(texto)]`, caem pelo motivo):
   - `[RN-186.01] cabe` — f9: `EIXO-SAE1045-D50-L1200-RT` em 33, `Eixo usinado em aco SAE 1045 retificado diametro 50 mm comprimento 1200` em
     77 e em 51, 120 `W` em 77 → toda linha `getTextWidth ≤ largura`; **metade positiva:** o de 25 letras tem 2 linhas, 120 `W` tem 5;
   - `[RN-186.01] nada perdido` — os mesmos + `'Maria  Aparecida'` (espaço duplo) → junção sem espaços = texto sem espaços;
   - `[RN-186.01] aparar` — o caso literal `'5wh5OcA0t japiucOIvi2s16Oms83ess-erx f9Otf5102mt8b2tewgIzj62zoi M5wwrIt'` em 30 (f9): nenhuma linha
     termina em espaço **e** toda linha ≤ 30 (cru, `'vi2s16Oms83ess-erx '` mede 30,54 — medido na Fase 0);
   - `[RN-186.01] vazio` — `''`, `null`, `undefined` → `['']`;
   - `[RN-186.01] fonte corrente` — o mesmo texto em f14 dá mais linhas que em f9 (prova que mede na fonte do `pdf`, não numa fixa);
   - `utilDasColunas([14, 48, 126, 142, 166])` → `[33, 77, 15, 23, 30]`; `([14, 48, 144])` → `[33, 95, 52]`;
   - `quebrarCelulas` + `desenharCelulas`: células `['EIXO-SAE1045-D50-L1200-RT', 'Folha A4']` em `[14, 48]`/`[33, 77]`, y = 100 → devolve 2;
     `text` em `(14, 100)`, `(14, 104)`, `(48, 100)` — um por linha, nunca array;
   - `desenharQuebrado` com 2 linhas, passo 6, y = 18 → devolve 30.
2. Implementar conforme o contrato. Comentário no topo: por que existe (B1231), por que **não** importa nada (M5 da 185), a diferença para
   `quebrarPorLargura` (corte por letra, aparelho, B1207).
3. **Controles positivos:**
   - (c1) sem o aparar (`.map((s) => String(s))`) → cai **só** `[RN-186.01] aparar` (`'vi2s16Oms83ess-erx '` 30,54 > 30 e termina em espaço);
     os outros ficam verdes — prova que o aparar tem teste próprio;
   - (c2) corte por contagem (`String(texto).slice(0, Math.floor(largura / 2))` numa linha) → caem `cabe` (metade positiva: 1 linha) e `nada perdido`;
   - (c3) `desenharCelulas` com `pdf.text(linhas, x, y)` (array) → cai o teste "um `text` por linha";
   - (c4) `utilDasColunas` sem a folga (`colunas[i + 1] - x`) → cai o literal `[33, 77, 15, 23, 30]`.
4. `CI=true npx react-scripts test src/utils/pdfTexto --watchAll=false`.

### T2 (galho) — remessa

Arquivos: `client/src/utils/remessaPdf.js`, `client/src/utils/remessaPdf.test.js`.

1. **Gravador primeiro:** `jest.mock('jspdf', …)` no `remessaPdf.test.js` com o molde `EpiAlmoxarifado.test.js:43-58` (`getTextWidth`,
   `splitTextToSize` e `setFontSize` vão para um jsPDF real; o resto é gravado em `mockPdf`). Os testes do descritor de hoje rodam **verdes**
   com ele antes de qualquer mudança de produção. Réguas no arquivo (copiadas, não importadas de outro teste — regra da 185):
   - `textosForaDaFolha()` — todo `text` (array: cada elemento) na fonte corrente gravada com `x + largura > 196` **ou** `y > 287`;
   - `linhasDaTabela()` — os `text` de fonte 9 entre a 1ª `line` (sublinhado do cabeçalho) e a 2ª `line` (fechamento), agrupados por item
     pela **sequência** (um item começa quando o x volta a 14 depois de uma célula de outra coluna — o recorte por y quebra na página 2, I1 da 185);
   - `celulasInvasoras()` — de `linhasDaTabela()`, toda linha com `x + largura > (i < 4 ? COLUNAS_REMESSA[i + 1] - 1 : 196)`, com
     `const COLUNAS_REMESSA = [14, 48, 126, 142, 166]` **literal** no teste (é o contrato).
2. **Vermelho primeiro** (`gerarRemessaPDF` com `save` gravado):
   - `[RN-186.02]` item `EIXO-SAE1045-D50-L1200-RT` / material de 71 → `celulasInvasoras()` vazio; junção de cada célula = texto; **metade
     positiva**: código em 2 linhas, material em 2;
   - `[RN-186.03]` item comum (`EPI-MASC-SOLDA-07`, material de 46, `UN`, `99999.125`, `1250.75`) → cada célula **um** `text`; x do
     cabeçalho e das células = `COLUNAS_REMESSA`;
   - `[RN-186.04]` (a) 3 itens curtos → y dos itens = `y0`, `y0 + 5`, `y0 + 10` (o de hoje); (b) item com material de 120 `W` (5 linhas) entre
     dois curtos → o seguinte em `y + 5 + 16`; (c) 60 itens de 5 linhas → nenhuma célula com y > 262, `addPage` ≥ 1, e as 5 linhas de cada
     item na **mesma** página (nenhum `addPage` entre células de um item);
   - `[RN-186.05]` proprietário com razão de 80 `W` e subtítulo com fornecedor de 120 → `textosForaDaFolha()` vazio, cada um em 2+ `text`;
     com textos curtos o y de `Gerado em` é o de hoje (`18 + 6 + 5 + 5` sem proprietário); observação de 10 linhas → a 1ª `line` da
     assinatura (x de 14 a 89) tem y > y da última linha da observação + 4; observação de 20 linhas com 50 itens antes → `textosForaDaFolha()`
     vazio (nada abaixo de 287);
   - `[RN-186.09]` pior caso (todos os longos + 60 itens + observação de 20 linhas + encerramento) → `textosForaDaFolha()` e `celulasInvasoras()`
     vazios;
   - `[RN-186.11]` a produção não chama `getTextWidth` nem `setFont` (`mockPdf` não tem esses nomes — o gravador registra a chamada antes de
     repassar a medida; ajustar o molde para gravar também `getTextWidth`).
3. Implementar conforme o contrato. Comentário citando B1220/C445 (185) e B1230/B1232/B1235: o papel volta assinado pelo terceiro (`:121`).
4. **Controles positivos:**
   - (c1) voltar ao corte de hoje (`pdf.text(String(c ?? '').slice(0, 40), COLUNAS[i], y)`, uma linha) → caem RN-186.02 (`EIXO-…` 57,8 > 47;
     junção do material) e RN-186.09;
   - (c2) desenhar só a 1ª linha de cada célula → cai **a junção** da RN-186.02 e **não** `celulasInvasoras` — prova que "nada perdido" não é
     a régua de largura com outro nome;
   - (c3) quebra de página por `y > 262` (ignorando n) → cai RN-186.04 (c) (célula com y até 278 > 262, ou linhas do item partidas);
   - (c4) colunas antigas `[14, 44, 124, 140, 166]` com a quebra nova → cai RN-186.03 (`EPI-MASC-SOLDA-07` em 2 `text`; x fora do contrato);
   - (c5) observações com `y += 10` fixo (o de hoje) → cai RN-186.05 (assinatura acima da última linha da observação);
   - (c6) proprietário sem quebra (`pdf.text(doc.proprietario, M, y)`) → cai RN-186.05 em `textosForaDaFolha()` (fonte 10).
5. `CI=true npx react-scripts test src/utils/remessaPdf src/components/datasDoChatDeComprasEDoAlmoxarifadoNoDiaLocal --watchAll=false` —
   o `datasDoChat…` **sem mudança**; se cair, é achado (provavelmente `getTextWidth` na produção), não ajuste.

### T3 (galho) — posição do cliente

Arquivos: `client/src/utils/posicaoClientePdf.js`, `client/src/utils/posicaoClientePdf.test.js`.

1. Gravador e réguas como na T2 (copiados), com `COLUNAS_ITENS = [14, 48, 100, 112, 132, 155, 177]` e `COLUNAS_APLICACOES = [14, 48, 144]`
   literais; `linhasDaTabela(k)` recorta a k-ésima tabela pela sequência de `line` (cabeçalho → fechamento; aplicações: a 3ª `line`
   em diante).
2. **Vermelho primeiro:**
   - `[RN-186.06]` item com código de 25 e material de 71 → `celulasInvasoras(itens)` vazio, junção = texto; **metade positiva:** material em 3
     linhas; item comum (`EPI-MASC-SOLDA-07`, `UN`, `99999.125` nas cinco numéricas) → um `text` por célula, x = `COLUNAS_ITENS`;
   - `[RN-186.07]` aplicação com `projeto_nome` de 80 → 2 linhas ≤ 143, junção = texto; `OS 2026-00042` em 1;
   - `[RN-186.04]` (posição) 70 itens de 3 linhas → nenhuma célula com y > 275 e nenhum item partido; 70 aplicações de 2 linhas → nenhuma > 280;
     com n = 1, o y dos itens é o de hoje;
   - `[RN-186.08]` `cliente.razao_social` de 69 (`'Industria e Comercio de Equipamentos para Saneamento Basico Ltda EPP'` completada até 69) →
     título em 2 `text` de fonte 14, ≤ 196; o y do cabeçalho da tabela > o da 2ª linha do título; razão curta → `Gerado em` em 24 (o de hoje);
   - `[RN-186.09]` pior caso → `textosForaDaFolha()` vazio; `[RN-186.11]` sem `getTextWidth`/`setFont` na produção.
3. Implementar conforme o contrato.
4. **Controles positivos:** (c1) `slice(0, 34)` de volta nos itens → cai RN-186.06; (c2) `slice(0, 60)` de volta nas aplicações → cai
   RN-186.07 (junção, perde 20); (c3) título sem quebra → cai RN-186.08 (233,8 em fonte 14); (c4) colunas antigas dos itens → cai RN-186.06
   (`EPI-MASC-SOLDA-07` em 2 `text`); (c5) quebra de página só por `y > 275` → cai RN-186.04 (posição).
5. `CI=true npx react-scripts test src/utils/posicaoClientePdf src/components/datasDoChatDeComprasEDoAlmoxarifadoNoDiaLocal --watchAll=false`.

### T4 (galho) — etiqueta: o código não sobrepõe o nome

Arquivos: `client/src/utils/etiquetasPdf.js`, `client/src/utils/etiquetasPdf.test.js`.

1. **Gravador primeiro:** no mock de hoje (`:1-20`), `splitTextToSize`, `setFont` e `setFontSize` passam também a um jsPDF real (o
   `doc.text` continua `jest.fn`, as asserções de hoje — inclusive a `:208`, `maxWidth` na linha de controle — não mudam). Rodar verde antes
   de qualquer mudança de produção.
2. **Vermelho primeiro** (`[RN-186.10]`, nas duas folhas — `A4_GRADE` e `TERMICA_100x50`):
   - `MAT-7` → o código num `text` com `setFontSize(14)` antes (como hoje) e o nome em `y + 15`;
   - `MP-ACO-INOX-304-CH-3MM` → código num `text` só, fonte **11** na A4 e **12** na térmica (Fase 0: 50,8 e 55,5), medido ≤ `larguraTexto` (55 / 56); nome em `y + 15`;
   - `'W'.repeat(40)` → código em 3 `text` de fonte 10, cada um ≤ `larguraTexto`, junção = o código; a 1ª linha do nome com y ≥ y da última do
     código + 4,5; a linha de controle no y de hoje (`y + altura − 5`);
   - régua "nada sobrepõe": para cada etiqueta, y do nome > y de toda linha do código.
3. Implementar conforme o contrato (comentário: B1237, a divergência 1 da Fase 0).
4. **Controles positivos:** (c1) voltar ao `maxWidth` em fonte 14 → cai o caso de 22 letras (o `text` sai com `maxWidth`, fonte 14, e
   `getTextWidth` 64,7 > 55) e a régua de sobreposição no de 40 `W`; (c2) encolher a fonte mas **não** descer o nome → cai só o de 40 `W`
   (nome em y + 15 com o código até y + 18); (c3) laço de fontes começando em 10 → cai o `MAT-7` (fonte 10 ≠ 14 — o desenho de quem já cabia
   não pode mudar).
5. `CI=true npx react-scripts test src/utils/etiquetasPdf src/components/almoxarifado/EtiquetasPdfModal --watchAll=false`.

### T5 — integração (rota real → fixture → tela → gerador → réguas) e sonda pós

Não há rota nova: a integração que cruza os galhos é **resposta real da rota → tela → gerador → réguas**, nos três documentos.

1. **Fixture pela rota real** (novo `server/tests/api/pdfsRemessaPosicaoFixture.api.test.js`, molde `epiFichaConfirmacaoIntegracao.api.test.js`
   — runner próprio, `testApp.js`, usuário com perfil real): cria cliente (razão social de 69), material do cliente e material próprio com
   código de 25 e nome de 71, fornecedor, remessa com 2 itens e observação de 10 linhas, uma saída para OS e uma para projeto de nome com
   80; faz `GET /api/almoxarifado/remessas-terceiros/:id` e `GET /api/almoxarifado/materiais-cliente/posicao?cliente_id=…`. Sempre: as chaves de
   cada item/aplicação da fixture versionada = as da resposta real (o teste cai se a rota mudar e ninguém regravar). Com `CRM_GRAVAR_FIXTURE=1`
   grava `client/src/utils/__fixtures__/remessa.rota.json` e `posicaoCliente.rota.json`. **Controle:** apagar uma chave da fixture → cai.
2. **Telas** (novo `client/src/components/almoxarifado/pdfsDeRemessaEPosicaoPelaTela.test.js`; molde das rotas e do clique:
   `datasDoChat…test.js:384-415`; gravador com medidas reais: `EpiAlmoxarifado.test.js:43-58`, mais `setFont`):
   - *Remessas a terceiros* com a fixture → abrir a remessa → **PDF da remessa** → `celulasInvasoras()` e `textosForaDaFolha()` vazios; metade
     positiva: o nome de 71 inteiro na junção do material e a assinatura abaixo da observação;
   - *Materiais de cliente* com a fixture → **PDF da posição** → réguas vazias; título em 2 linhas; projeto de 80 inteiro;
   - `EtiquetasPdfModal` (props do molde `EtiquetasPdfModal.test.js`, **sem** mockar o util; `qrcode` mockado) com uma etiqueta de código de
     22 letras → **Gerar** → o código num `text` de fonte ≤ 13 e o nome abaixo.
   Réguas copiadas no arquivo (não importar de outro teste).
3. **Controle positivo cruzado:** a (c1) da T2 derruba o teste da tela da remessa; a (c1) da T3 o da posição; a (c1) da T4 o do modal.
4. **Sonda real depois** (`p186-sonda-pos.js`, molde `p185-sonda-pos.js`): lê `COLUNAS*` dos arquivos de produção e `linhasPorLargura`/
   `utilDasColunas` de `pdfTexto.js` (regex) e mede os casos da Fase 0 — registrar na Execução o maior x final por coluna (antes → depois) e a
   junção = texto em todos; **controle da sonda** (útil + 1 mm) tem de achar casos além do limite.
5. **Suítes no fim** (sequenciais, uma vez cada): Jest inteiro e `CI=true build` (client); `test:api` (inclui o teste novo de fixture),
   `test:almoxarifado`, `test:validation`, `test:safealter`, `test:sqlite`. Citar os números reais.

### T6 (condicional) — ficha e termo usam o helper

**Só se** o fechamento da 185 (T4 dela) já estiver na `main` e ninguém mais estiver mexendo em `fichaEpiPdf.js`/`termoFerramentaPdf.js`. Senão,
**não executar**: vira a "próxima tarefa detalhada" desta etapa.

- `fichaEpiPdf.js`: a `linhasPorLargura` privada (`:61`) sai; importa de `./pdfTexto` (sem ciclo: `pdfTexto` não importa nada). `COLUNAS`,
  `UTIL_DA_COLUNA` → `utilDasColunas(COLUNAS)` (mesmo valor). `quebrarPorLargura` (aparelho) **fica**.
- `termoFerramentaPdf.js`: a closure `linhasQuebradas` passa a chamar `linhasPorLargura`. `quebrarTexto` **fica** (parágrafos).
- Guarda: os testes da 185 (`fichaEpiPdf`, `termoFerramentaPdf`, `EpiAlmoxarifado`, `FerramentasAlmoxarifado`) **sem nenhuma mudança** e verdes;
  controle: sabotar `pdfTexto.linhasPorLargura` (sem aparar) → caem os da 185 que dependem do M1 **e** os de T1 — prova que a ficha usa o
  helper de verdade. O M5 (termo importa `carregarImagemComoDataUrl` da ficha) não é tocado.

### T7 — Fase 5 e fechamento (skill `fechar-etapa`)

Revisão adversarial fresca **com sonda executada**. Perguntas obrigatórias: (1) algum texto da remessa, da posição ou da etiqueta ainda é
desenhado sem medida? (`grep -n "\.text(" ` nos três arquivos e conferir cada um — fixos e curtos valem, com a medida citada); (2) a linha que
cresce pode passar do limite numa virada de página (item mais alto que a página: a limitação **D (183)(5)** vale aqui também — repetir na D (186));
(3) o `FakePdf` da `datasDoChat…` ainda passa sem `getTextWidth`.

Fechamento: spec da feature das remessas a terceiros e a da posição de material de cliente (o defeito e o hash), a das etiquetas; mapa; guia do
usuário (roteiro: remessa com material de nome comprido e observação longa → **PDF da remessa** → conferir o nome inteiro, a linha mais alta e a
assinatura abaixo da observação; posição de cliente com razão social comprida; etiqueta de material com código comprido); novidades (seção da
Etapa 186, letras B abaixo; **B1220** da 185 corrigida para dizer que a remessa e a posição foram resolvidas na 186 e que o motivo dado às
etiquetas era meia verdade; **C445 → ✅ RESOLVIDO NA ETAPA 186** — se a 185 ainda não a registrou, registrar e resolver na mesma seção, dizendo
isso); este plano com a próxima tarefa detalhada.

## Letra B proposta (para `docs/almoxarifado-novidades-por-etapa.md`)

- **B1230 — Remessa e posição do cliente QUEBRAM a célula em linhas; nada é truncado.** **Escolhido:** a mesma regra da ficha (B1215): quebrar
  em quantas linhas precisar e medir a altura da linha com isso. A remessa **é** prova — o papel volta assinado pelo terceiro
  (`remessaPdf.js:121`) — e a posição é o que o cliente usa para conferir o patrimônio dele. **Descartado:** (a) truncar com reticências — um
  papel assinado que esconde parte do nome do material não prova o que saiu; (b) diminuir a fonte até caber — sem limite de tamanho nos
  cadastros, chega a ilegível; (c) paisagem — muda o documento inteiro e só adia. **Fora, como candidatos:** `Relatorios.js` (corte de 40/60
  letras dentro de `autoTable`, que não invade; relatório comercial) e `gerarPDFProposta.js` (já mede; review próprio). **Reversível.**
- **B1231 — O helper de quebra vira `client/src/utils/pdfTexto.js`, sem imports; ficha e termo migram depois (T6 condicional).** **Escolhido:**
  arquivo novo que recebe o `pdf` por parâmetro. **Descartado:** (a) importar a `linhasPorLargura` de `fichaEpiPdf.js` — puxaria `dataLocal`,
  `resolveMaterialPhotoUrl`, `epiEntrega` e `termoFerramenta` para a remessa e repetiria o acoplamento M5 da 185 (sabotagem da ficha derrubando
  outra suíte); (b) migrar ficha e termo já — estão em revisão em paralelo; (c) mover `quebrarTexto` — só o termo usa parágrafos.
  **Reversível.**
- **B1232 — Colunas redistribuídas (medidas).** Remessa x = 14, 48, 126, 142, 166; posição x = 14, 48, 100, 112, 132, 155, 177; aplicações x =
  14, 48, 144. O código ganhou a largura de `EPI-MASC-SOLDA-07` (o padrão dos EPIs, que hoje invade); o material da remessa ainda cabe em uma
  linha com 46–50 letras. **Descartado:** manter as colunas e só quebrar — todo código de EPI viraria 2 linhas. **Reversível.**
- **B1233 — Passo da linha: 5 mm na primeira (o de hoje), 4 mm nas de continuação; a linha só começa na página se a última linha dela fica sob
  o limite de hoje (262 / 275 / 280).** Com textos curtos o desenho é idêntico ao de hoje. **Descartado:** passo 5 em todas (linha alta demais);
  partir a linha entre páginas (o item deixa de ser lido de uma vez). **Reversível.**
- **B1234 — O cabeçalho da tabela NÃO é repetido na página nova** (como hoje). **Descartado:** repetir (a ficha repete) — muda o desenho além do
  defeito; candidato a uma etapa de layout. **Reversível.**
- **B1235 — As observações da remessa passam a avançar pela altura real, com quebra de página.** Defeito novo, medido: com 7+ linhas o texto
  cruzava a linha de assinatura (`y += 10` fixo) e uma observação longa perto do fim saía da folha (309 mm). Mantida a largura de 175 mm.
  O encerramento (`y += 5 × linhas`) não muda — não sobrepõe. **Reversível.**
- **B1236 — O título e as linhas de identificação dos dois PDFs quebram em 182 mm.** Medido: a razão social de 69 letras (a maior do banco)
  levava o título da posição a 233,8 mm. **Reversível.**
- **B1237 — Etiqueta: o código encolhe (14 → 10) até caber numa linha; abaixo disso quebra e o nome desce. O nome continua em 2 linhas.**
  A B1220 (185) dizia que as etiquetas "já medem" — **meia verdade**: o código, com `maxWidth`, quebrava e escrevia por cima do nome a partir de
  ~22 letras. **Descartado:** truncar o código (é o que a pessoa lê na prateleira); quebrar sempre em fonte 14 (a etiqueta fica com o nome
  espremido). O corte do nome em 2 linhas fica — espaço físico, e o QR identifica o material. **Reversível.**
- **B1238 — Número com ruído de ponto flutuante (`0.30000000000000004`) quebra em 2 linhas nas colunas numéricas.** Nada é perdido nem invade.
  Formatar o número (casas decimais) é outra decisão, de exibição em todo o módulo — fora. **Reversível.**
- **B1239** — a próxima etapa (preenchida no fechamento).

## Emendas da Fase 2

**Revisão fresca (2026-10-22), sobre `36208ddd`. Prevalece sobre as regras e as tasks acima.** Resultado: **0 críticos, 4 importantes,
8 menores.** Sondas do revisor com o jsPDF real (`client/node_modules/jspdf/dist/jspdf.node.min.js`), no scratchpad
`C:\Users\User\AppData\Local\Temp\claude\C--Users-User-projetos-CRM-main\bf36ab2c-c3a4-467f-bc1f-24a9b62a2a92\scratchpad\f2r186-sonda.js`,
`f2r186-sonda2.js` e `f2r186-sonda3.js` (prefixo `f2r186-`).

### O que foi conferido e bate

- **Medidas da Fase 0, refeitas (`f2r186-sonda.js`):** `EPI-MASC-SOLDA-07` f9 = 31,53 → fim 45,53 (útil novo até 47); material de 50 letras em
  x 48 → 124,14 (≤ 125); o de 71 → 2 linhas na remessa (77) e 3 na posição (51); hoje perde 31 (desenhado até 102,9); `EIXO-SAE1045-D50-L1200-RT`
  em 33 → `["EIXO-SAE1045-D50-L","1200-RT"]`; 120 `W` → 5 linhas em 77 (f9), 8 em 51, **8** em 77 com f14 (a "fonte corrente" da T1 sabe
  falhar); o literal do aparar → `'vi2s16Oms83ess-erx '` cru mede **30,54** (> 30); vazio/`null`/`undefined` → `['']`; título da posição com a
  razão de 69 → 233,78 hoje, 2 linhas (fim 192,34) em 182. Etiqueta, negrito: `MP-ACO-INOX-304-CH-3MM` f14 64,70 / f13 60,08 / f12 55,46 /
  f11 50,84 — `splitTextToSize` dá 1 linha em **f11** a 55 (A4) e em **f12** a 56 (térmica), e mede **no negrito corrente** (normal f14 = 64,40);
  40 `W` em f10 → 3 linhas. `larguraTexto` conferida no código: A4 99 − 4 − 32 − 8 = **55**; térmica 100 − 4 − 32 − 8 = **56**.
- **Referências de linha** de `remessaPdf.js` (`:89-96`, `:100`, `:110`, `:118`, `:121`), `posicaoClientePdf.js` (`:54`, `:68`, `:90`),
  `etiquetasPdf.js` (`:165`, `:168`, `:173`), `datasDoChat…test.js` (o `FakePdf` sem `getTextWidth`/`setFont`; os testes da remessa e da posição
  logo depois de `:384`), `EpiAlmoxarifado.test.js:43-58`, `etiquetasPdf.test.js:208` (só a linha de controle exige `maxWidth`; nenhum teste
  exige `maxWidth` no código — tirar dele não quebra asserção de hoje) e as rotas `extended.js:2177`/`:2774`: conferem.
- **Sem limite no servidor** (afirmação da Fase 0): `schemas.js:12-13/239/249` (`codigo`, `nome` só `min(1)`), `:417-426` (`observacoes`,
  `tipo_servico`, `fornecedor_nome` sem `max`), `thirdPartyService.js:613` (`encerramento_justificativa` só exige não vazia). Confere.
- **Dados reais só leitura:** `p186-dados-reais.js` abre `projetos/CRM/server/data/database.sqlite` com `sqlite3.OPEN_READONLY` e só faz
  `SELECT`. Reexecutado pelo revisor: `database.sqlite` e `-wal` com o mesmo tamanho e a mesma hora antes e depois (só o `-shm`, índice de
  memória do WAL, muda de hora — normal em leitor); nada da `CRM-main` foi tocado. `clientes.razao_social` máx. **69** confere. (A consulta
  `remessas` erra o nome da tabela — `no such table` — mas o plano não usa esse número.)
- **RN × specs e decisões:** quebra por palavra (`splitTextToSize`) na remessa é coerente com a **B1215** (ficha, também prova) e não fere a
  **B1207** — o corte letra a letra é só para o aparelho, cuja junção tem de ser o texto gravado literal; nenhum campo da remessa/posição tem
  essa exigência. O plano respeita a **I3** da 185 (a remessa **é** prova, C445 incondicional). As specs 13, 14 e 10 não afirmam nada do
  desenho que a etapa contradiga.
- **Dependência da 185 (o que o outro agente fecha agora):** a guarda de avanço de `9a5f46a0` (`palavra &&`) é **de `quebrarTexto`**, que
  **não** se move (B1231 (c)) — o helper novo não a "herda" porque não usa aquele laço. `splitTextToSize` termina sozinho com qualquer largura
  (sonda: `0`, `-1`, `0.1` → linhas de 1 letra e linhas vazias; `NaN`, `Infinity` → a linha inteira, sem quebrar), em 0 ms. Ver M1. A T6 já
  está condicionada ao fechamento da 185 na `main` — confere (no momento desta revisão o fechamento da 185 está **não commitado** na árvore:
  `docs/almoxarifado-novidades-por-etapa.md`, plano da 185, specs 16/25 e mapa modificados; a T6 **não** pode começar ainda).
- **Galhos:** T2/T3/T4 mexem em arquivos de produção disjuntos e cada teste tem o próprio `jest.mock('jspdf')` (nenhum mock compartilhado; a
  T5 cria o dela). RN-186.11 é coerente com o `FakePdf`: com `splitTextToSize → [t]`, `linhasPorLargura`/`desenharQuebrado` desenham a string
  inteira num `text` — `'Prazo previsto: 21/10/2026   ·   Status: ENVIADA'` e `'Posição de materiais — CLI 170'` continuam iguais. Mas ver I2.
- **Controles positivos** de T2 (c3: itens de 5 linhas, passo 21, a partir de y 49 → um começa em 259 e iria a 275), T3 (c5: itens de 3 linhas
  a partir de y 39 → um começa em 273 e iria a 281), T4 (c1, c2, c3): **sabem falhar** pelo cálculo. Exceção: a observação (I1).

### Importantes

- **I1 — O cenário "observação de 20 linhas com 50 itens antes" (T2, `[RN-186.05]` e `[RN-186.09]` com 60 itens) não chega perto do fim da
  folha: passa mesmo sem a quebra de página das observações.** Medido (`f2r186-sonda3.js`, o contrato só em y): com 50 itens a página 1 leva 43
  (49 + 5·42 = 259), a 2 leva 7, o rótulo *Observações:* cai em y **68** e a última linha em **149** — com ou sem `addPage`, igual. Com 60, 118
  → 199. O defeito da Fase 0 ("20 linhas a partir de y = 240 vão a 309,4") só aparece com **37 a 42 itens**: com 37, rótulo em **249**, sem quebra a
  última linha vai a **330**, com quebra a **278** na página 2. **Emenda:** em T2, o cenário vira **37 itens curtos + observação de 20 linhas**
  (asserção: `textosForaDaFolha()` vazio **e** pelo menos um `addPage` **entre** linhas da observação — metade positiva); o pior caso da
  `[RN-186.09]` usa 37 itens (ou soma um segundo caso com 37); e um controle novo **(c7) tirar o `addPage` das observações → cai esse teste**
  (linha em y 330 > 287). Registrar o número na Execução.
- **I2 — "Galhos independentes" não vale para o `datasDoChat…test.js`: ele importa as duas telas (`RemessasTerceirosAlmoxarifado` e
  `MateriaisClienteAlmoxarifado`, linhas 32-33) e, por elas, `remessaPdf.js` **e** `posicaoClientePdf.js`; também importa
  `FerramentasAlmoxarifado` → `termoFerramentaPdf.js` → `fichaEpiPdf.js` (a 185).** O passo 5 de T2 e o de T3 rodam esse arquivo: em paralelo,
  um arquivo do outro galho no meio da edição (erro de sintaxe, import novo ainda sem export) ou sabotado derruba o `datasDoChat` do vizinho — o
  caso da memória *sabotagem concorrente contamina a suíte*, por um caminho que a regra "sabotagem só no próprio arquivo" não pega. **Emenda:**
  em paralelo, o passo 5 de T2 e T3 roda **só** o teste do próprio util; o `datasDoChat…` roda **uma vez** depois que T2 **e** T3 restauraram
  (`cmp`) e commitaram, como abertura da T5 (com o resultado citado). Se rodar sequencial (T2 → T3 → T4), vale como está.
- **I3 — A receita da fixture (T5 passo 1) manda uma remessa com material do cliente e material próprio: a rota recusa.** `thirdPartyService.js`
  `resolverProprietario` (`:93-107`) lança *"A remessa mistura materiais de donos diferentes"* quando os donos diferem. **Emenda:** a remessa da
  fixture leva **dois itens do mesmo cliente** (o de razão social de 69): um material do cliente com código de 25 e nome de 71, outro comum — assim
  a resposta real traz `proprietario_cliente_nome` com os 69 e a linha *Material de propriedade de …* é exercida com dado de rota (mede 175,75 em
  f10 — cabe numa linha; a quebra do proprietário continua provada pelo teste de 80 `W` da T2). Material próprio fica só para a posição (não
  entra) ou fora. O teste do servidor cria a entrada do material do cliente (com dono) antes da remessa e das saídas para OS/projeto.
- **I4 — A B1234 (não repetir o cabeçalho da tabela na página nova) é a escolha errada para um papel de prova, e a pergunta da revisão cobre o
  gesto "quebra de página com cabeçalho repetido".** A ficha (185) repete (`fichaEpiPdf.js:149-175`, `cabecalho()` depois do `addPage`). Na
  remessa, Qtde e Peso são duas colunas de número lado a lado: na página 2 sem cabeçalho, quem assina não sabe qual é qual — e esta etapa
  **aumenta** as páginas 2 (linhas mais altas). O argumento "muda o desenho além do defeito" não pesa: o desenho com uma página só fica idêntico,
  e o custo é uma função de 2 linhas. **Emenda (reversível):** remessa e as duas tabelas da posição **repetem o cabeçalho** (fonte 9, mesmos x,
  `y += 2`, `line`, `y += 5`) depois de todo `addPage` **dentro** da tabela. A RN-186.04 passa a dizer: depois do `addPage`, `y = 18`, cabeçalho,
  e a linha começa em `18 + 7 = 25`. Testes: em T2 (c) e T3 (posição) — cada página com itens começa com os 5 (7, 3) cabeçalhos nos x do
  contrato; com uma página só, um cabeçalho (o de hoje). Controle **(c8)** tirar a repetição → cai. A **B1234** é reescrita: *"O cabeçalho da
  tabela É repetido na página nova (como a ficha, B1215). Descartado: não repetir (como era) — na página 2 Qtde e Peso ficam sem nome num papel
  assinado."* Cuidado na `linhasDaTabela()` da T2/T3: o recorte por sequência tem de pular os cabeçalhos repetidos (são `text` de fonte 9 em
  x = 14 — reconhecer pela string `'Código'`, não pelo x).

### Menores

- **M1 — O helper aceita largura degenerada em silêncio.** `splitTextToSize` com `NaN`/`Infinity` devolve a linha inteira (a `[RN-186.01] cabe`
  falharia sem ninguém ver na produção); com `≤ 0` devolve linhas de uma letra e linhas vazias. Não trava (diferente do `quebrarTexto` da 185),
  mas é a mesma lição de `9a5f46a0` (*"a função é exportada"*). **Emenda:** T1 ganha `[RN-186.01] largura inválida` — `linhasPorLargura` lança
  `Error` com `largura` não finita ou `≤ 0` (`0`, `-1`, `NaN`, `Infinity`); com régua de teto não precisa (não há laço próprio). As larguras de
  produção são constantes positivas, então nada muda no desenho.
- **M2 — RN-186.09 "nenhum `text` com y > 287" promete mais do que o contrato cobre: o encerramento e o cabeçalho da tabela não olham a página.**
  `encerramento_justificativa` não tem limite (`thirdPartyService.js:613`): medido, ~5 000 letras levam o bloco a y ≈ 260 e o cabeçalho da
  tabela sai abaixo de 287 sem `addPage`. Não é plausível, mas é texto livre num papel assinado. **Emenda:** o pior caso da T2 inclui uma
  justificativa de 500 letras (5 linhas — plausível) e a D (186) registra a limitação junto da D (183)(5) (*"cabeçalho com texto livre de
  milhares de letras passa da folha"*). Não mexer no encerramento (fora do defeito).
- **M3 — Etiqueta: o número de linhas do código em fonte 10 não tem teto.** 150 `W` → 10 linhas → o código vai a y + 49,5 e o nome a y + 55,5:
  passa da térmica (50) e cobre a linha de controle (y + 45). Código de etiqueta é curto na prática (até ~26 letras cabem em f10 numa linha).
  **Emenda:** a régua "nada sobrepõe" da T4 inclui a linha de controle (última linha do nome < y da linha de controle − 3) e um caso de 80 `W`
  (5 linhas, nome em y + 33/36,3 < 45 na térmica); a limitação (código de 100+ letras) entra na D (186). Sem corte.
- **M4 — Congelar o helper explicitamente.** O plano diz que nenhum galho **sabota** `pdfTexto.js`, mas não diz que nenhum galho **edita**.
  **Emenda:** depois do commit da T1, `pdfTexto.js` e o teste dele ficam congelados; se T2/T3 precisarem de mudança nele, param, volta ao tronco
  (sequencial) e o outro galho espera.
- **M5 — Referências da 185 desatualizadas pela Fase 5 dela.** A Fase 0 mediu sobre `a9759b07`; `9a5f46a0` deslocou `termoFerramentaPdf.js`: a
  closure `linhasQuebradas` está em **`:103`** (não `:101`). `fichaEpiPdf.js:61` confere. **Emenda:** a T6 relê as linhas no `HEAD` do dia e
  **não** toca no `quebrarTexto` nem na guarda `palavra &&` (`:33`) — o teste de terminação de `9a5f46a0` continua verde sem mudança.
- **M6 — A "assinatura abaixo da última linha da observação" (RN-186.05) tem de olhar a página.** Com a observação perto do fim, `y > 245`
  manda a assinatura para a página seguinte, em y 30 — menor que o y da última linha da observação na página anterior. **Emenda:** a asserção
  da T2/T5 compara **(página, y)** (contar `addPage` antes de cada chamada): ou mesma página e y maior que a última linha + 4, ou página posterior.
- **M7 — Os limiares "a partir de N letras" da Fase 0 dependem das letras.** Com texto real (a razão de 69 do banco, repetida), o título da posição
  passa da margem com **54** letras de razão (o plano diz 48) e o proprietário com **83** (o plano diz 72). Os números do plano valem para letra
  larga; nada nas RN depende deles. **Emenda:** na Execução/fechamento, citar os dois (letra larga / texto real), não só um.
- **M8 — A T7 corrige a B1220 a partir do texto final, não da proposta.** O fechamento da 185 (em curso, não commitado) reescreve a B1220 com a
  emenda I3 dela e registra a C445 no documento de novidades. **Emenda:** a T7 lê a B1220 e a C445 **no `docs/almoxarifado-novidades-por-etapa.md`
  da `main`** antes de corrigir; se a C445 já estiver lá, só marca *✅ RESOLVIDO NA ETAPA 186*.

## Execução

*(vazia — nenhuma task executada)*
