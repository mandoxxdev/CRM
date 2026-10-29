/**
 * Frota Etapa 9 (RN-F9.13/14/15/16, ajuste A6) — o endereco do destino: CEP que busca, ou os campos a mao.
 *
 * Um componente so para os tres lugares que cadastram destino: o "+ Novo destino" da saida no portal, a tela Destinos do gestor e o
 * "+ Novo destino" da Viagem do gestor (plano docs/superpowers/plans/2026-10-29-frotas-etapa9-endereco-do-destino.md).
 *
 *   - CEP + "Buscar" (e sair do campo com 8 digitos) chama GET /api/cep/:cep ({cep, logradouro, bairro, cidade, estado}).
 *   - A resposta SUBSTITUI rua, bairro, cidade e UF, inclusive pelo vazio (A6, B93): CEP generico de cidade limpa rua e bairro, e
 *     trocar o CEP troca a rua junto. Numero e complemento nunca sao tocados. (No fornecedor o CEP so completa os vazios — aqui nao.)
 *   - Todos os campos ficam sempre editaveis: quem nao sabe o CEP preenche a mao.
 *   - Quem decide e o servidor (B91): a tela nao exige nada alem do nome; a mensagem dele aparece no bloco.
 *
 * Os campos nao levam `required`: o bloco do portal fica dentro do formulario da saida (o navegador travaria o Salvar da saida com o
 * bloco aberto) e o formulario do gestor reativa destino antigo sem endereco (A2).
 */
import React, { useState, useRef } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { somenteDigitos, formatarCEP } from '../../utils/cnpj';

export const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN',
  'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

export const DICA_SEM_CEP = 'Não sabe o CEP? Preencha os campos à mão.';
export const MSG_CEP_NAO_ENCONTRADO = 'CEP não encontrado — preencha o endereço à mão';
export const MSG_CEP_FALHOU = 'Não foi possível consultar o CEP — preencha o endereço à mão';
export const MSG_CEP_INCOMPLETO = 'CEP deve ter 8 dígitos';
export const MSG_FALHA_DESTINO = 'Não foi possível adicionar o destino. Confira a internet e tente de novo.';

export const CAMPOS_ENDERECO = ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf'];
export const ENDERECO_VAZIO = { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '' };

const texto = (v) => (v == null ? '' : String(v));

/** RN-F9.16: "Nome — Cidade/UF" quando ha cidade; senao so o nome. */
export function rotuloDestino(d) {
  if (!d) return '';
  const cidade = texto(d.cidade).trim();
  if (!cidade) return d.nome;
  const uf = texto(d.uf).trim();
  return `${d.nome} — ${uf ? `${cidade}/${uf}` : cidade}`;
}

const ROTULOS = {
  cep: 'CEP',
  logradouro: 'Rua',
  numero: 'Número',
  complemento: 'Complemento (opcional)',
  bairro: 'Bairro',
  cidade: 'Cidade',
  uf: 'Estado (UF)',
};
const LIMITES = { logradouro: 150, numero: 20, complemento: 60, bairro: 80, cidade: 80 };

/**
 * @param valor      objeto com as 7 chaves (as que faltarem valem '')
 * @param aoMudar    recebe um PATCH ({chave: valor}); o pai mescla no estado dele (a busca do CEP e assincrona: mesclar evita apagar
 *                   o que a pessoa digitou enquanto ela corria)
 * @param variante   'portal' (celular, classes portal-*) ou 'gestor' (itens do grid do modal, classes frotas-form-group)
 * @param prefixo    prefixo dos `name` dos campos (ex.: 'novo_destino_')
 * @param enderecoAntigo  A2: texto do endereco antigo (destino gravado antes da Etapa 9), mostrado so para leitura acima dos campos
 */
export default function EnderecoDestinoCampos({
  valor, aoMudar, variante = 'portal', prefixo = '', desabilitado = false, enderecoAntigo = '',
}) {
  const v = { ...ENDERECO_VAZIO, ...(valor || {}) };
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState('');
  const emAndamentoRef = useRef(null); // digitos da consulta em curso (sair do campo + clicar Buscar nao consulta duas vezes)
  const cepAtualRef = useRef(somenteDigitos(v.cep));
  cepAtualRef.current = somenteDigitos(v.cep);

  const buscar = async (origem) => {
    const digitos = somenteDigitos(v.cep);
    if (digitos.length !== 8) {
      // RN-F9.14: menos de 8 digitos nao consulta. So o botao avisa (sair do campo pela metade nao incomoda).
      if (origem === 'botao' && digitos.length > 0) setAviso(MSG_CEP_INCOMPLETO);
      return;
    }
    if (emAndamentoRef.current === digitos) return;
    emAndamentoRef.current = digitos;
    setBuscando(true);
    setAviso('');
    try {
      const { data } = await api.get(`/cep/${digitos}`);
      // A pessoa trocou o CEP enquanto a consulta corria: a resposta e de outro CEP, nao serve.
      if (cepAtualRef.current !== digitos) return;
      // A6 (B93): substitui pelo que veio, INCLUSIVE vazio. Numero e complemento nao entram no patch.
      aoMudar({
        cep: formatarCEP(digitos),
        logradouro: texto(data?.logradouro),
        bairro: texto(data?.bairro),
        cidade: texto(data?.cidade),
        uf: texto(data?.estado).toUpperCase(),
      });
    } catch (err) {
      if (cepAtualRef.current !== digitos) return;
      setAviso(err?.response?.status === 404 ? MSG_CEP_NAO_ENCONTRADO : MSG_CEP_FALHOU);
    } finally {
      if (emAndamentoRef.current === digitos) emAndamentoRef.current = null;
      setBuscando(false);
    }
  };

  const portal = variante === 'portal';
  const desligado = desabilitado;

  const campoCep = (
    <div className={portal ? 'endereco-cep-linha portal-destino-linha' : 'endereco-cep-linha frotas-endereco-cep-linha'}>
      <input
        type="text"
        name={`${prefixo}cep`}
        inputMode="numeric"
        placeholder="00000-000"
        maxLength={9}
        value={v.cep}
        disabled={desligado}
        aria-label="CEP"
        onChange={(e) => { aoMudar({ cep: formatarCEP(e.target.value.slice(0, 9)) }); setAviso(''); }}
        onBlur={() => buscar('blur')}
      />
      <button
        type="button"
        className={portal ? 'portal-botao secundario endereco-botao-buscar' : 'frotas-btn frotas-btn-secondary endereco-botao-buscar'}
        disabled={desligado || buscando}
        onClick={() => buscar('botao')}
      >
        {buscando ? 'Buscando…' : 'Buscar'}
      </button>
    </div>
  );

  const entrada = (chave) => (
    <input
      type="text"
      name={`${prefixo}${chave}`}
      value={v[chave]}
      maxLength={LIMITES[chave]}
      disabled={desligado}
      onChange={(e) => aoMudar({ [chave]: e.target.value })}
    />
  );
  const selectUf = (
    <select name={`${prefixo}uf`} value={v.uf} disabled={desligado} onChange={(e) => aoMudar({ uf: e.target.value })}>
      <option value="">UF…</option>
      {/* UF gravada fora da lista (nao deveria haver: o servidor recusa) aparece em vez de sumir do select. */}
      {v.uf && !UFS.includes(v.uf) && <option value={v.uf}>{v.uf}</option>}
      {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
    </select>
  );

  const avisoCep = aviso ? (
    <div className={portal ? 'portal-aviso endereco-aviso-cep' : 'frotas-aviso-campo endereco-aviso-cep'} role="note" data-testid="aviso-cep">
      {aviso}
    </div>
  ) : null;
  const dica = <div className={portal ? 'endereco-dica' : 'endereco-dica frotas-endereco-dica'} data-testid="dica-cep">{DICA_SEM_CEP}</div>;
  const antigo = enderecoAntigo ? (
    <div className={portal ? 'portal-aviso endereco-antigo' : 'frotas-aviso-campo endereco-antigo'} data-testid="endereco-antigo">
      Endereço antigo: {enderecoAntigo}
    </div>
  ) : null;

  if (portal) {
    const campo = (chave, conteudo) => (
      <label className="portal-campo" key={chave}>
        <span>{ROTULOS[chave]}</span>
        {conteudo}
      </label>
    );
    return (
      <div className="endereco-destino endereco-destino-portal" data-testid="endereco-destino">
        {antigo}
        <div className="portal-campo">
          <span>{ROTULOS.cep}</span>
          {campoCep}
          {dica}
          {avisoCep}
        </div>
        {campo('logradouro', entrada('logradouro'))}
        <div className="portal-linha endereco-linha-numero">
          {campo('numero', entrada('numero'))}
          {campo('complemento', entrada('complemento'))}
        </div>
        {campo('bairro', entrada('bairro'))}
        <div className="portal-linha endereco-linha-cidade">
          {campo('cidade', entrada('cidade'))}
          {campo('uf', selectUf)}
        </div>
      </div>
    );
  }

  // Gestor: cada campo e um item do grid do modal (.frotas-form-grid), com o rotulo no <label> (os testes acham o grupo pelo rotulo).
  const grupo = (chave, conteudo, full) => (
    <div className={`frotas-form-group${full ? ' full' : ''}`} key={chave}>
      <label>{ROTULOS[chave]}</label>
      {conteudo}
    </div>
  );
  return (
    <>
      {antigo && <div className="frotas-form-group full" key="antigo">{antigo}</div>}
      <div className="frotas-form-group full" key="cep">
        <label>{ROTULOS.cep}</label>
        {campoCep}
        {dica}
        {avisoCep}
      </div>
      {grupo('logradouro', entrada('logradouro'), true)}
      {grupo('numero', entrada('numero'))}
      {grupo('complemento', entrada('complemento'))}
      {grupo('bairro', entrada('bairro'))}
      {grupo('cidade', entrada('cidade'))}
      {grupo('uf', selectUf)}
    </>
  );
}

/** O corpo do POST /frotas/destinos: nome e as 7 chaves, aparadas (vazio vai como '' — o servidor trata como ausente). */
export function corpoDoNovoDestino(nome, endereco) {
  const corpo = { nome: texto(nome).trim() };
  CAMPOS_ENDERECO.forEach((k) => { corpo[k] = texto(endereco?.[k]).trim(); });
  return corpo;
}

/**
 * O bloco "+ Novo destino" (RN-F9.15 no portal, RN-F9.18 no gestor): Nome + endereco, Adicionar e Cancelar.
 * 201 -> onIncluido(linha); 409 DESTINO_DUPLICADO com a linha no corpo -> onIncluido(existente) e o aviso `msgDuplicado`;
 * outro erro (400 do endereco, rede) fica no bloco, aberto, para corrigir e tentar de novo. So o nome e conferido aqui.
 */
export function NovoDestinoBloco({
  variante = 'portal', onIncluido, onCancelar, msgDuplicado = 'Esse destino já existia — selecionado.',
}) {
  const [nome, setNome] = useState('');
  const [endereco, setEndereco] = useState(ENDERECO_VAZIO);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const salvandoRef = useRef(false);

  const adicionar = async () => {
    if (salvandoRef.current) return;
    const corpo = corpoDoNovoDestino(nome, endereco);
    if (!corpo.nome) {
      setErro('Informe o nome do destino');
      return;
    }
    salvandoRef.current = true;
    setErro('');
    setSalvando(true);
    try {
      const { data: criado } = await api.post('/frotas/destinos', corpo);
      salvandoRef.current = false;
      setSalvando(false);
      toast.success('Destino adicionado');
      onIncluido(criado);
    } catch (err) {
      salvandoRef.current = false;
      const dados = err.response?.data;
      if (err.response?.status === 409 && dados?.code === 'DESTINO_DUPLICADO' && dados.destino?.id != null) {
        setSalvando(false);
        toast.info(msgDuplicado);
        onIncluido(dados.destino);
        return;
      }
      setSalvando(false);
      setErro(dados?.error || MSG_FALHA_DESTINO);
    }
  };

  const portal = variante === 'portal';
  const campoNome = (
    <input
      type="text"
      name="novo_destino_nome"
      value={nome}
      maxLength={120}
      disabled={salvando}
      onChange={(e) => setNome(e.target.value)}
    />
  );
  const enderecoCampos = (
    <EnderecoDestinoCampos
      valor={endereco}
      aoMudar={(patch) => setEndereco((e) => ({ ...e, ...patch }))}
      variante={variante}
      prefixo="novo_destino_"
      desabilitado={salvando}
    />
  );
  const erroBloco = erro
    ? <div className={portal ? 'portal-erro portal-erro-destino' : 'frotas-erro-destino'} role="alert">{erro}</div>
    : null;

  if (portal) {
    return (
      <div className="portal-novo-destino" data-testid="novo-destino">
        <label className="portal-campo">
          <span>Nome</span>
          {campoNome}
        </label>
        {enderecoCampos}
        {erroBloco}
        <div className="portal-linha">
          <button type="button" className="portal-botao secundario" disabled={salvando} onClick={onCancelar}>Cancelar</button>
          <button type="button" className="portal-botao" disabled={salvando} onClick={adicionar}>Adicionar</button>
        </div>
      </div>
    );
  }
  return (
    <div className="frotas-form-group full frotas-novo-destino" data-testid="novo-destino">
      <div className="frotas-novo-destino-titulo">Novo destino</div>
      <div className="frotas-form-grid">
        <div className="frotas-form-group full">
          <label>Nome do destino</label>
          {campoNome}
        </div>
        {enderecoCampos}
      </div>
      {erroBloco}
      <div className="frotas-novo-destino-acoes">
        <button type="button" className="frotas-btn frotas-btn-secondary" disabled={salvando} onClick={onCancelar}>Cancelar</button>
        <button type="button" className="frotas-btn frotas-btn-primary" disabled={salvando} onClick={adicionar}>Adicionar</button>
      </div>
    </div>
  );
}
