function fmtTime(sec) {
  const sign = sec < 0 ? '-' : '';
  const abs = Math.abs(sec);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${sign}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const STATUS_TEXT = {
  ok: '✅ 准时',
  fail: '❌ 迟到',
  unreachable: '⛔ 区域不可达',
};

/** 将单个区段的实际路线渲染为带时刻与等待信息的行进链（从实际出发时刻起） */
function renderLegChain(seg) {
  let chain = `${fmtTime(seg.actualDepart)}「${seg.from.areaName}」`;
  for (const leg of seg.legs) {
    if (leg.waitSeconds > 0) chain += ` ⏱等待 ${leg.waitSeconds} 秒`;
    chain += ` —${leg.travelSeconds} 秒→ ${fmtTime(leg.arriveTime)}「${leg.toName}」`;
  }
  return chain;
}

/** 区段结论文字：准时（余量 / 延误吸收）或最终迟到 */
function verdictText(seg) {
  if (seg.status === 'ok') {
    return seg.inheritedDelay > 0
      ? `准时（余 ${seg.slackSeconds} 秒，继承的 ${seg.inheritedDelay} 秒延误已吸收）`
      : `准时（余 ${seg.slackSeconds} 秒）`;
  }
  if (seg.status === 'fail') return `最终迟到 ${seg.latenessSeconds} 秒`;
  return '';
}

/** 将校验结果渲染为 Markdown 报告 */
function toMarkdown(result) {
  const lines = [];
  const s = result.summary;

  lines.push('# 舞台走位校验报告');
  lines.push('');
  lines.push(`生成时间：${new Date(result.generatedAt).toLocaleString('zh-CN', { hour12: false })}`);
  lines.push('');
  lines.push('校验模式：连续口令延误传导（首条口令视为准时到位；实际出发 = max(计划时刻, 上段实际到达) + 停留时长；迟到逐段传导，间隔充足时可吸收）。');
  lines.push('');
  lines.push('## 汇总');
  lines.push('');
  lines.push('| 指标 | 数值 |');
  lines.push('| --- | --- |');
  lines.push(`| 演员数 | ${s.actors} |`);
  lines.push(`| 校验区段数 | ${s.segments} |`);
  lines.push(`| ✅ 准时 | ${s.ok} |`);
  lines.push(`| ❌ 最终迟到 | ${s.failed} |`);
  lines.push(`| ⛔ 区域不可达 | ${s.unreachable} |`);
  lines.push(`| 🔁 发生延误传导的区段 | ${s.propagated} |`);
  lines.push('');

  for (const actor of result.actors) {
    lines.push(`## ${actor.actorName}`);
    lines.push('');
    if (actor.segments.length === 0) {
      lines.push(`（口令数 ${actor.cueCount}，不足两条，无需校验区段）`);
      lines.push('');
      continue;
    }
    lines.push('| # | 起点 | 终点 | 计划出发 | 实际出发 | 实际到达 | 继承延误 | 最终迟到 | 结论 | 实际路线 |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const seg of actor.segments) {
      const from = `${seg.from.areaName}（${fmtTime(seg.from.time)}）`;
      const to = `${seg.to.areaName}（${fmtTime(seg.to.time)}）`;
      const stayNote = seg.from.staySeconds > 0 ? `（含停留 ${seg.from.staySeconds} 秒）` : '';
      const planned = fmtTime(seg.plannedDepart) + stayNote;
      const departed = fmtTime(seg.actualDepart);
      const arrival = seg.arrivalTime === null ? '—' : fmtTime(seg.arrivalTime);
      const inherited = seg.inheritedDelay > 0 ? `${seg.inheritedDelay} 秒` : '—';
      const lateness =
        seg.status === 'fail' ? `${seg.latenessSeconds} 秒` : seg.status === 'ok' ? '准时' : '—';
      let verdict = STATUS_TEXT[seg.status];
      if (seg.status === 'ok') {
        verdict += `（余 ${seg.slackSeconds} 秒`;
        if (seg.inheritedDelay > 0) verdict += '，已吸收继承延误';
        verdict += '）';
      }
      const route = seg.path.length > 0 ? seg.path.join(' → ') : '—';
      lines.push(
        `| ${seg.index} | ${from} | ${to} | ${planned} | ${departed} | ${arrival} | ${inherited} | ${lateness} | ${verdict} | ${route} |`
      );
    }
    lines.push('');

    // 传导与路线明细：逐段列出计划/实际出发、继承延误、实际到达、最终迟到与逐边等待
    lines.push('**延误传导与路线明细（含封闭时段等待推演）：**');
    lines.push('');
    for (const seg of actor.segments) {
      const stayNote = seg.from.staySeconds > 0 ? `（含停留 ${seg.from.staySeconds} 秒）` : '';
      const resetNote = seg.chainReset ? '；上一区段不可达，本段从计划时刻重新起算' : '';
      const head = `区段 ${seg.index}：计划出发 ${fmtTime(seg.plannedDepart)}${stayNote}，实际出发 ${fmtTime(seg.actualDepart)}（继承延误 ${seg.inheritedDelay} 秒${resetNote}）`;
      if (seg.status === 'unreachable') {
        lines.push(`- ${head}；⛔ 两区域在连接图上不连通，无可用路线`);
      } else if (!seg.legs || seg.legs.length === 0) {
        lines.push(`- ${head}；起点即终点（${seg.from.areaName}），无需移动；实际到达 ${fmtTime(seg.arrivalTime)}，${verdictText(seg)}`);
      } else {
        lines.push(`- ${head}；${renderLegChain(seg)}；实际到达 ${fmtTime(seg.arrivalTime)}，${verdictText(seg)}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

module.exports = { toMarkdown, fmtTime };
