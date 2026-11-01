using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace DreamSkin;

internal class ScrollHost : Control
{
	public readonly Panel Content = new Panel();

	private int offset;

	private int dragStartY = -1;

	private int dragStartOffset;

	private bool hoverBar;

	public int ContentHeight
	{
		get
		{
			return Content.Height;
		}
		set
		{
			Content.Height = value;
			Clamp();
			Invalidate();
		}
	}

	private int MaxOffset => Math.Max(0, Content.Height - base.Height);

	public ScrollHost()
	{
		SetStyle(ControlStyles.UserPaint | ControlStyles.ResizeRedraw | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, value: true);
		Content.Location = Point.Empty;
		Content.BackColor = Theme.Card;
		base.Controls.Add(Content);
	}

	protected override void OnResize(EventArgs e)
	{
		base.OnResize(e);
		Content.Width = base.Width - 10;
		Clamp();
	}

	protected override void OnBackColorChanged(EventArgs e)
	{
		base.OnBackColorChanged(e);
		Content.BackColor = BackColor;
	}

	public void ScrollBy(int dy)
	{
		offset += dy;
		Clamp();
	}

	public void ScrollTo(int y)
	{
		offset = y;
		Clamp();
	}

	private void Clamp()
	{
		offset = Math.Max(0, Math.Min(MaxOffset, offset));
		Content.Top = -offset;
		Invalidate();
	}

	private Rectangle Thumb()
	{
		if (MaxOffset <= 0)
		{
			return Rectangle.Empty;
		}
		int num = Math.Max(28, base.Height * base.Height / Math.Max(1, Content.Height));
		int num2 = (int)((double)(base.Height - num) * ((double)offset / (double)MaxOffset));
		return new Rectangle(base.Width - 6, num2, 4, num);
	}

	protected override void OnPaint(PaintEventArgs e)
	{
		e.Graphics.Clear(BackColor);
		Rectangle r = Thumb();
		if (r.IsEmpty)
		{
			return;
		}
		e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
		if (hoverBar || dragStartY >= 0)
		{
			r = new Rectangle(r.X - 2, r.Y, r.Width + 2, r.Height);
		}
		using GraphicsPath path = Ui.Round(r, r.Width / 2);
		using SolidBrush brush = new SolidBrush(Color.FromArgb((hoverBar || dragStartY >= 0) ? 150 : 80, 200, 200, 215));
		e.Graphics.FillPath(brush, path);
	}

	protected override void OnMouseMove(MouseEventArgs e)
	{
		bool flag = e.X >= base.Width - 12;
		if (flag != hoverBar)
		{
			hoverBar = flag;
			Invalidate();
		}
		if (dragStartY >= 0 && MaxOffset > 0)
		{
			Rectangle rectangle = Thumb();
			double num = (double)MaxOffset / (double)Math.Max(1, base.Height - rectangle.Height);
			offset = dragStartOffset + (int)((double)(e.Y - dragStartY) * num);
			Clamp();
		}
		base.OnMouseMove(e);
	}

	protected override void OnMouseDown(MouseEventArgs e)
	{
		if (e.X >= base.Width - 12)
		{
			dragStartY = e.Y;
			dragStartOffset = offset;
			base.Capture = true;
		}
		base.OnMouseDown(e);
	}

	protected override void OnMouseUp(MouseEventArgs e)
	{
		dragStartY = -1;
		base.Capture = false;
		Invalidate();
		base.OnMouseUp(e);
	}

	protected override void OnMouseLeave(EventArgs e)
	{
		hoverBar = false;
		Invalidate();
		base.OnMouseLeave(e);
	}
}
