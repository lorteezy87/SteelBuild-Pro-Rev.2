/**
 * BluebeamSettings.jsx — Bluebeam Max connection & session management.
 *
 * Embeds on the Integrations page when the "Bluebeam / PDF Workflows"
 * card is selected and a project is active. Shows:
 *   1. Connection status + OAuth connect/disconnect
 *   2. Sessions linked to this project
 *   3. Create new session + push documents
 *
 * All API calls route through bluebeamService → bluebeam-proxy Edge
 * Function. No Bluebeam tokens reach the browser.
 */

import React, { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Cable,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Send,
  Users,
  XCircle,
  Zap,
  Camera,
  AlertTriangle,
} from "lucide-react";
import { bluebeam } from "@/lib/integrations/bluebeamService";

// ── Helpers ──────────────────────────────────────────────────────────────

function timeAgo(dateStr) {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const SESSION_TYPE_LABELS = {
  review: "Drawing Review",
  markup: "Markup Session",
  coordination: "Coordination",
  punchlist: "Punchlist",
};

const SESSION_STATUS_COLORS = {
  active: "var(--success)",
  ended: "var(--text-muted)",
  archived: "var(--text-muted)",
  error: "var(--status-error)",
};

// ── Styles ───────────────────────────────────────────────────────────────

const panel = {
  background: "var(--bg-input, rgba(14,20,30,0.98))",
  border: "1px solid var(--divider)",
  borderRadius: 10,
  padding: "14px 16px",
  marginBottom: 10,
};

const chipStyle = (color) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "3px 10px",
  borderRadius: 20,
  fontSize: 10,
  fontFamily: "var(--font-mono)",
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color,
  background: `color-mix(in srgb, ${color} 14%, transparent)`,
  border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
});

const btnPrimary = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  padding: "8px 16px",
  borderRadius: 7,
  border: "none",
  background: "var(--accent)",
  color: "#061018",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  cursor: "pointer",
};

const btnGhost = {
  ...btnPrimary,
  background: "transparent",
  color: "var(--text-secondary)",
  border: "1px solid var(--divider)",
};

const btnDanger = {
  ...btnGhost,
  color: "var(--status-error)",
  borderColor: "color-mix(in srgb, var(--status-error) 30%, transparent)",
};

const inputStyle = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 7,
  border: "1px solid var(--divider)",
  background: "var(--bg-base, #0D1117)",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  outline: "none",
  boxSizing: "border-box",
};

const selectStyle = { ...inputStyle, cursor: "pointer" };

const labelStyle = {
  display: "block",
  fontFamily: "var(--font-body)",
  fontSize: 11,
  color: "var(--text-muted)",
  marginBottom: 4,
};

// ── Connection Panel ─────────────────────────────────────────────────────

function ConnectionPanel({ projectId }) {
  const qc = useQueryClient();

  const { data: statusData, isLoading: statusLoading } = useQuery({
    queryKey: ["bluebeam-connection"],
    queryFn: () => bluebeam.connectionStatus(),
    staleTime: 30_000,
  });

  const connectMut = useMutation({
    mutationFn: () => bluebeam.connectWithPopup(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bluebeam-connection"] });
      toast.success("Bluebeam Max connected");
    },
    onError: (err) => {
      if (err.message === "Authentication cancelled") return;
      toast.error("Connection failed: " + err.message);
    },
  });

  const disconnectMut = useMutation({
    mutationFn: () => bluebeam.disconnect(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bluebeam-connection"] });
      toast.success("Bluebeam disconnected");
    },
    onError: (err) => toast.error("Disconnect failed: " + err.message),
  });

  if (statusLoading) {
    return (
      <div style={{ ...panel, display: "flex", alignItems: "center", gap: 10 }}>
        <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Checking connection…</span>
      </div>
    );
  }

  const { connected, connection, configured } = statusData || {};

  if (!configured) {
    return (
      <div style={{ ...panel, display: "flex", alignItems: "center", gap: 10, borderColor: "color-mix(in srgb, var(--warning) 40%, transparent)" }}>
        <AlertTriangle size={16} color="var(--warning)" />
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--warning)" }}>API Not Configured</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
            Set BLUEBEAM_CLIENT_ID, BLUEBEAM_CLIENT_SECRET, and BLUEBEAM_REDIRECT_URI in Supabase Edge Function secrets.
          </div>
        </div>
      </div>
    );
  }

  if (!connected) {
    return (
      <div style={panel}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <XCircle size={16} color="var(--text-muted)" />
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>Not Connected</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {connection?.status === "expired"
                  ? "Token expired — reconnect to continue."
                  : "Connect your Bluebeam Max account to create sessions and push documents."}
              </div>
            </div>
          </div>
          <button
            type="button"
            style={btnPrimary}
            onClick={() => connectMut.mutate()}
            disabled={connectMut.isPending}
          >
            {connectMut.isPending
              ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Connecting…</>
              : <><Zap size={14} /> Connect Bluebeam</>
            }
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={panel}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <CheckCircle2 size={16} color="var(--success)" />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
              Connected
              {connection?.bluebeam_email && (
                <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 8 }}>
                  {connection.bluebeam_email}
                </span>
              )}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              Last used {timeAgo(connection?.last_used_at)} · Connected {timeAgo(connection?.created_at)}
            </div>
          </div>
        </div>
        <button
          type="button"
          style={btnDanger}
          onClick={() => {
            if (confirm("Disconnect your Bluebeam account? Active sessions will remain on Bluebeam but you won't be able to manage them from SteelBuild.")) {
              disconnectMut.mutate();
            }
          }}
          disabled={disconnectMut.isPending}
        >
          <LogOut size={13} /> Disconnect
        </button>
      </div>
    </div>
  );
}

// ── Create Session Form ──────────────────────────────────────────────────

function CreateSessionForm({ projectId, onCreated }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("review");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Session name is required");
      return;
    }
    setCreating(true);
    try {
      const result = await bluebeam.createSession({
        name: name.trim(),
        projectId,
        sessionType: type,
      });
      toast.success(`Session "${name}" created`);
      setName("");
      onCreated?.(result);
    } catch (err) {
      toast.error("Failed to create session: " + err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 200px", minWidth: 160 }}>
        <label style={labelStyle}>Session Name</label>
        <input
          style={inputStyle}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Main Steel IFC Review"
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        />
      </div>
      <div style={{ flex: "0 0 150px" }}>
        <label style={labelStyle}>Type</label>
        <select style={selectStyle} value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(SESSION_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      <button
        type="button"
        style={{ ...btnPrimary, height: 36 }}
        onClick={handleCreate}
        disabled={creating || !name.trim()}
      >
        {creating
          ? <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Creating…</>
          : <><Plus size={13} /> Create</>
        }
      </button>
    </div>
  );
}

// ── Session Card ─────────────────────────────────────────────────────────

function SessionCard({ session, onRefresh }) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [snapping, setSnapping] = useState(false);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      await bluebeam.inviteUser(session.session_id, inviteEmail.trim());
      toast.success(`Invited ${inviteEmail}`);
      setInviteEmail("");
      setShowInvite(false);
    } catch (err) {
      toast.error("Invite failed: " + err.message);
    } finally {
      setInviting(false);
    }
  };

  const handleSnapshot = async () => {
    setSnapping(true);
    try {
      await bluebeam.createSnapshot(session.session_id);
      toast.success("Snapshot created — check Bluebeam for the flattened PDF");
    } catch (err) {
      toast.error("Snapshot failed: " + err.message);
    } finally {
      setSnapping(false);
    }
  };

  const handleEnd = async () => {
    if (!confirm(`End session "${session.session_name}"? This cannot be undone.`)) return;
    try {
      await bluebeam.endSession(session.session_id);
      toast.success("Session ended");
      onRefresh?.();
    } catch (err) {
      toast.error("End session failed: " + err.message);
    }
  };

  const isActive = session.session_status === "active";
  const statusColor = SESSION_STATUS_COLORS[session.session_status] || "var(--text-muted)";

  return (
    <div style={{
      ...panel,
      borderLeft: `3px solid ${statusColor}`,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              {session.session_name}
            </span>
            <span style={chipStyle(statusColor)}>{session.session_status}</span>
            {session.session_type && (
              <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                {SESSION_TYPE_LABELS[session.session_type] || session.session_type}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 14, fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)", flexWrap: "wrap" }}>
            <span>{session.file_count || 0} files</span>
            <span>Created {timeAgo(session.created_at)}</span>
            {session.ended_at && <span>Ended {timeAgo(session.ended_at)}</span>}
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {session.bluebeam_url && (
            <a
              href={session.bluebeam_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...btnGhost, textDecoration: "none", fontSize: 10, padding: "5px 10px" }}
              title="Open in Bluebeam"
            >
              <ExternalLink size={12} /> Open
            </a>
          )}
          {isActive && (
            <>
              <button
                type="button"
                style={{ ...btnGhost, fontSize: 10, padding: "5px 10px" }}
                onClick={() => setShowInvite(!showInvite)}
                title="Invite user"
              >
                <Users size={12} />
              </button>
              <button
                type="button"
                style={{ ...btnGhost, fontSize: 10, padding: "5px 10px" }}
                onClick={handleSnapshot}
                disabled={snapping}
                title="Create markup snapshot"
              >
                {snapping ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Camera size={12} />}
              </button>
              <button
                type="button"
                style={{ ...btnDanger, fontSize: 10, padding: "5px 10px" }}
                onClick={handleEnd}
                title="End session"
              >
                End
              </button>
            </>
          )}
        </div>
      </div>

      {/* Invite row */}
      {showInvite && isActive && (
        <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
          <input
            style={{ ...inputStyle, flex: 1 }}
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="Email address"
            onKeyDown={(e) => e.key === "Enter" && handleInvite()}
          />
          <button
            type="button"
            style={{ ...btnPrimary, padding: "6px 12px", fontSize: 10 }}
            onClick={handleInvite}
            disabled={inviting || !inviteEmail.trim()}
          >
            {inviting ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Send size={12} />}
            Invite
          </button>
        </div>
      )}
    </div>
  );
}

// ── Sessions Panel ───────────────────────────────────────────────────────

function SessionsPanel({ projectId, connected }) {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: sessions = [], isLoading, refetch } = useQuery({
    queryKey: ["bluebeam-sessions", projectId],
    queryFn: () => bluebeam.getProjectSessions(projectId),
    enabled: !!projectId && connected,
    staleTime: 30_000,
  });

  const activeSessions = sessions.filter((s) => s.session_status === "active");
  const endedSessions = sessions.filter((s) => s.session_status !== "active");

  if (!connected) {
    return (
      <div style={{ ...panel, textAlign: "center", padding: 24 }}>
        <Cable size={20} color="var(--text-muted)" style={{ marginBottom: 8 }} />
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Connect your Bluebeam account above to manage sessions.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
            Sessions
          </span>
          {activeSessions.length > 0 && (
            <span style={chipStyle("var(--success)")}>
              {activeSessions.length} active
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" style={{ ...btnGhost, fontSize: 10, padding: "5px 10px" }} onClick={() => refetch()}>
            <RefreshCw size={12} /> Refresh
          </button>
          <button type="button" style={{ ...btnPrimary, fontSize: 10, padding: "5px 10px" }} onClick={() => setShowCreate(!showCreate)}>
            <Plus size={12} /> New Session
          </button>
        </div>
      </div>

      {showCreate && (
        <div style={{ ...panel, marginBottom: 10, borderColor: "color-mix(in srgb, var(--accent) 30%, transparent)" }}>
          <CreateSessionForm
            projectId={projectId}
            onCreated={() => {
              setShowCreate(false);
              qc.invalidateQueries({ queryKey: ["bluebeam-sessions", projectId] });
            }}
          />
        </div>
      )}

      {isLoading ? (
        <div style={{ ...panel, display: "flex", alignItems: "center", gap: 10 }}>
          <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading sessions…</span>
        </div>
      ) : sessions.length === 0 ? (
        <div style={{ ...panel, textAlign: "center", padding: 24 }}>
          <FileText size={20} color="var(--text-muted)" style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            No Bluebeam sessions linked to this project yet.
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
            Create a session to start a drawing review or markup collaboration.
          </div>
        </div>
      ) : (
        <>
          {activeSessions.map((s) => (
            <SessionCard key={s.id} session={s} onRefresh={refetch} />
          ))}
          {endedSessions.length > 0 && (
            <details style={{ marginTop: 6 }}>
              <summary style={{ fontSize: 11, color: "var(--text-muted)", cursor: "pointer", fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
                {endedSessions.length} ended session{endedSessions.length !== 1 ? "s" : ""}
              </summary>
              <div style={{ marginTop: 6 }}>
                {endedSessions.map((s) => (
                  <SessionCard key={s.id} session={s} onRefresh={refetch} />
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────

export default function BluebeamSettings({ projectId }) {
  const { data: statusData } = useQuery({
    queryKey: ["bluebeam-connection"],
    queryFn: () => bluebeam.connectionStatus(),
    staleTime: 30_000,
  });

  const connected = statusData?.connected ?? false;

  return (
    <div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <ConnectionPanel projectId={projectId} />
      <div style={{ marginTop: 14 }}>
        <SessionsPanel projectId={projectId} connected={connected} />
      </div>
    </div>
  );
}
