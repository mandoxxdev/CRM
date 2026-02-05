import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';
import { FiMapPin, FiPackage, FiGlobe, FiAward } from 'react-icons/fi';
import MapaMaquinasVendidas from './MapaMaquinasVendidas';
import './MaquinasVendidas.css';
import './MaquinasVendidas_mural_fix.css';

const MaquinasVendidas = () => {
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState(null);
  const [error, setError] = useState(null);
  const [animatedValues, setAnimatedValues] = useState({
    maquinas: 0,
    localizacoes: 0,
    confianca: 0
  });
  const hasAnimated = useRef(false);
  
  // Estados para mural de logos
  const [logos, setLogos] = useState([]);
  const [loadingLogos, setLoadingLogos] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const observerRef = useRef(null);

  const loadLogos = async () => {
    setLoadingLogos(true);
    try {
      const response = await api.get('/clientes/logos', {
        params: { page: 1, limit: 100 }
      });
      setLogos(response.data.logos || []);
      setHasMore(response.data.pagination.page < response.data.pagination.totalPages);
    } catch (err) {
      console.error('Erro ao carregar logos:', err);
    } finally {
      setLoadingLogos(false);
    }
  };
  
  const loadMoreLogos = async () => {
    try {
      const response = await api.get('/clientes/logos', {
        params: { page, limit: 100 }
      });
      setLogos(prev => [...prev, ...(response.data.logos || [])]);
      setHasMore(response.data.pagination.page < response.data.pagination.totalPages);
    } catch (err) {
      console.error('Erro ao carregar mais logos:', err);
    }
  };
  
  useEffect(() => {
    loadMaquinasVendidas();
    loadLogos();
  }, []);
  
  // Carregar mais logos quando a página mudar
  useEffect(() => {
    if (page > 1) {
      loadMoreLogos();
    }
  }, [page]);

  const loadMaquinasVendidas = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/mapa/maquinas-vendidas');
      setDados(response.data);
      
      // Animar valores após carregar dados
      if (!hasAnimated.current) {
        animateValues(response.data);
        hasAnimated.current = true;
      }
    } catch (err) {
      console.error('Erro ao carregar máquinas vendidas:', err);
      setError('Erro ao carregar dados das máquinas vendidas');
    } finally {
      setLoading(false);
    }
  };

  const animateValues = (data) => {
    const duration = 2000; // 2 segundos
    const steps = 60;
    const stepDuration = duration / steps;
    
    const targetMaquinas = data?.total_maquinas || 0;
    const targetLocalizacoes = data?.total || 0;
    const targetConfianca = data?.total || 0;
    
    let currentStep = 0;
    
    const interval = setInterval(() => {
      currentStep++;
      const progress = currentStep / steps;
      const easeOut = 1 - Math.pow(1 - progress, 3); // Easing cubic
      
      setAnimatedValues({
        maquinas: Math.floor(targetMaquinas * easeOut),
        localizacoes: Math.floor(targetLocalizacoes * easeOut),
        confianca: Math.floor(targetConfianca * easeOut)
      });
      
      if (currentStep >= steps) {
        clearInterval(interval);
        setAnimatedValues({
          maquinas: targetMaquinas,
          localizacoes: targetLocalizacoes,
          confianca: targetConfianca
        });
      }
    }, stepDuration);
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };
  
  // Observer para lazy loading infinito
  const lastLogoElementRef = useCallback(node => {
    if (loadingLogos) return;
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        setPage(prev => prev + 1);
      }
    });
    if (node) observerRef.current.observe(node);
  }, [loadingLogos, hasMore]);
  
  const getLogoUrl = (logoUrl) => {
    if (!logoUrl) return null;
    const baseURL = process.env.REACT_APP_API_URL || '';
    return `${baseURL}/api/uploads/logos/${logoUrl}`;
  };

  if (loading) {
    return (
      <div className="maquinas-vendidas-loading">
        <div className="loading-spinner"></div>
        <p>Carregando mapa de máquinas vendidas...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="maquinas-vendidas-error">
        <p>{error}</p>
        <button onClick={loadMaquinasVendidas} className="btn-retry">
          Tentar Novamente
        </button>
      </div>
    );
  }

  return (
    <div className="maquinas-vendidas-container">
      <div className="maquinas-vendidas-header">
        <div>
          <h1>
            <FiMapPin /> Presença GMP no Brasil
          </h1>
          <p>Mapa interativo mostrando nossa abrangência nacional e onde nossos equipamentos estão instalados</p>
        </div>
      </div>

      {/* KPIs - Apenas informações visuais para marketing */}
      <div className="maquinas-kpis">
        <div className="maquina-kpi-card" style={{ animationDelay: '0.1s' }}>
          <div className="maquina-kpi-icon maquina-kpi-icon-1">
            <FiPackage />
            <div className="kpi-icon-glow"></div>
          </div>
            <div className="maquina-kpi-content">
            <div className="maquina-kpi-label">Máquinas Instaladas</div>
            <div className="maquina-kpi-value" data-value={dados?.total_maquinas || 0}>
              {animatedValues.maquinas}
            </div>
            <div className="maquina-kpi-subtitle">Equipamentos GMP em operação</div>
          </div>
          <div className="kpi-card-shine"></div>
        </div>
        <div className="maquina-kpi-card" style={{ animationDelay: '0.2s' }}>
          <div className="maquina-kpi-icon maquina-kpi-icon-2">
            <FiMapPin />
            <div className="kpi-icon-glow"></div>
          </div>
            <div className="maquina-kpi-content">
            <div className="maquina-kpi-label">Localizações</div>
            <div className="maquina-kpi-value" data-value={dados?.total || 0}>
              {animatedValues.localizacoes}
            </div>
            <div className="maquina-kpi-subtitle">Cidades atendidas no Brasil</div>
          </div>
          <div className="kpi-card-shine"></div>
        </div>
        <div className="maquina-kpi-card" style={{ animationDelay: '0.3s' }}>
          <div className="maquina-kpi-icon maquina-kpi-icon-3">
            <FiGlobe />
            <div className="kpi-icon-glow"></div>
          </div>
          <div className="maquina-kpi-content">
            <div className="maquina-kpi-label">Presença Nacional</div>
            <div className="maquina-kpi-value" data-value="100">100%</div>
            <div className="maquina-kpi-subtitle">Cobertura em todo território</div>
          </div>
          <div className="kpi-card-shine"></div>
        </div>
        <div className="maquina-kpi-card" style={{ animationDelay: '0.4s' }}>
          <div className="maquina-kpi-icon maquina-kpi-icon-4">
            <FiAward />
            <div className="kpi-icon-glow"></div>
          </div>
            <div className="maquina-kpi-content">
            <div className="maquina-kpi-label">Confiança</div>
            <div className="maquina-kpi-value" data-value={dados?.total || 0}>
              {animatedValues.confianca}+
            </div>
            <div className="maquina-kpi-subtitle">Clientes satisfeitos</div>
          </div>
          <div className="kpi-card-shine"></div>
        </div>
      </div>

      {/* Mapa */}
      <div className="maquinas-map-section">
        <div className="section-card">
          <div className="section-header">
            <h2>
              <FiMapPin /> Nossa Presença no Brasil
            </h2>
            <p>Explore o mapa e descubra onde a GMP INDUSTRIAIS está presente com equipamentos instalados e operando</p>
          </div>
          <div className="map-container">
            <MapaMaquinasVendidas 
              localizacoes={dados?.localizacoes || []}
            />
            <div className="map-legend">
              <div className="legend-item">
                <div className="legend-color" style={{ background: '#00c853' }}></div>
                <span>Grandes Instalações</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ background: '#ff9800' }}></div>
                <span>Instalações Médias</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ background: '#0066cc' }}></div>
                <span>Instalações</span>
              </div>
              <div className="legend-note">
                <small>O tamanho do marcador indica a quantidade de máquinas instaladas na localização</small>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Mural de Logos dos Clientes */}
      <div className="maquinas-logos-section">
        <div className="section-card">
          <div className="section-header">
            <h2>
              <FiAward /> Nossos Clientes
            </h2>
            <p>Empresas que confiam na GMP INDUSTRIAIS para suas soluções industriais</p>
          </div>
          {loadingLogos && logos.length === 0 ? (
            <div className="logos-loading">
              <div className="loading-spinner"></div>
              <p>Carregando logos dos clientes...</p>
            </div>
          ) : logos.length === 0 ? (
            <div className="logos-empty">
              <p>Nenhum logo de cliente cadastrado ainda.</p>
            </div>
          ) : (
            <div className="logos-mural">
              {logos.map((cliente, index) => {
                const logoUrl = getLogoUrl(cliente.logo_url);
                const isLast = index === logos.length - 1;
                
                return (
                  <div
                    key={cliente.id}
                    ref={isLast ? lastLogoElementRef : null}
                    className="logo-item"
                    title={cliente.nome_fantasia || cliente.razao_social}
                  >
                    {logoUrl ? (
                      <img
                        src={logoUrl}
                        alt={cliente.nome_fantasia || cliente.razao_social}
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="logo-placeholder">
                        {cliente.nome_fantasia?.[0] || cliente.razao_social?.[0] || '?'}
                      </div>
                    )}
                  </div>
                );
              })}
              {loadingLogos && logos.length > 0 && (
                <div className="logos-loading-more">
                  <div className="loading-spinner-small"></div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MaquinasVendidas;

