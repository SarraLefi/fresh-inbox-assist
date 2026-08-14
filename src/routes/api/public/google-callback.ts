import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/google-callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error || !code || !state) {
          return Response.redirect(
            `${url.origin}/?error=${encodeURIComponent(error ?? "missing_code")}`,
            302,
          );
        }

        const { exchangeCode, saveAccount, SESSION_COOKIE } = await import("@/lib/gmail.server");

        try {
          const tokens = await exchangeCode(code, url.origin);
          const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          });
          const profile = (await profileRes.json()) as { email?: string };

          await saveAccount({
            sessionId: state,
            email: profile.email ?? "inconnu",
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token ?? null,
            expiresIn: tokens.expires_in,
          });

          return new Response(null, {
            status: 302,
            headers: {
              location: `${url.origin}/inbox`,
              "set-cookie": `${SESSION_COOKIE}=${state}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=2592000`,
            },
          });
        } catch (e) {
          console.error("Google OAuth callback failed", e);
          return Response.redirect(`${url.origin}/?error=oauth_failed`, 302);
        }
      },
    },
  },
});
