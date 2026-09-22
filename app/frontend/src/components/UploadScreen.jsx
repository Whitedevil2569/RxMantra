import { useEffect, useRef, useState } from "react";

const ACCEPT = ["image/jpeg", "image/png"];
const MAX_BYTES = 25 * 1024 * 1024;

export default function UploadScreen({
  file, setFile, imageEl, setImageEl, analyzing, onAnalyze, error,
}) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [localErr, setLocalErr] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [dims, setDims] = useState(null);

  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl]);

  function accept(f) {
    setLocalErr(null);
    if (!f) return;
    if (!ACCEPT.includes(f.type)) {
      setLocalErr("Unsupported format. Please use JPG or PNG.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setLocalErr("Image is too large (max 25 MB).");
      return;
    }
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      setDims({ w: img.naturalWidth, h: img.naturalHeight });
      setImageEl(img);
      setPreviewUrl(url);
      setFile(f);
    };
    img.onerror = () => {
      setLocalErr("This image could not be read. It may be corrupted.");
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    accept(e.dataTransfer.files?.[0]);
  }

  const shownErr = localErr || error;

  return (
    <main className="upload">
      <div className="upload-inner">
        <h1 className="upload-h1">Panoramic X-ray Analysis</h1>
        <p className="upload-lead">
          Upload a panoramic dental radiograph for AI-assisted detection of findings.
        </p>

        <div
          className={`dropzone ${dragOver ? "over" : ""} ${previewUrl ? "has-image" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => !previewUrl && inputRef.current?.click()}
        >
          {previewUrl ? (
            <div className="preview">
              <img src={previewUrl} alt="X-ray preview" className="preview-img" />
              <div className="preview-meta">
                <div className="file-name" title={file?.name}>{file?.name}</div>
                <div className="file-facts">
                  {dims && <span>{dims.w} × {dims.h} px</span>}
                  {file && <span>{formatSize(file.size)}</span>}
                </div>
              </div>
            </div>
          ) : (
            <div className="dz-empty">
              <div className="dz-icon">⤒</div>
              <p className="dz-primary">Drag &amp; drop a panoramic X-ray</p>
              <p className="dz-secondary">or click to browse — JPG or PNG, up to 25 MB</p>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png"
            hidden
            onChange={(e) => accept(e.target.files?.[0])}
          />
        </div>

        {shownErr && <div className="alert">{shownErr}</div>}

        <div className="upload-actions">
          {previewUrl && !analyzing && (
            <button className="btn ghost" onClick={() => inputRef.current?.click()}>
              Choose a different image
            </button>
          )}
          <button
            className="btn primary lg"
            disabled={!file || analyzing}
            onClick={onAnalyze}
          >
            {analyzing ? (
              <span className="analyzing"><span className="spinner" /> Analyzing X-ray…</span>
            ) : (
              "Analyze X-ray"
            )}
          </button>
        </div>
      </div>
    </main>
  );
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
