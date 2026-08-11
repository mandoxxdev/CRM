# Almoxarifado Etapa 6c — Etiquetas com QR Code: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** gerar PDF de etiquetas (A4 em grade e térmica 100×50) com código do material legível a olho nu e QR Code que abre a tela "Lotes e Séries" já filtrada — fechando a feature 10 (lotes ✅ 6 · séries ✅ 6b · etiquetas = 6c).

**Architecture:** etapa 100% client (zero mudança de servidor). Camadas: `utils/etiquetasPdf.js` (montadores puros de descritor + renderizador jspdf), `EtiquetasPdfModal.js` (formato persistido em localStorage + cópias + gerar), botões em 3 telas, deep-link com destaque em "Lotes e Séries". Design aprovado: `docs/superpowers/specs/2026-08-11-almoxarifado-etapa6c-etiquetas-design.md`.

**Tech Stack:** jspdf ^2.5.2 (já dependência; molde `utils/gerarPDFProposta.js`), **`qrcode` (dependência NOVA do client — a única da etapa)**, React CRA com testes createRoot/mocks (sem @testing-library).

## Global Constraints

- **Nenhuma mudança em `server/`** — se uma task parecer precisar, é sinal de desvio do design; parar e reportar.
- Dialeto de query param: **`material_id`** (o das telas existentes), `aba`, `lote`, `serie`.
- Descritor de etiqueta — a moeda entre todas as camadas: `{ codigo, nome, linhaControle, qrUrl }`.
- Flags de material comparadas com `=== 1` (padrão do módulo).
- CRA `CI=true`: warning = erro (variável não usada quebra o build). Toasts, não `alert`.
- Commits em português, corpo sem acento, explicando o porquê; um commit por assunto; sem `git add -A`.
- Teste que passa de primeira exige controle positivo (regra da casa).
- Gates: suíte client inteira (`cd client && CI=true npx react-scripts test --watchAll=false`) + `CI=true npx react-scripts build`.

## Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `client/package.json` | + dependência `qrcode` |
| `client/src/utils/etiquetasPdf.js` | **novo** — `FORMATOS_ETIQUETA`, montadores puros, `gerarEtiquetasPDF` |
| `client/src/utils/etiquetasPdf.test.js` | **novo** — montadores + renderizador mockado |
| `client/src/components/almoxarifado/EtiquetasPdfModal.js` | **novo** — modal compartilhado |
| `client/src/components/almoxarifado/EtiquetasPdfModal.test.js` | **novo** |
| `client/src/components/almoxarifado/LotesAlmoxarifado.js` | deep-link + destaque + botões de etiqueta |
| `client/src/components/almoxarifado/LotesAlmoxarifado.test.js` | describe novo |
| `client/src/components/almoxarifado/MateriaisAlmoxarifado.js` | botão etiqueta + leitura de `?material_id=` |
| `client/src/components/almoxarifado/RecebimentosAlmoxarifado.js` | botão pós-processamento |
| specs/guia/plano | fechamento (Task 7) |

---

### Task 1: dependência `qrcode` + montadores puros

**Files:**
- Modify: `client/package.json` (via `npm install qrcode`)
- Create: `client/src/utils/etiquetasPdf.js`
- Test: `client/src/utils/etiquetasPdf.test.js`

**Interfaces:**
- Produces: `FORMATOS_ETIQUETA` (objeto com `A4_GRADE` e `TERMICA_100x50`, cada um `{ label, page: {format, orientation}, grade: {colunas, linhas, largura, altura, margemX, margemY} }`); `montarEtiquetaMaterial(material, origin)`, `montarEtiquetaLote(material, lote, origin)`, `montarEtiquetaSerie(material, serie, origin)` → descritor; `montarEtiquetasDoRecebimento(itens, materiais, origin)` → descritores[].

- [ ] **Step 1: instalar a dependência** — `cd client && npm install qrcode` (registra em package.json/package-lock; é a única dependência nova da etapa, prevista no design).

- [ ] **Step 2: teste que falha** (molde `client/src/utils/telefone.test.js` — testes de util puros, sem DOM):

```js
import {
  FORMATOS_ETIQUETA, montarEtiquetaMaterial, montarEtiquetaLote,
  montarEtiquetaSerie, montarEtiquetasDoRecebimento,
} from './etiquetasPdf';

const ORIGIN = 'https://crm.gmp.ind.br';
const MAT_SIMPLES = { id: 7, codigo: 'MAT-7', nome: 'Parafuso M8', controle_lote: 0, controle_serie: 0 };
const MAT_LOTE = { id: 8, codigo: 'MAT-8', nome: 'Chapa Inox 304 3mm 1200x3000 certificada', controle_lote: 1, controle_serie: 0 };
const MAT_SERIE = { id: 9, codigo: 'MAT-9', nome: 'Motor 5cv', controle_lote: 0, controle_serie: 1 };

describe('montadores de etiqueta', () => {
  test('material simples: codigo/nome e QR para a lista de materiais', () => {
    const e = montarEtiquetaMaterial(MAT_SIMPLES, ORIGIN);
    expect(e).toEqual({
      codigo: 'MAT-7', nome: 'Parafuso M8', linhaControle: '',
      qrUrl: `${ORIGIN}/almoxarifado/materiais?material_id=7`,
    });
  });

  test('lote: linha com codigo e validade formatada + QR com aba e destaque', () => {
    const e = montarEtiquetaLote(MAT_LOTE, { codigo: 'L-24/07', data_validade: '2026-12-31' }, ORIGIN);
    expect(e.linhaControle).toBe('Lote L-24/07 · Val 31/12/2026');
    expect(e.qrUrl).toBe(`${ORIGIN}/almoxarifado/lotes?material_id=8&aba=LOTES&lote=${encodeURIComponent('L-24/07')}`);
  });

  test('lote sem validade omite a parte da validade', () => {
    const e = montarEtiquetaLote(MAT_LOTE, { codigo: 'L-1' }, ORIGIN);
    expect(e.linhaControle).toBe('Lote L-1');
  });

  test('serie: linha SN e QR com aba SERIES', () => {
    const e = montarEtiquetaSerie(MAT_SERIE, { numero: 'GMP-0042' }, ORIGIN);
    expect(e.linhaControle).toBe('SN: GMP-0042');
    expect(e.qrUrl).toBe(`${ORIGIN}/almoxarifado/lotes?material_id=9&aba=SERIES&serie=GMP-0042`);
  });
});

describe('montarEtiquetasDoRecebimento', () => {
  const MATERIAIS = [MAT_SIMPLES, MAT_LOTE, MAT_SERIE];
  test('item por serie gera 1 etiqueta por linha do texto series', () => {
    const itens = [{ material_id: 9, quantidade_recebida: 3, series: 'SN-1\nSN-2\n\nSN-3' }];
    const es = montarEtiquetasDoRecebimento(itens, MATERIAIS, ORIGIN);
    expect(es.map((e) => e.linhaControle)).toEqual(['SN: SN-1', 'SN: SN-2', 'SN: SN-3']);
  });
  test('item por lote gera 1 etiqueta do lote com a validade do item', () => {
    const itens = [{ material_id: 8, quantidade_recebida: 10, lote: 'L-9', data_validade_lote: '2027-01-05' }];
    const es = montarEtiquetasDoRecebimento(itens, MATERIAIS, ORIGIN);
    expect(es).toHaveLength(1);
    expect(es[0].linhaControle).toBe('Lote L-9 · Val 05/01/2027');
  });
  test('item sem controle gera etiqueta simples; qtd 0 fica fora; material desconhecido fica fora', () => {
    const itens = [
      { material_id: 7, quantidade_recebida: 5 },
      { material_id: 8, quantidade_recebida: 0, lote: 'L-X' },
      { material_id: 999, quantidade_recebida: 2 },
    ];
    const es = montarEtiquetasDoRecebimento(itens, MATERIAIS, ORIGIN);
    expect(es).toHaveLength(1);
    expect(es[0].codigo).toBe('MAT-7');
  });
});
```

- [ ] **Step 3: rodar e ver falhar** — `cd client && CI=true npx react-scripts test src/utils/etiquetasPdf --watchAll=false`. Esperado: módulo não existe.

- [ ] **Step 4: implementar os montadores** (só a parte pura — o renderizador jspdf é a Task 2):

```js
// client/src/utils/etiquetasPdf.js
// Etapa 6c: etiquetas com QR. Montadores puros (testáveis sem DOM/PDF) + renderizador jspdf.
// O descritor { codigo, nome, linhaControle, qrUrl } é a moeda entre telas, modal e PDF.

export const FORMATOS_ETIQUETA = {
  A4_GRADE: {
    label: 'Folha A4 (10 etiquetas por página)',
    page: { format: 'a4', orientation: 'portrait' },
    grade: { colunas: 2, linhas: 5, largura: 99, altura: 57, margemX: 6, margemY: 10.5 },
  },
  TERMICA_100x50: {
    label: 'Térmica 100×50 mm (1 por página)',
    page: { format: [100, 50], orientation: 'landscape' },
    grade: { colunas: 1, linhas: 1, largura: 100, altura: 50, margemX: 0, margemY: 0 },
  },
};

const formatDataBR = (iso) => {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

export function montarEtiquetaMaterial(material, origin) {
  return {
    codigo: material.codigo, nome: material.nome, linhaControle: '',
    qrUrl: `${origin}/almoxarifado/materiais?material_id=${material.id}`,
  };
}

export function montarEtiquetaLote(material, lote, origin) {
  const val = lote.data_validade ? ` · Val ${formatDataBR(lote.data_validade)}` : '';
  return {
    codigo: material.codigo, nome: material.nome,
    linhaControle: `Lote ${lote.codigo}${val}`,
    qrUrl: `${origin}/almoxarifado/lotes?material_id=${material.id}&aba=LOTES&lote=${encodeURIComponent(lote.codigo)}`,
  };
}

export function montarEtiquetaSerie(material, serie, origin) {
  return {
    codigo: material.codigo, nome: material.nome,
    linhaControle: `SN: ${serie.numero}`,
    qrUrl: `${origin}/almoxarifado/lotes?material_id=${material.id}&aba=SERIES&serie=${encodeURIComponent(serie.numero)}`,
  };
}

const linhasDeSeries = (txt) => String(txt || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

export function montarEtiquetasDoRecebimento(itens, materiais, origin) {
  const out = [];
  for (const item of itens || []) {
    const qtd = Number(item.quantidade_recebida || item.quantidade_esperada) || 0;
    if (qtd <= 0) continue;
    const m = (materiais || []).find((x) => x.id === item.material_id);
    if (!m) continue; // sem o material nao ha codigo/flags confiaveis para a etiqueta
    if (m.controle_serie === 1) {
      for (const numero of linhasDeSeries(item.series)) {
        out.push(montarEtiquetaSerie(m, { numero }, origin));
      }
    } else if (m.controle_lote === 1 && item.lote) {
      out.push(montarEtiquetaLote(m, { codigo: item.lote, data_validade: item.data_validade_lote }, origin));
    } else {
      out.push(montarEtiquetaMaterial(m, origin));
    }
  }
  return out;
}
```

- [ ] **Step 5: rodar e ver passar** (8 casos). Controle positivo: inverter temporariamente o filtro de qtd (`qtd > 0` → `qtd >= 0`) e ver o caso "qtd 0 fica fora" falhar; restaurar.

- [ ] **Step 6: commit**

```bash
git add client/package.json client/package-lock.json client/src/utils/etiquetasPdf.js client/src/utils/etiquetasPdf.test.js
git commit -m "Almoxarifado Etapa 6c: montadores de etiqueta e dependencia qrcode"
```

---

### Task 2: renderizador `gerarEtiquetasPDF`

**Files:**
- Modify: `client/src/utils/etiquetasPdf.js`
- Test: `client/src/utils/etiquetasPdf.test.js` (describe novo)

**Interfaces:**
- Consumes: `FORMATOS_ETIQUETA`, descritores (Task 1).
- Produces: `gerarEtiquetasPDF({ formato, etiquetas, copias = 1 }) → Promise<void>` (gera QRs, pagina pela grade, `doc.save('etiquetas-YYYY-MM-DD.pdf')`).

- [ ] **Step 1: teste que falha** — jspdf e qrcode mockados; o teste verifica paginação, cópias e chamadas:

```js
jest.mock('jspdf', () => {
  const instancias = [];
  const jsPDF = jest.fn().mockImplementation(function (opts) {
    const doc = {
      opts, addPage: jest.fn(), setFont: jest.fn(), setFontSize: jest.fn(),
      text: jest.fn(), addImage: jest.fn(), save: jest.fn(),
      setLineDashPattern: jest.fn(), rect: jest.fn(), setDrawColor: jest.fn(),
      splitTextToSize: jest.fn((t) => [t]),
    };
    instancias.push(doc);
    return doc;
  });
  jsPDF.__instancias = instancias;
  return { __esModule: true, default: jsPDF, jsPDF };
});
jest.mock('qrcode', () => ({
  __esModule: true,
  default: { toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,QQ==') },
}));

// dentro de um describe('gerarEtiquetasPDF'):
test('11 etiquetas em A4 (10 por pagina) geram 1 addPage e 11 addImage', async () => {
  const etiquetas = Array.from({ length: 11 }, (_, i) => ({
    codigo: `M-${i}`, nome: 'x', linhaControle: '', qrUrl: `u${i}`,
  }));
  await gerarEtiquetasPDF({ formato: 'A4_GRADE', etiquetas });
  const doc = require('jspdf').default.__instancias.at(-1);
  expect(doc.addPage).toHaveBeenCalledTimes(1);
  expect(doc.addImage).toHaveBeenCalledTimes(11);
  expect(doc.save).toHaveBeenCalledWith(expect.stringMatching(/^etiquetas-\d{4}-\d{2}-\d{2}\.pdf$/));
});

test('copias multiplica as etiquetas; termica cria 1 pagina por etiqueta', async () => {
  await gerarEtiquetasPDF({ formato: 'TERMICA_100x50', etiquetas: [{ codigo: 'M', nome: 'x', linhaControle: 'SN: 1', qrUrl: 'u' }], copias: 3 });
  const doc = require('jspdf').default.__instancias.at(-1);
  expect(doc.addPage).toHaveBeenCalledTimes(2); // 3 etiquetas, 1 por pagina, a 1a pagina ja existe
  expect(require('qrcode').default.toDataURL).toHaveBeenCalledWith('u', expect.any(Object));
});
```

- [ ] **Step 2: rodar e ver falhar.**

- [ ] **Step 3: implementar** (acrescentar ao `etiquetasPdf.js`; molde de estilo: `gerarPDFProposta.js`):

```js
import jsPDF from 'jspdf';
import QRCode from 'qrcode';

/** Gera o PDF e dispara o download. copias > 1 repete cada etiqueta. */
export async function gerarEtiquetasPDF({ formato, etiquetas, copias = 1 }) {
  const cfg = FORMATOS_ETIQUETA[formato];
  if (!cfg) throw new Error(`formato de etiqueta desconhecido: ${formato}`);
  const lista = etiquetas.flatMap((e) => Array.from({ length: copias }, () => e));
  if (lista.length === 0) throw new Error('nenhuma etiqueta para gerar');

  // QRs primeiro (async) — o desenho e sincrono depois disso.
  const qrs = await Promise.all(
    lista.map((e) => QRCode.toDataURL(e.qrUrl, { margin: 0, width: 256 }))
  );

  const doc = new jsPDF({ orientation: cfg.page.orientation, unit: 'mm', format: cfg.page.format });
  const { colunas, linhas, largura, altura, margemX, margemY } = cfg.grade;
  const porPagina = colunas * linhas;
  const PAD = 4;

  lista.forEach((e, i) => {
    const slot = i % porPagina;
    if (i > 0 && slot === 0) doc.addPage();
    const x = margemX + (slot % colunas) * largura;
    const y = margemY + Math.floor(slot / colunas) * altura;

    if (porPagina > 1) { // borda pontilhada de recorte so faz sentido na grade A4
      doc.setDrawColor(180);
      doc.setLineDashPattern([1, 1], 0);
      doc.rect(x, y, largura, altura);
      doc.setLineDashPattern([], 0);
    }

    const ladoQr = Math.min(altura - 2 * PAD, 32);
    const xQr = x + largura - PAD - ladoQr;
    doc.addImage(qrs[i], 'PNG', xQr, y + (altura - ladoQr) / 2, ladoQr, ladoQr);

    const larguraTexto = xQr - x - 2 * PAD;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(e.codigo, x + PAD, y + PAD + 5, { maxWidth: larguraTexto });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const nome = doc.splitTextToSize(e.nome || '', larguraTexto).slice(0, 2);
    doc.text(nome, x + PAD, y + PAD + 11);
    if (e.linhaControle) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(e.linhaControle, x + PAD, y + altura - PAD - 1, { maxWidth: larguraTexto });
    }
  });

  const hoje = new Date().toISOString().slice(0, 10);
  doc.save(`etiquetas-${hoje}.pdf`);
}
```

- [ ] **Step 4: rodar e ver passar.** Controle positivo: trocar temporariamente `porPagina` por `porPagina + 1` e ver o teste de paginação falhar; restaurar.

- [ ] **Step 5: commit**

```bash
git add client/src/utils/etiquetasPdf.js client/src/utils/etiquetasPdf.test.js
git commit -m "Almoxarifado Etapa 6c: renderizador jspdf com grade A4 e termica"
```

---

### Task 3: `EtiquetasPdfModal` (compartilhado)

**Files:**
- Create: `client/src/components/almoxarifado/EtiquetasPdfModal.js`
- Test: `client/src/components/almoxarifado/EtiquetasPdfModal.test.js`

**Interfaces:**
- Consumes: `FORMATOS_ETIQUETA`, `gerarEtiquetasPDF` (Tasks 1-2).
- Produces: componente `<EtiquetasPdfModal etiquetas={descritores[]} onClose={fn} />`. Persiste o último formato em `localStorage['almox_etiqueta_formato']` (decisão do usuário: térmica é o caminho provável do galpão — quem usa escolhe uma vez).

- [ ] **Step 1: teste que falha** (molde createRoot/act; `gerarEtiquetasPDF` mockado via `jest.mock('../../utils/etiquetasPdf', ...)` preservando `FORMATOS_ETIQUETA` real com `jest.requireActual`):

```js
test('gera com o formato escolhido e persiste a escolha no localStorage', async () => { /* seleciona TERMICA_100x50, clica Gerar, expect(gerarEtiquetasPDF).toHaveBeenCalledWith(expect.objectContaining({ formato: 'TERMICA_100x50' })); expect(localStorage.getItem('almox_etiqueta_formato')).toBe('TERMICA_100x50') */ });
test('reabre ja com o formato lembrado', async () => { /* localStorage pre-populado -> select nasce TERMICA_100x50 */ });
test('contagem mostra N etiquetas e M paginas por formato', async () => { /* 11 etiquetas A4 -> "2 pagina(s)"; termica -> "11 pagina(s)" */ });
test('sem etiquetas: botao desabilitado com explicacao', async () => { /* etiquetas=[] */ });
test('copias so aparece para etiqueta unica e multiplica no call', async () => { /* 1 etiqueta, copias 5 -> chamado com copias 5 */ });
```

(Corpos completos no arquivo, com os helpers `preencher`/`clicarBotaoModal` copiados do molde `LotesAlmoxarifado.test.js`.)

- [ ] **Step 2: rodar e ver falhar.**

- [ ] **Step 3: implementar** — modal no molde visual dos modais de `LotesAlmoxarifado.js` (`.almox-modal`, `.almox-field`, `.almox-modal-footer`): select de formato (entries de `FORMATOS_ETIQUETA`, init `useState(() => localStorage.getItem('almox_etiqueta_formato') || 'A4_GRADE')`), input numérico de cópias (renderizado só quando `etiquetas.length === 1`, min 1), contagem `${total} etiqueta(s) · ${Math.ceil(total / porPagina)} página(s)`, botão Gerar (disabled sem etiquetas) que grava o localStorage, chama `gerarEtiquetasPDF`, `toast.success`/`toast.error` e `onClose()`.

- [ ] **Step 4: rodar e ver passar** + suíte client inteira + build CI. Controle positivo: comentar a gravação do localStorage e ver o teste de persistência falhar; restaurar.

- [ ] **Step 5: commit**

```bash
git add client/src/components/almoxarifado/EtiquetasPdfModal.js client/src/components/almoxarifado/EtiquetasPdfModal.test.js
git commit -m "Almoxarifado Etapa 6c: modal compartilhado de impressao de etiquetas"
```

---

### Task 4: "Lotes e Séries" — deep-link com destaque + botões de etiqueta

**Files:**
- Modify: `client/src/components/almoxarifado/LotesAlmoxarifado.js`
- Test: `client/src/components/almoxarifado/LotesAlmoxarifado.test.js` (describe novo)

**Interfaces:**
- Consumes: `EtiquetasPdfModal`, `montarEtiquetaLote`/`montarEtiquetaSerie` (Tasks 1-3).
- Produces: a tela aceita `?material_id=X&aba=SERIES&serie=N` / `&aba=LOTES&lote=C` (é a URL que os QRs codificam).

- [ ] **Step 1: testes que falham** (renderizar com `MemoryRouter initialEntries`):

```js
test('deep-link inicializa material e aba e destaca a linha da serie', async () => { /* ?material_id=X&aba=SERIES&serie=SN-2 -> aba Series ativa, linha SN-2 com background de destaque */ });
test('deep-link de lote destaca a linha do lote', async () => { /* &aba=LOTES&lote=L-1 */ });
test('acao Etiqueta na linha do lote abre o modal com o descritor do lote', async () => { /* mock do modal ou assert do estado: title Etiqueta -> modal visivel com 1 etiqueta */ });
test('botao Etiquetas das series em estoque monta 1 descritor por serie EM_ESTOQUE', async () => {});
```

- [ ] **Step 2: rodar e ver falhar.**

- [ ] **Step 3: implementar**

- Lazy-init pela URL (molde `ConfiguracoesAlmoxarifado.js:197`; requer `useSearchParams` — a rota já está sob Router):

```js
const [searchParams] = useSearchParams();
const [materialId, setMaterialId] = useState(() => searchParams.get('material_id') || '');
const [aba, setAba] = useState(() => (searchParams.get('aba') === 'SERIES' ? 'SERIES' : 'LOTES'));
const [destaque] = useState(() => ({ lote: searchParams.get('lote') || '', serie: searchParams.get('serie') || '' }));
```

- Destaque: na linha de lote `style={{ background: destaque.lote === l.codigo ? 'rgba(79,172,254,0.10)' : undefined }}`; idem série com `destaque.serie === s.numero`.
- Ação por linha (lote e série): botão `almox-btn-icon` com `FiTag`, gate `bloquearSeNaoPode('visualizar', e)`, abrindo `setEtiquetas([montarEtiquetaLote(materialSelecionado, l, window.location.origin)])` (série análogo). Estado novo `etiquetas` (null = modal fechado) + `<EtiquetasPdfModal etiquetas={etiquetas} onClose={() => setEtiquetas(null)} />`.
- Na aba Séries, botão "Etiquetas das séries em estoque" (desabilitado se nenhuma EM_ESTOQUE): `setEtiquetas(series.filter((s) => s.status === 'EM_ESTOQUE').map((s) => montarEtiquetaSerie(materialSelecionado, s, window.location.origin)))`.

- [ ] **Step 4: rodar e ver passar** + suíte inteira + build. Controle positivo: remover o lazy-init da aba e ver o teste do deep-link falhar; restaurar.

- [ ] **Step 5: commit**

```bash
git add client/src/components/almoxarifado/LotesAlmoxarifado.js client/src/components/almoxarifado/LotesAlmoxarifado.test.js
git commit -m "Almoxarifado Etapa 6c: deep-link com destaque e botoes de etiqueta em Lotes e Series"
```

---

### Task 5: Materiais — botão etiqueta + leitura de `?material_id=`

**Files:**
- Modify: `client/src/components/almoxarifado/MateriaisAlmoxarifado.js`

**Interfaces:**
- Consumes: `EtiquetasPdfModal`, `montarEtiquetaMaterial` (Tasks 1-3).

- [ ] **Step 1: implementar** (sem teste client dedicado — a tela não tem suíte própria; gate = suíte inteira + build, mesmo critério da Task 9 da 6b):

- Ação por linha (após "Ver no mapa", ícone `FiTag`, import novo em react-icons/fi): material com `controle_serie === 1 || controle_lote === 1` → `navigate('/almoxarifado/lotes?material_id=' + m.id + (m.controle_serie === 1 ? '&aba=SERIES' : ''))` (a etiqueta certa mora lá); senão → `setEtiquetas([montarEtiquetaMaterial(m, window.location.origin)])` + modal.
- Leitura one-shot de `?material_id=` (molde das linhas 40-48 do próprio arquivo, que já leem `?status=`): quando presente e a lista carregar, pré-preencher a busca com o `codigo` do material (`setBusca(m.codigo)`) — é o destino do QR de material simples.

- [ ] **Step 2: verificar** — suíte client inteira + `CI=true npx react-scripts build`.

- [ ] **Step 3: commit**

```bash
git add client/src/components/almoxarifado/MateriaisAlmoxarifado.js
git commit -m "Almoxarifado Etapa 6c: etiqueta avulsa na lista de materiais e destino do QR de material"
```

---

### Task 6: Recebimentos — etiquetas da nota processada

**Files:**
- Modify: `client/src/components/almoxarifado/RecebimentosAlmoxarifado.js`

**Interfaces:**
- Consumes: `EtiquetasPdfModal`, `montarEtiquetasDoRecebimento` (Tasks 1-3). O detalhe processado já carrega `item.lote`/`item.series`/`item.data_validade_lote`; `materiais` (lista com flags) já está no estado da tela.

- [ ] **Step 1: implementar** — em `renderAcoes()`, ANTES do early-return de status processado, novo ramo:

```jsx
if (detalhe && ['PROCESSADO', 'APROVADO'].includes(detalhe.status)) {
  const etiquetasNota = montarEtiquetasDoRecebimento(detalhe.itens || [], materiais, window.location.origin);
  return (
    <button className="btn-almox-secondary" style={{ width: '100%', justifyContent: 'center' }}
      disabled={etiquetasNota.length === 0}
      title={etiquetasNota.length === 0 ? 'Nenhum item com entrada para etiquetar' : 'Gera o PDF de etiquetas dos itens desta nota'}
      onClick={() => setEtiquetas(etiquetasNota)}>
      <FiTag size={14} /> Imprimir etiquetas dos itens
    </button>
  );
}
```

Estado `etiquetas` + `<EtiquetasPdfModal ...>` como nas outras telas; import de `FiTag`.

- [ ] **Step 2: verificar** — suíte inteira + build.

- [ ] **Step 3: commit**

```bash
git add client/src/components/almoxarifado/RecebimentosAlmoxarifado.js
git commit -m "Almoxarifado Etapa 6c: etiquetas dos itens da nota processada"
```

---

### Task 7: documentação e verificação final da etapa

**Files:**
- Modify: `specs/modulo-almoxarifado/10-lotes-series-etiquetas/README.md` (checklist 6c `[x]` com hashes; status da feature; pendências: etiqueta de retalho → feature 15, etiqueta de localização cortada, rota séries-por-recebimento como robustez futura, impressora física do galpão a confirmar com o cliente)
- Modify: `specs/modulo-almoxarifado/README.md` (linha 10; Etapa 6c ✅; critério "Rastrear lote e número de série" → completo; próxima etapa da ordem: **Etapa 7 — transferências e devoluções**)
- Modify: `docs/almoxarifado-guia-etapas-e-testes.md` (cabeçalho; seção 6c com Antes→Agora e roteiro clicável: imprimir da nota processada, da linha de lote/série, das séries em estoque, etiqueta avulsa de material, ler o QR com o celular e cair na tela filtrada com destaque, trocar o formato e ver o modal lembrar)
- Modify: `docs/superpowers/plans/2026-08-11-almoxarifado-etapa6c-etiquetas.md` (✅ CONCLUÍDA + tabela task→hash + próxima tarefa detalhada: **Etapa 7** — briefing com contrato das specs 11/12 já auditadas em 2026-08-11)

- [ ] **Step 1: rodar TUDO e citar números reais** — server: `npm run test:api && npm run test:almoxarifado && npm run test:validation && npm run test:safealter && npm run test:sqlite`; client: suíte inteira + build CI.
- [ ] **Step 2: atualizar os 4 documentos** (regra do CLAUDE.md; item não entregue desmarcado com o porquê).
- [ ] **Step 3: commit** — `git commit -m "Almoxarifado Etapa 6c: atualiza specs, guia e plano com o que a etapa entregou"`. Push fica com o controlador após o review final.

---

## Self-review do plano (2026-08-11)

- **Cobertura do design:** formatos+montadores (T1), renderizador (T2), modal com localStorage (T3), deep-link+destaque+botões em Lotes e Séries (T4), Materiais+destino do QR (T5), Recebimentos (T6), docs (T7). Erros (modal vazio, toast) em T3/T6. Decisão 6 (sem registro de impressão) não gera task — é ausência deliberada, registrada na spec via T7.
- **Sem placeholders:** T3/T4 têm cenários resumidos com molde nomeado e asserts-chave; corpos completos são do implementador no padrão do arquivo-molde (mesma convenção validada na 6b).
- **Consistência de nomes:** `FORMATOS_ETIQUETA`/`montarEtiqueta*`/`montarEtiquetasDoRecebimento`/`gerarEtiquetasPDF`/`EtiquetasPdfModal`/`almox_etiqueta_formato` idênticos em T1-T6; dialeto `material_id`/`aba`/`lote`/`serie` em T1/T4/T5.
