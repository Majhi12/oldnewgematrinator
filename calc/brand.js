// Theme persistence + toggle for GematriaVerse
const BRAND_KEY = 'gemaverse-theme-enabled';
function InitBrandPreference(){
  try { const pref = localStorage.getItem(BRAND_KEY); if (pref === 'off') document.body.classList.remove('brand-gemaverse'); } catch(e) {}
}
function ToggleBrand(){
  const enabled = document.body.classList.toggle('brand-gemaverse');
  try { localStorage.setItem(BRAND_KEY, enabled ? 'on':'off'); } catch(e) {}
}
window.ToggleBrand = ToggleBrand; window.InitBrandPreference = InitBrandPreference;