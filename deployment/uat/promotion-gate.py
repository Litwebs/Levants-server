#!/usr/bin/env python3
"""Fail closed unless this exact source tree passed the current UAT workflow."""
import json
import os
import subprocess
import urllib.parse
import urllib.request


def git(*args):
    return subprocess.check_output(['git', *args], text=True).strip()


def accepted_run(run, sha):
    return (run.get('head_sha') == sha and run.get('head_branch') == 'uat'
            and run.get('event') == 'push' and run.get('status') == 'completed'
            and run.get('conclusion') == 'success')


def accepted_jobs(jobs):
    # Reusable-workflow job names include their caller. Require the browser job,
    # not merely a workflow with the same display name from an older revision.
    required = ['verify', 'deploy', 'Real Stripe and browser checks / Subscription E2E (Stripe test mode)']
    return all(any(j.get('name') == name and j.get('status') == 'completed'
                   and j.get('conclusion') == 'success' for j in jobs) for name in required)


def main():
    repository = os.environ['GH_REPOSITORY']
    token = os.environ['GH_TOKEN']
    def api(path):
        request = urllib.request.Request('https://api.github.com/repos/' + repository + path,
            headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json',
                     'X-GitHub-Api-Version': '2022-11-28'})
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    # Fetch the actual branch; never trust a caller-supplied tested SHA.
    git('fetch', 'origin', 'uat')
    sha = git('rev-parse', 'FETCH_HEAD')
    if git('rev-parse', 'HEAD^{tree}') != git('rev-parse', sha + '^{tree}'):
        raise SystemExit('Release differs from UAT. Merge main into UAT, test again, then promote UAT unchanged.')
    if subprocess.run(['git', 'merge-base', '--is-ancestor', sha, 'HEAD']).returncode:
        raise SystemExit('Release does not contain the tested UAT commit. Promote with a merge, not squash/rebase.')
    runs = api('/actions/workflows/uat.yml/runs?' + urllib.parse.urlencode({'branch':'uat', 'head_sha':sha, 'per_page':100}))['workflow_runs']
    for run in sorted(runs, key=lambda item: item['id'], reverse=True):
        if not accepted_run(run, sha):
            continue
        jobs = []
        for page in range(1, 11):
            batch = api('/actions/runs/' + str(run['id']) + '/jobs?per_page=100&page=' + str(page))['jobs']
            jobs.extend(batch)
            if len(batch) < 100:
                break
        if accepted_jobs(jobs):
            print('Verified exact UAT source tree: ' + sha)
            print('Evidence: ' + run['html_url'])
            return
    raise SystemExit('No successful current UAT deployment, provider checks and real Stripe/browser suite for this release.')


if __name__ == '__main__':
    main()
