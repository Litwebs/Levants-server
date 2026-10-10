#!/usr/bin/env python3
"""Validate UAT-only Stripe credentials without displaying secrets or customer data."""
import json
from pathlib import Path
import re
import stat
import urllib.request
import urllib.error

p = Path('/etc/levants-uat/stripe.pending.env')
if p.is_symlink() or stat.S_IMODE(p.stat().st_mode) != 0o600 or p.stat().st_uid != 0:
    raise SystemExit('Pending credentials must be a root-owned regular file with mode 600')
values = dict(line.split('=', 1) for line in p.read_text().splitlines() if line and not line.startswith('#'))
for name, prefix in [('STRIPE_SECRET_KEY','sk_test_'), ('STRIPE_PUBLISHABLE_KEY','pk_test_'), ('STRIPE_WEBHOOK_SECRET','whsec_')]:
    if not re.fullmatch(prefix + '[A-Za-z0-9]+', values.get(name, '')):
        raise SystemExit('Invalid sandbox credential: ' + name)

def api(path):
    req = urllib.request.Request('https://api.stripe.com/v1/' + path, headers={
        'Authorization': 'Bearer ' + values['STRIPE_SECRET_KEY'], 'Stripe-Version': '2024-06-20'})
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise SystemExit('Stripe validation failed; HTTP status ' + str(error.code)) from None

if api('balance').get('livemode') is not False:
    raise SystemExit('Sandbox mode could not be verified')
endpoints = api('webhook_endpoints?limit=100')
if endpoints.get('has_more'):
    raise SystemExit('Endpoint list requires pagination; refusing ambiguous validation')
matching = [e for e in endpoints['data'] if e['url'] == 'https://uat-api.levantsdairy.co.uk/api/webhooks/stripe' and e['status'] == 'enabled']
if len(matching) != 1 or matching[0].get('livemode') is not False:
    raise SystemExit('Expected exactly one enabled sandbox UAT endpoint')
required = {'checkout.session.completed','checkout.session.expired','payment_intent.payment_failed','charge.refunded',
    'refund.created','refund.updated','refund.failed','invoice.created','invoice.voided','invoice.marked_uncollectible',
    'invoice.payment_succeeded','invoice.payment_failed','customer.subscription.updated','customer.subscription.deleted'}
if not required.issubset(set(matching[0]['enabled_events'])):
    raise SystemExit('UAT webhook is missing required event types')
print(json.dumps({'sandboxVerified':True,'endpointVerified':True,'apiVersion':matching[0]['api_version'],'requiredEvents':len(required)}))
