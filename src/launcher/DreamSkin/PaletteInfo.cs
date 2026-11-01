using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;

namespace DreamSkin;

internal class PaletteInfo
{
	public string Key = "";

	public string Name = "";

	public string Group = "";

	public string GroupName = "";

	public string Desc = "";

	public string Source = "";

	public bool Dark;

	public Color Bg;

	public Color Panel;

	public Color Bubble;

	public Color Accent;

	public Color Glow;

	public Color Text;

	public Color Muted;

	public Dictionary<string, object> Tune;

	public Dictionary<string, object> Values;

	public string Image = "";

	public string Author = "";

	public string License = "";

	public string Url = "";

	public bool Downloaded;

	private Bitmap thumb;

	private bool thumbTried;

	public Bitmap Thumb
	{
		get
		{
			if (thumbTried)
			{
				return thumb;
			}
			thumbTried = true;
			if (string.IsNullOrEmpty(Image) || !File.Exists(Image))
			{
				return null;
			}
			try
			{
				using FileStream stream = File.OpenRead(Image);
				using Image image = System.Drawing.Image.FromStream(stream);
				int width = 160;
				int height = Math.Max(1, image.Height * 160 / Math.Max(1, image.Width));
				thumb = new Bitmap(width, height);
				using Graphics graphics = Graphics.FromImage(thumb);
				graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
				graphics.DrawImage(image, 0, 0, width, height);
			}
			catch
			{
				thumb = null;
			}
			return thumb;
		}
	}

	private static Color C(object v, Color d)
	{
		try
		{
			string text = v as string;
			return string.IsNullOrEmpty(text) ? d : ColorTranslator.FromHtml(text);
		}
		catch
		{
			return d;
		}
	}

	private static string S(Dictionary<string, object> d, string k)
	{
		object value;
		return (d.TryGetValue(k, out value) && value != null) ? Convert.ToString(value) : "";
	}

	public static PaletteInfo From(Dictionary<string, object> d)
	{
		PaletteInfo paletteInfo = new PaletteInfo();
		paletteInfo.Key = S(d, "key");
		paletteInfo.Name = S(d, "name");
		paletteInfo.Group = S(d, "group");
		paletteInfo.GroupName = S(d, "groupName");
		paletteInfo.Desc = S(d, "desc");
		paletteInfo.Source = S(d, "from");
		paletteInfo.Dark = d.TryGetValue("dark", out var value) && value is bool && (bool)value;
		paletteInfo.Bg = C(d.TryGetValue("bg", out var value2) ? value2 : null, Color.Black);
		paletteInfo.Panel = C(d.TryGetValue("panel", out value2) ? value2 : null, paletteInfo.Bg);
		paletteInfo.Bubble = C(d.TryGetValue("bubble", out value2) ? value2 : null, paletteInfo.Panel);
		paletteInfo.Accent = C(d.TryGetValue("accent", out value2) ? value2 : null, Color.Gray);
		paletteInfo.Text = C(d.TryGetValue("text", out value2) ? value2 : null, Color.White);
		paletteInfo.Glow = C(d.TryGetValue("glow", out value2) ? value2 : null, paletteInfo.Accent);
		paletteInfo.Muted = C(d.TryGetValue("muted", out value2) ? value2 : null, paletteInfo.Text);
		paletteInfo.Tune = (d.TryGetValue("tune", out value2) ? (value2 as Dictionary<string, object>) : null);
		paletteInfo.Values = (d.TryGetValue("values", out value2) ? (value2 as Dictionary<string, object>) : null);
		paletteInfo.Image = S(d, "image");
		paletteInfo.Author = S(d, "author");
		paletteInfo.License = S(d, "license");
		paletteInfo.Url = S(d, "url");
		paletteInfo.Downloaded = d.TryGetValue("downloaded", out var value3) && value3 is bool && (bool)value3;
		if (paletteInfo.GroupName.Length == 0)
		{
			paletteInfo.GroupName = ((paletteInfo.Group == "wallpaper") ? "壁纸取色" : paletteInfo.Group);
		}
		return paletteInfo;
	}
}
