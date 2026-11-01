using System.Drawing;

namespace DreamSkin;

internal static class Theme
{
	public static readonly Color Bg = Color.FromArgb(14, 14, 18);

	public static readonly Color Nav = Color.FromArgb(19, 19, 24);

	public static readonly Color Card = Color.FromArgb(24, 24, 30);

	public static readonly Color CardHover = Color.FromArgb(32, 32, 40);

	public static readonly Color Line = Color.FromArgb(44, 44, 54);

	public static readonly Color Text = Color.FromArgb(236, 236, 242);

	public static readonly Color Muted = Color.FromArgb(150, 150, 165);

	public static readonly Color Gold = Color.FromArgb(214, 178, 102);

	public static readonly Color Blue = Color.FromArgb(88, 140, 255);

	public static readonly Color Green = Color.FromArgb(92, 200, 140);

	public static readonly Color Red = Color.FromArgb(240, 100, 100);

	public static readonly Color Yellow = Color.FromArgb(240, 196, 90);

	public static Font F(float size, FontStyle style = FontStyle.Regular)
	{
		return new Font("Microsoft YaHei UI", size, style, GraphicsUnit.Point);
	}
}
