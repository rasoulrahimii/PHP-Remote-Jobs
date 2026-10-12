const STALE_MONTHS = 6;
const DEFAULT_SORT = 'newest';
const NO_OPENINGS = 'no-active-openings';
const HIRING = 'hiring';
const STATUS_BADGES = { [HIRING]: 'Hiring', [NO_OPENINGS]: 'No active openings' };
const UNRESTRICTED = 'unrestricted';
const STATUS_RANK = { [HIRING]: 0, [NO_OPENINGS]: 2 };

const form = document.getElementById('filters');
const results = document.getElementById('results');
const summary = document.getElementById('summary');
const template = document.getElementById('card');
const clearButton = document.getElementById('clear');
const themeToggle = document.getElementById('theme-toggle');
const darkQuery = matchMedia('(prefers-color-scheme: dark)');

const staleCutoff = (() => {
  const date = new Date();
  date.setMonth(date.getMonth() - STALE_MONTHS);
  return date.toISOString().slice(0, 10);
})();

const isSafeUrl = (url) => /^https?:\/\//i.test(url);

const searchText = (company) =>
  [company.name, company.location || '', ...company.industries, ...company.benefits, STATUS_BADGES[company.status] || '']
    .join(' ')
    .toLowerCase();

const regionsOf = (company) => (company.location ? company.location.split(/\s*,\s*/) : [UNRESTRICTED]);

const sorters = {
  name: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  newest: (a, b) => b.last_verified.localeCompare(a.last_verified) || sorters.name(a, b),
  oldest: (a, b) => a.last_verified.localeCompare(b.last_verified) || sorters.name(a, b),
  hiring: (a, b) => (STATUS_RANK[a.status] ?? 1) - (STATUS_RANK[b.status] ?? 1) || sorters.newest(a, b),
};

const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function checkedLabel(date) {
  const days = Math.round((Date.parse(new Date().toISOString().slice(0, 10)) - Date.parse(date)) / 86400000);
  if (days < 1) return 'Checked today';
  if (days < 30) return `Checked ${relativeTime.format(-days, 'day')}`;
  if (days < 365) return `Checked ${relativeTime.format(-Math.round(days / 30), 'month')}`;
  return `Checked ${relativeTime.format(-Math.round(days / 365), 'year')}`;
}

function readState() {
  const data = new FormData(form);
  return {
    q: (data.get('q') || '').trim(),
    industry: data.get('industry') || '',
    region: data.get('region') || '',
    sort: data.get('sort') || DEFAULT_SORT,
    benefits: data.has('benefits'),
    recent: data.has('recent'),
    hiring: data.has('hiring'),
    open: data.has('open'),
  };
}

function writeState(state) {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.industry) params.set('industry', state.industry);
  if (state.region) params.set('region', state.region);
  if (state.sort !== DEFAULT_SORT) params.set('sort', state.sort);
  if (state.benefits) params.set('benefits', '1');
  if (state.recent) params.set('recent', '1');
  if (state.hiring) params.set('hiring', '1');
  if (state.open) params.set('open', '1');
  const query = params.toString();
  history.replaceState(null, '', query ? `?${query}` : location.pathname);
}

function restoreState() {
  const params = new URLSearchParams(location.search);
  form.q.value = params.get('q') || '';
  form.industry.value = params.get('industry') || '';
  form.region.value = params.get('region') || '';
  form.sort.value = sorters[params.get('sort')] ? params.get('sort') : DEFAULT_SORT;
  form.benefits.checked = params.get('benefits') === '1';
  form.recent.checked = params.get('recent') === '1';
  form.hiring.checked = params.get('hiring') === '1';
  form.open.checked = params.get('open') === '1';
}

function fillIndustries(companies) {
  const counts = new Map();
  for (const company of companies) {
    for (const industry of company.industries) {
      counts.set(industry, (counts.get(industry) || 0) + 1);
    }
  }
  const names = [...counts.keys()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  for (const name of names) {
    form.industry.append(new Option(`${name} (${counts.get(name)})`, name));
  }
}

function fillRegions(companies) {
  const counts = new Map();
  for (const company of companies) {
    for (const region of company.regions) {
      counts.set(region, (counts.get(region) || 0) + 1);
    }
  }
  if (counts.has(UNRESTRICTED)) {
    form.region.append(new Option(`No region limit listed (${counts.get(UNRESTRICTED)})`, UNRESTRICTED));
    counts.delete(UNRESTRICTED);
  }
  const names = [...counts.keys()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  for (const name of names) {
    form.region.append(new Option(`${name} (${counts.get(name)})`, name));
  }
}

function isFiltered(state) {
  return Boolean(state.q || state.industry || state.region || state.benefits || state.recent || state.hiring || state.open);
}

function iconLink(label, icon, href) {
  const anchor = document.createElement('a');
  anchor.className = 'icon-link';
  anchor.append(document.getElementById(`icon-${icon}`).content.firstElementChild.cloneNode(true));
  anchor.setAttribute('aria-label', label);
  anchor.title = label;
  anchor.href = href;
  anchor.target = '_blank';
  anchor.rel = 'noopener';
  return anchor;
}

function renderCard(company) {
  const card = template.content.firstElementChild.cloneNode(true);

  const name = card.querySelector('.name a');
  name.textContent = company.name;
  const openRoles = card.querySelector('.open-roles');
  if (isSafeUrl(company.url)) {
    name.href = company.url;
    openRoles.href = company.url;
    openRoles.setAttribute('aria-label', `Open roles at ${company.name}`);
  } else {
    openRoles.remove();
  }

  const badge = STATUS_BADGES[company.status];
  if (badge) {
    const status = card.querySelector('.status');
    status.textContent = badge;
    status.classList.add(company.status);
    status.hidden = false;
    card.classList.add(company.status);
  }

  if (company.location) {
    const location = card.querySelector('.location');
    location.textContent = `Remote: ${company.location}`;
    location.hidden = false;
  }

  const chips = card.querySelector('.chips');
  for (const industry of company.industries) {
    const chip = document.createElement('li');
    chip.textContent = industry;
    chips.append(chip);
  }

  const benefits = card.querySelector('.benefits');
  for (const benefit of company.benefits) {
    const item = document.createElement('li');
    item.textContent = benefit;
    benefits.append(item);
  }

  const links = card.querySelector('.links');
  if (isSafeUrl(company.linkedin)) links.append(iconLink(`${company.name} on LinkedIn`, 'linkedin', company.linkedin));
  if (company.glassdoor && isSafeUrl(company.glassdoor)) links.append(iconLink(`${company.name} on Glassdoor`, 'glassdoor', company.glassdoor));

  const verified = card.querySelector('.verified');
  verified.dateTime = company.last_verified;
  verified.textContent = checkedLabel(company.last_verified);
  verified.title = `Last checked by hand on ${company.last_verified}`;
  if (company.last_verified < staleCutoff) {
    verified.classList.add('stale');
    verified.title += `, more than ${STALE_MONTHS} months ago`;
  }

  return card;
}

function render(companies) {
  const state = readState();
  writeState(state);

  const terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
  const visible = companies
    .filter((company) => !state.industry || company.industries.includes(state.industry))
    .filter((company) => !state.region || company.regions.includes(state.region))
    .filter((company) => !state.benefits || company.benefits.length > 0)
    .filter((company) => !state.recent || company.last_verified >= staleCutoff)
    .filter((company) => !state.hiring || company.status === HIRING)
    .filter((company) => !state.open || company.status !== NO_OPENINGS)
    .filter((company) => terms.every((term) => company.search.includes(term)))
    .sort(sorters[state.sort]);

  const hiring = visible.filter((company) => company.status === HIRING).length;
  const count = visible.length === companies.length
    ? `${companies.length} companies`
    : `Showing ${visible.length} of ${companies.length} companies`;
  summary.textContent = hiring ? `${count}, ${hiring} hiring now` : count;
  clearButton.hidden = !isFiltered(state);

  if (visible.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    const message = document.createElement('p');
    message.textContent = 'No companies match these filters.';
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'clear';
    reset.textContent = 'Clear filters';
    reset.addEventListener('click', clearFilters);
    empty.append(message, reset);
    results.replaceChildren(empty);
    return;
  }

  results.replaceChildren(...visible.map(renderCard));
}

function clearFilters() {
  const sort = form.sort.value;
  form.reset();
  form.sort.value = sort;
  form.dispatchEvent(new Event('input'));
}

function setupShortcuts() {
  document.addEventListener('keydown', (event) => {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName))) return;
    event.preventDefault();
    form.q.focus();
    form.q.select();
  });
}

function currentTheme() {
  return document.documentElement.dataset.theme || (darkQuery.matches ? 'dark' : 'light');
}

function syncThemeToggle() {
  const dark = currentTheme() === 'dark';
  themeToggle.setAttribute('aria-checked', String(dark));
  themeToggle.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
}

function setupThemeToggle() {
  syncThemeToggle();
  darkQuery.addEventListener('change', syncThemeToggle);
  themeToggle.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch (error) {}
    syncThemeToggle();
  });
}

async function main() {
  try {
    const response = await fetch('companies.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const companies = (await response.json()).map((company) => ({ ...company, regions: regionsOf(company), search: searchText(company) }));

    fillIndustries(companies);
    fillRegions(companies);
    restoreState();
    form.addEventListener('input', () => render(companies));
    form.addEventListener('submit', (event) => event.preventDefault());
    clearButton.addEventListener('click', clearFilters);
    setupShortcuts();
    render(companies);
  } catch (error) {
    summary.textContent = `Could not load the company list (${error.message}).`;
  }
}

setupThemeToggle();
main();
