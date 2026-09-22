import { useEffect, useMemo, useState } from "react";
import UploadScreen from "./components/UploadScreen.jsx";
import Viewer from "./components/Viewer.jsx";
import FindingsPanel from "./components/FindingsPanel.jsx";
import { fetchClasses, predict } from "./lib/api.js";

const DISCLAIMER =
  "AI-assisted analysis only. This tool is not a medical diagnostic device. " +
  "Results should be reviewed by a qualified dental professional.";

export default function App() {
  const [phase, setPhase] = useState("upload"); // upload | analyzing | results
  const [file, setFile] = useState(null);
  const [imageEl, setImageEl] = useState(null); // loaded HTMLImageElement
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [classNames, setClassNames] = useState({});

  // View / overlay controls (frontend-only; never re-runs inference)
  const [showBoxes, setShowBoxes] = useState(true);
  const [showMasks, setShowMasks] = useState(true);
  const [maskOpacity, setMaskOpacity] = useState(0.35);
  const [threshold, setThreshold] = useState(0.25);
  const [enabled, setEnabled] = useState(null); // Set<classId> | null (=all)

  useEffect(() => {
    fetchClasses()
      .then((d) => setClassNames(d.names || {}))
      .catch(() => {}); // colors fall back to derived hues
  }, []);

  async function handleAnalyze() {
    if (!file) return;
    setPhase("analyzing");
    setError(null);
    try {
      const data = await predict(file);
      setResult(data);
      // Enable every detected class by default.
      const ids = new Set(data.detections.map((d) => d.classId));
      setEnabled(ids);
      setThreshold(0.25);
      setPhase("results");
    } catch (e) {
      setError(e.message || "Analysis failed.");
      setPhase("upload");
    }
  }

  function reset() {
    setPhase("upload");
    setFile(null);
    setImageEl(null);
    setResult(null);
    setError(null);
    setEnabled(null);
  }

  // Detections that pass the current threshold + class filters.
  const visible = useMemo(() => {
    if (!result) return [];
    return result.detections.filter(
      (d) => d.confidence >= threshold && (!enabled || enabled.has(d.classId))
    );
  }, [result, threshold, enabled]);

  const controls = {
    showBoxes, setShowBoxes,
    showMasks, setShowMasks,
    maskOpacity, setMaskOpacity,
    threshold, setThreshold,
    enabled, setEnabled,
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">Rx</span>
          <span className="brand-name">RxMantra</span>
          <span className="brand-sub">Dental X-ray Analysis</span>
        </div>
        <div className="topbar-right">
          {phase === "results" && (
            <>
              <span className="status-pill">Analysis complete</span>
              <button className="btn ghost" onClick={reset}>New analysis</button>
            </>
          )}
        </div>
      </header>

      {phase !== "results" ? (
        <UploadScreen
          file={file}
          setFile={setFile}
          imageEl={imageEl}
          setImageEl={setImageEl}
          analyzing={phase === "analyzing"}
          onAnalyze={handleAnalyze}
          error={error}
        />
      ) : (
        <main className="results">
          <Viewer
            image={imageEl}
            detections={visible}
            controls={controls}
          />
          <FindingsPanel
            result={result}
            allDetections={result.detections}
            visible={visible}
            classNames={classNames}
            controls={controls}
            imageEl={imageEl}
          />
        </main>
      )}

      <footer className="disclaimer">{DISCLAIMER}</footer>
    </div>
  );
}
