// beatsheet's speech helper on Windows: Windows' own voices (SAPI, through System.Speech), listed, and spoken to a WAV
// file with the time of every word. The same commands and answers as speech.swift on the Mac. Built by the engine
// with PowerShell's C# compiler the first time it's needed.
//
//   beatsheet-speech voices                                → {"language": "en-US", "voices": [{id, name, language, quality, gender, novelty, personal}]}
//   beatsheet-speech speak <voice-id> <text-file> <out.wav> → {"duration": 3.77, "words": [{"w": "Hello", "s": 0.05, "e": 0.36}, …]}
//
// Errors go to stderr as "error <message>" with a non-zero exit.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Speech.AudioFormat;
using System.Speech.Synthesis;
using System.Text;
using System.Threading;

// Runs SAPI's events on the thread that raises them, in order, so every word is in before Speak returns.
class Inline : SynchronizationContext {
  public override void Post(SendOrPostCallback d, object state) { d(state); }
  public override void Send(SendOrPostCallback d, object state) { d(state); }
}

static class Program {
  // The rate Windows' voices (David, Zira…) make. SAPI times its events by the voice's own rate whatever the file's,
  // so at 24 kHz every word came out half as late again as it's heard.
  const int Rate = 16000;

  static int Fail(string message) {
    Console.Error.WriteLine("error " + message);
    return 1;
  }

  static string Str(string s) {
    var sb = new StringBuilder("\"");
    foreach (char c in s ?? "") {
      if (c == '"') sb.Append("\\\"");
      else if (c == '\\') sb.Append("\\\\");
      else if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
      else sb.Append(c);
    }
    return sb.Append('"').ToString();
  }

  static string Num(double v) { return Math.Round(v, 3).ToString(CultureInfo.InvariantCulture); }

  static void Emit(string json) {
    byte[] bytes = new UTF8Encoding(false).GetBytes(json + "\n");
    Stream o = Console.OpenStandardOutput();
    o.Write(bytes, 0, bytes.Length);
    o.Flush();
  }

  static int Main(string[] args) {
    try {
      if (args.Length == 1 && args[0] == "voices") return Voices();
      if (args.Length == 4 && args[0] == "speak") return Speak(args[1], args[2], args[3]);
      return Fail("usage: beatsheet-speech voices | speak <voice-id> <text-file> <out.wav>");
    } catch (Exception e) {
      return Fail(e.Message);
    }
  }

  // "Microsoft Zira Desktop" reads as "Zira".
  static string ShortName(string name) {
    string n = name;
    if (n.StartsWith("Microsoft ")) n = n.Substring(10);
    if (n.EndsWith(" Desktop")) n = n.Substring(0, n.Length - 8);
    int dash = n.IndexOf(" - ");
    return dash > 0 ? n.Substring(0, dash) : n;
  }

  static int Voices() {
    var sb = new StringBuilder();
    sb.Append("{\"language\":").Append(Str(CultureInfo.CurrentUICulture.Name)).Append(",\"voices\":[");
    using (var synth = new SpeechSynthesizer()) {
      bool first = true;
      foreach (InstalledVoice iv in synth.GetInstalledVoices()) {
        if (!iv.Enabled) continue;
        VoiceInfo v = iv.VoiceInfo;
        string gender = v.Gender == VoiceGender.Male ? "male" : v.Gender == VoiceGender.Female ? "female" : "";
        if (!first) sb.Append(',');
        first = false;
        sb.Append("{\"id\":").Append(Str(v.Name))
          .Append(",\"name\":").Append(Str(ShortName(v.Name)))
          .Append(",\"language\":").Append(Str(v.Culture != null ? v.Culture.Name : ""))
          .Append(",\"quality\":\"default\",\"gender\":").Append(Str(gender))
          .Append(",\"novelty\":false,\"personal\":false}");
      }
    }
    sb.Append("]}");
    Emit(sb.ToString());
    return 0;
  }

  struct Mark { public double At; public int Pos; public int Len; }

  // The length of the sound in a 16-bit mono WAV, from its data chunk.
  static double WavSeconds(string path) {
    byte[] b = File.ReadAllBytes(path);
    for (int i = 12; i + 8 <= b.Length; ) {
      string id = Encoding.ASCII.GetString(b, i, 4);
      int size = BitConverter.ToInt32(b, i + 4);
      if (id == "data") return Math.Min(size, b.Length - i - 8) / (double)(Rate * 2);
      if (size < 0) break;
      i += 8 + size + (size & 1);
    }
    return Math.Max(0, b.Length - 44) / (double)(Rate * 2);
  }

  static int Speak(string voice, string textFile, string outFile) {
    string text = File.ReadAllText(textFile, Encoding.UTF8).Trim();
    if (text.Length == 0) return Fail("nothing to say");
    var marks = new List<Mark>();
    SynchronizationContext before = SynchronizationContext.Current;
    SynchronizationContext.SetSynchronizationContext(new Inline());
    try {
      using (var synth = new SpeechSynthesizer()) {
        synth.SelectVoice(voice);
        synth.SetOutputToWaveFile(outFile, new SpeechAudioFormatInfo(Rate, AudioBitsPerSample.Sixteen, AudioChannel.Mono));
        synth.SpeakProgress += delegate(object o, SpeakProgressEventArgs e) {
          lock (marks) marks.Add(new Mark { At = e.AudioPosition.TotalSeconds, Pos = e.CharacterPosition, Len = e.CharacterCount });
        };
        var done = new ManualResetEvent(false);
        synth.SpeakCompleted += delegate(object o, SpeakCompletedEventArgs e) { done.Set(); };
        synth.SpeakAsync(text);
        done.WaitOne();
        // Should SAPI hand its events to the thread pool after all, let the last of them land.
        Thread.Sleep(150);
        synth.SetOutputToNull();
      }
    } finally {
      SynchronizationContext.SetSynchronizationContext(before);
    }
    double duration = WavSeconds(outFile);

    // The words as written (punctuation and all), each starting when SAPI first reached a letter of it.
    var words = new List<KeyValuePair<string, double>>();
    var spans = new List<int[]>();
    for (int i = 0; i < text.Length; ) {
      while (i < text.Length && char.IsWhiteSpace(text[i])) i++;
      int start = i;
      while (i < text.Length && !char.IsWhiteSpace(text[i])) i++;
      if (i > start) spans.Add(new int[] { start, i });
    }
    List<Mark> sorted;
    lock (marks) sorted = new List<Mark>(marks);
    sorted.Sort(delegate(Mark a, Mark b) { return a.At.CompareTo(b.At); });
    var starts = new List<double>();
    foreach (int[] span in spans) {
      double at = -1;
      foreach (Mark m in sorted) {
        if (m.Pos < span[1] && m.Pos + Math.Max(1, m.Len) > span[0]) { at = m.At; break; }
      }
      starts.Add(at);
    }
    var sb = new StringBuilder();
    sb.Append("{\"duration\":").Append(Num(duration)).Append(",\"words\":[");
    bool first = true;
    for (int k = 0; k < spans.Count; k++) {
      if (starts[k] < 0) continue;
      string w = text.Substring(spans[k][0], spans[k][1] - spans[k][0]);
      double s = starts[k];
      // It ends where the next word starts, less the pause a full stop or comma leaves.
      double next = duration;
      for (int j = k + 1; j < spans.Count; j++) if (starts[j] >= 0) { next = starts[j]; break; }
      double end = Math.Max(s, Math.Min(next, s + 0.12 + 0.075 * w.Length));
      if (!first) sb.Append(',');
      first = false;
      sb.Append("{\"w\":").Append(Str(w)).Append(",\"s\":").Append(Num(s)).Append(",\"e\":").Append(Num(end)).Append('}');
    }
    sb.Append("]}");
    Emit(sb.ToString());
    return 0;
  }
}
