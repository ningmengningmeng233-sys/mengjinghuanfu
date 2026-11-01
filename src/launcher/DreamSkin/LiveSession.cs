using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Text;
using System.Web.Script.Serialization;

namespace DreamSkin;

internal class LiveSession : IDisposable
{
	private Process proc;

	public bool Ready;

	private static readonly JavaScriptSerializer Json = new JavaScriptSerializer
	{
		MaxJsonLength = int.MaxValue
	};

	public bool Alive => proc != null && !proc.HasExited;

	public event Action<Dictionary<string, object>> Message;

	public void Start(string node, string script, string extraPath, string app)
	{
		ProcessStartInfo processStartInfo = new ProcessStartInfo();
		processStartInfo.FileName = node;
		processStartInfo.Arguments = "\"" + script + "\" live --app " + app;
		processStartInfo.UseShellExecute = false;
		processStartInfo.CreateNoWindow = true;
		processStartInfo.RedirectStandardInput = true;
		processStartInfo.RedirectStandardOutput = true;
		processStartInfo.RedirectStandardError = true;
		processStartInfo.StandardOutputEncoding = Encoding.UTF8;
		processStartInfo.StandardErrorEncoding = Encoding.UTF8;
		ProcessStartInfo processStartInfo2 = processStartInfo;
		if (!string.IsNullOrEmpty(extraPath))
		{
			processStartInfo2.EnvironmentVariables["PATH"] = extraPath + ";" + processStartInfo2.EnvironmentVariables["PATH"];
		}
		proc = new Process
		{
			StartInfo = processStartInfo2,
			EnableRaisingEvents = true
		};
		proc.OutputDataReceived += delegate(object s, DataReceivedEventArgs e)
		{
			if (!string.IsNullOrEmpty(e.Data))
			{
				Dictionary<string, object> dictionary = null;
				try
				{
					dictionary = Json.Deserialize<Dictionary<string, object>>(e.Data);
				}
				catch
				{
				}
				if (dictionary != null)
				{
					dictionary.TryGetValue("op", out var value);
					dictionary.TryGetValue("ok", out var value2);
					if (value as string == "hello")
					{
						Ready = value2 is bool && (bool)value2;
					}
					this.Message?.Invoke(dictionary);
				}
			}
		};
		proc.ErrorDataReceived += delegate
		{
		};
		proc.Start();
		proc.StandardInput.AutoFlush = true;
		proc.BeginOutputReadLine();
		proc.BeginErrorReadLine();
	}

	public void Send(Dictionary<string, object> msg)
	{
		if (!Alive)
		{
			return;
		}
		try
		{
			byte[] bytes = Encoding.UTF8.GetBytes(Json.Serialize(msg) + "\n");
			proc.StandardInput.BaseStream.Write(bytes, 0, bytes.Length);
			proc.StandardInput.BaseStream.Flush();
		}
		catch
		{
		}
	}

	public void Dispose()
	{
		if (proc == null)
		{
			return;
		}
		try
		{
			if (!proc.HasExited)
			{
				Send(new Dictionary<string, object> { { "op", "quit" } });
				if (!proc.WaitForExit(1500))
				{
					proc.Kill();
				}
			}
		}
		catch
		{
		}
		try
		{
			proc.Dispose();
		}
		catch
		{
		}
		proc = null;
		Ready = false;
	}
}
