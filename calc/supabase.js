// Supabase integration for history persistence
// Public anon key only (safe for client). Do NOT place service role key here.

const SUPABASE_URL = 'https://syqlpodcfjljdcjjqgzi.supabase.co';
// Provided anon public key (JWT for anon role). Consider moving to an env injection in future.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5cWxwb2RjZmpsamRjampxZ3ppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1OTM4NzUsImV4cCI6MjA3NTE2OTg3NX0.Qrbj61WIGC-FPBsn8T__xHycFAqyALSvZGFK6MTa9vk';

let supabaseClient = null; // will also be exposed on window for debugging
let supabaseSyncPending = false;
let lastSynced = new Set();
let supabaseInitStarted = false;
const supabaseEnabled = true; // toggle if needed

function setSupabaseStatus(text, color) {
    const el = document.getElementById('supabaseStatus');
    if (el) {
        el.textContent = text;
        if (color) el.style.color = color; else el.style.color = '';
    }
}

function initSupabase() {
    if (!supabaseEnabled) return;
    if (supabaseInitStarted) return;
    supabaseInitStarted = true;
    if (!window.supabase) {
        console.warn('Supabase JS library not loaded');
        setSupabaseStatus('Lib missing', 'red');
        return;
    }
    setSupabaseStatus('Connecting…');
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false }
    });
    // expose globally for console debugging
    window.supabaseClient = supabaseClient;
    loadHistoryFromSupabase();
}

async function loadHistoryFromSupabase() {
    if (!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient
            .from('history_entries')
            .select('phrase, created_at')
            .order('created_at', { ascending: true });
        if (error) {
            console.warn('Supabase load error', error);
            setSupabaseStatus('Load error', 'red');
            return;
        }
        if (Array.isArray(data)) {
            let added = 0;
            data.forEach(row => {
                if (row.phrase && sHistory.indexOf(row.phrase) === -1) {
                    sHistory.push(row.phrase);
                    lastSynced.add(row.phrase);
                    added++;
                }
            });
            if (added > 0 && typeof Open_History === 'function') {
                Open_History();
            }
            setSupabaseStatus(`Loaded${data.length ? ' ('+data.length+')' : ''}`,'#2c7');
            if (data.length === 0) {
                // clarify empty remote state
                console.info('[Supabase] No rows yet – add a phrase and it will sync automatically.');
            }
        }
    } catch (e) {
        console.warn('Supabase load exception', e);
        setSupabaseStatus('Load exception', 'red');
    }
}

function queueSupabaseSync() {
    if (!supabaseClient || !supabaseEnabled) return;
    if (supabaseSyncPending) return;
    supabaseSyncPending = true;
    setSupabaseStatus('Pending sync…');
    setTimeout(syncHistoryToSupabase, 600); // debounce
}

async function syncHistoryToSupabase() {
    supabaseSyncPending = false;
    if (!supabaseClient) return;
    const newPhrases = sHistory.filter(p => !lastSynced.has(p));
    if (newPhrases.length === 0) return;
    try {
        const rows = newPhrases.map(p => ({ phrase: p }));
        const { error } = await supabaseClient
            .from('history_entries')
            .upsert(rows, { onConflict: 'phrase' });
        if (error) {
            console.warn('Supabase sync error', error);
            setSupabaseStatus('Sync error','red');
            return;
        }
        newPhrases.forEach(p => lastSynced.add(p));
        setSupabaseStatus('Synced','');
    } catch (e) {
        console.warn('Supabase sync exception', e);
        setSupabaseStatus('Sync exception','red');
    }
}

async function clearRemoteHistory() {
    if (!supabaseClient) return;
    try {
        const { error } = await supabaseClient.from('history_entries').delete().neq('phrase', '');
        if (error) {
            console.warn('Supabase clear error', error);
            setSupabaseStatus('Clear error','red');
            return;
        }
        lastSynced.clear();
        console.log('Remote history cleared');
        setSupabaseStatus('Cleared','#d60');
    } catch (e) {
        console.warn('Supabase clear exception', e);
        setSupabaseStatus('Clear exception','red');
    }
}

// Expose to global scope for existing inline handlers / future use
window.initSupabase = initSupabase;
window.loadHistoryFromSupabase = loadHistoryFromSupabase;
window.queueSupabaseSync = queueSupabaseSync;
window.clearRemoteHistory = clearRemoteHistory;
