using System.Collections.Generic;
using System.Drawing;

namespace DreamSkin;

// U-1（方案 §4.6）应用列表与状态点的纯逻辑，与 Node 侧 core/apps-status.mjs 的
// appStateOf / sortAppsForList 是同一张判定表，两边各自有自检/单测守住，不许只改一边。
// 状态点五态与 §4.6 枚举一一对应（未安装 / 未运行 / 运行中 / 皮肤生效 / 兼容模式）；
// Unknown 只用于查询失败行，不是 §4.6 状态。图标不使用目标应用的 Logo（方案 §5 商标行），
// 列表行用状态点 + 名称呈现。
internal enum AppDotState
{
	NotInstalled,
	NotRunning,
	Running,
	SkinActive,
	Compat,
	Unknown
}

internal sealed class AppRow
{
	public string Id = "";
	public string Name = "";
	public string Channel = "";
	public bool Installed;
	public bool Running;
	public bool SkinActive;
	public bool CompatMode;
	public string Mode = "full";
	public string AppVersion = "";
	public string Error = "";
	public List<string> TestedVersions = new List<string>();
	public AppDotState State = AppDotState.Unknown;
}

internal static class AppStatusLogic
{
	// 五态判定，优先级与 Node 侧一致：未装 > 兼容模式（须皮肤生效或运行中）> 皮肤生效 > 运行中 > 未运行。
	public static AppDotState Decide(bool installed, bool running, bool skinActive, bool compatMode)
	{
		if (!installed)
		{
			return AppDotState.NotInstalled;
		}
		if (compatMode && (skinActive || running))
		{
			return AppDotState.Compat;
		}
		if (skinActive)
		{
			return AppDotState.SkinActive;
		}
		if (running)
		{
			return AppDotState.Running;
		}
		return AppDotState.NotRunning;
	}

	public static Color DotColor(AppDotState s)
	{
		switch (s)
		{
			case AppDotState.NotInstalled: return Color.FromArgb(107, 114, 128);
			case AppDotState.NotRunning: return Color.FromArgb(148, 163, 184);
			case AppDotState.Running: return Color.FromArgb(56, 189, 248);
			case AppDotState.SkinActive: return Color.FromArgb(74, 222, 128);
			case AppDotState.Compat: return Color.FromArgb(250, 204, 21);
			default: return Color.FromArgb(248, 113, 113);
		}
	}

	public static string StateText(AppDotState s)
	{
		switch (s)
		{
			case AppDotState.NotInstalled: return "未安装";
			case AppDotState.NotRunning: return "未运行";
			case AppDotState.Running: return "运行中";
			case AppDotState.SkinActive: return "皮肤生效";
			case AppDotState.Compat: return "兼容模式";
			default: return "未知";
		}
	}

	// V-U1：已安装优先，各组内保持原顺序（稳定）。
	public static List<AppRow> SortForList(List<AppRow> rows)
	{
		List<AppRow> r = new List<AppRow>();
		foreach (AppRow x in rows)
		{
			if (x.Installed)
			{
				r.Add(x);
			}
		}
		foreach (AppRow x in rows)
		{
			if (!x.Installed)
			{
				r.Add(x);
			}
		}
		return r;
	}

	// §4.6：未安装的应用默认折叠到「更多应用」。
	public static bool IsFolded(AppRow r)
	{
		return !r.Installed;
	}
}
