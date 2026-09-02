Módulo de Almoxarifado — ERP GMP Industriais
1. Objetivo do módulo

O módulo de Almoxarifado deverá controlar integralmente os materiasolicitação de compra ou requisição interna até o recebimento, inspeção, armazenagem, reserva, separação, entrega, devolução, transferência, inventário e eventual descarte.

O sistema deverá garantir:

Rastreabilidade completa de cada movimentação.
Controle do estoque físico e disponível.
Vinculação dos materiais aos projetos, equipamentos, ordens de serviço e setores.
Separação dos materiais próprios, materiais de clientes e materiais enviados a terceiros.
Controle por lote, número de série, certificado, corrida e localização.
Aprovação eletrônica das requisições e ajustes.
Registro do responsável por cada operação.
Envio automático de e-mail em todas as entradas e saídas.
Histórico que não possa ser apagado ou alterado sem registro.
Indicadores gerenciais e alertas preventivos.

A arquitetura deverá registrar os principais eventos de rastreabilidade — como recebimento, movimentação, transformação, expedição e devolução — com os respectivos dados de item, quantidade, localização, lote, responsável e documento relacionado. . Arquitetura geral do módulo

Usuários e dispositivos
        │
        ├── Portal web
        ├── Aplicativo móvel
        ├── Coletores de código de barras
        └── Tablets do Almoxarifado
        │
        ▼
Camada de autenticação e permissões
        │
        ▼
Motor de processos e aprovações
        │
        ├── Requisições
        ├── Recebimentos
        ├── Inspeções
        ├── Reservas
        ├── Separações
        ├── Saídas
        ├── Transferências
        ├── Devoluções
        ├── Inventários
        └── Ajustes
        │
        ▼
Serviços do Almoxarifado
        │
        ├── Controle de estoque
        ├── Controle de lotes e séries
        ├── Controle de localizações
        ├── Materiais de clientes
        ├── Materiais em terceiros
        ├── Sobras e retalhos
        ├── Ferramentas
        └── Rastreabilidade
        │
        ▼
Banco de dados e livro de movimentações
        │
        ├── Saldos
        ├── Movimentações
        ├── Documentos
        ├── Anexos
        └── Auditoria
        │
        ▼
Integrações
        ├── Compras
        ├── Engenharia
        ├── Produção
        ├── PCP
        ├── Projetos
        ├── Manutenção
        ├── Financeiro
        ├── Fiscal
        └── Serviço de e-mail

Todas as movimentações deverão ser processadas como transações: ou a operação inteira é concluída, ou nenhuma alteração de saldo é realizada.

3. Estrutura física sugerida para os estoques da GMP

O ERP deverá permitir múltiplos almoxarifados, depósitos, áreas, corredores, estruturas, prateleiras, posições e endereços.

3.1 Almoxarifados principais
Almoxarifado geral.
Almoxarifado de materiais elétricos.
Almoxarifado de materiais pneumáticos.
Almoxarifado de fixadores.
Almoxarifado de motores, redutores e acionamentos.
Almoxarifado de instrumentação.
Almoxarifado de consumíveis de soldagem.
Almoxarifado de ferramentas.
Estoque de chapas.
Estoque de tubos.
Estoque de barras e perfis.
Estoque de componentes usinados.
Estoque de componentes fabricados internamente.
Estoque de materiais de clientes.
Estoque de materiais aguardando inspeção.
Área de quarentena.
Área de materiais não conformes.
Área de materiais reservados por projeto.
Área de kits para produção.
Área de expedição.
Área de devoluções.
Área de sucata.
Área de retalhos e sobras aproveitáveis.
Materiais temporariamente em terceiros.
3.2 Estrutura de endereço

Cada posição poderá seguir um padrão como:

ALMOXARIFADO – CORREDOR – ESTRUTURA – NÍVEL – POSIÇÃO

Exemplo:

ALM-GERAL-A03-E02-N04-P01

O sistema deverá impedir que um item seja armazenado em uma localização incompatível com suas características, quando houver restrição cadastrada.

4. Cadastros fundamentais
4.1 Cadastro de materiais

Cada material deverá possuir:

Código interno GMP.
Descrição resumida.
Descrição técnica completa.
Grupo.
Família.
Subfamília.
Tipo do item.
Unidade de estoque.
Unidade de compra.
Unidade de consumo.
Fator de conversão.
Fabricante.
Código do fabricante.
Fornecedor preferencial.
NCM.
Peso unitário.
Dimensões.
Material construtivo.
Especificação técnica.
Norma aplicável.
Marca.
Modelo.
Aplicação.
Estoque mínimo.
Estoque máximo.
Ponto de reposição.
Lote econômico de compra.
Prazo médio de reposição.
Localização padrão.
Controle por lote.
Controle por número de série.
Controle por certificado.
Controle por validade.
Controle por corrida ou heat number.
Necessidade de inspeção no recebimento.
Necessidade de certificado.
Necessidade de fotografia.
Criticidade do item.
Classe ABC.
Custo médio.
Último custo.
Status ativo ou inativo.
Imagens e desenhos.
Ficha técnica.
Certificados e documentos anexos.

O uso de código de barras para produtos, embalagens, lotes e números de série reduz digitação manual e facilita o registro das movimentações. ipos de materiais da GMP

Matéria-prima.
Chapa.
Tubo.
Barra.
Perfil estrutural.
Fixador.
Componente mecânico.
Componente elétrico.
Componente pneumático.
Instrumento.
Motor.
Redutor.
Bomba.
Válvula.
Item comercial.
Item fabricado internamente.
Subconjunto.
Consumível.
Ferramenta.
Equipamento de medição.
EPI.
Material de escritório.
Embalagem.
Material de cliente.
Material consignado.
Retalho.
Sucata.
Produto acabado.
4.3 Cadastros complementares
Unidades de medida.
Conversões entre unidades.
Fornecedores.
Fabricantes.
Clientes.
Projetos.
Equipamentos.
Ordens de serviço.
Ordens de produção.
Centros de custo.
Setores.
Colaboradores.
Localizações.
Motivos de movimentação.
Motivos de ajuste.
Tipos de documento.
Transportadoras.
Inspetores.
Aprovadores.
Grupos de e-mail.
Regras de aprovação.
Perfis de acesso.
5. Requisição de materiais
5.1 Tipos de requisição

O sistema deverá permitir:

Requisição para ordem de produção.
Requisição para ordem de serviço.
Requisição para projeto.
Requisição para montagem de equipamento.
Requisição para instalação externa.
Requisição para assistência técnica.
Requisição para manutenção interna.
Requisição para desenvolvimento e protótipo.
Requisição para consumo administrativo.
Requisição emergencial.
Requisição de ferramenta.
Requisição de EPI.
Requisição de material pertencente ao cliente.
Requisição de complemento de material.
5.2 Informações da requisição
Número automático.
Data e hora.
Solicitante.
Setor.
Gestor responsável.
Projeto.
Cliente.
Ordem de serviço.
Ordem de produção.
Equipamento.
Centro de custo.
Prioridade.
Data necessária.
Local de entrega.
Justificativa.
Lista de materiais.
Quantidade solicitada.
Unidade.
Observações.
Desenho ou documento anexo.
Aprovações necessárias.
5.3 Fluxo da requisição
Rascunho
   ↓
Enviada para aprovação
   ↓
Aprovada ou rejeitada
   ↓
Análise de disponibilidade
   ↓
Reserva do estoque
   ↓
Separação
   ↓
Conferência
   ↓
Entrega
   ↓
Confirmação do recebimento
   ↓
Encerramento
5.4 Status possíveis
Rascunho.
Aguardando aprovação.
Rejeitada.
Aprovada.
Aprovada parcialmente.
Aguardando estoque.
Aguardando compra.
Parcialmente reservada.
Totalmente reservada.
Em separação.
Pronta para retirada.
Entregue parcialmente.
Entregue integralmente.
Cancelada.
Encerrada.
5.5 Tasks do processo de requisição
Criar requisição.
Copiar requisição anterior.
Importar itens de uma lista técnica.
Importar itens de uma ordem de produção.
Informar projeto e equipamento.
Verificar saldo físico.
Verificar saldo disponível.
Verificar saldo reservado.
Identificar materiais em compra.
Identificar materiais em inspeção.
Enviar para aprovação.
Aprovar ou rejeitar.
Registrar justificativa da rejeição.
Reservar estoque.
Gerar necessidade de compra.
Gerar pedido interno de fabricação.
Separar materiais.
Conferir quantidades.
Registrar lote e número de série entregue.
Registrar responsável pela retirada.
Coletar assinatura digital.
Registrar entrega parcial.
Reprogramar saldo pendente.
Cancelar saldo não utilizado.
Encerrar requisição.
Enviar e-mails de cada mudança relevante.
6. Aprovações

O motor de aprovação deverá considerar:

Tipo de material.
Valor estimado.
Quantidade.
Projeto.
Centro de custo.
Urgência.
Material crítico.
Material pertencente ao cliente.
Requisição fora da lista técnica.
Requisição acima do previsto.
Ajuste de estoque.
Descarte.
Sucateamento.
Regras recomendadas
O solicitante não poderá aprovar a própria requisição quando houver aprovação obrigatória.
Requisições emergenciais deverão exigir justificativa.
Materiais fora da estrutura do projeto deverão passar pela Engenharia ou pelo responsável do projeto.
Materiais de clientes deverão exigir autorização específica.
Ajustes de estoque deverão exigir dupla aprovação.
Sucateamentos deverão exigir aprovação do Almoxarifado e da gestão responsável.
7. Reserva de estoque

O sistema deverá diferenciar:

Estoque físico
(-) Estoque bloqueado
(-) Estoque em quarentena
(-) Estoque reservado
= Estoque disponível
Tasks de reserva
Reserva automática após aprovação.
Reserva manual autorizada.
Reserva por projeto.
Reserva por ordem de produção.
Reserva por equipamento.
Reserva por data de necessidade.
Reserva por prioridade.
Reserva por lote específico.
Reserva por número de série.
Reserva parcial.
Liberação de reserva.
Transferência de reserva entre projetos.
Expiração automática de reservas não utilizadas.
Alerta de reserva vencida.
Bloqueio de consumo por outro projeto.
Consulta de quem reservou o material.

Materiais separados fisicamente deverão ser transferidos para uma localização virtual ou física chamada “Reservado”, “Kit de produção” ou “Aguardando retirada”.

8. Entrada e recebimento de materiais
8.1 Tipos de entrada
Recebimento de pedido de compra.
Recebimento parcial.
Recebimento excedente autorizado.
Recebimento de material de cliente.
Recebimento de material consignado.
Retorno de industrialização.
Retorno de fornecedor.
Retorno de assistência técnica.
Devolução da produção.
Transferência entre almoxarifados.
Entrada de item fabricado internamente.
Entrada de sobra ou retalho.
Entrada por ajuste de inventário.
Entrada de ferramenta.
Entrada de produto acabado.
8.2 Conferência documental

O recebimento deverá validar:

Pedido de compra.
Nota fiscal.
Fornecedor.
CNPJ.
Projeto relacionado.
Item solicitado.
Quantidade pedida.
Quantidade recebida.
Unidade de medida.
Valor.
Lote.
Número de série.
Certificado.
Desenho.
Data de fabricação.
Validade.
Condição da embalagem.
Transportadora.
Fotos do recebimento.
8.3 Conferência física
Contagem.
Pesagem.
Medição dimensional.
Identificação do material.
Verificação visual.
Inspeção de avarias.
Conferência do fabricante.
Conferência do modelo.
Conferência da tensão e frequência.
Conferência do grau de proteção.
Conferência de certificados.
Conferência da norma e material construtivo.
Registro fotográfico.
8.4 Fluxo de recebimento
Chegada do material
   ↓
Identificação do pedido
   ↓
Conferência documental
   ↓
Conferência física
   ↓
Registro de divergências
   ↓
Inspeção da qualidade, quando aplicável
   ↓
Aprovação ou quarentena
   ↓
Geração da etiqueta
   ↓
Definição da localização
   ↓
Armazenagem
   ↓
Atualização do saldo
   ↓
E-mail automático
8.5 Status do recebimento
Aguardando descarga.
Em conferência.
Com divergência.
Aguardando documentação.
Aguardando inspeção.
Em quarentena.
Aprovado.
Reprovado.
Aprovado parcialmente.
Armazenado.
Devolvido ao fornecedor.
Encerrado.
9. Inspeção e qualidade

O módulo deverá possuir integração com a Qualidade.

Tasks de inspeção
Criar inspeção de recebimento.
Selecionar plano de inspeção.
Registrar medidas.
Registrar resultado visual.
Anexar certificado.
Anexar relatório dimensional.
Anexar fotos.
Registrar instrumento de medição utilizado.
Registrar inspetor.
Aprovar lote.
Aprovar parcialmente.
Reprovar lote.
Bloquear material.
Criar não conformidade.
Solicitar análise da Engenharia.
Solicitar devolução ao fornecedor.
Solicitar substituição.
Liberar material sob desvio autorizado.
Registrar responsável pela autorização.
Manter histórico da decisão.

Materiais em inspeção, quarentena ou não conformidade não deverão aparecer como estoque disponível.

10. Etiquetas, lotes e números de série

Cada unidade logística ou material deverá poder receber etiqueta contendo:

Código GMP.
Descrição.
Quantidade.
Unidade.
Lote.
Número de série.
Fornecedor.
Pedido de compra.
Nota fiscal.
Projeto.
Cliente.
Data de recebimento.
Localização.
Status da inspeção.
Código de barras ou QR Code.
Regras específicas
Motores, redutores, bombas, instrumentos e painéis: controle por número de série.
Chapas, barras e tubos certificados: controle por lote, corrida ou certificado.
Tintas, produtos químicos e consumíveis: controle por lote e validade.
Fixadores e itens comuns: controle por lote quando necessário.
Equipamentos fabricados: número de série GMP.
Materiais de clientes: identificação visível da propriedade.
Retalhos: nova etiqueta com dimensões e peso remanescente.
11. Armazenagem e endereçamento
Tasks de armazenagem
Sugerir localização.
Validar capacidade da posição.
Validar peso máximo.
Validar dimensões.
Validar tipo de material permitido.
Validar incompatibilidade entre materiais.
Registrar operador.
Confirmar localização por leitura.
Transferir material para endereço.
Gerar etiqueta de endereço.
Consultar ocupação.
Consultar posições vazias.
Bloquear endereço.
Liberar endereço.
Registrar material fora de endereço.
Alertar divergência entre sistema e posição física.
12. Separação e picking
Tasks de separação
Criar lista de separação.
Agrupar requisições por projeto.
Agrupar por setor.
Agrupar por localização.
Definir prioridade.
Definir responsável.
Sugerir rota de separação.
Ler endereço.
Ler código do material.
Informar quantidade retirada.
Informar lote.
Informar número de série.
Registrar substituição de lote.
Registrar divergência.
Solicitar ajuste.
Separar parcialmente.
Transferir para área de conferência.
Realizar segunda conferência.
Embalar ou montar kit.
Identificar o kit.
Liberar para retirada.
13. Saída de materiais
13.1 Tipos de saída
Consumo em ordem de produção.
Consumo em ordem de serviço.
Consumo em projeto.
Entrega para montagem.
Entrega para instalação externa.
Entrega para manutenção.
Entrega para assistência técnica.
Envio para fornecedor.
Envio para industrialização.
Transferência entre depósitos.
Empréstimo de ferramenta.
Entrega de EPI.
Devolução ao fornecedor.
Devolução ao cliente.
Venda ou expedição.
Descarte.
Sucateamento.
Ajuste de estoque.
13.2 Tasks da saída
Identificar requisição aprovada.
Validar reserva.
Validar saldo.
Validar lote e número de série.
Validar inspeção aprovada.
Registrar quantidade.
Registrar localização de origem.
Registrar destino.
Registrar projeto ou OS.
Registrar solicitante.
Registrar responsável pela separação.
Registrar responsável pela entrega.
Registrar responsável pelo recebimento.
Coletar assinatura.
Tirar foto, quando necessário.
Atualizar saldo.
Atualizar custo do projeto.
Baixar reserva.
Gerar comprovante.
Enviar e-mail automático.
Registrar eventual saldo pendente.
13.3 Regra crítica

Nenhuma saída deverá ocorrer sem:

Usuário identificado.
Motivo.
Documento de origem.
Quantidade.
Localização.
Projeto, OS ou centro de custo.
Responsável pelo recebimento.

Saídas emergenciais deverão ser regularizadas posteriormente, mas sempre mediante lançamento no sistema e justificativa.

14. E-mails automáticos de entrada e saída

Toda entrada ou saída confirmada deverá gerar e-mail imediato.

14.1 Conteúdo mínimo do e-mail
Tipo da movimentação.
Número da movimentação.
Data e hora.
Usuário responsável.
Solicitante.
Projeto.
Cliente.
Ordem de serviço.
Ordem de produção.
Item.
Descrição.
Quantidade.
Unidade.
Lote.
Número de série.
Localização de origem.
Localização de destino.
Saldo anterior.
Quantidade movimentada.
Saldo posterior.
Documento relacionado.
Observações.
Link direto para a movimentação.
Comprovante ou relatório em PDF, quando aplicável.
14.2 Destinatários sugeridos
Entrada de compra
Almoxarifado.
Comprador responsável.
Solicitante da compra.
Responsável pelo projeto.
Qualidade, quando houver inspeção.
Financeiro ou Fiscal, quando necessário.
Saída para produção
Almoxarifado.
Solicitante.
Líder da produção.
Responsável pelo projeto.
PCP.
Material de cliente
Almoxarifado.
Gestor do projeto.
Comercial responsável.
Engenharia.
Responsável definido pelo cliente, quando aplicável.
Material enviado para terceiros
Almoxarifado.
Compras.
Gestor do projeto.
Responsável pelo fornecedor.
PCP.
Ajustes e divergências
Supervisor do Almoxarifado.
Controladoria.
Gestor responsável.
Diretoria, acima de determinado limite.
14.3 Tasks do serviço de e-mail
Gerar mensagem a partir do evento.
Identificar destinatários.
Aplicar modelo.
Anexar comprovante.
Enviar.
Registrar data e hora.
Registrar confirmação técnica de envio.
Tentar novamente em caso de falha.
Alertar administrador após falhas sucessivas.
Manter histórico do conteúdo enviado.
Permitir reenvio autorizado.
Impedir e-mails duplicados.
Gerar resumo diário adicional.

O e-mail deve ser disparado somente após a movimentação ser efetivamente confirmada no banco de dados.

15. Transferências internas

O sistema deverá permitir transferências:

Entre almoxarifados.
Entre endereços.
Para área de produção.
Para kit de projeto.
Para quarentena.
Para inspeção.
Para expedição.
Para sucata.
Para material reservado.
Para estoque de cliente.
Para terceiro.
Fluxo
Solicitação de transferência
   ↓
Aprovação, quando exigida
   ↓
Retirada da origem
   ↓
Material em trânsito
   ↓
Recebimento no destino
   ↓
Confirmação

Enquanto estiver em trânsito, o material deverá ficar visível em uma localização específica, sem ser considerado disponível na origem ou no destino.

16. Devoluções
Tipos
Devolução da produção.
Devolução de projeto.
Devolução de instalação externa.
Devolução de ferramenta.
Devolução de material não utilizado.
Devolução ao fornecedor.
Devolução do fornecedor.
Devolução de cliente.
Retorno de assistência técnica.
Tasks
Referenciar a saída original.
Informar quantidade devolvida.
Informar condição.
Informar lote e número de série.
Registrar fotos.
Avaliar reaproveitamento.
Encaminhar para inspeção.
Retornar ao estoque.
Encaminhar para reparo.
Encaminhar para sucata.
Atualizar custo do projeto.
Enviar e-mail.
Manter vínculo entre saída e devolução.
17. Materiais pertencentes aos clientes

Essa função é fundamental para projetos de industrialização da GMP.

Regras
O material deverá possuir proprietário cadastrado.
O saldo deverá permanecer separado do estoque próprio.
Não poderá ser utilizado em outro cliente ou projeto.
Toda entrada deverá indicar cliente, projeto e documento.
Toda saída deverá indicar a aplicação.
Ajustes deverão exigir autorização especial.
O sistema deverá emitir posição de estoque por cliente.
O custo não deverá ser misturado ao estoque próprio, salvo regra contábil específica.
Sobras deverão permanecer vinculadas ao proprietário.
A devolução ao cliente deverá ser documentada.
Relatórios
Materiais recebidos por cliente.
Materiais consumidos por projeto.
Saldo disponível.
Materiais reservados.
Sobras.
Perdas.
Materiais não conformes.
Materiais devolvidos.
18. Materiais enviados a terceiros

Aplicável a processos como:

Corte a laser.
Corte plasma.
Dobra.
Calandragem.
Usinagem.
Tratamento térmico.
Pintura.
Galvanização.
Jateamento.
Balanceamento.
Recuperação de componentes.
Tasks
Criar remessa para terceiro.
Selecionar fornecedor.
Relacionar pedido ou ordem de serviço.
Informar materiais enviados.
Informar peso e quantidade.
Informar desenhos.
Registrar lote.
Registrar prazo previsto.
Gerar documento de remessa.
Dar saída para estoque “Em terceiros”.
Enviar e-mail.
Acompanhar prazo.
Alertar atraso.
Registrar retorno parcial.
Registrar retorno total.
Registrar perda ou consumo.
Registrar novos códigos resultantes.
Vincular o material original ao componente transformado.
Encerrar a remessa.
19. Retalhos, sobras e sucatas
Retalhos aproveitáveis

O sistema deverá registrar:

Material.
Norma.
Espessura.
Diâmetro.
Largura.
Comprimento.
Peso.
Lote ou corrida.
Projeto de origem.
Localização.
Foto.
Data de geração.
Responsável.

Quando uma barra, tubo, chapa ou perfil for parcialmente utilizado, o sistema deverá:

Dar baixa na dimensão ou peso original.
Criar um novo saldo para o retalho.
Gerar nova etiqueta.
Registrar dimensões remanescentes.
Manter vínculo com o lote original.
Sucatas
Classificar tipo de sucata.
Registrar peso.
Registrar material.
Registrar projeto de origem.
Solicitar aprovação.
Transferir para área de sucata.
Registrar venda ou descarte.
Anexar comprovantes.
Enviar e-mail.
Gerar relatório financeiro.
20. Ferramentas e equipamentos de medição
Tasks
Cadastrar ferramenta.
Cadastrar patrimônio.
Registrar número de série.
Registrar localização.
Emprestar a colaborador.
Registrar data prevista de devolução.
Confirmar devolução.
Registrar avaria.
Registrar perda.
Bloquear ferramenta.
Enviar lembrete de devolução.
Controlar manutenção.
Controlar calibração.
Anexar certificado.
Alertar vencimento de calibração.
Impedir uso de equipamento vencido.
21. Inventário e contagem cíclica

O sistema deverá suportar inventário geral e contagens cíclicas por material, grupo, endereço, criticidade ou classificação ABC. A contagem cíclica é utilizada para auditar periodicamente o estoque físico sem depender apenas de um inventário anual. de contagem

Inventário geral.
Inventário por endereço.
Inventário por família.
Contagem cíclica.
Contagem de item crítico.
Contagem por curva ABC.
Contagem por divergência.
Contagem surpresa.
Contagem de materiais de clientes.
Contagem de materiais em terceiros.
Tasks
Criar plano de contagem.
Congelar movimentações, quando necessário.
Gerar listas cegas.
Definir contadores.
Realizar primeira contagem.
Registrar quantidade.
Realizar recontagem.
Comparar físico e sistema.
Identificar divergência.
Exigir motivo.
Aprovar ajuste.
Atualizar saldo.
Registrar impacto financeiro.
Registrar histórico.
Enviar e-mail.
Gerar relatório de acuracidade.
Regras
O contador não deverá visualizar o saldo esperado em contagens cegas.
Divergências acima da tolerância deverão exigir recontagem.
Ajustes deverão exigir aprovação.
O ajuste deverá ser realizado por transação específica.
O histórico anterior nunca deverá ser apagado.
22. Reposição e estoque mínimo
Tasks
Calcular estoque disponível.
Monitorar estoque mínimo.
Monitorar estoque máximo.
Calcular ponto de reposição.
Considerar consumo médio.
Considerar prazo de fornecedor.
Considerar pedidos de compra abertos.
Considerar reservas.
Considerar projetos futuros.
Gerar sugestão de compra.
Gerar requisição de compra.
Alertar material crítico.
Alertar risco de parada.
Identificar materiais sem consumo.
Identificar excesso de estoque.
Identificar item obsoleto.
23. Integração com Engenharia e Produção

O módulo deverá integrar:

Engenharia
Lista técnica/BOM.
Revisão do projeto.
Desenhos.
Especificações.
Substituição de materiais.
Materiais equivalentes.
Alterações de engenharia.
PCP e Produção
Ordem de produção.
Necessidade de materiais.
Reserva automática.
Kit de produção.
Consumo planejado.
Consumo real.
Devolução.
Perdas.
Apontamento de componentes fabricados.
Entrada de subconjuntos.
Encerramento da ordem.
Regra importante

Quando houver alteração na revisão da lista técnica:

O ERP deverá identificar materiais adicionados.
Identificar materiais removidos.
Recalcular reservas.
Avisar Almoxarifado, PCP, Engenharia e responsável pelo projeto.
Manter histórico das revisões.
24. Integração com Compras
Gerar solicitação de compra a partir da falta.
Informar estoque disponível ao comprador.
Consultar reservas.
Consultar consumo histórico.
Consultar último preço.
Consultar fornecedores anteriores.
Acompanhar pedido.
Acompanhar prazo.
Registrar recebimento parcial.
Registrar divergência.
Informar rejeição da Qualidade.
Controlar devolução.
Atualizar prazo previsto.
Enviar alertas de atraso.
25. Integração com Projetos e custos

Toda movimentação deverá poder ser vinculada a:

Cliente.
Projeto.
Proposta.
Contrato.
Ordem de serviço.
Equipamento.
Subconjunto.
Centro de custo.
Fase do projeto.

O sistema deverá permitir comparar:

Quantidade prevista versus consumida.
Custo previsto versus realizado.
Material comprado versus utilizado.
Material reservado versus entregue.
Sobras por projeto.
Perdas por projeto.
Materiais de clientes consumidos.
Materiais ainda pendentes.
26. Alertas do módulo
Alertas operacionais
Estoque abaixo do mínimo.
Estoque zerado.
Estoque negativo — operação deverá ser bloqueada.
Requisição aguardando aprovação.
Requisição atrasada.
Material disponível aguardando retirada.
Material reservado há muitos dias.
Pedido recebido parcialmente.
Divergência de recebimento.
Material em quarentena.
Material reprovado.
Material sem certificado.
Material sem endereço.
Transferência não recebida.
Ferramenta não devolvida.
Material em terceiro com prazo vencido.
Lote próximo do vencimento.
Calibração próxima do vencimento.
Divergência de inventário.
Item sem movimentação.
Estoque excessivo.
Projeto com consumo acima do previsto.
27. Relatórios e dashboards
Estoque
Saldo por item.
Saldo por localização.
Saldo por almoxarifado.
Saldo por lote.
Saldo por número de série.
Saldo por cliente.
Saldo por projeto.
Saldo reservado.
Saldo bloqueado.
Saldo em quarentena.
Saldo em terceiros.
Estoque disponível.
Movimentações
Entradas por período.
Saídas por período.
Transferências.
Devoluções.
Ajustes.
Movimentações por usuário.
Movimentações por projeto.
Movimentações por centro de custo.
Histórico completo do item.
Gestão
Acuracidade do estoque.
Giro de estoque.
Cobertura.
Rupturas.
Materiais parados.
Materiais obsoletos.
Valor total do estoque.
Valor por grupo.
Perdas.
Sucatas.
Consumo por projeto.
Consumo previsto versus realizado.
Tempo médio de atendimento de requisição.
Tempo médio de recebimento.
Requisições atrasadas.
Materiais sem localização.
Materiais em quarentena.
Indicadores principais
Acuracidade física.
Percentual de requisições atendidas no prazo.
Percentual de requisições atendidas integralmente.
Tempo médio entre requisição e entrega.
Divergência de recebimento por fornecedor.
Índice de rejeição por fornecedor.
Valor de estoque parado.
Valor de sucata.
Número de ajustes.
Consumo não previsto por projeto.
Estoque de materiais de clientes.
Materiais em terceiros atrasados.
28. Perfis de usuários
Solicitante
Criar requisição.
Consultar requisições próprias.
Confirmar recebimento.
Solicitar devolução.
Aprovador
Aprovar.
Rejeitar.
Solicitar esclarecimentos.
Consultar orçamento e projeto.
Almoxarife
Receber.
Conferir.
Armazenar.
Separar.
Entregar.
Transferir.
Registrar devoluções.
Realizar contagem.
Supervisor do Almoxarifado
Aprovar ajustes.
Aprovar exceções.
Gerenciar endereços.
Liberar reservas.
Consultar indicadores.
Reabrir processos autorizados.
Compras
Consultar necessidade.
Consultar estoque.
Acompanhar recebimentos.
Tratar divergências.
Qualidade
Inspecionar.
Aprovar.
Reprovar.
Bloquear.
Liberar sob desvio.
Engenharia
Consultar materiais.
Aprovar equivalências.
Analisar substituições.
Gerenciar especificações.
PCP e Produção
Consultar reservas.
Solicitar materiais.
Confirmar recebimento.
Registrar devolução e consumo.
Auditoria e Diretoria
Consulta completa.
Relatórios.
Histórico.
Aprovação de ajustes críticos.
Sem permissão para apagar movimentações.
29. Regras de segurança e auditoria
Nenhuma movimentação confirmada poderá ser excluída.
Erros deverão ser corrigidos por estorno.
Todo estorno deverá indicar motivo.
O sistema deverá registrar usuário, data, hora e dispositivo.
Alterações de cadastro deverão manter histórico.
Ajustes deverão exigir permissão especial.
Não permitir saldo negativo.
Não permitir saída de material bloqueado.
Não permitir saída de material vencido.
Não permitir saída de lote reprovado.
Não permitir movimentação sem projeto ou centro de custo, conforme o tipo.
Bloquear lançamentos retroativos sem autorização.
Registrar tentativas de acesso indevido.
Exigir justificativa para operações excepcionais.
Permitir dupla conferência em materiais críticos.
Realizar backup e retenção dos documentos.
30. Estrutura de dados principal
Entidades fundamentais
Material.
Família.
Unidade de medida.
Fornecedor.
Cliente.
Projeto.
Ordem de serviço.
Ordem de produção.
Almoxarifado.
Localização.
Lote.
Número de série.
Certificado.
Saldo.
Reserva.
Requisição.
Item da requisição.
Recebimento.
Inspeção.
Separação.
Movimentação.
Transferência.
Devolução.
Inventário.
Ajuste.
Remessa para terceiro.
Ferramenta.
Empréstimo.
Usuário.
Aprovação.
Documento.
Anexo.
Notificação.
Registro de auditoria.
Livro de movimentações

Cada movimento deverá armazenar:

Identificador único.
Tipo de movimento.
Data e hora.
Material.
Quantidade.
Unidade.
Saldo anterior.
Saldo posterior.
Origem.
Destino.
Lote.
Número de série.
Projeto.
OS ou OP.
Documento.
Solicitante.
Executor.
Aprovador.
Motivo.
Observações.
Evento de e-mail.
Status da integração.
Registro de estorno, quando existente.
31. Arquitetura técnica recomendada para notificações
Movimentação confirmada
        ↓
Evento gerado no ERP
        ↓
Fila de notificações
        ↓
Identificação dos destinatários
        ↓
Geração do e-mail
        ↓
Envio
        ↓
Confirmação técnica
        ↓
Registro no histórico

O serviço deverá possuir:

Fila de processamento.
Controle contra duplicidade.
Tentativas automáticas.
Registro de falha.
Painel de mensagens pendentes.
Reenvio manual autorizado.
Modelos configuráveis.
Grupos de destinatários.
Escalonamento.
Histórico de cada mensagem.
32. Backlog de implantação sugerido
Fase 1 — Estrutura básica
Materiais.
Unidades.
Fornecedores.
Clientes.
Projetos.
Almoxarifados.
Localizações.
Usuários.
Permissões.
Saldos iniciais.
Livro de movimentações.
Fase 2 — Operação principal
Requisições.
Aprovações.
Reservas.
Recebimentos.
Entradas.
Separação.
Saídas.
Transferências.
Devoluções.
E-mails automáticos.
Fase 3 — Controle industrial GMP
Ordens de produção.
Listas técnicas.
Kits.
Materiais de clientes.
Materiais em terceiros.
Retalhos.
Sucatas.
Lotes.
Números de série.
Certificados.
Inspeção da qualidade.
Fase 4 — Mobilidade e automação
Código de barras.
QR Code.
Coletores.
Aplicativo móvel.
Assinatura digital.
Fotografias.
Impressão de etiquetas.
Endereçamento inteligente.
Fase 5 — Gestão avançada
Inventário cíclico.
Curva ABC.
Estoque mínimo e máximo.
Sugestões de compra.
Dashboards.
Indicadores.
Alertas.
Auditoria avançada.
Integração financeira e fiscal.
33. Fluxo operacional resumido da GMP
Engenharia libera lista técnica
        ↓
PCP gera necessidade de materiais
        ↓
ERP consulta estoque
        ↓
Materiais disponíveis são reservados
        ↓
Faltas geram solicitação de compra
        ↓
Compras realiza pedido
        ↓
Almoxarifado recebe e confere
        ↓
Qualidade aprova, quando necessário
        ↓
Material é etiquetado e armazenado
        ↓
Produção gera requisição
        ↓
Almoxarifado separa e confere
        ↓
Material é entregue e baixado
        ↓
E-mail automático é enviado
        ↓
Consumo é lançado no projeto
        ↓
Sobras retornam ao estoque
        ↓
Projeto é encerrado e reconciliado
34. Critérios de aceite do módulo

O módulo somente deverá ser considerado operacional quando for possível:

Identificar onde está cada material.
Identificar a quantidade física, reservada, bloqueada e disponível.
Identificar quem movimentou o material.
Identificar quando a movimentação ocorreu.
Identificar para qual projeto ou OS o material foi utilizado.
Rastrear lote e número de série.
Separar materiais próprios dos materiais de clientes.
Controlar materiais enviados a terceiros.
Registrar entradas e saídas sem permitir exclusão do histórico.
Enviar automaticamente e-mail de todas as entradas e saídas.
Realizar inventários e ajustes aprovados.
Consultar o histórico completo de qualquer material.
Consultar custo e consumo por projeto.
Bloquear materiais reprovados ou indisponíveis.
Emitir relatórios gerenciais e de auditoria.