using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace DreamSkin;

// True native standalone Windows desktop application for DreamSkin Prism v4.0.0.
// - Single-file exe (extracts embedded Node payload & WebView2 helper DLLs on first run)
// - Native dark-titlebar desktop window hosting embedded WebView2 (zero browser chrome)
// - Custom high-DPI Prism icon on exe, titlebar, taskbar, Alt+Tab, and system tray
// - Single-instance window activation (re-opening brings existing desktop window to front)
// - Automatic graceful fallback to browser --app mode if WebView2 Runtime is absent
internal static class StudioTrayApp
{
	private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
	private const string SingleInstanceMutexName = "Local\\DreamSkin_Prism_DesktopApp_Mutex_v4";
	private const string ShowWindowEventName = "Local\\DreamSkin_Prism_DesktopApp_Show_v4";

	[DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
	private static extern bool SetDllDirectory(string lpPathName);

	[DllImport("dwmapi.dll")]
	private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);

	private static string webViewRuntimeDir = "";
	private static bool assemblyResolverHooked = false;

	public static void Run()
	{
		// Single-instance check: if the desktop app is already open (or in tray), bring it to front.
		bool createdNew = false;
		using Mutex instanceMutex = new Mutex(true, SingleInstanceMutexName, out createdNew);
		if (!createdNew)
		{
			try
			{
				using EventWaitHandle showEvt = EventWaitHandle.OpenExisting(ShowWindowEventName);
				showEvt.Set();
				return;
			}
			catch
			{
				// Existing mutex holder had no event yet; continue gracefully
			}
		}

		string dataRoot = MainForm.DataRootPath;
		string appRoot = MainForm.FindAppRoot(dataRoot, null, out _);
		if (string.IsNullOrEmpty(appRoot))
		{
			MessageBox.Show("未能释放梦境换肤核心文件，请检查磁盘空间或安全软件拦截。", "梦境换肤 Prism", MessageBoxButtons.OK, MessageBoxIcon.Error);
			return;
		}
		string nodeExe = MainForm.ResolveNodePath(appRoot, dataRoot);
		if (string.IsNullOrEmpty(nodeExe))
		{
			MessageBox.Show("未找到可用的 Node 运行时。", "梦境换肤 Prism", MessageBoxButtons.OK, MessageBoxIcon.Error);
			return;
		}
		string daemonScript = Path.Combine(appRoot, "src", "studio-daemon.mjs");
		if (!File.Exists(daemonScript))
		{
			daemonScript = Path.Combine(appRoot, "studio-daemon.mjs");
		}
		if (!File.Exists(daemonScript))
		{
			MessageBox.Show("未找到核心后台脚本：" + daemonScript, "梦境换肤 Prism", MessageBoxButtons.OK, MessageBoxIcon.Error);
			return;
		}

		ProcessStartInfo psi = new ProcessStartInfo
		{
			FileName = nodeExe,
			Arguments = "\"" + daemonScript + "\"",
			UseShellExecute = false,
			CreateNoWindow = true,
			RedirectStandardOutput = true,
			RedirectStandardError = true,
			StandardOutputEncoding = Encoding.UTF8,
			StandardErrorEncoding = Encoding.UTF8,
			WorkingDirectory = appRoot,
		};
		psi.EnvironmentVariables["DREAMSKIN_LAUNCHER"] = Process.GetCurrentProcess().MainModule?.FileName ?? "";

		Process proc = Process.Start(psi);
		if (proc == null)
		{
			MessageBox.Show("无法启动梦境换肤后台管家。", "梦境换肤 Prism", MessageBoxButtons.OK, MessageBoxIcon.Error);
			return;
		}

		string firstLine = proc.StandardOutput.ReadLine();
		if (string.IsNullOrWhiteSpace(firstLine))
		{
			string err = "";
			try { err = proc.StandardError.ReadToEnd(); } catch { }
			MessageBox.Show("后台启动失败：\n" + err, "梦境换肤 Prism", MessageBoxButtons.OK, MessageBoxIcon.Error);
			try { if (!proc.HasExited) proc.Kill(); } catch { }
			return;
		}

		string url = "";
		string role = "primary";
		try
		{
			var obj = Json.Deserialize<Dictionary<string, object>>(firstLine);
			if (obj != null)
			{
				if (obj.TryGetValue("url", out var u) && u != null) url = u.ToString();
				if (obj.TryGetValue("role", out var r) && r != null) role = r.ToString();
			}
		}
		catch
		{
			MessageBox.Show("后台返回数据异常：" + firstLine, "梦境换肤 Prism", MessageBoxButtons.OK, MessageBoxIcon.Error);
			try { if (!proc.HasExited) proc.Kill(); } catch { }
			return;
		}

		if (string.IsNullOrEmpty(url))
		{
			try { if (!proc.HasExited) proc.Kill(); } catch { }
			return;
		}

		// If we reused an existing daemon (e.g. Antigravity Sidecar), the spawned probe process already exited cleanly.
		bool ownsDaemon = !string.Equals(role, "reuse", StringComparison.OrdinalIgnoreCase);

		// Extract embedded WebView2 helper DLLs and register AssemblyResolve BEFORE touching WebView2 types.
		bool webViewReady = TryPrepareEmbeddedWebView2(dataRoot);
		if (webViewReady)
		{
			try
			{
				RunNativeDesktopShell(url, dataRoot, ownsDaemon ? proc : null);
				return;
			}
			catch
			{
				// Fall back seamlessly to app-mode window if WebView2 Runtime is missing on this machine
			}
		}

		// Fallback path (rare: old Windows without WebView2 Runtime)
		OpenFallbackBrowserWindow(url);
		if (!ownsDaemon) return;

		using NotifyIcon tray = new NotifyIcon();
		tray.Text = "梦境换肤 Prism 4.0";
		tray.Icon = LoadTrayIcon();
		ContextMenuStrip menu = new ContextMenuStrip();
		menu.Items.Add("打开梦境换肤 Prism", null, (_, _) => OpenFallbackBrowserWindow(url));
		menu.Items.Add(new ToolStripSeparator());
		menu.Items.Add("退出梦境换肤管家", null, (_, _) =>
		{
			tray.Visible = false;
			try { if (!proc.HasExited) proc.Kill(); } catch { }
			Application.Exit();
		});
		tray.ContextMenuStrip = menu;
		tray.DoubleClick += (_, _) => OpenFallbackBrowserWindow(url);
		tray.Visible = true;

		Application.Run();
		try { if (!proc.HasExited) proc.Kill(); } catch { }
	}

	[MethodImpl(MethodImplOptions.NoInlining)]
	private static void RunNativeDesktopShell(string url, string dataRoot, Process ownedDaemon)
	{
		// Verify WebView2 Runtime exists before constructing Form
		string availVer = CoreWebView2Environment.GetAvailableBrowserVersionString();
		if (string.IsNullOrWhiteSpace(availVer))
		{
			throw new InvalidOperationException("WebView2 Runtime not installed");
		}

		Icon appIcon = LoadTrayIcon();
		using EventWaitHandle showEvent = new EventWaitHandle(false, EventResetMode.AutoReset, ShowWindowEventName);
		using StudioNativeWindow mainWin = new StudioNativeWindow(url, dataRoot, appIcon, ownedDaemon);
		using NotifyIcon tray = new NotifyIcon();
		tray.Text = "梦境换肤 Prism 4.0";
		tray.Icon = appIcon;

		bool realExit = false;
		bool shownTrayHint = false;

		Action bringToFront = () =>
		{
			if (mainWin.IsDisposed) return;
			if (mainWin.InvokeRequired)
			{
				try { mainWin.BeginInvoke((Action)(() => ActivateWindow(mainWin))); } catch { }
			}
			else
			{
				ActivateWindow(mainWin);
			}
		};

		// Listen for second-instance activation signal
		Thread signalThread = new Thread(() =>
		{
			while (!realExit)
			{
				try
				{
					if (showEvent.WaitOne(500))
					{
						if (!realExit) bringToFront();
					}
				}
				catch { break; }
			}
		}) { IsBackground = true };
		signalThread.Start();

		ContextMenuStrip menu = new ContextMenuStrip();
		menu.Items.Add("打开梦境换肤 Prism", null, (_, _) => bringToFront());
		menu.Items.Add("刷新界面", null, (_, _) => mainWin.ReloadStudio());
		menu.Items.Add(new ToolStripSeparator());
		menu.Items.Add("退出梦境换肤", null, (_, _) =>
		{
			realExit = true;
			tray.Visible = false;
			mainWin.AllowRealClose = true;
			mainWin.Close();
			Application.Exit();
		});
		tray.ContextMenuStrip = menu;
		tray.DoubleClick += (_, _) => bringToFront();
		tray.Visible = true;

		mainWin.FormClosing += (_, e) =>
		{
			if (!realExit && !mainWin.AllowRealClose && e.CloseReason == CloseReason.UserClosing)
			{
				e.Cancel = true;
				mainWin.Hide();
				if (!shownTrayHint)
				{
					shownTrayHint = true;
					try { tray.ShowBalloonTip(2400, "梦境换肤 Prism 已收至托盘", "后台仍在守护你的软件皮肤，双击右下角图标随时打开。", ToolTipIcon.None); } catch { }
				}
			}
		};

		Application.Run(mainWin);
		realExit = true;
		tray.Visible = false;
		try { if (ownedDaemon != null && !ownedDaemon.HasExited) ownedDaemon.Kill(); } catch { }
	}

	private static void ActivateWindow(Form form)
	{
		if (!form.Visible) form.Show();
		if (form.WindowState == FormWindowState.Minimized) form.WindowState = FormWindowState.Normal;
		form.TopMost = true;
		form.Activate();
		form.TopMost = false;
	}

	private static bool TryPrepareEmbeddedWebView2(string dataRoot)
	{
		try
		{
			string dir = Path.Combine(dataRoot, "runtime", "webview2-1.0.2903.40");
			Directory.CreateDirectory(dir);
			ExtractResourceIfMissing("DreamSkin.WebView2.Core.dll", Path.Combine(dir, "Microsoft.Web.WebView2.Core.dll"));
			ExtractResourceIfMissing("DreamSkin.WebView2.WinForms.dll", Path.Combine(dir, "Microsoft.Web.WebView2.WinForms.dll"));
			ExtractResourceIfMissing("DreamSkin.WebView2Loader.dll", Path.Combine(dir, "WebView2Loader.dll"));

			webViewRuntimeDir = dir;
			SetDllDirectory(dir);

			if (!assemblyResolverHooked)
			{
				assemblyResolverHooked = true;
				AppDomain.CurrentDomain.AssemblyResolve += (_, args) =>
				{
					try
					{
						string name = new AssemblyName(args.Name).Name + ".dll";
						string candidate = Path.Combine(webViewRuntimeDir, name);
						if (File.Exists(candidate)) return Assembly.LoadFrom(candidate);
					}
					catch { }
					return null;
				};
			}
			return File.Exists(Path.Combine(dir, "Microsoft.Web.WebView2.Core.dll"))
				&& File.Exists(Path.Combine(dir, "Microsoft.Web.WebView2.WinForms.dll"))
				&& File.Exists(Path.Combine(dir, "WebView2Loader.dll"));
		}
		catch
		{
			return false;
		}
	}

	private static void ExtractResourceIfMissing(string resName, string destPath)
	{
		if (File.Exists(destPath) && new FileInfo(destPath).Length > 0) return;
		using Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream(resName);
		if (s == null) return;
		string tmp = destPath + ".tmp";
		using (FileStream fs = File.Create(tmp)) { s.CopyTo(fs); }
		if (File.Exists(destPath)) File.Delete(destPath);
		File.Move(tmp, destPath);
	}

	internal static void ApplyDarkTitleBar(IntPtr handle)
	{
		try
		{
			int dark = 1;
			DwmSetWindowAttribute(handle, 20, ref dark, sizeof(int)); // DWMWA_USE_IMMERSIVE_DARK_MODE
			int captionBgr = 0x00170E0B; // #0B0E17 in COLORREF (0x00BBGGRR)
			DwmSetWindowAttribute(handle, 35, ref captionBgr, sizeof(int)); // DWMWA_CAPTION_COLOR
		}
		catch { }
	}

	internal static Icon LoadTrayIcon()
	{
		try
		{
			using Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("DreamSkin.app.ico");
			if (s != null) return new Icon(s);
		}
		catch { }
		return SystemIcons.Application;
	}

	private static void OpenFallbackBrowserWindow(string url)
	{
		string browser = FindAppModeBrowser();
		if (!string.IsNullOrEmpty(browser))
		{
			try
			{
				Process.Start(new ProcessStartInfo
				{
					FileName = browser,
					Arguments = "--app=\"" + url + "\" --window-size=1220,820",
					UseShellExecute = false,
				});
				return;
			}
			catch { }
		}
		try
		{
			Process.Start(new ProcessStartInfo { FileName = url, UseShellExecute = true });
		}
		catch { }
	}

	private static string FindAppModeBrowser()
	{
		string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
		string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
		string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
		string[] candidates =
		{
			Path.Combine(pf, "Google", "Chrome", "Application", "chrome.exe"),
			Path.Combine(local, "Google", "Chrome", "Application", "chrome.exe"),
			Path.Combine(pf86, "Microsoft", "Edge", "Application", "msedge.exe"),
			Path.Combine(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
		};
		foreach (string p in candidates)
		{
			if (!string.IsNullOrEmpty(p) && File.Exists(p)) return p;
		}
		return null;
	}
}

internal sealed class StudioNativeWindow : Form
{
	private readonly string studioUrl;
	private readonly string userDataFolder;
	private readonly WebView2 webView;
	public bool AllowRealClose { get; set; }

	public StudioNativeWindow(string url, string dataRoot, Icon appIcon, Process _)
	{
		studioUrl = url;
		userDataFolder = Path.Combine(dataRoot, "v4", "webview2-profile");

		Text = "梦境换肤 Prism";
		Icon = appIcon;
		StartPosition = FormStartPosition.CenterScreen;
		MinimumSize = new Size(920, 620);
		ClientSize = new Size(1240, 820);
		BackColor = Color.FromArgb(11, 14, 23);

		webView = new WebView2
		{
			Dock = DockStyle.Fill,
			DefaultBackgroundColor = Color.FromArgb(255, 11, 14, 23),
		};
		Controls.Add(webView);

		HandleCreated += (_, _) => StudioTrayApp.ApplyDarkTitleBar(Handle);
		Shown += async (_, _) => await InitWebViewAsync();
	}

	private async Task InitWebViewAsync()
	{
		try
		{
			Directory.CreateDirectory(userDataFolder);
			var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
			await webView.EnsureCoreWebView2Async(env);
			var core = webView.CoreWebView2;
			if (core != null)
			{
				core.Settings.AreDefaultContextMenusEnabled = false;
				core.Settings.AreDevToolsEnabled = false;
				core.Settings.IsStatusBarEnabled = false;
				core.Settings.IsZoomControlEnabled = false;
				core.Settings.AreBrowserAcceleratorKeysEnabled = false;
				core.NewWindowRequested += (_, args) =>
				{
					args.Handled = true;
					try
					{
						if (!string.IsNullOrEmpty(args.Uri))
						{
							Process.Start(new ProcessStartInfo { FileName = args.Uri, UseShellExecute = true });
						}
					}
					catch { }
				};
				core.Navigate(studioUrl + (studioUrl.Contains("?") ? "&desktop=1" : "?desktop=1"));
			}
		}
		catch (Exception ex)
		{
			MessageBox.Show("原生界面引擎初始化失败，将尝试用独立窗口打开。\n" + ex.Message, "梦境换肤 Prism", MessageBoxButtons.OK, MessageBoxIcon.Warning);
		}
	}

	public void ReloadStudio()
	{
		try
		{
			if (webView?.CoreWebView2 != null) webView.CoreWebView2.Reload();
		}
		catch { }
	}
}
