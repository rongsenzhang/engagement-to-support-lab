"""Check the published HTML and every asset against a locally built manifest."""
import argparse
import hashlib
from http.client import HTTPException
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import time
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen


class PageReferences(HTMLParser):
    def __init__(self):
        super().__init__()
        self.meta = {}
        self.assets = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == 'meta':
            self.meta[values.get('name')] = values.get('content')
        if tag == 'script' and 'src' in values:
            self.assets.append(values['src'])
        if tag == 'link' and values.get('rel') == 'stylesheet':
            self.assets.append(values.get('href'))


def validate_manifest(manifest):
    """Only accept the build format and safe, relative content-addressed paths."""
    if manifest.get('schema_version') != 1 or manifest.get('version') != '0.2':
        raise ValueError('Unsupported deployment manifest')
    for field, length in (('build_id', 64), ('revision', 40)):
        if not re.fullmatch('[0-9a-f]{%d}' % length, manifest.get(field, '')):
            raise ValueError('Invalid manifest ' + field)
    if manifest.get('html', {}).get('path') != 'index.html':
        raise ValueError('Manifest must describe index.html')
    assets = manifest.get('assets', {})
    if set(assets) != {'styles.css', 'data.js', 'reference-data.js', 'app.js', 'updates.js'}:
        raise ValueError('Unexpected application assets')
    for logical, asset in assets.items():
        stem, extension = logical.rsplit('.', 1)
        digest = asset.get('sha256', '')
        if asset.get('path') != 'assets/%s.%s.%s' % (stem, digest[:12], extension):
            raise ValueError('Unsafe or unversioned asset path')
    for entry in [manifest['html']] + list(assets.values()):
        if not re.fullmatch('[0-9a-f]{64}', entry.get('sha256', '')):
            raise ValueError('Invalid content checksum')


def fetch(url, diagnostics, revalidate=False):
    headers = {'User-Agent': 'EngagementLab-DeploymentCheck/1'}
    if revalidate:
        headers['Cache-Control'] = 'no-cache, no-store'
    with urlopen(Request(url, headers=headers), timeout=10) as response:
        diagnostics.append({
            'url': url, 'status': response.status,
            'cache_control': response.headers.get('Cache-Control'),
            'age': response.headers.get('Age'),
            'etag': response.headers.get('ETag'),
        })
        return response.read()


def validate_compatibility(compatibility, expected):
    if (compatibility.get('schema_version') != 1 or
            compatibility.get('source_revision') != expected['revision'] or
            not re.fullmatch('[0-9a-f]{40}', compatibility.get('legacy_revision', ''))):
        raise ValueError('Compatibility manifest does not match this source revision')
    assets = compatibility.get('assets', {})
    legacy = {'app.js', 'data.js', 'reference-data.js', 'styles.css'}
    if not isinstance(assets, dict) or not legacy.issubset(assets):
        raise ValueError('Compatibility manifest must retain the four legacy resource URLs')
    for path, digest in assets.items():
        if not isinstance(digest, str) or not re.fullmatch('[0-9a-f]{64}', digest):
            raise ValueError('Invalid compatibility checksum')
        allowed = set(legacy)
        for name in expected['assets']:
            stem, extension = name.rsplit('.', 1)
            allowed.add('assets/%s.%s.%s' % (stem, digest[:12], extension))
        if path not in allowed:
            raise ValueError('Unsafe compatibility resource path')


def check_once(base_url, expected, diagnostics, compatibility=None):
    # The watcher uses a fresh manifest request too. Check canonical HTML
    # separately, without a query or forced revalidation: a new tab must work.
    manifest_url = urljoin(base_url, 'version.json') + '?check=' + str(time.time_ns())
    actual = json.loads(fetch(manifest_url, diagnostics, revalidate=True))
    if actual != expected:
        raise ValueError('Published version.json does not match the expected build/revision')
    html = fetch(base_url, diagnostics)
    if hashlib.sha256(html).hexdigest() != expected['html']['sha256']:
        raise ValueError('Canonical HTML is stale or differs from the expected build')
    page = PageReferences()
    page.feed(html.decode('utf-8'))
    if (page.meta.get('lab-build-id') != expected['build_id'] or
            page.meta.get('lab-version') != expected['version']):
        raise ValueError('HTML build metadata is missing or inconsistent')
    paths = sorted(asset['path'] for asset in expected['assets'].values())
    if sorted(page.assets) != paths:
        raise ValueError('HTML references do not match the versioned assets')
    for asset in expected['assets'].values():
        content = fetch(urljoin(base_url, asset['path']), diagnostics)
        if hashlib.sha256(content).hexdigest() != asset['sha256']:
            raise ValueError('Asset checksum mismatch: ' + asset['path'])
    if compatibility is not None:
        compatibility_url = urljoin(base_url, 'compatibility.json') + '?check=' + str(time.time_ns())
        actual = json.loads(fetch(compatibility_url, diagnostics, revalidate=True))
        if actual != compatibility:
            raise ValueError('Published compatibility manifest does not match this build')
        for path, digest in compatibility['assets'].items():
            if hashlib.sha256(fetch(urljoin(base_url, path), diagnostics)).hexdigest() != digest:
                raise ValueError('Compatibility resource checksum mismatch: ' + path)


def verify_deployment(base_url, expected, timeout=0, interval=20, compatibility=None):
    validate_manifest(expected)
    if compatibility is not None:
        validate_compatibility(compatibility, expected)
    parsed = urlsplit(base_url)
    if (parsed.scheme not in {'http', 'https'} or not parsed.netloc or
            parsed.query or parsed.fragment or parsed.username or parsed.password):
        raise ValueError('Use the HTTP(S) site root URL without credentials, query or fragment')
    if timeout < 0 or interval < 0:
        raise ValueError('Retry durations cannot be negative')
    base_url = base_url.rstrip('/') + '/'
    report = {'url': base_url, 'expected_revision': expected['revision'],
              'expected_build_id': expected['build_id'], 'passed': False, 'attempts': []}
    deadline = time.monotonic() + timeout
    while True:
        attempt = {'responses': []}
        report['attempts'].append(attempt)
        try:
            check_once(base_url, expected, attempt['responses'], compatibility)
        except (OSError, ValueError, HTTPException) as error:
            attempt['error'] = str(error)
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return report
            time.sleep(min(interval, remaining))
        else:
            report['passed'] = True
            return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', required=True, help='Canonical site root, including its repository subpath')
    parser.add_argument('--manifest', type=Path, default=Path('dist/site/version.json'))
    parser.add_argument('--compatibility', type=Path, help='Defaults to compatibility.json beside the manifest, when present')
    parser.add_argument('--timeout', type=float, default=720, help='Retry window in seconds (0 = one attempt)')
    parser.add_argument('--interval', type=float, default=20)
    parser.add_argument('--report', type=Path, default=Path('dist/deployment-check.json'))
    args = parser.parse_args(argv)
    try:
        expected = json.loads(args.manifest.read_text(encoding='utf-8'))
        compatibility_path = args.compatibility or args.manifest.with_name('compatibility.json')
        compatibility = None
        if args.compatibility or compatibility_path.exists():
            compatibility = json.loads(compatibility_path.read_text(encoding='utf-8'))
        report = verify_deployment(args.url, expected, args.timeout, args.interval, compatibility)
    except (OSError, ValueError) as error:
        report = {'passed': False, 'url': args.url, 'error': str(error), 'attempts': []}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(('PASS' if report['passed'] else 'FAIL') + ': ' + args.url)
    print('Diagnostic report: ' + str(args.report))
    if not report['passed']:
        print(report.get('error') or report['attempts'][-1]['error'])
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
