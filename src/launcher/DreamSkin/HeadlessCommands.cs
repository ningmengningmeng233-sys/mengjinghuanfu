using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Xml.Linq;
using Windows.ApplicationModel;
using Windows.Management.Deployment;

namespace DreamSkin;

// 总控台无界面子命令（launcher 第二批，方案 §6 T2-2 / §4.3）：
//   --resolve-aumid <packageFamilyPrefix> [--exe <exeName>]
//       只读解析已注册 MSIX 包：包族名 -> 包 -> 包内应用 -> AUMID。
//       标准输出一行 JSON（形状与 Node 端 PowerShell 查询一致，另带 AppId / Aumid），
//       退出码 0 = 已解析；1 = 参数错误 / 找不到包 / 内部错误（原因写标准错误）。
//       Node 端 channels/msix.mjs 在总控台可用时优先走这里，不可用回退 PowerShell 只读查询。
//   --activate <aumid> --args "<args>"
//       经 IApplicationActivationManager（COM）激活 MSIX 应用并传参，
//       绝不直接执行 WindowsApps 下的 exe（§4.3）。
//       退出码：0 = 已激活；1 = 参数错误；2 = 激活失败（HRESULT 写标准错误）。
//   --which-node
//       只读诊断：输出总控台的 Node 定位结果（payload 自带 / 数据目录下载 / PATH 三档），
//       无副作用验证 T0-6「优先内置 Node」接线用；不会启动任何目标应用。
// 本程序是 WinExe（无自带控制台）：输出写标准输出句柄（被管道 / 重定向捕获时直接可用）；
// 句柄无效（用户在终端里直接运行子命令）时先挂接父进程控制台再写。
internal static class HeadlessCommands
{
	public static bool IsHeadlessCommand(string arg)
	{
		return arg == "--resolve-aumid" || arg == "--activate" || arg == "--which-node" || arg == "--selfcheck-u1";
	}

	public static int Run(string[] args)
	{
		try
		{
			if (args[0] == "--resolve-aumid")
			{
				return RunResolveAumid(args);
			}
			if (args[0] == "--activate")
			{
				return RunActivate(args);
			}
			if (args[0] == "--selfcheck-u1")
			{
				return RunSelfcheckU1();
			}
			return RunWhichNode();
		}
		catch (Exception ex)
		{
			Error("ERROR: " + ex.Message);
			return 1;
		}
	}

	// U-1 自检：状态点判定表 / 排序 / 折叠 / 颜色与文案，与 Node 侧 u-1 单测同一组用例。
	// 只跑纯逻辑，不读真实应用状态。全部通过退出码 0，否则 1。
	private static int RunSelfcheckU1()
	{
		int pass = 0;
		int fail = 0;
		System.Action<string, bool> check = delegate(string name, bool ok)
		{
			if (ok)
			{
				pass++;
				Out.WriteLine("PASS: " + name);
			}
			else
			{
				fail++;
				Out.WriteLine("FAIL: " + name);
			}
		};
		check("Decide 未装", AppStatusLogic.Decide(false, false, false, false) == AppDotState.NotInstalled);
		check("Decide 没装时兼容记录不作数", AppStatusLogic.Decide(false, false, true, true) == AppDotState.NotInstalled);
		check("Decide 未运行", AppStatusLogic.Decide(true, false, false, false) == AppDotState.NotRunning);
		check("Decide 运行中", AppStatusLogic.Decide(true, true, false, false) == AppDotState.Running);
		check("Decide 皮肤生效", AppStatusLogic.Decide(true, false, true, false) == AppDotState.SkinActive);
		check("Decide 皮肤生效优先于运行中", AppStatusLogic.Decide(true, true, true, false) == AppDotState.SkinActive);
		check("Decide 兼容模式（运行中）", AppStatusLogic.Decide(true, true, false, true) == AppDotState.Compat);
		check("Decide 兼容模式（皮肤生效）", AppStatusLogic.Decide(true, false, true, true) == AppDotState.Compat);
		check("Decide 没跑没皮肤时兼容记录不点亮", AppStatusLogic.Decide(true, false, false, true) == AppDotState.NotRunning);
		List<AppRow> rows = new List<AppRow>
		{
			new AppRow { Id = "a" },
			new AppRow { Id = "b", Installed = true },
			new AppRow { Id = "c" },
			new AppRow { Id = "d", Installed = true }
		};
		List<AppRow> sorted = AppStatusLogic.SortForList(rows);
		check("SortForList 已装优先且稳定", sorted[0].Id == "b" && sorted[1].Id == "d" && sorted[2].Id == "a" && sorted[3].Id == "c");
		check("IsFolded 未装折叠", AppStatusLogic.IsFolded(new AppRow()) && !AppStatusLogic.IsFolded(new AppRow { Installed = true }));
		HashSet<int> colors = new HashSet<int>();
		bool texts = true;
		foreach (AppDotState s in System.Enum.GetValues(typeof(AppDotState)))
		{
			colors.Add(AppStatusLogic.DotColor(s).ToArgb());
			if (string.IsNullOrEmpty(AppStatusLogic.StateText(s)))
			{
				texts = false;
			}
		}
		check("DotColor 六态互不相同", colors.Count == 6);
		check("StateText 六态都有文案", texts);
		Out.WriteLine("SELFCHECK-U1: " + pass + "/" + (pass + fail) + " PASS");
		return (fail == 0) ? 0 : 1;
	}

	// ---------- 控制台输出（WinExe 适配） ----------

	private static TextWriter _out;

	private static TextWriter _err;

	private static TextWriter Out => _out ?? (_out = OpenStd(-11));

	private static TextWriter Err => _err ?? (_err = OpenStd(-12));

	[DllImport("kernel32.dll")]
	private static extern IntPtr GetStdHandle(int nStdHandle);

	[DllImport("kernel32.dll")]
	private static extern bool AttachConsole(int dwProcessId);

	private static TextWriter OpenStd(int which)
	{
		IntPtr h = GetStdHandle(which);
		if (h == IntPtr.Zero || h == new IntPtr(-1))
		{
			AttachConsole(-1); // ATTACH_PARENT_PROCESS：终端里直接运行时把输出挂回父控制台
		}
		Stream s = (which == -11) ? Console.OpenStandardOutput() : Console.OpenStandardError();
		return new StreamWriter(s, new UTF8Encoding(false)) { AutoFlush = true };
	}

	private static void Error(string msg)
	{
		try
		{
			Err.WriteLine(msg);
		}
		catch
		{
		}
	}

	private static string Json(object payload)
	{
		return new JavaScriptSerializer().Serialize(payload);
	}

	// ---------- --resolve-aumid ----------

	private sealed class AppEntryInfo
	{
		public string Id = "";

		public string Executable = "";
	}

	private sealed class PackageResolution
	{
		public string Name = "";

		public string PackageFamilyName = "";

		public string Version = "";

		public string InstallLocation = "";

		public readonly List<AppEntryInfo> Apps = new List<AppEntryInfo>();
	}

	private static int RunResolveAumid(string[] args)
	{
		if (args.Length < 2 || string.IsNullOrWhiteSpace(args[1]) || args[1].StartsWith("--"))
		{
			Error("用法：梦境换肤.exe --resolve-aumid <packageFamilyPrefix> [--exe <exeName>]");
			return 1;
		}
		string prefix = args[1].Trim();
		string exeName = "";
		for (int i = 2; i + 1 < args.Length; i++)
		{
			if (args[i] == "--exe")
			{
				exeName = args[i + 1];
			}
		}
		// WinRT 包查询放线程池线程上跑，避免在 STA 主线程上同步等 WinRT 异步造成死锁。
		PackageResolution res = Task.Run(() => ResolvePackage(prefix)).GetAwaiter().GetResult();
		if (res == null)
		{
			Error("没有找到包族名匹配 \"" + prefix + "\" 的已注册 MSIX 包。");
			return 1;
		}
		string appId = PickAppId(res.Apps, exeName);
		var payload = new Dictionary<string, object>
		{
			["Name"] = res.Name,
			["PackageFamilyName"] = res.PackageFamilyName,
			["Version"] = res.Version,
			["InstallLocation"] = res.InstallLocation,
			["Apps"] = res.Apps.Select(a => new Dictionary<string, object>
			{
				["Id"] = a.Id,
				["Executable"] = a.Executable
			}).ToList(),
			["AppId"] = appId,
			["Aumid"] = (appId.Length > 0) ? (res.PackageFamilyName + "!" + appId) : ""
		};
		Out.WriteLine(Json(payload));
		return 0;
	}

	private static PackageResolution ResolvePackage(string prefix)
	{
		var pm = new PackageManager();
		var matches = new List<Package>();
		foreach (Package pkg in pm.FindPackagesForUser(""))
		{
			if (pkg.IsFramework)
			{
				continue;
			}
			string family = pkg.Id.FamilyName ?? "";
			if (family.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
			{
				matches.Add(pkg);
			}
		}
		if (matches.Count == 0)
		{
			return null;
		}
		Package chosen = matches.FirstOrDefault(p => string.Equals(p.Id.FamilyName, prefix, StringComparison.OrdinalIgnoreCase))
			?? matches.OrderBy(p => p.Id.FamilyName, StringComparer.OrdinalIgnoreCase).First();
		var res = new PackageResolution
		{
			Name = chosen.Id.Name ?? "",
			PackageFamilyName = chosen.Id.FamilyName ?? "",
			Version = VersionString(chosen.Id.Version)
		};
		try
		{
			res.InstallLocation = chosen.InstalledLocation.Path ?? "";
		}
		catch
		{
			res.InstallLocation = "";
		}
		Dictionary<string, string> manifestApps = ReadManifestApps(res.InstallLocation);
		try
		{
			foreach (var entry in chosen.GetAppListEntries())
			{
				string aumid = entry.AppUserModelId ?? "";
				int bang = aumid.IndexOf('!');
				string id = (bang >= 0) ? aumid.Substring(bang + 1) : aumid;
				if (id.Length == 0)
				{
					continue;
				}
				string exe;
				if (!manifestApps.TryGetValue(id, out exe))
				{
					exe = "";
				}
				res.Apps.Add(new AppEntryInfo { Id = id, Executable = exe });
			}
		}
		catch
		{
			// 个别包的应用列表读取会抛错：条目为空时退回包清单里的全部应用（见下）。
		}
		if (res.Apps.Count == 0)
		{
			foreach (KeyValuePair<string, string> kv in manifestApps)
			{
				res.Apps.Add(new AppEntryInfo { Id = kv.Key, Executable = kv.Value });
			}
		}
		return res;
	}

	private static string VersionString(PackageVersion v)
	{
		return v.Major + "." + v.Minor + "." + v.Build + "." + v.Revision;
	}

	// 尽力读包清单拿每个应用的 Executable（给 PickAppId 的第一档匹配用）。
	// WindowsApps 的 ACL 可能拒绝读取：拿不到时 Executable 留空，PickAppId 按后续规则挑，不当错误。
	private static Dictionary<string, string> ReadManifestApps(string installLocation)
	{
		var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
		try
		{
			if (string.IsNullOrEmpty(installLocation))
			{
				return map;
			}
			string path = Path.Combine(installLocation, "AppxManifest.xml");
			if (!File.Exists(path))
			{
				return map;
			}
			XDocument doc = XDocument.Load(path);
			foreach (XElement el in doc.Descendants())
			{
				if (el.Name.LocalName != "Application")
				{
					continue;
				}
				string id = (string)el.Attribute("Id") ?? "";
				if (id.Length == 0)
				{
					continue;
				}
				map[id] = (string)el.Attribute("Executable") ?? "";
			}
		}
		catch
		{
		}
		return map;
	}

	// 与 Node 端 channels/msix.mjs 的 pickAppId 同口径：
	// 先按可执行文件名对上，再退回 Id 为 App 的，最后取第一个。
	private static string PickAppId(List<AppEntryInfo> apps, string exeName)
	{
		if (apps.Count == 0)
		{
			return "";
		}
		string baseName = FileNamePart(exeName);
		if (baseName.Length > 0)
		{
			AppEntryInfo hit = apps.FirstOrDefault(a => string.Equals(FileNamePart(a.Executable), baseName, StringComparison.OrdinalIgnoreCase));
			if (hit != null)
			{
				return hit.Id;
			}
		}
		AppEntryInfo app = apps.FirstOrDefault(a => a.Id == "App");
		return (app ?? apps[0]).Id;
	}

	private static string FileNamePart(string p)
	{
		string s = (p ?? "").Replace('/', '\\');
		int i = s.LastIndexOf('\\');
		return (i >= 0) ? s.Substring(i + 1) : s;
	}

	// ---------- --activate ----------

	private static int RunActivate(string[] args)
	{
		if (args.Length < 2 || string.IsNullOrWhiteSpace(args[1]))
		{
			Error("用法：梦境换肤.exe --activate <aumid> --args \"<args>\"");
			return 1;
		}
		string aumid = args[1].Trim();
		int bang = aumid.IndexOf('!');
		if (bang <= 0 || bang == aumid.Length - 1)
		{
			Error("AUMID 格式不对（应为 <PackageFamilyName>!<AppId>）：" + aumid);
			return 1;
		}
		string arguments = "";
		for (int i = 2; i + 1 < args.Length; i++)
		{
			if (args[i] == "--args")
			{
				arguments = args[i + 1];
				break;
			}
		}
		var manager = (IApplicationActivationManager)new ApplicationActivationManager();
		uint processId;
		int hr = manager.ActivateApplication(aumid, arguments, ActivateOptions.None, out processId);
		if (hr < 0)
		{
			Exception ex = Marshal.GetExceptionForHR(hr);
			Error("激活失败：HRESULT 0x" + hr.ToString("X8") + "（" + ((ex != null) ? ex.Message : "未知错误") + "）");
			return 2;
		}
		Out.WriteLine(Json(new Dictionary<string, object>
		{
			["Aumid"] = aumid,
			["ProcessId"] = processId
		}));
		return 0;
	}

	// ---------- --which-node ----------

	private static int RunWhichNode()
	{
		string source = "";
		string appRoot = null;
		try
		{
			appRoot = MainForm.FindAppRoot(MainForm.DataRootPath, null, out source);
		}
		catch
		{
			source = "error";
		}
		string bundled = string.IsNullOrEmpty(appRoot) ? "" : Path.Combine(appRoot, "src", "runtime", "node.exe");
		string downloaded = Path.Combine(MainForm.DataRootPath, "runtime", "node", "node.exe");
		string resolved = MainForm.ResolveNodePath(appRoot, MainForm.DataRootPath);
		var payload = new Dictionary<string, object>
		{
			["AppRoot"] = appRoot ?? "",
			["AppRootSource"] = source ?? "",
			["BundledNode"] = (bundled.Length > 0 && File.Exists(bundled)) ? bundled : "",
			["DownloadedNode"] = File.Exists(downloaded) ? downloaded : "",
			["ResolvedNode"] = resolved,
			["NodeVersion"] = ProbeNodeVersion(resolved) ?? ""
		};
		Out.WriteLine(Json(payload));
		return 0;
	}

	private static string ProbeNodeVersion(string node)
	{
		try
		{
			var psi = new ProcessStartInfo(node, "-v")
			{
				UseShellExecute = false,
				CreateNoWindow = true,
				RedirectStandardOutput = true,
				RedirectStandardError = true
			};
			using (Process p = Process.Start(psi))
			{
				string s = p.StandardOutput.ReadToEnd();
				if (!p.WaitForExit(10000))
				{
					try
					{
						p.Kill();
					}
					catch
					{
					}
					return null;
				}
				string v = (s ?? "").Trim();
				return (v.Length > 0) ? v : null;
			}
		}
		catch
		{
			return null;
		}
	}
}

// IApplicationActivationManager（COM，shobjidl_core.h）：MSIX 应用激活的官方接口。
[Flags]
internal enum ActivateOptions
{
	None = 0,
	DesignMode = 1,
	NoErrorUI = 2,
	NoSplashScreen = 4
}

[ComImport]
[Guid("2e941141-7f97-4756-ba1d-9decde894a3d")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IApplicationActivationManager
{
	[PreserveSig]
	int ActivateApplication([In, MarshalAs(UnmanagedType.LPWStr)] string appUserModelId, [In, MarshalAs(UnmanagedType.LPWStr)] string arguments, [In] ActivateOptions options, [Out] out uint processId);

	[PreserveSig]
	int ActivateForFile([In, MarshalAs(UnmanagedType.LPWStr)] string appUserModelId, [In] IntPtr itemArray, [In, MarshalAs(UnmanagedType.LPWStr)] string verb, [Out] out uint processId);

	[PreserveSig]
	int ActivateForProtocol([In, MarshalAs(UnmanagedType.LPWStr)] string appUserModelId, [In] IntPtr itemArray, [Out] out uint processId);
}

[ComImport]
[Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")]
internal class ApplicationActivationManager
{
}
