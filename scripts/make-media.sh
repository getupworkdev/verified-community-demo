#!/bin/bash
# Generates abstract, initial-based sample photos and intro videos (no real people).
set -e
OUT="$(dirname "$0")/../seed-media"
mkdir -p "$OUT" "$(dirname "$0")/../public/samples"
FONT="/System/Library/Fonts/Supplemental/Georgia.ttf"
SANS="/System/Library/Fonts/Supplemental/Arial.ttf"
# name|initial|hue|seconds
MEMBERS="ruth|R|0|22 david|D|0|24 james|J|1|21 samuel|S|3|19 mark|M|2|23 grace|G|1|20 thomas|T|0|25 elena|E|2|22 john|J|1|26 sarah|S|3|18 tom|T|2|20 daniel|D|1|23 lucia|L|2|21 peter|P|0|24 paul|P|3|20 victor|V|1|22 kevin|K|3|18"
bg() { case $1 in 0) echo "0xC8D8CC 0x2F5D47 0xE4EDE6";; 1) echo "0xDAE1EA 0x1F3B57 0xEDF1F6";; 2) echo "0xEFE3D6 0x7A5A2E 0xF7EFE6";; 3) echo "0x3A4652 0xE8EEF2 0x51606E";; esac; }
make() {
  local name=$1 init=$2 hue=$3 secs=$4 dir=$5 photoname=$6 videoname=$7 label=$8
  read BG FG SOFT <<< "$(bg $hue)"
  ffmpeg -loglevel error -y -f lavfi -i "color=c=$BG:s=800x1000" -frames:v 1 \
    -vf "drawtext=fontfile=$FONT:text=$init:fontcolor=$FG:fontsize=360:x=(w-text_w)/2:y=(h-text_h)/2-60" \
    -q:v 3 "$dir/$photoname"
  ffmpeg -loglevel error -y -f lavfi -i "color=c=$BG:s=540x960:r=24:d=$secs" -f lavfi -i "sine=frequency=196:sample_rate=44100:d=$secs" \
    -filter_complex "[0:v]drawbox=x=0:y=600:w=540:h=360:color=$SOFT@0.5:t=fill,drawtext=fontfile=$FONT:text=$init:fontcolor=$FG:fontsize=220:x=(w-text_w)/2:y=300-text_h/2+12*sin(t*1.3),drawtext=fontfile=$SANS:text='$label':fontcolor=$FG:fontsize=26:x=(w-text_w)/2:y=700,drawtext=fontfile=$SANS:text='Prompt %{eif\:min(5\,1+floor(t/($secs/5)))\:d} of 5':fontcolor=$FG:fontsize=22:x=(w-text_w)/2:y=750,drawbox=x=60:y=860:w=420*t/$secs:h=6:color=$FG@0.7:t=fill[v];[1:a]volume=0.04[a]" \
    -map "[v]" -map "[a]" -c:v libx264 -profile:v main -pix_fmt yuv420p -crf 30 -preset veryfast -c:a aac -b:a 48k -movflags +faststart -shortest "$dir/$videoname"
}
for m in $MEMBERS; do IFS='|' read n i h s <<< "$m"
  label="$(echo ${n:0:1} | tr a-z A-Z)${n:1}  ·  sample introduction"
  [ "$n" = john ] && label="Pastor John  ·  sample introduction"
  make $n $i $h $s "$OUT" "$n-photo.jpg" "$n-video.mp4" "$label"
done
make you Y 1 20 "$(dirname "$0")/../public/samples" sample-photo.jpg sample-video.mp4 "Your sample introduction"
ls -la "$OUT" | head -5; du -sh "$OUT"
