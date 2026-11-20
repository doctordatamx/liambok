const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

function table(headers, rows) {
  return '<table><thead><tr>' + headers.map((header) => `<th scope="col">${esc(header)}</th>`).join('')
    + '</tr></thead><tbody>' + rows.map((row) => '<tr>' + row.map((cell) => `<td>${esc(cell)}</td>`).join('') + '</tr>').join('')
    + '</tbody></table>';
}

async function loadSnapshot() {
  const response = await fetch('estadisticas.json');
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const data = await response.json();
  const date = new Date(data.date + 'T12:00:00Z');
  $('#stats-date').textContent = 'Datos del ' + new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'long', timeZone: 'America/Mexico_City',
  }).format(date) + '.';
  return { ...data, meta: { universe: data.articles } };
}

const statNumber = new Intl.NumberFormat('es-MX');

function statisticsBars(rows) {
  if (!rows.length) return '<p class="hint">Sin datos para graficar.</p>';
  const peak = Math.max(1, ...rows.map(([, count]) => count));
  return rows.map(([label, count]) => `<div class="bar-row"><span>${esc(label)}</span>
    <div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width:${100 * count / peak}%"></div></div>
    <b>${statNumber.format(count)}</b></div>`).join('');
}

function renderCoauthors(network, universe) {
  const { nodes, edges, articles_with_authors: covered, distinct_names: names, distinct_pairs: pairs } = network;
  $('#stats-network-note').textContent = `${statNumber.format(covered)} de ${statNumber.format(universe)} artículos con autores. `
    + `${statNumber.format(names)} nombres y ${statNumber.format(pairs)} pares registrados. `
    + 'La red muestra los pares con más artículos compartidos. La identidad se aproxima por el nombre registrado.';
  const networkPanel = $('#stats-network');
  networkPanel.hidden = !edges.length;
  if (!edges.length) return;
  const select = $('#stats-author');
  select.innerHTML = '<option value="">Todos los autores de la red</option>' + nodes.map((node, index) =>
    `<option value="${index}">${index + 1}. ${esc(node.name)}</option>`).join('');
  const canvas = $('#stats-graph');
  const ctx = canvas.getContext('2d');
  const positions = nodes.map((_, index) => {
    const theta = 2 * Math.PI * index / nodes.length - Math.PI / 2;
    return [canvas.width / 2 + 272 * Math.cos(theta), canvas.height / 2 + 192 * Math.sin(theta)];
  });
  const draw = () => {
    const selected = select.value === '' ? null : Number(select.value);
    const visible = edges.filter((edge) => selected === null || edge.from === selected || edge.to === selected);
    const active = new Set(visible.flatMap((edge) => [edge.from, edge.to]));
    $('#stats-pairs').innerHTML = table(['Autor', 'Coautor', 'Artículos en común'], visible.map((edge) => [
      `${edge.from + 1}. ${nodes[edge.from].name}`, `${edge.to + 1}. ${nodes[edge.to].name}`, edge.articles,
    ]));
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const edge of edges) {
      ctx.beginPath();
      ctx.moveTo(...positions[edge.from]);
      ctx.lineTo(...positions[edge.to]);
      ctx.lineWidth = 1 + 5 * edge.articles / edges[0].articles;
      ctx.strokeStyle = visible.includes(edge) ? '#6aa9ff' : '#253246';
      ctx.stroke();
    }
    nodes.forEach((node, index) => {
      const [x, y] = positions[index];
      ctx.beginPath();
      ctx.arc(x, y, 15 + Math.min(8, Math.sqrt(node.articles)), 0, 2 * Math.PI);
      ctx.fillStyle = index === selected ? '#f0b35b' : active.has(index) ? '#4cc9b0' : '#53677d';
      ctx.fill();
      ctx.fillStyle = '#08121a';
      ctx.font = 'bold 16px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(index + 1, x, y);
    });
  };
  select.onchange = draw;
  draw();
}

async function loadStatistics() {
  const status = $('#stats-status');
  status.textContent = 'Calculando estadísticas del catálogo…';
  try {
    const data = await loadSnapshot();
    const universe = data.meta.universe;
    const { anio: yearCount, revista: journalCount, diseno: designCount } = data.cobertura;
    const domains = [...data.archivos_por_dominio];
    const unlinked = data.archivos_inventariados - domains.reduce((sum, [, count]) => sum + count, 0);
    if (unlinked > 0) domains.push(['Sin fuente de origen vinculada', unlinked]);
    $('#stats-kpis').innerHTML = [
      [data.archivos_inventariados, 'Archivos inventariados'],
      [universe, 'Artículos científicos únicos'],
      [data.total_revistas_distintas, 'Revistas registradas'],
      [data.red_coautoria.articles_with_authors, 'Artículos con autores'],
    ].map(([number, label]) => `<div class="kpi"><div class="value">${statNumber.format(number)}</div><div class="label">${label}</div></div>`).join('');
    $('#stats-domains').innerHTML = statisticsBars(domains);
    const years = Object.entries(data.por_anio);
    const period = $('#stats-period');
    period.onchange = () => {
      const latest = Number(years.at(-1)?.[0]);
      const visible = period.value === 'all' ? years : years.filter(([year]) => Number(year) > latest - 20);
      $('#stats-years').innerHTML = statisticsBars(visible)
        + `<p class="hint">Sin año verificable en los metadatos: ${statNumber.format(universe - yearCount)}.</p>`;
    };
    period.onchange();
    $('#stats-journals').innerHTML = statisticsBars(data.por_revista.slice(0, 12))
      + `<p class="hint">Hasta 12 revistas. Sin revista resuelta: ${statNumber.format(universe - journalCount)}.</p>`;
    const other = designCount - data.por_diseno.reduce((sum, [, count]) => sum + count, 0);
    const designs = [...data.por_diseno];
    if (other > 0) designs.push(['Otros diseños', other]);
    if (universe > designCount) designs.push(['Sin clasificar', universe - designCount]);
    $('#stats-designs').innerHTML = statisticsBars(designs);
    renderCoauthors(data.red_coautoria, universe);
    status.textContent = '';
  } catch (error) {
    status.textContent = 'No se pudieron cargar las estadísticas.';
    throw error;
  }
}

loadStatistics().catch(console.error);
