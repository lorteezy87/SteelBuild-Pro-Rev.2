import { useAuth } from "@/lib/AuthContext";
import LocalLoginForm from "@/components/LocalLoginForm";
import AppLoader from "@/boot/AppLoader";
import AppRoutes from "@/boot/AppRoutes";

/**
 * AuthenticatedApp — auth gate + routing.
 *
 * Three states, in order of precedence:
 *   1. Auth still resolving         → AppLoader (full-screen spinner)
 *   2. Auth required (no session)   → LocalLoginForm
 *   3. Authenticated                → AppRoutes
 *
 * `authError.type === 'auth_required'` is the canonical "no session"
 * marker; any other authError surfaces as an inline message on the
 * login form ("Authentication required" is suppressed because it's the
 * default message when the user simply hasn't logged in yet).
 */
export default function AuthenticatedApp() {
  const { isLoadingAuth, isLoadingPublicSettings, authError, loginWithPassword } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return <AppLoader />;
  }

  if (authError?.type === "auth_required") {
    return (
      <LocalLoginForm
        onSubmit={loginWithPassword}
        isSubmitting={isLoadingAuth}
        errorMessage={authError?.message !== "Authentication required" ? authError?.message : null}
      />
    );
  }

  return <AppRoutes />;
}
