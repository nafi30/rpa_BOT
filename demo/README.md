# Local end-to-end demo

Run `npm run demo:local` on the Windows machine with AdsPower running and the configured profile available. The command serves a local rental listing at 127.0.0.1, starts the real bot against it, opens the hidden Send Message form, fills it with dummy data, and submits one inquiry to the local server. It exits with an error unless the local server receives exactly one inquiry and the bot records SUCCESS.

Results and proof screenshots are saved in `demo/output/`. The demo does not send to a real property and does not establish that Apartments.com or HotPads will accept browser traffic. The current external listing run is blocked by HTTP 403 before the inquiry form is available.
