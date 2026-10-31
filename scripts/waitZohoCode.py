"""Read a fresh HotPads one-time code for one recipient from Zoho IMAP.

Input is one JSON object on stdin. The code is returned as JSON on stdout;
credentials and message bodies are never logged. Python's standard library is
used so the VPS needs no extra mail package.
"""

import email
import imaplib
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from email import policy
from email.header import decode_header, make_header
from email.utils import getaddresses
from html import unescape


def code_from_message(raw, recipient):
    message = email.message_from_bytes(raw, policy=policy.default)
    recipients = getaddresses(
        message.get_all('To', [])
        + message.get_all('Delivered-To', [])
        + message.get_all('X-Original-To', [])
        + message.get_all('Envelope-To', [])
    )
    if recipient.casefold() not in {address.casefold() for _, address in recipients}:
        return None
    senders = getaddresses(message.get_all('From', []))
    if not any(address.casefold().endswith('@update.hotpads.com') for _, address in senders):
        return None
    subject = str(make_header(decode_header(str(message.get('Subject', '')))))
    if not re.search(r'hotpads.*(?:one.time|verification).*code', subject, re.I):
        return None
    plain = []
    for part in message.walk():
        if part.get_content_type() == 'text/plain':
            plain.append(part.get_content())
    body = '\n'.join(plain)
    if not body:
        for part in message.walk():
            if part.get_content_type() == 'text/html':
                body += re.sub(r'<[^>]+>', ' ', part.get_content())
    body = unescape(body)
    nearby = re.findall(r'(?:one.time|verification|security|sign.in)\s+code\D{0,100}(\d{6})', body, re.I)
    codes = set(nearby or re.findall(r'(?<!\d)\d{6}(?!\d)', body))
    return next(iter(codes)) if len(codes) == 1 else None


def scan_folder(client, folder, recipient, since_epoch):
    status, _ = client.select(folder, readonly=True)
    if status != 'OK':
        return None
    status, matches = client.uid('search', None, 'ALL')
    if status != 'OK' or not matches or not matches[0]:
        return None
    for uid in reversed(matches[0].split()[-80:]):
        status, data = client.uid('fetch', uid, '(INTERNALDATE BODY.PEEK[])')
        if status != 'OK':
            continue
        for item in data:
            if not isinstance(item, tuple):
                continue
            received = imaplib.Internaldate2tuple(item[0])
            if received and time.mktime(received) < since_epoch - 30:
                continue
            code = code_from_message(item[1], recipient)
            if code:
                return code
    return None


def main():
    request = json.load(sys.stdin)
    recipient = request['recipient'].strip()
    since_epoch = float(request['sinceEpochMs']) / 1000
    timeout = min(max(float(request.get('timeoutMs', 120000)) / 1000, 10), 300)
    folders = request.get('folders') or ['INBOX', 'Newsletter', 'Spam', 'Notification']
    host = os.environ['ZOHO_IMAP_HOST']
    port = int(os.environ['ZOHO_IMAP_PORT'])
    user = os.environ['ZOHO_IMAP_USER']
    password = os.environ['ZOHO_IMAP_APP_PASSWORD']
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        with imaplib.IMAP4_SSL(host, port, timeout=15) as client:
            client.login(user, password)
            for folder in folders:
                try:
                    code = scan_folder(client, folder, recipient, since_epoch)
                except imaplib.IMAP4.error:
                    continue
                if code:
                    print(json.dumps({'code': code, 'folder': folder}))
                    return
        time.sleep(min(4, max(0, deadline - time.monotonic())))
    print(json.dumps({'code': None, 'reason': 'timeout'}))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(json.dumps({'code': None, 'reason': type(exc).__name__}), file=sys.stdout)
        sys.exit(1)
