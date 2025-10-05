/* Gematria Assistant: enriched mode-based research UI */
// Adjust if your Edge Function name differs
const SUPABASE_FUNCTION_NAME = 'gematria-assistant';

let assistantOpen = false;
let assistantStreaming = false;
let assistantMessages = []; // {role:'user'|'assistant'|'error', content:string}
let lastSourceUrls = new Set();
// Library data structure: { [mode]: { notes: Array<{id, text, ts}>, resources: Array<{id, url, title, ts}> } }
const LIB_STORAGE_KEY = 'gv_assistant_lib_v1';
let assistantLibrary = loadAssistantLibrary();

function loadAssistantLibrary(){
  try { const raw = localStorage.getItem(LIB_STORAGE_KEY); if(raw) return JSON.parse(raw); } catch {}
  return {};
}
function persistAssistantLibrary(){
  try { localStorage.setItem(LIB_STORAGE_KEY, JSON.stringify(assistantLibrary)); } catch {}
}
function libEnsureMode(mode){ if(!assistantLibrary[mode]) assistantLibrary[mode] = { notes:[], resources:[] }; return assistantLibrary[mode]; }
function addNote(mode, text){ const m=libEnsureMode(mode); m.notes.push({ id:crypto.randomUUID(), text:text.trim(), ts:Date.now() }); persistAssistantLibrary(); renderLibrary(); }
function addResource(mode, url, title){ const m=libEnsureMode(mode); m.resources.push({ id:crypto.randomUUID(), url, title: title || url, ts:Date.now() }); persistAssistantLibrary(); renderLibrary(); }
function delLibItem(mode, type, id){ const m=libEnsureMode(mode); m[type] = m[type].filter(x=>x.id!==id); persistAssistantLibrary(); renderLibrary(); }
function clearModeLibrary(mode){ assistantLibrary[mode]={ notes:[], resources:[] }; persistAssistantLibrary(); renderLibrary(); }

// Mode palette (synced with docs/assistant-architecture.md)
const ASSISTANT_MODES = [
  { id:'resonance', label:'Symbolic Resonance', template:'Map symbolic resonance for: {{text}}. 1) Compute gematria with {{ciphers}}; 2) Surface patterns; 3) Working theories (label).' },
  { id:'etymology', label:'Etymology & Roots', template:'Provide etymology, morphology and cognates for: {{term}}.' },
  { id:'anagram', label:'Anagram Lab', template:'Find dictionary-true anagrams for: {{text}}. Rank by frequency. Compute gematria for top 10.' },
  { id:'acronym', label:'Acronym Forge', template:'Generate candidate acronyms/backronyms for: {{phrase}} and compute gematria.' },
  { id:'numerology', label:'Numerology Suite', template:'Compute reduced/full sums, digital roots, factors, prime/triangular/square/Fibonacci relationships for: {{text}}.' },
  { id:'synch', label:'Timeline Synchronicity', template:'Between {{from}} and {{to}} compute deltas, factorization, notable numeric classifications.' },
  { id:'glyph', label:'Image/Glyph Decode', template:'Analyze uploaded image: OCR text, symbol classes, gematria for transcribed text.' },
  { id:'crosswalk', label:'Myth–Bible–Science', template:'Cross-reference {{term}} across mythic motifs, biblical references, and scientific terminology.' },
  { id:'esoteric', label:'Esoteric Research', template:'Deep-dive on {{topic}} using search + RAG; concise synthesis with linked sources.' }
];
let activeMode = 'resonance';

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
          <button class="ast-btn" onclick="exportCurrentModeLibrary()">Export Mode</button>
          <button class="ast-btn" onclick="toggleAssistant(false)">Close ✕</button>
        </div>
      </div>
      <div id="AssistantBody">
        <div id="AssistantSide">
          <div class="assistant-section-title">Modes</div>
          <div id="AssistantModes"></div>
          <div class="assistant-section-title">Current Ciphers</div>
          <div id="CipherSnapshot"></div>
          <div class="assistant-section-title">Library</div>
          <div id="AssistantLibrary"></div>
          <div class="assistant-section-title">Image (optional)</div>
          <input type="file" id="AssistantImage" accept="image/*" style="width:100%;font-size:11px;" />
          <div class="assistant-inline-note" style="margin-top:4px;">Attach for Glyph / Vision decoding.</div>
        </div>
        <div id="AssistantMain">
          <div id="ChatStream"></div>
          <div id="AssistantComposer">
            <textarea id="AssistantInput" placeholder="Type a query (Shift+Enter = newline)" onkeydown="assistantKeyHandler(event)"></textarea>
            <div class="assistant-actions">
              <button id="AssistantSendBtn" class="ast-btn" onclick="sendAssistantPrompt()">Send</button>
              <button id="AssistantStopBtn" class="ast-btn danger" style="display:none;" onclick="stopAssistantStream()">Stop</button>
              <div id="AssistantStatus" class="assistant-inline-note"></div>
              <div style="flex:1"></div>
              <button class="ast-btn" onclick="clearAssistantChat()">Clear Chat</button>
            </div>
            <div class="assistant-inline-note" id="AssistantHint"></div>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(root);
  renderModes();
  refreshAssistantSnapshot();
  renderAssistantMessages();
  renderLibrary();
  setupContextMenu();
}

function renderModes(){
  const spot = document.getElementById('AssistantModes');
  if(!spot) return;
  spot.innerHTML = ASSISTANT_MODES.map(m=>`<div class="mode-btn ${m.id===activeMode?'active':''}" onclick="setAssistantMode('${m.id}')">${m.label}</div>`).join('');
  const active = ASSISTANT_MODES.find(m=>m.id===activeMode);
  if(active) {
    const hint = document.getElementById('AssistantHint');
    if(hint) hint.textContent = active.template.replace(/\{\{.*?\}\}/g,'…');
  }
}
function setAssistantMode(id){ activeMode = id; renderModes(); }

function toggleAssistant(force) {
  ensureAssistantMounted();
  const root = document.getElementById('AssistantRoot');
  if (typeof force === 'boolean') assistantOpen = force; else assistantOpen = !assistantOpen;
  root.style.display = assistantOpen ? 'block' : 'none';
  if (assistantOpen) {
    document.body.classList.add('ga-lock');
    setTimeout(()=> document.getElementById('AssistantInput')?.focus(), 50);
  } else {
    document.body.classList.remove('ga-lock');
  }
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
      <div class="chat-bubble">${linkifyHtml(escapeHtml(m.content))}</div>
    </div>`).join('');
  // Auto-scroll to latest unless user has scrolled up (within 60px of bottom considered sticky)
  const atBottom = Math.abs((stream.scrollHeight - stream.clientHeight) - stream.scrollTop) < 60;
  if (atBottom) stream.scrollTop = stream.scrollHeight;
}

function escapeHtml(str){
  return str.replace(/[&<>]/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;' }[s]));
}

function linkifyHtml(html){
  return html.replace(/&lt;(https?:[^\s&gt;]+)&gt;/g, (m,u)=>`<a href="${u}" target="_blank" rel="noopener" data-resource-link="1">${u}</a>`);
}

function pushAssistantMessage(role, content){
  assistantMessages.push({ role, content: sanitizeOutput(content) });
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
  // Add a temporary placeholder assistant message (loading)
  const loadingId = 'assistant-loading-' + Date.now();
  assistantMessages.push({ role:'assistant', content: '⏳ Gathering sources…', _loading: true, _id: loadingId });
  renderAssistantMessages();
  try {
    const payload = await buildAssistantPayloadAsync(value);
    const client = (window.supabaseClient || (window.supabase && window.supabase.createClient ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null));
    if (!client) throw new Error('Supabase client not ready');
  const { data, error } = await client.functions.invoke(SUPABASE_FUNCTION_NAME, { body: payload });
    if (error) {
      console.error('[Assistant] Edge function error', error);
      throw error;
    }
    if (data && data.error){
      console.error('[Assistant] Function responded with error field:', data.error);
      throw new Error(data.error);
    }
    // Remove loading placeholder
    assistantMessages = assistantMessages.filter(m => !m._loading);
    let reply = (data && (data.reply || data.answer || data.content)) ? (data.reply || data.answer || data.content) : JSON.stringify(data);
    reply = reply.replace(/\bTavily\b/gi,'web sources');
    let sourcesBlock = '';
    if (Array.isArray(data?.sources)) {
      const deduped = [];
      for (const s of data.sources) {
        if (s && s.url && !lastSourceUrls.has(s.url)) {
          lastSourceUrls.add(s.url);
          deduped.push(s);
        }
      }
      if (deduped.length) {
        sourcesBlock = '\n\n<div class="assistant-sources-toggle" onclick="toggleSources(this)">Sources ('+deduped.length+') ▾</div>'+
          '<div class="assistant-sources" style="display:none;"><ul>'+
          deduped.map(s=>`<li><span class="src-title">${escapeHtml(s.title||'(untitled)')}</span> — <a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.url)}</a></li>`).join('')+
          '</ul></div>';
      }
    }
    pushAssistantMessage('assistant', reply + sourcesBlock);
    setAssistantStatus('Ready');
    // Re-render to ensure anchors injected become clickable
    renderAssistantMessages();
  } catch (e){
    console.warn(e);
    pushAssistantMessage('error', 'Error: '+ (e.message || e));
    alert('Assistant request failed. Check console for details.');
    console.info('[Assistant] Ensure in Supabase project secrets: OPENAI_API_KEY (and TAVILY_API_KEY if web enrichment needed). After updating secrets, redeploy function: supabase functions deploy gematria-assistant --no-verify-jwt');
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

async function buildAssistantPayloadAsync(userMessage){
  // Provide the assistant with some structured context (current open ciphers & example totals for the input phrase if present)
  const phrase = typeof sVal === 'function' ? sVal() : '';
  let cipherValues = [];
  let imageB64 = null;
  try {
    if (phrase && typeof ciphersOn !== 'undefined') {
      cipherValues = ciphersOn.map(c => ({ cipher: c.Nickname, value: c.Gematria ? c.Gematria(phrase,1) : null }));
    }
    const fileInput = document.getElementById('AssistantImage');
    if (fileInput && fileInput.files && fileInput.files[0]) {
      const f = fileInput.files[0];
      if (f.size < 2 * 1024 * 1024) {
        imageB64 = await new Promise(resolve => {
          const rdr = new FileReader();
            rdr.onload = () => resolve(String(rdr.result).split(',')[1]);
            rdr.onerror = () => resolve(null);
            rdr.readAsDataURL(f);
        });
      }
    }
  } catch {}
  // Because FileReader is async, we can't block here; a quick workaround is to store a pending promise then update payload later.
  return {
    message: userMessage,
    phrase,
    cipherValues,
    history: assistantMessages.slice(-10),
  meta: { app: 'oldnewgematrinator', version: 'assistant-embed-v1', mode: activeMode, imageAttached: !!imageB64 },
    image: imageB64
  };
}

// Basic sanitizer (enforce markdown links, strip raw long URLs)
function sanitizeOutput(txt){
  if(!txt) return txt;
  // Replace bare http(s) URLs with angle form to be post-processed
  return txt.replace(/https?:\/\/\S+/g, u=>`<${u}>`);
}

// Toggle sources visibility
window.toggleSources = function(el){
  const box = el.nextElementSibling;
  if (!box) return;
  const open = box.style.display !== 'none';
  box.style.display = open ? 'none' : 'block';
  el.textContent = el.textContent.replace(/▾|▸/g,'') + (open ? ' ▸' : ' ▾');
};

// Library rendering
function renderLibrary(){
  const spot = document.getElementById('AssistantLibrary');
  if(!spot) return;
  const modeData = libEnsureMode(activeMode);
  const notes = modeData.notes.slice().sort((a,b)=>b.ts-a.ts);
  const resources = modeData.resources.slice().sort((a,b)=>b.ts-a.ts);
  let html = '';
  html += `<div class="lib-section"><h4>Notes <span style="font-weight:400;opacity:.6">${notes.length}</span><span><a style="cursor:pointer;font-size:10px;" onclick="clearModeLibrary('${activeMode}')">clear</a></span></h4>`;
  if(!notes.length) html += '<div class="lib-empty">No notes yet</div>'; else {
    html += '<ul class="lib-list">'+notes.map(n=>`<li><span>${escapeHtml(n.text)}</span><span class="lib-del" onclick="delLibItem('${activeMode}','notes','${n.id}')">✕</span></li>`).join('')+'</ul>';
  }
  html += '</div>';
  html += `<div class="lib-section"><h4>Resources <span style="font-weight:400;opacity:.6">${resources.length}</span><span><a style="cursor:pointer;font-size:10px;" onclick="clearModeLibrary('${activeMode}')">clear</a></span></h4>`;
  if(!resources.length) html += '<div class="lib-empty">No resources yet</div>'; else {
    html += '<ul class="lib-list">'+resources.map(r=>`<li><a class="lib-url" href="${escapeHtml(r.url)}" target="_blank" rel="noopener">${escapeHtml(r.title||r.url)}</a><span class="lib-del" onclick="delLibItem('${activeMode}','resources','${r.id}')">✕</span></li>`).join('')+'</ul>';
  }
  html += '</div>';
  spot.innerHTML = html;
}

// Export current mode library (JSON download)
function exportCurrentModeLibrary(){
  const data = libEnsureMode(activeMode);
  const blob = new Blob([JSON.stringify(data,null,2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `assistant-${activeMode}-library.json`; a.click();
  setTimeout(()=> URL.revokeObjectURL(url), 1500);
}

// Context menu logic
function setupContextMenu(){
  if(document.getElementById('AssistantContextMenu')) return;
  const menu = document.createElement('div');
  menu.id = 'AssistantContextMenu';
  menu.innerHTML = `
    <button onclick="ctxAddNote()">Add Selection to Notes</button>
    <button onclick="ctxAddResource()">Add Link to Resources</button>`;
  document.body.appendChild(menu);
  document.addEventListener('click', ()=> menu.style.display='none');
  document.addEventListener('contextmenu', e => {
    if(!document.getElementById('AssistantRoot') || document.getElementById('AssistantRoot').style.display==='none') return;
    const root = document.getElementById('AssistantRoot');
    if(!root.contains(e.target)) return; // outside assistant
    const sel = window.getSelection();
    let hasText = sel && sel.toString().trim().length>0;
    let linkTarget = e.target.closest('a');
    if(!hasText && !linkTarget) return; // allow normal context outside selection/link
    e.preventDefault();
    menu.style.display='block';
    menu.style.left = e.pageX + 'px';
    menu.style.top = e.pageY + 'px';
    menu.dataset.link = linkTarget ? linkTarget.href : '';
  });
  window.ctxAddNote = function(){
    const sel = window.getSelection();
    const txt = sel ? sel.toString().trim() : '';
    if(txt) addNote(activeMode, txt);
    document.getElementById('AssistantContextMenu').style.display='none';
  };
  window.ctxAddResource = function(){
    const menu = document.getElementById('AssistantContextMenu');
    const url = menu.dataset.link;
    if(url) addResource(activeMode, url, url);
    menu.style.display='none';
  };
}

// Expose needed functions
window.exportCurrentModeLibrary = exportCurrentModeLibrary;
window.delLibItem = delLibItem;
window.clearModeLibrary = clearModeLibrary;

// Expose mode functions
window.setAssistantMode = setAssistantMode;

// Expose toggle to menu
window.toggleAssistant = toggleAssistant;
window.refreshAssistantSnapshot = refreshAssistantSnapshot;
// Alias for header quick link reliability
window.showAssistant = () => toggleAssistant(true);
