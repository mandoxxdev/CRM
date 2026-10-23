import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import {
  FiRefreshCw, FiTool, FiPlus, FiUserCheck, FiCornerUpLeft, FiLock, FiUnlock,
  FiSettings, FiCheckCircle, FiAlertTriangle, FiRotateCcw, FiCalendar, FiEdit2, FiFileText, FiSearch,
} from 'react-icons/fi';
import { SkeletonTable } from '../SkeletonLoader';
import { useAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';
import { formatLocalizacaoLabel } from '../../utils/localizacaoLabel';
import { hojeLocalISO, lerDataDoBanco, formatarInstanteDoBanco, formatarDataDoBanco, COM_SEGUNDOS } from '../../utils/dataLocal';
import { resolveMaterialPhotoUrl } from '../../utils/resolveMaterialPhotoUrl';
import AssinaturaCanvas from './AssinaturaCanvas';
import { novaChaveIdempotencia, seloVerificacao, codigoVerificacao } from '../../utils/epiEntrega';
import {
  erroDaConfirmacaoTermo, montarFormDataEmprestimo, ehVersaoDoTermoTrocada, AVISO_VERSAO_TROCADA, mensagemErroEmprestimo,
  erroDoNovoTexto, matriculaConfirmadaTexto,
} from '../../utils/termoFerramenta';
import { gerarTermoFerramentaPdf } from '../../utils/termoFerramentaPdf';

// Etapa 170 (RN-170.03, B1081): a *Retirada* e o CURRENT_TIMESTAMP (UTC) — os 10 primeiros caracteres eram o dia UTC (das 21h a
// meia-noite, o de amanha). O dia de Brasilia, no formato da tela (AAAA-MM-DD); so data -> o mesmo texto; ilegivel -> o corte de antes.
function diaDaRetirada(valor) {
  const d = lerDataDoBanco(valor);
  return d ? hojeLocalISO(d) : String(valor).slice(0, 10);
}
import './Almoxarifado.css';

/**
 * Ferramentas e calibração (Etapa 9b, Task 7).
 *
 * Ate esta etapa, ferramenta (`toolService.js`) so existia por chamada direta a API: sem tela,
 * sem tabelas de manutencao/ocorrencia/calibracao (Task 1), sem maquina de estados no front
 * (Task 2 fez a de tras). Esta tela e a PRIMEIRA superficie visual do patrimonio emprestavel.
 *
 * Precedente OBRIGATORIO: SobrasAlmoxarifado.js — abas com botoes primary/secondary alternando
 * (sem CSS novo), `useAlmoxPermissoes` para o gate de escrita, `almox-modal`/`almox-field` para
 * os formularios, FormData para os dois uploads multipart (foto de ocorrencia, certificado de
 * calibracao — mesmo molde do comprovante de sucateamento).
 *
 * Gate de escrita: UMA acao so, `gerenciar_ferramentas` (design D1) — ao contrario do
 * sucateamento (duas pernas, duas acoes), aqui nao ha por que esconder um botao e mostrar outro
 * por permissao: OU o perfil pode agir sobre ferramentas OU nao pode nada. Por isso as acoes de
 * LINHA (emprestar, devolver, bloquear...) ficam escondidas quando `!pode('gerenciar_ferramentas')`
 * — response ao pedido do brief ("nao ve os botoes de escrita"), no mesmo espirito das pernas de
 * aprovacao do sucateamento (`mostraAprovarAlmox` etc.). O botao "Nova ferramenta" do cabecalho
 * segue o OUTRO padrao do precedente (Gerar retalho / Solicitar sucateamento): fica sempre
 * visivel e o clique e quem barra via `bloquearSeNaoPode` — defesa em profundidade que so este
 * botao exercita (o teste de sabotagem mira aqui: tirar o guard do clique tem de derrubar teste,
 * o que nao aconteceria se a visibilidade sozinha ja escondesse tudo).
 *
 * Acoes por STATUS (toolStateMachine.js, contrato congelado no design): emprestar so em
 * DISPONIVEL; devolver so em EMPRESTADA; bloquear so em DISPONIVEL; desbloquear so em BLOQUEADA;
 * iniciar manutencao em DISPONIVEL ou AVARIADA (RN-07); concluir manutencao so em EM_MANUTENCAO;
 * reencontrar so em PERDIDA. Ocorrencia (avaria/perda) e calibracao ficam em qualquer status SALVO
 * BAIXADA (Etapa 177, RN-177.10; desde a 187 o servidor tambem recusa calibrar a baixada) — calibracao
 * so quando a ferramenta EXIGE, campo `exige_calibracao`. Editar idem: qualquer status salvo Baixada
 * (Etapa 187, B1242).
 *
 * "Concluir manutencao" precisa do ID da manutencao ABERTA, que GET /ferramentas nao devolve
 * (so `calibracao_vigente` e `emprestimo_aberto` resumidos, por design). Por isso o clique busca
 * `GET /ferramentas/:id/manutencoes` na hora e acha a que tem `data_fim` nulo — nao ha outra
 * fonte no contrato congelado.
 *
 * Etapa 180 (T3) — termo de responsabilidade: o emprestimo virou multipart (colaborador DO CADASTRO, texto vigente do termo
 * exibido, matricula digitada pelo colaborador, assinatura no AssinaturaCanvas, `termo_versao` e `chave_idempotencia` por
 * tentativa — molde EpiAlmoxarifado.js da 178). A lista de emprestimos ganhou a coluna Termo (ver / verificar / PDF) e so aparece
 * com `gerenciar_ferramentas` (a leitura passou a exigir a acao, RN-180.06); a aba "Texto do termo" so com `editar_termos`.
 */

const STATUS_FERRAMENTA = [
  { value: 'DISPONIVEL', label: 'Disponível', cls: 'ok' },
  { value: 'EMPRESTADA', label: 'Emprestada', cls: 'ajuste' },
  { value: 'BLOQUEADA', label: 'Bloqueada', cls: 'critico' },
  { value: 'EM_MANUTENCAO', label: 'Em manutenção', cls: 'baixo' },
  { value: 'AVARIADA', label: 'Avariada', cls: 'critico' },
  { value: 'PERDIDA', label: 'Perdida', cls: 'critico' },
  // Etapa 177 (B1144): descartada depois da manutencao — fica na lista e no historico; sai por "Reverter baixa".
  { value: 'BAIXADA', label: 'Baixada', cls: 'critico' },
];
const statusInfo = (s) => STATUS_FERRAMENTA.find((x) => x.value === s) || { label: s || '—', cls: 'ajuste' };

const FORM_FERRAMENTA_VAZIO = {
  codigo_patrimonio: '', nome: '', tipo: '', setor_responsavel: '',
  material_id: '', numero_serie: '', localizacao_id: '', exige_calibracao: false, observacoes: '',
};
// Etapa 180 (RN-180.03/04): o colaborador e DO CADASTRO (nunca texto livre) e assina o termo — a matricula ele digita.
const FORM_EMPRESTAR_VAZIO = {
  colaborador_id: '', data_prevista_devolucao: '', observacoes: '', confirmacao_matricula: '',
};
// O seletor do emprestimo mostra nome e setor, SEM a matricula: e ela que o colaborador digita para assinar (precedente da 178,
// Fase 5 — mostrada ao lado, a confirmacao nao provaria nada). Letra B.
const rotuloColaboradorEmprestimo = (c) => (c ? `${c.nome}${c.setor ? ` (${c.setor})` : ''}` : '');
const quandoFoi = (v) => formatarInstanteDoBanco(v, COM_SEGUNDOS);
// O texto do termo, com rolagem: a pessoa le o que o colaborador assina.
const ESTILO_TEXTO_TERMO = {
  maxHeight: 220, overflowY: 'auto', whiteSpace: 'pre-wrap', padding: '10px 12px', borderRadius: 8,
  border: '1px solid var(--gmp-border)', background: 'var(--gmp-bg, transparent)', fontSize: '0.85rem', lineHeight: 1.45,
};
const SeloProvisorio = () => (
  <span className="almox-badge almox-badge-baixo almox-termo-provisorio" style={{ marginLeft: 8 }}>Texto provisório</span>
);
const FORM_JUSTIFICATIVA_VAZIO = { justificativa: '' };
const FORM_MANUTENCAO_VAZIO = { descricao: '' };
// Etapa 177 (RN-177.10): condicao obrigatoria na tela (o servidor aceita sem, B1140); destino nasce "Volta ao uso".
const FORM_CONCLUIR_MANUTENCAO_VAZIO = { observacoes: '', condicao: '', destino: 'USO' };
// Os valores sao os do contrato (RN-177.01); o rotulo e o que a pessoa le.
const CONDICOES_RETORNO = [
  { value: 'OK', label: 'Em condições de uso' },
  { value: 'COM_RESTRICAO', label: 'Em uso com restrição' },
  { value: 'INSERVIVEL', label: 'Inservível' },
];
const DESTINOS_RETORNO = [
  { value: 'USO', label: 'Volta ao uso' },
  { value: 'BAIXA', label: 'Baixa (descarte)' },
];
const FORM_OCORRENCIA_VAZIO = {
  tipo: 'AVARIA', descricao: '', responsavel_nome: '', responsavel_colaborador_id: '', foto: null,
};
const FORM_CALIBRACAO_VAZIO = { data_calibracao: '', data_validade: '', observacoes: '', certificado: null };

const TITULO_JUSTIFICATIVA = {
  bloquear: 'Bloquear ferramenta',
  desbloquear: 'Desbloquear ferramenta',
  reencontrar: 'Reencontrar ferramenta',
  'reverter-baixa': 'Reverter a baixa da ferramenta',
};
const ROTA_JUSTIFICATIVA = {
  bloquear: 'bloquear', desbloquear: 'desbloquear', reencontrar: 'reencontrar', 'reverter-baixa': 'reverter-baixa',
};
const SUCESSO_JUSTIFICATIVA = {
  bloquear: 'Ferramenta bloqueada', desbloquear: 'Ferramenta desbloqueada', reencontrar: 'Ferramenta reencontrada',
  'reverter-baixa': 'Baixa revertida — a ferramenta voltou a ficar disponível',
};

const FerramentasAlmoxarifado = () => {
  const { pode, bloquearSeNaoPode } = useAlmoxPermissoes();
  const podeEscrever = pode('gerenciar_ferramentas');
  // Etapa 180 (RN-180.02): so o ADMINISTRADOR redige o compromisso (acao `editar_termos`).
  const podeEditarTermos = pode('editar_termos');

  const [abaEscolhida, setAba] = useState('FERRAMENTAS');
  // Etapa 180 (RN-180.06): a leitura de emprestimos exige `gerenciar_ferramentas` (PRODUCAO leva 403) — a aba some; a do texto do
  // termo, sem `editar_termos`. Se a permissao some com a aba aberta (cache recarregado), a tela volta para Ferramentas.
  const aba = (abaEscolhida === 'EMPRESTIMOS' && !podeEscrever) || (abaEscolhida === 'TERMO' && !podeEditarTermos) ? 'FERRAMENTAS' : abaEscolhida;

  // Termo de responsabilidade (Etapa 180)
  const chaveRef = useRef(null); // a chave da TENTATIVA de envio (molde 178, Fase 5 M2)
  const [colaboradores, setColaboradores] = useState(null);
  const [termo, setTermo] = useState(null); // resposta de GET /termos/FERRAMENTA: { vigente, historico }
  const [carregandoTermo, setCarregandoTermo] = useState(false);
  const [assinatura, setAssinatura] = useState(null);
  const [canvasKey, setCanvasKey] = useState(0);
  const [avisoTermo, setAvisoTermo] = useState(null);
  const [termoEmprestimo, setTermoEmprestimo] = useState(null); // resposta de GET …/emprestimos/:id/termo
  const [seloTermo, setSeloTermo] = useState(null);
  const [verificandoTermo, setVerificandoTermo] = useState(false);
  const [gerandoPdfTermo, setGerandoPdfTermo] = useState(false);
  // Aba "Texto do termo" (administrador)
  const [textoNovo, setTextoNovo] = useState('');
  const [salvandoTermo, setSalvandoTermo] = useState(false);

  // Ferramentas
  const [ferramentas, setFerramentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroBusca, setFiltroBusca] = useState('');
  const [filtroExigeCalibracao, setFiltroExigeCalibracao] = useState('');

  // Empréstimos
  const [emprestimos, setEmprestimos] = useState([]);
  const [loadingEmp, setLoadingEmp] = useState(true);
  const [reloadTokenEmp, setReloadTokenEmp] = useState(0);
  const [somenteVencidos, setSomenteVencidos] = useState(false);
  const [filtroColaborador, setFiltroColaborador] = useState('');

  // Calibrações — painel
  const [painel, setPainel] = useState({ vencidas: [], a_vencer: [] });
  const [loadingCal, setLoadingCal] = useState(true);
  const [reloadTokenCal, setReloadTokenCal] = useState(0);

  // Catálogo (material/localização) para o formulário de cadastro — carregado uma vez, mesmo
  // padrão de SobrasAlmoxarifado.
  const [materiais, setMateriais] = useState([]);
  const [localizacoes, setLocalizacoes] = useState([]);

  const [modal, setModal] = useState(null); // { tipo, ferramenta?, manutencaoId? }
  const [form, setForm] = useState(FORM_FERRAMENTA_VAZIO);
  const [formEmprestar, setFormEmprestar] = useState(FORM_EMPRESTAR_VAZIO);
  const [formJustificativa, setFormJustificativa] = useState(FORM_JUSTIFICATIVA_VAZIO);
  const [formManutencao, setFormManutencao] = useState(FORM_MANUTENCAO_VAZIO);
  const [formConcluirManutencao, setFormConcluirManutencao] = useState(FORM_CONCLUIR_MANUTENCAO_VAZIO);
  const [formOcorrencia, setFormOcorrencia] = useState(FORM_OCORRENCIA_VAZIO);
  const [formCalibracao, setFormCalibracao] = useState(FORM_CALIBRACAO_VAZIO);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (aba !== 'FERRAMENTAS') return undefined;
    let cancelado = false;
    setLoading(true);
    const params = {};
    if (filtroStatus) params.status = filtroStatus;
    if (filtroBusca) params.busca = filtroBusca;
    if (filtroExigeCalibracao !== '') params.exige_calibracao = filtroExigeCalibracao;
    api.get('/almoxarifado/ferramentas', { params })
      .then((r) => { if (!cancelado) setFerramentas(Array.isArray(r.data) ? r.data : []); })
      .catch(() => { if (!cancelado) { setFerramentas([]); toast.error('Não foi possível carregar as ferramentas'); } })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [aba, filtroStatus, filtroBusca, filtroExigeCalibracao, reloadToken]);

  useEffect(() => {
    if (aba !== 'EMPRESTIMOS') return undefined;
    let cancelado = false;
    setLoadingEmp(true);
    const params = {};
    if (somenteVencidos) params.vencidos = 1;
    if (filtroColaborador) params.colaborador = filtroColaborador;
    api.get('/almoxarifado/emprestimos', { params })
      .then((r) => { if (!cancelado) setEmprestimos(Array.isArray(r.data) ? r.data : []); })
      .catch(() => { if (!cancelado) { setEmprestimos([]); toast.error('Não foi possível carregar os empréstimos'); } })
      .finally(() => { if (!cancelado) setLoadingEmp(false); });
    return () => { cancelado = true; };
  }, [aba, somenteVencidos, filtroColaborador, reloadTokenEmp]);

  useEffect(() => {
    if (aba !== 'CALIBRACOES') return undefined;
    let cancelado = false;
    setLoadingCal(true);
    api.get('/almoxarifado/calibracoes/painel')
      .then((r) => {
        if (cancelado) return;
        const dados = r.data && typeof r.data === 'object' ? r.data : {};
        setPainel({ vencidas: Array.isArray(dados.vencidas) ? dados.vencidas : [], a_vencer: Array.isArray(dados.a_vencer) ? dados.a_vencer : [] });
      })
      .catch(() => { if (!cancelado) { setPainel({ vencidas: [], a_vencer: [] }); toast.error('Não foi possível carregar o painel de calibrações'); } })
      .finally(() => { if (!cancelado) setLoadingCal(false); });
    return () => { cancelado = true; };
  }, [aba, reloadTokenCal]);

  useEffect(() => {
    let cancelado = false;
    Promise.all([
      api.get('/almoxarifado/materiais').catch(() => ({ data: [] })),
      api.get('/almoxarifado/localizacoes').catch(() => ({ data: [] })),
    ]).then(([mat, loc]) => {
      if (cancelado) return;
      setMateriais(mat.data || []);
      setLocalizacoes(loc.data || []);
    });
    return () => { cancelado = true; };
  }, []);

  // ── Termo de responsabilidade (Etapa 180) ─────────────────────────────────────────────────
  // O texto VIGENTE (GET /termos/FERRAMENTA). Devolve a resposta, ou null se falhou (a tela nao deixa assinar texto que nao mostrou).
  const carregarTermo = useCallback(async () => {
    setCarregandoTermo(true);
    try {
      const r = await api.get('/almoxarifado/termos/FERRAMENTA');
      const dados = r.data && r.data.vigente ? r.data : null;
      setTermo(dados);
      return dados;
    } catch (err) {
      setTermo(null);
      toast.error(err.response?.data?.error || 'Não foi possível carregar o texto do termo');
      return null;
    } finally {
      setCarregandoTermo(false);
    }
  }, []);

  useEffect(() => {
    if (aba !== 'TERMO') return;
    carregarTermo().then((dados) => setTextoNovo(dados?.vigente?.texto || ''));
  }, [aba, carregarTermo]);

  const recarregar = useCallback(() => setReloadToken((t) => t + 1), []);
  const recarregarEmp = useCallback(() => setReloadTokenEmp((t) => t + 1), []);
  const recarregarCal = useCallback(() => setReloadTokenCal((t) => t + 1), []);
  const recarregarAtual = () => {
    if (aba === 'FERRAMENTAS') recarregar();
    else if (aba === 'EMPRESTIMOS') recarregarEmp();
    else if (aba === 'TERMO') carregarTermo().then((dados) => setTextoNovo(dados?.vigente?.texto || ''));
    else recarregarCal();
  };

  // ── Cadastro ────────────────────────────────────────────────────────────────────────────────
  const abrirNova = (evento) => {
    if (!bloquearSeNaoPode('gerenciar_ferramentas', evento)) return;
    setForm(FORM_FERRAMENTA_VAZIO);
    setModal({ tipo: 'nova' });
  };

  const confirmarNova = async () => {
    if (!String(form.codigo_patrimonio || '').trim()) { toast.error('Informe o código de patrimônio'); return; }
    if (!String(form.nome || '').trim()) { toast.error('Informe o nome da ferramenta'); return; }
    const payload = {
      codigo_patrimonio: String(form.codigo_patrimonio).trim(),
      nome: String(form.nome).trim(),
      exige_calibracao: !!form.exige_calibracao,
    };
    if (form.tipo) payload.tipo = String(form.tipo).trim();
    if (form.setor_responsavel) payload.setor_responsavel = String(form.setor_responsavel).trim();
    if (form.material_id) payload.material_id = Number(form.material_id);
    if (form.numero_serie) payload.numero_serie = String(form.numero_serie).trim();
    if (form.localizacao_id) payload.localizacao_id = Number(form.localizacao_id);
    if (form.observacoes) payload.observacoes = String(form.observacoes).trim();

    setSalvando(true);
    try {
      await api.post('/almoxarifado/ferramentas', payload);
      toast.success('Ferramenta cadastrada');
      setModal(null);
      recarregar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao cadastrar a ferramenta');
    } finally { setSalvando(false); }
  };

  // ── Edição (Etapa 175) ─────────────────────────────────────────────────────────────────────
  // RN-175.01/02: em qualquer status salvo Baixada (Etapa 187, B1242 — revê a B1131: o servidor recusa editar a baixada; para
  // corrigir um dado, Reverter baixa primeiro). O PUT não toca o status — ele muda pelas ações da linha.
  // O form nasce da linha da lista: `exige_calibracao` chega 0/1 do SQLite e vira booleano aqui.
  const abrirEditar = (ferramenta, evento) => {
    if (!bloquearSeNaoPode('gerenciar_ferramentas', evento)) return;
    const txt = (v) => (v == null ? '' : String(v));
    setForm({
      codigo_patrimonio: txt(ferramenta.codigo_patrimonio),
      nome: txt(ferramenta.nome),
      tipo: txt(ferramenta.tipo),
      setor_responsavel: txt(ferramenta.setor_responsavel),
      material_id: txt(ferramenta.material_id),
      numero_serie: txt(ferramenta.numero_serie),
      localizacao_id: txt(ferramenta.localizacao_id),
      exige_calibracao: !!Number(ferramenta.exige_calibracao),
      observacoes: txt(ferramenta.observacoes),
    });
    setModal({ tipo: 'editar', ferramenta });
  };

  // RN-175.03: os 9 campos sempre; opcional vazio vai `null` e LIMPA o gravado (o servidor grava só as
  // chaves presentes — mandar só o que mudou deixaria um campo apagado na tela com o valor antigo).
  const confirmarEditar = async () => {
    if (!String(form.codigo_patrimonio || '').trim()) { toast.error('Informe o código de patrimônio'); return; }
    if (!String(form.nome || '').trim()) { toast.error('Informe o nome da ferramenta'); return; }
    const textoOuNulo = (v) => (String(v || '').trim() ? String(v).trim() : null);
    const payload = {
      codigo_patrimonio: String(form.codigo_patrimonio).trim(),
      nome: String(form.nome).trim(),
      tipo: textoOuNulo(form.tipo),
      setor_responsavel: textoOuNulo(form.setor_responsavel),
      material_id: form.material_id ? Number(form.material_id) : null,
      numero_serie: textoOuNulo(form.numero_serie),
      localizacao_id: form.localizacao_id ? Number(form.localizacao_id) : null,
      exige_calibracao: !!form.exige_calibracao,
      observacoes: textoOuNulo(form.observacoes),
    };
    setSalvando(true);
    try {
      await api.put(`/almoxarifado/ferramentas/${modal.ferramenta.id}`, payload);
      toast.success('Ferramenta atualizada');
      setModal(null);
      recarregar();
      // "Exige calibração" muda o painel de calibrações
      recarregarCal();
    } catch (err) {
      // RN-175.05: a frase do servidor (409 de patrimônio, 404), e a janela fica aberta com o digitado
      toast.error(err.response?.data?.error || 'Erro ao atualizar a ferramenta');
    } finally { setSalvando(false); }
  };

  // ── Empréstimo / devolução ─────────────────────────────────────────────────────────────────
  // Etapa 180 (RN-180.03/04): o modal carrega os colaboradores do cadastro (uma vez) e o texto VIGENTE do termo (a cada abertura —
  // o administrador pode ter trocado). A versao exibida e a que vai em `termo_versao`.
  const limparAssinatura = () => { chaveRef.current = null; setAssinatura(null); setCanvasKey((k) => k + 1); };

  const abrirEmprestar = (ferramenta, evento) => {
    if (!bloquearSeNaoPode('gerenciar_ferramentas', evento)) return;
    setFormEmprestar(FORM_EMPRESTAR_VAZIO);
    setAvisoTermo(null);
    limparAssinatura();
    setModal({ tipo: 'emprestar', ferramenta });
    carregarTermo();
    if (colaboradores === null) {
      api.get('/almoxarifado/aux/colaboradores')
        .then((r) => setColaboradores(Array.isArray(r.data) ? r.data : []))
        .catch((err) => { setColaboradores(null); toast.error(err.response?.data?.error || 'Não foi possível carregar os colaboradores'); });
    }
  };

  const setEmprestar = (campo, valor) => { chaveRef.current = null; setFormEmprestar((f) => ({ ...f, [campo]: valor })); };

  const confirmarEmprestar = async () => {
    if (!formEmprestar.colaborador_id) { toast.error('Selecione o colaborador'); return; }
    const versao = termo?.vigente?.versao;
    if (versao == null) { toast.error('O texto do termo não foi carregado — atualize e tente de novo'); return; }
    if (!assinatura) { toast.error('A assinatura do colaborador é obrigatória'); return; }
    const erroConf = erroDaConfirmacaoTermo(formEmprestar.confirmacao_matricula);
    if (erroConf) { toast.error(erroConf); return; }

    if (!chaveRef.current) chaveRef.current = novaChaveIdempotencia();
    setSalvando(true);
    try {
      const fd = montarFormDataEmprestimo(formEmprestar, assinatura, versao, chaveRef.current);
      const res = await api.post(`/almoxarifado/ferramentas/${modal.ferramenta.id}/emprestar`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      chaveRef.current = null;
      const dados = res.data || {};
      const numero = dados.termo?.numero;
      if (dados.reutilizada) toast.success(`Empréstimo já estava registrado${numero ? ` (termo ${numero})` : ''} — o envio repetido não duplicou`);
      else toast.success(numero ? `Ferramenta emprestada — termo ${numero} assinado` : 'Ferramenta emprestada');
      setModal(null);
      limparAssinatura();
      recarregar();
      recarregarEmp();
    } catch (err) {
      // O servidor respondeu: nada foi gravado (ou o 500 diz o que foi) — a proxima tentativa e outra. Sem resposta: a chave fica.
      if (err && err.response) chaveRef.current = null;
      if (ehVersaoDoTermoTrocada(err)) {
        // RN-180.04: o colaborador assinou um texto que ja nao e o vigente — mostra o novo e pede a assinatura de novo.
        limparAssinatura();
        await carregarTermo();
        setAvisoTermo(AVISO_VERSAO_TROCADA);
        toast.error(AVISO_VERSAO_TROCADA);
      } else {
        // A frase do servidor ensina o motivo (calibracao vencida, matricula que nao confere, perdeu a corrida...) — literal.
        toast.error(mensagemErroEmprestimo(err));
      }
    } finally { setSalvando(false); }
  };

  // ── Termo de um empréstimo (RN-180.05) ─────────────────────────────────────────────────────
  const urlTermo = (id) => `/almoxarifado/ferramentas/emprestimos/${id}/termo`;

  const abrirTermoEmprestimo = async (emprestimo) => {
    setSeloTermo(null);
    setTermoEmprestimo(null);
    try {
      const r = await api.get(urlTermo(emprestimo.id));
      setTermoEmprestimo(r.data || null);
      setModal({ tipo: 'termo', emprestimo });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Não foi possível carregar o termo do empréstimo');
    }
  };

  const verificarTermo = async () => {
    setVerificandoTermo(true);
    try {
      const r = await api.get(`${urlTermo(modal.emprestimo.id)}/verificar`);
      setSeloTermo(seloVerificacao(r.data));
    } catch (err) {
      setSeloTermo(null);
      toast.error(err.response?.data?.error || 'Não foi possível verificar a integridade');
    } finally { setVerificandoTermo(false); }
  };

  const baixarPdfTermo = async () => {
    setGerandoPdfTermo(true);
    // A `arquivo_url` da assinatura vale ~15 min (molde da ficha de EPI, 178 T3): rele o termo antes de gerar; se a releitura
    // falhar, NAO gera com a URL velha (o PDF sairia sem a assinatura, calado).
    let atual;
    try {
      const r = await api.get(urlTermo(modal.emprestimo.id));
      atual = r.data;
      setTermoEmprestimo(atual);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Não foi possível reler o termo para gerar o PDF');
      setGerandoPdfTermo(false);
      return;
    }
    try {
      const doc = await gerarTermoFerramentaPdf(atual);
      if (doc?.assinaturaIndisponivel) toast.warn('A assinatura não pôde ser carregada e saiu como indisponível no PDF');
    } catch (err) {
      toast.error('Não foi possível gerar o PDF do termo');
    } finally { setGerandoPdfTermo(false); }
  };

  // ── Texto do termo (administrador, RN-180.02) ──────────────────────────────────────────────
  const salvarNovaVersao = async (evento) => {
    if (!bloquearSeNaoPode('editar_termos', evento)) return;
    const erroTexto = erroDoNovoTexto(textoNovo, termo?.vigente);
    if (erroTexto) { toast.error(erroTexto); return; }
    setSalvandoTermo(true);
    try {
      const corpo = { texto: textoNovo };
      if (termo?.vigente?.versao != null) corpo.versao_base = termo.vigente.versao;
      const r = await api.post('/almoxarifado/termos/FERRAMENTA', corpo);
      const v = r.data?.versao;
      toast.success(`${v != null ? `Versão ${v}` : 'Nova versão'} do termo salva — os próximos empréstimos assinam este texto`);
      const dados = await carregarTermo();
      setTextoNovo(dados?.vigente?.texto || textoNovo);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar a nova versão do termo');
      // 409 (outro administrador salvou): recarrega a vigente e o historico SEM apagar o rascunho de quem estava escrevendo.
      if (err.response?.status === 409) await carregarTermo();
    } finally { setSalvandoTermo(false); }
  };

  const devolverFerramenta = async (ferramenta, evento) => {
    if (!bloquearSeNaoPode('gerenciar_ferramentas', evento)) return;
    if (!ferramenta.emprestimo_aberto?.id) { toast.error('Empréstimo em aberto não encontrado'); return; }
    try {
      await api.post(`/almoxarifado/emprestimos/${ferramenta.emprestimo_aberto.id}/devolver`, {});
      toast.success('Ferramenta devolvida');
      recarregar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao devolver a ferramenta');
    }
  };

  // ── Bloquear / desbloquear / reencontrar (justificativa) ──────────────────────────────────
  const abrirJustificativa = (tipo, ferramenta, evento) => {
    if (!bloquearSeNaoPode('gerenciar_ferramentas', evento)) return;
    setFormJustificativa(FORM_JUSTIFICATIVA_VAZIO);
    setModal({ tipo, ferramenta });
  };

  const confirmarJustificativa = async () => {
    const texto = String(formJustificativa.justificativa || '').trim();
    if (texto.length < 5) { toast.error('Justificativa deve ter pelo menos 5 caracteres'); return; }
    const rota = ROTA_JUSTIFICATIVA[modal.tipo];
    setSalvando(true);
    try {
      await api.post(`/almoxarifado/ferramentas/${modal.ferramenta.id}/${rota}`, { justificativa: texto });
      toast.success(SUCESSO_JUSTIFICATIVA[modal.tipo]);
      setModal(null);
      recarregar();
      // Etapa 177 (RN-177.09): a ferramenta que volta da baixa volta ao painel de calibracoes
      if (modal.tipo === 'reverter-baixa') recarregarCal();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao registrar a ação');
    } finally { setSalvando(false); }
  };

  // ── Manutenção ──────────────────────────────────────────────────────────────────────────────
  const abrirManutencao = (ferramenta, evento) => {
    if (!bloquearSeNaoPode('gerenciar_ferramentas', evento)) return;
    setFormManutencao(FORM_MANUTENCAO_VAZIO);
    setModal({ tipo: 'manutencao', ferramenta });
  };

  const confirmarManutencao = async () => {
    if (!String(formManutencao.descricao || '').trim()) { toast.error('Informe a descrição da manutenção'); return; }
    setSalvando(true);
    try {
      await api.post(`/almoxarifado/ferramentas/${modal.ferramenta.id}/manutencoes`, {
        descricao: String(formManutencao.descricao).trim(),
      });
      toast.success('Manutenção iniciada');
      setModal(null);
      recarregar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao iniciar a manutenção');
    } finally { setSalvando(false); }
  };

  /**
   * GET /ferramentas nao devolve a manutencao aberta (so calibracao_vigente/emprestimo_aberto,
   * contrato congelado) — busca na hora do clique, mesmo espirito de abrir modal com dado extra
   * que ReservasAlmoxarifado.js usa antes de confirmar reserva.
   */
  const abrirConcluirManutencao = async (ferramenta, evento) => {
    if (!bloquearSeNaoPode('gerenciar_ferramentas', evento)) return;
    try {
      const res = await api.get(`/almoxarifado/ferramentas/${ferramenta.id}/manutencoes`);
      const lista = Array.isArray(res.data) ? res.data : [];
      const aberta = lista.find((m) => !m.data_fim);
      if (!aberta) { toast.error('Nenhuma manutenção em aberto encontrada para esta ferramenta'); return; }
      setFormConcluirManutencao(FORM_CONCLUIR_MANUTENCAO_VAZIO);
      setModal({ tipo: 'concluir-manutencao', ferramenta, manutencaoId: aberta.id });
    } catch (err) {
      toast.error('Erro ao buscar a manutenção em aberto');
    }
  };

  // Etapa 177 (RN-177.10): condicao e destino viajam sempre; as combinacoes (inservivel so com baixa, restricao e
  // baixa com observacoes) quem decide e o servidor — a frase dele vai ao toast e a janela fica aberta.
  const confirmarConcluirManutencao = async () => {
    if (!formConcluirManutencao.condicao) { toast.error('Escolha a condição do item'); return; }
    const payload = { condicao: formConcluirManutencao.condicao, destino: formConcluirManutencao.destino };
    if (formConcluirManutencao.observacoes) payload.observacoes = String(formConcluirManutencao.observacoes).trim();
    setSalvando(true);
    try {
      await api.put(`/almoxarifado/manutencoes/${modal.manutencaoId}/concluir`, payload);
      toast.success(payload.destino === 'BAIXA' ? 'Manutenção concluída — ferramenta baixada' : 'Manutenção concluída');
      setModal(null);
      recarregar();
      // a baixada sai do painel de calibracoes (RN-177.09)
      recarregarCal();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao concluir a manutenção');
    } finally { setSalvando(false); }
  };

  // ── Ocorrência (avaria/perda) ───────────────────────────────────────────────────────────────
  const abrirOcorrencia = (ferramenta, evento) => {
    if (!bloquearSeNaoPode('gerenciar_ferramentas', evento)) return;
    setFormOcorrencia(FORM_OCORRENCIA_VAZIO);
    setModal({ tipo: 'ocorrencia', ferramenta });
  };

  const confirmarOcorrencia = async () => {
    if (!String(formOcorrencia.descricao || '').trim()) { toast.error('Informe a descrição da ocorrência'); return; }
    setSalvando(true);
    try {
      // Multipart (contrato congelado): tipo/descricao/responsavel_nome/responsavel_colaborador_id
      // + arquivo `foto` opcional — mesmo molde do comprovante de sucateamento.
      const fd = new FormData();
      fd.append('tipo', formOcorrencia.tipo);
      fd.append('descricao', String(formOcorrencia.descricao).trim());
      if (formOcorrencia.responsavel_nome) fd.append('responsavel_nome', String(formOcorrencia.responsavel_nome).trim());
      if (formOcorrencia.responsavel_colaborador_id) fd.append('responsavel_colaborador_id', formOcorrencia.responsavel_colaborador_id);
      if (formOcorrencia.foto) fd.append('foto', formOcorrencia.foto);
      await api.post(`/almoxarifado/ferramentas/${modal.ferramenta.id}/ocorrencias`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(formOcorrencia.tipo === 'PERDA' ? 'Perda registrada' : 'Avaria registrada');
      setModal(null);
      recarregar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao registrar a ocorrência');
    } finally { setSalvando(false); }
  };

  // ── Calibração ──────────────────────────────────────────────────────────────────────────────
  const abrirCalibracao = (ferramenta, evento) => {
    if (!bloquearSeNaoPode('gerenciar_ferramentas', evento)) return;
    setFormCalibracao(FORM_CALIBRACAO_VAZIO);
    setModal({ tipo: 'calibracao', ferramenta });
  };

  const confirmarCalibracao = async () => {
    if (!formCalibracao.data_calibracao || !formCalibracao.data_validade) {
      toast.error('Informe as datas de calibração e de validade'); return;
    }
    setSalvando(true);
    try {
      const fd = new FormData();
      fd.append('data_calibracao', formCalibracao.data_calibracao);
      fd.append('data_validade', formCalibracao.data_validade);
      if (formCalibracao.observacoes) fd.append('observacoes', String(formCalibracao.observacoes).trim());
      if (formCalibracao.certificado) fd.append('certificado', formCalibracao.certificado);
      await api.post(`/almoxarifado/ferramentas/${modal.ferramenta.id}/calibracoes`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Calibração registrada');
      setModal(null);
      // A calibracao pode afetar tanto a lista de ferramentas (calibracao_vigente) quanto o
      // painel de vencimento — recarrega os dois, nao so a aba aberta.
      recarregar();
      recarregarCal();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao registrar a calibração');
    } finally { setSalvando(false); }
  };

  const confirmar = () => {
    if (modal?.tipo === 'nova') return confirmarNova();
    if (modal?.tipo === 'editar') return confirmarEditar();
    if (modal?.tipo === 'emprestar') return confirmarEmprestar();
    if (ROTA_JUSTIFICATIVA[modal?.tipo]) return confirmarJustificativa();
    if (modal?.tipo === 'manutencao') return confirmarManutencao();
    if (modal?.tipo === 'concluir-manutencao') return confirmarConcluirManutencao();
    if (modal?.tipo === 'ocorrencia') return confirmarOcorrencia();
    if (modal?.tipo === 'calibracao') return confirmarCalibracao();
    return undefined;
  };

  const rotuloLocalizacao = (l) => `${l.endereco_completo || formatLocalizacaoLabel(l, localizacoes)}${l.descricao ? ` — ${l.descricao}` : ''}`;

  // Comparacao date-only espelhando o servidor (achado F4 da revisao final de branch):
  // `date(e.data_prevista_devolucao) < date('now')` no SQL (listarEmprestimos, filters.vencidos)
  // nunca olha hora. `new Date(str) < new Date()` comparava data_prevista_devolucao (meia-noite
  // UTC) contra o instante atual — em qualquer fuso atras de UTC isso faz "vence hoje" aparecer
  // vencido horas antes da meia-noite local. Usa data LOCAL (nao toISOString, que e UTC) para o
  // "hoje" e compara string 'YYYY-MM-DD' com string 'YYYY-MM-DD', igual o servidor faz com date().
  const hoje = new Date();
  const hojeISO = [hoje.getFullYear(), String(hoje.getMonth() + 1).padStart(2, '0'), String(hoje.getDate()).padStart(2, '0')].join('-');
  const vencido = (e) => e.status === 'EMPRESTADA' && e.data_prevista_devolucao
    && String(e.data_prevista_devolucao).slice(0, 10) < hojeISO;

  return (
    <div className="almox-page">
      <div className="almox-header">
        <div>
          <h1><FiTool size={20} /> Ferramentas</h1>
          <p>
            {aba === 'FERRAMENTAS' && (loading ? 'Carregando...' : `${ferramentas.length} ferramenta(s) · patrimônio emprestável, nao estoque`)}
            {aba === 'EMPRESTIMOS' && (loadingEmp ? 'Carregando...' : `${emprestimos.length} empréstimo(s)`)}
            {aba === 'CALIBRACOES' && (loadingCal ? 'Carregando...' : `${painel.vencidas.length} vencida(s) · ${painel.a_vencer.length} a vencer`)}
            {aba === 'TERMO' && 'Termo de responsabilidade que o colaborador assina ao retirar uma ferramenta'}
          </p>
        </div>
        <div className="almox-header-actions">
          <button className="btn-almox-secondary" onClick={recarregarAtual}>
            <FiRefreshCw size={13} /> Atualizar
          </button>
          {aba === 'FERRAMENTAS' && (
            <button className="btn-almox-primary" onClick={abrirNova}>
              <FiPlus size={13} /> Nova ferramenta
            </button>
          )}
        </div>
      </div>

      {/* Abas — molde de LotesAlmoxarifado.js/SobrasAlmoxarifado.js: botoes primary/secondary
          alternando, sem CSS novo. */}
      <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
        <button className={aba === 'FERRAMENTAS' ? 'btn-almox-primary' : 'btn-almox-secondary'} onClick={() => setAba('FERRAMENTAS')}>Ferramentas</button>
        {podeEscrever && (
          <button className={aba === 'EMPRESTIMOS' ? 'btn-almox-primary' : 'btn-almox-secondary'} onClick={() => setAba('EMPRESTIMOS')}>Empréstimos</button>
        )}
        <button className={aba === 'CALIBRACOES' ? 'btn-almox-primary' : 'btn-almox-secondary'} onClick={() => setAba('CALIBRACOES')}>Calibrações</button>
        {podeEditarTermos && (
          <button className={aba === 'TERMO' ? 'btn-almox-primary' : 'btn-almox-secondary'} onClick={() => setAba('TERMO')}>Texto do termo</button>
        )}
      </div>

      {aba === 'FERRAMENTAS' && (
        <>
          <div className="almox-filters">
            <select className="almox-select" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
              <option value="">Todos os status</option>
              {STATUS_FERRAMENTA.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <input className="almox-input" style={{ maxWidth: 260 }} placeholder="Buscar por código ou nome"
              value={filtroBusca} onChange={(e) => setFiltroBusca(e.target.value)} />
            <select className="almox-select" value={filtroExigeCalibracao} onChange={(e) => setFiltroExigeCalibracao(e.target.value)}>
              <option value="">Exige calibração: todos</option>
              <option value="1">Exige calibração: sim</option>
              <option value="0">Exige calibração: não</option>
            </select>
          </div>

          <div className="almox-table-container">
            {loading ? <SkeletonTable rows={6} columns={7} />
              : ferramentas.length === 0 ? (
                <div className="almox-empty"><p>Nenhuma ferramenta cadastrada</p></div>
              ) : (
                <table className="almox-table almox-ferramenta-lista">
                  <thead>
                    <tr>
                      <th>Código</th><th>Nome</th><th>Status</th><th>Série</th>
                      <th>Localização</th><th>Calibração</th><th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ferramentas.map((f) => {
                      const info = statusInfo(f.status);
                      return (
                        <tr key={f.id}>
                          <td>{f.codigo_patrimonio}</td>
                          <td>
                            {f.nome}
                            {f.emprestimo_aberto?.colaborador_nome && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>
                                com {f.emprestimo_aberto.colaborador_nome}
                              </div>
                            )}
                          </td>
                          <td>
                            <span className={`almox-badge almox-badge-${info.cls}`}>{info.label}</span>
                            {/* Etapa 187 (RN-187.08a, B1245/B1247): a restricao da ultima manutencao — leitura, para todos; fora da
                                baixada (ela nao circula). Aviso, nao trava. */}
                            {f.restricao && f.status !== 'BAIXADA' && (
                              <>
                                <span className="almox-badge almox-badge-baixo almox-selo-restricao" style={{ marginLeft: 6 }}>Em uso com restrição</span>
                                <div style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>
                                  Restrição: {f.restricao.observacoes}
                                </div>
                              </>
                            )}
                          </td>
                          <td>{f.numero_serie || '—'}</td>
                          <td>{f.localizacao_id
                            ? (() => {
                              const loc = localizacoes.find((l) => String(l.id) === String(f.localizacao_id));
                              return loc ? rotuloLocalizacao(loc) : f.localizacao_id;
                            })()
                            : '—'}</td>
                          <td>
                            {/* Etapa 177 Fase 5: a baixada nao e mais usada — "Vigente" nela engana; mostra "—" como quem nao exige */}
                            {!f.exige_calibracao || f.status === 'BAIXADA' ? '—' : (
                              <span className={`almox-badge almox-badge-${f.calibracao_vigente ? 'ok' : 'critico'}`}>
                                {f.calibracao_vigente ? 'Vigente' : 'Vencida/ausente'}
                              </span>
                            )}
                          </td>
                          <td>
                            {podeEscrever && (
                              <div className="almox-actions">
                                {/* Etapa 187 (RN-187.08d, B1242): a baixada nao edita — o servidor recusa; Reverter baixa primeiro */}
                                {f.status !== 'BAIXADA' && (
                                  <button className="btn-almox-secondary" onClick={(e) => abrirEditar(f, e)}>
                                    <FiEdit2 size={13} /> Editar
                                  </button>
                                )}
                                {f.status === 'DISPONIVEL' && (
                                  <button className="btn-almox-secondary" onClick={(e) => abrirEmprestar(f, e)}>
                                    <FiUserCheck size={13} /> Emprestar
                                  </button>
                                )}
                                {f.status === 'EMPRESTADA' && (
                                  <button className="btn-almox-secondary" onClick={(e) => devolverFerramenta(f, e)}>
                                    <FiCornerUpLeft size={13} /> Devolver
                                  </button>
                                )}
                                {f.status === 'DISPONIVEL' && (
                                  <button className="btn-almox-secondary" onClick={(e) => abrirJustificativa('bloquear', f, e)}>
                                    <FiLock size={13} /> Bloquear
                                  </button>
                                )}
                                {f.status === 'BLOQUEADA' && (
                                  <button className="btn-almox-secondary" onClick={(e) => abrirJustificativa('desbloquear', f, e)}>
                                    <FiUnlock size={13} /> Desbloquear
                                  </button>
                                )}
                                {(f.status === 'DISPONIVEL' || f.status === 'AVARIADA') && (
                                  <button className="btn-almox-secondary" onClick={(e) => abrirManutencao(f, e)}>
                                    <FiSettings size={13} /> Iniciar manutenção
                                  </button>
                                )}
                                {f.status === 'EM_MANUTENCAO' && (
                                  <button className="btn-almox-secondary" onClick={(e) => abrirConcluirManutencao(f, e)}>
                                    <FiCheckCircle size={13} /> Concluir manutenção
                                  </button>
                                )}
                                {f.status === 'PERDIDA' && (
                                  <button className="btn-almox-secondary" onClick={(e) => abrirJustificativa('reencontrar', f, e)}>
                                    <FiRotateCcw size={13} /> Reencontrar
                                  </button>
                                )}
                                {f.status === 'BAIXADA' && (
                                  <button className="btn-almox-secondary" onClick={(e) => abrirJustificativa('reverter-baixa', f, e)}>
                                    <FiRotateCcw size={13} /> Reverter baixa
                                  </button>
                                )}
                                {/* Etapa 177 (RN-177.10): a baixada nao registra ocorrencia (o servidor recusa) nem
                                    precisa de calibracao — os botoes saem dela. */}
                                {f.status !== 'BAIXADA' && (
                                  <button className="btn-almox-secondary" onClick={(e) => abrirOcorrencia(f, e)}>
                                    <FiAlertTriangle size={13} /> Ocorrência
                                  </button>
                                )}
                                {!!f.exige_calibracao && f.status !== 'BAIXADA' && (
                                  <button className="btn-almox-secondary" onClick={(e) => abrirCalibracao(f, e)}>
                                    <FiCalendar size={13} /> Calibração
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
          </div>
        </>
      )}

      {aba === 'EMPRESTIMOS' && (
        <>
          <div className="almox-filters">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem', color: 'var(--gmp-text)' }}>
              <input type="checkbox" checked={somenteVencidos} onChange={(e) => setSomenteVencidos(e.target.checked)} />
              Somente vencidos
            </label>
            <input className="almox-input" style={{ maxWidth: 260 }} placeholder="Buscar por colaborador"
              value={filtroColaborador} onChange={(e) => setFiltroColaborador(e.target.value)} />
          </div>

          <div className="almox-table-container">
            {loadingEmp ? <SkeletonTable rows={6} columns={7} />
              : emprestimos.length === 0 ? (
                <div className="almox-empty"><p>Nenhum empréstimo registrado</p></div>
              ) : (
                <table className="almox-table almox-emprestimo-lista">
                  <thead>
                    <tr>
                      <th>Ferramenta</th><th>Colaborador</th><th>Retirada</th>
                      <th>Previsão de devolução</th><th>Status</th><th>Termo</th><th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emprestimos.map((e) => (
                      <tr key={e.id}>
                        <td>{e.codigo_patrimonio} — {e.ferramenta_nome}</td>
                        <td>{e.colaborador_nome}{e.setor ? ` (${e.setor})` : ''}</td>
                        <td>{e.data_retirada ? diaDaRetirada(e.data_retirada) : '—'}</td>
                        <td>{e.data_prevista_devolucao ? String(e.data_prevista_devolucao).slice(0, 10) : '—'}</td>
                        <td>
                          <span className={`almox-badge almox-badge-${e.status === 'DEVOLVIDA' ? 'ok' : 'ajuste'}`}>
                            {e.status === 'DEVOLVIDA' ? 'Devolvida' : 'Emprestada'}
                          </span>
                          {vencido(e) && <span className="almox-badge almox-badge-vencida" style={{ marginLeft: 6 }}>Vencido</span>}
                        </td>
                        <td className="almox-emprestimo-termo">
                          {/* RN-180.05/06: `tem_termo` por linha; o emprestimo de antes da 180 nao tem termo (e nao e defeito). */}
                          {e.tem_termo ? (
                            <button className="btn-almox-secondary" onClick={() => abrirTermoEmprestimo(e)}>
                              <FiFileText size={13} /> Termo
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>Anterior à exigência do termo</span>
                          )}
                        </td>
                        <td>
                          {podeEscrever && e.status === 'EMPRESTADA' && (
                            <button className="btn-almox-secondary" onClick={(ev) => {
                              if (!bloquearSeNaoPode('gerenciar_ferramentas', ev)) return;
                              api.post(`/almoxarifado/emprestimos/${e.id}/devolver`, {})
                                .then(() => { toast.success('Ferramenta devolvida'); recarregarEmp(); })
                                .catch((err) => toast.error(err.response?.data?.error || 'Erro ao devolver a ferramenta'));
                            }}>
                              <FiCornerUpLeft size={13} /> Devolver
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </div>
        </>
      )}

      {aba === 'CALIBRACOES' && (
        <>
          {loadingCal ? <SkeletonTable rows={6} columns={4} /> : (
            <>
              <div className="almox-section-title">Vencidas</div>
              {painel.vencidas.length === 0 ? (
                <div className="almox-empty"><p>Nenhuma calibração vencida</p></div>
              ) : (
                <div className="almox-table-container">
                  <table className="almox-table almox-calibracao-vencidas">
                    <thead><tr><th>Código</th><th>Ferramenta</th><th>Validade</th><th>Situação</th></tr></thead>
                    <tbody>
                      {painel.vencidas.map((c, i) => (
                        <tr key={c.id ?? c.ferramenta_id ?? i}>
                          <td>{c.codigo_patrimonio || '—'}</td>
                          <td>{c.nome || c.ferramenta_nome || '—'}</td>
                          <td>{c.data_validade ? String(c.data_validade).slice(0, 10) : '—'}</td>
                          <td>
                            <span className="almox-badge almox-badge-vencida">
                              {c.dias_restantes != null ? `Vencida há ${Math.abs(c.dias_restantes)} dia(s)` : 'Vencida'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="almox-section-title" style={{ marginTop: 16 }}>A vencer</div>
              {painel.a_vencer.length === 0 ? (
                <div className="almox-empty"><p>Nenhuma calibração a vencer</p></div>
              ) : (
                <div className="almox-table-container">
                  <table className="almox-table almox-calibracao-a-vencer">
                    <thead><tr><th>Código</th><th>Ferramenta</th><th>Validade</th><th>Dias restantes</th></tr></thead>
                    <tbody>
                      {painel.a_vencer.map((c, i) => (
                        <tr key={c.id ?? c.ferramenta_id ?? i}>
                          <td>{c.codigo_patrimonio || '—'}</td>
                          <td>{c.nome || c.ferramenta_nome || '—'}</td>
                          <td>{c.data_validade ? String(c.data_validade).slice(0, 10) : '—'}</td>
                          <td><span className="almox-badge almox-badge-baixo">{c.dias_restantes ?? '—'} dia(s)</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}

      {aba === 'TERMO' && (
        <div className="almox-termo-admin">
          {carregandoTermo && !termo ? <SkeletonTable rows={3} columns={4} /> : !termo ? (
            <div className="almox-empty"><p>Texto do termo indisponível</p></div>
          ) : (
            <>
              <div className="almox-section-title">
                Versão vigente: {termo.vigente.versao}
                {termo.vigente.provisorio && <SeloProvisorio />}
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--gmp-text-light)', marginTop: 0 }}>
                Salva em {quandoFoi(termo.vigente.criado_em)}{termo.vigente.criado_por_nome ? ` por ${termo.vigente.criado_por_nome}` : ''}.
                Cada salvamento cria uma versão nova; os empréstimos já assinados continuam com a versão que o colaborador leu.
              </p>
              <div className="almox-field almox-form-full">
                <label className="almox-label" htmlFor="termo-texto-novo">Texto do termo *</label>
                <textarea id="termo-texto-novo" className="almox-textarea" rows={12} maxLength={20000} value={textoNovo}
                  onChange={(e) => setTextoNovo(e.target.value)} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '8px 0 16px' }}>
                <button type="button" className="btn-almox-primary" onClick={salvarNovaVersao} disabled={salvandoTermo}>
                  {salvandoTermo ? 'Salvando...' : 'Salvar nova versão'}
                </button>
              </div>
              <div className="almox-section-title">Histórico</div>
              <div className="almox-table-container">
                <table className="almox-table almox-termo-historico">
                  <thead><tr><th>Versão</th><th>Salva em</th><th>Por</th><th>Texto</th></tr></thead>
                  <tbody>
                    {(termo.historico || []).map((h) => (
                      <tr key={h.versao}>
                        <td>{h.versao}{h.provisorio && <SeloProvisorio />}</td>
                        <td>{quandoFoi(h.criado_em)}</td>
                        <td>{h.criado_por_nome || '—'}</td>
                        <td>
                          <details>
                            <summary>Ver texto</summary>
                            <div style={{ ...ESTILO_TEXTO_TERMO, marginTop: 6 }}>{h.texto}</div>
                          </details>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {(modal?.tipo === 'nova' || modal?.tipo === 'editar') && (
        <div className="almox-modal-overlay" onClick={() => { if (!salvando) setModal(null); }}>
          <div className="almox-modal almox-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>{modal.tipo === 'editar' ? 'Editar ferramenta' : 'Nova ferramenta'}</h2>
              <button className="almox-modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <div className="almox-form-grid">
                <div className="almox-field">
                  <label className="almox-label">Código de patrimônio<span className="required">*</span></label>
                  <input className="almox-input" value={form.codigo_patrimonio}
                    onChange={(e) => setForm((f) => ({ ...f, codigo_patrimonio: e.target.value }))} />
                </div>
                <div className="almox-field">
                  <label className="almox-label">Nome<span className="required">*</span></label>
                  <input className="almox-input" value={form.nome}
                    onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
                </div>
                <div className="almox-field">
                  <label className="almox-label">Tipo</label>
                  <input className="almox-input" value={form.tipo}
                    onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))} placeholder="Instrumento de medição" />
                </div>
                <div className="almox-field">
                  <label className="almox-label">Setor responsável</label>
                  <input className="almox-input" value={form.setor_responsavel}
                    onChange={(e) => setForm((f) => ({ ...f, setor_responsavel: e.target.value }))} />
                </div>
                <div className="almox-field">
                  <label className="almox-label">Número de série</label>
                  <input className="almox-input" value={form.numero_serie}
                    onChange={(e) => setForm((f) => ({ ...f, numero_serie: e.target.value }))} />
                </div>
                <div className="almox-field">
                  <label className="almox-label">Material do catálogo (opcional)</label>
                  <select className="almox-form-select" value={form.material_id}
                    onChange={(e) => setForm((f) => ({ ...f, material_id: e.target.value }))}>
                    <option value="">—</option>
                    {/* RN-175.06: material gravado fora da lista carregada — sem esta opção o seletor mostraria "—"
                        com o id no estado, e o salvar o regravaria calado */}
                    {form.material_id !== '' && !materiais.some((m) => String(m.id) === String(form.material_id)) && (
                      <option value={form.material_id}>{`Material #${form.material_id}`}</option>
                    )}
                    {materiais.map((m) => <option key={m.id} value={m.id}>{m.codigo} — {m.nome}</option>)}
                  </select>
                </div>
                <div className="almox-field">
                  <label className="almox-label">Localização</label>
                  <select className="almox-form-select" value={form.localizacao_id}
                    onChange={(e) => setForm((f) => ({ ...f, localizacao_id: e.target.value }))}>
                    <option value="">—</option>
                    {form.localizacao_id !== '' && !localizacoes.some((l) => String(l.id) === String(form.localizacao_id)) && (
                      <option value={form.localizacao_id}>{`Localização #${form.localizacao_id}`}</option>
                    )}
                    {localizacoes.map((l) => <option key={l.id} value={l.id}>{rotuloLocalizacao(l)}</option>)}
                  </select>
                </div>
              </div>
              <div className="almox-field almox-form-full">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.875rem', color: 'var(--gmp-text)' }}>
                  <input type="checkbox" checked={form.exige_calibracao}
                    onChange={(e) => setForm((f) => ({ ...f, exige_calibracao: e.target.checked }))} />
                  Exige calibração (instrumento de medição)
                </label>
                <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>
                  Marcada, o empréstimo recusa sem calibração vigente registrada (RN-03).
                </small>
              </div>
              <div className="almox-field almox-form-full">
                <label className="almox-label">Observações</label>
                <textarea className="almox-textarea" rows={2} value={form.observacoes}
                  onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
              </div>
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setModal(null)} disabled={salvando}>Fechar</button>
              <button className="btn-almox-primary" onClick={confirmar} disabled={salvando}>
                {salvando ? 'Salvando...' : (modal.tipo === 'editar' ? 'Salvar' : 'Cadastrar')}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal?.tipo === 'emprestar' && (
        <div className="almox-modal-overlay" onClick={() => { if (!salvando) setModal(null); }}>
          <div className="almox-modal almox-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>Emprestar ferramenta</h2>
              <button className="almox-modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <p style={{ marginTop: 0 }}><strong>{modal.ferramenta.codigo_patrimonio}</strong> — {modal.ferramenta.nome}</p>
              {/* Etapa 187 (RN-187.08b, B1246): avisa e NAO bloqueia — o envio segue normal */}
              {modal.ferramenta.restricao && (
                <p role="note" className="almox-badge almox-badge-baixo" style={{ display: 'block', whiteSpace: 'normal', padding: '8px 10px' }}>
                  {/* Fase 5 da 187: a observacao que ja termina em . ! ? (ou reticencias) nao ganha outro ponto; o texto do usuario fica intacto */}
                  Esta ferramenta voltou da manutenção em uso com restrição: {modal.ferramenta.restricao.observacoes}{/[.!?…]$/.test(String(modal.ferramenta.restricao.observacoes || '')) ? '' : '.'} Confira antes de emprestar.
                </p>
              )}
              <div className="almox-field">
                <label className="almox-label" htmlFor="emprestimo-colaborador">Colaborador<span className="required">*</span></label>
                <select id="emprestimo-colaborador" className="almox-form-select" value={formEmprestar.colaborador_id}
                  onChange={(e) => setEmprestar('colaborador_id', e.target.value)}>
                  <option value="">{colaboradores === null ? 'Carregando...' : 'Selecione...'}</option>
                  {(colaboradores || []).map((c) => <option key={c.id} value={c.id}>{rotuloColaboradorEmprestimo(c)}</option>)}
                </select>
              </div>
              <div className="almox-field">
                <label className="almox-label" htmlFor="emprestimo-data-prevista">Data prevista de devolução</label>
                <input id="emprestimo-data-prevista" className="almox-input" type="date" value={formEmprestar.data_prevista_devolucao}
                  onChange={(e) => setEmprestar('data_prevista_devolucao', e.target.value)} />
              </div>
              <div className="almox-field">
                <label className="almox-label" htmlFor="emprestimo-observacoes">Observações</label>
                <textarea id="emprestimo-observacoes" className="almox-textarea" rows={2} maxLength={1000} value={formEmprestar.observacoes}
                  onChange={(e) => setEmprestar('observacoes', e.target.value)} />
              </div>
              <div className="almox-field almox-form-full">
                <label className="almox-label">
                  Termo de responsabilidade{termo?.vigente ? ` — versão ${termo.vigente.versao}` : ''}
                  {termo?.vigente?.provisorio && <SeloProvisorio />}
                </label>
                {avisoTermo && (
                  <div className="almox-aviso-erro almox-termo-aviso" role="alert" style={{ marginBottom: 6 }}>{avisoTermo}</div>
                )}
                {carregandoTermo ? <p>Carregando o texto do termo...</p> : termo?.vigente ? (
                  <div className="almox-termo-texto" style={ESTILO_TEXTO_TERMO}>{termo.vigente.texto}</div>
                ) : (
                  <div className="almox-aviso-erro" role="alert">O texto do termo não foi carregado — atualize e tente de novo</div>
                )}
              </div>
              <div className="almox-field almox-form-full">
                <label className="almox-label">Assinatura do colaborador<span className="required">*</span></label>
                {assinatura ? (
                  <div className="almox-termo-assinatura-ok" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FiCheckCircle size={14} /> Assinatura confirmada
                    <button type="button" className="btn-almox-secondary" onClick={limparAssinatura}>Refazer assinatura</button>
                  </div>
                ) : (
                  <AssinaturaCanvas key={canvasKey} onConfirm={(blob) => { chaveRef.current = null; setAssinatura(blob); }} />
                )}
              </div>
              <div className="almox-field">
                <label className="almox-label" htmlFor="emprestimo-confirmacao-matricula">Matrícula — digitada pelo colaborador<span className="required">*</span></label>
                <input id="emprestimo-confirmacao-matricula" className="almox-input" autoComplete="off" maxLength={40}
                  placeholder="O colaborador digita a própria matrícula" value={formEmprestar.confirmacao_matricula}
                  onChange={(e) => setEmprestar('confirmacao_matricula', e.target.value)} />
              </div>
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setModal(null)} disabled={salvando}>Fechar</button>
              <button className="btn-almox-primary" onClick={confirmar} disabled={salvando || carregandoTermo}>
                {salvando ? 'Emprestando...' : 'Emprestar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal?.tipo === 'termo' && termoEmprestimo && (() => {
        const t = termoEmprestimo.termo || {};
        const ev = termoEmprestimo.evidencia || {};
        const urlAssinatura = resolveMaterialPhotoUrl(ev.arquivo_url);
        return (
          <div className="almox-modal-overlay" onClick={() => setModal(null)}>
            <div className="almox-modal almox-modal-lg almox-termo-emprestimo" onClick={(e) => e.stopPropagation()}>
              <div className="almox-modal-header">
                <h2>Termo {t.numero}</h2>
                <button className="almox-modal-close" onClick={() => setModal(null)}>✕</button>
              </div>
              <div className="almox-modal-body">
                <div className="almox-termo-dados" style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>
                  <div>
                    <strong>Versão do texto:</strong> {t.versao}{t.provisorio && <SeloProvisorio />}
                  </div>
                  <div><strong>Ferramenta:</strong> {t.ferramenta?.codigo_patrimonio} — {t.ferramenta?.nome}{t.ferramenta?.numero_serie ? ` · série ${t.ferramenta.numero_serie}` : ''}</div>
                  <div>
                    <strong>Colaborador:</strong> {t.colaborador?.nome} · matrícula {t.colaborador?.matricula || '—'}
                    {t.colaborador?.setor ? ` · ${t.colaborador.setor}` : ''}
                  </div>
                  <div><strong>Matrícula confirmada pelo colaborador:</strong> {matriculaConfirmadaTexto(termoEmprestimo.evidencia, t.colaborador)}</div>
                  <div><strong>Devolução prevista:</strong> {formatarDataDoBanco(t.data_prevista_devolucao, '—', { soData: true })}</div>
                  <div><strong>Assinado em:</strong> {quandoFoi(t.criado_em)}{t.criado_por_nome ? ` · registrado por ${t.criado_por_nome}` : ''}</div>
                  <div title={ev.registro_sha256}><strong>Código de verificação:</strong> <code>{codigoVerificacao(ev.registro_sha256)}</code></div>
                </div>
                <div className="almox-termo-texto" style={{ ...ESTILO_TEXTO_TERMO, margin: '10px 0' }}>{t.texto}</div>
                <div>
                  {urlAssinatura ? (
                    <img className="almox-termo-assinatura" src={urlAssinatura} alt="Assinatura do colaborador" style={{ height: 70, background: '#fff', border: '1px solid var(--gmp-border)', borderRadius: 6 }} />
                  ) : <span>(imagem da assinatura indisponível)</span>}
                </div>
                {seloTermo && (
                  <div style={{ marginTop: 10 }}>
                    <span className={`almox-badge almox-badge-${seloTermo.ok ? 'ok' : 'critico'} almox-termo-selo`}>{seloTermo.texto}</span>
                  </div>
                )}
              </div>
              <div className="almox-modal-footer">
                <button className="btn-almox-secondary" onClick={() => setModal(null)}>Fechar</button>
                <button className="btn-almox-secondary" onClick={verificarTermo} disabled={verificandoTermo}>
                  <FiSearch size={13} /> {verificandoTermo ? 'Verificando...' : 'Verificar integridade'}
                </button>
                <button className="btn-almox-primary" onClick={baixarPdfTermo} disabled={gerandoPdfTermo}>
                  <FiFileText size={13} /> {gerandoPdfTermo ? 'Gerando...' : 'PDF do termo'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {ROTA_JUSTIFICATIVA[modal?.tipo] && (
        <div className="almox-modal-overlay" onClick={() => { if (!salvando) setModal(null); }}>
          <div className="almox-modal almox-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>{TITULO_JUSTIFICATIVA[modal.tipo]}</h2>
              <button className="almox-modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <p style={{ marginTop: 0 }}><strong>{modal.ferramenta.codigo_patrimonio}</strong> — {modal.ferramenta.nome}</p>
              <div className="almox-field">
                <label className="almox-label">Justificativa<span className="required">*</span></label>
                <textarea className="almox-textarea" rows={3} value={formJustificativa.justificativa}
                  onChange={(e) => setFormJustificativa({ justificativa: e.target.value })} />
                <small style={{ color: 'var(--gmp-text-light)', fontSize: '0.75rem' }}>Mínimo de 5 caracteres.</small>
              </div>
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setModal(null)} disabled={salvando}>Fechar</button>
              <button className="btn-almox-primary" onClick={confirmar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal?.tipo === 'manutencao' && (
        <div className="almox-modal-overlay" onClick={() => { if (!salvando) setModal(null); }}>
          <div className="almox-modal almox-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>Iniciar manutenção</h2>
              <button className="almox-modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <p style={{ marginTop: 0 }}><strong>{modal.ferramenta.codigo_patrimonio}</strong> — {modal.ferramenta.nome}</p>
              <div className="almox-field">
                <label className="almox-label">Descrição<span className="required">*</span></label>
                <textarea className="almox-textarea" rows={3} value={formManutencao.descricao}
                  onChange={(e) => setFormManutencao({ descricao: e.target.value })} />
              </div>
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setModal(null)} disabled={salvando}>Fechar</button>
              <button className="btn-almox-primary" onClick={confirmar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Iniciar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal?.tipo === 'concluir-manutencao' && (
        <div className="almox-modal-overlay" onClick={() => { if (!salvando) setModal(null); }}>
          <div className="almox-modal almox-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>Concluir manutenção</h2>
              <button className="almox-modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <p style={{ marginTop: 0 }}><strong>{modal.ferramenta.codigo_patrimonio}</strong> — {modal.ferramenta.nome}</p>
              <div className="almox-field">
                <label className="almox-label" htmlFor="concluir-condicao">Condição do item *</label>
                {/* Inservivel puxa o destino para a baixa: e a unica combinacao que o servidor aceita (RN-177.03). */}
                <select id="concluir-condicao" data-testid="concluir-condicao" className="almox-select"
                  value={formConcluirManutencao.condicao}
                  onChange={(e) => {
                    const condicao = e.target.value;
                    setFormConcluirManutencao((p) => ({ ...p, condicao, destino: condicao === 'INSERVIVEL' ? 'BAIXA' : p.destino }));
                  }}>
                  <option value="">Escolha…</option>
                  {CONDICOES_RETORNO.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="almox-field">
                <label className="almox-label" htmlFor="concluir-destino">Destino *</label>
                <select id="concluir-destino" data-testid="concluir-destino" className="almox-select"
                  value={formConcluirManutencao.destino}
                  onChange={(e) => setFormConcluirManutencao((p) => ({ ...p, destino: e.target.value }))}>
                  {DESTINOS_RETORNO.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
              <div className="almox-field">
                <label className="almox-label">
                  {formConcluirManutencao.destino === 'BAIXA' ? 'Motivo da baixa *'
                    : formConcluirManutencao.condicao === 'COM_RESTRICAO' ? 'Qual é a restrição *' : 'Observações'}
                </label>
                <textarea className="almox-textarea" rows={3} value={formConcluirManutencao.observacoes}
                  data-testid="concluir-observacoes"
                  onChange={(e) => setFormConcluirManutencao((p) => ({ ...p, observacoes: e.target.value }))} />
              </div>
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setModal(null)} disabled={salvando}>Fechar</button>
              <button className="btn-almox-primary" onClick={confirmar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Concluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal?.tipo === 'ocorrencia' && (
        <div className="almox-modal-overlay" onClick={() => { if (!salvando) setModal(null); }}>
          <div className="almox-modal almox-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>Registrar ocorrência</h2>
              <button className="almox-modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <p style={{ marginTop: 0 }}><strong>{modal.ferramenta.codigo_patrimonio}</strong> — {modal.ferramenta.nome}</p>
              <div className="almox-field">
                <label className="almox-label">Tipo<span className="required">*</span></label>
                <select className="almox-form-select" value={formOcorrencia.tipo}
                  onChange={(e) => setFormOcorrencia((f) => ({ ...f, tipo: e.target.value }))}>
                  <option value="AVARIA">Avaria</option>
                  <option value="PERDA">Perda</option>
                </select>
              </div>
              <div className="almox-field">
                <label className="almox-label">Descrição<span className="required">*</span></label>
                <textarea className="almox-textarea" rows={3} value={formOcorrencia.descricao}
                  onChange={(e) => setFormOcorrencia((f) => ({ ...f, descricao: e.target.value }))} />
              </div>
              <div className="almox-field">
                <label className="almox-label">Responsável</label>
                <input className="almox-input" value={formOcorrencia.responsavel_nome}
                  onChange={(e) => setFormOcorrencia((f) => ({ ...f, responsavel_nome: e.target.value }))} />
              </div>
              <div className="almox-field">
                <label className="almox-label">Foto (opcional)</label>
                <input className="almox-input" type="file" accept="image/*"
                  onChange={(e) => setFormOcorrencia((f) => ({ ...f, foto: e.target.files?.[0] || null }))} />
              </div>
              {modal.ferramenta.status === 'EMPRESTADA' && (
                <p style={{ fontSize: '0.75rem', color: 'var(--gmp-text-light)' }}>
                  Esta ferramenta está emprestada — registrar avaria ou perda encerra o empréstimo aberto (RN-05).
                </p>
              )}
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setModal(null)} disabled={salvando}>Fechar</button>
              <button className="btn-almox-primary" onClick={confirmar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal?.tipo === 'calibracao' && (
        <div className="almox-modal-overlay" onClick={() => { if (!salvando) setModal(null); }}>
          <div className="almox-modal almox-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="almox-modal-header">
              <h2>Registrar calibração</h2>
              <button className="almox-modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="almox-modal-body">
              <p style={{ marginTop: 0 }}><strong>{modal.ferramenta.codigo_patrimonio}</strong> — {modal.ferramenta.nome}</p>
              <div className="almox-field">
                <label className="almox-label">Data da calibração<span className="required">*</span></label>
                <input className="almox-input" type="date" value={formCalibracao.data_calibracao}
                  onChange={(e) => setFormCalibracao((f) => ({ ...f, data_calibracao: e.target.value }))} />
              </div>
              <div className="almox-field">
                <label className="almox-label">Data de validade<span className="required">*</span></label>
                <input className="almox-input" type="date" value={formCalibracao.data_validade}
                  onChange={(e) => setFormCalibracao((f) => ({ ...f, data_validade: e.target.value }))} />
              </div>
              <div className="almox-field">
                <label className="almox-label">Observações</label>
                <textarea className="almox-textarea" rows={2} value={formCalibracao.observacoes}
                  onChange={(e) => setFormCalibracao((f) => ({ ...f, observacoes: e.target.value }))} />
              </div>
              <div className="almox-field">
                <label className="almox-label">Certificado (PDF ou imagem)</label>
                <input className="almox-input" type="file" accept=".pdf,image/*"
                  onChange={(e) => setFormCalibracao((f) => ({ ...f, certificado: e.target.files?.[0] || null }))} />
              </div>
            </div>
            <div className="almox-modal-footer">
              <button className="btn-almox-secondary" onClick={() => setModal(null)} disabled={salvando}>Fechar</button>
              <button className="btn-almox-primary" onClick={confirmar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FerramentasAlmoxarifado;
