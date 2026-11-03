import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET || "ticketsense-dev-secret-change-me";

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  name: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: "12h" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, SECRET) as JwtPayload;
}
