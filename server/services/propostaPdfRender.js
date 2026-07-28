'use strict';

/** Largura A4 em CSS px (210mm @ 96dpi) — igual ao .proposal-page no template. */
const PROPOSTA_PDF_VIEWPORT = { width: 794, height: 1123, deviceScaleFactor: 1 };

function htmlJaPaginado(html) {
  return /data-pagination-frozen=["']1["']/i.test(String(html || ''));
}

function marcarHtmlPaginado(html) {
  const s = String(html || '');
  if (/data-pagination-frozen=["']1["']/i.test(s)) return s;
  if (/<html[^>]*>/i.test(s)) {
    return s.replace(/<html([^>]*)>/i, (m, attrs) => {
      if (/data-pagination-frozen=/i.test(attrs)) return m;
      return `<html${attrs} data-pagination-frozen="1">`;
    });
  }
  return s;
}

async function aguardarRecursosPaginacao(page) {
  await page.evaluate(async () => {
    if (document.documentElement.getAttribute('data-pagination-frozen') === '1') return;
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
    } catch (_) { /* segue */ }
    await Promise.all(
      Array.from(document.images)
        .filter((img) => !img.complete)
        .map((img) => new Promise((resolve) => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
        }))
    );
  });
}

async function executarPaginacao(page) {
  const frozen = await page.evaluate(() => document.documentElement.getAttribute('data-pagination-frozen') === '1');
  if (frozen) return;
  await page.evaluate(() => {
    if (typeof window.paginateProposalContent === 'function') window.paginateProposalContent();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate(() => {
    if (document.documentElement.getAttribute('data-pagination-frozen') === '1') return;
    if (typeof window.paginateProposalContent === 'function') window.paginateProposalContent();
    window.dispatchEvent(new Event('beforeprint'));
  });
  await new Promise((r) => setTimeout(r, 450));
}

async function htmlPropostaParaPdfBuffer(html, launchOptions) {
  const puppeteer = require('puppeteer');
  let browser = null;
  try {
    browser = await puppeteer.launch({
      ...launchOptions,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        ...(launchOptions.args || []),
      ],
    });
    const page = await browser.newPage();
    await page.setViewport(PROPOSTA_PDF_VIEWPORT);
    await page.setContent(html, {
      waitUntil: ['load', 'domcontentloaded'],
      timeout: 60000,
    });
    await new Promise((r) => setTimeout(r, htmlJaPaginado(html) ? 200 : 1200));
    await aguardarRecursosPaginacao(page);
    await executarPaginacao(page);

    const pdfResult = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      scale: 1.0,
    });
    return Buffer.from(pdfResult);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = {
  PROPOSTA_PDF_VIEWPORT,
  htmlJaPaginado,
  marcarHtmlPaginado,
  htmlPropostaParaPdfBuffer,
};
