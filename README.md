# Д Dumly

AI-powered reply generator for X.com. One button. Your OpenAI key. No middleman.

## What it does

A lightning bolt button appears in X.com reply toolbars. Click it — Dumly extracts the post (text, images, quotes, thread context), sends it to the OpenAI API, and inserts a generated reply. Click again to regenerate.

Thread-aware: reads up to 5 posts in a conversation, identifies your posts, and maintains your voice.

## Install

**Chrome Web Store** (coming soon)

**Manual:**
1. Clone this repo
2. Open `chrome://extensions`, enable Developer mode
3. Click "Load unpacked", select the repo directory
4. Click the Dumly icon in the toolbar, enter your OpenAI API key

## Configure

Open the extension popup to set:

- **API Key** — your OpenAI API key
- **Model** — `gpt-5.4-mini` (default), `gpt-5.4`, `gpt-5.5`
- **Persona** — custom system prompt to control tone and style

## Privacy

Zero data collection. No analytics. No telemetry. No server.

Your API key stays in `chrome.storage.sync` on your device. Post content goes directly from your browser to `api.openai.com`. The developer never sees any of it.

Full privacy policy: https://volo-pavlenko.github.io/dumly/

## Requirements

- Chrome (Manifest V3)
- OpenAI API key with chat completions access

## License

MIT
