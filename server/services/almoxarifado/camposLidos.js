/**
 * Etapa 125 (D (124), B805, B806) — as colunas do cadastro de material que o formulario manda como LIDAS (`campos_lidos` no
 * `PUT /materiais/:id`): as que ele mostra e que o `PUT` grava, fora as que ja tem chave propria — os controles de lote e serie
 * (`controles_lidos`, Etapa 116) e a familia e a subfamilia (`familia_lida`, Etapa 124). Ordem = ordem da tela; rotulo = o da
 * tela, sem a unidade entre parenteses. A lista e o contrato congelado no plano da Etapa 125 — o cliente
 * (`MaterialAlmoxarifadoForm.js`) tem a mesma, e os dois testes a escrevem por extenso.
 *
 * Fora, de proposito: as quantidades que o motor grava (nao estao no PUT), `ativo`, e as colunas que a tela nao manda
 * (`categoria_id`, `subcategoria_id`, `fornecedor_id`, `unidade_consumo`, `fator_conversao_consumo` — preserve-when-omitted).
 * `custo_unitario` ENTRA (B806): o recebimento grava o ultimo custo de compra, e o formulario aberto o regravava calado.
 *
 * Tipos (a normalizacao de `materialService.camposDesfeitos`): 'caixa' (0/1), 'id' (0/''/null iguais), 'numero', 'numero0'
 * (NULL vale 0 — Fase 5, r1 M1: a aba Estoques minimos regrava o minimo e o maximo NULL como 0 ao mudar so o prazo, e o
 * formulario aberto antes recusava por um campo que ninguem mudou), 'texto'.
 */
const CAMPOS_LIDOS = [
  ['codigo', 'Código', 'texto'],
  ['nome', 'Nome do Material', 'texto'],
  ['descricao', 'Descrição', 'texto'],
  ['descricao_tecnica', 'Descrição Técnica', 'texto'],
  ['categoria', 'Categoria', 'texto'],
  ['tipo_material', 'Tipo de Material', 'texto'],
  ['material_critico', 'Material crítico', 'caixa'],
  ['proprietario_cliente_id', 'Proprietário', 'id'],
  ['fabricante', 'Fabricante', 'texto'],
  ['codigo_fabricante', 'Código no Fabricante', 'texto'],
  ['marca', 'Marca', 'texto'],
  ['modelo', 'Modelo', 'texto'],
  ['norma', 'Norma Técnica', 'texto'],
  ['material_construtivo', 'Material Construtivo', 'texto'],
  ['peso_unitario', 'Peso Unitário', 'numero'],
  ['dimensoes', 'Dimensões', 'texto'],
  ['ncm', 'NCM', 'texto'],
  ['aplicacao', 'Aplicação', 'texto'],
  ['especificacoes', 'Especificações Técnicas', 'texto'],
  ['observacoes', 'Observações Gerais', 'texto'],
  ['unidade', 'Unidade de Medida', 'texto'],
  ['quantidade_minima', 'Estoque Mínimo', 'numero0'],
  ['quantidade_maxima', 'Estoque Máximo', 'numero0'],
  ['ponto_reposicao', 'Ponto de Reposição', 'numero'],
  ['lote_economico', 'Lote Econômico', 'numero'],
  ['localizacao_padrao_id', 'Localização no estoque', 'id'],
  ['controle_validade', 'Controle de validade', 'caixa'],
  ['controle_corrida', 'Controle de corrida', 'caixa'],
  ['controle_certificado', 'Requer certificado', 'caixa'],
  ['requer_inspecao', 'Requer inspeção', 'caixa'],
  ['requer_foto', 'Requer foto', 'caixa'],
  ['classe_abc', 'Classe ABC', 'texto'],
  ['custo_unitario', 'Custo Unitário', 'numero'],
  ['unidade_compra', 'Como é comprado', 'texto'],
  ['fator_conversao_compra', 'Como é comprado', 'numero'],
  ['fornecedor_principal', 'Fornecedor Principal', 'texto'],
  ['codigo_fornecedor', 'Código no Fornecedor', 'texto'],
  // Etapa 178 (I4): o CA do EPI — o formulario que manda estes dois em `campos_lidos` ganha o 409 de quem mudou por outro.
  // Quem nao manda (a tela antes da T2 da 178) nao e comparado: a conferencia so olha as chaves presentes.
  ['ca_numero', 'Número do CA', 'texto'],
  ['ca_validade', 'Validade do CA', 'texto'],
];

const COLUNAS_CAMPOS_LIDOS = CAMPOS_LIDOS.map(([col]) => col);

module.exports = { CAMPOS_LIDOS, COLUNAS_CAMPOS_LIDOS };
