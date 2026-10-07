import { describe, it, expect, vi, beforeEach } from 'vitest';
import { purgeUserData, deleteOwnAccount, adminDeleteUser } from '../userData';
import type { App } from 'firebase-admin/app';

// Every mocked side effect appends here, so tests can assert ordering across
// Auth, Firestore and the audit log.
const calls: string[] = [];

const mockRecursiveDelete = vi.fn(async (ref: { path: string }) => {
  calls.push(`firestore.recursiveDelete:${ref.path}`);
});
const mockDeleteUser = vi.fn(async (uid: string) => {
  calls.push(`auth.deleteUser:${uid}`);
});
const mockLogAdminAction = vi.fn(async (_app: App, entry: { action: string; targetUid: string }) => {
  calls.push(`audit:${entry.action}:${entry.targetUid}`);
});

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        path: `${name}/${id}`,
        delete: async () => {
          calls.push(`firestore.delete:${name}/${id}`);
        },
      }),
    }),
    recursiveDelete: mockRecursiveDelete,
  }),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ deleteUser: mockDeleteUser }),
}));

vi.mock('../auditLog', () => ({
  logAdminAction: (app: App, entry: any) => mockLogAdminAction(app, entry),
}));

describe('user data purge on account deletion', () => {
  const mockApp = {} as App;

  beforeEach(() => {
    calls.length = 0;
    vi.clearAllMocks();
  });

  it('purgeUserData recursively deletes the whole users/{uid} tree', async () => {
    await purgeUserData(mockApp, 'user123');
    // One recursive delete at the user root covers careerJourney, jobs, matches,
    // matchPreferences, promptConfigs/*/changeLog, meta/billing and aiUsageLogs.
    // Plus Job Discovery's top-level scheduler entry, which lives outside users/{uid}.
    expect(calls).toEqual(['firestore.recursiveDelete:users/user123', 'firestore.delete:discoverySchedules/user123']);
  });

  it('purgeUserData refuses an empty uid rather than touching users/', async () => {
    await expect(purgeUserData(mockApp, '')).rejects.toThrow();
    expect(mockRecursiveDelete).not.toHaveBeenCalled();
  });

  it('self-service DELETE /api/user/account purges data, then deletes the Auth user', async () => {
    await deleteOwnAccount(mockApp, 'user123');
    expect(calls).toEqual([
      'firestore.recursiveDelete:users/user123',
      'firestore.delete:discoverySchedules/user123',
      'auth.deleteUser:user123',
    ]);
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('admin DELETE /api/admin/users/:uid deletes the Auth user, then purges data, then writes the audit log', async () => {
    await adminDeleteUser(mockApp, 'admin1', 'user123');
    expect(calls).toEqual([
      'auth.deleteUser:user123',
      'firestore.recursiveDelete:users/user123',
      'firestore.delete:discoverySchedules/user123',
      'audit:delete_user:user123',
    ]);
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      mockApp,
      expect.objectContaining({ actorUid: 'admin1', targetUid: 'user123', action: 'delete_user' }),
    );
  });

  it('admin delete stops before purging or logging if the Auth delete fails', async () => {
    mockDeleteUser.mockRejectedValueOnce(new Error('auth/user-not-found'));
    await expect(adminDeleteUser(mockApp, 'admin1', 'user123')).rejects.toThrow('auth/user-not-found');
    expect(mockRecursiveDelete).not.toHaveBeenCalled();
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });
});
