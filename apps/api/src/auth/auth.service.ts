import { ConflictException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
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

  async setupOwner(password: string, email?: string | null): Promise<{ ownerId: string }> {
    if (await this.isOwnerConfigured()) {
      throw new ConflictException("Owner is already configured");
    }

    const owner = await this.prisma.ownerUser.create({
      data: {
        email: email || null,
        passwordHash: await this.crypto.hashPassword(password)
      }
    });

    return { ownerId: owner.id };
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
