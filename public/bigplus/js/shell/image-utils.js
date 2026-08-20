const DEFAULT_MAX_EDGE = 1600;
const DEFAULT_QUALITY = 0.78;

// Converts an uploaded image to a bounded JPEG before it can enter app state.
// The original File is never returned, stored, or sent to the API.
export function compressImageFile(file, {
  maxEdge = DEFAULT_MAX_EDGE,
  quality = DEFAULT_QUALITY
} = {}) {
  if (!file || !String(file.type || "").startsWith("image/")) {
    return Promise.reject(new Error("Välj en bildfil."));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Kunde inte läsa bilden."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Kunde inte läsa bilden."));
      image.onload = () => {
        const scale = Math.min(1, maxEdge / image.naturalWidth, maxEdge / image.naturalHeight);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) return reject(new Error("Kunde inte bearbeta bilden."));
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error("Kunde inte komprimera bilden."));
          const outputReader = new FileReader();
          outputReader.onerror = () => reject(outputReader.error || new Error("Kunde inte läsa den komprimerade bilden."));
          outputReader.onload = () => resolve(String(outputReader.result || ""));
          outputReader.readAsDataURL(blob);
        }, "image/jpeg", quality);
      };
      image.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}
