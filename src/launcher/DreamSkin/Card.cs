using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace DreamSkin;

internal class Card : Panel
{
	public string Title = "";

	public Card()
	{
		BackColor = Theme.Card;
		DoubleBuffered = true;
		base.Padding = new Padding(16, 44, 16, 16);
	}

	protected override void OnPaintBackground(PaintEventArgs e)
	{
		Graphics graphics = e.Graphics;
		graphics.SmoothingMode = SmoothingMode.AntiAlias;
		graphics.Clear((base.Parent != null) ? base.Parent.BackColor : Theme.Bg);
		using GraphicsPath path = Ui.Round(new Rectangle(0, 0, base.Width - 1, base.Height - 1), 12);
		using SolidBrush brush = new SolidBrush(BackColor);
		using Pen pen = new Pen(Color.FromArgb(38, 38, 48));
		graphics.FillPath(brush, path);
		graphics.DrawPath(pen, path);
	}

	protected override void OnPaint(PaintEventArgs e)
	{
		TextRenderer.DrawText(e.Graphics, Title, Theme.F(11f, FontStyle.Bold), new Point(16, 13), Theme.Text);
	}
}
