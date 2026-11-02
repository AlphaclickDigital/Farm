"use server"

import bcrypt from "bcryptjs"
import prisma from "@/lib/prisma"

export async function registerUser(data: {
  name: string
  email: string
  password: string
}) {
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
  })

  if (existingUser) {
    return { error: "A user with this email already exists" }
  }

  const hashedPassword = await bcrypt.hash(data.password, 10)

  await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      password: hashedPassword,
    },
  })

  return { success: true }
}
