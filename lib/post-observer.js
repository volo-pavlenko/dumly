(function () {
  window.Dumly = window.Dumly || {};

  function watch(editorContainer, insertedText, acceptedMemoryId) {
    const dialog = editorContainer.closest('[role="dialog"]') || document;
    let attempts = 0;

    function findButton() {
      return dialog.querySelector('[data-testid="tweetButtonInline"]')
        || dialog.querySelector('[data-testid="tweetButton"]');
    }

    function attach(button) {
      const controller = new AbortController();
      const onClick = () => {
        controller.abort();
        const textbox = editorContainer.querySelector('[role="textbox"]');
        const currentText = textbox ? textbox.innerText : '';
        const patch = currentText && currentText !== insertedText
          ? { finalUserText: currentText, wasEdited: true, acceptedVia: 'posted_after_insert' }
          : { acceptedVia: 'posted_after_insert' };
        window.Dumly.repo.updateAccepted(acceptedMemoryId, patch).catch(() => {});
      };
      button.addEventListener('click', onClick, { capture: true, signal: controller.signal });
      setTimeout(() => controller.abort(), 30000);
    }

    function tryAttach() {
      if (!document.body.contains(editorContainer)) return;
      const btn = findButton();
      if (btn) { attach(btn); return; }
      if (++attempts < 10) setTimeout(tryAttach, 200);
    }

    tryAttach();
  }

  window.Dumly.postObserver = { watch };
})();
