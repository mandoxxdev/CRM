/**
 * Otimização de imagens no UPLOAD.
 *
 * POR QUE: as imagens da proposta viajam embutidas em base64 dentro do HTML que gera o PDF.
 * Medido numa proposta real: 21 imagens, 25,71 MB de HTML, 13,7 s por PDF — sendo 8,8 s só
 * para o Chromium carregar o HTML e 4,0 s para renderizar. 94% do tempo era peso de imagem.
 * O PDF resultante saía com 17,4 MB, o que também trava anexo de e-mail.
 *
 * POR QUE NO UPLOAD, E NÃO NA HORA DE GERAR O PDF: cada proposta usa fotos diferentes, então
 * um cache no momento da geração quase nunca acertaria e o custo de redimensionar cairia em
 * cima de toda emissão. Otimizando no upload, a conta é feita UMA VEZ por foto, fora do
 * caminho crítico, e vale para todas as propostas que usarem aquela imagem.
 *
 * O QUE NÃO MUDA: o tamanho da imagem na página vem do CSS (largura em mm ou %), com
 * height: auto. Como a proporção é preservada, a altura renderizada é a mesma e a paginação
 * não muda. Isso é verificado em tests/otimizarImagem.test.js comparando página a página.
 *
 * O ORIGINAL NUNCA É DESTRUÍDO: fica ao lado, com sufixo .original. Se a régua mudar, ou se
 * algo sair errado, dá para refazer a partir dele.
 */
const fs = require('fs');
const path = require('path');

let sharp = null;
try {
  sharp = require('sharp');
} catch (_) {
  // Sem sharp o sistema continua funcionando — só não otimiza. Melhor uma proposta pesada
  // do que um upload que falha.
  console.warn('[imagem] sharp indisponível; upload segue sem otimização');
}

// 1400px cobre com folga o maior uso real: a foto do equipamento ocupa ~35% da largura de
// uma A4 (≈74mm), o que a 300 DPI daria ~870px. A folga existe para quem der zoom no PDF.
const LARGURA_MAXIMA = 1400;
const QUALIDADE_JPEG = 82;
const SUFIXO_ORIGINAL = '.original';
// Recomprimir também por PESO, e não só por largura. A primeira versão disto só olhava a
// largura, e por isso deixou passar mais da metade das imagens: uma foto de 900px cabe no
// teto e ainda assim pode ter 5 MB (PNG de foto, JPEG em qualidade máxima). Foi o que
// aconteceu em produção — 8 de 21 fotos otimizadas e o HTML do PDF sem encolher nada.
const PESO_MAXIMO_BYTES = 350 * 1024;

const ehImagemSuportada = (arquivo) => /\.(jpe?g|png|webp)$/i.test(arquivo);

/**
 * Reduz a imagem no lugar, guardando o original ao lado.
 * Devolve { otimizada, antes, depois } — antes/depois em bytes.
 * Nunca lança: falhar em otimizar não pode impedir o upload.
 */
async function otimizarImagem(caminhoAbsoluto) {
  const resultado = { otimizada: false, antes: 0, depois: 0, motivo: null };
  try {
    if (!sharp) { resultado.motivo = 'sharp indisponível'; return resultado; }
    if (!caminhoAbsoluto || !fs.existsSync(caminhoAbsoluto)) { resultado.motivo = 'arquivo não encontrado'; return resultado; }
    if (!ehImagemSuportada(caminhoAbsoluto)) { resultado.motivo = 'formato não tratado'; return resultado; }
    // Já processada antes: existe o .original ao lado.
    if (fs.existsSync(caminhoAbsoluto + SUFIXO_ORIGINAL)) { resultado.motivo = 'já otimizada'; return resultado; }

    resultado.antes = fs.statSync(caminhoAbsoluto).size;
    const meta = await sharp(caminhoAbsoluto).metadata();
    if (!meta.width) { resultado.motivo = 'sem dimensões legíveis'; return resultado; }
    // Vale mexer se for larga DEMAIS ou pesada DEMAIS. Só uma das duas condições já basta:
    // largura grande estoura o tempo de renderizar; peso grande estoura o de carregar.
    const larga = meta.width > LARGURA_MAXIMA;
    const pesada = resultado.antes > PESO_MAXIMO_BYTES;
    if (!larga && !pesada) {
      resultado.motivo = `já leve (${meta.width}px, ${(resultado.antes / 1024).toFixed(0)}KB)`;
      return resultado;
    }

    const ext = path.extname(caminhoAbsoluto).toLowerCase();
    // withoutEnlargement: nunca aumenta. fit inside preserva a proporção — é o que garante
    // que a altura renderizada (height: auto) continue igual e a paginação não mude.
    let pipeline = sharp(caminhoAbsoluto).rotate() // respeita o EXIF antes de redimensionar
      .resize({ width: LARGURA_MAXIMA, fit: 'inside', withoutEnlargement: true });
    if (ext === '.png') {
      // PNG guardando FOTO é o pior caso de peso. Sem canal alfa dá para reescrever como
      // JPEG dentro do mesmo arquivo .png — o navegador identifica a imagem pelo conteúdo,
      // não pela extensão, então nada muda para quem lê. Com transparência, mantém PNG.
      pipeline = meta.hasAlpha
        ? pipeline.png({ compressionLevel: 9, palette: true })
        : pipeline.jpeg({ quality: QUALIDADE_JPEG, mozjpeg: true });
    } else if (ext === '.webp') {
      pipeline = pipeline.webp({ quality: QUALIDADE_JPEG });
    } else {
      pipeline = pipeline.jpeg({ quality: QUALIDADE_JPEG, mozjpeg: true });
    }

    // Escreve num temporário primeiro: se algo falhar no meio, o arquivo servido continua
    // válido em vez de virar um arquivo truncado.
    const temporario = caminhoAbsoluto + '.tmp';
    await pipeline.toFile(temporario);
    const tamanhoNovo = fs.statSync(temporario).size;

    // Só troca se realmente ficou menor. Há imagens já bem comprimidas em que reprocessar
    // aumenta o arquivo — nesse caso o certo é não mexer.
    if (tamanhoNovo >= resultado.antes) {
      fs.unlinkSync(temporario);
      resultado.motivo = 'reprocessar não reduziria';
      return resultado;
    }

    fs.renameSync(caminhoAbsoluto, caminhoAbsoluto + SUFIXO_ORIGINAL);
    fs.renameSync(temporario, caminhoAbsoluto);
    resultado.depois = tamanhoNovo;
    resultado.otimizada = true;
    return resultado;
  } catch (e) {
    resultado.motivo = e.message;
    try { if (fs.existsSync(caminhoAbsoluto + '.tmp')) fs.unlinkSync(caminhoAbsoluto + '.tmp'); } catch (_) {}
    return resultado;
  }
}

/** Otimiza tudo o que já está numa pasta. Usado na conversão única das fotos existentes. */
async function otimizarPasta(pasta) {
  const resumo = { arquivos: 0, otimizadas: 0, antes: 0, depois: 0 };
  if (!pasta || !fs.existsSync(pasta)) return resumo;
  const arquivos = fs.readdirSync(pasta).filter((f) => ehImagemSuportada(f) && !f.endsWith(SUFIXO_ORIGINAL));
  for (const nome of arquivos) {
    resumo.arquivos += 1;
    const r = await otimizarImagem(path.join(pasta, nome));
    if (r.otimizada) {
      resumo.otimizadas += 1;
      resumo.antes += r.antes;
      resumo.depois += r.depois;
    }
  }
  return resumo;
}

module.exports = { otimizarImagem, otimizarPasta, LARGURA_MAXIMA, SUFIXO_ORIGINAL, temSharp: () => !!sharp };
