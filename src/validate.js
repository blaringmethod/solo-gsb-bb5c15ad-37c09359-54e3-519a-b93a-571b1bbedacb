const { earliestArrival } = require('./graph');

/**
 * 走位校验：
 * 对每位演员，将其到位口令按时间升序排列，
 * 从上一口令时刻出发，按通行耗时逐边推演至下一口令区域：
 * 进入连接若与封闭时段重叠，则在区域等待或改走其他路径，
 * 以最早到达时刻判定 按时 / 超时，图上不连通判定为 不可达。
 */
function validate(data) {
  const areaName = new Map(data.areas.map((a) => [a.id, a.name]));
  const actors = [];
  let ok = 0;
  let failed = 0;
  let unreachable = 0;

  for (const actor of data.actors) {
    const cues = data.cues
      .filter((c) => c.actorId === actor.id && areaName.has(c.areaId))
      .slice()
      .sort((x, y) => x.time - y.time);

    const segments = [];
    for (let i = 0; i + 1 < cues.length; i++) {
      const from = cues[i];
      const to = cues[i + 1];
      const available = to.time - from.time;
      const ea = earliestArrival(data.edges, from.areaId, to.areaId, from.time);

      let status;
      let required = null;
      let slack = null;
      let arrivalTime = null;
      let routePath = [];
      let legs = [];
      let waits = [];

      if (!ea) {
        status = 'unreachable';
        unreachable++;
      } else {
        arrivalTime = ea.time;
        required = ea.time - from.time; // 含途中等待的实际所需秒数
        slack = available - required;
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
        if (required <= available) {
          status = 'ok';
          ok++;
        } else {
          status = 'fail';
          failed++;
        }
      }

      segments.push({
        index: i + 1,
        from: { time: from.time, areaName: areaName.get(from.areaId), note: from.note || '' },
        to: { time: to.time, areaName: areaName.get(to.areaId), note: to.note || '' },
        availableSeconds: available,
        requiredSeconds: required,
        slackSeconds: slack,
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
    },
    actors,
  };
}

module.exports = { validate };
