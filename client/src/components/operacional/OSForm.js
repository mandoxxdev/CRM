import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { FiX, FiSave, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import './Operacional.css';
import './OSForm.css';

const OSForm = ({ os, onClose }) => {
  const [activeSection, setActiveSection] = useState('basico');
  const [formData, setFormData] = useState({
    // Básico
    numero_os: '',
    revisao: '00',
    proposta_id: null,
    projeto_id: '',
    cliente_id: '',
    tipo_os: 'fabricacao',
    prioridade: 'normal',
    status: 'pendente',
    data_abertura: new Date().toISOString().split('T')[0],
    data_prevista: '',
    data_entrada_pedido: '',
    data_entrega: '',
    data_ordem_producao: '',
    vendedor: '',
    numero_orcamento_aprovado: '',
    descricao: '',
    observacoes: '',
    responsavel_id: '',
    valor_total: 0,
    // Contrato e Pedido
    contrato_numero: '',
    pedido_numero: '',
    frete: 'EXW',
    montagem: 'Inclusa',
    nivel_necessidade: 'Normal',
    equipamento: 'PADRÃO',
    quantidade: 1,
    // Equipamento
    nome_equipamento: '',
    area_instalacao: 'Segura',
    volume_trabalho: '',
    produto_processado: '',
    densidade: '',
    viscosidade: '',
    temperatura_trabalho: '',
    numero_serie: '',
    pressao_trabalho: '',
    embalagem: '',
    observacao_equipamento: '',
    // Documentações (JSON)
    documentacoes: {
      manual: false,
      projeto_dimensional: false,
      certificado_materiais: false,
      diagrama_eletrico: false,
      fluxograma_cabos: false,
      art_nr12: false,
      art_nr13: false,
      art_planta_cargas: false,
      data_sheet: false,
      data_book: false,
      outros: false
    },
    // Configurações (JSON)
    configuracoes_equipamento: {
      potencia_total: '',
      redutor: '',
      sistema_mistura: '',
      material_tanque: '',
      material_eixo_helices: '',
      material_suportes: '',
      tampa: '',
      grau_protecao: '',
      interlock: '',
      fundo: '',
      bocais_saida: '',
      valvula_saida: '',
      extensor_enchimento: '',
      bocais_alimentacao_mp: '',
      fixacao: '',
      celulas_carga: '',
      sistema_exaustao: '',
      suporte_exaustao: '',
      painel_eletrico: '',
      acabamento_aco_inox: '',
      acabamento_aco_carbono: ''
    },
    // Checklist (JSON)
    checklist_inspecao: {
      solda: '',
      dimensional: '',
      montagem: '',
      alinhamento: '',
      balanceamento: '',
      helices_pas: '',
      acabamento: '',
      plaqueta: '',
      bomba: '',
      painel_eletrico: '',
      partida_equipamento: '',
      motor_redutor: '',
      material_contato: '',
      valvulas: '',
      esferas: '',
      tampa: '',
      grau_protecao: '',
      gravacao_logotipo: '',
      lubrificacao: '',
      celula_carga: ''
    },
    // Teste Final
    teste_final_aprovado: false,
    teste_final_reprovado: false,
    conferente_nome: '',
    data_conferencia: '',
    responsavel_assinatura: ''
  });

  const [loading, setLoading] = useState(false);
  const [proximoNumero, setProximoNumero] = useState('');
  const [clientes, setClientes] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);

  useEffect(() => {
    if (os) {
      // Parsear campos JSON
      let documentacoes = {};
      let configuracoes = {};
      let checklist = {};

      try {
        documentacoes = os.documentacoes ? JSON.parse(os.documentacoes) : formData.documentacoes;
      } catch (e) {
        documentacoes = formData.documentacoes;
      }

      try {
        configuracoes = os.configuracoes_equipamento ? JSON.parse(os.configuracoes_equipamento) : formData.configuracoes_equipamento;
      } catch (e) {
        configuracoes = formData.configuracoes_equipamento;
      }

      try {
        checklist = os.checklist_inspecao ? JSON.parse(os.checklist_inspecao) : formData.checklist_inspecao;
      } catch (e) {
        checklist = formData.checklist_inspecao;
      }

      setFormData({
        numero_os: os.numero_os || '',
        revisao: os.revisao || '00',
        proposta_id: os.proposta_id || null,
        projeto_id: os.projeto_id || '',
        cliente_id: os.cliente_id || '',
        tipo_os: os.tipo_os || 'fabricacao',
        prioridade: os.prioridade || 'normal',
        status: os.status || 'pendente',
        data_abertura: os.data_abertura ? os.data_abertura.split('T')[0] : new Date().toISOString().split('T')[0],
        data_prevista: os.data_prevista ? os.data_prevista.split('T')[0] : '',
        data_entrada_pedido: os.data_entrada_pedido ? os.data_entrada_pedido.split('T')[0] : '',
        data_entrega: os.data_entrega ? os.data_entrega.split('T')[0] : '',
        data_ordem_producao: os.data_ordem_producao ? os.data_ordem_producao.split('T')[0] : '',
        vendedor: os.vendedor || '',
        numero_orcamento_aprovado: os.numero_orcamento_aprovado || '',
        descricao: os.descricao || '',
        observacoes: os.observacoes || '',
        responsavel_id: os.responsavel_id || '',
        valor_total: os.valor_total || 0,
        contrato_numero: os.contrato_numero || '',
        pedido_numero: os.pedido_numero || '',
        frete: os.frete || 'EXW',
        montagem: os.montagem || 'Inclusa',
        nivel_necessidade: os.nivel_necessidade || 'Normal',
        equipamento: os.equipamento || 'PADRÃO',
        quantidade: os.quantidade || 1,
        nome_equipamento: os.nome_equipamento || '',
        area_instalacao: os.area_instalacao || 'Segura',
        volume_trabalho: os.volume_trabalho || '',
        produto_processado: os.produto_processado || '',
        densidade: os.densidade || '',
        viscosidade: os.viscosidade || '',
        temperatura_trabalho: os.temperatura_trabalho || '',
        numero_serie: os.numero_serie || '',
        pressao_trabalho: os.pressao_trabalho || '',
        embalagem: os.embalagem || '',
        observacao_equipamento: os.observacao_equipamento || '',
        documentacoes,
        configuracoes_equipamento: configuracoes,
        checklist_inspecao: checklist,
        teste_final_aprovado: os.teste_final_aprovado ? true : false,
        teste_final_reprovado: os.teste_final_reprovado ? true : false,
        conferente_nome: os.conferente_nome || '',
        data_conferencia: os.data_conferencia ? os.data_conferencia.split('T')[0] : '',
        responsavel_assinatura: os.responsavel_assinatura || ''
      });
    } else {
      loadProximoNumero();
    }
    loadClientes();
    loadProjetos();
    loadUsuarios();
  }, [os]);

  const loadProximoNumero = async () => {
    try {
      const response = await api.get('/operacional/ordens-servico/proximo-numero');
      setProximoNumero(response.data.proximo_numero);
      setFormData(prev => ({ ...prev, numero_os: response.data.proximo_numero }));
    } catch (error) {
      console.error('Erro ao carregar próximo número:', error);
    }
  };

  const loadClientes = async () => {
    try {
      const response = await api.get('/clientes');
      setClientes(response.data || []);
    } catch (error) {
      console.error('Erro ao carregar clientes:', error);
    }
  };

  const loadProjetos = async () => {
    try {
      const response = await api.get('/projetos');
      setProjetos(response.data || []);
    } catch (error) {
      console.error('Erro ao carregar projetos:', error);
    }
  };

  const loadUsuarios = async () => {
    try {
      const response = await api.get('/usuarios');
      setUsuarios(response.data || []);
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        ...formData,
        documentacoes: JSON.stringify(formData.documentacoes),
        configuracoes_equipamento: JSON.stringify(formData.configuracoes_equipamento),
        checklist_inspecao: JSON.stringify(formData.checklist_inspecao)
      };

      if (os) {
        await api.put(`/operacional/ordens-servico/${os.id}`, payload);
        toast.success('OS atualizada com sucesso');
      } else {
        await api.post('/operacional/ordens-servico', payload);
        toast.success('OS criada com sucesso');
      }
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao salvar OS');
    } finally {
      setLoading(false);
    }
  };

  const updateDocumentacao = (key, value) => {
    setFormData(prev => ({
      ...prev,
      documentacoes: {
        ...prev.documentacoes,
        [key]: value
      }
    }));
  };

  const updateConfiguracao = (key, value) => {
    setFormData(prev => ({
      ...prev,
      configuracoes_equipamento: {
        ...prev.configuracoes_equipamento,
        [key]: value
      }
    }));
  };

  const updateChecklist = (key, value) => {
    setFormData(prev => ({
      ...prev,
      checklist_inspecao: {
        ...prev.checklist_inspecao,
        [key]: value
      }
    }));
  };

  const sections = [
    { id: 'basico', label: 'Informações Básicas' },
    { id: 'documentacoes', label: 'Documentações' },
    { id: 'contrato', label: 'Contrato e Pedido' },
    { id: 'equipamento', label: 'Equipamento' },
    { id: 'configuracoes', label: 'Configurações' },
    { id: 'checklist', label: 'Checklist de Inspeção' },
    { id: 'teste', label: 'Teste Final' }
  ];

  const renderSection = () => {
    switch (activeSection) {
      case 'basico':
        return (
          <div className="form-section-content">
            <div className="form-grid">
              <div className="form-group">
                <label>Número OS *</label>
                <input
                  type="text"
                  value={formData.numero_os}
                  onChange={(e) => setFormData({ ...formData, numero_os: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Revisão</label>
                <input
                  type="text"
                  value={formData.revisao}
                  onChange={(e) => setFormData({ ...formData, revisao: e.target.value })}
                  placeholder="00"
                />
              </div>
              <div className="form-group">
                <label>Cliente</label>
                <select
                  value={formData.cliente_id}
                  onChange={(e) => setFormData({ ...formData, cliente_id: e.target.value })}
                >
                  <option value="">Selecione...</option>
                  {clientes.map(cliente => (
                    <option key={cliente.id} value={cliente.id}>
                      {cliente.razao_social || cliente.nome_fantasia}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Projeto</label>
                <select
                  value={formData.projeto_id}
                  onChange={(e) => setFormData({ ...formData, projeto_id: e.target.value })}
                >
                  <option value="">Selecione...</option>
                  {projetos.map(projeto => (
                    <option key={projeto.id} value={projeto.id}>
                      {projeto.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Tipo OS *</label>
                <select
                  value={formData.tipo_os}
                  onChange={(e) => setFormData({ ...formData, tipo_os: e.target.value })}
                  required
                >
                  <option value="fabricacao">Fabricação</option>
                  <option value="manutencao">Manutenção</option>
                  <option value="montagem">Montagem</option>
                  <option value="reparo">Reparo</option>
                </select>
              </div>
              <div className="form-group">
                <label>Prioridade</label>
                <select
                  value={formData.prioridade}
                  onChange={(e) => setFormData({ ...formData, prioridade: e.target.value })}
                >
                  <option value="baixa">Baixa</option>
                  <option value="normal">Normal</option>
                  <option value="alta">Alta</option>
                  <option value="urgente">Urgente</option>
                </select>
              </div>
              <div className="form-group">
                <label>Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                >
                  <option value="pendente">Pendente</option>
                  <option value="em_andamento">Em Andamento</option>
                  <option value="concluido">Concluído</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>
              <div className="form-group">
                <label>Data Abertura *</label>
                <input
                  type="date"
                  value={formData.data_abertura}
                  onChange={(e) => setFormData({ ...formData, data_abertura: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Data Entrada Pedido</label>
                <input
                  type="date"
                  value={formData.data_entrada_pedido}
                  onChange={(e) => setFormData({ ...formData, data_entrada_pedido: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Data Entrega</label>
                <input
                  type="date"
                  value={formData.data_entrega}
                  onChange={(e) => setFormData({ ...formData, data_entrega: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Data Ordem Produção</label>
                <input
                  type="date"
                  value={formData.data_ordem_producao}
                  onChange={(e) => setFormData({ ...formData, data_ordem_producao: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Data Prevista</label>
                <input
                  type="date"
                  value={formData.data_prevista}
                  onChange={(e) => setFormData({ ...formData, data_prevista: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Vendedor</label>
                <input
                  type="text"
                  value={formData.vendedor}
                  onChange={(e) => setFormData({ ...formData, vendedor: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Nº Orçamento Aprovado</label>
                <input
                  type="text"
                  value={formData.numero_orcamento_aprovado}
                  onChange={(e) => setFormData({ ...formData, numero_orcamento_aprovado: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Responsável</label>
                <select
                  value={formData.responsavel_id}
                  onChange={(e) => setFormData({ ...formData, responsavel_id: e.target.value })}
                >
                  <option value="">Selecione...</option>
                  {usuarios.map(usuario => (
                    <option key={usuario.id} value={usuario.id}>
                      {usuario.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Valor Total</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.valor_total}
                  onChange={(e) => setFormData({ ...formData, valor_total: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="form-group">
              <label>Descrição</label>
              <textarea
                value={formData.descricao}
                onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                rows="4"
              />
            </div>
            <div className="form-group">
              <label>Observações</label>
              <textarea
                value={formData.observacoes}
                onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                rows="3"
              />
            </div>
          </div>
        );

      case 'documentacoes':
        return (
          <div className="form-section-content">
            <div className="documentacoes-grid">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.documentacoes.manual}
                  onChange={(e) => updateDocumentacao('manual', e.target.checked)}
                />
                Manual
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.documentacoes.projeto_dimensional}
                  onChange={(e) => updateDocumentacao('projeto_dimensional', e.target.checked)}
                />
                Projeto Dimensional
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.documentacoes.certificado_materiais}
                  onChange={(e) => updateDocumentacao('certificado_materiais', e.target.checked)}
                />
                Certificado de Materiais
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.documentacoes.diagrama_eletrico}
                  onChange={(e) => updateDocumentacao('diagrama_eletrico', e.target.checked)}
                />
                Diagrama Elétrico
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.documentacoes.fluxograma_cabos}
                  onChange={(e) => updateDocumentacao('fluxograma_cabos', e.target.checked)}
                />
                Fluxograma de Cabos
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.documentacoes.art_nr12}
                  onChange={(e) => updateDocumentacao('art_nr12', e.target.checked)}
                />
                ART e Laudo NR12
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.documentacoes.art_nr13}
                  onChange={(e) => updateDocumentacao('art_nr13', e.target.checked)}
                />
                ART e Laudo NR13
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.documentacoes.art_planta_cargas}
                  onChange={(e) => updateDocumentacao('art_planta_cargas', e.target.checked)}
                />
                ART e Planta de Cargas
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.documentacoes.data_sheet}
                  onChange={(e) => updateDocumentacao('data_sheet', e.target.checked)}
                />
                Data Sheet
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.documentacoes.data_book}
                  onChange={(e) => updateDocumentacao('data_book', e.target.checked)}
                />
                Data Book
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.documentacoes.outros}
                  onChange={(e) => updateDocumentacao('outros', e.target.checked)}
                />
                Outros
              </label>
            </div>
          </div>
        );

      case 'contrato':
        return (
          <div className="form-section-content">
            <div className="form-grid">
              <div className="form-group">
                <label>Contrato Nº</label>
                <input
                  type="text"
                  value={formData.contrato_numero}
                  onChange={(e) => setFormData({ ...formData, contrato_numero: e.target.value })}
                  placeholder="Aprovado por Email"
                />
              </div>
              <div className="form-group">
                <label>Pedido Nº</label>
                <input
                  type="text"
                  value={formData.pedido_numero}
                  onChange={(e) => setFormData({ ...formData, pedido_numero: e.target.value })}
                  placeholder="Aprovado por Email"
                />
              </div>
              <div className="form-group">
                <label>Frete</label>
                <input
                  type="text"
                  value={formData.frete}
                  onChange={(e) => setFormData({ ...formData, frete: e.target.value })}
                  placeholder="EXW"
                />
              </div>
              <div className="form-group">
                <label>Montagem</label>
                <input
                  type="text"
                  value={formData.montagem}
                  onChange={(e) => setFormData({ ...formData, montagem: e.target.value })}
                  placeholder="Inclusa"
                />
              </div>
              <div className="form-group">
                <label>Nível Necessidade</label>
                <input
                  type="text"
                  value={formData.nivel_necessidade}
                  onChange={(e) => setFormData({ ...formData, nivel_necessidade: e.target.value })}
                  placeholder="Normal"
                />
              </div>
              <div className="form-group">
                <label>Equipamento</label>
                <input
                  type="text"
                  value={formData.equipamento}
                  onChange={(e) => setFormData({ ...formData, equipamento: e.target.value })}
                  placeholder="PADRÃO"
                />
              </div>
              <div className="form-group">
                <label>Quantidade</label>
                <input
                  type="number"
                  value={formData.quantidade}
                  onChange={(e) => setFormData({ ...formData, quantidade: parseInt(e.target.value) || 1 })}
                  min="1"
                />
              </div>
            </div>
          </div>
        );

      case 'equipamento':
        return (
          <div className="form-section-content">
            <div className="form-grid">
              <div className="form-group">
                <label>Nome do Equipamento</label>
                <input
                  type="text"
                  value={formData.nome_equipamento}
                  onChange={(e) => setFormData({ ...formData, nome_equipamento: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Área de Instalação</label>
                <select
                  value={formData.area_instalacao}
                  onChange={(e) => setFormData({ ...formData, area_instalacao: e.target.value })}
                >
                  <option value="A prova de explosão">A prova de explosão</option>
                  <option value="Segura">Segura</option>
                </select>
              </div>
              <div className="form-group">
                <label>Volume de Trabalho</label>
                <input
                  type="text"
                  value={formData.volume_trabalho}
                  onChange={(e) => setFormData({ ...formData, volume_trabalho: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Produto Processado</label>
                <input
                  type="text"
                  value={formData.produto_processado}
                  onChange={(e) => setFormData({ ...formData, produto_processado: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Densidade</label>
                <input
                  type="text"
                  value={formData.densidade}
                  onChange={(e) => setFormData({ ...formData, densidade: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Viscosidade</label>
                <input
                  type="text"
                  value={formData.viscosidade}
                  onChange={(e) => setFormData({ ...formData, viscosidade: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Temperatura de Trabalho</label>
                <input
                  type="text"
                  value={formData.temperatura_trabalho}
                  onChange={(e) => setFormData({ ...formData, temperatura_trabalho: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Nº Série</label>
                <input
                  type="text"
                  value={formData.numero_serie}
                  onChange={(e) => setFormData({ ...formData, numero_serie: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Pressão de Trabalho</label>
                <input
                  type="text"
                  value={formData.pressao_trabalho}
                  onChange={(e) => setFormData({ ...formData, pressao_trabalho: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Embalagem</label>
                <input
                  type="text"
                  value={formData.embalagem}
                  onChange={(e) => setFormData({ ...formData, embalagem: e.target.value })}
                />
              </div>
              <div className="form-group full-width">
                <label>Observação do Equipamento</label>
                <textarea
                  value={formData.observacao_equipamento}
                  onChange={(e) => setFormData({ ...formData, observacao_equipamento: e.target.value })}
                  rows="3"
                />
              </div>
            </div>
          </div>
        );

      case 'configuracoes':
        return (
          <div className="form-section-content">
            <div className="form-grid">
              <div className="form-group">
                <label>Potência Total</label>
                <input
                  type="text"
                  value={formData.configuracoes_equipamento.potencia_total}
                  onChange={(e) => updateConfiguracao('potencia_total', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Redutor</label>
                <input
                  type="text"
                  value={formData.configuracoes_equipamento.redutor}
                  onChange={(e) => updateConfiguracao('redutor', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Sistema de Mistura</label>
                <input
                  type="text"
                  value={formData.configuracoes_equipamento.sistema_mistura}
                  onChange={(e) => updateConfiguracao('sistema_mistura', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Material do Tanque</label>
                <input
                  type="text"
                  value={formData.configuracoes_equipamento.material_tanque}
                  onChange={(e) => updateConfiguracao('material_tanque', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Material do Eixo e Hélices</label>
                <input
                  type="text"
                  value={formData.configuracoes_equipamento.material_eixo_helices}
                  onChange={(e) => updateConfiguracao('material_eixo_helices', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Material dos Suportes e Reforços</label>
                <input
                  type="text"
                  value={formData.configuracoes_equipamento.material_suportes}
                  onChange={(e) => updateConfiguracao('material_suportes', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Tampa</label>
                <input
                  type="text"
                  value={formData.configuracoes_equipamento.tampa}
                  onChange={(e) => updateConfiguracao('tampa', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Grau de Proteção</label>
                <input
                  type="text"
                  value={formData.configuracoes_equipamento.grau_protecao}
                  onChange={(e) => updateConfiguracao('grau_protecao', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Interlock</label>
                <input
                  type="text"
                  value={formData.configuracoes_equipamento.interlock}
                  onChange={(e) => updateConfiguracao('interlock', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Fundo</label>
                <input
                  type="text"
                  value={formData.configuracoes_equipamento.fundo}
                  onChange={(e) => updateConfiguracao('fundo', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Bocais de Saída</label>
                <input
                  type="text"
                  value={formData.configuracoes_equipamento.bocais_saida}
                  onChange={(e) => updateConfiguracao('bocais_saida', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Válvula de Saída</label>
                <input
                  type="text"
                  value={formData.configuracoes_equipamento.valvula_saida}
                  onChange={(e) => updateConfiguracao('valvula_saida', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Extensor de Enchimento</label>
                <input
                  type="text"
                  value={formData.configuracoes_equipamento.extensor_enchimento}
                  onChange={(e) => updateConfiguracao('extensor_enchimento', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Bocais de Alimentação MP</label>
                <input
                  type="text"
                  value={formData.configuracoes_equipamento.bocais_alimentacao_mp}
                  onChange={(e) => updateConfiguracao('bocais_alimentacao_mp', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Fixação</label>
                <input
                  type="text"
                  value={formData.configuracoes_equipamento.fixacao}
                  onChange={(e) => updateConfiguracao('fixacao', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Células de Carga</label>
                <input
                  type="text"
                  value={formData.configuracoes_equipamento.celulas_carga}
                  onChange={(e) => updateConfiguracao('celulas_carga', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Sistema de Exaustão</label>
                <input
                  type="text"
                  value={formData.configuracoes_equipamento.sistema_exaustao}
                  onChange={(e) => updateConfiguracao('sistema_exaustao', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Suporte e Conexão do Sistema de Exaustão</label>
                <input
                  type="text"
                  value={formData.configuracoes_equipamento.suporte_exaustao}
                  onChange={(e) => updateConfiguracao('suporte_exaustao', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Painel Elétrico</label>
                <input
                  type="text"
                  value={formData.configuracoes_equipamento.painel_eletrico}
                  onChange={(e) => updateConfiguracao('painel_eletrico', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Acabamento Peças Aço Inox</label>
                <input
                  type="text"
                  value={formData.configuracoes_equipamento.acabamento_aco_inox}
                  onChange={(e) => updateConfiguracao('acabamento_aco_inox', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Acabamento Peças Aço Carbono</label>
                <input
                  type="text"
                  value={formData.configuracoes_equipamento.acabamento_aco_carbono}
                  onChange={(e) => updateConfiguracao('acabamento_aco_carbono', e.target.value)}
                />
              </div>
            </div>
          </div>
        );

      case 'checklist':
        return (
          <div className="form-section-content">
            <div className="checklist-container">
              {[
                { key: 'solda', label: 'Solda' },
                { key: 'dimensional', label: 'Dimensional' },
                { key: 'montagem', label: 'Montagem' },
                { key: 'alinhamento', label: 'Alinhamento' },
                { key: 'balanceamento', label: 'Balanceamento' },
                { key: 'helices_pas', label: 'Hélices e Pás' },
                { key: 'acabamento', label: 'Acabamento' },
                { key: 'plaqueta', label: 'Plaqueta' },
                { key: 'bomba', label: 'Bomba' },
                { key: 'painel_eletrico', label: 'Painel Elétrico' },
                { key: 'partida_equipamento', label: 'Partida do Equipamento' },
                { key: 'motor_redutor', label: 'Motor e Redutor' },
                { key: 'material_contato', label: 'Material de Contato' },
                { key: 'valvulas', label: 'Válvulas' },
                { key: 'esferas', label: 'Esferas' },
                { key: 'tampa', label: 'Tampa' },
                { key: 'grau_protecao', label: 'Grau de Proteção' },
                { key: 'gravacao_logotipo', label: 'Gravação Logotipo' },
                { key: 'lubrificacao', label: 'Lubrificação' },
                { key: 'celula_carga', label: 'Célula de Carga' }
              ].map(item => (
                <div key={item.key} className="checklist-item">
                  <label className="checklist-label">{item.label}</label>
                  <div className="checklist-options">
                    <label>
                      <input
                        type="radio"
                        name={item.key}
                        value="conforme"
                        checked={formData.checklist_inspecao[item.key] === 'conforme'}
                        onChange={() => updateChecklist(item.key, 'conforme')}
                      />
                      Conforme
                    </label>
                    <label>
                      <input
                        type="radio"
                        name={item.key}
                        value="nao_conforme"
                        checked={formData.checklist_inspecao[item.key] === 'nao_conforme'}
                        onChange={() => updateChecklist(item.key, 'nao_conforme')}
                      />
                      Não Conforme
                    </label>
                    <label>
                      <input
                        type="radio"
                        name={item.key}
                        value="nao_aplicado"
                        checked={formData.checklist_inspecao[item.key] === 'nao_aplicado'}
                        onChange={() => updateChecklist(item.key, 'nao_aplicado')}
                      />
                      Não Aplicado
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'teste':
        return (
          <div className="form-section-content">
            <div className="form-grid">
              <div className="form-group">
                <label>Teste Final</label>
                <div className="radio-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={formData.teste_final_aprovado}
                      onChange={(e) => {
                        setFormData(prev => ({
                          ...prev,
                          teste_final_aprovado: e.target.checked,
                          teste_final_reprovado: e.target.checked ? false : prev.teste_final_reprovado
                        }));
                      }}
                    />
                    Aprovado
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={formData.teste_final_reprovado}
                      onChange={(e) => {
                        setFormData(prev => ({
                          ...prev,
                          teste_final_reprovado: e.target.checked,
                          teste_final_aprovado: e.target.checked ? false : prev.teste_final_aprovado
                        }));
                      }}
                    />
                    Reprovado
                  </label>
                </div>
              </div>
              <div className="form-group">
                <label>Conferente (Nome Legível)</label>
                <input
                  type="text"
                  value={formData.conferente_nome}
                  onChange={(e) => setFormData({ ...formData, conferente_nome: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Data Conferência</label>
                <input
                  type="date"
                  value={formData.data_conferencia}
                  onChange={(e) => setFormData({ ...formData, data_conferencia: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Responsável (Assinatura)</label>
                <input
                  type="text"
                  value={formData.responsavel_assinatura}
                  onChange={(e) => setFormData({ ...formData, responsavel_assinatura: e.target.value })}
                />
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="os-form-container">
      <div className="form-header">
        <h2>{os ? 'Editar OS' : 'Nova Ordem de Serviço'}</h2>
        <button className="btn-icon" onClick={onClose}>
          <FiX />
        </button>
      </div>

      <div className="os-form-sections">
        <div className="sections-sidebar">
          {sections.map(section => (
            <button
              key={section.id}
              type="button"
              className={`section-btn ${activeSection === section.id ? 'active' : ''}`}
              onClick={() => setActiveSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="os-form-content">
          {renderSection()}
          
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              <FiSave /> {loading ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default OSForm;
