# Etapa 185 — A tabela da ficha de EPI (e o termo de ferramenta) cabe na folha: célula quebra em linhas, nada é cortado

> **Status:** ✅ **FECHADA (2026-10-22): T1 `b194b38b`, T2 `b76f7146`, T3 `06ef5377`; Fase 5 (0 críticos, 0 importantes, 4 menores — 2
> corrigidos, 2 registrados) `9a5f46a0`, `c98036ac`; fechamento (skill `fechar-etapa`) no commit seguinte.** Próxima: **Etapa 186** (ver
> "Próxima tarefa detalhada", no fim). Fase 2 (revisão fresca) feita — ver "Emendas da Fase 2" (0 críticos, 3 importantes, 9 menores; prevalecem).
> Feature **25** (entrega de EPI) e **feature das ferramentas** (termo de responsabilidade, Etapa 180). Corrige **B1208** / **C444**
> (registrados na Etapa 183, defeito da 178). Decisões desta etapa a partir de **B1215** (a 184 reservou até B1214).
> Antes: Etapa 184 (aprovadores da liberação por valor) — **outra sessão revisa a 184 em paralelo: não tocar nos arquivos dela**
> (`requisitionValueApprovalService.js`, `routes/almoxarifado.js`, as telas de Requisições/Configurações e o plano da 184).

## Objetivo (em linguagem simples)

A ficha de EPI em PDF é a prova da NR-6: quem recebeu, o quê, quando, com que CA, quem entregou. Hoje a **linha de cada entrega** é
desenhada cortando cada texto por **número de letras**, sem olhar o espaço do papel. Resultado:

- o nome de quem entregou passa da margem (*Joao Almoxarife* termina em 198,6 mm; a margem é 196) ou **sai da folha** (*Maria Aparecida
  dos Santo* termina em 214 mm — o fim do nome não aparece no papel);
- o nome do EPI comprido **encosta e invade** a coluna do CA e **perde o fim** (*…Mascara de solda automatica escurecimento DIN 9-13*
  perde 34 letras);
- até o motivo mais comum sai errado: **"Primeira entrega" sai "Primeira entreg"** — falta uma letra em toda primeira entrega, hoje.

Depois desta etapa: **cada célula quebra em quantas linhas precisar** (a linha da entrega fica mais alta), **nenhuma letra é perdida**,
nada invade a coluna vizinha nem passa da margem — e as colunas são redistribuídas para que os textos comuns caibam numa linha só.
O mesmo defeito existe no **termo de responsabilidade da ferramenta** (também é prova assinada): o texto do termo em caixa alta vai a
210,6 mm, e a linha *"Registrado por"* com um nome comprido passa da margem. Ele entra no escopo.

Nada muda no que é gravado, na API, nem na tela: só o **desenho** do PDF.

## Fase 0 (medido em 2026-10-22, sobre `fd08624c`)

**Como foi medido.** Sondas no scratchpad com o **jsPDF real** do client (`client/node_modules/jspdf/dist/jspdf.node.min.js`, Helvetica,
mm, A4) — molde `fix183-sonda-real.js` da 183. As posições das colunas e as larguras do corte foram **lidas do arquivo de produção** por
regex (não copiadas à mão):
- `p185-sonda-tabela.js` — cada coluna da tabela da ficha: limite, quantos glifos cabem, textos reais/plausíveis, o que o corte atual faz;
- `p185-sonda-colunas-novas.js` — o layout atual e o proposto com `splitTextToSize` (quebra por largura), folga de 1 mm;
- `p185-sonda-outros.js` — termo de ferramenta, remessa e posição do cliente.

(Caminho completo: `C:\Users\User\AppData\Local\Temp\claude\C--Users-User-projetos-CRM-main\bf36ab2c-c3a4-467f-bc1f-24a9b62a2a92\scratchpad\p185-*.js`.)

### O código hoje

`client/src/utils/fichaEpiPdf.js`, `gerarFichaEpiPdf`:
- `const cols = [M, M + 20, M + 72, M + 92, M + 114, M + 126, M + 140, M + 162]` → x = **14, 34, 86, 106, 128, 140, 154, 176** (fonte 9);
- `const larguras = [10, 26, 10, 11, 6, 7, 11, 18]` e `celulas.forEach((c, i) => pdf.text(String(c).slice(0, larguras[i] * 1.4), cols[i], y))`
  — corte por **contagem** (14, 36, 14, 15, 8, 9, 15, 25 caracteres), **uma** linha por célula, sem medir;
- a altura da entrega (Etapa 183, B1207): `4 + 3 × (linhas de matrícula + linhas de aparelho) + 2 + (25 com imagem | 8 sem)`, e a entrega só
  começa na página se `y + altura ≤ 287` (`RODAPE`). O `4` é a **uma** linha da tabela;
- o cabeçalho da ficha (título fonte 14, `Nome: … Matrícula: …` e `Setor: … CPF: …` fonte 9, aviso de excluído) é `pdf.text` de uma linha,
  sem quebra.

O descritor `montarFichaEpi` **já** carrega os textos inteiros (`epi`, `ca`, `tamanho`, `motivo`, `entreguePor`…): o corte está **só** no desenho.
A tela da ficha (`EpiAlmoxarifado.js`) não usa o corte — lá o nome sai inteiro (é o que o C444 manda conferir).

### Medida por coluna (fonte 9, layout atual; "útil" = até a próxima coluna, ou até 196 na última)

| # | Coluna | x | útil (mm) | corte atual | cabem | texto real/plausível → fim (mm) | defeito hoje |
|---|---|---|---|---|---|---|---|
| 0 | Data | 14 | 20 | 14 car. | 10 `a`, 6 `W` | `22/10/2026` → 29,7 | nenhum (formato fixo) |
| 1 | EPI (`código — nome`) | 34 | 52 | 36 car. | 29 `a`, 17 `W` | `EPI-RESP-PFF2 — Respirador PFF2 sem valvula` (43) → desenhado até **94,2** (invade o CA, x 86), perde 7; `EPI-MASC-SOLDA-07 — Mascara de solda automatica escurecimento DIN 9-13` (70) → **95,4**, perde **34**; `EPI-BOT-0042 — Botina … numero 42` (70) → 90,5, perde 34 | **invade + perde texto** |
| 2 | CA | 86 | 20 | 14 car. | 10 `a`, 6 `W` | `12345` → 94,7; `45.678/2024` → 103,5; 20 `W` → **127,8** (invade Validade, x 106), perde 6 | invade no caso extremo (`ca_numero` é texto livre do cadastro do material, sem limite) |
| 3 | Validade CA | 106 | 22 | 15 car. | 12 `a` | `31/03/2027` → 121,7 | nenhum (formato fixo) |
| 4 | Qtd | 128 | 12 | 8 car. | 6 `a` | `99999` → 136,7 | nenhum plausível |
| 5 | Tam. | 140 | 14 | 9 car. | 7 `a`, 4 `W` | `XGG`/`42`/`Unico` cabem; `Tamanho especial XGG` (20, o máximo do servidor — `epiService.validarOpcionais`) → **155,6** (invade Motivo, x 154), perde 11 | invade + perde (caso raro) |
| 6 | Motivo | 154 | 22 | 15 car. | 12 `a` | **`Primeira entrega` (16) → sai `Primeira entreg`** (perde 1; inteiro iria a 177,3, invadindo *Entregue por*); `Troca`/`Perda`/`Dano` cabem | **perde texto em todo motivo "Primeira entrega" — caso comum** |
| 7 | Entregue por | 176 | 20 (margem 196) | 25 car. | 10 `a`, 6 `W` | `Ana Lima` → 189,3; **`Joao Almoxarife` (15) → 198,6** (passa da margem); `Administrador do Sistema` (24) → **212,1**; `Maria Aparecida dos Santo` (25) → **214,0** (fora da folha); `Maria Aparecida dos Santos Oliveira` (35) → 214,0 desenhado, perde 10 | **passa da margem / sai da folha** — o B1208 |

Pior caso do corte atual (n × `W`, n = o corte): Data 55,8; EPI 141,4; CA 127,8; Validade 150,8; Qtd 151,9; Tam. 166,9; Motivo 198,8;
Entregue por **250,6** mm. Os nomes de quem entregou (`users.nome`) e de material **não têm tamanho máximo** no cadastro.

Cabeçalhos da tabela (fonte 9) cabem todos (o maior, `Entregue por`, termina em 194,2).

**Fora da tabela, na ficha:** linha do hash (fonte 7) → 163,2 (ok, número e hash de tamanho fixo); título fonte 14 com nome de 53 → 166,8, de
59 → 186,1 — **um nome de ~66+ letras passa da margem**; `Nome: … Matrícula: …` com nome de 83 → 181,6 (passa com ~95+); `Setor/CPF` e aviso de
excluído ok com textos plausíveis. O nome do colaborador também não tem limite (`colaboradores.nome TEXT`).

### O layout proposto (medido)

Redistribuir as larguras sem mudar a área (14 → 196 = 182 mm): x = **14, 32, 82, 102, 121, 131, 143, 168**; útil com **folga de 1 mm** antes da
próxima coluna: **17 / 49 / 19 / 18 / 9 / 11 / 24 / 28** mm. Com `splitTextToSize` (quebra por palavra, palavra maior que a coluna quebrada por
caractere), medido:

| Coluna | útil | resultado |
|---|---|---|
| Data | 17 | `22/10/2026` 1 linha (29,7 ≤ 31) |
| EPI | 49 | 28 car. 1 linha; 43 car. 2 linhas; 70 car. 3 linhas (fim ≤ 80,6 ≤ 81) |
| CA | 19 | `12345`, `45.678/2024` 1 linha (99,5 ≤ 101); 20 `W` 4 linhas |
| Validade CA | 18 | `31/03/2027` 1 linha (117,7 ≤ 120); cabeçalho `Validade CA` 119,5 ≤ 120 |
| Qtd | 9 | até `99999` 1 linha (129,7 ≤ 130); **`100000` vira 2 linhas** (B1221) |
| Tam. | 11 | `G`, `Unico` 1 linha; `Tamanho especial XGG` 4 linhas |
| Motivo | 24 | **`Primeira entrega` 1 linha inteira** (166,3 ≤ 167) |
| Entregue por | 28 | **`Joao Almoxarife` 1 linha** (190,6); `Administrador do Sistema` 2; `Maria Aparecida dos Santos Oliveira` 2 (195,4); 60 `W` 7 |

Junção sem espaços = texto sem espaços em **todos** os casos medidos (nada perdido). Os cabeçalhos cabem em 1 linha.
**Nenhuma coluna em x = 28** (`M + 14`): é o recuo das linhas seguintes do aparelho, e o leitor `linhasDoAparelho` do teste
(`fichaEpiPdf.test.js:172,272`) reconhece a continuação por `x === 28`.

O layout de hoje com a mesma quebra também funcionaria, mas `Primeira entrega` e `Joao Almoxarife` virariam **2 linhas** — a linha mais comum da
ficha (primeira entrega, almoxarife de nome médio) ficaria mais alta em toda entrega (B1216).

### Outros PDFs do almoxarifado (`client/src/utils/*Pdf.js`)

| Arquivo | Padrão | Medido | Decisão |
|---|---|---|---|
| `termoFerramentaPdf.js` (termo de responsabilidade — **prova assinada**, Etapa 180) | `quebrarTexto(texto, 95)` por **contagem**; linhas de identificação de uma linha, sem quebra | texto do termo em **CAIXA ALTA** → **210,6** mm (sai da folha); 200 `W` → 329,0; texto comum → 168,6 (ok); `Devolução prevista … Registrado por: <nome de 44> … Assinado em …` → **199,9**; `Matrícula confirmada …` com matrícula de 40 → 195,0 (41+ passa); `Ferramenta: … Série: …` com nome de 52 → 174,7; hashes (fonte 7) 162,8 / 135,3 | **ENTRA** (B1219) |
| `remessaPdf.js` (remessa a terceiros) | `slice(0, 40)` por coluna, fonte 9 | código de 26 car. → 64,3 (invade Material, x 44); material cortado em 40 car. (cabe na coluna, perde o resto) | **FORA** (B1220) |
| `posicaoClientePdf.js` (posição de material de cliente) | `slice(0, 34)` / `slice(0, 60)` | código de 16 car. → 40,5 (invade, x 40); material cortado em 34 | **FORA** (B1220) |
| `etiquetasPdf.js` | `maxWidth` / `splitTextToSize(...).slice(0, 2)` — **já mede** | não medido (a etiqueta é física, 2 linhas de nome por decisão) | **FORA** (B1220) |

### Testes que tocam o desenho (cuidado com o mock)

- `client/src/utils/fichaEpiPdf.test.js` — gravador do `jspdf` que **já** manda `getTextWidth`/`splitTextToSize`/`setFontSize` para um jsPDF
  real (183, M1); réguas `textosFora` (**só fonte 7** hoje), `conferirRodape`, `linhasDoAparelho`; montagem "entrega em 234" (divisória da 6ª
  em 229 — vale enquanto `ENTREGA` couber em 1 linha por célula: com o layout **atual** + quebra, `Joao Almoxarife` vira 2 linhas e a montagem
  quebra; com o proposto, não).
- `client/src/components/almoxarifado/EpiAlmoxarifado.test.js:43` — mesmo gravador com medidas reais (gera a ficha pela tela).
- `client/src/utils/termoFerramentaPdf.test.js:15` e `client/src/components/almoxarifado/FerramentasAlmoxarifado.test.js:44` — gravador **sem**
  medidas (devolve `undefined` para tudo). Com `splitTextToSize`/`getTextWidth` no termo, o teste da tela quebra (`undefined.forEach`) e o do
  util também — os dois gravadores têm de passar a medir com o jsPDF real (molde: `EpiAlmoxarifado.test.js:43-58`).
- `client/src/components/datasDoChatDeComprasEDoAlmoxarifadoNoDiaLocal.test.js:62` — `FakePdf` para remessa/posição (fora do escopo; não muda).

### Divergências da Fase 0

1. O B1208 dizia *"um nome de ~16+ caracteres passa da margem"* e a C444 *"uns 15"* — medido: **15** (`Joao Almoxarife`, 198,6). Coerente.
2. O B1208 nomeou só *Entregue por* e o EPI. A medida acha também **Motivo** — e ali o defeito é **perda de texto num valor fixo e comum**
   (`Primeira entrega` → `Primeira entreg`), não só num caso extremo. E **Tam.** (até 20 car. no servidor) e **CA** (texto livre) invadem a
   coluna vizinha nos casos raros. O fechamento corrige o B1208/C444 para nomear as quatro colunas.
3. O termo de ferramenta tem o **mesmo** defeito (o pedido perguntava; a medida confirma) — entra.

## Regras

| ID | Regra | Cenário |
|---|---|---|
| RN-185.01 | Na linha de cada entrega da ficha, **todo texto de cada célula termina antes da coluna seguinte** (`x + largura ≤ x_próxima − 1`) e o da última (*Entregue por*) até a margem (`≤ 196`), medido com a fonte 9 real. | `entregue_por_nome: 'Maria Aparecida dos Santos Oliveira'` → 2 linhas em x 168, a maior termina ≤ 196 (medido 195,4); `material_nome` de 60+ car. → nenhuma linha do EPI passa de 81. |
| RN-185.02 | **Nenhuma letra é perdida**: para cada célula, a junção das linhas desenhadas, sem espaços, é igual ao texto do descritor sem espaços (a quebra só come o espaço entre palavras). Não há reticências nem corte. | `motivo: 'PRIMEIRA_ENTREGA'` → o PDF tem `Primeira entrega` inteiro (hoje `Primeira entreg`); EPI de 70 car. → 3 linhas cuja junção é o texto (hoje perde 34). |
| RN-185.03 | **Colunas**: x = `[14, 32, 82, 102, 121, 131, 143, 168]` (cabeçalho e células). Os textos comuns cabem em **uma** linha: `22/10/2026` (Data e Validade), `45.678/2024` (CA), `99999` (Qtd), `Primeira entrega` (Motivo), `Joao Almoxarife` (Entregue por); todos os cabeçalhos em uma linha. Nenhuma coluna em x = 28. | Entrega de `ENTREGA` do teste (motivo TROCA, `Joao Almoxarife`) → cada célula é **um** `text`; com `PRIMEIRA_ENTREGA` também. |
| RN-185.04 | **A linha cresce**: célula com k linhas desenha a linha j em `y + 4·j` (passo 4 mm, fonte 9), cada linha num `text` próprio (não `text(array)`); n = maior k da entrega; o hash vem em `y + 4·n`. Altura da entrega = `4·n + 3·(linhas de matrícula + linhas de aparelho) + 2 + (25 com imagem | 8 sem)`; a entrega só começa na página se `y + altura ≤ 287` (regra da 183, com o `4` virando `4·n`). Nada (texto, linha, fundo da imagem) passa de 287. | Montagem da 183 (2 com imagem + 4 sem → a 7ª em y = 234) com a 7ª tendo *Entregue por* de 60 `W` (7 linhas) e imagem: altura 61 → vai para a página seguinte (com `4·1` caberia: 234 + 37 = 271, e a divisória iria a 295). |
| RN-185.05 | **Cabeçalho da ficha** quebra por largura (182 mm): o título (fonte 14, passo 6), `Nome: … Matrícula: …`, `Setor: … CPF: …` e o aviso de excluído (fonte 9, passo 5). | Colaborador com nome de 90 car. → título em 2+ linhas, todas ≤ 196, e a tabela começa depois delas (sem sobrepor). |
| RN-185.06 | **Régua geral da ficha:** nenhum texto, em **qualquer** fonte (14, 9 e 7), termina depois de 196 mm. (A régua `textosFora` da 183 olhava só a fonte 7.) | Ficha do pior caso (nome, EPI, CA, tamanho, quem entregou, matrícula e aparelho longos) → lista de textos fora vazia. |
| RN-185.07 | **Termo de ferramenta — o texto** quebra por **largura medida** (fonte 10, 182 mm), respeitando parágrafos e linhas em branco; palavra maior que a linha é cortada por medida (caractere a caractere); nada perdido (por parágrafo, junção sem espaços = parágrafo sem espaços). | Texto em CAIXA ALTA de 130 car. → nenhuma linha passa de 196 (hoje 210,6); 200 `W` → ≥ 3 linhas, junção = os 200 `W` (hoje 329,0). |
| RN-185.08 | **Termo de ferramenta — as linhas de identificação** (`Ferramenta … Série`, `Colaborador … Matrícula … Setor`, `Devolução prevista … Registrado por … Assinado em`, `Matrícula confirmada pelo colaborador: …`, `Assinatura de …`, avisos) quebram por largura (fonte 9, 182 mm, `splitTextToSize`), cada linha com `pular(5)` (a quebra de página do termo continua a mesma: `y > 280`). | `criado_por_nome` de 44 car. → a linha de devolução em 2 linhas, ≤ 196 (hoje 199,9); matrícula confirmada de 60 car. → 2 linhas. |
| RN-185.09 | **Nada muda fora do desenho:** API, banco, HMAC, a tela da ficha e a do termo. O descritor da ficha não muda. O descritor do termo troca `linhasTexto` (corte por contagem, ninguém lê fora do teste) por `texto` (o texto da versão, literal) — mudança interna do client. | `git diff --stat` da etapa só em `client/src/utils/{fichaEpiPdf,termoFerramentaPdf}.js`, nos testes e nos documentos. |
| RN-185.10 | **Fora:** remessa, posição do cliente e etiquetas (B1220). | — |

## Contrato (do desenho — não há API nova nem alterada)

**`fichaEpiPdf.js`**
- `const COLUNAS = [M, M + 18, M + 68, M + 88, M + 107, M + 117, M + 129, M + 154]` (= 14, 32, 82, 102, 121, 131, 143, 168);
  largura útil da coluna i: `(i < 7 ? COLUNAS[i + 1] - 1 : 196) - COLUNAS[i]`.
- Por entrega, **antes** de medir a altura (fonte 9): `linhasCelula[i] = pdf.splitTextToSize(String(celula), util[i])`;
  `n = Math.max(...linhasCelula.map((l) => l.length))`. Some o `larguras` e o `slice`.
- Desenho: `linhasCelula[i].forEach((s, j) => pdf.text(s, COLUNAS[i], y + 4 * j))`; depois `y += 4 * n` e segue como hoje (hash, confirmação,
  aparelho, imagem, divisória).
- Altura: `4 * n + 3 * (linhasConfirmacao.length + linhasAparelho.length) + 2 + (imagem ? 25 : 8)`; `if (y + altura > RODAPE) { addPage; y = 18;
  cabecalho(); }` — **sem mudar** o resto da régua da 183.
- Cabeçalho: `pdf.splitTextToSize(texto, LARGURA_UTIL)` em cada linha, uma chamada `text` por linha (título passo 6; demais passo 5).
- `montarFichaEpi` **não muda** (os textos já são inteiros).

**`termoFerramentaPdf.js`**
- `quebrarTexto(texto, largura = 95, medir = (s) => s.length)` — mesma assinatura posicional (os testes de hoje continuam), agora a régua é
  `medir`: cabe se `medir(linha + ' ' + palavra) <= largura`; palavra maior que a linha cortada caractere a caractere enquanto `medir(pedaço +
  ch) <= largura`. Com o `medir` padrão (contagem) o comportamento é o de hoje.
- Descritor: `linhasTexto` sai; entra `texto: String(t.texto ?? '')`. Desenho (fonte 10): `quebrarTexto(doc.texto, 182, (s) => pdf.getTextWidth(s))`.
- Linhas de identificação: `pdf.splitTextToSize(…, 182)`, cada linha `text` + `pular(5)` (a última mantém o passo de hoje: 7 depois da linha de
  devolução, 3 depois da confirmação, 7 depois de `Assinatura de`).

## Tasks

| # | Task | Tipo |
|---|---|---|
| T1 | Ficha: colunas, quebra das células, altura, cabeçalho, régua geral (RN-185.01–06) | galho (só `fichaEpiPdf.js` + teste) |
| T2 | Termo: texto e linhas de identificação por largura (RN-185.07–09) | galho (só `termoFerramentaPdf.js` + testes do termo e da tela de ferramentas) |
| T3 | Integração pelas telas (ficha **e** termo) + sonda real com o arquivo de produção | depois de T1 e T2 |
| T4 | Fase 5 (revisão adversarial) + fix-round + fechamento | depois de T3 |

T1 e T2 mexem em arquivos **disjuntos** do client e não tocam motor, trava, migration, `ACAO_PERFIS` nem servidor — são galhos de verdade
(nenhum erro de interpretação de um exige retrabalho no outro). Só Jest (sem SQLite): podem rodar na mesma árvore, mas **sabotagem
concorrente contamina a suíte do outro** (memória do projeto): se forem em paralelo, sabotagem e restauro **só** no arquivo da própria task, e a
suíte completa do client só depois que os dois restauraram (`cmp`). Na dúvida, sequencial: T1 → T2.

### T1 (galho) — a linha da entrega da ficha quebra por largura

Arquivos: `client/src/utils/fichaEpiPdf.js`, `client/src/utils/fichaEpiPdf.test.js`.

1. **Vermelho primeiro.** No teste, as colunas são **literais** (`const COLUNAS_FICHA = [14, 32, 82, 102, 121, 131, 143, 168]` — é o contrato; se o
   código mudar o layout sem mudar o plano, o teste tem de cair). Réguas novas (medidas com o `jest.requireActual('jspdf')`, como a `textosFora`):
   - `textosForaDaFolha()` — **toda** chamada `text`, na fonte corrente gravada (`setFontSize`), com `x + largura > 196` (generaliza a
     `textosFora` da 183, que passa a ser ela; os testes da 183 continuam usando-a);
   - `celulasInvasoras()` — toda `text` de fonte 9 cujo `x` está em `COLUNAS_FICHA` **e** cujo `y` é de uma linha da tabela (depois do primeiro
     cabeçalho), com `x + largura > (i < 7 ? COLUNAS_FICHA[i + 1] - 1 : 196)`;
   - `celulasDaEntrega(k)` — as linhas desenhadas de cada coluna na k-ésima entrega (agrupadas por x, entre a divisória anterior e o hash).
   Testes:
   - `[RN-185.01]` entrega com `entregue_por_nome: 'Maria Aparecida dos Santos Oliveira'`, `material_nome` de 70 car.
     (`'Mascara de solda automatica escurecimento DIN 9-13 com regulagem'`), `ca_numero: 'W'.repeat(20)`, `tamanho: 'Tamanho especial XGG'` →
     `celulasInvasoras()` vazio **e** metade positiva: *Entregue por* tem 2 linhas, EPI ≥ 2;
   - `[RN-185.02]` mesma entrega + uma com `motivo: 'PRIMEIRA_ENTREGA'` → para cada coluna, `linhas.join('').replace(/\s/g, '') ===
     textoDoDescritor.replace(/\s/g, '')`; o texto `Primeira entrega` aparece **inteiro** numa chamada `text`;
   - `[RN-185.03]` `ENTREGA` (TROCA, `Joao Almoxarife`) e a variante `PRIMEIRA_ENTREGA` → cada célula é **um** `text`; os x do cabeçalho
     e das células são `COLUNAS_FICHA`; nenhum `text` de fonte 9 em x = 28;
   - `[RN-185.04]` montagem da 183 (2 com imagem + 4 sem, `user_agent: 'curto'`; divisória da 6ª em **229** — conferida) e a 7ª com
     `entregue_por_nome: 'W'.repeat(60)` e imagem → `conferirRodape()` vazio (régua **antes** da contagem de páginas, como na 183) e
     `addPage` 1; e numa entrega solta com *Entregue por* de 3 linhas: o hash (`Entrega … registro`) em `y_linha + 12`;
   - `[RN-185.05]` colaborador de nome com 90 car. → `textosForaDaFolha()` vazio; o título em ≥ 2 `text` de fonte 14; o 1º `text` do cabeçalho
     da tabela tem y maior que o do último texto do cabeçalho da ficha;
   - `[RN-185.06]` o pior caso da 183 (8 entregas de 300 `W`, matrícula de 88) **mais** os campos longos da RN-185.01 em todas, com e sem imagem
     → `textosForaDaFolha()` e `celulasInvasoras()` vazios, `conferirRodape()` vazio.
2. Rodar e ver vermelho **pelo motivo certo**: `Entregue por` em 214,0 / 227,x na régua; `Primeira entreg`; x antigos (34, 86…). Os que
   passarem de primeira (ex.: a régua do rodapé com n = 1) são guardas de regressão — provar pelos controles.
3. Implementar conforme o contrato (COLUNAS, `splitTextToSize` por célula, `4·n`, cabeçalho quebrado). Comentário no código citando
   B1208/B1215/B1216 e o porquê (prova da NR-6, nada perdido).
4. **Controles positivos** (sabotagem por `perl` com âncora contada = 1, md5 antes/sabotado/restaurado, restauro por cópia `e185-t1-*`, `cmp`):
   - (c1) voltar ao corte de hoje (`pdf.text(String(c).slice(0, …), COLUNAS[i], y)`, uma linha) → caem RN-185.01 (na régua, *Entregue por* fora)
     e RN-185.02 (`Primeira entreg`);
   - (c2) quebrar mas desenhar **só a 1ª linha** (`linhasCelula[i].slice(0, 1)`) → cai **RN-185.02** (junção ≠ texto), e **não** a régua de margem
     — prova que a RN-185.02 não é a RN-185.01 com outro nome;
   - (c3) altura com `4` fixo (n ignorado) e desenho com `4·n` → cai **RN-185.04** na régua do rodapé (divisória ≈ 295 > 287);
   - (c4) `util` sem a folga (`COLUNAS[i + 1] - COLUNAS[i]`) → cai RN-185.01 em `celulasInvasoras` (se nenhum caso encostar no último milímetro,
     **aumentar o caso até cair** — teste que não sabe falhar não vale; registrar o caso usado);
   - (c5) colunas antigas (`[M, M + 20, …, M + 162]`) com a quebra nova → cai RN-185.03 (`Joao Almoxarife` e `Primeira entrega` em 2 `text`) e a
     montagem do 229;
   - (c6) título sem quebra (`pdf.text(doc.titulo, M, y)`) → cai RN-185.05 em `textosForaDaFolha` com fonte 14.
5. `CI=true npx react-scripts test src/utils/fichaEpiPdf src/components/almoxarifado/EpiAlmoxarifado --watchAll=false` — o
   `EpiAlmoxarifado.test.js` (que gera a ficha pela tela) **sem** mudança de asserção; se cair, é achado, não ajuste.

### T2 (galho) — o termo de ferramenta quebra por largura

Arquivos: `client/src/utils/termoFerramentaPdf.js`, `client/src/utils/termoFerramentaPdf.test.js`,
`client/src/components/almoxarifado/FerramentasAlmoxarifado.test.js` (só o gravador do `jspdf`).

1. **Gravadores primeiro** (sem mudar asserção): os dois `jest.mock('jspdf', …)` passam a mandar `getTextWidth`/`splitTextToSize`/`setFontSize`
   para um jsPDF real (cópia do molde `EpiAlmoxarifado.test.js:43-58`, com o `console.error` calado só no carregamento). Rodar os dois arquivos
   **verdes antes** de qualquer mudança de produção (o gravador novo não pode mudar resultado).
2. **Vermelho primeiro:**
   - `[RN-185.07]` `quebrarTexto(texto, 182, medirFonte10)` com o texto em CAIXA ALTA da sonda e com 200 `W` → toda linha `medir ≤ 182`;
     junção por parágrafo sem espaços = parágrafo sem espaços; `'a\n\nb'` mantém a linha em branco; os testes de hoje de `quebrarTexto`
     (contagem) continuam passando;
   - `[RN-185.07]` `gerarTermoFerramentaPdf` com o texto em CAIXA ALTA → régua `textosForaDaFolha` (a mesma da T1, copiada — os arquivos de
     teste não importam um do outro) vazia; metade positiva: ≥ 2 linhas de texto em fonte 10;
   - `[RN-185.08]` `criado_por_nome` de 44 car., `colaborador.nome` de 60, `ferramenta.nome` de 80 e `matricula` de 60 → régua vazia; a
     junção das linhas de cada identificação = a frase (sem espaços);
   - `[RN-185.09]` `montarTermoFerramenta(DADOS).texto === TEXTO` e sem a chave `linhasTexto` (os testes `:45` e `:57` passam a conferir `texto`
     — **mudança de contrato do descritor, intencional**; registrar na Execução);
   - os testes de hoje do termo (`'Declaro que recebi a ferramenta.'` como um `text`, o aviso de provisório, o hash, a matrícula confirmada)
     **sem mudança** de asserção, e o da tela (`FerramentasAlmoxarifado.test.js:909-913`) também.
3. Implementar conforme o contrato.
4. **Controles positivos:**
   - (c1) desenho com `quebrarTexto(doc.texto, 95)` (contagem) → cai RN-185.07 na régua (CAIXA ALTA ≈ 210,6);
   - (c2) palavra longa cortada por contagem (`palavra.slice(0, largura)`) mesmo com `medir` → cai o dos 200 `W`;
   - (c3) linha de devolução sem `splitTextToSize` → cai RN-185.08 (≈ 199,9 com o nome de 44);
   - (c4) `quebrarTexto` que descarta a última linha do parágrafo → cai a junção da RN-185.07 (e não a régua).
5. `CI=true npx react-scripts test src/utils/termoFerramentaPdf src/components/almoxarifado/FerramentasAlmoxarifado --watchAll=false`.

### T3 — integração pelas telas e sonda real

Não há rota nova: a integração que cruza os galhos é **tela → resposta HTTP real → gerador → réguas**, nos dois documentos.

- **Ficha pela tela:** em `EpiAlmoxarifado.test.js` (gravador já mede), um teste que abre a ficha com a resposta da fronteira HTTP montada a
  partir da **fixture real** `client/src/utils/__fixtures__/fichaEpi.rota.json` (gravada pela rota na 183) com `entregue_por_nome`,
  `material_nome` e `motivo: 'PRIMEIRA_ENTREGA'` sobrescritos por valores longos, clica **Gerar PDF** e confere `celulasInvasoras()` e
  `textosForaDaFolha()` vazios e `Primeira entrega` inteiro. (Réguas copiadas no arquivo; não importar de outro teste.)
- **Termo pela tela:** em `FerramentasAlmoxarifado.test.js`, o fluxo de `:909` (abrir o termo → **PDF do termo**) com texto da versão em CAIXA
  ALTA e `criado_por_nome` de 44 car. → régua vazia.
- **Controle positivo cruzado:** a sabotagem (c1) da T1 derruba o teste da tela da ficha; a (c1) da T2 derruba o da tela do termo.
- **Sonda real depois** (`p185-sonda-pos.js` no scratchpad, molde `fix183-sonda-real.js`): lê `COLUNAS` e a `quebrarTexto` **do arquivo de
  produção** (regex) e, com o jsPDF real do Node, mede os casos da Fase 0 no layout novo — registrar na Execução o maior x final por coluna e
  do termo, e a junção = texto em todos.
- Suítes no fim (sequenciais, uma vez cada): Jest inteiro e `CI=true build` (client); `test:api`, `test:almoxarifado`, `test:validation`,
  `test:safealter`, `test:sqlite` (servidor — a etapa não toca o servidor; rodam para provar que nada mudou). Citar os números reais.

### T4 — Fase 5 e fechamento (skill `fechar-etapa`)

Revisão adversarial fresca com sonda executada (memória: *no motor/desenho, sonda executada acha o que leitura e suíte verde não acham*).
Pergunta obrigatória à revisão: **algum texto da ficha ou do termo, em alguma fonte, ainda é desenhado sem medida?** (`grep -n "pdf.text("` nos dois
arquivos e conferir cada um.)

Fechamento: spec 25 (B1208 resolvido, com hash) e a spec das ferramentas (termo); mapa; guia do usuário (roteiro: entregar EPI com quem entregou de
nome comprido e motivo *Primeira entrega* → Ficha → Gerar PDF → conferir o nome inteiro, dentro da folha, e a linha mais alta; termo com texto em
caixa alta); novidades (seção da Etapa 185, letras B abaixo; **C444 → ✅ RESOLVIDO NA ETAPA 185**, corrigindo-a para nomear as quatro colunas — a
divergência 2 da Fase 0); este plano com a próxima tarefa detalhada.

## Letra B proposta (para `docs/almoxarifado-novidades-por-etapa.md`)

- **B1215 — Célula comprida QUEBRA em linhas (a linha da entrega cresce); nada é truncado.** **Escolhido:** quebrar a célula em quantas linhas
  precisar e medir a altura da entrega com isso (a régua de página da 183, `y + altura ≤ 287`, passa a contar as linhas da célula mais alta).
  **Descartado:** (a) truncar com reticências (`Maria Aparecida dos…`) — a ficha é prova da NR-6 e o nome de quem entregou, o EPI e o CA são
  justamente o que a auditoria lê: um papel que esconde parte do nome não prova quem entregou; (b) diminuir a fonte até caber — sem limite de
  tamanho nos cadastros, chegaria a ilegível; (c) folha em paisagem — muda o documento inteiro e só adia o problema. **Reversível.**
- **B1216 — As colunas da tabela foram redistribuídas (medidas).** x = 14, 32, 82, 102, 121, 131, 143, 168: Data, CA, Validade, Qtd e Tam.
  cederam espaço que não usavam para Motivo (24 mm) e Entregue por (28 mm). Assim `Primeira entrega` (hoje cortado em `Primeira entreg`) e
  `Joao Almoxarife` cabem numa linha. **Descartado:** manter as colunas e só quebrar — a linha mais comum da ficha (primeira entrega) ficaria
  com 2 linhas em toda entrega. **Reversível.**
- **B1217 — A célula quebra por PALAVRA; só palavra maior que a coluna quebra por letra.** Nome de pessoa e de EPI se leem melhor inteiros
  por palavra. É diferente do aparelho (B1207, corte por letra), porque lá a junção literal das linhas tem de ser o texto do lacre; aqui a
  garantia é *nenhuma letra perdida* (a quebra só come o espaço entre palavras). **Descartado:** cortar por letra também nas células
  (`Joao Almox|arife`). **Reversível.**
- **B1218 — O cabeçalho da ficha (título, nome, setor, aviso) também quebra por largura.** Medido: nome do colaborador com ~66+ letras já
  passava da margem no título. **Descartado:** deixar para outra etapa (mesmo arquivo, mesma régua, mesmo documento de prova). **Reversível.**
- **B1219 — O termo de responsabilidade de ferramenta entra nesta etapa.** Medido: o texto do termo em caixa alta ia a 210,6 mm (a folha tem
  210) e a linha *Registrado por* com nome de 44 letras a 199,9. É prova assinada como a ficha. A régua do texto do termo passa a ser a largura
  medida (o corte de 95 letras continua sendo o padrão da função, sem uso no desenho). **Descartado:** só registrar. **Reversível.**
- **B1220 — Remessa a terceiros, posição do cliente e etiquetas ficam FORA.** Medido: na remessa e na posição, o código do material invade a
  coluna Material (64,3 mm com a coluna acabando em 44; 40,5 com 40) e o nome do material é cortado em 40/34 letras. **Motivo:** não são o
  documento de prova da NR-6 nem de assinatura eletrônica; têm layout e quebra de página próprios; a etapa fica curta. As etiquetas já medem
  (`maxWidth`/`splitTextToSize`) e cortam o nome em 2 linhas por decisão (espaço físico). **Candidato:** etapa curta reaproveitando o padrão
  desta (aviso de operação novo **C445** no fechamento, se a remessa assinada pelo terceiro for considerada prova). **Reversível.**
- **B1221 — Quantidade com 6+ dígitos quebra em 2 linhas na coluna Qtd (9 mm).** Aceito: entrega de EPI com 100 000 unidades não é plausível;
  até 99 999 cabe. **Descartado:** alargar Qtd tirando do EPI (a coluna que mais quebra). **Reversível.**
- **B1222** — a próxima etapa (preenchida no fechamento): **Etapa 186 — os PDFs de remessa a terceiros e de posição do cliente cabem na
  folha** (a remessa é a C445; a posição tem o mesmo corte por contagem). Plano:
  `docs/superpowers/plans/2026-10-22-almoxarifado-etapa186-pdfs-de-remessa-e-posicao-dentro-da-folha.md`.

*(No fechamento, a B1217 e a B1220 foram escritas com as emendas I2 e I3 — os textos acima são os da proposta, com o fato errado da B1217
e a C445 condicional da B1220; o que vale é o que está no documento de novidades.)*

## Emendas da Fase 2

*(Revisão fresca do plano — Fase 2 da skill `desenvolver-etapa-almoxarifado`, 2026-10-22, sobre `90168815`. Prevalecem sobre as regras e as
tasks acima.)*

**Como foi revisado.** Leitura de `fichaEpiPdf.js`, `termoFerramentaPdf.js`, dos quatro testes (`fichaEpiPdf.test.js`,
`termoFerramentaPdf.test.js`, `EpiAlmoxarifado.test.js`, `FerramentasAlmoxarifado.test.js`), de `remessaPdf.js`, `posicaoClientePdf.js`,
`etiquetasPdf.js` e de `epiService.camposDoRegistro`; sondas com o **jsPDF real** do client (fonte 9/10/14, mm, A4) no scratchpad, prefixo
`f2r185-` (`f2r185-sonda.js`, `-excesso.js`, `-espacofinal.js`, `-espacofinal2.js`, `-c4.js`; caminho completo
`C:\Users\User\AppData\Local\Temp\claude\C--Users-User-projetos-CRM-main\bf36ab2c-c3a4-467f-bc1f-24a9b62a2a92\scratchpad\`).

**O que a sonda confirmou (sem emenda).**
- Colunas x = 14, 32, 82, 102, 121, 131, 143, 168 → útil 17/49/19/18/9/11/24/28. Cabeçalhos em 1 linha: o mais justo é `Validade CA`
  (119,49 ≤ 120 — folga de 0,5 mm); `Entregue por` 186,2 ≤ 196. `ENTREGA` do teste e a entrega da fixture real (`fichaEpi.rota.json`)
  saem com **todas** as células em 1 linha — as montagens literais da 183 (divisória em **240** e em **229**, a 7ª em 234) continuam
  valendo. Casos da RN-185.01: linhas por célula 1,4,4,1,1,4,1,2; `Maria Aparecida dos Santos Oliveira` → 195,4. RN-185.04: 60 `W` em
  *Entregue por* = 7 linhas → altura 61 → 295 > 287 → página seguinte; com `4` fixo cabia (271) e a divisória ia a 295 — o (c3) sabe falhar.
- O (c4) (útil sem a folga) **cai** com os casos da RN-185.01: *Entregue por* `Maria…Oliveira` 196,89 > 196, EPI de 85 car. 81,63 > 81,
  `Tamanho especial XGG` 142,56 > 142. Não precisa aumentar caso.
- Fuzz de 20 000 textos (acentos, travessão, parênteses, espaço duplo) nas 8 larguras: o `splitTextToSize` **nunca perde** caractere
  não-espaço (junção sem espaços = texto em todos) e, com a linha aparada à direita, **nunca passa** do útil. Espaço duplo interno, espaço
  inicial e tab são preservados; `\n` vira quebra.
- Termo: `quebrarTexto` com `medir` (implementação do contrato rodada na sonda) — CAIXA ALTA de 121 car. → 2 linhas, fim 166,4; 200 `W` →
  4 linhas, fim 193,1, junção = texto; com o `medir` padrão devolve exatamente o que os testes de hoje esperam (`['um dois','tres','quatro']`,
  `['xxxxx','xxxxx','xx']`, `['a','','b']`). Linha de devolução com nome de 44 → 199,1 hoje, 2 linhas quebrada.
- A altura `4·n + 3·(conf + aparelho) + 2 + (25 | 8)` bate com o desenho de `fichaEpiPdf.js:150-178` (y += 4·n; +3 por linha de evidência;
  +2; imagem +25 ou +4/texto/+4; divisória) e a régua `y + altura > 287` é a da 183 (`:151`). O aparelho (`quebrarPorLargura`, corte por
  letra, B1207) **não é tocado** pelo contrato — a quebra por palavra fica só nas 8 células e no cabeçalho.
- T1 e T2: nenhum helper de quebra compartilhado (a T2 dá `medir` à `quebrarTexto` do próprio arquivo; a T1 usa o `splitTextToSize`), cada
  arquivo de teste tem o próprio `jest.mock('jspdf')` e as réguas são copiadas, não importadas. Ver a ressalva do M5.

### Importante

- **I1 — A régua `celulasInvasoras()` como descrita dá falso vermelho com o código certo** (T1 passo 1; T3). A definição "toda `text` de
  fonte 9 cujo `x` está em `COLUNAS_FICHA` e cujo `y` é de uma linha da tabela (depois do primeiro cabeçalho)" pega:
  (a) `'(imagem da assinatura indisponível)'` — fonte 9, x = 14 (= coluna Data), termina em **64,6** com o limite da Data em 31
  (`fichaEpiPdf.js:174`); a RN-185.06 roda **sem imagem** → vermelho com a produção correta; idem `'Nenhuma entrega de EPI registrada.'`
  (65,3, `:181`); (b) o filtro por **y** quebra na página 2: lá o cabeçalho da tabela está em y = 18 e a 1ª entrega em 25, **abaixo** do y do
  primeiro cabeçalho da página 1 (43) — as células da página 2 ficariam fora da régua (falso verde justamente na virada de página da
  RN-185.04). **Emenda:** as células são identificadas pela **sequência** das chamadas, não por y: de cada entrega, os `text` de fonte 9 entre
  a última `line` (cabeçalho da tabela ou divisória anterior) e o primeiro `text` de fonte 7 seguinte (`Entrega … registro`); o cabeçalho
  da tabela são os 8 `text` imediatamente antes da `line` que o sublinha. `celulasInvasoras` e `celulasDaEntrega` usam o **mesmo** recorte
  (uma função só no arquivo). Metade positiva obrigatória: no caso sem imagem da RN-185.06, `celulasDaEntrega(k)` tem as 8 colunas em todas
  as entregas e a régua viu ≥ 1 célula **na página 2** (contar `addPage` antes dela). Vale para a cópia da régua na T3.
- **I2 — A justificativa da B1217 está errada no fato.** Ela diz que o aparelho é cortado por letra "porque lá a junção literal das linhas
  tem de ser o texto do lacre; aqui a garantia é nenhuma letra perdida" — como se as células não estivessem no lacre. **Estão:**
  `camposDoRegistro` (`server/services/almoxarifado/epiService.js:70-80`) põe no HMAC `material_codigo`, `material_nome`, `ca_numero`,
  `ca_validade`, `quantidade`, `tamanho`, `motivo` e `entregue_por_nome`. A diferença verdadeira: a tabela **nunca** foi o texto literal do
  lacre — a data é formatada no dia local, o motivo sai pelo rótulo (`PRIMEIRA_ENTREGA` → *Primeira entrega*), o EPI é `código — nome`, a
  validade é `dd/mm/aaaa`, a quantidade passa por `Number`; quem confere o lacre é o *Verificar integridade* no servidor, não a leitura do
  papel. O aparelho é impresso como prova **literal** (B1207) e por isso a junção tem de ser exata. **Emenda:** a B1217 do fechamento diz
  isso, e diz o custo aceito: a quebra por palavra come **um** espaço por quebra (`textoLimpo` só apara as pontas — `material_nome` com espaço
  duplo interno continua com ele dentro da linha, mas não numa quebra). Não muda código; muda o texto da decisão (regra do CLAUDE.md: decisão
  com fato errado engana a próxima sessão).
- **I3 — A B1220 justifica a remessa fora com um fato que o código contradiz.** "Não são o documento de prova … nem de assinatura" — mas
  `remessaPdf.js:121` diz *"Campos de assinatura: o papel volta assinado pelo terceiro, e é o que prova a entrega"*, e a linha do item corta o
  material em 40 letras (`:110`) e o código invade a coluna (64,3 com a coluna acabando em 44, medida da Fase 0). É prova assinada **em
  papel**, com o mesmo defeito. **Emenda:** a remessa continua **fora** (escopo curto, layout e página próprios — reversível), mas a B1220
  passa a dizer que ela **é** prova assinada pelo terceiro, e o aviso de operação **C445** é registrado **sem condição** ("se for
  considerada prova" sai): quem imprime remessa de material de nome comprido hoje manda um papel que não diz tudo o que foi. A posição do
  cliente (sem assinatura) e as etiquetas (já medem) ficam como estão.

### Menor

- **M1 — Linha com espaço no fim.** O `splitTextToSize` devolve linhas com espaço final quando a palavra seguinte é maior que a coluna e é
  partida (sonda: `'XGG Maria '`, `'automatica '`; 5 618 linhas assim no fuzz, 1 023 com a largura **crua** acima do útil por até 0,87 mm;
  aparada, nenhuma). O espaço não é tinta, mas a régua mede `getTextWidth` do texto cru → falso vermelho fora dos casos do plano (que não
  geram espaço final — conferido). **Emenda:** o desenho apara à direita (`s.replace(/\s+$/, '')`) cada linha antes do `text` — a RN-185.02
  (junção sem espaços) não muda e a régua continua medindo o texto cru, sem afrouxar.
- **M2 — O passo do cabeçalho da ficha tem de deixar o nome curto no mesmo y de hoje** (RN-185.05, contrato). Hoje: título +6, `Gerado em`
  **+6**, `Nome` +5, `Setor` +5, aviso +5, +3. O contrato diz "título passo 6; demais passo 5" — aplicado ao `Gerado em` desloca a tabela 1 mm e
  derruba as montagens literais da 183 (240 e 229), convidando a "corrigir" o número do teste. **Emenda:** cada bloco quebrado avança o passo
  de hoje **por linha** (título 6·k, `Nome`/`Setor`/aviso 5·k); `Gerado em` (texto fixo) não muda. Com nome curto, todo y é idêntico ao de
  hoje — os testes `[RN-183.08] (a)` e `[Fase 5 M1] … 234` ficam **sem mudança** e são a guarda disso.
- **M3 — `LARGURA_UTIL` é declarada depois do cabeçalho** (`fichaEpiPdf.js:137`, `const`): usá-la no cabeçalho como o contrato manda dá
  `ReferenceError` (TDZ). Subir a constante para junto de `M`. E as duas medições têm de vir **depois** do `setFontSize` certo: o título depois
  do `setFontSize(14)`, as células depois do `setFontSize(9)` da `:149` (medidas na fonte 7 das linhas de evidência, caberiam mais letras e a
  célula passaria da coluna — a `celulasInvasoras`, que mede na fonte gravada, pega). No termo, `quebrarTexto(…, 182, getTextWidth)` depois do
  `setFontSize(10)`.
- **M4 — O cabeçalho da tabela repetido na página nova não é afirmado por nenhum teste** (pergunta 4). O código já repete (`:151`), mas a
  RN-185.03 confere os x sem dizer em que página. **Emenda** ao teste da RN-185.04: depois do `addPage`, os 8 `text` seguintes são
  `doc.cabecalho` em `COLUNAS_FICHA` com y = 18, a `line` em 20 e a 1ª célula da 7ª entrega em y = 25.
- **M5 — Independência T1/T2: uma aresta de import.** `termoFerramentaPdf.js:11` importa `carregarImagemComoDataUrl` de `fichaEpiPdf.js` — as
  suítes da T2 **carregam** o arquivo da T1. As sabotagens da T1 ficam dentro de `gerarFichaEpiPdf` e não mudam o resultado da T2, mas uma
  sabotagem que deixe o arquivo sintaticamente quebrado (ou uma escrita no meio) derruba os testes do termo. Se rodarem em paralelo: a T2 não
  roda vermelho/verde/controles enquanto a T1 estiver com o arquivo sabotado (o protocolo de `cmp` do plano já cobre a suíte completa; isto
  estende para as duas suítes do termo). A T2 **não** reusa `quebrarPorLargura` da ficha (corte por letra — é a régua do aparelho, B1207).
- **M6 — `quebrarTexto` com `medir`: guarda de progresso.** Se um caractere sozinho medir mais que `largura`, "cortar enquanto
  `medir(pedaço + ch) <= largura`" devolve pedaço vazio e o `while` não termina. Com 182 mm não acontece; com a função exportada e largura
  pequena, sim. **Emenda:** pedaço vazio leva ao menos um caractere (iterar por código, `for…of`, para não partir par substituto). Teste:
  `quebrarTexto('WW', 1, medir)` termina e devolve `['W','W']`.
- **M7 — "Nada passa de 287" tem limite** (RN-185.04). Uma entrega mais alta que a página inteira continua passando do rodapé (a régua manda
  para a página seguinte, não divide — é a limitação **D (183)(5)**); agora também por célula (só com centenas de letras num nome — sem limite
  no cadastro). E se a 1ª entrega já não cabe numa página vazia, a página 1 sai só com o cabeçalho. Não é regressão; o fechamento repete a
  D (183)(5) na D (185) dizendo que as células também contam.
- **M8 — Comentário do topo de `termoFerramentaPdf.js:1-3`** diz que o montador é testável "inclusive a quebra do texto em linhas" — com o
  `linhasTexto` saindo do descritor (RN-185.09), deixa de ser verdade; atualizar o comentário junto.
- **M9 — Na T1, nomear o texto de 3 linhas** do teste do hash em `y_linha + 12`: `'Administrador do Sistema Geral da Empresa X'` dá 3 linhas
  em 28 mm (sonda); `'W'.repeat(25)` também. Sem nome, o executor escolhe um que dá 2 e o teste vira `+8`.

**Crítico:** nenhum. As medidas, as posições, a fórmula da altura e o escopo (aparelho intocado) batem com o código; os achados são de régua de
teste (I1, M1, M2, M4), de texto de decisão com fato errado (I2, I3) e de contrato incompleto (M3, M6).

## Execução

### T1 — ✅ `b194b38b` (2026-10-22, sequencial na main)

- **Sonda antes** (`p185-sonda-tabela.js`, jsPDF real, lê o arquivo de produção): saída em `e185-sonda-antes-tabela.txt` — igual à Fase 0
  (`Joao Almoxarife` 198,6; `Maria Aparecida dos Santo` 214,0; `Primeira entreg`; pior caso de *Entregue por* 250,6).
- **Vermelho antes:** 10 de 28 caíram, pelo motivo certo — x antigos (`34, 86…` → `fora das colunas`), `Joao Almoxarife` em fonte 9 a
  **198,6** (os 3 testes da 183 que chamam `textosFora` caíram também: a régua passou a olhar toda fonte, e a `ENTREGA` deles tem o
  B1208), título de 90 letras a **252,1** em fonte 14, `Maria Aparecida dos Santo` 214. Log `e185-t1-vermelho.log`.
- **Verde:** `fichaEpiPdf` 28/28 + `EpiAlmoxarifado` 26/26 = **54/54**, `EpiAlmoxarifado.test.js` **sem** mudança.
- **Controles** (perl, âncora = 1, md5 antes `79586e47…` / sabotado / restaurado = antes, `cmp` ok; `e185-sab.sh`, logs `e185-sab-c*.log`):
  - (c1) corte de hoje numa linha → caem RN-185.01 em `celulasInvasoras` (`EPI-MASC-SOLDA-07 — Mascara de` a 93,37 > 81), RN-185.02 na junção
    (`…Mascaradesolda`), RN-185.03 (`Primeira entreg`), RN-185.06 em `textosForaDaFolha` (`Maria Aparecida dos Santo` 206), e as duas RN-185.04;
  - (c2) só a 1ª linha → cai **RN-185.02** na junção; a régua de margem **não** cai (RN-185.01 cai só na metade positiva `:422`,
    *Entregue por* com 1 linha; RN-185.06 verde);
  - (c3) altura com `4` fixo → caem RN-185.04 e RN-185.06 em `conferirRodape` (`line` 295, `addImage` até 292,5);
  - (c4) útil sem a folga → caem RN-185.01 e RN-185.06 em `celulasInvasoras`: EPI 81,63 > 81, `Tamanh` 142,18 e `especial` 142,56 > 142.
    **Divergência:** a emenda citava também `Maria…Oliveira 196,89 > 196` — com o (c4) como o plano o escreve, a última coluna não muda
    (vai até 196 com ou sem folga), então esse caso não cai; os outros dois bastam;
  - (c5) colunas antigas → RN-185.03 cai em `"Joao", "Almoxarife"` (2 `text`); caem também as montagens `240` (183 (a)), `229` (183 M1 e
    RN-185.04). **Ajuste do teste:** na 1ª rodada o RN-185.03 caía antes, na conferência dos x do cabeçalho; a asserção "um `text` por
    célula" foi posta **antes** da dos x e o (c5) re-rodado para provar que ela sabe cair sozinha;
  - (c6) título sem quebra → caem RN-185.05 e RN-185.06 em `textosForaDaFolha` (fonte 14, 252,1).
- **Divergências:** (1) o teste da RN-185.01 afirmava a quebra literal `['Maria Aparecida dos', 'Santos Oliveira']` — o `splitTextToSize`
  dá `['Maria Aparecida', 'dos Santos Oliveira']`; palpite meu, não do plano (que pede "2 linhas"): o teste passou a conferir 2 linhas e a
  junção com espaço. (2) `COLUNAS` e `UTIL_DA_COLUNA` são do módulo (literais, comentário com `M + …`), não do corpo de
  `gerarFichaEpiPdf` — mesmo valor do contrato. (3) M1 (aparar à direita) está em `linhasPorLargura`, usada pelas células **e** pelo
  cabeçalho; sem controle próprio (o plano não prescreve).

### T2 — ✅ `b76f7146` (2026-10-22, sequencial na main, depois da T1)

- **Gravadores primeiro:** os dois `jest.mock('jspdf')` (termo e tela de ferramentas) passaram a medir com o jsPDF real — **61/61 verdes
  antes** de qualquer mudança de produção, sem mudar asserção.
- **Vermelho antes:** 5 de 12 no `termoFerramentaPdf.test.js` — `doc.texto` `undefined` (os dois testes do descritor, `:64`/`:77`),
  `quebrarTexto` com a régua medida (linha > 182), CAIXA ALTA a **210,6** em fonte 10, `Colaborador: …` a **279,8** em fonte 9. O teste do M6
  (`quebrarTexto('WW', 1, medir)`) passou de primeira (com a régua de contagem, `'WW'`/1 também dá `['W','W']`) — controle abaixo.
- **Verde:** `termoFerramentaPdf` + `FerramentasAlmoxarifado` = **65/65**; o teste da tela (`'Declaro que recebi a ferramenta em perfeito
  estado.'` como um `text`) e os antigos do termo **sem** mudança de asserção.
- **Contrato do descritor (RN-185.09), intencional:** `linhasTexto` saiu, `texto` entrou (`String(t.texto ?? '')`); os testes `:45`/`:57` de
  antes passaram a conferir `texto` (e a ausência de `linhasTexto`). `grep linhasTexto client/src` → 0.
- **Controles** (mesmo protocolo; md5 antes `ea05a598…`, restaurado = antes, `cmp` ok; logs `e185-sab-t2c*.log`):
  - (c1) desenho com `quebrarTexto(doc.texto, 95)` → cai RN-185.07 (PDF) em `textosForaDaFolha` (`MAIUSCULAS…`, fonte 10, **210,6**);
  - (c2) pedaço cortado por contagem (`palavra.slice(0, largura)`) → cai o unitário da RN-185.07 na régua (a linha de 182 `W`) e o PDF
    (`WWW…` a 617,5);
  - (c3) linha da devolução sem quebra → cai RN-185.08 em `textosForaDaFolha` (`Devolução prevista: 05/11/2026…`, fonte 9, **200,8** —
    a Fase 0 mediu 199,9 com outra data/hora; mesmo defeito);
  - (c4) última linha do parágrafo descartada → caem as **junções** da RN-185.07 (`:207` e `:224`), **não** as réguas (`:203`, `:221`);
    caem também os dois testes antigos que veem `quatro` e `Declaro que recebi a ferramenta.`;
  - (M6) a sabotagem da guarda (`pedaco !== '' &&` fora) faria o Jest **não terminar** (laço infinito, memória) — controle rodado fora do Jest,
    em `e185-m6-controle.js` (jsPDF real, lê `quebrarTexto` da produção, cap de 1000 voltas): produção → `["W","W"]`; sem guarda →
    `NAO TERMINA voltas 1001`.
- **Divergências:** (1) a quebra por largura (`linhasQuebradas`) vale também para o **título** (fonte 14), a linha da **versão** e o
  **aviso** de provisório — o contrato listava as linhas de identificação e "avisos"; o título e a versão entraram para a pergunta da T4
  ("algum texto ainda é desenhado sem medida?") ter só os dois hashes (fonte 7, tamanho fixo: 162,8 / 135,3) e o
  `(imagem da assinatura indisponível)` (texto fixo, curto) como resposta. (2) `colaborador.nome` de 60 e `ferramenta.nome` de 80
  conferidos por `toHaveLength` no teste (o primeiro palpite tinha 59/78 — corrigido antes do vermelho).

### T3 — ✅ `06ef5377` (2026-10-22, depois de T1 e T2)

- **Ficha pela tela** (`EpiAlmoxarifado.test.js`, describe *"Ficha: a tabela cabe na folha (Etapa 185)"*): a fixture **real**
  `fichaEpi.rota.json` com `entregue_por_nome: 'Maria Aparecida dos Santos Oliveira'`, `material_nome` de 64 letras e
  `motivo: 'PRIMEIRA_ENTREGA'` → *Ficha por colaborador* → *Gerar PDF* (a assinatura não carrega no teste: sai o aviso em x = 14, que o recorte
  da I1 ignora) → `celulasInvasoras()` e `textosForaDaFolha()` vazios; metade positiva: 1 entrega com as 8 colunas, *Entregue por* em 2
  linhas com o nome inteiro, EPI em 2+ com a junção = `código — nome`, `Primeira entrega` num `text`.
- **Termo pela tela** (`FerramentasAlmoxarifado.test.js`, no describe do termo da 180): *Termo* → *PDF do termo* com texto em CAIXA ALTA e
  `criado_por_nome` de 44 → régua vazia; texto em 2+ linhas de fonte 10 com junção = texto; o nome inteiro na linha da devolução.
- **Verde:** os dois arquivos **81/81** (passaram de primeira — esperado, T1/T2 já feitas; provados pelos controles cruzados).
- **Controles cruzados** (mesmo protocolo, `cmp` ok): (c1) da T1 → cai o teste da tela de EPI em `celulasInvasoras` (`EPI-183I — Mascara de
  solda au…` a **87,09** > 81; `Maria Aparecida dos Santo` a **206** > 196); (c1) da T2 → cai o da tela do termo na régua
  (`MAIUSCULAS…`, fonte 10, **210,6**).
- **Sonda real** — antes (`p185-sonda-tabela.js` / `p185-sonda-outros.js` sobre o arquivo de produção antes da T1:
  `e185-sonda-antes-*.txt`) e **depois** (`p185-sonda-pos.js`, lê `COLUNAS`, `UTIL_DA_COLUNA`, o aparar e a `quebrarTexto` **do arquivo de
  produção**; saída `e185-sonda-pos.txt`):

  | Coluna | antes: pior texto real (fim, mm) | depois: maior fim / limite | linhas do pior caso |
  |---|---|---|---|
  | Data | 29,7 | 29,7 / 31 | 1 |
  | EPI | 95,4 (invadia o CA em 86; perdia 34) | **80,6** / 81 | 70 car. 3, 84 car. 4 |
  | CA | 127,8 (20 `W`) | 99,9 / 101 | 20 `W` 4 |
  | Validade CA | 121,7 | 119,5 (cabeçalho) / 120 | 1 |
  | Qtd | 136,7 | 129,7 / 130 | `100000` 2 (B1221) |
  | Tam. | 155,6 (perdia 11) | 140,5 / 142 | 20 car. 4 |
  | Motivo | `Primeira entreg` (perdia 1) | **166,3** / 167 — `Primeira entrega` em 1 linha | 1 |
  | Entregue por | **214,0** (`Maria Aparecida dos Santo`), 198,6 (`Joao Almoxarife`) | **195,4** / 196 — `Joao Almoxarife` 190,6 em 1 linha | 35 car. 2, 43 car. 3, 60 `W` 7 |

  Termo: texto em CAIXA ALTA **210,6 → 190,2** (2 linhas), 200 `W` **329,0 → 193,1** (4), texto comum 168,6 → 190,6 (agora vai até a
  margem, 182 mm, e não 95 letras); devolução com nome de 44 **199,9 → 186,8** (2 linhas); matrícula confirmada de 40 **195,0 → 195,5**
  (2 linhas; antes cabia por 1 mm, a 41ª passava). **Junções = texto em 43/43 casos; 0 casos além do limite.** Controle da sonda
  (`e185-sonda-pos-controle.js`: útil + 1 mm, limite o de produção) → **6** casos além do limite (EPI 81,6; Tam. 142,9; *Entregue por*
  196,9) — a sonda sabe falhar.
- **Divergência:** nenhuma no escopo. A sonda pós mede a quebra com o `splitTextToSize` do jsPDF de Node (o mesmo binário do client), não
  passa pelo `gerarFichaEpiPdf` — a passagem pelo gerador é a dos testes da T1/T3.
- **Suítes no fim** (sequenciais, uma vez cada, sobre `06ef5377`; logs `e185-log-*.txt`): `test:api` **527/527 arquivos OK**;
  `test:almoxarifado` **44 passou, 0 falhou**; `test:validation` **4/0**; `test:safealter` **3/0**; `test:sqlite` **16/0**; client
  `CI=true react-scripts test` **180 suítes, 2399/2399**; `CI=true react-scripts build` **Compiled successfully**.
- **Falta:** T4 (Fase 5 — revisão adversarial com sonda, com a pergunta "algum texto ainda é desenhado sem medida?": no termo, só os dois
  hashes de fonte 7 e o aviso fixo de imagem; na ficha, `Gerado em`, o hash, a confirmação/aparelho (já medidos, 183) e os avisos fixos —
  e o fechamento pela skill `fechar-etapa`, com as letras B1215–B1222 e as emendas I2/I3 no texto da B1217/B1220 e a C445 incondicional).

## T4 — Fase 5 (revisão adversarial, 2026-10-22) — 0 críticos, 0 importantes, 4 menores: 2 CORRIGIDOS, 2 REGISTRADOS

Revisão fresca com sonda executada sobre `a9759b07`: harness `rev185-harness.js` no scratchpad (os utils transpilados por sucrase, com o
**jsPDF real** envolto num gravador de `text`/`line`/`addImage`/`addPage`), sondas `rev185-s1.js`..`rev185-s5.js`, cópias `rev185-src` /
`rev185-src-sab`. Pergunta obrigatória — *algum texto da ficha ou do termo, em alguma fonte, ainda é desenhado sem medida?* — `grep -n
"pdf.text("` nos dois arquivos (15 chamadas): na ficha, as células (`:177`) e o cabeçalho (`:135`) quebram por largura, o cabeçalho da tabela
(`:150`) são 8 rótulos fixos medidos, a confirmação e o aparelho (`:184`, `:188`) são os da 183 (medidos); sem medida ficam só `Gerado em`
(`:142`, texto fixo + data), o hash (`:180`, fonte 7, tamanho fixo — 163,2), o aviso fixo da imagem (`:197`) e o de lista vazia (`:204`). No
termo, tudo passa por `linhasQuebradas` ou `quebrarTexto`, salvo os dois hashes de fonte 7 (`:138`, `:140`; 162,8 / 135,3) e o aviso fixo da
imagem (`:131`). Nenhum texto de tamanho variável sem medida.

Fix-round sequencial na main; controle positivo por achado — `perl` com âncora contada = 1, md5 antes/sabotado/restaurado, restauro por cópia
(`fix185-*` no scratchpad), `git diff --stat` do arquivo sabotado vazio depois do restauro.

- **Menor 1 (CORRIGIDO no código, `9a5f46a0`) — `quebrarTexto` ainda entrava em laço infinito.** A emenda M6 prometia "termina sempre", mas a
  guarda só cobria o caractere que não cabe sozinho. Com largura negativa, ou uma régua em que `medir('') > largura` (ex.: `() => Infinity`), a
  palavra já consumida ficava `''`, continuava "não cabendo", e o `while` empurrava linhas vazias para sempre (sonda `rev185-s5.js`: `negReal`
  e `inf` → *Reached heap limit*). O desenho passa 182 mm e nunca chega lá, mas a função é exportada. **Correção:** `while (palavra &&
  medir(palavra) > largura)` — cada volta consome ao menos um caractere (o `for…of` leva o primeiro) e para quando a palavra acaba; nenhuma
  letra perdida. **Teste novo** `[Fase 5 da 185] quebrarTexto termina com qualquer largura ou regua e nao perde letra` (larguras −1, 0, −5,
  `NaN`, `Infinity`; réguas `() => Infinity` e `() => NaN`; junção sem espaços = texto). Para o teste de laço infinito **não travar o Jest**, a
  régua do teste tem **teto de chamadas** (`comTeto`, 5000) e lança `NAO TERMINA`; o teste da M6 passou a usar o mesmo teto — o controle da M6,
  que na T2 rodou fora do Jest (`e185-m6-controle.js`), agora roda dentro dele. **Controles:** (a) tirar `palavra && ` → **12/13**, cai o teste
  novo em `NAO TERMINA` (1º caso, `'a'`/−1); (b) tirar a guarda da M6 (`pedaco !== '' && `) → **11/13**, caem o teste da M6 e o novo, os dois em
  `NAO TERMINA`. md5 pós-conserto `35ebd44d…` de volta nos dois. Sonda da revisão rodada de novo sobre o arquivo corrigido (transpilado em
  `fix185-src`): `negReal` → `["a"]`, `inf` → `["a"]`, `zeroReal` → `["W","W"]`; sobre a cópia antiga, ainda *heap out of memory*.
- **Menor 2 (CORRIGIDO no teste, `c98036ac`) — a emenda M1 (aparar à direita) não tinha teste.** Tirar o `.replace(/\s+$/, '')` de
  `linhasPorLargura` (`fichaEpiPdf.js:61`) deixava a suíte verde. **Caso achado por sonda** (`fix185-m1-busca2.js`): EPI
  `EPI-MASC-SOLDA-07 — Mascara ` + 18 `W` — cru, o `splitTextToSize` dá `'EPI-MASC-SOLDA-07 — Mascara '` com espaço final a **49,47 mm** (útil
  49). **Teste novo** `[Fase 5 da 185, emenda M1] linha partida antes de palavra longa sai aparada…`: metade positiva (o caso exercita a M1 — a
  linha crua termina em espaço e passa do útil), nenhuma célula desenhada termina em espaço, `celulasInvasoras()` vazio, EPI em ≥ 2 linhas.
  **Controle:** sem o aparar → **28/29**, cai na asserção do espaço final (`[32, "EPI-MASC-SOLDA-07 — Mascara "]`); com essa asserção desligada
  (cópia do teste), cai **sozinha** a `celulasInvasoras` (`81,47 > 81`). As duas sabem falhar. md5 `79586e47…` de volta.
- **Menor 3 (REGISTRADO, anterior à etapa — desde a 180; C447) — o termo colapsa espaços do texto da versão.** `quebrarTexto` faz
  `split(/\s+/)`: recuo, espaços repetidos, tab e espaço não separável (NBSP) viram **um** espaço (ou quebra). Nenhuma letra se perde (fuzz da
  revisão, 30 000 textos), mas o papel não reproduz o texto **byte a byte**: com o PDF impresso não dá para recalcular o SHA-256 do texto da
  versão quando ele tinha esses espaços. Quem confere o texto é o **Verificar integridade** (no servidor, sobre o texto guardado), não o papel.
  **Não corrigido:** preservar espaços na quebra do termo é decisão de layout do documento assinado (recuo de parágrafo vira o quê numa linha
  quebrada?) e não é regressão da 185 (a quebra por contagem da 180 já fazia o mesmo). Aviso de operação **C447**.
- **Menor 4 (REGISTRADO — o limite da M7, confirmado por execução) — "nada passa de 287" tem limite.** Medido pela revisão: uma entrega com
  *Entregue por* de **1000** letras é mais alta que uma página e passa do rodapé (desenho até **y = 305**); um colaborador com nome de **3500**
  letras faz o **cabeçalho** da ficha passar da folha (**y = 442**) — o cabeçalho não tem régua de página. Nenhum dos dois é plausível (nomes do
  cadastro sem limite, mas centenas/milhares de letras); vai na **D (185)**, como a D (183)(5) já dizia da matrícula.

**Divergência do plano:** a T2 registrou o controle da M6 "fora do Jest, porque o laço infinito trava o Jest" — com a régua de teto ele roda
dentro; e a M6 do plano ("pedaço vazio leva ao menos um caractere") não cobria a palavra vazia — a revisão achou, o fix-round fechou.

## Verificação final (2026-10-22, uma suíte por vez, depois do fix-round)

Sobre `c98036ac` (código e testes do fix-round) + os documentos do fechamento; exit 0 em todas:

- `test:api` **527/527** arquivos OK (mais lento: `propostaClausulasGrava.api.test.js`, 68,2 s; log `fix185-log-api.txt`).
- `test:almoxarifado` **44 passou, 0 falhou**.
- `test:validation` **4/0**; `test:safealter` **3/0**; `test:sqlite` **16/0**.
- client **180 suítes / 2401 testes**, todos passando (eram 2399 na T3: +2 da Fase 5 — o teste novo do termo e o da M1 na ficha).
- `CI=true react-scripts build`: *Compiled successfully*.
- `git status`: só os arquivos do fechamento antes do commit.


## Retrospectiva

1. **2 de 4 achados eram promessas do próprio plano sem prova:** a M6 dizia "termina sempre" e a M1 dizia "apara" — uma tinha um buraco
   (palavra vazia), a outra nenhum teste (verde com o aparar fora). Emenda que vira código precisa de controle próprio, mesmo quando o plano
   não o prescreve (a T1 registrou "M1 sem controle próprio" como divergência — era o achado).
2. **1 teste de laço infinito** deixou de precisar de script fora do Jest: a régua com **teto de chamadas** transforma "trava" em "cai com
   NAO TERMINA". Molde para qualquer teste de terminação nesta base.
3. **0 regressões** nos casos da Fase 0 — a sonda pós (`p185-sonda-pos.js`) e as réguas da T1/T3 cobriram o que a etapa prometeu; os achados
   da revisão estão nas bordas (largura ≤ 0, régua patológica, espaço final, textos de milhares de letras).
4. **2 limites declarados em vez de corrigidos** (espaços do termo, C447; altura acima de uma página, D (185)): os dois são anteriores ou
   inalcançáveis com dado plausível, e corrigir mudaria o layout do documento assinado sem pedido.

## Próxima tarefa detalhada — Etapa 186: os PDFs de remessa a terceiros e de posição do cliente cabem na folha (features 14 e 13)

**O plano é escrito por outra sessão, em paralelo:**
`docs/superpowers/plans/2026-10-22-almoxarifado-etapa186-pdfs-de-remessa-e-posicao-dentro-da-folha.md`. **O plano da 186 prevalece** sobre
este resumo, que é só o que permite retomar sem reler o código. Origem: **B1220** (fora da 185 por escopo) e **B1222**; aviso **C445** (a
remessa é prova assinada em papel e corta o nome do material).

**Por que esta.** O mesmo defeito da 185, nos dois PDFs que ficaram fora: `client/src/utils/remessaPdf.js` corta cada célula da linha do item
em **40** caracteres por contagem (`:110`, `String(c ?? '').slice(0, 40)`, colunas `[M, M + 30, M + 110, M + 126, M + 152]`, fonte 9) — medido na
Fase 0 da 185: código de 26 car. vai a 64,3 mm (a coluna Material começa em 44) e o material perde o que passa de 40 letras; e o papel
**volta assinado pelo terceiro** (`:121`, *"o papel volta assinado pelo terceiro, e é o que prova a entrega"*). `posicaoClientePdf.js` corta em
**34** (`:68`, colunas `[M, M + 26, M + 84, M + 96, M + 116, M + 140, M + 164]`) e em **60** nas aplicações (`:90`, `[M, M + 30, M + 130]`) —
código de 16 car. a 40,5 mm (coluna seguinte em 40). Não depende da empresa.

**Contrato que ela consome (não há API nova nem alterada):** os descritores `montarRemessaPDF` (`remessaPdf.js:56`) e
`montarPosicaoClientePDF` (`posicaoClientePdf.js:20`), já com os textos inteiros; a mudança é só no desenho (`gerarRemessaPDF`, `:82`;
`gerarPosicaoClientePDF`, `:47`).

**O que reaproveitar da 185:** o padrão de `fichaEpiPdf.js` — colunas medidas com folga de 1 mm, `splitTextToSize` por célula com a linha
**aparada à direita** (M1, agora com teste), passo de 4 mm por linha, altura da linha = `4·n` (a maior célula), e a régua de página pela altura
da linha (hoje a remessa quebra em `y > 262` e a posição em `y > 275` / `250` / `280` — limiares fixos que supõem uma linha por item). Os testes
da 185 têm o molde das réguas: `textosForaDaFolha` (toda fonte), o recorte por **ordem** das chamadas (emenda I1, não por y), a junção sem
espaços = texto (nada perdido), o gravador do `jspdf` que **mede** com o jsPDF real (`jest.requireActual`) e a régua com teto de chamadas para
teste de terminação.

**Pontos de atenção:**
- `remessaPdf.test.js` e `posicaoClientePdf.test.js` existem; e `client/src/components/datasDoChatDeComprasEDoAlmoxarifadoNoDiaLocal.test.js:62`
  usa um `FakePdf` para os dois (sem medida) — com `splitTextToSize`/`getTextWidth` no desenho, ele quebra; o gravador tem de passar a medir.
- O encerramento e as observações da remessa já usam `splitTextToSize(…, 175)` (`:100`, `:118`), mas com `text(array)` de uma vez; o título,
  o subtítulo e o proprietário (`:89`-`:96`) são uma linha sem medida.
- Os campos de assinatura (`:122`-`:128`) começam com `y > 245 → addPage`; com linhas mais altas, a régua tem de contar o bloco inteiro.
- Etiquetas (`etiquetasPdf.js`) continuam fora: já medem e cortam o nome em 2 linhas por decisão (B1220).

**O que já está pronto e ela não reabre:** a ficha de EPI e o termo de ferramenta (185, inclusive a Fase 5); as linhas da confirmação e do
aparelho (183, B1207).
