using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace DreamSkin;

internal class ChipBar : Control
{
	public string[] Items = new string[0];

	public int Pad = 26;

	public int Gap = 6;

	private int sel;

	private int hoverIdx = -1;

	public int Selected
	{
		get
		{
			return sel;
		}
		set
		{
			if (sel != value)
			{
				sel = value;
				Invalidate();
				this.SelectedChanged?.Invoke(this, EventArgs.Empty);
			}
		}
	}

	public event EventHandler SelectedChanged;

	public ChipBar()
	{
		SetStyle(ControlStyles.UserPaint | ControlStyles.ResizeRedraw | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, value: true);
		base.Height = 30;
		Cursor = Cursors.Hand;
		Font = Theme.F(9f);
	}

	private Rectangle ItemRect(int i, Graphics g)
	{
		int num = 0;
		for (int j = 0; j < i; j++)
		{
			num += TextRenderer.MeasureText(Items[j], Font).Width + Pad + Gap;
		}
		return new Rectangle(num, 0, TextRenderer.MeasureText(Items[i], Font).Width + Pad, base.Height - 1);
	}

	protected override void OnPaint(PaintEventArgs e)
	{
		Graphics graphics = e.Graphics;
		graphics.SmoothingMode = SmoothingMode.AntiAlias;
		graphics.Clear((base.Parent != null) ? base.Parent.BackColor : Theme.Card);
		for (int i = 0; i < Items.Length; i++)
		{
			Rectangle rectangle = ItemRect(i, graphics);
			Color color = ((i == sel) ? Color.FromArgb(52, 214, 178, 102) : ((i == hoverIdx) ? Theme.CardHover : Color.FromArgb(30, 30, 37)));
			using (GraphicsPath path = Ui.Round(rectangle, rectangle.Height / 2))
			{
				using SolidBrush brush = new SolidBrush(color);
				graphics.FillPath(brush, path);
			}
			if (i == sel)
			{
				using GraphicsPath path = Ui.Round(rectangle, rectangle.Height / 2);
				using Pen pen = new Pen(Color.FromArgb(150, Theme.Gold));
				graphics.DrawPath(pen, path);
			}
			TextRenderer.DrawText(graphics, Items[i], Font, rectangle, (i == sel) ? Theme.Gold : Theme.Muted, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
		}
	}

	private int Hit(Point pt)
	{
		using (Graphics g = CreateGraphics())
		{
			for (int i = 0; i < Items.Length; i++)
			{
				if (ItemRect(i, g).Contains(pt))
				{
					return i;
				}
			}
		}
		return -1;
	}

	protected override void OnMouseMove(MouseEventArgs e)
	{
		int num = Hit(e.Location);
		if (num != hoverIdx)
		{
			hoverIdx = num;
			Invalidate();
		}
		base.OnMouseMove(e);
	}

	protected override void OnMouseLeave(EventArgs e)
	{
		hoverIdx = -1;
		Invalidate();
		base.OnMouseLeave(e);
	}

	protected override void OnMouseClick(MouseEventArgs e)
	{
		int num = Hit(e.Location);
		if (num >= 0)
		{
			Selected = num;
		}
		base.OnMouseClick(e);
	}
}
