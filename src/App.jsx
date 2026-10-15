import { useState, useRef, useCallback } from "react";

const TABS = [
  { id: "text", label: "Plain Text", icon: "✦", hint: "Paste any article, essay, or notes" },
  { id: "youtube", label: "YouTube", icon: "▶", hint: "Enter a YouTube video URL" },
  { id: "pdf", label: "PDF File", icon: "⬡", hint: "Upload a PDF document" },
];

const LENGTHS = [
  { id: "brief", label: "Brief", desc: "2–3 sentences" },
  { id: "standard", label: "Standard", desc: "1 paragraph" },
  { id: "detailed", label: "Detailed", desc: "Full breakdown" },
];

function extractYouTubeId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

async function readPDFText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const typedArray = new Uint8Array(e.target.result);
        const pdfjsLib = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs";
        const pdf = await pdfjsLib.getDocument(typedArray).promise;
        let text = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text += content.items.map(item => item.str).join(" ") + "\n";
        }
        resolve({ text, name: file.name, size: file.size });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

async function callGroq(messages, systemPrompt) {
  const res = await fetch("/api/summarize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, systemPrompt }),
  });
  if (!res.ok) {
    let errorMsg = `API error: ${res.status}`;
    try {
      const errJson = await res.json();
      if (errJson?.error) {
        errorMsg = typeof errJson.error === "string" ? errJson.error : JSON.stringify(errJson.error);
      }
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

export default function App() {
  const [tab, setTab] = useState("text");
  const [length, setLength] = useState("standard");
  const [textInput, setTextInput] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfData, setPdfData] = useState(null);
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const fileRef = useRef();

  const systemPrompt = `You are an expert summarizer. Create clear, insightful summaries that capture the essence of the content. 
For "brief": 2-3 sentences maximum. For "standard": one well-crafted paragraph. For "detailed": structured breakdown with key points, main themes, and takeaways.
Always be direct. No filler phrases like "This text discusses..." — just deliver the summary. Use markdown for detailed mode (## headings, bullet points).`;

  const handleSummarize = async () => {
    setError("");
    setSummary("");
    setLoading(true);

    try {
      let messages = [];
      const lengthLabel = LENGTHS.find((l) => l.id === length)?.desc;
      const instruction = `Summarize the following content. Length: ${length} (${lengthLabel}).`;

      if (tab === "text") {
        if (!textInput.trim()) throw new Error("Please enter some text to summarize.");
        messages = [{ role: "user", content: `${instruction}\n\n${textInput}` }];
      } else if (tab === "youtube") {
        const videoId = extractYouTubeId(youtubeUrl);
        if (!videoId) throw new Error("Please enter a valid YouTube URL.");

        const transcriptRes = await fetch(
          `/api/transcript?videoId=${videoId}`
        );

        if (!transcriptRes.ok) {
          let transcriptErr = "Could not fetch transcript. Try another video.";
          try {
            const errData = await transcriptRes.json();
            if (errData?.error) transcriptErr = errData.error;
          } catch {
            // ignore
          }
          throw new Error(transcriptErr);
        }

        const transcriptData = await transcriptRes.json();
        const transcript = Array.isArray(transcriptData)
          ? transcriptData.map((t) => t.text).join(" ")
          : transcriptData?.transcript || "";

        if (!transcript) throw new Error("Video has no captions available.");

        messages = [
          {
            role: "user",
            content: `${instruction}\n\nYouTube Video Transcript:\n\n${transcript}`,
          },
        ];
      }
 else if (tab === "pdf") {
        if (!pdfData) throw new Error("Please upload a PDF file.");
        messages = [
          {
            role: "user",
            content: `${instruction}\n\nHere is the text extracted from the PDF file "${pdfData.name}":\n\n${pdfData.text}`,
          },
        ];
      }

      const result = await callGroq(messages, systemPrompt);
      setSummary(result);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = useCallback(async (file) => {
    if (!file || file.type !== "application/pdf") {
      setError("Please upload a valid PDF file.");
      return;
    }
    setPdfFile(file);
    const data = await readPDFText(file);
    setPdfData(data);
    setError("");
  }, []);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFileChange(file);
  };

  const formatBytes = (bytes) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const canSubmit = () => {
    if (loading) return false;
    if (tab === "text") return textInput.trim().length > 0;
    if (tab === "youtube") return youtubeUrl.trim().length > 0;
    if (tab === "pdf") return pdfData !== null;
    return false;
  };

  const renderMarkdown = (text) => {
    return text
      .replace(/^## (.+)$/gm, '<h2 class="sum-h2">$1</h2>')
      .replace(/^### (.+)$/gm, '<h3 class="sum-h3">$1</h3>')
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/^\* (.+)$/gm, '<li class="sum-li">$1</li>')
      .replace(/^- (.+)$/gm, '<li class="sum-li">$1</li>')
      .replace(/(<li.*<\/li>\n?)+/g, (m) => `<ul class="sum-ul">${m}</ul>`)
      .replace(/\n\n/g, "</p><p>")
      .replace(/^(?!<[hul])(.+)$/gm, (m) => (m.trim() ? `<p>${m}</p>` : ""));
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Mono:wght@300;400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --ink: #0a0a0f;
          --ink-light: #3a3a4a;
          --ink-faint: #8888aa;
          --cream: #f5f3ee;
          --cream-dark: #ede9e1;
          --gold: #c9a84c;
          --gold-light: #e8d49a;
          --amber: #d4691e;
          --paper: #faf8f4;
          --border: #d8d4ca;
          --success: #2d6a4f;
        }

        body {
          background: var(--cream);
          color: var(--ink);
          font-family: 'DM Mono', monospace;
          min-height: 100vh;
        }

        .app {
          max-width: 780px;
          margin: 0 auto;
          padding: 48px 24px 80px;
        }

        /* Header */
        .header {
          text-align: center;
          margin-bottom: 56px;
        }

        .header-eyebrow {
          font-family: 'DM Mono', monospace;
          font-size: 10px;
          font-weight: 400;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          color: var(--gold);
          margin-bottom: 16px;
        }

        .header-title {
          font-family: 'Instrument Serif', serif;
          font-size: clamp(42px, 7vw, 68px);
          font-weight: 400;
          line-height: 1.05;
          color: var(--ink);
          margin-bottom: 6px;
        }

        .header-title em {
          font-style: italic;
          color: var(--amber);
        }

        .header-sub {
          font-size: 12px;
          color: var(--ink-faint);
          letter-spacing: 0.05em;
          margin-top: 18px;
        }

        .header-rule {
          width: 48px;
          height: 1px;
          background: var(--gold);
          margin: 24px auto 0;
          opacity: 0.6;
        }

        /* Card */
        .card {
          background: var(--paper);
          border: 1px solid var(--border);
          border-radius: 2px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 8px 32px rgba(0,0,0,0.04);
        }

        /* Tabs */
        .tabs {
          display: flex;
          border-bottom: 1px solid var(--border);
          background: var(--cream-dark);
        }

        .tab-btn {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding: 18px 12px 16px;
          border: none;
          background: transparent;
          cursor: pointer;
          transition: all 0.2s;
          border-bottom: 2px solid transparent;
          position: relative;
        }

        .tab-btn:hover { background: rgba(201,168,76,0.06); }

        .tab-btn.active {
          background: var(--paper);
          border-bottom-color: var(--gold);
        }

        .tab-icon {
          font-size: 18px;
          color: var(--ink-faint);
          transition: color 0.2s;
          font-family: 'Instrument Serif', serif;
        }

        .tab-btn.active .tab-icon { color: var(--amber); }

        .tab-label {
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ink-light);
        }

        .tab-btn.active .tab-label { color: var(--ink); }

        /* Body */
        .card-body { padding: 32px; }

        /* Length selector */
        .length-row {
          display: flex;
          gap: 8px;
          margin-bottom: 28px;
        }

        .length-label {
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ink-faint);
          margin-bottom: 10px;
        }

        .length-btn {
          flex: 1;
          padding: 10px 8px;
          border: 1px solid var(--border);
          border-radius: 2px;
          background: transparent;
          cursor: pointer;
          text-align: center;
          transition: all 0.2s;
        }

        .length-btn:hover { border-color: var(--gold-light); background: rgba(201,168,76,0.04); }

        .length-btn.active {
          border-color: var(--gold);
          background: rgba(201,168,76,0.08);
        }

        .length-btn-name {
          display: block;
          font-size: 11px;
          font-weight: 500;
          color: var(--ink);
          letter-spacing: 0.05em;
        }

        .length-btn-desc {
          display: block;
          font-size: 9px;
          color: var(--ink-faint);
          margin-top: 2px;
          letter-spacing: 0.04em;
        }

        /* Input areas */
        .input-label {
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ink-faint);
          margin-bottom: 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .char-count { color: var(--ink-faint); font-size: 9px; }
        .char-count.warn { color: var(--amber); }

        textarea {
          width: 100%;
          min-height: 180px;
          padding: 16px;
          border: 1px solid var(--border);
          border-radius: 2px;
          background: var(--cream);
          color: var(--ink);
          font-family: 'DM Mono', monospace;
          font-size: 13px;
          line-height: 1.7;
          resize: vertical;
          outline: none;
          transition: border-color 0.2s;
        }

        textarea:focus { border-color: var(--gold); background: var(--paper); }
        textarea::placeholder { color: var(--ink-faint); }

        .url-input {
          width: 100%;
          padding: 14px 16px;
          border: 1px solid var(--border);
          border-radius: 2px;
          background: var(--cream);
          color: var(--ink);
          font-family: 'DM Mono', monospace;
          font-size: 13px;
          outline: none;
          transition: border-color 0.2s;
        }

        .url-input:focus { border-color: var(--gold); background: var(--paper); }
        .url-input::placeholder { color: var(--ink-faint); }

        .url-hint {
          font-size: 10px;
          color: var(--ink-faint);
          margin-top: 8px;
          letter-spacing: 0.04em;
        }

        /* Drop zone */
        .drop-zone {
          border: 1.5px dashed var(--border);
          border-radius: 2px;
          padding: 40px 24px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
          background: var(--cream);
        }

        .drop-zone:hover, .drop-zone.drag-over {
          border-color: var(--gold);
          background: rgba(201,168,76,0.04);
        }

        .drop-icon {
          font-family: 'Instrument Serif', serif;
          font-size: 32px;
          color: var(--gold);
          margin-bottom: 12px;
          display: block;
        }

        .drop-text {
          font-size: 12px;
          color: var(--ink-light);
          letter-spacing: 0.05em;
        }

        .drop-sub {
          font-size: 10px;
          color: var(--ink-faint);
          margin-top: 6px;
          letter-spacing: 0.04em;
        }

        /* File preview */
        .file-preview {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px;
          background: var(--cream);
          border: 1px solid var(--border);
          border-radius: 2px;
        }

        .file-icon-box {
          width: 42px;
          height: 48px;
          background: var(--amber);
          border-radius: 2px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.05em;
          flex-shrink: 0;
        }

        .file-info { flex: 1; min-width: 0; }

        .file-name {
          font-size: 13px;
          color: var(--ink);
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .file-size {
          font-size: 10px;
          color: var(--ink-faint);
          margin-top: 3px;
          letter-spacing: 0.04em;
        }

        .file-remove {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--ink-faint);
          font-size: 18px;
          padding: 4px;
          line-height: 1;
          transition: color 0.2s;
        }

        .file-remove:hover { color: var(--amber); }

        /* Submit button */
        .submit-row { margin-top: 28px; }

        .submit-btn {
          width: 100%;
          padding: 16px 24px;
          background: var(--ink);
          color: var(--cream);
          border: none;
          border-radius: 2px;
          font-family: 'DM Mono', monospace;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
        }

        .submit-btn:hover:not(:disabled) {
          background: var(--amber);
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(212,105,30,0.25);
        }

        .submit-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .submit-btn.loading { background: var(--ink-light); }

        /* Spinner */
        .spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        /* Error */
        .error-box {
          margin-top: 20px;
          padding: 14px 16px;
          background: #fdf0ec;
          border: 1px solid #e8b4a0;
          border-radius: 2px;
          font-size: 12px;
          color: #8b3a22;
          letter-spacing: 0.03em;
        }

        /* Result */
        .result {
          margin-top: 32px;
          animation: fadeUp 0.4s ease;
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .result-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }

        .result-title {
          font-size: 10px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--gold);
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .result-title::before {
          content: '';
          display: inline-block;
          width: 20px;
          height: 1px;
          background: var(--gold);
        }

        .copy-btn {
          background: none;
          border: 1px solid var(--border);
          border-radius: 2px;
          padding: 6px 12px;
          font-family: 'DM Mono', monospace;
          font-size: 10px;
          color: var(--ink-faint);
          cursor: pointer;
          letter-spacing: 0.1em;
          transition: all 0.2s;
        }

        .copy-btn:hover { border-color: var(--gold); color: var(--ink); }
        .copy-btn.copied { border-color: var(--success); color: var(--success); }

        .result-box {
          background: var(--cream);
          border: 1px solid var(--border);
          border-left: 3px solid var(--gold);
          border-radius: 0 2px 2px 0;
          padding: 24px;
          font-size: 13.5px;
          line-height: 1.8;
          color: var(--ink-light);
        }

        .result-box p { margin-bottom: 12px; }
        .result-box p:last-child { margin-bottom: 0; }
        .result-box .sum-h2 {
          font-family: 'Instrument Serif', serif;
          font-size: 20px;
          font-weight: 400;
          color: var(--ink);
          margin: 20px 0 10px;
        }
        .result-box .sum-h3 {
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--amber);
          margin: 16px 0 8px;
        }
        .result-box .sum-ul { margin: 8px 0 12px 0; padding-left: 0; list-style: none; }
        .result-box .sum-li {
          position: relative;
          padding-left: 18px;
          margin-bottom: 6px;
          color: var(--ink-light);
        }
        .result-box .sum-li::before {
          content: '◆';
          position: absolute;
          left: 0;
          color: var(--gold);
          font-size: 8px;
          top: 6px;
        }

        /* Divider */
        .divider {
          display: flex;
          align-items: center;
          gap: 16px;
          margin: 40px 0 0;
        }

        .divider-line { flex: 1; height: 1px; background: var(--border); }

        .divider-text {
          font-size: 10px;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: var(--ink-faint);
        }

        /* Footer */
        .footer {
          text-align: center;
          margin-top: 48px;
          font-size: 10px;
          color: var(--ink-faint);
          letter-spacing: 0.1em;
        }

        .footer span { color: var(--gold); }
      `}</style>

      <div className="app">
        <header className="header">
          <div className="header-eyebrow">✦ BUILT BY MANSI UPADHYAY ✦</div>
          <h1 className="header-title">
            The <em>Summarizer</em>
          </h1>
          <p className="header-sub">Text · YouTube · PDF — distilled to their essence</p>
          <div className="header-rule" />
        </header>

        <div className="card">
          {/* Tabs */}
          <div className="tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`tab-btn ${tab === t.id ? "active" : ""}`}
                onClick={() => { setTab(t.id); setSummary(""); setError(""); }}
              >
                <span className="tab-icon">{t.icon}</span>
                <span className="tab-label">{t.label}</span>
              </button>
            ))}
          </div>

          <div className="card-body">
            {/* Length */}
            <div style={{ marginBottom: 28 }}>
              <div className="length-label">Summary Length</div>
              <div className="length-row">
                {LENGTHS.map((l) => (
                  <button
                    key={l.id}
                    className={`length-btn ${length === l.id ? "active" : ""}`}
                    onClick={() => setLength(l.id)}
                  >
                    <span className="length-btn-name">{l.label}</span>
                    <span className="length-btn-desc">{l.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Input: Text */}
            {tab === "text" && (
              <div>
                <div className="input-label">
                  <span>Your Text</span>
                  <span className={`char-count ${charCount > 8000 ? "warn" : ""}`}>
                    {charCount.toLocaleString()} chars
                  </span>
                </div>
                <textarea
                  placeholder="Paste your article, essay, notes, or any text here…"
                  value={textInput}
                  onChange={(e) => { setTextInput(e.target.value); setCharCount(e.target.value.length); }}
                />
              </div>
            )}

            {/* Input: YouTube */}
            {tab === "youtube" && (
              <div>
                <div className="input-label">YouTube URL</div>
                <input
                  className="url-input"
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                />
                <p className="url-hint">Supports youtube.com/watch, youtu.be, and Shorts URLs</p>
              </div>
            )}

            {/* Input: PDF */}
            {tab === "pdf" && (
              <div>
                <div className="input-label">PDF Document</div>
                {!pdfFile ? (
                  <div
                    className={`drop-zone ${dragOver ? "drag-over" : ""}`}
                    onClick={() => fileRef.current.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                  >
                    <span className="drop-icon">⬡</span>
                    <div className="drop-text">Drop your PDF here, or click to browse</div>
                    <div className="drop-sub">Supports text-based PDF documents</div>
                  </div>
                ) : (
                  <div className="file-preview">
                    <div className="file-icon-box">PDF</div>
                    <div className="file-info">
                      <div className="file-name">{pdfFile.name}</div>
                      <div className="file-size">{formatBytes(pdfFile.size)}</div>
                    </div>
                    <button
                      className="file-remove"
                      onClick={() => { setPdfFile(null); setPdfData(null); }}
                    >×</button>
                  </div>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf"
                  style={{ display: "none" }}
                  onChange={(e) => handleFileChange(e.target.files[0])}
                />
              </div>
            )}

            {/* Error */}
            {error && <div className="error-box">⚠ {error}</div>}

            {/* Submit */}
            <div className="submit-row">
              <button
                className={`submit-btn ${loading ? "loading" : ""}`}
                onClick={handleSummarize}
                disabled={!canSubmit()}
              >
                {loading ? (
                  <>
                    <div className="spinner" />
                    Distilling…
                  </>
                ) : (
                  "✦ Summarize"
                )}
              </button>
            </div>

            {/* Result */}
            {summary && (
              <div className="result">
                <div className="divider">
                  <div className="divider-line" />
                  <div className="divider-text">Summary</div>
                  <div className="divider-line" />
                </div>
                <div className="result" style={{ marginTop: 20 }}>
                  <div className="result-header">
                    <div className="result-title">Result</div>
                    <CopyButton text={summary} />
                  </div>
                  <div
                    className="result-box"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(summary) }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="footer">
          Built by <span>Mansi Upadhyay</span> · The Summarizer
        </div>
      </div>
    </>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button className={`copy-btn ${copied ? "copied" : ""}`} onClick={handleCopy}>
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}
