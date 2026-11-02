import { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: string
      accessToken: string
    } & DefaultSession["user"]
  }
  interface User {
    role: string
  }
}

declare module "@auth/core/adapters" {
  interface AdapterUser {
    role: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    role: string
    accessToken?: string // if we decide to add it
  }
}
