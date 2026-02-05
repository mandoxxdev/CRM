import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { FiMapPin, FiX, FiNavigation } from 'react-icons/fi';
import api from '../services/api';

// Criar ícones customizados mais bonitos
const createCustomIcon = (color, iconText) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        background: linear-gradient(135deg, ${color} 0%, ${color}dd 100%);
        width: 40px;
        height: 40px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        border: 3px solid white;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
      ">
        <div style="
          transform: rotate(45deg);
          color: white;
          font-weight: bold;
          font-size: 18px;
        ">${iconText}</div>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40]
  });
};

const origemIcon = createCustomIcon('#0066cc', '🏠');
const clienteIcon = createCustomIcon('#ff9800', '📍');

const PreviewRota = ({ origem, clientes, onClose }) => {
  const mapRef = useRef(null);
  const [clientesComCoords, setClientesComCoords] = useState([]);
  
  // Buscar coordenadas exatas de todos os clientes quando o componente montar
  useEffect(() => {
    const buscarCoordenadasExatas = async () => {
      if (!clientes || clientes.length === 0) {
        setClientesComCoords([]);
        return;
      }
      
      const clientesComCoordenadas = await Promise.all(
        clientes.map(async (cliente) => {
          // Se já tem coordenadas, usar
          if (cliente.coordenadas && Array.isArray(cliente.coordenadas) && cliente.coordenadas.length === 2) {
            return { ...cliente, coordenadas: cliente.coordenadas };
          }
          
          // Se tiver endereço completo, buscar coordenadas exatas do backend
          if (cliente.endereco && cliente.cidade && cliente.estado && cliente.id) {
            try {
              const response = await api.get(`/custos-viagens/coordenadas-cliente/${cliente.id}`);
              if (response.data && response.data.coordenadas) {
                return { ...cliente, coordenadas: response.data.coordenadas };
              }
            } catch (err) {
              console.warn('Erro ao buscar coordenadas exatas, usando fallback:', err);
            }
          }
          
          // Fallback para coordenadas aproximadas
          return { ...cliente, coordenadas: obterCoordenadas(cliente) };
        })
      );
      
      setClientesComCoords(clientesComCoordenadas);
    };
    
    buscarCoordenadasExatas();
  }, [clientes]);

  // Calcular centro do mapa baseado em todos os pontos
  const calcularCentro = () => {
    if (!origem || !clientesComCoords || clientesComCoords.length === 0) {
      return [-23.7150, -46.5550]; // Coordenadas padrão SBC
    }

    const pontos = [origem, ...clientesComCoords.map(c => c.coordenadas || obterCoordenadas(c))];
    const lats = pontos.map(p => p[0]);
    const lons = pontos.map(p => p[1]);
    
    return [
      (Math.min(...lats) + Math.max(...lats)) / 2,
      (Math.min(...lons) + Math.max(...lons)) / 2
    ];
  };

  const obterCoordenadas = (cliente) => {
    // Se já tem coordenadas, usar
    if (cliente.coordenadas && Array.isArray(cliente.coordenadas) && cliente.coordenadas.length === 2) {
      return cliente.coordenadas;
    }
    
    const cidadeLower = cliente.cidade ? cliente.cidade.toLowerCase() : '';
    
    // Verificar se é SBC (várias variações possíveis) - PRIORIDADE MÁXIMA
    if (cidadeLower.includes('são bernardo') || cidadeLower.includes('sbc') || 
        cidadeLower.includes('s. bernardo') || cidadeLower.includes('sao bernardo')) {
      // Se for SBC, usar coordenadas variadas dentro de SBC para evitar sobreposição
      const offset = (cliente.id || 0) * 0.002; // Pequeno offset baseado no ID
      return [-23.7150 + offset, -46.5550 + offset];
    }
    
    // Coordenadas básicas
    const coordenadasCidades = {
      'São Bernardo do Campo': [-23.7150, -46.5550],
      'São Paulo': [-23.5505, -46.6333],
      'Rio de Janeiro': [-22.9068, -43.1729],
      'Duque de Caxias': [-22.7856, -43.3047],
    };
    
    const cidadeKey = cliente.cidade ? cliente.cidade.trim() : '';
    
    // Se for SP mas não encontrou cidade específica, usar SBC como padrão
    if (cliente.estado && cliente.estado.toUpperCase() === 'SP' && !coordenadasCidades[cidadeKey]) {
      const offset = (cliente.id || 0) * 0.002;
      return [-23.7150 + offset, -46.5550 + offset];
    }
    
    return coordenadasCidades[cidadeKey] || [-23.7150, -46.5550]; // Fallback para SBC
  };

  const centro = calcularCentro();
  // Ajustar zoom baseado na distância entre os pontos
  const calcularZoom = () => {
    if (!origem || !clientesComCoords || clientesComCoords.length === 0) return 13;
    
    const pontos = [origem, ...clientesComCoords.map(c => c.coordenadas || obterCoordenadas(c))];
    const lats = pontos.map(p => p[0]);
    const lons = pontos.map(p => p[1]);
    
    const latDiff = Math.max(...lats) - Math.min(...lats);
    const lonDiff = Math.max(...lons) - Math.min(...lons);
    const maxDiff = Math.max(latDiff, lonDiff);
    
    // Se todos os pontos estão muito próximos (mesma cidade), zoom maior
    if (maxDiff < 0.01) return 14; // Zoom alto para mesma cidade
    if (maxDiff < 0.05) return 12; // Zoom médio para região próxima
    return 10; // Zoom baixo para distâncias maiores
  };
  
  const zoom = calcularZoom();

  // Calcular distância entre dois pontos (Haversine)
  const calcularDistancia = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Raio da Terra em km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // Otimizar rota usando algoritmo Nearest Neighbor (vizinho mais próximo)
  const otimizarRota = () => {
    if (!origem || !clientesComCoords || clientesComCoords.length === 0) return { pontos: [origem], distanciaTotal: 0 };
    
    // Usar coordenadas já obtidas (exatas ou aproximadas)
    const clientesComCoordsFiltrados = clientesComCoords
      .map(cliente => ({
        ...cliente,
        coords: cliente.coordenadas || obterCoordenadas(cliente)
      }))
      .filter(c => c.coords);
    
    if (clientesComCoordsFiltrados.length === 0) return { pontos: [origem], distanciaTotal: 0 };
    
    // Algoritmo Nearest Neighbor: começar da origem, sempre ir para o cliente mais próximo não visitado
    const pontos = [origem];
    const visitados = new Set();
    let pontoAtual = origem;
    let distanciaTotal = 0;
    
    while (visitados.size < clientesComCoordsFiltrados.length) {
      let menorDistancia = Infinity;
      let proximoCliente = null;
      let proximoIndex = -1;
      
      clientesComCoordsFiltrados.forEach((cliente, index) => {
        if (!visitados.has(index)) {
          const distancia = calcularDistancia(
            pontoAtual[0], pontoAtual[1],
            cliente.coords[0], cliente.coords[1]
          );
          if (distancia < menorDistancia) {
            menorDistancia = distancia;
            proximoCliente = cliente;
            proximoIndex = index;
          }
        }
      });
      
      if (proximoCliente) {
        pontos.push(proximoCliente.coords);
        visitados.add(proximoIndex);
        distanciaTotal += menorDistancia;
        pontoAtual = proximoCliente.coords;
      } else {
        break;
      }
    }
    
    // Adicionar retorno à origem (opcional, mas útil para visualização)
    const distanciaRetorno = calcularDistancia(
      pontoAtual[0], pontoAtual[1],
      origem[0], origem[1]
    );
    distanciaTotal += distanciaRetorno;
    
    return { pontos, distanciaTotal: Math.round(distanciaTotal * 10) / 10 };
  };

  const rotaOtimizada = otimizarRota();
  const pontosRota = rotaOtimizada.pontos;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-preview-rota" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1000px', height: '85vh' }}>
        <div className="modal-header" style={{ 
          background: 'linear-gradient(135deg, #0066cc 0%, #0052a3 100%)',
          color: 'white',
          padding: '1.5rem',
          borderRadius: '12px 12px 0 0'
        }}>
          <h2 style={{ color: 'white', margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <FiNavigation size={24} /> Preview da Rota
          </h2>
          <button className="modal-close" onClick={onClose} style={{ color: 'white', background: 'rgba(255,255,255,0.2)' }}>
            <FiX />
          </button>
        </div>
        <div className="modal-body" style={{ padding: 0, height: 'calc(100% - 80px)' }}>
          <div style={{ height: '100%', position: 'relative' }}>
            <MapContainer
              center={centro}
              zoom={zoom}
              style={{ height: '100%', width: '100%', zIndex: 0 }}
              ref={mapRef}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              
              {/* Marcador de origem */}
              {origem && (
                <Marker position={origem} icon={origemIcon}>
                  <Popup>
                    <div style={{ textAlign: 'center', padding: '0.5rem' }}>
                      <strong style={{ color: '#0066cc', fontSize: '1rem' }}>🏠 Origem (GMP)</strong><br />
                      <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#64748b' }}>
                        Av. Angelo Demarchi 130<br />
                        Batistini, São Bernardo do Campo - SP
                      </div>
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* Marcadores dos clientes */}
              {clientesComCoords && clientesComCoords.map((cliente, index) => {
                const coords = cliente.coordenadas || obterCoordenadas(cliente);
                if (!coords) return null;
                
                return (
                  <Marker key={cliente.id || index} position={coords} icon={clienteIcon}>
                    <Popup>
                      <div style={{ textAlign: 'center', padding: '0.5rem' }}>
                        <strong style={{ color: '#ff9800', fontSize: '1rem' }}>📍 {index + 1}. {cliente.razao_social}</strong><br />
                        <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#64748b' }}>
                          {cliente.endereco && (
                            <>
                              {cliente.endereco}<br />
                            </>
                          )}
                          {cliente.cidade} - {cliente.estado}
                          {cliente.distancia_km && <><br />🚗 {cliente.distancia_km} km de distância</>}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}

              {/* Linha conectando os pontos */}
              {pontosRota.length > 1 && (
                <Polyline
                  positions={pontosRota}
                  color="#ff9800"
                  weight={5}
                  opacity={0.8}
                  dashArray="10, 5"
                />
              )}
            </MapContainer>
          </div>
          
          {/* Legenda Premium */}
          <div style={{ 
            position: 'absolute', 
            bottom: '20px', 
            left: '20px', 
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.98) 100%)',
            backdropFilter: 'blur(10px)',
            padding: '1.5rem', 
            borderRadius: '16px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.1)',
            border: '1px solid rgba(255, 255, 255, 0.8)',
            zIndex: 1000,
            maxWidth: '320px',
            animation: 'slideInUp 0.3s ease-out'
          }}>
            <div style={{ 
              marginBottom: '1rem', 
              fontWeight: 700, 
              color: '#1e293b',
              fontSize: '1.1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <FiNavigation style={{ color: '#ff9800' }} />
              Rota da Viagem
            </div>
            <div style={{ fontSize: '0.9rem', color: '#475569', marginBottom: '0.75rem' }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.75rem', 
                marginBottom: '0.5rem',
                padding: '0.5rem',
                background: 'linear-gradient(135deg, rgba(0, 102, 204, 0.1) 0%, rgba(0, 102, 204, 0.05) 100%)',
                borderRadius: '8px'
              }}>
                <div style={{ 
                  width: '16px', 
                  height: '16px', 
                  background: 'linear-gradient(135deg, #0066cc 0%, #0052a3 100%)', 
                  borderRadius: '50%',
                  boxShadow: '0 2px 6px rgba(0, 102, 204, 0.3)'
                }}></div>
                <span style={{ fontWeight: 600 }}>🏠 Origem (GMP)</span>
              </div>
              {clientesComCoords && clientesComCoords.map((cliente, index) => (
                <div key={cliente.id || index} style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.75rem', 
                  marginBottom: '0.5rem',
                  padding: '0.5rem',
                  background: 'linear-gradient(135deg, rgba(255, 152, 0, 0.1) 0%, rgba(255, 152, 0, 0.05) 100%)',
                  borderRadius: '8px'
                }}>
                  <div style={{ 
                    width: '16px', 
                    height: '16px', 
                    background: 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)', 
                    borderRadius: '50%',
                    boxShadow: '0 2px 6px rgba(255, 152, 0, 0.3)'
                  }}></div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 500 }}>
                      {index + 1}. {cliente.razao_social}
                      {cliente.distancia_km && <span style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: '0.5rem' }}>({cliente.distancia_km} km)</span>}
                    </span>
                    {cliente.endereco && (
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                        📍 {cliente.endereco}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ 
              marginTop: '0.75rem', 
              paddingTop: '0.75rem', 
              borderTop: '2px solid #e2e8f0', 
              fontSize: '0.85rem', 
              color: '#64748b',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              flexDirection: 'column',
              alignItems: 'flex-start'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%' }}>
                <FiMapPin style={{ color: '#ff9800' }} />
                <span>Total: {clientesComCoords ? clientesComCoords.length + 1 : 1} ponto(s) na rota</span>
              </div>
              {rotaOtimizada.distanciaTotal > 0 && (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.5rem', 
                  width: '100%',
                  marginTop: '0.5rem',
                  padding: '0.5rem',
                  background: 'linear-gradient(135deg, rgba(255, 152, 0, 0.15) 0%, rgba(255, 152, 0, 0.08) 100%)',
                  borderRadius: '8px',
                  fontWeight: 700,
                  color: '#ff9800'
                }}>
                  <FiNavigation style={{ fontSize: '1.1rem' }} />
                  <span>Distância Total: {rotaOtimizada.distanciaTotal} km</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="form-actions" style={{ padding: '1rem', borderTop: '1px solid #e2e8f0' }}>
          <button 
            type="button" 
            className="btn-primary" 
            onClick={onClose}
            style={{ 
              width: '100%',
              background: 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)',
              boxShadow: '0 4px 12px rgba(255, 152, 0, 0.3)'
            }}
          >
            Fechar Preview
          </button>
        </div>
      </div>
    </div>
  );
};

export default PreviewRota;

