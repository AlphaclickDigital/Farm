import type { NextAuthConfig } from "next-auth"
import Credentials from "next-auth/providers/credentials"

export default {
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const { default: prisma } = await import("@/lib/prisma")
        const { default: bcrypt } = await import("bcryptjs")

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        })

        if (!user || !(user as any).password) {
          return null
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password as string,
          (user as any).password
        )

        if (!isPasswordValid) {
          return null
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        }
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  jwt: {
    encode: async ({ secret, token }) => {
      const { SignJWT } = await import("jose")
      const encodedSecret = new TextEncoder().encode(secret as string)
      return new SignJWT(token as unknown as import("jose").JWTPayload)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("30d")
        .sign(encodedSecret)
    },
    decode: async ({ secret, token }) => {
      const { jwtVerify } = await import("jose")
      const encodedSecret = new TextEncoder().encode(secret as string)
      const verifyResult = await jwtVerify(token!, encodedSecret)
      return verifyResult.payload as unknown as import("next-auth/jwt").JWT
    },
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user?.id) {
        token.id = user.id
        token.role = user.role
      }

      // Refresh role from database on every request to pick up role changes
      // (e.g. after admin approves vendor, role updates without re-login)
      if (token.id && (!user || trigger === "update")) {
        try {
          const { default: prisma } = await import("@/lib/prisma")
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { role: true },
          })
          if (dbUser) {
            token.role = dbUser.role
          }
        } catch {
          // Keep existing role if DB lookup fails
        }
      }

      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
        session.user.role = (token.role as string) || "CUSTOMER"

        const { SignJWT } = await import("jose")
        // Must match the backend's AUTH_SECRET, which verifies this token.
        // No fallback: a guessable default would let anyone mint API tokens.
        const secret = process.env.AUTH_SECRET
        if (!secret) throw new Error("AUTH_SECRET is not set")
        const encodedSecret = new TextEncoder().encode(secret)

        const accessToken = await new SignJWT({
          sub: token.id as string,
          email: session.user.email,
          role: session.user.role,
        })
          .setProtectedHeader({ alg: "HS256" })
          .setIssuedAt()
          .setExpirationTime("2h")
          .sign(encodedSecret)

        session.user.accessToken = accessToken
      }
      return session
    },
  },
} satisfies NextAuthConfig
