#!/bin/bash
# Builds the ffmpeg and ffprobe the desktop app carries, from source, so the app ships programs made here from pinned
# sources and nothing prebuilt by anyone else. They land in apps/desktop/vendor/darwin-<arch>/, and the desktop build
# (apps/desktop/scripts/build.mjs) copies them into the folder of programs the app puts ahead of the PATH.
#
#   scripts/build-ffmpeg.sh          builds what isn't built yet (about ten minutes the first time)
#   scripts/build-ffmpeg.sh --clean  throws the work folder away first
#
# What's in it is what the engine asks ffmpeg for and no more: x264 (previews and exports), libvpx (cut-outs with
# see-through edges), Opus and LAME (sound), vid.stab (steadying old footage), dav1d (reading AV1), and macOS's own
# VideoToolbox and AudioToolbox. The checks at the end are the list; add to both when the engine uses something new.
# x264 and vid.stab make it a GPL build (version 2 or later), which is why it's a separate program the app runs and
# why the sources are kept: apps/desktop/vendor/sources/ holds exactly what was built, to publish beside the app.
#
# It needs Xcode's command line tools (clang, make) and uv, which beatsheet already uses. cmake, meson and ninja come
# through uv at pinned versions, and pkgconf is built here, so nothing is installed on the machine and nothing of
# Homebrew's is linked in. Every source is checked against a SHA-256 (the ones Homebrew pins for the same releases);
# x264 has no releases, so it's pinned to a commit of its stable branch.
#
# macOS only. Windows needs its own way to the same result (a cross-build, or MSYS2); the list of what's in it is the
# same.
set -euo pipefail

FFMPEG_VERSION=9.1
SOURCES=(
  # name      version   file                      sha256                                                            url
  "pkgconf    3.0.11    pkgconf-3.0.11.tar.xz     d0cd841bc8e55b9da888106c00dc256d05b7d1d8e5a46f4be4eb4c5125bd2dc4  https://distfiles.ariadne.space/pkgconf/pkgconf-3.0.11.tar.xz"
  "libvpx     1.17.0    libvpx-1.17.0.tar.gz      1020f184046187baa2985dbde38e0691f49c44088bca7a1842b0236c6081dc0a  https://github.com/webmproject/libvpx/archive/refs/tags/v1.17.0.tar.gz"
  "opus       1.6.1     opus-1.6.1.tar.gz         6ffcb593207be92584df15b32466ed64bbec99109f007c82205f0194572411a1  https://ftp.osuosl.org/pub/xiph/releases/opus/opus-1.6.1.tar.gz"
  "lame       4.0       lame-4.0.tar.gz           3df5124d5ad3a98312ffd7ba6a9b36230e4f8a3e66d3ce0f425e336c32d216eb  https://downloads.sourceforge.net/project/lame/lame/4.0/lame-4.0.tar.gz"
  "vidstab    1.1.2     vid.stab-1.1.2.tar.gz     96db34d48a9e3aa13736a48744b56dfb76731ac9bb5193c716de8534c9fd709d  https://github.com/georgmartius/vid.stab/archive/refs/tags/v1.1.2.tar.gz"
  "dav1d      1.5.5     dav1d-1.5.5.tar.bz2       afc5378daba30eafd11d7b4f0ec863270d7b175f38393a2e1e0ff76f3a45c8b9  https://code.videolan.org/videolan/dav1d/-/archive/1.5.5/dav1d-1.5.5.tar.bz2"
  "ffmpeg     $FFMPEG_VERSION       ffmpeg-$FFMPEG_VERSION.tar.xz         1a4d394ae63d190a526cd052eb4415c156b5c5e2df37efab41a7de0b8fde2433  https://www.ffmpeg.org/releases/ffmpeg-$FFMPEG_VERSION.tar.xz"
)
X264_REPO=https://code.videolan.org/videolan/x264.git
X264_COMMIT=b35605ace3ddf7c1a5d67a2eb553f034aef41d55 # the stable branch, r3222
CMAKE=cmake==4.4.5 MESON=meson==1.12.1 NINJA=ninja==1.13.2

# The oldest macOS the app runs on (the Swift helpers set it: SWIFT_TARGET in packages/engine/src/native.ts).
MACOS_MIN=14.0
DARWIN_MIN=23 # the same, as libvpx names it

[ "$(uname -s)" = Darwin ] || { echo "This builds the Mac's ffmpeg; run it on a Mac." >&2; exit 1; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ARCH="$(uname -m)"                                   # arm64 or x86_64
NODE_ARCH="$([ "$ARCH" = x86_64 ] && echo x64 || echo "$ARCH")" # as Node names it, which is how the app looks for it
VENDOR="$ROOT/apps/desktop/vendor"
OUT="$VENDOR/darwin-$NODE_ARCH"
KEPT="$VENDOR/sources"
WORK="$VENDOR/work-darwin-$NODE_ARCH"
PREFIX="$WORK/prefix"
JOBS="$(sysctl -n hw.ncpu)"

UV="$(command -v uv || true)"
[ -n "$UV" ] || { echo "uv isn't installed (https://docs.astral.sh/uv/). It brings cmake, meson and ninja for this build." >&2; exit 1; }
xcrun --find clang >/dev/null 2>&1 || { echo "Xcode's command line tools aren't installed. Run: xcode-select --install" >&2; exit 1; }
[ "${1:-}" = "--clean" ] && rm -rf "$WORK"
mkdir -p "$KEPT" "$WORK" "$PREFIX/bin" "$OUT"

# Only the system's tools and what's built here: nothing of Homebrew's can be found, so nothing of it is linked in.
export PATH="$PREFIX/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export MACOSX_DEPLOYMENT_TARGET="$MACOS_MIN"
export PKG_CONFIG="$PREFIX/bin/pkgconf"
export PKG_CONFIG_LIBDIR="$PREFIX/lib/pkgconfig"
export CC=clang CXX=clang++
unset CFLAGS CXXFLAGS CPPFLAGS LDFLAGS PKG_CONFIG_PATH

say() { printf '\n== %s\n' "$*"; }
field() { echo "$1" | awk -v n="$2" '{print $n}'; }
source_of() { for s in "${SOURCES[@]}"; do [ "$(field "$s" 1)" = "$1" ] && echo "$s" && return; done; echo "no source called $1" >&2; exit 1; }

# Downloads a source into vendor/sources (once) and checks it's the file that was pinned.
fetch() {
  local s file sum url
  s="$(source_of "$1")"; file="$KEPT/$(field "$s" 3)"; sum="$(field "$s" 4)"; url="$(field "$s" 5)"
  if [ ! -f "$file" ]; then
    curl -fL --retry 3 --silent --show-error -o "$file.part" "$url"
    mv "$file.part" "$file"
  fi
  echo "$sum  $file" | shasum -a 256 -c --quiet - || { echo "$(basename "$file") isn't the file that was pinned (wrong SHA-256). Remove it and run this again." >&2; exit 1; }
}

# Unpacks a source into a fresh folder in the work folder: $DIR.
unpack() {
  local s
  s="$(source_of "$1")"; DIR="$WORK/$1-$(field "$s" 2)"
  rm -rf "$DIR"; mkdir -p "$DIR"
  tar -xf "$KEPT/$(field "$s" 3)" -C "$DIR" --strip-components 1
}

# Runs a step once per version: `once <name> <version> <function>`. Each runs in its own shell that stops at the
# first thing to fail (which a function called before `||` wouldn't), with what it printed kept in a log.
once() {
  local mark="$WORK/.built-$1-$2" status
  if [ -f "$mark" ]; then return; fi
  say "$1 $2"
  set +e
  ( set -e; "$3" ) > "$WORK/$1.log" 2>&1
  status=$?
  set -e
  if [ "$status" != 0 ]; then
    tail -40 "$WORK/$1.log" >&2
    echo "$1 didn't build; the whole log is $WORK/$1.log" >&2
    exit 1
  fi
  touch "$mark"
}
version_of() { field "$(source_of "$1")" 2; }

build_pkgconf() {
  fetch pkgconf; unpack pkgconf; cd "$DIR"
  ./configure --prefix="$PREFIX" --disable-shared --with-pkg-config-dir="$PREFIX/lib/pkgconfig" --with-system-libdir=/usr/lib --with-system-includedir=/usr/include
  make -j"$JOBS" install
}

build_x264() {
  local dir="$WORK/x264-$X264_COMMIT"
  rm -rf "$dir"
  git -c advice.detachedHead=false clone --quiet "$X264_REPO" "$dir"
  git -C "$dir" -c advice.detachedHead=false checkout --quiet "$X264_COMMIT"
  [ "$(git -C "$dir" rev-parse HEAD)" = "$X264_COMMIT" ] || { echo "x264 isn't at the pinned commit" >&2; exit 1; }
  # The source as built, kept with the others.
  git -C "$dir" archive --format=tar.gz --prefix="x264-$X264_COMMIT/" -o "$KEPT/x264-$X264_COMMIT.tar.gz" "$X264_COMMIT"
  cd "$dir"
  ./configure --prefix="$PREFIX" --enable-static --disable-cli --disable-opencl --disable-lsmash --disable-swscale --disable-ffms --disable-avs --disable-gpac --disable-lavf --enable-pic
  make -j"$JOBS" install
}

build_libvpx() {
  fetch libvpx; unpack libvpx
  mkdir "$DIR/macbuild"; cd "$DIR/macbuild"
  # Named for the oldest macOS it should run on, which is also what sets its minimum version.
  ../configure --prefix="$PREFIX" --target="$ARCH-darwin$DARWIN_MIN-gcc" --disable-dependency-tracking --disable-examples --disable-tools --disable-docs --disable-unit-tests --enable-pic --enable-runtime-cpu-detect --enable-vp9-highbitdepth --disable-shared --enable-static
  make -j"$JOBS" install
}

build_opus() {
  fetch opus; unpack opus; cd "$DIR"
  ./configure --prefix="$PREFIX" --disable-shared --enable-static --disable-doc --disable-extra-programs --disable-dependency-tracking
  make -j"$JOBS" install
}

build_lame() {
  fetch lame; unpack lame; cd "$DIR"
  # LAME still calls undeclared legacy ID3 functions, which don't compile as C23 (its bug 517). Only its encoder is
  # wanted: reading MP3 is ffmpeg's own, and LAME's decoder would bring in mpg123.
  ac_cv_prog_cc_c23=no CFLAGS="-Wno-implicit-function-declaration" ./configure --prefix="$PREFIX" --disable-shared --enable-static --disable-frontend --disable-decoder --disable-debug --disable-dependency-tracking
  make -j"$JOBS" install
}

build_vidstab() {
  fetch vidstab; unpack vidstab; cd "$DIR"
  "$UV" tool run --quiet --from "$CMAKE" cmake -S . -B build -G "Unix Makefiles" -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DUSE_OMP=OFF \
    -DCMAKE_INSTALL_PREFIX="$PREFIX" -DCMAKE_OSX_ARCHITECTURES="$ARCH" -DCMAKE_OSX_DEPLOYMENT_TARGET="$MACOS_MIN" -DCMAKE_POLICY_VERSION_MINIMUM=3.5
  "$UV" tool run --quiet --from "$CMAKE" cmake --build build -j"$JOBS"
  "$UV" tool run --quiet --from "$CMAKE" cmake --install build
}

build_dav1d() {
  fetch dav1d; unpack dav1d; cd "$DIR"
  "$UV" tool run --quiet --from "$MESON" --with "$NINJA" meson setup build --prefix="$PREFIX" --libdir=lib --buildtype=release --default-library=static -Denable_tools=false -Denable_tests=false -Denable_examples=false
  "$UV" tool run --quiet --from "$MESON" --with "$NINJA" meson install -C build
}

FFMPEG_CONFIGURE=(
  --prefix="$PREFIX" --cc=clang --arch="$ARCH" --target-os=darwin
  --enable-gpl --disable-shared --enable-static --enable-pthreads
  # Nothing found by looking around the machine: only what's named here.
  --disable-autodetect --pkg-config="$PREFIX/bin/pkgconf" --pkg-config-flags=--static
  --extra-cflags="-I$PREFIX/include" --extra-ldflags="-L$PREFIX/lib"
  # The system's own. iconv is named to the linker too: asked for outright, configure doesn't look for its library.
  --enable-zlib --enable-bzlib --enable-iconv --extra-libs=-liconv
  --enable-videotoolbox --enable-audiotoolbox
  --enable-libx264 --enable-libvpx --enable-libopus --enable-libmp3lame --enable-libvidstab --enable-libdav1d
  --disable-doc --disable-debug --disable-ffplay
)
build_ffmpeg() {
  fetch ffmpeg; unpack ffmpeg; cd "$DIR"
  ./configure "${FFMPEG_CONFIGURE[@]}"
  make -j"$JOBS"
  make install
}

once pkgconf "$(version_of pkgconf)" build_pkgconf
once x264 "$X264_COMMIT" build_x264
once libvpx "$(version_of libvpx)" build_libvpx
once opus "$(version_of opus)" build_opus
once lame "$(version_of lame)" build_lame
once vidstab "$(version_of vidstab)" build_vidstab
once dav1d "$(version_of dav1d)" build_dav1d
once ffmpeg "$FFMPEG_VERSION" build_ffmpeg

say "checking what was built"
FFMPEG="$PREFIX/bin/ffmpeg" FFPROBE="$PREFIX/bin/ffprobe"
fail=0
# It runs on a Mac with nothing installed: only the system's own libraries, and the minimum macOS.
for bin in "$FFMPEG" "$FFPROBE"; do
  other="$(otool -L "$bin" | tail -n +2 | awk '{print $1}' | grep -vE '^(/usr/lib/|/System/Library/)' || true)"
  [ -z "$other" ] || { echo "$(basename "$bin") links to something that isn't the system's: $other" >&2; fail=1; }
  minos="$(xcrun vtool -show-build "$bin" | awk '/minos/ {print $2}')"
  [ "$minos" = "$MACOS_MIN" ] || { echo "$(basename "$bin") is built for macOS $minos, not $MACOS_MIN" >&2; fail=1; }
done
# Everything the engine asks ffmpeg for (grep its ffmpeg calls when adding to this).
has() { # has <what ffmpeg lists> <names...>
  local kind="$1" listed column=2; shift
  [ "$kind" = hwaccels ] && column=1 # a bare list; the others have a column of flags first
  # A line can name several at once ("mov,mp4,m4a,3gp,3g2,mj2").
  listed="$("$FFMPEG" -hide_banner "-$kind" 2>/dev/null | awk -v c="$column" '{print $c}' | tr ',' '\n')"
  for name in "$@"; do echo "$listed" | grep -qx "$name" || { echo "this ffmpeg has no $name (${kind})" >&2; fail=1; }; done
}
has encoders libx264 libvpx-vp9 libopus libmp3lame aac flac pcm_s16le pcm_s24le prores_ks png mjpeg h264_videotoolbox rawvideo
has decoders h264 hevc vp8 vp9 libvpx-vp9 libdav1d prores mpeg2video mpeg4 dvvideo mjpeg png webp gif aac mp3 opus vorbis flac alac pcm_s16le pcm_s24le ac3 eac3
has muxers mp4 mov webm matroska wav mp3 flac ipod image2 null rawvideo s16le segment
has demuxers mov matroska avi mpegts wav mp3 flac ogg aac image2 gif concat s16le
has devices lavfi
has filters scale format fps tile setpts color atrim asetpts aresample normalize loudnorm highpass ebur128 apad anullsrc amix vidstabdetect vidstabtransform testsrc2 silencedetect setsar select nlmeans hqdn3d freezedetect crop bwdif anoisesrc alimiter aformat volumedetect sine overlay concat
has hwaccels videotoolbox
[ "$fail" = 0 ] || { echo "The build is missing something the app needs; nothing was copied." >&2; exit 1; }

cp "$FFMPEG" "$FFPROBE" "$OUT/"
{
  echo "ffmpeg and ffprobe for beatsheet, built from source by scripts/build-ffmpeg.sh."
  echo "Licensed under the GNU General Public License, version 2 or later (it includes x264 and vid.stab)."
  echo "The sources, exactly as built, are in apps/desktop/vendor/sources/ and are published beside the app."
  echo
  echo "For macOS $MACOS_MIN and later, $ARCH."
  echo
  echo "Sources:"
  for s in "${SOURCES[@]}"; do [ "$(field "$s" 1)" = pkgconf ] || echo "  $(field "$s" 1) $(field "$s" 2)  $(field "$s" 5)  sha256 $(field "$s" 4)"; done
  echo "  x264 $X264_COMMIT  $X264_REPO"
  echo
  echo "Configured with:"
  echo "  ${FFMPEG_CONFIGURE[*]}" | sed "s|$PREFIX|<prefix>|g"
  echo
  "$FFMPEG" -hide_banner -version | head -1
} > "$OUT/FFMPEG.txt"
say "done: $OUT"
ls -lh "$OUT" | awk 'NR>1 {print "  " $5 "  " $9}'
