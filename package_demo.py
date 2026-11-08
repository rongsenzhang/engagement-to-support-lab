"""Package the offline app and its reproducible sources. No third-party packages needed."""
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent

def main():
    dist = ROOT / 'dist'
    dist.mkdir(exist_ok=True)
    html = (ROOT / 'web/index.html').read_text(encoding='utf-8')
    html = html.replace('<link rel="stylesheet" href="styles.css">',
                        '<style>' + (ROOT / 'web/styles.css').read_text(encoding='utf-8') + '</style>')
    for name in ('data.js', 'app.js'):
        code = (ROOT / 'web' / name).read_text(encoding='utf-8')
        code = code.replace('</script', '<\\/script')
        html = html.replace('<script src="' + name + '"></script>', '<script>' + code + '</script>')
    app = dist / 'Engagement_Lab_v1.html'
    app.write_text(html, encoding='utf-8')
    source = dist / 'Engagement_Lab_v1_Source.zip'
    excluded = {'.venv', 'data', 'dist', '__pycache__', '.pytest_cache', '.git'}
    with ZipFile(source, 'w', ZIP_DEFLATED, compresslevel=8) as archive:
        for path in sorted(ROOT.rglob('*')):
            relative = path.relative_to(ROOT)
            if not path.is_file() or excluded.intersection(relative.parts):
                continue
            if path.suffix in {'.log', '.pyc'} or path.name == '.DS_Store':
                continue
            archive.write(path, 'engagement_lab/' + relative.as_posix())
    info = {p.name: {'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
            for p in (app, source)}
    (dist / 'checksums.json').write_text(json.dumps(info, indent=2) + '\n')
    print(json.dumps(info, indent=2))

if __name__ == '__main__':
    main()
