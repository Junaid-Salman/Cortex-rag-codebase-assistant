// test-connection.js
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const { data, error } = await client.from('code_chunks').select('*').limit(1);

if (error) console.error('❌ Connection failed:', error.message);
else console.log('✅ Connected. Row count check passed:', data);