(function () {
  var choice = 'system';
  try {
    var stored = localStorage.getItem('drc_theme');
    if (!stored) {
      var legacy = localStorage.getItem('drc.theme');
      if (legacy === 'light' || legacy === 'dark' || legacy === 'system') {
        stored = legacy;
        localStorage.setItem('drc_theme', legacy);
      }
    }
    if (stored === 'light' || stored === 'dark' || stored === 'system') choice = stored;
  } catch (e) {}
  if (choice === 'light' || choice === 'dark') {
    document.documentElement.setAttribute('data-theme', choice);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  document.documentElement.setAttribute('data-theme-choice', choice);
})();
