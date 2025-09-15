// /public/js/xlsx-fallback.js
// Use CDN when allowed; otherwise fall back to the local vendor copy.
(function () {
  function load(url) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = url;
      s.defer = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  (async function () {
    try {
      await load("https://cdn.sheetjs.com/xlsx-0.19.3/package/dist/xlsx.full.min.js");
      console.info("XLSX loaded from CDN");
    } catch (e) {
      console.warn("CDN blocked by CSP; falling back to local vendor copy", e);
      try {
        await load("/js/vendor/xlsx.full.min.js");
        console.info("XLSX loaded from /js/vendor/xlsx.full.min.js");
      } catch (err) {
        console.error("Failed to load XLSX library", err);
        alert("Kunde inte ladda XLSX-biblioteket. Lägg en lokal kopia i /js/vendor/xlsx.full.min.js");
      }
    }
  })();
})();
