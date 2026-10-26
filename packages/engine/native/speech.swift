// beatsheet's speech helper: the Mac's own voices (AVSpeechSynthesizer), listed, and spoken to a WAV file with the time
// of every word. Built by the engine with swiftc the first time it's needed.
//
//   beatsheet-speech voices                               → {"language": "en-US", "voices": [{id, name, language, quality, gender, novelty, personal}]}
//   beatsheet-speech speak <voice-id> <text-file> <out.wav> → {"duration": 3.77, "words": [{"w": "Hello", "s": 0.05, "e": 0.36}, …]}
//
// Errors go to stderr as "error <message>" with a non-zero exit.
import AVFoundation
import Foundation

func fail(_ message: String) -> Never {
  FileHandle.standardError.write("error \(message)\n".data(using: .utf8)!)
  exit(1)
}

func emit(_ value: Any) {
  guard let data = try? JSONSerialization.data(withJSONObject: value) else { fail("couldn't write the answer") }
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}

func voices() {
  let list = AVSpeechSynthesisVoice.speechVoices().map { v -> [String: Any] in
    [
      "id": v.identifier,
      "name": v.name,
      "language": v.language,
      "quality": v.quality == .premium ? "premium" : v.quality == .enhanced ? "enhanced" : "default",
      "gender": v.gender == .male ? "male" : v.gender == .female ? "female" : "",
      "novelty": v.voiceTraits.contains(.isNoveltyVoice),
      "personal": v.voiceTraits.contains(.isPersonalVoice),
    ]
  }
  emit(["language": AVSpeechSynthesisVoice.currentLanguageCode(), "voices": list])
}

/** Where each word starts, in bytes of audio, as the synthesizer reaches it. */
final class Marks: NSObject, AVSpeechSynthesizerDelegate {
  var words: [(range: NSRange, byte: Int)] = []
  func speechSynthesizer(_ s: AVSpeechSynthesizer, willSpeak marker: AVSpeechSynthesisMarker, utterance: AVSpeechUtterance) {
    if marker.mark == .word { words.append((marker.textRange, marker.byteSampleOffset)) }
  }
}

func speak(voiceId: String, textFile: String, out: String) {
  guard let text = try? String(contentsOfFile: textFile, encoding: .utf8), !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { fail("nothing to say") }
  guard let voice = AVSpeechSynthesisVoice(identifier: voiceId) else { fail("there's no voice \(voiceId) on this Mac") }
  let utterance = AVSpeechUtterance(string: text)
  utterance.voice = voice
  let synth = AVSpeechSynthesizer()
  let marks = Marks()
  synth.delegate = marks

  var file: AVAudioFile?
  var rate = 0.0
  var bytesPerFrame = 4
  var samples: [Float] = []
  var finished = false
  var problem: String?
  synth.write(utterance) { buffer in
    guard let pcm = buffer as? AVAudioPCMBuffer else { return }
    if pcm.frameLength == 0 {
      finished = true
      return
    }
    do {
      if file == nil {
        rate = pcm.format.sampleRate
        bytesPerFrame = Int(pcm.format.streamDescription.pointee.mBytesPerFrame)
        var settings = pcm.format.settings
        settings[AVFormatIDKey] = kAudioFormatLinearPCM
        settings[AVLinearPCMBitDepthKey] = 16
        settings[AVLinearPCMIsFloatKey] = false
        settings[AVLinearPCMIsBigEndianKey] = false
        settings[AVLinearPCMIsNonInterleaved] = false
        file = try AVAudioFile(forWriting: URL(fileURLWithPath: out), settings: settings, commonFormat: pcm.format.commonFormat, interleaved: pcm.format.isInterleaved)
      }
      try file!.write(from: pcm)
    } catch {
      problem = "couldn't write the audio: \(error.localizedDescription)"
      finished = true
    }
    // The first channel, as floats, for finding where each word's sound stops.
    let n = Int(pcm.frameLength)
    if let f = pcm.floatChannelData {
      samples.append(contentsOf: UnsafeBufferPointer(start: f[0], count: n))
    } else if let i = pcm.int16ChannelData {
      samples.append(contentsOf: UnsafeBufferPointer(start: i[0], count: n).map { Float($0) / 32768 })
    } else if let i = pcm.int32ChannelData {
      samples.append(contentsOf: UnsafeBufferPointer(start: i[0], count: n).map { Float($0) / 2_147_483_648 })
    }
  }
  let deadline = Date().addingTimeInterval(120)
  while !finished {
    if Date() > deadline { fail("the voice didn't finish speaking") }
    RunLoop.current.run(until: Date().addingTimeInterval(0.02))
  }
  if let problem { fail(problem) }
  file = nil // closes it
  guard rate > 0, !samples.isEmpty else { fail("the voice made no sound") }

  // Loudness in 10 ms windows: a word ends where its sound does, not where the next word starts.
  let window = max(1, Int(rate / 100))
  var levels: [Float] = []
  var i = 0
  while i < samples.count {
    let end = min(samples.count, i + window)
    var peak: Float = 0
    for j in i..<end { peak = max(peak, abs(samples[j])) }
    levels.append(peak)
    i = end
  }
  let loudest = levels.max() ?? 0
  let floor = max(loudest * 0.04, 0.002)
  let seconds = { (w: Int) in Double(w * window) / rate }
  let duration = Double(samples.count) / rate

  let ns = text as NSString
  var words: [[String: Any]] = []
  for (k, m) in marks.words.enumerated() {
    let word = ns.substring(with: m.range).trimmingCharacters(in: .whitespacesAndNewlines)
    if word.isEmpty { continue }
    // Punctuation straight after the word belongs to it, as written ("quarters.").
    var tail = m.range.location + m.range.length
    while tail < ns.length, let c = Unicode.Scalar(ns.character(at: tail)), CharacterSet.punctuationCharacters.contains(c) { tail += 1 }
    let written = ns.substring(with: NSRange(location: m.range.location, length: tail - m.range.location))
    let from = (m.byte / max(1, bytesPerFrame)) / window
    let next = k + 1 < marks.words.count ? (marks.words[k + 1].byte / max(1, bytesPerFrame)) / window : levels.count
    var s = from, e = max(from + 1, next)
    while s < e - 1 && levels[min(s, levels.count - 1)] < floor { s += 1 }
    while e - 1 > s && levels[min(e - 1, levels.count - 1)] < floor { e -= 1 }
    words.append(["w": written, "s": (seconds(s) * 1000).rounded() / 1000, "e": (min(duration, seconds(e)) * 1000).rounded() / 1000])
  }
  emit(["duration": (duration * 1000).rounded() / 1000, "rate": rate, "words": words])
}

let args = CommandLine.arguments
switch args.count > 1 ? args[1] : "" {
case "voices": voices()
case "speak" where args.count >= 5: speak(voiceId: args[2], textFile: args[3], out: args[4])
default: fail("usage: beatsheet-speech voices | speak <voice-id> <text-file> <out.wav>")
}
