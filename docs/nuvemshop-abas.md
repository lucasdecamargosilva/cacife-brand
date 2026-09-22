# Nuvemshop — páginas locais

URL: http://127.0.0.1:8879/nuvemshop.html

Cinco abas em tema claro Provou Levou: Resumo, Pedidos, Produtos e estoque, Pagamentos, Carrinhos abandonados. A visão geral continua em metricas.html. Não há publicação em produção.

## Dados e critérios

- Leitura direta da API 2025-03 da loja 1081093, com autenticação Cacife e proteção CSRF no servidor local.
- Pedidos: a consulta usa updated_at_min, incluindo pedidos antigos pagos durante o período. created_at_max fixa o limite de criação no início da consulta, evitando deslocamentos de páginas causados por novas vendas. A interface filtra criação e pagamento separadamente. Lotes de 30 pedidos evitam a omissão de paid_at observada em lotes de 50 e 200. Duas páginas são consultadas simultaneamente, com novas tentativas limitadas em HTTP 429. Máximo 90 dias por seleção; paginação incompleta falha explicitamente.
- Faturamento: total dos pedidos BRL com payment_status=paid, não cancelados, por paid_at em Brasília. Não substitui pagamento por criação. Pedidos com reembolso parcial ou integral ficam fora. Ticket médio = total / quantidade de pedidos elegíveis. Não representa repasse líquido.
- Ranking: soma de preço unitário × quantidade dos itens nos pedidos elegíveis, antes de descontos do pedido.
- Pedidos sem paid_at: contagem separada entre os pedidos pagos criados no intervalo. Pagamentos pendentes e envios: situação atual de pedidos criados no intervalo.
- Produtos: catálogo atual, publicado/oculto, variantes, SKU, preços e estoque. Estoque baixo: 1 a 5 unidades, somente variantes de produtos publicados com controle ativo. Nulo não significa zero.
- Carrinhos: abandonos disponíveis na janela de 30 dias da API, inclusive indicadores de notificação e disponibilidade. Não há disparo automático de mensagens. Link de checkout limitado ao domínio da Cacife e aberto com noreferrer.
- Nenhum contato, endereço ou documento de cliente é exposto. Os campos retornados ao navegador são uma lista explícita. Links e imagens são limitados a domínios conhecidos.

Os recursos carregam independentemente e persistem as respostas no servidor local. Pedidos usam índice incremental; catálogo atualiza em cinco minutos e carrinhos em um minuto. Consulte atualizacao-dos-canais.md. Catálogo e carrinhos podem ficar prontos antes dos pedidos. A primeira consulta completa de 30 dias pode levar alguns minutos.

Prévia visual e prompts: Downloads/claude-migracao/artifacts/nuvemshop-mockups.
