
// sync-orders.js
// Logic to automatically sync orders from 'cacife_orders' to 'opportunities'

async function syncOrdersToCRM() {
    if (!window.CRM_LOGIC || !window.supabase) {
        console.warn('CRM Logic or Supabase not initialized for sync.');
        return;
    }

    const client = window.supabase.createClient(
        window.SUPABASE_CONFIG.URL,
        window.SUPABASE_CONFIG.KEY
    );

    try {
        // 1. Fetch all recent orders (e.g., last 30 days to avoid huge fetch)
        // Or just fetch all if volume is manageable. Let's try last 60 days for safety.
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 60);

        const { data: orders, error } = await client
            .from('cacife_orders')
            .select('*')
            .gte('created_at', startDate.toISOString());

        if (error) throw error;
        if (!orders || orders.length === 0) return;

        console.log(`Syncing ${orders.length} orders to CRM...`);

        // 2. Fetch all existing opportunities to check for duplicates
        // Assuming unique identifier is order_id or we check by email/name?
        // Since opportunities table might not have order_id, we might need to check by contact email/phone
        // BUT better practice: add 'order_id' column to opportunities if possible.
        // For now, let's assume we map by email + product or unique ID if available. 
        // Let's use a "upsert" strategy based on a unique key if possible, OR check existence.
        // Given current structure, we'll check by 'email' and 'stage' loosely, or just 'email'.
        // Actually, to avoid re-creating leads for the same order, we need a reliable dedupe.
        // We will try to match by Email + Company (Product Name in this context?).

        // Fetch existing opps
        const existingOpps = await window.CRM_LOGIC.fetchCrmData('cacife');
        const existingMap = new Set(existingOpps.map(o => o.email + '|' + o.stage)); // Simple fingerprint

        let newCount = 0;
        let updateCount = 0;

        for (const order of orders) {
            const status = mapStatusToStage(order);
            const email = order.customer_email || 'sem-email@exemplo.com';
            const name = order.customer_name || 'Cliente Sem Nome';
            const phone = order.customer_phone || '---';
            const product = order.product_name || order.produtct_name || 'Produto Desconhecido';
            const revenue = order.total || 0;

            // Check if this specific order is already in CRM?
            // Since we don't have order_id in opps, we might duplicate if status changes?
            // Ideally: We should find an opp for this email and UPDATE stage if needed.

            // Strategy: Find opp by email. If exists, update stage. If not, create.
            // Risk: User might have multiple orders. 
            // Better: Find opp by email AND product name? Or just assume 1 lead per person active?
            // Let's look for an opp with this Email.

            const { data: existingLead, error: leadError } = await client
                .from('contacts') // Check contact first
                .select('id, opportunities(id, stage)')
                .eq('email', email)
                .maybeSingle(); // Assuming 1 contact per email

            if (existingLead) {
                // Contact exists. Check opportunity.
                if (existingLead.opportunities && existingLead.opportunities.length > 0) {
                    // Update latest opp stage if different
                    const opp = existingLead.opportunities[0];
                    if (opp.stage !== status) {
                        await window.CRM_LOGIC.updateLeadStage(opp.id, status);
                        updateCount++;
                    }
                } else {
                    // Contact exists but no opp? Create opp.
                    await createOpportunity(client, existingLead.id, status, product);
                    newCount++;
                }
            } else {
                // New Contact + New Opportunity
                await createFullLead(client, name, email, phone, product, status, revenue);
                newCount++;
            }
        }

        console.log(`Sync complete. New: ${newCount}, Updated: ${updateCount}`);
        if (newCount > 0 || updateCount > 0) {
            if (typeof loadData === 'function') loadData(); // Reload board if on CRM page
        }

    } catch (err) {
        console.error('Error syncing orders:', err);
    }
}

function mapStatusToStage(order) {
    const shipStatus = (order.shipping_status || '').toLowerCase().trim();
    const status = (order.status || '').toLowerCase().trim(); // Status geral do pedido

    // 1. Regras explícitas de Shipping Status (Prioridade Alta)
    if (shipStatus === 'entregue' || shipStatus === 'delivered') return 'Entregues';
    if (shipStatus === 'enviado' || shipStatus === 'shipped') return 'Enviados';
    if (shipStatus === 'não está embalado' || shipStatus === 'nao esta embalado' || shipStatus.includes('não esta embalado') || shipStatus.includes('nao está embalado')) return 'A Enviar';

    // Alguns sistemas marcam cancelado no shipping, outros no status geral
    if (shipStatus === 'cancelado' || shipStatus === 'cancelled' || status === 'cancelled' || status === 'cancelado') return 'Cancelados';

    // 2. Outros status (Fallback)
    if (status === 'refunded' || status === 'reembolsado') return 'Trocas e Devoluções';

    // 3. Se não caiu nas regras acima, verifica pagamento para 'Novo Pedido'
    const payStatus = (order.payment_status || '').toLowerCase();
    if (payStatus === 'paid' || payStatus === 'approved' || payStatus === 'pago') return 'Novo Pedido';

    return 'Novo Pedido'; // Default final
}

async function createOpportunity(client, contactId, stage, pipeline = 'Cacife') {
    const { error } = await client
        .from('opportunities')
        .insert({
            contact_id: contactId,
            pipeline: 'Cacife',
            stage: stage,
            responsible_name: 'Não atribuído',
            tags: ['Importado'],
            created_at: new Date().toISOString()
        });
    if (error) console.error('Error creating opp:', error);
}

async function createFullLead(client, name, email, phone, company, stage, revenue) {
    // 1. Create Contact
    const { data: contact, error: cError } = await client
        .from('contacts')
        .insert({
            full_name: name,
            email: email,
            phone: phone,
            company_name: company, // Storing product as company/context
            monthly_revenue: revenue,
            created_at: new Date().toISOString()
        })
        .select()
        .single();

    if (cError) {
        console.error('Error creating contact:', cError);
        return;
    }

    // 2. Create Opportunity
    await createOpportunity(client, contact.id, stage);
}
