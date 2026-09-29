// Banco fictício em array: estes dados servem apenas para a demonstração.
const usuarios = [
  { nome: 'Aluno Exemplo', email: 'aluno@vertex.test', senha: 'aula123' },
  { nome: 'Professora Exemplo', email: 'professor@vertex.test', senha: 'painel456' },
  { nome: 'Analista Exemplo', email: 'analista@vertex.test', senha: 'grafico789' },
  { nome: 'Visitante Exemplo', email: 'visitante@vertex.test', senha: 'visita000' }
];
function procurarUsuario(email, senha) {
  const normalizado = email.trim().toLowerCase();
  return usuarios.find(usuario => usuario.email === normalizado && usuario.senha === senha);
}

const STORAGE_KEY = 'vertex-finance-demo-v5';
const defaultAssets = [
  { id: 'petr4', code: 'PETR4', name: 'Petrobras PN', type: 'Ações', value: 18420, change: 3.12 },
  { id: 'vale3', code: 'VALE3', name: 'Vale ON', type: 'Ações', value: 14680, change: 1.86 },
  { id: 'hglg11', code: 'HGLG11', name: 'CSHG Logística', type: 'Fundos imobiliários', value: 9320, change: -0.42 }
];
const initialState = { hidden: [], custom: [], assets: defaultAssets.map(item => ({ ...item })), period: '6m' };
function readState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.hidden) && Array.isArray(saved.custom) && Array.isArray(saved.assets)) {
      return {
        hidden: saved.hidden.filter(id => typeof id === 'string'),
        custom: saved.custom.filter(item => item && typeof item.id === 'string' && ['metric','quote','note'].includes(item.kind) && typeof item.title === 'string' && typeof item.detail === 'string'),
        assets: saved.assets.filter(item => item && typeof item.id === 'string' && typeof item.code === 'string' && typeof item.name === 'string' && typeof item.type === 'string' && Number.isFinite(item.value) && Number.isFinite(item.change)),
        period: ['6m','3m','1m'].includes(saved.period) ? saved.period : '6m'
      };
    }
  } catch (_) { /* Inicia com a demonstração padrão se não houver dados locais válidos. */ }
  // Mantém elementos personalizados criados na versão anterior, mas mostra todos os blocos originais.
  try {
    const oldCustom = JSON.parse(localStorage.getItem('vertex-custom-widgets'));
    if (Array.isArray(oldCustom)) initialState.custom = oldCustom.filter(item => item && typeof item.id === 'string' && ['metric','quote','note'].includes(item.kind) && typeof item.title === 'string' && typeof item.detail === 'string');
  } catch (_) { /* O protótipo funciona sem dados salvos. */ }
  return JSON.parse(JSON.stringify(initialState));
}
let state = readState();
let undoStack = [];
let currentUser = null;
let animationsEnabled = true;
let revealCounter = 0;
const loginForm = document.querySelector('#login-form');
const loginFeedback = document.querySelector('#login-feedback');
const emailInput = document.querySelector('#email');
const passwordInput = document.querySelector('#password');
const rememberInput = document.querySelector('#remember');
const togglePasswordButton = document.querySelector('#toggle-password');
const dashboard = document.querySelector('#dashboard');
const dashboardFeedback = document.querySelector('#dashboard-feedback');
const undoButton = document.querySelector('#undo-change');
const hiddenNotice = document.querySelector('#hidden-notice');
const hiddenCount = document.querySelector('#hidden-count');
const periodSelect = document.querySelector('#period');
const chartRows = document.querySelector('#asset-rows');
const assetForm = document.querySelector('#asset-form');
const assetFeedback = document.querySelector('#asset-feedback');
const widgetDialog = document.querySelector('#widget-dialog');
const widgetForm = document.querySelector('#widget-form');
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const percent = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const chartSeries = {
  '6m': { line: 'M0 210 C50 204 65 226 110 194 S180 164 220 178 S290 156 335 145 S400 167 445 122 S520 115 565 78 S630 87 700 35', labels: ['ABR','MAI','JUN','JUL','AGO','SET'] },
  '3m': { line: 'M0 165 C60 151 83 180 120 163 S190 137 235 149 S311 103 360 121 S435 96 480 87 S560 104 605 61 S660 52 700 35', labels: ['JUL','JUL','AGO','AGO','SET','SET'] },
  '1m': { line: 'M0 145 C55 168 75 127 115 153 S180 174 220 132 S300 141 340 108 S415 122 455 87 S530 112 580 68 S660 57 700 35', labels: ['01','07','14','21','28','HOJE'] }
};

// Uma única pilha de histórico desfaz inclusões, exclusões e mudanças no gráfico.
function cloneState(value = state) { return JSON.parse(JSON.stringify(value)); }
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (_) { dashboardFeedback.textContent = 'O navegador não permitiu salvar as alterações.'; }
}
function commit(message, change) {
  undoStack.push(cloneState());
  change();
  saveState();
  renderState();
  dashboardFeedback.textContent = message;
  undoButton.disabled = false;
}
function undo() {
  const previous = undoStack.pop();
  if (!previous) return;
  state = previous;
  saveState();
  renderState();
  dashboardFeedback.textContent = 'A última alteração foi desfeita.';
  undoButton.disabled = undoStack.length === 0;
}

function setScreen(loggedIn) {
  document.body.classList.toggle('logged-in', loggedIn);
  if (!loggedIn) {
    dashboard.classList.remove('without-sidebar');
    window.location.hash = 'login';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  document.querySelector('#user-greeting').textContent = `Bem-vindo, ${currentUser.nome}. Acompanhe a carteira fictícia.`;
  const profile = document.querySelector('#user-profile');
  profile.textContent = currentUser.nome.charAt(0).toUpperCase();
  profile.setAttribute('aria-label', `Ver perfil de ${currentUser.nome}`);
  window.location.hash = 'overview';
  requestAnimationFrame(() => document.querySelector('#overview').scrollIntoView({ behavior: 'smooth', block: 'start' }));
}
try {
  const savedEmail = localStorage.getItem('vertex-demo-email-v5');
  if (savedEmail) { emailInput.value = savedEmail; rememberInput.checked = true; }
} catch (_) { /* Lembrar o e-mail é opcional. */ }
loginForm.addEventListener('submit', event => {
  event.preventDefault();
  if (!loginForm.reportValidity()) return;
  currentUser = procurarUsuario(emailInput.value, passwordInput.value);
  if (!currentUser) {
    loginFeedback.textContent = 'E-mail ou senha incorretos. Confira as contas fictícias acima.';
    return;
  }
  try {
    if (rememberInput.checked) localStorage.setItem('vertex-demo-email-v5', emailInput.value.trim());
    else localStorage.removeItem('vertex-demo-email-v5');
  } catch (_) { /* Armazenamento opcional. */ }
  loginFeedback.textContent = 'Acesso de demonstração liberado.';
  passwordInput.value = '';
  setScreen(true);
});
togglePasswordButton.addEventListener('click', () => {
  const visible = passwordInput.type === 'password';
  passwordInput.type = visible ? 'text' : 'password';
  togglePasswordButton.textContent = visible ? 'Ocultar' : 'Mostrar';
  togglePasswordButton.setAttribute('aria-label', visible ? 'Ocultar senha' : 'Mostrar senha');
  togglePasswordButton.setAttribute('aria-pressed', String(visible));
});
document.querySelector('#logout').addEventListener('click', event => {
  event.preventDefault();
  currentUser = null;
  passwordInput.value = '';
  document.querySelector('#user-greeting').textContent = 'Acompanhe o desempenho da carteira.';
  document.querySelector('#user-profile').textContent = 'V';
  document.querySelector('#user-profile').setAttribute('aria-label', 'Ver usuário conectado');
  setScreen(false);
});
document.querySelector('#user-profile').addEventListener('click', () => {
  dashboardFeedback.textContent = currentUser ? `Usuário conectado: ${currentUser.nome} (${currentUser.email}).` : 'Perfil de demonstração.';
});

function updateChart() {
  const { line, labels } = chartSeries[state.period];
  document.querySelector('#chart-line').setAttribute('d', line);
  document.querySelector('#chart-area').setAttribute('d', `${line} V260 H0Z`);
  document.querySelector('#chart-labels').replaceChildren(...labels.map(text => {
    const span = document.createElement('span'); span.textContent = text; return span;
  }));
  periodSelect.value = state.period;
}
periodSelect.addEventListener('change', () => {
  if (periodSelect.value === state.period) return;
  const selected = periodSelect.value;
  commit(`Gráfico atualizado: ${periodSelect.selectedOptions[0].text}.`, () => { state.period = selected; });
});
function nextPeriod() {
  const choices = [...periodSelect.options].map(option => option.value);
  const next = choices[(choices.indexOf(state.period) + 1) % choices.length];
  commit(`Gráfico atualizado: ${periodSelect.querySelector(`[value="${next}"]`).textContent}.`, () => { state.period = next; });
}

function setSelected(element, message) {
  document.querySelectorAll('.selected-visual').forEach(item => item.classList.remove('selected-visual'));
  element.classList.add('selected-visual');
  dashboardFeedback.textContent = message;
}
function selectVisual(element) {
  if (element.matches('.stat-card')) {
    const label = element.querySelector('.stat-top')?.textContent.replace(/[↗◌]/g, '').trim() || 'Indicador';
    const value = element.querySelector('strong')?.textContent.trim() || '';
    setSelected(element, `${label}: ${value}. Valor fictício.`);
  } else if (element.matches('.market-item')) {
    const name = element.querySelector('.asset-name strong')?.textContent || 'Cotação';
    const price = element.querySelector('.asset-values strong')?.textContent || '';
    const variation = element.querySelector('.asset-values span')?.textContent || '';
    setSelected(element, `${name}: ${price} (${variation}). Cotação fictícia.`);
  } else if (element.matches('.performance-chart')) {
    nextPeriod();
    setSelected(element, `Período do gráfico: ${periodSelect.selectedOptions[0].text}.`);
  } else if (element.matches('#asset-rows tr') && !element.classList.contains('empty-row')) {
    setSelected(element, `Ativo selecionado: ${[...element.cells].slice(0, 4).map(cell => cell.textContent.trim()).join(' · ')}.`);
  } else if (element.matches('[data-custom-select]')) {
    setSelected(element, `${element.dataset.customTitle}: elemento selecionado.`);
  }
}
function isActionTarget(target) { return Boolean(target.closest('button,a,input,select,summary,[data-delete]')); }
dashboard.addEventListener('click', event => {
  const remove = event.target.closest('[data-delete]');
  if (remove) {
    const id = remove.dataset.delete;
    if (id.startsWith('asset:')) {
      const assetId = id.slice('asset:'.length);
      const asset = state.assets.find(item => item.id === assetId);
      if (asset) commit(`${asset.code} foi removido da carteira.`, () => { state.assets = state.assets.filter(item => item.id !== assetId); });
      return;
    }
    if (!state.hidden.includes(id)) commit(`${remove.title || 'Elemento'} removido. Use Restaurar painel para recuperá-lo.`, () => state.hidden.push(id));
    return;
  }
  if (isActionTarget(event.target)) return;
  const selectable = event.target.closest('[data-selectable], [data-custom-select]');
  if (selectable) selectVisual(selectable);
});
dashboard.addEventListener('keydown', event => {
  const visual = event.target.closest('[data-selectable], [data-custom-select]');
  if (!visual || isActionTarget(event.target) || !['Enter',' '].includes(event.key)) return;
  event.preventDefault();
  selectVisual(visual);
});

function makeDeleteButton(id, title) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'widget-delete'; button.dataset.delete = id; button.title = `Excluir ${title}`;
  button.setAttribute('aria-label', `Excluir ${title}`); button.textContent = '×';
  return button;
}
function makeCustomWidget(item) {
  let element;
  if (item.kind === 'metric') {
    element = document.createElement('article'); element.className = 'stat-card custom-metric reveal-node';
    element.dataset.customSelect = ''; element.dataset.customTitle = item.title; element.setAttribute('tabindex','0'); element.setAttribute('role','group');
    const label = document.createElement('div'); label.className = 'stat-top'; label.textContent = item.title;
    const value = document.createElement('strong'); value.textContent = item.detail;
    element.append(label, value);
    document.querySelector('.stats-grid').append(element);
  } else if (item.kind === 'quote') {
    element = document.createElement('div'); element.className = 'asset market-item custom-quote reveal-node';
    element.dataset.customSelect = ''; element.dataset.customTitle = item.title; element.setAttribute('tabindex','0'); element.setAttribute('role','group');
    const icon = document.createElement('span'); icon.className = 'asset-icon'; icon.textContent = '◈';
    const name = document.createElement('span'); name.className = 'asset-name';
    const strong = document.createElement('strong'); strong.textContent = item.title;
    const detail = document.createElement('span'); detail.textContent = item.detail;
    name.append(strong, detail); element.append(icon, name);
    document.querySelector('.market-list').append(element);
  } else {
    element = document.createElement('article'); element.className = 'custom-note reveal-node';
    element.dataset.customSelect = ''; element.dataset.customTitle = item.title; element.setAttribute('tabindex','0'); element.setAttribute('role','group');
    const heading = document.createElement('h2'); heading.textContent = item.title;
    const detail = document.createElement('p'); detail.textContent = item.detail;
    element.append(heading, detail); document.querySelector('#custom-notes').append(element);
  }
  element.dataset.widgetId = item.id;
  element.hidden = state.hidden.includes(item.id);
  element.append(makeDeleteButton(item.id, item.title));
  prepareReveal(element);
  return element;
}
function renderCustom() {
  document.querySelectorAll('[data-custom-generated]').forEach(element => element.remove());
  document.querySelectorAll('.custom-metric,.custom-quote,.custom-note').forEach(element => element.remove());
  state.custom.forEach(item => makeCustomWidget(item));
}
function renderAssets() {
  chartRows.replaceChildren();
  if (!state.assets.length) {
    const row = document.createElement('tr'); row.className = 'empty-row';
    const cell = document.createElement('td'); cell.colSpan = 5; cell.className = 'empty-assets'; cell.textContent = 'Nenhum ativo. Use o formulário acima para adicionar um.';
    row.append(cell); chartRows.append(row); return;
  }
  state.assets.forEach(asset => {
    const row = document.createElement('tr'); row.dataset.assetId = asset.id; row.dataset.selectable = ''; row.tabIndex = 0; row.setAttribute('role','group'); row.classList.add('interactive-visual','reveal-node');
    const nameCell = document.createElement('td'); const ticker = document.createElement('span'); ticker.className = 'ticker'; ticker.textContent = asset.code;
    nameCell.append(ticker, document.createTextNode(` ${asset.name}`));
    const typeCell = document.createElement('td'); typeCell.textContent = asset.type;
    const valueCell = document.createElement('td'); valueCell.textContent = money.format(asset.value);
    const changeCell = document.createElement('td'); changeCell.className = asset.change < 0 ? 'negative' : 'positive'; changeCell.textContent = `${asset.change > 0 ? '+' : ''}${percent.format(asset.change)}%`;
    const actionCell = document.createElement('td'); const remove = makeDeleteButton(`asset:${asset.id}`, asset.code); remove.className = 'delete-button'; remove.textContent = 'Excluir';
    actionCell.append(remove); row.append(nameCell,typeCell,valueCell,changeCell,actionCell); chartRows.append(row); prepareReveal(row);
  });
}
function renderState() {
  document.querySelectorAll('[data-widget-id]').forEach(element => { element.hidden = state.hidden.includes(element.dataset.widgetId); });
  dashboard.classList.toggle('without-sidebar', state.hidden.includes('sidebar'));
  renderCustom(); renderAssets(); updateChart(); updateHiddenNotice();
  undoButton.disabled = undoStack.length === 0;
}
function updateHiddenNotice() {
  const count = state.hidden.length;
  hiddenNotice.hidden = count === 0;
  hiddenCount.textContent = count === 1 ? '1 elemento está oculto.' : `${count} elementos estão ocultos.`;
}
function uniqueId(prefix) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`; }

assetForm.addEventListener('submit', event => {
  event.preventDefault(); if (!assetForm.reportValidity()) return;
  const values = new FormData(assetForm);
  const asset = { id: uniqueId('asset'), code: String(values.get('code')).trim().toUpperCase(), name: String(values.get('name')).trim(), type: String(values.get('type')), value: Number(values.get('value')), change: Number(values.get('change')) };
  if (state.assets.some(item => item.code === asset.code)) { assetFeedback.textContent = `O código ${asset.code} já existe.`; return; }
  if (!Number.isFinite(asset.value) || !Number.isFinite(asset.change)) { assetFeedback.textContent = 'Confira os valores informados.'; return; }
  commit(`${asset.code} foi adicionado à carteira.`, () => state.assets.push(asset));
  assetForm.reset(); assetFeedback.textContent = `${asset.code} adicionado. Use Desfazer para reverter.`;
});
assetForm.addEventListener('click', event => event.stopPropagation());
document.querySelector('#open-add-widget').addEventListener('click', () => widgetDialog.showModal());
document.querySelector('#close-widget').addEventListener('click', () => widgetDialog.close());
widgetDialog.addEventListener('click', event => { if (event.target === widgetDialog) widgetDialog.close(); });
widgetForm.addEventListener('submit', event => {
  event.preventDefault(); if (!widgetForm.reportValidity()) return;
  const values = new FormData(widgetForm);
  const item = { id: uniqueId('custom'), kind: String(values.get('kind')), title: String(values.get('title')).trim(), detail: String(values.get('detail')).trim() };
  if (!item.title || !item.detail) return;
  commit(`${item.title} foi adicionado ao painel.`, () => {
    state.hidden = state.hidden.filter(id => id !== 'market-panel');
    state.custom.push(item);
  });
  widgetForm.reset(); widgetDialog.close();
  document.querySelector(`[data-widget-id="${item.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
undoButton.addEventListener('click', undo);
document.querySelector('#restore-widgets').addEventListener('click', () => {
  if (!state.hidden.length) { dashboardFeedback.textContent = 'Todos os elementos já estão visíveis.'; return; }
  commit('Todos os elementos do painel foram restaurados.', () => { state.hidden = []; });
});
document.querySelector('#restore-hidden').addEventListener('click', () => document.querySelector('#restore-widgets').click());

// A animação se repete quando o elemento sai e volta à área visível.
let revealObserver = null;
function prepareReveal(element) {
  if (!animationsEnabled || element.classList.contains('reveal-node')) return;
  element.classList.add('reveal-node', revealCounter++ % 2 ? 'reveal-right' : 'reveal-left');
  element.style.setProperty('--reveal-delay', `${(revealCounter % 5) * 70}ms`);
  if (revealObserver) revealObserver.observe(element); else element.classList.add('in-view');
}
function createObserver() {
  if (!('IntersectionObserver' in window)) { document.querySelectorAll('.reveal-node').forEach(el => el.classList.add('in-view')); return; }
  revealObserver = new IntersectionObserver(entries => entries.forEach(entry => entry.target.classList.toggle('in-view', entry.isIntersecting)), { threshold: 0.08, rootMargin: '0px 0px -24px 0px' });
  document.querySelectorAll('.reveal-node').forEach(el => revealObserver.observe(el));
}
function setAnimations(enabled) {
  animationsEnabled = enabled;
  document.body.classList.toggle('motion-off', !enabled);
  const toggle = document.querySelector('#toggle-motion');
  toggle.textContent = `Animação: ${enabled ? 'ligada' : 'desligada'}`;
  toggle.setAttribute('aria-pressed', String(enabled));
  if (revealObserver) revealObserver.disconnect();
  if (enabled) createObserver(); else document.querySelectorAll('.reveal-node').forEach(el => el.classList.add('in-view'));
}
document.querySelector('#toggle-motion').addEventListener('click', () => setAnimations(!animationsEnabled));

// Teclas de atalho: Enter e Espaço ativam os cartões focados.
periodSelect.value = state.period;
renderState();
document.querySelectorAll('[data-widget-id]').forEach(prepareReveal);
prepareReveal(document.querySelector('.page-heading'));
prepareReveal(document.querySelector('.stats-grid'));
prepareReveal(document.querySelector('.content-grid'));
prepareReveal(document.querySelector('.holdings'));
prepareReveal(document.querySelector('.dashboard-footer'));
createObserver();
document.querySelector('#current-year').textContent = String(new Date().getFullYear());
document.querySelector('#footer-year').textContent = String(new Date().getFullYear());
