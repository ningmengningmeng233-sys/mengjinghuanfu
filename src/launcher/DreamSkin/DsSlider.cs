using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Globalization;
using System.Windows.Forms;

namespace DreamSkin;

internal class DsSlider : Control
{
	public string Title = "";

	public string Unit = "";

	public double Min;

	public double Max = 100.0;

	public double Step = 1.0;

	private double val;

	public Color Accent = Theme.Gold;

	private bool hover;

	private bool drag;

	public double Value
	{
		get
		{
			return val;
		}
		set
		{
			double num = Math.Max(Min, Math.Min(Max, value));
			if (Step > 0.0)
			{
				num = Math.Round(num / Step) * Step;
			}
			if (Math.Abs(num - val) < 1E-09)
			{
				Invalidate();
				return;
			}
			val = num;
			Invalidate();
			this.ValueChanged?.Invoke(this, EventArgs.Empty);
		}
	}

	private Rectangle Track => new Rectangle(8, 30, base.Width - 16, 4);

	private int KnobX
	{
		get
		{
			Rectangle track = Track;
			return track.X + (int)((double)track.Width * ((val - Min) / Math.Max(1E-09, Max - Min)));
		}
	}

	public event EventHandler ValueChanged;

	public event EventHandler ResetRequested;

	public DsSlider()
	{
		SetStyle(ControlStyles.UserPaint | ControlStyles.ResizeRedraw | ControlStyles.Selectable | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, value: true);
		base.Height = 46;
		Cursor = Cursors.Hand;
		Font = Theme.F(9f);
	}

	protected override void OnPaint(PaintEventArgs e)
	{
		Graphics graphics = e.Graphics;
		graphics.SmoothingMode = SmoothingMode.AntiAlias;
		graphics.Clear((base.Parent != null) ? base.Parent.BackColor : Theme.Card);
		TextRenderer.DrawText(graphics, Title, Font, new Rectangle(4, 4, base.Width - 70, 20), (hover || drag) ? Theme.Text : Color.FromArgb(190, 190, 202), TextFormatFlags.EndEllipsis | TextFormatFlags.VerticalCenter);
		string text = val.ToString((Step < 1.0) ? "0.0" : "0", CultureInfo.InvariantCulture) + Unit;
		TextRenderer.DrawText(graphics, text, Theme.F(9f, FontStyle.Bold), new Rectangle(base.Width - 70, 4, 66, 20), drag ? Accent : Theme.Text, TextFormatFlags.Right | TextFormatFlags.VerticalCenter);
		Rectangle track = Track;
		using (GraphicsPath path = Ui.Round(track, 2))
		{
			using SolidBrush brush = new SolidBrush(Color.FromArgb(48, 48, 60));
			graphics.FillPath(brush, path);
		}
		int knobX = KnobX;
		if (knobX > track.X + 1)
		{
			Rectangle r = new Rectangle(track.X, track.Y, knobX - track.X, track.Height);
			using GraphicsPath path = Ui.Round(r, 2);
			using LinearGradientBrush brush2 = new LinearGradientBrush(new Rectangle(track.X - 1, track.Y, track.Width + 2, track.Height), Color.FromArgb(150, Accent), Accent, 0f);
			graphics.FillPath(brush2, path);
		}
		int num = ((hover || drag) ? 8 : 7);
		using (SolidBrush brush3 = new SolidBrush(Color.FromArgb(70, 0, 0, 0)))
		{
			graphics.FillEllipse(brush3, knobX - num, track.Y + 2 - num + 1, num * 2, num * 2);
		}
		if (drag)
		{
			using SolidBrush brush4 = new SolidBrush(Color.FromArgb(60, Accent));
			graphics.FillEllipse(brush4, knobX - num - 5, track.Y + 2 - num - 5, num * 2 + 10, num * 2 + 10);
		}
		using (SolidBrush brush5 = new SolidBrush(Color.FromArgb(246, 244, 240)))
		{
			graphics.FillEllipse(brush5, knobX - num, track.Y + 2 - num, num * 2, num * 2);
		}
		using SolidBrush brush6 = new SolidBrush(Accent);
		graphics.FillEllipse(brush6, (float)knobX - 2.5f, (float)(track.Y + 2) - 2.5f, 5f, 5f);
	}

	private void SetFromX(int x)
	{
		Rectangle track = Track;
		Value = Min + (Max - Min) * Math.Max(0.0, Math.Min(1.0, (double)(x - track.X) / (double)track.Width));
	}

	protected override void OnMouseDown(MouseEventArgs e)
	{
		if (e.Button == MouseButtons.Left)
		{
			drag = true;
			base.Capture = true;
			Focus();
			SetFromX(e.X);
		}
		base.OnMouseDown(e);
	}

	protected override void OnMouseMove(MouseEventArgs e)
	{
		if (drag)
		{
			SetFromX(e.X);
		}
		base.OnMouseMove(e);
	}

	protected override void OnMouseUp(MouseEventArgs e)
	{
		drag = false;
		base.Capture = false;
		Invalidate();
		base.OnMouseUp(e);
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

	protected override bool IsInputKey(Keys k)
	{
		return k == Keys.Left || k == Keys.Right || base.IsInputKey(k);
	}

	protected override void OnKeyDown(KeyEventArgs e)
	{
		if (e.KeyCode == Keys.Left)
		{
			Value = val - Step;
		}
		else if (e.KeyCode == Keys.Right)
		{
			Value = val + Step;
		}
		base.OnKeyDown(e);
	}

	protected override void OnDoubleClick(EventArgs e)
	{
		base.OnDoubleClick(e);
		this.ResetRequested?.Invoke(this, EventArgs.Empty);
	}
}
