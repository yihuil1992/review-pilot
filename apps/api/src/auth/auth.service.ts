import { ConflictException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { CryptoService } from "../security/crypto.service.js";
import { PrismaService } from "../prisma.service.js";

export const ownerSessionCookieName = "rp_owner_session";

type OwnerSession = {
  ownerId: string;
  iat: number;
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CryptoService) private readonly crypto: CryptoService
  ) {}

  async isOwnerConfigured(): Promise<boolean> {
    return (await this.prisma.ownerUser.count()) > 0;
  }

  async setupOwner(
    password: string,
    email?: string | null
  ): Promise<{ ownerId: string; passwordNotePath: string; passwordNoteSaved: boolean }> {
    if (await this.isOwnerConfigured()) {
      throw new ConflictException("Owner is already configured");
    }

    const owner = await this.prisma.ownerUser.create({
      data: {
        email: email || null,
        passwordHash: await this.crypto.hashPassword(password)
      }
    });

    const passwordNotePath = ownerPasswordNotePath();
    const passwordNoteSaved = await writeOwnerPasswordNote(passwordNotePath, password);

    return { ownerId: owner.id, passwordNotePath, passwordNoteSaved };
  }

  async login(password: string): Promise<{ token: string }> {
    const owner = await this.prisma.ownerUser.findFirst({ orderBy: { createdAt: "asc" } });
    if (!owner || !(await this.crypto.verifyPassword(password, owner.passwordHash))) {
      throw new UnauthorizedException("Invalid password");
    }

    return {
      token: this.crypto.signSession({
        ownerId: owner.id,
        iat: Date.now()
      } satisfies OwnerSession)
    };
  }

  async verifyToken(token: string | undefined): Promise<{ ownerId: string } | null> {
    if (!token) {
      return null;
    }

    const session = this.crypto.verifySession<OwnerSession>(token);
    if (!session?.ownerId) {
      return null;
    }

    const owner = await this.prisma.ownerUser.findUnique({ where: { id: session.ownerId } });
    return owner ? { ownerId: owner.id } : null;
  }
}

async function writeOwnerPasswordNote(path: string, password: string): Promise<boolean> {
  const createdAt = new Date().toISOString();
  const content = [
    "# Review Pilot Owner Password",
    "",
    "This private local file was generated automatically during first-run owner setup.",
    "It is ignored by Git and should stay only on the deployment machine.",
    "",
    `Created: ${createdAt}`,
    "",
    `Password: ${password}`,
    ""
  ].join("\n");

  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, { encoding: "utf8", mode: 0o600 });
    return true;
  } catch (error) {
    console.warn("Owner password note could not be written.", error);
    return false;
  }
}

function ownerPasswordNotePath(): string {
  if (process.env.OWNER_PASSWORD_NOTE_PATH) {
    return resolve(process.env.OWNER_PASSWORD_NOTE_PATH);
  }

  const cwd = process.cwd();
  const workspaceRoot = [cwd, resolve(cwd, "../..")].find((candidate) =>
    existsSync(resolve(candidate, "pnpm-workspace.yaml"))
  );

  return resolve(workspaceRoot ?? cwd, "OWNER_PASSWORD.local.md");
}
