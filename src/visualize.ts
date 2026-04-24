import { writeFile } from "fs/promises";
import type { Graph } from "./build-graph.ts";

export async function generateHTML(graph: Graph, outFile = "index.html"): Promise<void> {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Tool Dependency Graph</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #080c14; color: #e2e8f0; font-family: 'Inter', system-ui, sans-serif; overflow: hidden; width: 100vw; height: 100vh; }

    /* ── sidebar ── */
    #sidebar {
      position: fixed; left: 0; top: 0; bottom: 0; width: 270px;
      background: rgba(8,12,20,0.97); border-right: 1px solid #1e293b;
      display: flex; flex-direction: column; z-index: 20; padding: 16px;
      gap: 10px; overflow-y: auto;
    }
    #sidebar-header h1 {
      font-size: 13px; font-weight: 700; color: #f1f5f9;
      letter-spacing: 0.06em; text-transform: uppercase;
    }
    #sidebar-header p.sub { font-size: 11px; color: #94a3b8; margin-top: 2px; }

    #context-blurb {
      font-size: 11px; color: #94a3b8; line-height: 1.55;
      padding: 8px 10px; background: #0f172a; border-radius: 6px;
      border: 1px solid #1e293b;
    }

    #search {
      background: #0f172a; border: 1px solid #1e293b; border-radius: 6px;
      padding: 7px 10px; color: #e2e8f0; font-size: 13px; width: 100%;
      outline: none; font-family: inherit;
    }
    #search:focus { border-color: #3b82f6; }
    #search::placeholder { color: #475569; }

    .filter-group { display: flex; flex-direction: column; gap: 5px; }
    .filter-group label { font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.07em; font-weight: 600; }
    .pills { display: flex; flex-wrap: wrap; gap: 5px; }
    .pill {
      padding: 3px 9px; border-radius: 999px; font-size: 11px; cursor: pointer;
      border: 1px solid transparent; user-select: none; transition: all 0.15s;
    }
    .pill.active { border-color: rgba(255,255,255,0.4); }
    .pill-all    { background: #1e293b; color: #94a3b8; }
    .pill-google { background: #1e3a5f; color: #7dd3fc; }
    .pill-github { background: #14532d; color: #86efac; }

    .action-pills { display: flex; flex-wrap: wrap; gap: 4px; }
    .action-pill {
      padding: 2px 7px; border-radius: 4px; font-size: 10px; cursor: pointer;
      border: 1px solid transparent; opacity: 0.7; transition: all 0.15s;
      font-family: inherit;
    }
    .action-pill.active { opacity: 1; border-color: currentColor; }

    #reset-btn {
      font-size: 10px; color: #475569; background: none; border: none;
      cursor: pointer; text-align: left; padding: 0; font-family: inherit;
      text-decoration: underline; text-underline-offset: 2px;
    }
    #reset-btn:hover { color: #94a3b8; }

    /* ── info panel ── */
    #info-panel {
      background: #0f172a; border: 1px solid #1e293b;
      border-radius: 8px; padding: 12px;
      font-size: 12px; color: #94a3b8; flex-shrink: 0;
    }
    #info-panel h2 { font-size: 13px; color: #f1f5f9; margin-bottom: 4px; font-weight: 600; display: none; }
    #info-panel .meta { color: #94a3b8; margin-bottom: 8px; line-height: 1.5; }
    #info-panel .dep-section-label {
      font-size: 10px; color: #475569; margin: 8px 0 4px;
      text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;
    }
    #info-panel .dep-list { display: flex; flex-direction: column; gap: 3px; max-height: 140px; overflow-y: auto; }
    #info-panel .dep-item { font-size: 11px; color: #7dd3fc; line-height: 1.4; }
    #info-panel .dep-item.out { color: #86efac; }
    #info-panel .hint { font-size: 11px; color: #94a3b8; text-align: center; padding: 16px 0; }

    #stats { font-size: 11px; color: #475569; flex-shrink: 0; }

    /* ── canvas ── */
    #canvas { position: fixed; left: 270px; top: 0; right: 0; bottom: 0; }
    svg { width: 100%; height: 100%; }

    .node circle { cursor: pointer; }
    .node circle:hover { filter: brightness(1.5); }
    .node.dimmed circle { opacity: 0.06; }
    .node.dimmed text  { opacity: 0; }
    .node.highlighted circle { filter: brightness(1.7) drop-shadow(0 0 8px currentColor); }
    .node.hub circle { filter: drop-shadow(0 0 4px currentColor); }

    .node text {
      font-size: 9px; fill: #94a3b8; pointer-events: none;
      font-family: 'Inter', system-ui, sans-serif;
      text-shadow: 0 0 4px #080c14, 0 0 4px #080c14, 0 0 4px #080c14;
    }

    .edge { stroke-opacity: 0.10; transition: stroke-opacity 0.12s; }
    .edge.highlighted { stroke-opacity: 0.85; stroke-width: 2; }
    .edge.dimmed { stroke-opacity: 0.015; }

    .sector-label {
      font-size: 12px; text-anchor: middle;
      pointer-events: none; font-weight: 700; letter-spacing: 0.06em;
      text-transform: uppercase; font-family: 'Inter', system-ui, sans-serif;
    }

    /* ── legend ── */
    #legend {
      position: fixed; right: 16px; bottom: 16px;
      background: rgba(8,12,20,0.94); border: 1px solid #1e293b;
      border-radius: 8px; padding: 10px 12px;
      font-size: 11px; color: #94a3b8; z-index: 20;
      font-family: 'Inter', system-ui, sans-serif;
    }
    #legend .legend-title {
      font-size: 10px; color: #64748b; text-transform: uppercase;
      letter-spacing: 0.07em; margin-bottom: 7px; font-weight: 600;
    }
    .legend-row { display: flex; align-items: center; gap: 7px; margin-bottom: 4px; color: #94a3b8; }
    .legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

    /* ── toolkit legend ── */
    #tk-legend {
      position: fixed; right: 16px; top: 16px;
      background: rgba(8,12,20,0.94); border: 1px solid #1e293b;
      border-radius: 8px; padding: 10px 12px;
      font-size: 11px; z-index: 20;
      font-family: 'Inter', system-ui, sans-serif;
    }
    #tk-legend .legend-title {
      font-size: 10px; color: #64748b; text-transform: uppercase;
      letter-spacing: 0.07em; margin-bottom: 7px; font-weight: 600;
    }
    .tk-row { display: flex; align-items: center; gap: 7px; margin-bottom: 4px; }
    .tk-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; border: 1.5px solid; }

    /* ── tooltip ── */
    #tooltip {
      position: fixed; pointer-events: none; z-index: 40;
      background: rgba(8,12,20,0.96); border: 1px solid #334155;
      border-radius: 6px; padding: 7px 10px; font-size: 11px;
      color: #e2e8f0; max-width: 220px; display: none;
      font-family: 'Inter', system-ui, sans-serif;
      box-shadow: 0 4px 16px rgba(0,0,0,0.5);
    }
    #tooltip .tt-name { font-weight: 600; margin-bottom: 2px; }
    #tooltip .tt-meta { color: #94a3b8; font-size: 10px; margin-bottom: 3px; }
    #tooltip .tt-desc { color: #64748b; font-size: 10px; line-height: 1.4; }

    /* ── empty state ── */
    #empty-state {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
      text-align: center; pointer-events: none; display: none;
    }
    #empty-state p    { font-size: 15px; font-weight: 500; color: #94a3b8; }
    #empty-state span { font-size: 12px; color: #475569; margin-top: 4px; display: block; }
  </style>
</head>
<body>

<div id="sidebar">
  <div id="sidebar-header">
    <h1>Tool Dependency Graph</h1>
    <p class="sub">${graph.meta.totalTools} tools · ${graph.meta.edgeCount} edges</p>
  </div>

  <div id="context-blurb">
    Which API tools produce outputs consumed by other tools?
    Larger nodes = more connections. Click any node to inspect.
  </div>

  <input id="search" type="text" placeholder="Search tools…" aria-label="Search tools" />

  <div class="filter-group">
    <label>Toolkit</label>
    <div class="pills">
      <span class="pill pill-all active" data-tk="all">All</span>
      <span class="pill pill-google" data-tk="googlesuper">Google Super</span>
      <span class="pill pill-github" data-tk="github">GitHub</span>
    </div>
  </div>

  <div class="filter-group">
    <label>Action type</label>
    <div class="action-pills" id="action-pills"></div>
    <button id="reset-btn">Reset filters</button>
  </div>

  <div id="info-panel">
    <h2 id="info-name"></h2>
    <div class="meta" id="info-meta"></div>
    <div class="dep-list" id="info-deps"></div>
    <div class="hint" id="info-hint">Click a node to inspect its dependencies</div>
  </div>

  <div id="stats"></div>
</div>

<div id="canvas">
  <svg id="graph" role="img" aria-label="Tool dependency graph"></svg>
  <div id="empty-state">
    <p>No tools match</p>
    <span>Try adjusting the toolkit or action type filters</span>
  </div>
</div>

<div id="tk-legend">
  <div class="legend-title">Toolkit</div>
  <div class="tk-row">
    <div class="tk-dot" style="background:#1d4ed8;border-color:#60a5fa"></div>
    <span style="color:#7dd3fc">Google Super</span>
  </div>
  <div class="tk-row">
    <div class="tk-dot" style="background:#15803d;border-color:#4ade80"></div>
    <span style="color:#86efac">GitHub</span>
  </div>
  <div style="margin-top:8px;font-size:10px;color:#475569">Node size = degree</div>
  <div style="font-size:10px;color:#475569">Glow = top hub nodes</div>
</div>

<div id="legend">
  <div class="legend-title">Action type</div>
  <div class="legend-row"><div class="legend-dot" style="background:#38bdf8"></div>list</div>
  <div class="legend-row"><div class="legend-dot" style="background:#7dd3fc"></div>get</div>
  <div class="legend-row"><div class="legend-dot" style="background:#86efac"></div>create</div>
  <div class="legend-row"><div class="legend-dot" style="background:#c4b5fd"></div>update</div>
  <div class="legend-row"><div class="legend-dot" style="background:#fca5a5"></div>delete</div>
  <div class="legend-row"><div class="legend-dot" style="background:#fcd34d"></div>send</div>
  <div class="legend-row"><div class="legend-dot" style="background:#67e8f9"></div>search</div>
  <div class="legend-row"><div class="legend-dot" style="background:#94a3b8"></div>other</div>
</div>

<div id="tooltip">
  <div class="tt-name" id="tt-name"></div>
  <div class="tt-meta" id="tt-meta"></div>
  <div class="tt-desc" id="tt-desc"></div>
</div>

<script>
const RAW = ${JSON.stringify(graph)};

const TK = {
  googlesuper: { fill: '#1d4ed8', stroke: '#60a5fa', label: 'Google Super' },
  github:      { fill: '#15803d', stroke: '#4ade80', label: 'GitHub' },
};

const ACTION_COLORS = {
  list:    { bg: '#0c4a6e', text: '#38bdf8' },
  get:     { bg: '#1e3a5f', text: '#7dd3fc' },
  create:  { bg: '#14532d', text: '#86efac' },
  update:  { bg: '#3b0764', text: '#c4b5fd' },
  delete:  { bg: '#7f1d1d', text: '#fca5a5' },
  send:    { bg: '#78350f', text: '#fcd34d' },
  search:  { bg: '#164e63', text: '#67e8f9' },
  other:   { bg: '#1e293b', text: '#94a3b8' },
};

function getAction(slug) {
  const s = slug.toLowerCase();
  if (s.includes('_list_') || s.endsWith('_list')) return 'list';
  if (s.includes('_get_') || s.endsWith('_get') || s.includes('_fetch')) return 'get';
  if (s.includes('_create_') || s.includes('_add_') || s.includes('_insert_')) return 'create';
  if (s.includes('_update_') || s.includes('_patch_') || s.includes('_edit_') || s.includes('_set_')) return 'update';
  if (s.includes('_delete_') || s.includes('_remove_') || s.includes('_revoke_')) return 'delete';
  if (s.includes('_send_') || s.includes('_reply_') || s.includes('_forward_')) return 'send';
  if (s.includes('_search_') || s.includes('_find_') || s.includes('_query_')) return 'search';
  return 'other';
}

function labelFor(id) {
  return id.replace(/^(GOOGLESUPER|GITHUB)_/, '').replace(/_/g, ' ').toLowerCase();
}

const W = 1060, H = 820, CX = W / 2, CY = H / 2;
const INNER_R = 160, OUTER_R = 350;

// Deterministic pseudo-random jitter keyed on slug (no Math.random so layout is stable)
function stableJitter(slug, scale) {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) & 0xffffffff;
  return ((h & 0xff) / 255 - 0.5) * scale;
}

function computeLayout(nodes) {
  const byTk = {};
  for (const n of nodes) {
    if (!byTk[n.toolkit]) byTk[n.toolkit] = {};
    const a = getAction(n.id);
    if (!byTk[n.toolkit][a]) byTk[n.toolkit][a] = [];
    byTk[n.toolkit][a].push(n);
  }

  const tkList = Object.keys(byTk);
  const tkAngleRange = (2 * Math.PI) / tkList.length;

  const positioned = [];
  tkList.forEach((tk, tkIdx) => {
    const tkStart = tkIdx * tkAngleRange - Math.PI / 2;
    const tkEnd   = tkStart + tkAngleRange;
    const actions = Object.keys(byTk[tk]);
    const actionRange = (tkEnd - tkStart) / actions.length;

    actions.forEach((action, aIdx) => {
      const aStart = tkStart + aIdx * actionRange + 0.02;
      const aEnd   = aStart  + actionRange        - 0.02;
      const group  = byTk[tk][action];
      const deg    = group.length;

      group.forEach((n, i) => {
        const t     = deg === 1 ? 0.5 : i / (deg - 1);
        const angle = aStart + t * (aEnd - aStart) + stableJitter(n.id, 0.015);
        const r     = INNER_R + (OUTER_R - INNER_R) * (0.1 + 0.8 * t) + stableJitter(n.id + 'r', 18);
        positioned.push({
          ...n,
          x: Math.round(CX + r * Math.cos(angle)),
          y: Math.round(CY + r * Math.sin(angle)),
          action, tkIdx, angle,
        });
      });
    });
  });
  return positioned;
}

// ── svg setup ────────────────────────────────────────────────────────────────
const svg = d3.select('#graph');
const g   = svg.append('g');

svg.call(d3.zoom()
  .scaleExtent([0.12, 10])
  .on('zoom', e => g.attr('transform', e.transform)));

// ── state ────────────────────────────────────────────────────────────────────
let activeTk      = 'all';
let activeActions = new Set(Object.keys(ACTION_COLORS));
let searchTerm    = '';
let selectedNode  = null;

// ── action pills ─────────────────────────────────────────────────────────────
const pillsEl = document.getElementById('action-pills');
for (const [action, colors] of Object.entries(ACTION_COLORS)) {
  const el = document.createElement('span');
  el.className = 'action-pill active';
  el.dataset.action = action;
  el.textContent = action;
  el.style.background = colors.bg;
  el.style.color = colors.text;
  el.addEventListener('click', () => {
    if (activeActions.has(action)) activeActions.delete(action);
    else activeActions.add(action);
    el.classList.toggle('active');
    render();
  });
  pillsEl.appendChild(el);
}

document.getElementById('reset-btn').addEventListener('click', () => {
  activeActions = new Set(Object.keys(ACTION_COLORS));
  document.querySelectorAll('.action-pill').forEach(p => p.classList.add('active'));
  document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  document.querySelector('.pill-all').classList.add('active');
  activeTk = 'all';
  document.getElementById('search').value = '';
  searchTerm = '';
  render();
});

document.querySelectorAll('.pill').forEach(p => {
  p.addEventListener('click', () => {
    document.querySelectorAll('.pill').forEach(x => x.classList.remove('active'));
    p.classList.add('active');
    activeTk = p.dataset.tk;
    selectedNode = null;
    render();
  });
});

document.getElementById('search').addEventListener('input', e => {
  searchTerm = e.target.value.toLowerCase().trim();
  render();
});

// ── tooltip ──────────────────────────────────────────────────────────────────
const tooltipEl = document.getElementById('tooltip');
function showTooltip(event, d) {
  const tkColor = TK[d.toolkit]?.stroke ?? '#94a3b8';
  const actionColor = ACTION_COLORS[d.action]?.text ?? '#94a3b8';
  document.getElementById('tt-name').textContent = labelFor(d.id);
  document.getElementById('tt-meta').innerHTML =
    \`<span style="color:\${tkColor}">\${TK[d.toolkit]?.label ?? d.toolkit}</span> · <span style="color:\${actionColor}">\${d.action}</span> · \${d.inDegree + d.outDegree} edges\`;
  document.getElementById('tt-desc').textContent = (d.description || '').slice(0, 90);
  tooltipEl.style.display = 'block';
  moveTooltip(event);
}
function moveTooltip(event) {
  const x = event.clientX + 14, y = event.clientY - 10;
  tooltipEl.style.left = Math.min(x, window.innerWidth - 240) + 'px';
  tooltipEl.style.top  = Math.max(y, 8) + 'px';
}
function hideTooltip() { tooltipEl.style.display = 'none'; }

// ── render ────────────────────────────────────────────────────────────────────
function render() {
  g.selectAll('*').remove();
  selectedNode = null;
  updateInfo(null);

  let nodes = RAW.nodes.filter(n => {
    if (activeTk !== 'all' && n.toolkit !== activeTk) return false;
    if (!activeActions.has(getAction(n.id))) return false;
    return true;
  });

  if (searchTerm) {
    const matches = new Set(nodes.filter(n =>
      n.id.toLowerCase().includes(searchTerm) ||
      (n.description || '').toLowerCase().includes(searchTerm)
    ).map(n => n.id));
    RAW.edges.forEach(e => { if (matches.has(e.from) || matches.has(e.to)) { matches.add(e.from); matches.add(e.to); } });
    nodes = nodes.filter(n => matches.has(n.id));
  }

  document.getElementById('empty-state').style.display = nodes.length === 0 ? 'block' : 'none';

  const nodeIds  = new Set(nodes.map(n => n.id));
  const nodeMap  = Object.fromEntries(computeLayout(nodes).map(n => [n.id, n]));
  const allNodes = Object.values(nodeMap);

  const degree  = d => d.inDegree + d.outDegree;
  const degrees = allNodes.map(degree).sort((a, b) => b - a);
  const hubThresh = degrees[Math.min(15, degrees.length - 1)] ?? 0;

  const links = RAW.edges
    .filter(e => nodeIds.has(e.from) && nodeIds.has(e.to) && nodeMap[e.from] && nodeMap[e.to])
    .map(e => ({ ...e, source: nodeMap[e.from], target: nodeMap[e.to] }));

  // reference rings
  const grid = g.append('g').attr('class', 'grid');
  [INNER_R, (INNER_R + OUTER_R) / 2, OUTER_R].forEach(r => {
    grid.append('circle').attr('cx', CX).attr('cy', CY).attr('r', r)
      .attr('fill', 'none').attr('stroke', '#0f172a').attr('stroke-width', 1);
  });

  // edges
  const edgeG   = g.append('g').attr('class', 'edges');
  const edgeSel = edgeG.selectAll('path').data(links).join('path')
    .attr('class', 'edge').attr('fill', 'none')
    .attr('stroke', d => ACTION_COLORS[getAction(d.to)]?.text ?? '#4b5563')
    .attr('stroke-width', d => Math.max(0.4, d.confidence * 0.8))
    .attr('d', d => {
      const sx = d.source.x, sy = d.source.y, tx = d.target.x, ty = d.target.y;
      const mx = (sx + tx) / 2, my = (sy + ty) / 2;
      const dx = mx - CX, dy = my - CY;
      const pull = 0.28;
      return \`M\${sx},\${sy} Q\${mx - dx * pull},\${my - dy * pull} \${tx},\${ty}\`;
    });

  // nodes
  const nodeG   = g.append('g').attr('class', 'nodes');
  const nodeR   = d => Math.max(3, Math.min(16, 3 + Math.sqrt(degree(d) * 2.2)));
  const nodeSel = nodeG.selectAll('g').data(allNodes).join('g')
    .attr('class', d => 'node' + (degree(d) >= hubThresh && hubThresh > 0 ? ' hub' : ''))
    .attr('transform', d => \`translate(\${d.x},\${d.y})\`);

  nodeSel.append('circle')
    .attr('r', nodeR)
    .attr('fill', d => ACTION_COLORS[d.action]?.bg ?? '#1e293b')
    .attr('stroke', d => TK[d.toolkit]?.stroke ?? '#6b7280')
    .attr('stroke-width', d => degree(d) > 5 ? 1.5 : 0.8);

  // labels for prominent nodes
  nodeSel.filter(d => degree(d) >= 5)
    .append('text')
    .attr('dy', d => -(nodeR(d) + 3))
    .attr('text-anchor', 'middle')
    .style('font-size', d => degree(d) >= 12 ? '10px' : '8px')
    .style('fill', d => TK[d.toolkit]?.stroke ?? '#94a3b8')
    .text(d => labelFor(d.id).slice(0, 26));

  // sector labels
  const tkList = [...new Set(allNodes.map(n => n.toolkit))];
  tkList.forEach((tk, i) => {
    const angle = i * (2 * Math.PI / tkList.length) - Math.PI / 2 + Math.PI / tkList.length;
    const lr = OUTER_R + 48;
    g.append('text')
      .attr('class', 'sector-label')
      .attr('x', CX + lr * Math.cos(angle))
      .attr('y', CY + lr * Math.sin(angle) + 4)
      .style('fill', TK[tk]?.stroke ?? '#94a3b8')
      .text(TK[tk]?.label ?? tk);
  });

  // interaction
  nodeSel
    .on('click', (event, d) => {
      event.stopPropagation();
      hideTooltip();
      selectedNode = d.id;
      const nbrs = new Set([d.id]);
      links.forEach(l => { if (l.source.id === d.id) nbrs.add(l.target.id); if (l.target.id === d.id) nbrs.add(l.source.id); });
      nodeSel.classed('dimmed', n => !nbrs.has(n.id)).classed('highlighted', n => n.id === d.id);
      edgeSel.classed('highlighted', l => l.source.id === d.id || l.target.id === d.id)
              .classed('dimmed',      l => l.source.id !== d.id && l.target.id !== d.id);
      updateInfo(d, links);
    })
    .on('mouseover', (event, d) => {
      showTooltip(event, d);
      if (selectedNode) return;
      const nbrs = new Set([d.id]);
      links.forEach(l => { if (l.source.id === d.id) nbrs.add(l.target.id); if (l.target.id === d.id) nbrs.add(l.source.id); });
      nodeSel.classed('dimmed', n => !nbrs.has(n.id));
      edgeSel.classed('highlighted', l => l.source.id === d.id || l.target.id === d.id)
              .classed('dimmed',      l => l.source.id !== d.id && l.target.id !== d.id);
    })
    .on('mousemove', moveTooltip)
    .on('mouseout', () => {
      hideTooltip();
      if (selectedNode) return;
      nodeSel.classed('dimmed', false).classed('highlighted', false);
      edgeSel.classed('dimmed', false).classed('highlighted', false);
    });

  svg.on('click', () => {
    selectedNode = null;
    nodeSel.classed('dimmed', false).classed('highlighted', false);
    edgeSel.classed('dimmed', false).classed('highlighted', false);
    updateInfo(null);
  });

  document.getElementById('stats').textContent =
    \`\${allNodes.length} tools · \${links.length} edges shown\`;
}

// ── info panel ────────────────────────────────────────────────────────────────
function updateInfo(node, links) {
  const nameEl = document.getElementById('info-name');
  const metaEl = document.getElementById('info-meta');
  const depsEl = document.getElementById('info-deps');
  const hintEl = document.getElementById('info-hint');

  if (!node) {
    nameEl.style.display = 'none';
    metaEl.textContent = '';
    depsEl.innerHTML = '';
    hintEl.style.display = 'block';
    return;
  }

  hintEl.style.display = 'none';
  nameEl.style.display = 'block';
  nameEl.textContent = labelFor(node.id);

  const tkColor  = TK[node.toolkit]?.stroke ?? '#94a3b8';
  const actColor = ACTION_COLORS[node.action]?.text ?? '#94a3b8';
  const deg      = node.inDegree + node.outDegree;
  metaEl.innerHTML = \`
    <span style="color:\${tkColor}">\${TK[node.toolkit]?.label ?? node.toolkit}</span> ·
    <span style="color:\${actColor}">\${node.action}</span> · \${deg} edges<br>
    <span style="color:#94a3b8;font-size:10px">\${(node.description || '').slice(0, 110)}</span>
  \`;

  const incoming = links.filter(l => l.target.id === node.id);
  const outgoing = links.filter(l => l.source.id === node.id);

  depsEl.innerHTML = '';
  if (incoming.length) {
    const h = document.createElement('div');
    h.className = 'dep-section-label';
    h.textContent = \`↓ \${incoming.length} precursors (needs output from)\`;
    depsEl.appendChild(h);
    incoming.slice(0, 7).forEach(l => {
      const el = document.createElement('div');
      el.className = 'dep-item';
      el.textContent = \`\${labelFor(l.source.id)} → \${l.via}\`;
      depsEl.appendChild(el);
    });
    if (incoming.length > 7) {
      const more = document.createElement('div');
      more.style.cssText = 'font-size:10px;color:#475569;margin-top:2px';
      more.textContent = \`+\${incoming.length - 7} more\`;
      depsEl.appendChild(more);
    }
  }
  if (outgoing.length) {
    const h = document.createElement('div');
    h.className = 'dep-section-label';
    h.textContent = \`↑ \${outgoing.length} consumers (provides output to)\`;
    depsEl.appendChild(h);
    outgoing.slice(0, 7).forEach(l => {
      const el = document.createElement('div');
      el.className = 'dep-item out';
      el.textContent = \`\${labelFor(l.target.id)} needs \${l.via}\`;
      depsEl.appendChild(el);
    });
    if (outgoing.length > 7) {
      const more = document.createElement('div');
      more.style.cssText = 'font-size:10px;color:#475569;margin-top:2px';
      more.textContent = \`+\${outgoing.length - 7} more\`;
      depsEl.appendChild(more);
    }
  }
}

render();
</script>
</body>
</html>`;

  await writeFile(outFile, html, "utf-8");
  console.log(`Visualization written to ${outFile}`);
}
