using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Windows.Forms;

namespace DreamSkin;

internal class ThemeTile : Control
{
	public PaletteInfo Palette;

	public bool Selected;

	public bool Saved;

	private bool hover;

	public ThemeTile()
	{
		SetStyle(ControlStyles.UserPaint | ControlStyles.ResizeRedraw | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, value: true);
		Cursor = Cursors.Hand;
		base.Size = new Size(148, 122);
	}

	private static Color A(Color c, int a)
	{
		return Color.FromArgb(Math.Max(0, Math.Min(255, a)), c);
	}

	protected override void OnMouseEnter(EventArgs e)
	{
		hover = true;
		Invalidate();
		base.OnMouseEnter(e);
	}

	protected override void OnMouseLeave(EventArgs e)
	{
		hover = false;
		Invalidate();
		base.OnMouseLeave(e);
	}

	protected override void OnPaint(PaintEventArgs e)
	{
		Graphics graphics = e.Graphics;
		graphics.SmoothingMode = SmoothingMode.AntiAlias;
		graphics.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
		graphics.Clear((base.Parent != null) ? base.Parent.BackColor : Theme.Card);
		PaletteInfo palette = Palette;
		if (palette == null)
		{
			return;
		}
		Rectangle r = new Rectangle(1, 1, base.Width - 3, base.Height - 3);
		using (GraphicsPath path = Ui.Round(r, 10))
		{
			using SolidBrush brush = new SolidBrush((hover || Selected) ? Color.FromArgb(34, 34, 42) : Color.FromArgb(27, 27, 33));
			graphics.FillPath(brush, path);
		}
		Rectangle rectangle = new Rectangle(7, 7, base.Width - 15, 70);
		using (GraphicsPath clip = Ui.Round(rectangle, 7))
		{
			graphics.SetClip(clip);
			using (SolidBrush brush = new SolidBrush(palette.Bg))
			{
				graphics.FillRectangle(brush, rectangle);
			}
			Bitmap thumb = palette.Thumb;
			if (thumb == null)
			{
				using (GraphicsPath graphicsPath = new GraphicsPath())
				{
					graphicsPath.AddEllipse((float)rectangle.Right - (float)rectangle.Width * 0.55f, (float)rectangle.Y - (float)rectangle.Height * 0.7f, (float)rectangle.Width * 0.9f, (float)rectangle.Height * 1.4f);
					using PathGradientBrush pathGradientBrush = new PathGradientBrush(graphicsPath);
					pathGradientBrush.CenterColor = A(palette.Accent, palette.Dark ? 120 : 90);
					pathGradientBrush.SurroundColors = new Color[1] { A(palette.Accent, 0) };
					graphics.FillPath(pathGradientBrush, graphicsPath);
				}
				goto IL_047e;
			}
			float num = Math.Max((float)rectangle.Width / (float)thumb.Width, (float)rectangle.Height / (float)thumb.Height);
			float num2 = (float)thumb.Width * num;
			float num3 = (float)thumb.Height * num;
			graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
			graphics.DrawImage(thumb, (float)rectangle.X + ((float)rectangle.Width - num2) / 2f, (float)rectangle.Y + ((float)rectangle.Height - num3) / 2f, num2, num3);
			if (!(palette.Group == "gallery"))
			{
				using (SolidBrush brush2 = new SolidBrush(A(palette.Bg, 90)))
				{
					graphics.FillRectangle(brush2, rectangle);
				}
				goto IL_047e;
			}
			Color[] array = new Color[5] { palette.Bg, palette.Panel, palette.Accent, palette.Glow, palette.Text };
			int num4 = rectangle.Right - 6 - array.Length * 11;
			using (GraphicsPath path2 = Ui.Round(new Rectangle(num4 - 4, rectangle.Bottom - 16, array.Length * 11 + 6, 12), 6))
			{
				using SolidBrush brush = new SolidBrush(Color.FromArgb(170, 16, 16, 20));
				graphics.FillPath(brush, path2);
			}
			for (int i = 0; i < array.Length; i++)
			{
				using SolidBrush brush = new SolidBrush(array[i]);
				graphics.FillEllipse(brush, num4 + i * 11, rectangle.Bottom - 14, 8, 8);
			}
			graphics.ResetClip();
			goto end_IL_00fb;
			IL_047e:
			using (GraphicsPath graphicsPath = new GraphicsPath())
			{
				graphicsPath.AddEllipse((float)rectangle.X - (float)rectangle.Width * 0.35f, (float)rectangle.Bottom - (float)rectangle.Height * 0.6f, (float)rectangle.Width * 0.8f, (float)rectangle.Height * 1.2f);
				using PathGradientBrush pathGradientBrush = new PathGradientBrush(graphicsPath);
				pathGradientBrush.CenterColor = A(palette.Glow, palette.Dark ? 100 : 80);
				pathGradientBrush.SurroundColors = new Color[1] { A(palette.Glow, 0) };
				graphics.FillPath(pathGradientBrush, graphicsPath);
			}
			for (int i = 0; i < 4; i++)
			{
				using SolidBrush brush = new SolidBrush(A(palette.Text, (i == 0) ? 200 : 70));
				graphics.FillEllipse(brush, rectangle.X + 5, rectangle.Y + 7 + i * 12, 6, 6);
			}
			Rectangle r2 = new Rectangle(rectangle.X + 16, rectangle.Y + 4, 38, rectangle.Height - 8);
			using (GraphicsPath path3 = Ui.Round(r2, 4))
			{
				using SolidBrush brush = new SolidBrush(A(palette.Panel, 200));
				graphics.FillPath(brush, path3);
			}
			for (int i = 0; i < 4; i++)
			{
				using SolidBrush brush = new SolidBrush((i == 1) ? A(palette.Accent, 110) : A(palette.Text, 34));
				graphics.FillRectangle(brush, r2.X + 4, r2.Y + 6 + i * 13, r2.Width - 8, 7);
			}
			int num5 = r2.Right + 8;
			int num6 = rectangle.Right - num5 - 7;
			using (SolidBrush brush = new SolidBrush(A(palette.Text, 150)))
			{
				graphics.FillRectangle(brush, num5, rectangle.Y + 9, (float)num6 * 0.85f, 3f);
				graphics.FillRectangle(brush, num5, rectangle.Y + 16, (float)num6 * 0.6f, 3f);
			}
			Rectangle r3 = new Rectangle(num5 + num6 / 3, rectangle.Y + 25, num6 * 2 / 3, 13);
			using (GraphicsPath path4 = Ui.Round(r3, 5))
			{
				using SolidBrush brush = new SolidBrush(A(palette.Accent, palette.Dark ? 70 : 55));
				graphics.FillPath(brush, path4);
			}
			Rectangle r4 = new Rectangle(num5 - 2, rectangle.Bottom - 20, num6 + 4, 14);
			using (GraphicsPath path5 = Ui.Round(r4, 6))
			{
				using SolidBrush brush = new SolidBrush(A(palette.Bubble, 220));
				using Pen pen = new Pen(A(palette.Accent, 120));
				graphics.FillPath(brush, path5);
				graphics.DrawPath(pen, path5);
			}
			using (SolidBrush brush = new SolidBrush(palette.Accent))
			{
				graphics.FillEllipse(brush, r4.Right - 12, r4.Y + 3, 8, 8);
			}
			graphics.ResetClip();
			end_IL_00fb:;
		}
		if (Saved)
		{
			Rectangle rectangle2 = new Rectangle(11, 11, 46, 17);
			using (GraphicsPath path6 = Ui.Round(rectangle2, 6))
			{
				using SolidBrush brush = new SolidBrush(Color.FromArgb(225, 46, 160, 90));
				graphics.FillPath(brush, path6);
			}
			TextRenderer.DrawText(graphics, "使用中", Theme.F(7.5f, FontStyle.Bold), rectangle2, Color.White, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
		}
		if (palette.Group == "mine")
		{
			Rectangle rectangle3 = new Rectangle(base.Width - 30, 11, 18, 16);
			using (GraphicsPath path7 = Ui.Round(rectangle3, 5))
			{
				using SolidBrush brush = new SolidBrush(Color.FromArgb(200, 20, 20, 26));
				graphics.FillPath(brush, path7);
			}
			TextRenderer.DrawText(graphics, "★", Theme.F(8f), rectangle3, Theme.Gold, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
		}
		TextRenderer.DrawText(graphics, palette.Name, Theme.F(9.5f, FontStyle.Bold), new Rectangle(9, 80, base.Width - 18, 20), Selected ? Theme.Gold : Theme.Text, TextFormatFlags.EndEllipsis | TextFormatFlags.VerticalCenter);
		string text = ((palette.Desc.Length > 0) ? palette.Desc : palette.Source);
		TextRenderer.DrawText(graphics, text, Theme.F(8f), new Rectangle(9, 99, base.Width - 18, 16), Theme.Muted, TextFormatFlags.EndEllipsis | TextFormatFlags.VerticalCenter);
		if (Selected)
		{
			using (GraphicsPath path = Ui.Round(r, 10))
			{
				using Pen pen = new Pen(Theme.Gold, 2f);
				graphics.DrawPath(pen, path);
				return;
			}
		}
		if (!hover)
		{
			return;
		}
		using GraphicsPath pathEnd = Ui.Round(r, 10); // 反编译重建修正：原名 path 与内层同名冲突（CS0136），改名，逻辑不变
		using Pen penEnd = new Pen(Color.FromArgb(70, 255, 255, 255)); // 同上，原名 pen
		graphics.DrawPath(penEnd, pathEnd);
	}
}
