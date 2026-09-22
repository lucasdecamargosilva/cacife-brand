# Métricas da Cacife

Página: `metricas.html`, acessível pelo menu de Pedidos. Reutiliza autenticação e configuração Supabase existentes. Não altera pedidos nem dispara sincronizações.

## Implementado

- Vendas confirmadas, pedidos pagos, ticket médio, total de pedidos e cancelados/reembolsados.
- Período personalizado, filtro de canal, evolução diária e participação dos canais.
- Comparação com intervalo anterior de igual duração em dias, horário de Brasília.
- Nuvemshop e Mercado Livre lidos da tabela existente `cacife_orders`.
- Shopee e TikTok Shop apresentados como não configurados, sem números fictícios.
- Estados de carregamento, erro e ausência de pedidos, com limpeza dos números anteriores ao trocar filtros.

## Contrato e limitações

A apuração usa `created_at` para selecionar pedidos, e seu estado atual para identificar pagamentos. Não é fluxo de caixa por `paid_at`. O total de vendas usa `total`, sem calcular lucro, taxas, repasses ou reembolsos parciais.

É necessário validar a granularidade da tabela: uma linha por pedido, identificado por `(channel, id_pedido)`. Se houver linhas por produto, o painel interrompe a apuração; não presume que os totais sejam somáveis ou repetidos. Canal nulo é tratado como Nuvemshop, conforme o histórico do projeto. Novos canais permanecem fora da soma até serem explicitamente habilitados após validação da ingestão.

Paginação ordenada por `created_at` e `id`, em blocos de 1.000, com limite de 100.000 registros por consulta. A consulta usa a sessão autenticada e as permissões existentes; não cria endpoint público ou credenciais novas. A política de acesso no banco precisa ser validada com a sessão da loja. Para grande volume, migrar a agregação para uma consulta no servidor com isolamento da loja e snapshot consistente.

## Pendências verificadas em 15/09/2026

- Site público respondeu normalmente, mas leitura usando a configuração pública local e publicada retornou HTTP 401. É preciso validar acesso com sessão autorizada e atualizar a configuração se necessário. Nenhum número real foi validado.
- Código existente de Mercado Livre inclui reputação, perguntas e anúncios. Existência do código não comprova que os tokens ou a sincronização estão ativos.
- Usuário informou aprovação na Shopee, mas não localizou configuração anterior do aplicativo. Falta configurar aplicativo, callback, credenciais no servidor, autorização da loja, persistência/renovação de tokens e sincronização paginada de pedidos.
- TikTok Shop exige levantamento equivalente. Nenhum conector novo foi implementado nesta primeira entrega.
- Antes de habilitar novos canais, validar estados de pedido/pagamento, moeda, total, cancelamentos e granularidade com exemplos reais e documentação oficial vigente. Guardar IDs como texto e impor unicidade por loja, canal e ID externo.

## Validação

`node --test metricas-core.test.js` cobre totais, cancelamentos, colisão de IDs entre canais, duplicidades, valores monetários e limites de data. Validação visual local usa dados sintéticos apenas no navegador de teste; o produto não contém modo de demonstração ou dados fictícios.

Entrega local, ainda não publicada.

## Direção visual aprovada pelo usuário

Estrutura da imagem de referência fornecida: menu lateral, cinco cartões (Shopee, TikTok Shop, Mercado Livre, Nuvemshop e total), gráficos de vendas/participação/pedidos, tabela de desempenho, evolução acumulada, ranking e insights. Aplicada à identidade Provou Levou, com roxo `#7c3aed`, lavanda `#a78bfa`, tema claro com superfícies brancas, fundo lavanda suave e logotipo existente da marca. Ícones das plataformas preservam suas cores de identificação.

O ranking mostra uma pendência explícita e liga ao ranking já existente; não há ranking multicanal implementado sem validar itens e valores por produto. Conversão aparece indisponível por falta de visitas. Evolução é acumulada dentro do período selecionado, não uma série mensal de histórico que não foi consultado. Relatório CSV exporta apenas os totais consultados, com estado explícito para canais não configurados.

## Conexão real validada em 15/09/2026

A configuração pública do painel continha uma chave anon anterior à rotação. Foi atualizada usando a chave pública vigente da mesma instância Supabase. Nenhuma chave privilegiada foi adicionada ao frontend. A consulta autenticada na sessão da Cacife foi validada no navegador local e bateu com a auditoria independente da base.

Intervalo consultado: 17/08/2026 a 15/09/2026, horário de Brasília. Snapshot às 21:04:10 (os dados continuam sendo atualizados):

- Nuvemshop: 2.519 pedidos pagos, R$ 340.522,04 em vendas confirmadas.
- Mercado Livre: 2.736 pedidos pagos, R$ 209.141,21 em vendas confirmadas.
- Consolidado: 5.255 pedidos pagos, R$ 549.663,25.
- Consulta com período anterior: 12.531 registros, sem duplicidades que bloqueassem o cálculo.

Os resultados anteriores de HTTP 401 e ausência de validação foram resolvidos no ambiente local. A versão pública ainda não recebeu estas alterações.

### Recuperação de acesso

Usuário solicitou redefinir a senha esquecida da Cacife. Conta confirmada: cacifebrand@outlook.com. Foi gerado um fluxo de recuperação de uso único, consumido pela página local `redefinir-senha.html`; o token foi removido da URL e não foi gravado no repositório. A nova senha deve ser digitada e salva pelo usuário. Não houve alteração de senha pelo agente. A sessão de recuperação permitiu validar a leitura dos dados reais no painel.

### Shopee

A conta do desenvolvedor estava autenticada e sem aplicativos. Foi criado `Provou Levou Metricas`, categoria `Seller In House System`, com logotipo da marca, descrição de métricas da própria loja e domínio de retorno de teste `https://cacife.quanticsolutions.com.br`. Test Partner ID: 1244572. Estado confirmado: `Developing`.

O formulário `Go-Live` informa que a Shopee revisará a solicitação e só depois emitirá Partner ID/Key de produção. Requer introdução, screenshot do produto e gerenciamento de IP autorizado. Solicitação de produção ainda não enviada, nenhuma chave revelada e nenhuma loja autorizada. Formulário preservado na aba do navegador. Ainda falta identificar a loja pessoal do usuário (pergunta enviada), implementar/publicar callback e sincronização, solicitar liberação e autorizar a loja. Não confundir aprovação da conta de desenvolvedor com aprovação de produção do novo aplicativo.

## Conta da Cacife e solicitação de produção — 16/09/2026

O usuário esclareceu que a conexão deve usar a conta de desenvolvedor da própria Cacife e entrou nela no navegador. Essa conta não possuía aplicativos. Foi criado o aplicativo `Cacife Metricas Provou Levou` (App 242394, Test Partner ID 1244687), categoria `Seller In House System`.

Solicitação Go-Live enviada e recebimento confirmado pela Shopee: `Application to go live is under review`. O portal informa que o resultado será enviado ao e-mail da conta em até 24 horas. Estado do app permanece `Developing` durante a análise. Página: https://open.shopee.com/console/app/242394

Informações enviadas: site existente https://cacife.quanticsolutions.com.br; descrição explícita de que o conector Shopee está em desenvolvimento; screenshot da nova interface com dados fictícios de teste e identificação de prévia; domínios de retorno de teste e produção no mesmo domínio; IP 72.61.128.136 (resolução DNS atual do domínio). Nenhuma credencial de teste do painel ou dado real de comprador foi enviado. Lista de IP está cadastrada, mas o portal exibe whitelist desativada; conferir IP de saída e habilitar a restrição ao configurar o servidor do conector.

O aplicativo anterior `Provou Levou Metricas` (App 242282, Test Partner ID 1244572) pertence à conta anterior de Lucas, não à Cacife, e não deve ser usado nesta integração. Não foi excluído.

Próximas dependências: aprovação da Shopee, implementação/publicação do callback e sincronização, credenciais de produção no servidor e autorização da loja. Nenhum pedido da Shopee foi importado ainda. Nenhuma chave do app foi revelada ou copiada nesta etapa.
