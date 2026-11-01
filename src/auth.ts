import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/** Only this Google account can sign in. */
export const ALLOWED_EMAIL = (process.env.ALLOWED_EMAIL || "").trim().toLowerCase();

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 90 },
  pages: { signIn: "/signin", error: "/signin" },
  callbacks: {
    signIn({ profile }) {
      const email = (profile?.email || "").toLowerCase();
      return Boolean(ALLOWED_EMAIL) && email === ALLOWED_EMAIL && profile?.email_verified === true;
    },
  },
});

/**
 * Local development without Google credentials: set DEV_SKIP_AUTH=1 in .env.local.
 * Ignored in production builds.
 */
export async function isSignedIn(): Promise<boolean> {
  if (process.env.NODE_ENV !== "production" && process.env.DEV_SKIP_AUTH === "1") return true;
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  return Boolean(email && ALLOWED_EMAIL && email === ALLOWED_EMAIL);
}
