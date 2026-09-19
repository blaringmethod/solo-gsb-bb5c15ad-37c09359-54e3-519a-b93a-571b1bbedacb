const { earliestArrival } = require('./graph');

/** 口令的停留秒数：合法范围 0～600；旧数据无该字段时按 0 处理 */
function stayOf(cue) {
  return Number.isInteger(cue.stay) ? Math.max(0, Math.min(600, cue.stay)) : 0;
}

/**
 * 走位校验（连续口令延误传导模式）：
 * 对每位演员，将其到位口令按时间升序排列后连续推演——
 * · 首条口令视为准时到位（实际到达时刻 = 计划时刻）；
 * · 从某条口令前往下一条时，出发时刻 = max(该条计划时刻, 该条实际到达时刻) + 该条停留时长，
 *   再复用封闭等待 / 绕行算法（earliestArrival）推演下一条口令的实际到达；
 * · 因此某段的迟到会传导给后续区段；后续间隔充足时可吸收延误、恢复准时；
 * · 图上不连通判定为不可达（传导中断，下一区段从其计划时刻重新起算）。
 */
function validate(data) {
  const areaName = new Map(data.areas.map((a) => [a.id, a.name]));
  const actors = [];
  let ok = 0;
  let failed = 0;
  let unreachable = 0;
  let propagated = 0; // 继承了上段延误的区段数

  for (const actor of data.actors) {
    const cues = data.cues
      .filter((c) => c.actorId === actor.id && areaName.has(c.areaId))
      .slice()
      .sort((x, y) => x.time - y.time);

    const segments = [];
    // 连续推演状态：上一条口令的实际到达时刻；首条口令视为准时到位。
    // 若上一区段不可达（无法推演到达），置为 null，下一区段从计划时刻重新起算。
    let prevArrival = cues.length > 0 ? cues[0].time : null;

    for (let i = 0; i + 1 < cues.length; i++) {
      const from = cues[i];
      const to = cues[i + 1];
      const stay = stayOf(from);
      const plannedDepart = from.time + stay;
      const chainReset = prevArrival === null;
      // 继承延误：上一条口令的实际到达晚于其计划时刻的秒数（迟到传导）
      const inheritedDelay = chainReset ? 0 : Math.max(0, prevArrival - from.time);
      // 实际出发 = max(计划时刻, 实际到达时刻) + 停留时长
      const actualDepart = (chainReset ? from.time : Math.max(from.time, prevArrival)) + stay;

      const ea = earliestArrival(data.edges, from.areaId, to.areaId, actualDepart);

      let status;
      let required = null;
      let slack = null;
      let arrivalTime = null;
      let lateness = null;
      let routePath = [];
      let legs = [];
      let waits = [];

      if (!ea) {
        status = 'unreachable';
        unreachable++;
        prevArrival = null; // 传导中断：下一区段按其计划时刻重新起算
      } else {
        arrivalTime = ea.time;
        required = ea.time - actualDepart; // 含途中等待的实际路上耗时
        slack = to.time - ea.time; // 到达余量（负值即迟到）
        lateness = Math.max(0, -slack); // 最终迟到
        prevArrival = ea.time; // 迟到传导给后续区段
        routePath = [from.areaId, ...ea.legs.map((l) => l.toId)].map((id) => areaName.get(id) || id);
        legs = ea.legs.map((l) => ({
          fromName: areaName.get(l.fromId) || l.fromId,
          toName: areaName.get(l.toId) || l.toId,
          departTime: l.depart,
          arriveTime: l.arrive,
          waitSeconds: l.wait,
          travelSeconds: l.arrive - l.depart,
        }));
        waits = legs
          .filter((l) => l.waitSeconds > 0)
          .map((l) => ({ areaName: l.fromName, seconds: l.waitSeconds }));
        if (lateness > 0) {
          status = 'fail';
          failed++;
        } else {
          status = 'ok';
          ok++;
        }
      }
      if (inheritedDelay > 0) propagated++;

      segments.push({
        index: i + 1,
        from: { time: from.time, areaName: areaName.get(from.areaId), note: from.note || '', staySeconds: stay },
        to: { time: to.time, areaName: areaName.get(to.areaId), note: to.note || '' },
        plannedDepart,
        actualDepart,
        inheritedDelay,
        chainReset,
        availableSeconds: to.time - actualDepart,
        requiredSeconds: required,
        slackSeconds: slack,
        latenessSeconds: lateness,
        arrivalTime,
        path: routePath,
        legs,
        waits,
        status,
      });
    }

    actors.push({
      actorId: actor.id,
      actorName: actor.name,
      cueCount: cues.length,
      segments,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      actors: data.actors.length,
      segments: ok + failed + unreachable,
      ok,
      failed,
      unreachable,
      propagated,
    },
    actors,
  };
}

module.exports = { validate };
