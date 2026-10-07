// NextAuth v5: email + password only, JWT sessions carrying the family id.
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { verifyPassword } from "./passwords";

declare module "next-auth" {
  interface Session {
    user: { id: string; familyId: string } & DefaultSession["user"];
  }
  interface User {
    familyId?: string;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 90 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: { type: "email" }, password: { type: "password" } },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") return null;
        return verifyPassword(email, password);
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      if (user?.familyId) token.familyId = user.familyId;
      return token;
    },
    session({ session, token }) {
      if (typeof token.id === "string") session.user.id = token.id;
      if (typeof token.familyId === "string") session.user.familyId = token.familyId;
      return session;
    },
  },
});
