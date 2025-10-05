/* Gematria Assistant: lightweight chat invoking Supabase Edge Function (OpenAI on backend) */
// Adjust if your Edge Function name differs
const SUPABASE_FUNCTION_NAME = 'gematria-assistant';

let assistantOpen = false;
let assistantStreaming = false;
let assistantMessages = []; // {role:'user'|'assistant'|'error', content:string}

function ensureAssistantMounted() {
  if (document.getElementById('AssistantRoot')) return;
  const root = document.createElement('div');
  root.id = 'AssistantRoot';
  root.innerHTML = `
    <div id="AssistantBackdrop" onclick="toggleAssistant(false)"></div>
    <div id="AssistantWindow">
      <div id="AssistantHeader">
        <h2>GEMATRIA ASSISTANT</h2>
        <div style="display:flex; gap:6px;">
          <button class="ast-btn" onclick="refreshAssistantSnapshot()">Refresh Snapshot</button>
          <button class="ast-btn" onclick="toggleAssistant(false)">Close ✕</button>
        </div>
      </div>
      <div id="AssistantBody">
        <div id="AssistantSide">
          <div class="assistant-section-title">Current Ciphers</div>
          <div id="CipherSnapshot"></div>
        </div>
        <div id="AssistantMain">
          <div id="ChatStream"></div>
          <div id="AssistantComposer">
            <textarea id="AssistantInput" placeholder="Ask about a phrase, relationships between cipher totals, or request comparisons... (Shift+Enter = newline)" onkeydown="assistantKeyHandler(event)"></textarea>
            <div class="assistant-actions">
              <button id="AssistantSendBtn" class="ast-btn" onclick="sendAssistantPrompt()">Send</button>
              <button id="AssistantStopBtn" class="ast-btn danger" style="display:none;" onclick="stopAssistantStream()">Stop</button>
              <div id="AssistantStatus" class="assistant-inline-note"></div>
              <div style="flex:1"></div>
              <button class="ast-btn" onclick="clearAssistantChat()">Clear Chat</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(root);
  refreshAssistantSnapshot();
  renderAssistantMessages();
}

function toggleAssistant(force) {
  ensureAssistantMounted();
  const root = document.getElementById('AssistantRoot');
  if (typeof force === 'boolean') assistantOpen = force; else assistantOpen = !assistantOpen;
  root.style.display = assistantOpen ? 'block' : 'none';
  if (assistantOpen) setTimeout(()=> document.getElementById('AssistantInput')?.focus(), 50);
}

function refreshAssistantSnapshot() {
  if (typeof ciphersOn === 'undefined') return;
  const spot = document.getElementById('CipherSnapshot');
  if (!spot) return;
  let html = '<table><thead><tr><th>Cipher</th><th>Ex</th></tr></thead><tbody>';
  for (let c of ciphersOn) {
    html += `<tr><td>${c.Nickname}</td><td style="text-align:right;color:rgb(${c.RGB.join(',')})">${c.Gematria ? c.Gematria('GOD',1) : ''}</td></tr>`;
  }
  html += '</tbody></table>';
  spot.innerHTML = html;
}

function assistantKeyHandler(e){
  if (e.key === 'Enter' && !e.shiftKey){
    e.preventDefault();
    sendAssistantPrompt();
  }
}

function renderAssistantMessages(){
  const stream = document.getElementById('ChatStream');
  if (!stream) return;
  stream.innerHTML = assistantMessages.map(m => `
    <div class="chat-msg ${m.role}">
      <div class="chat-role">${m.role.toUpperCase()}</div>
      <div class="chat-bubble">${escapeHtml(m.content)}</div>
    </div>`).join('');
  stream.scrollTop = stream.scrollHeight;
}

function escapeHtml(str){
  return str.replace(/[&<>]/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;' }[s]));
}

function pushAssistantMessage(role, content){
  assistantMessages.push({ role, content });
  renderAssistantMessages();
}

function clearAssistantChat(){
  assistantMessages = [];
  renderAssistantMessages();
}

function setAssistantStatus(text, warn){
  const el = document.getElementById('AssistantStatus');
  if (el){ el.textContent = text; el.style.color = warn ? 'var(--ga-warn)' : 'var(--ga-text-dim)'; }
}

async function sendAssistantPrompt(){
  if (assistantStreaming) return;
  const ta = document.getElementById('AssistantInput');
  if (!ta) return;
  const value = ta.value.trim();
  if (!value) return;
  pushAssistantMessage('user', value);
  ta.value='';
  setAssistantStatus('Sending…');
  assistantStreaming = true;
  document.getElementById('AssistantSendBtn').style.display='none';
  document.getElementById('AssistantStopBtn').style.display='inline-flex';
  try {
    const payload = buildAssistantPayload(value);
    const client = (window.supabaseClient || (window.supabase && window.supabase.createClient ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null));
    if (!client) throw new Error('Supabase client not ready');
    const { data, error } = await client.functions.invoke(SUPABASE_FUNCTION_NAME, { body: payload });
    if (error) throw error;
    const reply = (data && (data.reply || data.answer || data.content)) ? (data.reply || data.answer || data.content) : JSON.stringify(data);
    pushAssistantMessage('assistant', reply);
    setAssistantStatus('Ready');
  } catch (e){
    console.warn(e);
    pushAssistantMessage('error', 'Error: '+ (e.message || e));
    setAssistantStatus('Error', true);
  } finally {
    assistantStreaming = false;
    document.getElementById('AssistantSendBtn').style.display='inline-flex';
    document.getElementById('AssistantStopBtn').style.display='none';
  }
}

function stopAssistantStream(){
  // placeholder: edge function invocation is awaited as one shot; streaming cancel requires AbortController
  assistantStreaming = false;
  setAssistantStatus('Stopped', true);
}

function buildAssistantPayload(userMessage){
  // Provide the assistant with some structured context (current open ciphers & example totals for the input phrase if present)
  const phrase = typeof sVal === 'function' ? sVal() : '';
  let cipherValues = [];
  try {
    if (phrase && typeof ciphersOn !== 'undefined') {
      cipherValues = ciphersOn.map(c => ({ cipher: c.Nickname, value: c.Gematria ? c.Gematria(phrase,1) : null }));
    }
  } catch {}
  return {
    message: userMessage,
    phrase,
    cipherValues,
    history: assistantMessages.slice(-10),
    meta: { app: 'oldnewgematrinator', version: 'assistant-embed-v1' }
  };
}

// Expose toggle to menu
window.toggleAssistant = toggleAssistant;
window.refreshAssistantSnapshot = refreshAssistantSnapshot;
