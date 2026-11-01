using System;
using System.Collections.Generic;

namespace DreamSkin;

internal class SettingDef
{
	public string Id = "";

	public string Title = "";

	public string Type = "";

	public string Format = "";

	public double Min;

	public double Max = 100.0;

	public double Step = 1.0;

	public object Default;

	public static SettingDef From(Dictionary<string, object> d)
	{
		SettingDef settingDef = new SettingDef();
		if (d.TryGetValue("id", out var value))
		{
			settingDef.Id = Convert.ToString(value);
		}
		if (d.TryGetValue("title", out value))
		{
			settingDef.Title = Convert.ToString(value);
		}
		if (d.TryGetValue("type", out value))
		{
			settingDef.Type = Convert.ToString(value);
		}
		if (d.TryGetValue("format", out value) && value != null)
		{
			settingDef.Format = Convert.ToString(value);
		}
		if (d.TryGetValue("min", out value) && value != null)
		{
			settingDef.Min = Convert.ToDouble(value);
		}
		if (d.TryGetValue("max", out value) && value != null)
		{
			settingDef.Max = Convert.ToDouble(value);
		}
		if (d.TryGetValue("step", out value) && value != null)
		{
			settingDef.Step = Convert.ToDouble(value);
		}
		if (d.TryGetValue("default", out value))
		{
			settingDef.Default = value;
		}
		return settingDef;
	}
}
