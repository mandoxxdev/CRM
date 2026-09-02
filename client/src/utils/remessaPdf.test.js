/**
 * Etapa 8b, Task 9 — descritor do documento de remessa.
 *
 * O montador e testado como funcao PURA: assertar sobre bytes de PDF nao diz se o numero certo foi
 * para a coluna certa, e num documento que acompanha material saindo do predio essa e a unica falha
 * que importa. Mesmo padrao de utils/posicaoClientePdf.js (Etapa 8) e utils/etiquetasPdf.js (6c).
 *
 * Executar: cd client && CI=true npx react-scripts test src/utils/remessaPdf --watchAll=false
 */
import { montarRemessaPDF } from './remessaPdf';

const REMESSA = {
  numero: 'REM-12345678',
  fornecedor_nome: 'Galvanizadora Sul LTDA',
  tipo_servico: 'Galvanizacao',
  prazo_previsto: '2026-09-30',
  status: 'ENVIADA',
  observacoes: 'carga fechada',
  proprietario_cliente_id: null,
  proprietario_cliente_nome: null,
};
const ITENS = [
  { material_codigo: 'CHP-3MM', material_nome: 'Chapa 3mm', unidade: 'PC', quantidade: 30, peso: 240, quantidade_retornada: 0 },
  { material_codigo: 'TUB-2', material_nome: 'Tubo 2"', unidade: 'M', quantidade: 12, peso: null, quantidade_retornada: 4 },
];

describe('montarRemessaPDF', () => {
  test('o titulo traz o numero da remessa e o terceiro', () => {
    const doc = montarRemessaPDF({ remessa: REMESSA, itens: ITENS, geradoEm: '2026-08-12T00:00:00Z' });
    expect(doc.titulo).toContain('REM-12345678');
    expect(doc.subtitulo).toContain('Galvanizadora Sul LTDA');
    expect(doc.subtitulo).toContain('Galvanizacao');
  });

  test('cada item vira uma linha com codigo, nome, unidade, quantidade e peso', () => {
    const doc = montarRemessaPDF({ remessa: REMESSA, itens: ITENS });
    expect(doc.linhasItens).toHaveLength(2);
    expect(doc.linhasItens[0]).toEqual(['CHP-3MM', 'Chapa 3mm', 'PC', '30', '240']);
    // Peso ausente vira '—', nao 'null' nem '0': zero quilo e uma afirmacao, ausencia nao e.
    expect(doc.linhasItens[1]).toEqual(['TUB-2', 'Tubo 2"', 'M', '12', '—']);
  });

  test('o prazo previsto aparece formatado em pt-BR', () => {
    const doc = montarRemessaPDF({ remessa: REMESSA, itens: ITENS });
    expect(doc.prazo).toBe('30/09/2026');
  });

  test('sem prazo o documento diz "sem prazo definido", e nao uma data inventada', () => {
    const doc = montarRemessaPDF({ remessa: { ...REMESSA, prazo_previsto: null }, itens: ITENS });
    expect(doc.prazo).toMatch(/sem prazo/i);
  });

  test('DOCUMENTO DE MATERIAL DE CLIENTE NOMEIA O PROPRIETARIO', () => {
    // Decisao 5: a isencao da guarda do dono so e aceitavel COM esta contrapartida. Sem o nome no
    // papel, material de cliente sai do predio sem rastro de propriedade.
    const doc = montarRemessaPDF({
      remessa: { ...REMESSA, proprietario_cliente_id: 7, proprietario_cliente_nome: 'Cliente Chapa LTDA' },
      itens: ITENS,
    });
    expect(doc.proprietario).toContain('Cliente Chapa LTDA');
  });

  test('[CONTROLE POSITIVO] material NOSSO nao inventa proprietario', () => {
    // A metade que falta: escrever sempre "material de cliente" passaria no teste acima e poria
    // um dono falso em todo documento de material nosso.
    const doc = montarRemessaPDF({ remessa: REMESSA, itens: ITENS });
    expect(doc.proprietario).toBeNull();
  });

  test('o total de itens e a soma das quantidades batem com a lista', () => {
    const doc = montarRemessaPDF({ remessa: REMESSA, itens: ITENS });
    expect(doc.totalItens).toBe(2);
    expect(doc.totalQuantidade).toBe(42);
  });

  test('remessa sem itens nao quebra o montador', () => {
    const doc = montarRemessaPDF({ remessa: REMESSA });
    expect(doc.linhasItens).toEqual([]);
    expect(doc.totalQuantidade).toBe(0);
  });

  // ── Encerramento: o que NAO voltou ────────────────────────────────────────────────────────────
  // Task 7 (thirdPartyService.encerrarRemessa) grava `quantidade_retornada = quantidade` nos itens
  // pendentes ao encerrar com destino — ali isso significa LIQUIDADO, nao "voltou". A verdade do
  // que voltou esta em retornos_remessa_item_almoxarifado; o cabecalho guarda
  // `encerramento_destino`. Sem ler o destino, este documento afirmaria que o material voltou
  // quando ele se perdeu no terceiro.

  test('remessa encerrada por PERDA declara a baixa definitiva e o destino', () => {
    const doc = montarRemessaPDF({
      remessa: {
        ...REMESSA, status: 'ENCERRADA', encerramento_destino: 'PERDA_NO_TERCEIRO',
        encerramento_justificativa: 'sumiu no banho de zinco',
      },
      itens: ITENS,
    });
    expect(doc.encerramento).toMatch(/perda no terceiro/i);
    expect(doc.encerramento).toMatch(/baixa definitiva/i);
    expect(doc.encerramento).toContain('sumiu no banho de zinco');
  });

  test('remessa encerrada por CONSUMO nomeia o consumo, e nao a perda', () => {
    // Os dois destinos baixam estoque, mas dizem coisas diferentes ao operador: "virou cavaco" nao
    // e "sumiu". Trocar um pelo outro no papel troca a explicacao do desaparecimento.
    const doc = montarRemessaPDF({
      remessa: {
        ...REMESSA, status: 'ENCERRADA', encerramento_destino: 'CONSUMIDO_NO_PROCESSO',
        encerramento_justificativa: 'virou cavaco na usinagem',
      },
      itens: ITENS,
    });
    expect(doc.encerramento).toMatch(/consumido no processo/i);
    expect(doc.encerramento).not.toMatch(/perda no terceiro/i);
  });

  test('[CONTROLE POSITIVO] remessa em curso nao declara encerramento nenhum', () => {
    const doc = montarRemessaPDF({ remessa: REMESSA, itens: ITENS });
    expect(doc.encerramento).toBeNull();
  });

  test('[CONTROLE POSITIVO] remessa que voltou inteira encerra SEM destino e nao inventa baixa', () => {
    // Retorno total encerra sozinho, com `encerramento_destino` NULL — e isso e correto, nao buraco
    // (comentario de encerrarRemessa). Escrever "baixa definitiva" aqui afirmaria uma perda que
    // nao houve num papel que o terceiro assinou.
    const doc = montarRemessaPDF({
      remessa: { ...REMESSA, status: 'ENCERRADA', encerramento_destino: null },
      itens: ITENS,
    });
    expect(doc.encerramento).toBeNull();
  });
});
