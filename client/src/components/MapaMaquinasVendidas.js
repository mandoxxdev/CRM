import React, { useEffect, useRef, useState } from 'react';

// Componente de Mapa de Máquinas Vendidas usando Leaflet diretamente
const MapaMaquinasVendidas = ({ localizacoes }) => {
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

      console.log('Iniciando carregamento do mapa de máquinas vendidas...');

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

        // Função para criar ícone personalizado com logo (definida antes do uso)
        const criarIconePersonalizado = (tamanho, valorTotal, totalMaquinas = 1) => {
          const size = tamanho || 50;
          const isAltoValor = valorTotal > 2000000;
          const isMedioValor = valorTotal > 1000000;
          
          // Cores baseadas no valor
          const corBorda = isAltoValor ? '#00c853' : isMedioValor ? '#ff9800' : '#0066cc';
          const corFundo = isAltoValor ? 'rgba(0, 200, 83, 0.2)' : isMedioValor ? 'rgba(255, 152, 0, 0.2)' : 'rgba(0, 102, 204, 0.2)';
          
          // Criar um ícone HTML personalizado com logo
          const iconHtml = `
            <div style="
              width: ${size}px;
              height: ${size}px;
              background: ${corFundo};
              border: 4px solid ${corBorda};
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3), 0 0 0 4px rgba(255, 255, 255, 0.5);
              position: relative;
              animation: pulse 2s infinite;
              cursor: pointer;
              pointer-events: auto;
            ">
              <img 
                src="/logo.png" 
                alt="GMP" 
                style="
                  width: ${size * 0.6}px;
                  height: ${size * 0.6}px;
                  object-fit: contain;
                  filter: brightness(0) invert(1);
                  pointer-events: none;
                "
              />
              <div style="
                position: absolute;
                bottom: -8px;
                right: -8px;
                min-width: ${size * 0.4}px;
                height: ${size * 0.4}px;
                background: ${corBorda};
                border: 3px solid white;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: ${Math.max(size * 0.15, 10)}px;
                font-weight: bold;
                color: white;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                padding: 0 4px;
              ">${totalMaquinas}</div>
            </div>
          `;
          
          return L.divIcon({
            html: iconHtml,
            className: 'custom-marker-icon',
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
            popupAnchor: [0, -size / 2]
          });
        };

        try {
          // Criar mapa centralizado no Brasil
          const map = L.map(mapRef.current, {
            center: [-15.0, -55.0], // Centro do Brasil
            zoom: 5, // Zoom inicial para mostrar todo o Brasil
            scrollWheelZoom: true,
            zoomControl: true,
            attributionControl: true,
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
          
          // Usar tile layer baseado no tema
          const tileUrl = isDarkMode 
            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
            : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
          
          const tileLayer = L.tileLayer(tileUrl, {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 19
          }).addTo(map);
          
          // Agora podemos salvar a referência do tile layer
          mapInstanceRef.current.tileLayer = tileLayer;

          console.log('Mapa inicializado com sucesso');
          
          // Aguardar um pouco antes de marcar como carregado
          setTimeout(() => {
            if (isMounted && mapInstanceRef.current) {
              setLoaded(true);
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

    // Iniciar após um pequeno delay
    const timeoutId = setTimeout(initMap, 50);

    return () => {
      clearTimeout(timeoutId);
      if (mapInstanceRef.current) {
        try {
          markersRef.current.forEach(marker => {
            try {
              mapInstanceRef.current.removeLayer(marker);
            } catch (e) {
              console.warn('Erro ao remover marcador no cleanup:', e);
            }
          });
          markersRef.current = [];
          
          mapInstanceRef.current.remove();
        } catch (e) {
          console.warn('Erro ao remover mapa:', e);
        }
        mapInstanceRef.current = null;
      }
      initializedRef.current = false;
      setLoaded(false);
    };
  }, []);

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
            : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
          
          try {
            const tileLayer = L.tileLayer(tileUrl, {
              attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
              subdomains: 'abcd',
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
    if (!loaded || !mapInstanceRef.current) {
      return;
    }

    if (!localizacoes || localizacoes.length === 0) {
      console.log('Nenhuma localização disponível para atualizar marcadores');
      return;
    }

    console.log('Atualizando marcadores de máquinas vendidas, total:', localizacoes.length);

    const updateTimeout = setTimeout(() => {
      import('leaflet').then((LModule) => {
        const L = LModule.default;
        
        if (!mapInstanceRef.current) {
          console.warn('Mapa não está mais disponível');
          return;
        }

        // Função para criar ícone personalizado com logo (definida dentro do escopo)
        const criarIconePersonalizado = (tamanho, valorTotal, totalMaquinas = 1) => {
          const size = tamanho || 50;
          // Cores baseadas na quantidade de máquinas (não no valor) para marketing
          const isGrandeInstalacao = totalMaquinas > 5;
          const isMediaInstalacao = totalMaquinas > 2;
          
          // Cores baseadas na quantidade de máquinas
          const corBorda = isGrandeInstalacao ? '#00c853' : isMediaInstalacao ? '#ff9800' : '#0066cc';
          const corFundo = isGrandeInstalacao ? 'rgba(0, 200, 83, 0.2)' : isMediaInstalacao ? 'rgba(255, 152, 0, 0.2)' : 'rgba(0, 102, 204, 0.2)';
          
          // Criar um ícone HTML personalizado com logo
          const iconHtml = `
            <div style="
              width: ${size}px;
              height: ${size}px;
              background: ${corFundo};
              border: 4px solid ${corBorda};
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3), 0 0 0 4px rgba(255, 255, 255, 0.5);
              position: relative;
              animation: pulse 2s infinite;
              cursor: pointer;
              pointer-events: auto;
            ">
              <img 
                src="/logo.png" 
                alt="GMP" 
                style="
                  width: ${size * 0.6}px;
                  height: ${size * 0.6}px;
                  object-fit: contain;
                  filter: brightness(0) invert(1);
                  pointer-events: none;
                "
              />
              <div style="
                position: absolute;
                bottom: -8px;
                right: -8px;
                min-width: ${size * 0.4}px;
                height: ${size * 0.4}px;
                background: ${corBorda};
                border: 3px solid white;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: ${Math.max(size * 0.15, 10)}px;
                font-weight: bold;
                color: white;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                padding: 0 4px;
              ">${totalMaquinas}</div>
            </div>
          `;
          
          return L.divIcon({
            html: iconHtml,
            className: 'custom-marker-icon',
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
            popupAnchor: [0, -size / 2],
            interactive: true // Garantir interatividade
          });
        };
        
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
          
          if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            console.warn(`Coordenadas inválidas para ${loc.cidade}:`, [lat, lng]);
            return;
          }
          
          const totalMaquinas = loc.total_maquinas || 1;
          const valorTotal = loc.valor_total || 0;
          
          // Tamanho do ícone baseado na quantidade de máquinas
          const tamanhoIcone = Math.min(Math.max(totalMaquinas * 8 + 40, 50), 100);
          
          try {
            if (!mapInstanceRef.current) {
              return;
            }
            
            // Criar marcador personalizado com logo
            const icon = criarIconePersonalizado(tamanhoIcone, valorTotal, totalMaquinas);
            const marker = L.marker([lat, lng], { 
              icon: icon,
              zIndexOffset: marcadoresAdicionados * 1000, // Offset muito maior
              riseOnHover: true, // Elevar no hover
              riseOffset: 1000, // Offset de elevação maior
              bubblingMouseEvents: false // Evitar propagação de eventos
            });
            
            // Adicionar ao mapa
            marker.addTo(mapInstanceRef.current);

            // Garantir que o marcador seja sempre clicável - configuração robusta
            marker.options.interactive = true;
            marker.options.keyboard = true;
            
            // Forçar interatividade no elemento HTML imediatamente
            const configurarInteratividade = () => {
              if (marker && marker._icon) {
                marker._icon.style.pointerEvents = 'auto';
                marker._icon.style.cursor = 'pointer';
                marker._icon.style.zIndex = (marcadoresAdicionados * 1000).toString();
                
                // Garantir que todos os elementos filhos também sejam clicáveis
                const elementos = marker._icon.querySelectorAll('*');
                elementos.forEach(el => {
                  el.style.pointerEvents = 'auto';
                  el.style.cursor = 'pointer';
                });
              }
            };
            
            // Configurar imediatamente e depois novamente
            configurarInteratividade();
            setTimeout(configurarInteratividade, 50);
            setTimeout(configurarInteratividade, 200);

            // Efeitos de hover mais impactantes e visuais
            marker.on('mouseover', function() {
              const zIndexAlto = 100000 + marcadoresAdicionados;
              this.setZIndexOffset(zIndexAlto);
              
              // Adicionar efeito de zoom e brilho no hover
              const newSize = tamanhoIcone * 1.4; // Zoom maior
              const newIcon = criarIconePersonalizado(newSize, valorTotal, totalMaquinas);
              this.setIcon(newIcon);
              
              // Garantir pointer events e z-index
              if (this._icon) {
                this._icon.style.pointerEvents = 'auto';
                this._icon.style.cursor = 'pointer';
                this._icon.style.zIndex = zIndexAlto.toString();
                this._icon.style.transition = 'transform 0.3s ease, filter 0.3s ease';
                this._icon.style.transform = 'scale(1.1)';
                this._icon.style.filter = 'drop-shadow(0 8px 16px rgba(0, 102, 204, 0.5))';
              }
            });

            marker.on('mouseout', function() {
              const zIndexOriginal = marcadoresAdicionados * 1000;
              this.setZIndexOffset(zIndexOriginal);
              
              // Restaurar tamanho original
              const originalIcon = criarIconePersonalizado(tamanhoIcone, valorTotal, totalMaquinas);
              this.setIcon(originalIcon);
              
              if (this._icon) {
                this._icon.style.pointerEvents = 'auto';
                this._icon.style.cursor = 'pointer';
                this._icon.style.zIndex = zIndexOriginal.toString();
                this._icon.style.transform = 'scale(1)';
                this._icon.style.filter = 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.3))';
              }
            });

            // Garantir que o popup abra ao clicar - múltiplas formas
            marker.on('click', function(e) {
              if (e && e.originalEvent) {
                e.originalEvent.stopPropagation();
                e.originalEvent.preventDefault();
              }
              const zIndexAlto = 100000 + marcadoresAdicionados;
              this.setZIndexOffset(zIndexAlto);
              this.openPopup();
              if (this._icon) {
                this._icon.style.zIndex = zIndexAlto.toString();
              }
            });
            
            // Adicionar listener direto no elemento HTML como backup
            setTimeout(() => {
              if (marker && marker._icon) {
                // Remover listeners antigos se houver
                const novoIcon = marker._icon.cloneNode(true);
                if (marker._icon.parentNode) {
                  marker._icon.parentNode.replaceChild(novoIcon, marker._icon);
                }
                marker._icon = novoIcon;
                
                // Adicionar eventos diretamente
                marker._icon.onclick = function(e) {
                  e.stopPropagation();
                  e.preventDefault();
                  marker.setZIndexOffset(100000 + marcadoresAdicionados);
                  marker.openPopup();
                  if (marker._icon) {
                    marker._icon.style.zIndex = (100000 + marcadoresAdicionados).toString();
                  }
                };
                
                marker._icon.style.pointerEvents = 'auto';
                marker._icon.style.cursor = 'pointer';
                marker._icon.style.zIndex = (marcadoresAdicionados * 1000).toString();
              }
            }, 300);

            // Armazenar referência do marcador para garantir clicabilidade
            const markerRef = marker;
            
            // Criar popup com design de marketing
            const titulos = loc.titulos_propostas && loc.titulos_propostas.length > 0 
              ? loc.titulos_propostas.slice(0, 3).join(', ') 
              : 'N/A';
            const maisTitulos = loc.titulos_propostas && loc.titulos_propostas.length > 3 
              ? ` e mais ${loc.titulos_propostas.length - 3} máquina(s)` 
              : '';

            // Cor baseada na quantidade de máquinas (não no valor)
            const corDestaque = totalMaquinas > 5 ? '#00c853' : totalMaquinas > 2 ? '#ff9800' : '#0066cc';
            const categoria = totalMaquinas > 5 ? 'Grande Parceiro' : totalMaquinas > 2 ? 'Parceiro Médio' : 'Cliente';
            
            // Detectar tema para ajustar cores do popup
            const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
            const textColor = isDarkMode ? '#f1f5f9' : '#1e293b';
            const textLightColor = isDarkMode ? '#94a3b8' : '#666';
            const bgColor = isDarkMode ? 'rgba(30, 41, 59, 0.5)' : 'rgba(0, 102, 204, 0.05)';
            const bgCardColor = isDarkMode ? 'rgba(30, 41, 59, 0.3)' : '#f8f9fa';
            
            const popupContent = `
              <div class="map-popup-marketing" style="
                min-width: 280px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              ">
                <div style="
                  background: linear-gradient(135deg, ${corDestaque} 0%, ${corDestaque}dd 100%);
                  padding: 16px;
                  border-radius: 8px 8px 0 0;
                  color: white;
                  margin: -10px -10px 12px -10px;
                ">
                  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                    <img src="/logo.png" alt="GMP" style="width: 32px; height: 32px; filter: brightness(0) invert(1);" />
                    <h4 style="margin: 0; font-size: 18px; font-weight: 700; color: white;">GMP INDUSTRIAIS</h4>
                  </div>
                  <p style="margin: 0; font-size: 14px; opacity: 0.95; font-weight: 600;">${loc.razao_social || 'N/A'}</p>
                </div>
                <div style="padding: 0 4px;">
                  <div style="
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px;
                    background: ${bgColor};
                    border-radius: 6px;
                    margin-bottom: 8px;
                  ">
                    <span style="font-size: 20px;">📍</span>
                    <span style="font-size: 13px; color: ${textLightColor}; font-weight: 500;">${loc.cidade || 'N/A'}, ${loc.estado || 'N/A'}</span>
                  </div>
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
                    <div style="
                      padding: 10px;
                      background: ${bgColor};
                      border-radius: 6px;
                      border-left: 3px solid ${corDestaque};
                    ">
                      <div style="font-size: 11px; color: ${textLightColor}; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Máquinas</div>
                      <div style="font-size: 20px; font-weight: 700; color: ${corDestaque};">${totalMaquinas}</div>
                    </div>
                    <div style="
                      padding: 10px;
                      background: ${bgColor};
                      border-radius: 6px;
                      border-left: 3px solid ${corDestaque};
                    ">
                      <div style="font-size: 11px; color: ${textLightColor}; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Categoria</div>
                      <div style="font-size: 14px; font-weight: 700; color: ${corDestaque};">${categoria}</div>
                    </div>
                  </div>
                  ${titulos !== 'N/A' ? `
                    <div style="
                      padding: 8px;
                      background: ${bgCardColor};
                      border-radius: 6px;
                      border-left: 3px solid ${corDestaque};
                    ">
                      <div style="font-size: 11px; color: ${textLightColor}; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Equipamentos Instalados</div>
                      <div style="font-size: 12px; color: ${textColor}; line-height: 1.4;">${titulos}${maisTitulos}</div>
                    </div>
                  ` : ''}
                </div>
              </div>
            `;
            
            marker.bindPopup(popupContent, {
              className: 'custom-popup',
              maxWidth: 300,
              closeButton: true,
              autoPan: true,
              autoPanPadding: [50, 50]
            });
            
            // Garantir clicabilidade após binding do popup
            setTimeout(() => {
              if (marker && marker._icon) {
                marker._icon.style.pointerEvents = 'auto';
                marker._icon.style.cursor = 'pointer';
                marker._icon.style.zIndex = (marcadoresAdicionados * 100).toString();
                
                // Garantir que todos os elementos filhos também sejam clicáveis
                const elementos = marker._icon.querySelectorAll('*');
                elementos.forEach(el => {
                  el.style.pointerEvents = 'auto';
                  el.style.cursor = 'pointer';
                });
              }
            }, 200);
            
            markersRef.current.push(marker);
            marcadoresAdicionados++;
          } catch (err) {
            console.error(`Erro ao adicionar marcador para ${loc.cidade}:`, err);
          }
        });
        
        console.log(`Marcadores de máquinas vendidas atualizados: ${marcadoresAdicionados} de ${localizacoes.length}`);
        
        // Ajustar o zoom do mapa para mostrar todos os marcadores
        if (markersRef.current.length > 0 && mapInstanceRef.current) {
          try {
            const group = new L.featureGroup(markersRef.current);
            mapInstanceRef.current.fitBounds(group.getBounds().pad(0.15));
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
  }, [localizacoes, loaded]);

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
          <p>Carregando mapa de máquinas vendidas...</p>
        </div>
      )}
      <div 
        ref={mapRef} 
        style={{ 
          height: '600px', 
          width: '100%', 
          borderRadius: '10px', 
          zIndex: 1,
          display: loaded ? 'block' : 'none'
        }} 
      />
    </>
  );
};

export default MapaMaquinasVendidas;

