"""Rebuild the bundled animated WebPs from the retained MP4 sources.
Requires ffmpeg and Pillow with animated WebP support.
"""
import concurrent.futures
import json
from pathlib import Path
import subprocess
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets/cast'
SIZE, FPS, QUALITY = 256, 8, 35


def convert(path):
    source = ASSETS / Path(path).with_suffix('.mp4')
    target = source.with_suffix('.webp')
    raw = subprocess.check_output([
        'ffmpeg', '-v', 'error', '-i', str(source),
        '-vf', f'fps={FPS},scale={SIZE}:{SIZE}', '-f', 'rawvideo',
        '-pix_fmt', 'rgb24', '-threads', '1', 'pipe:1',
    ])
    frame_size = SIZE * SIZE * 3
    assert raw and len(raw) % frame_size == 0, f'Incomplete frames: {source}'
    frames = [Image.frombytes('RGB', (SIZE, SIZE), raw[i:i + frame_size])
              for i in range(0, len(raw), frame_size)]
    frames[0].save(target, save_all=True, append_images=frames[1:],
                   duration=1000 // FPS, loop=0, quality=QUALITY,
                   method=4, minimize_size=True)
    with Image.open(target) as image:
        assert image.is_animated and image.n_frames > 1, target
        assert image.size == (SIZE, SIZE) and image.info['loop'] == 0, target
        assert target.stat().st_size <= 96 * 1024, f'Animation exceeds 96 KiB: {target}'
    return {'file': str(target.relative_to(ASSETS)),
            'source_bytes': source.stat().st_size, 'bytes': target.stat().st_size}


def main():
    faces = json.loads((ASSETS / 'cast.json').read_text())
    paths = [face[mode] for face in faces for mode in ('idle', 'talk', 'smile')]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        report = list(pool.map(convert, paths))
    poster_source_bytes = poster_bytes = 0
    for face in faces:
        poster = ASSETS / Path(face['poster']).with_suffix('.jpg')
        target = poster.with_suffix('.webp')
        with Image.open(poster) as image:
            image.convert('RGB').resize((SIZE, SIZE), Image.Resampling.LANCZOS).save(target, quality=65, method=6)
        poster_source_bytes += poster.stat().st_size
        poster_bytes += target.stat().st_size
        face['poster'] = str(target.relative_to(ASSETS))
        for mode in ('idle', 'talk', 'smile'):
            face[mode] = str(Path(face[mode]).with_suffix('.webp'))
    (ASSETS / 'cast.json').write_text(json.dumps(faces, indent=2) + '\n')
    lines = ['// Bundled animated images; originals remain in GitHub for regeneration.', 'export const cast = [']
    for face in faces:
        metadata = ', '.join(f'{key}: {json.dumps(face[key])}' for key in ('id', 'signature', 'description'))
        sources = ', '.join(f'{key}: require({json.dumps("../assets/cast/" + face[key])})' for key in ('idle', 'talk', 'smile', 'poster'))
        lines.append('  { ' + metadata + ', ' + sources + ' },')
    lines.append('] as const;\n')
    (ROOT / 'src/cast.ts').write_text('\n'.join(lines))
    source_total = sum(item['source_bytes'] for item in report)
    total = sum(item['bytes'] for item in report)
    print(json.dumps({'animations': len(report), 'source_bytes': source_total,
                      'webp_bytes': total, 'average_bytes': total // len(report),
                      'largest_bytes': max(item['bytes'] for item in report),
                      'poster_bytes': poster_bytes, 'source_total_bytes': source_total + poster_source_bytes,
                      'optimized_total_bytes': total + poster_bytes, 'dimensions': SIZE, 'fps': FPS}, indent=2))


if __name__ == '__main__':
    main()
