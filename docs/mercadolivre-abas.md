# Mercado Livre — cinco páginas locais

Implementação de 16/09/2026 baseada nas cinco imagens aprovadas, em `mercadolivre.html`. Tema claro, roxo #7C3AED, logo existente Provou Levou. O menu Mercado Livre da visão geral encaminha à nova página preservando as datas. Links para os demais canais mantêm as páginas anteriores. Nenhuma publicação.

## Páginas

- Resumo: vendas brutas confirmadas, pedidos pagos, unidades, ticket, cancelados, comparação anterior, visitas, reputação e posição atual. As visitas mantêm janela própria de 30 dias; a reputação usa a janela retornada pela plataforma.
- Pedidos e entregas: busca por número/produto, filtro de situação, paginação de 15 pedidos, envio/logística/previsão consultados por página e detalhe com itens, totais, rastreamento e histórico. Os contadores de envio se referem somente aos pedidos visíveis, explicitamente indicados, para não apresentar como total do período dados ainda não consultados.
- Produtos e anúncios: top 10 por unidades de pedidos pagos; catálogo paginado de 20 anúncios, busca e filtro ativo/pausado/encerrado, preço pelo recurso sale_price, quantidade e vendidos acumulados. Limite de estoque baixo: 5 unidades. Fotos dos principais produtos quando disponíveis.
- Pagamentos: uma linha por pagamento, busca e filtros de situação/método, parcelas, aprovação, reembolsos e detalhes das comissões por item. Não há lucro ou repasse estimado.
- Perguntas: pendentes/respondidas, paginação, busca na página carregada, anúncio e resposta existente. Rascunhos ficam na memória da sessão. Enviar resposta permanece desabilitado e identificado como em validação; nenhuma resposta foi publicada.

## Dados e critérios

Leitura direta de pedidos na API do vendedor 674281461. Período máximo de 90 dias, limite de 9.500 registros por consulta; excesso falha explicitamente. Todas as páginas são recuperadas antes da apuração. IDs duplicados/incompletude bloqueiam agregação. Retornos fora das datas solicitadas são removidos após validar a completude, utilizando instantes de Brasília. Ordenação final por data/id.

Vendas brutas somam total_amount de pedidos BRL paid/partially_refunded e não cancelados ou totalmente reembolsados. Reembolsos parciais não são deduzidos; a tela informa isso. Ranking usa quantidade × unit_price e pode diferir do total do pedido. Não é receita líquida financeira. Campo sold_quantity do anúncio permanece explicitamente acumulado. Cada pagamento é uma linha, portanto quantidade de pagamentos pode diferir da quantidade de pedidos.

A Visão Geral permanece na base sincronizada anterior; a página nova usa consulta direta. Há possibilidade de diferenças por atualização e critérios. Não foi feita reconciliação entre essas origens nesta entrega.

## Proteção e execução

As rotas exigem cookie/CSRF local e validação do usuário Cacife no Supabase. Credencial somente no backend. Pedidos e envios validam o vendedor; respostas são listas explícitas de campos sem dados de contato/endereço dos compradores. Links externos são limitados a Mercado Livre e miniaturas mlstatic. Consultas possuem timeout e concorrência limitada. Cache de pedidos de dois minutos após autorização, persistido e atualizado em segundo plano; no HTTP 401, relê a credencial compartilhada e renova o acesso quando necessário. Renovação única em consultas simultâneas, persistência dos dois tokens com expires_in e gravação condicional para não sobrescrever outra sincronização. Segredos ficam somente no arquivo privado local.

Servidor: `npm run dev:metricas`. URL: http://127.0.0.1:8879/mercadolivre.html. Não há build de produção ou deploy.

## Verificação

Testes de agregação, reembolso parcial/total, duplicação, valores monetários, isolamento de vendedor, ausência de PII, URLs seguras, intervalos e paginação, além dos testes existentes. Browser: leitura real nas cinco abas, comparação de períodos, detalhes de envio e comissão, busca por pedido, catálogo com preços, perguntas pendentes e respondidas, estados vazios e layout desktop/mobile.

Resumo: ícones Phosphor padronizados, detalhes dos gráficos por ponteiro, toque e teclado. Pedidos: pizzas de situação (todos os pedidos filtrados) e envios (15 pedidos da página), incluindo consultas pendentes e indisponíveis.
