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

async function fetchCrmData(pipelineName = 'starter') {
    if (!crmClient) return [];

    // Normalize pipeline name
    let dbPipeline = pipelineName;
    if (pipelineName === 'cacife') dbPipeline = 'Cacife';

    try {
        const { data, error } = await crmClient
            .from('opportunities')
            .select(`
                id,
                stage,
                pipeline,
                responsible_name,
                tags,
                lead_status,
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

        if (error) {
            console.error('Error fetching CRM data:', error);
            return [];
        }

        return data.map(opp => ({
            id: opp.id,
            contactId: opp.contacts ? opp.contacts.id : null,
            name: opp.contacts ? opp.contacts.full_name : 'Sem Nome',
            company: opp.contacts ? opp.contacts.company_name : 'Sem Empresa',
            revenue: opp.contacts ? opp.contacts.monthly_revenue : 'R$ 0,00',
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
            lead_status: opp.lead_status || 'frio'
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

async function updateLeadStage(leadId, newStage) {
    if (!crmClient) return;

    try {
        const { error } = await crmClient
            .from('opportunities')
            .update({ stage: newStage, updated_at: new Date().toISOString() })
            .eq('id', leadId);

        if (error) {
            console.error('Error updating stage in DB:', error);
            if (window.showToast) window.showToast("Erro ao atualizar etapa", "error");
        } else {
            if (window.showToast) window.showToast("Etapa atualizada!", "success");
        }
    } catch (err) {
        console.error('Update stage catch error:', err);
    }
}

async function batchUpdateLeadStages(leadIds, newStage) {
    if (!crmClient || !leadIds || leadIds.length === 0) return;

    try {
        const { error } = await crmClient
            .from('opportunities')
            .update({ stage: newStage, updated_at: new Date().toISOString() })
            .in('id', leadIds);

        if (error) {
            console.error('Error batch updating stages:', error);
            if (window.showToast) window.showToast("Erro na atualização em massa", "error");
        } else {
            if (window.showToast) window.showToast(`${leadIds.length} leads atualizados!`, "success");
        }
    } catch (err) {
        console.error('Batch update catch error:', err);
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
