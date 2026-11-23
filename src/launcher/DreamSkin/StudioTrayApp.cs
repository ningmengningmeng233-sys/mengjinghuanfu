using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace DreamSkin;

// Lightweight native Windows shell for DreamSkin Prism v4.0.0.
// Extracts/resolves bundled portable Node, launches (or reuses) src/studio-daemon.mjs,
// opens Prism Studio in a clean chromeless Edge/Chrome --app window, and stays in system tray.
internal static class StudioTrayApp
{
	private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();

	public static void Run()
	{
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

		OpenStudioWindow(url);

		// If reused an already-running primary daemon, exit this thin launcher immediately
		if (string.Equals(role, "reuse", StringComparison.OrdinalIgnoreCase))
		{
			return;
		}

		// Keep primary daemon alive with a clean tray icon
		using NotifyIcon tray = new NotifyIcon();
		tray.Text = "梦境换肤 Prism 4.0";
		tray.Icon = LoadTrayIcon();
		ContextMenuStrip menu = new ContextMenuStrip();
		menu.Items.Add("打开梦境换肤控制台", null, (_, _) => OpenStudioWindow(url));
		menu.Items.Add(new ToolStripSeparator());
		menu.Items.Add("退出梦境换肤管家", null, (_, _) =>
		{
			tray.Visible = false;
			try { if (!proc.HasExited) proc.Kill(); } catch { }
			Application.Exit();
		});
		tray.ContextMenuStrip = menu;
		tray.DoubleClick += (_, _) => OpenStudioWindow(url);
		tray.Visible = true;

		Application.Run();
		try { if (!proc.HasExited) proc.Kill(); } catch { }
	}

	private static Icon LoadTrayIcon()
	{
		try
		{
			using Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("DreamSkin.app.ico");
			if (s != null) return new Icon(s);
		}
		catch { }
		return SystemIcons.Application;
	}

	private static void OpenStudioWindow(string url)
	{
		string browser = FindAppModeBrowser();
		if (!string.IsNullOrEmpty(browser))
		{
			try
			{
				Process.Start(new ProcessStartInfo
				{
					FileName = browser,
					Arguments = "--app=\"" + url + "\" --window-size=1180,800",
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
			Path.Combine(pf86, "Microsoft", "Edge", "Application", "msedge.exe"),
			Path.Combine(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
			Path.Combine(pf, "Google", "Chrome", "Application", "chrome.exe"),
			Path.Combine(pf86, "Google", "Chrome", "Application", "chrome.exe"),
			Path.Combine(local, "Google", "Chrome", "Application", "chrome.exe"),
		};
		foreach (string p in candidates)
		{
			if (!string.IsNullOrEmpty(p) && File.Exists(p)) return p;
		}
		return null;
	}
}
