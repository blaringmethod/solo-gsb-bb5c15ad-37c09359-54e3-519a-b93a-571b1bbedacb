function fmtTime(sec) {
  const sign = sec < 0 ? '-' : '';
  const abs = Math.abs(sec);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${sign}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const STATUS_TEXT = {
  ok: '✅ 可达',
  fail: '❌ 无法按时抵达',
  unreachable: '⛔ 区域不可达',
};

/** 将单个区段的实际路线渲染为带时刻与等待信息的行进链 */
function renderLegChain(seg) {
  let chain = `${fmtTime(seg.from.time)}「${seg.from.areaName}」`;
  for (const leg of seg.legs) {
    if (leg.waitSeconds > 0) chain += ` ⏱等待 ${leg.waitSeconds} 秒`;
    chain += ` —${leg.travelSeconds} 秒→ ${fmtTime(leg.arriveTime)}「${leg.toName}」`;
  }
  return chain;
}

/** 将校验结果渲染为 Markdown 报告 */
function toMarkdown(result) {
  const lines = [];
  const s = result.summary;

  lines.push('# 舞台走位校验报告');
  lines.push('');
  lines.push(`生成时间：${new Date(result.generatedAt).toLocaleString('zh-CN', { hour12: false })}`);
  lines.push('');
  lines.push('## 汇总');
  lines.push('');
  lines.push('| 指标 | 数值 |');
  lines.push('| --- | --- |');
  lines.push(`| 演员数 | ${s.actors} |`);
  lines.push(`| 校验区段数 | ${s.segments} |`);
  lines.push(`| ✅ 按时可达 | ${s.ok} |`);
  lines.push(`| ❌ 无法按时抵达 | ${s.failed} |`);
  lines.push(`| ⛔ 区域不可达 | ${s.unreachable} |`);
  lines.push('');

  for (const actor of result.actors) {
    lines.push(`## ${actor.actorName}`);
    lines.push('');
    if (actor.segments.length === 0) {
      lines.push(`（口令数 ${actor.cueCount}，不足两条，无需校验区段）`);
      lines.push('');
      continue;
    }
    lines.push('| # | 起点 | 终点 | 可用时间 | 所需时间 | 最早到达 | 结论 | 实际路线 |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const seg of actor.segments) {
      const from = `${seg.from.areaName}（${fmtTime(seg.from.time)}）`;
      const to = `${seg.to.areaName}（${fmtTime(seg.to.time)}）`;
      const available = `${seg.availableSeconds} 秒`;
      const required = seg.requiredSeconds === null ? '—' : `${seg.requiredSeconds} 秒`;
      const arrival = seg.arrivalTime === null ? '—' : fmtTime(seg.arrivalTime);
      let verdict = STATUS_TEXT[seg.status];
      if (seg.status === 'ok') verdict += `（余 ${seg.slackSeconds} 秒）`;
      if (seg.status === 'fail') verdict += `（缺 ${-seg.slackSeconds} 秒）`;
      const route = seg.path.length > 0 ? seg.path.join(' → ') : '—';
      lines.push(`| ${seg.index} | ${from} | ${to} | ${available} | ${required} | ${arrival} | ${verdict} | ${route} |`);
    }
    lines.push('');

    // 动态路线明细：逐边列出出发 / 到达时刻与等待位置、时长
    if (actor.segments.some((seg) => seg.legs && seg.legs.length > 0)) {
      lines.push('**路线明细（含封闭时段等待推演）：**');
      lines.push('');
      for (const seg of actor.segments) {
        if (seg.status === 'unreachable') {
          lines.push(`- 区段 ${seg.index}：⛔ 两区域在连接图上不连通，无可用路线`);
        } else if (!seg.legs || seg.legs.length === 0) {
          lines.push(`- 区段 ${seg.index}：起点即终点（${seg.from.areaName}），无需移动`);
        } else {
          lines.push(`- 区段 ${seg.index}：${renderLegChain(seg)}；最早到达 ${fmtTime(seg.arrivalTime)}`);
        }
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

module.exports = { toMarkdown, fmtTime };
