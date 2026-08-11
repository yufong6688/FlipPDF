"use client";

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import Link from "next/link";

type DocumentItem = { id: string; name: string; size: number; created_at: number };
type ShareItem = { id: string; document_id: string; name: string; created_at: number; expires_at: number | null; revoked_at: number | null };

export function AdminLibrary() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [shares, setShares] = useState<ShareItem[]>([]);
  const [unauthorized, setUnauthorized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [expiresDays, setExpiresDays] = useState("30");
  const [renderedAt] = useState(Date.now);

  const refresh = useCallback(async () => {
    const [documentsResponse, sharesResponse] = await Promise.all([
      fetch("/api/admin/documents", { cache: "no-store" }),
      fetch("/api/admin/shares", { cache: "no-store" }),
    ]);
    if (documentsResponse.status === 401 || sharesResponse.status === 401) {
      setUnauthorized(true);
      return;
    }
    if (!documentsResponse.ok || !sharesResponse.ok) throw new Error("無法讀取私密書庫。");
    setDocuments((await documentsResponse.json()).documents);
    setShares((await sharesResponse.json()).shares);
    setUnauthorized(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refresh().catch((error: Error) => setMessage(error.message)));
  }, [refresh]);

  async function uploadPdf(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMessage("正在加密傳送至私密書庫…");
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/admin/documents", { method: "POST", body: formData });
    const result = await response.json();
    setBusy(false);
    event.target.value = "";
    if (!response.ok) {
      setMessage(result.error ?? "上傳失敗。");
      return;
    }
    setMessage(`已上傳：${result.document.name}`);
    await refresh();
  }

  async function createShare(documentId: string) {
    setBusy(true);
    const response = await fetch("/api/admin/shares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId, expiresDays: expiresDays ? Number(expiresDays) : null }),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) {
      setMessage(result.error ?? "無法建立分享連結。");
      return;
    }
    await navigator.clipboard.writeText(result.share.url);
    setMessage("客戶閱讀連結已複製；此連結只可讀取指定 PDF。");
    await refresh();
  }

  async function revokeShare(id: string) {
    await fetch(`/api/admin/shares/${encodeURIComponent(id)}`, { method: "DELETE" });
    setMessage("分享連結已撤銷。");
    await refresh();
  }

  async function deleteDocument(id: string, name: string) {
    if (!window.confirm(`確定刪除「${name}」及其所有分享連結？`)) return;
    const response = await fetch(`/api/admin/documents/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) {
      setMessage("無法刪除 PDF。");
      return;
    }
    setMessage(`已刪除：${name}`);
    await refresh();
  }

  if (unauthorized) {
    return (
      <main className="admin-shell admin-signin">
        <p className="eyebrow">PRIVATE PDF LIBRARY</p>
        <h1>管理者登入</h1>
        <p>私密書庫只開放指定管理者使用。</p>
        <a className="admin-primary-link" href="/signin-with-chatgpt?return_to=%2Fadmin">使用 ChatGPT 帳號登入</a>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">PRIVATE PDF LIBRARY</p>
          <h1>私密 PDF 書庫</h1>
          <p>客戶只會看到分享連結指定的文件，不會取得書庫清單。</p>
        </div>
        <div className="admin-header-actions">
          <Link href="/">本機閱讀器</Link>
          <label className={`admin-upload${busy ? " is-busy" : ""}`}>上傳私密 PDF<input type="file" accept="application/pdf,.pdf" onChange={uploadPdf} disabled={busy} /></label>
        </div>
      </header>

      {message && <p className="admin-message" role="status">{message}</p>}

      <section className="admin-panel">
        <div className="admin-panel-title">
          <h2>伺服器文件</h2>
          <label>分享期限
            <select value={expiresDays} onChange={(event) => setExpiresDays(event.target.value)}>
              <option value="1">1 天</option><option value="7">7 天</option><option value="30">30 天</option><option value="">永久</option>
            </select>
          </label>
        </div>
        {documents.length === 0 ? <p className="admin-empty">尚未上傳 PDF。</p> : (
          <div className="admin-document-list">
            {documents.map((document) => (
              <article key={document.id} className="admin-document">
                <div><h3>{document.name}</h3><p>{(document.size / 1024 / 1024).toFixed(1)} MB・{new Date(document.created_at).toLocaleDateString("zh-TW")}</p></div>
                <div className="admin-document-actions">
                  <a href={`/?adminPdf=${encodeURIComponent(document.id)}`} target="_blank" rel="noreferrer">閱讀</a>
                  <button onClick={() => void createShare(document.id)} disabled={busy}>建立客戶連結</button>
                  <button className="danger" onClick={() => void deleteDocument(document.id, document.name)}>刪除</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="admin-panel">
        <h2>分享紀錄</h2>
        {shares.length === 0 ? <p className="admin-empty">尚未建立分享連結。</p> : (
          <div className="admin-share-list">
            {shares.map((share) => {
              const inactive = Boolean(share.revoked_at || (share.expires_at && share.expires_at <= renderedAt));
              return <article key={share.id} className={`admin-share${inactive ? " is-inactive" : ""}`}>
                <div><strong>{share.name}</strong><span>{share.revoked_at ? "已撤銷" : share.expires_at ? `期限 ${new Date(share.expires_at).toLocaleString("zh-TW")}` : "永久有效"}</span></div>
                {!inactive && <button onClick={() => void revokeShare(share.id)}>撤銷</button>}
              </article>;
            })}
          </div>
        )}
      </section>
    </main>
  );
}
