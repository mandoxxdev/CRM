import React, { useEffect, useRef, useState } from 'react';

// Componente de Mapa usando Leaflet diretamente (sem react-leaflet)
const MapaClientes = ({ localizacoes, formatCurrency }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    // Carregar Leaflet apenas no cliente
    if (typeof window === 'undefined') {
      return;
    }

    // Evitar múltiplas inicializações
    if (initializedRef.current || mapInstanceRef.current) {
      console.log('Mapa já inicializado, pulando...');
      return;
    }

    // Função para inicializar o mapa
    const initMap = () => {
      if (!mapRef.current) {
        console.log('mapRef.current não disponível, tentando novamente...');
        setTimeout(initMap, 100);
        return;
      }

      if (initializedRef.current || mapInstanceRef.current) {
        console.log('Mapa já inicializado durante initMap');
        return;
      }

      let isMounted = true;
      initializedRef.current = true;

      console.log('Iniciando carregamento do mapa...');

      // Importar Leaflet e CSS
      Promise.all([
        import('leaflet'),
        import('leaflet/dist/leaflet.css')
      ]).then(([LModule]) => {
        if (!isMounted || !mapRef.current) {
          console.log('Componente desmontado ou ref não disponível');
          initializedRef.current = false;
          return;
        }

        console.log('Leaflet carregado, criando mapa...');
        const L = LModule.default;

        // Fix para ícones do Leaflet
        try {
          delete L.Icon.Default.prototype._getIconUrl;
          L.Icon.Default.mergeOptions({
            iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
            iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
          });
        } catch (e) {
          console.warn('Erro ao configurar ícones do Leaflet:', e);
        }

        try {
          // Criar mapa centralizado no Brasil
          const map = L.map(mapRef.current, {
            center: [-15.0, -55.0], // Centro do Brasil
            zoom: 5, // Zoom inicial para mostrar todo o Brasil
            scrollWheelZoom: true,
            minZoom: 4, // Limitar zoom mínimo para manter Brasil visível
            maxBounds: [
              [-35, -75], // Sudoeste (limite sul e oeste)
              [5, -30]    // Nordeste (limite norte e leste)
            ]
          });

          console.log('Mapa criado, adicionando tile layer...');

          // Verificar se o mapa foi criado corretamente
          if (!map) {
            throw new Error('Mapa não foi criado corretamente');
          }

          // Salvar referência do mapa PRIMEIRO
          mapInstanceRef.current = map;

          // Detectar tema atual
          const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
          
          // Adicionar tile layer com tema escuro se necessário
          const tileUrl = isDarkMode 
            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
            : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
          
          const tileLayer = L.tileLayer(tileUrl, {
            attribution: isDarkMode 
              ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
          }).addTo(map);
          
          // Agora podemos salvar a referência do tile layer
          mapInstanceRef.current.tileLayer = tileLayer;

          console.log('Mapa inicializado com sucesso');
          
          // Aguardar um pouco antes de marcar como carregado para garantir que o mapa está totalmente renderizado
          setTimeout(() => {
            if (isMounted && mapInstanceRef.current) {
              setLoaded(true);
              // Forçar atualização do tamanho do mapa
              mapInstanceRef.current.invalidateSize();
            }
          }, 100);
        } catch (err) {
          console.error('Erro ao criar mapa:', err);
          if (isMounted) {
            setError(`Erro ao criar mapa: ${err.message}`);
          }
          initializedRef.current = false;
        }
      }).catch((err) => {
        console.error('Erro ao carregar Leaflet:', err);
        setError(`Erro ao carregar o mapa: ${err.message}`);
        initializedRef.current = false;
      });
    };

    // Iniciar após um pequeno delay para garantir que o DOM está pronto
    const timeoutId = setTimeout(initMap, 50);

    return () => {
      clearTimeout(timeoutId);
      if (mapInstanceRef.current) {
        try {
          // Remover todos os marcadores primeiro
          markersRef.current.forEach(marker => {
            try {
              mapInstanceRef.current.removeLayer(marker);
            } catch (e) {
              console.warn('Erro ao remover marcador no cleanup:', e);
            }
          });
          markersRef.current = [];
          
          // Remover o mapa
          mapInstanceRef.current.remove();
        } catch (e) {
          console.warn('Erro ao remover mapa:', e);
        }
        mapInstanceRef.current = null;
      }
      initializedRef.current = false;
      setLoaded(false);
    };
  }, []); // Apenas uma vez na montagem

  // Observar mudanças no tema e atualizar o mapa
  useEffect(() => {
    if (!mapInstanceRef.current || !loaded) {
      return;
    }

    const observer = new MutationObserver(() => {
      // Verificar se o mapa ainda existe
      if (!mapInstanceRef.current) {
        return;
      }

      const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
      const currentTileUrl = mapInstanceRef.current.tileLayer?._url || '';
      const shouldBeDark = currentTileUrl.includes('dark_all');
      
      // Se o tema mudou, atualizar o tile layer
      if ((isDarkMode && !shouldBeDark) || (!isDarkMode && shouldBeDark)) {
        import('leaflet').then((LModule) => {
          const L = LModule.default;
          
          // Verificar novamente se o mapa ainda existe
          if (!mapInstanceRef.current) {
            return;
          }
          
          // Remover tile layer antigo se existir
          if (mapInstanceRef.current.tileLayer) {
            try {
              mapInstanceRef.current.removeLayer(mapInstanceRef.current.tileLayer);
            } catch (e) {
              console.warn('Erro ao remover tile layer antigo:', e);
            }
          }
          
          // Adicionar novo tile layer com tema correto
          const tileUrl = isDarkMode 
            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
            : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
          
          try {
            const tileLayer = L.tileLayer(tileUrl, {
              attribution: isDarkMode 
                ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
              maxZoom: 19
            }).addTo(mapInstanceRef.current);
            
            // Salvar referência do tile layer apenas se o mapa existir
            if (mapInstanceRef.current) {
              mapInstanceRef.current.tileLayer = tileLayer;
            }
          } catch (e) {
            console.error('Erro ao adicionar novo tile layer:', e);
          }
        }).catch((err) => {
          console.error('Erro ao carregar Leaflet para atualizar tema:', err);
        });
      }
    });

    // Observar mudanças no atributo data-theme
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });

    return () => {
      observer.disconnect();
    };
  }, [loaded]);

  // Atualizar marcadores quando localizacoes mudarem
  useEffect(() => {
    // Aguardar o mapa estar totalmente carregado
    if (!loaded || !mapInstanceRef.current) {
      return;
    }

    // Se não houver localizações, não fazer nada
    if (!localizacoes || localizacoes.length === 0) {
      console.log('Nenhuma localização disponível para atualizar marcadores');
      return;
    }

    console.log('Atualizando marcadores, total de localizações:', localizacoes.length);

    // Usar um timeout para garantir que o mapa está totalmente renderizado
    const updateTimeout = setTimeout(() => {
      // Importar L novamente para usar no segundo useEffect
      import('leaflet').then((LModule) => {
        const L = LModule.default;
        
        // Verificar novamente se o mapa ainda existe
        if (!mapInstanceRef.current) {
          console.warn('Mapa não está mais disponível');
          return;
        }
        
        // Remover marcadores antigos
        markersRef.current.forEach(marker => {
          try {
            if (mapInstanceRef.current) {
              mapInstanceRef.current.removeLayer(marker);
            }
          } catch (e) {
            console.warn('Erro ao remover marcador:', e);
          }
        });
        markersRef.current = [];

        // Adicionar novos marcadores
        let marcadoresAdicionados = 0;
        localizacoes.forEach((loc, index) => {
          if (!loc.coordenadas || loc.coordenadas.length !== 2) {
            console.warn(`Localização ${index} inválida:`, loc);
            return;
          }
          
          const [lat, lng] = loc.coordenadas;
          
          // Validar coordenadas
          if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            console.warn(`Coordenadas inválidas para ${loc.cidade}:`, [lat, lng]);
            return;
          }
          
          const totalClientes = loc.total_clientes || 1;
          const radius = Math.min(Math.max(totalClientes * 6, 15), 60);
          const valorTotal = loc.valor_total || 0;
          
          // Cores mais vibrantes e saturadas
          const fillColor = valorTotal > 1000000 ? '#00e676' : valorTotal > 500000 ? '#ffa726' : '#2196f3';
          const borderColor = valorTotal > 1000000 ? '#00c853' : valorTotal > 500000 ? '#ff9800' : '#1976d2';
          
          try {
            if (!mapInstanceRef.current) {
              return;
            }
            
            const circle = L.circleMarker([lat, lng], {
              radius: radius,
              fillColor: fillColor,
              color: borderColor,
              weight: 6,
              opacity: 1,
              fillOpacity: 0.95
            }).addTo(mapInstanceRef.current);

            // Efeitos de hover mais suaves
            circle.on('mouseover', function() {
              this.setStyle({
                weight: 8,
                fillOpacity: 1,
                color: '#fff'
              });
              this.bringToFront();
            });

            circle.on('mouseout', function() {
              this.setStyle({
                weight: 6,
                fillOpacity: 0.95,
                color: borderColor
              });
            });

            // Detectar tema para ajustar cores do popup
            const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
            const textColor = isDarkMode ? '#f1f5f9' : '#1e293b';
            const primaryColor = isDarkMode ? '#66a3e0' : '#0066cc';
            
            const popupContent = `
              <div class="map-popup">
                <h4 style="margin: 0 0 8px 0; color: ${primaryColor}; font-size: 16px; font-weight: 700;">${loc.cidade || 'N/A'}, ${loc.estado || 'N/A'}</h4>
                <p style="margin: 4px 0; font-size: 13px; color: ${textColor};"><strong style="color: ${textColor};">Clientes:</strong> ${loc.total_clientes || 0}</p>
                <p style="margin: 4px 0; font-size: 13px; color: ${textColor};"><strong style="color: ${textColor};">Propostas:</strong> ${loc.total_propostas || 0}</p>
                <p style="margin: 4px 0; font-size: 13px; color: ${textColor};"><strong style="color: ${textColor};">Valor Total:</strong> ${formatCurrency(valorTotal)}</p>
              </div>
            `;
            
            circle.bindPopup(popupContent);
            markersRef.current.push(circle);
            marcadoresAdicionados++;
          } catch (err) {
            console.error(`Erro ao adicionar marcador para ${loc.cidade}:`, err);
          }
        });
        
        console.log(`Marcadores atualizados: ${marcadoresAdicionados} de ${localizacoes.length}`);
        
        // Ajustar o zoom do mapa para mostrar todos os marcadores
        if (markersRef.current.length > 0 && mapInstanceRef.current) {
          try {
            const group = new L.featureGroup(markersRef.current);
            mapInstanceRef.current.fitBounds(group.getBounds().pad(0.1));
            // Forçar atualização do tamanho do mapa
            setTimeout(() => {
              if (mapInstanceRef.current) {
                mapInstanceRef.current.invalidateSize();
              }
            }, 100);
          } catch (e) {
            console.warn('Erro ao ajustar zoom:', e);
          }
        }
      }).catch((err) => {
        console.error('Erro ao carregar Leaflet para marcadores:', err);
      });
    }, 200);

    return () => {
      clearTimeout(updateTimeout);
    };
  }, [localizacoes, formatCurrency, loaded]);

  if (error) {
    return (
      <div className="map-loading">
        <p style={{ color: '#f44336' }}>{error}</p>
        <button 
          onClick={() => {
            setError(null);
            setLoaded(false);
            initializedRef.current = false;
          }}
          style={{
            marginTop: '10px',
            padding: '8px 16px',
            background: '#0066cc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  return (
    <>
      {!loaded && (
        <div className="map-loading">
          <div className="loading-spinner"></div>
          <p>Carregando mapa...</p>
        </div>
      )}
      <div 
        ref={mapRef} 
        style={{ 
          height: '500px', 
          width: '100%', 
          borderRadius: '10px', 
          zIndex: 1,
          display: loaded ? 'block' : 'none'
        }} 
      />
    </>
  );
};

export default MapaClientes;

