/**
 * Etapa 155 (RN-155.04, C351) — o codigo do produto vai codificado no endereco, e so esta funcao monta o endereco.
 * O lado do servidor (o caminho codificado acha o produto, o cru com barra nao) esta em
 * server/tests/api/produtosGruposVariaveisPortao.api.test.js.
 */
import fs from 'fs';
import path from 'path';
import { caminhoDoProdutoPeloCodigo } from './produtoPeloCodigo';

describe('[RN-155.04, C351] caminhoDoProdutoPeloCodigo', () => {
  it('codifica os caracteres que mudariam o endereco (/, ?, #, %, espaco) e deixa o codigo comum igual', () => {
    expect(caminhoDoProdutoPeloCodigo('E155/A')).toBe('/produtos/codigo/E155%2FA');
    expect(caminhoDoProdutoPeloCodigo('E155?B')).toBe('/produtos/codigo/E155%3FB');
    expect(caminhoDoProdutoPeloCodigo('E155#C')).toBe('/produtos/codigo/E155%23C');
    expect(caminhoDoProdutoPeloCodigo('E155%D')).toBe('/produtos/codigo/E155%25D');
    expect(caminhoDoProdutoPeloCodigo('E155 E')).toBe('/produtos/codigo/E155%20E');
    expect(caminhoDoProdutoPeloCodigo('E155%2F')).toBe('/produtos/codigo/E155%252F');
    expect(caminhoDoProdutoPeloCodigo('PROD-0001')).toBe('/produtos/codigo/PROD-0001');
    expect(caminhoDoProdutoPeloCodigo(42)).toBe('/produtos/codigo/42');
  });

  it('inventario: nenhum arquivo do client (fora dos testes) cita /produtos/codigo/ alem desta funcao; as tres telas da OS a usam', () => {
    const src = path.join(__dirname, '..');
    const citam = [];
    const usam = [];
    const andar = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { andar(p); continue; }
        if (!/\.(js|jsx|ts|tsx)$/.test(e.name) || /\.test\./.test(e.name)) continue;
        // sem os comentarios (um uso so num comentario nao conta — Fase 5 r3 P3), e o caminho em qualquer forma: literal, concatenado ou em
        // partes (`['', 'produtos', 'codigo', x].join('/')`)
        const texto = fs.readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, '$1');
        const rel = path.relative(src, p).split(path.sep).join('/');
        if (/produtos\W{0,8}codigo/.test(texto)) citam.push(rel);
        if (/api\.get\(caminhoDoProdutoPeloCodigo\(/.test(texto)) usam.push(rel);
      }
    };
    andar(src);
    expect(citam).toEqual(['utils/produtoPeloCodigo.js']);
    expect(usam.sort()).toEqual(['components/OSComercialForm.js', 'components/OSDetalhesForm.js', 'components/PreviewOSEditavel.js']);
  });
});
