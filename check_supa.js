const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://jytsrxrmgvliyyuktxsd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5dHNyeHJtZ3ZsaXl5dWt0eHNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5MDA0ODYsImV4cCI6MjA3NTQ3NjQ4Nn0.vxiQwV3DxFxfcqts4mgRjk9CRmzdhxKvKBM7XPCrKXQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkData() {
    // Yesterday
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const startDate = d.toLocaleDateString('sv-SE');
    const endDate = startDate + ' 23:59:59';

    console.log(`Checking data for yesterday: ${startDate} to ${endDate}`);

    const { data: recuperados, error: err1 } = await supabase
        .from('vw_carrinhos_recuperados')
        .select('*')
        .neq('contact_identification', 'TOTAL RECUPERADO')
        .gte('data_pedido', startDate)
        .lte('data_pedido', endDate);

    if (err1) {
        console.error('Error fetching view:', err1);
    } else {
        console.log('Recuperados found:', recuperados.length);
        if (recuperados.length > 0) console.log(recuperados);
    }

    const { data: abandonos, error: err2 } = await supabase
        .from('abandoned_checkouts')
        .select('id, created_at, contact_identification')
        .gte('created_at', startDate)
        .lte('created_at', endDate);

    if (err2) {
        console.error('Error fetching abandoned checkouts:', err2);
    } else {
        console.log('Abandonos found:', abandonos.length);
        if (abandonos.length > 0 && abandonos.length <= 5) console.log(abandonos);
    }
}

checkData();
