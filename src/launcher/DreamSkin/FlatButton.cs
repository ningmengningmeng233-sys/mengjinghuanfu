using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace DreamSkin;

internal class FlatButton : Button
{
	public Color Fill = Theme.Card;

	public Color Fore = Theme.Text;

	public Color Border = Theme.Line;

	private bool hover;

	public FlatButton(string text, Color fill, Color fore)
	{
		Text = text;
		Fill = fill;
		Fore = fore;
		Border = fill;
		base.FlatStyle = FlatStyle.Flat;
		base.FlatAppearance.BorderSize = 0;
		Font = Theme.F(10f, FontStyle.Bold);
		Cursor = Cursors.Hand;
		base.Height = 40;
		SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, value: true);
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
		graphics.Clear((base.Parent != null) ? base.Parent.BackColor : Theme.Bg);
		Color color = ((!base.Enabled) ? Color.FromArgb(40, 40, 48) : (hover ? ControlPaint.Light(Fill, 0.15f) : Fill));
		using (GraphicsPath path = Ui.Round(new Rectangle(0, 0, base.Width - 1, base.Height - 1), 8))
		{
			using SolidBrush brush = new SolidBrush(color);
			using Pen pen = new Pen(base.Enabled ? Border : Theme.Line);
			graphics.FillPath(brush, path);
			graphics.DrawPath(pen, path);
		}
		bool flag = base.Tag as string == "nav";
		Rectangle bounds = (flag ? new Rectangle(18, 0, base.Width - 18, base.Height) : base.ClientRectangle);
		TextRenderer.DrawText(graphics, Text, Font, bounds, base.Enabled ? Fore : Theme.Muted, (TextFormatFlags)(((!flag) ? 1 : 0) | 4));
	}
}
