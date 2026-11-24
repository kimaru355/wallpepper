// Reads /downloads/latest.json (written by site/scripts/publish.sh) and renders the download list.
(function () {
  var ICONS = { android: '📱', windows: '🖥️', linux: '🐧', mac: '💻' };
  var el = function (id) { return document.getElementById(id); };

  function detectOS() {
    var ua = navigator.userAgent || '';
    if (/android/i.test(ua)) return 'android';
    if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
    if (/windows/i.test(ua)) return 'windows';
    if (/mac/i.test(ua)) return 'mac';
    if (/linux|x11|cros/i.test(ua)) return 'linux';
    return 'unknown';
  }

  function size(bytes) {
    return bytes >= 1e9 ? (bytes / 1e9).toFixed(2) + ' GB' : (bytes / 1e6).toFixed(1) + ' MB';
  }

  function text(tag, cls, str) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    n.textContent = str;
    return n;
  }

  function render(manifest) {
    var os = detectOS();
    var files = manifest.files || [];
    var rec = files.filter(function (f) { return f.platform === os; });
    var list = el('downloads');
    list.textContent = '';

    // order: files for this visitor's OS first
    files.slice().sort(function (a, b) { return (b.platform === os) - (a.platform === os); }).forEach(function (f) {
      var row = document.createElement('div');
      row.className = 'dl' + (f.platform === os && f === rec[0] ? ' rec' : '');
      row.appendChild(text('div', 'ico', ICONS[f.platform] || '📦'));

      var info = document.createElement('div');
      var name = text('div', 'name', f.label);
      if (f.platform === os && f === rec[0]) name.appendChild(text('span', 'tag', 'for your device'));
      info.appendChild(name);
      info.appendChild(text('div', 'meta', f.file + ' · ' + size(f.size) + (f.note ? ' · ' + f.note : '')));
      var sha = text('div', 'sha', 'SHA-256 ' + f.sha256.slice(0, 16) + '… (click to copy)');
      sha.title = f.sha256;
      sha.addEventListener('click', function () {
        if (navigator.clipboard) navigator.clipboard.writeText(f.sha256).then(function () { sha.textContent = 'SHA-256 copied ✓'; });
      });
      info.appendChild(sha);
      row.appendChild(info);

      var a = text('a', 'btn', 'Download');
      a.href = f.url;
      a.setAttribute('download', f.file);
      row.appendChild(a);
      list.appendChild(row);
    });

    el('version-line').textContent = 'Version ' + manifest.version + ' · released ' + manifest.date;

    var btn = el('primary-btn');
    if (rec[0]) {
      btn.textContent = 'Download for ' + rec[0].platformName;
      btn.href = rec[0].url;
      btn.setAttribute('download', rec[0].file);
      el('primary-note').textContent = size(rec[0].size) + ' · v' + manifest.version;
      var step = document.getElementById('step-' + os);
      if (step) { document.querySelectorAll('.steps details').forEach(function (d) { d.open = false; }); step.open = true; }
    } else if (os === 'mac') {
      btn.textContent = 'See downloads';
      el('primary-note').textContent = 'macOS isn’t available yet';
    } else if (os === 'ios') {
      btn.textContent = 'See downloads';
      el('primary-note').textContent = 'iPhone/iPad isn’t supported (iOS has no wallpaper API for apps)';
    }
  }

  fetch('/downloads/latest.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(render)
    .catch(function () {
      el('version-line').textContent = 'Could not load the download list. Try reloading, or open the downloads folder directly.';
    });
})();
