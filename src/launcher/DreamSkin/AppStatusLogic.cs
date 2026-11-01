using System;
using System.Collections;
using System.Collections.Generic;
using System.Drawing;
using System.Web.Script.Serialization;

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

// U-2 多端同步目标选择的纯逻辑（方案 §4.6：「两端同步」改为「同步到…」多选）。
// 选择集存的是应用 id 的绝对列表（总控台落在数据根目录 sync-targets.json，是 UI 偏好；
// 皮肤数据本身仍走各应用数据目录的 last-choice.json，不新开第二套存储）。
// 使用时剔除当前应用自身；2.1 的旧口径（sync-off.flag 关 / 默认开）在 LoadSelection 里一次性迁移。
public static class SyncTargetsLogic
{
	public static readonly string[] DefaultSelection = new string[2] { "cherry", "zcode" };

	// jsonText 为 null 表示选择文件不存在：旧关闭标记在 -> 空选（尊重旧「关」）；不在 -> 默认两端。
	// 文本损坏也回默认两端，避免同步被静默丢掉。
	public static List<string> LoadSelection(string jsonText, bool offFlagExists)
	{
		if (jsonText == null)
		{
			return offFlagExists ? new List<string>() : new List<string>(DefaultSelection);
		}
		try
		{
			object parsed = new JavaScriptSerializer().DeserializeObject(jsonText);
			System.Collections.IEnumerable arr = parsed as System.Collections.IEnumerable;
			if (arr == null || parsed is string)
			{
				return new List<string>(DefaultSelection);
			}
			List<string> outp = new List<string>();
			foreach (object o in arr)
			{
				string s = Convert.ToString(o);
				if (!string.IsNullOrEmpty(s) && !outp.Contains(s))
				{
					outp.Add(s);
				}
			}
			return outp;
		}
		catch
		{
			return new List<string>(DefaultSelection);
		}
	}

	public static string SaveSelection(List<string> selection)
	{
		return new JavaScriptSerializer().Serialize(selection ?? new List<string>());
	}

	// 使用时解析：剔除当前应用自身与重复项；installedIds 非空时只保留已安装的；保持选择顺序。
	public static List<string> ResolveTargets(List<string> selection, string currentId, List<string> installedIds)
	{
		List<string> outp = new List<string>();
		if (selection == null)
		{
			return outp;
		}
		foreach (string id in selection)
		{
			if (id == currentId || outp.Contains(id))
			{
				continue;
			}
			if (installedIds != null && installedIds.Count > 0 && !installedIds.Contains(id))
			{
				continue;
			}
			outp.Add(id);
		}
		return outp;
	}
}
