// 通道选择（U-3 接线，方案 §4.3 / A-2 的 shells 声明）：按适配器的 shells 声明决定本次用哪个通道。
// 不指定外壳时用适配器默认通道（profile.channel），行为与接线前完全一致；
// 指定外壳时取该外壳声明的 channel（如 DSH 的 web 外壳 -> dsh-plugin）；
// 外壳不存在 -> 明确报错，不静默降级到别的通道。这里只做「选哪个通道」的纯判定，
// 通道自己的前置条件（如插件通道的开关与 consent）由通道实现负责，不在这里放行。
export function selectChannelKind(profile, shellId) {
  if (!profile || !profile.id) throw new Error('通道选择：缺少应用 profile');
  const shells = Array.isArray(profile.shells) ? profile.shells : [];
  if (!shellId) return { kind: profile.channel, shell: null };
  const s = shells.find((x) => x && x.id === shellId);
  if (!s) {
    const names = shells.map((x) => x.id).filter(Boolean).join('、');
    throw new Error(`应用 ${profile.id} 没有名为 ${shellId} 的外壳` + (names ? `（可选：${names}）` : '（该应用没有声明任何外壳）'));
  }
  return { kind: s.channel, shell: s };
}
