import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AuthUser } from './auth.types';

// Access token + user live in memory ONLY (never localStorage/sessionStorage —
// see .claude/skills/skill-auth-patterns.md). A page reload loses this state
// on purpose; AuthBootstrap silently restores it via POST /api/auth/refresh,
// which is carried by the httpOnly `vms_refresh` cookie.
export interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  /** True once the initial boot silent-refresh attempt has settled (success or fail). */
  bootstrapped: boolean;
}

const initialState: AuthState = {
  accessToken: null,
  user: null,
  bootstrapped: false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials(state, action: PayloadAction<{ accessToken: string; user: AuthUser }>) {
      state.accessToken = action.payload.accessToken;
      state.user = action.payload.user;
    },
    setUser(state, action: PayloadAction<AuthUser>) {
      state.user = action.payload;
    },
    setBootstrapped(state) {
      state.bootstrapped = true;
    },
    clearCredentials(state) {
      state.accessToken = null;
      state.user = null;
    },
  },
});

export const { setCredentials, setUser, setBootstrapped, clearCredentials } = authSlice.actions;
export const authReducer = authSlice.reducer;
