# Easypanel Configuration
# Este projeto deve ser hospedado como SITE ESTÁTICO

# O server.js é APENAS para desenvolvimento local da página conversas.html
# Todas as outras páginas funcionam sem servidor Node.js

# Instruções para deploy no Easypanel:
# 1. Crie um novo serviço do tipo "Static Site" ou "HTML"
# 2. Conecte ao repositório GitHub
# 3. Deixe o diretório raiz como "/"
# 4. NÃO configure build commands
# 5. O Easypanel vai servir os arquivos HTML diretamente

# Páginas disponíveis:
# - index.html (landing page)
# - crm.html (CRM)
# - crm-cliente.html (detalhes do cliente)
# - captacao.html (captação de leads)
# - carrinhos-abandonados.html
# - calculadora-custos.html
# - ranking-produtos.html
# - contatos.html

# NOTA: conversas.html requer o server.js rodando localmente
# Se quiser usar conversas.html em produção, crie um serviço Node.js separado
