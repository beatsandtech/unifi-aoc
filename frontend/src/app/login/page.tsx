"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Mail, Server, ShieldCheck, ChevronRight, Activity } from "lucide-react";
import { API_BASE } from "@/lib/api";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const formData = new URLSearchParams();
      formData.append("username", email);
      formData.append("password", password);

      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Invalid authentication credentials");
      }

      const data = await res.json();
      localStorage.setItem("aoc_token", data.access_token);
      localStorage.setItem("aoc_role", data.role || "Helpdesk");
      router.push("/");
    } catch (err: any) {
      setError(err.message || "Failed to connect to the authentication server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden"
      style={{ background: "radial-gradient(ellipse 80% 80% at 50% -20%, color-mix(in srgb, var(--color-accent) 14%, transparent), var(--color-bg))" }}
    >
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl pointer-events-none" style={{ background: "color-mix(in srgb, var(--color-accent) 12%, transparent)" }}></div>

      <div className="w-full max-w-md relative z-10 animate-fadeIn">
        <div className="flex justify-center mb-8">
          <div className="relative">
            <div className="absolute inset-0 rounded-full blur-xl opacity-30" style={{ background: "var(--color-accent)" }}></div>
            <div className="card p-4 relative" style={{ boxShadow: "var(--shadow-md)" }}>
              <ShieldCheck className="w-10 h-10" style={{ color: "var(--color-accent)" }} />
            </div>
          </div>
        </div>

        <div className="card p-8 relative" style={{ boxShadow: "var(--shadow-lg)" }}>
          <div className="text-center mb-8">
            <h1 className="text-2xl font-medium" style={{ color: "var(--color-text)" }}>Access Control</h1>
            <p className="text-sm mt-2" style={{ color: "var(--color-neutral-400)" }}>MSP Autonomous Operations Center</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {error && (
              <div className="text-xs px-4 py-3 rounded-md flex items-center space-x-2 tag-outline" style={{ borderRadius: "var(--radius-md)" }}>
                <Activity className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider ml-1" style={{ color: "var(--color-neutral-400)" }}>Work Email</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5" style={{ color: "var(--color-neutral-500)" }} />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input block w-full pl-10 pr-3 py-3 text-sm"
                  placeholder="admin@alpha.com"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider ml-1" style={{ color: "var(--color-neutral-400)" }}>Passphrase</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5" style={{ color: "var(--color-neutral-500)" }} />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input block w-full pl-10 pr-3 py-3 text-sm"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full py-3 text-sm mt-2"
            >
              <span>{loading ? "Authenticating..." : "Authorize Session"}</span>
              {!loading && <ChevronRight className="w-4 h-4" />}
            </button>
          </form>

          <div className="mt-8 flex items-center justify-center space-x-2 text-xs pt-6" style={{ color: "var(--color-neutral-500)", borderTop: "1px solid var(--color-divider)" }}>
            <Server className="w-3.5 h-3.5" />
            <span>Encrypted Node Connection</span>
          </div>
        </div>
      </div>
    </div>
  );
}
