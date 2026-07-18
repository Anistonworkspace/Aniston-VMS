# Skill — Authentication Patterns (NestJS JWT)

---

## Access + refresh token flow

```
Login    → POST /auth/login    → accessToken (15min, Authorization header) + refreshToken (7d, httpOnly cookie)
Request  → Bearer <accessToken> in Authorization header, verified by JwtAuthGuard (passport-jwt strategy)
Expired  → 401 → client calls POST /auth/refresh (refresh cookie sent automatically) → new accessToken + rotated refreshToken
Logout   → POST /auth/logout  → refreshToken hash revoked in DB (RefreshToken table), cookie cleared
```

Two secrets, never reused for each other: `JWT_SECRET` signs the short-lived access token, `JWT_REFRESH_SECRET`
signs the refresh token. Both are required env vars checked at bootstrap (`ConfigService.getOrThrow`).

## AuthUser shape (attached to the request by JwtStrategy)

```typescript
// apps/api/src/modules/auth/strategies/jwt.strategy.ts
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;               // SUPER_ADMIN | PROJECT_ADMIN | CLIENT_VIEWER
  organizationId: string;       // ALWAYS read from the verified JWT payload, never trust body/query
  scopeType: ScopeType | null;  // ORG | SITE | ZONE | CAMERA — set when the user is scope-restricted
  scopeId: string | null;       // id of the site/zone/camera the user is pinned to, if scoped
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    // Re-check the user still exists / isn't deactivated on every request — do NOT trust a stale payload.
    const user = await this.usersService.findActiveById(payload.sub);
    if (!user) throw new UnauthorizedException('User no longer active');
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      scopeType: user.scopeType ?? null,
      scopeId: user.scopeId ?? null,
    };
  }
}
```

## Login + refresh service (AuthService)

```typescript
// apps/api/src/modules/auth/auth.service.ts
async login(email: string, password: string): Promise<{ accessToken: string; refreshToken: string }> {
  const user = await this.prisma.user.findUnique({ where: { email } });
  if (!user || !(await argon2.verify(user.passwordHash, password))) {
    // Same error for "no such user" and "wrong password" — never leak which one failed
    throw new UnauthorizedException('INVALID_CREDENTIALS');
  }
  const accessToken = this.signAccessToken(user);
  const refreshToken = this.signRefreshToken(user);
  await this.prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: sha256(refreshToken), expiresAt: addDays(new Date(), 7) },
  });
  return { accessToken, refreshToken };
}

async refresh(rawRefreshToken: string) {
  const payload = this.jwt.verify(rawRefreshToken, { secret: this.config.getOrThrow('JWT_REFRESH_SECRET') });
  const stored = await this.prisma.refreshToken.findFirst({
    where: { userId: payload.sub, tokenHash: sha256(rawRefreshToken), revokedAt: null },
  });
  if (!stored || stored.expiresAt < new Date()) throw new UnauthorizedException('REFRESH_TOKEN_INVALID');
  // Rotate: revoke the old token and issue a new pair — prevents replay of a stolen refresh cookie
  await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  return this.login(payload.sub);
}
```

## Guard usage on controllers

```typescript
// apps/api/src/modules/cameras/cameras.controller.ts
@UseGuards(JwtAuthGuard, RolesGuard, ZoneScopeGuard)
@Controller('cameras')
export class CamerasController {
  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN)  // decorator-driven — never inline string role checks
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateCameraDto) {
    return this.camerasService.create(actor, dto);
  }

  @Get(':id/credentials')
  @Roles(UserRole.SUPER_ADMIN, UserRole.PROJECT_ADMIN)  // CLIENT_VIEWER must never reach decrypted RTSP creds
  getCredentials(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.camerasService.getDecryptedCredentials(actor, id);
  }
}
```

`RolesGuard` and `ZoneScopeGuard` mechanics (role matrix, `scopeType`/`scopeId` enforcement) live in
`skill-rbac-advanced-patterns.md` — this file only covers the JWT lifecycle.

## Self-service checks that belong in the service, not the controller

```typescript
// ✅ CORRECT — business-rule check lives in AuthService/CamerasService, not the guard
async approveCameraDecommission(id: string, actor: AuthUser) {
  const request = await this.getOne(id, actor);
  if (request.requestedById === actor.id) {
    throw new ForbiddenException('You cannot approve your own decommission request');
  }
  // proceed with approval
}
```

## Frontend: attaching the access token (RTK Query)

```typescript
// frontend/src/store/api/baseApi.ts
const baseQuery = fetchBaseQuery({
  baseUrl: import.meta.env.VITE_API_URL,
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.accessToken;
    if (token) headers.set('authorization', `Bearer ${token}`);
    return headers;
  },
});

// baseQueryWithReauth: on 401, call /auth/refresh once, retry the original request, else force logout
export const baseQueryWithReauth: BaseQueryFn = async (args, api, extraOptions) => {
  let result = await baseQuery(args, api, extraOptions);
  if (result.error?.status === 401) {
    const refreshResult = await baseQuery({ url: '/auth/refresh', method: 'POST' }, api, extraOptions);
    if (refreshResult.data) {
      api.dispatch(authSlice.actions.setAccessToken(refreshResult.data));
      result = await baseQuery(args, api, extraOptions);
    } else {
      api.dispatch(authSlice.actions.loggedOut());
    }
  }
  return result;
};
```

## Encryption touchpoint

Camera/router credentials (`rtspPasswordEncrypted`, `onvifPasswordEncrypted`, `routerAdminPasswordEncrypted`)
are never carried in the JWT and never returned by `/auth/*` endpoints. See `skill-encryption-patterns.md`
for the AES-256-GCM encrypt/decrypt utility and `ENCRYPTION_KEY` handling.