const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://jytsrxrmgvliyyuktxsd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5dHNyeHJtZ3ZsaXl5dWt0eHNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5MDA0ODYsImV4cCI6MjA3NTQ3NjQ4Nn0.vxiQwV3DxFxfcqts4mgRjk9CRmzdhxKvKBM7XPCrKXQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkData() {
    const { data, error, count } = await supabase
        .from('cacife_orders')
        .select('created_at, total', { count: 'exact' });

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('Total Count:', count);

    // Group and count by date
    const groups = {};
    data.forEach(o => {
        const d = o.created_at.substring(0, 10);
        groups[d] = (groups[d] || 0) + 1;
    });

    console.log('Dates found:', JSON.stringify(groups, null, 2));
}

checkData();
