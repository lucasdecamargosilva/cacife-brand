// CRM Logic - Fetching and updating data from Supabase
let crmClient;

function initCrmSupabase() {
    if (window.supabase && window.SUPABASE_CONFIG) {
        crmClient = window.supabase.createClient(
            window.SUPABASE_CONFIG.URL,
            window.SUPABASE_CONFIG.KEY
        );
        return true;
    }
    return false;
}

async function fetchCrmData(pipelineName = 'starter', startDate = null, endDate = null) {
    if (!crmClient) return [];

    try {
        if (pipelineName === 'abandoned') {
            let allAbandoned = [];
            let from = 0;
            let to = 999;
            let hasMore = true;

            while (hasMore) {
                let query = crmClient
                    .from('abandoned_checkouts')
                    .select('*')
                    .order('created_at', { ascending: false });

                if (startDate) query = query.gte('created_at', startDate);
                if (endDate) query = query.lte('created_at', endDate);

                const { data, error } = await query.range(from, to);

                if (error) {
                    console.error('Error fetching abandoned CRM data:', error);
                    break;
                }

                allAbandoned = [...allAbandoned, ...data];

                if (data.length < 1000) {
                    hasMore = false;
                } else {
                    from += 1000;
                    to += 1000;
                }
            }

            return allAbandoned.map(item => {
                let stage = 'Carrinho Abandonado';
                const stageRec = (item.stage_recuperacao || '').toLowerCase();

                if (item.recovered_at) {
                    stage = 'Carrinho Recuperado';
                } else if (stageRec.includes('msg3')) {
                    stage = 'Mensagem 3';
                } else if (stageRec.includes('msg2')) {
                    stage = 'Mensagem 2';
                } else if (stageRec.includes('msg1')) {
                    stage = 'Mensagem 1';
                }

                return {
                    id: item.id,
                    contactId: null,
                    name: item.contact_name || 'Sem Nome',
                    company: 'Carrinho Abandonado',
                    revenue: parseFloat(item.total) || 0,
                    phone: item.contact_phone || '---',
                    email: item.contact_email || '---',
                    stage: stage,
                    note: item.note,
                    checkoutUrl: item.abandoned_checkout_url,
                    created_at: item.created_at,
                    tags: ['Abandono'],
                    responsible: 'Automático',
                    isAbandoned: true
                };
            });
        }

        // Normalize pipeline name
        let dbPipeline = pipelineName;
        if (pipelineName === 'cacife') dbPipeline = 'Cacife';

        let allOpps = [];
        let from = 0;
        let to = 999;
        let hasMore = true;

        while (hasMore) {
            let query = crmClient
                .from('opportunities')
                .select(`
                    id,
                    stage,
                    pipeline,
                    responsible_name,
                    tags,
                    lead_status,
                    created_at,
                    contacts (
                        id,
                        full_name,
                        company_name,
                        phone,
                        email,
                        monthly_revenue,
                        business_type,
                        audience_type,
                        acquisition_channels,
                        client_volume,
                        biggest_difficulty,
                        website
                    )
                `)
                .eq('pipeline', dbPipeline);

            if (startDate) query = query.gte('created_at', startDate);
            if (endDate) query = query.lte('created_at', endDate);

            const { data, error } = await query.range(from, to);

            if (error) {
                console.error('Error fetching CRM data:', error);
                break;
            }

            allOpps = [...allOpps, ...data];

            if (data.length < 1000) {
                hasMore = false;
            } else {
                from += 1000;
                to += 1000;
            }
        }

        return allOpps.map(opp => ({
            id: opp.id,
            contactId: opp.contacts ? opp.contacts.id : null,
            name: opp.contacts ? opp.contacts.full_name : 'Sem Nome',
            company: opp.contacts ? opp.contacts.company_name : 'Sem Empresa',
            revenue: opp.contacts ? (typeof opp.contacts.monthly_revenue === 'string' ? parseFloat(opp.contacts.monthly_revenue.replace(/[^0-9.-]+/g, "")) : opp.contacts.monthly_revenue) : 0,
            phone: opp.contacts ? opp.contacts.phone : '---',
            email: opp.contacts ? opp.contacts.email : '---',
            stage: opp.stage,
            business: opp.contacts ? opp.contacts.business_type : '---',
            audience: opp.contacts ? opp.contacts.audience_type : '---',
            channels: opp.contacts ? opp.contacts.acquisition_channels : '---',
            volume: opp.contacts ? opp.contacts.client_volume : '---',
            difficulty: opp.contacts ? opp.contacts.biggest_difficulty : '---',
            site: opp.contacts ? opp.contacts.website : '---',
            responsible: opp.responsible_name || 'Não atribuído',
            tags: opp.tags || [],
            lead_status: opp.lead_status || 'frio',
            isAbandoned: false
        }));
    } catch (err) {
        console.error('Fetch CRM data catch error:', err);
        return [];
    }
}


async function updateOpportunityDetails(oppId, contactId, details) {
    if (!crmClient) return;

    try {
        // Update opportunity
        if (details.oppData) {
            const { error: oppError } = await crmClient
                .from('opportunities')
                .update(details.oppData)
                .eq('id', oppId);

            if (oppError) throw oppError;
        }

        // Update contact
        if (contactId && details.contactData) {
            const { error: contactError } = await crmClient
                .from('contacts')
                .update(details.contactData)
                .eq('id', contactId);

            if (contactError) throw contactError;
        }

        if (window.showToast) window.showToast("Dados atualizados!", "success");
        return true;
    } catch (err) {
        console.error('Update details catch error:', err);
        if (window.showToast) window.showToast("Erro ao atualizar dados", "error");
        return false;
    }
}

async function updateLeadStage(leadId, newStage, isAbandoned = false) {
    if (!crmClient) return;

    try {
        if (isAbandoned) {
            const updateObj = {};

            if (newStage === 'Carrinho Recuperado') {
                updateObj.recovered_at = new Date().toISOString();
            } else if (newStage === 'Mensagem 1') {
                updateObj.stage_recuperacao = 'msg1';
            } else if (newStage === 'Mensagem 2') {
                updateObj.stage_recuperacao = 'msg1, msg2';
            } else if (newStage === 'Mensagem 3') {
                updateObj.stage_recuperacao = 'msg1, msg2, msg3';
            } else if (newStage === 'Carrinho Abandonado') {
                updateObj.stage_recuperacao = '';
                updateObj.recovered_at = null;
            }

            const { error } = await crmClient
                .from('abandoned_checkouts')
                .update(updateObj)
                .eq('id', leadId);

            if (error) throw error;
        } else {
            const { error } = await crmClient
                .from('opportunities')
                .update({ stage: newStage, updated_at: new Date().toISOString() })
                .eq('id', leadId);

            if (error) throw error;
        }

        if (window.showToast) window.showToast("Etapa atualizada!", "success");
    } catch (err) {
        console.error('Update stage catch error:', err);
        if (window.showToast) window.showToast("Erro ao atualizar etapa", "error");
    }
}

async function batchUpdateLeadStages(leadIds, newStage, isAbandoned = false) {
    if (!crmClient || !leadIds || leadIds.length === 0) return;

    try {
        if (isAbandoned) {
            const updateObj = {};
            if (newStage === 'Carrinho Recuperado') updateObj.recovered_at = new Date().toISOString();
            else if (newStage === 'Mensagem 1') updateObj.stage_recuperacao = 'msg1';
            else if (newStage === 'Mensagem 2') updateObj.stage_recuperacao = 'msg1, msg2';
            else if (newStage === 'Mensagem 3') updateObj.stage_recuperacao = 'msg1, msg2, msg3';
            else if (newStage === 'Carrinho Abandonado') { updateObj.stage_recuperacao = ''; updateObj.recovered_at = null; }

            const { error } = await crmClient
                .from('abandoned_checkouts')
                .update(updateObj)
                .in('id', leadIds);
            if (error) throw error;
        } else {
            const { error } = await crmClient
                .from('opportunities')
                .update({ stage: newStage, updated_at: new Date().toISOString() })
                .in('id', leadIds);
            if (error) throw error;
        }

        if (window.showToast) window.showToast(`${leadIds.length} leads atualizados!`, "success");
    } catch (err) {
        console.error('Batch update catch error:', err);
        if (window.showToast) window.showToast("Erro na atualização em massa", "error");
    }
}

async function deleteOpportunity(oppId) {
    if (!crmClient) return false;

    try {
        const { error } = await crmClient
            .from('opportunities')
            .delete()
            .eq('id', oppId);

        if (error) throw error;

        if (window.showToast) window.showToast("Oportunidade excluída", "success");
        return true;
    } catch (err) {
        console.error('Delete opportunity error:', err);
        if (window.showToast) window.showToast("Erro ao excluir oportunidade", "error");
        return false;
    }
}

async function fetchAILeadInfo(username) {
    if (!crmClient) return null;

    // Remove @ if present for search
    const cleanUser = username.startsWith('@') ? username.substring(1) : username;

    try {
        // Search in leads_capturados_posts which often has AI analysis
        const { data, error } = await crmClient
            .from('leads_capturados_posts')
            .select('*')
            .eq('username', cleanUser)
            .maybeSingle();

        if (error) {
            console.warn('AI Lead info fetch error (not critical):', error);
            return null;
        }

        return data;
    } catch (err) {
        console.error('Fetch AI info catch error:', err);
        return null;
    }
}

async function fetchPipelineSummary() {
    if (!crmClient) return { total: { starter: 0, growth: 0, enterprise: 0 }, stages: { starter: {}, growth: {}, enterprise: {} } };

    try {
        const { data, error } = await crmClient
            .from('opportunities')
            .select('pipeline, stage, responsible_name, contacts(acquisition_channels)');

        if (error) throw error;

        const summary = {
            total: { starter: 0, growth: 0, enterprise: 0 },
            stages: { starter: {}, growth: {}, enterprise: {} },
            responsible: {},
            salesByResponsible: {},
            meetingsByResponsible: {},
            channels: {}
        };

        const SALES_STAGE = "Venda Realizada";
        const MEETING_STAGE = "Reunião Agendada";

        data.forEach(opp => {
            const p = opp.pipeline ? opp.pipeline.toLowerCase() : '';
            const stage = (opp.stage || '').toLowerCase();
            const resp = opp.responsible_name || 'Não atribuído';
            const channel = opp.contacts ? opp.contacts.acquisition_channels : null;

            if (channel) {
                summary.channels[channel] = (summary.channels[channel] || 0) + 1;
            }

            summary.responsible[resp] = (summary.responsible[resp] || 0) + 1;

            if (stage === "venda realizada" || stage === "entregue") {
                summary.salesByResponsible[resp] = (summary.salesByResponsible[resp] || 0) + 1;
            }

            // Group all by the single pipeline now
            summary.total.starter++;
            summary.stages[stage] = (summary.stages[stage] || 0) + 1;
        });

        return summary;
    } catch (err) {
        console.error('Summary fetch error:', err);
        return { total: { starter: 0, growth: 0, enterprise: 0 }, stages: { starter: {}, growth: {}, enterprise: {} } };
    }
}

// Subscribe to real-time changes
function subscribeToCrmChanges(callback) {
    if (!crmClient) return;

    crmClient
        .channel('crm-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'opportunities' }, payload => {
            console.log('CRM Change detected!', payload);
            callback();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, payload => {
            console.log('Contact Change detected!', payload);
            callback();
        })
        .subscribe();
}

window.CRM_LOGIC = {
    fetchCrmData,
    fetchPipelineSummary,
    updateLeadStage,
    batchUpdateLeadStages,
    updateOpportunityDetails,
    deleteOpportunity,
    fetchAILeadInfo,
    subscribeToCrmChanges,
    initCrmSupabase
};
