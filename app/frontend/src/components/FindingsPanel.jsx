import { useMemo } from "react";
import { colorForClass } from "../lib/colors.js";
import { exportAnnotated } from "../lib/annotate.js";

export default function FindingsPanel({
  result, allDetections, visible, controls, imageEl,
}) {
  const { threshold, setThreshold, enabled, setEnabled, showBoxes, showMasks, maskOpacity } = controls;

  // Classes present in the raw model output (for the filter list).
  const classList = useMemo(() => {
    const m = new Map();
    for (const d of allDetections) {
      if (!m.has(d.classId)) m.set(d.classId, { classId: d.classId, className: d.className, count: 0 });
      m.get(d.classId).count += 1;
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [allDetections]);

  const uniqueVisible = new Set(visible.map((d) => d.classId)).size;

  function toggleClass(id) {
    const next = new Set(enabled || classList.map((c) => c.classId));
    next.has(id) ? next.delete(id) : next.add(id);
    setEnabled(next);
  }
  const showAll = () => setEnabled(new Set(classList.map((c) => c.classId)));
  const hideAll = () => setEnabled(new Set());

  async function downloadAnnotated() {
    const blob = await exportAnnotated(imageEl, visible, { showBoxes, showMasks, maskOpacity });
    triggerDownload(URL.createObjectURL(blob), `dental-ai-analysis-${stamp()}.png`);
  }
  function downloadJson() {
    const payload = {
      imageWidth: result.imageWidth,
      imageHeight: result.imageHeight,
      inferenceTimeMs: result.inferenceTimeMs,
      thresholdApplied: threshold,
      detections: visible,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    triggerDownload(URL.createObjectURL(blob), `dental-ai-analysis-${stamp()}.json`);
  }

  const sortedVisible = [...visible].sort((a, b) => b.confidence - a.confidence);

  return (
    <aside className="panel">
      <div className="panel-scroll">
        <div className="panel-section">
          <h2 className="panel-title">AI Analysis</h2>
          <p className="findings-count">
            {visible.length} {visible.length === 1 ? "finding" : "findings"} detected
          </p>
          <div className="stat-grid">
            <Stat label="Detections" value={visible.length} />
            <Stat label="Classes" value={uniqueVisible} />
            <Stat label="Inference" value={`${result.inferenceTimeMs} ms`} />
            <Stat label="Image" value={`${result.imageWidth}×${result.imageHeight}`} />
          </div>
        </div>

        <div className="panel-section">
          <div className="section-head">
            <h3>Confidence threshold</h3>
            <span className="mono">{Math.round(threshold * 100)}%</span>
          </div>
          <input
            className="range-full"
            type="range" min="0" max="1" step="0.01"
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
          />
        </div>

        {classList.length > 0 && (
          <div className="panel-section">
            <div className="section-head">
              <h3>Filter classes</h3>
              <div className="mini-actions">
                <button className="link" onClick={showAll}>Show all</button>
                <button className="link" onClick={hideAll}>Hide all</button>
              </div>
            </div>
            <ul className="class-filter">
              {classList.map((c) => {
                const on = !enabled || enabled.has(c.classId);
                return (
                  <li key={c.classId}>
                    <label className="class-row">
                      <input type="checkbox" checked={on} onChange={() => toggleClass(c.classId)} />
                      <span className="swatch" style={{ background: colorForClass(c.classId, c.className) }} />
                      <span className="class-name">{c.className}</span>
                      <span className="class-count">{c.count}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="panel-section">
          <h3>Detected findings</h3>
          {sortedVisible.length === 0 ? (
            <p className="empty-note">
              No findings detected above the current confidence threshold.
            </p>
          ) : (
            <ul className="finding-list">
              {sortedVisible.map((d, i) => (
                <li key={i} className="finding">
                  <span className="swatch" style={{ background: colorForClass(d.classId, d.className) }} />
                  <span className="finding-name">{d.className}</span>
                  <span className="finding-conf">{Math.round(d.confidence * 100)}%
                    <span className="conf-sub">model confidence</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="panel-actions">
        <button className="btn primary" onClick={downloadAnnotated} disabled={!imageEl}>
          Download annotated image
        </button>
        <button className="btn" onClick={downloadJson}>Download prediction JSON</button>
      </div>
    </aside>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}
function triggerDownload(url, name) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
