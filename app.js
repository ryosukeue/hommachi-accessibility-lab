const nodes = [
  { id: 'west', label: '西側地上', sub: '四つ橋筋', x: 90, y: 245, type: 'exit' },
  { id: 'y', label: '四つ橋線', sub: 'Y13', x: 245, y: 245, type: 'station-y' },
  { id: 'hub', label: '乗換結節', sub: '地下連絡', x: 410, y: 245, type: 'hub' },
  { id: 'm', label: '御堂筋線', sub: 'M18', x: 575, y: 125, type: 'station-m' },
  { id: 'c', label: '中央線', sub: 'C16', x: 575, y: 365, type: 'station-c' },
  { id: 'east', label: '東側地上', sub: '御堂筋', x: 740, y: 245, type: 'exit' }
];

const baseEdges = [
  { id: 'west-y', from: 'west', to: 'y', kind: 'yotsubashi', minutes: 4 },
  { id: 'y-hub', from: 'y', to: 'hub', kind: 'transfer', minutes: 5 },
  { id: 'hub-m', from: 'hub', to: 'm', kind: 'midosuji', minutes: 4 },
  { id: 'hub-c', from: 'hub', to: 'c', kind: 'chuo', minutes: 4 },
  { id: 'm-east', from: 'm', to: 'east', kind: 'midosuji', minutes: 5 },
  { id: 'c-east', from: 'c', to: 'east', kind: 'transfer', minutes: 7 }
];

const investments = {
  'duplicate-chuo': {
    code: 'OPTION A', title: '中央線EVを複線化', cost: 180, users: 9200, score: 92,
    saving: 18.4, description: '中央線EV停止時の孤立を解消',
    edge: { id: 'c-m-backup', from: 'c', to: 'm', kind: 'proposed', minutes: 6 }
  },
  'transfer-link': {
    code: 'OPTION B', title: '乗換連絡路を改善', cost: 95, users: 15400, score: 84,
    saving: 24.1, description: '四つ橋線—御堂筋線の迂回を短縮',
    edge: { id: 'y-m-link', from: 'y', to: 'm', kind: 'proposed', minutes: 7 }
  },
  'east-exit': {
    code: 'OPTION C', title: '東側アクセスを追加', cost: 220, users: 6100, score: 58,
    saving: 11.2, description: '地上アクセスの単一障害点を低減',
    edge: { id: 'hub-east-link', from: 'hub', to: 'east', kind: 'proposed', minutes: 6 }
  }
};

const failureUsers = { none: 0, midosuji: 12100, chuo: 9200, yotsubashi: 7400 };
const failureEdgeIds = {
  midosuji: ['hub-m', 'm-east'],
  chuo: ['hub-c', 'c-east'],
  yotsubashi: ['west-y', 'y-hub']
};
const failureLabels = { none: '故障なし', midosuji: '御堂筋線EV停止', chuo: '中央線EV停止', yotsubashi: '四つ橋線EV停止' };
const endpoints = ['west', 'y', 'm', 'c', 'east'];

const failureSelect = document.querySelector('#failure-select');
const investmentSelect = document.querySelector('#investment-select');
const svg = document.querySelector('#network-map');

function activeEdges(failure, investment) {
  const failedIds = failureEdgeIds[failure] || [];
  const edges = baseEdges.map(edge => ({ ...edge, failed: failedIds.includes(edge.id) }));
  if (investment !== 'none') edges.push({ ...investments[investment].edge, proposed: true, failed: false });
  return edges;
}

function graphMetrics(failure, investment) {
  const edges = activeEdges(failure, investment).filter(edge => !edge.failed);
  const adjacency = new Map(nodes.map(node => [node.id, []]));
  edges.forEach(edge => {
    adjacency.get(edge.from).push({ node: edge.to, minutes: edge.minutes });
    adjacency.get(edge.to).push({ node: edge.from, minutes: edge.minutes });
  });

  function shortest(start, end, removedEdgeId = null) {
    const distances = new Map(nodes.map(node => [node.id, Infinity]));
    const queue = [{ id: start, distance: 0 }];
    distances.set(start, 0);
    while (queue.length) {
      queue.sort((a, b) => a.distance - b.distance);
      const current = queue.shift();
      if (current.id === end) return current.distance;
      for (const next of adjacency.get(current.id)) {
        const edge = edges.find(item => (item.from === current.id && item.to === next.node) || (item.to === current.id && item.from === next.node));
        if (edge?.id === removedEdgeId) continue;
        const distance = current.distance + next.minutes;
        if (distance < distances.get(next.node)) {
          distances.set(next.node, distance);
          queue.push({ id: next.node, distance });
        }
      }
    }
    return Infinity;
  }

  let reachable = 0;
  let redundant = 0;
  let totalMinutes = 0;
  let reachedPairs = 0;
  for (const from of endpoints) {
    for (const to of endpoints) {
      if (from === to) continue;
      const distance = shortest(from, to);
      if (Number.isFinite(distance)) {
        reachable += 1;
        reachedPairs += 1;
        totalMinutes += distance;
        const pathEdges = edges.filter(edge => Number.isFinite(shortest(from, to, edge.id)));
        if (pathEdges.length === edges.length) redundant += 1;
      }
    }
  }

  const reachability = Math.round((reachable / 20) * 100);
  const redundancy = Math.min(100, Math.round((redundant / 20) * 100));
  const baselineAverage = 9.1;
  const average = reachedPairs ? totalMinutes / reachedPairs : baselineAverage;
  const detour = failure === 'none' ? 0 : Math.max(0, Math.round((average - baselineAverage) * 10) / 10);
  let affected = failureUsers[failure];
  if (investment !== 'none') {
    const option = investments[investment];
    const recovery = failure === 'none' ? .12 : Math.min(.9, option.score / 100);
    affected = Math.round(affected * (1 - recovery));
  }
  return { reachability, blocked: 20 - reachable, redundancy, detour, affected };
}

function edgePath(edge) {
  const from = nodes.find(node => node.id === edge.from);
  const to = nodes.find(node => node.id === edge.to);
  return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
}

function renderMap() {
  const failure = failureSelect.value;
  const investment = investmentSelect.value;
  const edges = activeEdges(failure, investment);
  svg.innerHTML = `
    <title id="map-title">本町駅バリアフリー経路の概念図</title>
    <desc id="map-desc">選択中：${failureLabels[failure]}、${investment === 'none' ? '改善なし' : investments[investment].title}</desc>
    <g class="edges">
      ${edges.map(edge => `<path class="network-edge ${edge.kind === 'transfer' ? 'transfer' : ''} ${edge.failed ? 'failed' : ''} ${edge.proposed ? 'proposed' : ''}" d="${edgePath(edge)}"><title>${edge.failed ? '停止中' : edge.proposed ? '改善案' : '利用可能'}・${edge.minutes}分</title></path>`).join('')}
    </g>
    <g class="nodes">
      ${nodes.map(node => {
        const failedIds = failureEdgeIds[failure] || [];
        const failed = baseEdges.some(edge => failedIds.includes(edge.id) && (edge.from === node.id || edge.to === node.id));
        const proposed = investment !== 'none' && [investments[investment].edge.from, investments[investment].edge.to].includes(node.id);
        return `<g class="node ${node.type} ${failed ? 'failed' : ''} ${proposed ? 'proposed' : ''}" transform="translate(${node.x},${node.y})">
          <circle r="40"></circle>
          <text y="-3">${node.label}</text><text class="sub" y="17">${node.sub}</text>
        </g>`;
      }).join('')}
    </g>`;
}

function renderMetrics() {
  const failure = failureSelect.value;
  const investment = investmentSelect.value;
  const metrics = graphMetrics(failure, investment);
  document.querySelector('#reachability').textContent = `${metrics.reachability}%`;
  document.querySelector('#reachability-bar').style.width = `${metrics.reachability}%`;
  document.querySelector('#reachability-bar').style.background = metrics.reachability < 100 ? 'var(--coral)' : 'var(--mint)';
  document.querySelector('#blocked-pairs').textContent = `${metrics.blocked} / 20`;
  document.querySelector('#detour-time').textContent = `${metrics.detour}分`;
  document.querySelector('#redundant-rate').textContent = `${metrics.redundancy}%`;
  document.querySelector('#affected-users').textContent = `${metrics.affected.toLocaleString('ja-JP')}人/日`;
  const status = document.querySelector('#status-pill');
  status.textContent = failure === 'none' ? '通常' : metrics.reachability === 100 ? '迂回可能' : '移動不能あり';
  status.classList.toggle('danger', failure !== 'none');
  const note = document.querySelector('#decision-note');
  if (failure === 'none') {
    note.textContent = investment === 'none'
      ? 'すべての主要地点へ到達できます。ただし、一部経路はEVが単一障害点です。'
      : `${investments[investment].title}により、障害時の経路冗長性が改善する想定です。`;
  } else if (metrics.blocked > 0) {
    note.textContent = `${failureLabels[failure]}では${metrics.blocked}組の移動が成立しません。改善案を切り替えて回復効果を比較してください。`;
  } else {
    note.textContent = `${failureLabels[failure]}でも主要地点間の移動を維持できます。残る課題は迂回時間と費用対効果です。`;
  }
}

function renderInvestments() {
  const selected = investmentSelect.value;
  document.querySelector('#investment-cards').innerHTML = Object.entries(investments).map(([key, item]) => `
    <article class="investment-card ${selected === key ? 'selected' : ''}">
      <span class="option-code">${item.code}</span>
      <h3>${item.title}</h3>
      <div class="option-metrics">
        <div><span>概算費用</span><strong>${item.cost}百万円</strong></div>
        <div><span>改善対象</span><strong>${item.users.toLocaleString('ja-JP')}人/日</strong></div>
        <div><span>年間削減</span><strong>${item.saving}万時間</strong></div>
        <div><span>費用対効果</span><strong>${Math.round(item.users / item.cost)}人/百万円</strong></div>
      </div>
      <div class="score-row"><span>${item.description}</span><div><i style="width:${item.score}%"></i></div></div>
    </article>`).join('');
}

function update() {
  renderMap();
  renderMetrics();
  renderInvestments();
}

failureSelect.addEventListener('change', update);
investmentSelect.addEventListener('change', update);
document.querySelector('#compare-button').addEventListener('click', () => {
  const failure = failureSelect.value;
  const investment = investmentSelect.value;
  const before = graphMetrics(failure, 'none');
  const after = graphMetrics(failure, investment);
  const option = investment === 'none' ? null : investments[investment];
  document.querySelector('#dialog-title').textContent = option ? `${option.title}の改善効果` : '改善案が選択されていません';
  document.querySelector('#comparison-content').innerHTML = option ? `
    <div class="comparison-grid">
      <div class="comparison-box"><span>改善前の到達可能率</span><strong>${before.reachability}%</strong><small>${before.blocked} ODが移動不能</small></div>
      <div class="comparison-box after"><span>改善後の到達可能率</span><strong>${after.reachability}%</strong><small>${after.blocked} ODが移動不能</small></div>
    </div>
    <p class="comparison-summary">${failureLabels[failure]}の条件で、影響利用者は1日あたり約${before.affected.toLocaleString('ja-JP')}人から${after.affected.toLocaleString('ja-JP')}人へ減少する試算です。数値は現地検証前の仮説値です。</p>` :
    '<p class="comparison-summary">改善案を選択すると、現状との比較結果を表示します。</p>';
  document.querySelector('#compare-dialog').showModal();
});

update();
