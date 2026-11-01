using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;

namespace DreamSkin;

internal static class Ui
{
	public static GraphicsPath Round(Rectangle r, int radius)
	{
		GraphicsPath graphicsPath = new GraphicsPath();
		int num = Math.Max(1, radius * 2);
		graphicsPath.AddArc(r.X, r.Y, num, num, 180f, 90f);
		graphicsPath.AddArc(r.Right - num, r.Y, num, num, 270f, 90f);
		graphicsPath.AddArc(r.Right - num, r.Bottom - num, num, num, 0f, 90f);
		graphicsPath.AddArc(r.X, r.Bottom - num, num, num, 90f, 90f);
		graphicsPath.CloseFigure();
		return graphicsPath;
	}

	public static void DrawCover(Graphics g, Image img, Rectangle dst, float fx, float fy)
	{
		float num = Math.Max((float)dst.Width / (float)img.Width, (float)dst.Height / (float)img.Height);
		float num2 = (float)dst.Width / num;
		float num3 = (float)dst.Height / num;
		float x = ((float)img.Width - num2) * fx;
		float y = ((float)img.Height - num3) * fy;
		g.InterpolationMode = InterpolationMode.HighQualityBicubic;
		g.DrawImage(img, dst, new RectangleF(x, y, num2, num3), GraphicsUnit.Pixel);
	}

	public static Image LoadThumb(string path, int maxW)
	{
		byte[] buffer = File.ReadAllBytes(path);
		using MemoryStream stream = new MemoryStream(buffer);
		using Image image = Image.FromStream(stream);
		float num = Math.Min(1f, (float)maxW / (float)image.Width);
		Bitmap bitmap = new Bitmap(Math.Max(1, (int)((float)image.Width * num)), Math.Max(1, (int)((float)image.Height * num)));
		using (Graphics graphics = Graphics.FromImage(bitmap))
		{
			graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
			graphics.DrawImage(image, 0, 0, bitmap.Width, bitmap.Height);
		}
		return bitmap;
	}
}
