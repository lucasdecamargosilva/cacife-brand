# Validação local da Shopee — 16/09/2026

## Executar

`npm run dev:metricas` inicia somente em `127.0.0.1:8879`.

- Métricas reais existentes: http://127.0.0.1:8879/metricas.html
- Testes Shopee: http://127.0.0.1:8879/shopee-local.html
- Verificações: `npm test`.

O servidor local usa uma lista explícita de arquivos públicos. Não serve `.env`, código backend ou arquivos privados. O servidor legado de produção não foi alterado. Não publicar estas mudanças sem nova autorização do usuário.

## Credenciais e armazenamento

As credenciais de teste ficam em `%USERPROFILE%/.cacife-local/shopee-sandbox.json`, fora do repositório e da raiz pública. Estrutura: `partnerId` (número), `partnerKey` (segredo), `redirectReady` (booleano, padrão falso). Não inserir segredos no HTML, em commits ou nesta documentação.

Credenciais configuradas para o aplicativo da Cacife 242394, Test Partner ID 1244687. Nenhum token de loja obtido. O arquivo `sandbox-store.json`, na mesma pasta privada, será criado somente após autorização ou sincronização externa bem-sucedida. Tokens são separados por loja; refresh é serializado e salva o novo par antes de usar o acesso. O processo local não deve rodar em múltiplas instâncias usando o mesmo armazenamento.

## Implementação

- HMAC-SHA256 para chamadas públicas e de loja; host externo fixo no sandbox.
- Autorização com estado aleatório, cookie HTTP-only, validade de 10 minutos e consumo único; troca e renovação de tokens somente no servidor.
- Consultas divididas em janelas de 14 dias (limite API 15), páginas de 100 pedidos e lotes de 50 detalhes.
- Importação idempotente por loja + número do pedido, preservando a versão mais recente. Respostas incompletas e cursores repetidos interrompem a gravação do lote.
- Somente campos de identificação do pedido, moeda, estado, valores e datas são persistidos. Dados do comprador são descartados.
- A tela consulta alterações dos últimos 30 dias, manualmente. Não há cron, webhook, nem escrita no Supabase de produção.
- Pedidos sandbox não entram no consolidado real. A simulação usa o mesmo conector com transporte em memória, sem chamada externa e sem persistência.
- Valores BRL, `pay_time` como evidência de pagamento, cancelamentos e solicitações de devolução excluídos. `total_amount` é valor pago pelo comprador incluindo frete e promoções conforme API; não representa receita líquida/repasses. Reembolsos parciais e devoluções concluídas ainda exigem conciliação financeira antes de habilitar métricas reais da Shopee.

## Validações

Simulação: 4 pedidos, 2 pagos, R$ 289,40. Passaram renovação, paginação, repetição sem duplicidade, exclusão de cancelados. Testes adicionais cobrem assinaturas, moeda/valores inválidos, privacidade, concorrência de refresh, falha de detalhes, paginação cíclica, proteção de origem/host/CSRF e callback com estado/cookie/uso único.

Painel real, no navegador autenticado da Cacife: 18/08/2026 a 16/09/2026, Nuvemshop R$ 344.539,61 / 2.515 pedidos pagos; Mercado Livre R$ 202.558,70 / 2.635; total R$ 547.098,31 / 5.150. Snapshot de dados que continuam sincronizando; período inclui o dia atual incompleto.

## Dependências externas ainda abertas

1. O portal recusou `http://127.0.0.1:8879` como Test Redirect URL Domain. A edição foi descartada, mantendo o domínio anterior. Botão de autorização local permanece indisponível até um retorno aceito ser validado; não alterar `redirectReady` sem essa validação. Um domínio de desenvolvimento que resolva localmente ou outra solução de retorno deve ser validado com a Shopee; não foi criado túnel público.
2. A ferramenta Test Account-Sandbox v2 retornou ao formulário vazio após solicitar Local Shop / Brazil, sem exibir loja criada ou confirmação. Não há identificação ou credenciais de loja sandbox disponíveis, nem prova de criação concluída. Não repetir criação indiscriminadamente; conferir o portal/suporte.
3. App de produção continua em análise. Nenhuma autorização real de loja, importação externa de pedidos Shopee, deployment ou publicação foi realizada nesta etapa.

## Referências oficiais consultadas

- https://open.shopee.com/developer-guide/20
- https://open.shopee.com/developer-guide/644
- https://open.shopee.com/developer-guide/383
- https://open.shopee.com/documents/v2/v2.order.get_order_list?module=94&type=1
- https://open.shopee.com/documents/v2/v2.order.get_order_detail?module=94&type=1
