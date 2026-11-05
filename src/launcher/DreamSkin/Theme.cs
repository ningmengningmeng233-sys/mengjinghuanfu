using System.Drawing;

namespace DreamSkin;

internal static class Theme
{
	public static readonly Color Bg = Color.FromArgb(13, 13, 17);

	public static readonly Color Nav = Color.FromArgb(18, 18, 23);

	public static readonly Color Card = Color.FromArgb(23, 23, 29);

	public static readonly Color CardHover = Color.FromArgb(31, 31, 39);

	public static readonly Color Line = Color.FromArgb(47, 47, 59);

	public static readonly Color Text = Color.FromArgb(236, 236, 242);

	public static readonly Color Muted = Color.FromArgb(158, 158, 172);

	public static readonly Color TextDim = Color.FromArgb(190, 190, 202);

	public static readonly Color Gold = Color.FromArgb(214, 178, 102);

	public static readonly Color Blue = Color.FromArgb(56, 189, 248);

	public static readonly Color Green = Color.FromArgb(74, 222, 128);

	public static readonly Color Red = Color.FromArgb(248, 113, 113);

	public static readonly Color Yellow = Color.FromArgb(250, 204, 21);

	// Status semantics: one palette shared by the nav status dots (AppStatusLogic.DotColor),
	// the nav status labels, the log and the status bar.
	// Not installed = gray, not running = light slate, running = sky blue,
	// skin active / success = green, compat / warning = yellow, error / unknown = red.
	public static readonly Color Off = Color.FromArgb(107, 114, 128);

	public static readonly Color Idle = Color.FromArgb(148, 163, 184);

	public static readonly Color LogBg = Color.FromArgb(10, 10, 13);

	public static Font F(float size, FontStyle style = FontStyle.Regular)
	{
		return new Font("Microsoft YaHei UI", size, style, GraphicsUnit.Point);
	}
}
