/**
 * Base de comparacao do documento em pt-BR (RN-BI.01, proposta bilingue).
 *
 * Tres propostas de teste (equipamento com variaveis e acessorio; pecas; Projeto Conceitual), geradas pelo template e
 * reduzidas a um hash sem as imagens em base64 (que pesam ~1,6 MB e nao mudam com o idioma). O hash de referencia foi
 * tirado do template ANTES da etapa bilingue (24/11/2026); o teste exige que pt-BR — e proposta sem idioma — continue
 * saindo byte a byte igual.
 */
const crypto = require('crypto');
const { gerarHTMLPropostaPremiumV2 } = require('../../templates/propostaPremiumV2');
const { getClausulasDefault } = require('../../clausulasDefault');
const { getClausulasHelices } = require('../../clausulasHelices');
const { getClausulasProjetoConceitual } = require('../../clausulasProjetoConceitual');

const comoGravadas = (lista) => lista.map((c, i) => ({ id: 500 + i, titulo: `${c.numero} ${c.titulo}`, conteudo: c.conteudo }));

const CASOS = {
  equipamento: {
    proposta: { id: 1, numero_proposta: '100-01-XX-2026-REV00', titulo: 'MASSEIRA BIMIX', razao_social: 'CLIENTE TESTE LTDA', cnpj: '00.000.000/0001-00',
      cliente_email: 'compras@cliente.test', cliente_contato: 'FULANO', cliente_telefone: '(11) 4000-0000', margem_desconto: 5 },
    itens: [{ id: 11, produto_nome: 'Masseira Bimix', descricao: 'MASSEIRA BIMIX', quantidade: 1, unidade: 'UN', valor_unitario: 150000, valor_total: 150000,
      familia_produto: 'MASSEIRAS', codigo_produto: 'MB-500', produto_modelo: 'MB-500', especificacoes_tecnicas: JSON.stringify({ potencia: '30', capacidade: '500' }),
      acessorios: JSON.stringify([{ descricao: 'Painel com inversor', quantidade: 1, valor_unitario: 12000 }]) }],
    config: () => ({
      clausulas_custom: comoGravadas(getClausulasDefault()),
      variaveis_proposta_tecnica: ['potencia', 'capacidade'],
      variaveis_proposta_labels: { potencia: { nome: 'Potência', prefixo: '', sufixo: 'CV', tipo: 'texto', ativo: 1 },
        capacidade: { nome: 'Capacidade', prefixo: '', sufixo: 'L', tipo: 'texto', ativo: 1 } },
      variaveis_proposta_labels_ok: true,
      variaveis_da_familia: { MASSEIRAS: ['potencia', 'capacidade'] },
      grupo_por_familia: { MASSEIRAS: 'Masseiras' },
      modelo_por_familia: {},
    }),
  },
  pecas: {
    proposta: { id: 2, numero_proposta: '100-02-XX-2026-REV00', titulo: 'DISCO DISPERSOR', razao_social: 'CLIENTE TESTE LTDA', cnpj: '1' },
    itens: [{ id: 21, produto_nome: 'Disco Dispersor 300mm', quantidade: 2, unidade: 'UN', valor_unitario: 900, valor_total: 1800, familia_produto: 'DISCOS', especificacoes_tecnicas: '{}' }],
    config: () => ({ clausulas_custom: comoGravadas(getClausulasHelices()), grupo_por_familia: { DISCOS: 'Hélices e Acessórios' }, modelo_por_familia: { DISCOS: 'Hélices e Discos' } }),
  },
  projetoConceitual: {
    proposta: { id: 3, numero_proposta: '100-03-XX-2026-REV00', titulo: 'PROJETO CONCEITUAL – NOVA UNIDADE FABRIL', razao_social: 'CLIENTE TESTE LTDA', cnpj: '1' },
    itens: [{ id: 31, produto_nome: 'Projeto Conceitual', quantidade: 1, unidade: 'UN', valor_unitario: 139870, valor_total: 139870, familia_produto: 'PROJETO CONCEITUAL GMP', especificacoes_tecnicas: '{}' }],
    config: () => ({ clausulas_custom: comoGravadas(getClausulasProjetoConceitual()), modelo_por_familia: { 'PROJETO CONCEITUAL GMP': 'Projeto Conceitual' } }),
  },
};

const semImagens = (html) => html.replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, 'data:IMG');

function htmlDoCaso(nome, extraConfig = {}, forPdfServer = true) {
  const c = CASOS[nome];
  const totais = { total: c.itens.reduce((s, i) => s + i.valor_total, 0), dataEmissao: '24/11/2026', dataValidade: '09/12/2026' };
  return gerarHTMLPropostaPremiumV2({ ...c.proposta }, c.itens.map((i) => ({ ...i })), totais, { ...c.config(), ...extraConfig }, 'http://localhost:5000', forPdfServer, true);
}

function hashDoCaso(nome, extraConfig = {}, forPdfServer = true) {
  return crypto.createHash('sha256').update(semImagens(htmlDoCaso(nome, extraConfig, forPdfServer))).digest('hex');
}

// Tirados do template em 4de32918 (antes da etapa bilingue), 24/11/2026. EXCETO projetoConceitual: regerado em 24/11/2026 (tarde)
// porque a proposta de servico passou a seguir a proposta de origem (1 a 20, sem secao de equipamento) — mudanca INTENCIONAL. Se uma mudanca INTENCIONAL do documento pt-BR
// alterar estes hashes, regere-os e diga no commit o que mudou — nunca regere para fazer o teste passar.
const BASE = {
  pdf: {
    equipamento: '65d5a26b985a8fe7794cacc4b255ee685402ac62251c0846aa0390c4a222e88d',
    pecas: '6afe985d246b28512741aa854054b5678a273d871f0c860433eddbc4538b0ba3',
    projetoConceitual: '52460a1f2f054fe757d1c555eabf71935318b58e3fa5ec383ef3b910bc3d2d4a',
  },
  preview: {
    equipamento: 'fdbc1279703e0d596c5620bf3a51190a154a3f1bc61d9ebe8ed296657daa5ed9',
    pecas: '36ab5fcd6c0d76279d6cbc2ceaa5c9bcb609ac71bce03d04ac12dea1031b1645',
    projetoConceitual: 'dd446e900954627afe607b98dfeffd9bd8f6ad009b5bd77f0f22c712d101cbf2',
  },
};

module.exports = { CASOS, BASE, htmlDoCaso, hashDoCaso, semImagens };
