using System;
using System.Collections;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace DreamSkin;

public class MainForm : Form
{
	private class WheelRouter : IMessageFilter
	{
		private readonly MainForm form;

		public WheelRouter(MainForm f)
		{
			form = f;
		}

		public bool PreFilterMessage(ref Message m)
		{
			if (m.Msg != 522)
			{
				return false;
			}
			Point position = Cursor.Position;
			foreach (ScrollHost scrollHost in form.scrollHosts)
			{
				if (!scrollHost.Visible || !scrollHost.IsHandleCreated)
				{
					continue;
				}
				Control control = scrollHost;
				bool flag = true;
				while (control != null)
				{
					if (!control.Visible)
					{
						flag = false;
						break;
					}
					control = control.Parent;
				}
				if (!flag || !scrollHost.RectangleToScreen(scrollHost.ClientRectangle).Contains(position))
				{
					continue;
				}
				int num = (short)((long)m.WParam >> 16);
				scrollHost.ScrollBy(-num * 60 / 120);
				return true;
			}
			return false;
		}
	}

	private class ProcResult
	{
		public string Output = "";

		public int ExitCode = -1;
	}

	private class DarkMenuColors : ProfessionalColorTable
	{
		public override Color MenuItemSelected => Theme.CardHover;

		public override Color MenuItemBorder => Theme.CardHover;

		public override Color MenuBorder => Theme.Line;

		public override Color ToolStripDropDownBackground => Theme.Card;

		public override Color ImageMarginGradientBegin => Theme.Card;

		public override Color ImageMarginGradientMiddle => Theme.Card;

		public override Color ImageMarginGradientEnd => Theme.Card;

		public override Color SeparatorDark => Theme.Line;

		public override Color SeparatorLight => Theme.Line;
	}

	private string appRoot;

	private string pathSource = "";

	private string cherryDir;

	private readonly string dataRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DreamSkin");

	private Panel navPanel;

	private Panel pageCherry;

	private Panel pageEnv;

	private readonly List<Panel> appNavRows = new List<Panel>();

	private readonly List<AppRow> appRowsData = new List<AppRow>();

	private bool appListExpanded;

	private FlatButton envNavButton;

	private int currentPage;

	private DateTime lastAppListAt = DateTime.MinValue;

	private bool appListBusy;

	private RichTextBox matrixBox;

	private Label pluginStatusLabel;

	private ToggleSwitch pluginToggle;

	private bool pluginUiBusy;

	private Task conflictCheckTask;

	private RichTextBox log;

	private Label lblNode;

	private Label lblCherryState;

	private Label lblZCodeState;

	private Label lblWallpaper;

	private Label lblLive;

	private static readonly JavaScriptSerializer JsonSer = new JavaScriptSerializer
	{
		MaxJsonLength = int.MaxValue
	};

	private Card cardPalettes;

	private ChipBar chips;

	private ScrollHost tileHost;

	private ScrollHost settingsHost;

	private readonly List<ThemeTile> tiles = new List<ThemeTile>();

	private readonly List<ScrollHost> scrollHosts = new List<ScrollHost>();

	private Icon appIcon;

	private FlatButton btnExtract;

	private readonly List<PaletteInfo> allPalettes = new List<PaletteInfo>();

	private readonly List<PaletteInfo> galleryItems = new List<PaletteInfo>();

	private int galleryTotal = -1;

	private int startChip = -1;

	private bool galleryLoading;

	private Panel galleryBar;

	private ChipBar gallerySort;

	private ChipBar galleryStyle;

	private TextBox gallerySearch;

	private FlatButton galleryMore;

	private PaletteInfo currentPalette;

	private readonly List<SettingDef> settingDefs = new List<SettingDef>();

	private Dictionary<string, object> defaultsDark;

	private Dictionary<string, object> defaultsLight;

	private readonly Dictionary<string, object> touched = new Dictionary<string, object>();

	private readonly Dictionary<string, Control> settingControls = new Dictionary<string, Control>();

	private LiveSession live;

	private System.Windows.Forms.Timer liveTimer;

	private TaskCompletionSource<bool> pendingCommit;

	private Panel statusBar;

	private Panel logWrap;

	private string statusText = "";

	private Color statusColor = Theme.Muted;

	private FlatButton syncMenuButton;

	private readonly List<string> syncTargets = new List<string>();

	private bool suppressEvents;

	private bool dirty;

	private bool cherrySkinActive;

	private bool zcodeSkinActive;

	private string savedKey = "";

	private string app = "cherry";

	private Label lblTitle;

	private Label lblSub;

	private FlatButton btnLaunch;

	private string wallpaperPath = "";

	private readonly List<Control> busyControls = new List<Control>();

	private static readonly string[] ImageExts = new string[4] { ".jpg", ".jpeg", ".png", ".webp" };

	private static readonly Dictionary<string, string> OldKeys = new Dictionary<string, string>
	{
		{ "dark-gold", "ink-gold" },
		{ "cyber-blue", "neon-city" },
		{ "teal-tech", "qingdai" },
		{ "anime-purple", "star-violet" },
		{ "warm-cream", "rice-paper" },
		{ "soft-cream", "rice-paper" }
	};

	private static readonly string[] GalleryStyles = new string[11]
	{
		"全部", "二次元", "真人", "风景", "城市", "国风", "游戏影视", "科幻", "极简", "萌趣",
		"其他"
	};

	private string SyncOffFile => Path.Combine(dataRoot, "sync-off.flag");

	private string SyncTargetsFile => Path.Combine(dataRoot, "sync-targets.json");

	private string AppName => (app == "zcode") ? "ZCode" : "Cherry Studio";

	private string AppShort => (app == "zcode") ? "ZCode" : "Cherry";

	private bool SkinActive => (app == "zcode") ? zcodeSkinActive : cherrySkinActive;

	private Dictionary<string, object> Defaults => ((currentPalette != null && !currentPalette.Dark) ? defaultsLight : defaultsDark) ?? new Dictionary<string, object>();

	private string NodeRuntimeDir => Path.Combine(dataRoot, "runtime", "node");

	internal static string DataRootPath => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DreamSkin");

	[DllImport("user32.dll", CharSet = CharSet.Unicode)]
	private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, string lParam);

	[DllImport("uxtheme.dll", CharSet = CharSet.Unicode)]
	private static extern int SetWindowTheme(IntPtr hWnd, string pszSubAppName, string pszSubIdList);

	[DllImport("dwmapi.dll")]
	private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);

	public MainForm()
	{
		Text = "梦境换肤 Dream Skin 3.0";
		BackColor = Theme.Bg;
		ForeColor = Theme.Text;
		Font = Theme.F(9.5f);
		base.ClientSize = new Size(1120, 750);
		MinimumSize = new Size(1000, 790);
		base.StartPosition = FormStartPosition.CenterScreen;
		DoubleBuffered = true;
		try
		{
			using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("DreamSkin.app.ico"))
			{
				if (stream != null)
				{
					appIcon = new Icon(stream);
					base.Icon = appIcon;
				}
			}
			if (base.Icon == null)
			{
				base.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
			}
		}
		catch
		{
		}
		BuildLayout();
		base.Shown += async delegate
		{
			await StartupAsync();
		};
		base.FormClosing += delegate(object s, FormClosingEventArgs e)
		{
			if (dirty && live != null && live.Ready)
			{
				switch (MessageBox.Show(this, "实时预览里还有没保存的改动。\n\n是：保存并应用后退出\n否：放弃改动退出（" + AppShort + " 回到已保存的皮肤）", "保存改动？", MessageBoxButtons.YesNoCancel, MessageBoxIcon.Question))
				{
				case DialogResult.Cancel:
					e.Cancel = true;
					return;
				case DialogResult.Yes:
					live.Send(new Dictionary<string, object> { { "op", "commit" } });
					Thread.Sleep(1200);
					break;
				}
			}
			StopLive();
		};
		AllowDrop = true;
		base.DragEnter += delegate(object s, DragEventArgs e)
		{
			if (DroppedImage(e) != null)
			{
				e.Effect = DragDropEffects.Copy;
			}
		};
		base.DragDrop += delegate(object s, DragEventArgs e)
		{
			string text = DroppedImage(e);
			if (text != null)
			{
				if (pageEnv.Visible)
				{
					ShowPage((app == "zcode") ? 1 : 0);
				}
				SetCherryWallpaper(text);
			}
		};
	}

	private static bool IsImage(string f)
	{
		return File.Exists(f) && Array.IndexOf(ImageExts, Path.GetExtension(f).ToLowerInvariant()) >= 0;
	}

	private static string DroppedImage(DragEventArgs e)
	{
		return (e.Data.GetData(DataFormats.FileDrop) is string[] array && array.Length > 0 && IsImage(array[0])) ? array[0] : null;
	}

	public void ApplyArgs(string[] args)
	{
		for (int i = 0; i < args.Length; i++)
		{
			if (args[i] == "--page" && i + 1 < args.Length)
			{
				string text = args[++i];
				ShowPage((text == "zcode") ? 1 : ((text == "env") ? 2 : 0));
			}
			else if (args[i] == "--tab" && i + 1 < args.Length)
			{
				startChip = args[++i] switch
				{
					"gallery" => 5, 
					"wallpaper" => 4, 
					"light" => 3, 
					"dark" => 2, 
					"mine" => 1, 
					_ => 0, 
				};
				if (allPalettes.Count > 0)
				{
					chips.Selected = startChip;
				}
			}
			else if (IsImage(args[i]))
			{
				SetCherryWallpaper(args[i]);
			}
		}
	}

	protected override void OnHandleCreated(EventArgs e)
	{
		base.OnHandleCreated(e);
		try
		{
			int value = 1;
			DwmSetWindowAttribute(base.Handle, 20, ref value, 4);
		}
		catch
		{
		}
	}

	private void BuildLayout()
	{
		navPanel = new Panel
		{
			Dock = DockStyle.Left,
			Width = 210,
			BackColor = Theme.Nav
		};
		base.Controls.Add(navPanel);
		Panel panel = new Panel();
		panel.Dock = DockStyle.Fill;
		panel.BackColor = Theme.Bg;
		panel.Padding = new Padding(24, 20, 24, 16);
		Panel panel2 = panel;
		base.Controls.Add(panel2);
		panel2.BringToFront();
		Bitmap bitmap = null;
		try
		{
			using Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("DreamSkin.logo.png");
			if (stream != null)
			{
				using Image image = Image.FromStream(stream);
				bitmap = new Bitmap(40, 40);
				using Graphics graphics = Graphics.FromImage(bitmap);
				graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
				graphics.DrawImage(image, 0, 0, 40, 40);
			}
		}
		catch
		{
			bitmap = null;
		}
		if (bitmap != null)
		{
			navPanel.Controls.Add(new PictureBox
			{
				Image = bitmap,
				Size = new Size(40, 40),
				Location = new Point(18, 24),
				BackColor = Theme.Nav
			});
		}
		int num = ((bitmap != null) ? 66 : 22);
		Label label = new Label();
		label.Text = "梦境换肤";
		label.Font = Theme.F(15f, FontStyle.Bold);
		label.ForeColor = Theme.Gold;
		label.AutoSize = true;
		label.Location = new Point(num - 2, 22);
		Label value = label;
		Label label2 = new Label();
		label2.Text = "3.0 · 双端换肤";
		label2.Font = Theme.F(8.5f);
		label2.ForeColor = Theme.Muted;
		label2.AutoSize = true;
		label2.Location = new Point(num - 2, 50);
		Label value2 = label2;
		navPanel.Controls.Add(value);
		navPanel.Controls.Add(value2);
		// U-1（§4.6）：顶部应用切换改为适配器驱动的应用列表（状态点 + 名称，
		// 未安装的折叠到「更多应用」），数据来自 Node 的 apps-status 命令；
		// 列表在 RefreshAppList 拿到真实数据后重建，这里先用兜底行占位。
		BuildAppNav(new List<AppRow>());
		lblNode = StatusLabel(navPanel, 560);
		lblCherryState = StatusLabel(navPanel, 588);
		lblZCodeState = StatusLabel(navPanel, 616);
		Label label3 = new Label();
		label3.Text = "不改官方文件 · 随时一键还原";
		label3.ForeColor = Theme.Muted;
		label3.Font = Theme.F(8f);
		label3.AutoSize = true;
		label3.Location = new Point(22, 680);
		label3.Anchor = AnchorStyles.Bottom | AnchorStyles.Left;
		Label value3 = label3;
		navPanel.Controls.Add(value3);
		statusBar = new Panel
		{
			Dock = DockStyle.Bottom,
			Height = 34,
			BackColor = Theme.Bg,
			Padding = new Padding(0, 8, 0, 0)
		};
		statusBar.Cursor = Cursors.Hand;
		statusBar.Click += delegate
		{
			ShowPage(2);
		};
		statusBar.Paint += delegate(object s, PaintEventArgs e)
		{
			Rectangle rectangle = new Rectangle(0, 8, statusBar.Width, statusBar.Height - 8);
			using (SolidBrush brush = new SolidBrush(Theme.Nav))
			{
				e.Graphics.FillRectangle(brush, rectangle);
			}
			rectangle.Inflate(-12, 0);
			TextRenderer.DrawText(e.Graphics, statusText, Theme.F(9f), rectangle, statusColor, TextFormatFlags.EndEllipsis | TextFormatFlags.SingleLine | TextFormatFlags.VerticalCenter);
		};
		SetStyleDoubleBuffer(statusBar);
		panel2.Controls.Add(statusBar);
		logWrap = new Panel
		{
			Dock = DockStyle.Bottom,
			Height = 300,
			BackColor = Theme.Bg,
			Padding = new Padding(0, 10, 0, 0)
		};
		log = new RichTextBox
		{
			Dock = DockStyle.Fill,
			ReadOnly = true,
			BorderStyle = BorderStyle.None,
			BackColor = Theme.LogBg,
			ForeColor = Theme.Muted,
			Font = new Font("Consolas", 9f),
			DetectUrls = false,
			WordWrap = true
		};
		logWrap.Controls.Add(log);
		log.HandleCreated += delegate
		{
			try
			{
				SetWindowTheme(log.Handle, "DarkMode_Explorer", null);
			}
			catch
			{
			}
		};
		pageCherry = new Panel
		{
			Dock = DockStyle.Fill,
			BackColor = Theme.Bg
		};
		pageEnv = new Panel
		{
			Dock = DockStyle.Fill,
			BackColor = Theme.Bg,
			Visible = false
		};
		panel2.Controls.Add(pageCherry);
		panel2.Controls.Add(pageEnv);
		pageCherry.BringToFront();
		pageEnv.BringToFront();
		BuildCherryPage();
		BuildEnvPage();
		pageEnv.Controls.Add(logWrap);
		ShowPage(0);
	}

	private Label StatusLabel(Control parent, int y)
	{
		Label label = new Label();
		label.Text = "";
		label.AutoSize = false;
		label.Width = 190;
		label.Height = 24;
		label.Location = new Point(16, y);
		label.ForeColor = Theme.Muted;
		label.Font = Theme.F(8.5f);
		label.Anchor = AnchorStyles.Bottom | AnchorStyles.Left;
		Label label2 = label;
		parent.Controls.Add(label2);
		return label2;
	}

	private void ShowPage(int i)
	{
		currentPage = i;
		pageCherry.Visible = i == 0 || i == 1;
		pageEnv.Visible = i == 2;
		if (i == 0 || i == 1)
		{
			SwitchApp((i == 1) ? "zcode" : "cherry");
		}
		HighlightNav();
	}

	private Label Heading(Control parent, string title, string sub)
	{
		parent.Controls.Add(new Label
		{
			Text = title,
			Font = Theme.F(15f, FontStyle.Bold),
			ForeColor = Theme.Text,
			AutoSize = true,
			Location = new Point(0, 0)
		});
		Label label = new Label();
		label.Text = sub;
		label.Font = Theme.F(9f);
		label.ForeColor = Theme.Muted;
		label.AutoSize = true;
		label.Location = new Point(2, 34);
		Label label2 = label;
		parent.Controls.Add(label2);
		return label2;
	}

	private FlatButton AddButton(Control parent, string text, Color fill, Color fore, Rectangle r, Func<Task> onClick)
	{
		FlatButton flatButton = new FlatButton(text, fill, fore);
		flatButton.Bounds = r;
		FlatButton flatButton2 = flatButton;
		if (fill == Theme.Card)
		{
			flatButton2.Border = Theme.Line;
		}
		flatButton2.Click += async delegate
		{
			await RunBusy(onClick);
		};
		parent.Controls.Add(flatButton2);
		busyControls.Add(flatButton2);
		return flatButton2;
	}

	private void BuildCherryPage()
	{
		lblTitle = new Label
		{
			Text = "Cherry Studio 换肤",
			Font = Theme.F(15f, FontStyle.Bold),
			ForeColor = Theme.Text,
			AutoSize = true,
			Location = new Point(0, 0)
		};
		lblSub = new Label
		{
			Text = "",
			Font = Theme.F(9f),
			ForeColor = Theme.Muted,
			AutoSize = true,
			Location = new Point(2, 34)
		};
		pageCherry.Controls.Add(lblTitle);
		pageCherry.Controls.Add(lblSub);
		cardPalettes = new Card
		{
			Title = "精选主题",
			Location = new Point(0, 64),
			Size = new Size(500, 428)
		};
		pageCherry.Controls.Add(cardPalettes);
		chips = new ChipBar
		{
			Items = new string[6] { "全部", "★ 我的", "夜", "昼", "取色", "主题库" },
			Location = new Point(112, 10),
			Size = new Size(382, 28)
		};
		chips.SelectedChanged += delegate
		{
			FilterPalettes();
		};
		cardPalettes.Controls.Add(chips);
		tileHost = new ScrollHost
		{
			Location = new Point(9, 44),
			Size = new Size(482, 375),
			BackColor = Theme.Card
		};
		cardPalettes.Controls.Add(tileHost);
		scrollHosts.Add(tileHost);
		galleryBar = new Panel
		{
			Location = new Point(9, 44),
			Size = new Size(482, 62),
			BackColor = Theme.Card,
			Visible = false
		};
		gallerySort = new ChipBar
		{
			Items = new string[3] { "热门", "收藏", "最新" },
			Location = new Point(0, 0),
			Size = new Size(170, 28)
		};
		gallerySort.SelectedChanged += async delegate
		{
			await LoadGallery(append: false);
		};
		gallerySearch = new TextBox
		{
			Location = new Point(180, 3),
			Width = 220,
			BackColor = Theme.CardHover,
			ForeColor = Theme.Text,
			BorderStyle = BorderStyle.FixedSingle,
			Font = Theme.F(9.5f),
			MaxLength = 40
		};
		gallerySearch.KeyDown += async delegate(object s, KeyEventArgs e)
		{
			if (e.KeyCode == Keys.Return)
			{
				e.SuppressKeyPress = true;
				await LoadGallery(append: false);
			}
		};
		FlatButton flatButton = new FlatButton("搜索", Theme.CardHover, Theme.Text);
		flatButton.Bounds = new Rectangle(408, 1, 72, 27);
		FlatButton flatButton2 = flatButton;
		flatButton2.Font = Theme.F(9f);
		flatButton2.Click += async delegate
		{
			await LoadGallery(append: false);
		};
		galleryStyle = new ChipBar
		{
			Items = GalleryStyles,
			Location = new Point(0, 34),
			Size = new Size(482, 26),
			Pad = 14,
			Gap = 4
		};
		galleryStyle.Font = Theme.F(8.5f);
		galleryStyle.SelectedChanged += async delegate
		{
			await LoadGallery(append: false);
		};
		galleryBar.Controls.Add(gallerySort);
		galleryBar.Controls.Add(gallerySearch);
		galleryBar.Controls.Add(flatButton2);
		galleryBar.Controls.Add(galleryStyle);
		cardPalettes.Controls.Add(galleryBar);
		galleryMore = new FlatButton("加载更多", Theme.CardHover, Theme.Text)
		{
			Size = new Size(460, 34)
		};
		galleryMore.Font = Theme.F(9f);
		galleryMore.Click += async delegate
		{
			await LoadGallery(append: true);
		};
		Card card = new Card();
		card.Title = "背景壁纸";
		card.Location = new Point(0, 500);
		card.Size = new Size(500, 74);
		Card card2 = card;
		pageCherry.Controls.Add(card2);
		lblWallpaper = new Label
		{
			Text = "未选择 · 可把图片直接拖进窗口",
			ForeColor = Theme.Muted,
			AutoSize = false,
			Size = new Size(190, 20),
			Location = new Point(16, 42),
			AutoEllipsis = true,
			BackColor = Theme.Card
		};
		card2.Controls.Add(lblWallpaper);
		FlatButton flatButton3 = new FlatButton("选择图片…", Theme.CardHover, Theme.Text);
		flatButton3.Bounds = new Rectangle(212, 36, 96, 30);
		FlatButton flatButton4 = flatButton3;
		flatButton4.Font = Theme.F(9f);
		flatButton4.Click += delegate
		{
			PickCherryWallpaper();
		};
		FlatButton flatButton5 = new FlatButton("清除", Theme.CardHover, Theme.Muted);
		flatButton5.Bounds = new Rectangle(314, 36, 56, 30);
		FlatButton flatButton6 = flatButton5;
		flatButton6.Font = Theme.F(9f);
		flatButton6.Click += delegate
		{
			SetCherryWallpaper("");
		};
		btnExtract = new FlatButton("✦ 从壁纸取色", Theme.CardHover, Theme.Gold)
		{
			Bounds = new Rectangle(374, 36, 110, 30)
		};
		btnExtract.Font = Theme.F(9f);
		btnExtract.Click += delegate
		{
			ExtractWallpaperPalettes();
		};
		card2.Controls.Add(flatButton4);
		card2.Controls.Add(flatButton6);
		card2.Controls.Add(btnExtract);
		Card card3 = new Card();
		card3.Title = "调节";
		card3.Location = new Point(512, 64);
		card3.Size = new Size(348, 510);
		Card card4 = card3;
		pageCherry.Controls.Add(card4);
		lblLive = new Label
		{
			Text = "● 实时预览未连接",
			ForeColor = Theme.Muted,
			AutoSize = false,
			Size = new Size(220, 20),
			Location = new Point(118, 14),
			TextAlign = ContentAlignment.MiddleRight,
			Font = Theme.F(8.5f),
			BackColor = Theme.Card
		};
		card4.Controls.Add(lblLive);
		settingsHost = new ScrollHost
		{
			Location = new Point(12, 44),
			Size = new Size(324, 454),
			BackColor = Theme.Card
		};
		card4.Controls.Add(settingsHost);
		scrollHosts.Add(settingsHost);
		int num = 586;
		AddButton(pageCherry, "保存并应用", Theme.Gold, Color.FromArgb(25, 20, 10), new Rectangle(0, num, 140, 44), SaveCherry);
		AddButton(pageCherry, "撤销预览", Theme.Card, Theme.Text, new Rectangle(148, num, 96, 44), CancelPreview);
		AddButton(pageCherry, "★ 存为我的", Theme.Card, Theme.Gold, new Rectangle(252, num, 112, 44), SaveMine);
		// U-2（§4.6）：「两端同步」开关改为「同步到…」多选按钮：点开菜单勾选目标应用，
		// 选择存数据根目录 sync-targets.json（UI 偏好）；旧的 sync-off.flag 只在首次迁移时读一次。
		LoadSyncTargets();
		syncMenuButton = new FlatButton("同步到…", Theme.Card, Theme.Text)
		{
			Location = new Point(374, num),
			Size = new Size(126, 44)
		};
		syncMenuButton.Click += delegate
		{
			OpenSyncMenu();
		};
		pageCherry.Controls.Add(syncMenuButton);
		UpdateSyncButtonText();
		btnLaunch = AddButton(pageCherry, "用皮肤启动 Cherry", Theme.Card, Theme.Text, new Rectangle(512, num, 156, 44), LaunchCherry);
		AddButton(pageCherry, "还原原版", Theme.Card, Theme.Text, new Rectangle(676, num, 100, 44), RestoreCherry);
		FlatButton more = AddButton(pageCherry, "更多 ▾", Theme.Card, Theme.Text, new Rectangle(784, num, 76, 44), () => Task.FromResult(0));
		ContextMenuStrip moreMenu = DarkMenu();
		moreMenu.Items.Add("导入皮肤文件（.dsskin）…", null, async delegate
		{
			await RunBusy(ImportMine);
		});
		moreMenu.Items.Add("创建桌面快捷方式", null, delegate
		{
			MakeShortcut(tell: true);
		});
		moreMenu.Items.Add("打开我的皮肤文件夹", null, delegate
		{
			string text = Path.Combine(dataRoot, "skins");
			Directory.CreateDirectory(text);
			Process.Start("explorer.exe", "\"" + text + "\"");
		});
		more.Click += delegate
		{
			moreMenu.Show(more, new Point(0, -moreMenu.PreferredSize.Height - 4));
		};
		UpdateAppTexts();
		liveTimer = new System.Windows.Forms.Timer
		{
			Interval = 60
		};
		liveTimer.Tick += delegate
		{
			liveTimer.Stop();
			PushLive();
		};
		Application.AddMessageFilter(new WheelRouter(this));
	}

	private async Task LoadCherryData()
	{
		if (cherryDir == null)
		{
			return;
		}
		string script = Q(Path.Combine(cherryDir, "skin-cherry.mjs"));
		ProcResult sc = await RunProcess(ResolveNode(), script + " schema", 30000);
		ProcResult pr = await RunProcess(ResolveNode(), script + " presets", 30000);
		try
		{
			Dictionary<string, object> dictionary = JsonSer.Deserialize<Dictionary<string, object>>(FirstJsonLine(sc.Output));
			settingDefs.Clear();
			foreach (object item in (ArrayList)dictionary["settings"])
			{
				settingDefs.Add(SettingDef.From((Dictionary<string, object>)item));
			}
			Dictionary<string, object> dictionary2 = (Dictionary<string, object>)dictionary["defaults"];
			defaultsDark = (Dictionary<string, object>)dictionary2["dark"];
			defaultsLight = (Dictionary<string, object>)dictionary2["light"];
		}
		catch (Exception ex)
		{
			Log("ERROR: 读取参数声明失败：" + ex.Message);
		}
		try
		{
			Dictionary<string, object> dictionary3 = JsonSer.Deserialize<Dictionary<string, object>>(FirstJsonLine(pr.Output));
			allPalettes.Clear();
			foreach (object item2 in (ArrayList)dictionary3["palettes"])
			{
				allPalettes.Add(PaletteInfo.From((Dictionary<string, object>)item2));
			}
		}
		catch (Exception ex)
		{
			Log("ERROR: 读取配色失败：" + ex.Message);
		}
		BuildSettingControls();
		RestoreLastChoice();
		FilterPalettes();
		Log("已载入 " + allPalettes.Count + " 套主题、" + settingDefs.Count((SettingDef d) => d.Type != "heading") + " 项可调参数。");
	}

	private static string FirstJsonLine(string output)
	{
		string[] array = output.Replace("\r", "").Split('\n');
		foreach (string text in array)
		{
			if (text.TrimStart().StartsWith("{"))
			{
				return text;
			}
		}
		return "{}";
	}

	private void FilterPalettes()
	{
		int selected = chips.Selected;
		bool flag = selected == 5;
		if (galleryBar.Visible != flag)
		{
			galleryBar.Visible = flag;
			tileHost.Bounds = (flag ? new Rectangle(10, 112, 482, 308) : new Rectangle(10, 44, 482, 376));
		}
		if (flag && galleryTotal < 0 && !galleryLoading)
		{
			Task task = LoadGallery(append: false);
		}
		tileHost.Content.SuspendLayout();
		foreach (ThemeTile tile in tiles)
		{
			tileHost.Content.Controls.Remove(tile);
			tile.Dispose();
		}
		tiles.Clear();
		tileHost.Content.Controls.Remove(galleryMore);
		int num = 0;
		foreach (PaletteInfo item in flag ? galleryItems : allPalettes)
		{
			if ((selected == 1 && item.Group != "mine") || (selected == 2 && (!item.Dark || item.Group == "mine")) || (selected == 3 && (item.Dark || item.Group == "mine")) || (selected == 4 && item.Group != "wallpaper"))
			{
				continue;
			}
			PaletteInfo pal = item;
			ThemeTile themeTile = new ThemeTile();
			themeTile.Palette = item;
			themeTile.Selected = currentPalette != null && currentPalette.Key == item.Key;
			themeTile.Saved = savedKey.Length > 0 && item.Key == savedKey;
			ThemeTile current = themeTile;
			current.Location = new Point(num % 3 * 156, num / 3 * 130);
			current.MouseUp += async delegate(object s, MouseEventArgs e)
			{
				if (e.Button == MouseButtons.Left)
				{
					await ChoosePalette(pal);
				}
				else if (e.Button == MouseButtons.Right && pal.Group == "mine")
				{
					ShowMineMenu(pal, (Control)s, e.Location);
				}
				else if (e.Button == MouseButtons.Right && pal.Group == "gallery")
				{
					ShowGalleryMenu(pal, (Control)s, e.Location);
				}
			};
			tiles.Add(current);
			tileHost.Content.Controls.Add(current);
			num++;
		}
		int num2 = (num + 2) / 3 * 130;
		if (flag && galleryItems.Count < galleryTotal)
		{
			galleryMore.Location = new Point(4, num2 + 4);
			galleryMore.Enabled = !galleryLoading;
			tileHost.Content.Controls.Add(galleryMore);
			num2 += 46;
		}
		tileHost.ContentHeight = Math.Max(tileHost.Height, num2);
		tileHost.Content.ResumeLayout();
		cardPalettes.Title = ((!flag) ? (((selected == 1) ? "我的皮肤 · " : "主题 · ") + num) : ((galleryLoading && num == 0) ? "主题库 · 载入中" : ("主题库 · " + Math.Max(0, galleryTotal))));
		cardPalettes.Invalidate();
		if (flag && num == 0 && galleryTotal == 0)
		{
			Log("主题库里没搜到，换个关键词试试。");
		}
		if (selected == 4 && num == 0)
		{
			Log("还没有壁纸取色：先选一张壁纸，再点「✦ 从壁纸取色」。");
		}
		if (selected == 1 && num == 0)
		{
			Log("还没有自己的皮肤：调好之后点「★ 存为我的皮肤」，右键卡片可以改名、覆盖、导出、删除。");
		}
	}

	private void SelectPalette(PaletteInfo p)
	{
		currentPalette = p;
		if (p.Group == "mine")
		{
			touched.Clear();
			if (p.Values != null)
			{
				foreach (KeyValuePair<string, object> value in p.Values)
				{
					if (value.Value != null)
					{
						touched[value.Key] = value.Value;
					}
				}
			}
			suppressEvents = true;
			try
			{
				SetCherryWallpaper((!string.IsNullOrEmpty(p.Image) && File.Exists(p.Image)) ? p.Image : "");
			}
			finally
			{
				suppressEvents = false;
			}
		}
		else if (p.Group == "gallery" || p.Group == "anime")
		{
			touched.Clear();
			suppressEvents = true;
			try
			{
				SetCherryWallpaper((!string.IsNullOrEmpty(p.Image) && File.Exists(p.Image)) ? p.Image : "");
			}
			finally
			{
				suppressEvents = false;
			}
		}
		else if (IsBundledWallpaper(wallpaperPath))
		{
			suppressEvents = true;
			try
			{
				SetCherryWallpaper("");
			}
			finally
			{
				suppressEvents = false;
			}
		}
		foreach (ThemeTile tile in tiles)
		{
			bool flag = tile.Palette == p || tile.Palette.Key == p.Key;
			if (tile.Selected != flag)
			{
				tile.Selected = flag;
				tile.Invalidate();
			}
		}
		Color accent = p.Accent;
		foreach (Control value2 in settingControls.Values)
		{
			if (value2 is DsSlider dsSlider)
			{
				dsSlider.Accent = accent;
				dsSlider.Invalidate();
			}
			if (value2 is ToggleSwitch toggleSwitch)
			{
				toggleSwitch.Accent = accent;
				toggleSwitch.Invalidate();
			}
		}
		SyncSettingControls();
		ScheduleLive();
	}

	private object ValueOf(string id)
	{
		if (touched.TryGetValue(id, out var value))
		{
			return value;
		}
		if (currentPalette != null && currentPalette.Tune != null && currentPalette.Tune.TryGetValue(id, out value))
		{
			return value;
		}
		return Defaults.TryGetValue(id, out value) ? value : null;
	}

	private void BuildSettingControls()
	{
		Panel content = settingsHost.Content;
		content.SuspendLayout();
		foreach (Control item in new List<Control>(content.Controls.Cast<Control>()))
		{
			content.Controls.Remove(item);
			item.Dispose();
		}
		settingControls.Clear();
		int num = 0;
		int num2 = settingsHost.Width - 14;
		foreach (SettingDef settingDef in settingDefs)
		{
			SettingDef def = settingDef;
			if (def.Type == "heading")
			{
				if (num > 0)
				{
					num += 6;
				}
				content.Controls.Add(new Label
				{
					Text = def.Title.ToUpperInvariant(),
					Font = Theme.F(8.5f, FontStyle.Bold),
					ForeColor = Theme.Gold,
					AutoSize = true,
					Location = new Point(4, num + 6),
					BackColor = Theme.Card
				});
				num += 28;
			}
			else if (def.Type == "variable-number-slider" || def.Type == "variable-number")
			{
				DsSlider sl = new DsSlider
				{
					Title = def.Title,
					Unit = def.Format,
					Min = def.Min,
					Max = def.Max,
					Step = def.Step,
					Location = new Point(0, num),
					Width = num2
				};
				sl.ValueChanged += delegate
				{
					if (!suppressEvents)
					{
						touched[def.Id] = sl.Value;
						ScheduleLive();
					}
				};
				sl.ResetRequested += delegate
				{
					touched.Remove(def.Id);
					SyncSettingControls();
					ScheduleLive();
				};
				content.Controls.Add(sl);
				settingControls[def.Id] = sl;
				num += 48;
			}
			else if (def.Type == "class-toggle")
			{
				ToggleSwitch ts = new ToggleSwitch
				{
					Title = def.Title,
					Location = new Point(0, num),
					Width = num2
				};
				ts.CheckedChanged += delegate
				{
					if (!suppressEvents)
					{
						touched[def.Id] = ts.Checked;
						ScheduleLive();
					}
				};
				content.Controls.Add(ts);
				settingControls[def.Id] = ts;
				num += 38;
			}
			else
			{
				if (!(def.Type == "variable-color"))
				{
					continue;
				}
				content.Controls.Add(new Label
				{
					Text = def.Title.Replace("（留空 = 跟随配色）", ""),
					ForeColor = Color.FromArgb(190, 190, 202),
					AutoSize = false,
					Size = new Size(140, 24),
					Location = new Point(4, num + 8),
					BackColor = Theme.Card
				});
				FlatButton flatButton = new FlatButton("跟随主题", Theme.CardHover, Theme.Text);
				flatButton.Bounds = new Rectangle(num2 - 168, num + 4, 104, 30);
				FlatButton flatButton2 = flatButton;
				flatButton2.Font = Theme.F(8.5f);
				flatButton2.Click += delegate
				{
					using ColorDialog colorDialog = new ColorDialog
					{
						FullOpen = true,
						AnyColor = true
					};
					if (currentPalette != null)
					{
						colorDialog.Color = currentPalette.Accent;
					}
					if (colorDialog.ShowDialog(this) == DialogResult.OK)
					{
						touched[def.Id] = "#" + colorDialog.Color.R.ToString("x2") + colorDialog.Color.G.ToString("x2") + colorDialog.Color.B.ToString("x2");
						SyncSettingControls();
						ScheduleLive();
					}
				};
				FlatButton flatButton3 = new FlatButton("重置", Theme.CardHover, Theme.Muted);
				flatButton3.Bounds = new Rectangle(num2 - 58, num + 4, 56, 30);
				FlatButton flatButton4 = flatButton3;
				flatButton4.Font = Theme.F(8.5f);
				flatButton4.Click += delegate
				{
					touched.Remove(def.Id);
					SyncSettingControls();
					ScheduleLive();
				};
				content.Controls.Add(flatButton2);
				content.Controls.Add(flatButton4);
				settingControls[def.Id] = flatButton2;
				num += 42;
			}
		}
		content.Controls.Add(new Label
		{
			Text = "提示：双击滑块恢复该项默认值",
			ForeColor = Theme.Muted,
			Font = Theme.F(8f),
			AutoSize = true,
			Location = new Point(4, num + 12),
			BackColor = Theme.Card
		});
		FlatButton flatButton5 = new FlatButton("全部恢复默认", Theme.CardHover, Theme.Muted);
		flatButton5.Bounds = new Rectangle(num2 - 120, num + 6, 118, 30);
		FlatButton flatButton6 = flatButton5;
		flatButton6.Font = Theme.F(8.5f);
		flatButton6.Click += delegate
		{
			touched.Clear();
			SyncSettingControls();
			ScheduleLive();
		};
		content.Controls.Add(flatButton6);
		settingsHost.ContentHeight = num + 44;
		content.ResumeLayout();
		SyncSettingControls();
	}

	private void SyncSettingControls()
	{
		suppressEvents = true;
		try
		{
			foreach (SettingDef settingDef in settingDefs)
			{
				if (!settingControls.TryGetValue(settingDef.Id, out var value))
				{
					continue;
				}
				object obj = ValueOf(settingDef.Id);
				if (value is DsSlider dsSlider)
				{
					double value2;
					try
					{
						value2 = Convert.ToDouble(obj, CultureInfo.InvariantCulture);
					}
					catch
					{
						value2 = settingDef.Min;
					}
					dsSlider.Value = value2;
					if (currentPalette != null)
					{
						dsSlider.Accent = currentPalette.Accent;
					}
					dsSlider.Invalidate();
				}
				else if (value is ToggleSwitch toggleSwitch)
				{
					toggleSwitch.Checked = !(obj is bool) || (bool)obj;
					if (currentPalette != null)
					{
						toggleSwitch.Accent = currentPalette.Accent;
					}
				}
				else
				{
					if (!(value is FlatButton flatButton))
					{
						continue;
					}
					string text = obj as string;
					if (!string.IsNullOrEmpty(text))
					{
						try
						{
							Color color = (flatButton.Border = (flatButton.Fill = ColorTranslator.FromHtml(text)));
							flatButton.Fore = ((color.GetBrightness() > 0.55f) ? Color.Black : Color.White);
							flatButton.Text = text;
						}
						catch
						{
						}
					}
					else
					{
						flatButton.Fill = Theme.CardHover;
						flatButton.Border = Theme.CardHover;
						flatButton.Fore = Theme.Text;
						flatButton.Text = "跟随主题";
					}
					flatButton.Invalidate();
				}
			}
		}
		finally
		{
			suppressEvents = false;
		}
	}

	private void PickCherryWallpaper()
	{
		using OpenFileDialog openFileDialog = new OpenFileDialog();
		openFileDialog.Title = "选择背景壁纸";
		openFileDialog.Filter = "图片 (*.jpg;*.jpeg;*.png;*.webp)|*.jpg;*.jpeg;*.png;*.webp";
		if (openFileDialog.ShowDialog(this) == DialogResult.OK)
		{
			SetCherryWallpaper(openFileDialog.FileName);
		}
	}

	private static bool IsBundledWallpaper(string path)
	{
		if (string.IsNullOrEmpty(path))
		{
			return false;
		}
		string text = Path.GetDirectoryName(path) ?? "";
		text = text.Replace('/', '\\').TrimEnd('\\');
		return text.EndsWith("assets\\wallpapers", StringComparison.OrdinalIgnoreCase) || text.IndexOf("\\DreamSkin\\gallery\\", StringComparison.OrdinalIgnoreCase) >= 0;
	}

	private void SetCherryWallpaper(string path)
	{
		wallpaperPath = path ?? "";
		if (wallpaperPath.Length > 0)
		{
			lblWallpaper.Text = Path.GetFileName(wallpaperPath);
			lblWallpaper.ForeColor = Theme.Gold;
		}
		else
		{
			lblWallpaper.Text = "未选择 · 可把图片直接拖进窗口";
			lblWallpaper.ForeColor = Theme.Muted;
		}
		if (!suppressEvents)
		{
			ScheduleLive();
		}
	}

	private void RestoreLastChoice()
	{
		try
		{
			string path = Path.Combine(dataRoot, app, "last-choice.json");
			if (!File.Exists(path))
			{
				savedKey = "";
				currentPalette = allPalettes.Find((PaletteInfo x) => x.Group == "builtin") ?? ((allPalettes.Count > 0) ? allPalettes[0] : null);
				SyncSettingControls();
				return;
			}
			Dictionary<string, object> dictionary = JsonSer.Deserialize<Dictionary<string, object>>(File.ReadAllText(path, Encoding.UTF8));
			object value;
			string key = (dictionary.TryGetValue("preset", out value) ? Convert.ToString(value) : "");
			if (OldKeys.TryGetValue(key, out var value2))
			{
				key = value2;
			}
			savedKey = key;
			currentPalette = allPalettes.Find((PaletteInfo p) => p.Key == key);
			if (currentPalette == null && dictionary.TryGetValue("palette", out value) && value is Dictionary<string, object>)
			{
				currentPalette = PaletteInfo.From((Dictionary<string, object>)value);
				if (currentPalette.Key.Length == 0)
				{
					currentPalette.Key = "last-saved";
				}
				currentPalette.GroupName = "上次保存";
				allPalettes.Insert(0, currentPalette);
			}
			if (currentPalette == null)
			{
				currentPalette = allPalettes.Find((PaletteInfo x) => x.Group == "builtin") ?? ((allPalettes.Count > 0) ? allPalettes[0] : null);
			}
			touched.Clear();
			if (dictionary.TryGetValue("values", out value) && value is Dictionary<string, object>)
			{
				foreach (KeyValuePair<string, object> item in (Dictionary<string, object>)value)
				{
					if (item.Value != null)
					{
						touched[item.Key] = item.Value;
					}
				}
			}
			string text = (dictionary.TryGetValue("image", out value) ? Convert.ToString(value) : "");
			if (!string.IsNullOrEmpty(text) && File.Exists(text))
			{
				wallpaperPath = text;
				lblWallpaper.Text = Path.GetFileName(text);
				lblWallpaper.ForeColor = Theme.Gold;
			}
			SyncSettingControls();
		}
		catch (Exception ex)
		{
			Log("WARN: 读取上次的选择失败：" + ex.Message);
		}
	}

	private static void SetStyleDoubleBuffer(Control c)
	{
		typeof(Control).GetProperty("DoubleBuffered", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(c, true, null);
	}

	private void UpdateAppTexts()
	{
		lblTitle.Text = AppName + " 换肤";
		lblSub.Text = "点一套主题、拖滑块，" + AppShort + " 窗口实时变化；满意了点「保存并应用」。不改 " + AppShort + " 的文件和设置，随时一键还原。";
		if (btnLaunch != null)
		{
			btnLaunch.Text = "用皮肤启动 " + AppShort;
			btnLaunch.Invalidate();
		}
	}

	private void SwitchApp(string next)
	{
		if (next == app || lblTitle == null)
		{
			return;
		}
		if (dirty && live != null && live.Ready)
		{
			DialogResult dialogResult = MessageBox.Show(this, AppName + " 的实时预览还有没保存的改动。\n\n是：保存并应用\n否：放弃改动", "切换前保存？", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
			live.Send(new Dictionary<string, object> { 
			{
				"op",
				(dialogResult == DialogResult.Yes) ? "commit" : "cancel"
			} });
			Thread.Sleep(800);
		}
		StopLive();
		dirty = false;
		app = next;
		UpdateAppTexts();
		if (cherryDir != null)
		{
			touched.Clear();
			suppressEvents = true;
			try
			{
				SetCherryWallpaper("");
			}
			finally
			{
				suppressEvents = false;
			}
			RestoreLastChoice();
			FilterPalettes();
			SyncSettingControls();
			if (SkinActive)
			{
				StartLive();
			}
			else
			{
				SetLiveLabel(on: false, "● 未连接：先点「保存并应用」");
			}
		}
	}

	private void BuildEnvPage()
	{
		Heading(pageEnv, "环境与日志", "检查运行环境、打开数据目录、导出日志。");
		AddButton(pageEnv, "安装 / 修复 Node.js 22", Theme.Card, Theme.Text, new Rectangle(0, 70, 240, 40), InstallNode);
		AddButton(pageEnv, "重新检测环境", Theme.Card, Theme.Text, new Rectangle(0, 120, 240, 40), RefreshStatus);
		AddButton(pageEnv, "打开梦境换肤数据目录", Theme.Card, Theme.Text, new Rectangle(0, 170, 240, 40), delegate
		{
			Directory.CreateDirectory(dataRoot);
			Process.Start("explorer.exe", "\"" + dataRoot + "\"");
			return Task.FromResult(0);
		});
		AddButton(pageEnv, "复制日志", Theme.Card, Theme.Text, new Rectangle(260, 70, 160, 40), delegate
		{
			if (log.TextLength > 0)
			{
				Clipboard.SetText(log.Text);
			}
			Log("日志已复制到剪贴板。");
			return Task.FromResult(0);
		});
		AddButton(pageEnv, "清空日志", Theme.Card, Theme.Text, new Rectangle(260, 120, 160, 40), delegate
		{
			log.Clear();
			return Task.FromResult(0);
		});
		pageEnv.Controls.Add(new Label
		{
			Text = "说明：\n· Node.js 22+ 是运行换肤脚本必需的；没装的话点上面的按钮，会从 nodejs.org 下载官方版本并校验 SHA-256，装在梦境换肤自己的目录里，不影响系统。\n· 数据目录里有当前皮肤、上次选择和会话状态，删掉等于重置。",
			ForeColor = Theme.Muted,
			AutoSize = false,
			Size = new Size(860, 120),
			Location = new Point(0, 230)
		});
		BuildEnvExtras();
	}

	private void Log(string msg)
	{
		if (log.InvokeRequired)
		{
			log.BeginInvoke((Action)delegate
			{
				Log(msg);
			});
			return;
		}
		string[] array = msg.Replace("\r", "").Split('\n');
		foreach (string text in array)
		{
			if (text.Trim().Length != 0)
			{
				Color color = Theme.Muted;
				if (text.StartsWith("SUCCESS"))
				{
					color = Theme.Green;
				}
				else if (text.StartsWith("FAILED") || text.StartsWith("ERROR"))
				{
					color = Theme.Red;
				}
				else if (text.StartsWith("UNCERTAIN") || text.StartsWith("NEEDS_RESTART") || text.StartsWith("WARN"))
				{
					color = Theme.Yellow;
				}
				log.SelectionStart = log.TextLength;
				log.SelectionColor = Color.FromArgb(90, 90, 100);
				log.AppendText(DateTime.Now.ToString("HH:mm:ss") + "  ");
				log.SelectionStart = log.TextLength;
				log.SelectionColor = color;
				log.AppendText(text + "\n");
				statusText = "›  " + text;
				statusColor = ((color == Theme.Muted) ? Theme.TextDim : color);
				if (statusBar != null)
				{
					statusBar.Invalidate();
				}
			}
		}
		log.ScrollToCaret();
	}

	private async Task RunBusy(Func<Task> work)
	{
		foreach (Control busyControl in busyControls)
		{
			busyControl.Enabled = false;
		}
		base.UseWaitCursor = true;
		try
		{
			await work();
		}
		catch (Exception ex)
		{
			Log("ERROR: " + ex.Message);
			try
			{
				Directory.CreateDirectory(dataRoot);
				File.AppendAllText(Path.Combine(dataRoot, "gui-error.log"), string.Concat(DateTime.Now.ToString("o"), " ", ex, "\r\n"));
			}
			catch
			{
			}
		}
		finally
		{
			foreach (Control busyControl2 in busyControls)
			{
				busyControl2.Enabled = true;
			}
			base.UseWaitCursor = false;
		}
	}

	private async Task StartupAsync()
	{
		await RunBusy(async delegate
		{
			await Task.Run(delegate
			{
				ResolveAppRoot();
			});
			if (appRoot == null)
			{
				Log("ERROR: 找不到换肤脚本，也没有内置资源。请重新下载 DreamSkin.exe。");
			}
			else
			{
				cherryDir = Path.Combine(appRoot, "src", "cherry");
				Log("脚本目录：" + appRoot + "（" + pathSource + "）");
				if (await NodeMajor() < 22 && MessageBox.Show(this, "换肤需要 Node.js 22（下载约 30 MB），这台电脑上还没有。\n现在自动下载安装吗？只装在梦境换肤自己的数据目录里，不影响系统。", "梦境换肤", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
				{
					try
					{
						await InstallNode();
					}
					catch (Exception ex)
					{
						Log("FAILED: 安装 Node.js 失败：" + ex.Message + " 可稍后在「环境与日志」重试。");
					}
				}
				await RefreshStatus();
				if (allPalettes.Count == 0)
				{
					await LoadCherryData();
				}
				if (startChip > 0)
				{
					chips.Selected = startChip;
				}
				if (SkinActive)
				{
					StartLive();
				}
				await StartupCheck();
			}
		});
	}

	private void ResolveAppRoot()
	{
		appRoot = FindAppRoot(dataRoot, Log, out var source);
		pathSource = source;
	}

	internal static string FindAppRoot(string dataRoot, Action<string> log, out string source)
	{
		source = "";
		string environmentVariable = Environment.GetEnvironmentVariable("DREAMSKIN_ROOT");
		if (!string.IsNullOrEmpty(environmentVariable) && File.Exists(Path.Combine(environmentVariable, "src", "cherry", "skin-cherry.mjs")))
		{
			source = "环境变量 DREAMSKIN_ROOT";
			return environmentVariable;
		}
		DirectoryInfo directoryInfo = new DirectoryInfo(AppDomain.CurrentDomain.BaseDirectory);
		for (int i = 0; i < 6; i++)
		{
			if (directoryInfo == null)
			{
				break;
			}
			if (File.Exists(Path.Combine(directoryInfo.FullName, "src", "cherry", "skin-cherry.mjs")))
			{
				source = "仓库源码";
				return directoryInfo.FullName;
			}
			directoryInfo = directoryInfo.Parent;
		}
		using Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("DreamSkin.payload.zip");
		if (stream == null)
		{
			return null;
		}
		byte[] buffer;
		using (MemoryStream memoryStream = new MemoryStream())
		{
			stream.CopyTo(memoryStream);
			buffer = memoryStream.ToArray();
		}
		string path;
		using (SHA256 sHA = SHA256.Create())
		{
			path = BitConverter.ToString(sHA.ComputeHash(buffer)).Replace("-", "").Substring(0, 12)
				.ToLowerInvariant();
		}
		string text = Path.Combine(dataRoot, "app", path);
		string path2 = Path.Combine(text, ".complete");
		if (!File.Exists(path2))
		{
			log?.Invoke("首次运行，正在释放内置文件…");
			string text2 = text + ".tmp";
			if (Directory.Exists(text2))
			{
				Directory.Delete(text2, recursive: true);
			}
			Directory.CreateDirectory(text2);
			using (MemoryStream memoryStream = new MemoryStream(buffer))
			{
				using ZipArchive zipArchive = new ZipArchive(memoryStream, ZipArchiveMode.Read);
				string value = Path.GetFullPath(text2) + Path.DirectorySeparatorChar;
				foreach (ZipArchiveEntry entry in zipArchive.Entries)
				{
					string fullPath = Path.GetFullPath(Path.Combine(text2, entry.FullName.Replace('/', Path.DirectorySeparatorChar)));
					if (fullPath.StartsWith(value, StringComparison.OrdinalIgnoreCase))
					{
						if (entry.FullName.EndsWith("/"))
						{
							Directory.CreateDirectory(fullPath);
							continue;
						}
						Directory.CreateDirectory(Path.GetDirectoryName(fullPath));
						entry.ExtractToFile(fullPath, overwrite: true);
					}
				}
			}
			if (Directory.Exists(text))
			{
				Directory.Delete(text, recursive: true);
			}
			Directory.Move(text2, text);
			File.WriteAllText(path2, DateTime.Now.ToString("o"));
		}
		source = "内置资源";
		return text;
	}

	private string ResolveNode()
	{
		return ResolveNodePath(appRoot, dataRoot);
	}

	// Node 定位（launcher 第二批，T0-6 收口）：payload 自带的 runtime/node.exe 最优先，
	// 其次是「安装 / 修复 Node.js 22」下载到数据目录的 runtime，最后 PATH 上的 node.exe。
	// appRoot 是 FindAppRoot 的结果（其下有 src/ 子目录，payload 的 node 在 src/runtime/node.exe，
	// 与脚本同在释放目录里）；appRoot 为空（尚未定位脚本目录）时跳过第一档。
	// 原下载修复流程（InstallNode 一整套）原样不动，只是排在自带运行时之后。
	internal static string ResolveNodePath(string appRootPath, string dataRootPath)
	{
		if (!string.IsNullOrEmpty(appRootPath))
		{
			string bundled = Path.Combine(appRootPath, "src", "runtime", "node.exe");
			if (File.Exists(bundled))
			{
				return bundled;
			}
		}
		string downloaded = Path.Combine(dataRootPath, "runtime", "node", "node.exe");
		return File.Exists(downloaded) ? downloaded : "node.exe";
	}

	// 与 ResolveNode 同口径的 PATH 前置目录：解析结果是带路径的 node.exe 时返回其所在目录，
	// 让子进程里裸呼 node 时也用同一个；解析结果就是 PATH 上的 "node.exe" 时返回 null（不前置）。
	private string NodePathDir()
	{
		string node = ResolveNode();
		return Path.IsPathRooted(node) ? Path.GetDirectoryName(node) : null;
	}

	private async Task<int> NodeMajor()
	{
		Match m = Regex.Match((await RunProcess(ResolveNode(), "-v", 15000)).Output, "v(\\d+)\\.");
		return m.Success ? int.Parse(m.Groups[1].Value) : 0;
	}

	// ---------- U-1：适配器驱动的应用列表（§4.6） ----------

	private void BuildAppNav(List<AppRow> rows)
	{
		foreach (Panel p in appNavRows)
		{
			navPanel.Controls.Remove(p);
			p.Dispose();
		}
		appNavRows.Clear();
		if (envNavButton != null)
		{
			navPanel.Controls.Remove(envNavButton);
			envNavButton.Dispose();
			envNavButton = null;
		}
		List<AppRow> sorted = AppStatusLogic.SortForList(rows);
		if (sorted.Count == 0)
		{
			// 还没拿到 apps-status 数据时的兜底行（状态未知，不冒充已安装检测结果）。
			sorted = new List<AppRow>
			{
				new AppRow { Id = "cherry", Name = "Cherry Studio", Installed = true },
				new AppRow { Id = "zcode", Name = "ZCode", Installed = true }
			};
		}
		int y = 100;
		int hidden = 0;
		foreach (AppRow row in sorted)
		{
			if (AppStatusLogic.IsFolded(row))
			{
				hidden++;
				if (!appListExpanded)
				{
					continue;
				}
			}
			Panel p = MakeAppNavRow(row, y);
			appNavRows.Add(p);
			navPanel.Controls.Add(p);
			y += 50;
		}
		if (hidden > 0)
		{
			Panel more = new Panel
			{
				Location = new Point(16, y),
				Size = new Size(178, 42),
				BackColor = Theme.Nav,
				Cursor = Cursors.Hand,
				Tag = "__more"
			};
			Label l = new Label
			{
				Text = (appListExpanded ? "收起未安装的应用" : ("更多应用（" + hidden + " 个未安装）")),
				ForeColor = Theme.Muted,
				Font = Theme.F(9f),
				Location = new Point(34, 13),
				AutoSize = true
			};
			more.Controls.Add(l);
			EventHandler h = delegate
			{
				appListExpanded = !appListExpanded;
				BuildAppNav(appRowsData);
			};
			more.Click += h;
			l.Click += h;
			appNavRows.Add(more);
			navPanel.Controls.Add(more);
			y += 50;
		}
		envNavButton = new FlatButton("环境与日志", Theme.Nav, Theme.Text)
		{
			Width = 178,
			Height = 42,
			Location = new Point(16, y)
		};
		envNavButton.Tag = "nav";
		envNavButton.Click += delegate
		{
			ShowPage(2);
		};
		navPanel.Controls.Add(envNavButton);
		HighlightNav();
	}

	private Panel MakeAppNavRow(AppRow row, int y)
	{
		Panel p = new Panel
		{
			Location = new Point(16, y),
			Size = new Size(178, 42),
			BackColor = Theme.Nav,
			Cursor = Cursors.Hand,
			Tag = row.Id
		};
		Label dot = new Label
		{
			Text = "●",
			ForeColor = AppStatusLogic.DotColor(row.State),
			Font = Theme.F(11f),
			Location = new Point(8, 10),
			Size = new Size(22, 22)
		};
		Label name = new Label
		{
			Text = row.Name,
			ForeColor = Theme.Text,
			Font = Theme.F(9.5f, FontStyle.Bold),
			Location = new Point(34, 4),
			Size = new Size(140, 18)
		};
		Label state = new Label
		{
			Text = AppStatusLogic.StateText(row.State),
			ForeColor = Theme.Muted,
			Font = Theme.F(8f),
			Location = new Point(34, 23),
			Size = new Size(140, 16)
		};
		p.Controls.Add(dot);
		p.Controls.Add(name);
		p.Controls.Add(state);
		EventHandler h = delegate
		{
			SelectAppRow(row);
		};
		p.Click += h;
		dot.Click += h;
		name.Click += h;
		state.Click += h;
		return p;
	}

	private void SelectAppRow(AppRow row)
	{
		if (row.Id == "cherry")
		{
			ShowPage(0);
			return;
		}
		if (row.Id == "zcode")
		{
			ShowPage(1);
			return;
		}
		// 其余适配器先进环境页（兼容矩阵在那里）；编辑页仍只有 Cherry / ZCode 两端，日志里如实说明。
		ShowPage(2);
		Log("应用状态：" + row.Name + " —— " + AppStatusLogic.StateText(row.State) + ((row.AppVersion.Length > 0) ? ("，当前版本 " + row.AppVersion) : "") + "。它的换肤编辑页尚未接入总控台，先在下方「兼容矩阵」看体检结果。");
		if (row.Running)
		{
			// 顺手做一次只读体检：页面里若有其他换肤工具的样式，CheckSkin 会走冲突弹窗（每应用只弹首次）。
			conflictCheckTask = CheckSkin(row.Id, startup: false);
		}
	}

	private void HighlightNav()
	{
		string sel = ((currentPage == 0) ? "cherry" : ((currentPage == 1) ? "zcode" : ""));
		foreach (Panel p in appNavRows)
		{
			string id = p.Tag as string;
			bool on = id != null && id == sel;
			p.BackColor = (on ? Theme.CardHover : Theme.Nav);
			foreach (Control c in p.Controls)
			{
				Label l = c as Label;
				if (l != null && l.Font.Bold)
				{
					l.ForeColor = (on ? Theme.Gold : Theme.Text);
				}
			}
		}
		if (envNavButton != null)
		{
			envNavButton.Fill = ((currentPage == 2) ? Theme.CardHover : Theme.Nav);
			envNavButton.Fore = ((currentPage == 2) ? Theme.Gold : Theme.Text);
			envNavButton.Border = envNavButton.Fill;
			envNavButton.Invalidate();
		}
	}

	private async Task RefreshAppList(bool force = false)
	{
		if (cherryDir == null || appListBusy)
		{
			return;
		}
		if (!force && (DateTime.Now - lastAppListAt).TotalSeconds < 30)
		{
			return;
		}
		appListBusy = true;
		try
		{
			string script = Q(Path.Combine(cherryDir, "skin-cherry.mjs"));
			ProcResult r = await RunProcess(ResolveNode(), script + " apps-status", 90000);
			List<AppRow> rows = ParseAppRows(r.Output);
			if (rows.Count > 0)
			{
				appRowsData.Clear();
				appRowsData.AddRange(rows);
				lastAppListAt = DateTime.Now;
				BuildAppNav(rows);
				UpdateSyncButtonText();
				RefreshMatrix();
			}
		}
		catch
		{
		}
		finally
		{
			appListBusy = false;
		}
	}

	private static List<AppRow> ParseAppRows(string json)
	{
		List<AppRow> rows = new List<AppRow>();
		try
		{
			Dictionary<string, object> root = JsonSer.DeserializeObject(json) as Dictionary<string, object>;
			if (root == null || !root.TryGetValue("apps", out object appsObj))
			{
				return rows;
			}
			List<object> apps = AsList(appsObj);
			foreach (object item in apps)
			{
				if (!(item is Dictionary<string, object> d))
				{
					continue;
				}
				AppRow row = new AppRow();
				row.Id = StrOf(d, "id");
				row.Name = StrOf(d, "name");
				row.Channel = StrOf(d, "channel");
				row.Installed = BoolOf(d, "installed");
				row.Running = BoolOf(d, "running");
				row.SkinActive = BoolOf(d, "skinActive");
				row.Mode = StrOf(d, "mode");
				row.AppVersion = StrOf(d, "appVersion");
				row.Error = StrOf(d, "error");
				row.CompatMode = row.Mode == "compat";
				if (d.TryGetValue("testedVersions", out object tv))
				{
					foreach (object v in AsList(tv))
					{
						row.TestedVersions.Add(Convert.ToString(v));
					}
				}
				row.State = ((row.Error.Length > 0) ? AppDotState.Unknown : AppStatusLogic.Decide(row.Installed, row.Running, row.SkinActive, row.CompatMode));
				rows.Add(row);
			}
		}
		catch
		{
		}
		return rows;
	}

	// JavaScriptSerializer 把 JSON 数组交回来时可能是 ArrayList 也可能是 object[]，统一走 IEnumerable 取。
	private static List<object> AsList(object o)
	{
		List<object> r = new List<object>();
		if (o is System.Collections.IEnumerable e && !(o is string))
		{
			foreach (object x in e)
			{
				r.Add(x);
			}
		}
		return r;
	}

	private static string StrOf(Dictionary<string, object> d, string k)
	{
		return (d.TryGetValue(k, out object v) && v != null) ? Convert.ToString(v) : "";
	}

	private static bool BoolOf(Dictionary<string, object> d, string k)
	{
		return d.TryGetValue(k, out object v) && v is bool b && b;
	}

	// ---------- U-3：兼容矩阵 / 冲突弹窗 / DSH 插件开关（§4.6） ----------

	private void BuildEnvExtras()
	{
		Label mt = new Label
		{
			Text = "兼容矩阵",
			ForeColor = Theme.Gold,
			Font = Theme.F(11f, FontStyle.Bold),
			Location = new Point(0, 366),
			AutoSize = true
		};
		pageEnv.Controls.Add(mt);
		AddButton(pageEnv, "刷新矩阵", Theme.Card, Theme.Text, new Rectangle(750, 360, 110, 32), async delegate
		{
			await RefreshAppList(true);
			RefreshMatrix();
		});
		matrixBox = new RichTextBox
		{
			BackColor = Theme.Card,
			ForeColor = Theme.Text,
			BorderStyle = BorderStyle.None,
			ReadOnly = true,
			Font = Theme.F(9f),
			Location = new Point(0, 400),
			Size = new Size(860, 116),
			ScrollBars = RichTextBoxScrollBars.Vertical
		};
		pageEnv.Controls.Add(matrixBox);
		Label pt = new Label
		{
			Text = "DSH 插件通道（可选）",
			ForeColor = Theme.Gold,
			Font = Theme.F(11f, FontStyle.Bold),
			Location = new Point(0, 528),
			AutoSize = true
		};
		pageEnv.Controls.Add(pt);
		pageEnv.Controls.Add(new Label
		{
			Text = "DSH 默认走 CDP 通道换肤；插件通道是给浏览器模式（dsh web）用的兜底：插件只读梦境换肤数据目录里的皮肤文件，经 DSH 官方插槽注入，不联网、不读对话内容。开关打开只是「允许使用」，真正安装还要再点「安装插件」并确认；插件目录还没配置好时，安装会如实报错、不会乱放文件。卸载按安装清单精确移除，装过什么删什么。",
			ForeColor = Theme.Muted,
			AutoSize = false,
			Size = new Size(860, 40),
			Location = new Point(0, 554)
		});
		pluginStatusLabel = new Label
		{
			Text = "插件通道状态：尚未检测",
			ForeColor = Theme.Text,
			Font = Theme.F(9f),
			Location = new Point(0, 600),
			AutoSize = true
		};
		pageEnv.Controls.Add(pluginStatusLabel);
		pluginToggle = new ToggleSwitch
		{
			Title = "允许使用插件通道",
			Location = new Point(0, 624),
			Size = new Size(200, 34)
		};
		pluginToggle.CheckedChanged += async delegate
		{
			if (pluginUiBusy)
			{
				return;
			}
			await SetPluginEnabled(pluginToggle.Checked);
		};
		pageEnv.Controls.Add(pluginToggle);
		AddButton(pageEnv, "安装插件", Theme.Card, Theme.Text, new Rectangle(216, 624, 110, 34), InstallPlugin);
		AddButton(pageEnv, "卸载插件", Theme.Card, Theme.Text, new Rectangle(338, 624, 110, 34), UninstallPlugin);
		RefreshMatrix();
	}

	private Dictionary<string, object> ReadCompatFile()
	{
		try
		{
			string p = Path.Combine(dataRoot, "compat.json");
			if (!File.Exists(p))
			{
				return null;
			}
			return JsonSer.DeserializeObject(File.ReadAllText(p)) as Dictionary<string, object>;
		}
		catch
		{
			return null;
		}
	}

	private static CompatEntry CompatEntryOf(Dictionary<string, object> compat, string id)
	{
		if (compat == null || !compat.TryGetValue(id, out object o) || !(o is Dictionary<string, object> d))
		{
			return null;
		}
		CompatEntry c = new CompatEntry();
		c.Mode = StrOf(d, "mode");
		if (c.Mode.Length == 0)
		{
			c.Mode = "full";
		}
		c.At = StrOf(d, "at");
		if (d.TryGetValue("partsOk", out object ok))
		{
			c.PartsOkCount = AsList(ok).Count;
		}
		if (d.TryGetValue("partsMissing", out object miss))
		{
			foreach (object x in AsList(miss))
			{
				c.PartsMissing.Add(Convert.ToString(x));
			}
		}
		return c;
	}

	private void RefreshMatrix()
	{
		if (matrixBox == null)
		{
			return;
		}
		Dictionary<string, object> compat = ReadCompatFile();
		List<AppRow> rows = appRowsData;
		if (rows.Count == 0)
		{
			rows = new List<AppRow>
			{
				new AppRow { Id = "cherry", Name = "Cherry Studio", Installed = true },
				new AppRow { Id = "zcode", Name = "ZCode", Installed = true }
			};
		}
		List<string> lines = new List<string>();
		foreach (AppRow row in AppStatusLogic.SortForList(rows))
		{
			MatrixRow mr = MatrixLogic.BuildRow(row, CompatEntryOf(compat, row.Id));
			lines.Add(mr.Name + "  ｜  已测版本：" + mr.Tested + "  ｜  当前版本：" + mr.Current + "  ｜  体检：" + mr.Health);
		}
		matrixBox.Text = (lines.Count > 0) ? string.Join("\r\n", lines) : "暂无数据";
	}

	private string DisplayNameOf(string id)
	{
		AppRow row = appRowsData.Find((AppRow x) => x.Id == id);
		if (row != null && row.Name.Length > 0)
		{
			return row.Name;
		}
		return (id == "zcode") ? "ZCode" : ((id == "cherry") ? "Cherry Studio" : id);
	}

	// §4.6：首次检测到冲突工具时弹窗说明并让用户二选一（每个应用只弹首次，标记文件在数据根目录）。
	// 文案与 Node 侧 foreignStyleMessage 逐字一致（MatrixLogic.ConflictMessage）；弹窗只告知，不替用户动对方工具。
	private void MaybeNotifyConflict(string which, Dictionary<string, object> cd)
	{
		string tool = StrOf(cd, "name");
		if (tool.Length == 0)
		{
			return;
		}
		List<string> hits = new List<string>();
		if (cd.TryGetValue("hits", out object hv))
		{
			foreach (object x in AsList(hv))
			{
				hits.Add(Convert.ToString(x));
			}
		}
		string msg = MatrixLogic.ConflictMessage(DisplayNameOf(which), tool, hits);
		Log("WARN: " + msg);
		string flag = Path.Combine(dataRoot, "conflict-notified-" + which + ".flag");
		try
		{
			if (File.Exists(flag))
			{
				return;
			}
			Directory.CreateDirectory(dataRoot);
			File.WriteAllText(flag, "1");
		}
		catch
		{
		}
		MessageBox.Show(msg, "梦境换肤 · 换肤冲突", MessageBoxButtons.OK, MessageBoxIcon.Exclamation);
	}

	private async Task RefreshPluginPanel()
	{
		if (cherryDir == null || pluginStatusLabel == null || pluginUiBusy)
		{
			return;
		}
		pluginUiBusy = true;
		try
		{
			string script = Q(Path.Combine(cherryDir, "skin-cherry.mjs"));
			ProcResult r = await RunProcess(ResolveNode(), script + " plugin-status --app dsh", 60000);
			Dictionary<string, object> d = JsonSer.DeserializeObject(r.Output) as Dictionary<string, object>;
			if (d != null)
			{
				bool en = BoolOf(d, "enabled");
				bool ins = BoolOf(d, "installed");
				pluginToggle.Checked = en;
				pluginStatusLabel.Text = "插件通道状态：" + MatrixLogic.PluginStateText(en, ins);
			}
		}
		catch
		{
		}
		finally
		{
			pluginUiBusy = false;
		}
	}

	private async Task SetPluginEnabled(bool on)
	{
		if (cherryDir == null)
		{
			return;
		}
		string script = Q(Path.Combine(cherryDir, "skin-cherry.mjs"));
		ProcResult r = await RunProcess(ResolveNode(), script + (on ? " plugin-enable --app dsh" : " plugin-disable --app dsh"), 60000);
		string outp = r.Output.Trim();
		if (outp.Length > 0)
		{
			Log(outp);
		}
		await RefreshPluginPanel();
	}

	private async Task InstallPlugin()
	{
		if (cherryDir == null)
		{
			return;
		}
		// §4.3 / §4.6：安装插件必须用户明确同意——先弹确认框讲清写到哪里，用户点「是」才带 --consent 调入口。
		DialogResult dr = MessageBox.Show("要把梦境换肤的 DSH 插件装进 DSH 的插件目录吗？\n\n插件只做一件事：读梦境换肤数据目录里的皮肤文件，经 DSH 官方插槽（shell.overlay）把样式注入 Web UI。不联网、不读对话内容、不碰 Cookie。\n随时可以点「卸载插件」按清单删干净。\n\n注意：本机若还没配置好 DSH 插件目录，安装会如实报错、不会乱放文件。", "梦境换肤 · 安装 DSH 插件", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
		if (dr != DialogResult.Yes)
		{
			Log("已取消安装 DSH 插件。");
			return;
		}
		string script = Q(Path.Combine(cherryDir, "skin-cherry.mjs"));
		ProcResult r = await RunProcess(ResolveNode(), script + " plugin-install --app dsh --consent", 60000);
		string outp = r.Output.Trim();
		if (outp.Length > 0)
		{
			Log(outp);
		}
		await RefreshPluginPanel();
	}

	private async Task UninstallPlugin()
	{
		if (cherryDir == null)
		{
			return;
		}
		string script = Q(Path.Combine(cherryDir, "skin-cherry.mjs"));
		ProcResult r = await RunProcess(ResolveNode(), script + " plugin-uninstall --app dsh", 60000);
		string outp = r.Output.Trim();
		if (outp.Length > 0)
		{
			Log(outp);
		}
		await RefreshPluginPanel();
	}

	private async Task RefreshStatus()
	{
		int major = await NodeMajor();
		SetState(lblNode, (major >= 22) ? ("● Node.js v" + major) : ((major > 0) ? "● Node.js 版本太旧" : "● 未找到 Node.js"), (major >= 22) ? Theme.Green : ((major > 0) ? Theme.Yellow : Theme.Red));
		if (major < 22)
		{
			Log("WARN: 需要 Node.js 22 或更新版本。到「环境与日志」点「安装 / 修复 Node.js 22」即可。");
		}
		else if (cherryDir != null)
		{
			string script = Q(Path.Combine(cherryDir, "skin-cherry.mjs"));
			Task<ProcResult> tc = RunProcess(ResolveNode(), script + " status --app cherry", 30000);
			Task<ProcResult> tz = RunProcess(ResolveNode(), script + " status --app zcode", 30000);
			cherrySkinActive = ShowStatus(await tc, lblCherryState, "Cherry");
			zcodeSkinActive = ShowStatus(await tz, lblZCodeState, "ZCode");
			await RefreshAppList();
			await RefreshPluginPanel();
		}
	}

	private bool ShowStatus(ProcResult st, Label l, string name)
	{
		bool flag = st.Output.Contains("\"running\": true");
		bool flag2 = flag && st.Output.Contains("\"skinActive\": true") && Regex.IsMatch(st.Output, "\"debugPort\": [1-9]");
		bool flag3 = !st.Output.Contains("\"exe\": null");
		SetState(l, (!flag3) ? ("● " + name + " 未安装/未找到") : (flag2 ? ("● " + name + " 皮肤生效中") : (flag ? ("● " + name + " 运行中（原版）") : ("● " + name + " 未运行"))), (!flag3) ? Theme.Off : (flag2 ? Theme.Green : (flag ? Theme.Blue : Theme.Idle)));
		return flag2;
	}

	private void SetState(Label l, string text, Color c)
	{
		if (l.InvokeRequired)
		{
			l.BeginInvoke((Action)delegate
			{
				SetState(l, text, c);
			});
		}
		else
		{
			l.Text = text;
			l.ForeColor = c;
		}
	}

	private static string Q(string s)
	{
		return "\"" + s + "\"";
	}

	private Task LaunchCherry()
	{
		Log("用上次的皮肤启动 " + AppName + "…");
		return RunCherry("launch", "");
	}

	private async Task RestoreCherry()
	{
		Log("还原 " + AppName + " 原版外观…");
		await RunCherry("restore", "");
	}

	private async Task<int> RunCherry(string cmd, string args)
	{
		if (cherryDir == null)
		{
			Log("ERROR: 脚本目录未就绪。");
			return -1;
		}
		if (await NodeMajor() < 22)
		{
			Log("FAILED: 需要 Node.js 22+，请先在「环境与日志」里安装。");
			return -1;
		}
		string script = Q(Path.Combine(cherryDir, "skin-cherry.mjs"));
		string appArg = " --app " + app;
		ProcResult r = await RunProcess(ResolveNode(), script + " " + cmd + " " + args + appArg, 180000);
		Log(r.Output);
		if (r.ExitCode == 3)
		{
			string note = ((app == "zcode") ? "项目和对话记录不受影响，但正在跑的任务会被中断。" : "聊天记录不受影响，但输入框里没发出去的文字会丢失。");
			DialogResult ok = MessageBox.Show(this, AppName + " 正在运行，需要由梦境换肤重新启动一次才能换肤。\n\n" + note + "\n\n现在重启 " + AppName + " 吗？", "需要重启 " + AppName, MessageBoxButtons.YesNo, MessageBoxIcon.Question);
			if (ok != DialogResult.Yes)
			{
				Log("已取消。");
				return 3;
			}
			Log("正在重启 " + AppName + " 并应用皮肤（约 10–30 秒）…");
			r = await RunProcess(ResolveNode(), script + " " + cmd + " " + args + " --restart" + appArg, 180000);
			Log(r.Output);
		}
		if (r.ExitCode == 0 && cmd == "apply")
		{
			OfferShortcut(script);
		}
		if (r.ExitCode == 0 && cmd == "launch")
		{
			await CheckSkin(app, startup: true);
		}
		await RefreshStatus();
		int num;
		switch (cmd)
		{
		case "restore":
			StopLive();
			break;
		case "apply":
		case "launch":
			if (!SkinActive)
			{
				goto default;
			}
			num = ((live != null && live.Alive) ? 1 : 0);
			goto IL_05f4;
		default:
			{
				num = 1;
				goto IL_05f4;
			}
			IL_05f4:
			if (num == 0)
			{
				StartLive();
			}
			break;
		}
		return r.ExitCode;
	}

	private void OfferShortcut(string script)
	{
		if (!File.Exists(ShortcutPath(AppName)) && MessageBox.Show(this, "要在桌面创建「" + AppName + " (梦境换肤)」快捷方式吗？\n\n以后用它打开 " + AppShort + " 会自动带上皮肤；用原来的图标打开就是原版。", "创建快捷方式", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
		{
			MakeShortcut(tell: false);
		}
	}

	private async void MakeShortcut(bool tell)
	{
		try
		{
			string icon = null;
			if (cherryDir != null)
			{
				Match m = Regex.Match((await RunProcess(ResolveNode(), Q(Path.Combine(cherryDir, "skin-cherry.mjs")) + " status --app " + app, 30000)).Output, "\"exe\":\\s*\"((?:[^\"\\\\]|\\\\.)*)\"");
				if (m.Success)
				{
					icon = m.Groups[1].Value.Replace("\\\\", "\\");
				}
			}
			string lnk = CreateLaunchShortcut(app, AppName, icon);
			Log("SUCCESS: 桌面已创建「" + Path.GetFileNameWithoutExtension(lnk) + "」。");
			if (tell)
			{
				MessageBox.Show(this, "桌面已创建「" + Path.GetFileNameWithoutExtension(lnk) + "」。\n\n双击它就会用皮肤打开 " + AppShort + "（开着的话会先重启一次）。\n以后换了皮肤也不用重建。", "创建快捷方式", MessageBoxButtons.OK, MessageBoxIcon.Asterisk);
			}
		}
		catch (Exception ex)
		{
			Log("FAILED: 创建快捷方式失败：" + ex.Message);
			if (tell)
			{
				MessageBox.Show(this, "创建快捷方式失败：" + ex.Message, "创建快捷方式", MessageBoxButtons.OK, MessageBoxIcon.Exclamation);
			}
		}
	}

	private async Task InstallNode()
	{
		await Task.Run(delegate
		{
			ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
			string[] array = new string[2] { "https://nodejs.org/dist/latest-v22.x/", "https://npmmirror.com/mirrors/node/latest-v22.x/" };
			string text = "";
			string[] array2 = array;
			foreach (string text2 in array2)
			{
				try
				{
					InstallNodeFrom(text2);
					return;
				}
				catch (Exception ex)
				{
					string text3 = text;
					text = text3 + " " + new Uri(text2).Host + "：" + ex.Message;
					Log("WARN: " + new Uri(text2).Host + " 下载失败，" + ((text2 == array[array.Length - 1]) ? "没有别的源了。" : "换镜像重试…"));
				}
			}
			throw new Exception("所有下载源都失败了。" + text);
		});
		if (allPalettes.Count == 0 && cherryDir != null)
		{
			await LoadCherryData();
		}
		await RefreshStatus();
	}

	private void InstallNodeFrom(string baseUrl)
	{
		Log("从 " + new Uri(baseUrl).Host + " 获取 Node.js 22 最新版本信息…");
		using WebClient webClient = new WebClient();
		string input = webClient.DownloadString(baseUrl + "SHASUMS256.txt");
		Match match = Regex.Match(input, "([0-9a-f]{64})\\s+(node-v22\\.[0-9.]+-win-x64\\.zip)");
		if (!match.Success)
		{
			throw new Exception("没在 SHASUMS256.txt 里找到 win-x64 安装包。");
		}
		string value = match.Groups[2].Value;
		string value2 = match.Groups[1].Value;
		Log("下载 " + value + " …");
		string text = Path.Combine(Path.GetTempPath(), value);
		webClient.DownloadFile(baseUrl + value, text);
		string text2;
		using (FileStream inputStream = File.OpenRead(text))
		{
			using SHA256 sHA = SHA256.Create();
			text2 = BitConverter.ToString(sHA.ComputeHash(inputStream)).Replace("-", "").ToLowerInvariant();
		}
		if (text2 != value2)
		{
			File.Delete(text);
			throw new Exception("SHA-256 校验失败，已删除下载文件。");
		}
		string directoryName = Path.GetDirectoryName(NodeRuntimeDir);
		Directory.CreateDirectory(directoryName);
		string text3 = Path.Combine(directoryName, "extract-tmp");
		if (Directory.Exists(text3))
		{
			Directory.Delete(text3, recursive: true);
		}
		ZipFile.ExtractToDirectory(text, text3);
		string sourceDirName = Directory.GetDirectories(text3)[0];
		if (Directory.Exists(NodeRuntimeDir))
		{
			Directory.Delete(NodeRuntimeDir, recursive: true);
		}
		Directory.Move(sourceDirName, NodeRuntimeDir);
		Directory.Delete(text3, recursive: true);
		File.Delete(text);
		Log("SUCCESS: Node.js 已安装到 " + NodeRuntimeDir + "（SHA-256 校验通过）。");
	}

	private Task<ProcResult> RunProcess(string exe, string args, int timeoutMs)
	{
		return Task.Run(delegate
		{
			ProcResult procResult = new ProcResult();
			try
			{
				ProcessStartInfo processStartInfo = new ProcessStartInfo
				{
					FileName = exe,
					Arguments = args,
					UseShellExecute = false,
					CreateNoWindow = true,
					RedirectStandardOutput = true,
					RedirectStandardError = true,
					StandardOutputEncoding = Encoding.UTF8,
					StandardErrorEncoding = Encoding.UTF8
				};
				string nodeDir = NodePathDir();
				if (nodeDir != null)
				{
					processStartInfo.EnvironmentVariables["PATH"] = nodeDir + ";" + processStartInfo.EnvironmentVariables["PATH"];
				}
				using Process process = new Process();
				process.StartInfo = processStartInfo;
				StringBuilder outBuf = new StringBuilder();
				StringBuilder errBuf = new StringBuilder();
				process.OutputDataReceived += delegate(object s, DataReceivedEventArgs e)
				{
					if (e.Data != null)
					{
						lock (outBuf)
						{
							outBuf.AppendLine(e.Data);
						}
					}
				};
				process.ErrorDataReceived += delegate(object s, DataReceivedEventArgs e)
				{
					if (e.Data != null)
					{
						lock (errBuf)
						{
							errBuf.AppendLine(e.Data);
						}
					}
				};
				process.Start();
				process.BeginOutputReadLine();
				process.BeginErrorReadLine();
				if (!process.WaitForExit(timeoutMs))
				{
					try
					{
						process.Kill();
					}
					catch
					{
					}
					procResult.Output = string.Concat("UNCERTAIN: 子进程超时被终止。\n", outBuf, errBuf);
					return procResult;
				}
				process.WaitForExit();
				procResult.ExitCode = process.ExitCode;
				procResult.Output = outBuf.ToString() + ((errBuf.Length > 0) ? ("\n" + errBuf) : "");
			}
			catch (Win32Exception)
			{
				procResult.Output = ((exe == "node.exe") ? "" : ("ERROR: 无法启动 " + exe));
			}
			catch (Exception ex2)
			{
				procResult.Output = "ERROR: " + ex2.Message;
			}
			return procResult;
		});
	}

	[STAThread]
	public static void Main(string[] args)
	{
		Application.EnableVisualStyles();
		Application.SetCompatibleTextRenderingDefault(defaultValue: false);
		if (args.Length >= 1 && HeadlessCommands.IsHeadlessCommand(args[0]))
		{
			Environment.Exit(HeadlessCommands.Run(args));
			return;
		}
		if (args.Length >= 2 && args[0] == "--launch")
		{
			Environment.Exit(HeadlessLaunch(args[1]));
			return;
		}
		MainForm f = new MainForm();
		f.Load += delegate
		{
			f.ApplyArgs(args);
		};
		Application.Run(f);
	}

	private async Task LoadGallery(bool append)
	{
		if (cherryDir == null || galleryLoading)
		{
			return;
		}
		galleryLoading = true;
		if (!append)
		{
			galleryItems.Clear();
			galleryTotal = -1;
		}
		if (chips.Selected == 5)
		{
			FilterPalettes();
		}
		string sort = (new string[3] { "popular", "favorites", "recent" })[Math.Max(0, Math.Min(2, gallerySort.Selected))];
		string args = "gallery-list --sort " + sort + " --offset " + galleryItems.Count + " --limit 24";
		string q = gallerySearch.Text.Trim();
		if (q.Length > 0)
		{
			args = args + " --q " + Q(q);
		}
		int st = galleryStyle.Selected;
		if (st > 0 && st < GalleryStyles.Length)
		{
			args = args + " --style " + Q(GalleryStyles[st]);
		}
		try
		{
			ProcResult r = await RunProcess(ResolveNode(), Q(Path.Combine(cherryDir, "skin-cherry.mjs")) + " " + args, 90000);
			Dictionary<string, object> res = JsonSer.Deserialize<Dictionary<string, object>>(FirstJsonLine(r.Output));
			if (!res.TryGetValue("ok", out var ok) || !(ok is bool) || !(bool)ok)
			{
				res.TryGetValue("msg", out var msg);
				Log("FAILED: " + (msg ?? r.Output));
				if (galleryTotal < 0)
				{
					galleryTotal = 0;
				}
			}
			else
			{
				galleryTotal = Convert.ToInt32(res["total"]);
				foreach (object item in (ArrayList)res["palettes"])
				{
					galleryItems.Add(PaletteInfo.From((Dictionary<string, object>)item));
				}
				if (!append && st > 0)
				{
					Log("主题库 · " + GalleryStyles[st] + "：" + galleryTotal + " 套（风格是自动分的，偶尔会分错）。");
				}
				else if (!append)
				{
					Log("主题库：共 " + galleryTotal + " 套社区主题（dreamskin.cc）。点卡片下载并预览，右键可在网页上查看；喜欢就「★ 存为我的皮肤」。");
				}
			}
		}
		catch (Exception ex)
		{
			Log("FAILED: 主题库：" + ex.Message);
			if (galleryTotal < 0)
			{
				galleryTotal = 0;
			}
		}
		finally
		{
			galleryLoading = false;
		}
		if (chips.Selected == 5)
		{
			FilterPalettes();
		}
	}

	private async Task ChoosePalette(PaletteInfo p)
	{
		if (p.Group == "gallery" && !p.Downloaded)
		{
			for (int i = 0; i < 150; i++)
			{
				if (!galleryLoading)
				{
					break;
				}
				await Task.Delay(200);
			}
			if (galleryLoading)
			{
				Log("WARN: 主题库还在加载，稍等再点一次「" + p.Name + "」。");
				return;
			}
			Log("正在下载「" + p.Name + "」…");
			galleryLoading = true;
			PaletteInfo got = null;
			try
			{
				string args = "gallery-get --id " + Q(p.Key.Substring(3));
				if (p.Author.Length > 0)
				{
					args = args + " --author " + Q(p.Author);
				}
				if (p.License.Length > 0)
				{
					args = args + " --license " + Q(p.License);
				}
				ProcResult r = await RunProcess(ResolveNode(), Q(Path.Combine(cherryDir, "skin-cherry.mjs")) + " " + args, 120000);
				Dictionary<string, object> res = JsonSer.Deserialize<Dictionary<string, object>>(FirstJsonLine(r.Output));
				if (!res.TryGetValue("ok", out var ok) || !(ok is bool) || !(bool)ok)
				{
					res.TryGetValue("msg", out var msg);
					Log("FAILED: " + (msg ?? r.Output));
				}
				else
				{
					got = PaletteInfo.From((Dictionary<string, object>)res["palette"]);
				}
			}
			catch (Exception ex)
			{
				Log("FAILED: 下载主题失败：" + ex.Message);
			}
			finally
			{
				galleryLoading = false;
			}
			if (got == null)
			{
				return;
			}
			got.Downloaded = true;
			int gi = galleryItems.IndexOf(p);
			if (gi >= 0)
			{
				galleryItems[gi] = got;
			}
			allPalettes.RemoveAll((PaletteInfo x) => x.Key == got.Key);
			allPalettes.Add(got);
			foreach (ThemeTile tile in tiles)
			{
				if (tile.Palette == p)
				{
					tile.Palette = got;
					tile.Invalidate();
				}
			}
			p = got;
		}
		SelectPalette(p);
		if (p.Group == "gallery")
		{
			Log("「" + p.Name + "」作者 " + ((p.Author.Length > 0) ? p.Author : "未署名") + " · 许可 " + ((p.License.Length > 0) ? p.License : "未注明") + "（仅下载到本机自用）。");
		}
	}

	private void ShowGalleryMenu(PaletteInfo p, Control at, Point pt)
	{
		ContextMenuStrip contextMenuStrip = DarkMenu();
		contextMenuStrip.Items.Add("预览这套", null, async delegate
		{
			await ChoosePalette(p);
		});
		contextMenuStrip.Items.Add("★ 存为我的皮肤", null, async delegate
		{
			await ChoosePalette(p);
			if (currentPalette != null && currentPalette.Key == p.Key)
			{
				await RunBusy(SaveMine);
			}
			else
			{
				Log("WARN: 「" + p.Name + "」还没选上，没能存为我的皮肤。");
			}
		});
		if (p.Url.StartsWith("https://dreamskin.cc/"))
		{
			contextMenuStrip.Items.Add("在 dreamskin.cc 查看", null, delegate
			{
				try
				{
					Process.Start(p.Url);
				}
				catch
				{
				}
			});
		}
		if (p.Downloaded)
		{
			contextMenuStrip.Items.Add(new ToolStripSeparator());
			ToolStripItem toolStripItem = contextMenuStrip.Items.Add("从本机移除", null, async delegate
			{
				if (MessageBox.Show(this, "从本机移除「" + p.Name + "」？（不影响正在使用的皮肤，主题库里随时能再下载）", "移除主题", MessageBoxButtons.YesNo, MessageBoxIcon.Exclamation) == DialogResult.Yes)
				{
					await RunBusy(async delegate
					{
						string key = p.Key;
						await RunSkinCmd("gallery-remove --id " + Q(key), null);
						foreach (PaletteInfo galleryItem in galleryItems)
						{
							if (galleryItem.Key == key)
							{
								galleryItem.Downloaded = false;
							}
						}
						FilterPalettes();
					});
				}
			});
			toolStripItem.ForeColor = Theme.Red;
		}
		contextMenuStrip.Show(at, pt);
	}

	private void ScheduleLive()
	{
		if (live != null && live.Ready)
		{
			liveTimer.Stop();
			liveTimer.Start();
			dirty = true;
			if (currentPalette != null)
			{
				SetLiveLabel(on: true, "● 预览中 · 未保存", Theme.Gold);
			}
		}
	}

	private void MarkSaved()
	{
		savedKey = ((currentPalette != null) ? currentPalette.Key : "");
		foreach (ThemeTile tile in tiles)
		{
			bool flag = savedKey.Length > 0 && tile.Palette.Key == savedKey;
			if (tile.Saved != flag)
			{
				tile.Saved = flag;
				tile.Invalidate();
			}
		}
		if (live != null && live.Ready)
		{
			SetLiveLabel(on: true, "● 已保存 · 实时预览已连接 " + AppShort);
		}
	}

	private Dictionary<string, object> CurrentChoice(string op)
	{
		Dictionary<string, object> dictionary = new Dictionary<string, object>();
		dictionary["op"] = op;
		dictionary["preset"] = ((currentPalette != null) ? currentPalette.Key : "ink-gold");
		dictionary["image"] = wallpaperPath;
		dictionary["values"] = new Dictionary<string, object>(touched);
		return dictionary;
	}

	private void PushLive()
	{
		if (live != null && live.Ready && currentPalette != null)
		{
			live.Send(CurrentChoice("set"));
		}
	}

	private void StartLive()
	{
		if (cherryDir == null)
		{
			return;
		}
		StopLive();
		live = new LiveSession();
		live.Message += delegate(Dictionary<string, object> m)
		{
			try
			{
				BeginInvoke((Action)delegate
				{
					OnLiveMessage(m);
				});
			}
			catch
			{
			}
		};
		try
		{
			live.Start(ResolveNode(), Path.Combine(cherryDir, "skin-cherry.mjs"), NodePathDir(), app);
		}
		catch (Exception ex)
		{
			Log("WARN: 实时预览启动失败：" + ex.Message);
			live = null;
		}
	}

	private void StopLive()
	{
		if (live != null)
		{
			live.Dispose();
			live = null;
		}
		SetLiveLabel(on: false, "● 实时预览未连接");
	}

	private void SetLiveLabel(bool on, string text)
	{
		lblLive.Text = text;
		lblLive.ForeColor = (on ? Theme.Green : Theme.Muted);
	}

	private void SetLiveLabel(bool on, string text, Color color)
	{
		lblLive.Text = text;
		lblLive.ForeColor = color;
	}

	private void OnLiveMessage(Dictionary<string, object> m)
	{
		m.TryGetValue("op", out var value);
		m.TryGetValue("msg", out var value2);
		object value3;
		bool flag = m.TryGetValue("ok", out value3) && value3 is bool && (bool)value3;
		string text = value as string;
		if (text == "hello")
		{
			if (flag)
			{
				SetLiveLabel(on: true, "● 实时预览已连接 " + AppShort);
				Log("实时预览已连接：改动会立即出现在 " + AppName + " 窗口里。");
			}
			else
			{
				SetLiveLabel(on: false, "● 未连接：先点「保存并应用」");
			}
			return;
		}
		if (text == "set" && !flag)
		{
			Log("WARN: 预览失败：" + value2);
			return;
		}
		switch (text)
		{
		case "palette":
		{
			if (!flag)
			{
				Log("FAILED: 壁纸取色失败：" + value2);
				break;
			}
			allPalettes.RemoveAll((PaletteInfo p) => p.Group == "wallpaper");
			List<PaletteInfo> list = new List<PaletteInfo>();
			foreach (object item in (ArrayList)m["palettes"])
			{
				list.Add(PaletteInfo.From((Dictionary<string, object>)item));
			}
			allPalettes.InsertRange(0, list);
			if (list.Count > 0)
			{
				currentPalette = list[0];
			}
			if (chips.Selected != 4)
			{
				chips.Selected = 4;
			}
			else
			{
				FilterPalettes();
			}
			SyncSettingControls();
			ScheduleLive();
			Log("SUCCESS: 从壁纸取出 " + list.Count + " 套配色（Material You 算法）：" + string.Join("、", list.Select((PaletteInfo x) => x.Name).ToArray()) + "。");
			break;
		}
		case "commit":
		{
			Log(flag ? string.Concat("SUCCESS: ", value2, "。以后用梦境换肤启动 ", AppName, " 都是这套。") : ("FAILED: 保存失败：" + value2));
			if (flag)
			{
				dirty = false;
				MarkSaved();
			}
			TaskCompletionSource<bool> taskCompletionSource = pendingCommit;
			pendingCommit = null;
			taskCompletionSource?.TrySetResult(flag);
			break;
		}
		case "cancel":
			Log("已撤销预览，" + AppShort + " 回到已保存的皮肤。");
			dirty = false;
			RestoreLastChoice();
			FilterPalettes();
			SetLiveLabel(on: true, "● 实时预览已连接 " + AppShort);
			break;
		}
	}

	private void ExtractWallpaperPalettes()
	{
		if (wallpaperPath.Length == 0)
		{
			Log("WARN: 先选一张壁纸，再点「从壁纸取色」。");
		}
		else if (live == null || !live.Ready)
		{
			Log("WARN: 取色要借用 " + AppShort + " 窗口解码图片，请先点「保存并应用」启动带皮肤的 " + AppShort + "。");
		}
		else
		{
			Log("正在从壁纸取色…");
			Dictionary<string, object> dictionary = new Dictionary<string, object>();
			dictionary["op"] = "palette";
			dictionary["image"] = wallpaperPath;
			live.Send(dictionary);
		}
	}

	private async Task SaveCherry()
	{
		if (currentPalette == null)
		{
			Log("WARN: 先选一套配色。");
			return;
		}
		if (live != null && live.Ready)
		{
			liveTimer.Stop();
			PushLive();
			TaskCompletionSource<bool> wait = (pendingCommit = new TaskCompletionSource<bool>());
			live.Send(new Dictionary<string, object> { { "op", "commit" } });
			if (await Task.WhenAny(wait.Task, Task.Delay(15000)) != wait.Task)
			{
				Log("UNCERTAIN: 保存没有回应，看一眼 " + AppShort + " 窗口。");
			}
			else if (wait.Task.Result)
			{
				await CheckSkin();
				await SyncOther();
			}
			return;
		}
		StringBuilder args = new StringBuilder("--preset " + Q(currentPalette.Key));
		if (wallpaperPath.Length > 0 && File.Exists(wallpaperPath))
		{
			args.Append(" --image " + Q(wallpaperPath));
		}
		foreach (KeyValuePair<string, object> item in touched)
		{
			string text = ((item.Value is bool) ? (((bool)item.Value) ? "true" : "false") : Convert.ToString(item.Value, CultureInfo.InvariantCulture));
			args.Append(" --set " + Q(item.Key + "=" + text));
		}
		Log("应用到 " + AppName + "：[" + currentPalette.Name + "]" + ((wallpaperPath.Length > 0) ? " + 壁纸" : "") + " …");
		if (await RunCherry("apply", args.ToString()) == 0)
		{
			dirty = false;
			MarkSaved();
			await CheckSkin();
			await SyncOther();
		}
	}

	private Task CheckSkin()
	{
		return CheckSkin(app, startup: false);
	}

	private async Task CheckSkin(string which, bool startup)
	{
		if (cherryDir == null)
		{
			return;
		}
		string name = DisplayNameOf(which);
		ProcResult r = await RunProcess(ResolveNode(), Q(Path.Combine(cherryDir, "skin-cherry.mjs")) + " check --app " + which, 30000);
		try
		{
			Dictionary<string, object> dictionary = JsonSer.Deserialize<Dictionary<string, object>>(FirstJsonLine(r.Output));
			object value;
			bool flag = dictionary.TryGetValue("ok", out value) && value is bool && (bool)value;
			object value2;
			Dictionary<string, object> dictionary2 = (dictionary.TryGetValue("info", out value2) ? (value2 as Dictionary<string, object>) : null);
			object value3;
			bool flag2 = dictionary2 != null && dictionary2.TryGetValue("versionChanged", out value3) && value3 is bool && (bool)value3;
			object value4;
			string text = ((dictionary2 != null && dictionary2.TryGetValue("version", out value4) && value4 != null) ? value4.ToString() : "");
			object value5;
			string text2 = ((dictionary2 != null && dictionary2.TryGetValue("lastOkVersion", out value5) && value5 != null) ? value5.ToString() : "");
			if (dictionary.TryGetValue("conflict", out object cv) && cv is Dictionary<string, object> cd)
			{
				MaybeNotifyConflict(which, cd);
			}
			if (flag)
			{
				if (flag2)
				{
					Log("SUCCESS: " + name + " 已从 " + text2 + " 更新到 " + text + "，皮肤体检通过。");
				}
			}
			else
			{
				if (!dictionary.TryGetValue("problems", out var value6))
				{
					return;
				}
				{
					foreach (object item in AsList(value6))
					{
						Log("WARN: " + (startup ? (name + " 自检：") : "体检：") + item);
					}
					return;
				}
			}
		}
		catch
		{
		}
	}

	private async Task StartupCheck()
	{
		if (cherrySkinActive)
		{
			await CheckSkin("cherry", startup: true);
		}
		if (zcodeSkinActive)
		{
			await CheckSkin("zcode", startup: true);
		}
	}

	// U-2：保存后把当前应用的皮肤同步到「同步到…」勾选的全部目标（入口 sync --to 多目标扇出）。
	// 每个目标独立成败、逐个在日志里报告；某个目标没成功不影响其他目标，也不用重存。
	private async Task SyncOther()
	{
		if (cherryDir == null)
		{
			return;
		}
		List<string> installed = appRowsData.FindAll((AppRow r) => r.Installed).ConvertAll((AppRow r) => r.Id);
		List<string> targets = SyncTargetsLogic.ResolveTargets(syncTargets, app, installed);
		if (targets.Count == 0)
		{
			return;
		}
		string script = Q(Path.Combine(cherryDir, "skin-cherry.mjs"));
		ProcResult r = await RunProcess(ResolveNode(), script + " sync --from " + app + " --to " + string.Join(",", targets), 300000);
		ReportSyncResults(r.Output);
		await RefreshStatus();
	}

	private void ReportSyncResults(string output)
	{
		Dictionary<string, object> sum = null;
		foreach (string raw in (output ?? "").Split('\n'))
		{
			string line = raw.Trim();
			if (line.Contains("\"syncMulti\""))
			{
				try
				{
					sum = JsonSer.DeserializeObject(line) as Dictionary<string, object>;
				}
				catch
				{
				}
			}
		}
		if (sum == null || !sum.TryGetValue("results", out object ro))
		{
			Log("WARN: 多端同步没拿到逐项结果，原始输出如下：");
			if (!string.IsNullOrWhiteSpace(output))
			{
				Log(output.Trim());
			}
			return;
		}
		List<object> results = AsList(ro);
		foreach (object item in results)
		{
			if (!(item is Dictionary<string, object> d))
			{
				continue;
			}
			string id = StrOf(d, "app");
			bool ok = BoolOf(d, "ok");
			string msg = StrOf(d, "msg");
			bool skipped = BoolOf(d, "skipped");
			string name = id;
			AppRow row = appRowsData.Find((AppRow x) => x.Id == id);
			if (row != null && row.Name.Length > 0)
			{
				name = row.Name;
			}
			if (skipped)
			{
				continue;
			}
			Log(ok ? ("SUCCESS: 已同步到 " + name + "。") : ("WARN: 同步到 " + name + " 没成功：" + msg));
		}
	}

	private void LoadSyncTargets()
	{
		try
		{
			string text = File.Exists(SyncTargetsFile) ? File.ReadAllText(SyncTargetsFile) : null;
			syncTargets.Clear();
			syncTargets.AddRange(SyncTargetsLogic.LoadSelection(text, File.Exists(SyncOffFile)));
		}
		catch
		{
		}
	}

	private void SaveSyncTargets()
	{
		try
		{
			Directory.CreateDirectory(dataRoot);
			File.WriteAllText(SyncTargetsFile, SyncTargetsLogic.SaveSelection(syncTargets));
			File.Delete(SyncOffFile);
		}
		catch
		{
		}
	}

	private void UpdateSyncButtonText()
	{
		if (syncMenuButton == null)
		{
			return;
		}
		List<string> installed = appRowsData.FindAll((AppRow r) => r.Installed).ConvertAll((AppRow r) => r.Id);
		int n = SyncTargetsLogic.ResolveTargets(syncTargets, app, installed).Count;
		syncMenuButton.Text = (n > 0) ? ("同步到…（" + n + " 个）") : "同步到…";
		syncMenuButton.Invalidate();
	}

	private void OpenSyncMenu()
	{
		ContextMenuStrip menu = DarkMenu();
		ToolStripMenuItem header = new ToolStripMenuItem("保存后同步到（可多选）：")
		{
			Enabled = false
		};
		menu.Items.Add(header);
		List<AppRow> pool = appRowsData;
		if (pool.Count == 0)
		{
			pool = new List<AppRow>
			{
				new AppRow { Id = "cherry", Name = "Cherry Studio", Installed = true },
				new AppRow { Id = "zcode", Name = "ZCode", Installed = true }
			};
		}
		int added = 0;
		foreach (AppRow row in pool)
		{
			if (row.Id == app || !row.Installed)
			{
				continue;
			}
			AppRow captured = row;
			ToolStripMenuItem item = new ToolStripMenuItem(row.Name)
			{
				CheckOnClick = true,
				Checked = syncTargets.Contains(row.Id)
			};
			item.CheckedChanged += delegate
			{
				if (item.Checked && !syncTargets.Contains(captured.Id))
				{
					syncTargets.Add(captured.Id);
				}
				if (!item.Checked)
				{
					syncTargets.Remove(captured.Id);
				}
				SaveSyncTargets();
				UpdateSyncButtonText();
				Log(item.Checked ? ("同步目标已加上 " + captured.Name + "：以后保存皮肤会一并同步过去。") : ("同步目标已去掉 " + captured.Name + "。"));
			};
			menu.Items.Add(item);
			added++;
		}
		if (added == 0)
		{
			menu.Items.Add(new ToolStripMenuItem("（暂无其他已安装应用）")
			{
				Enabled = false
			});
		}
		menu.Show(syncMenuButton, new Point(0, syncMenuButton.Height));
	}

	private Task CancelPreview()
	{
		if (live != null && live.Ready)
		{
			live.Send(new Dictionary<string, object> { { "op", "cancel" } });
		}
		else
		{
			Log("实时预览没有连接，没有要撤销的内容。");
		}
		return Task.FromResult(0);
	}

	private static ContextMenuStrip DarkMenu()
	{
		ContextMenuStrip contextMenuStrip = new ContextMenuStrip();
		contextMenuStrip.BackColor = Theme.Card;
		contextMenuStrip.ForeColor = Theme.Text;
		contextMenuStrip.ShowImageMargin = false;
		contextMenuStrip.Font = Theme.F(9.5f);
		ContextMenuStrip contextMenuStrip2 = contextMenuStrip;
		contextMenuStrip2.Renderer = new ToolStripProfessionalRenderer(new DarkMenuColors());
		return contextMenuStrip2;
	}

	private void ShowMineMenu(PaletteInfo p, Control at, Point pt)
	{
		ContextMenuStrip contextMenuStrip = DarkMenu();
		contextMenuStrip.Items.Add("应用这套", null, delegate
		{
			SelectPalette(p);
		});
		contextMenuStrip.Items.Add("重命名…", null, async delegate
		{
			string name = AskName("重命名皮肤", p.Name, null);
			if (name != null)
			{
				await RunBusy(() => RunSkinCmd("skin-rename --id " + Q(p.Key) + " --name " + Q(name), p.Key));
			}
		});
		contextMenuStrip.Items.Add("用当前设置覆盖", null, async delegate
		{
			if (MessageBox.Show(this, "用当前的主题、参数和壁纸覆盖「" + p.Name + "」吗？", "覆盖皮肤", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
			{
				await RunBusy(() => SaveMineAs(p.Name, p.Key));
			}
		});
		contextMenuStrip.Items.Add("导出为文件…", null, async delegate
		{
			SaveFileDialog sfd = new SaveFileDialog
			{
				Title = "导出皮肤",
				Filter = "梦境换肤皮肤 (*.dsskin)|*.dsskin",
				FileName = SafeFileName(p.Name) + ".dsskin"
			};
			try
			{
				if (sfd.ShowDialog(this) == DialogResult.OK)
				{
					await RunBusy(() => RunSkinCmd("skin-export --id " + Q(p.Key) + " --out " + Q(sfd.FileName), null));
				}
			}
			finally
			{
				if (sfd != null)
				{
					((IDisposable)sfd).Dispose();
				}
			}
		});
		contextMenuStrip.Items.Add(new ToolStripSeparator());
		ToolStripItem toolStripItem = contextMenuStrip.Items.Add("删除", null, async delegate
		{
			if (MessageBox.Show(this, "删除「" + p.Name + "」？（不影响正在使用的皮肤）", "删除皮肤", MessageBoxButtons.YesNo, MessageBoxIcon.Exclamation) == DialogResult.Yes)
			{
				await RunBusy(() => RunSkinCmd("skin-delete --id " + Q(p.Key), null));
			}
		});
		toolStripItem.ForeColor = Theme.Red;
		contextMenuStrip.Show(at, pt);
	}

	private static string SafeFileName(string s)
	{
		char[] invalidFileNameChars = Path.GetInvalidFileNameChars();
		foreach (char oldChar in invalidFileNameChars)
		{
			s = s.Replace(oldChar, '_');
		}
		return (s.Length > 0) ? s : "skin";
	}

	private Dictionary<string, object> EffectiveValues()
	{
		Dictionary<string, object> dictionary = new Dictionary<string, object>();
		foreach (SettingDef settingDef in settingDefs)
		{
			if (!(settingDef.Type == "heading"))
			{
				object obj = ValueOf(settingDef.Id);
				if (obj != null)
				{
					dictionary[settingDef.Id] = obj;
				}
			}
		}
		return dictionary;
	}

	private async Task SaveMine()
	{
		if (currentPalette == null)
		{
			Log("WARN: 先选一套主题。");
			return;
		}
		bool isMine = currentPalette.Group == "mine";
		string suggest = (isMine ? currentPalette.Name : ("我的" + currentPalette.Name));
		bool overwrite;
		string name = AskName("存为我的皮肤", suggest, isMine ? currentPalette.Name : null, out overwrite);
		if (name != null)
		{
			await SaveMineAs(name, overwrite ? currentPalette.Key : "");
		}
	}

	private async Task SaveMineAs(string name, string overwriteKey)
	{
		Dictionary<string, object> m = new Dictionary<string, object>
		{
			["name"] = name,
			["preset"] = currentPalette.Key,
			["values"] = EffectiveValues(),
			["image"] = wallpaperPath
		};
		if (!string.IsNullOrEmpty(overwriteKey))
		{
			m["overwrite"] = overwriteKey;
		}
		if (currentPalette.Group == "mine" && currentPalette.Key.StartsWith("my-"))
		{
		}
		string tmp = Path.Combine(Path.GetTempPath(), "dreamskin-save-" + Guid.NewGuid().ToString("N") + ".json");
		File.WriteAllText(tmp, JsonSer.Serialize(m), new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
		try
		{
			await RunSkinCmd("skin-save --file " + Q(tmp), "@saved");
		}
		finally
		{
			try
			{
				File.Delete(tmp);
			}
			catch
			{
			}
		}
	}

	private async Task ImportMine()
	{
		OpenFileDialog openFileDialog = new OpenFileDialog();
		openFileDialog.Title = "导入皮肤";
		openFileDialog.Filter = "梦境换肤皮肤 (*.dsskin)|*.dsskin|所有文件|*.*";
		string file;
		using (OpenFileDialog openFileDialog2 = openFileDialog)
		{
			if (openFileDialog2.ShowDialog(this) != DialogResult.OK)
			{
				return;
			}
			file = openFileDialog2.FileName;
		}
		await RunSkinCmd("skin-import --file " + Q(file), "@saved");
	}

	private async Task RunSkinCmd(string args, string select)
	{
		if (cherryDir == null)
		{
			return;
		}
		ProcResult r = await RunProcess(ResolveNode(), Q(Path.Combine(cherryDir, "skin-cherry.mjs")) + " " + args, 60000);
		Dictionary<string, object> res = null;
		try
		{
			res = JsonSer.Deserialize<Dictionary<string, object>>(FirstJsonLine(r.Output));
		}
		catch
		{
		}
		if (res == null || !res.TryGetValue("ok", out var ok) || !(ok is bool) || !(bool)ok)
		{
			object msg;
			if (res != null)
			{
				res.TryGetValue("msg", out msg);
			}
			else
			{
				msg = r.Output;
			}
			Log("FAILED: " + msg);
			return;
		}
		string key = select;
		object file;
		if (res.TryGetValue("skin", out var skin) && skin is Dictionary<string, object>)
		{
			Dictionary<string, object> dictionary = (Dictionary<string, object>)skin;
			if (select == "@saved")
			{
				key = Convert.ToString(dictionary["key"]);
			}
			Log(string.Concat("SUCCESS: 我的皮肤「", dictionary["name"], "」已保存。右键卡片可以改名、覆盖、导出、删除。"));
		}
		else if (res.TryGetValue("file", out file))
		{
			Log(string.Concat("SUCCESS: 已导出到 ", file, "，发给别人用「更多 → 导入皮肤文件」即可。"));
		}
		else if (res.ContainsKey("deleted"))
		{
			Log("SUCCESS: 已删除。");
		}
		await ReloadPalettes(key);
	}

	private async Task ReloadPalettes(string selectKey)
	{
		ProcResult pr = await RunProcess(ResolveNode(), Q(Path.Combine(cherryDir, "skin-cherry.mjs")) + " presets", 30000);
		try
		{
			Dictionary<string, object> dictionary = JsonSer.Deserialize<Dictionary<string, object>>(FirstJsonLine(pr.Output));
			string keep = ((currentPalette != null) ? currentPalette.Key : "");
			allPalettes.Clear();
			foreach (object item in (ArrayList)dictionary["palettes"])
			{
				allPalettes.Add(PaletteInfo.From((Dictionary<string, object>)item));
			}
			PaletteInfo paletteInfo = ((selectKey != null) ? allPalettes.Find((PaletteInfo x) => x.Key == selectKey) : null);
			if (paletteInfo != null)
			{
				if (chips.Selected != 1)
				{
					chips.Selected = 1;
				}
				currentPalette = paletteInfo;
			}
			else
			{
				currentPalette = allPalettes.Find((PaletteInfo x) => x.Key == keep) ?? ((allPalettes.Count > 0) ? allPalettes[0] : null);
			}
			FilterPalettes();
			if (paletteInfo != null)
			{
				SelectPalette(paletteInfo);
			}
		}
		catch (Exception ex)
		{
			Log("ERROR: 重新读取主题失败：" + ex.Message);
		}
	}

	private string AskName(string title, string initial, string overwriteName)
	{
		bool overwrite;
		return AskName(title, initial, overwriteName, out overwrite);
	}

	private string AskName(string title, string initial, string overwriteName, out bool overwrite)
	{
		overwrite = false;
		Form f = new Form();
		try
		{
			f.Text = title;
			f.FormBorderStyle = FormBorderStyle.FixedDialog;
			f.MaximizeBox = false;
			f.MinimizeBox = false;
			f.StartPosition = FormStartPosition.CenterParent;
			f.BackColor = Theme.Bg;
			f.ForeColor = Theme.Text;
			f.Font = Theme.F(9.5f);
			f.ClientSize = new Size(420, (overwriteName != null) ? 190 : 150);
			f.ShowInTaskbar = false;
			f.Controls.Add(new Label
			{
				Text = "名字",
				AutoSize = true,
				Location = new Point(20, 18),
				ForeColor = Theme.Muted
			});
			TextBox tb = new TextBox
			{
				Text = initial,
				Location = new Point(20, 42),
				Width = 380,
				BackColor = Theme.Card,
				ForeColor = Theme.Text,
				BorderStyle = BorderStyle.FixedSingle,
				Font = Theme.F(11f),
				MaxLength = 40
			};
			f.Controls.Add(tb);
			string result = null;
			bool ow = false;
			int num = 92;
			if (overwriteName != null)
			{
				FlatButton flatButton = new FlatButton("覆盖「" + overwriteName + "」", Theme.Gold, Color.FromArgb(25, 20, 10));
				flatButton.Bounds = new Rectangle(20, num, 185, 38);
				FlatButton flatButton2 = flatButton;
				flatButton2.Font = Theme.F(9.5f, FontStyle.Bold);
				flatButton2.Click += delegate
				{
					result = tb.Text.Trim();
					ow = true;
					f.Close();
				};
				FlatButton flatButton3 = new FlatButton("另存为新皮肤", Theme.CardHover, Theme.Text);
				flatButton3.Bounds = new Rectangle(215, num, 185, 38);
				FlatButton flatButton4 = flatButton3;
				flatButton4.Font = Theme.F(9.5f);
				flatButton4.Click += delegate
				{
					result = tb.Text.Trim();
					f.Close();
				};
				f.Controls.Add(flatButton2);
				f.Controls.Add(flatButton4);
				num += 46;
			}
			else
			{
				FlatButton flatButton5 = new FlatButton("保存", Theme.Gold, Color.FromArgb(25, 20, 10));
				flatButton5.Bounds = new Rectangle(20, num, 185, 38);
				FlatButton flatButton6 = flatButton5;
				flatButton6.Font = Theme.F(9.5f, FontStyle.Bold);
				flatButton6.Click += delegate
				{
					result = tb.Text.Trim();
					f.Close();
				};
				f.Controls.Add(flatButton6);
				f.AcceptButton = flatButton6;
			}
			FlatButton flatButton7 = new FlatButton("取消", Theme.CardHover, Theme.Muted);
			flatButton7.Bounds = new Rectangle((overwriteName != null) ? 20 : 215, num, (overwriteName != null) ? 380 : 185, 34);
			FlatButton flatButton8 = flatButton7;
			flatButton8.Font = Theme.F(9f);
			flatButton8.Click += delegate
			{
				result = null;
				f.Close();
			};
			f.Controls.Add(flatButton8);
			f.CancelButton = flatButton8;
			f.Shown += delegate
			{
				tb.Focus();
				tb.SelectAll();
			};
			f.ShowDialog(this);
			overwrite = ow;
			return string.IsNullOrEmpty(result) ? null : result;
		}
		finally
		{
			if (f != null)
			{
				((IDisposable)f).Dispose();
			}
		}
	}

	internal static string ShortcutPath(string appName)
	{
		return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), appName + " (梦境换肤).lnk");
	}

	internal static string CreateLaunchShortcut(string app, string appName, string iconExe)
	{
		string text = ShortcutPath(appName);
		Type typeFromProgID = Type.GetTypeFromProgID("WScript.Shell");
		object target = Activator.CreateInstance(typeFromProgID);
		object obj = typeFromProgID.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, target, new object[1] { text });
		Type type = obj.GetType();
		string executablePath = Application.ExecutablePath;
		type.InvokeMember("TargetPath", BindingFlags.SetProperty, null, obj, new object[1] { executablePath });
		type.InvokeMember("Arguments", BindingFlags.SetProperty, null, obj, new object[1] { "--launch " + app });
		type.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, obj, new object[1] { Path.GetDirectoryName(executablePath) });
		type.InvokeMember("Description", BindingFlags.SetProperty, null, obj, new object[1] { "用梦境换肤的皮肤启动 " + appName });
		string text2 = null;
		try
		{
			if (!string.IsNullOrEmpty(iconExe) && File.Exists(iconExe))
			{
				text2 = BuildBadgeIcon(iconExe, app);
			}
		}
		catch
		{
		}
		if (text2 == null)
		{
			text2 = ((!string.IsNullOrEmpty(iconExe) && File.Exists(iconExe)) ? iconExe : executablePath) + ",0";
		}
		type.InvokeMember("IconLocation", BindingFlags.SetProperty, null, obj, new object[1] { text2 });
		type.InvokeMember("Save", BindingFlags.InvokeMethod, null, obj, null);
		return text;
	}

	[DllImport("shell32.dll", CharSet = CharSet.Unicode)]
	private static extern int SHDefExtractIcon(string file, int index, uint flags, out IntPtr large, out IntPtr small, uint size);

	[DllImport("user32.dll")]
	private static extern bool DestroyIcon(IntPtr h);

	internal static string BuildBadgeIcon(string appExe, string app)
	{
		if (SHDefExtractIcon(appExe, 0, 0u, out var large, out var small, 1048832u) != 0 || large == IntPtr.Zero)
		{
			return null;
		}
		Bitmap bitmap;
		try
		{
			using Icon icon = Icon.FromHandle(large);
			bitmap = new Bitmap(icon.ToBitmap());
		}
		finally
		{
			DestroyIcon(large);
			if (small != IntPtr.Zero)
			{
				DestroyIcon(small);
			}
		}
		Bitmap bitmap2 = LoadOwnIcon256();
		using (bitmap)
		{
			using Bitmap bitmap3 = new Bitmap(256, 256, PixelFormat.Format32bppArgb);
			using (Graphics graphics = Graphics.FromImage(bitmap3))
			{
				graphics.SmoothingMode = SmoothingMode.AntiAlias;
				graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
				graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
				graphics.CompositingQuality = CompositingQuality.HighQuality;
				graphics.Clear(Color.Transparent);
				graphics.DrawImage(bitmap, new Rectangle(0, 0, 228, 228));
				if (bitmap2 != null)
				{
					int num = 130;
					int num2 = 130;
					for (int num3 = 6; num3 >= 1; num3--)
					{
						using GraphicsPath path = Rounded(new RectangleF(num - 6 - num3, num2 - 3 - num3 + 4, 136 + 2 * num3, 136 + 2 * num3), 36 + num3);
						using SolidBrush brush = new SolidBrush(Color.FromArgb(14, 0, 0, 0));
						graphics.FillPath(brush, path);
					}
					using (GraphicsPath path = Rounded(new RectangleF(num - 6, num2 - 6, 136f, 136f), 36f))
					{
						graphics.FillPath(Brushes.White, path);
					}
					using (GraphicsPath path = Rounded(new RectangleF(num, num2, 124f, 124f), 30f))
					{
						graphics.SetClip(path);
						float num4 = 136.40001f;
						float num5 = 6.2000003f;
						graphics.DrawImage(bitmap2, new RectangleF((float)num - num5, (float)num2 - num5, num4, num4));
						graphics.ResetClip();
					}
					bitmap2.Dispose();
				}
			}
			string text = Path.Combine(DataRootPath, "icons");
			Directory.CreateDirectory(text);
			string text2 = Path.Combine(text, app + ".ico");
			WriteIco(bitmap3, text2, new int[5] { 256, 48, 32, 24, 16 });
			return text2;
		}
	}

	private static GraphicsPath Rounded(RectangleF rc, float r)
	{
		float num = r * 2f;
		GraphicsPath graphicsPath = new GraphicsPath();
		graphicsPath.AddArc(rc.X, rc.Y, num, num, 180f, 90f);
		graphicsPath.AddArc(rc.Right - num, rc.Y, num, num, 270f, 90f);
		graphicsPath.AddArc(rc.Right - num, rc.Bottom - num, num, num, 0f, 90f);
		graphicsPath.AddArc(rc.X, rc.Bottom - num, num, num, 90f, 90f);
		graphicsPath.CloseFigure();
		return graphicsPath;
	}

	private static Bitmap LoadOwnIcon256()
	{
		using Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("DreamSkin.app.ico");
		if (stream == null)
		{
			return null;
		}
		byte[] array;
		using (MemoryStream memoryStream = new MemoryStream())
		{
			stream.CopyTo(memoryStream);
			array = memoryStream.ToArray();
		}
		int num = BitConverter.ToUInt16(array, 4);
		int num2 = -1;
		int num3 = 0;
		for (int i = 0; i < num; i++)
		{
			int num4 = ((array[6 + 16 * i] == 0) ? 256 : array[6 + 16 * i]);
			if (num4 > num3)
			{
				num3 = num4;
				num2 = i;
			}
		}
		if (num2 < 0)
		{
			return null;
		}
		int count = BitConverter.ToInt32(array, 6 + 16 * num2 + 8);
		int num5 = BitConverter.ToInt32(array, 6 + 16 * num2 + 12);
		if (array[num5] != 137)
		{
			return null;
		}
		using MemoryStream memoryStream2 = new MemoryStream(array, num5, count); // 反编译重建修正：原名 memoryStream 与上方同名局部冲突（CS0136），改名，逻辑不变
		return new Bitmap(new Bitmap(memoryStream2));
	}

	private static void WriteIco(Bitmap src, string path, int[] sizes)
	{
		byte[][] array = new byte[sizes.Length][];
		for (int i = 0; i < sizes.Length; i++)
		{
			using Bitmap bitmap = new Bitmap(sizes[i], sizes[i], PixelFormat.Format32bppArgb);
			using (Graphics graphics = Graphics.FromImage(bitmap))
			{
				graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
				graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
				graphics.Clear(Color.Transparent);
				graphics.DrawImage(src, new Rectangle(0, 0, sizes[i], sizes[i]));
			}
			using MemoryStream memoryStream = new MemoryStream();
			bitmap.Save(memoryStream, ImageFormat.Png);
			array[i] = memoryStream.ToArray();
		}
		using FileStream output = new FileStream(path, FileMode.Create);
		using BinaryWriter binaryWriter = new BinaryWriter(output);
		binaryWriter.Write((ushort)0);
		binaryWriter.Write((ushort)1);
		binaryWriter.Write((ushort)sizes.Length);
		int num = 6 + 16 * sizes.Length;
		for (int i = 0; i < sizes.Length; i++)
		{
			binaryWriter.Write((byte)((sizes[i] < 256) ? ((uint)sizes[i]) : 0u));
			binaryWriter.Write((byte)((sizes[i] < 256) ? ((uint)sizes[i]) : 0u));
			binaryWriter.Write((byte)0);
			binaryWriter.Write((byte)0);
			binaryWriter.Write((ushort)1);
			binaryWriter.Write((ushort)32);
			binaryWriter.Write(array[i].Length);
			binaryWriter.Write(num);
			num += array[i].Length;
		}
		byte[][] array2 = array;
		foreach (byte[] buffer in array2)
		{
			binaryWriter.Write(buffer);
		}
	}

	internal static int HeadlessLaunch(string app)
	{
		app = ((app == "zcode") ? "zcode" : "cherry");
		string appName = ((app == "zcode") ? "ZCode" : "Cherry Studio");
		bool createdNew;
		using (new Mutex(initiallyOwned: true, "Local\\DreamSkin.Launch." + app, out createdNew))
		{
			if (!createdNew)
			{
				return 0;
			}
			Form tip = new Form
			{
				FormBorderStyle = FormBorderStyle.None,
				StartPosition = FormStartPosition.CenterScreen,
				TopMost = true,
				ShowInTaskbar = true,
				Size = new Size(340, 76),
				BackColor = Theme.Nav,
				Text = "梦境换肤"
			};
			try
			{
				using Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("DreamSkin.app.ico");
				if (stream != null)
				{
					tip.Icon = new Icon(stream);
				}
			}
			catch
			{
			}
			Label label = new Label();
			label.Dock = DockStyle.Fill;
			label.TextAlign = ContentAlignment.MiddleCenter;
			label.ForeColor = Theme.Gold;
			label.Font = Theme.F(11f);
			label.Text = "正在换肤 " + appName + "…";
			Label value = label;
			tip.Controls.Add(value);
			int code = 0;
			string failMsg = null;
			tip.Shown += delegate
			{
				Thread thread = new Thread((ThreadStart)delegate
				{
					try
					{
						code = LaunchCore(app, appName, out failMsg);
					}
					catch (Exception ex)
					{
						code = 1;
						failMsg = ex.Message;
					}
					try
					{
						tip.BeginInvoke(new Action(tip.Close));
					}
					catch
					{
					}
				});
				thread.IsBackground = true;
				thread.Start();
			};
			Application.Run(tip);
			if (!string.IsNullOrEmpty(failMsg))
			{
				Fail(appName, failMsg);
			}
			return code;
		}
	}

	private static int LaunchCore(string app, string appName, out string failMsg)
	{
		failMsg = null;
		string dataRootPath = DataRootPath;
		string text;
		try
		{
			text = FindAppRoot(dataRootPath, null, out var _);
		}
		catch (Exception ex)
		{
			text = null;
			string source = ex.Message;
		}
		if (text == null)
		{
			failMsg = "找不到换肤脚本。请重新下载梦境换肤。";
			return 1;
		}
		string text2 = ResolveNodePath(text, dataRootPath);
		string text3 = Path.Combine(text, "src", "cherry", "skin-cherry.mjs");
		ProcessStartInfo processStartInfo = new ProcessStartInfo(text2, "\"" + text3 + "\" launch --restart --app " + app);
		processStartInfo.UseShellExecute = false;
		processStartInfo.CreateNoWindow = true;
		processStartInfo.RedirectStandardOutput = true;
		processStartInfo.RedirectStandardError = true;
		processStartInfo.StandardOutputEncoding = Encoding.UTF8;
		processStartInfo.StandardErrorEncoding = Encoding.UTF8;
		processStartInfo.WorkingDirectory = text;
		ProcessStartInfo startInfo = processStartInfo;
		StringBuilder output = new StringBuilder();
		try
		{
			using Process process = Process.Start(startInfo);
			process.OutputDataReceived += delegate(object s, DataReceivedEventArgs e)
			{
				if (e.Data != null)
				{
					lock (output)
					{
						output.AppendLine(e.Data);
					}
				}
			};
			process.ErrorDataReceived += delegate(object s, DataReceivedEventArgs e)
			{
				if (e.Data != null)
				{
					lock (output)
					{
						output.AppendLine(e.Data);
					}
				}
			};
			process.BeginOutputReadLine();
			process.BeginErrorReadLine();
			if (!process.WaitForExit(180000))
			{
				failMsg = "等了 3 分钟还没完成，请打开梦境换肤看看。";
				return 2;
			}
			process.WaitForExit(500);
			if (process.ExitCode == 0)
			{
				return 0;
			}
			string text4;
			lock (output)
			{
				text4 = output.ToString();
			}
			Match match = Regex.Match(text4, "(?m)^(?:FAILED|UNCERTAIN|ERROR|NEEDS_RESTART):\\s*(.+)$");
			failMsg = (match.Success ? match.Groups[1].Value.Trim() : text4.Trim());
			return process.ExitCode;
		}
		catch (Win32Exception)
		{
			failMsg = "这台电脑还没有 Node.js 22。请先打开梦境换肤，按提示安装一次。";
			return 1;
		}
	}

	private static void Fail(string appName, string msg)
	{
		MessageBox.Show(msg, "梦境换肤 · 启动 " + appName, MessageBoxButtons.OK, MessageBoxIcon.Exclamation);
	}
}
