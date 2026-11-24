using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
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
// - Instant dark-titlebar window (<50ms) with smooth 60fps breathing Obsidian Prism splash & live progress cues
// - Background async bootstrap (extracts payload / starts or reuses daemon / prepares WebView2 in parallel)
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

	internal sealed class DaemonBootResult
	{
		public string Url = "";
		public bool OwnsDaemon = false;
		public Process DaemonProcess = null;
		public string Error = "";
	}

	public static void Run()
	{
		// Single-instance check: if the desktop app is already open (or in tray), bring it to front immediately.
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
		// Prepare WebView2 helper DLLs before constructing WebView2 types (fast no-op after first run)
		bool webViewDllReady = TryPrepareEmbeddedWebView2(dataRoot);
		if (webViewDllReady)
		{
			try
			{
				RunNativeDesktopShellWithInstantSplash(dataRoot);
				return;
			}
			catch
			{
				// Fall back seamlessly to app-mode window if WebView2 Runtime is missing on this machine
			}
		}

		// Rare fallback path: WebView2 Runtime unavailable
		DaemonBootResult boot = StartDaemonSync(dataRoot, null);
		if (!string.IsNullOrEmpty(boot.Error) || string.IsNullOrEmpty(boot.Url))
		{
			MessageBox.Show(string.IsNullOrEmpty(boot.Error) ? "无法启动梦境换肤后台管家。" : boot.Error, "梦境换肤 Prism", MessageBoxButtons.OK, MessageBoxIcon.Error);
			return;
		}
		OpenFallbackBrowserWindow(boot.Url);
		if (!boot.OwnsDaemon) return;

		using NotifyIcon tray = new NotifyIcon();
		tray.Text = "梦境换肤 Prism 4.0";
		tray.Icon = LoadTrayIcon();
		ContextMenuStrip menu = new ContextMenuStrip();
		menu.Items.Add("打开梦境换肤 Prism", null, (_, _) => OpenFallbackBrowserWindow(boot.Url));
		menu.Items.Add(new ToolStripSeparator());
		menu.Items.Add("退出梦境换肤管家", null, (_, _) =>
		{
			tray.Visible = false;
			try { if (boot.DaemonProcess != null && !boot.DaemonProcess.HasExited) boot.DaemonProcess.Kill(); } catch { }
			Application.Exit();
		});
		tray.ContextMenuStrip = menu;
		tray.DoubleClick += (_, _) => OpenFallbackBrowserWindow(boot.Url);
		tray.Visible = true;

		Application.Run();
		try { if (boot.DaemonProcess != null && !boot.DaemonProcess.HasExited) boot.DaemonProcess.Kill(); } catch { }
	}

	internal static DaemonBootResult StartDaemonSync(string dataRoot, Action<string, int> reportStep)
	{
		var res = new DaemonBootResult();
		try
		{
			reportStep?.Invoke("正在唤醒棱镜核心文件…", 22);
			string appRoot = MainForm.FindAppRoot(dataRoot, null, out _);
			if (string.IsNullOrEmpty(appRoot))
			{
				res.Error = "未能释放梦境换肤核心文件，请检查磁盘空间或安全软件拦截。";
				return res;
			}

			reportStep?.Invoke("正在启动光学换肤管家…", 46);
			string nodeExe = MainForm.ResolveNodePath(appRoot, dataRoot);
			if (string.IsNullOrEmpty(nodeExe))
			{
				res.Error = "未找到可用的 Node 运行时。";
				return res;
			}
			string daemonScript = Path.Combine(appRoot, "src", "studio-daemon.mjs");
			if (!File.Exists(daemonScript)) daemonScript = Path.Combine(appRoot, "studio-daemon.mjs");
			if (!File.Exists(daemonScript))
			{
				res.Error = "未找到核心后台脚本：" + daemonScript;
				return res;
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
				res.Error = "无法启动梦境换肤后台管家。";
				return res;
			}

			reportStep?.Invoke("正在识别本机 AI 软件与原版图标…", 68);
			string firstLine = proc.StandardOutput.ReadLine();
			if (string.IsNullOrWhiteSpace(firstLine))
			{
				string err = "";
				try { err = proc.StandardError.ReadToEnd(); } catch { }
				try { if (!proc.HasExited) proc.Kill(); } catch { }
				res.Error = "后台启动失败：\n" + err;
				return res;
			}

			var obj = Json.Deserialize<Dictionary<string, object>>(firstLine);
			string url = "";
			string role = "primary";
			if (obj != null)
			{
				if (obj.TryGetValue("url", out var u) && u != null) url = u.ToString();
				if (obj.TryGetValue("role", out var r) && r != null) role = r.ToString();
			}
			if (string.IsNullOrEmpty(url))
			{
				try { if (!proc.HasExited) proc.Kill(); } catch { }
				res.Error = "后台返回数据异常：" + firstLine;
				return res;
			}

			res.Url = url;
			res.OwnsDaemon = !string.Equals(role, "reuse", StringComparison.OrdinalIgnoreCase);
			res.DaemonProcess = res.OwnsDaemon ? proc : null;
			reportStep?.Invoke("正在展开 6 层液态玻璃画境…", 88);
			return res;
		}
		catch (Exception ex)
		{
			res.Error = "启动失败：" + ex.Message;
			return res;
		}
	}

	[MethodImpl(MethodImplOptions.NoInlining)]
	private static void RunNativeDesktopShellWithInstantSplash(string dataRoot)
	{
		// Verify WebView2 Runtime exists before constructing Form
		string availVer = CoreWebView2Environment.GetAvailableBrowserVersionString();
		if (string.IsNullOrWhiteSpace(availVer))
		{
			throw new InvalidOperationException("WebView2 Runtime not installed");
		}

		Icon appIcon = LoadTrayIcon();
		using EventWaitHandle showEvent = new EventWaitHandle(false, EventResetMode.AutoReset, ShowWindowEventName);
		using StudioNativeWindow mainWin = new StudioNativeWindow(dataRoot, appIcon);
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
		mainWin.KillOwnedDaemon();
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

// Smooth 60fps double-buffered Obsidian Prism breathing splash overlay (instant feedback on launch!)
internal sealed class PrismSplashCanvas : Panel
{
	private readonly System.Windows.Forms.Timer animTimer;
	private readonly Stopwatch clock = Stopwatch.StartNew();
	private readonly Bitmap logoBmp;
	private string statusText = "正在唤醒棱镜光学引擎…";
	private double displayProgress = 0.08;
	private double targetProgress = 0.22;

	public PrismSplashCanvas(Icon appIcon)
	{
		Dock = DockStyle.Fill;
		DoubleBuffered = true;
		BackColor = Color.FromArgb(11, 14, 23);
		try { logoBmp = appIcon != null ? appIcon.ToBitmap() : null; } catch { logoBmp = null; }

		animTimer = new System.Windows.Forms.Timer { Interval = 16 }; // ~60fps
		animTimer.Tick += (_, _) =>
		{
			displayProgress += (targetProgress - displayProgress) * 0.085;
			Invalidate();
		};
		animTimer.Start();
	}

	public void UpdateStatus(string text, int progressPct)
	{
		if (IsDisposed) return;
		if (InvokeRequired)
		{
			try { BeginInvoke((Action)(() => UpdateStatus(text, progressPct))); } catch { }
			return;
		}
		if (!string.IsNullOrWhiteSpace(text)) statusText = text;
		targetProgress = Math.Max(targetProgress, Math.Min(1.0, progressPct / 100.0));
	}

	protected override void OnPaint(PaintEventArgs e)
	{
		base.OnPaint(e);
		Graphics g = e.Graphics;
		g.SmoothingMode = SmoothingMode.AntiAlias;
		g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

		int w = ClientSize.Width;
		int h = ClientSize.Height;
		float cx = w * 0.5f;
		float cy = h * 0.44f;
		double t = clock.Elapsed.TotalSeconds;

		// Deep cosmic radial aura
		using (var bgBrush = new LinearGradientBrush(new Rectangle(0, 0, Math.Max(1, w), Math.Max(1, h)),
			Color.FromArgb(10, 13, 22), Color.FromArgb(14, 18, 34), 45f))
		{
			g.FillRectangle(bgBrush, 0, 0, w, h);
		}

		// Soft breathing glow behind prism
		float glowR = 135f + (float)(Math.Sin(t * 2.1) * 14.0);
		using (var path = new GraphicsPath())
		{
			path.AddEllipse(cx - glowR, cy - glowR, glowR * 2, glowR * 2);
			using var pgb = new PathGradientBrush(path)
			{
				CenterColor = Color.FromArgb(62, 104, 164, 255),
				SurroundColors = new[] { Color.FromArgb(0, 11, 14, 23) },
			};
			g.FillPath(pgb, path);
		}

		// Rotating dual prismatic orbital rings
		float ring1R = 58f;
		float a1 = (float)((t * 145.0) % 360.0);
		using (var pen1 = new Pen(Color.FromArgb(210, 92, 225, 230), 2.5f) { StartCap = LineCap.Round, EndCap = LineCap.Round })
		{
			g.DrawArc(pen1, cx - ring1R, cy - ring1R, ring1R * 2, ring1R * 2, a1, 135f);
		}
		float ring2R = 48f;
		float a2 = (float)((360.0 - (t * 105.0) % 360.0));
		using (var pen2 = new Pen(Color.FromArgb(195, 167, 139, 250), 2.2f) { StartCap = LineCap.Round, EndCap = LineCap.Round })
		{
			g.DrawArc(pen2, cx - ring2R, cy - ring2R, ring2R * 2, ring2R * 2, a2, 110f);
		}

		// Floating prism icon at center
		float bob = (float)(Math.Sin(t * 2.6) * 3.5);
		if (logoBmp != null)
		{
			g.InterpolationMode = InterpolationMode.HighQualityBicubic;
			g.DrawImage(logoBmp, cx - 32f, cy - 32f + bob, 64f, 64f);
		}

		// Minimalist title & live step hint
		using var titleFont = new Font("Microsoft YaHei UI", 18f, FontStyle.Bold);
		using var subFont = new Font("Microsoft YaHei UI", 10.5f, FontStyle.Regular);
		using var footFont = new Font("Microsoft YaHei UI", 9f, FontStyle.Regular);
		using var titleBrush = new SolidBrush(Color.FromArgb(244, 247, 255));
		using var subBrush = new SolidBrush(Color.FromArgb(182, 200, 230));
		using var footBrush = new SolidBrush(Color.FromArgb(110, 128, 160));

		var sf = new StringFormat { Alignment = StringAlignment.Center };
		g.DrawString("梦境换肤 Prism 4.0", titleFont, titleBrush, cx, cy + 78f, sf);
		g.DrawString(statusText, subFont, subBrush, cx, cy + 114f, sf);

		// Sleek prismatic progress track
		float barW = 240f;
		float barH = 5f;
		float barX = cx - barW * 0.5f;
		float barY = cy + 148f;
		using (var trackBrush = new SolidBrush(Color.FromArgb(32, 255, 255, 255)))
		{
			g.FillRectangle(trackBrush, barX, barY, barW, barH);
		}
		float fillW = Math.Max(18f, (float)(barW * Math.Min(1.0, Math.Max(0.06, displayProgress))));
		using (var fillBrush = new LinearGradientBrush(
			new RectangleF(barX, barY, barW, barH),
			Color.FromArgb(92, 225, 230), Color.FromArgb(167, 139, 250), 0f))
		{
			g.FillRectangle(fillBrush, barX, barY, fillW, barH);
		}

		g.DrawString("光影落入界面 · 克制成就通透  ·  by lemon", footFont, footBrush, cx, cy + 168f, sf);
	}

	protected override void Dispose(bool disposing)
	{
		if (disposing)
		{
			try { animTimer.Stop(); animTimer.Dispose(); } catch { }
			try { logoBmp?.Dispose(); } catch { }
		}
		base.Dispose(disposing);
	}
}

internal sealed class StudioNativeWindow : Form
{
	private readonly string dataRoot;
	private readonly string userDataFolder;
	private readonly WebView2 webView;
	private readonly PrismSplashCanvas splash;
	private Process ownedDaemon = null;
	private string studioUrl = "";
	public bool AllowRealClose { get; set; }

	public StudioNativeWindow(string dataRootPath, Icon appIcon)
	{
		dataRoot = dataRootPath;
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
			Visible = false,
		};
		splash = new PrismSplashCanvas(appIcon);

		Controls.Add(webView);
		Controls.Add(splash);
		splash.BringToFront();

		HandleCreated += (_, _) => StudioTrayApp.ApplyDarkTitleBar(Handle);
		Shown += async (_, _) => await BootstrapParallelAsync();
	}

	public void KillOwnedDaemon()
	{
		try { if (ownedDaemon != null && !ownedDaemon.HasExited) ownedDaemon.Kill(); } catch { }
	}

	private async Task BootstrapParallelAsync()
	{
		try
		{
			Directory.CreateDirectory(userDataFolder);

			// Run daemon startup & WebView2 environment creation IN PARALLEL while user sees smooth 60fps Prism splash!
			Task<StudioTrayApp.DaemonBootResult> daemonTask = Task.Run(() =>
				StudioTrayApp.StartDaemonSync(dataRoot, (msg, pct) => splash.UpdateStatus(msg, pct)));

			Task<CoreWebView2Environment> envTask = CoreWebView2Environment.CreateAsync(null, userDataFolder);

			var env = await envTask;
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
				core.NavigationCompleted += (_, _) =>
				{
					splash.UpdateStatus("即将进入工作台…", 100);
					var revealTimer = new System.Windows.Forms.Timer { Interval = 180 };
					revealTimer.Tick += (_, _) =>
					{
						revealTimer.Stop();
						revealTimer.Dispose();
						if (!IsDisposed)
						{
							webView.Visible = true;
							webView.BringToFront();
							splash.Visible = false;
						}
					};
					revealTimer.Start();
				};
			}

			StudioTrayApp.DaemonBootResult boot = await daemonTask;
			if (!string.IsNullOrEmpty(boot.Error) || string.IsNullOrEmpty(boot.Url))
			{
				MessageBox.Show(string.IsNullOrEmpty(boot.Error) ? "无法启动梦境换肤后台管家。" : boot.Error, "梦境换肤 Prism", MessageBoxButtons.OK, MessageBoxIcon.Error);
				AllowRealClose = true;
				Close();
				return;
			}

			ownedDaemon = boot.DaemonProcess;
			studioUrl = boot.Url;
			splash.UpdateStatus("正在渲染 16:10 高清实时画境…", 94);
			if (core != null)
			{
				core.Navigate(studioUrl + (studioUrl.Contains("?") ? "&desktop=1" : "?desktop=1"));
			}
		}
		catch (Exception ex)
		{
			MessageBox.Show("原生界面引擎初始化失败。\n" + ex.Message, "梦境换肤 Prism", MessageBoxButtons.OK, MessageBoxIcon.Warning);
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
