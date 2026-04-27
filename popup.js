const DEFAULT_PERSONA =
  "You are a witty, concise X/Twitter user. Write a reply to the following post. Keep it under 280 characters unless the context warrants more. Be natural — no hashtags, no emojis unless appropriate.";

const apiKeyInput = document.getElementById("api-key");
const toggleKeyBtn = document.getElementById("toggle-key");
const modelSelect = document.getElementById("model");
const personaTextarea = document.getElementById("persona");
const saveBtn = document.getElementById("save");
const statusDiv = document.getElementById("status");

toggleKeyBtn.addEventListener("click", () => {
  const isPassword = apiKeyInput.type === "password";
  apiKeyInput.type = isPassword ? "text" : "password";
  toggleKeyBtn.textContent = isPassword ? "Hide" : "Show";
});

chrome.storage.sync.get(
  { apiKey: "", model: "gpt-5.4-mini", persona: DEFAULT_PERSONA },
  (settings) => {
    apiKeyInput.value = settings.apiKey;
    modelSelect.value = settings.model;
    personaTextarea.value = settings.persona;
  }
);

saveBtn.addEventListener("click", () => {
  const settings = {
    apiKey: apiKeyInput.value.trim(),
    model: modelSelect.value,
    persona: personaTextarea.value.trim() || DEFAULT_PERSONA,
  };
  chrome.storage.sync.set(settings, () => {
    statusDiv.textContent = "Saved!";
    setTimeout(() => {
      statusDiv.textContent = "";
    }, 2000);
  });
});
