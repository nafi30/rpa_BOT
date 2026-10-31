import email.message
import importlib.util
import unittest
from pathlib import Path


spec = importlib.util.spec_from_file_location('waitZohoCode', Path(__file__).resolve().parents[1] / 'scripts' / 'waitZohoCode.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ZohoCodeTest(unittest.TestCase):
    def make_message(self, recipient, sender='HotPads <info@update.hotpads.com>', code='123456'):
        message = email.message.EmailMessage()
        message['To'] = recipient
        message['From'] = sender
        message['Subject'] = 'Your HotPads one-time code'
        message.set_content(f'Your verification code is {code}.')
        return message.as_bytes()

    def test_exact_alias_and_sender_required(self):
        raw = self.make_message('hassam.0@safestay.online')
        self.assertEqual(module.code_from_message(raw, 'hassam.0@safestay.online'), '123456')
        self.assertIsNone(module.code_from_message(raw, 'hassam@safestay.online'))
        self.assertIsNone(module.code_from_message(self.make_message('hassam.0@safestay.online', sender='attacker@example.com'), 'hassam.0@safestay.online'))

    def test_hotpads_html_disguised_as_plain_text(self):
        message = email.message.EmailMessage()
        message['To'] = 'hassam.0@safestay.online'
        message['From'] = 'HotPads <info@update.hotpads.com>'
        message['Subject'] = 'Your HotPads one-time code'
        message.set_content('<html><style>.x{width:123456px}</style><body>Here is your one-time code. '
                            'This code will expire in 10 minutes. <strong>654321</strong></body></html>')
        self.assertEqual(module.code_from_message(message.as_bytes(), 'hassam.0@safestay.online'), '654321')


if __name__ == '__main__':
    unittest.main()
