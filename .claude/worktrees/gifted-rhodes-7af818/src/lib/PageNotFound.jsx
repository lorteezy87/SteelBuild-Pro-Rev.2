import { useLocation, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

export default function PageNotFound({}) {
    const location = useLocation();
    const navigate = useNavigate();
    const pageName = location.pathname.substring(1);

    const { data: authData, isFetched } = useQuery({
        queryKey: ['user'],
        queryFn: async () => {
            try {
                const user = await base44.auth.me();
                return { user, isAuthenticated: true };
            } catch {
                return { user: null, isAuthenticated: false };
            }
        }
    });

    return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "var(--bg-page)" }}>
            <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
                <div style={{ marginBottom: 24 }}>
                    <h1 style={{ fontFamily: "var(--font-mono)", fontSize: 72, fontWeight: 300, color: "var(--border-strong)", margin: 0, lineHeight: 1 }}>404</h1>
                    <div style={{ height: 1, width: 64, background: "var(--border-default)", margin: "12px auto" }} />
                </div>

                <h2 style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "var(--text-primary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
                    PAGE_NOT_FOUND
                </h2>
                <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 24 }}>
                    The page <span style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>"{pageName}"</span> could not be found in this application.
                </p>

                {isFetched && authData?.isAuthenticated && authData?.user?.role === 'admin' && (
                    <div style={{ padding: "12px 16px", background: "var(--warning-muted)", border: "1px solid var(--warning-border)", borderRadius: 2, textAlign: "left", marginBottom: 24 }}>
                        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--nc-accent-orange)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>ADMIN_NOTE</p>
                        <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5, margin: 0 }}>
                            This page may not be implemented yet. Ask Claude to build it in the chat.
                        </p>
                    </div>
                )}

                <button
                    onClick={() => navigate('/')}
                    style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 18px", background: "var(--nc-accent-orange)", color: "#FFFFFF", border: "none", borderRadius: 2, fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer" }}
                >
                    ← GO HOME
                </button>
            </div>
        </div>
    );
}
