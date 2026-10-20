"""Use the user's existing Git Credential Manager entry; never print credentials."""
import json, os, subprocess, sys, urllib.request, urllib.error

def credentials():
    env = dict(os.environ, GCM_INTERACTIVE='never', GIT_TERMINAL_PROMPT='0')
    result = subprocess.run(['git', 'credential', 'fill'], input='protocol=https\nhost=github.com\n\n', text=True, capture_output=True, env=env)
    fields = dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)
    if not fields.get('password'):
        raise RuntimeError('No existing GitHub credential is available in Git Credential Manager.')
    return fields['password']

token = credentials()
def api(path, data=None, method=None):
    req = urllib.request.Request('https://api.github.com' + path, data=json.dumps(data).encode() if data is not None else None,
        headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Cutting-project-publisher'}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r) if r.status != 204 else {}
    except urllib.error.HTTPError as e:
        message = json.loads(e.read()).get('message', str(e))
        raise RuntimeError(f'GitHub {e.code}: {message}') from None

user = api('/user')['login']
repo = f'/repos/{user}/Cutting'
mode = sys.argv[1] if len(sys.argv) > 1 else 'status'
if mode == 'create':
    try:
        existing = api(repo)
        print(json.dumps({'existing': existing['html_url'], 'default_branch': existing['default_branch']}))
    except RuntimeError as e:
        if '404' not in str(e): raise
        created = api('/user/repos', {'name': 'Cutting', 'description': '개인용 판재 절단 최적화 웹사이트 · 브라우저에서 계산하고 저장합니다.', 'private': False, 'auto_init': False})
        print(json.dumps({'created': created['html_url'], 'owner': user}))
elif mode == 'pages':
    try:
        page = api(repo + '/pages')
    except RuntimeError as e:
        if '404' not in str(e): raise
        page = api(repo + '/pages', {'source': {'branch': 'main', 'path': '/'}, 'build_type': 'legacy'})
    print(json.dumps({'html_url': page.get('html_url'), 'status': page.get('status'), 'source': page.get('source')}))
elif mode == 'build':
    print(json.dumps(api(repo + '/pages/builds/latest')))
else:
    print(json.dumps({'login': user}))
