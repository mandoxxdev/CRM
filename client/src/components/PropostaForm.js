import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import { FiPlus, FiTrash2, FiPackage, FiX, FiCheck, FiClock, FiList, FiMessageSquare, FiSend, FiPaperclip, FiDownload, FiFile, FiAlertCircle, FiDollarSign, FiFileText, FiShoppingCart, FiSettings } from 'react-icons/fi';
import PreviewPropostaEditavel from './PreviewPropostaEditavel';
import SelecaoProdutosPremium from './SelecaoProdutosPremium';
import './PropostaForm.css';

const PropostaForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [clientes, setClientes] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [showProdutosModal, setShowProdutosModal] = useState(false);
  const [itens, setItens] = useState([]);
  const [gerandoNumero, setGerandoNumero] = useState(false);
  const [mostrarNumero, setMostrarNumero] = useState(false);
  const [mostrarOutrosFamilia, setMostrarOutrosFamilia] = useState(false);
  const [outrosFamiliaTexto, setOutrosFamiliaTexto] = useState('');
  const [revisao, setRevisao] = useState(0);
  const [showHistorico, setShowHistorico] = useState(false);
  const [historicoRevisoes, setHistoricoRevisoes] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [novoFollowup, setNovoFollowup] = useState('');
  const [adicionandoFollowup, setAdicionandoFollowup] = useState(false);
  const [anexoCotacao, setAnexoCotacao] = useState(null);
  const [uploadingCotacao, setUploadingCotacao] = useState(false);
  const [showModalElegibilidade, setShowModalElegibilidade] = useState(false);
  const [showPreviewEditavel, setShowPreviewEditavel] = useState(false);
  const [propostaSalva, setPropostaSalva] = useState(null);
  const [showModalDesconto, setShowModalDesconto] = useState(false);
  const [valorDescontoPendente, setValorDescontoPendente] = useState(0);
  const [showXFullscreen, setShowXFullscreen] = useState(false);
  const [showModalAprovacaoNecessaria, setShowModalAprovacaoNecessaria] = useState(false);
  const [showXFullscreenAprovacao, setShowXFullscreenAprovacao] = useState(false);
  const [propostaParaSalvar, setPropostaParaSalvar] = useState(null);
  const [familiasFromApi, setFamiliasFromApi] = useState([]);
  const familiasProdutoPadrao = [
    'Moinhos',
    'Masseiras',
    'Agitadores',
    'Dispersores',
    'Silos',
    'Tanques de armazenamento',
    'Unidade derivadora de Dosagem',
    'Estação de Aditivos',
    'Equipamentos de Envase',
    'Equipamentos á Vácuo',
    'Outros'
  ];
  const familiasProduto = useMemo(() => {
    const fromApi = (familiasFromApi || []).map((f) => (typeof f === 'string' ? f : f.nome)).filter(Boolean);
    if (fromApi.length > 0) return fromApi.includes('Outros') ? fromApi : [...fromApi, 'Outros'];
    return familiasProdutoPadrao;
  }, [familiasFromApi]);
  const [formData, setFormData] = useState({
    cliente_id: '',
    projeto_id: '',
    numero_proposta: '',
    titulo: '',
    descricao: '',
    valor_total: 0,
    validade: '',
    condicoes_pagamento: '',
    observacoes: '',
    status: 'rascunho',
    responsavel_id: '',
    origem_busca: '',
    motivo_nao_venda: '',
    familia_produto: '',
    lembrete_data: '',
    lembrete_mensagem: '',
    margem_desconto: 0
  });

  useEffect(() => {
    api.get('/familias').then((res) => {
      const list = res.data || [];
      setFamiliasFromApi(Array.isArray(list) ? list : []);
    }).catch(() => setFamiliasFromApi([]));
  }, []);

  // Quando a lista de famílias (API) atualizar, reavaliar "Outros" para proposta já carregada
  useEffect(() => {
    const fp = formData.familia_produto;
    if (!fp) return;
    if (familiasProduto.includes(fp)) {
      setMostrarOutrosFamilia(false);
      setOutrosFamiliaTexto('');
    } else if (fp === 'Outros') {
      setMostrarOutrosFamilia(true);
      setOutrosFamiliaTexto('');
    } else {
      setMostrarOutrosFamilia(true);
      setOutrosFamiliaTexto(fp);
    }
  }, [familiasProduto.join(','), formData.familia_produto]);

  useEffect(() => {
    loadClientes();
    loadProjetos();
    loadUsuarios();
    loadProdutos();
    
    if (id) {
      loadProposta();
    } else {
      generateNumeroProposta();
    }
  }, [id]);

  // Atualizar equipamentos ofertados sempre que os itens mudarem
  useEffect(() => {
    const nomesProdutos = itens
      .filter(item => item.descricao && item.descricao.trim())
      .map(item => item.descricao.trim());
    
    if (nomesProdutos.length > 0) {
      const equipamentosOfertados = nomesProdutos.join('/');
      
      // Atualizar o campo "Equipamentos Ofertados" com os nomes dos produtos
      setFormData(prev => ({
        ...prev,
        titulo: equipamentosOfertados
      }));
    } else if (itens.length === 0) {
      // Se não houver itens, limpar o campo
      setFormData(prev => ({
        ...prev,
        titulo: ''
      }));
    }
  }, [itens]);
  
  const loadProposta = async () => {
    try {
      const response = await api.get(`/propostas/${id}`);
      const proposta = response.data;
      
      setFormData({
        cliente_id: proposta.cliente_id || '',
        projeto_id: proposta.projeto_id || '',
        numero_proposta: proposta.numero_proposta || '',
        titulo: proposta.titulo || '',
        descricao: proposta.descricao || '',
        valor_total: proposta.valor_total || 0,
        validade: proposta.validade ? proposta.validade.split('T')[0] : '',
        condicoes_pagamento: proposta.condicoes_pagamento || '',
        observacoes: proposta.observacoes || '',
        status: proposta.status || 'rascunho',
        responsavel_id: proposta.responsavel_id || '',
        margem_desconto: proposta.margem_desconto || 0,
        origem_busca: proposta.origem_busca || '',
        motivo_nao_venda: proposta.motivo_nao_venda || '',
        familia_produto: proposta.familia_produto || '',
        lembrete_data: proposta.lembrete_data ? proposta.lembrete_data.split('T')[0] : '',
        lembrete_mensagem: proposta.lembrete_mensagem || '',
        cliente_contato: proposta.cliente_contato || '',
        cliente_telefone: proposta.cliente_telefone || '',
        cliente_email: proposta.cliente_email || '',
        prazo_entrega: proposta.prazo_entrega || '',
        garantia: proposta.garantia || ''
      });
      
      setRevisao(proposta.revisao || 0);
      setAnexoCotacao(proposta.anexo_cotacao || null);
      
      // Carregar histórico de revisões
      loadHistoricoRevisoes();
      
      // Carregar follow-ups
      loadFollowups();
      
      // Verificar se a família é "Outros" ou não está na lista
      if (proposta.familia_produto && !familiasProduto.includes(proposta.familia_produto)) {
        setMostrarOutrosFamilia(true);
        setOutrosFamiliaTexto(proposta.familia_produto);
      } else if (proposta.familia_produto === 'Outros') {
        setMostrarOutrosFamilia(true);
        setOutrosFamiliaTexto('');
      } else {
        setMostrarOutrosFamilia(false);
        setOutrosFamiliaTexto('');
      }
      
      if (proposta.itens && proposta.itens.length > 0) {
        setItens(proposta.itens);
      }
    } catch (error) {
      console.error('Erro ao carregar proposta:', error);
      alert('Erro ao carregar proposta');
    }
  };

  const loadClientes = async () => {
    try {
      const response = await api.get('/clientes', { params: { status: 'ativo' } });
      setClientes(response.data);
    } catch (error) {
      console.error('Erro ao carregar clientes:', error);
    }
  };

  const loadProjetos = async () => {
    try {
      const response = await api.get('/projetos');
      setProjetos(response.data);
    } catch (error) {
      console.error('Erro ao carregar projetos:', error);
    }
  };

  const loadUsuarios = async () => {
    try {
      const response = await api.get('/usuarios/por-modulo/comercial');
      setUsuarios(response.data || []);
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
    }
  };

  const loadProdutos = async () => {
    try {
      const response = await api.get('/produtos', { params: { ativo: 'true' } });
      setProdutos(response.data);
    } catch (error) {
      console.error('Erro ao carregar produtos:', error);
    }
  };

  const loadHistoricoRevisoes = async () => {
    if (!id) return;
    try {
      const response = await api.get(`/propostas/${id}/revisoes`);
      setHistoricoRevisoes(response.data || []);
    } catch (error) {
      console.error('Erro ao carregar histórico de revisões:', error);
    }
  };

  const loadFollowups = async () => {
    if (!id) return;
    try {
      const response = await api.get(`/propostas/${id}/followups`);
      setFollowups(response.data || []);
    } catch (error) {
      console.error('Erro ao carregar follow-ups:', error);
    }
  };

  const handleAdicionarFollowup = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (!novoFollowup.trim() || !id) {
      alert('Por favor, digite um comentário antes de adicionar.');
      return;
    }
    
    console.log('📝 Tentando adicionar follow-up:', { id, comentario: novoFollowup.trim() });
    setAdicionandoFollowup(true);
    try {
      const url = `/propostas/${id}/followups`;
      console.log('🌐 URL da requisição:', url);
      console.log('📤 Dados enviados:', { comentario: novoFollowup.trim() });
      
      const response = await api.post(url, {
        comentario: novoFollowup.trim()
      });
      
      console.log('✅ Resposta recebida:', response.data);
      
      if (response.data) {
        setFollowups(prev => {
          const novos = [response.data, ...prev];
          console.log('📋 Follow-ups atualizados:', novos);
          return novos;
        });
        setNovoFollowup('');
        console.log('✅ Follow-up adicionado com sucesso!');
      } else {
        console.error('❌ Resposta sem dados:', response);
        throw new Error('Resposta inválida do servidor');
      }
    } catch (error) {
      console.error('❌ Erro completo ao adicionar follow-up:', error);
      console.error('❌ Detalhes do erro:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        statusText: error.response?.statusText
      });
      
      const errorMessage = error.response?.data?.error || error.message || 'Erro ao adicionar follow-up. Tente novamente.';
      alert(`Erro ao adicionar follow-up:\n\n${errorMessage}\n\nVerifique o console para mais detalhes.`);
    } finally {
      setAdicionandoFollowup(false);
    }
  };

  const generateNumeroProposta = () => {
    // Não gerar mais no frontend, deixar o backend gerar automaticamente
    // O número será gerado automaticamente pelo backend quando o cliente for selecionado
    setFormData(prev => ({
      ...prev,
      numero_proposta: '' // Deixar vazio para o backend gerar
    }));
  };

  const handleChange = async (e) => {
    const { name, value } = e.target;
    
    // Se mudou a família de produto
    if (name === 'familia_produto') {
      if (value === 'Outros') {
        setMostrarOutrosFamilia(true);
        setFormData(prev => ({ ...prev, [name]: value }));
      } else {
        setMostrarOutrosFamilia(false);
        setOutrosFamiliaTexto('');
        setFormData(prev => ({ ...prev, [name]: value }));
      }
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
    
    // Se o cliente foi selecionado e não estamos editando, gerar número automaticamente
    if (name === 'cliente_id' && value && !id) {
      setGerandoNumero(true);
      setMostrarNumero(false);
      setFormData(prev => ({ ...prev, numero_proposta: 'Gerando...' }));
      try {
        const responsavelId = formData.responsavel_id || '';
        const revisao = 0; // Primeira versão sempre REV00
        const response = await api.get(`/propostas/gerar-numero/${value}`, {
          params: {
            responsavel_id: responsavelId,
            revisao: revisao
          }
        });
        if (response.data?.numero_proposta) {
          // Pequeno delay para o efeito de fade-in
          setTimeout(() => {
            setFormData(prev => ({ ...prev, numero_proposta: response.data.numero_proposta }));
            setGerandoNumero(false);
            setMostrarNumero(true);
          }, 300);
        }
      } catch (error) {
        console.error('Erro ao gerar número da proposta:', error);
        setFormData(prev => ({ ...prev, numero_proposta: '' }));
        setGerandoNumero(false);
        setMostrarNumero(false);
      }
    } else if (name === 'cliente_id' && !value && !id) {
      // Se o cliente foi desmarcado, limpar o número
      setFormData(prev => ({ ...prev, numero_proposta: '' }));
      setMostrarNumero(false);
    }
    
    // Se o responsável foi alterado e já tem cliente, regenerar número
    if (name === 'responsavel_id' && value && formData.cliente_id && !id) {
      setGerandoNumero(true);
      setMostrarNumero(false);
      setFormData(prev => ({ ...prev, numero_proposta: 'Gerando...' }));
      try {
        const revisao = 0; // Primeira versão sempre REV00
        const response = await api.get(`/propostas/gerar-numero/${formData.cliente_id}`, {
          params: {
            responsavel_id: value,
            revisao: revisao
          }
        });
        if (response.data?.numero_proposta) {
          setTimeout(() => {
            setFormData(prev => ({ ...prev, numero_proposta: response.data.numero_proposta }));
            setGerandoNumero(false);
            setMostrarNumero(true);
          }, 300);
        }
      } catch (error) {
        console.error('Erro ao gerar número da proposta:', error);
        setGerandoNumero(false);
        setMostrarNumero(false);
      }
    }
  };
  
  const handleOutrosFamiliaChange = (e) => {
    const value = e.target.value;
    setOutrosFamiliaTexto(value);
    setFormData(prev => ({ ...prev, familia_produto: value }));
  };

  const addItem = (produto = null) => {
    if (produto) {
      // Adicionar produto selecionado
      const novosItens = [...itens, {
        produto_id: produto.id,
        codigo_produto: produto.codigo,
        descricao: produto.nome,
        quantidade: 1,
        unidade: produto.unidade || 'UN',
        valor_unitario: produto.preco_base || 0,
        valor_total: produto.preco_base || 0,
        observacoes: produto.descricao || '',
        familia_produto: produto.familia || produto.familia_produto || '',
        regiao_busca: ''
      }];
      setItens(novosItens);
      setShowProdutosModal(false);
      calculateTotal(novosItens);
      // Atualizar equipamentos ofertados após atualizar itens
      setTimeout(() => {
        const nomesProdutos = novosItens
          .filter(item => item.descricao && item.descricao.trim())
          .map(item => item.descricao.trim());
        const equipamentosOfertados = nomesProdutos.join('/');
        setFormData(prev => ({
          ...prev,
          titulo: equipamentosOfertados
        }));
      }, 0);
    } else {
      // Adicionar item vazio
      setItens([...itens, {
        descricao: '',
        quantidade: 1,
        unidade: 'UN',
        valor_unitario: 0,
        valor_total: 0,
        observacoes: '',
        familia_produto: '',
        regiao_busca: ''
      }]);
    }
  };

  const removeItem = (index) => {
    const novosItens = itens.filter((_, i) => i !== index);
    setItens(novosItens);
    calculateTotal(novosItens);
    // Atualizar equipamentos ofertados
    setTimeout(() => {
      const nomesProdutos = novosItens
        .filter(item => item.descricao && item.descricao.trim())
        .map(item => item.descricao.trim());
      const equipamentosOfertados = nomesProdutos.join('/');
      setFormData(prev => ({
        ...prev,
        titulo: equipamentosOfertados
      }));
    }, 0);
  };

  const updateItem = (index, field, value) => {
    const newItens = [...itens];
    newItens[index] = { ...newItens[index], [field]: value };

    if (field === 'quantidade' || field === 'valor_unitario') {
      const quantidade = parseFloat(newItens[index].quantidade) || 0;
      const valorUnitario = parseFloat(newItens[index].valor_unitario) || 0;
      newItens[index].valor_total = quantidade * valorUnitario;
    }

    setItens(newItens);
    // Calcular total com os novos itens
    calculateTotal(newItens);
    
    // Se a descrição foi alterada, atualizar equipamentos ofertados
    if (field === 'descricao') {
      setTimeout(() => {
        const nomesProdutos = newItens
          .filter(item => item.descricao && item.descricao.trim())
          .map(item => item.descricao.trim());
        const equipamentosOfertados = nomesProdutos.join('/');
        setFormData(prev => ({
          ...prev,
          titulo: equipamentosOfertados
        }));
      }, 0);
    }
  };

  const calculateTotal = (itensParaCalcular = itens) => {
    const total = itensParaCalcular.reduce((sum, item) => {
      return sum + (parseFloat(item.valor_total) || 0);
    }, 0);
    setFormData(prev => ({ ...prev, valor_total: total }));
  };

  // Atualizar campo "Equipamentos Ofertados" com os nomes dos produtos
  const atualizarEquipamentosOfertados = () => {
    const nomesProdutos = itens
      .filter(item => item.descricao && item.descricao.trim())
      .map(item => item.descricao.trim());
    
    const equipamentosOfertados = nomesProdutos.join('/');
    
    setFormData(prev => ({
      ...prev,
      titulo: equipamentosOfertados
    }));
  };

  // Verificar se todos os itens são elegíveis para proposta automática
  const verificarElegibilidade = async () => {
    if (itens.length === 0) return false;
    
    // Buscar informações completas dos produtos para verificar família
    const itensComProdutos = itens.filter(item => item.codigo_produto);
    
    if (itensComProdutos.length === 0) return false;
    
    // Se nem todos os itens têm código de produto, não é elegível
    if (itensComProdutos.length !== itens.length) return false;
    
    // Verificar se todos os itens têm família "Hélices e Acessórios"
    const todosElegiveis = itensComProdutos.every(item => {
      // Se o item já tem familia_produto, verificar diretamente
      if (item.familia_produto) {
        return item.familia_produto === 'Hélices e Acessórios';
      }
      // Se não, precisamos buscar do produto
      const produto = produtos.find(p => p.codigo === item.codigo_produto);
      if (!produto) return false;
      return produto.familia === 'Hélices e Acessórios' || produto.familia_produto === 'Hélices e Acessórios';
    });
    
    return todosElegiveis;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Verificar elegibilidade apenas para novas propostas (não editadas) E se não tiver desconto > 5% sem aprovação
    if (!id) {
      // Se tem desconto > 5%, não verificar elegibilidade (vai salvar como rascunho)
      if (formData.margem_desconto > 5) {
        // Verificar se tem aprovação
        const propostaId = formData.id;
        if (propostaId) {
          try {
            const aprovacoesResponse = await api.get('/aprovacoes', {
              params: { proposta_id: propostaId, status: 'aprovado' }
            });
            
            const aprovacoesAprovadas = aprovacoesResponse.data || [];
            const temAprovacao = aprovacoesAprovadas.some(ap => 
              ap.proposta_id === propostaId && 
              ap.status === 'aprovado' && 
              ap.valor_desconto === formData.margem_desconto
            );
            
            // Se não tem aprovação, não verificar elegibilidade (vai mostrar modal de rascunho)
            if (!temAprovacao) {
              await salvarProposta();
              return;
            }
          } catch (error) {
            // Em caso de erro, não verificar elegibilidade
            await salvarProposta();
            return;
          }
        } else {
          // Nova proposta com desconto > 5%, não verificar elegibilidade
          await salvarProposta();
          return;
        }
      }
      
      // Removido: verificação de elegibilidade e modal automático
      // O usuário pode gerar a proposta automática manualmente clicando no botão
    }
    
    // Salvar normalmente (sem perguntar sobre gerar proposta automática)
    await salvarProposta();
  };

  const salvarProposta = async (forcarRascunho = false) => {
    setLoading(true);

    try {
      // Remover numero_proposta se estiver vazio para o backend gerar automaticamente
      const dataToSend = { ...formData, itens };
      if (!dataToSend.numero_proposta || (typeof dataToSend.numero_proposta === 'string' && dataToSend.numero_proposta.trim() === '')) {
        delete dataToSend.numero_proposta;
      }

      // VALIDAÇÃO SIMPLIFICADA: Se desconto > 5%, sempre salvar como rascunho
      if (formData.margem_desconto > 5) {
        const propostaId = id || formData.id;
        
        // Se não é rascunho e não tem aprovação, mostrar modal
        if (dataToSend.status !== 'rascunho' && propostaId) {
          try {
            const aprovacoesResponse = await api.get('/aprovacoes', {
              params: { proposta_id: propostaId, status: 'aprovado' }
            });
            
            const aprovacoesAprovadas = aprovacoesResponse.data || [];
            // Comparação com tolerância para valores decimais (evita problemas de precisão)
            const margemDescontoArredondada = Math.round(formData.margem_desconto * 100) / 100;
            const temAprovacao = aprovacoesAprovadas.some(ap => {
              const valorDescontoArredondado = Math.round((ap.valor_desconto || 0) * 100) / 100;
              return ap.proposta_id === propostaId && 
                     ap.status === 'aprovado' && 
                     Math.abs(valorDescontoArredondado - margemDescontoArredondada) < 0.01; // Tolerância de 0.01%
            });
            
            console.log('🔍 Verificando aprovação:', {
              propostaId,
              margemDesconto: formData.margem_desconto,
              margemDescontoArredondada,
              aprovacoesAprovadas,
              temAprovacao
            });
            
            if (!temAprovacao) {
              // Mostrar X fullscreen primeiro, depois modal
              console.log('🚨 Mostrando X fullscreen para aprovação');
              setPropostaParaSalvar(dataToSend);
              setShowXFullscreenAprovacao(true);
              setTimeout(() => {
                console.log('🚨 Escondendo X fullscreen, mostrando modal');
                setShowXFullscreenAprovacao(false);
                setTimeout(() => {
                  setShowModalAprovacaoNecessaria(true);
                }, 300);
              }, 6000); // 6 segundos (dobro do tempo anterior)
              setLoading(false);
              return;
            } else {
              console.log('✅ Aprovação encontrada, permitindo salvar com status:', dataToSend.status);
            }
          } catch (error) {
            console.error('Erro ao verificar aprovações:', error);
            // Em caso de erro, mostrar X fullscreen primeiro, depois modal
            setPropostaParaSalvar(dataToSend);
            setShowXFullscreenAprovacao(true);
            setTimeout(() => {
              setShowXFullscreenAprovacao(false);
              setTimeout(() => {
                setShowModalAprovacaoNecessaria(true);
              }, 300);
            }, 6000);
            setLoading(false);
            return;
          }
        } else if (dataToSend.status !== 'rascunho') {
          // Nova proposta ou sem ID, mostrar X fullscreen primeiro, depois modal
          setPropostaParaSalvar(dataToSend);
          setShowXFullscreenAprovacao(true);
          setTimeout(() => {
            setShowXFullscreenAprovacao(false);
            setTimeout(() => {
              setShowModalAprovacaoNecessaria(true);
            }, 300);
          }, 6000);
          setLoading(false);
          return;
        } else {
          // Já é rascunho, continuar normalmente
          dataToSend.status = 'rascunho';
        }
      }

      // Se forçar rascunho, garantir que status seja rascunho
      if (forcarRascunho) {
        dataToSend.status = 'rascunho';
      }
      
      let response;
      if (id) {
        response = await api.put(`/propostas/${id}`, dataToSend);
      } else {
        response = await api.post('/propostas', dataToSend);
      }
      
      if (id) {
        // Se está editando, atualizar número da proposta e revisão
        if (response.data?.numero_proposta) {
          setFormData(prev => ({ ...prev, numero_proposta: response.data.numero_proposta }));
        }
        if (response.data?.revisao !== undefined) {
          setRevisao(response.data.revisao);
        }
        
        // Recarregar proposta completa e histórico
        await loadProposta();
        await loadHistoricoRevisoes();
        
        const novaRevisao = response.data?.revisao || revisao + 1;
        alert(`Proposta atualizada com sucesso! Nova revisão: REV${String(novaRevisao).padStart(2, '0')}`);
      } else {
        // Atualizar o número da proposta se foi gerado
        if (response.data?.numero_proposta) {
          setFormData(prev => ({ ...prev, numero_proposta: response.data.numero_proposta }));
        }
        
        // Removido: preview automático após salvar
        // O usuário pode gerar a proposta manualmente clicando no botão de gerar
        // Se tem desconto > 5% e é rascunho, mostrar mensagem
        if (formData.margem_desconto > 5 && dataToSend.status === 'rascunho') {
          toast.info('Proposta salva como rascunho. Solicite a aprovação de desconto na aba "Aprovações" antes de finalizar.');
        }
        navigate('/comercial/propostas');
      }
    } catch (error) {
      console.error('Erro ao salvar proposta:', error);
      console.error('Detalhes do erro:', error.response?.data);
      const errorMessage = error.response?.data?.error || error.message || 'Erro ao salvar proposta';
      alert(`Erro ao salvar proposta: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGerarPropostaAutomatica = async () => {
    setShowModalElegibilidade(false);
    // Aguardar um pouco para garantir que o estado foi atualizado
    await new Promise(resolve => setTimeout(resolve, 100));
    await salvarProposta();
  };

  const handleAnexarCotacao = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Verificar tamanho (40MB)
    if (file.size > 40 * 1024 * 1024) {
      alert('O arquivo excede o limite de 40MB');
      e.target.value = '';
      return;
    }
    
    if (!id) {
      alert('Salve a proposta primeiro antes de anexar uma cotação');
      e.target.value = '';
      return;
    }
    
    setUploadingCotacao(true);
    
    try {
      const formData = new FormData();
      formData.append('arquivo', file);
      
      const response = await api.post(`/propostas/${id}/anexar-cotacao`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      setAnexoCotacao(response.data.filename);
      alert('Cotação anexada com sucesso!');
      
      // Recarregar proposta para atualizar dados
      await loadProposta();
    } catch (error) {
      if (error.response?.status === 413) {
        alert('Arquivo muito grande. O limite é de 40MB.');
      } else {
        alert(error.response?.data?.error || 'Erro ao anexar cotação');
      }
    } finally {
      setUploadingCotacao(false);
      e.target.value = '';
    }
  };

  const handleDownloadCotacao = async () => {
    if (!id || !anexoCotacao) return;
    
    try {
      const token = localStorage.getItem('token');
      const apiUrl = api.defaults.baseURL.replace('/api', '');
      const downloadUrl = `${apiUrl}/api/propostas/${id}/cotacao`;
      
      // Fazer requisição com token no header
      const response = await fetch(downloadUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          alert('Sessão expirada. Por favor, faça login novamente.');
          window.location.href = '/login';
          return;
        }
        const errorData = await response.json().catch(() => ({ error: 'Erro ao baixar arquivo' }));
        throw new Error(errorData.error || 'Erro ao baixar arquivo');
      }
      
      // Obter o blob do arquivo
      const blob = await response.blob();
      
      // Criar URL temporária do blob
      const blobUrl = window.URL.createObjectURL(blob);
      
      // Criar link temporário para download
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = anexoCotacao; // Nome do arquivo
      document.body.appendChild(link);
      link.click();
      
      // Limpar
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Erro ao baixar cotação:', error);
      alert(error.message || 'Erro ao baixar cotação');
    }
  };

  const handleRemoverCotacao = async () => {
    if (!id || !anexoCotacao) return;
    
    if (!window.confirm('Tem certeza que deseja remover a cotação anexada?')) {
      return;
    }
    
    try {
      await api.delete(`/propostas/${id}/cotacao`);
      setAnexoCotacao(null);
      alert('Cotação removida com sucesso!');
    } catch (error) {
      alert(error.response?.data?.error || 'Erro ao remover cotação');
    }
  };

  return (
    <div className="proposta-form">
      <div className="form-header">
        <h1>{id ? 'Editar Proposta' : 'Nova Proposta'}</h1>
        <button onClick={() => navigate('/comercial/propostas')} className="btn-secondary">
          Cancelar
        </button>
      </div>

      <form onSubmit={handleSubmit} className="form">
        <div className="form-section">
          <h2>Informações Básicas</h2>
          <div className="form-grid">
            <div className="form-group" style={{ display: 'flex', gap: '15px', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label>Número da Proposta *</label>
                <input
                  type="text"
                  name="numero_proposta"
                  value={formData.numero_proposta}
                  placeholder={id ? "Número da proposta" : "Selecione um cliente para gerar o número"}
                  readOnly
                  onChange={handleChange}
                  className={mostrarNumero ? 'numero-gerado-fade-in' : ''}
                  style={{
                    color: gerandoNumero ? '#999' : '#333',
                    fontStyle: gerandoNumero ? 'italic' : 'normal',
                    opacity: mostrarNumero ? 1 : (gerandoNumero ? 0.6 : 1)
                  }}
                />
              </div>
              <div style={{ minWidth: id ? '200px' : '150px' }}>
                <label>Revisão</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div style={{
                    flex: 1,
                    padding: '10px 15px',
                    background: revisao > 0 ? '#e7f5ff' : '#f8f9fa',
                    border: revisao > 0 ? '2px solid #0066cc' : '1px solid #dee2e6',
                    borderRadius: '5px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontWeight: 600,
                    color: revisao > 0 ? '#0066cc' : '#666',
                    fontSize: '14px'
                  }}>
                    <FiClock style={{ fontSize: '16px' }} />
                    <span>REV{String(revisao).padStart(2, '0')}</span>
                  </div>
                  {id && (
                    <button
                      type="button"
                      onClick={() => setShowHistorico(true)}
                      style={{
                        padding: '10px 12px',
                        background: '#0066cc',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '14px',
                        fontWeight: 500,
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => e.target.style.background = '#0052a3'}
                      onMouseLeave={(e) => e.target.style.background = '#0066cc'}
                      title="Ver histórico de revisões"
                    >
                      <FiList />
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="form-group">
              <label>Equipamentos Ofertados *</label>
              <input
                type="text"
                name="titulo"
                value={formData.titulo}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label>Cliente *</label>
              <select
                name="cliente_id"
                value={formData.cliente_id}
                onChange={handleChange}
                required
              >
                <option value="">Selecione um cliente...</option>
                {clientes.map(cliente => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.razao_social}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Projeto (Opcional)</label>
              <select
                name="projeto_id"
                value={formData.projeto_id}
                onChange={handleChange}
              >
                <option value="">Nenhum</option>
                {projetos
                  .filter(p => p.cliente_id === formData.cliente_id)
                  .map(projeto => (
                    <option key={projeto.id} value={projeto.id}>
                      {projeto.nome_projeto}
                    </option>
                  ))}
              </select>
            </div>
            <div className="form-group">
              <label>Validade</label>
              <input
                type="date"
                name="validade"
                value={formData.validade}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
              >
                <option value="rascunho">Rascunho</option>
                <option value="enviada">Enviada</option>
                <option value="aprovada">Aprovada</option>
                <option value="rejeitada">Rejeitada</option>
              </select>
            </div>
            <div className="form-group">
              <label>Responsável</label>
              <select
                name="responsavel_id"
                value={formData.responsavel_id || ''}
                onChange={handleChange}
              >
                <option value="">Selecione um responsável...</option>
                {usuarios.map(usuario => (
                  <option key={usuario.id} value={usuario.id}>
                    {usuario.nome} {usuario.cargo ? `- ${usuario.cargo}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Origem da Busca (Marketing)</label>
              <select
                name="origem_busca"
                value={formData.origem_busca || ''}
                onChange={handleChange}
              >
                <option value="">Selecione...</option>
                <option value="Google">Google</option>
                <option value="LinkedIn">LinkedIn</option>
                <option value="Facebook">Facebook</option>
                <option value="Instagram">Instagram</option>
                <option value="Indicação">Indicação</option>
                <option value="Feira/Evento">Feira/Evento</option>
                <option value="Site Próprio">Site Próprio</option>
                <option value="Outros">Outros</option>
              </select>
            </div>
            <div className="form-group">
              <label>Família de Produto</label>
              <select
                name="familia_produto"
                value={familiasProduto.includes(formData.familia_produto) ? formData.familia_produto : (formData.familia_produto ? 'Outros' : '')}
                onChange={handleChange}
              >
                <option value="">Selecione...</option>
                {familiasProduto.map(familia => (
                  <option key={familia} value={familia}>{familia}</option>
                ))}
              </select>
              {mostrarOutrosFamilia && (
                <input
                  type="text"
                  name="outros_familia"
                  value={outrosFamiliaTexto}
                  onChange={handleOutrosFamiliaChange}
                  placeholder="Especifique qual outro tipo..."
                  style={{ marginTop: '10px' }}
                />
              )}
            </div>
            {formData.status === 'rejeitada' && (
              <div className="form-group full-width">
                <label>Motivo da Não Venda</label>
                <select
                  name="motivo_nao_venda"
                  value={formData.motivo_nao_venda || ''}
                  onChange={handleChange}
                >
                  <option value="">Selecione o motivo...</option>
                  <option value="Preço Alto">Preço Alto</option>
                  <option value="Prazo Inadequado">Prazo Inadequado</option>
                  <option value="Não Atende Necessidade">Não Atende Necessidade</option>
                  <option value="Concorrência">Concorrência</option>
                  <option value="Orçamento Cancelado">Orçamento Cancelado</option>
                  <option value="Outros">Outros</option>
                </select>
              </div>
            )}
            <div className="form-group">
              <label>Data do Lembrete</label>
              <input
                type="date"
                name="lembrete_data"
                value={formData.lembrete_data || ''}
                onChange={handleChange}
              />
            </div>
            <div className="form-group full-width">
              <label>Mensagem do Lembrete</label>
              <textarea
                name="lembrete_mensagem"
                value={formData.lembrete_mensagem || ''}
                onChange={handleChange}
                rows="2"
                placeholder="Digite uma mensagem de lembrete para esta cotação..."
              />
            </div>
          </div>
          <div className="form-group full-width">
            <label>Descrição</label>
            <textarea
              name="descricao"
              value={formData.descricao}
              onChange={handleChange}
              rows="3"
            />
          </div>
        </div>

        <div className="form-section form-section-carrinho">
          <div className="section-header section-header-carrinho">
            <div>
              <h2><FiShoppingCart className="section-icon-carrinho" /> Carrinho de compras</h2>
              <p className="section-desc-carrinho">
                Adicione os produtos ao carrinho a partir do catálogo. Ao salvar ou gerar o PDF, a proposta será montada com o template e as variáveis técnicas definidos em <strong>Configurações → Template de Proposta</strong>.
              </p>
            </div>
            <div className="carrinho-actions">
              <button type="button" onClick={() => setShowProdutosModal(true)} className="btn-add-item btn-primary btn-add-carrinho">
                <FiShoppingCart /> Adicionar produtos ao carrinho
              </button>
              <button type="button" onClick={() => addItem()} className="btn-add-item btn-secondary">
                <FiPlus /> Adicionar item manual (sem catálogo)
              </button>
            </div>
          </div>
          {itens.length === 0 ? (
            <div className="carrinho-empty">
              <FiShoppingCart className="carrinho-empty-icon" aria-hidden />
              <h3>Seu carrinho está vazio</h3>
              <p>Clique em <strong>&quot;Adicionar produtos ao carrinho&quot;</strong> para escolher produtos do catálogo. Você também pode adicionar um item manual (linha livre).</p>
              <p className="carrinho-empty-hint">A proposta gerada utilizará automaticamente o layout e as variáveis técnicas configuradas no sistema.</p>
              <button type="button" onClick={() => setShowProdutosModal(true)} className="btn-add-item btn-primary btn-empty-cta">
                <FiShoppingCart /> Adicionar produtos ao carrinho
              </button>
            </div>
          ) : (
            <>
            <p className="carrinho-config-hint">
              <FiSettings size={14} /> A proposta (preview e PDF) usará o template e as variáveis técnicas definidos nas configurações do sistema.
            </p>
            <div className="itens-table itens-table-carrinho">
              <table>
                <thead>
                  <tr>
                    <th>Descrição</th>
                    <th>Quantidade</th>
                    <th>Unidade</th>
                    <th>Valor Unitário</th>
                    <th>Valor Total</th>
                    <th>Família Produto</th>
                    <th>Região Busca</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((item, index) => (
                    <tr key={index}>
                      <td>
                        <input
                          type="text"
                          value={item.descricao}
                          onChange={(e) => updateItem(index, 'descricao', e.target.value)}
                          placeholder="Descrição do item"
                        />
                        {item.codigo_produto && (
                          <small style={{ display: 'block', color: 'var(--gmp-text-light)', fontSize: '0.8rem' }}>
                            Código: {item.codigo_produto}
                          </small>
                        )}
                      </td>
                      <td>
                        <input
                          type="number"
                          value={item.quantidade}
                          onChange={(e) => updateItem(index, 'quantidade', e.target.value)}
                          min="0"
                          step="0.01"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={item.unidade}
                          onChange={(e) => updateItem(index, 'unidade', e.target.value)}
                          placeholder="UN"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={item.valor_unitario}
                          onChange={(e) => updateItem(index, 'valor_unitario', e.target.value)}
                          min="0"
                          step="0.01"
                        />
                      </td>
                      <td>
                        {new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: 'BRL'
                        }).format(item.valor_total)}
                      </td>
                      <td>
                        <select
                          value={familiasProduto.includes(item.familia_produto) ? item.familia_produto : (item.familia_produto ? 'Outros' : '')}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value === 'Outros') {
                              // Se selecionou "Outros", manter o valor atual se já for customizado, senão limpar
                              if (!item.familia_produto || familiasProduto.includes(item.familia_produto)) {
                                updateItem(index, 'familia_produto', '');
                              }
                            } else {
                              updateItem(index, 'familia_produto', value);
                            }
                          }}
                          style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '5px' }}
                        >
                          <option value="">Selecione...</option>
                          {familiasProduto.map(familia => (
                            <option key={familia} value={familia}>{familia}</option>
                          ))}
                        </select>
                        {(item.familia_produto && !familiasProduto.includes(item.familia_produto)) && (
                          <input
                            type="text"
                            value={item.familia_produto}
                            onChange={(e) => updateItem(index, 'familia_produto', e.target.value)}
                            placeholder="Especifique qual outro tipo..."
                            style={{ marginTop: '5px', width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '5px' }}
                          />
                        )}
                      </td>
                      <td>
                        <input
                          type="text"
                          value={item.regiao_busca || ''}
                          onChange={(e) => updateItem(index, 'regiao_busca', e.target.value)}
                          placeholder="Região"
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          className="btn-remove"
                          title="Remover item"
                        >
                          <FiTrash2 />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="total-section" style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
                  <strong style={{ fontSize: '18px' }}>Valor Total: {new Intl.NumberFormat('pt-BR', {
                    style: 'currency',
                    currency: 'BRL'
                  }).format(formData.valor_total)}</strong>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '8px', 
                    backgroundColor: formData.margem_desconto > 0 ? '#ffebee' : 'transparent',
                    border: formData.margem_desconto > 0 ? '2px solid #f44336' : '2px solid #ddd',
                    position: 'relative' }}>
                    <label htmlFor="margem_desconto" style={{ 
                      fontWeight: '600', 
                      color: formData.margem_desconto > 0 ? '#d32f2f' : '#333',
                      margin: 0 
                    }}>
                      Margem de Desconto Aplicada:
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', position: 'relative' }}>
                      <input
                        id="margem_desconto"
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={formData.margem_desconto || 0}
                        onChange={(e) => {
                          const valor = parseFloat(e.target.value) || 0;
                          
                          // Permitir valores de 0% até qualquer valor, mas alertar se passar de 5%
                          if (valor > 5) {
                            // Primeiro atualiza o estado para mostrar o X vermelho destacado
                            setFormData(prev => ({ ...prev, margem_desconto: valor }));
                            setValorDescontoPendente(valor);
                            // Mostra o X fullscreen primeiro
                            setShowXFullscreen(true);
                            // Depois de 3 segundos, esconde o X e mostra o alerta premium
                            setTimeout(() => {
                              setShowXFullscreen(false);
                              setTimeout(() => {
                                setShowModalDesconto(true);
                              }, 300); // Pequeno delay entre esconder X e mostrar modal
                            }, 3000); // X fica visível por 3 segundos (dobro do tempo)
                            return;
                          }
                          
                          setFormData(prev => ({ ...prev, margem_desconto: valor }));
                        }}
                        style={{
                          width: '100px',
                          padding: '8px',
                          border: formData.margem_desconto > 5 ? '3px solid #d32f2f' : (formData.margem_desconto > 0 ? '2px solid #f44336' : '1px solid #ddd'),
                          borderRadius: '5px',
                          fontSize: '16px',
                          fontWeight: '600',
                          color: formData.margem_desconto > 5 ? '#d32f2f' : (formData.margem_desconto > 0 ? '#d32f2f' : '#333'),
                          backgroundColor: formData.margem_desconto > 5 ? '#fff5f5' : '#fff',
                          textAlign: 'center',
                          boxShadow: formData.margem_desconto > 5 ? '0 0 10px rgba(211, 47, 47, 0.5)' : 'none',
                          transition: 'all 0.3s ease'
                        }}
                      />
                    </div>
                    <span style={{ 
                      fontWeight: '600', 
                      color: formData.margem_desconto > 0 ? '#d32f2f' : '#666',
                      fontSize: '16px'
                    }}>%</span>
                  </div>
                </div>
                
                {formData.margem_desconto > 0 && (
                  <div style={{ 
                    padding: '15px', 
                    backgroundColor: '#ffebee', 
                    borderRadius: '8px',
                    border: formData.margem_desconto > 5 ? '2px solid #d32f2f' : '1px solid #f44336',
                    color: '#d32f2f',
                    fontWeight: '500'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span><strong>Valor do Desconto:</strong></span>
                      <span style={{ fontSize: '18px', fontWeight: '700' }}>
                        {new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: 'BRL'
                        }).format(formData.valor_total * (formData.margem_desconto / 100))}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid rgba(211, 47, 47, 0.2)' }}>
                      <span><strong>Valor com Desconto:</strong></span>
                      <span style={{ fontSize: '18px', fontWeight: '700' }}>
                        {new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: 'BRL'
                        }).format(formData.valor_total * (1 - formData.margem_desconto / 100))}
                      </span>
                    </div>
                    {formData.margem_desconto > 5 && (
                      <div style={{ 
                        display: 'block', 
                        marginTop: '10px', 
                        padding: '8px', 
                        backgroundColor: '#d32f2f', 
                        color: 'white',
                        borderRadius: '5px',
                        fontWeight: '700', 
                        fontSize: '14px',
                        textAlign: 'center'
                      }}>
                        ⚠️ DESCONTO ACIMA DO LIMITE MÁXIMO (5%)
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            </>
          )}
        </div>

        <div className="form-section">
          <h2>Informações Adicionais</h2>
          <div className="form-group full-width">
            <label>Condições de Pagamento</label>
            <textarea
              name="condicoes_pagamento"
              value={formData.condicoes_pagamento}
              onChange={handleChange}
              rows="3"
            />
          </div>
          <div className="form-group full-width">
            <label>Observações</label>
            <textarea
              name="observacoes"
              value={formData.observacoes}
              onChange={handleChange}
              rows="3"
            />
          </div>
        </div>

        {/* Seção de Follow-up */}
        {id && (
          <div className="form-section followup-section">
            <div className="section-header">
              <h2>
                <FiMessageSquare style={{ marginRight: '10px', verticalAlign: 'middle' }} />
                Follow-up e Histórico
              </h2>
            </div>
            
            {/* Formulário para adicionar follow-up */}
            <div className="followup-form">
              <div className="followup-input-group">
                <textarea
                  value={novoFollowup}
                  onChange={(e) => setNovoFollowup(e.target.value)}
                  placeholder="Adicione um comentário sobre esta proposta..."
                  rows="3"
                  className="followup-textarea"
                  disabled={adicionandoFollowup}
                  onKeyDown={(e) => {
                    // Permitir Ctrl+Enter para enviar
                    if (e.ctrlKey && e.key === 'Enter') {
                      e.preventDefault();
                      handleAdicionarFollowup(e);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleAdicionarFollowup}
                  disabled={!novoFollowup.trim() || adicionandoFollowup}
                  className="btn-add-followup"
                >
                  <FiSend style={{ marginRight: '6px' }} />
                  {adicionandoFollowup ? 'Adicionando...' : 'Adicionar Follow-up'}
                </button>
              </div>
            </div>

            {/* Lista de follow-ups */}
            <div className="followups-list">
              {followups.length === 0 ? (
                <div className="no-followups">
                  <FiMessageSquare style={{ fontSize: '32px', opacity: 0.3, marginBottom: '10px' }} />
                  <p>Nenhum follow-up registrado ainda.</p>
                  <p style={{ fontSize: '13px', color: '#999', marginTop: '5px' }}>
                    Adicione comentários para acompanhar o histórico desta proposta.
                  </p>
                </div>
              ) : (
                followups.map((followup) => (
                  <div key={followup.id} className="followup-item">
                    <div className="followup-header">
                      <div className="followup-user">
                        <div className="followup-avatar">
                          {followup.criado_por_nome ? followup.criado_por_nome.charAt(0).toUpperCase() : 'U'}
                        </div>
                        <div className="followup-user-info">
                          <strong>{followup.criado_por_nome || 'Usuário desconhecido'}</strong>
                          {followup.criado_por_cargo && (
                            <span className="followup-cargo">{followup.criado_por_cargo}</span>
                          )}
                        </div>
                      </div>
                      <span className="followup-date">
                        {followup.created_at ? (() => {
                          // A data já vem convertida do backend no timezone do Brasil
                          // Apenas formatar para exibição
                          const date = new Date(followup.created_at);
                          return date.toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          });
                        })() : 'Data não disponível'}
                      </span>
                    </div>
                    <div className="followup-content">
                      {followup.comentario}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div className="form-actions">
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Salvando...' : 'Salvar Proposta'}
            </button>
            
            {id && (
              <>
                <label className="btn-secondary" style={{ cursor: 'pointer', margin: 0 }}>
                  <input
                    type="file"
                    onChange={handleAnexarCotacao}
                    disabled={uploadingCotacao || !id}
                    style={{ display: 'none' }}
                    accept="*/*"
                  />
                  <FiPaperclip style={{ marginRight: '5px', verticalAlign: 'middle' }} />
                  {uploadingCotacao ? 'Anexando...' : 'Anexar Cotação'}
                </label>
                
                {anexoCotacao && (
                  <div className="anexo-cotacao-info">
                    <FiFile style={{ color: '#4caf50' }} />
                    <span style={{ fontSize: '14px', color: '#2e7d32' }}>Cotação anexada</span>
                    <button
                      type="button"
                      onClick={handleDownloadCotacao}
                      title="Download"
                    >
                      <FiDownload style={{ color: '#4caf50' }} />
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoverCotacao}
                      title="Remover"
                    >
                      <FiX style={{ color: '#d32f2f' }} />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </form>

      {/* Modal Premium de Seleção de Produtos */}
      {showProdutosModal && (
        <SelecaoProdutosPremium
          onClose={() => setShowProdutosModal(false)}
          onSelect={(produtosSelecionados) => {
            const novosItens = [...itens];
            produtosSelecionados.forEach(produto => {
              if (produto._configuradoPorMarcadores && !produto.existente) {
                novosItens.push({
                  produto_id: null,
                  codigo_produto: produto.codigo || 'SOB-CONSULTA',
                  descricao: produto.nome || `Equipamento sob consulta – ${produto.familia || ''}`,
                  quantidade: 1,
                  unidade: 'UN',
                  valor_unitario: 0,
                  valor_total: 0,
                  observacoes: produto.especificacoes ? JSON.stringify(produto.especificacoes) : '',
                  familia_produto: produto.familia || '',
                  regiao_busca: ''
                });
              } else {
                novosItens.push({
                  produto_id: produto.id,
                  codigo_produto: produto.codigo,
                  descricao: produto.nome,
                  quantidade: 1,
                  unidade: produto.unidade || 'UN',
                  valor_unitario: produto.preco_base || 0,
                  valor_total: produto.preco_base || 0,
                  observacoes: produto.descricao || '',
                  familia_produto: produto.familia || produto.familia_produto || '',
                  regiao_busca: ''
                });
              }
            });
            setItens(novosItens);
            setShowProdutosModal(false);
            calculateTotal(novosItens);
          }}
        />
      )}

      {/* Modal de Histórico de Revisões */}
      {showHistorico && (
        <div className="modal-overlay" onClick={() => setShowHistorico(false)}>
          <div className="modal-content historico-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                <FiList style={{ marginRight: '10px' }} />
                Histórico de Revisões
              </h2>
              <button className="modal-close" onClick={() => setShowHistorico(false)}>
                <FiX />
              </button>
            </div>
            <div className="modal-body historico-body">
              {historicoRevisoes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                  <FiClock style={{ fontSize: '48px', marginBottom: '15px', opacity: 0.5 }} />
                  <p>Nenhuma revisão registrada ainda.</p>
                  <p style={{ fontSize: '14px', marginTop: '10px' }}>As revisões serão registradas automaticamente ao salvar alterações.</p>
                </div>
              ) : (
                <div className="historico-list">
                  {historicoRevisoes.map((revisaoItem, index) => (
                    <div key={revisaoItem.id} className="historico-item">
                      <div className="historico-header">
                        <div className="historico-badge">
                          <FiClock style={{ marginRight: '6px' }} />
                          REV{String(revisaoItem.revisao).padStart(2, '0')}
                        </div>
                        <div className="historico-meta">
                          <span className="historico-usuario">
                            {revisaoItem.revisado_por_nome || 'Usuário desconhecido'}
                          </span>
                          <span className="historico-data">
                            {new Date(revisaoItem.created_at).toLocaleString('pt-BR', {
                              timeZone: 'America/Sao_Paulo',
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit'
                            })}
                          </span>
                        </div>
                      </div>
                      {revisaoItem.mudancas && revisaoItem.mudancas.length > 0 ? (
                        <div className="historico-mudancas">
                          <h4 style={{ marginBottom: '12px', fontSize: '14px', fontWeight: 600, color: '#333' }}>
                            Mudanças realizadas:
                          </h4>
                          <ul className="mudancas-list">
                            {revisaoItem.mudancas.map((mudanca, idx) => (
                              <li key={idx} className="mudanca-item">
                                <div className="mudanca-campo">
                                  <strong>{mudanca.campo}:</strong>
                                </div>
                                <div className="mudanca-valores">
                                  <div className="mudanca-anterior">
                                    <span className="mudanca-label">Antes:</span>
                                    <span className="mudanca-valor">{mudanca.anterior}</span>
                                  </div>
                                  <div className="mudanca-seta">→</div>
                                  <div className="mudanca-novo">
                                    <span className="mudanca-label">Depois:</span>
                                    <span className="mudanca-valor novo">{mudanca.novo}</span>
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <div className="historico-sem-mudancas">
                          <span style={{ fontSize: '13px', color: '#999', fontStyle: 'italic' }}>
                            Nenhuma mudança detectada nesta revisão
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Elegibilidade */}
      {showModalElegibilidade && (
        <div className="modal-overlay" onClick={() => setShowModalElegibilidade(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h2>Proposta Automática Disponível</h2>
              <button onClick={() => setShowModalElegibilidade(false)} className="btn-close">
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <div style={{ 
                padding: '20px', 
                background: '#fff3e0', 
                borderRadius: '8px',
                marginBottom: '20px',
                borderLeft: '4px solid #FF6B35'
              }}>
                <p style={{ margin: 0, fontSize: '16px', lineHeight: '1.6' }}>
                  <strong>✓ Verifiquei e todos os itens são elegíveis para proposta automática.</strong>
                </p>
                <p style={{ margin: '10px 0 0 0', fontSize: '14px', color: '#666' }}>
                  Todos os produtos adicionados são da família "Hélices e Acessórios" e podem gerar uma proposta premium automaticamente.
                </p>
              </div>
              <p style={{ fontSize: '15px', marginBottom: '20px' }}>
                Gostaria de gerar uma proposta automática premium?
              </p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button 
                  onClick={async () => {
                    setShowModalElegibilidade(false);
                    // Aguardar um pouco para garantir que o estado foi atualizado
                    await new Promise(resolve => setTimeout(resolve, 100));
                    await salvarProposta();
                  }} 
                  className="btn-secondary"
                  disabled={loading}
                >
                  {loading ? 'Salvando...' : 'Não, salvar normalmente'}
                </button>
                <button 
                  onClick={handleGerarPropostaAutomatica} 
                  className="btn-primary"
                  disabled={loading}
                >
                  {loading ? 'Salvando...' : 'Sim, gerar proposta automática'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* X Fullscreen Vermelho */}
      {showXFullscreen && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            animation: 'fadeInOut 3s ease-in-out'
          }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%'
          }}>
            <FiX 
              style={{ 
                color: '#d32f2f', 
                fontSize: '300px', 
                fontWeight: 'bold',
                strokeWidth: '8',
                filter: 'drop-shadow(0 0 30px rgba(211, 47, 47, 1)) drop-shadow(0 0 60px rgba(211, 47, 47, 0.8))',
                animation: 'xPulse 0.5s ease-in-out'
              }} 
            />
          </div>
        </div>
      )}

      {/* Modal Premium de Alerta de Desconto */}
      {showModalDesconto && (
        <div 
          className="modal-overlay" 
          onClick={() => {
            setShowModalDesconto(false);
            setValorDescontoPendente(0);
          }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            animation: 'fadeIn 0.3s ease'
          }}
        >
          <div 
            className="modal-content" 
            onClick={(e) => e.stopPropagation()} 
            style={{ 
              maxWidth: '550px',
              width: '90%',
              backgroundColor: 'white',
              borderRadius: '16px',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
              overflow: 'hidden',
              animation: 'slideUp 0.3s ease',
              border: '3px solid #d32f2f'
            }}
          >
            <div style={{
              background: 'linear-gradient(135deg, #d32f2f 0%, #b71c1c 100%)',
              padding: '25px',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '28px' }}>🚨</span>
                ATENÇÃO: DESCONTO MÁXIMO APLICADO!
              </h2>
              <button 
                onClick={() => {
                  setShowModalDesconto(false);
                  setValorDescontoPendente(0);
                }}
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  color: 'white',
                  fontSize: '24px',
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.3)'}
                onMouseLeave={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.2)'}
              >
                <FiX />
              </button>
            </div>
            
            <div style={{ padding: '30px' }}>
              <div style={{
                padding: '20px',
                backgroundColor: '#ffebee',
                borderRadius: '10px',
                marginBottom: '25px',
                borderLeft: '5px solid #d32f2f'
              }}>
                <p style={{ margin: '0 0 15px 0', fontSize: '16px', lineHeight: '1.6', color: '#333' }}>
                  A margem de desconto aplicada de <strong style={{ color: '#d32f2f', fontSize: '18px' }}>{valorDescontoPendente.toFixed(2)}%</strong> excede o limite máximo permitido de <strong>5%</strong>.
                </p>
                
                <div style={{
                  marginTop: '20px',
                  padding: '15px',
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  border: '2px solid #d32f2f'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px solid #e0e0e0' }}>
                    <span style={{ fontWeight: '600', color: '#666' }}>Valor Total:</span>
                    <span style={{ fontWeight: '700', fontSize: '16px' }}>
                      {new Intl.NumberFormat('pt-BR', {
                        style: 'currency',
                        currency: 'BRL'
                      }).format(formData.valor_total)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px solid #e0e0e0' }}>
                    <span style={{ fontWeight: '600', color: '#d32f2f' }}>Desconto ({valorDescontoPendente.toFixed(2)}%):</span>
                    <span style={{ fontWeight: '700', fontSize: '18px', color: '#d32f2f' }}>
                      {new Intl.NumberFormat('pt-BR', {
                        style: 'currency',
                        currency: 'BRL'
                      }).format(formData.valor_total * (valorDescontoPendente / 100))}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '10px' }}>
                    <span style={{ fontWeight: '700', fontSize: '16px', color: '#333' }}>Valor Final:</span>
                    <span style={{ fontWeight: '700', fontSize: '20px', color: '#d32f2f' }}>
                      {new Intl.NumberFormat('pt-BR', {
                        style: 'currency',
                        currency: 'BRL'
                      }).format(formData.valor_total * (1 - valorDescontoPendente / 100))}
                    </span>
                  </div>
                </div>
              </div>
              
              <p style={{ fontSize: '15px', lineHeight: '1.6', color: '#666', marginBottom: '25px' }}>
                Por favor, <strong>verifique se realmente devemos seguir com esse desconto</strong> antes de continuar.
              </p>
              
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setShowModalDesconto(false);
                    setValorDescontoPendente(0);
                  }}
                  style={{
                    padding: '12px 28px',
                    background: '#f5f5f5',
                    color: '#333',
                    border: '2px solid #ddd',
                    borderRadius: '8px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '15px',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = '#e0e0e0';
                    e.target.style.borderColor = '#bbb';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = '#f5f5f5';
                    e.target.style.borderColor = '#ddd';
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    try {
                      // Verificar se o usuário está logado
                      if (!user || !user.id) {
                        toast.error('Usuário não identificado. Faça login novamente.');
                        return;
                      }

                      // Fechar modal de desconto primeiro
                      setShowModalDesconto(false);
                      setValorDescontoPendente(0);
                      
                      // Atualizar margem de desconto no formData
                      setFormData(prev => ({ ...prev, margem_desconto: valorDescontoPendente }));
                      
                      // Mostrar mensagem informativa
                      toast.info('Salve a proposta primeiro. Depois, você poderá solicitar a aprovação de desconto na aba "Aprovações".');
                    } catch (error) {
                      console.error('❌ Erro:', error);
                      toast.error('Erro ao processar. Tente novamente.');
                    }
                  }}
                  style={{
                    padding: '12px 28px',
                    background: 'linear-gradient(135deg, #d32f2f 0%, #b71c1c 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    fontSize: '15px',
                    boxShadow: '0 4px 12px rgba(211, 47, 47, 0.3)',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.transform = 'translateY(-2px)';
                    e.target.style.boxShadow = '0 6px 16px rgba(211, 47, 47, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = 'translateY(0)';
                    e.target.style.boxShadow = '0 4px 12px rgba(211, 47, 47, 0.3)';
                  }}
                >
                  Solicitar Autorização de Desconto
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview Editável da Proposta Premium */}
      {showPreviewEditavel && propostaSalva && (
        <PreviewPropostaEditavel
          proposta={propostaSalva}
          formData={formData}
          itens={itens}
          onClose={() => {
            setShowPreviewEditavel(false);
            navigate('/comercial/propostas');
          }}
          onSave={async (dadosEditados) => {
            // Esta função será chamada pelo PreviewPropostaEditavel
            // O componente já faz o salvamento e geração de PDF internamente
          }}
        />
      )}

      {/* X Fullscreen para Aprovação */}
      {showXFullscreenAprovacao && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            animation: 'fadeInOut 6s ease-in-out forwards'
          }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%'
          }}>
            <FiX 
              style={{ 
                color: '#d32f2f', 
                fontSize: '300px', 
                fontWeight: 'bold',
                strokeWidth: '8',
                filter: 'drop-shadow(0 0 30px rgba(211, 47, 47, 1)) drop-shadow(0 0 60px rgba(211, 47, 47, 0.8))',
                animation: 'xPulse 0.6s ease-in-out'
              }} 
            />
          </div>
        </div>
      )}

      {/* Modal de Aviso - Aprovação Necessária (Simplificado) */}
      {showModalAprovacaoNecessaria && (
        <div className="modal-overlay" onClick={() => setShowModalAprovacaoNecessaria(false)}>
          <div className="modal-content modal-aprovacao-simples" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <FiAlertCircle size={28} style={{ color: '#ff6b35' }} />
                <h2>Aprovação de Desconto Necessária</h2>
              </div>
              <button 
                className="modal-close" 
                onClick={() => setShowModalAprovacaoNecessaria(false)}
              >
                <FiX size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '20px' }}>
                <p style={{ fontSize: '16px', lineHeight: '1.6', color: '#333', marginBottom: '15px' }}>
                  Esta proposta possui um desconto de <strong style={{ color: '#d32f2f', fontSize: '18px' }}>{formData.margem_desconto?.toFixed(2)}%</strong>, 
                  que excede o limite máximo permitido de <strong style={{ color: '#0066CC' }}>5%</strong>.
                </p>
              </div>

              <div style={{ 
                background: '#f5f7fa', 
                padding: '20px', 
                borderRadius: '10px', 
                marginBottom: '20px',
                border: '1px solid #e0e0e0'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ color: '#666', fontSize: '14px' }}>Valor Total:</span>
                  <strong style={{ color: '#1a4d7a', fontSize: '16px' }}>
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(formData.valor_total)}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ color: '#666', fontSize: '14px' }}>Desconto ({formData.margem_desconto?.toFixed(2)}%):</span>
                  <strong style={{ color: '#d32f2f', fontSize: '16px' }}>
                    - {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                      formData.valor_total * (formData.margem_desconto / 100)
                    )}
                  </strong>
                </div>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  paddingTop: '12px',
                  borderTop: '2px solid #e0e0e0'
                }}>
                  <span style={{ color: '#333', fontSize: '15px', fontWeight: '600' }}>Valor Final:</span>
                  <strong style={{ color: '#28a745', fontSize: '18px' }}>
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                      formData.valor_total * (1 - formData.margem_desconto / 100)
                    )}
                  </strong>
                </div>
              </div>

              <div style={{ 
                background: '#fff3cd', 
                padding: '15px', 
                borderRadius: '10px', 
                marginBottom: '20px',
                border: '1px solid #ffc107'
              }}>
                <p style={{ margin: 0, color: '#856404', fontSize: '14px', lineHeight: '1.6' }}>
                  <strong>A proposta será salva como RASCUNHO</strong> e ficará em standby até que a autorização de desconto seja aprovada.
                </p>
              </div>

              <div style={{ 
                background: '#e3f2fd', 
                padding: '15px', 
                borderRadius: '10px',
                border: '1px solid #2196f3'
              }}>
                <p style={{ margin: '0 0 12px 0', color: '#1976d2', fontWeight: '600', fontSize: '14px' }}>
                  Próximos passos:
                </p>
                <ol style={{ margin: 0, paddingLeft: '20px', color: '#1976d2', fontSize: '14px', lineHeight: '1.8' }}>
                  <li>Salve a proposta como rascunho (botão abaixo)</li>
                  <li>Vá para a aba "Aprovações" e clique em "Nova Solicitação"</li>
                  <li>Aguarde a aprovação de um usuário autorizado</li>
                  <li>Após a aprovação, você poderá alterar o status da proposta</li>
                </ol>
              </div>
            </div>
            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowModalAprovacaoNecessaria(false);
                  setPropostaParaSalvar(null);
                }}
              >
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={async () => {
                  setShowModalAprovacaoNecessaria(false);
                  if (propostaParaSalvar) {
                    propostaParaSalvar.status = 'rascunho';
                    setFormData(prev => ({ ...prev, status: 'rascunho', margem_desconto: formData.margem_desconto }));
                    const dataToSend = { ...propostaParaSalvar };
                    if (!dataToSend.numero_proposta || (typeof dataToSend.numero_proposta === 'string' && dataToSend.numero_proposta.trim() === '')) {
                      delete dataToSend.numero_proposta;
                    }
                    
                    try {
                      let response;
                      const propostaId = id || formData.id;
                      if (propostaId) {
                        response = await api.put(`/propostas/${propostaId}`, dataToSend);
                      } else {
                        response = await api.post('/propostas', dataToSend);
                      }
                      
                      if (response.data?.id) {
                        setFormData(prev => ({ ...prev, id: response.data.id }));
                        toast.success('Proposta salva como rascunho. Solicite a aprovação na aba "Aprovações".');
                        if (!id && response.data.id) {
                          navigate(`/comercial/propostas/editar/${response.data.id}`, { replace: true });
                        }
                      }
                    } catch (error) {
                      console.error('Erro ao salvar proposta:', error);
                      toast.error('Erro ao salvar proposta: ' + (error.response?.data?.error || error.message));
                    }
                  }
                  setPropostaParaSalvar(null);
                }}
              >
                <FiCheck /> Salvar como Rascunho
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PropostaForm;

