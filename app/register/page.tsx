"use client";

import { FormEvent, useState } from "react";
import { ArrowLeft, UserPlus } from "lucide-react";

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [applicationNote, setApplicationNote] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (password !== confirmPassword) {
      setError("两次输入的密码不一致。");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, displayName, password, applicationNote })
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "提交注册申请失败。");
      }

      setMessage(payload.message ?? "注册申请已提交，请等待管理员审批。");
      setPassword("");
      setConfirmPassword("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "提交注册申请失败。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-panel register-panel" aria-labelledby="register-title">
        <div className="login-mark">
          <UserPlus size={22} />
        </div>
        <p className="eyebrow">需要管理员审批</p>
        <h1 id="register-title">申请系统账号</h1>
        <p className="login-description">提交后，管理员批准前不能登录系统。</p>
        <form className="login-form" onSubmit={submit}>
          <label>
            用户名
            <input
              autoComplete="username"
              pattern="[A-Za-z0-9_.-]{3,40}"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label>
            显示名称
            <input required value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </label>
          <label>
            密码
            <input
              autoComplete="new-password"
              minLength={8}
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label>
            确认密码
            <input
              autoComplete="new-password"
              minLength={8}
              required
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>
          <label>
            申请说明
            <textarea rows={3} maxLength={500} value={applicationNote} onChange={(event) => setApplicationNote(event.target.value)} />
          </label>
          {error ? <p className="login-error" role="alert">{error}</p> : null}
          {message ? <p className="login-success" role="status">{message}</p> : null}
          <button className="primary-button login-submit" disabled={loading} type="submit">
            <UserPlus size={17} />
            {loading ? "提交中..." : "提交注册申请"}
          </button>
        </form>
        <a className="login-secondary" href="/login">
          <ArrowLeft size={16} />
          返回登录
        </a>
      </section>
    </main>
  );
}
