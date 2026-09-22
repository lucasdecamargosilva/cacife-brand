(async () => {
    const status = document.getElementById('recovery-status');
    const form = document.getElementById('recovery-form');
    const button = form.querySelector('button');
    const token = new URLSearchParams(location.hash.slice(1)).get('token_hash');
    // The recovery token stays out of referrers, history and subsequent page requests.
    history.replaceState(null, '', location.pathname);
    let client;
    const message = (text, kind = '') => { status.textContent = text; status.className = kind; };
    try {
        if (!token) throw new Error('Este link de recuperação está ausente ou já foi usado. Solicite um novo link.');
        client = window.supabase.createClient(window.SUPABASE_CONFIG.URL, window.SUPABASE_CONFIG.KEY);
        const { data, error } = await client.auth.verifyOtp({ token_hash: token, type: 'recovery' });
        if (error || !data.session || !data.user) throw new Error('Este link expirou ou já foi usado. Solicite um novo link.');
        message('Redefinindo o acesso de ' + data.user.email + '. Digite e confirme a nova senha abaixo.');
        form.hidden = false;
    } catch (error) { message(error.message, 'error'); return; }
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (form.elements.password.value !== form.elements.confirmation.value) {
            message('As senhas precisam ser iguais.', 'error'); return;
        }
        button.disabled = true;
        try {
            const { error } = await client.auth.updateUser({ password: form.elements.password.value });
            if (error) throw new Error('Não foi possível salvar a senha. Confira os requisitos e tente novamente.');
            form.reset(); form.hidden = true;
            message('Senha atualizada com sucesso. Seu acesso ao painel foi recuperado.', 'success');
            document.getElementById('recovery-done').hidden = false;
        } catch (error) { message(error.message, 'error'); }
        finally { button.disabled = false; }
    });
})();
