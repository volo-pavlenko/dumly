# Privacy Policy — Dumly

**Last updated:** 2026-04-27

## Data Collection

Dumly does **not** collect, store, or transmit any personal data to any server operated by the developer.

## What Dumly Accesses

- **X.com page content:** Dumly reads the text, images, and author information of posts visible on your screen to generate contextual replies. This data is sent directly from your browser to the OpenAI API using your own API key. It is never sent anywhere else.
- **OpenAI API key:** Your API key is stored locally in Chrome's extension storage (`chrome.storage.sync`) on your device. It is only used to authenticate requests to the OpenAI API. The developer has no access to your key.
- **Settings:** Your model preference and persona prompt are stored locally in Chrome's extension storage.

## Third-Party Services

Dumly sends post content to the **OpenAI API** (`api.openai.com`) to generate replies. This communication is governed by [OpenAI's privacy policy](https://openai.com/privacy) and your own OpenAI account terms. You are responsible for your API usage and costs.

## Data Storage

All data is stored locally on your device via Chrome's built-in extension storage. No data is stored on external servers.

## Permissions Justification

- **storage:** Save your API key, model preference, and persona prompt locally.
- **activeTab:** Access the content of X.com pages to extract post text and images for reply generation.
- **host_permissions (api.openai.com):** Make API calls to OpenAI from the content script.

## Contact

For questions about this privacy policy, open an issue on the project's GitHub repository.
