// Makes the fake-camera videos for t39_tiltscan: synthetic tilt series (tests/tiltsynth.mjs)
// placed where the tilt sheet's card frame sits in a 640x480 camera picture.
// Usage: node tools/uitest/mk_tilt_video.mjs [outdir]   (needs ffmpeg; default /home/claude/work/tilt)
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { synthFrames } from '../../tests/tiltsynth.mjs';
const out = process.argv[2] || '/home/claude/work/tilt';
mkdirSync(out, { recursive: true });
for (const kind of ['ultra', 'common']) {
  const f = synthFrames(kind, { T: 24, seed: 3 });
  writeFileSync(`${out}/${kind}.raw`, Buffer.concat(f.map((x) => Buffer.from(x.data.buffer))));
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', '92x125', '-r', '10',
    '-i', `${out}/${kind}.raw`, '-vf', 'scale=303:411:flags=bicubic,pad=640:480:169:34:color=0x302c28',
    '-pix_fmt', 'yuv420p', `${out}/${kind}.y4m`]);
  console.log(`${out}/${kind}.y4m`);
}
