// Turning a PDF into page pictures — for the smart display's editor (admin.html) and for its layout editor
// (kiosk.html) alike. One implementation, injected into both by the host beside the fonts and the font picker,
// because a second copy is a copy that drifts: the two would disagree about how big a page is rendered, or how
// many of them are taken, and nobody would notice until a wall showed a blurred page.
//
// pdf.js itself is 1.7MB and arrives from the host ON FIRST USE, not with every opening of a window. It is a
// module, so it is loaded from a blob URL, with its worker from another.
//
// The page supplies two things and nothing else:
//   KLPdf.init(send)   — how to ask the host for the library (it posts { action: 'pdfjs' })
//   KLPdf.arrived(m)   — call this when the host's 'pdfjs' answer lands
// and then awaits KLPdf.toPages(base64, onProgress) -> { pages: [dataUrl…], total }.
(function () {
  if (window.KLPdf) return;
  var send = null, wait = null, waiters = null;

  function lib() {
    if (window.KLpdfjs) return Promise.resolve(window.KLpdfjs);
    if (!wait) {
      wait = new Promise(function (res, rej) {
        waiters = { res: res, rej: rej };
        try { if (send) send({ action: 'pdfjs' }); else rej(new Error('מודול קריאת ה-PDF לא נטען')); } catch (e) { rej(e); }
        setTimeout(function () { rej(new Error('מודול קריאת ה-PDF לא נטען')); }, 30000);
      });
      // A failed load must not poison the next attempt: the host may simply have been busy.
      wait.catch(function () { wait = null; waiters = null; });
    }
    return wait;
  }

  window.KLPdf = {
    init: function (fn) { send = fn; },
    arrived: function (m) {
      var w = waiters; if (!w) return;
      if (!m || !m.lib) { w.rej(new Error('מודול קריאת ה-PDF חסר')); return; }
      var url = URL.createObjectURL(new Blob([m.lib], { type: 'text/javascript' }));
      var wk = URL.createObjectURL(new Blob([m.worker || ''], { type: 'text/javascript' }));
      window.KLpdfjsReady = function (P) {
        try { P.GlobalWorkerOptions.workerSrc = wk; } catch (e) { }
        window.KLpdfjs = P; w.res(P);
      };
      var s = document.createElement('script');
      s.type = 'module';
      s.onerror = function () { w.rej(new Error('מודול קריאת ה-PDF לא נטען')); };
      s.textContent = 'import * as P from "' + url + '"; window.KLpdfjsReady(P);';
      document.head.appendChild(s);
    },
    // At most 40 pages, each drawn no larger than 2200 points on its long side — a wall does not show more than
    // that, and a hundred full-size pages is a settings file nobody can save.
    max: 40,
    toPages: async function (b64, onProgress) {
      var P = await lib();
      var bin = atob(b64 || ''), bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var doc = await P.getDocument({ data: bytes, isEvalSupported: false }).promise;
      var total = doc.numPages, n = Math.min(total, window.KLPdf.max), pages = [];
      for (var k = 1; k <= n; k++) {
        if (onProgress) onProgress(k, n);
        var page = await doc.getPage(k), vp0 = page.getViewport({ scale: 1 });
        var vp = page.getViewport({ scale: Math.min(4, 2200 / Math.max(vp0.width, vp0.height)) });
        var cv = document.createElement('canvas');
        cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        pages.push(cv.toDataURL('image/jpeg', 0.88));
        try { page.cleanup(); } catch (e) { }
      }
      try { doc.destroy(); } catch (e) { }
      return { pages: pages, total: total };
    }
  };
})();
