export interface JwtPayload {
  id: string;
  email: string;
  role: string;
}

export interface AuthUser {
  id: string;
  email: string;

  firstName?: string;

  lastName?: string;

  role: string;
}