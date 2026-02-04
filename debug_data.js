const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jytsrxrmgvliyyuktxsd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5dHNyeHJtZ3ZsaXl5dWt0eHNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5MDA0ODYsImV4cCI6MjA3NTQ3NjQ4Nn0.vxiQwV3DxFxfcqts4mgRjk9CRmzdhxKvKBM7XPCrKXQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkData() {
    const startDate = '2025-01-01T00:00:00Z';
    const endDate = '2025-01-31T23:59:59Z';

    const { data, error, count } = await supabase
        .from('cacife_orders')
        .select('*', { count: 'exact' })
        .gte('created_at', startDate)
        .lte('created_at', endDate);

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('Count for Jan 2025:', count);
    if (data.length > 0) {
        console.log('Sample Data:', JSON.stringify(data.slice(0, 2), null, 2));
        const total = data.reduce((acc, curr) => acc + (parseFloat(curr.total) || 0), 0);
        console.log('Sum of Total:', total);
    }
}

checkData();
