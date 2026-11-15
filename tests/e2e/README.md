# Synthetic-call harness (optional, places real Twilio calls)

Headless Chrome with a synthetic microphone places a real call through the deployed page:
browser -> Twilio -> ConversationRelay -> /ws -> Workers AI -> back. Each call of about 40 s was billed
0.004 USD by Twilio on the reference deployment (Twilio's own call price; STT/TTS usage may be billed separately
under your plan, check current pricing). Nothing else is dialled. This is not run by `npm test`.

    pip install edge-tts && python3 make-audio.py       # writes en1.wav (two English questions)
    npm i puppeteer-core                                # Chrome expected at /usr/bin/google-chrome
    BASE_URL=https://<your-host> PASSCODE_FILE=<file with the page passcode> node run-call.mjs $PWD/en1.wav 44 out
    BASE_URL=... PASSCODE_FILE=... node get-obs.mjs /obs/data obs.json
    python3 timeline.py obs.json                        # relative-time events of the newest session

The audio starts when the microphone opens: keep about 9 s of silence for the greeting.
Wait for one call to end before starting the next.
