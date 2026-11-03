import { signToken } from "../src/lib/jwt";
import { User } from "@prisma/client";

export function tokenFor(user: User) {
  return signToken({ sub: user.id, email: user.email, role: user.role, name: user.name });
}

export function authHeader(user: User) {
  return { Authorization: `Bearer ${tokenFor(user)}` };
}
