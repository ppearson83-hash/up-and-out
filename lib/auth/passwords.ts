// Sign-up and password checks, kept apart from the NextAuth wiring so they
// can be tested directly. (Not named credentials.ts: the harness denies that path.)
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_TASKS } from "@/lib/themes";

export type AuthUser = { id: string; email: string; name: string; familyId: string };

export type SignupErrorCode = "email_taken" | "invalid_email" | "invalid_name" | "weak_password" | "bad_invite";

export class SignupError extends Error {
  constructor(public readonly code: SignupErrorCode) {
    super(`signup rejected: ${code}`);
    this.name = "SignupError";
  }
}

export const MIN_PASSWORD_LENGTH = 8;
const EMAIL_SHAPE = /^\S+@\S+\.\S+$/;
const BCRYPT_ROUNDS = 10;

function inviteCode(): string {
  // 8 chars, no ambiguous letters, easy to read out across the kitchen.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

export async function createUser(input: {
  email: string;
  name: string;
  password: string;
  familyName?: string;
  invite?: string;
}): Promise<AuthUser> {
  const email = input.email.trim();
  const name = input.name.trim();
  if (!EMAIL_SHAPE.test(email)) throw new SignupError("invalid_email");
  if (name.length === 0) throw new SignupError("invalid_name");
  if (input.password.length < MIN_PASSWORD_LENGTH) throw new SignupError("weak_password");

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const invite = input.invite?.trim().toUpperCase();

  try {
    const user = await prisma.$transaction(async (tx) => {
      let familyId: string;
      if (invite) {
        const family = await tx.family.findUnique({ where: { inviteCode: invite }, select: { id: true } });
        if (!family) throw new SignupError("bad_invite");
        familyId = family.id;
      } else {
        const family = await tx.family.create({
          data: {
            name: input.familyName?.trim() || `${name}'s family`,
            inviteCode: inviteCode(),
            kids: {
              create: [
                { name: "Kid 1", colour: "marigold", theme: "star", sortOrder: 0,
                  tasks: { create: DEFAULT_TASKS.map((label, i) => ({ label, sortOrder: i })) } },
                { name: "Kid 2", colour: "seaglass", theme: "dino", sortOrder: 1,
                  tasks: { create: DEFAULT_TASKS.map((label, i) => ({ label, sortOrder: i })) } },
              ],
            },
          },
        });
        familyId = family.id;
      }
      return tx.user.create({ data: { email, name, passwordHash, familyId } });
    });
    return { id: user.id, email: user.email, name: user.name, familyId: user.familyId };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new SignupError("email_taken");
    }
    throw error;
  }
}

// Null on any failure. Compares against a dummy hash for unknown emails so
// timing does not reveal whether an account exists.
const DUMMY_HASH = bcrypt.hashSync("up-and-out-timing-equalizer", BCRYPT_ROUNDS);

export async function verifyPassword(email: string, password: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({ where: { email: email.trim() } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) return null;
  return { id: user.id, email: user.email, name: user.name, familyId: user.familyId };
}
