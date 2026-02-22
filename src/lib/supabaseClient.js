import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const SUPABASE_URL = 'https://ymzygbjihhttszijdkei.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_cUXkuDrgyqtyRqh1rmH1HQ_PYwi7nxX';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
    },
});
