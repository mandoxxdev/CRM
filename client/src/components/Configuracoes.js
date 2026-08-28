import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { FiSettings, FiSave, FiRefreshCw, FiBriefcase, FiMail, FiDatabase, FiGlobe, FiDollarSign, FiLayers, FiGrid, FiPackage, FiFileText } from 'react-icons/fi';
import VariaveisTecnicas from './VariaveisTecnicas';
import OpcoesPorFamilia from './OpcoesPorFamilia';
import ConfigTemplateProposta from './ConfigTemplateProposta';
import { mascararTelefoneDigitando, mascararTelefoneCompleto } from '../utils/telefone';
import './Configuracoes.css';

const Configuracoes = () => {
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configs, setConfigs] = useState({});
  const [activeTab, setActiveTab] = useState('empresa');
  const [mensagem, setMensagem] = useState(null);
  // Etapa 21 (RN-07): a senha do SMTP tem estado LOCAL e nasce vazia — nunca recebe o valor que
  // vem do servidor. Molde: ConfiguracoesAlmoxarifado.js:2015/2193-2195.
  const [senhaSmtp, setSenhaSmtp] = useState('');
  const [senhaSmtpConfigurada, setSenhaSmtpConfigurada] = useState(false);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const tab = location.state?.tab;
    if (tab && ['empresa', 'sistema', 'email', 'backup', 'variaveis-tecnicas', 'template-proposta', 'opcoes-familia'].includes(tab)) {
      setActiveTab(tab);
    }
  }, [location.state?.tab]);

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
  // 'No', 'Nov'... e quem saisse da tela no meio da digitacao deixaria o SMTP com meia senha.
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

  if (loading) {
    return (
      <div className="configuracoes-loading">
        <div className="loading-spinner"></div>
        <p>Carregando configurações...</p>
      </div>
    );
  }

  const tabs = [
    { id: 'empresa', label: 'Empresa', icon: FiBriefcase },
    { id: 'sistema', label: 'Sistema', icon: FiSettings },
    { id: 'email', label: 'Email', icon: FiMail },
    { id: 'backup', label: 'Backup', icon: FiDatabase },
    { id: 'variaveis-tecnicas', label: 'Variáveis técnicas', icon: FiGrid },
    { id: 'template-proposta', label: 'Template de proposta', icon: FiFileText },
    { id: 'opcoes-familia', label: 'Opções por família', icon: FiPackage },
  ];

  return (
    <div className="configuracoes">
      <div className="configuracoes-header">
        <div>
          <h1><FiSettings /> Configurações do Sistema</h1>
          <p>Gerencie as configurações gerais do sistema</p>
        </div>
        <button onClick={loadConfiguracoes} className="btn-refresh" disabled={loading}>
          <FiRefreshCw /> Atualizar
        </button>
      </div>

      {mensagem && (
        <div className={`mensagem ${mensagem.tipo}`}>
          {mensagem.texto}
        </div>
      )}

      <div className="configuracoes-tabs">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={`tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon /> {tab.label}
            </button>
          );
        })}
      </div>

      <div className="configuracoes-content">
        {activeTab === 'empresa' && (
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

        {activeTab === 'sistema' && (
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

        {activeTab === 'email' && (
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

        {activeTab === 'backup' && (
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

