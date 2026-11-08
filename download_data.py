"""Download the original OULAD archive from UCI and safely extract CSVs."""
from pathlib import Path
import hashlib
import urllib.request
import zipfile

ROOT=Path(__file__).resolve().parent
URL='https://archive.ics.uci.edu/static/public/349/open+university+learning+analytics+dataset.zip'

if __name__=='__main__':
    data=ROOT/'data'; data.mkdir(exist_ok=True)
    archive=data/'oulad.zip'
    if not archive.exists():
        print('Downloading OULAD (approximately 45 MB)...')
        urllib.request.urlretrieve(URL,archive)
    raw=data/'raw';raw.mkdir(exist_ok=True)
    with zipfile.ZipFile(archive) as z:
        for info in z.infolist():
            target=(raw/info.filename).resolve()
            if raw.resolve() not in target.parents: raise ValueError('Unsafe archive member')
        z.extractall(raw)
    print('SHA256:',hashlib.sha256(archive.read_bytes()).hexdigest())
    print('Ready:',raw)
