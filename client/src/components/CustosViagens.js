import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import {
  FiDollarSign, FiMapPin, FiCalendar, FiTrendingUp, FiTrendingDown,
  FiCheckCircle, FiX, FiAlertCircle, FiPlus, FiEdit, FiTrash2,
  FiSearch, FiFilter, FiDownload, FiRefreshCw, FiNavigation, FiClock,
  FiShield, FiLock, FiUnlock, FiInfo, FiUsers
} from 'react-icons/fi';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import './CustosViagens.css';
import PreviewRota from './PreviewRota';
import { valoresDaRota } from '../utils/valoresDaRota';
import { obterCoordenadasDoCliente } from '../utils/coordenadasDoCliente';

/**
 * Etapa 157 (RN-157.01, C372): os sete campos que fazem a rota ser recalculada, numa forma comparavel (o mesmo texto para 5 e '5', null e '').
 * Uma funcao so — usada no handleEdit (sobre o objeto ja normalizado que vai para o formulario) e no efeito do recalculo.
 */
export function assinaturaDaRota(f) {
  const v = (x) => (x == null ? '' : String(x));
  return JSON.stringify([f.cliente_id, f.destino_cidade, f.destino_estado, f.tipo_viagem, f.numero_pessoas, f.data_viagem, f.data_volta].map(v));
}

const CustosViagens = () => {
  const [loading, setLoading] = useState(true);
  const [custos, setCustos] = useState([]);
  const [analise, setAnalise] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingCusto, setEditingCusto] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [propostas, setPropostas] = useState([]);
  const [atividades, setAtividades] = useState([]);
  const [calculandoRota, setCalculandoRota] = useState(false);
  const [rotaCalculada, setRotaCalculada] = useState(null);
  const [elegibilidade, setElegibilidade] = useState(null);
  const [verificandoElegibilidade, setVerificandoElegibilidade] = useState(false);
  const [mostrarModalAutorizacao, setMostrarModalAutorizacao] = useState(false);
  const [motivoAutorizacao, setMotivoAutorizacao] = useState('');
  const [mostrarModalPassagemAerea, setMostrarModalPassagemAerea] = useState(false);
  const [rotaPendente, setRotaPendente] = useState(null);
  const [passagemAereaConfirmada, setPassagemAereaConfirmada] = useState(false);
  const [distanciaConfirmada, setDistanciaConfirmada] = useState(null);
  const [clientesProximos, setClientesProximos] = useState([]);
  const [mostrarModalClientesProximos, setMostrarModalClientesProximos] = useState(false);
  const [clientesSelecionados, setClientesSelecionados] = useState([]); // Múltiplos clientes
  const [carregandoClientesProximos, setCarregandoClientesProximos] = useState(false);
  const [mostrarPreviewRota, setMostrarPreviewRota] = useState(false);
  const [dadosPreviewRota, setDadosPreviewRota] = useState(null);
  const [filtros, setFiltros] = useState({
    busca_cliente: '',
    cliente_id: '',
    data_inicio: '',
    data_fim: '',
    status_aprovacao: '',
    tipo_viagem: '',
    distancia_min: '',
    distancia_max: '',
    valor_min: '',
    valor_max: ''
  });
  const [clientesFiltrados, setClientesFiltrados] = useState([]);
  const [showFiltrosAvancados, setShowFiltrosAvancados] = useState(false);
  const [logsAutorizacao, setLogsAutorizacao] = useState([]);
  const [comprovantes, setComprovantes] = useState([]);
  const [historico, setHistorico] = useState([]);
  const [mostrarModalComprovantes, setMostrarModalComprovantes] = useState(false);
  const [mostrarModalHistorico, setMostrarModalHistorico] = useState(false);
  const [viagemSelecionada, setViagemSelecionada] = useState(null);
  const [uploadingComprovante, setUploadingComprovante] = useState(false);
  const [ordenacao, setOrdenacao] = useState({ campo: 'data_viagem', ordem: 'DESC' });
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [itensPorPagina] = useState(20);
  const [mensagemSucesso, setMensagemSucesso] = useState(null);
  const [mensagemErro, setMensagemErro] = useState(null);
  // RN-157.01 (C372): a edicao guarda a assinatura dos campos da rota gravados; enquanto ela vale, o recalculo so SUGERE
  const assinaturaGravadaRef = useRef(null);
  // a resposta de um calculo que nao e o ultimo pedido (ou de antes de fechar o formulario / apagar o cliente) nao toca em nada
  const pedidoDaRotaRef = useRef(0);
  const [sugestaoSemAplicar, setSugestaoSemAplicar] = useState(false);
  // RN-157.03 (Fase 2 K1): o ultimo cliente escolhido — a resposta (coordenada, elegibilidade, proximos) de outro nao vale
  const clienteEscolhidoRef = useRef(null);

  const [formData, setFormData] = useState({
    cliente_id: '',
    proposta_id: '',
    proposta_aprovacao_id: '',
    atividade_id: '',
    data_viagem: '',
    data_volta: '',
      origem: 'Av. Angelo Demarchi 130, Batistini, São Bernardo do Campo',
      origem_cidade: 'São Bernardo do Campo',
      origem_estado: 'SP',
    destino: '',
    destino_cidade: '',
    destino_estado: '',
    tipo_viagem: 'ida_e_volta',
    numero_pessoas: 1,
    distancia_km: 0,
    tempo_estimado_horas: 0,
    custo_transporte: '',
    custo_hospedagem: '',
    custo_alimentacao: '',
    custo_outros: '',
    custo_sugerido: 0,
    descricao: ''
  });

  useEffect(() => {
    // Carregar apenas dados essenciais primeiro
    loadDataInicial();
    // Carregar propostas e atividades em paralelo (não bloqueiam)
    Promise.all([loadPropostas(), loadAtividades()]).catch(err => {
      console.error('Erro ao carregar dados auxiliares:', err);
    });
  }, []);

  useEffect(() => {
    loadClientes();
  }, [filtros.busca_cliente]);

  useEffect(() => {
    // Recarregar custos quando filtros ou ordenação mudarem (mas não no primeiro carregamento)
    if (!loading) {
      loadCustos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros.cliente_id, filtros.proposta_id, filtros.data_inicio, filtros.data_fim, filtros.status_aprovacao, filtros.tipo_viagem, ordenacao]);

  // Calcular rota automaticamente quando cliente ou destino mudar
  useEffect(() => {
    // RN-157.01: qualquer diferenca da assinatura gravada apaga a assinatura — para sempre nesta edicao (voltar o campo nao a traz de volta)
    const preservarGravados = assinaturaGravadaRef.current !== null && assinaturaGravadaRef.current === assinaturaDaRota(formData);
    if (!preservarGravados) assinaturaGravadaRef.current = null;
    // Só calcular se tiver cliente selecionado E cidade E estado preenchidos (não vazios)
    if (formData.cliente_id &&
        formData.destino_cidade &&
        formData.destino_cidade.trim() &&
        formData.destino_estado &&
        formData.destino_estado.trim()) {
      calcularRota({ aplicar: !preservarGravados });
    } else {
      // Limpar rota calculada se não tiver dados suficientes (e descartar a resposta de um calculo em curso)
      pedidoDaRotaRef.current += 1;
      setRotaCalculada(null);
      setCalculandoRota(false);
      setSugestaoSemAplicar(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.cliente_id, formData.destino_cidade, formData.destino_estado, formData.tipo_viagem, formData.numero_pessoas, formData.data_viagem, formData.data_volta]);

  // Carregar dados iniciais (rápido)
  const loadDataInicial = async () => {
    setLoading(true);
    try {
      // Carregar apenas o essencial primeiro
      await Promise.all([
        loadCustos(),
        loadResumo()
      ]);
      // Análise pode ser carregada depois (não bloqueia)
      loadAnalise().catch(err => {
        console.error('Erro ao carregar análise:', err);
      });
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  // Função completa (para refresh manual)
  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadCustos(),
        loadResumo(),
        loadAnalise()
      ]);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCustos = async () => {
    try {
      const params = new URLSearchParams();
      if (filtros.cliente_id) params.append('cliente_id', filtros.cliente_id);
      if (filtros.proposta_id) params.append('proposta_id', filtros.proposta_id);
      if (filtros.data_inicio) params.append('data_inicio', filtros.data_inicio);
      if (filtros.data_fim) params.append('data_fim', filtros.data_fim);
      if (filtros.status_aprovacao) params.append('status_aprovacao', filtros.status_aprovacao);
      if (filtros.tipo_viagem) params.append('tipo_viagem', filtros.tipo_viagem);
      if (filtros.busca_cliente && !filtros.cliente_id) {
        // Se está buscando por texto, tentar encontrar código
        params.append('codigo_visita', filtros.busca_cliente);
      }
      if (ordenacao.campo) {
        params.append('ordenar_por', ordenacao.campo);
        params.append('ordem', ordenacao.ordem);
      }
      
      const response = await api.get(`/custos-viagens?${params.toString()}`);
      let custosFiltrados = response.data || [];
      
      // Filtros adicionais no frontend (distância e valor)
      if (filtros.distancia_min) {
        custosFiltrados = custosFiltrados.filter(c => c.distancia_km >= parseFloat(filtros.distancia_min));
      }
      if (filtros.distancia_max) {
        custosFiltrados = custosFiltrados.filter(c => c.distancia_km <= parseFloat(filtros.distancia_max));
      }
      if (filtros.valor_min) {
        custosFiltrados = custosFiltrados.filter(c => c.total_custo >= parseFloat(filtros.valor_min));
      }
      if (filtros.valor_max) {
        custosFiltrados = custosFiltrados.filter(c => c.total_custo <= parseFloat(filtros.valor_max));
      }
      
      setCustos(custosFiltrados);
    } catch (error) {
      console.error('Erro ao carregar custos:', error);
      setCustos([]);
    }
  };

  const loadAnalise = async () => {
    try {
      const response = await api.get('/custos-viagens/analise/cliente');
      setAnalise(response.data);
    } catch (error) {
      console.error('Erro ao carregar análise:', error);
    }
  };

  const loadResumo = async () => {
    try {
      const response = await api.get('/custos-viagens/resumo');
      setResumo(response.data);
    } catch (error) {
      console.error('Erro ao carregar resumo:', error);
    }
  };

  const loadClientes = async () => {
    try {
      const params = {};
      if (filtros.busca_cliente) {
        params.search = filtros.busca_cliente;
      }
      const response = await api.get('/clientes', { params });
      setClientes(response.data);
      filtrarClientes(response.data, filtros.busca_cliente);
    } catch (error) {
      console.error('Erro ao carregar clientes:', error);
    }
  };

  const filtrarClientes = (listaClientes, busca) => {
    if (!busca) {
      setClientesFiltrados(listaClientes.slice(0, 50)); // Limitar a 50 para performance
      return;
    }
    const buscaLower = busca.toLowerCase();
    const filtrados = listaClientes.filter(cliente => 
      cliente.razao_social?.toLowerCase().includes(buscaLower) ||
      cliente.nome_fantasia?.toLowerCase().includes(buscaLower) ||
      cliente.cidade?.toLowerCase().includes(buscaLower) ||
      cliente.estado?.toLowerCase().includes(buscaLower) ||
      cliente.cnpj?.includes(busca)
    ).slice(0, 50);
    setClientesFiltrados(filtrados);
  };

  useEffect(() => {
    filtrarClientes(clientes, filtros.busca_cliente);
  }, [filtros.busca_cliente]);

  const loadPropostas = async () => {
    try {
      const response = await api.get('/propostas');
      setPropostas(response.data);
    } catch (error) {
      console.error('Erro ao carregar propostas:', error);
    }
  };

  const loadAtividades = async () => {
    try {
      const response = await api.get('/atividades');
      setAtividades(response.data);
    } catch (error) {
      console.error('Erro ao carregar atividades:', error);
    }
  };

  // aplicar: false = so sugerir (a abertura da edicao, RN-157.01): mostra o quadro e a frase, nao abre o modal, nao toca no formulario
  const calcularRota = async ({ aplicar = true } = {}) => {
    pedidoDaRotaRef.current += 1;
    const meuPedido = pedidoDaRotaRef.current;
    const valeAinda = () => pedidoDaRotaRef.current === meuPedido;
    if (aplicar) setSugestaoSemAplicar(false);

    if (!formData.destino_cidade || !formData.destino_estado) {
      setRotaCalculada(null);
      return;
    }

    // Validar se cidade e estado não estão vazios
    if (!formData.destino_cidade.trim() || !formData.destino_estado.trim()) {
      setRotaCalculada(null);
      return;
    }

    setCalculandoRota(true);
    try {
      const params = new URLSearchParams({
        origem_cidade: formData.origem_cidade,
        origem_estado: formData.origem_estado,
        destino_cidade: formData.destino_cidade.trim(),
        destino_estado: formData.destino_estado.trim(),
        tipo_viagem: formData.tipo_viagem,
        numero_pessoas: formData.numero_pessoas || 1,
        data_viagem: formData.data_viagem || '',
        data_volta: formData.data_volta || ''
      });

      const response = await api.get(`/custos-viagens/calcular-rota?${params.toString()}`);
      if (!valeAinda()) return;

      if (!aplicar) {
        // RN-157.01 (C372): a abertura da edicao so sugere — os valores gravados ficam; o Aplicar Valores Sugeridos os troca
        setRotaCalculada(response.data);
        setSugestaoSemAplicar(true);
        return;
      }

      // Verificar se a distância mudou significativamente (mais de 10km de diferença)
      const distanciaMudou = distanciaConfirmada === null ||
                            Math.abs(response.data.distancia_km - distanciaConfirmada) > 10;

      // Se requer passagem aérea E (não foi confirmada OU a distância mudou significativamente)
      if (response.data.requer_passagem_aerea && (!passagemAereaConfirmada || distanciaMudou)) {
        setRotaCalculada(null);
        setRotaPendente(response.data);
        setMostrarModalPassagemAerea(true);
        return;
      }

      setRotaCalculada(response.data);

      // Preencher automaticamente os campos (RN-157.02: a mesma funcao da confirmacao da passagem e do Aplicar)
      setFormData(prev => ({ ...prev, ...valoresDaRota(response.data) }));
    } catch (error) {
      if (!valeAinda()) return;
      console.error('Erro ao calcular rota:', error);
      // Não mostrar alert - apenas limpar rota calculada (o sistema continua funcionando sem o cálculo automático)
      setRotaCalculada(null);
    } finally {
      if (valeAinda()) setCalculandoRota(false);
    }
  };

  const confirmarPassagemAerea = () => {
    if (rotaPendente) {
      setRotaCalculada(rotaPendente);
      setRotaPendente(null);
      setMostrarModalPassagemAerea(false);
      
      // Marcar que a passagem aérea foi confirmada para esta distância
      setPassagemAereaConfirmada(true);
      setDistanciaConfirmada(rotaPendente.distancia_km);
      setSugestaoSemAplicar(false);
      
      // Preencher automaticamente os campos (RN-157.02, C374: com a taxa de embarque, outros 0)
      setFormData(prev => ({ ...prev, ...valoresDaRota(rotaPendente) }));
    }
  };

  const cancelarPassagemAerea = () => {
    setRotaPendente(null);
    setMostrarModalPassagemAerea(false);
    setCalculandoRota(false);
    // Não marcar como confirmada se cancelou
  };

  const handleClienteChange = async (clienteId) => {
    clienteEscolhidoRef.current = clienteId ? String(clienteId) : null;
    if (!clienteId) {
      // Se não houver cliente selecionado, limpar tudo
      setFormData(prev => ({
        ...prev,
        cliente_id: '',
        destino: '',
        destino_cidade: '',
        destino_estado: ''
      }));
      setClientesSelecionados([]);
      setRotaCalculada(null);
      setElegibilidade(null);
      setPassagemAereaConfirmada(false);
      setDistanciaConfirmada(null);
      return;
    }
    
    // Se mudou de cliente, resetar confirmação de passagem aérea
    if (formData.cliente_id && formData.cliente_id !== clienteId) {
      setPassagemAereaConfirmada(false);
      setDistanciaConfirmada(null);
    }

    const cliente = clientes.find(c => c.id === parseInt(clienteId));
    if (!cliente) {
      console.error('Cliente não encontrado:', clienteId);
      return;
    }

    // Atualizar formData imediatamente (não bloquear a UI)
    setFormData(prev => ({
      ...prev,
      cliente_id: clienteId,
      destino: cliente.endereco ? `${cliente.endereco}, ${cliente.cidade} - ${cliente.estado}` : `${cliente.cidade} - ${cliente.estado}`,
      destino_cidade: cliente.cidade || '',
      destino_estado: cliente.estado || ''
    }));

    // Limpar rota calculada anterior se cliente não tiver cidade/estado
    if (!cliente.cidade || !cliente.estado) {
      setRotaCalculada(null);
      setCalculandoRota(false);
      return;
    }

    // Buscar coordenadas exatas em background (não bloquear)
    try {
      const coords = await obterCoordenadasCliente(cliente);
      if (clienteEscolhidoRef.current !== String(clienteId)) return; // RN-157.03: escolheram outro cliente enquanto esperava
      const clienteComCoords = { 
        id: parseInt(clienteId), 
        ...cliente, 
        coordenadas: coords 
      };
      
      // Atualizar clientes selecionados com coordenadas
      setClientesSelecionados([clienteComCoords]);
    } catch (error) {
      console.error('Erro ao obter coordenadas do cliente:', error);
      if (clienteEscolhidoRef.current !== String(clienteId)) return;
      // Mesmo com erro, adicionar cliente sem coordenadas (será calculado depois)
      setClientesSelecionados([{ 
        id: parseInt(clienteId), 
        ...cliente 
      }]);
    }
    
    // Verificar elegibilidade e buscar clientes próximos em paralelo
    if (clienteId) {
      Promise.all([
        verificarElegibilidade(clienteId),
        buscarClientesProximos(clienteId)
      ]).catch(error => {
        console.error('Erro ao verificar elegibilidade ou buscar clientes próximos:', error);
      });
    }
  };

  const verificarElegibilidade = async (clienteId) => {
    if (!clienteId) return;
    
    setVerificandoElegibilidade(true);
    try {
      const response = await api.get(`/custos-viagens/verificar-elegibilidade/${clienteId}`);
      if (clienteEscolhidoRef.current !== String(clienteId)) return;
      setElegibilidade(response.data);
    } catch (error) {
      console.error('Erro ao verificar elegibilidade:', error);
      if (clienteEscolhidoRef.current !== String(clienteId)) return;
      setElegibilidade(null);
    } finally {
      setVerificandoElegibilidade(false);
    }
  };

  const buscarClientesProximos = async (clienteId) => {
    setCarregandoClientesProximos(true);
    try {
      const response = await api.get(`/custos-viagens/clientes-proximos/${clienteId}?raio_km=100`);
      if (clienteEscolhidoRef.current !== String(clienteId)) return;
      if (response.data && response.data.length > 0) {
        // Garantir que os clientes retornados já têm coordenadas exatas (vêm do backend)
        const clientesComCoords = response.data.map(cliente => ({
          ...cliente,
          // As coordenadas já vêm do backend, mas garantir que estão presentes
          coordenadas: cliente.coordenadas || [cliente.lat, cliente.lon]
        }));
        setClientesProximos(clientesComCoords);
        setMostrarModalClientesProximos(true);
      } else {
        setClientesProximos([]);
        // Não mostrar modal se não houver clientes próximos
        setMostrarModalClientesProximos(false);
      }
    } catch (error) {
      console.error('Erro ao buscar clientes próximos:', error);
      if (clienteEscolhidoRef.current !== String(clienteId)) return;
      setClientesProximos([]);
      setMostrarModalClientesProximos(false);
    } finally {
      setCarregandoClientesProximos(false);
    }
  };

  const adicionarClienteProximo = async (cliente) => {
    // Verificar se já não está adicionado
    if (!clientesSelecionados.find(c => c.id === cliente.id)) {
      // Se o cliente já tem coordenadas, usar; senão, buscar coordenadas exatas
      if (!cliente.coordenadas) {
        const coords = await obterCoordenadasCliente(cliente);
        cliente.coordenadas = coords;
      }
      setClientesSelecionados(prev => [...prev, cliente]);
    }
  };

  const removerClienteSelecionado = (clienteId) => {
    setClientesSelecionados(prev => {
      const novos = prev.filter(c => c.id !== clienteId);
      // Se remover o cliente principal, atualizar formData
      if (novos.length === 0) {
        setFormData(prev => ({
          ...prev,
          cliente_id: '',
          destino: '',
          destino_cidade: '',
          destino_estado: ''
        }));
      } else if (novos.length === 1) {
        // Se sobrar apenas um, definir como principal
        const cliente = novos[0];
        setFormData(prev => ({
          ...prev,
          cliente_id: cliente.id.toString(),
          destino: cliente.endereco ? `${cliente.endereco}, ${cliente.cidade} - ${cliente.estado}` : `${cliente.cidade} - ${cliente.estado}`,
          destino_cidade: cliente.cidade || '',
          destino_estado: cliente.estado || ''
        }));
      }
      return novos;
    });
  };

  const fecharModalClientesProximos = () => {
    setMostrarModalClientesProximos(false);
    setClientesProximos([]);
  };

  // RN-157.03 (C375): a coordenada vem do servidor para todo cliente com id; sem resposta, null (sem localizacao) — sem lista de cidades aqui
  const obterCoordenadasCliente = (cliente) => obterCoordenadasDoCliente(cliente);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Verificar se precisa de autorização
    if (!editingCusto && elegibilidade && !elegibilidade.todas_obrigatorias_atendidas) {
      setMostrarModalAutorizacao(true);
      return;
    }
    
    await salvarCusto();
  };

  const salvarCusto = async () => {
    try {
      // Preparar array de clientes para a viagem
      const clientesViagem = clientesSelecionados.map((cliente, index) => ({
        id: cliente.id,
        ordem: index + 1,
        distancia_km: cliente.distancia_km || null
      }));
      
      const dadosParaEnviar = {
        ...formData,
        clientes_viagem: clientesViagem.length > 0 ? clientesViagem : null,
        autorizado_sem_regras: mostrarModalAutorizacao && motivoAutorizacao ? true : false,
        motivo_autorizacao: motivoAutorizacao || null,
        regras_nao_atendidas: elegibilidade && !elegibilidade.todas_obrigatorias_atendidas 
          ? Object.entries(elegibilidade.regras)
              .filter(([_, regra]) => !regra.atendida)
              .map(([key, regra]) => regra.nome)
          : null
      };
      
      if (editingCusto) {
        await api.put(`/custos-viagens/${editingCusto.id}`, dadosParaEnviar);
      } else {
        await api.post('/custos-viagens', dadosParaEnviar);
      }
      
      // Se houver múltiplos clientes, mostrar preview da rota
      if (clientesSelecionados.length > 1) {
        // Garantir que todos os clientes têm coordenadas exatas
        const clientesComCoords = await Promise.all(
          clientesSelecionados.map(async (cliente) => {
            if (!cliente.coordenadas) {
              cliente.coordenadas = await obterCoordenadasCliente(cliente);
            }
            return cliente;
          })
        );
        
        setDadosPreviewRota({
          origem: [-23.7150, -46.5550], // Coordenadas da GMP (Av. Angelo Demarchi 130)
          clientes: clientesComCoords
        });
        setMostrarPreviewRota(true);
      }
      
      setShowModal(false);
      setMostrarModalAutorizacao(false);
      setEditingCusto(null);
      setMotivoAutorizacao('');
      
      // Só resetar se não for mostrar preview
      if (clientesSelecionados.length <= 1) {
        resetForm();
      }
      
      loadData();
    } catch (error) {
      console.error('Erro ao salvar custo:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Erro ao salvar custo de viagem';
      alert(errorMessage);
    }
  };

  const buscarLogsAutorizacao = async (custoViagemId) => {
    try {
      const response = await api.get(`/custos-viagens/${custoViagemId}/logs-autorizacao`);
      setLogsAutorizacao(response.data || []);
    } catch (error) {
      console.error('Erro ao buscar logs de autorização:', error);
      setLogsAutorizacao([]);
    }
  };

  const handleDuplicar = async (custo) => {
    if (!window.confirm(`Deseja duplicar a viagem ${custo.codigo_visita || custo.id}?`)) {
      return;
    }
    
    try {
      const response = await api.post(`/custos-viagens/${custo.id}/duplicar`);
      setMensagemSucesso('Viagem duplicada com sucesso!');
      setTimeout(() => setMensagemSucesso(null), 5000);
      loadData();
    } catch (error) {
      console.error('Erro ao duplicar viagem:', error);
      setMensagemErro(error.response?.data?.error || 'Erro ao duplicar viagem');
      setTimeout(() => setMensagemErro(null), 5000);
    }
  };

  const buscarComprovantes = async (custoViagemId) => {
    try {
      const response = await api.get(`/custos-viagens/${custoViagemId}/comprovantes`);
      setComprovantes(response.data || []);
    } catch (error) {
      console.error('Erro ao buscar comprovantes:', error);
      setComprovantes([]);
    }
  };

  const buscarHistorico = async (custoViagemId) => {
    try {
      const response = await api.get(`/custos-viagens/${custoViagemId}/historico`);
      setHistorico(response.data || []);
    } catch (error) {
      console.error('Erro ao buscar histórico:', error);
      setHistorico([]);
    }
  };

  const handleUploadComprovante = async (e, custoViagemId) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.size > 40 * 1024 * 1024) {
      setMensagemErro('O arquivo excede o limite de 40MB');
      setTimeout(() => setMensagemErro(null), 5000);
      e.target.value = '';
      return;
    }
    
    setUploadingComprovante(true);
    
    try {
      const formData = new FormData();
      formData.append('arquivo', file);
      formData.append('tipo_comprovante', 'nota_fiscal'); // Pode ser melhorado com um select
      formData.append('descricao', '');
      
      await api.post(`/custos-viagens/${custoViagemId}/comprovante`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      setMensagemSucesso('Comprovante anexado com sucesso!');
      setTimeout(() => setMensagemSucesso(null), 5000);
      buscarComprovantes(custoViagemId);
      e.target.value = '';
    } catch (error) {
      setMensagemErro(error.response?.data?.error || 'Erro ao anexar comprovante');
      setTimeout(() => setMensagemErro(null), 5000);
    } finally {
      setUploadingComprovante(false);
    }
  };

  const handleDownloadComprovante = async (custoViagemId, anexoId, nomeOriginal) => {
    try {
      const response = await api.get(`/custos-viagens/${custoViagemId}/comprovante/${anexoId}`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', nomeOriginal);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      setMensagemErro('Erro ao fazer download do comprovante');
      setTimeout(() => setMensagemErro(null), 5000);
    }
  };

  const handleDeleteComprovante = async (custoViagemId, anexoId) => {
    if (!window.confirm('Tem certeza que deseja excluir este comprovante?')) {
      return;
    }
    
    try {
      await api.delete(`/custos-viagens/${custoViagemId}/comprovante/${anexoId}`);
      setMensagemSucesso('Comprovante excluído com sucesso!');
      setTimeout(() => setMensagemSucesso(null), 5000);
      buscarComprovantes(custoViagemId);
    } catch (error) {
      setMensagemErro(error.response?.data?.error || 'Erro ao excluir comprovante');
      setTimeout(() => setMensagemErro(null), 5000);
    }
  };

  const handleOrdenar = (campo) => {
    setOrdenacao(prev => ({
      campo,
      ordem: prev.campo === campo && prev.ordem === 'DESC' ? 'ASC' : 'DESC'
    }));
  };

  const handleEdit = (custo) => {
    setEditingCusto(custo);
    const gravado = {
      cliente_id: custo.cliente_id || '',
      proposta_id: custo.proposta_id || '',
      proposta_aprovacao_id: custo.proposta_aprovacao_id || '',
      atividade_id: custo.atividade_id || '',
      data_viagem: custo.data_viagem || '',
      data_volta: custo.data_volta || '',
      origem: custo.origem || 'Av. Angelo Demarchi 130, Batistini, São Bernardo do Campo',
      origem_cidade: custo.origem_cidade || 'São Bernardo do Campo',
      origem_estado: custo.origem_estado || 'SP',
      destino: custo.destino || '',
      destino_cidade: custo.destino_cidade || '',
      destino_estado: custo.destino_estado || '',
      tipo_viagem: custo.tipo_viagem || 'ida_e_volta',
      numero_pessoas: custo.numero_pessoas || 1,
      distancia_km: custo.distancia_km || 0,
      tempo_estimado_horas: custo.tempo_estimado_horas || 0,
      custo_transporte: custo.custo_transporte || '',
      custo_hospedagem: custo.custo_hospedagem || '',
      custo_alimentacao: custo.custo_alimentacao || '',
      custo_outros: custo.custo_outros || '',
      custo_sugerido: custo.custo_sugerido || 0,
      descricao: custo.descricao || ''
    };
    // RN-157.01 (C372): abrir para editar nao troca os valores gravados — a assinatura do objeto que vai para o formulario
    assinaturaGravadaRef.current = assinaturaDaRota(gravado);
    pedidoDaRotaRef.current += 1;
    setSugestaoSemAplicar(false);
    setRotaCalculada(null);
    setFormData(gravado);
    // Buscar logs de autorização quando editar
    if (custo.id) {
      buscarLogsAutorizacao(custo.id);
    }
    
    // Se a viagem já tem distância > 600km, marcar como confirmada para não perguntar novamente
    if (custo.distancia_km > 600) {
      setPassagemAereaConfirmada(true);
      setDistanciaConfirmada(custo.distancia_km);
    } else {
      setPassagemAereaConfirmada(false);
      setDistanciaConfirmada(null);
    }
    
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Tem certeza que deseja excluir este custo de viagem?')) {
      return;
    }
    try {
      await api.delete(`/custos-viagens/${id}`);
      loadData();
    } catch (error) {
      console.error('Erro ao deletar custo:', error);
      alert('Erro ao deletar custo de viagem');
    }
  };

  const handleAprovar = async (id, aprovado, motivo = '') => {
    try {
      await api.post(`/custos-viagens/${id}/aprovar`, { aprovado, motivo });
      loadData();
    } catch (error) {
      console.error('Erro ao aprovar/rejeitar:', error);
      alert('Erro ao processar aprovação');
    }
  };

  const resetForm = () => {
    assinaturaGravadaRef.current = null;
    clienteEscolhidoRef.current = null;
    pedidoDaRotaRef.current += 1;
    setSugestaoSemAplicar(false);
    setFormData({
      cliente_id: '',
      proposta_id: '',
      proposta_aprovacao_id: '',
      atividade_id: '',
      data_viagem: '',
      data_volta: '',
      origem: 'Av. Angelo Demarchi 130, Batistini, São Bernardo do Campo',
      origem_cidade: 'São Bernardo do Campo',
      origem_estado: 'SP',
      destino: '',
      destino_cidade: '',
      destino_estado: '',
      tipo_viagem: 'ida_e_volta',
      numero_pessoas: 1,
      distancia_km: 0,
      tempo_estimado_horas: 0,
      custo_transporte: '',
      custo_hospedagem: '',
      custo_alimentacao: '',
      custo_outros: '',
      custo_sugerido: 0,
      requer_passagem_aerea: false,
      descricao: ''
    });
    setRotaCalculada(null);
    setElegibilidade(null);
    setCalculandoRota(false);
    setClientesSelecionados([]);
    setClientesProximos([]);
    setMostrarModalClientesProximos(false);
    setLogsAutorizacao([]);
    setPassagemAereaConfirmada(false);
    setDistanciaConfirmada(null);
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const getRecomendacaoBadge = (recomendacao) => {
    switch (recomendacao) {
      case 'visitar':
        return <span className="badge badge-success"><FiCheckCircle /> Visitar</span>;
      case 'avaliar':
        return <span className="badge badge-warning"><FiAlertCircle /> Avaliar</span>;
      case 'nao_visitar':
        return <span className="badge badge-danger"><FiX /> Não Visitar</span>;
      default:
        return null;
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'aprovado':
        return <span className="badge badge-success"><FiCheckCircle /> Aprovado</span>;
      case 'pendente':
        return <span className="badge badge-warning"><FiClock /> Pendente</span>;
      case 'rejeitado':
        return <span className="badge badge-danger"><FiX /> Rejeitado</span>;
      default:
        return null;
    }
  };

  const calcularTotal = () => {
    const transporte = parseFloat(formData.custo_transporte) || 0;
    const hospedagem = parseFloat(formData.custo_hospedagem) || 0;
    const alimentacao = parseFloat(formData.custo_alimentacao) || 0;
    const outros = parseFloat(formData.custo_outros) || 0;
    return transporte + hospedagem + alimentacao + outros;
  };

  const aplicarSugestao = () => {
    if (rotaCalculada) {
      // RN-157.02 (C374): os mesmos campos e valores do preenchimento automatico (antes: sem a taxa de embarque, sem distancia, tempo e sugerido)
      setFormData(prev => ({ ...prev, ...valoresDaRota(rotaCalculada) }));
      setSugestaoSemAplicar(false);
      // B1004 (Fase 2 I5): aplicar uma sugestao aerea e a escolha da passagem — a proxima mudanca com a mesma distancia nao pergunta de novo
      if (rotaCalculada.requer_passagem_aerea) {
        setPassagemAereaConfirmada(true);
        setDistanciaConfirmada(rotaCalculada.distancia_km);
      }
    }
  };

  if (loading) {
    return (
      <div className="custos-viagens-loading">
        <div className="loading-spinner"></div>
        <p>Carregando custos de viagens...</p>
      </div>
    );
  }

  const COLORS = ['#0066cc', '#00c853', '#ff9800', '#e91e63', '#9c27b0'];

  return (
    <div className="custos-viagens">
      {/* Mensagens de Sucesso/Erro */}
      {mensagemSucesso && (
        <div className="mensagem-sucesso" onClick={() => setMensagemSucesso(null)}>
          <FiCheckCircle /> {mensagemSucesso}
        </div>
      )}
      {mensagemErro && (
        <div className="mensagem-erro" onClick={() => setMensagemErro(null)}>
          <FiAlertCircle /> {mensagemErro}
        </div>
      )}

      <div className="custos-viagens-header">
        <div>
          <h1>Controle de Custos de Viagens</h1>
          <p>Gerencie e analise os custos de viagens para clientes com cálculo automático de rotas</p>
        </div>
        <div className="header-actions">
          <button className="btn-premium" onClick={() => { resetForm(); setEditingCusto(null); setShowModal(true); }}>
            <div className="btn-premium-icon">
              <FiPlus size={20} />
            </div>
            <span className="btn-premium-text">Novo Custo</span>
            <div className="btn-premium-shine"></div>
          </button>
          <button className="btn-secondary" onClick={loadData}>
            <FiRefreshCw /> Atualizar
          </button>
        </div>
      </div>

      {/* Resumo */}
      {resumo && (
        <div className="resumo-cards">
          <div className="resumo-card">
            <div className="resumo-icon" style={{ background: 'linear-gradient(135deg, #0066cc 0%, #0052a3 100%)' }}>
              <FiMapPin />
            </div>
            <div className="resumo-content">
              <h3>{resumo.total_viagens || 0}</h3>
              <p>Total de Viagens</p>
            </div>
          </div>
          <div className="resumo-card">
            <div className="resumo-icon" style={{ background: 'linear-gradient(135deg, #00c853 0%, #00a844 100%)' }}>
              <FiDollarSign />
            </div>
            <div className="resumo-content">
              <h3>{formatCurrency(resumo.total_custo_geral || 0)}</h3>
              <p>Custo Total</p>
            </div>
          </div>
          <div className="resumo-card">
            <div className="resumo-icon" style={{ background: 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)' }}>
              <FiTrendingUp />
            </div>
            <div className="resumo-content">
              <h3>{formatCurrency(resumo.custo_medio_viagem || 0)}</h3>
              <p>Custo Médio por Viagem</p>
            </div>
          </div>
          <div className="resumo-card">
            <div className="resumo-icon" style={{ background: 'linear-gradient(135deg, #9c27b0 0%, #7b1fa2 100%)' }}>
              <FiCalendar />
            </div>
            <div className="resumo-content">
              <h3>{resumo.clientes_visitados || 0}</h3>
              <p>Clientes Visitados</p>
            </div>
          </div>
        </div>
      )}

      {/* Barra de Busca e Filtros - Estilo Moderno */}
      <div className="filtros-modernos">
        <div className="busca-filtros-container">
          {/* Barra de Busca Principal */}
          <div className="busca-principal">
            <FiSearch className="busca-icon" />
            <input
              type="text"
              placeholder="Buscar viagem por código, cliente ou destino..."
              value={filtros.busca_cliente}
              onChange={(e) => {
                setFiltros({ ...filtros, busca_cliente: e.target.value, cliente_id: '' });
                loadClientes();
              }}
              className="busca-input-moderno"
            />
            {filtros.busca_cliente && (
              <div className="clientes-sugestoes-moderno">
                {clientesFiltrados.length > 0 ? (
                  clientesFiltrados.slice(0, 10).map(cliente => (
                    <div
                      key={cliente.id}
                      className="sugestao-item-moderno"
                      onClick={() => {
                        setFiltros({ ...filtros, cliente_id: cliente.id, busca_cliente: cliente.razao_social });
                        setClientesFiltrados([]);
                      }}
                    >
                      <div className="sugestao-nome">{cliente.razao_social}</div>
                      <div className="sugestao-info">
                        {cliente.cidade && `${cliente.cidade} - ${cliente.estado}`}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="sugestao-item-moderno sem-resultados">Nenhum cliente encontrado</div>
                )}
              </div>
            )}
          </div>

          {/* Filtros Dropdown */}
          <div className="filtros-dropdowns">
            <div className="filtro-dropdown">
              <select
                value={filtros.status_aprovacao}
                onChange={(e) => setFiltros({ ...filtros, status_aprovacao: e.target.value })}
                className="select-moderno"
              >
                <option value="">Todos os Status</option>
                <option value="aprovado">Aprovado</option>
                <option value="pendente">Pendente</option>
                <option value="rejeitado">Rejeitado</option>
              </select>
            </div>

            <div className="filtro-dropdown">
              <select
                value={filtros.tipo_viagem}
                onChange={(e) => setFiltros({ ...filtros, tipo_viagem: e.target.value })}
                className="select-moderno"
              >
                <option value="">Todos os Tipos</option>
                <option value="ida">Ida</option>
                <option value="volta">Volta</option>
                <option value="ida_e_volta">Ida e Volta</option>
              </select>
            </div>

            <div className="filtro-dropdown">
              <select
                value={ordenacao.campo}
                onChange={(e) => handleOrdenar(e.target.value)}
                className="select-moderno"
              >
                <option value="data_viagem">Ordenar por Data</option>
                <option value="total_custo">Ordenar por Valor</option>
                <option value="distancia_km">Ordenar por Distância</option>
                <option value="codigo_visita">Ordenar por Código</option>
                <option value="created_at">Ordenar por Criação</option>
              </select>
            </div>

            <button 
              className="btn-filtros-avancados"
              onClick={() => setShowFiltrosAvancados(!showFiltrosAvancados)}
            >
              <FiFilter /> {showFiltrosAvancados ? 'Ocultar' : 'Mais'} Filtros
            </button>
          </div>
        </div>

        {/* Filtros Avançados (Colapsável) */}
        {showFiltrosAvancados && (
          <div className="filtros-avancados-modernos">
            <div className="filtros-avancados-grid">
              <div className="filtro-avancado-item">
                <label>Data Início</label>
                <input
                  type="date"
                  value={filtros.data_inicio}
                  onChange={(e) => setFiltros({ ...filtros, data_inicio: e.target.value })}
                />
              </div>

              <div className="filtro-avancado-item">
                <label>Data Fim</label>
                <input
                  type="date"
                  value={filtros.data_fim}
                  onChange={(e) => setFiltros({ ...filtros, data_fim: e.target.value })}
                />
              </div>

              <div className="filtro-avancado-item">
                <label>Distância Mínima (km)</label>
                <input
                  type="number"
                  placeholder="Ex: 100"
                  value={filtros.distancia_min}
                  onChange={(e) => setFiltros({ ...filtros, distancia_min: e.target.value })}
                />
              </div>

              <div className="filtro-avancado-item">
                <label>Distância Máxima (km)</label>
                <input
                  type="number"
                  placeholder="Ex: 500"
                  value={filtros.distancia_max}
                  onChange={(e) => setFiltros({ ...filtros, distancia_max: e.target.value })}
                />
              </div>

              <div className="filtro-avancado-item">
                <label>Valor Mínimo (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Ex: 500.00"
                  value={filtros.valor_min}
                  onChange={(e) => setFiltros({ ...filtros, valor_min: e.target.value })}
                />
              </div>

              <div className="filtro-avancado-item">
                <label>Valor Máximo (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Ex: 5000.00"
                  value={filtros.valor_max}
                  onChange={(e) => setFiltros({ ...filtros, valor_max: e.target.value })}
                />
              </div>
            </div>

            <div className="filtros-avancados-actions">
              <button 
                className="btn-limpar-filtros"
                onClick={() => setFiltros({ 
                  busca_cliente: '', 
                  cliente_id: '', 
                  data_inicio: '', 
                  data_fim: '', 
                  status_aprovacao: '',
                  tipo_viagem: '',
                  distancia_min: '',
                  distancia_max: '',
                  valor_min: '',
                  valor_max: ''
                })}
              >
                <FiX /> Limpar Filtros
              </button>
            </div>
          </div>
        )}

        {/* Contador de Resultados */}
        <div className="resultados-contador">
          <strong>{custos.length}</strong> {custos.length === 1 ? 'viagem encontrada' : 'viagens encontradas'}
        </div>
      </div>

      {/* Análise por Cliente */}
      {analise.length > 0 && (
        <div className="analise-section">
          <h2>Análise de Custos por Cliente</h2>
          <div className="analise-table-container">
            <table className="analise-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Total Viagens</th>
                  <th>Custo Total</th>
                  <th>Vendas Aprovadas</th>
                  <th>Valor Vendas</th>
                  <th>Custo por Venda</th>
                  <th>% Custo/Venda</th>
                  <th>Recomendação</th>
                </tr>
              </thead>
              <tbody>
                {analise.map((item) => (
                  <tr key={item.cliente_id}>
                    <td>{item.razao_social}</td>
                    <td>{item.total_viagens}</td>
                    <td>{formatCurrency(item.total_custo)}</td>
                    <td>{item.propostas_aprovadas || 0}</td>
                    <td>{formatCurrency(item.valor_vendas_aprovadas)}</td>
                    <td>{item.custo_por_venda ? formatCurrency(item.custo_por_venda) : '-'}</td>
                    <td>{item.percentual_custo_venda ? `${item.percentual_custo_venda.toFixed(2)}%` : '-'}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        {getRecomendacaoBadge(item.recomendacao)}
                        <small className="motivo-text">{item.motivo}</small>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Lista de Custos - Tabela Moderna */}
      <div className="custos-section-moderna">
        <div className="custos-table-container-moderna">
          <table className="custos-table-moderna">
            <thead>
              <tr>
                <th 
                  className="th-clicavel"
                  onClick={() => handleOrdenar('codigo_visita')}
                >
                  CÓDIGO
                  {ordenacao.campo === 'codigo_visita' && (
                    <span className="ordenacao-indicador">
                      {ordenacao.ordem === 'ASC' ? '↑' : '↓'}
                    </span>
                  )}
                </th>
                <th 
                  className="th-clicavel"
                  onClick={() => handleOrdenar('data_viagem')}
                >
                  DATA
                  {ordenacao.campo === 'data_viagem' && (
                    <span className="ordenacao-indicador">
                      {ordenacao.ordem === 'ASC' ? '↑' : '↓'}
                    </span>
                  )}
                </th>
                <th>CLIENTE</th>
                <th>LOCALIZAÇÃO</th>
                <th 
                  className="th-clicavel"
                  onClick={() => handleOrdenar('distancia_km')}
                >
                  DISTÂNCIA
                  {ordenacao.campo === 'distancia_km' && (
                    <span className="ordenacao-indicador">
                      {ordenacao.ordem === 'ASC' ? '↑' : '↓'}
                    </span>
                  )}
                </th>
                <th>TEMPO</th>
                <th 
                  className="th-clicavel"
                  onClick={() => handleOrdenar('total_custo')}
                >
                  VALOR TOTAL
                  {ordenacao.campo === 'total_custo' && (
                    <span className="ordenacao-indicador">
                      {ordenacao.ordem === 'ASC' ? '↑' : '↓'}
                    </span>
                  )}
                </th>
                <th>STATUS</th>
                <th>AÇÕES</th>
              </tr>
            </thead>
            <tbody>
              {custos.length === 0 ? (
                <tr>
                  <td colSpan="9" className="no-data">Nenhum custo de viagem registrado</td>
                </tr>
              ) : (
                custos.map((custo) => (
                  <tr key={custo.id}>
                    <td>
                      <span style={{ 
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        color: '#0066cc',
                        fontSize: '0.9rem',
                        background: 'linear-gradient(135deg, rgba(0, 102, 204, 0.1) 0%, rgba(0, 102, 204, 0.05) 100%)',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '6px',
                        display: 'inline-block'
                      }}>
                        {custo.codigo_visita || '-'}
                      </span>
                    </td>
                    <td>{new Date(custo.data_viagem).toLocaleDateString('pt-BR')}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        {custo.cliente_nome && (
                          <span style={{ fontWeight: 600 }}>{custo.cliente_nome}</span>
                        )}
                        {custo.clientes_viagem && custo.clientes_viagem.length > 0 && (
                          <div style={{ marginTop: '0.25rem' }}>
                            {custo.clientes_viagem.map((cliente, idx) => (
                              <div key={cliente.id} style={{ 
                                fontSize: '0.8rem', 
                                color: '#64748b',
                                padding: '0.125rem 0',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                              }}>
                                <span style={{ 
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: '18px',
                                  height: '18px',
                                  borderRadius: '50%',
                                  background: 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)',
                                  color: 'white',
                                  fontSize: '0.7rem',
                                  fontWeight: 700
                                }}>
                                  {cliente.ordem}
                                </span>
                                {cliente.razao_social}
                                {cliente.distancia_km && (
                                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                    ({cliente.distancia_km} km)
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {(!custo.cliente_nome && (!custo.clientes_viagem || custo.clientes_viagem.length === 0)) && (
                          <span style={{ color: '#94a3b8' }}>-</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="localizacao-info">
                        {custo.destino_cidade && custo.destino_estado ? (
                          <>
                            <strong>{custo.destino_cidade.toUpperCase()}</strong>
                            <span className="estado-badge">{custo.destino_estado}</span>
                          </>
                        ) : (
                          <span className="sem-info">-</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="distancia-info">
                        {custo.distancia_km > 0 ? (
                          <>
                            <strong>{custo.distancia_km} km</strong>
                            {custo.distancia_km > 600 && (
                              <span className="badge-aereo">Aéreo</span>
                            )}
                          </>
                        ) : (
                          <span className="sem-info">-</span>
                        )}
                      </div>
                    </td>
                    <td>
                      {custo.tempo_estimado_horas > 0 ? (
                        <span className="tempo-info">{custo.tempo_estimado_horas.toFixed(1)}h</span>
                      ) : (
                        <span className="sem-info">-</span>
                      )}
                    </td>
                    <td>
                      <div className="valor-info">
                        <strong className="valor-total">{formatCurrency(custo.total_custo)}</strong>
                        {custo.custo_sugerido > 0 && custo.total_custo !== custo.custo_sugerido && (
                          <small className="valor-sugerido">
                            Sugerido: {formatCurrency(custo.custo_sugerido)}
                          </small>
                        )}
                      </div>
                    </td>
                    <td>{getStatusBadge(custo.status_aprovacao)}</td>
                    <td>
                      <div className="action-buttons-modernos">
                        {custo.status_aprovacao === 'pendente' && (
                          <>
                            <button 
                              className="btn-action btn-success" 
                              onClick={() => handleAprovar(custo.id, true)} 
                              title="Aprovar"
                            >
                              <FiCheckCircle />
                            </button>
                            <button 
                              className="btn-action btn-danger" 
                              onClick={() => {
                                const motivo = prompt('Motivo da rejeição:');
                                if (motivo) handleAprovar(custo.id, false, motivo);
                              }} 
                              title="Rejeitar"
                            >
                              <FiX />
                            </button>
                          </>
                        )}
                        <button 
                          className="btn-action" 
                          onClick={() => handleEdit(custo)} 
                          title="Editar"
                        >
                          <FiEdit />
                        </button>
                        <button 
                          className="btn-action btn-info" 
                          onClick={() => {
                            setViagemSelecionada(custo);
                            buscarComprovantes(custo.id);
                            setMostrarModalComprovantes(true);
                          }} 
                          title="Comprovantes"
                        >
                          <FiDownload />
                        </button>
                        <button 
                          className="btn-action btn-secondary" 
                          onClick={() => {
                            setViagemSelecionada(custo);
                            buscarHistorico(custo.id);
                            setMostrarModalHistorico(true);
                          }} 
                          title="Histórico"
                        >
                          <FiInfo />
                        </button>
                        <button 
                          className="btn-action btn-duplicar" 
                          onClick={() => handleDuplicar(custo)} 
                          title="Duplicar"
                        >
                          <FiPlus />
                        </button>
                        <button 
                          className="btn-action btn-danger" 
                          onClick={() => handleDelete(custo.id)} 
                          title="Excluir"
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Formulário */}
      {showModal && (
        <div className="modal-overlay" onClick={() => { setShowModal(false); setEditingCusto(null); resetForm(); }}>
          <div className="modal-content premium-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingCusto ? 'Editar' : 'Novo'} Custo de Viagem</h2>
              <button className="modal-close" onClick={() => { setShowModal(false); setEditingCusto(null); resetForm(); }}>
                <FiX />
              </button>
            </div>
            <div className="modal-body">
            <form onSubmit={handleSubmit} className="custo-form">
              {/* Informações da Rota */}
              <div className="form-section">
                <h3 className="section-title">
                  <FiNavigation /> Informações da Rota
                </h3>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Cliente *</label>
                    <select
                      value={formData.cliente_id}
                      onChange={(e) => handleClienteChange(e.target.value)}
                      required
                    >
                      <option value="">Selecione um cliente</option>
                      {clientes.map(cliente => (
                        <option key={cliente.id} value={cliente.id}>
                          {cliente.razao_social} - {cliente.cidade}/{cliente.estado}
                        </option>
                      ))}
                    </select>
                    {clientesSelecionados.length > 1 && (
                      <div className="clientes-selecionados-lista" style={{ marginTop: '0.5rem', padding: '0.75rem', background: '#f1f5f9', borderRadius: '8px' }}>
                        <small style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#475569' }}>
                          Clientes incluídos na viagem ({clientesSelecionados.length}):
                        </small>
                        {clientesSelecionados.map(cliente => (
                          <div key={cliente.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', background: 'white', borderRadius: '6px', marginBottom: '0.25rem' }}>
                            <span style={{ fontSize: '0.875rem' }}>
                              {cliente.razao_social} - {cliente.cidade}/{cliente.estado}
                              {cliente.distancia_km && ` (${cliente.distancia_km}km)`}
                            </span>
                            {clientesSelecionados.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removerClienteSelecionado(cliente.id)}
                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.25rem' }}
                                title="Remover cliente"
                              >
                                <FiX size={16} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <label>Data da Viagem (Ida) *</label>
                    <input
                      type="date"
                      value={formData.data_viagem}
                      onChange={(e) => setFormData({ ...formData, data_viagem: e.target.value })}
                      required
                    />
                  </div>

                  {formData.tipo_viagem === 'ida_e_volta' && (
                    <div className="form-group">
                      <label>Data da Volta *</label>
                      <input
                        type="date"
                        value={formData.data_volta}
                        onChange={(e) => setFormData({ ...formData, data_volta: e.target.value })}
                        min={formData.data_viagem}
                        required={formData.tipo_viagem === 'ida_e_volta'}
                      />
                      <small style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '0.25rem', display: 'block' }}>
                        {formData.data_viagem && formData.data_volta && (() => {
                          const dataIda = new Date(formData.data_viagem);
                          const dataVolta = new Date(formData.data_volta);
                          const diffTime = Math.abs(dataVolta - dataIda);
                          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                          const noites = diffDays > 0 ? diffDays : 0;
                          return noites > 0 ? `${noites} ${noites === 1 ? 'noite' : 'noites'} de hospedagem` : 'Data de volta deve ser após a data de ida';
                        })()}
                      </small>
                    </div>
                  )}

                  <div className="form-group">
                    <label>Origem</label>
                    <input
                      type="text"
                      value={formData.origem}
                      onChange={(e) => setFormData({ ...formData, origem: e.target.value })}
                      placeholder="Cidade de origem"
                    />
                  </div>

                  <div className="form-group">
                    <label>Destino - Cidade *</label>
                    <input
                      type="text"
                      value={formData.destino_cidade}
                      onChange={(e) => setFormData({ ...formData, destino_cidade: e.target.value })}
                      placeholder="Cidade de destino"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Destino - Estado *</label>
                    <select
                      value={formData.destino_estado}
                      onChange={(e) => setFormData({ ...formData, destino_estado: e.target.value })}
                      required
                    >
                      <option value="">Selecione</option>
                      <option value="AC">AC</option>
                      <option value="AL">AL</option>
                      <option value="AP">AP</option>
                      <option value="AM">AM</option>
                      <option value="BA">BA</option>
                      <option value="CE">CE</option>
                      <option value="DF">DF</option>
                      <option value="ES">ES</option>
                      <option value="GO">GO</option>
                      <option value="MA">MA</option>
                      <option value="MT">MT</option>
                      <option value="MS">MS</option>
                      <option value="MG">MG</option>
                      <option value="PA">PA</option>
                      <option value="PB">PB</option>
                      <option value="PR">PR</option>
                      <option value="PE">PE</option>
                      <option value="PI">PI</option>
                      <option value="RJ">RJ</option>
                      <option value="RN">RN</option>
                      <option value="RS">RS</option>
                      <option value="RO">RO</option>
                      <option value="RR">RR</option>
                      <option value="SC">SC</option>
                      <option value="SP">SP</option>
                      <option value="SE">SE</option>
                      <option value="TO">TO</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Tipo de Viagem</label>
                    <select
                      value={formData.tipo_viagem}
                      onChange={(e) => setFormData({ ...formData, tipo_viagem: e.target.value })}
                    >
                      <option value="ida">Ida</option>
                      <option value="volta">Volta</option>
                      <option value="ida_e_volta">Ida e Volta</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Número de Pessoas</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={formData.numero_pessoas || 1}
                      onChange={(e) => setFormData({ ...formData, numero_pessoas: parseInt(e.target.value) || 1 })}
                      placeholder="1"
                    />
                    <small style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '0.25rem', display: 'block' }}>
                      Número de pessoas que participarão da viagem
                    </small>
                  </div>
                </div>

                {/* Informações Calculadas da Rota */}
                {calculandoRota && (
                  <div className="calculando-rota">
                    <FiRefreshCw className="spinning" /> Calculando rota...
                  </div>
                )}

                {rotaCalculada && !calculandoRota && (
                  <div className="rota-calculada">
                    <div className="rota-info-card">
                      <div className="info-item">
                        <FiNavigation />
                        <div>
                          <strong>{rotaCalculada.distancia_km} km</strong>
                          <small>Distância</small>
                        </div>
                      </div>
                      <div className="info-item">
                        <FiClock />
                        <div>
                          <strong>{rotaCalculada.tempo_estimado_horas.toFixed(1)}h</strong>
                          <small>Tempo Estimado</small>
                        </div>
                      </div>
                      <div className="info-item">
                        <FiDollarSign />
                        <div>
                          <strong>{formatCurrency(rotaCalculada.custo_sugerido)}</strong>
                          <small>Custo Sugerido</small>
                        </div>
                      </div>
                    </div>
                    <button type="button" className="btn-sugestao" onClick={aplicarSugestao}>
                      <FiCheckCircle /> Aplicar Valores Sugeridos
                    </button>
                    {sugestaoSemAplicar && (
                      <div className="aviso-sugestao-gravados" role="status">
                        <FiInfo /> Sugestão recalculada agora — os valores gravados foram mantidos. Clique em Aplicar Valores Sugeridos para usá-la.
                      </div>
                    )}
                    {rotaCalculada.requer_passagem_aerea && (
                      <div className="alerta-passagem-aerea">
                        <FiAlertCircle />
                        <span>Esta viagem requer passagem aérea devido à distância superior a 600km</span>
                      </div>
                    )}
                    <div className="detalhes-sugestao">
                      <small>
                        <strong>Detalhes ({rotaCalculada.detalhes.numero_pessoas || 1} {rotaCalculada.detalhes.numero_pessoas === 1 ? 'pessoa' : 'pessoas'}):</strong> {
                          rotaCalculada.requer_passagem_aerea ? (
                            <>
                              Passagem Aérea: {formatCurrency(rotaCalculada.detalhes.custo_passagem_aerea || 0)} | 
                              Taxa Embarque: {formatCurrency(rotaCalculada.detalhes.custo_taxa_embarque || 0)} | 
                              Alimentação: {formatCurrency(rotaCalculada.detalhes.custo_alimentacao || 0)} | 
                              Hospedagem: {formatCurrency(rotaCalculada.detalhes.custo_hospedagem || 0)}
                            </>
                          ) : (
                            <>
                              Combustível: {formatCurrency(rotaCalculada.detalhes.custo_combustivel || 0)} | 
                              Pedágio: {formatCurrency(rotaCalculada.detalhes.custo_pedagio || 0)} | 
                              Alimentação: {formatCurrency(rotaCalculada.detalhes.custo_alimentacao || 0)} | 
                              Hospedagem: {formatCurrency(rotaCalculada.detalhes.custo_hospedagem || 0)}
                              {rotaCalculada.detalhes.custo_estacionamento > 0 && (
                                <> | Estacionamento: {formatCurrency(rotaCalculada.detalhes.custo_estacionamento || 0)}</>
                              )}
                            </>
                          )
                        }
                      </small>
                    </div>
                  </div>
                )}
              </div>

              {/* Custos */}
              <div className="form-section">
                <h3 className="section-title">
                  <FiDollarSign /> Custos
                </h3>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Custo Transporte (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.custo_transporte}
                      onChange={(e) => setFormData({ ...formData, custo_transporte: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="form-group">
                    <label>Custo Hospedagem (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.custo_hospedagem}
                      onChange={(e) => setFormData({ ...formData, custo_hospedagem: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="form-group">
                    <label>Custo Alimentação (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.custo_alimentacao}
                      onChange={(e) => setFormData({ ...formData, custo_alimentacao: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="form-group">
                    <label>Custo Outros (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.custo_outros}
                      onChange={(e) => setFormData({ ...formData, custo_outros: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="form-group full-width">
                    <label>Total Calculado</label>
                    <div className="total-display premium">
                      <strong>{formatCurrency(calcularTotal())}</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Aprovação */}
              <div className="form-section">
                <h3 className="section-title">
                  <FiShield /> Aprovação
                </h3>
                <div className="form-grid">
                  <div className="form-group full-width">
                    <label>Proposta para Aprovação</label>
                    <select
                      value={formData.proposta_aprovacao_id}
                      onChange={(e) => setFormData({ ...formData, proposta_aprovacao_id: e.target.value })}
                    >
                      <option value="">Nenhuma</option>
                      {propostas
                        .filter(p => !formData.cliente_id || p.cliente_id === parseInt(formData.cliente_id))
                        .map(proposta => (
                          <option key={proposta.id} value={proposta.id}>
                            {proposta.numero_proposta} - {proposta.titulo} - {formatCurrency(proposta.valor_total)}
                          </option>
                        ))}
                    </select>
                    <small className="help-text">
                      <FiInfo /> Selecione uma proposta para aprovação automática do custo de viagem.
                    </small>
                  </div>

                  <div className="form-group">
                    <label>Proposta Relacionada</label>
                    <select
                      value={formData.proposta_id}
                      onChange={(e) => setFormData({ ...formData, proposta_id: e.target.value })}
                    >
                      <option value="">Nenhuma</option>
                      {propostas
                        .filter(p => !formData.cliente_id || p.cliente_id === parseInt(formData.cliente_id))
                        .map(proposta => (
                          <option key={proposta.id} value={proposta.id}>
                            {proposta.numero_proposta} - {proposta.titulo}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Atividade Relacionada</label>
                    <select
                      value={formData.atividade_id}
                      onChange={(e) => setFormData({ ...formData, atividade_id: e.target.value })}
                    >
                      <option value="">Nenhuma</option>
                      {atividades
                        .filter(a => !formData.cliente_id || a.cliente_id === parseInt(formData.cliente_id))
                        .map(atividade => (
                          <option key={atividade.id} value={atividade.id}>
                            {atividade.titulo}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Descrição */}
              <div className="form-section">
                <div className="form-group full-width">
                  <label>Descrição / Observações</label>
                  <textarea
                    value={formData.descricao}
                    onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                    rows="3"
                    placeholder="Observações sobre a viagem..."
                  />
                </div>
              </div>

              {/* Regras de Elegibilidade */}
              {formData.cliente_id && !editingCusto && (
                <div className="form-section elegibilidade-section">
                  <h3 className="section-title">
                    <FiShield /> Regras de Elegibilidade
                  </h3>
                  {verificandoElegibilidade ? (
                    <div className="verificando-elegibilidade">
                      <FiRefreshCw className="spinning" /> Verificando elegibilidade...
                    </div>
                  ) : elegibilidade ? (
                    <div className="regras-container" key={`elegibilidade-${formData.cliente_id || 'none'}`}>
                      {Object.entries(elegibilidade.regras).map(([key, regra], index) => (
                        <div 
                          key={`${formData.cliente_id || 'none'}-${key}-${index}`}
                          className={`regra-card ${regra.atendida ? 'atendida' : 'nao-atendida'} ${regra.tipo}`}
                        >
                          <div className="regra-header">
                            <div className="regra-icon">
                              {regra.atendida ? <FiCheckCircle /> : <FiX />}
                            </div>
                            <div className="regra-info">
                              <h4>{regra.nome}</h4>
                              <p>{regra.descricao}</p>
                              {regra.valor !== undefined && (
                                <small>Valor atual: {regra.tipo === 'recomendada' && regra.nome.includes('Taxa') 
                                  ? `${regra.valor}%` 
                                  : formatCurrency(regra.valor)}</small>
                              )}
                              {regra.dias !== undefined && regra.dias !== null && (
                                <small>Última proposta há {regra.dias} dias</small>
                              )}
                            </div>
                            <div className={`regra-badge ${regra.tipo}`}>
                              {regra.tipo === 'obrigatoria' ? 'OBRIGATÓRIA' : 'RECOMENDADA'}
                            </div>
                          </div>
                        </div>
                      ))}
                      <div className="elegibilidade-resumo">
                        {elegibilidade.todas_obrigatorias_atendidas ? (
                          <div className="resumo-success">
                            <FiCheckCircle /> Todas as regras obrigatórias foram atendidas
                          </div>
                        ) : (
                          <div className="resumo-warning">
                            <FiAlertCircle /> Algumas regras obrigatórias não foram atendidas
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Logs de Autorização - Mostrar apenas quando editar */}
              {editingCusto && logsAutorizacao.length > 0 && (
                <div className="form-section">
                  <h3 className="section-title">
                    <FiShield /> Histórico de Autorizações
                  </h3>
                  <div className="logs-autorizacao-container">
                    {logsAutorizacao.map((log, index) => (
                      <div key={log.id || index} className="log-autorizacao-item">
                        <div className="log-header">
                          <div className="log-info">
                            <strong>
                              <FiShield /> Autorização #{logsAutorizacao.length - index}
                            </strong>
                            <span className="log-date">
                              {new Date(log.created_at).toLocaleString('pt-BR', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                          <div className="log-autor">
                            Autorizado por: <strong>{log.autorizado_por_nome || 'N/A'}</strong>
                          </div>
                        </div>
                        {log.motivo_autorizacao && (
                          <div className="log-motivo">
                            <strong>Motivo:</strong>
                            <p>{log.motivo_autorizacao}</p>
                          </div>
                        )}
                        {log.regras_nao_atendidas && log.regras_nao_atendidas.length > 0 && (
                          <div className="log-regras">
                            <strong>Regras não atendidas:</strong>
                            <ul>
                              {log.regras_nao_atendidas.map((regra, idx) => (
                                <li key={idx}>
                                  {typeof regra === 'string' ? regra : `${regra[0]}: ${regra[1]}`}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={() => { 
                  setShowModal(false); 
                  setMostrarModalAutorizacao(false);
                  setEditingCusto(null); 
                  setElegibilidade(null);
                  setMotivoAutorizacao('');
                  setLogsAutorizacao([]);
                  resetForm(); 
                }}>
                  Cancelar
                </button>
                {!editingCusto && elegibilidade && !elegibilidade.todas_obrigatorias_atendidas ? (
                  <button type="button" className="btn-primary btn-registrar" onClick={() => setMostrarModalAutorizacao(true)}>
                    <FiShield /> Registrar Viagem
                  </button>
                ) : (
                  <button type="submit" className="btn-primary">
                    {editingCusto ? 'Atualizar' : 'Salvar'}
                  </button>
                )}
              </div>
            </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Autorização */}
      {mostrarModalAutorizacao && (
        <div className="modal-overlay" onClick={() => { setMostrarModalAutorizacao(false); setMotivoAutorizacao(''); }}>
          <div className="modal-content modal-autorizacao" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2><FiAlertCircle /> Autorização de Viagem</h2>
              <button className="modal-close" onClick={() => { setMostrarModalAutorizacao(false); setMotivoAutorizacao(''); }}>
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <div className="alerta-autorizacao">
                <FiAlertCircle />
                <p>
                  <strong>Atenção!</strong> Esta viagem não atende todas as regras obrigatórias de elegibilidade.
                  Você está autorizando uma viagem que não segue os parâmetros estabelecidos.
                </p>
              </div>
              
              {elegibilidade && (
                <div className="regras-nao-atendidas">
                  <h4>Regras não atendidas:</h4>
                  <ul>
                    {Object.entries(elegibilidade.regras)
                      .filter(([_, regra]) => !regra.atendida && regra.tipo === 'obrigatoria')
                      .map(([key, regra]) => (
                        <li key={key}>
                          <strong>{regra.nome}</strong> - {regra.descricao}
                        </li>
                      ))}
                  </ul>
                </div>
              )}

              <div className="form-group full-width">
                <label>Motivo da Autorização *</label>
                <textarea
                  value={motivoAutorizacao}
                  onChange={(e) => setMotivoAutorizacao(e.target.value)}
                  placeholder="Descreva o motivo para autorizar esta viagem sem seguir os parâmetros estabelecidos..."
                  rows="4"
                  required
                />
                <small>Este motivo será registrado no log de autorizações para auditoria.</small>
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={() => { setMostrarModalAutorizacao(false); setMotivoAutorizacao(''); }}>
                Cancelar
              </button>
              <button 
                type="button" 
                className="btn-primary" 
                onClick={salvarCusto}
                disabled={!motivoAutorizacao.trim()}
              >
                <FiShield /> Confirmar e Registrar Viagem
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Clientes Próximos */}
      {mostrarModalClientesProximos && clientesProximos.length > 0 && (
        <div className="modal-overlay" onClick={fecharModalClientesProximos}>
          <div className="modal-content modal-clientes-proximos" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px' }}>
            <div className="modal-header">
              <h2><FiMapPin /> Clientes Próximos Encontrados</h2>
              <button className="modal-close" onClick={fecharModalClientesProximos}>
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)', borderRadius: '12px', color: 'white', boxShadow: '0 4px 12px rgba(255, 152, 0, 0.3)' }}>
                <FiInfo size={20} style={{ marginBottom: '0.5rem' }} />
                <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: '1.6' }}>
                  <strong>Otimize sua viagem!</strong> Encontramos {clientesProximos.length} cliente(s) próximo(s) ao cliente selecionado. 
                  Adicione-os à mesma viagem para aproveitar melhor o deslocamento e reduzir custos.
                </p>
              </div>
              
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {clientesProximos.map(cliente => {
                  const jaAdicionado = clientesSelecionados.find(c => c.id === cliente.id);
                  return (
                    <div 
                      key={cliente.id} 
                      style={{ 
                        padding: '1rem', 
                        marginBottom: '0.75rem', 
                        background: jaAdicionado ? '#d1fae5' : 'white',
                        border: `2px solid ${jaAdicionado ? '#10b981' : '#e2e8f0'}`,
                        borderRadius: '10px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transition: 'all 0.3s ease'
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '1rem', color: '#1e293b', marginBottom: '0.25rem' }}>
                          {cliente.razao_social}
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
                          {cliente.cidade} - {cliente.estado}
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#ff9800', marginTop: '0.25rem', fontWeight: 500 }}>
                          📍 {cliente.distancia_km} km de distância
                        </div>
                      </div>
                      <div>
                        {jaAdicionado ? (
                          <span style={{ 
                            padding: '0.5rem 1rem', 
                            background: '#10b981', 
                            color: 'white', 
                            borderRadius: '8px',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}>
                            <FiCheckCircle /> Adicionado
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => adicionarClienteProximo(cliente)}
                            style={{
                              padding: '0.5rem 1rem',
                              background: 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              fontSize: '0.875rem',
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              transition: 'transform 0.2s ease',
                              boxShadow: '0 2px 8px rgba(255, 152, 0, 0.3)'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                            onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                          >
                            <FiPlus /> Adicionar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="form-actions" style={{ padding: '1rem', borderTop: '1px solid #e2e8f0' }}>
              <button 
                type="button" 
                className="btn-primary" 
                onClick={fecharModalClientesProximos}
                style={{ 
                  width: '100%',
                  background: 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)',
                  boxShadow: '0 4px 12px rgba(255, 152, 0, 0.3)',
                  border: 'none'
                }}
              >
                Continuar com {clientesSelecionados.length} cliente(s)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Passagem Aérea */}
      {mostrarModalPassagemAerea && rotaPendente && (
        <div className="modal-overlay" onClick={cancelarPassagemAerea}>
          <div className="modal-content modal-passagem-aerea" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2><FiAlertCircle /> Confirmação de Passagem Aérea</h2>
              <button className="modal-close" onClick={cancelarPassagemAerea}>
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <div className="alerta-passagem-aerea-modal">
                <FiAlertCircle />
                <div>
                  <h3>Atenção: Distância Superior a 600km</h3>
                  <p>
                    A distância calculada é de <strong>{rotaPendente.distancia_km} km</strong>, 
                    o que excede o limite recomendado para viagem terrestre.
                  </p>
                  <p>
                    Por conta da distância, o sistema recomenda o uso de <strong>passagem aérea</strong> 
                    para esta viagem.
                  </p>
                </div>
              </div>
              
              <div className="detalhes-passagem-aerea">
                <h4>Detalhes da Viagem Aérea:</h4>
                <div className="info-grid">
                  <div className="info-item-modal">
                    <FiNavigation />
                    <div>
                      <strong>{rotaPendente.distancia_km} km</strong>
                      <small>Distância Total</small>
                    </div>
                  </div>
                  <div className="info-item-modal">
                    <FiClock />
                    <div>
                      <strong>{rotaPendente.tempo_estimado_horas.toFixed(1)}h</strong>
                      <small>Tempo Estimado de Voo</small>
                    </div>
                  </div>
                  <div className="info-item-modal">
                    <FiDollarSign />
                    <div>
                      <strong>{formatCurrency(rotaPendente.custo_sugerido)}</strong>
                      <small>Custo Total Estimado</small>
                    </div>
                  </div>
                </div>
                
                <div className="detalhes-custos">
                  <h5>Detalhamento de Custos:</h5>
                  <ul>
                    <li>Passagem Aérea: {formatCurrency(rotaPendente.detalhes.custo_passagem_aerea || 0)}</li>
                    <li>Taxa de Embarque: {formatCurrency(rotaPendente.detalhes.custo_taxa_embarque || 0)}</li>
                    <li>Alimentação: {formatCurrency(rotaPendente.detalhes.custo_alimentacao || 0)}</li>
                    <li>Hospedagem: {formatCurrency(rotaPendente.detalhes.custo_hospedagem || 0)}</li>
                  </ul>
                </div>
              </div>

              <div className="modal-actions">
                <button 
                  type="button" 
                  className="btn-secondary" 
                  onClick={cancelarPassagemAerea}
                >
                  <FiX /> Cancelar
                </button>
                <button 
                  type="button" 
                  className="btn-primary" 
                  onClick={confirmarPassagemAerea}
                >
                  <FiCheckCircle /> Aceitar e Continuar com Passagem Aérea
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Preview da Rota */}
      {mostrarPreviewRota && dadosPreviewRota && (
        <PreviewRota
          origem={dadosPreviewRota.origem}
          clientes={dadosPreviewRota.clientes}
          onClose={() => {
            setMostrarPreviewRota(false);
            setDadosPreviewRota(null);
            resetForm();
          }}
        />
      )}

      {/* Modal de Comprovantes */}
      {mostrarModalComprovantes && viagemSelecionada && (
        <div className="modal-overlay" onClick={() => { setMostrarModalComprovantes(false); setViagemSelecionada(null); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px' }}>
            <div className="modal-header">
              <h2><FiDownload /> Comprovantes - {viagemSelecionada.codigo_visita || viagemSelecionada.id}</h2>
              <button className="modal-close" onClick={() => { setMostrarModalComprovantes(false); setViagemSelecionada(null); }}>
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              <div className="upload-comprovante-section">
                <label className="btn-upload-comprovante">
                  <input
                    type="file"
                    onChange={(e) => handleUploadComprovante(e, viagemSelecionada.id)}
                    disabled={uploadingComprovante}
                    style={{ display: 'none' }}
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  />
                  {uploadingComprovante ? (
                    <>
                      <FiRefreshCw className="spinning" /> Enviando...
                    </>
                  ) : (
                    <>
                      <FiPlus /> Anexar Comprovante
                    </>
                  )}
                </label>
              </div>

              <div className="comprovantes-list">
                {comprovantes.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>
                    Nenhum comprovante anexado
                  </p>
                ) : (
                  comprovantes.map((comprovante) => (
                    <div key={comprovante.id} className="comprovante-item">
                      <div className="comprovante-info">
                        <strong>{comprovante.nome_original}</strong>
                        <small>
                          {comprovante.tipo_comprovante} • {(comprovante.tamanho / 1024).toFixed(2)} KB
                        </small>
                        <small>
                          Enviado por {comprovante.uploaded_by_nome} em {new Date(comprovante.created_at).toLocaleString('pt-BR')}
                        </small>
                      </div>
                      <div className="comprovante-actions">
                        <button
                          className="btn-action btn-info"
                          onClick={() => handleDownloadComprovante(viagemSelecionada.id, comprovante.id, comprovante.nome_original)}
                          title="Download"
                        >
                          <FiDownload />
                        </button>
                        <button
                          className="btn-action btn-danger"
                          onClick={() => handleDeleteComprovante(viagemSelecionada.id, comprovante.id)}
                          title="Excluir"
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Histórico */}
      {mostrarModalHistorico && viagemSelecionada && (
        <div className="modal-overlay" onClick={() => { setMostrarModalHistorico(false); setViagemSelecionada(null); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px' }}>
            <div className="modal-header">
              <h2><FiInfo /> Histórico de Alterações - {viagemSelecionada.codigo_visita || viagemSelecionada.id}</h2>
              <button className="modal-close" onClick={() => { setMostrarModalHistorico(false); setViagemSelecionada(null); }}>
                <FiX />
              </button>
            </div>
            <div className="modal-body">
              {historico.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>
                  Nenhuma alteração registrada
                </p>
              ) : (
                <div className="historico-list">
                  {historico.map((item) => (
                    <div key={item.id} className="historico-item">
                      <div className="historico-header">
                        <div>
                          <strong>Alteração #{historico.length - historico.indexOf(item)}</strong>
                          <small>
                            {new Date(item.created_at).toLocaleString('pt-BR')}
                          </small>
                        </div>
                        <div>
                          Alterado por: <strong>{item.alterado_por_nome || 'N/A'}</strong>
                        </div>
                      </div>
                      {item.mudancas && item.mudancas.length > 0 && (
                        <div className="historico-mudancas">
                          <strong>Campos alterados:</strong>
                          <ul>
                            {item.mudancas.map((mudanca, idx) => (
                              <li key={idx}>
                                <strong>{mudanca.campo}:</strong> {String(mudanca.valor_anterior || '-')} → {String(mudanca.valor_novo || '-')}
                              </li>
                            ))}
                          </ul>
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
    </div>
  );
};

export default CustosViagens;
