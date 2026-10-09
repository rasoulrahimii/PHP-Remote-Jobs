const STALE_MONTHS = 6;

const form = document.getElementById('filters');
const results = document.getElementById('results');
const summary = document.getElementById('summary');
const template = document.getElementById('card');
const themeToggle = document.getElementById('theme-toggle');
const darkQuery = matchMedia('(prefers-color-scheme: dark)');

const staleCutoff = (() => {
  const date = new Date();
  date.setMonth(date.getMonth() - STALE_MONTHS);
  return date.toISOString().slice(0, 10);
})();

const isSafeUrl = (url) => /^https?:\/\//i.test(url);

const searchText = (company) =>
  [company.name, ...company.industries, ...company.benefits].join(' ').toLowerCase();

const sorters = {
  name: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  newest: (a, b) => b.last_verified.localeCompare(a.last_verified) || sorters.name(a, b),
  oldest: (a, b) => a.last_verified.localeCompare(b.last_verified) || sorters.name(a, b),
};

function readState() {
  const data = new FormData(form);
  return {
    q: (data.get('q') || '').trim(),
    industry: data.get('industry') || '',
    sort: data.get('sort') || 'name',
    benefits: data.has('benefits'),
    recent: data.has('recent'),
  };
}

function writeState(state) {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.industry) params.set('industry', state.industry);
  if (state.sort !== 'name') params.set('sort', state.sort);
  if (state.benefits) params.set('benefits', '1');
  if (state.recent) params.set('recent', '1');
  const query = params.toString();
  history.replaceState(null, '', query ? `?${query}` : location.pathname);
}

function restoreState() {
  const params = new URLSearchParams(location.search);
  form.q.value = params.get('q') || '';
  form.industry.value = params.get('industry') || '';
  form.sort.value = sorters[params.get('sort')] ? params.get('sort') : 'name';
  form.benefits.checked = params.get('benefits') === '1';
  form.recent.checked = params.get('recent') === '1';
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

function link(label, href) {
  const anchor = document.createElement('a');
  anchor.textContent = label;
  anchor.href = href;
  anchor.target = '_blank';
  anchor.rel = 'noopener';
  return anchor;
}

function renderCard(company) {
  const card = template.content.firstElementChild.cloneNode(true);

  const name = card.querySelector('.name a');
  name.textContent = company.name;
  if (isSafeUrl(company.url)) name.href = company.url;

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
  if (isSafeUrl(company.linkedin)) links.append(link('LinkedIn', company.linkedin));
  if (company.glassdoor && isSafeUrl(company.glassdoor)) links.append(link('Glassdoor', company.glassdoor));

  const verified = card.querySelector('.verified');
  verified.dateTime = company.last_verified;
  verified.textContent = `Verified ${company.last_verified}`;
  if (company.last_verified < staleCutoff) {
    verified.classList.add('stale');
    verified.title = `Not checked in the last ${STALE_MONTHS} months`;
  }

  return card;
}

function render(companies) {
  const state = readState();
  writeState(state);

  const terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
  const visible = companies
    .filter((company) => !state.industry || company.industries.includes(state.industry))
    .filter((company) => !state.benefits || company.benefits.length > 0)
    .filter((company) => !state.recent || company.last_verified >= staleCutoff)
    .filter((company) => terms.every((term) => company.search.includes(term)))
    .sort(sorters[state.sort]);

  summary.textContent = visible.length === companies.length
    ? `${companies.length} companies`
    : `Showing ${visible.length} of ${companies.length} companies`;

  if (visible.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'No companies match these filters.';
    results.replaceChildren(empty);
    return;
  }

  results.replaceChildren(...visible.map(renderCard));
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
    const companies = (await response.json()).map((company) => ({ ...company, search: searchText(company) }));

    fillIndustries(companies);
    restoreState();
    form.addEventListener('input', () => render(companies));
    form.addEventListener('submit', (event) => event.preventDefault());
    render(companies);
  } catch (error) {
    summary.textContent = `Could not load the company list (${error.message}).`;
  }
}

setupThemeToggle();
main();
