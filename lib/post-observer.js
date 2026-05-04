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
      const onClick = () => {
        button.removeEventListener('click', onClick, true);
        const textbox = editorContainer.querySelector('[role="textbox"]');
        const currentText = textbox ? textbox.innerText : '';
        if (currentText && currentText !== insertedText) {
          window.Dumly.repo.updateAccepted(acceptedMemoryId, {
            finalUserText: currentText,
            wasEdited: true,
            acceptedVia: 'posted_after_insert',
          }).catch(() => {});
        } else {
          window.Dumly.repo.updateAccepted(acceptedMemoryId, {
            acceptedVia: 'posted_after_insert',
          }).catch(() => {});
        }
      };
      button.addEventListener('click', onClick, true);

      const bodyObserver = new MutationObserver(() => {
        if (!document.body.contains(editorContainer)) {
          button.removeEventListener('click', onClick, true);
          bodyObserver.disconnect();
        }
      });
      bodyObserver.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => bodyObserver.disconnect(), 30000);
    }

    function tryAttach() {
      const btn = findButton();
      if (btn) { attach(btn); return; }
      if (++attempts < 10) setTimeout(tryAttach, 200);
    }

    tryAttach();
  }

  window.Dumly.postObserver = { watch };
})();
