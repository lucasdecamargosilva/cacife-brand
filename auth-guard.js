// auth-guard.js

// Carregar dependências do Supabase se ainda não estiverem na página
if (!window.supabase) {
    // Isso é um fallback, mas o ideal é ter o script do Supabase no HTML antes deste arquivo
    console.warn("Supabase client not found. Ensure supabase.js is loaded.");
}

async function initAuthGuard() {
    if (!window.SUPABASE_CONFIG) {
        console.error("SUPABASE_CONFIG not found!");
        return;
    }

    const { createClient } = supabase;
    const client = createClient(window.SUPABASE_CONFIG.URL, window.SUPABASE_CONFIG.KEY);

    // 1. Verificar Sessão
    const { data: { session }, error } = await client.auth.getSession();

    // Se estivermos na página de login, e tiver sessão -> vai pro index
    const isLoginPage = window.location.pathname.endsWith('login.html');

    if (isLoginPage) {
        if (session) {
            window.location.href = 'index.html';
        }
        return; // Não faz mais nada na tela de login
    }

    // Se NÃO for login page...
    if (!session) {
        // Sem permissão -> manda pro login
        // Salva a URL original para redirecionar de volta depois (opcional, por enquanto simples)
        window.location.href = 'login.html';
        return;
    }

    // 2. Setup do Botão de Logout (se existir na página)
    const setupLogout = () => {
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            console.log("Logout button found, adding listener...");
            logoutBtn.onclick = async (e) => {
                e.preventDefault();
                console.log("Logging out...");
                logoutBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Saindo...';
                await client.auth.signOut();
                window.location.href = 'login.html';
            };
        }
    };
    setupLogout();
}

// Executar assim que carregar (ou esperar o DOM se o script estiver no head)
document.addEventListener('DOMContentLoaded', () => {
    // Pequeno delay para garantir que config e supabase.js carregaram
    setTimeout(initAuthGuard, 100);
});
