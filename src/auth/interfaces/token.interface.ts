export interface TokenPayload {
    userId: string;
    email: string;
  }
  
  export interface Tokens {
    access_token: string;
    refresh_token: string;
  }