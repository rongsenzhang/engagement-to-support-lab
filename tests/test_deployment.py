"""Exercise the public HTTP contract, including stale and broken deployments."""
from contextlib import contextmanager
from copy import deepcopy
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from threading import Thread
from urllib.parse import urlsplit

import pytest

from check_deployment import main, verify_deployment


def release_fixture():
    manifest = {'schema_version': 1, 'version': '0.2', 'build_id': 'a' * 64,
                'revision': 'b' * 40, 'assets': {}}
    files = {}
    tags = []
    for name in ['styles.css', 'data.js', 'reference-data.js', 'app.js', 'updates.js']:
        content = ('/* ' + name + ' */').encode()
        digest = hashlib.sha256(content).hexdigest()
        stem, extension = name.rsplit('.', 1)
        path = 'assets/%s.%s.%s' % (stem, digest[:12], extension)
        manifest['assets'][name] = {'path': path, 'sha256': digest}
        files['/lab/' + path] = content
        tags.append(('<link rel="stylesheet" href="%s">' if extension == 'css'
                     else '<script src="%s"></script>') % path)
    html = ('<meta name="lab-build-id" content="%s">'
            '<meta name="lab-version" content="0.2">%s' %
            (manifest['build_id'], ''.join(tags))).encode()
    files['/lab/'] = html
    manifest['html'] = {'path': 'index.html', 'sha256': hashlib.sha256(html).hexdigest()}
    files['/lab/version.json'] = json.dumps(manifest).encode()
    return manifest, files


@contextmanager
def server(files, initial_stale=False, truncated_responses=0):
    class Handler(BaseHTTPRequestHandler):
        requests = []

        def do_GET(self):
            path = urlsplit(self.path).path
            self.requests.append(self.path)
            body = files.get(path)
            if initial_stale and len(self.requests) == 1:
                body = b'{}'
            self.send_response(200 if body is not None else 404)
            self.send_header('Cache-Control', 'max-age=600')
            if len(self.requests) <= truncated_responses:
                # Real transport failure: promise more bytes than arrive before
                # this HTTP/1.0 connection closes, rather than mocking fetch().
                self.send_header('Content-Length', str(len(body or b'Not found') + 20))
            self.end_headers()
            self.wfile.write(body or b'Not found')

        def log_message(self, *args):
            pass

    httpd = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = Thread(target=httpd.serve_forever, kwargs={'poll_interval': 0.01}, daemon=True)
    thread.start()
    try:
        yield 'http://127.0.0.1:%d/lab/' % httpd.server_port, Handler.requests
    finally:
        httpd.shutdown()
        httpd.server_close()
        thread.join()


def test_complete_deployment_and_subpath():
    manifest, files = release_fixture()
    with server(files) as (url, requests):
        report = verify_deployment(url, manifest)
    assert report['passed']
    assert len(requests) == 7
    assert requests[0].startswith('/lab/version.json?check=')
    assert requests[1] == '/lab/'  # Canonical URL really checked, not cache-busted HTML.
    assert report['attempts'][0]['responses'][1]['cache_control'] == 'max-age=600'


@pytest.mark.parametrize('problem', ['revision', 'html', 'asset', 'missing', 'invalid_json'])
def test_incomplete_or_stale_deployment_fails(problem):
    manifest, files = release_fixture()
    asset_path = '/lab/' + manifest['assets']['app.js']['path']
    if problem == 'revision':
        old = deepcopy(manifest)
        old['revision'] = 'c' * 40
        files['/lab/version.json'] = json.dumps(old).encode()
    elif problem == 'html':
        files['/lab/'] = b'Old V1 homepage'
    elif problem == 'asset':
        files[asset_path] = b'wrong asset'
    elif problem == 'missing':
        del files[asset_path]
    else:
        files['/lab/version.json'] = b'not json'
    with server(files) as (url, _):
        report = verify_deployment(url, manifest)
    assert not report['passed']
    assert report['attempts'][-1]['error']


@pytest.mark.parametrize('problem', ['metadata', 'references'])
def test_rejects_inconsistent_html_even_with_matching_checksum(problem):
    manifest, files = release_fixture()
    html = files['/lab/']
    if problem == 'metadata':
        html = html.replace(b'lab-build-id', b'wrong-build-id')
    else:
        html += b'<script src="unversioned.js"></script>'
    files['/lab/'] = html
    manifest['html']['sha256'] = hashlib.sha256(html).hexdigest()
    files['/lab/version.json'] = json.dumps(manifest).encode()
    with server(files) as (url, _):
        assert not verify_deployment(url, manifest)['passed']


def test_stale_manifest_retries_until_new_version_is_available():
    manifest, files = release_fixture()
    with server(files, initial_stale=True) as (url, requests):
        report = verify_deployment(url, manifest, timeout=2, interval=0)
    assert report['passed']
    assert len(report['attempts']) == 2
    assert requests[0] != requests[1]  # Each fresh-manifest URL is distinct.


def test_cli_retains_failure_report(tmp_path):
    manifest, files = release_fixture()
    files['/lab/'] = b'Old HTML'
    source = tmp_path / 'version.json'
    source.write_text(json.dumps(manifest))
    report = tmp_path / 'report.json'
    with server(files) as (url, _):
        result = main(['--url', url, '--manifest', str(source), '--timeout', '0',
                       '--report', str(report)])
    assert result == 1
    assert json.loads(report.read_text())['attempts'][0]['error'].startswith('Canonical HTML')


def test_truncated_http_response_retains_cli_failure_report(tmp_path):
    manifest, files = release_fixture()
    source = tmp_path / 'version.json'
    source.write_text(json.dumps(manifest))
    report_path = tmp_path / 'report.json'
    with server(files, truncated_responses=1) as (url, _):
        result = main(['--url', url, '--manifest', str(source), '--timeout', '0',
                       '--report', str(report_path)])
    report = json.loads(report_path.read_text())
    assert result == 1 and not report['passed']
    assert 'IncompleteRead' in report['attempts'][0]['error']
    assert report['attempts'][0]['responses'][0]['status'] == 200
    assert '/lab/version.json?check=' in report['attempts'][0]['responses'][0]['url']


def test_truncated_http_response_retries_until_complete():
    manifest, files = release_fixture()
    with server(files, truncated_responses=1) as (url, requests):
        report = verify_deployment(url, manifest, timeout=2, interval=0)
    assert report['passed']
    assert len(report['attempts']) == 2
    assert 'IncompleteRead' in report['attempts'][0]['error']
    assert len(requests) == 8  # One interrupted manifest, then all seven files.


def test_rejects_unsafe_manifest_before_network():
    manifest, _ = release_fixture()
    manifest['assets']['app.js']['path'] = 'https://example.com/foreign.js'
    with pytest.raises(ValueError, match='Unsafe'):
        verify_deployment('http://127.0.0.1:1/', manifest)


@pytest.mark.parametrize('problem', [None, 'missing_legacy', 'changed_historical', 'stale_manifest'])
def test_retained_resources_are_also_verified(problem):
    manifest, files = release_fixture()
    compatibility = {'schema_version': 1, 'source_revision': manifest['revision'],
                     'legacy_revision': 'c' * 40, 'assets': {}}
    for name in ['app.js', 'data.js', 'reference-data.js', 'styles.css']:
        content = ('old fixed-path ' + name).encode()
        files['/lab/' + name] = content
        compatibility['assets'][name] = hashlib.sha256(content).hexdigest()
    old = b'older content-addressed application'
    digest = hashlib.sha256(old).hexdigest()
    historical_path = 'assets/app.%s.js' % digest[:12]
    files['/lab/' + historical_path] = old
    compatibility['assets'][historical_path] = digest
    files['/lab/compatibility.json'] = json.dumps(compatibility).encode()
    if problem == 'missing_legacy':
        del files['/lab/app.js']
    elif problem == 'changed_historical':
        files['/lab/' + historical_path] = b'wrong'
    elif problem == 'stale_manifest':
        files['/lab/compatibility.json'] = b'{}'
    with server(files) as (url, _):
        report = verify_deployment(url, manifest, compatibility=compatibility)
    assert report['passed'] is (problem is None)
