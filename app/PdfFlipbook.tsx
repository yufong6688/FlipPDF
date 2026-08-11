"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

type TurnDirection = "next" | "previous" | null;
type FlipEffect = "classic" | "curl" | "slide" | "fade" | "lift";
type PendingTurn = { direction: Exclude<TurnDirection, null>; target: number } | null;
type PdfLibraryItem = { name: string; file: string; version: string };
const ASSET_BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const TURN_DURATION = 850;
const PAGE_CLICK_DELAY = 340;
const LONG_PRESS_DURATION = 650;
const ZOOM_SCALE = 2.5;
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

function ArrowIcon({ direction }: { direction: "left" | "right" }) {
  return <span aria-hidden="true">{direction === "left" ? "←" : "→"}</span>;
}

function PageCanvas({ document, pageNumber, onReady }: { document: PDFDocumentProxy; pageNumber: number; onReady?: (pageNumber: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onReadyRef = useRef(onReady);
  const [failed, setFailed] = useState(false);

  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);

  useEffect(() => {
    let cancelled = false;
    let renderTask: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | null = null;

    async function renderPage() {
      const page = await document.getPage(pageNumber);
      if (cancelled || !canvasRef.current) return;

      const baseViewport = page.getViewport({ scale: 1 });
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const scale = (900 / baseViewport.width) * pixelRatio;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const nextCanvas = window.document.createElement("canvas");
      const nextContext = nextCanvas.getContext("2d", { alpha: false });
      if (!nextContext) return;

      nextCanvas.width = Math.floor(viewport.width);
      nextCanvas.height = Math.floor(viewport.height);
      renderTask = page.render({ canvas: nextCanvas, canvasContext: nextContext, viewport });
      await renderTask.promise;
      if (cancelled || !canvasRef.current) return;

      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return;
      canvas.width = nextCanvas.width;
      canvas.height = nextCanvas.height;
      context.drawImage(nextCanvas, 0, 0);
      onReadyRef.current?.(pageNumber);
    }

    renderPage().catch((error: unknown) => {
      if (!cancelled && !(error instanceof Error && error.name === "RenderingCancelledException")) {
        setFailed(true);
        onReadyRef.current?.(pageNumber);
      }
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [document, pageNumber]);

  if (failed) return <div className="page-error">無法顯示此頁</div>;
  return <canvas ref={canvasRef} aria-label={`PDF 第 ${pageNumber} 頁`} />;
}

function BookLayer({
  document,
  page,
  isSinglePage,
  isPending = false,
  onPageReady,
}: {
  document: PDFDocumentProxy;
  page: number;
  isSinglePage: boolean;
  isPending?: boolean;
  onPageReady?: (pageNumber: number) => void;
}) {
  const isCover = !isSinglePage && page === 1;
  return (
    <div className={`book-layer${isPending ? " book-layer-pending" : " book-layer-current"}${isCover ? " is-cover-layer" : ""}`}>
      {isCover ? (
        <article className="pdf-page cover-page">
          <PageCanvas document={document} pageNumber={1} onReady={onPageReady} />
          <span className="folio">1</span>
        </article>
      ) : (
        <>
          <article className="pdf-page left-page">
            <PageCanvas document={document} pageNumber={page} onReady={onPageReady} />
            <span className="folio">{page}</span>
          </article>
          {!isSinglePage && <div className="spine" aria-hidden="true" />}
          {!isSinglePage && (page + 1 <= document.numPages ? (
            <article className="pdf-page right-page">
              <PageCanvas document={document} pageNumber={page + 1} onReady={onPageReady} />
              <span className="folio">{page + 1}</span>
            </article>
          ) : <div className="pdf-page right-page blank-page" aria-hidden="true" />)}
        </>
      )}
    </div>
  );
}

export function PdfFlipbook() {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [fileName, setFileName] = useState("");
  const [page, setPage] = useState(1);
  const [pageRatio, setPageRatio] = useState(0.707);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [turning, setTurning] = useState<TurnDirection>(null);
  const [pendingTurn, setPendingTurn] = useState<PendingTurn>(null);
  const [flipEffect, setFlipEffect] = useState<FlipEffect>("classic");
  const [isSinglePage, setIsSinglePage] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isPageLocked, setIsPageLocked] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanLocked, setIsPanLocked] = useState(false);
  const [pdfLibrary, setPdfLibrary] = useState<PdfLibraryItem[]>([]);
  const [remoteMode, setRemoteMode] = useState<"share" | "admin" | null>(null);
  const turnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preparedPages = useRef(new Set<number>());
  const transitionStarted = useRef(false);
  const dragStart = useRef<number | null>(null);
  const panStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);
  const suppressNextClick = useRef(false);
  const readerRef = useRef<HTMLElement>(null);
  const bookRef = useRef<HTMLDivElement>(null);
  const pageTurnAudio = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const update = () => setIsSinglePage(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => () => {
    if (turnTimer.current) clearTimeout(turnTimer.current);
    if (pageClickTimer.current) clearTimeout(pageClickTimer.current);
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);

  useEffect(() => {
    const audio = new Audio(`${ASSET_BASE}/page-turn.wav`);
    audio.preload = "auto";
    audio.volume = 0.85;
    pageTurnAudio.current = audio;
    return () => {
      audio.pause();
      pageTurnAudio.current = null;
    };
  }, []);

  useEffect(() => {
    fetch(`${ASSET_BASE}/pdf-library.json`)
      .then((response) => response.ok ? response.json() : [])
      .then((items: PdfLibraryItem[]) => setPdfLibrary(items))
      .catch(() => setPdfLibrary([]));
  }, []);

  useEffect(() => {
    const updateFullscreen = () => setIsFullscreen(document.fullscreenElement === readerRef.current);
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  const isCover = !isSinglePage && page === 1;
  const visibleEnd = pdf ? Math.min(page + (!isSinglePage && page > 1 ? 1 : 0), pdf.numPages) : 0;
  const lastSpreadPage = pdf
    ? isSinglePage
      ? pdf.numPages
      : pdf.numPages <= 1 || pdf.numPages % 2 === 0
        ? pdf.numPages
        : pdf.numPages - 1
    : 1;
  const canGoPrevious = page > 1;
  const canGoNext = Boolean(pdf && visibleEnd < pdf.numPages);
  const isBusy = Boolean(turning || pendingTurn);
  const isZoomed = zoomScale > 1;
  const pendingPageCount = pendingTurn && pdf
    ? isSinglePage || pendingTurn.target === 1 || pendingTurn.target === pdf.numPages
      ? 1
      : 2
    : 0;

  const playPageTurnSound = useCallback(() => {
    if (!soundEnabled) return;
    const audio = pageTurnAudio.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }, [soundEnabled]);

  const handlePendingPageReady = useCallback((pageNumber: number) => {
    if (!pendingTurn || transitionStarted.current) return;
    preparedPages.current.add(pageNumber);
    if (preparedPages.current.size < pendingPageCount) return;

    transitionStarted.current = true;
    playPageTurnSound();
    setTurning(pendingTurn.direction);
    turnTimer.current = setTimeout(() => {
      setPage(pendingTurn.target);
      setPendingTurn(null);
      setTurning(null);
      preparedPages.current.clear();
      transitionStarted.current = false;
    }, TURN_DURATION);
  }, [pendingPageCount, pendingTurn, playPageTurnSound]);

  const turnPage = useCallback((direction: Exclude<TurnDirection, null>) => {
    if (!pdf || isBusy || isPageLocked || isZoomed) return;
    const amount = isSinglePage
      ? 1
      : direction === "next"
        ? page === 1 ? 1 : 2
        : page === 2 ? 1 : 2;
    const target = direction === "next"
      ? Math.min(page + amount, lastSpreadPage)
      : Math.max(1, page - amount);
    if (target === page) return;

    preparedPages.current.clear();
    transitionStarted.current = false;
    setPendingTurn({ direction, target });
  }, [isBusy, isPageLocked, isSinglePage, isZoomed, lastSpreadPage, page, pdf]);

  const jumpToBoundary = useCallback((destination: "first" | "last") => {
    if (!pdf || isBusy || isPageLocked || isZoomed) return;
    const target = destination === "first" ? 1 : lastSpreadPage;
    if (target === page) return;

    preparedPages.current.clear();
    transitionStarted.current = false;
    setPendingTurn({ direction: destination === "first" ? "previous" : "next", target });
  }, [isBusy, isPageLocked, isZoomed, lastSpreadPage, page, pdf]);

  const queuePageTurn = useCallback((direction: Exclude<TurnDirection, null>) => {
    if (suppressNextClick.current) {
      suppressNextClick.current = false;
      return;
    }
    if (pageClickTimer.current) clearTimeout(pageClickTimer.current);
    pageClickTimer.current = setTimeout(() => turnPage(direction), PAGE_CLICK_DELAY);
  }, [turnPage]);

  const zoomAt = useCallback((clientX: number, clientY: number) => {
    if (pageClickTimer.current) clearTimeout(pageClickTimer.current);
    if (zoomScale > 1) {
      if (isPanLocked) return;
      setZoomScale(1);
      setPan({ x: 0, y: 0 });
      setIsPanLocked(false);
      return;
    }

    const rect = bookRef.current?.getBoundingClientRect();
    if (!rect) return;
    const offsetX = clientX - (rect.left + rect.width / 2);
    const offsetY = clientY - (rect.top + rect.height / 2);
    const viewport = bookRef.current?.parentElement;
    const maxX = Math.max(0, (rect.width * ZOOM_SCALE - (viewport?.clientWidth ?? rect.width)) / 2);
    const maxY = Math.max(0, (rect.height * ZOOM_SCALE - (viewport?.clientHeight ?? rect.height)) / 2);
    setPan({
      x: clamp((1 - ZOOM_SCALE) * offsetX, -maxX, maxX),
      y: clamp((1 - ZOOM_SCALE) * offsetY, -maxY, maxY),
    });
    setZoomScale(ZOOM_SCALE);
    setIsPanLocked(false);
  }, [isPanLocked, zoomScale]);

  const toggleZoom = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    zoomAt(event.clientX, event.clientY);
  }, [zoomAt]);

  const handleBookPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isZoomed) {
      dragStart.current = event.clientX;
      if (event.pointerType !== "mouse" && lastTap.current && performance.now() - lastTap.current.time < PAGE_CLICK_DELAY) {
        if (pageClickTimer.current) clearTimeout(pageClickTimer.current);
      }
      return;
    }

    panStart.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
    longPressTimer.current = setTimeout(() => {
      setIsPanLocked((locked) => !locked);
    }, LONG_PRESS_DURATION);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [isZoomed, pan]);

  const handleBookPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isZoomed || !panStart.current) return;
    const deltaX = event.clientX - panStart.current.x;
    const deltaY = event.clientY - panStart.current.y;
    if (Math.hypot(deltaX, deltaY) > 8 && longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (isPanLocked) return;
    const rect = bookRef.current?.getBoundingClientRect();
    const viewport = bookRef.current?.parentElement;
    if (!rect || !viewport) return;
    const maxX = Math.max(0, (rect.width - viewport.clientWidth) / 2);
    const maxY = Math.max(0, (rect.height - viewport.clientHeight) / 2);
    setPan({
      x: clamp(panStart.current.panX + deltaX, -maxX, maxX),
      y: clamp(panStart.current.panY + deltaY, -maxY, maxY),
    });
  }, [isPanLocked, isZoomed]);

  const finishBookPointer = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (isZoomed) {
      panStart.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    if (dragStart.current === null) return;
    const distance = event.clientX - dragStart.current;
    dragStart.current = null;
    if (Math.abs(distance) > 55) {
      suppressNextClick.current = true;
      turnPage(distance < 0 ? "next" : "previous");
      return;
    }
    if (event.pointerType !== "mouse") {
      const now = performance.now();
      const previousTap = lastTap.current;
      if (previousTap && now - previousTap.time < PAGE_CLICK_DELAY && Math.hypot(event.clientX - previousTap.x, event.clientY - previousTap.y) < 28) {
        lastTap.current = null;
        suppressNextClick.current = true;
        zoomAt(event.clientX, event.clientY);
      } else {
        lastTap.current = { time: now, x: event.clientX, y: event.clientY };
      }
    }
  }, [isZoomed, turnPage, zoomAt]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "PageDown") turnPage("next");
      if (event.key === "ArrowLeft" || event.key === "PageUp") turnPage("previous");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [turnPage]);

  async function openPdf(source: ArrayBuffer | string, name: string) {
    setIsLoading(true);
    setError("");
    try {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = `${ASSET_BASE}/pdf.worker.min.mjs`;
      const pdfSource = typeof source === "string"
        ? {
            url: new URL(source, window.location.href).href,
            disableStream: true,
            rangeChunkSize: 262_144,
          }
        : { data: source };
      const nextPdf = await pdfjs.getDocument(pdfSource).promise;
      const firstPage = await nextPdf.getPage(1);
      const viewport = firstPage.getViewport({ scale: 1 });

      setPdf(nextPdf);
      setPage(1);
      setPendingTurn(null);
      setTurning(null);
      setIsPageLocked(false);
      setZoomScale(1);
      setPan({ x: 0, y: 0 });
      setIsPanLocked(false);
      setPageRatio(viewport.width / viewport.height);
      setFileName(name.replace(/\.pdf$/i, ""));
    } catch {
      setError("這份 PDF 無法開啟，可能已損壞或受密碼保護。");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadPdf(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("請選擇 PDF 檔案。");
      return;
    }
    await openPdf(await file.arrayBuffer(), file.name);
    event.target.value = "";
  }

  async function loadLibraryPdf(file: string) {
    if (!file) return;
    const item = pdfLibrary.find((entry) => entry.file === file);
    if (!item) return;
    setIsLoading(true);
    setError("");
    try {
      await openPdf(`${ASSET_BASE}/pdfs/${encodeURIComponent(item.file)}?v=${encodeURIComponent(item.version)}`, item.name);
    } catch {
      setError("書庫中的 PDF 無法載入，請稍後再試。");
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const shareToken = parameters.get("share");
    const adminPdf = parameters.get("adminPdf");
    if (!shareToken && !adminPdf) return;

    const mode = shareToken ? "share" : "admin";
    const url = shareToken
      ? `/api/share/${encodeURIComponent(shareToken)}`
      : `/api/admin/documents/${encodeURIComponent(adminPdf ?? "")}`;
    queueMicrotask(() => {
      setRemoteMode(mode);
      setIsLoading(true);
      setError("");
      fetch(url, { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error(response.status === 401 ? "請先以管理者帳號登入。" : "分享連結無效、已撤銷或已過期。");
          const encodedName = response.headers.get("X-PDF-Name");
          const name = encodedName ? decodeURIComponent(encodedName) : "分享文件";
          await openPdf(await response.arrayBuffer(), name);
        })
        .catch((loadError: Error) => {
          setError(loadError.message);
          setIsLoading(false);
        });
    });
  }, []);

  const bookStyle = {
    "--page-ratio": pageRatio,
    transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoomScale})`,
  } as CSSProperties;

  async function toggleFullscreen() {
    if (!readerRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await readerRef.current.requestFullscreen();
    }
  }

  return (
    <main className="app-shell">
      <header className={`topbar${pdf ? " reader-topbar" : ""}`}>
        <a className="brand" href="#top" aria-label="Flip PDF 首頁">
          <span className="brand-mark" aria-hidden="true"><i /><i /></span>
          <span>FLIP PDF</span>
        </a>
        {pdf && !remoteMode && (
          <div className="reader-file-actions">
            {pdfLibrary.length > 0 && (
              <select className="library-select" defaultValue="" onChange={(event) => { void loadLibraryPdf(event.target.value); event.target.value = ""; }} disabled={isLoading} aria-label="從 PDF 書庫選擇">
                <option value="" disabled>PDF 書庫</option>
                {pdfLibrary.map((item) => <option key={item.file} value={item.file}>{item.name}</option>)}
              </select>
            )}
            <label className="replace-button">
              選擇本機 PDF
              <input type="file" accept="application/pdf,.pdf" onChange={loadPdf} />
            </label>
          </div>
        )}
      </header>

      {!pdf ? (remoteMode ? (
        <section className="shared-loading" aria-live="polite">
          <span className="brand-mark" aria-hidden="true"><i /><i /></span>
          <h1>{error ? "無法開啟文件" : "正在開啟私密文件…"}</h1>
          <p>{error || "請稍候，文件正在安全載入。"}</p>
          {remoteMode === "admin" && error && <a href="/signin-with-chatgpt?return_to=%2F">管理者登入</a>}
        </section>
      ) : (
        <section className="welcome" id="top">
          <div className="welcome-copy">
            <p className="eyebrow">YOUR PDF, REIMAGINED</p>
            <h1>把文件，<br />變成一本會翻頁的書。</h1>
            <p className="intro">不必上傳，不必等待。選擇 PDF，立即以雙頁、滑動與鍵盤操作開始閱讀。</p>
            {pdfLibrary.length > 0 && (
              <label className="library-picker">
                <span>從 PDF 書庫選讀</span>
                <select defaultValue="" onChange={(event) => void loadLibraryPdf(event.target.value)} disabled={isLoading}>
                  <option value="" disabled>選擇一本 PDF</option>
                  {pdfLibrary.map((item) => <option key={item.file} value={item.file}>{item.name}</option>)}
                </select>
              </label>
            )}
            <label className={`upload-button${isLoading ? " is-loading" : ""}`}>
              <span>{isLoading ? "正在整理書頁…" : "選擇 PDF"}</span>
              <span aria-hidden="true">↗</span>
              <input type="file" accept="application/pdf,.pdf" onChange={loadPdf} disabled={isLoading} />
            </label>
            {ASSET_BASE === "" && <a className="server-library-button" href="/admin">切換至私密伺服器書庫</a>}
            {error && <p className="error-message" role="alert">{error}</p>}
            <p className="privacy-note"><span aria-hidden="true">●</span> 檔案只在你的瀏覽器中處理</p>
          </div>
          <div className="hero-book" aria-hidden="true">
            <div className="hero-page hero-left"><span>01</span><b>READ<br />DIFFERENTLY</b></div>
            <div className="hero-page hero-right"><span>02</span><div className="hero-circle" /><em>Turn ideas<br />into pages.</em></div>
          </div>
        </section>
      )) : (
        <section ref={readerRef} className="reader" aria-label={`${fileName} PDF 閱讀器`} aria-busy={isBusy}>
          <div className="reader-stage">
            <aside className="reader-side reader-side-left">
              <div className="reader-identity">
              <p className="eyebrow">NOW READING</p>
                <h1 title={fileName}>{fileName}</h1>
              </div>
              <nav className="side-navigation" aria-label="向前翻頁">
                <button className="boundary-button" onClick={() => jumpToBoundary("first")} disabled={!canGoPrevious || isPageLocked || isZoomed} aria-label="到最前面" title="到最前面">
                  <span aria-hidden="true">⇤</span>
                </button>
                <button className="side-page-button" onClick={() => turnPage("previous")} disabled={!canGoPrevious || isPageLocked || isZoomed}>
                  <ArrowIcon direction="left" />
                  <span>上一頁</span>
                </button>
              </nav>
            </aside>

            <div className="book-viewport">
              <div
                ref={bookRef}
                className={`book effect-${flipEffect}${isCover && !pendingTurn ? " is-cover" : ""}${turning ? ` is-turning-${turning}` : ""}${isZoomed ? " is-zoomed" : ""}${isPanLocked ? " is-pan-locked" : ""}`}
                style={bookStyle}
                onDoubleClick={toggleZoom}
                onPointerDown={handleBookPointerDown}
                onPointerMove={handleBookPointerMove}
                onPointerUp={finishBookPointer}
                onPointerCancel={finishBookPointer}
              >
                <button className="page-hit page-hit-left" onClick={() => queuePageTurn("previous")} aria-disabled={!canGoPrevious || isPageLocked || isZoomed} aria-label="上一頁" />
                {pendingTurn && (
                  <BookLayer
                    key={`spread-${pendingTurn.target}`}
                    document={pdf}
                    page={pendingTurn.target}
                    isSinglePage={isSinglePage}
                    isPending
                    onPageReady={handlePendingPageReady}
                  />
                )}
                <BookLayer key={`spread-${page}`} document={pdf} page={page} isSinglePage={isSinglePage} />
                <button className="page-hit page-hit-right" onClick={() => queuePageTurn("next")} aria-disabled={!canGoNext || isPageLocked || isZoomed} aria-label="下一頁" />
              </div>
              {isZoomed && <p className={`zoom-status${isPanLocked ? " is-locked" : ""}`} aria-live="polite">{isPanLocked ? "放大位置已鎖定・長按解除" : "拖曳移動・長按鎖定・雙擊縮小"}</p>}
            </div>

            <aside className="reader-side reader-side-right">
              <p className="page-status" aria-live="polite">第 {page}{visibleEnd > page ? ` - ${visibleEnd}` : ""} 頁<br />共 {pdf.numPages} 頁</p>
              <div className="reader-tools">
                <button
                  className="page-lock-button"
                  onClick={() => setIsPageLocked((locked) => !locked)}
                  disabled={isBusy}
                  aria-pressed={isPageLocked}
                  title={isPageLocked ? "解除頁面鎖定" : "鎖定頁面，禁止翻頁"}
                >
                  <span aria-hidden="true">{isPageLocked ? "🔒" : "🔓"}</span>
                  <span>{isPageLocked ? "頁面已鎖" : "鎖定頁面"}</span>
                </button>
                <label className="effect-picker">
                  <span>翻頁效果</span>
                  <select value={flipEffect} onChange={(event) => setFlipEffect(event.target.value as FlipEffect)} disabled={isBusy}>
                    <option value="classic">立體翻頁</option>
                    <option value="curl">柔軟捲頁</option>
                    <option value="slide">水平推頁</option>
                    <option value="fade">淡入換頁</option>
                    <option value="lift">抬起換頁</option>
                  </select>
                </label>
                <button className="fullscreen-button" onClick={toggleFullscreen} aria-pressed={isFullscreen}>
                  <span aria-hidden="true">{isFullscreen ? "×" : "⛶"}</span>
                  <span>{isFullscreen ? "退出全螢幕" : "全螢幕"}</span>
                </button>
                <button
                  className="sound-button"
                  onClick={() => setSoundEnabled((enabled) => !enabled)}
                  aria-pressed={soundEnabled}
                  aria-label={soundEnabled ? "關閉翻頁音效" : "開啟翻頁音效"}
                  title={soundEnabled ? "關閉翻頁音效" : "開啟翻頁音效"}
                >
                  <span aria-hidden="true">{soundEnabled ? "🔊" : "🔇"}</span>
                  <span>{soundEnabled ? "音效開" : "音效關"}</span>
                </button>
              </div>
              <nav className="side-navigation" aria-label="向後翻頁">
                <button className="side-page-button" onClick={() => turnPage("next")} disabled={!canGoNext || isPageLocked || isZoomed}>
                  <span>下一頁</span>
                  <ArrowIcon direction="right" />
                </button>
                <button className="boundary-button" onClick={() => jumpToBoundary("last")} disabled={!canGoNext || isPageLocked || isZoomed} aria-label="到最後面" title="到最後面">
                  <span aria-hidden="true">⇥</span>
                </button>
              </nav>
            </aside>
          </div>
          {error && <p className="reader-error error-message" role="alert">{error}</p>}
        </section>
      )}
    </main>
  );
}
