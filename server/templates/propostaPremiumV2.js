'use strict';
const path = require('path');
const fs = require('fs');
const {
  uploadsProdutosDir,
  uploadsLogosDir,
  uploadsCoverDir,
} = require('../config/paths');
const propostaEngine = require('../propostaCompositionEngine');
const { getClausulasDefault } = require('../clausulasDefault');

// Substitui placeholders (simples e avançados: {{#if}}, {{#each}}, etc.) — usa motor de composição
function substituirPlaceholdersProposta(html, proposta, itens, totais) {
  if (!html || typeof html !== 'string') return html || '';
  try {
    const { prepareCompositionData, resolveAdvancedPlaceholders, buildPlaceholderContext } = propostaEngine;
    const { rawData, displayFields } = prepareCompositionData(proposta || {}, itens, totais, {});
    const phContext = buildPlaceholderContext(proposta || {}, itens, totais, displayFields, rawData);
    return resolveAdvancedPlaceholders(html, phContext);
  } catch (e) {
    console.error('Aviso: substituição de placeholders falhou, retornando HTML original:', e && e.message);
    return html;
  }
}

// Versão 2 (reescrita estrutural completa) do HTML/CSS da proposta comercial.
// Atende às regras:
// - Sem position: fixed para header/footer
// - proposal-document > proposal-page > header/content/footer
// - Reset + spacing por stack/gap (sem margens aleatórias)
// - Páginas A4 previsíveis em tela e impressão
// - Paginação dinâmica simples (medição de altura real) com suporte a:
//   - .avoid-break (move bloco inteiro)
//   - tabelas longas (quebra por linhas com thead repetido)
function gerarHTMLPropostaPremiumV2(proposta, itens, totais, templateConfig = null, baseURLOverride = null, forPdfServer = false, omitPrintBar = false) {
  try {
    if (!proposta) throw new Error('Proposta não fornecida');
    if (!Array.isArray(itens)) itens = [];
    if (!totais) totais = { subtotal: 0, icms: 0, ipi: 0, total: 0, dataEmissao: '', dataValidade: '' };

    const config = templateConfig || {};
    const baseURL = (baseURLOverride && typeof baseURLOverride === 'string')
      ? baseURLOverride.replace(/\/$/, '')
      : (process.env.API_URL || 'http://localhost:5000');
    const ts = Date.now();

    const fileToDataUrl = (absPath) => {
      try {
        if (!absPath || !fs.existsSync(absPath)) return '';
        const ext = path.extname(absPath).toLowerCase().replace('.', '');
        const mime = ext === 'png' ? 'image/png'
          : ext === 'webp' ? 'image/webp'
          : ext === 'gif' ? 'image/gif'
          : ext === 'svg' ? 'image/svg+xml'
          : ext === 'ttf' ? 'font/ttf'
          : ext === 'woff' ? 'font/woff'
          : ext === 'woff2' ? 'font/woff2'
          : ext === 'otf' ? 'font/otf'
          : 'image/jpeg';
        const buf = fs.readFileSync(absPath);
        return `data:${mime};base64,${buf.toString('base64')}`;
      } catch (_) {
        return '';
      }
    };

    const uploadToDataUrl = (dirAbs, filename) => {
      const f = String(filename || '').trim();
      if (!f) return '';
      return fileToDataUrl(path.join(dirAbs, f));
    };

    const esc = (v) => String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const moedaBRL = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });


    // Cabeçalho/rodapé por IMAGEM foram removidos: o template usa sempre o cabeçalho e o rodapé
    // montados do modelo DOCX. As colunas header_image_url/footer_image_url continuam existindo em
    // proposta_template_config (dados legados), mas são deliberadamente IGNORADAS aqui.
    // Motivo: a imagem estática substituía o cabeçalho montado inteiro e, com ele, o "Nº da
    // proposta" — que só existe no cabeçalho montado. Em produção isso deixava toda proposta sem
    // número, enquanto no local o mesmo registro parecia correto porque o arquivo não existia no
    // disco. Ver tests/propostaHeaderPadraoSempre.test.js.

    // Logo do cliente (capa): embed base64 a partir de uploads/logos, nunca via HTTP (PDF offline).
    // Se o arquivo não existir no disco, degrada para null (não renderiza o bloco).
    const clienteLogoB64 = (proposta.cliente_logo_url && String(proposta.cliente_logo_url).trim())
      ? (uploadToDataUrl(uploadsLogosDir, String(proposta.cliente_logo_url).trim()) || null)
      : null;

    // Assets estáticos do template (logos/imagens da capa + fontes). No PREVIEW
    // (navegador) referenciamos por URL cacheável servida por /api/assets/*, em vez de
    // base64 inline: eram ~4.5MB (imagens da capa + 4 fontes) inflados 34% pelo base64 e
    // regenerados a cada abertura, sem cache. Via URL o browser baixa 1x e reusa do cache.
    // No PDF (forPdfServer) mantém base64 — o Puppeteer roda offline, sem servidor HTTP.
    // O ?v=<mtime> invalida o cache automaticamente se o arquivo mudar. statSync falha
    // para arquivo ausente → '' (mesmo contrato de degradação do fileToDataUrl anterior).
    const propostaAssetsDir = path.join(__dirname, '..', 'assets', 'proposta');
    const fontsDir = path.join(__dirname, '..', 'assets', 'fonts');
    // No PDF, prefere um gêmeo .jpg do asset quando ele existir no disco. Motivo: o Chrome
    // copia um JPEG para dentro do PDF sem tocar nos bytes (DCTDecode), mas WebP e PNG ele
    // precisa decodificar e regravar como bitmap comprimido em Flate — péssimo para foto.
    // Medido: industria40.webp 123KB no disco → 1161KB dentro do PDF (9.4x); projetos.webp
    // 45KB → 712KB (15.9x). Em JPEG os mesmos arquivos entram 1:1. Isso derrubou o PDF de
    // ~2.4MB para ~0.6MB sem mudança visível. O PREVIEW continua usando o WebP por URL, que
    // é o formato mais leve na rede (foi o ganho do commit b8429e2) — cada caminho usa o
    // formato bom para ele. Assets sem gêmeo .jpg (logos com transparência, que viram fundo
    // preto/branco em JPEG) seguem inalterados.
    const versaoParaPdf = (baseDir, filename) => {
      const jpg = filename.replace(/\.(webp|png)$/i, '.jpg');
      if (jpg === filename) return filename;
      try {
        if (fs.statSync(path.join(baseDir, jpg)).isFile()) return jpg;
      } catch (_) { /* sem gêmeo: usa o original */ }
      return filename;
    };
    const assetUrl = (baseDir, rota, filename) => {
      if (forPdfServer) return fileToDataUrl(path.join(baseDir, versaoParaPdf(baseDir, filename)));
      const abs = path.join(baseDir, filename);
      let v;
      try { v = Math.floor(fs.statSync(abs).mtimeMs); } catch (_) { return ''; }
      return `${baseURL}/api/assets/${rota}/${filename}?v=${v}`;
    };
    const assetProposta = (filename) => assetUrl(propostaAssetsDir, 'proposta', filename);
    const assetFonte = (filename) => assetUrl(fontsDir, 'fonts', filename);

    // Dimensões intrínsecas de um PNG (IHDR: largura/altura big-endian nos offsets 16 e 20),
    // emitidas como atributos width/height no <img>. Sem elas o browser só conhece o tamanho
    // da imagem DEPOIS de baixá-la: até lá o elemento mede 0px de altura e a paginação, que
    // roda medindo o DOM, decide a página com a altura errada. Com os atributos o espaço é
    // reservado desde a primeira medição — inclusive se a imagem 404. Retorna '' se não der
    // para ler (o layout então volta ao comportamento anterior, sem quebrar).
    const dimensoesImg = (baseDir, filename) => {
      try {
        const fd = fs.openSync(path.join(baseDir, filename), 'r');
        const buf = Buffer.alloc(24);
        fs.readSync(fd, buf, 0, 24, 0);
        fs.closeSync(fd);
        if (buf.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') return '';
        const w = buf.readUInt32BE(16);
        const h = buf.readUInt32BE(20);
        return (w > 0 && h > 0) ? ` width="${w}" height="${h}"` : '';
      } catch (_) { return ''; }
    };
    const dadosContratadaDim = dimensoesImg(propostaAssetsDir, 'dados-contratada.png');

    const gmpLogoSmB64 = assetProposta('logo-gmp.png');
    const gmpLogoGrandeB64 = assetProposta('logo-gmp-grande.png');
    const myLogoB64 = assetProposta('logo-moinho-ypiranga.png');
    const dadosContratadaB64 = assetProposta('dados-contratada.png');
    const industria40B64 = assetProposta('industria40.webp');
    const projetosB64 = assetProposta('projetos.webp');

    const cgRegularB64 = assetFonte('CenturyGothic.ttf');
    const cgBoldB64 = assetFonte('CenturyGothic-Bold.ttf');
    const cgItalicB64 = assetFonte('CenturyGothic-Italic.ttf');
    const cgBoldItalicB64 = assetFonte('CenturyGothic-BoldItalic.ttf');

    const numero = esc(proposta.numero_proposta || 'N/A');
    const titulo = esc(proposta.titulo || 'Proposta Técnica Comercial');
    const clienteNome = esc(proposta.razao_social || proposta.nome_fantasia || '—');
    const clienteCnpj = esc(proposta.cnpj || '—');
    const responsavelNome = esc(proposta.responsavel_nome || '—');
    const dataEmissao = esc(totais.dataEmissao || '');
    const dataValidade = esc(totais.dataValidade || '');

    const printBar = (omitPrintBar || forPdfServer) ? '' : `
      <div class="printbar" role="region" aria-label="Ações da proposta">
        <div class="printbar-inner">
          <div class="printbar-title">Pré-visualização • Proposta ${numero}</div>
          <button type="button" class="printbar-btn" onclick="window.print()">Imprimir / Salvar PDF</button>
        </div>
      </div>`;

    const ofertaRows = (itens || []).map((it, idx) => {
      const itemRef = `4.${idx + 1}`;
      const nome = esc(it.produto_nome || it.descricao || `Item ${idx + 1}`);
      const qtd = Number(it.quantidade) || 1;
      const und = esc(it.unidade || 'UN');
      return `<tr>
        <td class="col-center">${itemRef}</td>
        <td class="col-center">${qtd} ${und}</td>
        <td>${nome}</td>
      </tr>`;
    }).join('');

    // ===== Variáveis técnicas (Item 4.x) - parsing robusto do template =====
    // Objetivo: sempre transformar config (variáveis do admin) em uma lista real de chaves
    // para que `${specRowsHtml}` seja montado no <tbody> da tabela.
    const normalizarFamiliaComparacao = (s) => String(s || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ');

    const normalizeVariavelKey = (item) => {
      if (item == null) return '';
      if (typeof item === 'string' || typeof item === 'number') return String(item).trim();
      if (typeof item === 'object') {
        return String(item.chave || item.key || item.variavel_chave || item.id || '').trim();
      }
      return '';
    };

    const tryParseJson = (s) => {
      if (typeof s !== 'string') return null;
      const t = s.trim();
      if (!t) return null;
      if (t === '[object Object]') return null;
      try { return JSON.parse(t); } catch (_) { return null; }
    };

    const toKeysArray = (raw) => {
      if (raw == null) return [];

      if (Array.isArray(raw)) {
        return raw.map(normalizeVariavelKey).filter(Boolean);
      }

      if (typeof raw === 'string') {
        const parsed = tryParseJson(raw);
        if (parsed) {
          if (Array.isArray(parsed)) return parsed.map(normalizeVariavelKey).filter(Boolean);
          if (typeof parsed === 'object') {
            if (Array.isArray(parsed.selected)) return parsed.selected.map(normalizeVariavelKey).filter(Boolean);
            if (Array.isArray(parsed.chaves)) return parsed.chaves.map(normalizeVariavelKey).filter(Boolean);
            // mapa { chave:true }
            return Object.keys(parsed).filter((k) => parsed[k]).map(normalizeVariavelKey).filter(Boolean);
          }
        }

        // fallback: string com separadores (CSV/newline/etc)
        return raw
          .trim()
          .replace(/^\[|\]$/g, '')
          .split(/[,\n;]+/g)
          .map((p) => p.replace(/^['"]|['"]$/g, '').trim())
          .filter(Boolean)
          .map(normalizeVariavelKey)
          .filter(Boolean);
      }

      if (typeof raw === 'object') {
        if (Array.isArray(raw.selected)) return raw.selected.map(normalizeVariavelKey).filter(Boolean);
        if (Array.isArray(raw.chaves)) return raw.chaves.map(normalizeVariavelKey).filter(Boolean);

        const keys = Object.keys(raw);
        if (keys.length === 0) return [];

        // mapa { chave:true }
        const anyTruthy = keys.some((k) => Boolean(raw[k]));
        if (anyTruthy) {
          return keys.filter((k) => Boolean(raw[k])).map(normalizeVariavelKey).filter(Boolean);
        }

        // array-like { "0":"key1", "1":"key2" }
        const isIndexMap = keys.every((k) => String(+k) === k);
        if (isIndexMap) return Object.values(raw).map(normalizeVariavelKey).filter(Boolean);

        // fallback: considerar as próprias chaves como lista
        return keys.map(normalizeVariavelKey).filter(Boolean);
      }

      return [];
    };

    const toFamiliesMap = (raw) => {
      if (raw == null) return {};

      let obj = raw;
      if (typeof raw === 'string') {
        const parsed = tryParseJson(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        obj = parsed;
      }

      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};

      const out = {};
      for (const [fam, val] of Object.entries(obj)) {
        const keys = toKeysArray(val);
        if (keys.length > 0) out[fam] = keys;
      }
      return out;
    };

    const baseKeys = toKeysArray(config.variaveis_proposta_tecnica);
    const porFamiliaMap = toFamiliesMap(config.variaveis_proposta_por_familia);

    const extrairCodigoFamiliaParens = (s) => {
      const m = String(s || '').match(/\(([^)]+)\)/);
      return m && m[1] ? m[1] : '';
    };
    const normalizarCodigoFamilia = (s) => String(s || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '');

    const getVariaveisListForFamilia = (familia) => {
      const famNorm = normalizarFamiliaComparacao(familia);
      if (!famNorm) return baseKeys;

      const keysMap = Object.keys(porFamiliaMap || {});
      if (keysMap.length === 0) return baseKeys;

      // 1) match exato (nome da família)
      let keyMatch = keysMap.find((k) => normalizarFamiliaComparacao(k) === famNorm) || null;

      // 2) match por código dentro de parênteses (ex: (DHY))
      if (!keyMatch) {
        const codeFam = normalizarCodigoFamilia(extrairCodigoFamiliaParens(familia));
        if (codeFam) {
          keyMatch = keysMap.find((k) => {
            const codeKey = normalizarCodigoFamilia(extrairCodigoFamiliaParens(k));
            return codeKey && codeKey === codeFam;
          }) || null;
        }
      }

      // 3) match por inclusão (evita diferença de acento/descritor)
      if (!keyMatch) {
        keyMatch = keysMap.find((k) => {
          const kNorm = normalizarFamiliaComparacao(k);
          return kNorm && (kNorm.includes(famNorm) || famNorm.includes(kNorm));
        }) || null;
      }

      const candidate = keyMatch ? porFamiliaMap[keyMatch] : [];
      return Array.isArray(candidate) && candidate.length > 0 ? candidate : baseKeys;
    };

    // 4.0 DESCRITIVO DOS EQUIPAMENTOS: 4.1 / 4.2 / ...
    // Verifica se pelo menos um item tem conteúdo técnico para exibir
    const algumItemComDados = (itens || []).some(it =>
      (it.descritivo_tecnico || it.descricao_tecnica || it.descricao_resumida || it.produto_descricao || it.produto_descritivo || '').trim() ||
      (it.produto_imagem || it.produto_imagem_base64 || it.imagem || '').trim() ||
      (it.especificacoes_tecnicas || it.produto_especificacoes || '').trim()
    );

    const equipItems = (itens || []).map((it, idx) => {
      const n = idx + 1;
      const itemNo = `4.${n}`;
      const nome = esc(it.produto_nome || it.descricao || `Equipamento ${n}`);
      const codigo = esc(it.codigo_produto || it.produto_codigo || '—');
      const qtd = esc(Number(it.quantidade) || 1);
      const und = esc(it.unidade || 'UN');
      const familia = esc(it.familia_produto || it.produto_familia || it.familia || '—');
      const modelo = esc(it.modelo || '—');
      const categoria = esc(it.categoria || '—');
      const ncm = esc(it.ncm || it.produto_ncm || '—');

      const descritivoTecRaw = it.descritivo_tecnico || it.descricao_tecnica || it.descricao_resumida || it.produto_descricao || it.produto_descritivo || '';
      let descritivoTec = esc(String(descritivoTecRaw || '').trim());

      // especificacoes_tecnicas pode vir como JSON string/objeto
      let specs = {};
      const specsRaw = it.especificacoes_tecnicas || it.produto_especificacoes || '';
      if (specsRaw) {
        try {
          if (typeof specsRaw === 'string') {
            const trimmed = specsRaw.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) specs = JSON.parse(trimmed);
            else specs = { 'Especificações técnicas': trimmed };
          } else if (typeof specsRaw === 'object') {
            specs = specsRaw;
          }
        } catch (_) {
          specs = { 'Especificações técnicas': String(specsRaw) };
        }
      }

      // Se não veio "descritivo técnico" direto do item, tentar usar campos comuns do JSON de especificações.
      if (!descritivoTec) {
        const cand =
          (specs && typeof specs === 'object')
            ? (specs.descricao || specs.descritivo || specs.descricao_tecnica || specs['Descrição'] || specs['Especificações técnicas'] || '')
            : '';
        descritivoTec = esc(String(cand || '').trim());
      }
      if (!descritivoTec) descritivoTec = '';

      const normKey = (s) => String(s || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, '_');

      const getSpecValue = (obj, key) => {
        if (!obj || typeof obj !== 'object') return '';
        if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
        const k2 = String(key || '').trim();
        if (k2 && Object.prototype.hasOwnProperty.call(obj, k2)) return obj[k2];
        const target = normKey(key);
        if (!target) return '';
        const foundKey = Object.keys(obj).find((k) => normKey(k) === target);
        return foundKey ? obj[foundKey] : '';
      };

      const variaveisLabelsRaw = config.variaveis_proposta_labels || {};
      let variaveisLabels = {};
      if (typeof variaveisLabelsRaw === 'string') {
        const parsed = tryParseJson(variaveisLabelsRaw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) variaveisLabels = parsed;
      } else if (variaveisLabelsRaw && typeof variaveisLabelsRaw === 'object') {
        variaveisLabels = variaveisLabelsRaw;
      }
      const variaveisList = getVariaveisListForFamilia(it.familia_produto || it.produto_familia || it.familia || '');
      // Sempre respeitar a seleção do admin (por família). Se não houver lista, não imprime specs extras.
      const specRowsHtml = (Array.isArray(variaveisList) && variaveisList.length > 0)
        ? variaveisList
            .filter((k) => k && String(k).indexOf('_cond') === -1)
            .map((k) => {
              const meta = variaveisLabels[k] || {};
              const label = (meta && meta.nome) ? meta.nome : k;
              const sufixo = (meta && meta.sufixo) ? meta.sufixo : '';
              const rawVal = getSpecValue(specs, k);
              const displayVal = (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '')
                ? String(rawVal).trim()
                : '';
              if (!displayVal) return '';
              const valueDisplay = displayVal + (sufixo ? ` ${sufixo}` : '');
              return `<p><strong>${esc(label)}:</strong> ${esc(valueDisplay)}</p>`;
            }).filter(Boolean).join('')
        : '';

      const produtoImagem = it.produto_imagem_base64
        ? it.produto_imagem_base64
        : (() => {
            const file = String(it.produto_imagem || it.imagem || '').trim();
            if (!file) return '';
            // Embed base64 para evitar qualquer dependência de carregamento HTTP (preview e PDF).
            // Fallback: se não conseguir ler do filesystem, usar URL.
            const data = uploadToDataUrl(uploadsProdutosDir, file);
            if (data) return data;
            return `${baseURL}/api/uploads/produtos/${encodeURIComponent(file)}?t=${ts}`;
          })();

      const fotoHtml = produtoImagem
        ? `<div class="equip-photo-float">
             <img class="equip-photo-img-float" src="${produtoImagem}" alt="Foto do equipamento"
               onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
             <div class="equip-photo-fallback-float" style="display:none;">Foto não disponível</div>
             <div class="equip-photo-caption">IMAGEM ILUSTRATIVA</div>
           </div>`
        : '';

      return `
        <h3>${itemNo} ${nome}</h3>
        <div class="equip-specs-kv">
          ${fotoHtml}
          ${descritivoTec ? `<p><strong>Descritivo técnico:</strong></p><div class="equip-descritivo">${descritivoTec}</div>` : ''}
          <p><strong>Equipamento:</strong> ${nome}</p>
          ${codigo !== '—' ? `<p><strong>Código:</strong> ${codigo}</p>` : ''}
          <p><strong>Quantidade:</strong> ${qtd} ${und}</p>
          ${modelo !== '—' ? `<p><strong>Modelo:</strong> ${modelo}</p>` : ''}
          ${familia !== '—' ? `<p><strong>Família:</strong> ${familia}</p>` : ''}
          ${categoria !== '—' ? `<p><strong>Categoria:</strong> ${categoria}</p>` : ''}
          ${ncm !== '—' ? `<p><strong>NCM:</strong> ${ncm}</p>` : ''}
          ${specRowsHtml}
        </div>
      `;
    });

    const warningMsgEscopo = (itens && itens.length > 0 && !algumItemComDados)
      ? `<p style="color:var(--muted);font-style:italic;font-size:10pt;margin-top:2mm;">As informações técnicas não estão cadastradas nos produtos desta proposta. Acesse o cadastro de produtos para preenchê-las.</p>`
      : '';
    // A seção 4 inicia em página própria (data-page-break="before"), como a 5, a 5.23 e a
    // 5.24 — ver I7 em specs/proposta-editavel/review-proposta.md. O `avoid-break` sozinho
    // só impede o título de ficar órfão do primeiro equipamento; sem a quebra, numa proposta
    // curta a seção 4 caía na mesma página das seções 1, 2 e 3. Vale nos DOIS ramos abaixo.
    const equipDescritivoHtml = equipItems.length === 0
      ? `<section class="block stack-md avoid-break" data-page-break="before">
          <h2>4. ESCOPO DE FORNECIMENTO</h2>
          <p class="muted">Nenhum equipamento selecionado nesta proposta.</p>
        </section>`
      : `<section class="block stack-md avoid-break" data-page-break="before">
          <h2>4. ESCOPO DE FORNECIMENTO</h2>
          ${warningMsgEscopo}
          <section class="block stack-md allow-break">${equipItems[0]}</section>
        </section>
        ${equipItems.slice(1).map(item => `<section class="block stack-md allow-break">${item}</section>`).join('')}`;

    // Documento corporativo/jurídico: inserir bloco 5.* exatamente como fornecido.
    // Observação: a TABELA DE PREÇOS é gerada a partir dos itens selecionados na proposta (cadastro de produtos).
    const tabelaPrecosRows = (itens || []).map((it, idx) => {
      const itemRef = esc(it.numero_item != null ? it.numero_item : (idx + 1));
      const nome = esc(it.produto_nome || it.descricao || `Item ${idx + 1}`);
      const descritivoTecRaw = it.descritivo_tecnico || it.descricao_tecnica || it.descricao_resumida || it.produto_descricao || it.produto_descritivo || '';
      const descritivoTec = esc(String(descritivoTecRaw || '').trim());
      const descHtml = descritivoTec
        ? `${nome}<div class="tech-desc">${descritivoTec}</div>`
        : `${nome}`;
      const qtd = esc(Number(it.quantidade) || 1);
      const vUnitNum = Number(it.valor_unitario) || Number(it.preco_base) || 0;
      const vTotNum = Number(it.valor_total) || ((Number(it.quantidade) || 1) * vUnitNum);
      return `<tr>
        <td class="col-center">${itemRef}</td>
        <td>${descHtml}</td>
        <td class="col-right">${qtd}</td>
        <td class="col-right">${esc(moedaBRL(vUnitNum))}</td>
        <td class="col-right">${esc(moedaBRL(vTotNum))}</td>
      </tr>`;
    }).join('');

    // Seção 5.23 FIXA (não editável): título + tabela de preços DINÂMICA + FINAME/BNDES + tabelas
    // fiscais. Construída uma vez e injetada nos DOIS caminhos de render (custom/inline e hardcoded),
    // sempre entre a 5.22 e a 5.24. Marcada com data-page-break="before" no elemento raiz (five-23-
    // preco-group) para iniciar em página própria (ver paginateProposalContent).
    const sec523PrecoHtml = `
      <section class="block stack-md avoid-break five-23-preco-group" data-page-break="before">
        <section class="block stack-md allow-break clausula-corpo">
          <h3>5.23 PREÇO, CONDIÇÃO DE PAGAMENTO E IMPOSTOS</h3>
          <p>A CONTRATANTE pagará pelos equipamentos e/ou serviços indicados no ESCOPO DE FORNECIMENTO desta proposta comercial, os valores informados na tabela de preços a seguir.</p>
        </section>

        <section class="block stack-md allow-break">
          <div class="table-caption">Tabela de Preços</div>
          <table class="table">
            <thead>
              <tr>
                <th class="col-center">ITEM</th>
                <th>DESCRIÇÃO</th>
                <th class="col-right">QUANT.</th>
                <th class="col-right">PREÇO UNITÁRIO</th>
                <th class="col-right">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              ${tabelaPrecosRows || `<tr><td colspan="5" class="muted">Nenhum item cadastrado.</td></tr>`}
              <tr>
                <td class="col-center" colspan="4"><strong>TOTAL DA PROPOSTA</strong></td>
                <td class="col-right"><strong>${esc(moedaBRL(totais.total))}</strong></td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="block stack-md allow-break">
          <p><strong>CONDIÇÃO DE PAGAMENTO:</strong></p>
          <p style="text-indent: 12.5mm; line-height: 26px;"><strong>Primeira Parcela/Entrada:</strong> – 40% (quarenta por cento) sobre o valor total da proposta, pago na assinatura da presente proposta técnica comercial, via transferência bancaria.</p>
          <p style="text-indent: 12.5mm; line-height: 26px;"><strong>Segunda Parcela/Liberação:</strong> – 30% (trinta por cento) sobre o valor total da proposta, pago no comunicado de liberação do pedido, via transferência bancaria.</p>
          <p style="text-indent: 12.5mm; line-height: 26px;"><strong>Terceira Parcela/Saldo:</strong> – 30% (trinta por cento) sobre o valor total da proposta, será pago via boleto bancário, com prazo para pagamento de 28 DDL, contados do comunicado de liberação do pedido.</p>
          <p style="text-indent: 12.5mm; line-height: 26px;">Em caso de inadimplemento por parte da CONTRATANTE quanto ao pagamento dos serviços contratados, deverá incidir sobre o valor do contrato multa pecuniária de 2% (dois por cento), juros de mora de 1% (um por cento) ao mês e correção monetária até a data do efetivo pagamento.</p>
        </section>
      </section>

      <section class="block stack-md allow-break finame-compact">
          <div class="table-caption">Tabela Ref. FINAME / Ref. Cartão BNDES</div>
          <table class="table table-dark">
            <thead>
              <tr>
                <th class="col-center">ITEM</th>
                <th>EQUIPAMENTO</th>
                <th class="col-center">REF. FINAME</th>
                <th class="col-center">REF. CARTÃO BNDES</th>
              </tr>
            </thead>
            <tbody>
              <tr><td class="col-center">1</td><td>Masseira Bimix</td><td class="col-center">04051088</td><td class="col-center">*********</td></tr>
              <tr><td class="col-center">2</td><td>Masseira Trimix</td><td class="col-center">03452459</td><td class="col-center">MASSEIRA</td></tr>
              <tr><td class="col-center">3</td><td>Masseira Helicoidal Vertical</td><td class="col-center">03451446</td><td class="col-center">MASSEIRA VH</td></tr>
              <tr><td class="col-center">4</td><td>Tanque Dispersor</td><td class="col-center">03452683</td><td class="col-center">TANQUE DISP</td></tr>
              <tr><td class="col-center">5</td><td>Tanque de Completagem/Agitador</td><td class="col-center">04056078</td><td class="col-center">*********</td></tr>
              <tr><td class="col-center">6</td><td>Moinho Vertical</td><td class="col-center">03464319</td><td class="col-center">MOINHO VERTI</td></tr>
              <tr><td class="col-center">7</td><td>Dispersor Hidropneumático</td><td class="col-center">04051259</td><td class="col-center">DISPERSOR HI</td></tr>
              <tr><td class="col-center">8</td><td>Tachos</td><td class="col-center">03465385</td><td class="col-center">TACHO/TANQU</td></tr>
              <tr><td class="col-center">9</td><td>Tanque de Armazenamento</td><td class="col-center">03452690</td><td class="col-center">TANQUE ARMAZ</td></tr>
              <tr><td class="col-center">10</td><td>Moinho de Laboratório</td><td class="col-center">04056053</td><td class="col-center">*********</td></tr>
              <tr><td class="col-center">11</td><td>Dispersor de Laboratório</td><td class="col-center">04056231</td><td class="col-center">*********</td></tr>
              <tr><td class="col-center">12</td><td>Envasadora</td><td class="col-center">03451453</td><td class="col-center">ENVASADORA</td></tr>
            </tbody>
          </table>
      </section>

      <section class="block stack-md allow-break">
          <p><strong>IMPOSTOS E CLASSIFICAÇÕES FISCAIS</strong></p>
          <div class="table-caption">Tabela de Classificação Fiscal</div>
          <table class="table">
          <thead>
            <tr>
              <th class="col-center">NCM</th>
              <th>IDENTIFICAÇÃO EQUIPAMENTOS MOINHO YPIRANGA</th>
            </tr>
          </thead>
          <tbody>
            <tr><td class="col-center">8474.39.00</td><td>Misturadores, masseiras, dispersores, moinhos, agitadores, hélices e impelidores</td></tr>
            <tr><td class="col-center">7309.00.90</td><td>Tachos, moegas, silos, tanques e demais reservatórios metálicos.</td></tr>
            <tr><td class="col-center">Nota</td><td>Para outros produtos, a classificação fiscal deverá ser consultada caso a caso.</td></tr>
          </tbody>
        </table>

        <div class="table-caption">Tabela de Impostos e Alíquotas</div>
        <table class="table">
          <thead>
            <tr>
              <th class="col-center">NCM</th>
              <th class="col-center">REGIÃO 1</th>
              <th class="col-center">REGIÃO 2</th>
              <th class="col-center">REGIÃO 3</th>
              <th class="col-center">IPI</th>
              <th class="col-center">PIS</th>
              <th class="col-center">COFINS</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="col-center">8474.39.00</td>
              <td class="col-center">18,00%</td>
              <td class="col-center">12,00%</td>
              <td class="col-center">7,00%</td>
              <td class="col-center">0%</td>
              <td class="col-center">0,65%</td>
              <td class="col-center">3,00%</td>
            </tr>
            <tr>
              <td class="col-center">7309.00.90</td>
              <td class="col-center">12,00%</td>
              <td class="col-center">12,00%</td>
              <td class="col-center">7,00%</td>
              <td class="col-center">0%</td>
              <td class="col-center">0,65%</td>
              <td class="col-center">3,00%</td>
            </tr>
          </tbody>
          </table>
          <div class="stack-sm">
            <p>Texto complementar abaixo das tabelas:</p>
            <ul>
              <li>Região 1: São Paulo (SP)</li>
              <li>Região 2: Minas Gerais (MG), Paraná (PR), Rio de Janeiro (RJ), Rio Grande do Sul (RS) e Santa Catarina (SC)</li>
              <li>Região 3: Acre (AC), Alagoas (AL), Amapá (AP), Amazonas (AM), Bahia (BA), Ceará (CE), Distrito Federal (DF), Espírito Santo (ES), Goiás (GO), Maranhã (MA), Mato Grosso (MT), Mato Grosso do Sul (MS), Pará (PA), Paraíba (PB), Pernambuco (PE), Piauí (PI), Rio Grande do Norte (RN), Rondônia (RO), Roraima (RR), Sergipe (SE) e Tocantins (TO).</li>
              <li>Nota: Redução tributária aplicada nos produtos classificados com NCM 8474.39.00, Inciso II, Artigo 12, Anexo II do RICMS/SP.</li>
              <li>Para outros produtos, os impostos e alíquotas deverão ser consultados caso a caso.</li>
            </ul>
          </div>
      </section>`;

    // Campos preenchidos À MÃO depois de impresso (data e assinatura/carimbo do cliente).
    // Ficam FORA do conteúdo da cláusula 5.24 de propósito: a 5.24 é editável pelo usuário no
    // preview, e se estes campos morassem dentro dela uma edição poderia apagá-los.
    // O traço da assinatura é um ::after com flex:1 — assim ele vai da label até a margem
    // direita sozinho, sem depender de contar underscores (que desalinham se a fonte mudar).
    const camposAssinaturaManualHtml = `
      <p class="campo-manual">Data da assinatura: <span class="campo-branco campo-branco-dia"></span>/<span class="campo-branco campo-branco-mes"></span>/<span class="campo-branco campo-branco-ano"></span></p>
      <p class="campo-manual campo-manual-linha">Assinatura e carimbo da empresa CONTRATANTE:</p>`;

    const clausulasSection = (() => {
      if (templateConfig && Array.isArray(templateConfig.clausulas_custom) && templateConfig.clausulas_custom.length > 0) {
        const assinaturasHtml = `
          <div class="signature-grid avoid-break">
            <div class="sig-col">
              <div class="sig-name">Junior Machado</div>
              <div class="sig-role">Diretor Comercial</div>
              <div class="sig-line">T +55 (11) 4513-9570</div>
              <div class="sig-line">M +55 (11) 9.9351-5046</div>
              <div class="sig-email">junior@gmp.ind.br</div>
            </div>
            <div class="sig-col">
              <div class="sig-name">Bruno Machado</div>
              <div class="sig-role">Gerente Comercial</div>
              <div class="sig-line">T +55 (11) 4513-9570</div>
              <div class="sig-line">M +55 (11) 9.9351-5543</div>
              <div class="sig-email">bruno@gmp.ind.br</div>
            </div>
            <div class="sig-col">
              <div class="sig-name">Alex Junior</div>
              <div class="sig-role">Vendas Técnica</div>
              <div class="sig-line">T +55 (11) 4513-9570</div>
              <div class="sig-line">M +55 (11) 9.8908-5127</div>
              <div class="sig-email">alexjunior@gmp.ind.br</div>
            </div>
            <div class="sig-col">
              <div class="sig-name">Matheus Honrado</div>
              <div class="sig-role">Depto. Comercial</div>
              <div class="sig-line">T +55 (11) 4513-9570</div>
              <div class="sig-line">M +55 (11) 9.3386-9232</div>
              <div class="sig-email">matheus@gmp.ind.br</div>
            </div>
          </div>`;
        const clausulaKey = (c, idx) => (c.id != null ? String(c.id) : `default-${c.numero || idx}`);
        const renderClausulaCustom = (c, idx) => {
          const raw = c.conteudo || '';
          // If content has no HTML tags, treat as plain text: wrap each paragraph in <p>
          const html = /<[a-z][\s\S]*>/i.test(raw)
            ? raw
            : raw.split(/\n{2,}/).map(p => `<p>${esc(p.trim())}</p>`).join('') || '<p></p>';
          return `<section class="block stack-md allow-break" data-clausula-key="${esc(clausulaKey(c, idx))}">
            <h3 data-clausula-campo="titulo">${esc(c.numero ? `${c.numero} ${c.titulo}` : c.titulo)}</h3>
            <div class="stack-sm" data-clausula-campo="conteudo">${html}</div>
          </section>`;
        };
        const [primeiraClausula, ...demaisClausulas] = templateConfig.clausulas_custom;
        // As cláusulas >= 5.24 (a CONSIDERAÇÃO FINAL e qualquer outra além dela) são
        // editáveis (vêm de clausulas_custom), mas devem ser emitidas DEPOIS da seção
        // fixa 5.23 (preço/FINAME/fiscais), que ocupa o slot 23.
        // IMPORTANTE: cláusulas persistidas no banco NÃO têm campo `numero` (a tabela
        // proposta_clausulas não tem essa coluna) — o número vive no PREFIXO do título
        // ("5.24 CONSIDERAÇÃO FINAL"). Um predicado que só olhe c.numero funciona nos
        // testes (defaults têm numero) mas falha com dados reais, fazendo a 5.24
        // renderizar no meio da lista e "sumir" do fim do documento (bug da proposta 288).
        const subNumeroDe = (c) => {
          const numero = (c && c.numero != null && String(c.numero).trim()) ? String(c.numero).trim() : null;
          const m = /^\s*(\d+)\.(\d+)/.exec(numero || String(c && c.titulo || ''));
          return m ? parseInt(m[2], 10) : NaN;
        };
        const demaisSem524 = demaisClausulas.filter((c) => !(subNumeroDe(c) >= 24));
        const clausulasPos523 = demaisClausulas.filter((c) => subNumeroDe(c) >= 24);
        // A 5.24 (e o que vier depois dela) ocupa uma PÁGINA PRÓPRIA, dividida em três faixas:
        // texto no topo, campos de preenchimento manual no meio e assinaturas junto ao rodapé.
        // Por isso as três partes viram UM único bloco (.pagina-assinatura): o paginador
        // posiciona bloco a bloco, então só mantendo-as juntas dá para distribuí-las na altura
        // da página. O data-page-break fica no bloco externo — o paginador só lê o atributo em
        // filhos DIRETOS de #proposalSource.
        const clausula524Html = clausulasPos523
          .map((c) => renderClausulaCustom(c, demaisClausulas.indexOf(c) + 1))
          .join('');
        // IMPORTANTE: apenas o título + a 1ª cláusula ficam dentro do grupo "avoid-break"
        // (para o título "5. CONDIÇÕES GERAIS" não ficar órfão no fim da página). As demais
        // cláusulas são seções IRMÃS com "allow-break", igual ao layout das cláusulas padrão.
        // Se todas ficassem dentro de um único bloco "avoid-break", a paginação trataria o
        // conjunto como um elemento gigante indivisível e o "overflow: hidden" da página
        // cortaria as cláusulas no meio (ex.: parava na 5.4).
        return `
          <section class="block stack-md avoid-break five-intro-group" data-page-break="before">
            <h2>5. CONDIÇÕES GERAIS DE FORNECIMENTO</h2>
            ${primeiraClausula ? renderClausulaCustom(primeiraClausula, 0) : ''}
          </section>
          ${demaisSem524.map((c, i) => renderClausulaCustom(c, i + 1)).join('')}
          ${sec523PrecoHtml}
          <section class="block avoid-break pagina-assinatura" data-page-break="before">
            <div class="assinatura-topo">${clausula524Html}</div>
            <div class="assinatura-meio">${camposAssinaturaManualHtml}</div>
            <div class="assinatura-rodape">
              <p>Atenciosamente,</p>
              ${assinaturasHtml}
            </div>
          </section>`;
      }
      return null;
    })();

    const blocksHtml = `
      <section class="block stack-md avoid-break" data-page-break-after="true">
        <p class="cover-strip-titulo" style="text-align: center;">Tabela com Dados Cadastrais da <strong>CONTRATADA</strong></p>
        ${dadosContratadaB64
          ? `<img src="${dadosContratadaB64}" alt="Tabela com Dados Cadastrais da CONTRATADA"${dadosContratadaDim} style="max-width:100%;height:auto;display:block; font-weight: bold;" />`
          : `<p class="muted">Tabela de dados cadastrais não disponível.</p>`}
      </section>

      <section class="block stack-md allow-break clausula-corpo">
        <h2>1. OBJETIVO DA PROPOSTA</h2>
        <p>Apresentar condições técnicas e comerciais, para fornecimento de equipamentos e/ou serviços industriais.</p>
      </section>

      <section class="block stack-md allow-break clausula-corpo">
        <h2>2. ELABORAÇÃO DA PROPOSTA</h2>
        <p>A proposta apresentada a seguir, foi elaborada atendendo às solicitações e especificações informadas pelo CONTRATANTE, através de reunião, ligação e/ou e-mail.</p>
        <p>Deve-se atentar, que os itens oferecidos estão descriminados e especificados nesta proposta técnica comercial. Os parâmetros e dimensionamentos dos equipamentos e garantias relacionadas nesta proposta, estão baseadas nas condições e características do produtos, disponibilizadas pelo CONTRATANTE, conforme dados resumidos apresentados no decorrer desta proposta.</p>
        <p>Qualquer alteração, inclusão ou exclusão no escopo ofertado, deve ser solicitado, para revisão deste documento.</p>
      </section>

      <section class="block stack-md allow-break">
        <h2>3. OFERTA</h2>
        <table class="table">
          <thead>
            <tr>
              <th class="col-center">ITEM</th>
              <th class="col-center">QUANT.</th>
              <th>DESCRIÇÃO</th>
            </tr>
          </thead>
          <tbody>
            ${ofertaRows || `<tr><td colspan="3" class="muted">Nenhum item selecionado.</td></tr>`}
          </tbody>
        </table>
      </section>

      ${equipDescritivoHtml}

      ${clausulasSection !== null ? clausulasSection : `<section class="block stack-md avoid-break five-intro-group" data-page-break="before">
        <h2>5. CONDIÇÕES GERAIS DE FORNECIMENTO</h2>

        <section class="block stack-md allow-break clausula-corpo">
          <h3>5.1 PRAZO DE ENTREGA</h3>
          <p>O prazo para entrega dos itens apresentados nesta proposta comercial, é dentro de 90 dias úteis, a partir da data da aprovação formal do pedido (via e-mail) e compensação do pagamento referente a entrada.</p>
          <p>O prazo pode prolongar, em casos de atraso no envio de informações e aprovação das documentações, por parte da CONTRATANTE.</p>
          <p>Caso ocorra atraso na entrega dos equipamentos por motivos cuja responsabilidade não possa ser atribuída à CONTRATADA, forças maiores como fenômenos naturais, atos governamentais, acidentes ou outros motivos abrangidos pelo artigo 1058 do Código Civil, que a impossibilite de obter os insumos necessários à fabricação, impossibilitando está de cumprir o prazo de entrega, este será prorrogado pelo período necessário para a normalização da produção.</p>
        </section>

        <section class="block stack-md allow-break clausula-corpo">
          <h3>5.2 TRANSPORTE E EMBALAGEM</h3>
          <p>A CONTRATADA deverá promover a liberação do(s) EQUIPAMENTO(S), na modalidade EXW (Ex Works), conforme previsto na relação de ICOTERMS editada pela Câmara Internacional de Comércio, diretamente na fábrica, estabelecida à Av. Ângelo Demarchi, nº 130, Batistini, São Bernardo do Campo, São Paulo – Brasil, CEP 09844-100.</p>
          <p>O(s) EQUIPAMENTO(S) serão embalado(s) com plástico bolha.</p>
          <p>Caso a CONTRATANTE necessite de outro tipo de embalagem, a mesma deverá comunicar a CONTRATADA previamente via e-mail, para que ela possa atualizar a proposta com o custo e novo modelo da embalagem.</p>
        </section>

        <section class="block stack-md allow-break clausula-corpo">
          <h3>5.3 LIBERAÇÃO DO PEDIDO</h3>
          <p>A formalização da entrega se dará, através do comunicado de liberação do pedido, o qual será enviado via e-mail, endereçado para o contato que consta nesta proposta técnica comercial e/ou via carta registrada.</p>
        </section>
      </section>

      <section class="block stack-md allow-break clausula-corpo">
        <h3>5.4 GARANTIA</h3>
        <p>A CONTRATADA garante aos equipamentos, devidamente previstos nesta proposta técnica comercial, contra defeitos de fabricação, pelo prazo de 12 (doze) meses, a contar da assinatura do "Termo de Entrega e Startup", se limitando a 14 (quatorze) meses, a contar da emissão de nota fiscal de venda e/ou remessa.</p>
        <p>A CONTRATADA se obriga, sob sua conta e risco, durante o prazo de vigência da garantia, a reparar, quando apresentarem defeitos ou falhas provenientes de projeto, desempenho ou qualidade dos serviços ora prestados, sem qualquer custo para a CONTRATANTE.</p>
        <p>A CONTRATATADA deverá, para efeitos do disposto "Prazo de Garantia" responder aos chamados técnicos dentro de 05 (cinco) dias úteis, dentro do horário comercial e disponibilidade da agenda dos técnicos, desde que a CONTRATANTE, solicite, preencha e retorne o documento "ABERTURA DE CHAMADO" por escrito para a CONTRATADA.</p>
        <p>A CONTRATANTE deverá solicitar e realizar o chamado técnico através de correio eletrônico, endereçado para: alexjunior@gmp.ind.br, matheus@gmp.ind.br, bruno@gmp.ind.br e junior@gmp.ind.br.</p>
        <p>Não estão cobertos pela garantia contratual citada acima, defeitos gerados pela má utilização, utilização de sobrecarga, utilização do equipamento em aplicações diferentes do qual foi ofertado e dimensionado, tensão errada ou acidentes pertinentes de choque, batidas e outros que venham danificar ou quebrar, utilização de matéria inadequada, modificação e/ou alteração das suas características originais, consertos ou reformar feitas por empresa diversa da CONTRATADA.</p>
        <p>Não estão cobertos pela garantia contratual citada acima, desgaste naturais dos equipamentos e peças em função de sua utilização e contato direto com o produto, tais como rolamentos, buchas, hélices, etc.</p>
        <p>Não estão cobertos pela garantia contratual citada acima, despesas relacionadas com translado, estadia e alimentação do(s) técnico(s) e despesas com transportes, seguros e movimentações de peças e equipamentos.</p>
        <p>A CONTRATANTE não se beneficiará da garantia contratual, quando os serviços forem acometidos por eventos de caso fortuito, força maior, uso incorreto, falta de manutenção, montagem e startup dos equipamentos sem supervisão da CONTRATADA.</p>
      </section>

      <section class="block stack-md allow-break clausula-corpo">
        <h3>5.5 SUPERVISÃO E COMISSIONAMENTO DE STARTUP</h3>
        <p>A CONTRATANTE deverá solicitar para a CONTRATADA, o agendamento da montagem e acompanhamento de startup dos equipamentos, os quais serão agendados de acordo com a disponibilidade da agenda dos técnicos.</p>
        <p>Para agendamento da montagem, a CONTRATANTE deverá solicitar, quando os equipamentos já estiverem em sua sede.</p>
        <p>Para agendamento de startup, a CONTRATANTE deverá solicitar, após finalizar e deixar conectado e instalado, toda a infraestrutura de alimentação dos equipamentos, como elétrica, hidráulica, pneumática, e outras que se fizerem necessárias.</p>
        <p>As operações de translado dos técnicos, montagem e startup dos equipamentos, deverão ocorrer de segunda-feira a sexta-feira, exceto feriados, dentro do horário comercial (das 8h ás 12h e das 13h ás 17h).</p>
        <p>Operações realizadas após o horário comercial, feriados e finais de semana, quando não acordadas previamente e formalmente via e-mail, estão sujeitas a cobranças adicionais, da CONTRATADA para a CONTRATANTE, conforme tabela "hora-homem" da CONTRATADA.</p>
        <p>Todas e quaisquer áreas, instalações, equipamentos e ferramentas que porventura forem cedidos a CONTRATADA pela CONTRATANTE, serão por ela mantidos como se seus fosse, de modo a restituí-los, terminada sua utilização, no estado que os receberá.</p>
        <p>A CONTRATADA deverá manter no local de trabalho, montagem e startup dos equipamentos, somente pessoal especializado e contratado com base na legislação trabalhista brasileira e/ou "terceiros" com contrato de prestação de serviços, ás suas exclusivas expensas e responsabilidade, todo o pessoal necessário, direta ou indiretamente, a execução do objeto do presente instrumento, de acordo com as normas trabalhistas e previdenciárias vigentes, sendo os mesmos de total responsabilidade da CONTRATADA, inclusive encargos sociais e exames médicos.</p>
        <p>A CONTRATANTE será responsável pelas despesas de translado (rodoviário e aéreo), estadia e alimentação (café da manhã, almoço e janta) dos técnicos de montagem e startup.</p>
      </section>

      <section class="block stack-md allow-break">
        <p>Para casos de operações de montagem e startup, fora do estado em que se encontra a sede da CONTRATADA, o translado aplicado é o aéreo, realizado por aeronaves, como avião, e as despesas de deslocamento dos técnicos entre a sede da CONTRATADA e CONTRATANTE até o aeroporto, e vice-versa, compõem as despesas de translado que é de responsabilidade da CONTRATANTE.</p>
        <p>A CONTRATANTE será responsável pelas despesas de transporte (ida e volta) das ferramentas dos técnicos da CONTRATADA, e também, quando necessário, das despesas relacionadas com locação de andaimes, plataformas elevatória, pórticos e serviços de movimentações, como munck, guindaste, empilhadeira e outros que se fizerem necessárias.</p>
        <p>Quando aplicável, a CONTRATANTE será responsável pelo retorno de materiais utilizados na execução dos trabalhos, como vigas, tubos, chapas, e outros, para sede da CONTRATADA.</p>
        <p>Em casos que as operações de montagem acontecerá em áreas classificadas com risco de explosão e/ou espaço confinado, a CONTRATANTE ficará responsável por locar e disponibilizar para a CONTRATADA, os equipamentos de segurança, como tripé, detector de gases, exaustor/insuflador, kit de polias, conjunto de ar mandado, e outros que se fizerem necessários.</p>
        <p>Quando aplicável, a CONTRATANTE será responsável pelo descarte dos resíduos de materiais da obra.</p>
        <p>A CONTRATANTE deverá indicar e manter no local, o responsável pelo acompanhamento, liberação e aprovação do "Termo de Entrega e Startup".</p>
        <p>A CONTRATANTE deverá disponibilizar:</p>
        <ul>
          <li>Local seguro para armazenar as ferramentas dos técnicos e materiais necessários para execução dos trabalhos;</li>
          <li>Local limpo e arejado, para vestiários com chuveiro;</li>
          <li>Água potável para os técnicos de montagem e startup;</li>
          <li>Disponibilizar ponto de energia trifásica e bifásica, a 10 (dez) metros de distância do local que será realizada as operações de montagem.</li>
        </ul>
        <p>A CONTRATANTE assim também como a CONTRATADA, deverão cumprir e fazer cumprir, o bom andamento das operações de montagem e startup.</p>
        <p>Se houver uma demora de mais de duas horas, na espera da liberação dos trabalhos pelos técnicos de segurança da empresa CONTRATANTE, essas horas começam a ser cobradas, conforme função e valor da tabela "hora-homem", e os prazos começam a ser alterados de acordo com o tempo atrasado.</p>
        <p>Um atraso de até três horas, resulta no reagendamento dos trabalhos para o próximo dia útil, e as horas referentes ao dia de trabalho da equipe, serão cobradas da CONTRATANTE pela CONTRATADA, com base na tabela "hora-homem".</p>
        <p>Concluídos as montagens e startup dos equipamentos, será emitido um relatório final de aprovação, que será devidamente assinado por dois funcionários de cada parte contratante, para todos os fins legais, sobretudo, contagem do início da Garantia dos equipamentos ora fornecidos.</p>
        <p>Caso os testes de desempenho e funcionamento não sejam satisfatórios, a CONTRATADA procederá aos reajustes sem qualquer custo adicional à CONTRATANTE, e uma vez concluídos os ajustes/reajustes serão imediatamente realizados nos novos testes, não se aplicando para tanto aos itens e serviços que ora não são de fornecimento da CONTRATADA.</p>
      </section>

      <section class="block stack-md allow-break">
        <div class="table-caption">Tabela Hora-Homem</div>
        <table class="table">
          <thead>
            <tr>
              <th>PROFISSIONAL</th>
              <th class="col-right">VALOR HORA NORMAL</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Ajudante no geral</td><td class="col-right">R$ 120,00</td></tr>
            <tr><td>Caldeireiro, Mecânico, Encanador, Eletricista, Soldador e Pintor</td><td class="col-right">R$ 200,00</td></tr>
            <tr><td>Projetistas, Técnico de Automação e Técnico no geral</td><td class="col-right">R$ 280,00</td></tr>
            <tr><td>Engenheiro e Inspetores no geral</td><td class="col-right">R$ 350,00</td></tr>
          </tbody>
        </table>
        <div class="stack-sm">
          <p>Observações abaixo da tabela:</p>
          <ul>
            <li>Hora Normal: De segunda-feira a sexta-feira, exceto feriados, dentro do horário comercial.</li>
            <li>Hora Extra (50%): De segunda-feira a sexta-feira, exceto feriados, após ás 17h e aos sábados.</li>
            <li>Hora Extra (100%): Feriados e Domingo.</li>
            <li>Adicional Noturno (35%): Todos os dias, das 22h ás 5h.</li>
            <li>Nota: Valor da hora trabalhada e de translado, é o mesmo.</li>
          </ul>
        </div>
      </section>

      <section class="block stack-md avoid-break five-6-7-group">
        <section class="block stack-md allow-break clausula-corpo">
          <h3>5.6 OBRIGAÇÕES DA CONTRATANTE</h3>
          <p>A CONTRATANTE deverá disponibilizar e fornecer informações e documentos, pertinentes ao produto processado e local de instalação dos equipamentos.</p>
          <p>A CONTRATANTE deverá analisar, conferir e aprovar documentos e projetos junto a CONTRATADA, dentro do prazo de 5 (cinco) dias úteis, contados da data de envio do documento e/ou projeto.</p>
          <p>A CONTRATANTE deverá efetuar o pagamento na forma e condições estabelecidas no item "PREÇO E CONDIÇÃO DE PAGAMENTO".</p>
          <p>Reembolsar a CONTRATADA, de eventuais custos adicionais, originados por ato de responsabilidade da CONTRATANTE.</p>
        </section>

        <section class="block stack-md allow-break clausula-corpo">
          <h3>5.7 OBRIGAÇÕES DA CONTRATADA</h3>
          <p>A CONTRATADA deverá oferecer mão-de-obra especializada e cumprir todos os deveres e obrigações dispostos no ESCOPO DE FORNECIMENTO e CONDIÇÕES GERAIS desta proposta técnica comercial.</p>
          <p>É dever da CONTRATADA proibir o uso do nome ou logotipo da CONTRATANTE, devendo proibir seu pessoal de utilizar o logo da CONTRATANTE em suas vestimentas, o que inclui o uso de bonés, cordões de porte de crachá, camisetas e quaisquer outras peças do vestuário ou acessórios.</p>
          <p>Da mesma forma, a CONTRATANTE se compromete a orientar seus colaboradores no intuito de não cederem quaisquer tipos de peças, trajes e/ou uniforme que seja, ao pessoal da CONTRATADA.</p>
          <p>Os serviços especificados serão executados pela CONTRATADA, através de seus empregados, os quais nenhuma relação de emprego ou de trabalho terão com a CONTRATANTE, sendo de responsabilidade exclusiva da CONTRATADA todos os encargos trabalhistas, previdenciários e tributários, enunciativamente assim indicados: salários, vantagens adicionais de qualquer espécie, inclusive de insalubridade/periculosidade eventualmente devido, seguro de acidente do trabalho, Previdência Social, FGTS, indenizações e reparações trabalhistas, taxas e impostos, bem como quaisquer outros encargos relativos a serviços e empregados.</p>
          <p>É de inteira responsabilidade da CONTRATADA o fornecimento de todas as ferramentas e maquinários necessários à fabricação dos equipamentos, além dos Equipamentos de Proteção Individual (EPI), sendo responsável ainda pelo treinamento e fiscalização do efetivo uso dos EPI's, respondendo exclusivamente em caso de eventual acidente de trabalho com seus prepostos e funcionários.</p>
        </section>
      </section>

      <section class="block stack-md avoid-break five-8-ate-14-group">
        <section class="block stack-md allow-break clausula-corpo">
          <h3>5.8 ALTERAÇÃO DE PEDIDO</h3>
          <p>Caso a CONTRATANTE solicite alterações no escopo de fornecimento, a CONTRATADA apresentará a CONTRATANTE, os impactos, valores e prazos para realização da alteração.</p>
          <p>A CONTRATANTE deverá responder a CONTRATADA, com a aprovação ou declínio da alteração, dentro de 5 (cinco) dias úteis, contados da apresentação da proposta de alteração da CONTRATADA para a CONTRATANTE.</p>
        </section>

        <section class="block stack-md allow-break clausula-corpo">
          <h3>5.9 DEVOLUÇÃO OU TROCA DE MERCADORIA</h3>
          <p>Não serão aceitas. Apenas em casos excepcionais serão aceitas, se houver prévia autorização da CONTRATADA e a CONTRATANTE arcará com todas as despesas envolvidas.</p>
        </section>

        <section class="block stack-md allow-break clausula-corpo">
          <h3>5.10 CANCELAMENTO DE PEDIDO</h3>
          <p>Não serão aceitas. Visto que os produtos são produzidos sob encomenda e necessitam de horas de engenharia, projeto e desenvolvimento e as peças/serviços oriundas dele atendem exclusivamente ao CONTRATANTE.</p>
        </section>

        <section class="block stack-md allow-break clausula-corpo">
          <h3>5.11 ATRASO DE FATURAMENTO</h3>
          <p>Ocorrendo atraso de faturamento por razões de responsabilidade do CONTRATANTE, como falta de documentos para aprovação do crédito, identificação de transportadora, não pagamento de antecipações/parcelas constantes nesta proposta técnica comercial, atraso de inspeção, diligenciamento e liberação de financiamento, a CONTRATADA cobrará o preço da mercadoria e/ou serviço, com base na lista de preço vigente na data do faturamento.</p>
        </section>
        <section class="block stack-md allow-break clausula-corpo">
          <h3>5.12 TAXA DE ARMAZENAGEM</h3>
          <p>Será cobrada uma taxa de armazenagem de 1% ao mês do valor do fornecimento, caso as mercadorias não sejam retiradas em até 30 dias após a data de faturamento, calculada pro-rata diem a partir do 31º dia, limitada a 10% do valor do faturamento.</p>
        </section>

        <section class="block stack-md allow-break clausula-corpo">
          <h3>5.13 DANOS OU PREJUÍZOS</h3>
          <p>A responsabilidade civil da CONTRATADA está limitada ao produto fornecido, não se responsabilizando por danos indiretos ou emergentes, tais como lucros cessantes, perdas de receitas, produtividade ou de dados, reclamações, paralizações, despesas, danos pessoais.</p>
        </section>

        <section class="block stack-md allow-break clausula-corpo">
          <h3>5.14 RESPONSABILIDADE FINANCEIRA</h3>
          <p>A CONTRATANTE poderá optar em proceder o pagamento das parcelas supracitadas através de financiamento junto ao BANCO, porém, desde que respeitados os prazos de pagamento desta proposta técnica comercial e sem qualquer participação da CONTRATADA, junto as instituições financeiras para liberação desses valores.</p>
        </section>
      </section>

      <section class="block stack-md avoid-break five-15-16-17-group">
        <section class="block stack-md allow-break clausula-corpo">
          <h3>5.15 CONSIDERAÇÕES CONSTRUTIVAS</h3>
          <p>Os equipamentos e serviços ora ofertados nesta proposta técnica comercial, são padronizados pela CONTRATADA. Caso a CONTRATANTE tenha preferência ou necessidade que seja utilizado marca ou modelo especifico de qualquer componente ou material, deverá ser comunicado para a CONTRATADA previamente via e-mail, para revisão desta proposta comercial.</p>
          <p>A CONTRATADA se resguarda do direito de utilizar o melhor aproveitamento dos materiais, durante o processo de fabricação e montagem de seus equipamentos, podendo aparecer soldas de complementos de materiais em pontos distintos.</p>
          <p>Caso a CONTRATANTE não concorde com o aproveitamento de material, deverá ser comunicado para a CONTRATADA previamente via e-mail, para revisão desta proposta comercial.</p>
          <p>Fica entendido que todas as informações foram apresentadas ao CONTRATANTE nesta proposta técnica comercial, e foram suficientes para o entendimento e aceite do produto e/ou serviço que será fornecido, desta forma, qualquer informação e/ou característica que não foi apresentada previamente neste documento, seguirá o padrão do projeto e/ou serviço da CONTRATADA.</p>
        </section>

        <section class="block stack-md allow-break clausula-corpo">
          <h3>5.16 VALIDADE DA PROPOSTA</h3>
          <p>Esta proposta técnica comercial é válida por 15 (quinze) dias corridos, contados da data de emissão, informada na página inicial (capa).</p>
        </section>

        <section class="block stack-md allow-break clausula-corpo">
          <h3>5.17 REAJUSTE DE PREÇO</h3>
          <p>Havendo alterações na legislação tributária vigente na época, a CONTRATADA se resguarda ao direito de atualizar os preços apresentados, de acordo com a nova tributação, com prévia aprovação do CONTRATANTE.</p>
          <p>Para vendas fora do território nacional (BRASIL), os preços apresentados nesta proposta técnica comercial, poderão ser reajustado pela taxa do Dólar Americano, valor comercial de venda, até a data do faturamento, utilizando como taxa base USD 1,00 = VALOR DA COTAÇÃO NA DATA DA PROPOSTA.</p>
        </section>
      </section>

      <section class="block stack-md avoid-break five-18-19-group">
      <section class="block stack-md allow-break clausula-corpo">
        <h3>5.18 DOCUMENTAÇÃO PARTE DO ESCOPO</h3>
        <p>Os documentos abaixo relacionados, serão fornecidos em arquivos, formatos e cronograma padrão da CONTRATATADA. Caso a CONTRATANTE necessite de documentos não relacionados abaixo ou padrões específicos, deverá ser comunicado para a CONTRATADA previamente via e-mail, para revisão desta proposta.</p>
        <ul>
          <li>Nota fiscal;</li>
          <li>Manual do equipamento;</li>
          <li>Desenho com as dimensões gerais do equipamento;</li>
        </ul>
        <p>Os documentos entregues a CONTRATANTE pela CONTRATADA, não poderão ser reproduzidos, comercializados e cedidos a terceiros, sem o prévio e expresso consentimento da CONTRATADA, e permanecem a sua exclusiva propriedade industrial.</p>
      </section>

      <section class="block stack-md allow-break clausula-corpo">
        <h3>5.19 EXTINÇÃO DO CONTRATO</h3>
        <p>O presente contrato estará imediatamente extinto entre as PARTES, em decorrência de causas supervenientes à sua celebração, sem nenhum ônus a qualquer das Partes e independentemente de qualquer notificação ou interpelação judicial ou extrajudicial nas seguintes hipóteses:</p>
        <div class="list-num">
          <p>1) Decretação de falência da CONTRATADA, sem prejuízo da obrigação de indenizar.</p>
          <p>2) Caso fortuito ou força maior: O evento proveniente de caso fortuito ou força maior não poderá perdurar por mais de 30 (trinta) dias corridos, contados do evento inesperado e inevitável.</p>
          <p>3) Descumprimento do contrato: Em caso de quaisquer infrações contratuais constatadas, a Parte infratora será notificada, por escrito, para, no prazo de até 05 (cinco) dias úteis sanar o problema ou a falta notificada pela Parte inocente.</p>
          <p>3.1) Caso a Parte infratora não solucione o problema ou a falta notificada no prazo assinalado nesta cláusula, o contrato será considerado, automática e totalmente, descumprido, e, consequentemente, resolvido, independentemente de qualquer interpelação judicial ou extrajudicial.</p>
          <p>4) Distrato: As partes poderão, a qualquer tempo, mediante comunicação escrita enviada com, no mínimo, 30 (trinta) dias de antecedência, extinguir o presente contrato sem aplicação de qualquer ônus, desde que esse distrato seja de comum acordo.</p>
        </div>
      </section>
      </section>

      <section class="block stack-md avoid-break five-20-21-group">
      <section class="block stack-md allow-break clausula-corpo">
        <h3>5.20 DISPOSIÇÕES ADICIONAIS</h3>
        <p><strong>MODIFICAÇÃO DO CONTRATO:</strong> Toda e qualquer obrigação não mencionada no presente instrumento de contrato, bem como toda e qualquer alteração do ora pactuado, somente surtirá efeitos entre as Partes, quando realizada, por escrito, na forma de termo de aditivo ou alteração contratual.</p>
        <p><strong>TOLERÂNCIA:</strong> O cumprimento de modo diverso de quaisquer cláusulas deste ajuste caracterizará mera liberalidade da Parte tolerante, e, por conseguinte, não implicará em novação, perdão, suspensão, interrupção, renúncia, extinção, direito adquirido e/ou modificação do CONTRATO.</p>
        <p><strong>SUFICIÊNCIA DO CONTRATO:</strong> Ficam expressamente revogados todos e quaisquer pactos, ajustes, cláusulas e condições estabelecidas entre as partes na fase de negociação deste contrato. Ocorrendo divergência entre o avençado neste ajuste e eventuais anexos ou pedidos, prevalecerão as disposições deste contrato e/ou as de seus eventuais aditivos e/ou alterações.</p>
        <p><strong>LEITURA DAS CLÁUSULAS:</strong> A CONTRATANTE e a CONTRATADA declaram como declarado têm, ter lido e entendido todas as cláusulas deste instrumento contratual, não restando ou persistindo quaisquer dúvidas acerca do objeto contratado.</p>
        <p><strong>SIGILO:</strong> As PARTES se comprometem a manter em sigilo todos e quaisquer documentos, informações e dados técnicos de propriedade e interesse das mesmas, suscetíveis ou não de proteção legal, que tenham sido obtidos por qualquer meio, direta ou indiretamente da CONTRATANTE, através de seus prepostos, terceirizados ou subcontratos. Todos os documentos que por ventura forem entregues à CONTRATADA devem ser considerados como informações confidenciais e permanecem de propriedade exclusiva da CONTRATANTE, valendo as mesmas disposições em relação a CONTRATANTE e CONTRATADA. O dever de sigilo de que trata esta cláusula é contínuo, perene, irretratável e irrevogável, devendo manter-se mesmo após o término do contrato, independentemente do seu adimplemento por qualquer das partes, não sendo admitida em relação a esta obrigação nenhuma tolerância que não seja expressamente firmada e autorizada pelas PARTES.</p>
        <p><strong>DIREITO E USO DE IMAGEM:</strong> Os direitos de divulgação das imagens dos produtos e serviços comercializados, instalados ou meramente desenvolvidos pertencem à CONTRATADA podendo esta divulgá-las em operações de marketing e propaganda como melhor lhe convir, com o intuito de mostrar sua marca e produtos, e nunca se utilizando da marca da CONTRATANTE.</p>
        <p>Na interpretação das disposições contratuais deve-se levar em conta sempre o Princípio da Boa-Fé Objetiva, tanta na fase pré-contratual como em sua formação e execução.</p>
      </section>

      <section class="block stack-md allow-break clausula-corpo">
        <h3>5.21 FORO</h3>
        <p>As partes elegem o Foro da Comarca de São Bernardo do Campo - SP, para qualquer ação, processo ou litígio oriundo da responsabilidade pelos produtos e/ou serviços fornecidos conforme ESCOPO DE FORNECIMENTO deste contrato, com renúncia de qualquer outro por mais especial que seja.</p>
      </section>
      </section>

      <section class="block stack-md allow-break clausula-corpo five-22-separate-page">
        <h3>5.22 EXCLUSO DO FORNECIMENTO</h3>
        <p>Estão exclusos do escopo de fornecimento da CONTRATADA, ficando de responsabilidade da CONTRATANTE, os seguintes itens:</p>
        <div class="list-num">
          <p>1) Transporte e seguro dos equipamentos e suas partes;</p>
          <p>2) Serviços de movimentação, como munck, guindaste, empilhadeira e demais que se fizerem necessários;</p>
          <p>3) Serviços e materiais de instalação, como elétrica, hidráulica, pneumática, civil, alvenaria e demais que se fizerem necessários;</p>
          <p>4) Despesas com translado, estadia e alimentação da equipe de montagem e startup;</p>
          <p>5) Consultoria química, de processo, para obtenção de licenças, e de qualquer outra natureza;</p>
          <p>6) Laudo e certificados de calibração/aferição, como RBC, ISO, e outros que se fizerem necessários.</p>
          <p>7) Equipamentos, periféricos e acessórios, como compressor de ar, exaustores, torre de resfriamento, unidade Chiller, bombas, balanças, envasadoras, válvulas de abastecimento, sistema de exaustão, tubulações, automação de sólidos e líquidos, prolongadores de envase, células de cargas, plataformas, estrutura metálica, e outros que se fizerem necessários;</p>
          <p>8) E demais itens não citados expressamente nesta proposta técnica comercial.</p>
        </div>
      </section>

      ${sec523PrecoHtml}

      <section class="block avoid-break pagina-assinatura" data-page-break="before">
        <div class="assinatura-topo stack-md clausula-corpo">
          <h3>5.24 CONSIDERAÇÃO FINAL</h3>
          <p>Em caso de aceite e que não seja emitido um pedido de compra oficial formal, esta proposta torna-se apenas válida como pedido de compra mediante assinatura do responsável e com carimbo da empresa no campo destacado abaixo:</p>
        </div>

        <div class="assinatura-meio">${camposAssinaturaManualHtml}</div>

        <div class="assinatura-rodape">
        <p>Atenciosamente,</p>

        <div class="signature-grid avoid-break">
          <div class="sig-col">
            <div class="sig-name">Junior Machado</div>
            <div class="sig-role">Diretor Comercial</div>
            <div class="sig-line">T +55 (11) 4513-9570</div>
            <div class="sig-line">M +55 (11) 9.9351-5046</div>
            <div class="sig-email">junior@gmp.ind.br</div>
          </div>
          <div class="sig-col">
            <div class="sig-name">Bruno Machado</div>
            <div class="sig-role">Gerente Comercial</div>
            <div class="sig-line">T +55 (11) 4513-9570</div>
            <div class="sig-line">M +55 (11) 9.9351-5543</div>
            <div class="sig-email">bruno@gmp.ind.br</div>
          </div>
          <div class="sig-col">
            <div class="sig-name">Alex Junior</div>
            <div class="sig-role">Vendas Técnica</div>
            <div class="sig-line">T +55 (11) 4513-9570</div>
            <div class="sig-line">M +55 (11) 9.8908-5127</div>
            <div class="sig-email">alexjunior@gmp.ind.br</div>
          </div>
          <div class="sig-col">
            <div class="sig-name">Matheus Honrado</div>
            <div class="sig-role">Depto. Comercial</div>
            <div class="sig-line">T +55 (11) 4513-9570</div>
            <div class="sig-line">M +55 (11) 9.3386-9232</div>
            <div class="sig-email">matheus@gmp.ind.br</div>
          </div>
        </div>
        </div>
      </section>
    `}
    `;

    const pageHeaderTemplateHtml = `
      <div class="page-header-inner">
        <div class="page-header-logo-my">
          ${myLogoB64 ? `<img src="${myLogoB64}" alt="MOINHO YPIRANGA" />` : `<span class="page-header-title">MOINHO YPIRANGA</span>`}
        </div>
        <div class="page-header-center-box">
          <p class="page-header-title">PROPOSTA TÉCNICA COMERCIAL</p>
          <p class="page-header-num">Nº ${numero}</p>
          <p class="page-header-tagline">Especialista em Misturas, Moagens, Dispersões, Dosagens, <br> Automações, Excelência Operacional, Projetos Conceituais,<br> Projetos Executivos, Instalações e Sistemas Turn-Keys.</p>
        </div>
        <div class="page-header-logo-gmp">
          ${gmpLogoSmB64 ? `<img src="${gmpLogoSmB64}" alt="GMP INDUSTRIAIS" />` : `<span class="page-header-title">GMP</span>`}
        </div>
      </div>`;

    const pageFooterTemplateHtml = `
      <div class="page-footer-inner">
        <div class="page-footer-line1"><strong>MOINHO YPIRANGA</strong> | <strong>CNPJ</strong>: 13.273.368/0001-75 | <strong>T</strong> +55 (11) 4513-9570</div>
        <div class="page-footer-line2">www.gmp.ind.br | www.moinhoypiranga.com | www.ultradispersoravacuo.com.br</div>
        <div class="page-footer-line2">www.colorcell.com.br | www.transmicell.com.br</div>
        <div class="page-footer-line3">
          <span class="page-footer-addr">Av. Ângelo Demarchi, nº 130, Batistini, São Bernardo do Campo, São Paulo – Brasil | CEP: 09844-100</span>
          <span class="page-footer-right">Pág. <span class="js-page-number"></span>/<span class="js-page-count"></span></span>
        </div>
      </div>`;

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${titulo}</title>
  <style>
    ${cgRegularB64 ? `@font-face { font-family: 'Century Gothic'; font-style: normal; font-weight: 400; font-display: swap; src: url('${cgRegularB64}') format('truetype'); }` : ''}
    ${cgBoldB64 ? `@font-face { font-family: 'Century Gothic'; font-style: normal; font-weight: 700; font-display: swap; src: url('${cgBoldB64}') format('truetype'); }` : ''}
    ${cgItalicB64 ? `@font-face { font-family: 'Century Gothic'; font-style: italic; font-weight: 400; font-display: swap; src: url('${cgItalicB64}') format('truetype'); }` : ''}
    ${cgBoldItalicB64 ? `@font-face { font-family: 'Century Gothic'; font-style: italic; font-weight: 700; font-display: swap; src: url('${cgBoldItalicB64}') format('truetype'); }` : ''}
    :root{
      /* Paleta do modelo DOCX: texto integral em azul marinho #002060 */
      --ink: #002061;
      --muted: rgba(0,32,96,0.55);
      --blue-900: #002060;
      --blue-600: #41afcc;
      --blue-700: #17365D;
      --blue-100: #e8f2fb;
      --navy-950: #0a2a4f;
      --navy-900: #123a68;
      /* Cores GMP: azul + laranja */
      --orange-500: #ff6b35;
      --orange-200: #ffd4c6;
      --aqua-500: #25b7be; /* legado (não usar na capa) */
      --aqua-300: #7ad6d5; /* legado (não usar na capa) */
      --mist-200: #e6ecef;
      --line: rgba(26,77,122,0.45);
      --line-strong: rgba(26,77,122,0.75);
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #f3f3f3; font-family: 'Century Gothic', CenturyGothic, 'Trebuchet MS', 'Segoe UI', Arial, sans-serif; color: var(--ink); font-size: 11pt; line-height: 1.15; text-transform: none; font-variant: normal; letter-spacing: normal; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; font-synthesis: none; }
    img { max-width: 100%; height: auto; display: block; }

    h1, h2, h3, h4, h5, h6, p, ul, ol { margin-top: 0; }
    p:last-child, ul:last-child, ol:last-child { margin-bottom: 0; }
    h1 { margin: 0 0 10px 0; font-size: 14pt; font-weight: 700; line-height: 1.15; }
    h2 { margin: 0 0 3px 0; font-size: 14pt; font-weight: 700; line-height: 1.15; }
    h3 { margin: 0 0 6px 0; font-size: 12pt; font-weight: 700; line-height: 1.15; }
    p, li { margin: 0 0 0 0; font-size: 11pt; line-height: 1.6; text-align: justify; text-transform: none; font-variant: normal; font-weight: 400; }
    ul, ol { padding-left: 16px; margin-bottom: 6px; }

    .proposal-document { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 0; }
    /* Proteção contra transformação automática de caixa no motor de PDF */
    .proposal-document, .proposal-document * {
      font-family: inherit !important;
      font-variant: normal !important;
      font-variant-caps: normal !important;
      font-feature-settings: "smcp" 0, "c2sc" 0, "liga" 1;
      text-transform: none !important;
      letter-spacing: normal !important;
    }
    /* Tipografia DOCX: Century Gothic nos títulos, azul marinho #002060 */
    .proposal-document h2,
    .proposal-document h3 { font-family: 'Century Gothic', CenturyGothic, 'Trebuchet MS', Arial, sans-serif !important; }
    .proposal-document h2 {
      background: none !important;
      border: none !important;
      padding: 2px 0 !important;
      color: var(--blue-900) !important;
      text-transform: uppercase !important;
      font-size: 14pt !important;
    }
    .proposal-document h3 { color: var(--blue-900) !important; }
    /* Cada section é uma página A4 independente (altura fixa) */
    .proposal-page { width: 210mm; height: 297mm; min-height: 297mm; flex-shrink: 0; background: #fff; display: flex; flex-direction: column; overflow: hidden; position: relative; page-break-after: always; break-after: page; }
    /* Header/footers com altura fixa para repetir corretamente em todas as páginas */
    .page-header { flex: 0 0 auto; width: 100%; height: 39mm; padding: 0; margin: 0; }
    .page-content { flex: 1 1 auto; width: 100%; padding: 3mm 14mm 10mm 14mm; margin: 0; overflow: hidden; }
    .page-footer { flex: 0 0 auto; width: 100%; height: 20mm; padding: 0; margin: 0 0 18px 0; }

    .stack-xs, .stack-sm, .stack-md, .stack-lg, .stack-xl { display: flex; flex-direction: column; }
    .stack-xs { gap: 4px; } .stack-sm { gap: 8px; } .stack-md { gap: 12px; } .stack-lg { gap: 16px; } .stack-xl { gap: 24px; }
    .muted { color: var(--muted); }
    .block { width: 100%; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; column-gap: 14px; row-gap: 10px; }
    .kv .k { font-size: 11px; opacity: 0.72; margin-bottom: 2px; }
    .kv .v { font-size: 12px; }

    table { width: 100%; border-collapse: collapse; }
    /* Grade completa: linhas internas e externas */
    .table { border: 1px solid var(--line-strong); border-radius: 6px; overflow: hidden; }
    thead { display: table-header-group; }
    th, td {
      vertical-align: top;
      padding: 6px 8px;
      word-wrap: break-word;
      overflow-wrap: break-word;
      font-size: 11pt;
      border: 1px solid var(--line);
      color: var(--ink);
      text-transform: none;
      font-variant: normal;
    }
    th { text-align: center; background: #fff; font-weight: 700; color: var(--blue-900); }
    td { font-weight: 400; }
    /* Variante do modelo DOCX: cabeçalho azul escuro + texto branco + zebra (tabela FINAME) */
    .table-dark th { background: var(--blue-900); color: #fff; }
    .table-dark tbody tr:nth-child(odd) td { background: #F9F9F9; }
    .table-dark tbody tr:nth-child(even) td { background: #EDEDED; }
    .table-caption { font-weight: 700; margin: 6px 0 6px 0; color: var(--blue-900); }
    .col-right { text-align: right; white-space: nowrap; }
    .col-center { text-align: center; }
    .tech-desc { margin-top: 4px; font-size: 10pt; line-height: 1.15; color: var(--muted); text-align: justify; }

    .equip-photo-float { float: right; width: 35%; margin: 0 0 4mm 6mm; text-align: center; border: 1px solid var(--line); border-radius: 8px; padding: 6px; background: #fff; }
    .equip-photo-img-float { width: 100%; height: auto; object-fit: contain; border-radius: 6px; display: block; }
    .equip-photo-fallback-float { display: flex; align-items: center; justify-content: center; min-height: 30mm; font-size: 10pt; color: var(--muted); background: var(--blue-100); border-radius: 6px; }
    .equip-tech { width: 100%; }

    /* Página da 5.24: texto no topo, campos de preenchimento manual no meio e assinaturas
       junto ao rodapé. O :has() estica APENAS a .page-stack que contém este bloco — esticar
       todas mudaria a medição de altura que o paginador usa em todas as páginas. */
    .page-stack:has(> .pagina-assinatura) { height: 100%; }
    .pagina-assinatura { flex: 1 1 auto; display: flex; flex-direction: column; justify-content: space-between; }
    .assinatura-meio { padding: 6mm 0; }
    .campo-manual { font-size: 11.5pt; margin: 0 0 9mm 0; text-align: left; }
    /* Espaços em branco da data: largura fixa com filete embaixo, para preencher à caneta. */
    .campo-branco { display: inline-block; border-bottom: 1px solid var(--ink); margin: 0 2px; }
    .campo-branco-dia, .campo-branco-mes { width: 16mm; }
    .campo-branco-ano { width: 24mm; }
    /* Filete que corre da label até a margem direita: flex:1 no ::after resolve sozinho,
       sem contar underscores (que mudariam de comprimento junto com a fonte). */
    .campo-manual-linha { display: flex; align-items: baseline; gap: 3mm; margin-bottom: 0; }
    .campo-manual-linha::after { content: ''; flex: 1 1 auto; border-bottom: 1px solid var(--ink); }

    /* Assinaturas/setor comercial (após "Atenciosamente,") */
    .signature-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10mm; align-items: start; margin-top: 8mm; }
    .sig-col { display: flex; flex-direction: column; gap: 2mm; }
    .sig-name { font-size: 11pt; font-weight: 800; color: var(--blue-900); }
    .sig-role { font-size: 9.5pt; font-weight: 700; color: var(--blue-700); }
    .sig-line { font-size: 9.5pt; color: var(--blue-900); font-weight: 700; }
    .sig-email { font-size: 9.5pt; color: var(--blue-700); font-weight: 600; }
    tr, img, table, blockquote { page-break-inside: avoid; break-inside: avoid; }
    .col-idx { width: 10mm; text-align: right; }
    .col-qtd { width: 16mm; text-align: right; }
    .col-und { width: 14mm; text-align: center; }
    .col-money { width: 26mm; text-align: right; white-space: nowrap; }

    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
    .sig { border: 1px solid rgba(0,0,0,0.10); border-radius: 10px; padding: 10px 12px; }
    .sig-line { height: 1px; background: rgba(0,0,0,0.35); margin: 22px 0 8px 0; }
    .sig-name { font-weight: 700; }
    .sig-role { font-size: 11px; opacity: 0.75; }

    .page-header { position: relative; }
      header.page-header::after {
      content: '';
      width: 95%;
      height: 2.5px;
      background: #41afcc;
      display: block;
      margin: 0 auto;
      border-bottom: 2.5px solid #909090;
  }
    .page-footer { position: relative; }
    .page-header-inner, .page-footer-inner { position: relative; z-index: 1; }

    /* Cabeçalho: logo Moinho à esquerda, GMP à direita, box central arredondado
       com título (nº dinâmico) + tagline */
    .page-header-inner {
      height: 100%;
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 5mm;
      padding: 0 8mm;
    }
    .page-header-logo-my { display: flex; align-items: center; justify-content: flex-start; flex-shrink: 0; }
    .page-header-logo-my img { height: 12mm; width: auto; object-fit: contain; }
    .page-header-logo-gmp { display: flex; align-items: center; justify-content: flex-end; flex-shrink: 0; }
    .page-header-logo-gmp img { height: 12mm; width: auto; object-fit: contain; }
    .page-header-center-box {
      border: 1.5px solid var(--blue-600);
      border-radius: 10px;
      padding: 3.5mm 4mm;
      text-align: center;
    }
    .page-header-title { font-size: 11pt; font-weight: 700; color: var(--blue-900); margin: 0 0 1mm 0; line-height: 1.2; text-align: center; }
    .page-header-num { font-size: 9pt; font-weight: 700; color: var(--blue-900); margin: 0 0 1mm 0; line-height: 1.15; text-align: center; }
    .page-header-tagline {
      margin: 0;
      text-align: center;
      font-size: 9pt;
      font-weight: 400;
      color: var(--blue-900);
      line-height: 1.25;
    }

    /* Rodapé: bloco centralizado azul em 4 linhas (modelo DOCX) */
    .page-footer-inner {
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.8mm;
      padding: 0 8mm;
      text-align: center;
    }
    .page-footer-line1 { font-size: 8.5pt; font-weight: 500; color: var(--blue-900); line-height: 1.25; }
    .page-footer-line2 { font-size: 8pt; color: var(--blue-900); line-height: 1.25; }
    .page-footer-line3 {
      width: 100%;
      display: flex;
      align-items: baseline;
      justify-content: center;
      gap: 4mm;
    }
    .page-footer-addr { font-size: 7.5pt; color: var(--blue-700); line-height: 1.25; text-align: left; }
    .page-footer-right {     
      text-align: right;
      white-space: nowrap;
      font-size: 8.5pt;
      font-weight: 700;
      color: var(--blue-900);
      flex-shrink: 0;
      position: absolute;
      bottom: 12px;
      right: 20px;
      }

    /* Capa — layout de página inteira sem header/footer padrão */
    .cover-page { display: flex; flex-direction: column; overflow: hidden; }
    /* Hero na proporção do modelo (78mm); capa sem header, com footer (conteúdo útil ≈ 277mm) */
    .cover-hero { display: flex; width: 100%; height: 78mm; flex: 0 0 auto; }
    .cover-hero img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .cover-logos-bar {
      flex: 0 0 auto;
      display: flex;
      align-items: stretch;
      background: #fff;
    }
    .cover-logo-half {
      flex: 1 1 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4mm 10mm;
    }
    .cover-logo-half img { height: 30mm; width: auto; object-fit: contain; }
    .cover-blue-strip {
      flex: 0 0 auto;
      background: var(--blue-900);
      padding: 5mm 14mm;
      text-align: center;
    }
    .cover-blue-strip p {
      color: #fff;
      font-size: 13.5pt;
      font-weight: 700;
      margin: 0;
      text-align: center;
    }
    /* Título da proposta (cadastro) em amarelo, como o placeholder **TITULO** do modelo DOCX */
    .cover-blue-strip .cover-strip-titulo {
      color: #FFFF00;
      font-size: 12pt;
      margin-top: 1.5mm;
    }
    .cover-info-area {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      padding: 8mm 20mm;
      text-align: center;
    }
    .cover-info-title {
      font-family: 'Century Gothic', CenturyGothic, 'Trebuchet MS', Arial, sans-serif;
      font-size: 20pt;
      font-weight: 800;
      color: #1a1a1a;
      margin: 0 0 1mm 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      line-height: 1.2;
    }
    .cover-info-num {
      font-family: 'Century Gothic', CenturyGothic, 'Trebuchet MS', Arial, sans-serif;
      font-size: 17pt;
      font-weight: 700;
      color: #1a1a1a;
      margin: 0 0 7mm 0;
    }
    .cover-client-logo { text-align: center; margin: 0 0 4mm 0; }
    /* margin auto, e não só o text-align:center do pai: a regra global "img { display: block }"
       torna a logo um elemento de bloco, e bloco não é centralizado por text-align — ele fica
       encostado à esquerda da caixa. A caixa em si já vinha centrada (align-items:center do
       .cover-info-area), o que disfarçava o desalinhamento da imagem dentro dela. */
    .cover-client-logo img { max-height: 25mm; max-width: 60%; object-fit: contain; margin-left: auto; margin-right: auto; }
    /* Campos do cliente centralizados na capa. text-align (e não align-self como a data de
       emissão usava) porque o campo "EMPRESA CONTRATANTE" tem um <p> aninhado dentro de outro
       <p>: o browser fecha o externo e o nome vira um irmão solto, então centralizar item a
       item por align-self deixaria as duas linhas desalinhadas. text-align é herdado e alcança
       todos os pedaços, inclusive os que o parser separou. */
    .cover-client-info {
      text-align: center;
      width: 100%;
      max-width: 150mm;
      padding-top: 5mm;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    /* text-align aqui também, e não só no container: a regra global "p, li { text-align:
       justify }" casa DIRETAMENTE com estes <p>, e valor herdado sempre perde para uma regra
       que casa direto — o center do .cover-client-info só pegava no <span> do nome do cliente. */
    .cover-client-info p { margin: 0; font-size: 13pt; line-height: 1.5; color: #1a1a1a; text-align: center; }
    [data-edit] { display: inline-block; min-width: 60px; cursor: text; }
    /* Rótulo em uma linha, valor na linha de baixo, ambos centrados. display:block no rótulo
       é o que força a quebra — o valor cai na linha seguinte e o text-align:center herdado do
       .cover-client-info p o centraliza. Antes o rótulo "EMPRESA CONTRATANTE" era um <p>
       aninhado dentro de outro <p>, o que é inválido: o parser fechava o externo e jogava o
       nome do cliente para fora do campo, quebrando o alinhamento só naquele item. */
    .cover-field-rotulo { display: block; font-weight: 700; }
    .cover-field-contratante {}
    .cover-field-cnpj {}
    .cover-field-email {}
    .cover-field-emissao {
      padding-top: 80px;
      align-self: center;
    }

    /* Página de Apresentação da empresa (modelo DOCX: texto largura total + imagem centrada) */
    .pres-page-content { display: flex; flex-direction: column; height: 100%; padding-top: 5mm; }
    /* Indentação de primeira linha do modelo DOCX (w:firstLine=709 twips ≈ 12.5mm);
       itens com check alinham no mesmo recuo */
    .pres-text p { font-size: 12pt; margin-bottom: 4mm; line-height: 1.3; text-indent: 12.5mm; }
    .pres-text ul { list-style: none; padding-left: 12.5mm; margin: 0 0 4mm 0; }
    .pres-text li { font-size: 12pt; margin-bottom: 1.5mm; text-align: left; line-height: 1.3; position: relative; padding-left: 7mm; }
    .pres-text li::before { content: "\\2713"; position: absolute; left: 0; color: var(--blue-900); font-weight: 700; }
    .pres-image { margin-top: 8mm; text-align: center; }
    .pres-image img { max-width: 145mm; width: 100%; height: auto; margin: 0 auto; }

    /* Equipamentos: chave-valor sem tabela (10pt como no modelo DOCX) */
    .equip-specs-kv { display: block; margin-top: 3mm; }
    .equip-specs-kv::after { content: ""; display: block; clear: both; }
    .equip-specs-kv > p { margin: 0 0 3px 0; font-size: 10pt; line-height: 1.6; }
    .equip-descritivo { margin: 1mm 0 3mm 6mm; font-size: 10pt; line-height: 1.6; }
    .equip-descritivo p { margin: 0 0 4px 0; line-height: 1.6; }
    .equip-photo-caption { color: #ED7D31; font-size: 7pt; font-weight: 700; text-align: center; margin-top: 2px; letter-spacing: 0.5px; }

    /* Recuo de primeira linha no CORPO das cláusulas. Precisa dos dois seletores porque as
       cláusulas têm duas origens: .clausula-corpo são as seções 5.x fixas do template (usadas
       no PDF quando a proposta não tem cláusulas salvas) e [data-clausula-campo="conteudo"] é
       o corpo editável vindo do banco/clausulasDefault.js (usado no preview).
       As seções 1 (OBJETIVO) e 2 (ELABORAÇÃO) também levam .clausula-corpo: são texto corrido
       e seguem o mesmo tratamento. A 3 (tabela) e a 4 (specs chave-valor) ficam de fora.
       Só filho DIRETO (> p): não recua parágrafo dentro de tabela, lista ou .equip-specs-kv.
       Também não atinge títulos, capa nem rodapé.
       (sem crases neste comentário: todo o CSS vive dentro de um template literal JS) */
    .clausula-corpo > p,
    [data-clausula-campo="conteudo"] > p { text-indent: 48px; }

    /* Sumário (preenchido via JS após a paginação) */
    .toc-list { display: flex; flex-direction: column; gap: 2mm; }
    .toc-row { display: flex; align-items: baseline; gap: 2mm; font-size: 10.5pt; color: var(--ink); }
    .toc-row.toc-sub { padding-left: 8mm; font-size: 10pt; }
    .toc-title { flex-shrink: 0; max-width: 80%; }
    .toc-dots { flex: 1 1 auto; border-bottom: 1.5px dotted rgba(0,32,96,0.55); min-width: 6mm; }
    .toc-page { flex-shrink: 0; font-weight: 700; }

    .avoid-break { break-inside: avoid; page-break-inside: avoid; }
    .allow-break { break-inside: auto; page-break-inside: auto; }

    .printbar { position: sticky; top: 0; z-index: 10; width: 100%; background: rgba(243,243,243,0.92); backdrop-filter: blur(8px); border-bottom: 1px solid rgba(0,0,0,0.08); }
    .printbar-inner { max-width: 1320px; margin: 0 auto; padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .printbar-title { font-size: 12px; color: rgba(0,0,0,0.7); font-weight: 700; }
    .printbar-btn { border: 1px solid var(--line-strong); background: var(--blue-900); color: #fff; font-weight: 700; padding: 10px 12px; border-radius: 10px; cursor: pointer; }

    @media screen {
      html, body { background: #d0d7de; }
      .proposal-document { gap: 16px; padding: 16px 0; }
      .proposal-page { box-shadow: 0 2px 12px rgba(0,0,0,0.18); }
    }

    @page { size: A4; margin: 0; }
    @media print {
      html, body { width: 210mm; height: auto; background: #fff; }
      .printbar { display: none !important; }
      .proposal-document { display: block; gap: 0; padding: 0; }
      .proposal-page { margin: 0; box-shadow: none; break-after: page; page-break-after: always; }
    }
  </style>
</head>
<body>
  ${printBar}
  <div class="proposal-document" id="proposalDocument">
    <section class="proposal-page cover-page">
      <div class="cover-hero">
        ${industria40B64 ? `<img src="${industria40B64}" alt="Indústria 4.0" />` : ''}
      </div>
      <div class="cover-logos-bar">
        <div class="cover-logo-half">
          ${gmpLogoGrandeB64 ? `<img src="${gmpLogoGrandeB64}" alt="GMP INDUSTRIAIS" />` : `<span style="color:var(--blue-900);font-weight:800;font-size:14pt;">GMP INDUSTRIAIS</span>`}
        </div>
        <div class="cover-logo-half">
          ${myLogoB64 ? `<img src="${myLogoB64}" alt="MOINHO YPIRANGA" />` : `<span style="font-weight:700;font-size:11pt;">MOINHO YPIRANGA</span>`}
        </div>
      </div>
      <div class="cover-blue-strip">
        <p>PROPOSTA PARA FORNECIMENTO DE EQUIPAMENTOS INDUSTRIAIS</p>
        ${(proposta.titulo && String(proposta.titulo).trim()) ? `<p class="cover-strip-titulo">${esc(String(proposta.titulo).trim())}</p>` : ''}
      </div>
      <div class="cover-info-area">
        <p class="cover-info-title">PROPOSTA TÉCNICA COMERCIAL</p>
        <p class="cover-info-num">Nº ${numero}</p>
        ${clienteLogoB64 ? `<div class="cover-client-logo"><img src="${clienteLogoB64}" alt="Logo do cliente" /></div>` : ''}
        <div class="cover-client-info">
          <p class="cover-field-contratante"><span class="cover-field-rotulo">EMPRESA CONTRATANTE:</span><span data-edit="cliente_nome">${clienteNome}</span></p>
          <p class="cover-field-cnpj"><span class="cover-field-rotulo">CNPJ:</span>${clienteCnpj}</p>
          <p class="cover-field-email"><span class="cover-field-rotulo">Email:</span><span data-edit="cliente_email">${esc(proposta.cliente_email || proposta.cliente_email_cadastro || '—')}</span></p>
          <p class="cover-field-telefone"><span class="cover-field-rotulo">Telefone:</span><span data-edit="cliente_telefone">${esc(proposta.cliente_telefone || proposta.cliente_telefone_cadastro || '—')}</span></p>
          <p class="cover-field-emissao">Data de Emissão: <strong>${dataEmissao || '—'}</strong></p>
        </div>
      </div>
      ${/* Capa sem rodapé: é folha de rosto, não leva os dados da empresa nem "Pág. X/Y".
           A numeração das demais páginas NÃO muda — numerarPaginas() conta .proposal-page
           (a capa continua entrando no total) e só preenche os .js-page-number que existirem,
           então a página seguinte segue sendo a 2. */''}
    </section>

    <section class="proposal-page">
      <header class="page-header">
        ${pageHeaderTemplateHtml}
      </header>
      <main class="page-content pres-page-content">
        <div class="pres-text">
          <p style="text-indent:0;"><strong>APRESENTAÇÃO</strong></p>
          <p>A <strong>MOINHO YPIRANGA</strong> é uma empresa especializada no desenvolvimento de projetos e instalações industriais. Somos uma das maiores empresas com foco e participação no desenvolvimento, fabricação e comercialização de equipamentos para produção de produtos químicos do <strong>MERCOSUL</strong>, destacando nossas competências no fornecimento de plantas em regime Turn-Key.</p>
          <p>Neste regime Turn-Key, quando contratado, assumimos o gerenciamento integral de todas as etapas de implantação do empreendimento, entregando a planta totalmente construída e pronta para o funcionamento.</p>
          <p>Na contratação Turn-Key, a trajetória do pedido segue:</p>
          <ul>
            <li>Planejamento;</li>
            <li>Projeto Básico, Conceitual e Executivo;</li>
            <li>Documentações do empreendimento;</li>
            <li>Cetesb, Conama, Anvisa, Bombeiro, Prefeitura, outros sob consulta;</li>
            <li>Cronograma;</li>
            <li>Gerenciamento e execução da obra;</li>
            <li>Instalações elétrica, hidráulicas, pneumáticas, civil, e outras;</li>
            <li>Fabricação e desenvolvimento de máquinas e equipamentos;</li>
            <li>Produção e desenvolvimento de softwares e automações;</li>
          </ul>
          <p>Todas as fases desse processo contam com o suporte de recursos tecnológicos adequados, com um moderno sistema de gestão de projetos, além de uma equipe técnica própria e altamente qualificada para atender às necessidades do cliente.</p>
        </div>
        <div class="pres-image">
          ${projetosB64 ? `<img src="${projetosB64}" alt="Projetos e instalações industriais" />` : ''}
        </div>
      </main>
      <footer class="page-footer">
        ${pageFooterTemplateHtml}
      </footer>
    </section>

    <section class="proposal-page" id="tocPage">
      <header class="page-header">
        ${pageHeaderTemplateHtml}
      </header>
      <main class="page-content">
        <h2 style="text-align:center;margin-bottom:6mm;">SUMÁRIO</h2>
        <div class="toc-list" id="tocList"></div>
      </main>
      <footer class="page-footer">
        ${pageFooterTemplateHtml}
      </footer>
    </section>

    <section class="proposal-page" id="proposalPageTemplate" style="display:none">
      <header class="page-header">
        ${pageHeaderTemplateHtml}
      </header>
      <main class="page-content">
        <div class="page-stack stack-lg"></div>
      </main>
      <footer class="page-footer">
        ${pageFooterTemplateHtml}
      </footer>
    </section>
  </div>

  <div id="proposalSource" style="display:none">${blocksHtml}</div>

  <script>
    (function () {
      function isElement(node) { return node && node.nodeType === 1; }
      function splitTableByRows(tableEl, pageContentEl) {
        const thead = tableEl.querySelector('thead');
        const rows = Array.from(tableEl.querySelectorAll('tbody > tr'));
        if (!rows.length) return [tableEl];
        const mkTable = () => {
          const t = tableEl.cloneNode(false);
          const cg = tableEl.querySelector('colgroup');
          if (cg) t.appendChild(cg.cloneNode(true));
          if (thead) t.appendChild(thead.cloneNode(true));
          const tb = document.createElement('tbody');
          t.appendChild(tb);
          return t;
        };
        const parts = [];
        let current = mkTable();
        parts.push(current);
        for (const r of rows) {
          current.querySelector('tbody').appendChild(r.cloneNode(true));
          pageContentEl.appendChild(current);
          const overflow = pageContentEl.scrollHeight > pageContentEl.clientHeight;
          pageContentEl.removeChild(current);
          if (overflow) {
            current.querySelector('tbody').removeChild(current.querySelector('tbody').lastElementChild);
            current = mkTable();
            current.querySelector('tbody').appendChild(r.cloneNode(true));
            parts.push(current);
          }
        }
        // Remove partes vazias para evitar que o "primeiro bloco real"
        // seja tratado como continuação (i > 0) e perca foto/título.
        const nonEmptyParts = parts.filter((tbl) => {
          const bodyRows = tbl.querySelectorAll('tbody > tr');
          return bodyRows && bodyRows.length > 0;
        });
        return nonEmptyParts.length ? nonEmptyParts : [tableEl];
      }
      // Divide um bloco não-tabela (ex.: cláusula longa, descritivo técnico) que sozinho é
      // maior que a área útil de uma página inteira. Heurística análoga ao splitTableByRows:
      // procura, em TODA a subárvore do bloco (não só nos filhos diretos — cláusulas custom
      // ficam envolvidas em wrappers "avoid-break" com 1-2 níveis extras de aninhamento), o
      // elemento com mais filhos-elemento diretos — esse é o "container" que concentra os
      // parágrafos/itens (ex.: a <div> de conteúdo de uma cláusula). Reconstrói a cadeia de
      // ancestrais entre o bloco e o container em cada parte, preservando título/irmãos
      // apenas na primeira parte. Se não houver container com múltiplos filhos para dividir
      // (ex.: um único parágrafo gigantesco), retorna [blockEl] inalterado.
      // Monta a "parte final" de um split: os irmãos que vêm DEPOIS do filho da
      // cadeia em cada nível (ex.: a seção de CONDIÇÃO DE PAGAMENTO depois da
      // tabela da 5.23). Esses irmãos precisam renderizar após TODAS as
      // continuações do container dividido — não junto da 1ª parte, senão a
      // ordem do documento fica embaralhada. Retorna null se não houver nenhum.
      function montarParteFinalIrmaosPosteriores(fullChain) {
        let inner = null;
        for (let i = fullChain.length - 2; i >= 0; i--) {
          const originalEl = fullChain[i];
          const nextPathEl = fullChain[i + 1];
          const kids = Array.from(originalEl.children).filter(isElement);
          const idx = kids.indexOf(nextPathEl);
          const posteriores = idx >= 0 ? kids.slice(idx + 1) : [];
          if (!posteriores.length && !inner) continue;
          const clone = originalEl.cloneNode(false);
          // conteúdo mais profundo vem ANTES dos irmãos deste nível (ordem do documento)
          if (inner) clone.appendChild(inner);
          posteriores.forEach((k) => clone.appendChild(k.cloneNode(true)));
          inner = clone;
        }
        // a parte final flui logo após a última continuação — nunca força página nova
        if (inner && inner.removeAttribute) inner.removeAttribute('data-page-break');
        return inner;
      }
      function splitBlockByChildren(blockEl, pageContentEl) {
        let container = null;
        let maxCount = 1; // precisa de pelo menos 2 filhos para valer a pena dividir
        const stack = [blockEl];
        while (stack.length) {
          const el = stack.pop();
          const kids = Array.from(el.children).filter(isElement);
          if (kids.length > maxCount) { maxCount = kids.length; container = el; }
          kids.forEach((k) => stack.push(k));
        }
        if (!container) return [blockEl];
        const items = Array.from(container.children).filter(isElement);
        if (items.length < 2) return [blockEl];

        // Cadeia real (elementos originais do DOM) do bloco até o container, inclusive.
        const fullChain = [];
        {
          let cur = container;
          while (cur !== blockEl) { fullChain.unshift(cur); cur = cur.parentElement; }
          fullChain.unshift(blockEl);
        }

        // Se o container dividido é um tbody, cada parte precisa repetir o cabeçalho
        // da tabela (colgroup/thead) — espelhando splitTableByRows. Sem isso, as partes
        // de continuação (includeSideChildren=false) perderiam o thead ITEM/DESCRIÇÃO/...
        const tabelaAncestral = container.tagName === 'TBODY' ? container.closest('table') : null;

        // Reconstrói a cadeia em cada parte (shallow clone por nível). Irmãos que vêm
        // ANTES do filho da cadeia (ex.: título/intro) entram apenas na 1ª parte
        // (includeSideChildren=true). Irmãos que vêm DEPOIS (ex.: a CONDIÇÃO DE
        // PAGAMENTO após a tabela da 5.23) NÃO entram em nenhuma parte aqui — vão para
        // a parte final via montarParteFinalIrmaosPosteriores, preservando a ordem do
        // documento (bug: condição aparecia junto do 1º fragmento e a tabela seguia depois).
        const mkShell = (includeSideChildren) => {
          const clones = fullChain.map((el, i) => (i === fullChain.length - 1 ? container.cloneNode(false) : el.cloneNode(false)));
          for (let i = 0; i < fullChain.length - 1; i++) {
            const originalEl = fullChain[i];
            const nextPathEl = fullChain[i + 1];
            let depoisDaCadeia = false;
            Array.from(originalEl.children).filter(isElement).forEach((k) => {
              if (k === nextPathEl) {
                clones[i].appendChild(clones[i + 1]);
                depoisDaCadeia = true;
              } else if (includeSideChildren && !depoisDaCadeia) {
                clones[i].appendChild(k.cloneNode(true));
              }
            });
          }
          // Repete colgroup/thead da tabela ancestral em TODAS as partes (não só na 1ª),
          // inserindo-os antes do tbody reconstruído se ainda não estiverem presentes.
          if (tabelaAncestral) {
            const cloneTable = clones[fullChain.indexOf(tabelaAncestral)];
            const tbodyClone = clones[clones.length - 1];
            if (cloneTable) {
              const cg = tabelaAncestral.querySelector(':scope > colgroup');
              const th = tabelaAncestral.querySelector(':scope > thead');
              if (cg && !cloneTable.querySelector(':scope > colgroup')) cloneTable.insertBefore(cg.cloneNode(true), tbodyClone);
              if (th && !cloneTable.querySelector(':scope > thead')) cloneTable.insertBefore(th.cloneNode(true), tbodyClone);
            }
          }
          return { shell: clones[0], container: clones[clones.length - 1] };
        };

        const parts = [];
        let { shell: currentShell, container: currentContainer } = mkShell(true);
        parts.push(currentShell);
        for (const item of items) {
          const clone = item.cloneNode(true);
          currentContainer.appendChild(clone);
          pageContentEl.appendChild(currentShell);
          const overflow = pageContentEl.scrollHeight > pageContentEl.clientHeight;
          pageContentEl.removeChild(currentShell);
          // Só migra o item para uma nova parte se a parte atual já tinha outro conteúdo;
          // se for o único item e mesmo assim não couber, mantém (evita parte vazia/loop).
          if (overflow && currentContainer.children.length > 1) {
            currentContainer.removeChild(clone);
            const next = mkShell(false);
            currentShell = next.shell;
            currentContainer = next.container;
            currentContainer.appendChild(clone);
            parts.push(currentShell);
          }
        }
        const parteFinal = montarParteFinalIrmaosPosteriores(fullChain);
        if (parteFinal) parts.push(parteFinal);
        return parts;
      }
      // Fallback para quando splitBlockByChildren não encontra um container com múltiplos
      // filhos-elemento para dividir — caso de texto "cru" sem tags (ex.: descritivo técnico
      // de um equipamento, inserido como um único bloco de texto sem <p> internos). Acha a
      // folha (elemento sem filhos-elemento) com mais texto na subárvore e divide seu
      // conteúdo por palavras via busca binária, medindo overflow real no pageContentEl
      // (mesma técnica de splitTableByRows/splitBlockByChildren).
      function splitTextLeaf(blockEl, pageContentEl) {
        let leaf = null, leafLen = 0;
        const stack = [blockEl];
        while (stack.length) {
          const el = stack.pop();
          const kids = Array.from(el.children).filter(isElement);
          if (kids.length === 0) {
            const len = (el.textContent || '').trim().length;
            if (len > leafLen) { leafLen = len; leaf = el; }
          } else {
            kids.forEach((k) => stack.push(k));
          }
        }
        if (!leaf || leafLen < 40) return [blockEl];

        const fullChain = [];
        {
          let cur = leaf;
          while (cur !== blockEl) { fullChain.unshift(cur); cur = cur.parentElement; }
          fullChain.unshift(blockEl);
        }
        const words = (leaf.textContent || '').split(/(\s+)/); // tokens: preserva espaços

        const mkShell = (includeSideChildren) => {
          const clones = fullChain.map((el, i) => (i === fullChain.length - 1 ? leaf.cloneNode(false) : el.cloneNode(false)));
          for (let i = 0; i < fullChain.length - 1; i++) {
            const originalEl = fullChain[i];
            const nextPathEl = fullChain[i + 1];
            let depoisDaCadeia = false;
            Array.from(originalEl.children).filter(isElement).forEach((k) => {
              if (k === nextPathEl) {
                clones[i].appendChild(clones[i + 1]);
                depoisDaCadeia = true;
              } else if (includeSideChildren && !depoisDaCadeia) {
                // irmãos ANTES da cadeia: só na 1ª parte; os DEPOIS vão na parte final
                clones[i].appendChild(k.cloneNode(true));
              }
            });
          }
          return { shell: clones[0], leaf: clones[clones.length - 1] };
        };

        const parts = [];
        let wordIdx = 0;
        let first = true;
        let guard = 0;
        while (wordIdx < words.length && guard++ < 10000) {
          const { shell, leaf: leafClone } = mkShell(first);
          let lo = wordIdx, hi = words.length, best = wordIdx;
          while (lo <= hi) {
            const mid = Math.floor((lo + hi) / 2);
            leafClone.textContent = words.slice(wordIdx, mid).join('');
            pageContentEl.appendChild(shell);
            const fitsMid = pageContentEl.scrollHeight <= pageContentEl.clientHeight;
            pageContentEl.removeChild(shell);
            if (fitsMid) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
          }
          // Garante progresso mínimo (evita loop infinito se nem 1 token couber sozinho).
          if (best <= wordIdx) best = Math.min(wordIdx + 1, words.length);
          leafClone.textContent = words.slice(wordIdx, best).join('');
          parts.push(shell);
          wordIdx = best;
          first = false;
        }
        if (parts.length > 1) {
          const parteFinal = montarParteFinalIrmaosPosteriores(fullChain);
          if (parteFinal) parts.push(parteFinal);
          return parts;
        }
        return [blockEl];
      }
      function paginateProposalContent() {
        const doc = document.getElementById('proposalDocument');
        const template = document.getElementById('proposalPageTemplate');
        const source = document.getElementById('proposalSource');
        if (!doc || !template || !source) return;
        Array.from(doc.querySelectorAll('.proposal-page[data-generated=\"1\"]')).forEach(p => p.remove());
        const blocks = Array.from(source.children).filter(isElement);
        if (!blocks.length) return;
        const createPage = () => {
          const page = template.cloneNode(true);
          page.removeAttribute('id');
          page.style.display = '';
          page.setAttribute('data-generated', '1');
          doc.appendChild(page);
          return page;
        };
        let page = createPage();
        let stack = page.querySelector('.page-stack');
        let pageContent = page.querySelector('.page-content');
        const ensurePage = () => {
          if (!page) {
            page = createPage();
            stack = page.querySelector('.page-stack');
            pageContent = page.querySelector('.page-content');
          }
        };
        const fits = (limitPx) => pageContent.scrollHeight <= limitPx;
        const addNode = (node) => { stack.appendChild(node); };
        const pageLimitPx = pageContent.clientHeight;

        const wouldOverflowIfAdd = (node) => {
          addNode(node);
          const overflow = !fits(pageLimitPx);
          stack.removeChild(node);
          return overflow;
        };

        const getKeepPair = (blockEl) => {
          // Regra: manter junto "título + primeiro bloco de texto"
          // Heurística: primeiro heading (h2/h3/h4) + próximo elemento (p/ul/ol/table/div)
          const heading = blockEl.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6');
          if (!heading) return null;
          let next = heading.nextElementSibling;
          while (next && next.tagName === 'BR') next = next.nextElementSibling;
          if (!next) return null;
          return { heading, next };
        };

        // Adiciona um bloco à página atual; se não couber nem sozinho numa página nova
        // (bloco maior que a área útil inteira), tenta dividir seus filhos entre páginas
        // (splitBlockByChildren) em vez de deixar "overflow:hidden" cortar e perder
        // silenciosamente o conteúdo excedente. Recursivo: se uma das partes resultantes
        // ainda for maior que uma página (ex.: sub-bloco aninhado), tenta dividir de novo.
        const placeBlockOrSplit = (node) => {
          ensurePage();
          addNode(node);
          if (fits(pageLimitPx)) return;
          stack.removeChild(node);
          page = null;
          ensurePage();
          addNode(node);
          if (fits(pageLimitPx)) return;
          stack.removeChild(node);
          let parts = splitBlockByChildren(node, pageContent);
          if (parts.length < 2) parts = splitTextLeaf(node, pageContent);
          if (parts.length < 2) {
            // Não há como dividir (ex.: um único parágrafo maior que a página): mantém o
            // comportamento anterior — aceita o bloco atômico mesmo maior que a página.
            ensurePage();
            addNode(node);
            return;
          }
          for (let i = 0; i < parts.length; i++) {
            placeBlockOrSplit(parts[i]);
            if (i < parts.length - 1) page = null;
          }
        };

        for (const block of blocks) {
          ensurePage();
          // Quebra de página forçada: se o bloco pede data-page-break="before" e a página
          // corrente já recebeu conteúdo, fecha-a e começa numa página nova antes de posicioná-lo
          // (usado pela seção 5, pela 5.23 fixa e pela 5.24 — cada uma inicia em página própria).
          if (block.getAttribute && block.getAttribute('data-page-break') === 'before'
              && stack && stack.children.length > 0) {
            page = null;
            ensurePage();
          }
          // Quebra forçada DEPOIS do bloco: fecha a página assim que ele é posicionado, para
          // que nenhum bloco seguinte entre junto. Necessário para blocos cuja posse da página
          // não pode depender da altura medida — o caso da tabela DADOS DA CONTRATADA, cuja
          // altura vem só de uma <img> carregada por URL: enquanto ela não chega (ou se ela
          // 404), o bloco mede ~0px e o paginador puxava as seções 1..4 para a mesma página;
          // quando a imagem materializava sua altura, esse conteúdo ia para baixo do rodapé e
          // o overflow:hidden o cortava. Ver tests/propostaTabelaContratadaPaginaPropria.test.js.
          const fecharPaginaDepois = !!(block.getAttribute && block.getAttribute('data-page-break-after') === 'true');
          const table = block.querySelector('table[data-split-table=\"true\"]');
          if (table) {
            const wrapper = block.cloneNode(true);
            const tableInWrapper = wrapper.querySelector('table[data-split-table=\"true\"]');
            const tbody = tableInWrapper && tableInWrapper.querySelector('tbody');
            if (tbody) tbody.innerHTML = '';
            const parts = splitTableByRows(table, pageContent);
            for (let i = 0; i < parts.length; i++) {
              const partBlock = wrapper.cloneNode(true);
              const t = partBlock.querySelector('table[data-split-table=\"true\"]');
              const tb = t.querySelector('tbody');
              tb.innerHTML = '';
              Array.from(parts[i].querySelectorAll('tbody > tr')).forEach(r => tb.appendChild(r.cloneNode(true)));

              // Quando a tabela do item precisar ser dividida em múltiplas partes,
              // não replique o título "4.x" e a foto nas partes seguintes.
              // Isso elimina o efeito de "vários 4.2" para um mesmo equipamento.
              if (i > 0) {
                const heading = partBlock.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6');
                if (heading) heading.remove();
                const equipPhoto = partBlock.querySelector('.equip-photo-float');
                if (equipPhoto) equipPhoto.remove();
                const thead = t && t.querySelector('thead');
                if (thead) thead.remove();
              }

              addNode(partBlock);
              if (!fits(pageLimitPx)) {
                stack.removeChild(partBlock);
                page = null;
                ensurePage();
                addNode(partBlock);
              }
              if (i < parts.length - 1) page = null;
            }
            if (fecharPaginaDepois) page = null;
            continue;
          }
          // Se faltar espaço para título+primeiro texto, empurra o tópico para próxima página
          const keepPair = getKeepPair(block);
          if (keepPair) {
            const probe = document.createElement('div');
            probe.className = 'keep-probe';
            probe.style.display = 'block';
            probe.style.margin = '0';
            probe.style.padding = '0';
            probe.appendChild(keepPair.heading.cloneNode(true));
            probe.appendChild(keepPair.next.cloneNode(true));
            if (wouldOverflowIfAdd(probe)) {
              page = null;
              ensurePage();
            }
          }

          const node = block.cloneNode(true);
          placeBlockOrSplit(node);
          if (fecharPaginaDepois) page = null;
        }
        // Limpeza final: remove páginas geradas sem conteúdo útil
        Array.from(doc.querySelectorAll('.proposal-page[data-generated="1"]')).forEach((p) => {
          const stackEl = p.querySelector('.page-stack');
          if (!stackEl) return;
          const hasText = String(stackEl.textContent || '').trim().length > 0;
          const hasRenderable = !!stackEl.querySelector('table, img, svg, canvas, ul, ol, p, h1, h2, h3, h4, h5, h6');
          if (!hasText && !hasRenderable) {
            p.remove();
          }
        });

        // Renumera Pág. X/Y sobre as páginas atualmente VISÍVEIS (display !== 'none'),
        // devolvendo essa lista para reuso pelo sumário.
        function numerarPaginas() {
          const pages = Array.from(doc.querySelectorAll('.proposal-page')).filter(p => p.style.display !== 'none');
          const total = pages.length;
          pages.forEach((p, idx) => {
            const n = idx + 1;
            p.querySelectorAll('.js-page-number').forEach(el => { el.textContent = String(n); });
            p.querySelectorAll('.js-page-count').forEach(el => { el.textContent = String(total); });
          });
          return pages;
        }
        // Sumário: coleta títulos numerados (h2 "1." ... / h3 "5.x") das páginas geradas
        // e monta as linhas com o número real da página, como no modelo DOCX.
        function preencherSumario(pages) {
          const tocList = document.getElementById('tocList');
          if (!tocList) return;
          tocList.innerHTML = '';
          pages.forEach((p, idx) => {
            if (p.id === 'tocPage') return;
            p.querySelectorAll('h2, h3').forEach((h) => {
              const txt = String(h.textContent || '').trim();
              if (!/^\\d+(\\.\\d+)?[.\\s]/.test(txt)) return;
              const row = document.createElement('div');
              row.className = 'toc-row' + (h.tagName === 'H3' ? ' toc-sub' : '');
              const title = document.createElement('span');
              title.className = 'toc-title';
              title.textContent = txt;
              const dots = document.createElement('span');
              dots.className = 'toc-dots';
              const pageNo = document.createElement('span');
              pageNo.className = 'toc-page';
              pageNo.textContent = String(idx + 1);
              row.appendChild(title);
              row.appendChild(dots);
              row.appendChild(pageNo);
              tocList.appendChild(row);
            });
          });
        }

        // #1 — sumário que estoura a área útil sai da proposta (reversível):
        // preenche provisoriamente para medir; se o .page-content do tocPage
        // transbordar, esconde a página do sumário. A cada repaginação o estado é
        // reavaliado (o filtro de páginas ignora display:none), então se o usuário
        // remover cláusulas e o sumário voltar a caber, ele reaparece.
        const tocPage = document.getElementById('tocPage');
        if (tocPage) {
          tocPage.style.display = '';                    // re-testa a cada repaginação
          preencherSumario(numerarPaginas());            // provisório, para medir
          const pc = tocPage.querySelector('.page-content');
          if (pc && pc.scrollHeight > pc.clientHeight) tocPage.style.display = 'none';
        }
        const paginasFinais = numerarPaginas();          // renumera já sem (ou com) o sumário
        if (!tocPage || tocPage.style.display !== 'none') preencherSumario(paginasFinais);
      }
      window.paginateProposalContent = paginateProposalContent;
      const run = () => { try { paginateProposalContent(); } catch (_) {} };
      window.addEventListener('load', () => { run(); setTimeout(run, 250); });
      window.addEventListener('beforeprint', () => { run(); });
      let t = null;
      window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(run, 200); });
    })();
  </script>
</body>
</html>`;

    return substituirPlaceholdersProposta(html, proposta, itens, totais);
  } catch (error) {
    console.error('Erro na função gerarHTMLPropostaPremiumV2:', error);
    throw error;
  }
}

module.exports = { gerarHTMLPropostaPremiumV2, substituirPlaceholdersProposta };
