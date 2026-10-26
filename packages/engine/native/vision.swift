// beatsheet-vision: Apple's Vision framework, for beatsheet. Finds faces and people in a clip and follows them, follows
// anything you box, and lifts subjects out of a picture (a photo, a frame, or every frame of a clip).
//
// Boxes are {x, y, w, h} in 0..1 of the picture as displayed (after rotation), origin top-left. Times are seconds into
// the file. Results go to stdout as JSON; progress goes to stderr as "progress <0..1>" lines.
//
//   subjects <file> [--every 0.2] [--from s] [--to s]
//   track <file> --at s --box x,y,w,h [--every 0.1] [--from s] [--to s]
//   cutout <file> --out <file.png | prefix> [--at s] [--mode subject|people] [--point x,y] [--box x,y,w,h] [--each]
//   cutout-video <file> [--from s] [--to s] [--mode subject|people] [--follow <samples.json>] [--fps n] [--max px]
//     (raw RGBA frames on stdout; "size WxH fps" first and "result {json}" last on stderr)
//
// Built by the engine with `xcrun swiftc -O` the first time it's needed.

import AVFoundation
import CoreImage
import Foundation
import Vision

// MARK: - Arguments and output

let args = Array(CommandLine.arguments.dropFirst())
func flag(_ name: String) -> String? {
  guard let i = args.firstIndex(of: "--\(name)"), i + 1 < args.count else { return nil }
  return args[i + 1]
}
func number(_ name: String) -> Double? { flag(name).flatMap(Double.init) }
func has(_ name: String) -> Bool { args.contains("--\(name)") }

func fail(_ message: String) -> Never {
  FileHandle.standardError.write("error \(message)\n".data(using: .utf8)!)
  exit(1)
}
func progress(_ f: Double) {
  FileHandle.standardError.write(String(format: "progress %.3f\n", min(1, max(0, f))).data(using: .utf8)!)
}
func emit(_ value: Any) {
  let data = try! JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}
func r4(_ v: Double) -> Double { (v * 10000).rounded() / 10000 }
func r3(_ v: Double) -> Double { (v * 1000).rounded() / 1000 }

// MARK: - Boxes

struct Box {
  var x: Double, y: Double, w: Double, h: Double
  var json: [String: Double] { ["x": r4(x), "y": r4(y), "w": r4(w), "h": r4(h)] }
  var area: Double { max(0, w) * max(0, h) }
  func union(_ o: Box) -> Box {
    let x0 = min(x, o.x), y0 = min(y, o.y), x1 = max(x + w, o.x + o.w), y1 = max(y + h, o.y + o.h)
    return Box(x: x0, y: y0, w: x1 - x0, h: y1 - y0)
  }
}
func parseBox(_ s: String?) -> Box? {
  guard let parts = s?.split(separator: ",").compactMap({ Double($0) }), parts.count == 4 else { return nil }
  return Box(x: parts[0], y: parts[1], w: parts[2], h: parts[3])
}
func parsePoint(_ s: String?) -> (Double, Double)? {
  guard let parts = s?.split(separator: ",").compactMap({ Double($0) }), parts.count == 2 else { return nil }
  return (parts[0], parts[1])
}
// Vision's normalized rects have their origin bottom-left.
func topLeft(_ r: CGRect) -> Box {
  let c = r.intersection(CGRect(x: 0, y: 0, width: 1, height: 1))
  let k = c.isNull ? r : c
  return Box(x: k.minX, y: 1 - k.maxY, w: k.width, h: k.height)
}
func visionRect(_ b: Box) -> CGRect { CGRect(x: b.x, y: 1 - b.y - b.h, width: b.w, height: b.h) }
func iou(_ a: Box, _ b: Box) -> Double {
  let x0 = max(a.x, b.x), y0 = max(a.y, b.y), x1 = min(a.x + a.w, b.x + b.w), y1 = min(a.y + a.h, b.y + b.h)
  let inter = max(0, x1 - x0) * max(0, y1 - y0)
  let u = a.area + b.area - inter
  return u > 0 ? inter / u : 0
}

/// Where a box is at time t, from samples [t, x, y, w, h], interpolated between the nearest two.
func boxAt(_ samples: [[Double]], _ t: Double) -> Box? {
  guard let first = samples.first, let last = samples.last else { return nil }
  if t <= first[0] { return Box(x: first[1], y: first[2], w: first[3], h: first[4]) }
  if t >= last[0] { return Box(x: last[1], y: last[2], w: last[3], h: last[4]) }
  for i in 1..<samples.count where samples[i][0] >= t {
    let a = samples[i - 1], b = samples[i]
    let k = b[0] > a[0] ? (t - a[0]) / (b[0] - a[0]) : 0
    func mix(_ j: Int) -> Double { a[j] + (b[j] - a[j]) * k }
    return Box(x: mix(1), y: mix(2), w: mix(3), h: mix(4))
  }
  return nil
}

/// The extent of everything above `threshold` in a one-channel mask (or equal to `label`), as a box; nil when empty.
/// The outer 1% on each side is trimmed, so a few stray pixels at the edge don't stretch it to the whole frame.
func bounds(of pb: CVPixelBuffer, label: UInt8? = nil, threshold: Float = 0.5, stride step: Int = 2) -> Box? {
  CVPixelBufferLockBaseAddress(pb, .readOnly)
  defer { CVPixelBufferUnlockBaseAddress(pb, .readOnly) }
  let w = CVPixelBufferGetWidth(pb), h = CVPixelBufferGetHeight(pb), row = CVPixelBufferGetBytesPerRow(pb)
  guard let base = CVPixelBufferGetBaseAddress(pb) else { return nil }
  let float = CVPixelBufferGetPixelFormatType(pb) == kCVPixelFormatType_OneComponent32Float
  var cols = [Int](repeating: 0, count: w), rows = [Int](repeating: 0, count: h), total = 0
  for y in Swift.stride(from: 0, to: h, by: step) {
    let line = base.advanced(by: y * row)
    for x in Swift.stride(from: 0, to: w, by: step) {
      let on: Bool
      if float {
        on = line.load(fromByteOffset: x * 4, as: Float.self) > threshold
      } else {
        let v = line.load(fromByteOffset: x, as: UInt8.self)
        on = label.map { v == $0 } ?? (Float(v) / 255 > threshold)
      }
      if on { cols[x] += 1; rows[y] += 1; total += 1 }
    }
  }
  guard total > 0 else { return nil }
  let trim = max(1, total / 100)
  func span(_ counts: [Int]) -> (Int, Int) {
    var lo = 0, acc = 0
    while lo < counts.count - 1, acc + counts[lo] < trim { acc += counts[lo]; lo += 1 }
    var hi = counts.count - 1
    acc = 0
    while hi > lo, acc + counts[hi] < trim { acc += counts[hi]; hi -= 1 }
    return (lo, hi)
  }
  let (x0, x1) = span(cols), (y0, y1) = span(rows)
  return Box(x: Double(x0) / Double(w), y: Double(y0) / Double(h), w: Double(x1 - x0 + step) / Double(w), h: Double(y1 - y0 + step) / Double(h))
}

/// Instance labels in an instance mask, each with its extent.
func instanceBounds(_ obs: VNInstanceMaskObservation) -> [(Int, Box)] {
  obs.allInstances.compactMap { i in bounds(of: obs.instanceMask, label: UInt8(i), stride: 1).map { (i, $0) } }
}
func instanceAt(_ obs: VNInstanceMaskObservation, _ p: (Double, Double)) -> Int? {
  let pb = obs.instanceMask
  CVPixelBufferLockBaseAddress(pb, .readOnly)
  defer { CVPixelBufferUnlockBaseAddress(pb, .readOnly) }
  let w = CVPixelBufferGetWidth(pb), h = CVPixelBufferGetHeight(pb)
  let x = min(w - 1, max(0, Int(p.0 * Double(w)))), y = min(h - 1, max(0, Int(p.1 * Double(h))))
  let v = CVPixelBufferGetBaseAddress(pb)!.advanced(by: y * CVPixelBufferGetBytesPerRow(pb)).load(fromByteOffset: x, as: UInt8.self)
  return v == 0 ? nil : Int(v)
}

// MARK: - Reading pictures

let ci = CIContext(options: [.cacheIntermediates: false])
let srgb = CGColorSpace(name: CGColorSpace.sRGB)!

func atOrigin(_ img: CIImage) -> CIImage {
  img.transformed(by: CGAffineTransform(translationX: -img.extent.origin.x, y: -img.extent.origin.y))
}
/// Large photos are brought down to `limit` on the long side: plenty for a 4K frame, and much faster.
func fit(_ img: CIImage, _ limit: Double) -> CIImage {
  let long = max(img.extent.width, img.extent.height)
  guard long > limit else { return img }
  let s = limit / long
  return atOrigin(img.applyingFilter("CILanczosScaleTransform", parameters: [kCIInputScaleKey: s, kCIInputAspectRatioKey: 1]))
}

let imageTypes: Set<String> = ["jpg", "jpeg", "png", "heic", "heif", "tif", "tiff", "webp", "gif", "bmp", "dng"]
func isImage(_ url: URL) -> Bool { imageTypes.contains(url.pathExtension.lowercased()) }

func loadImage(_ url: URL) -> CIImage {
  guard let img = CIImage(contentsOf: url, options: [.applyOrientationProperty: true]) else { fail("can't read \(url.path)") }
  return atOrigin(img)
}

func orientation(_ t: CGAffineTransform) -> CGImagePropertyOrientation {
  switch (t.a, t.b, t.c, t.d) {
  case (0, 1, -1, 0): return .right
  case (0, -1, 1, 0): return .left
  case (-1, 0, 0, -1): return .down
  default: return .up
  }
}

struct VideoInfo { let fps: Double; let duration: Double; let transform: CGAffineTransform; let track: AVAssetTrack; let asset: AVURLAsset }
func videoInfo(_ url: URL) async throws -> VideoInfo {
  let asset = AVURLAsset(url: url)
  guard let track = try await asset.loadTracks(withMediaType: .video).first else { fail("no video in \(url.path)") }
  let (transform, fps) = try await track.load(.preferredTransform, .nominalFrameRate)
  let duration = try await asset.load(.duration).seconds
  return VideoInfo(fps: Double(fps > 0 ? fps : 30), duration: duration, transform: transform, track: track, asset: asset)
}

/// Decodes a stretch of a video in order and hands each frame (upright) to `body` until it returns false.
func frames(_ v: VideoInfo, from: Double, to: Double?, copy: Bool = false, _ body: (Double, CIImage, CMSampleBuffer) throws -> Bool) throws {
  let reader = try AVAssetReader(asset: v.asset)
  let out = AVAssetReaderTrackOutput(track: v.track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
  out.alwaysCopiesSampleData = copy
  reader.add(out)
  let start = CMTime(seconds: max(0, from), preferredTimescale: 600)
  reader.timeRange = to.map { CMTimeRange(start: start, end: CMTime(seconds: $0, preferredTimescale: 600)) } ?? CMTimeRange(start: start, duration: .positiveInfinity)
  guard reader.startReading() else { fail(reader.error?.localizedDescription ?? "can't decode") }
  let o = orientation(v.transform)
  while let sb = out.copyNextSampleBuffer() {
    guard let pb = CMSampleBufferGetImageBuffer(sb) else { continue }
    let t = CMSampleBufferGetPresentationTimeStamp(sb).seconds
    if t < from - 0.0005 { continue }
    if try !body(t, atOrigin(CIImage(cvPixelBuffer: pb).oriented(o)), sb) { reader.cancelReading(); break }
  }
}

// MARK: - subjects: faces and people, linked into tracks

final class Track {
  let kind: String
  var samples: [[Double]] = []
  var last: Box
  var lastT: Double
  var confidence: [Double] = []
  init(kind: String, t: Double, box: Box, conf: Double) {
    self.kind = kind; last = box; lastT = t
    add(t, box, conf)
  }
  func add(_ t: Double, _ b: Box, _ conf: Double) {
    samples.append([r3(t), r4(b.x), r4(b.y), r4(b.w), r4(b.h)])
    confidence.append(conf)
    last = b; lastT = t
  }
}

func detect(_ img: CIImage) throws -> [(String, Box, Double)] {
  let faces = VNDetectFaceRectanglesRequest()
  let people = VNDetectHumanRectanglesRequest()
  people.upperBodyOnly = false
  try VNImageRequestHandler(ciImage: img, options: [:]).perform([faces, people])
  var found: [(String, Box, Double)] = []
  for f in faces.results ?? [] where f.boundingBox.width >= 0.02 { found.append(("face", topLeft(f.boundingBox), Double(f.confidence))) }
  for p in people.results ?? [] where p.confidence > 0.3 { found.append(("person", topLeft(p.boundingBox), Double(p.confidence))) }
  return found
}

/// How likely a detection continues a track: overlapping, about the same size, not too far from where it was (allowing
/// more distance the longer it's been unseen). Nil when it can't be the same thing.
func continues(_ tr: Track, _ b: Box, at t: Double) -> Double? {
  let a = tr.last
  let ratio = max(a.w / max(b.w, 1e-6), b.w / max(a.w, 1e-6))
  if ratio > 1.6 { return nil }
  let size = max(a.w, a.h, b.w, b.h)
  let dx = (a.x + a.w / 2) - (b.x + b.w / 2), dy = (a.y + a.h / 2) - (b.y + b.h / 2)
  let dist = (dx * dx + dy * dy).squareRoot() / size
  let reach = 0.9 + min(1.0, (t - tr.lastT) * 0.8)
  if dist > reach { return nil }
  return iou(a, b) + (1 - dist / reach) * 0.5
}

func link(_ tracks: inout [Track], _ dets: [(String, Box, Double)], at t: Double, gap: Double) {
  var open = tracks.filter { t - $0.lastT <= gap }
  var pairs: [(Double, Track, Int)] = []
  for (i, d) in dets.enumerated() {
    for tr in open where tr.kind == d.0 {
      if let score = continues(tr, d.1, at: t) { pairs.append((score, tr, i)) }
    }
  }
  pairs.sort { $0.0 > $1.0 }
  var used = Set<Int>()
  for (_, tr, i) in pairs where !used.contains(i) && open.contains(where: { $0 === tr }) {
    tr.add(t, dets[i].1, dets[i].2)
    used.insert(i)
    open.removeAll { $0 === tr }
  }
  for (i, d) in dets.enumerated() where !used.contains(i) { tracks.append(Track(kind: d.0, t: t, box: d.1, conf: d.2)) }
}

func subjects(_ url: URL) async throws {
  let every = number("every") ?? 0.2
  var tracks: [Track] = []
  var info: [String: Any] = [:]
  if isImage(url) {
    let img = fit(loadImage(url), 2400)
    for d in try detect(img) { tracks.append(Track(kind: d.0, t: 0, box: d.1, conf: d.2)) }
    info = ["width": img.extent.width, "height": img.extent.height]
  } else {
    let v = try await videoInfo(url)
    let from = number("from") ?? 0, to = number("to") ?? v.duration
    var next = from
    try frames(v, from: from, to: to) { t, img, _ in
      guard t + 0.0005 >= next else { return true }
      next = t + every
      link(&tracks, try detect(img), at: t, gap: max(1.0, every * 4))
      progress((t - from) / max(0.001, to - from))
      return true
    }
    info = ["duration": v.duration, "fps": v.fps]
  }
  // A face seen once in a clip is usually a false alarm or a passer-by too brief to matter.
  let keep = tracks.filter { isImage(url) || $0.samples.count >= 3 }
  info["tracks"] = keep
    .sorted { ($0.kind, -$0.samples.count) < ($1.kind, -$1.samples.count) }
    .prefix(16)
    .map { ["kind": $0.kind, "samples": $0.samples, "confidence": r3($0.confidence.reduce(0, +) / Double($0.confidence.count))] }
  progress(1)
  emit(info)
}

// MARK: - track: follow a boxed object both ways from the frame it was boxed on

func trackObject(_ url: URL) async throws {
  guard let at = number("at"), let box = parseBox(flag("box")) else { fail("track needs --at and --box") }
  let every = number("every") ?? 0.1
  let v = try await videoInfo(url)
  let from = max(0, number("from") ?? 0), to = min(v.duration, number("to") ?? v.duration)
  var samples: [[Double]] = [[r3(at), r4(box.x), r4(box.y), r4(box.w), r4(box.h)]]
  var lostForward = false, lostBackward = false

  // Each frame is matched against the last; a run of low confidence means it left the frame or got covered.
  func follower() -> (CIImage) throws -> (Box, Double) {
    // One request for the whole run, fed its own last result: that's what keeps the tracker's state.
    let handler = VNSequenceRequestHandler()
    let req = VNTrackObjectRequest(detectedObjectObservation: VNDetectedObjectObservation(boundingBox: visionRect(box)))
    req.trackingLevel = .accurate
    // When the object leaves the frame Vision keeps answering with the same box, frozen; that counts as lost.
    var frozen = 0
    return { img in
      try handler.perform([req], on: img)
      guard let r = req.results?.first as? VNDetectedObjectObservation else { return (topLeft(req.inputObservation.boundingBox), 0) }
      frozen = r.boundingBox == req.inputObservation.boundingBox ? frozen + 1 : 0
      req.inputObservation = r
      return (topLeft(r.boundingBox), frozen > 2 ? 0 : Double(r.confidence))
    }
  }

  let span = max(0.001, to - from)
  var done = 0.0
  // Forward from the boxed frame.
  do {
    let step = follower()
    var next = at + every, weak = 0
    try frames(v, from: at + 0.001, to: to) { t, img, _ in
      let (b, conf) = try step(img)
      weak = conf < 0.3 ? weak + 1 : 0
      if weak > 6 { lostForward = true; return false }
      if t + 0.0005 >= next, conf >= 0.3 { samples.append([r3(t), r4(b.x), r4(b.y), r4(b.w), r4(b.h)]); next = t + every }
      progress((done + t - at) / span)
      return true
    }
    done += to - at
  }
  // Backward, a second at a time: decode the second before, then walk it in reverse.
  if at > from {
    let step = follower()
    var end = at, next = at - every, weak = 0
    windows: while end > from + 0.001 {
      let start = max(from, end - 1)
      var window: [(Double, CIImage, CMSampleBuffer)] = []
      try frames(v, from: start, to: end, copy: true) { t, img, sb in
        if t < end - 0.0005 { window.append((t, img, sb)) }
        return true
      }
      for (t, img, _) in window.reversed() {
        let (b, conf) = try step(img)
        weak = conf < 0.3 ? weak + 1 : 0
        if weak > 6 { lostBackward = true; break windows }
        if t - 0.0005 <= next, conf >= 0.3 { samples.append([r3(t), r4(b.x), r4(b.y), r4(b.w), r4(b.h)]); next = t - every }
        progress((done + at - t) / span)
      }
      end = start
    }
  }
  samples.sort { $0[0] < $1[0] }
  progress(1)
  emit(["samples": samples, "lostForward": lostForward, "lostBackward": lostBackward, "duration": v.duration])
}

// MARK: - cutout: lift subjects out of one picture

func instancesRequest(_ mode: String) -> VNImageBasedRequest {
  mode == "people" ? VNGeneratePersonInstanceMaskRequest() : VNGenerateForegroundInstanceMaskRequest()
}

func writePNG(_ img: CIImage, _ path: String) throws {
  try ci.writePNGRepresentation(of: img, to: URL(fileURLWithPath: path), format: .RGBA8, colorSpace: srgb)
}

func cutoutStill(_ url: URL) async throws {
  guard let out = flag("out") else { fail("cutout needs --out") }
  let mode = flag("mode") ?? "subject"
  var img: CIImage
  if isImage(url) {
    img = loadImage(url)
  } else {
    let v = try await videoInfo(url)
    let at = number("at") ?? 0
    var grabbed: CIImage?
    try frames(v, from: at, to: nil) { _, frame, _ in
      grabbed = ci.createCGImage(frame, from: frame.extent).map { CIImage(cgImage: $0) }
      return false
    }
    guard let g = grabbed else { fail("no frame at \(at)s") }
    img = g
  }
  img = fit(img, 2400)
  let handler = VNImageRequestHandler(ciImage: img, options: [:])
  let req = instancesRequest(mode)
  try handler.perform([req])
  guard let obs = req.results?.first as? VNInstanceMaskObservation, !obs.allInstances.isEmpty else {
    fail(mode == "people" ? "no people found" : "no subject found")
  }
  let found = instanceBounds(obs)
  var chosen: [[Int]]
  if let p = parsePoint(flag("point")) {
    guard let i = instanceAt(obs, p) else { fail("nothing to lift at that point") }
    chosen = [[i]]
  } else if let b = parseBox(flag("box")) {
    guard let best = found.max(by: { iou($0.1, b) < iou($1.1, b) }), iou(best.1, b) > 0.05 else { fail("nothing to lift in that box") }
    chosen = [[best.0]]
  } else if has("each") {
    // Largest first, so piece-by-piece builds start with the big shapes.
    chosen = found.sorted { $0.1.area > $1.1.area }.map { [$0.0] }
  } else {
    chosen = [Array(obs.allInstances)]
  }
  var results: [[String: Any]] = []
  for (n, set) in chosen.enumerated() {
    let path = chosen.count > 1 || has("each") ? "\(out)-\(n + 1).png" : (out.hasSuffix(".png") ? out : "\(out).png")
    let masked = try obs.generateMaskedImage(ofInstances: IndexSet(set), from: handler, croppedToInstancesExtent: false)
    try writePNG(CIImage(cvPixelBuffer: masked), path)
    // The soft mask, thresholded, gives a tighter box than the instance labels (which keep faint stray pixels).
    let box = bounds(of: try obs.generateScaledMaskForImage(forInstances: IndexSet(set), from: handler), stride: 4)
    results.append(["file": path, "box": box?.json ?? [:]])
  }
  emit(["cutouts": results, "width": img.extent.width, "height": img.extent.height])
}

// MARK: - cutout-video: lift the subject out of every frame, streamed to stdout as raw RGBA for the engine to encode

func say(_ line: String) { FileHandle.standardError.write("\(line)\n".data(using: .utf8)!) }

func cutoutVideo(_ url: URL) async throws {
  let mode = flag("mode") ?? "people"
  let v = try await videoInfo(url)
  let from = number("from") ?? 0, to = min(v.duration, number("to") ?? v.duration)
  let fps = min(v.fps, number("fps") ?? 30)
  let limit = number("max") ?? 1920
  var follow: [[Double]] = []
  if let path = flag("follow") {
    let data = try Data(contentsOf: URL(fileURLWithPath: path))
    follow = (try JSONSerialization.jsonObject(with: data) as? [[Double]]) ?? []
  }
  let out = FileHandle.standardOutput
  var n = 0, next = from
  var extent: Box?
  var width = 0, height = 0
  var bitmap = [UInt8]()
  // People without one to follow: the person segmentation made for video, steady from frame to frame.
  let segment = VNGeneratePersonSegmentationRequest()
  segment.qualityLevel = .accurate
  segment.outputPixelFormat = kCVPixelFormatType_OneComponent8
  try frames(v, from: from, to: to) { t, raw, _ in
    guard t + 0.0005 >= next else { return true }
    next += 1 / fps
    let img = fit(raw, limit)
    if width == 0 {
      width = Int(img.extent.width.rounded()); height = Int(img.extent.height.rounded())
      bitmap = [UInt8](repeating: 0, count: width * height * 4)
      say("size \(width)x\(height) \(fps)")
    }
    let handler = VNImageRequestHandler(ciImage: img, options: [:])
    var mask: CIImage?
    var box: Box?
    if mode == "people" && follow.isEmpty {
      try handler.perform([segment])
      if let pb = segment.results?.first?.pixelBuffer {
        box = bounds(of: pb)
        let m = CIImage(cvPixelBuffer: pb)
        mask = m.transformed(by: CGAffineTransform(scaleX: img.extent.width / m.extent.width, y: img.extent.height / m.extent.height))
      }
    } else {
      let req = instancesRequest(mode)
      try handler.perform([req])
      if let obs = req.results?.first as? VNInstanceMaskObservation, !obs.allInstances.isEmpty {
        var set = obs.allInstances
        if let want = boxAt(follow, t) {
          let found = instanceBounds(obs)
          if let best = found.max(by: { iou($0.1, want) < iou($1.1, want) }), iou(best.1, want) > 0.05 { set = IndexSet(integer: best.0) } else { set = IndexSet() }
        }
        if !set.isEmpty {
          let pb = try obs.generateScaledMaskForImage(forInstances: set, from: handler)
          box = bounds(of: pb, stride: 4)
          mask = CIImage(cvPixelBuffer: pb)
        }
      }
    }
    n += 1
    let area = CGRect(x: 0, y: 0, width: width, height: height)
    let clear = CIImage(color: .clear).cropped(to: area)
    let frame = mask.map { img.applyingFilter("CIBlendWithMask", parameters: [kCIInputBackgroundImageKey: clear, kCIInputMaskImageKey: $0]) } ?? clear
    // Straight (not premultiplied) alpha, which is what ffmpeg's rgba means.
    bitmap.withUnsafeMutableBytes { ptr in
      ci.render(frame.unpremultiplyingAlpha().cropped(to: area), toBitmap: ptr.baseAddress!, rowBytes: width * 4, bounds: area, format: .RGBA8, colorSpace: srgb)
    }
    out.write(Data(bitmap))
    if let b = box { extent = extent.map { $0.union(b) } ?? b }
    progress((t - from) / max(0.001, to - from))
    return true
  }
  progress(1)
  let result: [String: Any] = ["frames": n, "fps": fps, "width": width, "height": height, "box": extent?.json ?? [:], "from": from, "to": to]
  say("result " + String(data: try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]), encoding: .utf8)!)
}

// MARK: - Main

guard args.count >= 2 else { fail("usage: beatsheet-vision <subjects|track|cutout|cutout-video> <file> [options]") }
let file = URL(fileURLWithPath: args[1])
guard FileManager.default.fileExists(atPath: file.path) else { fail("no file at \(file.path)") }
do {
  switch args[0] {
  case "subjects": try await subjects(file)
  case "track": try await trackObject(file)
  case "cutout": try await cutoutStill(file)
  case "cutout-video": try await cutoutVideo(file)
  default: fail("unknown command \(args[0])")
  }
} catch {
  fail(error.localizedDescription)
}
