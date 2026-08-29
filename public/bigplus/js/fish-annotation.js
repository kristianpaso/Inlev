const originalImageInput = document.querySelector('#originalImageInput');
const maskImageInput = document.querySelector('#maskImageInput');
const samAnalyzeButton = document.querySelector('#samAnalyzeButton');
const samPromptButton = document.querySelector('#samPromptButton');
const applyMaskButton = document.querySelector('#applyMaskButton');
const addMaskButton = document.querySelector('#addMaskButton');
const removeMaskButton = document.querySelector('#removeMaskButton');
const clearMaskButton = document.querySelector('#clearMaskButton');
const brushSizeInput = document.querySelector('#brushSizeInput');
const overlayOpacityInput = document.querySelector('#overlayOpacityInput');
const saveAnnotationButton = document.querySelector('#saveAnnotationButton');
const annotationCanvas = document.querySelector('#annotationCanvas');
const annotationContext = annotationCanvas.getContext('2d');
const emptyStage = document.querySelector('#emptyStage');
const imageDetails = document.querySelector('#imageDetails');
const analysisDetails = document.querySelector('#analysisDetails');
const annotationStatus = document.querySelector('#annotationStatus');
const maskDetails = document.querySelector('#maskDetails');
const brushSizeValue = document.querySelector('#brushSizeValue');
const overlayOpacityValue = document.querySelector('#overlayOpacityValue');
const annotationTable = document.querySelector('#annotationTable');
const libraryCount = document.querySelector('#libraryCount');
const samCandidatePanel = document.querySelector('#samCandidatePanel');
const samCandidateList = document.querySelector('#samCandidateList');
const samCandidateSummary = document.querySelector('#samCandidateSummary');
const localSamEndpoint = ['127.0.0.1', 'localhost'].includes(window.location.hostname)
  ? 'http://127.0.0.1:8200/api/annotation/sam2'
  : '/api/annotation/sam2';
const samEndpoint = new URLSearchParams(window.location.search).get('sam2Endpoint') || localSamEndpoint;

const MAX_ANALYSIS_DIMENSION = 1536;
const MAX_ANALYSIS_BYTES = 1_800_000;

const state = {
  originalFile: null,
  analysisFile: null,
  originalImage: null,
  sourceName: '',
  recordId: null,
  recordCreatedAt: null,
  mask: null,
  maskSource: '',
  brushMode: 'add',
  brushSize: 36,
  overlayOpacity: 0.45,
  drawing: false,
  lastPoint: null,
  canvasScale: 1,
  samInfo: null,
  samCandidates: [],
  selectedSamCandidate: null,
  promptMode: false,
};

function setStatus(message, tone = '') {
  annotationStatus.textContent = message;
  annotationStatus.dataset.tone = tone;
}

function setEditorEnabled(enabled) {
  [samAnalyzeButton, samPromptButton, applyMaskButton, maskImageInput, addMaskButton, removeMaskButton,
    clearMaskButton, brushSizeInput, overlayOpacityInput, saveAnnotationButton].forEach((control) => {
    control.disabled = !enabled;
  });
  applyMaskButton.disabled = !enabled || !maskImageInput.files.length;
  if (!enabled) {
    maskImageInput.disabled = true;
    applyMaskButton.disabled = true;
  }
}

function fitCanvasToImage(image) {
  state.canvasScale = Math.min(1, MAX_ANALYSIS_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  annotationCanvas.width = Math.max(1, Math.round(image.naturalWidth * state.canvasScale));
  annotationCanvas.height = Math.max(1, Math.round(image.naturalHeight * state.canvasScale));
  state.mask = new Uint8Array(annotationCanvas.width * annotationCanvas.height);
  emptyStage.hidden = true;
  render();
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Bilden kunde inte läsas.'));
    };
    image.src = objectUrl;
  });
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function blobToFile(blob, name, type = blob.type || 'image/jpeg') {
  return new File([blob], name, { type });
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Analyskopian kunde inte skapas.'));
    }, 'image/jpeg', quality);
  });
}

async function prepareAnalysisImage(file, image) {
  let width = image.naturalWidth;
  let height = image.naturalHeight;
  const initialScale = Math.min(1, MAX_ANALYSIS_DIMENSION / Math.max(width, height));
  width = Math.max(1, Math.round(width * initialScale));
  height = Math.max(1, Math.round(height * initialScale));

  let quality = 0.82;
  let blob;
  const analysisCanvas = document.createElement('canvas');
  do {
    analysisCanvas.width = width;
    analysisCanvas.height = height;
    analysisCanvas.getContext('2d').drawImage(image, 0, 0, width, height);
    blob = await canvasToBlob(analysisCanvas, quality);
    if (blob.size <= MAX_ANALYSIS_BYTES || width <= 720) break;
    if (quality > 0.56) quality -= 0.08;
    else {
      width = Math.max(720, Math.round(width * 0.86));
      height = Math.max(720, Math.round(height * 0.86));
    }
  } while (true);

  const analysisName = `${file.name.replace(/\.[^.]+$/, '')}-analysis.jpg`;
  return {
    file: blobToFile(blob, analysisName, 'image/jpeg'),
    width,
    height,
    originalWidth: image.naturalWidth,
    originalHeight: image.naturalHeight,
    quality,
  };
}

function render() {
  if (!state.originalImage || !state.mask) return;
  annotationContext.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
  annotationContext.drawImage(state.originalImage, 0, 0, annotationCanvas.width, annotationCanvas.height);

  // Keep a dimmed copy of the original under the editable mask. Writing a
  // transparent ImageData buffer directly would erase the original canvas.
  const composite = annotationContext.getImageData(0, 0, annotationCanvas.width, annotationCanvas.height);
  const originalOpacity = 0.68;
  const maskOpacity = state.overlayOpacity;
  for (let index = 0; index < state.mask.length; index += 1) {
    const pixel = index * 4;
    composite.data[pixel] = Math.round(composite.data[pixel] * originalOpacity);
    composite.data[pixel + 1] = Math.round(composite.data[pixel + 1] * originalOpacity);
    composite.data[pixel + 2] = Math.round(composite.data[pixel + 2] * originalOpacity);
    if (state.mask[index] === 0) continue;
    composite.data[pixel] = Math.round((composite.data[pixel] * (1 - maskOpacity)) + (26 * maskOpacity));
    composite.data[pixel + 1] = Math.round((composite.data[pixel + 1] * (1 - maskOpacity)) + (180 * maskOpacity));
    composite.data[pixel + 2] = Math.round((composite.data[pixel + 2] * (1 - maskOpacity)) + (146 * maskOpacity));
  }
  annotationContext.putImageData(composite, 0, 0);
}

function getCanvasPoint(event) {
  const bounds = annotationCanvas.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) * (annotationCanvas.width / bounds.width),
    y: (event.clientY - bounds.top) * (annotationCanvas.height / bounds.height),
  };
}

function paintAt(point) {
  const radius = state.brushSize / 2;
  const minX = Math.max(0, Math.floor(point.x - radius));
  const maxX = Math.min(annotationCanvas.width - 1, Math.ceil(point.x + radius));
  const minY = Math.max(0, Math.floor(point.y - radius));
  const maxY = Math.min(annotationCanvas.height - 1, Math.ceil(point.y + radius));
  const radiusSquared = radius * radius;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - point.x;
      const dy = y - point.y;
      if ((dx * dx) + (dy * dy) <= radiusSquared) {
        state.mask[(y * annotationCanvas.width) + x] = state.brushMode === 'add' ? 1 : 0;
      }
    }
  }
}

function paintLine(from, to) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / Math.max(2, state.brushSize / 3)));
  for (let step = 0; step <= steps; step += 1) {
    const progress = step / steps;
    paintAt({
      x: from.x + ((to.x - from.x) * progress),
      y: from.y + ((to.y - from.y) * progress),
    });
  }
}

function maskFromImage(image) {
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = annotationCanvas.width;
  sourceCanvas.height = annotationCanvas.height;
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
  sourceContext.drawImage(image, 0, 0, sourceCanvas.width, sourceCanvas.height);
  const pixels = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height).data;
  const mask = new Uint8Array(sourceCanvas.width * sourceCanvas.height);
  for (let index = 0; index < mask.length; index += 1) {
    const pixel = index * 4;
    const luminance = (pixels[pixel] * 0.299) + (pixels[pixel + 1] * 0.587) + (pixels[pixel + 2] * 0.114);
    mask[index] = pixels[pixel + 3] > 20 && luminance >= 128 ? 1 : 0;
  }
  return mask;
}

function countMaskPixels() {
  return state.mask?.reduce((total, pixel) => total + pixel, 0) || 0;
}

function updateMaskDetails() {
  const pixels = countMaskPixels();
  const percentage = state.mask ? ((pixels / state.mask.length) * 100).toFixed(1) : '0.0';
  maskDetails.textContent = state.mask && pixels > 0 ? `Mask: ${percentage}% av bilden` : 'Ingen mask ännu.';
}

function parseMaskPayload(payload) {
  if (!payload) return null;
  if (typeof payload === 'string') return payload;
  return payload.maskDataUrl || payload.maskUrl || payload.mask || payload.image || payload.data || null;
}

function samRequestUrl() {
  const url = new URL(samEndpoint, window.location.href);
  url.searchParams.set('candidates', '6');
  return url.toString();
}

function samPromptRequestUrl() {
  const url = new URL(samEndpoint, window.location.href);
  url.pathname = `${url.pathname.replace(/\/$/, '')}/prompt`;
  url.searchParams.set('candidates', '3');
  return url.toString();
}

async function loadMaskCandidate(candidate) {
  if (!candidate?.maskDataUrl) throw new Error('Maskförslaget saknar bilddata.');
  const blob = await (await fetch(candidate.maskDataUrl)).blob();
  return loadImage(blobToFile(blob, `sam2-candidate-${candidate.index || 0}.png`, 'image/png'));
}

async function fetchSam2Mask() {
  const formData = new FormData();
  const analysisFile = state.analysisFile || state.originalFile;
  formData.append('image', analysisFile, analysisFile.name);
  const response = await fetch(samRequestUrl(), {
    method: 'POST',
    body: formData,
    headers: { Accept: 'application/json,image/png' },
  });
  if (!response.ok) throw new Error(`SAM 2 svarade med ${response.status}.`);
  const info = {
    candidates: response.headers.get('X-SAM2-Candidate-Count'),
    score: response.headers.get('X-SAM2-Selected-Score'),
    imageSize: response.headers.get('X-SAM2-Image-Size'),
  };
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const payload = await response.json();
    const choices = Array.isArray(payload.candidates) ? payload.candidates : [];
    if (choices.length) {
      const selected = choices[Math.max(0, Number(payload.selectedIndex) || 0)] || choices[0];
      return {
        image: await loadMaskCandidate(selected),
        info: {
          candidates: String(payload.candidateCount || choices.length),
          score: String(selected.score ?? ''),
          imageSize: payload.imageSize ? `${payload.imageSize.width}x${payload.imageSize.height}` : '',
        },
        candidates: choices,
        selectedCandidate: selected,
      };
    }
    const maskSource = parseMaskPayload(payload);
    if (!maskSource) throw new Error('SAM 2-svaret innehåller ingen mask.');
    return { image: await loadImage(blobToFile(await (await fetch(maskSource)).blob(), 'sam2-mask.png', 'image/png')), info };
  }
  if (contentType.includes('image/')) {
    return { image: await loadImage(blobToFile(await response.blob(), 'sam2-mask.png', contentType)), info };
  }
  const payload = await response.json();
  const maskSource = parseMaskPayload(payload);
  if (!maskSource) throw new Error('SAM 2-svaret innehåller ingen mask.');
  if (typeof maskSource !== 'string') throw new Error('SAM 2-svaret har ett ogiltigt maskformat.');
  if (maskSource.startsWith('data:')) {
    return { image: await loadImage(blobToFile(await (await fetch(maskSource)).blob(), 'sam2-mask.png', 'image/png')), info };
  }
  const maskResponse = await fetch(maskSource);
  return { image: await loadImage(blobToFile(await maskResponse.blob(), 'sam2-mask.png', maskResponse.headers.get('content-type') || 'image/png')), info };
}

async function fetchSam2Prompt(point) {
  const formData = new FormData();
  const analysisFile = state.analysisFile || state.originalFile;
  formData.append('image', analysisFile, analysisFile.name);
  formData.append('x', String(point.x / annotationCanvas.width));
  formData.append('y', String(point.y / annotationCanvas.height));
  const response = await fetch(samPromptRequestUrl(), {
    method: 'POST',
    body: formData,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`SAM 2 svarade med ${response.status}.`);
  const payload = await response.json();
  const choices = Array.isArray(payload.candidates) ? payload.candidates : [];
  if (!choices.length) throw new Error('SAM 2 hittade ingen mask från klickpunkten.');
  const selected = choices[Math.max(0, Number(payload.selectedIndex) || 0)] || choices[0];
  return {
    image: await loadMaskCandidate(selected),
    info: {
      candidates: String(payload.candidateCount || choices.length),
      score: String(selected.score ?? ''),
      imageSize: payload.imageSize ? `${payload.imageSize.width}x${payload.imageSize.height}` : '',
      prompt: 'point',
    },
    candidates: choices,
    selectedCandidate: selected,
  };
}

function clearSamCandidates() {
  state.samCandidates = [];
  state.selectedSamCandidate = null;
  state.promptMode = false;
  samPromptButton.classList.remove('is-active');
  if (samCandidatePanel) samCandidatePanel.hidden = true;
  if (samCandidateList) samCandidateList.replaceChildren();
  if (samCandidateSummary) samCandidateSummary.textContent = '0 st';
}

function renderSamCandidates(candidates = [], activeIndex = 0) {
  state.samCandidates = candidates;
  state.selectedSamCandidate = candidates[activeIndex] || null;
  if (!samCandidatePanel || !samCandidateList || !samCandidateSummary) return;
  samCandidateList.replaceChildren();
  samCandidateSummary.textContent = `${candidates.length} st`;
  samCandidatePanel.hidden = !candidates.length;
  candidates.forEach((candidate, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `sam-candidate-card${index === activeIndex ? ' is-active' : ''}`;
    button.setAttribute('aria-pressed', index === activeIndex ? 'true' : 'false');
    const image = document.createElement('img');
    image.alt = `Maskförslag ${index + 1}`;
    image.src = candidate.maskDataUrl;
    const label = document.createElement('span');
    label.innerHTML = `<b>#${index + 1}</b><i>${Number(candidate.score || 0).toFixed(2)}</i>`;
    button.append(image, label);
    button.addEventListener('click', async () => {
      try {
        const selectedImage = await loadMaskCandidate(candidate);
        state.mask = maskFromImage(selectedImage);
        state.maskSource = 'sam2';
        state.selectedSamCandidate = candidate;
        [...samCandidateList.children].forEach((child, childIndex) => {
          child.classList.toggle('is-active', childIndex === index);
          child.setAttribute('aria-pressed', childIndex === index ? 'true' : 'false');
        });
        render();
        updateMaskDetails();
        setStatus(`Maskförslag #${index + 1} används. Finmåla om fisken saknas någonstans.`, 'ready');
      } catch (error) {
        setStatus(`Kunde inte välja maskförslag: ${error.message}`, 'error');
      }
    });
    samCandidateList.append(button);
  });
}

function createBinaryMaskBlob() {
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = annotationCanvas.width;
  maskCanvas.height = annotationCanvas.height;
  const maskContext = maskCanvas.getContext('2d');
  const imageData = maskContext.createImageData(maskCanvas.width, maskCanvas.height);
  for (let index = 0; index < state.mask.length; index += 1) {
    const value = state.mask[index] ? 255 : 0;
    const pixel = index * 4;
    imageData.data[pixel] = value;
    imageData.data[pixel + 1] = value;
    imageData.data[pixel + 2] = value;
    imageData.data[pixel + 3] = 255;
  }
  maskContext.putImageData(imageData, 0, 0);
  return new Promise((resolve, reject) => {
    maskCanvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Masken kunde inte sparas.')), 'image/png');
  });
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openAnnotationDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('bigplus-annotations', 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('annotations')) {
        request.result.createObjectStore('annotations', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readAnnotations() {
  const database = await openAnnotationDb();
  const records = await new Promise((resolve, reject) => {
    const transaction = database.transaction('annotations', 'readonly');
    const request = transaction.objectStore('annotations').getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return records;
}

async function saveAnnotationLocally(record) {
  const database = await openAnnotationDb();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction('annotations', 'readwrite');
    transaction.objectStore('annotations').put(record);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Databasskrivningen avbröts.'));
  });
  database.close();
}

async function deleteAnnotation(id) {
  const database = await openAnnotationDb();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction('annotations', 'readwrite');
    transaction.objectStore('annotations').delete(id);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

function setPreviewImage(imageElement, blob) {
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  imageElement.onload = () => URL.revokeObjectURL(url);
  imageElement.onerror = () => URL.revokeObjectURL(url);
  imageElement.src = url;
}

function createLibraryButton(label, className, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  if (className) button.className = className;
  button.addEventListener('click', handler);
  return button;
}

function renderLibrary(records) {
  annotationTable.replaceChildren();
  const sortedRecords = [...records].sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
  libraryCount.textContent = `${sortedRecords.length} sparade`;
  if (!sortedRecords.length) {
    const empty = document.createElement('div');
    empty.className = 'library-empty';
    empty.textContent = 'Sparade originalbilder och godkända masker visas här.';
    annotationTable.append(empty);
    return;
  }

  sortedRecords.forEach((record) => {
    const row = document.createElement('article');
    row.className = 'annotation-row';
    const previews = document.createElement('div');
    previews.className = 'annotation-preview';
    [['Original', record.originalFile], ['Mask', record.maskBlob]].forEach(([label, blob]) => {
      const figure = document.createElement('figure');
      const caption = document.createElement('figcaption');
      caption.textContent = label;
      const image = document.createElement('img');
      image.alt = `${label} för ${record.originalSourceName || record.originalName || 'bilden'}`;
      setPreviewImage(image, blob);
      figure.append(caption, image);
      previews.append(figure);
    });

    const meta = document.createElement('div');
    meta.className = 'annotation-meta';
    const name = document.createElement('strong');
    name.textContent = record.originalSourceName || record.originalName || 'Namnlös bild';
    const size = document.createElement('span');
    size.textContent = `${record.originalWidth || record.width || '?'} x ${record.originalHeight || record.height || '?'} px`;
    const files = document.createElement('span');
    files.textContent = `Original ${formatBytes(record.originalBytes)} / analys ${formatBytes(record.analysisBytes)}`;
    const source = document.createElement('span');
    source.textContent = `Källa: ${record.maskSource || 'manuell'}`;
    const sam = document.createElement('span');
    sam.textContent = record.selectedSamCandidate
      ? `SAM-kandidat #${Number(record.selectedSamCandidate.index || 0) + 1}, score ${Number(record.selectedSamCandidate.score || 0).toFixed(2)}`
      : `SAM: ${record.samInfo?.candidates ? `${record.samInfo.candidates} kandidater` : 'ej sparad'}`;
    meta.append(name, size, files, source, sam);

    const actions = document.createElement('div');
    actions.className = 'annotation-row-actions';
    actions.append(
      createLibraryButton('Redigera', '', () => loadRecordForEditing(record)),
      createLibraryButton('Gör om SAM 2', '', async () => {
        await loadRecordForEditing(record);
        await runSamAnalysis();
      }),
      createLibraryButton('Ta bort', 'danger', async () => {
        if (!window.confirm('Ta bort detta bildpar?')) return;
        try {
          await deleteAnnotation(record.id);
          await renderLibraryFromDb();
          setStatus('Bildparet är borttaget från biblioteket.', 'ready');
        } catch (error) {
          setStatus(`Kunde inte ta bort bildparet: ${error.message}`, 'error');
        }
      }),
    );
    row.append(previews, meta, actions);
    annotationTable.append(row);
  });
}

async function renderLibraryFromDb() {
  try {
    renderLibrary(await readAnnotations());
  } catch (error) {
    libraryCount.textContent = 'Kunde inte läsa';
    annotationTable.replaceChildren();
    const empty = document.createElement('div');
    empty.className = 'library-empty';
    empty.textContent = 'Bildbiblioteket kunde inte öppnas i denna webbläsare.';
    annotationTable.append(empty);
    console.warn('Kunde inte läsa annoteringsbiblioteket.', error);
  }
}

async function runSamAnalysis() {
  if (!state.originalFile) return;
  samAnalyzeButton.disabled = true;
  saveAnnotationButton.disabled = true;
  clearSamCandidates();
  setStatus('SAM 2 analyserar analyskopian...', 'working');
  try {
    const result = await fetchSam2Mask();
    state.samInfo = result.info;
    state.samCandidates = result.candidates || [];
    state.selectedSamCandidate = result.selectedCandidate || null;
    state.mask = maskFromImage(result.image);
    state.maskSource = 'sam2';
    renderSamCandidates(state.samCandidates, Math.max(0, Number(result.selectedCandidate?.index) || 0));
    render();
    updateMaskDetails();
    const candidateText = result.info.candidates ? ` ${result.info.candidates} kandidater granskades.` : '';
    setStatus(`SAM 2-förslag klart.${candidateText} Granska masken innan du sparar.`, 'ready');
  } catch (error) {
    setStatus(`SAM 2 är inte ansluten ännu. ${error.message} Importera en maskfil eller måla manuellt.`, 'error');
  } finally {
    samAnalyzeButton.disabled = !state.originalFile;
    saveAnnotationButton.disabled = false;
  }
}

async function runSamPrompt(point) {
  if (!state.originalFile) return;
  samPromptButton.disabled = true;
  samAnalyzeButton.disabled = true;
  saveAnnotationButton.disabled = true;
  clearSamCandidates();
  setStatus('SAM 2 följer klickpunkten och skapar en fiskmask...', 'working');
  try {
    const result = await fetchSam2Prompt(point);
    state.samInfo = result.info;
    state.mask = maskFromImage(result.image);
    state.maskSource = 'sam2-prompt';
    renderSamCandidates(result.candidates || [], Math.max(0, Number(result.selectedCandidate?.index) || 0));
    render();
    updateMaskDetails();
    setStatus('SAM 2-mask från klickpunkt klar. Kontrollera hela gäddan innan du sparar.', 'ready');
  } catch (error) {
    setStatus(`Klickanalysen misslyckades: ${error.message} Måla manuellt eller prova en annan punkt.`, 'error');
  } finally {
    samPromptButton.disabled = !state.originalFile;
    samAnalyzeButton.disabled = !state.originalFile;
    saveAnnotationButton.disabled = false;
  }
}

async function loadRecordForEditing(record) {
  try {
    state.recordId = record.id;
    state.recordCreatedAt = record.createdAt || new Date().toISOString();
    state.originalFile = record.originalFile;
    state.sourceName = (record.originalSourceName || record.originalName || 'fish').replace(/\.[^.]+$/, '');
    state.samInfo = record.samInfo || null;
    state.selectedSamCandidate = record.selectedSamCandidate || null;
    state.originalImage = await loadImage(record.originalFile);
    fitCanvasToImage(state.originalImage);
    clearSamCandidates();
    if (record.maskBlob) {
      state.mask = maskFromImage(await loadImage(record.maskBlob));
      state.maskSource = record.maskSource || 'imported';
    }
    if (record.analysisFile) {
      state.analysisFile = blobToFile(record.analysisFile, `${state.sourceName}-analysis.jpg`, 'image/jpeg');
      state.analysisInfo = record.analysisInfo || {
        width: state.originalImage.naturalWidth,
        height: state.originalImage.naturalHeight,
      };
    } else {
      state.analysisInfo = await prepareAnalysisImage(record.originalFile, state.originalImage);
      state.analysisFile = state.analysisInfo.file;
    }
    setEditorEnabled(true);
    maskImageInput.value = '';
    imageDetails.textContent = `${record.originalSourceName || record.originalName} / ${state.originalImage.naturalWidth} x ${state.originalImage.naturalHeight} px`;
    analysisDetails.textContent = `SAM skickar ${state.analysisInfo.width} x ${state.analysisInfo.height} px / ${formatBytes(state.analysisFile.size)}. Originalet sparas separat.`;
    updateMaskDetails();
    render();
    setStatus('Bildparet är laddat. Redigera masken eller gör om SAM 2.', 'ready');
    annotationCanvas.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (error) {
    setStatus(`Kunde inte läsa bildparet: ${error.message}`, 'error');
  }
}

originalImageInput.addEventListener('change', async () => {
  const [file] = originalImageInput.files;
  if (!file) return;
  try {
    state.recordId = null;
    state.recordCreatedAt = null;
    state.originalFile = file;
    state.sourceName = file.name.replace(/\.[^.]+$/, '');
    state.originalImage = await loadImage(file);
    fitCanvasToImage(state.originalImage);
    state.analysisInfo = await prepareAnalysisImage(file, state.originalImage);
    state.analysisFile = state.analysisInfo.file;
    state.maskSource = '';
    state.samInfo = null;
    clearSamCandidates();
    setEditorEnabled(true);
    maskImageInput.value = '';
    imageDetails.textContent = `${file.name} / ${state.originalImage.naturalWidth} x ${state.originalImage.naturalHeight} px / original ${formatBytes(file.size)}`;
    analysisDetails.textContent = `SAM skickar ${state.analysisInfo.width} x ${state.analysisInfo.height} px / ${formatBytes(state.analysisFile.size)}. Originalets pixelstorlek bevaras.`;
    updateMaskDetails();
    setStatus('Bild klar. Kör SAM 2, importera en maskfil eller måla manuellt.', 'ready');
  } catch (error) {
    setEditorEnabled(false);
    setStatus(error.message, 'error');
  }
});

maskImageInput.addEventListener('change', () => {
  applyMaskButton.disabled = !maskImageInput.files.length;
  setStatus(maskImageInput.files.length ? 'Maskbild vald. Tryck "Använd importerad mask".' : 'Ingen maskbild vald.', 'ready');
});

applyMaskButton.addEventListener('click', async () => {
  const [file] = maskImageInput.files;
  if (!file || !state.originalImage) return;
  try {
    state.mask = maskFromImage(await loadImage(file));
    state.maskSource = 'imported';
    clearSamCandidates();
    render();
    updateMaskDetails();
    setStatus('Importerad mask är klar för granskning.', 'ready');
  } catch (error) {
    setStatus(error.message, 'error');
  }
});

samAnalyzeButton.addEventListener('click', runSamAnalysis);
samPromptButton.addEventListener('click', () => {
  state.promptMode = !state.promptMode;
  samPromptButton.classList.toggle('is-active', state.promptMode);
  setStatus(
    state.promptMode ? 'Klickläge aktivt. Klicka mitt på fisken i bilden.' : 'Klickläge avstängt.',
    'ready',
  );
});

function setBrushMode(mode) {
  state.brushMode = mode;
  addMaskButton.classList.toggle('is-active', mode === 'add');
  removeMaskButton.classList.toggle('is-active', mode === 'remove');
}

addMaskButton.addEventListener('click', () => setBrushMode('add'));
removeMaskButton.addEventListener('click', () => setBrushMode('remove'));
clearMaskButton.addEventListener('click', () => {
  state.mask.fill(0);
  state.maskSource = 'manual';
  clearSamCandidates();
  render();
  updateMaskDetails();
  setStatus('Masken är rensad. Måla fram fisken.', 'ready');
});

brushSizeInput.addEventListener('input', () => {
  state.brushSize = Number(brushSizeInput.value);
  brushSizeValue.textContent = `${state.brushSize} px`;
});

overlayOpacityInput.addEventListener('input', () => {
  state.overlayOpacity = Number(overlayOpacityInput.value) / 100;
  overlayOpacityValue.textContent = `${overlayOpacityInput.value}%`;
  render();
});

annotationCanvas.addEventListener('pointerdown', (event) => {
  if (!state.mask) return;
  if (state.promptMode) {
    state.promptMode = false;
    samPromptButton.classList.remove('is-active');
    runSamPrompt(getCanvasPoint(event));
    return;
  }
  state.drawing = true;
  annotationCanvas.setPointerCapture(event.pointerId);
  state.lastPoint = getCanvasPoint(event);
  paintAt(state.lastPoint);
  render();
});

annotationCanvas.addEventListener('pointermove', (event) => {
  if (!state.drawing || !state.lastPoint) return;
  const point = getCanvasPoint(event);
  paintLine(state.lastPoint, point);
  state.lastPoint = point;
  render();
});

function endDrawing(event) {
  if (!state.drawing) return;
  state.drawing = false;
  state.lastPoint = null;
  if (event?.pointerId !== undefined && annotationCanvas.hasPointerCapture(event.pointerId)) {
    annotationCanvas.releasePointerCapture(event.pointerId);
  }
  state.maskSource = 'manual';
  updateMaskDetails();
}

annotationCanvas.addEventListener('pointerup', endDrawing);
annotationCanvas.addEventListener('pointercancel', endDrawing);

saveAnnotationButton.addEventListener('click', async () => {
  if (!state.originalFile || !state.mask || countMaskPixels() === 0) {
    setStatus('Lägg till en synlig fiskmask innan du sparar.', 'error');
    return;
  }
  saveAnnotationButton.disabled = true;
  setStatus('Sparar originalbild, analyskopia och mask...', 'working');
  try {
    const maskBlob = await createBinaryMaskBlob();
    const now = new Date().toISOString();
    const id = state.recordId || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
    const record = {
      id,
      originalSourceName: state.originalFile.name,
      originalName: state.originalFile.name,
      maskName: `${state.sourceName || 'fish'}-mask.png`,
      width: annotationCanvas.width,
      height: annotationCanvas.height,
      originalWidth: state.originalImage.naturalWidth,
      originalHeight: state.originalImage.naturalHeight,
      originalBytes: state.originalFile.size,
      analysisBytes: state.analysisFile?.size || 0,
      analysisWidth: state.analysisInfo?.width || annotationCanvas.width,
      analysisHeight: state.analysisInfo?.height || annotationCanvas.height,
      maskSource: state.maskSource || 'manual',
      samInfo: state.samInfo,
      selectedSamCandidate: state.selectedSamCandidate
        ? {
            index: state.selectedSamCandidate.index,
            score: state.selectedSamCandidate.score,
            area: state.selectedSamCandidate.area,
            predictedIou: state.selectedSamCandidate.predictedIou,
            stabilityScore: state.selectedSamCandidate.stabilityScore,
          }
        : null,
      createdAt: state.recordCreatedAt || now,
      updatedAt: now,
      originalFile: state.originalFile,
      analysisFile: state.analysisFile,
      analysisInfo: state.analysisInfo,
      previewBlob: state.analysisFile || state.originalFile,
      maskBlob,
    };
    await saveAnnotationLocally(record);
    state.recordId = id;
    state.recordCreatedAt = record.createdAt;
    await renderLibraryFromDb();
    downloadBlob(state.originalFile, `bigplus-annotation-${state.sourceName || 'fish'}-original${state.originalFile.name.match(/\.[^.]+$/)?.[0] || '.jpg'}`);
    downloadBlob(maskBlob, record.maskName);
    setStatus('Sparat i bildbiblioteket: original och godkänd mask finns i tabellen.', 'success');
  } catch (error) {
    setStatus(`Kunde inte spara annoteringen: ${error.message}`, 'error');
  } finally {
    saveAnnotationButton.disabled = false;
  }
});

setEditorEnabled(false);
renderLibraryFromDb();
