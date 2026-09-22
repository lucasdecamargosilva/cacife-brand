# Visões específicas por canal — 16/09/2026

Entrega somente local em http://127.0.0.1:8879/metricas.html, com tema claro e identidade roxa Provou Levou. A Visão Geral mantém a consolidação. Cada canal tem estrutura própria, além de uma faixa compacta de vendas do período.

## Mercado Livre — operação do vendedor

- Saúde da conta: reputação, reclamações, atrasos de preparação e cancelamentos, com a janela informada pela API.
- Exposição: anúncios ativos e pausados, visitas dos últimos 30 dias e distribuição diária.
- Atendimento: quantidade de perguntas sem resposta e até cinco textos pendentes, sem dados do comprador.
- Amostra de até 12 anúncios ativos: preço, quantidade disponível informada, vendidos acumulados e logística. A ordenação pedida à API não foi confirmada pela resposta real; a interface não apresenta a amostra como ranking.
- Vendas, pedidos pagos, ticket e comissões registradas continuam vindo de cacife_orders. Comissões não equivalem a lucro ou repasse.

Leitura real no navegador: reputação verde, 418 anúncios ativos, 440 pausados, 148.147 visitas na janela retornada e 9 perguntas pendentes. Reputação: 83 reclamações (1,24%), 19 atrasos (0,3%) e zero cancelamentos, janela de 60 dias. Contagens variam com a operação.

## Nuvemshop — recuperação e disponibilidade

Consulta direta à API 2025-03, loja Cacife Brand 1081093, com paginação completa de produtos e checkouts. Cache de até cinco minutos.

- Carrinhos em aberto, valor potencial em BRL, indisponibilidade de estoque e notificações registradas pela plataforma.
- Distribuição pelo tempo desde a criação do carrinho.
- Produtos presentes em mais carrinhos distintos, sem confundir com vendas.
- Catálogo: publicados, não publicados, variantes sem estoque e com uma a cinco unidades; variantes sem controle ou quantidade desconhecida são separadas.
- Fila de reposição: até 15 variantes publicadas com menor estoque.

Leitura real no navegador: 1.855 produtos, 1.329 publicados; 1.004 variantes publicadas sem estoque e 323 com estoque baixo. Foram retornados 1.610 carrinhos, com R$ 241.334,31 de valor potencial. Esse valor não é faturamento nem recuperação confirmada. A janela disponível de carrinhos é independente do filtro de vendas.

A tabela compartilhada abandoned_checkouts contém múltiplas lojas e não foi utilizada. O conector valida store_id em cada carrinho e não retorna dados pessoais dos compradores.

## Shopee e TikTok Shop

Páginas de preparação da conexão, sem repetir os blocos operacionais acima. Shopee: aplicativo da Cacife em análise, autorização de loja e sincronização real pendentes. O conector sandbox e os testes locais permanecem separados dos totais. TikTok Shop ainda não configurado.

## Escopo e segurança

As rotas locais exigem sessão local e JWT validado da conta Cacife. Credenciais ficam em %USERPROFILE%/.cacife-local/channels.json, fora do repositório e da área servida. Somente leituras nas APIs. Mercado Livre usa o token existente, sem alterar sua renovação. Recursos são fixos para a conta/loja Cacife; links de paginação não podem encaminhar credenciais para outros destinos.

Vendas usam criação do pedido e situação atual da base, com exclusão de cancelados/reembolsados e cálculo em centavos. Não há substituição silenciosa de paid_at. Visitas, reputação, carrinhos e posição de estoque têm janelas próprias explicitadas. Não se calcula conversão dividindo métricas de bases ou janelas diferentes.

## Validação

21 testes passaram, incluindo consolidação, detalhes financeiros, autorização, falha parcial de API, estoque publicado versus não gerenciado, carrinhos distintos por produto, isolamento de loja, paginação maliciosa e fluxo sandbox. Os novos blocos de Mercado Livre e Nuvemshop foram confirmados no navegador com respostas reais.

## Referências oficiais

- [Mercado Livre: reputação](https://developers.mercadolivre.com.br/reputacao-de-vendedores)
- [Mercado Livre: visitas](https://developers.mercadolivre.com.br/recurso-visits)
- [Mercado Livre: itens](https://developers.mercadolivre.com.br/itens-e-buscas)
- [Nuvemshop: produtos](https://nuvemshop.dev/en-US/api/resources/2025-03/product)
- [Nuvemshop: carrinhos abandonados](https://nuvemshop.dev/en-US/api/resources/2025-03/abandoned-checkout)
