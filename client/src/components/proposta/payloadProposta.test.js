/**
 * Etapa 138 (RN-08) — o corpo que o formulário de proposta manda no salvar.
 *
 * O servidor passou a tratar a chave AUSENTE como "mantém" e a PRESENTE (inclusive null) como "grava": os campos que o formulário
 * apaga têm de ir como `null` (chave presente), não `undefined` (o JSON a omite e o servidor manteria o valor antigo).
 * Plano: docs/superpowers/plans/2026-10-17-almoxarifado-etapa138-payload-parcial-nos-put.md
 */
import { montarPayloadProposta } from './payloadProposta';

const formBase = {
  numero_proposta: '001-01-AB-2026-REV00', cliente_id: '7', titulo: 'PROP', descricao: '', validade: '2026-12-31',
  condicoes_pagamento: '', prazo_entrega: '', garantia: '', observacoes: '', oportunidade_id: '', tipo_proposta: '', expira_em: '',
  responsavel_id: '', margem_desconto: 0, status: 'rascunho', origem_busca: '', motivo_nao_venda: '', familia_produto: '',
  lembrete_data: '', lembrete_mensagem: '', probabilidade: 50, data_fechamento: ''
};
const montar = (form, extra = {}) => montarPayloadProposta({
  form, itens: [], statusSalvar: form.status, valorTotal: 0, maxDesc: 0, exigeMotivo: false, ...extra
});
// o que de fato vai pela rede
const naRede = (p) => JSON.parse(JSON.stringify(p));

describe('montarPayloadProposta (RN-08)', () => {
  test('[RN-08] Tipo "—", Fechamento, oportunidade e expiração vazios vão como null — a chave PRESENTE no JSON', () => {
    const corpo = naRede(montar(formBase));
    for (const k of ['tipo_proposta', 'data_fechamento', 'oportunidade_id', 'expira_em']) {
      expect(Object.prototype.hasOwnProperty.call(corpo, k)).toBe(true);
      expect(corpo[k]).toBeNull();
    }
  });

  test('[RN-08] com valor, os mesmos de antes (a oportunidade como número)', () => {
    const corpo = naRede(montar({ ...formBase, tipo_proposta: 'tecnica', data_fechamento: '2026-10-01', oportunidade_id: '12', expira_em: '2026-11-30' }));
    expect(corpo).toMatchObject({ tipo_proposta: 'tecnica', data_fechamento: '2026-10-01', oportunidade_id: 12, expira_em: '2026-11-30' });
  });

  test('[RN-08] o responsável vazio continua AUSENTE (o servidor mantém o gravado); com valor, número', () => {
    expect(Object.prototype.hasOwnProperty.call(naRede(montar(formBase)), 'responsavel_id')).toBe(false);
    expect(naRede(montar({ ...formBase, responsavel_id: '3' })).responsavel_id).toBe(3);
  });

  test('[RN-08] o resto como sempre: cliente número, vazios de texto viram null, motivo só quando exigido, itens com acessórios em JSON', () => {
    const corpo = naRede(montarPayloadProposta({
      form: { ...formBase, motivo_nao_venda: 'CARO', origem_busca: '', lembrete_mensagem: 'ligar' },
      itens: [{ descricao: 'ITEM', quantidade: 1, unidade: 'UN', valor_unitario: 10, valor_total: 10, codigo_produto: ' P1 ', acessorios: [] }],
      statusSalvar: 'rascunho', valorTotal: 10, maxDesc: 2, exigeMotivo: false
    }));
    expect(corpo).toMatchObject({ cliente_id: 7, valor_total: 10, margem_desconto: 2, motivo_nao_venda: null, origem_busca: null, lembrete_mensagem: 'ligar', probabilidade: 50 });
    expect(corpo.itens).toEqual([{ descricao: 'ITEM', quantidade: 1, unidade: 'UN', valor_unitario: 10, valor_total: 10, codigo_produto: 'P1',
      familia_produto: null, regiao_busca: null, desconto_percentual: 0, preco_tabela: null, acessorios: '[]' }]);
    expect(naRede(montarPayloadProposta({ form: { ...formBase, motivo_nao_venda: 'CARO' }, itens: [], statusSalvar: 'rejeitada', valorTotal: 0, maxDesc: 0, exigeMotivo: true })).motivo_nao_venda).toBe('CARO');
  });

  // Etapa 142 (RN-142.01, C298): o id do item gravado vai junto; o item incluído na tela vai sem a chave.
  test('[RN-142.01] o item gravado leva o id; o novo vai sem a chave', () => {
    const corpo = naRede(montarPayloadProposta({
      form: formBase,
      itens: [
        { id: 12, descricao: 'P', quantidade: 1, unidade: 'UN', valor_unitario: 1, valor_total: 1, codigo_produto: 'P1', acessorios: [] },
        { descricao: 'P', quantidade: 1, unidade: 'UN', valor_unitario: 1, valor_total: 1, codigo_produto: 'P1', acessorios: [] },
        { id: null, descricao: 'Q', quantidade: 1, unidade: 'UN', valor_unitario: 1, valor_total: 1, codigo_produto: 'Q1', acessorios: [] },
      ],
      statusSalvar: 'rascunho', valorTotal: 3, maxDesc: 0, exigeMotivo: false
    }));
    expect(corpo.itens[0].id).toBe(12);
    expect(Object.prototype.hasOwnProperty.call(corpo.itens[1], 'id')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(corpo.itens[2], 'id')).toBe(false);
  });

  // Fase 5 (r3, K05): sem o `...form`, toda edicao de titulo, descricao, garantia... sumiria calada.
  test('[RN-08] os campos do formulário passam como estão (título, descrição, número, garantia, validade)', () => {
    const corpo = naRede(montar({ ...formBase, titulo: 'NOVO', descricao: 'D', garantia: '12 MESES', validade: '2027-01-01' }));
    expect(corpo).toMatchObject({ numero_proposta: '001-01-AB-2026-REV00', titulo: 'NOVO', descricao: 'D', garantia: '12 MESES', validade: '2027-01-01' });
  });

  // Fase 5 (r3, K06/K07): nenhum teste renderiza o PropostaForm; a chamada fica presa pelo texto (os argumentos certos, o total dos itens).
  test('[RN-08] o PropostaForm monta o corpo por montarPayloadProposta com os argumentos certos', () => {
    // eslint-disable-next-line global-require
    const fs = require('fs');
    // eslint-disable-next-line global-require
    const path = require('path');
    const fonte = fs.readFileSync(path.join(__dirname, 'PropostaForm.js'), 'utf8');
    expect(fonte.split('const payload = montarPayloadProposta({ form, itens, statusSalvar, valorTotal, maxDesc, exigeMotivo });').length).toBe(2);
    expect(fonte.split('const valorTotal = subtotalItens;').length).toBe(2);
  });
});
