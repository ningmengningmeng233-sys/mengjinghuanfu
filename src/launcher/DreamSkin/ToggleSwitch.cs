using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace DreamSkin;

internal class ToggleSwitch : Control
{
	public string Title = "";

	private bool on;

	public Color Accent = Theme.Gold;

	public bool Checked
	{
		get
		{
			return on;
		}
		set
		{
			if (on != value)
			{
				on = value;
				Invalidate();
				this.CheckedChanged?.Invoke(this, EventArgs.Empty);
			}
		}
	}

	public event EventHandler CheckedChanged;

	public ToggleSwitch()
	{
		SetStyle(ControlStyles.UserPaint | ControlStyles.ResizeRedraw | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, value: true);
		base.Height = 34;
		Cursor = Cursors.Hand;
		Font = Theme.F(9f);
	}

	protected override void OnClick(EventArgs e)
	{
		Checked = !on;
		base.OnClick(e);
	}

	protected override void OnPaint(PaintEventArgs e)
	{
		Graphics graphics = e.Graphics;
		graphics.SmoothingMode = SmoothingMode.AntiAlias;
		graphics.Clear((base.Parent != null) ? base.Parent.BackColor : Theme.Card);
		TextRenderer.DrawText(graphics, Title, Font, new Rectangle(4, 0, base.Width - 60, base.Height), Theme.TextDim, TextFormatFlags.EndEllipsis | TextFormatFlags.VerticalCenter);
		Rectangle r = new Rectangle(base.Width - 46, base.Height / 2 - 10, 38, 20);
		using (GraphicsPath path = Ui.Round(r, 10))
		{
			using SolidBrush brush = new SolidBrush(on ? Accent : Theme.Line);
			graphics.FillPath(brush, path);
		}
		int num = (on ? (r.Right - 18) : (r.X + 2));
		using SolidBrush brush2 = new SolidBrush(Color.White);
		graphics.FillEllipse(brush2, num, r.Y + 2, 16, 16);
	}
}
