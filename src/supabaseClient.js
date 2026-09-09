import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export const getAdminToken = () => {
  try {
    return localStorage.getItem('siklog_admin_token');
  } catch {
    return null;
  }
};

export const setAdminToken = (token) => {
  try {
    if (token) {
      localStorage.setItem('siklog_admin_token', token);
    } else {
      localStorage.removeItem('siklog_admin_token');
    }
  } catch {}
};
