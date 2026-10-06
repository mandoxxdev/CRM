import React, { useState, useEffect, Suspense, lazy } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { getEffectiveUser } from '../services/permissionsCache';
import { canConfigureModule } from '../utils/systemPermissions';
import { MODULOS_META, MODULOS_ORDEM } from '../constants/modulosMeta';
import { FiSettings, FiRefreshCw, FiBriefcase, FiMail, FiDatabase, FiGlobe, FiDollarSign, FiLayers, FiGrid, FiPackage, FiFileText } from 'react-icons/fi';
import VariaveisTecnicas from './VariaveisTecnicas';
import OpcoesPorFamilia from './OpcoesPorFamilia';
import ConfigTemplateProposta from './ConfigTemplateProposta';
import Tabs from './ui/Tabs';
import ModuleLoading from './ModuleLoading';
import { mascararTelefoneDigitando, mascararTelefoneCompleto } from '../utils/telefone';
import './Configuracoes.css';

// Etapa 36 (RN-36.04/05): as telas de configuracao do almoxarifado e da producao sao
// EMBUTIDAS aqui (prop `embedded`), nao movidas — as rotas antigas continuam. `lazy` LOCAL de
// proposito: importar direto incharia o chunk desta tela com as duas telas inteiras, e importar
// de `routes/lazyModules.js` faria ciclo (ele ja importa `Configuracoes`).
const ConfiguracoesAlmoxarifado = lazy(() => import('./almoxarifado/ConfiguracoesAlmoxarifado'));
const ConfiguracoesProducao = lazy(() => import('./producao/ConfiguracoesProducao'));

// Etapa 36 (RN-36.01): a barra de modulos vem de MODULOS_ORDEM/MODULOS_META (a lista que o
// cliente ja tem), sem `admin` (e /admin) e sem `todolist` (nao tem configuracao nem admin de
// modulo). `administrativo` e a aba "Geral" e aparece sempre — nao entra em modulosConfiguraveis.
const MODULOS_SEM_CONFIGURACAO = ['admin', 'todolist'];
const MODULO_GERAL = 'administrativo';
const MODULOS_EMBUTIDOS = ['almoxarifado', 'operacional'];

// Etapa 36 (RN-36.02/03): onde cada aba antiga da tela ficou. Geral = Empresa, Sistema, E-mail,
// Backup; Comercial = os tres blocos que operam familias_produto/propostas. Mudar de modulo e
// trocar uma linha aqui. Exportado para o teste e para traduzir o `location.state.tab` legado.
export const ABAS_POR_MODULO = {
  administrativo: [
    { id: 'empresa', label: 'Empresa', icon: FiBriefcase },
    { id: 'sistema', label: 'Sistema', icon: FiSettings },
    { id: 'email', label: 'E-mail', icon: FiMail },
    { id: 'backup', label: 'Backup', icon: FiDatabase },
  ],
  comercial: [
    { id: 'template-proposta', label: 'Template de proposta', icon: FiFileText },
    { id: 'opcoes-familia', label: 'Opções por família', icon: FiPackage },
    { id: 'variaveis-tecnicas', label: 'Variáveis técnicas', icon: FiGrid },
  ],
};

/** Modulos (alem da Geral) que o usuario pode configurar — a mesma regua do item "Configuracoes" do menu. */
export function modulosConfiguraveis(user) {
  if (!user) return [];
  return MODULOS_ORDEM.filter((m) => (
    m !== MODULO_GERAL
    && !MODULOS_SEM_CONFIGURACAO.includes(m)
    && canConfigureModule(user, m)
  ));
}

const moduloDaAbaLegada = (tab) => (
  Object.keys(ABAS_POR_MODULO).find((m) => ABAS_POR_MODULO[m].some((a) => a.id === tab)) || null
);

const PainelSemConfiguracoes = ({ nome }) => (
  <div className="config-section configuracoes-sem-config">
    <p>O módulo {nome} ainda não tem configurações próprias.</p>
  </div>
);

const Configuracoes = () => {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configs, setConfigs] = useState({});
  const [mensagem, setMensagem] = useState(null);
  // Etapa 21 (RN-07): a senha do SMTP tem estado LOCAL e nasce vazia — nunca recebe o valor que
  // vem do servidor. Molde: ConfiguracoesAlmoxarifado.js:2015/2193-2195.
  const [senhaSmtp, setSenhaSmtp] = useState('');
  const [senhaSmtpConfigurada, setSenhaSmtpConfigurada] = useState(false);
  const { theme, toggleTheme } = useTheme();

  // Etapa 36 (RN-36.07): a URL e a fonte da verdade. `?modulo=` escolhe o modulo (invalido ou
  // nao permitido -> Geral); `?tab=` a aba interna (fora do mapa -> primeira aba do modulo). Para
  // os modulos embutidos o `?tab=` e lido pela propria tela embutida, nao validado aqui.
  const effectiveUser = getEffectiveUser(user);
  const modulosVisiveis = [MODULO_GERAL, ...modulosConfiguraveis(effectiveUser)];
  const moduloParam = searchParams.get('modulo');
  const moduloAtivo = modulosVisiveis.includes(moduloParam) ? moduloParam : MODULO_GERAL;
  const abasDoModulo = ABAS_POR_MODULO[moduloAtivo] || [];
  const tabParam = searchParams.get('tab');
  const activeTab = abasDoModulo.some((a) => a.id === tabParam) ? tabParam : (abasDoModulo[0]?.id ?? null);
  const moduloEmbutido = MODULOS_EMBUTIDOS.includes(moduloAtivo);

  // `location.state.tab` legado (PropostasList.js: "Config. template" manda `template-proposta`)
  // e traduzido para a URL UMA vez, e so quando `?modulo` esta ausente. O `replace` derruba o
  // `state`, entao o efeito nao roda de novo e F5 cai na URL.
  const tabLegada = location.state?.tab;
  useEffect(() => {
    if (!tabLegada || searchParams.get('modulo')) return;
    const modulo = moduloDaAbaLegada(tabLegada);
    if (!modulo) return;
    setSearchParams({ modulo, tab: tabLegada }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabLegada]);

  const trocarModulo = (id) => {
    // Trocar de modulo LIMPA `?tab=` — a aba interna de um modulo nao faz sentido no outro.
    setSearchParams({ modulo: id });
  };

  const trocarAba = (id) => {
    setSearchParams((prev) => {
      prev.set('modulo', moduloAtivo);
      prev.set('tab', id);
      return prev;
    }, { replace: true });
  };

  useEffect(() => {
    loadConfiguracoes();
  }, []);

  const loadConfiguracoes = async () => {
    try {
      setLoading(true);
      const response = await api.get('/configuracoes');
      // O telefone da empresa foi gravado sem máscara por anos e é ele que sai impresso no
      // cabeçalho da proposta; mascara na abertura para o campo já exibir o formato final.
      const dados = response.data;
      if (dados?.empresa && typeof dados.empresa.empresa_telefone === 'string') {
        dados.empresa = {
          ...dados.empresa,
          empresa_telefone: mascararTelefoneCompleto(dados.empresa.empresa_telefone),
        };
      }
      // Etapa 21 (RN-07): o GET agora devolve '********' (ou '') para `email_smtp_pass`. O campo
      // NAO recebe esse valor — so o booleano que escolhe o placeholder. Testa por "nao vazio" e
      // nao por igualdade com a mascara de proposito: a forma da mascara mora no servidor
      // (`services/configSecrets.js`) e replica-la aqui criaria uma segunda fonte da verdade que
      // sairia de sincronia em silencio.
      setSenhaSmtpConfigurada(Boolean(dados?.email?.email_smtp_pass));
      setSenhaSmtp('');
      setConfigs(dados);
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
      setMensagem({ tipo: 'erro', texto: 'Erro ao carregar configurações' });
    } finally {
      setLoading(false);
    }
  };

  // `naoGuardarNoEstado` (Etapa 21, RN-07): usado pela senha do SMTP. Sem ele o `setConfigs`
  // abaixo guardaria a senha EM CLARO no estado do React logo depois de o servidor ter passado a
  // mascara-la no GET — a exposicao voltaria pela porta dos fundos, num objeto que o React
  // DevTools mostra inteiro. Devolve `true`/`false` para quem chama saber se limpa o campo.
  const updateConfig = async (categoria, chave, valor, { naoGuardarNoEstado = false } = {}) => {
    try {
      setSaving(true);
      const config = configs[categoria]?.[chave];
      await api.put(`/configuracoes/${chave}`, {
        valor,
        tipo: config?.tipo || 'text',
        categoria,
      });

      if (!naoGuardarNoEstado) {
        setConfigs(prev => ({
          ...prev,
          [categoria]: {
            ...prev[categoria],
            [chave]: valor
          }
        }));
      }

      setMensagem({ tipo: 'sucesso', texto: 'Configuração salva com sucesso!' });
      setTimeout(() => setMensagem(null), 3000);
      return true;
    } catch (error) {
      console.error('Erro ao salvar configuração:', error);
      const detalhe = error?.response?.data?.error;
      setMensagem({ tipo: 'erro', texto: detalhe || 'Erro ao salvar configuração' });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (categoria, chave, value) => {
    // Se for mudança de tema, aplicar imediatamente
    if (chave === 'tema') {
      const newTheme = value === 'escuro' ? 'dark' : 'light';
      // Só trocar se for diferente do tema atual
      if (newTheme !== theme) {
        toggleTheme();
      }
    }
    updateConfig(categoria, chave, value);
  };

  // Etapa 21 (RN-07). Esta tela salva a CADA TECLA (`handleChange` -> PUT). Com a senha amarrada
  // ao valor do servidor, o admin que clicasse no campo com '********' e digitasse mandaria
  // '********N' — que nao e a mascara, passava em guarda de igualdade e SOBRESCREVIA a senha real
  // com lixo; e como o GET remascara, o estrago ficava invisivel ate o e-mail nao sair. Um
  // backspace acidental gravava '*******' e matava o SMTP em silencio.
  //
  // Por isso a senha e o UNICO campo desta tela que nao salva a cada tecla: o onChange so alimenta
  // o estado local e o PUT sai no blur. Salvar por tecla aqui gravaria as senhas parciais 'N',
  // 'No', 'Nov'...
  //
  // O que o blur GARANTE, e o que nao garante (achado A7 da revisao adversarial, reproduzido):
  // ele reduz N gravacoes parciais para UMA, nao elimina a parcial. Quem digita metade da senha e
  // clica no campo de cima para conferir o usuario dispara o blur e grava a metade. O 400 do
  // servidor nao pega isso — 'Nov' e um valor legitimo do ponto de vista da guarda. Fechar de
  // verdade exigiria botao de salvar explicito nesta tela, que salva tudo por tecla; fica
  // declarado em vez de descrito como resolvido.
  // Campo vazio nao dispara PUT nenhum — e assim que se mantem a senha atual (o servidor tambem
  // recusa vazio com 400, RN-06; a tela so evita o erro desnecessario).
  const salvarSenhaSmtp = async () => {
    const valor = senhaSmtp.trim();
    if (!valor) return;
    const ok = await updateConfig('email', 'email_smtp_pass', valor, { naoGuardarNoEstado: true });
    if (ok) {
      setSenhaSmtp('');
      setSenhaSmtpConfigurada(true);
    }
  };

  // Etapa 36 (RN-36.07): a barra de modulos renderiza FORA do `loading` — o spinner do GET
  // /configuracoes fica so no conteudo da Geral; `?modulo=almoxarifado` nao espera por ele.
  const abasDeModulos = modulosVisiveis.map((m) => ({
    id: m,
    label: m === MODULO_GERAL ? 'Geral' : MODULOS_META[m].nome,
    icon: MODULOS_META[m].icon,
  }));
  const geralAtiva = moduloAtivo === MODULO_GERAL;
  const geralCarregando = geralAtiva && loading;

  return (
    <div className="configuracoes">
      <div className="configuracoes-header">
        <div>
          <h1><FiSettings /> Configurações do Sistema</h1>
          <p>Gerencie as configurações gerais do sistema</p>
        </div>
        {geralAtiva && (
          <button onClick={loadConfiguracoes} className="btn-refresh" disabled={loading}>
            <FiRefreshCw /> Atualizar
          </button>
        )}
      </div>

      {mensagem && (
        <div className={`mensagem ${mensagem.tipo}`}>
          {mensagem.texto}
        </div>
      )}

      <Tabs
        abas={abasDeModulos}
        ativa={moduloAtivo}
        onChange={trocarModulo}
        ariaLabel="Módulos"
      />

      {abasDoModulo.length > 0 && !geralCarregando && (
        <Tabs
          abas={abasDoModulo}
          ativa={activeTab}
          onChange={trocarAba}
          ariaLabel="Abas do módulo"
          tamanho="sm"
        />
      )}

      <div
        className={`configuracoes-content${moduloEmbutido ? ' configuracoes-content--embutido' : ''}`}
        role="tabpanel"
        id={`ui-tabpanel-${moduloAtivo}`}
      >
        {geralCarregando && (
          <div className="configuracoes-loading">
            <div className="loading-spinner"></div>
            <p>Carregando configurações...</p>
          </div>
        )}

        {moduloAtivo === 'almoxarifado' && (
          <Suspense fallback={<ModuleLoading module="almoxarifado" inline />}>
            <ConfiguracoesAlmoxarifado embedded />
          </Suspense>
        )}

        {moduloAtivo === 'operacional' && (
          <Suspense fallback={<ModuleLoading module="operacional" inline />}>
            <ConfiguracoesProducao embedded />
          </Suspense>
        )}

        {!geralAtiva && !moduloEmbutido && abasDoModulo.length === 0 && (
          <PainelSemConfiguracoes nome={MODULOS_META[moduloAtivo].nome} />
        )}

        {!geralCarregando && activeTab === 'empresa' && (
          <div className="config-section">
            <h2><FiBriefcase /> Informações da Empresa</h2>
            <div className="config-grid">
              <div className="config-item">
                <label>Nome da Empresa</label>
                <input
                  type="text"
                  value={configs.empresa?.empresa_nome || ''}
                  onChange={(e) => handleChange('empresa', 'empresa_nome', e.target.value)}
                />
              </div>
              <div className="config-item">
                <label>CNPJ</label>
                <input
                  type="text"
                  value={configs.empresa?.empresa_cnpj || ''}
                  onChange={(e) => handleChange('empresa', 'empresa_cnpj', e.target.value)}
                />
              </div>
              <div className="config-item full-width">
                <label>Endereço</label>
                <input
                  type="text"
                  value={configs.empresa?.empresa_endereco || ''}
                  onChange={(e) => handleChange('empresa', 'empresa_endereco', e.target.value)}
                />
              </div>
              <div className="config-item">
                <label>Cidade</label>
                <input
                  type="text"
                  value={configs.empresa?.empresa_cidade || ''}
                  onChange={(e) => handleChange('empresa', 'empresa_cidade', e.target.value)}
                />
              </div>
              <div className="config-item">
                <label>Estado</label>
                <input
                  type="text"
                  value={configs.empresa?.empresa_estado || ''}
                  onChange={(e) => handleChange('empresa', 'empresa_estado', e.target.value)}
                />
              </div>
              <div className="config-item">
                <label>CEP</label>
                <input
                  type="text"
                  value={configs.empresa?.empresa_cep || ''}
                  onChange={(e) => handleChange('empresa', 'empresa_cep', e.target.value)}
                />
              </div>
              <div className="config-item">
                <label>Telefone</label>
                <input
                  type="text"
                  value={configs.empresa?.empresa_telefone || ''}
                  onChange={(e) => handleChange('empresa', 'empresa_telefone', mascararTelefoneDigitando(e.target.value))}
                  placeholder="(00) 00000-0000"
                  inputMode="tel"
                  maxLength={15}
                />
              </div>
              <div className="config-item">
                <label>Email</label>
                <input
                  type="email"
                  value={configs.empresa?.empresa_email || ''}
                  onChange={(e) => handleChange('empresa', 'empresa_email', e.target.value)}
                />
              </div>
              <div className="config-item full-width">
                <label>Site</label>
                <input
                  type="url"
                  value={configs.empresa?.empresa_site || ''}
                  onChange={(e) => handleChange('empresa', 'empresa_site', e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {!geralCarregando && activeTab === 'sistema' && (
          <div className="config-section">
            <h2><FiSettings /> Configurações do Sistema</h2>
            <div className="config-grid">
              <div className="config-item">
                <label><FiDollarSign /> Moeda</label>
                <select
                  value={configs.sistema?.moeda || 'BRL'}
                  onChange={(e) => handleChange('sistema', 'moeda', e.target.value)}
                >
                  <option value="BRL">BRL - Real Brasileiro</option>
                  <option value="USD">USD - Dólar Americano</option>
                  <option value="EUR">EUR - Euro</option>
                </select>
              </div>
              <div className="config-item">
                <label><FiGlobe /> Fuso Horário</label>
                <select
                  value={configs.sistema?.fuso_horario || 'America/Sao_Paulo'}
                  onChange={(e) => handleChange('sistema', 'fuso_horario', e.target.value)}
                >
                  <option value="America/Sao_Paulo">America/Sao_Paulo (Brasil)</option>
                  <option value="America/New_York">America/New_York (EUA)</option>
                  <option value="Europe/London">Europe/London (Reino Unido)</option>
                </select>
              </div>
              <div className="config-item">
                <label>Idioma</label>
                <select
                  value={configs.sistema?.idioma || 'pt-BR'}
                  onChange={(e) => handleChange('sistema', 'idioma', e.target.value)}
                >
                  <option value="pt-BR">Português (Brasil)</option>
                  <option value="en-US">English (US)</option>
                  <option value="es-ES">Español</option>
                </select>
              </div>
              <div className="config-item">
                <label>Tema</label>
                <select
                  value={theme === 'dark' ? 'escuro' : 'claro'}
                  onChange={(e) => handleChange('sistema', 'tema', e.target.value)}
                >
                  <option value="claro">Claro</option>
                  <option value="escuro">Escuro</option>
                </select>
              </div>
              <div className="config-item">
                <label><FiLayers /> Fundo Animado</label>
                <select
                  value={localStorage.getItem('animatedBackground') !== 'false' ? 'true' : 'false'}
                  onChange={(e) => {
                    localStorage.setItem('animatedBackground', e.target.value);
                    window.dispatchEvent(new Event('animatedBackgroundChanged'));
                  }}
                >
                  <option value="true">Ativado</option>
                  <option value="false">Desativado</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {!geralCarregando && activeTab === 'email' && (
          <div className="config-section">
            <h2><FiMail /> Configurações de Email</h2>
            <div className="config-grid">
              <div className="config-item">
                <label>Servidor SMTP</label>
                <input
                  type="text"
                  value={configs.email?.email_smtp_host || ''}
                  onChange={(e) => handleChange('email', 'email_smtp_host', e.target.value)}
                  placeholder="smtp.gmail.com"
                />
              </div>
              <div className="config-item">
                <label>Porta SMTP</label>
                <input
                  type="number"
                  value={configs.email?.email_smtp_port || 587}
                  onChange={(e) => handleChange('email', 'email_smtp_port', parseInt(e.target.value))}
                />
              </div>
              <div className="config-item">
                <label>Usuário SMTP</label>
                <input
                  type="text"
                  value={configs.email?.email_smtp_user || ''}
                  onChange={(e) => handleChange('email', 'email_smtp_user', e.target.value)}
                />
              </div>
              <div className="config-item">
                <label>Senha SMTP</label>
                <input
                  type="password"
                  value={senhaSmtp}
                  onChange={(e) => setSenhaSmtp(e.target.value)}
                  onBlur={salvarSenhaSmtp}
                  placeholder={senhaSmtpConfigurada
                    ? 'Senha configurada — deixe em branco para manter'
                    : 'Senha do e-mail ou app password'}
                />
              </div>
              <div className="config-item full-width">
                <label>Email Remetente</label>
                <input
                  type="email"
                  value={configs.email?.email_from || ''}
                  onChange={(e) => handleChange('email', 'email_from', e.target.value)}
                  placeholder="noreply@gmp.ind.br"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'variaveis-tecnicas' && (
          <VariaveisTecnicas />
        )}

        {activeTab === 'template-proposta' && (
          <ConfigTemplateProposta embedded />
        )}

        {activeTab === 'opcoes-familia' && (
          <OpcoesPorFamilia />
        )}

        {!geralCarregando && activeTab === 'backup' && (
          <div className="config-section">
            <h2><FiDatabase /> Configurações de Backup</h2>
            <div className="config-grid">
              <div className="config-item">
                <label>Backup Automático</label>
                <select
                  value={configs.backup?.backup_automatico ? 'true' : 'false'}
                  onChange={(e) => handleChange('backup', 'backup_automatico', e.target.value === 'true')}
                >
                  <option value="true">Ativado</option>
                  <option value="false">Desativado</option>
                </select>
              </div>
              <div className="config-item">
                <label>Frequência</label>
                <select
                  value={configs.backup?.backup_frequencia || 'diario'}
                  onChange={(e) => handleChange('backup', 'backup_frequencia', e.target.value)}
                >
                  <option value="diario">Diário</option>
                  <option value="semanal">Semanal</option>
                  <option value="mensal">Mensal</option>
                </select>
              </div>
              <div className="config-item">
                <label>Manter Backups (dias)</label>
                <input
                  type="number"
                  value={configs.backup?.backup_manter_dias || 30}
                  onChange={(e) => handleChange('backup', 'backup_manter_dias', parseInt(e.target.value))}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Configuracoes;

