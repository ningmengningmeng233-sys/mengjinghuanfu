// 多目标同步扇出（U-2，方案 §4.6：「两端同步」改为「同步到…」多选）。
// 语义与 2.1 的单目标 sync 完全一致，只是把「一份已保存的皮肤选择」一次送到多个目标应用：
// 每个目标仍走单目标 sync 的老路径（目标在带皮肤运行 -> 立即换；没运行 -> 只记下选择，
// 下次用皮肤启动就是这套）。扇出层只负责编排：逐个独立执行、互不影响、逐个报告。
// runOne 由入口注入（真实实现是拉起子进程跑单目标 sync，单测用假实现）。
// 结果：{ ok, from, results: [{ app, ok, msg, skipped? }] }；ok = 没有失败项（跳过不算失败）。

export async function syncFanout({ from, targets, runOne, knownIds } = {}) {
  const known = knownIds ? new Set(knownIds) : null;
  const seen = new Set();
  const results = [];
  for (const raw of targets || []) {
    const id = String(raw || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (id === from) {
      results.push({ app: id, ok: true, skipped: true, msg: '与来源相同，已跳过' });
      continue;
    }
    if (known && !known.has(id)) {
      results.push({ app: id, ok: false, msg: '未注册的应用：' + id });
      continue;
    }
    try {
      const r = await runOne(id);
      results.push({ app: id, ok: !!(r && r.ok), msg: (r && r.msg) || '' });
    } catch (e) {
      results.push({ app: id, ok: false, msg: String((e && e.message) || e) });
    }
  }
  return { ok: results.every((r) => r.ok), from, results };
}

// 把 --to 的逗号列表拆成目标 id 数组（容忍空格与重复，顺序保留）。
export function parseTargets(to) {
  if (!to) return [];
  return String(to).split(',').map((s) => s.trim()).filter(Boolean);
}
