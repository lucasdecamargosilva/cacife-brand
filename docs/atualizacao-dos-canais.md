# Atualização local dos painéis

## Experiência

- A primeira consulta a um período ainda depende da API; consultas seguintes abrem a última resposta salva no servidor local.
- A atualização ocorre em segundo plano. Os dados continuam visíveis, com horário da consulta e indicação de atualização ou falha.
- A página consulta novamente a cada minuto quando está visível e sem um campo em edição. Enquanto uma atualização está pendente, consulta apenas os recursos pendentes a cada dois segundos.
- O botão Atualizar força uma nova busca, mantendo a resposta anterior na tela.
- Filtros de busca e seleção são preservados quando os dados atualizam. Períodos diferentes passam pelo filtro correspondente, sem apresentar o período anterior como atual.

## Mercado Livre

- Resumo salvo por um minuto; pedidos por período por dois minutos. Respostas persistem entre reinícios do servidor.
- Um intervalo menor pode aproveitar uma consulta maior já disponível; o servidor recorta os pedidos pela data de criação e recalcula a quantidade.
- Comparação com período anterior usa resposta própria, também persistida. As atualizações do Mercado Livre ainda consultam todas as páginas do intervalo: não se presume que apenas novos pedidos mudem, pois pagamentos, cancelamentos e reembolsos também mudam.
- Catálogo, perguntas e envios preservam o cache de leitura e as consultas simultâneas compartilhadas existentes.
- Ao receber 401, relê a credencial compartilhada e faz renovação limitada quando necessária. Não reinicia a consulta de toda a tela por um único recurso em falha.

## Nuvemshop

- Um índice de pedidos cobre todos os períodos desde a data inicial já carregada. Mudar para 7, 15 ou 30 dias reaproveita o índice quando o intervalo está coberto.
- Após a carga inicial, busca apenas pedidos com updated_at recente, com sobreposição de dois minutos. Atualiza pelo ID para refletir pagamentos, cancelamentos e reembolsos sem duplicação.
- Solicitar uma data inicial anterior à cobertura existente exige uma nova carga histórica.
- Lotes de 30 pedidos: consultas maiores apresentaram paid_at ausente em pedidos cujo detalhe tinha a data. O teste real com 30 resolveu todas as datas ausentes na janela auditada.
- Catálogo: cinco minutos. Carrinhos: um minuto. Resposta anterior disponível enquanto o recurso atualiza.

## Proteção e testes

Arquivos ficam em `~/.cacife-local/channel-cache`, fora dos arquivos públicos. Contêm apenas as respostas selecionadas pelo backend. Credenciais não são gravadas nesse cache. Cada leitura exige autorização da conta Cacife e sessão local com CSRF. Cache não elimina autenticação.

Testes cobrem reabertura do cache após reinício, atualização em segundo plano sem bloqueio, falha preservando dados anteriores, consultas simultâneas compartilhadas, recorte de período, atualização incremental por ID e autorização antes de retornar dados salvos.

Tudo permanece local; não foram ativados webhooks públicos ou serviços em produção.
